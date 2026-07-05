"""DEXTER CONTEXT — visual memory lite (BUILD.md Phase 6). OPT-IN ONLY.

Logs the foreground window title + exe every 30s to a daily JSONL file.
No screenshots, no OCR, no cloud. Files auto-prune after 48h.

Storage: ~/.dexter/context/context-YYYY-MM-DD.jsonl
Protocol: {"type":"ready"} then silent operation.
Deps: none (ctypes only).
"""
import ctypes
import ctypes.wintypes as wt
import json
import os
import sys
import time

CTX_DIR = os.path.join(os.path.expanduser("~"), ".dexter", "context")
INTERVAL = 30
KEEP_HOURS = 48

user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32

def emit(obj):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()

def foreground():
    hwnd = user32.GetForegroundWindow()
    if not hwnd:
        return None
    length = user32.GetWindowTextLengthW(hwnd)
    buf = ctypes.create_unicode_buffer(length + 1)
    user32.GetWindowTextW(hwnd, buf, length + 1)
    title = buf.value
    pid = wt.DWORD()
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    exe = ""
    h = kernel32.OpenProcess(0x1000, False, pid.value)  # PROCESS_QUERY_LIMITED_INFORMATION
    if h:
        size = wt.DWORD(1024)
        pbuf = ctypes.create_unicode_buffer(size.value)
        if kernel32.QueryFullProcessImageNameW(h, 0, pbuf, ctypes.byref(size)):
            exe = os.path.basename(pbuf.value)
        kernel32.CloseHandle(h)
    return {"title": title, "exe": exe}

def prune():
    now = time.time()
    try:
        for f in os.listdir(CTX_DIR):
            p = os.path.join(CTX_DIR, f)
            if now - os.path.getmtime(p) > KEEP_HOURS * 3600:
                os.remove(p)
    except Exception:
        pass

def main():
    os.makedirs(CTX_DIR, exist_ok=True)
    emit({"type": "ready"})
    last = None
    while True:
        try:
            fg = foreground()
            if fg and fg["title"]:
                entry = {"ts": time.strftime("%Y-%m-%dT%H:%M:%S"), **fg}
                # skip duplicate consecutive titles to keep files small
                if not last or last["title"] != fg["title"]:
                    fn = os.path.join(CTX_DIR, f"context-{time.strftime('%Y-%m-%d')}.jsonl")
                    with open(fn, "a", encoding="utf-8") as f:
                        f.write(json.dumps(entry, ensure_ascii=False) + "\n")
                    last = fg
            prune()
        except Exception:
            pass
        time.sleep(INTERVAL)

if __name__ == "__main__":
    main()
