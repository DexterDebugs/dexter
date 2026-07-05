"""DEXTER voice sidecar — offline STT via Vosk.
Emits JSON lines on stdout:
  {"type":"ready"}                    model loaded, mic open
  {"type":"partial","text":"..."}     interim words
  {"type":"final","text":"..."}       finished utterance
  {"type":"error","text":"..."}
"""
import json
import os
import queue
import sys

def emit(obj):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()

try:
    import sounddevice as sd
    from vosk import Model, KaldiRecognizer, SetLogLevel
except ImportError as e:
    emit({"type": "error", "text": f"missing dependency: {e}. run: pip install vosk sounddevice"})
    sys.exit(1)

SetLogLevel(-1)
# ASCII path required — Vosk/Kaldi cannot open non-ASCII paths on Windows
MODEL_DIR = os.path.join(os.path.expanduser("~"), ".dexter", "vosk-model")

if not os.path.isdir(MODEL_DIR):
    emit({"type": "error", "text": f"model folder missing at {MODEL_DIR}"})
    sys.exit(1)

SAMPLE_RATE = 16000
q = queue.Queue()

def callback(indata, frames, t, status):
    q.put(bytes(indata))

def main():
    model = Model(MODEL_DIR)
    rec = KaldiRecognizer(model, SAMPLE_RATE)
    rec.SetWords(False)
    with sd.RawInputStream(samplerate=SAMPLE_RATE, blocksize=8000,
                           dtype="int16", channels=1, callback=callback):
        emit({"type": "ready"})
        while True:
            data = q.get()
            if rec.AcceptWaveform(data):
                text = json.loads(rec.Result()).get("text", "").strip()
                if text:
                    emit({"type": "final", "text": text})
            else:
                partial = json.loads(rec.PartialResult()).get("partial", "").strip()
                if partial:
                    emit({"type": "partial", "text": partial})

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        emit({"type": "error", "text": str(e)})
        sys.exit(1)
