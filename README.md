<div align="center">

# ◈ DEXTER

### A local-first, voice-driven personal operations system — a JARVIS for placement prep.

`Electron` · `Python` · `Vosk` · `SQLite` · `vanilla JS`
**Fully offline core. No cloud required. Your data never leaves your machine.**

</div>

---

> ⚡ **This is a vibe-coded project.**
> Dexter was designed and built conversationally through **[Claude Code](https://claude.com/claude-code)** using **Claude Fable 5** — describing intent in natural language and iterating on the result live, rather than hand-writing every line. The architecture, the trade-offs, and the taste are mine; the AI was fluent in the layers below. ~3,000 lines across an Electron shell, four Python sidecars, and a full voice command router, built over a handful of evenings of design conversations.

---

## What it is

Dexter unifies everything I do while prepping for SDE placements into one cyberpunk HUD — coding, system design, communication drills, projects, reading, and life domains — gamified around a five-axis **"Placement Pentagon."** It listens for a wake word, dictates into any app, tracks my progress from real sources (LeetCode, GitHub, my Notion vault), and answers questions grounded in my own notes.

## Features

| | Capability | How far it goes |
|---|---|---|
| 🎙️ | **"Hey Dexter" wake word** | Always-on, offline STT (Vosk). Triggers on the live partial stream — responds in one call, Google-Assistant style. |
| ⌨️ | **Global dictation** | `Ctrl+Alt+Space` to speak into any focused app (chat, editor, email). Cleanup pass + user dictionary. WisprFlow-style, 100% local. |
| ⬠ | **Placement Pentagon** | Live radar over 5 axes (DSA, Core CS, System Design, Portfolio, Communication), weekly ratings, streaks, XP, levels, ranks, daily quests, achievements. |
| ⌬ | **Axis trackers** | Per-axis deep panels: DSA topic matrix + LeetCode API, Floodgate milestones with GitHub sync (auto-closes on tag detection), Core CS interview bank (5-lens template), SD syllabus, comms drills, blog digest. |
| 🧠 | **Local RAG brain** | BM25 over a notes vault (SQLite) — answers grounded in your own writing. Optional LLM synthesis. |
| ⟁ | **Mission Control** | Local task board tied to pentagon axes, voice CRUD, XP on completion. |
| ⏱️ | **Focus timer** | "Start 25 minute DSA block" → auto-logs the session + XP when it ends. |
| 🗓️ | **Day architect** | Morning briefing (stats + quests + missions + calendar), `.ics` calendar, free-gap suggestions. |
| ⚡ | **Omni launcher** | `Ctrl+Shift+D` global palette, fuzzy app launch, clipboard ring, calculator, snippets. |
| 🤖 | **Conversational brain** | Local persona core for instant offline replies; falls through to **Gemini or Claude** only for genuinely open questions. Local intents never touch the cloud. |
| 📡 | **Sentinels** | GitHub CI pass/fail voice alerts, evening DSA reminder, live tech news. |

## Architecture

```
Electron shell (main.js) ── IPC ──> renderer (vanilla JS HUD, game engine, command router)
        │
        ├── Python sidecars (JSON-lines over stdout)
        │     voice/    — Vosk wake-word STT
        │     dictate/  — push-to-talk dictation
        │     brain/    — BM25 RAG over notes vault
        │     context/  — opt-in window-activity log
        │
        └── local store: %APPDATA%/dexter/dexter-data.json  (atomic writes + rolling backups)
```

All voice and text commands flow through one router with a priority ladder: **navigation → logging → system queries → launchers → integrations → persona → LLM fallback.** OS queries stay offline and instant; only unmatched general questions reach an API.

## Quick start

```bash
git clone https://github.com/DexterDebugs/dexter.git
cd dexter
npm install
npm start
```

**For voice** (optional): `pip install vosk sounddevice keyboard pyperclip`, then download a [Vosk model](https://alphacephei.com/vosk/models) into `~/.dexter/vosk-model/`.
**For the brain / cloud LLM / integrations:** set your keys and paths in the in-app **SYS** panel. Everything is optional — the core runs fully offline.

## Docs

- [`docs/BUILD.md`](docs/BUILD.md) — full build specification & phased implementation framework
- [`docs/TRACKERS.md`](docs/TRACKERS.md) — per-axis tracker architecture
- [`docs/COMMANDS.md`](docs/COMMANDS.md) — complete voice/text command registry

---

<div align="center">

*Built by [DexterDebugs](https://github.com/DexterDebugs) · vibe-coded with Claude Code (Fable 5)*

</div>
