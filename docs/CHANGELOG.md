# CHANGELOG

## 2026-07-04 — v3.0 "JARVIS build" (BUILD.md phases 0–8)
- **Phase 0**: canonical data path via `lib/paths.js` + `app.setName`; legacy `%APPDATA%\Electron` migration (import, never overwrite); corrupt-file backup before defaults; `DATA_FILE=` startup logging; autostart rewritten to auto-generated ASCII-safe wscript launcher; `scripts/start-dexter.bat`; electron-builder `npm run dist` stub
- **Phase 1**: command registry `src/commands/index.js` ({test,run} intents, early/late tiers); fuzzy launcher (aliases + in-order subsequence, candidates on miss); snippets with `{{date}}/{{time}}/{{day}}`; two-step confirm for destructive actions; `docs/COMMANDS.md`
- **Phase 2**: `brain/dexter_brain.py` — offline BM25 RAG over .md/.txt vault → SQLite (`~/.dexter/brain`); voice: ask brain / reindex brain / quiz me on X; optional LLM synthesis with source citations; SYS vault path + reindex button
- **Phase 3**: Mission Control (OPS view, Ctrl+8) — local missions with axis tagging, due dates, priorities, statuses; voice CRUD; +30 XP on completion; daily-quest link
- **Phase 4**: global palette hotkey Ctrl+Shift+D (works from any app); clipboard ring (20 entries, memory-only); word-aware calculator; snippet expansion
- **Phase 5**: focus timer with HUD badge → auto-logs session + XP on completion; morning briefing (stats+quests+missions+calendar); .ics calendar reader with free-gap suggestion
- **Phase 6**: opt-in context logger sidecar (window titles every 30s, 48h retention, ctypes-only); "what was I doing at 3pm"; confirmed wipe command
- **Phase 7**: GitHub Actions CI sentinel (toast + spoken pass/fail); evening DSA reminder
- **Phase 8**: dictation code mode (Ctrl+Alt+C, verbatim)

## 2026-07-03 — v2.2
- Dexter Dictate sidecar (push-to-talk, Vosk, cleanup, paste-anywhere, history, user dictionary)
- Pentagon hero dashboard layout; responsive radar; comms auto-collapse; minimal instrument boot

## 2026-07-02 — v2.0/v2.1
- Notion data import (8 ratings, 26 logs, 6 workouts); gamification (XP/levels/ranks/quests/achievements)
- Wake-word voice (Vosk sidecar); agent brain (persona + optional Claude); app launcher; HN news; hex dock; desktop icon
