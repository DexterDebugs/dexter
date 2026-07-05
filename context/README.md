# DEXTER CONTEXT — visual memory lite

**Opt-in only** (SYS → MODULES → CONTEXT LOG, default OFF). Logs the active window title + program every 30s so Dexter can answer *"what was I doing at 3pm?"*.

- Storage: `~/.dexter/context/context-YYYY-MM-DD.jsonl`, auto-pruned after 48h
- No screenshots, no OCR, no keylogging, no cloud — window titles only
- Duplicate consecutive titles are skipped

## Commands
| Say / type | Result |
|---|---|
| `what was I doing at 3pm` / `around 15:30` | Nearest logged window at that time |
| `clear context history` | Deletes all context files (asks to confirm) |

## Future (per spec)
On-demand OCR of the foreground window ("what am I looking at") — requires tesseract; explicitly out of the default install.
