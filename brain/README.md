# DEXTER BRAIN — local notes RAG

Answers questions from **your own notes**, fully offline. BM25 ranking over paragraph chunks in SQLite (`~/.dexter/brain/index.db`). No embeddings model required; swap-in point documented below.

## Setup
1. Dexter → SYS → MODULES → set **VAULT PATH** to a folder of `.md`/`.txt` notes (e.g. an Obsidian vault or Notion export).
2. Click **REINDEX** (or say *"reindex brain"*).

## Commands
| Say / type | Result |
|---|---|
| `ask brain <question>` / `from my notes <q>` / `search notes <q>` | Top chunks; synthesized answer if Anthropic key set, else best chunk read aloud with source |
| `reindex brain` | Rebuild the index from the vault path |
| `quiz me on <topic>` | Pulls a matching chunk and quizzes you on it |

## Protocol (one-shot CLI)
```
python dexter_brain.py index <vaultPath>   → {"type":"ready","chunks":N,"bytes":M}
python dexter_brain.py query "<q>" [k]     → {"type":"result","chunks":[{text,source,score}]}
```

## Constraints
- Indexes only the user-selected folder; 50MB text cap; dot-folders skipped.
- Nothing leaves the machine unless the Anthropic key is set — then only the top chunks + question go to the API for synthesis.

## Upgrade path (Phase 2.2 full)
Replace BM25 scoring with embeddings: add an `embed` command that runs `sentence-transformers` (or Ollama `nomic-embed-text`) and stores vectors in the same SQLite file; hybrid-score with BM25. Protocol unchanged.
