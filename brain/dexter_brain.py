"""DEXTER BRAIN — local RAG over a notes vault (BUILD.md Phase 2).

Pure stdlib: BM25 ranking over paragraph chunks stored in SQLite.
No embeddings download needed; architecture allows swapping in
sentence-transformers/Ollama later without changing the protocol.

CLI (one-shot, JSON on stdout — last line is the result):
  python dexter_brain.py index <vaultPath>
  python dexter_brain.py query "<question>" [k]

Index location: ~/.dexter/brain/index.db
Indexes *.md and *.txt under vaultPath (recursive), max 50MB total text.
"""
import json
import math
import os
import re
import sqlite3
import sys

# Windows console defaults to cp1252 — force UTF-8 so note text survives stdout
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

BRAIN_DIR = os.path.join(os.path.expanduser("~"), ".dexter", "brain")
DB = os.path.join(BRAIN_DIR, "index.db")
MAX_TOTAL = 50 * 1024 * 1024
CHUNK_TARGET = 900          # chars per chunk (paragraph-aligned)
STOP = set("a an and are as at be but by for from has have i in is it its of on or that the this to was were will with you your".split())

def emit(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()

def tokenize(text):
    return [w for w in re.findall(r"[a-z0-9][a-z0-9+#.\-]*", text.lower()) if w not in STOP and len(w) > 1]

def chunk_file(text):
    """Split on blank lines, merge paragraphs up to CHUNK_TARGET chars."""
    paras = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks, cur = [], ""
    for p in paras:
        if len(cur) + len(p) > CHUNK_TARGET and cur:
            chunks.append(cur.strip())
            cur = p
        else:
            cur = (cur + "\n\n" + p) if cur else p
    if cur.strip():
        chunks.append(cur.strip())
    return chunks

def cmd_index(vault):
    if not os.path.isdir(vault):
        emit({"type": "error", "text": f"vault path not found: {vault}"})
        sys.exit(1)
    os.makedirs(BRAIN_DIR, exist_ok=True)
    if os.path.exists(DB):
        os.remove(DB)
    con = sqlite3.connect(DB)
    con.executescript("""
      CREATE TABLE chunks(id INTEGER PRIMARY KEY, source TEXT, text TEXT, dl INTEGER);
      CREATE TABLE postings(term TEXT, chunk INTEGER, tf INTEGER);
      CREATE TABLE meta(k TEXT PRIMARY KEY, v TEXT);
      CREATE INDEX ix_post ON postings(term);
    """)
    total = 0
    n_chunks = 0
    total_dl = 0
    for root, dirs, files in os.walk(vault):
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        for fn in files:
            if not fn.lower().endswith((".md", ".txt")):
                continue
            p = os.path.join(root, fn)
            try:
                with open(p, encoding="utf-8", errors="ignore") as f:
                    text = f.read()
            except Exception:
                continue
            total += len(text)
            if total > MAX_TOTAL:
                emit({"type": "progress", "note": "50MB cap reached, truncating index"})
                break
            rel = os.path.relpath(p, vault)
            for ch in chunk_file(text):
                toks = tokenize(ch)
                if len(toks) < 3:
                    continue
                n_chunks += 1
                total_dl += len(toks)
                con.execute("INSERT INTO chunks(id,source,text,dl) VALUES(?,?,?,?)", (n_chunks, rel, ch, len(toks)))
                tf = {}
                for t in toks:
                    tf[t] = tf.get(t, 0) + 1
                con.executemany("INSERT INTO postings VALUES(?,?,?)", [(t, n_chunks, c) for t, c in tf.items()])
    con.execute("INSERT INTO meta VALUES('ndocs',?)", (str(n_chunks),))
    con.execute("INSERT INTO meta VALUES('avgdl',?)", (str(total_dl / max(1, n_chunks)),))
    con.commit()
    con.close()
    emit({"type": "ready", "chunks": n_chunks, "bytes": total})

def cmd_query(q, k=5):
    if not os.path.exists(DB):
        emit({"type": "error", "text": "no index — run reindex with a vault path first"})
        sys.exit(1)
    con = sqlite3.connect(DB)
    ndocs = int(con.execute("SELECT v FROM meta WHERE k='ndocs'").fetchone()[0])
    avgdl = float(con.execute("SELECT v FROM meta WHERE k='avgdl'").fetchone()[0])
    K1, B = 1.5, 0.75
    scores = {}
    for term in set(tokenize(q)):
        rows = con.execute("SELECT chunk, tf FROM postings WHERE term=?", (term,)).fetchall()
        if not rows:
            continue
        idf = math.log(1 + (ndocs - len(rows) + 0.5) / (len(rows) + 0.5))
        for chunk_id, tf in rows:
            dl = con.execute("SELECT dl FROM chunks WHERE id=?", (chunk_id,)).fetchone()[0]
            s = idf * tf * (K1 + 1) / (tf + K1 * (1 - B + B * dl / avgdl))
            scores[chunk_id] = scores.get(chunk_id, 0) + s
    top = sorted(scores.items(), key=lambda x: -x[1])[:k]
    out = []
    for cid, score in top:
        src, text = con.execute("SELECT source, text FROM chunks WHERE id=?", (cid,)).fetchone()
        out.append({"text": text[:1200], "source": src, "score": round(score, 3)})
    con.close()
    emit({"type": "result", "chunks": out})

if __name__ == "__main__":
    try:
        if len(sys.argv) >= 3 and sys.argv[1] == "index":
            cmd_index(sys.argv[2])
        elif len(sys.argv) >= 3 and sys.argv[1] == "query":
            cmd_query(sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 5)
        else:
            emit({"type": "error", "text": "usage: index <path> | query <q> [k]"})
            sys.exit(1)
    except Exception as e:
        emit({"type": "error", "text": str(e)})
        sys.exit(1)
