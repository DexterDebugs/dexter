"""DEXTER DICTATE — local-first push-to-talk dictation.

Hold/toggle a hotkey, speak, and the transcribed text is pasted into
whatever app has focus. Fully offline: Vosk ASR + rule-based cleanup.

Hotkeys
  Ctrl+Alt+Space   toggle recording (press to start, press to stop)
  Ctrl+Alt+V       re-paste the last transcript
  Ctrl+Alt+H       open transcript history file

Emits JSON lines on stdout so Dexter (or any host) can show status:
  {"type":"ready"} {"type":"rec-start"} {"type":"rec-stop"}
  {"type":"transcript","raw":...,"clean":...} {"type":"error","text":...}

Storage (all local):
  ~/.dexter/dictate-history.jsonl   transcript history
  ~/.dexter/dictate-dict.json       custom replacements, e.g. {"blood connect": "BloodConnect"}
"""
import json
import os
import queue
import re
import subprocess
import sys
import threading
import time

def emit(obj):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()

try:
    import keyboard
    import pyperclip
    import sounddevice as sd
    from vosk import Model, KaldiRecognizer, SetLogLevel
except ImportError as e:
    emit({"type": "error", "text": f"missing dependency: {e}. run: pip install vosk sounddevice keyboard pyperclip"})
    sys.exit(1)

SetLogLevel(-1)

HOME = os.path.join(os.path.expanduser("~"), ".dexter")
MODEL_DIR = os.path.join(HOME, "vosk-model")
HISTORY = os.path.join(HOME, "dictate-history.jsonl")
USER_DICT = os.path.join(HOME, "dictate-dict.json")

SAMPLE_RATE = 16000
MAX_SECONDS = 90          # hard stop
SILENCE_STOP = 3.0        # auto-stop after this much trailing silence (once speech heard)
REMOVE_FILLERS = True

HOTKEY_TOGGLE = "ctrl+alt+space"
HOTKEY_PASTE_LAST = "ctrl+alt+v"
HOTKEY_HISTORY = "ctrl+alt+h"
HOTKEY_CODE_MODE = "ctrl+alt+c"

CODE_MODE = False  # verbatim: no filler removal, no auto-punctuation (Phase 8.3)

def toggle_code_mode():
    global CODE_MODE
    CODE_MODE = not CODE_MODE
    emit({"type": "mode", "code": CODE_MODE})

# ---------- cleanup ----------
FILLERS = re.compile(r"\b(uh+|um+|erm+|hmm+)\b\s*", re.IGNORECASE)
SPOKEN_PUNCT = [
    (re.compile(r"\b(full stop|period)\b", re.I), "."),
    (re.compile(r"\bcomma\b", re.I), ","),
    (re.compile(r"\bquestion mark\b", re.I), "?"),
    (re.compile(r"\bexclamation (mark|point)\b", re.I), "!"),
    (re.compile(r"\bnew line\b", re.I), "\n"),
    (re.compile(r"\bcolon\b", re.I), ":"),
]

def load_user_dict():
    try:
        with open(USER_DICT, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}

def cleanup(text):
    t = " " + text.strip() + " "
    if REMOVE_FILLERS:
        t = FILLERS.sub("", t)
    for rx, rep in SPOKEN_PUNCT:
        t = rx.sub(rep, t)
    # user dictionary (longest keys first so phrases win over words)
    ud = load_user_dict()
    for k in sorted(ud, key=len, reverse=True):
        t = re.sub(r"\b" + re.escape(k) + r"\b", ud[k], t, flags=re.IGNORECASE)
    # tidy spaces around punctuation
    t = re.sub(r"\s+([.,!?:])", r"\1", t)
    t = re.sub(r"\s+", " ", t).strip()
    # standalone i -> I
    t = re.sub(r"\bi\b", "I", t)
    # capitalize sentence starts
    def cap(m):
        return m.group(1) + m.group(2).upper()
    t = re.sub(r"(^|[.!?]\s+)([a-z])", cap, t)
    # closing period for sentence-like utterances
    if len(t.split()) >= 4 and t[-1] not in ".!?:\n":
        t += "."
    return t

# ---------- recorder / transcriber ----------
class Dictation:
    def __init__(self):
        emit({"type": "status", "text": "loading model"})
        self.model = Model(MODEL_DIR)
        self.q = queue.Queue()
        self.recording = False
        self.last_transcript = ""
        self.lock = threading.Lock()

    def _audio_cb(self, indata, frames, t, status):
        if self.recording:
            self.q.put(bytes(indata))

    def toggle(self):
        with self.lock:
            if self.recording:
                self.recording = False   # worker loop will finish up
            else:
                threading.Thread(target=self._record_worker, daemon=True).start()

    def _record_worker(self):
        rec = KaldiRecognizer(self.model, SAMPLE_RATE)
        rec.SetWords(False)
        self.q = queue.Queue()
        self.recording = True
        emit({"type": "rec-start"})
        try:
            import audioop  # removed in 3.13
            rms_fn = lambda b: audioop.rms(b, 2)
        except Exception:
            import array
            def rms_fn(b):
                a = array.array("h", b)
                return int((sum(x * x for x in a) / max(1, len(a))) ** 0.5)

        heard_speech = False
        last_voice = time.time()
        started = time.time()
        pieces = []
        with sd.RawInputStream(samplerate=SAMPLE_RATE, blocksize=4000,
                               dtype="int16", channels=1, callback=self._audio_cb):
            while self.recording:
                try:
                    data = self.q.get(timeout=0.25)
                except queue.Empty:
                    data = None
                now = time.time()
                if data:
                    if rms_fn(data) > 450:
                        heard_speech = True
                        last_voice = now
                    if rec.AcceptWaveform(data):
                        txt = json.loads(rec.Result()).get("text", "").strip()
                        if txt:
                            pieces.append(txt)
                # stop conditions
                if now - started > MAX_SECONDS:
                    self.recording = False
                if heard_speech and now - last_voice > SILENCE_STOP:
                    self.recording = False
        final = json.loads(rec.FinalResult()).get("text", "").strip()
        if final:
            pieces.append(final)
        raw = " ".join(pieces).strip()
        emit({"type": "rec-stop"})
        if not raw:
            emit({"type": "transcript", "raw": "", "clean": "", "note": "nothing heard"})
            return
        clean = raw if CODE_MODE else cleanup(raw)
        self.last_transcript = clean
        self._save_history(raw, clean)
        emit({"type": "transcript", "raw": raw, "clean": clean})
        self.paste(clean)

    def paste(self, text):
        if not text:
            return
        try:
            old = None
            try:
                old = pyperclip.paste()
            except Exception:
                pass
            pyperclip.copy(text)
            time.sleep(0.12)
            keyboard.send("ctrl+v")
            # restore prior clipboard after the paste lands
            if old is not None:
                def restore():
                    time.sleep(0.8)
                    try: pyperclip.copy(old)
                    except Exception: pass
                threading.Thread(target=restore, daemon=True).start()
        except Exception as e:
            emit({"type": "error", "text": f"paste failed: {e}"})

    def _save_history(self, raw, clean):
        try:
            os.makedirs(HOME, exist_ok=True)
            with open(HISTORY, "a", encoding="utf-8") as f:
                f.write(json.dumps({"ts": time.strftime("%Y-%m-%d %H:%M:%S"),
                                    "raw": raw, "clean": clean}, ensure_ascii=False) + "\n")
        except Exception:
            pass

def open_history():
    try:
        os.makedirs(HOME, exist_ok=True)
        if not os.path.exists(HISTORY):
            open(HISTORY, "a").close()
        subprocess.Popen(["notepad.exe", HISTORY])
    except Exception as e:
        emit({"type": "error", "text": f"history open failed: {e}"})

def main():
    if not os.path.isdir(MODEL_DIR):
        emit({"type": "error", "text": f"vosk model missing at {MODEL_DIR}"})
        sys.exit(1)
    if not os.path.exists(USER_DICT):
        os.makedirs(HOME, exist_ok=True)
        with open(USER_DICT, "w", encoding="utf-8") as f:
            json.dump({
                "blood connect": "BloodConnect",
                "flood gate": "Floodgate",
                "lead code": "LeetCode",
                "leet code": "LeetCode",
                "dexter": "Dexter"
            }, f, indent=2)
    d = Dictation()
    keyboard.add_hotkey(HOTKEY_TOGGLE, d.toggle, suppress=False)
    keyboard.add_hotkey(HOTKEY_PASTE_LAST, lambda: d.paste(d.last_transcript), suppress=False)
    keyboard.add_hotkey(HOTKEY_HISTORY, open_history, suppress=False)
    keyboard.add_hotkey(HOTKEY_CODE_MODE, toggle_code_mode, suppress=False)
    emit({"type": "ready", "hotkeys": {"toggle": HOTKEY_TOGGLE, "pasteLast": HOTKEY_PASTE_LAST, "history": HOTKEY_HISTORY, "codeMode": HOTKEY_CODE_MODE}})
    keyboard.wait()  # block forever

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        emit({"type": "error", "text": str(e)})
        sys.exit(1)
