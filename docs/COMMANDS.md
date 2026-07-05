# DEXTER — Command Registry

Wake word: say **"Dexter"** / **"Hey Dexter"**, or type in the command bar, or press **Ctrl+Shift+D** from any app to summon Dexter's palette.

## Navigation
| Say | Opens |
|---|---|
| dashboard / core | Command Center |
| sprint / placement | Placement Sprint |
| forge / training / workout | The Forge |
| lab / creative | Creative Lab |
| vault / read | The Vault |
| quests | Quest Board |
| sys / settings | System Config |
| missions (Ctrl+8) | Mission Control |

## Logging & game
| Say | Does |
|---|---|
| `log session` / `log workout` | Opens the form, focused |
| `solved 3` | Logs DSA session, +45 XP |
| `add book Deep Work 300` | New book in Vault |
| `read 20 pages` | Logs pages on active book, +XP |
| `stats` / `level` / `streak` | Spoken live report |

## Missions (Phase 3)
| Say | Does |
|---|---|
| `create mission rehearse floodgate walkthrough due tomorrow` | New mission, axis auto-detected, due parsed |
| `missions` / `what's blocking me` | Spoken brief + opens OPS view |
| `start mission floodgate` | Status → doing |
| `complete mission floodgate` | Done, +30 XP, quest credit |
| `block mission <title>` | Status → blocked |

## Brain — your notes (Phase 2)
| Say | Does |
|---|---|
| `ask brain what is a circuit breaker` | BM25 search over your vault; LLM-synthesized answer if API key set, else top chunk read aloud with source |
| `from my notes …` / `search notes …` | Same |
| `reindex brain` | Rebuild index from SYS vault path |
| `quiz me on tcp` | Oral quiz question from a matching note |

## Day architect (Phase 5)
| Say | Does |
|---|---|
| `start 25 minute dsa block` | Focus timer (badge top-right); on finish auto-logs session + XP |
| `stop focus` / `finish block early` | Abort (no log) / complete now |
| `briefing` / `good morning` | Stats + quests + missions + today's calendar + free-gap suggestion |

## Omni launcher (Phase 4)
| Say | Does |
|---|---|
| `open opera gx` / `open code` / `open leetcode` | Fuzzy app/site/file launch (aliases + subsequence match) |
| `what is 100 times 60 plus 5` | Calculator (word-math aware) |
| `clipboard` | Shows last 20 copied texts |
| `paste copy 3` | Puts ring entry 3 back on clipboard |
| `save snippet tmay: <text>` | Named snippet ({{date}}, {{time}}, {{day}} vars) |
| `copy snippet tmay` / `snippets` | Expand to clipboard / list |
| `delete snippet x` → `confirm delete snippet x` | Two-step destructive guard |

## Visual memory (Phase 6, opt-in)
| Say | Does |
|---|---|
| `what was I doing at 3pm` | Nearest logged window title/app |
| `clear context history` → `confirm clear context` | Wipe all context files |

## Sentinels (Phase 7)
- **CI watcher**: set GitHub repo+token in SYS → toast + spoken alert when a workflow run completes
- **DSA reminder**: after 8pm with no DSA logged today, Dexter nudges you once

## Integrations
| Say | Does |
|---|---|
| `sync leetcode` | Pull solved counts/streak |
| `push notion` | Push today's logs to Notion Daily Log |
| `news` | Top 3 Hacker News headlines, spoken |

## Dictation (global hotkeys, any app)
| Hotkey | Does |
|---|---|
| Ctrl+Alt+Space | Toggle dictation → paste into focused app |
| Ctrl+Alt+V | Re-paste last transcript |
| Ctrl+Alt+H | Open history |
| Ctrl+Alt+C | Code mode (verbatim, no cleanup) |

## Axis trackers (TRACKERS.md T2)
| Say | Does |
|---|---|
| `trackers` | Six-axis spoken intelligence report |
| `dsa status` / `what topics am I missing` | Opens DSA tab; totals, week vs target, next scope / gap list |
| `floodgate status` / `what's left on floodgate` | Milestones, blocker, remaining work |
| `sync floodgate` | GitHub pull: tags, last commit, issues; auto-closes tagged milestones |
| `core cs status` / `system design status` / `communication status` | Coverage + next item, opens tab |
| `mark circuit breaker done` | Toggle an SD fundamental |
| `log blog <title>` | Digested blog entry + DSA log + XP |
| `blogs this week` | Spoken reading recap |

In the SPRINT view: sub-tabs OVERVIEW · DSA · PORTFOLIO · CORE CS · SYS DESIGN · COMMS · BLOGS. Topic chips cycle status on click; milestones complete on click (+30 XP); SD sketches and blogs have quick-log forms.

## Fallbacks
Persona replies (how are you / what's next / motivate me…) are instant and offline. Anything unmatched goes to Claude Haiku **only if** an Anthropic key is set in SYS.
