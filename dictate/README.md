# DEXTER DICTATE

Local-first, WisprFlow-style push-to-talk dictation. Fully offline — audio never leaves the machine.

## How to use

| Hotkey | Action |
|---|---|
| `Ctrl+Alt+Space` | Toggle recording. Speak, then press again (or pause 3s) — text pastes into the focused app. |
| `Ctrl+Alt+V` | Re-paste the last transcript. |
| `Ctrl+Alt+H` | Open transcript history in Notepad. |

Works in any app: chat, browser, editors, email. Dexter shows a toast when recording starts/stops and when text is pasted.

## Architecture (smallest viable)

```
dictate/dexter_dictate.py     single Python process, spawned by Dexter's main.js
  keyboard      → global hotkeys (work regardless of focused app)
  sounddevice   → 16kHz mono mic capture
  vosk          → streaming ASR (shares the model at ~/.dexter/vosk-model)
  cleanup()     → rule-based: fillers, spoken punctuation, user dictionary,
                  capitalization, sentence-closing period
  pyperclip + Ctrl+V → paste into focused window (prior clipboard restored)
```

Storage (local only):
- `~/.dexter/dictate-history.jsonl` — every transcript (raw + cleaned)
- `~/.dexter/dictate-dict.json` — custom replacements, e.g. `"lead code": "LeetCode"`. Edit freely; reloaded on every transcript.

Runs standalone too: `python dictate/dexter_dictate.py`
Dependencies: `pip install vosk sounddevice keyboard pyperclip`
Toggle on/off in Dexter → SYS → DICTATION ENGINE.

## Stop conditions
- Hotkey pressed again, or
- 3 seconds of trailing silence (after speech was heard), or
- 90-second hard cap.

## Tradeoffs & limitations
- **Vosk small model**: instant, streaming, ~50MB — but weaker accuracy than Whisper on fast/accented speech. No native punctuation (cleanup pass compensates; you can speak "comma", "full stop", "new line").
- **Paste = clipboard + Ctrl+V**: near-universal, but apps that block paste get the text left on the clipboard as fallback. Prior clipboard is restored ~0.8s after pasting.
- **Shares the mic** with Dexter's wake-word listener (Windows shared mode — both work). Saying "Dexter" while dictating may also trigger the assistant; the user dictionary maps it to "Dexter" text.
- **keyboard lib** hooks work without admin for normal apps, but elevated (admin) windows won't receive the paste unless Dexter itself runs elevated.

## Future improvements
- Swap Vosk → faster-whisper (small.en, int8) for accuracy; keep Vosk for instant partials.
- LLM cleanup pass through Dexter's agent brain (API key already supported) for punctuation-perfect output.
- Per-app modes (code mode: no auto-period, verbatim mode: no cleanup).
- Voice-edit selected text; command mode ("select line", "delete word").
