const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, clipboard, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const { spawn, execFile } = require('child_process');
const { DEXTER_DIR, DATA_FILE, HOME_DIR, LEGACY_PATHS } = require('./lib/paths');
// Personal historical seed (data-recovery fallback). Kept out of version control;
// clones fall back to a no-op so the app runs without it. See lib/seed-data.example.js.
let historicalSeed;
try { historicalSeed = require('./lib/seed-data').historicalSeed; }
catch { historicalSeed = (base) => base; }

app.setName('dexter'); // Phase 0.2 — before any getPath call

let win = null;
let tray = null;
let voiceProc = null;

function bootLog(line) {
  try {
    fs.mkdirSync(DEXTER_DIR, { recursive: true });
    fs.appendFileSync(path.join(DEXTER_DIR, 'renderer.log'), `[${new Date().toISOString()}] ${line}\n`);
  } catch {}
}

const DEFAULT_DATA = {
  settings: {
    leetcodeUsername: '', autostart: true, tts: true, dictate: true,
    contextLog: false, anthropicKey: '', geminiKey: '',
    notionToken: '',
    // Notion database/page IDs — set your own in SYS → Notion (or run scripts/notion-discover.js)
    notionDailyLogDb: '', notionRatingsDb: '', notionWorkoutsDb: '',
    notionInterviewBankDb: '', notionSysDesignDb: '', notionCommunicationDb: '',
    notionBlogDb: '', notionFloodgatePageId: '',
    floodgateLocalPath: ''
  },
  axes: ['DSA', 'Core CS', 'System Design', 'Portfolio', 'Communication'],
  ratings: [], dailyLogs: [], workouts: [], creative: [], reading: [],
  leetcode: null,
  game: { xp: 0, level: 1, achievements: [], questLog: {} },
  missions: [],     // {id, title, axis, status, due, priority, created, completed}
  snippets: {},     // {name: text} — supports {{date}}/{{time}} vars
  focusBlocks: [],  // {date, label, minutes}
  integrations: {
    calendar: { icsUrl: '' },
    github: { token: '', repo: '' },
    brain: { vaultPath: '', lastIndexed: '', chunks: 0 }
  },
  // TRACKERS.md §11 — per-axis deep trackers, bootstrapped by trackers/shared.js
  trackers: {
    dsa: { topics: [], problems: [], weekTarget: 14, lastSync: null },
    portfolio: { projects: [] },
    corecs: { subjects: [] },
    sysdesign: { fundamentals: [], reps: [] },
    communication: { drills: [], mockSessions: [] },
    blogs: { entries: [] },
    _bootstrapped: false
  }
};

/* Phase 0.3 — if canonical file missing, import largest legacy file (never overwrite) */
function migrateLegacy() {
  if (fs.existsSync(DATA_FILE)) return;
  let best = null, bestSize = 2;
  for (const p of LEGACY_PATHS) {
    try {
      const st = fs.statSync(p);
      if (st.size > bestSize) { best = p; bestSize = st.size; }
    } catch {}
  }
  if (best) {
    fs.mkdirSync(DEXTER_DIR, { recursive: true });
    fs.copyFileSync(best, DATA_FILE);
    bootLog(`MIGRATED legacy data from ${best} (${bestSize} bytes)`);
  }
}

/* read with retries — transient locks (dying prior instance, AV scan) must not
   silently produce an empty session (root cause of "no data on startup") */
function readDataRaw() {
  let lastErr = null;
  for (let i = 0; i < 5; i++) {
    try {
      return fs.readFileSync(DATA_FILE, 'utf8');
    } catch (e) {
      lastErr = e;
      bootLog(`LOAD-RETRY ${i + 1}: ${e.code || ''} ${e.message}`);
      const until = Date.now() + 250;           // brief sync backoff, boot path only
      while (Date.now() < until) { /* wait */ }
    }
  }
  // full forensics — if this ever fires again we'll know exactly why
  try {
    bootLog(`LOAD-ERROR: ${lastErr.code || ''} ${lastErr.message} | existsSync=${fs.existsSync(DATA_FILE)} | APPDATA=${process.env.APPDATA} | dir=[${fs.existsSync(DEXTER_DIR) ? fs.readdirSync(DEXTER_DIR).join(',') : 'DIR MISSING'}]`);
  } catch (e2) { bootLog('LOAD-ERROR forensics failed: ' + e2.message); }
  return null;
}

function hasMeaningfulData(d) {
  if (!d) return false;
  const nonEmpty = key => Array.isArray(d[key]) && d[key].length > 0;
  if (['ratings', 'dailyLogs', 'workouts', 'creative', 'reading', 'missions', 'focusBlocks'].some(nonEmpty)) return true;
  if (d.leetcode) return true;
  if ((d.game || {}).xp > 0) return true;
  if (d.snippets && Object.keys(d.snippets).length) return true;
  return false;
}

function newestBackupRaw() {
  const candidates = [];
  for (const dir of [DEXTER_DIR, MIRROR_DIR]) {
    try {
      fs.readdirSync(dir)
        .filter(f => /^dexter-data\.backup-\d\.json$/.test(f))
        .forEach(f => candidates.push(path.join(dir, f)));
    } catch {}
  }
  candidates.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  for (const b of candidates) {
    try {
      const raw = fs.readFileSync(b, 'utf8');
      const d = loadDataFromRaw(raw);
      if (hasMeaningfulData(d)) return { raw, file: b, data: d };
    } catch {}
  }
  return null;
}

const MIRROR_DIR = path.join(__dirname, '.data-backup'); // project drive — survives AppData purges
function seedBackupRaw() {
  try {
    const data = historicalSeed(JSON.parse(JSON.stringify(DEFAULT_DATA)));
    if (!hasMeaningfulData(data)) return null;
    return { raw: JSON.stringify(data, null, 2), file: 'bundled historical seed', data };
  } catch (e) {
    bootLog('SEED-RECOVERY failed: ' + e.message);
    return null;
  }
}

function recoveryRaw() {
  return newestBackupRaw() || seedBackupRaw();
}

function backupNeedsRefresh(file) {
  try {
    if (!fs.existsSync(file)) return true;
    const st = fs.statSync(file);
    if (Date.now() - st.mtimeMs > 20 * 60 * 60 * 1000) return true;
    return !hasMeaningfulData(loadDataFromRaw(fs.readFileSync(file, 'utf8')));
  } catch {
    return true;
  }
}

function dailyBackup(raw) {
  // 7-slot rolling ring, one per weekday — cheap insurance
  try {
    const slot = path.join(DEXTER_DIR, `dexter-data.backup-${new Date().getDay()}.json`);
    if (backupNeedsRefresh(slot)) fs.writeFileSync(slot, raw, 'utf8');
  } catch {}
  // second location on a different drive — cleaner tools that purge %APPDATA% can't reach it
  try {
    fs.mkdirSync(MIRROR_DIR, { recursive: true });
    const mirror = path.join(MIRROR_DIR, `dexter-data.backup-${new Date().getDay()}.json`);
    if (backupNeedsRefresh(mirror)) fs.writeFileSync(mirror, raw, 'utf8');
  } catch {}
}

function loadData() {
  migrateLegacy();
  const raw = readDataRaw();
  if (raw !== null) {
    try {
      const merged = loadDataFromRaw(raw);
      if (!hasMeaningfulData(merged)) {
        const recovered = recoveryRaw();
        if (recovered) {
          bootLog(`RECOVERED empty primary from ${path.basename(recovered.file)}`);
          try {
            fs.mkdirSync(DEXTER_DIR, { recursive: true });
            fs.writeFileSync(DATA_FILE + '.tmp', recovered.raw, 'utf8');
            fs.renameSync(DATA_FILE + '.tmp', DATA_FILE);
            dailyBackup(recovered.raw);
          } catch (e) { bootLog('empty-primary recovery write-back failed: ' + e.message); }
          return recovered.data || loadDataFromRaw(recovered.raw);
        }
      }
      dailyBackup(raw);
      return merged;
    } catch (e) {
      // corrupt content: preserve the evidence before falling through to backups
      try {
        fs.copyFileSync(DATA_FILE, DATA_FILE + '.corrupt-' + Date.now());
        bootLog(`DATA CORRUPT — backed up: ${e.message}`);
      } catch (e2) { bootLog(`DATA CORRUPT and backup failed: ${e2.message}`); }
    }
  }
  // primary unavailable for ANY reason (missing, locked, corrupt) → newest good backup.
  // An empty session must never be shown while a backup with real data exists.
  const bk = recoveryRaw();
  if (bk) {
    bootLog(`RESTORED from ${path.basename(bk.file)}`);
    try { // re-materialize the primary atomically so next boot is normal
      fs.mkdirSync(DEXTER_DIR, { recursive: true });
      fs.writeFileSync(DATA_FILE + '.tmp', bk.raw, 'utf8');
      fs.renameSync(DATA_FILE + '.tmp', DATA_FILE);
    } catch (e) { bootLog('restore write-back failed: ' + e.message); }
    try { return bk.data || loadDataFromRaw(bk.raw); } catch {}
  }
  bootLog('LOAD-DEFAULTS: no primary, no usable backup');
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}
function loadDataFromRaw(raw) {
  const d = JSON.parse(raw);
  return {
    ...DEFAULT_DATA, ...d,
    settings: { ...DEFAULT_DATA.settings, ...d.settings },
    game: { ...DEFAULT_DATA.game, ...d.game },
    integrations: { ...DEFAULT_DATA.integrations, ...(d.integrations || {}) },
    trackers: { ...DEFAULT_DATA.trackers, ...(d.trackers || {}) }
  };
}

function saveData(data) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  // clobber guard: never let an (accidentally) empty in-memory DB flatten real data on disk
  try {
    // tightened: any session with zero ratings AND zero logs is treated as empty,
    // regardless of XP — an empty boot that earned quest XP must still not clobber
    const incomingEmpty = !hasMeaningfulData(data);
    let diskHasData = false;
    if (fs.existsSync(DATA_FILE)) {
      try { diskHasData = hasMeaningfulData(loadDataFromRaw(fs.readFileSync(DATA_FILE, 'utf8'))); } catch {}
    }
    // block empty saves when real data exists on disk OR in any backup slot —
    // covers the primary-file-missing window too
    if (incomingEmpty && (diskHasData || newestBackupRaw() !== null)) {
      bootLog('SAVE-BLOCKED: refused to persist empty state (real data exists on disk/backup)');
      return;
    }
  } catch {}
  // atomic write: tmp + rename — a kill mid-save can no longer truncate the file
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, DATA_FILE);
  bootLog(`SAVED ratings=${(data.ratings || []).length} logs=${(data.dailyLogs || []).length} xp=${(data.game || {}).xp || 0}`);
}

/* ---------- generic https json ---------- */
function httpJson(opts, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(opts, res => {
      let out = '';
      res.on('data', c => out += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(out || '{}') }); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('timeout')));
    if (body) req.write(body);
    req.end();
  });
}

/* ---------- LeetCode ---------- */
function lcQuery(body) {
  return httpJson({
    hostname: 'leetcode.com', path: '/graphql', method: 'POST',
    headers: {
      'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body),
      'Referer': 'https://leetcode.com', 'User-Agent': 'Mozilla/5.0'
    }
  }, body);
}

// slug → difficulty cache so repeated syncs don't re-fetch known problems
const lcDiffCache = new Map();
async function lcDifficulty(slug) {
  if (lcDiffCache.has(slug)) return lcDiffCache.get(slug);
  try {
    const { json } = await lcQuery(JSON.stringify({
      query: `query ($s: String!) { question(titleSlug: $s) { difficulty } }`,
      variables: { s: slug }
    }));
    const diff = ((json.data || {}).question || {}).difficulty || 'Medium';
    lcDiffCache.set(slug, diff);
    return diff;
  } catch { return 'Medium'; }
}

async function fetchLeetCode(username) {
  const { json } = await lcQuery(JSON.stringify({
    query: `query ($u: String!) {
      matchedUser(username: $u) {
        submitStatsGlobal { acSubmissionNum { difficulty count } }
        userCalendar { streak totalActiveDays }
      }
      recentAcSubmissionList(username: $u, limit: 20) { title titleSlug timestamp }
    }`,
    variables: { u: username }
  }));
  const mu = json.data && json.data.matchedUser;
  if (!mu) throw new Error('user not found');
  const nums = mu.submitStatsGlobal.acSubmissionNum;
  const get = d => (nums.find(n => n.difficulty === d) || {}).count || 0;

  // enrich recent accepted submissions with difficulty (cached per slug)
  const rawRecent = (json.data.recentAcSubmissionList || []);
  const recent = await Promise.all(rawRecent.map(async r => ({
    title: r.title,
    slug: r.titleSlug,
    ts: parseInt(r.timestamp) * 1000,
    date: new Date(parseInt(r.timestamp) * 1000).toISOString().slice(0, 10),
    difficulty: await lcDifficulty(r.titleSlug)
  })));

  return {
    total: get('All'), easy: get('Easy'), medium: get('Medium'), hard: get('Hard'),
    streak: mu.userCalendar ? mu.userCalendar.streak : 0,
    activeDays: mu.userCalendar ? mu.userCalendar.totalActiveDays : 0,
    recent,
    fetchedAt: new Date().toISOString()
  };
}

/* ---------- Notion API ---------- */
function notionHeaders(token, len) {
  return {
    'Authorization': `Bearer ${token}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
    ...(len ? { 'Content-Length': len } : {})
  };
}

async function notionQuery(token, dbId, startCursor) {
  const body = JSON.stringify({ page_size: 100, ...(startCursor ? { start_cursor: startCursor } : {}) });
  const { status, json } = await httpJson({
    hostname: 'api.notion.com', path: `/v1/databases/${dbId.replace(/-/g, '')}/query`, method: 'POST',
    headers: notionHeaders(token, Buffer.byteLength(body))
  }, body);
  if (status !== 200) throw new Error(`notion ${status}: ${json.message || 'error'}`);
  return json;
}

async function notionCreatePage(token, dbId, properties) {
  const body = JSON.stringify({ parent: { database_id: dbId.replace(/-/g, '') }, properties });
  const { status, json } = await httpJson({
    hostname: 'api.notion.com', path: '/v1/pages', method: 'POST',
    headers: notionHeaders(token, Buffer.byteLength(body))
  }, body);
  if (status !== 200) throw new Error(`notion ${status}: ${json.message || 'error'}`);
  return json;
}

function propText(p) {
  if (!p) return '';
  const arr = p.title || p.rich_text || [];
  return arr.map(t => t.plain_text).join('');
}
function propNum(p) { return p && typeof p.number === 'number' ? p.number : null; }
function propDate(p) { return p && p.date ? p.date.start : null; }
function propSelect(p) { return p && p.select ? p.select.name : (p && p.status ? p.status.name : null); }

/* pull all rows from a notion db, generic flattening */
async function notionPullAll(token, dbId) {
  let rows = [], cursor = null;
  do {
    const res = await notionQuery(token, dbId, cursor);
    for (const page of res.results) {
      const flat = { _id: page.id, _created: page.created_time };
      for (const [k, v] of Object.entries(page.properties)) {
        flat[k] = propText(v);
        if (v.type === 'number') flat[k] = propNum(v);
        if (v.type === 'date') flat[k] = propDate(v);
        if (v.type === 'select' || v.type === 'status') flat[k] = propSelect(v);
        if (v.type === 'multi_select') flat[k] = v.multi_select.map(m => m.name).join(', ');
      }
      rows.push(flat);
    }
    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);
  return rows;
}

/* ---------- Tech news (Hacker News Algolia, no key needed) ---------- */
async function fetchNews() {
  const { json } = await httpJson({
    hostname: 'hn.algolia.com', path: '/api/v1/search?tags=front_page&hitsPerPage=10', method: 'GET',
    headers: { 'User-Agent': 'dexter' }
  });
  return (json.hits || []).map(h => ({
    title: h.title, url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
    points: h.points, comments: h.num_comments
  }));
}

/* ---------- App launcher (Start Menu index) ---------- */
let appIndex = [];
function indexApps() {
  const roots = [
    path.join(process.env.ProgramData || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(app.getPath('home'), 'Desktop')
  ];
  const found = [];
  function walk(dir, depth) {
    if (depth > 3) return;
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (/\.(lnk|url)$/i.test(e.name)) {
        found.push({ name: e.name.replace(/\.(lnk|url)$/i, ''), path: p });
      }
    }
  }
  roots.forEach(r => walk(r, 0));
  appIndex = found;
  return found.length;
}

const APP_ALIASES = {
  'code': 'visual studio code', 'vs code': 'visual studio code', 'vscode': 'visual studio code',
  'chrome': 'google chrome', 'opera': 'opera gx', 'browser': 'opera gx',
  'terminal': 'windows terminal', 'files': 'file explorer', 'explorer': 'file explorer',
  'premiere': 'adobe premiere pro', 'photoshop': 'adobe photoshop', 'after effects': 'adobe after effects'
};

function subsequenceScore(q, n) {
  // "opgx" matches "Opera GX" — every query char in order
  let i = 0;
  for (const c of n) if (c === q[i]) i++;
  return i === q.length ? 35 : 0;
}

function launchApp(query) {
  let q = query.toLowerCase().trim();
  // direct path or URL?
  if (/^https?:\/\//i.test(query)) { require('electron').shell.openExternal(query); return { ok: true, opened: query }; }
  if (fs.existsSync(query)) { require('electron').shell.openPath(query); return { ok: true, opened: query }; }
  if (APP_ALIASES[q]) q = APP_ALIASES[q];
  if (!appIndex.length) indexApps();
  // score: exact > startsWith > includes > word overlap > in-order subsequence
  let best = null, bestScore = 0;
  for (const a of appIndex) {
    const n = a.name.toLowerCase();
    let s = 0;
    if (n === q) s = 100;
    else if (n.startsWith(q)) s = 80;
    else if (n.includes(q)) s = 60;
    else {
      const words = q.split(/\s+/).filter(Boolean);
      const hit = words.filter(w => n.includes(w)).length;
      if (hit) s = 20 + 30 * hit / words.length;
      if (q.length >= 3 && q.length <= 8) s = Math.max(s, subsequenceScore(q, n));
    }
    if (s > bestScore) { bestScore = s; best = a; }
  }
  if (best && bestScore >= 40) {
    require('electron').shell.openPath(best.path);
    return { ok: true, opened: best.name };
  }
  // on miss: closest candidates so the voice reply can offer them
  const cands = appIndex
    .map(a => ({ n: a.name, s: q.split(/\s+/).filter(w => a.name.toLowerCase().includes(w)).length }))
    .filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 3).map(x => x.n);
  return { ok: false, error: 'no match', candidates: cands };
}

/* ---------- LLM brain (Anthropic API, optional) ---------- */
async function askLlm(apiKey, systemPrompt, userText) {
  const body = JSON.stringify({
    model: 'claude-haiku-4-5',
    max_tokens: 450,
    system: systemPrompt,
    messages: [{ role: 'user', content: userText }]
  });
  const { status, json } = await httpJson({
    hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
    headers: {
      'x-api-key': apiKey, 'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body)
    }
  }, body);
  if (status !== 200) throw new Error(`llm ${status}: ${(json.error || {}).message || 'error'}`);
  return json.content.map(c => c.text || '').join(' ').trim();
}

/* ---------- LLM brain: Gemini (optional) ---------- */
async function askGemini(apiKey, systemPrompt, userText) {
  const body = JSON.stringify({
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userText }] }],
    generationConfig: { maxOutputTokens: 450 }
  });
  const { status, json } = await httpJson({
    hostname: 'generativelanguage.googleapis.com',
    path: `/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
  }, body);
  if (status !== 200) throw new Error(`gemini ${status}: ${((json.error || {}).message || 'error').slice(0, 120)}`);
  const parts = (((json.candidates || [])[0] || {}).content || {}).parts || [];
  const text = parts.map(p => p.text || '').join(' ').trim();
  if (!text) throw new Error('gemini returned empty response');
  return text;
}

/* ---------- Voice sidecar ---------- */
function startVoice() {
  if (voiceProc) return { ok: true, already: true };
  const script = path.join(__dirname, 'voice', 'dexter_voice.py');
  if (!fs.existsSync(script)) return { ok: false, error: 'voice script missing' };
  try {
    voiceProc = spawn('python', [script], { cwd: path.join(__dirname, 'voice') });
    let buf = '';
    voiceProc.stdout.on('data', chunk => {
      buf += chunk.toString();
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          if (win && !win.isDestroyed()) win.webContents.send('voice:event', msg);
        } catch { /* ignore non-json */ }
      }
    });
    voiceProc.stderr.on('data', d => {
      const s = d.toString();
      if (win && !win.isDestroyed()) win.webContents.send('voice:event', { type: 'stderr', text: s.slice(0, 200) });
    });
    voiceProc.on('exit', code => {
      voiceProc = null;
      if (win && !win.isDestroyed()) win.webContents.send('voice:event', { type: 'exit', code });
    });
    return { ok: true };
  } catch (e) {
    voiceProc = null;
    return { ok: false, error: e.message };
  }
}
function stopVoice() {
  if (voiceProc) { try { voiceProc.kill(); } catch {} voiceProc = null; }
  return { ok: true };
}

/* ---------- Dictation sidecar (Dexter Dictate) ---------- */
let dictateProc = null;
function startDictate() {
  if (dictateProc) return { ok: true, already: true };
  const script = path.join(__dirname, 'dictate', 'dexter_dictate.py');
  if (!fs.existsSync(script)) return { ok: false, error: 'dictate script missing' };
  try {
    dictateProc = spawn('python', [script], { cwd: path.join(__dirname, 'dictate') });
    let buf = '';
    dictateProc.stdout.on('data', chunk => {
      buf += chunk.toString();
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          if (win && !win.isDestroyed()) win.webContents.send('dictate:event', msg);
        } catch { }
      }
    });
    dictateProc.on('exit', () => {
      dictateProc = null;
      if (win && !win.isDestroyed()) win.webContents.send('dictate:event', { type: 'exit' });
    });
    return { ok: true };
  } catch (e) { dictateProc = null; return { ok: false, error: e.message }; }
}
function stopDictate() {
  if (dictateProc) { try { dictateProc.kill(); } catch {} dictateProc = null; }
  return { ok: true };
}

/* ---------- window/tray ---------- */
const TRAY_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAeklEQVR4nGNgGAWMDAwM/xkYGP4TwP+xYRZi9DIhc/7//89ATk5OhpycHAZycnIY/v//D9fIhKwZmwHYDMJmEAs2A9ANI8YgRnwuQPYKIfCfgYGBkVQD0A0h2gBiDMFqALEuwXABsYaQ5AJsBjEhc4jRjO4CjHTAMAoYAG2rJ/dgz4RJAAAAAElFTkSuQmCC';

function createWindow() {
  win = new BrowserWindow({
    width: 1360, height: 860, minWidth: 1000, minHeight: 660,
    backgroundColor: '#04060b', autoHideMenuBar: true, title: 'DEXTER',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false
    }
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.on('close', e => { if (!app.isQuitting) { e.preventDefault(); win.hide(); } });
  // log renderer errors to a file we can inspect
  const errLog = path.join(app.getPath('userData'), 'renderer.log');
  win.webContents.on('console-message', (_e, level, msg, line, src) => {
    const prefix = level >= 2 ? 'ERR' : level === 1 ? 'WARN' : 'LOG';
    try { fs.appendFileSync(errLog, `[${new Date().toISOString()}] ${prefix} ${msg} (${src}:${line})\n`); } catch {}
  });
  win.webContents.on('did-fail-load', (_e, code, desc) => {
    try { fs.appendFileSync(errLog, `[${new Date().toISOString()}] LOAD-FAIL ${code} ${desc}\n`); } catch {}
  });
}

function createTray() {
  tray = new Tray(nativeImage.createFromDataURL(TRAY_ICON));
  tray.setToolTip('DEXTER — online');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Dexter', click: () => { win.show(); win.focus(); } },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } }
  ]));
  tray.on('double-click', () => { win.show(); win.focus(); });
}

/* Phase 0.6 — dev autostart via wscript launcher (unicode-path safe, hidden window).
   Escapes non-ASCII chars as \uXXXX so the .js source stays pure ASCII. */
function ensureLauncher() {
  const launcher = path.join(HOME_DIR, 'launch-dexter.js');
  const proj = path.resolve(__dirname);
  const jsStr = proj.replace(/\\/g, '\\\\')
    .replace(/[\u0080-\uffff]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  const content =
    'var sh = new ActiveXObject("WScript.Shell");\r\n' +
    'var proj = "' + jsStr + '";\r\n' +
    'sh.CurrentDirectory = proj;\r\n' +
    'sh.Run(\'"\' + proj + \'\\\\node_modules\\\\electron\\\\dist\\\\electron.exe" "\' + proj + \'"\', 1, false);\r\n';
  try {
    fs.mkdirSync(HOME_DIR, { recursive: true });
    fs.writeFileSync(launcher, content, 'ascii');
  } catch (e) { bootLog('launcher write failed: ' + e.message); }
  return launcher;
}

function applyAutostart(enabled) {
  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath });
    return;
  }
  const launcher = ensureLauncher();
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'wscript.exe'),
    args: [launcher]
  });
}

/* ---------- Notion blocks reader (TRACKERS.md T3) ---------- */
async function notionBlocks(token, blockId, depth = 0) {
  const flat = [];
  let cursor = null;
  do {
    const { status, json } = await httpJson({
      hostname: 'api.notion.com',
      path: `/v1/blocks/${blockId.replace(/-/g, '')}/children?page_size=100${cursor ? '&start_cursor=' + cursor : ''}`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}`, 'Notion-Version': '2022-06-28' }
    });
    if (status !== 200) throw new Error(`notion blocks ${status}: ${json.message || 'error'}`);
    for (const b of json.results) {
      const rt = (b[b.type] || {}).rich_text || [];
      flat.push({
        id: b.id, type: b.type,
        text: rt.map(t => t.plain_text).join(''),
        checked: b.type === 'to_do' ? !!b.to_do.checked : undefined,
        childPage: b.type === 'child_page' ? { id: b.id, title: b.child_page.title } : undefined
      });
      // descend into layout containers so column-wrapped to_dos are visible
      if (b.has_children && depth < 3 && ['column_list', 'column', 'toggle', 'synced_block'].includes(b.type)) {
        flat.push(...await notionBlocks(token, b.id, depth + 1));
      }
    }
    cursor = json.has_more ? json.next_cursor : null;
  } while (cursor);
  return flat;
}

/* ---------- GitHub project sync (TRACKERS.md T-B2) ---------- */
async function githubProject(repo, token) {
  const gh = p => httpJson({
    hostname: 'api.github.com', path: p, method: 'GET',
    headers: {
      'User-Agent': 'dexter', 'Accept': 'application/vnd.github+json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    }
  });
  const out = { repo, syncedAt: new Date().toISOString() };
  const [tags, commits, release, issues] = await Promise.all([
    gh(`/repos/${repo}/tags?per_page=10`).catch(() => null),
    gh(`/repos/${repo}/commits?per_page=3`).catch(() => null),
    gh(`/repos/${repo}/releases/latest`).catch(() => null),
    gh(`/repos/${repo}/issues?state=open&per_page=30`).catch(() => null)
  ]);
  if (tags && tags.status === 200) out.tags = tags.json.map(t => t.name);
  else if (tags && tags.status === 404) throw new Error('repo not found — check owner/repo and token');
  if (commits && commits.status === 200 && commits.json.length) {
    const c = commits.json[0];
    out.lastCommit = { msg: (c.commit.message || '').split('\n')[0].slice(0, 90), date: c.commit.author.date };
  }
  if (release && release.status === 200) out.lastRelease = { tag: release.json.tag_name, date: release.json.published_at };
  if (issues && issues.status === 200) out.openIssues = issues.json.filter(i => !i.pull_request).length;
  return out;
}

/* ---------- Brain (Phase 2) — one-shot python CLI: index/query ---------- */
function runBrain(args) {
  return new Promise((resolve, reject) => {
    const script = path.join(__dirname, 'brain', 'dexter_brain.py');
    execFile('python', [script, ...args], { cwd: path.join(__dirname, 'brain'), maxBuffer: 16 * 1024 * 1024, timeout: 120000 },
      (err, stdout) => {
        if (err && !stdout) return reject(err);
        const lines = String(stdout).trim().split('\n').filter(Boolean);
        try { resolve(JSON.parse(lines[lines.length - 1])); }
        catch (e) { reject(new Error('brain output unparsable: ' + String(stdout).slice(0, 200))); }
      });
  });
}

/* ---------- ICS calendar (Phase 5.1) ---------- */
function httpsGetText(url, depth = 0) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: 'GET', headers: { 'User-Agent': 'dexter' } }, res => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && depth < 3)
        return resolve(httpsGetText(res.headers.location, depth + 1));
      let out = '';
      res.on('data', c => out += c);
      res.on('end', () => resolve(out));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('timeout')));
    req.end();
  });
}

async function icsToday(icsUrl) {
  const raw = await httpsGetText(icsUrl);
  const unfolded = raw.replace(/\r?\n[ \t]/g, '');   // RFC5545 line unfolding
  const today = new Date();
  const ymd = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  const events = [];
  for (const block of unfolded.split('BEGIN:VEVENT').slice(1)) {
    const body = block.split('END:VEVENT')[0];
    const dt = (body.match(/DTSTART[^:]*:(\d{8})(T(\d{4}))?/) || [])[0] ? body.match(/DTSTART[^:]*:(\d{8})(?:T(\d{4}))?/) : null;
    const sum = (body.match(/SUMMARY(?:;[^:]*)?:(.+)/) || [])[1];
    if (!dt || !sum) continue;
    if (parseInt(dt[1]) !== ymd) continue;
    const time = dt[2] ? dt[2].slice(0, 2) + ':' + dt[2].slice(2, 4) : 'all-day';
    events.push({ time, title: sum.trim() });
  }
  events.sort((a, b) => a.time.localeCompare(b.time));
  return events;
}

/* ---------- Context sidecar (Phase 6, opt-in) ---------- */
let contextProc = null;
function startContext() {
  if (contextProc) return { ok: true, already: true };
  const script = path.join(__dirname, 'context', 'dexter_context.py');
  if (!fs.existsSync(script)) return { ok: false, error: 'context script missing' };
  try {
    contextProc = spawn('python', [script], { cwd: path.join(__dirname, 'context') });
    contextProc.on('exit', () => { contextProc = null; });
    return { ok: true };
  } catch (e) { contextProc = null; return { ok: false, error: e.message }; }
}
function stopContext() {
  if (contextProc) { try { contextProc.kill(); } catch {} contextProc = null; }
  return { ok: true };
}
const CONTEXT_DIR = path.join(HOME_DIR, 'context');
function contextLookup(hhmm) {
  // find logged window activity nearest to HH:MM today
  const file = path.join(CONTEXT_DIR, `context-${new Date().toISOString().slice(0, 10)}.jsonl`);
  if (!fs.existsSync(file)) return null;
  const target = parseInt(hhmm.slice(0, 2)) * 60 + parseInt(hhmm.slice(3, 5));
  let best = null, bestDiff = 99999;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      const m = parseInt(e.ts.slice(11, 13)) * 60 + parseInt(e.ts.slice(14, 16));
      const diff = Math.abs(m - target);
      if (diff < bestDiff) { bestDiff = diff; best = e; }
    } catch {}
  }
  return best ? { ...best, diffMin: bestDiff } : null;
}
function contextClear() {
  try {
    if (fs.existsSync(CONTEXT_DIR)) fs.readdirSync(CONTEXT_DIR).forEach(f => fs.unlinkSync(path.join(CONTEXT_DIR, f)));
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

/* ---------- Clipboard ring (Phase 4.2) — memory only, never persisted ---------- */
let clipRing = [];
setInterval(() => {
  try {
    const t = clipboard.readText();
    if (t && t.length > 0 && t.length < 5000 && (!clipRing.length || clipRing[0] !== t)) {
      clipRing.unshift(t);
      clipRing = clipRing.slice(0, 20);
    }
  } catch {}
}, 2000);

/* ---------- GitHub CI sentinel (Phase 7.1) ---------- */
let ghLastRun = null;
setInterval(async () => {
  try {
    const d = loadData();
    const gh = (d.integrations || {}).github || {};
    if (!gh.token || !gh.repo || !win || win.isDestroyed()) return;
    const { status, json } = await httpJson({
      hostname: 'api.github.com', path: `/repos/${gh.repo}/actions/runs?per_page=1`, method: 'GET',
      headers: { 'User-Agent': 'dexter', 'Authorization': `Bearer ${gh.token}`, 'Accept': 'application/vnd.github+json' }
    });
    if (status !== 200) return;
    const run = (json.workflow_runs || [])[0];
    if (run && run.status === 'completed' && run.id !== ghLastRun) {
      if (ghLastRun !== null) win.webContents.send('ghci:event', { name: run.name, conclusion: run.conclusion, branch: run.head_branch });
      ghLastRun = run.id;
    }
  } catch {}
}, 5 * 60 * 1000);

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }
app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });

app.whenReady().then(() => {
  bootLog('MAIN-VERSION storage-v3'); // proves which code is executing
  bootLog(`DATA_FILE=${DATA_FILE}`); // Phase 0.4 — observability
  const data = loadData();
  bootLog(`LOADED ratings=${(data.ratings || []).length} logs=${(data.dailyLogs || []).length} xp=${(data.game || {}).xp || 0}`);
  createWindow();
  createTray();
  applyAutostart(!!data.settings.autostart);
  if (data.settings.contextLog) startContext();

  // Phase 4.1 — global command palette
  globalShortcut.register('Control+Shift+D', () => {
    if (!win) return;
    win.show(); win.focus();
    win.webContents.send('palette:focus');
  });

  // tripwire: log the exact moment anything deletes/renames the data file externally
  try {
    fs.watch(DEXTER_DIR, (event, filename) => {
      if (filename === 'dexter-data.json' && !fs.existsSync(DATA_FILE)) {
        bootLog(`DATA-FILE-DELETED (event=${event}) — external process removed it`);
      }
    });
  } catch {}

  ipcMain.handle('store:read', () => loadData());
  ipcMain.handle('store:write', (_e, data) => { saveData(data); return true; });

  ipcMain.handle('leetcode:fetch', async (_e, username) => {
    const stats = await fetchLeetCode(username);
    const d = loadData();
    d.leetcode = stats; d.settings.leetcodeUsername = username;
    saveData(d);
    return stats;
  });

  ipcMain.handle('autostart:set', (_e, enabled) => {
    applyAutostart(!!enabled);
    const d = loadData();
    d.settings.autostart = !!enabled; saveData(d);
    return true;
  });

  ipcMain.handle('notion:pull', async (_e, { token, dbId }) => notionPullAll(token, dbId));
  ipcMain.handle('notion:push', async (_e, { token, dbId, properties }) => notionCreatePage(token, dbId, properties));

  ipcMain.handle('voice:start', () => startVoice());
  ipcMain.handle('voice:stop', () => stopVoice());
  ipcMain.handle('dictate:start', () => startDictate());
  ipcMain.handle('dictate:stop', () => stopDictate());

  ipcMain.handle('news:fetch', () => fetchNews());
  ipcMain.handle('apps:launch', (_e, query) => launchApp(query));
  ipcMain.handle('llm:ask', (_e, { apiKey, system, text }) => askLlm(apiKey, system, text));
  ipcMain.handle('llm:gemini', (_e, { apiKey, system, text }) => askGemini(apiKey, system, text));

  ipcMain.handle('github:project', (_e, { repo, token }) => githubProject(repo, token));
  ipcMain.handle('notion:blocks', (_e, { token, blockId }) => notionBlocks(token, blockId));
  ipcMain.handle('brain:index', (_e, vaultPath) => runBrain(['index', vaultPath]));
  ipcMain.handle('brain:query', (_e, { q, k }) => runBrain(['query', q, String(k || 5)]));
  ipcMain.handle('clip:ring', () => clipRing.slice());
  ipcMain.handle('clip:copy', (_e, text) => { clipboard.writeText(String(text)); return true; });
  ipcMain.handle('cal:today', (_e, icsUrl) => icsToday(icsUrl));
  ipcMain.handle('context:start', () => startContext());
  ipcMain.handle('context:stop', () => stopContext());
  ipcMain.handle('context:lookup', (_e, hhmm) => contextLookup(hhmm));
  ipcMain.handle('context:clear', () => contextClear());

  setTimeout(() => indexApps(), 3000); // build launcher index after boot
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('before-quit', () => { stopVoice(); stopDictate(); stopContext(); });
app.on('window-all-closed', e => e.preventDefault());
