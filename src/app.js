/* ============================================================
   DEXTER v2 — living interface + game engine
   ============================================================ */
let DB = null;
let ttsEnabled = true;

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const today = () => new Date().toISOString().slice(0, 10);
const fmt = d => d ? d.slice(5) : '';

/* ============ AUDIO SYNTH (no assets) ============ */
const AC = new (window.AudioContext || window.webkitAudioContext)();
function tone(freq, dur = 0.08, type = 'square', gain = 0.04, when = 0) {
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(gain, AC.currentTime + when);
  g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + when + dur);
  o.connect(g); g.connect(AC.destination);
  o.start(AC.currentTime + when); o.stop(AC.currentTime + when + dur + 0.02);
}
function whoosh(dur = 1.3) {
  // filtered noise sweep — the ignition sound
  const len = AC.sampleRate * dur;
  const buf = AC.createBuffer(1, len, AC.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = AC.createBufferSource(); src.buffer = buf;
  const bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
  bp.frequency.setValueAtTime(160, AC.currentTime);
  bp.frequency.exponentialRampToValueAtTime(3800, AC.currentTime + dur * 0.55);
  bp.frequency.exponentialRampToValueAtTime(220, AC.currentTime + dur);
  const g = AC.createGain();
  g.gain.setValueAtTime(0.0001, AC.currentTime);
  g.gain.exponentialRampToValueAtTime(0.12, AC.currentTime + dur * 0.4);
  g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + dur);
  src.connect(bp); bp.connect(g); g.connect(AC.destination);
  src.start();
}

const sfx = {
  blip: () => tone(880, 0.04, 'square', 0.02),
  nav: () => { tone(520, 0.05, 'square', 0.03); tone(780, 0.06, 'square', 0.03, 0.05); },
  confirm: () => { tone(660, 0.07, 'triangle', 0.05); tone(990, 0.1, 'triangle', 0.05, 0.07); },
  xp: () => { tone(1200, 0.05, 'sine', 0.04); tone(1600, 0.08, 'sine', 0.04, 0.05); },
  quest: () => { [660, 880, 1100].forEach((f, i) => tone(f, 0.09, 'triangle', 0.05, i * 0.08)); },
  levelup: () => { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.14, 'triangle', 0.06, i * 0.09)); },
  wake: () => { tone(440, 0.06, 'sine', 0.05); tone(880, 0.12, 'sine', 0.05, 0.06); },
  error: () => tone(180, 0.18, 'sawtooth', 0.04)
};

/* ============ BREATHING LOOP ============ */
(function breathe() {
  const t = performance.now() / 1000;
  const v = 0.5 + 0.5 * Math.sin(t * (2 * Math.PI / 4.2)); // 4.2s cycle
  window.BREATH = 0.35 + 0.65 * v;
  // 11fps is indistinguishable for a 4.2s sine — and far cheaper than 60fps style recalc
  if (!document.hidden) document.documentElement.style.setProperty('--breath', window.BREATH.toFixed(3));
  setTimeout(breathe, 90);
})();

/* ============ PARTICLE FIELD ============ */
const PF = (() => {
  const cv = $('#particles'), ctx = cv.getContext('2d');
  let W, H, pts = [], mouse = { x: -999, y: -999 };
  let hue = 187; // cyan-ish
  function resize() {
    W = cv.width = innerWidth; H = cv.height = innerHeight;
    const n = Math.floor(W * H / 26000);
    pts = Array.from({ length: n }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35,
      r: Math.random() * 1.6 + 0.4
    }));
  }
  addEventListener('resize', resize); resize();
  addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
  let bursts = [];
  function burst(x, y, color = '#00f0ff', n = 26) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = Math.random() * 4 + 1;
      bursts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, color });
    }
  }
  let lastFrame = 0;
  function tick(now) {
    // sleep when minimized/tray; 30fps cap when visible
    if (document.hidden) { setTimeout(() => requestAnimationFrame(tick), 500); return; }
    if (now - lastFrame < 33) { requestAnimationFrame(tick); return; }
    lastFrame = now;
    ctx.clearRect(0, 0, W, H);
    const breath = window.BREATH || 0.5;
    for (const p of pts) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > W) p.vx *= -1;
      if (p.y < 0 || p.y > H) p.vy *= -1;
      const dm = Math.hypot(p.x - mouse.x, p.y - mouse.y);
      if (dm < 120) { p.x += (p.x - mouse.x) / dm * 0.6; p.y += (p.y - mouse.y) / dm * 0.6; }
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7);
      ctx.fillStyle = `hsla(${hue},100%,60%,${0.25 * breath})`; ctx.fill();
    }
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < i + 6 && j < pts.length; j++) {
        const a = pts[i], b = pts[j], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < 110) {
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = `hsla(${hue},100%,60%,${(1 - d / 110) * 0.1 * breath})`;
          ctx.stroke();
        }
      }
    }
    bursts = bursts.filter(b => b.life > 0);
    for (const b of bursts) {
      b.x += b.vx; b.y += b.vy; b.vy += 0.05; b.life -= 0.02;
      ctx.beginPath(); ctx.arc(b.x, b.y, Math.max(0, 2 * b.life), 0, 7);
      ctx.fillStyle = b.color; ctx.globalAlpha = b.life; ctx.fill(); ctx.globalAlpha = 1;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  return { burst, setHue: h => hue = h };
})();

/* ============ GAME ENGINE ============ */
const RANKS = [
  [1, 'INITIATE'], [3, 'RUNNER'], [5, 'OPERATIVE'], [8, 'NETRUNNER'],
  [12, 'SPECTRE'], [16, 'ARCHITECT'], [20, 'SINGULARITY']
];
const xpForLevel = lvl => Math.floor(120 * Math.pow(lvl, 1.55));
function levelFromXp(xp) {
  let lvl = 1, cum = 0;
  while (cum + xpForLevel(lvl) <= xp) { cum += xpForLevel(lvl); lvl++; }
  return { lvl, into: xp - cum, need: xpForLevel(lvl) };
}
const rankFor = lvl => { let r = RANKS[0][1]; for (const [l, n] of RANKS) if (lvl >= l) r = n; return r; };

function comboMultiplier() {
  const s = computeStreaks().overall;
  return Math.min(2, 1 + s * 0.05);
}

function grantXp(base, reason) {
  const mult = comboMultiplier();
  const amount = Math.round(base * mult);
  const before = levelFromXp(DB.game.xp);
  DB.game.xp += amount;
  const after = levelFromXp(DB.game.xp);
  toast('xp', `+${amount} XP`, `${reason}${mult > 1 ? ` · combo ×${mult.toFixed(2)}` : ''}`);
  sfx.xp();
  PF.burst(innerWidth / 2, 80, '#00f0ff', 20);
  renderHud(true);
  if (after.lvl > before.lvl) setTimeout(() => levelUp(after.lvl), 600);
  checkAchievements();
  checkQuests();
}

function levelUp(lvl) {
  DB.game.level = lvl;
  $('#levelup-num').textContent = lvl;
  $('#levelup-rank').textContent = rankFor(lvl);
  $('#levelup').classList.remove('hidden');
  sfx.levelup();
  for (let i = 0; i < 6; i++)
    setTimeout(() => PF.burst(Math.random() * innerWidth, Math.random() * innerHeight * 0.7, i % 2 ? '#ff2bd6' : '#00f0ff', 40), i * 150);
  say(`Level up. You are now level ${lvl} — ${rankFor(lvl)}.`);
  setTimeout(() => $('#levelup').classList.add('hidden'), 3200);
  save();
}

/* ---- quests ---- */
const QUEST_POOL = [
  { id: 'dsa2', name: 'Solve 2+ LeetCode problems', test: () => DB.dailyLogs.some(l => l.date === today() && l.axis === 'DSA') },
  { id: 'core30', name: '30 min Core CS session', test: () => DB.dailyLogs.some(l => l.date === today() && l.axis === 'Core CS' && l.minutes >= 30) },
  { id: 'sd1', name: 'One System Design rep', test: () => DB.dailyLogs.some(l => l.date === today() && l.axis === 'System Design') },
  { id: 'comm1', name: 'One Communication rep', test: () => DB.dailyLogs.some(l => l.date === today() && l.axis === 'Communication') },
  { id: 'build', name: 'Ship Portfolio work', test: () => DB.dailyLogs.some(l => l.date === today() && l.axis === 'Portfolio') },
  { id: 'train', name: 'Log a workout', test: () => DB.workouts.some(w => w.date === today()) },
  { id: 'read10', name: 'Read 10+ pages', test: () => DB.reading.some(b => b.sessions.some(s => s.date === today() && s.pages >= 10)) },
  { id: 'create', name: 'Log creative output', test: () => DB.creative.some(c => c.date === today()) },
  { id: 'mission1', name: 'Complete a mission', test: () => (DB.missions || []).some(m => m.completed && m.completed.slice(0, 10) === today()) }
];
function todaysQuests() {
  const seed = today().split('-').reduce((a, b) => a * 31 + +b, 7);
  const idx = new Set();
  let x = seed;
  while (idx.size < 3) { x = (x * 1103515245 + 12345) & 0x7fffffff; idx.add(x % QUEST_POOL.length); }
  return [...idx].map(i => QUEST_POOL[i]);
}
function checkQuests() {
  const key = today();
  DB.game.questLog[key] = DB.game.questLog[key] || [];
  const done = DB.game.questLog[key];
  for (const q of todaysQuests()) {
    if (!done.includes(q.id) && q.test()) {
      done.push(q.id);
      DB.game.xp += 25;
      toast('quest', '⬡ QUEST COMPLETE', q.name + ' · +25 XP');
      sfx.quest();
      PF.burst(innerWidth - 200, 120, '#ffc14d', 30);
    }
  }
  renderQuests(); renderHud();
}

/* ---- achievements ---- */
const ACHIEVEMENTS = [
  { id: 'first-log', icon: '⚡', name: 'FIRST BLOOD', desc: 'Log your first session', test: () => DB.dailyLogs.length >= 1 },
  { id: 'streak7', icon: '🔥', name: 'WEEK OF FIRE', desc: '7-day overall streak', test: () => computeStreaks().overall >= 7 },
  { id: 'streak30', icon: '☄', name: 'UNSTOPPABLE', desc: '30-day overall streak', test: () => computeStreaks().overall >= 30 },
  { id: 'lc100', icon: '⌬', name: 'CENTURION', desc: '100+ LeetCode solved', test: () => DB.leetcode && DB.leetcode.total >= 100 },
  { id: 'lc150', icon: '♆', name: 'THE GRIND', desc: '150+ LeetCode solved', test: () => DB.leetcode && DB.leetcode.total >= 150 },
  { id: 'penta7', icon: '⬠', name: 'ROUND PENTAGON', desc: 'All axes ≥ 6 in a weekly rating', test: () => DB.ratings.some(r => DB.axes.every(a => (r.values[a] || 0) >= 6)) },
  { id: 'book1', icon: '❐', name: 'ARCHIVIST', desc: 'Finish a book', test: () => DB.reading.some(b => b.status === 'finished') },
  { id: 'train10', icon: '▲', name: 'FORGED', desc: '10 workouts logged', test: () => DB.workouts.length >= 10 },
  { id: 'lvl5', icon: '✦', name: 'OPERATIVE CLASS', desc: 'Reach level 5', test: () => levelFromXp(DB.game.xp).lvl >= 5 },
  { id: 'lvl10', icon: '⟁', name: 'DOUBLE DIGITS', desc: 'Reach level 10', test: () => levelFromXp(DB.game.xp).lvl >= 10 },
  { id: 'creative5', icon: '✧', name: 'RENDER FARM', desc: '5 creative outputs', test: () => DB.creative.length >= 5 },
  { id: 'allquests', icon: '⬡', name: 'CLEAN SWEEP', desc: 'Clear all 3 daily quests', test: () => (DB.game.questLog[today()] || []).length >= 3 }
];
function checkAchievements() {
  for (const a of ACHIEVEMENTS) {
    if (!DB.game.achievements.includes(a.id) && a.test()) {
      DB.game.achievements.push(a.id);
      toast('ach', `${a.icon} ACHIEVEMENT — ${a.name}`, a.desc);
      sfx.quest();
      PF.burst(innerWidth / 2, innerHeight / 2, '#ffc14d', 50);
    }
  }
  renderAchievements();
}

/* ---- toasts ---- */
function toast(kind, title, body) {
  const el = document.createElement('div');
  el.className = 'toast' + (kind === 'xp' ? ' xp' : '');
  el.innerHTML = `<div class="t-title">${title}</div><div class="t-body">${body}</div>`;
  $('#toast-zone').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 450); }, 3800);
}

/* ============ TTS + COMMS DRAWER ============ */
let speaking = false;
let speakingUntil = 0;

function say(text) {
  showReply(text);
  if (!ttsEnabled || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.06; u.pitch = 0.88;
  const voices = speechSynthesis.getVoices();
  const v = voices.find(v => /David|Mark|Ryan|Guy/i.test(v.name)) || voices[0];
  if (v) u.voice = v;
  // rough duration estimate: 160ms per word, floor 1.2s. Used to suppress mic self-echo
  const est = Math.max(1200, text.split(/\s+/).length * 160);
  speaking = true; speakingUntil = Date.now() + est + 350;
  u.onend = () => { speaking = false; };
  u.onerror = () => { speaking = false; };
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

let commsIdleTimer = null;
function showReply(text) {
  // append to comms drawer, auto-open it, keep history
  const log = $('#comms-log'); if (!log) { const el = $('#dexter-reply'); if (el) { el.textContent = text; el.classList.remove('hidden'); } return; }
  const msg = document.createElement('div');
  msg.className = 'comms-msg';
  msg.innerHTML = `<div class="cm-tag">DEXTER › ${new Date().toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit',second:'2-digit'})}</div><div class="cm-body"></div>`;
  msg.querySelector('.cm-body').textContent = text;
  log.appendChild(msg);
  while (log.children.length > 30) log.removeChild(log.firstChild);
  log.scrollTop = log.scrollHeight;
  openComms();
  // auto-tuck the drawer after 12s of silence (not while hovered)
  clearTimeout(commsIdleTimer);
  commsIdleTimer = setTimeout(() => {
    if (!$('#dexter-comms').matches(':hover')) closeComms();
  }, 12000);
}

function openComms() {
  if (document.body.classList.contains('comms-open')) return;
  $('#dexter-comms').classList.remove('collapsed');
  document.body.classList.add('comms-open');
  setTimeout(() => { renderRadar(); }, 460); // re-fit pentagon after push
}
function closeComms() {
  if (!document.body.classList.contains('comms-open')) return;
  $('#dexter-comms').classList.add('collapsed');
  document.body.classList.remove('comms-open');
  setTimeout(() => { renderRadar(); }, 460);
}

/* ============ VOICE (Vosk sidecar) ============ */
/* wake word + common Vosk mishears of "dexter" */
const WAKE_RE = /\b(?:hey|hi|okay|ok|a)?\s*(?:dexter|dexters|dextor|dexta|dexter's|dexstar|deck star|dec star|deckster|texter|dexter)\b/i;
const IDLE_LABEL = '◉ VOICE LIVE — say "Hey Dexter"';
const LISTEN_MS = 12000;

const Voice = {
  live: false, wakeUntil: 0, lastPartial: '',
  chip: null, timer: null,
  init() {
    this.chip = $('#voice-chip');
    window.dexter.onVoice(msg => this.onEvent(msg));
    window.dexter.voiceStart().then(r => {
      if (!r.ok) this.setState('dead', '◉ VOICE OFFLINE');
    });
    $('#mic-btn').addEventListener('click', () => {
      if (this.live) { window.dexter.voiceStop(); this.setState('dead', '◉ VOICE OFF'); this.live = false; $('#mic-btn').classList.remove('live'); }
      else { window.dexter.voiceStart(); this.setState('', '◉ VOICE BOOTING'); }
    });
  },
  setState(cls, label) {
    this.chip.className = 'voice-chip ' + cls;
    this.chip.textContent = label;
  },
  scheduleSleep() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (Date.now() >= this.wakeUntil) {
        this.wakeUntil = 0;
        this.setState('live', IDLE_LABEL);
        say('Standing by.'); // gentle sign-off
      }
    }, LISTEN_MS + 200);
  },
  onEvent(msg) {
    if (msg.type === 'ready') {
      this.live = true;
      $('#mic-btn').classList.add('live');
      this.setState('live', IDLE_LABEL);
    } else if (msg.type === 'partial') {
      this.lastPartial = msg.text;
      waveformKick();
      // INSTANT wake on live partials (Google-Assistant style) — don't wait for the final
      if (!(speaking || Date.now() < speakingUntil) &&
          Date.now() >= this.wakeUntil && WAKE_RE.test(msg.text)) {
        this.wakeUntil = Date.now() + LISTEN_MS;
        this.wokeFromPartial = true;   // this utterance's final must be treated as the command
        this.setState('wake', '◉ LISTENING…');
        sfx.wake();
        say('Yes?');
        this.scheduleSleep();
      }
      // extend listen window if user is actively talking
      if (Date.now() < this.wakeUntil && msg.text.length > 2) {
        this.wakeUntil = Math.max(this.wakeUntil, Date.now() + 4000);
        this.scheduleSleep();
      }
      if (Date.now() < this.wakeUntil) $('#cmd').placeholder = '…' + msg.text;
    } else if (msg.type === 'final') {
      // the final of a partial-woken utterance is sacred — it may carry the command
      // spoken in the same breath ("hey dexter open youtube"); never drop it
      if (this.wokeFromPartial) {
        this.wokeFromPartial = false;
        this.onFinal(msg.text.toLowerCase().trim(), true);
        return;
      }
      // echo suppression: ignore mic input while Dexter is speaking
      if (speaking || Date.now() < speakingUntil) return;
      this.onFinal(msg.text.toLowerCase().trim(), false);
    } else if (msg.type === 'error') {
      this.setState('dead', '◉ VOICE ERROR');
      showReply('Voice engine error: ' + msg.text);
    } else if (msg.type === 'exit') {
      this.live = false;
      $('#mic-btn').classList.remove('live');
      this.setState('dead', '◉ VOICE OFF');
    }
  },
  onFinal(text, fromPartialWake) {
    if (!text) return;
    const hasWake = WAKE_RE.test(text);
    const awake = Date.now() < this.wakeUntil;

    if (fromPartialWake) {
      // already greeted from the live partial — just extract the command, if any
      const rest = hasWake ? text.replace(WAKE_RE, '').replace(/^[,!.\s]+/, '').trim() : text.trim();
      this.wakeUntil = Date.now() + LISTEN_MS;
      this.scheduleSleep();
      if (rest.length > 1) {
        if (window.speechSynthesis) speechSynthesis.cancel(); // cut the "Yes?" short
        handleCommand(rest);
      }
      return;
    }

    if (hasWake) {
      // fallback path: wake word only surfaced in the final transcript
      const rest = text.replace(WAKE_RE, '').replace(/^[,!.\s]+/, '').trim();
      this.wakeUntil = Date.now() + LISTEN_MS;
      this.setState('wake', '◉ LISTENING…');
      sfx.wake();
      if (rest) {
        handleCommand(rest);
        this.scheduleSleep(); // keep listening for follow-up
      } else {
        say('Yes? How can I help you?');
        this.scheduleSleep();
      }
    } else if (awake && text.length > 1) {
      // follow-up command in active listening window
      this.setState('wake', '◉ LISTENING…');
      handleCommand(text);
      this.wakeUntil = Date.now() + LISTEN_MS; // reset window on each command
      this.scheduleSleep();
    }
  }
};

/* waveform mini-viz */
let wfEnergy = 0;
function waveformKick() { wfEnergy = 1; }
(function wfLoop() {
  const cv = $('#waveform'); if (!cv) return setTimeout(wfLoop, 300);
  // sleep in tray; idle ripple at ~6fps; full 60fps only while voice is active
  if (document.hidden) return setTimeout(wfLoop, 600);
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, 80, 30);
  const t = performance.now() / 90;
  ctx.beginPath();
  for (let x = 0; x <= 80; x += 2) {
    const y = 15 + Math.sin(x / 6 + t) * (2 + wfEnergy * 10) * Math.sin(x / 25);
    x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.strokeStyle = wfEnergy > 0.2 ? '#3dff8b' : 'rgba(0,240,255,.5)';
  ctx.stroke();
  wfEnergy = Math.max(0, wfEnergy - 0.03);
  if (wfEnergy < 0.05) setTimeout(wfLoop, 170);
  else requestAnimationFrame(wfLoop);
})();

/* ============ COMMANDS ============ */
function handleCommand(raw) {
  const t = raw.toLowerCase().replace(/^(hey |ok )?dexter[,!.]?\s*/i, '').trim();
  if (!t) { say('Standing by.'); return; }

  if (/^(hi|hello|hey|wake|initialize|initialise|good (morning|evening|afternoon))/.test(t))
    return say('Online and listening. How can I help you?');
  if (/^(dashboard|home|command center|core)$/.test(t)) { switchView('dashboard'); return say('Command center on screen.'); }
  if (/^(placement|sprint|placement sprint)$/.test(t)) { switchView('placement'); return say('Placement sprint module open.'); }
  if (/^(workout|training|gym|calisthenics|forge)$/.test(t)) { switchView('training'); return say('The forge is open.'); }
  if (/^(creative|video|design|lab|creative lab)$/.test(t)) { switchView('creative'); return say('Creative lab open.'); }
  if (/^(read|reading|book|books|vault|archive)$/.test(t)) { switchView('reading'); return say('The vault is open.'); }
  if (/^(quest|quests|achievement|achievements|quest board)$/.test(t)) { switchView('quests'); return say('Quest board on screen.'); }
  if (/^(setting|settings|config|sys|system config)$/.test(t)) { switchView('settings'); return say('System configuration.'); }

  if (/^log workout/.test(t)) { switchView('training'); $('#form-workout [name=title]').focus(); return say('Forge ready. Log your session.'); }
  if (/^log (session|dsa|study)/.test(t)) { switchView('placement'); $('#form-daily [name=activity]').focus(); return say('Log your session.'); }

  const bookMatch = t.match(/^add book (.+?)(?:\s+(\d+))?$/);
  if (bookMatch) {
    addBook(bookMatch[1].trim(), '', parseInt(bookMatch[2] || '0') || 200);
    return say(`${bookMatch[1]} added to the vault.`);
  }
  const readMatch = t.match(/^(?:i )?read (\d+) pages?/);
  if (readMatch) {
    const active = DB.reading.find(b => b.status === 'reading');
    if (!active) return say('No active book. Add one first.');
    logReading(active.id, parseInt(readMatch[1]), 0);
    return say(`Logged ${readMatch[1]} pages of ${active.title}. ${progressLine(active)}`);
  }
  const lcMatch = t.match(/solved (\d+|one|two|three|four|five)/);
  if (lcMatch) {
    const words = { one: 1, two: 2, three: 3, four: 4, five: 5 };
    const n = words[lcMatch[1]] || parseInt(lcMatch[1]);
    DB.dailyLogs.push({ date: today(), axis: 'DSA', activity: `Solved ${n} problems`, minutes: n * 20, notes: 'via voice' });
    save(); renderAll();
    grantXp(15 * n, `${n} problems solved`);
    return say(`${n} problems logged under DSA. Keep the streak alive.`);
  }
  if (/^(stats|status|report|streak|status report)$/.test(t)) return say(statusReport());
  if (/sync|refresh/.test(t) && /leetcode/.test(t)) {
    if (!DB.settings.leetcodeUsername) return say('Set your LeetCode username in system config first.');
    refreshLeetCode(DB.settings.leetcodeUsername);
    return say('Syncing LeetCode uplink.');
  }
  if (/push.*notion|notion.*push|sync notion/.test(t)) { notionPushToday(); return; }
  if (/^(time|what time is it|current time)$/.test(t)) return say(`It is ${new Date().toLocaleTimeString()}.`);
  if (/^(level|rank|xp|my level|my rank|my xp|what'?s my level|what is my level|how much xp do i have)$/.test(t)) {
    const l = levelFromXp(DB.game.xp);
    return say(`Level ${l.lvl}, rank ${rankFor(l.lvl)}. ${l.into} of ${l.need} XP into this level. Combo multiplier ${comboMultiplier().toFixed(2)}.`);
  }
  if (/thank/.test(t)) return say('Always. Back to work.');

  // registry — early intents (focus timers, missions, brain…) beat the generic launcher
  if (window.COMMAND_REGISTRY) {
    for (const c of COMMAND_REGISTRY) {
      if (!c.early) continue;
      const m = c.test(t);
      if (m) return c.run(m, t, raw);
    }
  }

  // launch apps / documents / sites: "open X", "launch X", "start X"
  const openMatch = t.match(/^(?:open|launch|start|run|go to|goto|take me to)\s+(?:the\s+|that\s+|my\s+)?(.+)$/);
  if (openMatch) return openTarget(openMatch[1]);
  if (/news|headlines|tech update|what.?s happening/.test(t)) return speakNews();

  // registry — remaining intents (integrations layer, before persona/LLM)
  if (window.COMMAND_REGISTRY) {
    for (const c of COMMAND_REGISTRY) {
      if (c.early) continue;
      const m = c.test(t);
      if (m) return c.run(m, t, raw);
    }
  }

  // everything else → agent brain
  agentAsk(raw);
}

/* ---- open apps / files / URLs ---- */
const SITE_ALIASES = {
  'leetcode': 'https://leetcode.com/problemset/', 'notion': 'https://www.notion.so',
  'github': 'https://github.com', 'youtube': 'https://www.youtube.com',
  'linkedin': 'https://www.linkedin.com', 'gmail': 'https://mail.google.com',
  'repository': 'https://github.com', 'repo': 'https://github.com',
  'chatgpt': 'https://chat.openai.com', 'claude': 'https://claude.ai'
};
async function openTarget(what) {
  const w = what.trim().replace(/\s+(browser|app|application)$/, '');
  const alias = Object.keys(SITE_ALIASES).find(k => w === k || w.startsWith(k + ' '));
  const target = alias ? SITE_ALIASES[alias] : w;
  say(`Opening ${w}.`);
  const res = await window.dexter.launchApp(target);
  if (res.ok) { sfx.confirm(); showReply(`DEXTER › launched ${res.opened || w}`); }
  else {
    sfx.error();
    const hint = res.candidates && res.candidates.length ? ` Did you mean: ${res.candidates.join(', ')}?` : '';
    say(`I couldn't find ${w} on this system.${hint}`);
  }
}

/* ---- tech news ---- */
let NEWS = [];
async function loadNews(silent) {
  try {
    NEWS = await window.dexter.fetchNews();
    renderNews();
    if (!silent) say('Global signal refreshed.');
  } catch {
    $('#news-feed').textContent = 'signal lost — check connection';
  }
}
function renderNews() {
  $('#news-time').textContent = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  $('#news-feed').innerHTML = NEWS.map((n, i) => `
    <div class="news-item" data-url="${n.url}">
      <span class="n-idx">${String(i + 1).padStart(2, '0')}</span>
      <span class="n-title">${n.title}</span>
      <span class="n-meta">▲${n.points} · ${n.comments}c</span>
    </div>`).join('') || 'no signal';
  $$('.news-item').forEach(el => el.addEventListener('click', () => {
    sfx.confirm(); window.dexter.launchApp(el.dataset.url);
  }));
}
function speakNews() {
  if (!NEWS.length) { loadNews(); return say('Pulling the global signal now. Ask me again in a moment.'); }
  switchView('dashboard');
  say('Top of the wire: ' + NEWS.slice(0, 3).map((n, i) => `${i + 1}. ${n.title}`).join('. '));
}

/* ---- agent brain: LLM if key present, persona core otherwise ---- */
const PERSONA = [
  [/how are you|how('| a)re things|you (ok|okay|good|fine)/, () => {
    const s = computeStreaks(); const q = 3 - (DB.game.questLog[today()] || []).length;
    return `All systems nominal — running at full capacity. Your overall streak is ${s.overall} days and ${q > 0 ? q + ' quests remain today' : 'all quests are clear'}. What's next?`;
  }],
  [/who are you|what are you|your name/, () => 'I am Dexter — your personal operations system. I track your placement sprint, training, creative output and reading, and I open whatever you need. Built for one user: you.'],
  [/what can you do|help|commands/, () => 'I can log sessions, workouts and reading. Say open followed by any app or site. Ask for stats, news, level, or what is next. I sync LeetCode and Notion. And I listen whenever you say my name.'],
  [/what('|i)?s next|what should i do|next task|plan for today/, () => {
    const done = DB.game.questLog[today()] || [];
    const open = todaysQuests().filter(q => !done.includes(q.id));
    if (!open.length) return 'All daily quests are clear. Bonus round: one hard LeetCode problem, or rehearse the Floodgate walkthrough out loud.';
    return `Next up: ${open[0].name}. ${open.length > 1 ? 'After that, ' + open.slice(1).map(q => q.name).join(', then ') + '.' : 'Then you are clear for today.'}`;
  }],
  [/motivat|inspire|tired|give up|can('|no)?t do/, () => {
    const week = DB.ratings[DB.ratings.length - 1];
    return `Look at the data: you took System Design from 2 to 6 and Communication from 2 to 5.5 in ten weeks. The pentagon does not lie. One session at a time — start a 25 minute block now.`;
  }],
  [/joke|funny/, () => 'Why do programmers prefer dark mode? Because light attracts bugs. Speaking of which — your quests await.'],
  [/good night|goodnight|sleep/, () => 'Powering down the watch. Rest is training too — recovery consolidates strength and memory. Good night.'],
  [/love you|best assistant/, () => 'Acknowledged. Now go make NVIDIA regret not meeting you sooner.']
];

async function agentAsk(text) {
  // try persona patterns first (instant, offline)
  const t = text.toLowerCase();
  for (const [re, fn] of PERSONA) {
    if (re.test(t)) return say(fn());
  }
  // fall through to cloud LLM if any key configured (local intents never reach here)
  if (hasLlm()) {
    showReply('…thinking');
    try {
      const reply = await llmAsk(dexterSystemPrompt(), text);
      return say(reply);
    } catch (e) {
      sfx.error();
      return say('My deep brain is unreachable — check the API key in system config. Persona core still online.');
    }
  }
  say("I heard you, but that's beyond my offline core. Add a Gemini or Anthropic API key in SYS to unlock my full brain — or try: stats, what's next, open an app, news.");
}

/* provider-agnostic LLM access — Anthropic preferred, Gemini fallback.
   Every LOCAL intent (stats, missions, logging, nav…) is matched before this
   layer is ever reached, so OS queries stay offline automatically. */
function hasLlm() { return !!(DB.settings.anthropicKey || DB.settings.geminiKey); }

function dexterSystemPrompt() {
  const s = computeStreaks(), l = levelFromXp(DB.game.xp);
  const week = DB.ratings[DB.ratings.length - 1];
  const quests = todaysQuests().map(q => q.name).join('; ');
  const missions = (DB.missions || []).filter(m => m.status !== 'done').slice(0, 4).map(m => `${m.title} [${m.status}]`).join('; ');
  return `You are DEXTER — a sharp, loyal sci-fi personal operations system running locally on your operator's Windows machine. Think JARVIS: calm, precise, quietly witty. Never break character, never mention being an AI model or Google/Gemini.

OPERATOR PROFILE: engineering student sprinting toward SDE placements (targets: NVIDIA, Fanatics — August 2026). Projects: Floodgate (Go API gateway with adaptive rate limiting), BloodConnect, Sphere. Also a calisthenics athlete (handstand pushups, front lever, tuck planche), video editor and graphic designer.

LIVE TELEMETRY (real, current):
- Level ${l.lvl} ${rankFor(l.lvl)} · ${DB.game.xp} XP · overall streak ${s.overall}d (study ${s.study}d, training ${s.train}d)
- LeetCode solved: ${DB.leetcode ? DB.leetcode.total : 'not synced'}
- Pentagon (0-10): ${week ? DB.axes.map(a => `${a} ${week.values[a] ?? '?'}`).join(', ') : 'no ratings yet'}
- Today's quests: ${quests || 'none'}
- Active missions: ${missions || 'none'}
- Date: ${today()}, time: ${new Date().toTimeString().slice(0, 5)}

RESPONSE RULES (strict):
1. Spoken aloud via TTS — plain prose only. No markdown, no bullet lists, no asterisks, no code blocks, no emojis.
2. Default 1-3 sentences. Technical explanations (CS concepts, system design, interview questions) may take up to 6 sentences — favor a crisp mental model plus one concrete example.
3. When relevant, tie answers back to the operator's prep: their projects, weak axes, or today's quests. Don't force it.
4. If asked something you can't know (their local files, private data you weren't given), say so plainly instead of guessing.
5. Numbers and formulas: speak them naturally ("ten to the ninth", "n log n").`;
}
async function llmAsk(system, text) {
  if (DB.settings.anthropicKey) {
    try { return await window.dexter.askLlm(DB.settings.anthropicKey, system, text); }
    catch (e) { if (!DB.settings.geminiKey) throw e; }
  }
  return await window.dexter.askGemini(DB.settings.geminiKey, system, text);
}
window.hasLlm = hasLlm; window.llmAsk = llmAsk;

function statusReport() {
  const s = computeStreaks();
  const l = levelFromXp(DB.game.xp);
  const parts = [`Level ${l.lvl} ${rankFor(l.lvl)}.`, `Overall streak ${s.overall} days.`];
  if (DB.leetcode) parts.push(`LeetCode ${DB.leetcode.total} solved.`);
  const week = DB.ratings[DB.ratings.length - 1];
  if (week) {
    const avg = (DB.axes.reduce((a, x) => a + (week.values[x] || 0), 0) / DB.axes.length).toFixed(1);
    parts.push(`Pentagon average ${avg} of 10.`);
  }
  const q = (DB.game.questLog[today()] || []).length;
  parts.push(`${q} of 3 daily quests complete.`);
  return parts.join(' ');
}

/* ============ STREAKS ============ */
function activityDates(list) { return new Set(list.map(x => x.date)); }
function streakFrom(dates) {
  let n = 0; const d = new Date();
  if (!dates.has(d.toISOString().slice(0, 10))) d.setDate(d.getDate() - 1);
  while (dates.has(d.toISOString().slice(0, 10))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
function computeStreaks() {
  const readDates = new Set();
  DB.reading.forEach(b => b.sessions.forEach(s => readDates.add(s.date)));
  const study = streakFrom(activityDates(DB.dailyLogs));
  const train = streakFrom(activityDates(DB.workouts));
  const create = streakFrom(activityDates(DB.creative));
  const read = streakFrom(readDates);
  const all = new Set([...activityDates(DB.dailyLogs), ...activityDates(DB.workouts), ...activityDates(DB.creative), ...readDates]);
  return { study, train, create, read, overall: streakFrom(all) };
}

/* ============ RENDER ============ */
async function save() { await window.dexter.writeStore(DB); }

function renderAll() {
  renderHud(); renderRadar(); renderStreaks(); renderLeetCode(); renderLogs();
  renderRatingForm(); renderAxisSelect(); renderBooks(); renderSettings();
  renderQuests(); renderAchievements(); renderSkillTree(); renderTrajectory();
  if (window.renderMissions) renderMissions();
}

function countUp(el, target, suffix = '') {
  const start = performance.now(), dur = 800, from = 0;
  (function step(now) {
    const p = Math.min(1, (now - start) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(from + (target - from) * e) + suffix;
    if (p < 1) requestAnimationFrame(step);
  })(start);
}

function renderHud(animate) {
  const l = levelFromXp(DB.game.xp);
  $('#level-num').textContent = l.lvl;
  $('#rank-title').textContent = rankFor(l.lvl);
  $('#xp-fill').style.width = (100 * l.into / l.need).toFixed(1) + '%';
  if (animate) { countUp($('#xp-cur'), l.into); } else { $('#xp-cur').textContent = l.into; }
  $('#xp-next').textContent = l.need;
  $('#hud-date').textContent = new Date().toDateString().toUpperCase();
}

/* ============ THE PENTAGON — detailed live radar ============ */
let radarRAF = null, radarTiltBound = false, radarSyncTimer = null;
let radarLastT = 0, radarIdleTimer = null;

function bindRadarTilt() {
  if (radarTiltBound) return; radarTiltBound = true;
  const tilt = $('#radar-tilt'); if (!tilt) return;
  addEventListener('mousemove', e => {
    const rx = (e.clientY / innerHeight - 0.5) * -6;
    const ry = (e.clientX / innerWidth - 0.5) * 8;
    tilt.style.transform = `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
  });
}

function renderRadar() {
  const cv = $('#radar'); if (!cv) return;
  if (radarRAF) cancelAnimationFrame(radarRAF);
  if (radarIdleTimer) { clearTimeout(radarIdleTimer); radarIdleTimer = null; }
  bindRadarTilt();

  /* logical space is 680x600; canvas scales to fit its container */
  const W = 680, H = 600, CX = 340, CY = 306, R = 218;
  const tilt = $('#radar-tilt');
  const cw = Math.max(320, tilt ? tilt.clientWidth : W);
  const ch = cw * H / W;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const s = cw / W;
  cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
  cv.style.width = '100%'; cv.style.height = '100%';
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr * s, 0, 0, dpr * s, 0, 0);

  const axes = DB.axes, n = axes.length;
  const cur = DB.ratings[DB.ratings.length - 1];
  const prev = DB.ratings.length > 1 ? DB.ratings[DB.ratings.length - 2] : null;
  const ang = i => -Math.PI / 2 + i * 2 * Math.PI / n;
  const pt = (i, r) => [CX + Math.cos(ang(i)) * r, CY + Math.sin(ang(i)) * r];

  /* vertex chips (HTML, around the canvas) */
  const chips = $('#radar-chips');
  if (chips) {
    chips.innerHTML = axes.map((a, i) => {
      const x = CX + Math.cos(ang(i)) * (R + 62);
      const y = CY + Math.sin(ang(i)) * (R + 50);
      const v = cur ? (cur.values[a] ?? 0) : 0;
      const p = prev ? (prev.values[a] ?? 0) : null;
      const d = p === null ? null : +(v - p).toFixed(1);
      const cls = d === null || d === 0 ? 'flat' : d > 0 ? '' : 'down';
      const dTxt = d === null ? '· NEW' : d > 0 ? `+${d} ▲` : d < 0 ? `${d} ▼` : '— HOLD';
      return `<div class="axis-chip" style="left:${(x / W * 100).toFixed(2)}%; top:${(y / H * 100).toFixed(2)}%">
        <span class="ac-main">${a.toUpperCase()} <b>${v.toFixed(1)}</b></span>
        <div class="ac-delta ${cls}">${dTxt}</div>
      </div>`;
    }).join('');
  }

  /* core sync = weekly average, with a live flutter */
  const avg = cur ? axes.reduce((s, a) => s + (cur.values[a] || 0), 0) / n : 0;
  const syncEl = $('#radar-sync');
  const baseSync = Math.round(avg * 10);
  if (syncEl) syncEl.textContent = cur ? baseSync + '%' : '—';
  clearInterval(radarSyncTimer);
  if (cur) radarSyncTimer = setInterval(() => {
    if (syncEl) syncEl.textContent = Math.max(0, Math.min(100, baseSync + (Math.floor(Math.random() * 3) - 1))) + '%';
  }, 2200);

  const motes = Array.from({ length: 24 }, () => ({
    a: Math.random() * Math.PI * 2, r: 26 + Math.random() * (R - 60),
    s: 0.006 + Math.random() * 0.026, sz: 0.5 + Math.random() * 1.4,
    hue: Math.random() > 0.8 ? 315 : 187
  }));
  const start = performance.now();
  const conicOK = typeof ctx.createConicGradient === 'function';

  function draw(t) {
    // radar only animates when it's actually on screen; 30fps cap
    if (document.hidden || currentView !== 'dashboard') {
      radarRAF = null;
      radarIdleTimer = setTimeout(() => { radarRAF = requestAnimationFrame(draw); }, 700);
      return;
    }
    if (t - radarLastT < 33) { radarRAF = requestAnimationFrame(draw); return; }
    radarLastT = t;
    const reveal = Math.min(1, (t - start) / 1400);
    const er = 1 - Math.pow(1 - reveal, 3);
    const breath = window.BREATH || 0.5;
    ctx.clearRect(0, 0, W, H);

    /* outer rotating tick ring */
    ctx.save(); ctx.translate(CX, CY); ctx.rotate(t / 30000);
    ctx.strokeStyle = 'rgba(0,240,255,.30)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, R + 40, 0, 7); ctx.stroke();
    for (let d = 0; d < 360; d += 3) {
      const a = d * Math.PI / 180, major = d % 30 === 0;
      const r1 = R + 40, r2 = r1 + (major ? 11 : 4);
      ctx.strokeStyle = major ? 'rgba(0,240,255,.55)' : 'rgba(0,240,255,.18)';
      ctx.lineWidth = major ? 1.4 : 1;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
      ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,240,255,.5)'; ctx.font = '9px Consolas';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let d = 0; d < 360; d += 72) {
      const a = d * Math.PI / 180;
      ctx.fillText(String(d).padStart(3, '0'), Math.cos(a) * (R + 64), Math.sin(a) * (R + 64));
    }
    ctx.restore();

    /* counter-rotating dashed ring */
    ctx.save(); ctx.translate(CX, CY); ctx.rotate(-t / 18000);
    ctx.setLineDash([26, 14]); ctx.strokeStyle = 'rgba(255,43,214,.35)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(0, 0, R + 24, 0, 7); ctx.stroke();
    ctx.setLineDash([]); ctx.restore();

    /* web grid */
    for (let lvl = 1; lvl <= 5; lvl++) {
      const r = R * lvl / 5 * er;
      ctx.beginPath();
      for (let i = 0; i <= n; i++) { const [x, y] = pt(i % n, r); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.strokeStyle = lvl === 5 ? `rgba(0,240,255,${.4 + .2 * breath})` : 'rgba(0,240,255,.13)';
      ctx.lineWidth = lvl === 5 ? 1.5 : 1;
      if (lvl === 5) { ctx.shadowColor = '#00f0ff'; ctx.shadowBlur = 10 * breath; }
      ctx.stroke(); ctx.shadowBlur = 0;
    }
    /* spokes + level dots */
    for (let i = 0; i < n; i++) {
      const [x, y] = pt(i, R * er);
      ctx.strokeStyle = 'rgba(0,240,255,.16)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(CX, CY); ctx.lineTo(x, y); ctx.stroke();
      for (let lvl = 1; lvl < 5; lvl++) {
        const [dx, dy] = pt(i, R * lvl / 5 * er);
        ctx.fillStyle = 'rgba(0,240,255,.25)';
        ctx.fillRect(dx - 1, dy - 1, 2, 2);
      }
    }

    /* radar sweep, clipped to the web */
    const sw = (t / 4200) % (Math.PI * 2);
    if (conicOK && er > 0.2) {
      const grad = ctx.createConicGradient(sw, CX, CY);
      grad.addColorStop(0, 'rgba(0,240,255,.20)');
      grad.addColorStop(0.10, 'rgba(0,240,255,0)');
      grad.addColorStop(1, 'rgba(0,240,255,0)');
      ctx.save(); ctx.beginPath();
      for (let i = 0; i <= n; i++) { const [x, y] = pt(i % n, R * er); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.clip(); ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H); ctx.restore();
      ctx.strokeStyle = `rgba(0,240,255,${.5 + .3 * breath})`; ctx.lineWidth = 1.2;
      ctx.shadowColor = '#00f0ff'; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.moveTo(CX, CY);
      ctx.lineTo(CX + Math.cos(sw) * R * er, CY + Math.sin(sw) * R * er); ctx.stroke();
      ctx.shadowBlur = 0;
    }

    /* prior week ghost */
    if (prev) {
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      axes.forEach((a, i) => {
        const [x, y] = pt(i, R * ((prev.values[a] ?? 0) / 10) * er);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.closePath();
      ctx.strokeStyle = 'rgba(255,43,214,.55)'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.setLineDash([]);
    }

    /* current polygon */
    if (cur) {
      ctx.beginPath();
      axes.forEach((a, i) => {
        const [x, y] = pt(i, R * ((cur.values[a] ?? 0) / 10) * er);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.closePath();
      const fg = ctx.createRadialGradient(CX, CY, 20, CX, CY, R);
      fg.addColorStop(0, `rgba(0,240,255,${.26 + .1 * breath})`);
      fg.addColorStop(1, 'rgba(0,240,255,.04)');
      ctx.fillStyle = fg; ctx.fill();
      ctx.strokeStyle = `rgba(0,240,255,${.8 + .2 * breath})`; ctx.lineWidth = 2;
      ctx.shadowColor = '#00f0ff'; ctx.shadowBlur = 18 * (0.5 + breath); ctx.stroke(); ctx.shadowBlur = 0;

      /* vertex nodes, flaring when the sweep passes */
      axes.forEach((a, i) => {
        const [x, y] = pt(i, R * ((cur.values[a] ?? 0) / 10) * er);
        const da = Math.abs(((ang(i) - sw) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
        const hot = Math.max(0, 1 - da / 0.5);
        ctx.beginPath(); ctx.arc(x, y, 4 + 3 * hot, 0, 7);
        ctx.fillStyle = '#00f0ff'; ctx.shadowColor = '#00f0ff'; ctx.shadowBlur = 10 + 22 * hot; ctx.fill();
        ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.arc(x, y, 9 + 8 * hot + 3 * breath, 0, 7);
        ctx.strokeStyle = `rgba(0,240,255,${.35 + .45 * hot})`; ctx.lineWidth = 1; ctx.stroke();
      });
    } else {
      ctx.fillStyle = '#4a6a8a'; ctx.textAlign = 'center'; ctx.font = '11px Consolas';
      ctx.fillText('NO RATINGS — commit one in SPRINT', CX, CY + 96);
    }

    /* drifting data motes */
    for (const m of motes) {
      m.a += m.s;
      const x = CX + Math.cos(m.a) * m.r * er, y = CY + Math.sin(m.a) * m.r * 0.92 * er;
      ctx.beginPath(); ctx.arc(x, y, m.sz, 0, 7);
      ctx.fillStyle = `hsla(${m.hue},100%,70%,${.1 + .2 * Math.abs(Math.sin(m.a * 3))})`;
      ctx.fill();
    }

    /* breathing nucleus rings around the core readout */
    ctx.save(); ctx.translate(CX, CY);
    ctx.rotate(t / 6000);
    ctx.strokeStyle = `rgba(0,240,255,${.5 + .4 * breath})`; ctx.lineWidth = 1.6;
    ctx.shadowColor = '#00f0ff'; ctx.shadowBlur = 14 * breath;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = ang(i % n);
      i ? ctx.lineTo(Math.cos(a) * 54, Math.sin(a) * 54) : ctx.moveTo(Math.cos(a) * 54, Math.sin(a) * 54);
    }
    ctx.closePath(); ctx.stroke();
    ctx.rotate(-t / 3200);
    ctx.setLineDash([4, 10]); ctx.strokeStyle = 'rgba(255,193,77,.5)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, 66, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
    /* dark disc so the readout stays legible */
    const cg = ctx.createRadialGradient(CX, CY, 0, CX, CY, 52);
    cg.addColorStop(0, 'rgba(2,6,12,.92)'); cg.addColorStop(1, 'rgba(2,6,12,0)');
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(CX, CY, 52, 0, 7); ctx.fill();

    radarRAF = requestAnimationFrame(draw);
  }
  radarRAF = requestAnimationFrame(draw);

  const leg = $('#radar-legend');
  if (leg) leg.innerHTML = cur ? DB.axes.map(a => `<span>${a} <b>${cur.values[a] ?? 0}</b></span>`).join('') : '';
  const wk = $('#radar-week');
  if (wk) wk.textContent = cur ? (cur.label || `WEEK ${cur.week}`) + ' · vs prior week (pink)' : '';
}

/* axis trajectory line chart */
function renderTrajectory() {
  const cv = $('#trajectory'); if (!cv) return;
  cv.width = cv.parentElement.clientWidth - 40;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height, pad = 24;
  ctx.clearRect(0, 0, W, H);
  const rs = DB.ratings;
  if (rs.length < 2) { ctx.fillStyle = '#4a6a8a'; ctx.fillText('need 2+ weekly ratings', 20, H / 2); return; }
  const colors = ['#00f0ff', '#ffc14d', '#ff2bd6', '#3dff8b', '#c8a2ff'];
  const x = i => pad + (W - 2 * pad) * i / (rs.length - 1);
  const y = v => H - pad - (H - 2 * pad) * v / 10;
  ctx.strokeStyle = 'rgba(74,106,138,.3)';
  [0, 5, 10].forEach(v => { ctx.beginPath(); ctx.moveTo(pad, y(v)); ctx.lineTo(W - pad, y(v)); ctx.stroke(); });
  DB.axes.forEach((a, ai) => {
    ctx.beginPath();
    rs.forEach((r, i) => { const py = y(r.values[a] ?? 0); i ? ctx.lineTo(x(i), py) : ctx.moveTo(x(i), py); });
    ctx.strokeStyle = colors[ai % colors.length]; ctx.lineWidth = 1.6;
    ctx.shadowColor = colors[ai % colors.length]; ctx.shadowBlur = 6;
    ctx.stroke(); ctx.shadowBlur = 0;
  });
  ctx.font = '9px Consolas'; ctx.fillStyle = '#4a6a8a';
  rs.forEach((r, i) => ctx.fillText('W' + (r.week ?? i), x(i) - 6, H - 8));
  DB.axes.forEach((a, ai) => {
    ctx.fillStyle = colors[ai % colors.length];
    ctx.fillText(a, pad + ai * 95, 12);
  });
}

function renderStreaks() {
  const s = computeStreaks();
  $('#streaks').innerHTML = [
    ['OVERALL', s.overall], ['STUDY', s.study], ['TRAINING', s.train], ['CREATIVE', s.create], ['READING', s.read]
  ].map(([k, v]) =>
    `<div class="streak-item"><span>${k}</span><span class="fire">${v > 0 ? '🔥'.repeat(Math.min(v, 3)) : '·'} ${v}d</span></div>`
  ).join('') + `<div class="streak-item"><span>COMBO</span><span class="fire">×${comboMultiplier().toFixed(2)}</span></div>`;
}

function renderLeetCode() {
  const lc = DB.leetcode; if (!lc) return;
  $('#lc-stats').innerHTML = `
    <span class="big">${lc.total}</span> SOLVED<br>
    <span class="easy">E ${lc.easy}</span> · <span class="med">M ${lc.medium}</span> · <span class="hard">H ${lc.hard}</span><br>
    LC STREAK ${lc.streak}d · ACTIVE ${lc.activeDays}d<br>
    <small style="color:var(--dim)">synced ${lc.fetchedAt.slice(0, 16).replace('T', ' ')}</small>`;
}

async function refreshLeetCode(username, silent) {
  try {
    DB.leetcode = await window.dexter.fetchLeetCode(username);
    renderLeetCode(); checkAchievements();
    if (!silent) say(`LeetCode synced. ${DB.leetcode.total} problems solved.`);
  } catch { if (!silent) { sfx.error(); say('LeetCode uplink failed. Check the username or connection.'); } }
}

function logLine(tag, date, text, xp) {
  return `<div class="log-item"><span class="date">${fmt(date)}</span><span class="tag">${tag}</span><span>${text}</span>${xp ? `<span class="xp-badge">+${xp}</span>` : ''}</div>`;
}
function renderLogs() {
  const recent = [
    ...DB.dailyLogs.map(l => ({ d: l.date, tag: l.axis, text: `${l.activity}${l.minutes ? ` (${l.minutes}m)` : ''}` })),
    ...DB.workouts.map(w => ({ d: w.date, tag: 'TRAINING', text: w.title })),
    ...DB.creative.map(c => ({ d: c.date, tag: c.type.toUpperCase(), text: `${c.title} (${c.hours}h)` })),
    ...DB.reading.flatMap(b => b.sessions.map(s => ({ d: s.date, tag: 'READING', text: `${b.title} — ${s.pages}p` })))
  ].sort((a, b) => b.d.localeCompare(a.d)).slice(0, 24);
  $('#recent-logs').innerHTML = recent.map(r => logLine(r.tag, r.d, r.text)).join('') || '<div class="log-item">no signals yet — Dexter awaits input</div>';
  $('#placement-logs').innerHTML = [...DB.dailyLogs].reverse().slice(0, 40)
    .map(l => logLine(l.axis, l.date, `${l.activity}${l.minutes ? ` (${l.minutes}m)` : ''}${l.notes ? ` — <span style="color:var(--dim)">${l.notes}</span>` : ''}`)).join('') || 'no sessions logged';
  $('#workout-logs').innerHTML = [...DB.workouts].reverse().slice(0, 40)
    .map(w => logLine('▲' + (w.effort ? ' E' + w.effort : ''), w.date, `${w.title}<br><small style="color:var(--dim)">${(w.exercises || []).join(' · ')}</small>`)).join('') || 'no sessions logged';
  $('#creative-logs').innerHTML = [...DB.creative].reverse().slice(0, 40)
    .map(c => logLine(c.type.toUpperCase(), c.date, `${c.title} (${c.hours}h)`)).join('') || 'no output logged';
}

function renderAxisSelect() {
  $('#form-daily [name=axis]').innerHTML = DB.axes.map(a => `<option>${a}</option>`).join('');
}
function renderRatingForm() {
  const cur = DB.ratings[DB.ratings.length - 1];
  $('#form-rating').innerHTML = DB.axes.map(a => `
    <div class="rating-row">
      <span>${a}</span>
      <input type="range" min="0" max="10" step="0.5" name="${a}" value="${cur ? (cur.values[a] ?? 5) : 5}"
        oninput="this.parentElement.querySelector('.rv').textContent=this.value" />
      <span class="rv">${cur ? (cur.values[a] ?? 5) : 5}</span>
    </div>`).join('') + '<button type="submit" class="btn">COMMIT WEEKLY RATING</button>';
}

function renderSkillTree() {
  const counts = {};
  DB.workouts.forEach(w => (w.exercises || []).forEach(e => {
    const el = e.toLowerCase();
    if (/hspu|handstand/.test(el)) counts.hspu = (counts.hspu || 0) + 1;
    if (/front lever|dragon/.test(el)) counts.fl = (counts.fl || 0) + 1;
    if (/planche/.test(el)) counts.tp = (counts.tp || 0) + 1;
    if (/dip/.test(el)) counts.dips = (counts.dips || 0) + 1;
    if (/pull/.test(el)) counts.pull = (counts.pull || 0) + 1;
    if (/pseudo/.test(el)) counts.pseudo = (counts.pseudo || 0) + 1;
  }));
  $('#skill-tree').innerHTML = [
    ['S1 · HANDSTAND PUSHUPS', counts.hspu], ['S2 · FRONT LEVER', counts.fl], ['S3 · TUCK PLANCHE', counts.tp],
    ['E1 · WEIGHTED DIPS', counts.dips], ['E2 · WEIGHTED PULLUPS', counts.pull], ['E3 · PSEUDO PUSHUPS', counts.pseudo]
  ].map(([n, c]) => `<div class="skill"><span>${n}</span><span class="count">${c || 0} sessions</span></div>`).join('');
}

function renderQuests() {
  const done = DB.game.questLog[today()] || [];
  const html = todaysQuests().map(q => {
    const d = done.includes(q.id);
    return `<div class="quest ${d ? 'done' : ''}" data-qid="${q.id}" title="${d ? 'click to un-tick' : 'click to mark complete'}"><span class="q-check">${d ? '◆' : '◇'}</span><span>${q.name}</span><span class="q-xp">+25 XP</span></div>`;
  }).join('');
  $('#quest-list').innerHTML = html;
  $('#dash-quests').innerHTML = html;
  $$('#quest-list .quest, #dash-quests .quest').forEach(el =>
    el.addEventListener('click', () => toggleQuest(el.dataset.qid)));
}

function toggleQuest(id) {
  const key = today();
  DB.game.questLog[key] = DB.game.questLog[key] || [];
  const done = DB.game.questLog[key];
  if (done.includes(id)) {
    // un-tick: take back the quest XP so ticking isn't farmable
    DB.game.questLog[key] = done.filter(x => x !== id);
    DB.game.xp = Math.max(0, DB.game.xp - 25);
    sfx.blip();
    toast('ach', '⬡ QUEST UNTICKED', '-25 XP');
  } else {
    done.push(id);
    DB.game.xp += 25;
    sfx.quest();
    PF.burst(innerWidth / 2, innerHeight / 2, '#ffc14d', 30);
    const q = todaysQuests().find(q => q.id === id);
    toast('quest', '⬡ QUEST COMPLETE', (q ? q.name : id) + ' · +25 XP');
  }
  save(); renderQuests(); renderHud(true); checkAchievements();
}

function renderAchievements() {
  $('#achievement-list').innerHTML = ACHIEVEMENTS.map(a => {
    const u = DB.game.achievements.includes(a.id);
    return `<div class="ach ${u ? 'unlocked' : ''}"><span class="a-icon">${a.icon}</span><div><div class="a-name">${a.name}</div><div class="a-desc">${a.desc}</div></div></div>`;
  }).join('');
}

/* ============ READING ============ */
function addBook(title, author, totalPages) {
  DB.reading.forEach(b => { if (b.status === 'reading') b.status = 'paused'; });
  DB.reading.push({ id: Date.now().toString(36), title, author, totalPages, currentPage: 0, status: 'reading', startedAt: today(), sessions: [] });
  save(); renderBooks(); renderAll();
}
function logReading(bookId, pages, minutes) {
  const b = DB.reading.find(b => b.id === bookId); if (!b) return;
  b.sessions.push({ date: today(), pages, minutes });
  b.currentPage = Math.min(b.totalPages, b.currentPage + pages);
  if (b.currentPage >= b.totalPages) { b.status = 'finished'; b.finishedAt = today(); toast('ach', '❐ BOOK COMPLETE', b.title); }
  save(); renderAll();
  grantXp(pages, `read ${pages} pages`);
}
function progressLine(b) { return `${b.currentPage} of ${b.totalPages} pages — ${Math.round(100 * b.currentPage / b.totalPages)} percent.`; }
function renderBooks() {
  $('#form-read-session [name=bookId]').innerHTML =
    DB.reading.filter(b => b.status !== 'finished').map(b => `<option value="${b.id}">${b.title}</option>`).join('');
  $('#bookshelf').innerHTML = [...DB.reading].reverse().map(b => {
    const pct = Math.round(100 * b.currentPage / b.totalPages);
    return `<div class="book">
      <div class="book-title">${b.title} ${b.status === 'finished' ? '◆ COMPLETE' : b.status === 'reading' ? '· ACTIVE' : '· PAUSED'}</div>
      <div class="book-meta">${b.author || 'unknown'} · ${b.currentPage}/${b.totalPages}p · ${pct}%</div>
      <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
    </div>`;
  }).join('') || 'vault empty — add a book';
}

/* ============ NOTION SYNC ============ */
async function notionPushToday() {
  const tk = DB.settings.notionToken;
  if (!tk) { say('No Notion token configured. Add it in system config.'); switchView('settings'); return; }
  const logs = DB.dailyLogs.filter(l => l.date === today() && !l._pushed);
  if (!logs.length) { say('Nothing new to push today.'); return; }
  let ok = 0;
  for (const l of logs) {
    try {
      await window.dexter.notionPush(tk, DB.settings.notionDailyLogDb, {
        'Session': { title: [{ text: { content: l.activity.slice(0, 100) } }] },
        'Date': { date: { start: l.date } },
        'Axis': { multi_select: [{ name: l.axis }] },
        'Duration (min)': { number: l.minutes || 0 },
        'Output': { rich_text: [{ text: { content: l.activity } }] },
        'Observation': { rich_text: [{ text: { content: l.notes || '' } }] }
      });
      l._pushed = true; ok++;
    } catch (e) { console.error(e); }
  }
  await save();
  $('#notion-status').textContent = `pushed ${ok}/${logs.length} entries`;
  say(ok ? `Pushed ${ok} entries to your Notion Daily Log.` : 'Push failed. Check the token and page sharing.');
}

async function notionPullRatings() {
  const tk = DB.settings.notionToken;
  if (!tk) { say('No Notion token configured.'); return; }
  try {
    const rows = await window.dexter.notionPull(tk, DB.settings.notionRatingsDb);
    let added = 0;
    for (const r of rows) {
      const date = r['Week Ending'] || r._created.slice(0, 10);
      if (DB.ratings.some(x => x.date === date)) continue;
      const values = {};
      DB.axes.forEach(a => { if (typeof r[a] === 'number') values[a] = r[a]; });
      if (Object.keys(values).length < 3 || Object.values(values).every(v => !v)) continue;
      DB.ratings.push({ week: DB.ratings.length, label: r.Week || 'Imported', date, values });
      added++;
    }
    DB.ratings.sort((a, b) => a.date.localeCompare(b.date));
    await save(); renderAll();
    $('#notion-status').textContent = `pulled ${rows.length} rows, ${added} new ratings`;
    say(added ? `Pulled ${added} new weekly ratings from Notion.` : 'Already up to date with Notion.');
  } catch (e) {
    $('#notion-status').textContent = 'pull failed: ' + e.message;
    sfx.error(); say('Notion pull failed. Check the token and that the databases are shared with the integration.');
  }
}

/* ============ DICTATION (Dexter Dictate sidecar) ============ */
function initDictate() {
  window.dexter.onDictate(msg => {
    if (msg.type === 'ready') {
      toast('xp', '⌨ DICTATE ONLINE', `${msg.hotkeys.toggle} to speak into any app · ${msg.hotkeys.pasteLast} repaste · ${msg.hotkeys.history} history`);
    } else if (msg.type === 'rec-start') {
      sfx.wake();
      toast('xp', '⌨ DICTATING…', 'speak — stops after 3s silence or hotkey again');
    } else if (msg.type === 'transcript' && msg.clean) {
      toast('xp', '⌨ PASTED', msg.clean.slice(0, 90) + (msg.clean.length > 90 ? '…' : ''));
    } else if (msg.type === 'mode') {
      toast('xp', msg.code ? '⌨ CODE MODE ON' : '⌨ CODE MODE OFF', msg.code ? 'verbatim — no cleanup, no auto-punctuation' : 'cleanup pass restored');
    } else if (msg.type === 'error') {
      toast('ach', '⌨ DICTATE ERROR', msg.text.slice(0, 120));
    }
  });
  if (DB.settings.dictate !== false) window.dexter.dictateStart();
}

/* ============ VIEWS ============ */
let currentView = 'dashboard';
function switchView(v) {
  if (v === currentView) return;
  sfx.nav();
  const out = $('#view-' + currentView);
  out.classList.add('leaving');
  const hues = { dashboard: 187, placement: 187, training: 35, creative: 315, reading: 145, quests: 45, settings: 210 };
  PF.setHue(hues[v] ?? 187);
  setTimeout(() => {
    out.classList.remove('active', 'leaving');
    const inn = $('#view-' + v);
    inn.classList.add('active');
    inn.querySelectorAll('.panel').forEach((p, i) => p.style.animationDelay = (i * 70) + 'ms');
    currentView = v;
    if (v === 'placement') renderTrajectory();
  }, 210);
  $$('.dock-btn').forEach(b => b.classList.toggle('active', b.dataset.view === v));
}

/* ============ SETTINGS ============ */
function renderSettings() {
  const f = $('#form-settings');
  f.leetcodeUsername.value = DB.settings.leetcodeUsername || '';
  f.autostart.checked = DB.settings.autostart !== false;
  f.tts.checked = DB.settings.tts !== false;
  f.dictate.checked = DB.settings.dictate !== false;
  f.anthropicKey.value = DB.settings.anthropicKey || '';
  f.geminiKey.value = DB.settings.geminiKey || '';
  $('#form-notion').notionToken.value = DB.settings.notionToken || '';
}

/* ============ WIRING ============ */
/* ---- dock: magnification + auto-sleep ---- */
$$('.dock-btn').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));
addEventListener('mouseover', e => { if (e.target.closest('.dock-btn,.btn,.quest')) sfx.blip(); });

const dock = $('#dock');
let dockSleepTimer = null;
let lastMouseY = 0;
function wakeDock() {
  dock.classList.remove('sleep');
  clearTimeout(dockSleepTimer);
  dockSleepTimer = setTimeout(trySleepDock, 3500);
}
function trySleepDock() {
  // never drop the dock onto a cursor parked in the bottom zone — that's the vibration loop
  if (lastMouseY > innerHeight - 220 || dock.matches(':hover')) {
    dockSleepTimer = setTimeout(trySleepDock, 1500);
    return;
  }
  dock.classList.add('sleep');
}
dock.addEventListener('mouseenter', wakeDock);
wakeDock();
addEventListener('mousemove', e => {
  lastMouseY = e.clientY;
  const rect = dock.getBoundingClientRect();
  if (e.clientY > innerHeight - 220) wakeDock();
  // fisheye only while the cursor is actually over the dock — hovering the
  // command bar below must not disturb it
  const overDock = e.clientX > rect.left - 16 && e.clientX < rect.right + 16 &&
                   e.clientY > rect.top - 24 && e.clientY < rect.bottom + 4;
  $$('.dock-btn').forEach(b => {
    if (!overDock) { b.style.setProperty('--mag', '1'); return; }
    // layout position (offsetLeft) is immune to the scale transform — stable math
    const bx = rect.left + b.offsetLeft + b.offsetWidth / 2;
    const d = Math.abs(e.clientX - bx);
    const mag = d < 140 ? 1 + 0.4 * Math.pow(1 - d / 140, 2) : 1;
    b.style.setProperty('--mag', mag.toFixed(3));
  });
});
addEventListener('keydown', e => {
  if (e.ctrlKey && e.key >= '1' && e.key <= '8') {
    const views = ['dashboard', 'placement', 'training', 'creative', 'reading', 'quests', 'settings', 'missions'];
    switchView(views[+e.key - 1]); wakeDock();
  }
});

$('#cmd').addEventListener('keydown', e => {
  if (e.key === 'Enter') { handleCommand(e.target.value); e.target.value = ''; }
});

$('#form-daily').addEventListener('submit', e => {
  e.preventDefault(); const f = e.target;
  DB.dailyLogs.push({ date: today(), axis: f.axis.value, activity: f.activity.value, minutes: +f.minutes.value, notes: f.notes.value });
  save(); renderAll(); f.reset(); sfx.confirm();
  grantXp(20 + Math.floor(+f.minutes.value / 3), `${f.axis.value} session`);
  say(`Session logged under ${f.axis.value}.`);
});

$('#form-rating').addEventListener('submit', e => {
  e.preventDefault();
  const values = {};
  DB.axes.forEach(a => values[a] = +e.target[a].value);
  DB.ratings.push({ week: (DB.ratings[DB.ratings.length - 1]?.week ?? -1) + 1, label: `Week ${(DB.ratings[DB.ratings.length - 1]?.week ?? -1) + 1}`, date: today(), values });
  save(); renderAll(); sfx.confirm();
  grantXp(50, 'weekly pentagon rating');
  say('Weekly rating committed. Pentagon redrawn.');
});

$('#form-workout').addEventListener('submit', e => {
  e.preventDefault(); const f = e.target;
  DB.workouts.push({
    date: today(), title: f.title.value,
    exercises: f.exercises.value.split('\n').map(s => s.trim()).filter(Boolean),
    notes: f.notes.value, effort: +f.effort.value
  });
  save(); renderAll(); f.reset(); sfx.confirm();
  grantXp(40, 'workout session');
  say('Workout committed. The forge remembers.');
});

$('#form-creative').addEventListener('submit', e => {
  e.preventDefault(); const f = e.target;
  DB.creative.push({ date: today(), type: f.type.value, title: f.title.value, hours: +f.hours.value, notes: f.notes.value });
  save(); renderAll(); f.reset(); sfx.confirm();
  grantXp(Math.round(+f.hours.value * 20), 'creative output');
  say('Creative output logged.');
});

$('#form-book').addEventListener('submit', e => {
  e.preventDefault(); const f = e.target;
  addBook(f.title.value, f.author.value, +f.totalPages.value);
  f.reset(); sfx.confirm();
  say('Book added to the vault.');
});

$('#form-read-session').addEventListener('submit', e => {
  e.preventDefault(); const f = e.target;
  logReading(f.bookId.value, +f.pages.value, +(f.minutes.value || 0));
  f.reset(); sfx.confirm();
});

$('#form-settings').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target;
  DB.settings.leetcodeUsername = f.leetcodeUsername.value.trim();
  DB.settings.anthropicKey = f.anthropicKey.value.trim();
  DB.settings.geminiKey = f.geminiKey.value.trim();
  DB.settings.tts = f.tts.checked; ttsEnabled = f.tts.checked;
  if (f.dictate.checked !== (DB.settings.dictate !== false)) {
    DB.settings.dictate = f.dictate.checked;
    if (f.dictate.checked) window.dexter.dictateStart(); else window.dexter.dictateStop();
  }
  await window.dexter.setAutostart(f.autostart.checked);
  DB.settings.autostart = f.autostart.checked;
  await save(); sfx.confirm();
  say('Configuration saved.');
  if (DB.settings.leetcodeUsername) refreshLeetCode(DB.settings.leetcodeUsername);
});

$('#form-notion').addEventListener('submit', async e => {
  e.preventDefault();
  DB.settings.notionToken = e.target.notionToken.value.trim();
  await save(); sfx.confirm();
  say('Notion token stored locally.');
});
$('#btn-notion-pull').addEventListener('click', () => { DB.settings.notionToken = $('#form-notion').notionToken.value.trim(); notionPullRatings(); });
$('#btn-notion-push').addEventListener('click', () => { DB.settings.notionToken = $('#form-notion').notionToken.value.trim(); notionPushToday(); });

setInterval(() => { $('#clock').textContent = new Date().toLocaleTimeString('en-GB'); }, 1000);

/* keep radar crisp on window / drawer resize */
let resizeTimer = null;
addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { renderRadar(); renderTrajectory(); }, 180);
});

/* ---- comms drawer toggle ---- */
$('#comms-toggle').addEventListener('click', () => {
  const c = $('#dexter-comms');
  if (c.classList.contains('collapsed')) { openComms(); $('#comms-toggle').textContent = '−'; }
  else { closeComms(); $('#comms-toggle').textContent = '+'; }
});
$('#dexter-comms').addEventListener('click', e => {
  if ($('#dexter-comms').classList.contains('collapsed') && !e.target.closest('#comms-toggle')) {
    openComms(); $('#comms-toggle').textContent = '−';
  }
});

/* ============ BOOT — BIG BANG ============ */
const BOOT_LINES = [
  ['> DEXTER KERNEL v2.0.0', ''],
  ['> mounting memory core ................ ', 'OK'],
  ['> pentagon matrix — 8 weeks loaded .... ', 'OK'],
  ['> forge systems — 6 sessions .......... ', 'OK'],
  ['> creative renderers .................. ', 'OK'],
  ['> vault index ......................... ', 'OK'],
  ['> game engine — XP ledger ............. ', 'OK'],
  ['> notion uplink ....................... ', 'STANDBY'],
  ['> voice interface (vosk) .............. ', 'SPAWNING'],
  ['> all systems nominal. igniting.', ''],
];

/* boot visual: minimal instrument startup — a pentagon draws itself, one calibration ring, nothing else */
function bigBang(done, isSkipped = () => false) {
  const cv = $('#bigbang'), ctx = cv.getContext('2d');
  cv.width = innerWidth; cv.height = innerHeight;
  const cx = cv.width / 2, cy = cv.height / 2;
  const PR = Math.min(cx, cy) * 0.42;
  const vert = i => -Math.PI / 2 + i * Math.PI * 2 / 5;
  const start = performance.now();
  let ending = null;

  (function anim(now) {
    const el = now - start;
    ctx.clearRect(0, 0, cv.width, cv.height);
    const fade = ending ? Math.max(0, 1 - (now - ending) / 700) : 1;
    ctx.globalAlpha = fade;

    /* calibration ring: thin circle with a single slow-sweeping arc highlight */
    const ringIn = Math.min(1, el / 900);
    ctx.strokeStyle = `rgba(0,240,255,${0.14 * ringIn})`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, PR * 1.35, 0, Math.PI * 2 * ringIn); ctx.stroke();
    if (ringIn === 1) {
      const sw = el / 2400;
      ctx.strokeStyle = 'rgba(0,240,255,.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, PR * 1.35, sw, sw + 0.5); ctx.stroke();
      /* four cardinal ticks */
      for (let d = 0; d < 4; d++) {
        const a = d * Math.PI / 2 + el / 9000;
        ctx.strokeStyle = 'rgba(0,240,255,.3)';
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * (PR * 1.35 - 5), cy + Math.sin(a) * (PR * 1.35 - 5));
        ctx.lineTo(cx + Math.cos(a) * (PR * 1.35 + 5), cy + Math.sin(a) * (PR * 1.35 + 5));
        ctx.stroke();
      }
    }

    /* pentagon draws itself, one clean pass */
    const traceP = Math.min(1, Math.max(0, (el - 500) / 1800));
    if (traceP > 0) {
      const prog = traceP * 5;
      ctx.strokeStyle = 'rgba(0,240,255,.85)';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = 'rgba(0,240,255,.6)'; ctx.shadowBlur = 10;
      for (let i = 0; i < 5; i++) {
        const f = Math.min(1, Math.max(0, prog - i));
        if (f <= 0) break;
        const x1 = cx + Math.cos(vert(i)) * PR, y1 = cy + Math.sin(vert(i)) * PR;
        const x2 = cx + Math.cos(vert(i + 1)) * PR, y2 = cy + Math.sin(vert(i + 1)) * PR;
        ctx.beginPath(); ctx.moveTo(x1, y1);
        ctx.lineTo(x1 + (x2 - x1) * f, y1 + (y2 - y1) * f); ctx.stroke();
      }
      ctx.shadowBlur = 0;
      /* vertex points appear once their edge is drawn */
      for (let i = 0; i < 5; i++) {
        if (prog >= i) {
          ctx.beginPath();
          ctx.arc(cx + Math.cos(vert(i)) * PR, cy + Math.sin(vert(i)) * PR, 2, 0, 7);
          ctx.fillStyle = 'rgba(176,251,255,.9)'; ctx.fill();
        }
      }
    }

    /* single soft center point, breathing gently */
    if (traceP >= 1) {
      const b = 0.5 + 0.5 * Math.sin(el / 700);
      ctx.beginPath(); ctx.arc(cx, cy, 2.5 + b, 0, 7);
      ctx.fillStyle = `rgba(0,240,255,${0.5 + 0.3 * b})`;
      ctx.shadowColor = '#00f0ff'; ctx.shadowBlur = 14 * b;
      ctx.fill(); ctx.shadowBlur = 0;
    }

    ctx.globalAlpha = 1;
    if (!ending && (el > 4900 || isSkipped())) ending = now;
    if (!ending || now - ending < 720) requestAnimationFrame(anim); else done();
  })(start);
}

async function boot() {
  DB = await window.dexter.readStore();
  // defensive: if the store came back suspiciously empty, retry once (observed "no data on startup")
  if (!(DB.ratings || []).length && !(DB.dailyLogs || []).length) {
    console.log('BOOT-WARN store empty on first read — retrying in 600ms');
    await new Promise(r => setTimeout(r, 600));
    DB = await window.dexter.readStore();
  }
  console.log(`BOOT-DB ratings=${(DB.ratings || []).length} logs=${(DB.dailyLogs || []).length} xp=${(DB.game || {}).xp} trackers=${DB.trackers ? 'yes' : 'MISSING'}`);
  ttsEnabled = DB.settings.tts !== false;
  const log = $('#boot-log');
  const bar = $('#boot-bar');
  const bootEl = $('#boot');
  let skipped = false;
  bootEl.addEventListener('click', () => { skipped = true; }, { once: true });
  const wait = ms => new Promise(r => {
    const t = setTimeout(r, ms);
    const iv = setInterval(() => { if (skipped) { clearTimeout(t); clearInterval(iv); r(); } }, 60);
    setTimeout(() => clearInterval(iv), ms + 80);
  });
  whoosh(1.4);
  bigBang(() => {}, () => skipped);

  /* typed kernel log with status codes */
  for (let i = 0; i < BOOT_LINES.length && !skipped; i++) {
    const [txt, status] = BOOT_LINES[i];
    const col = status === 'OK' ? 'var(--green)' : status === 'STANDBY' ? 'var(--amber)' : 'var(--magenta)';
    log.innerHTML += `<span>${txt}</span>${status ? `<span style="color:${col}">${status}</span>` : ''}\n`;
    if (bar) bar.style.width = Math.round(((i + 1) / BOOT_LINES.length) * 78) + '%';
    tone(600 + Math.random() * 600, 0.02, 'square', 0.015);
    await wait(i === 0 ? 420 : 210 + Math.random() * 140);
  }

  /* quiet title fade-in with two soft flickers */
  bootEl.classList.add('titled');
  const title = document.querySelector('#boot .boot-title');
  for (let f = 0; f < 4 && !skipped; f++) {
    title.style.opacity = f % 2 ? '1' : '0.35';
    await wait(90);
  }
  title.style.opacity = '1'; title.style.transform = 'none';
  if (bar) bar.style.width = '100%';
  if (!skipped) await wait(1500);

  $('#boot').classList.add('dying');
  setTimeout(() => $('#boot').classList.add('hidden'), 850);
  $('#app').classList.remove('hidden');
  renderAll();
  console.log('BOOT-RENDER-OK');
  Voice.init();
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const l = levelFromXp(DB.game.xp);
  say(`${greet}. All systems online. Level ${l.lvl} ${rankFor(l.lvl)}. How can I help you?`);
  if (DB.settings.leetcodeUsername) refreshLeetCode(DB.settings.leetcodeUsername, true);
  checkQuests(); checkAchievements();
  loadNews(true);
  initDictate();
  if (window.initExtras) initExtras();
  setInterval(() => loadNews(true), 60 * 60 * 1000); // refresh signal hourly
}

boot();
