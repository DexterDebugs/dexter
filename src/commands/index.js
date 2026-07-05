/* ============================================================
   DEXTER command registry (BUILD.md Phase 1.1)
   Loaded after app.js — uses its globals (DB, say, toast, grantXp…).
   Entry shape: { name, early?, test(t)=>match|null, run(match, t, raw) }
   `early: true` runs before the generic "open X" launcher intent.
   ============================================================ */

/* ---------- helpers ---------- */
function ensureSchema() {
  DB.missions = DB.missions || [];
  DB.snippets = DB.snippets || {};
  DB.focusBlocks = DB.focusBlocks || [];
  DB.integrations = DB.integrations || {};
  DB.integrations.calendar = DB.integrations.calendar || { icsUrl: '' };
  DB.integrations.github = DB.integrations.github || { token: '', repo: '' };
  DB.integrations.brain = DB.integrations.brain || { vaultPath: '', lastIndexed: '', chunks: 0 };
}

function axisFromText(text) {
  const t = text.toLowerCase();
  for (const a of DB.axes) if (t.includes(a.toLowerCase())) return a;
  if (/leetcode|dsa|problem/.test(t)) return 'DSA';
  if (/system design|sd sketch/.test(t)) return 'System Design';
  if (/comm|walkthrough|tmay|interview/.test(t)) return 'Communication';
  if (/os |dbms|network|cn |core/.test(t)) return 'Core CS';
  if (/build|ship|floodgate|bloodconnect|project/.test(t)) return 'Portfolio';
  return null;
}

let pendingConfirm = null; // {key, action} — Phase 1.5 destructive-action guard
function askConfirm(key, prompt, action) {
  pendingConfirm = { key, action };
  say(`${prompt} Say: confirm ${key}.`);
  setTimeout(() => { if (pendingConfirm && pendingConfirm.key === key) pendingConfirm = null; }, 30000);
}

/* ---------- MISSIONS (Phase 3) ---------- */
function createMission(titleRaw) {
  ensureSchema();
  let title = titleRaw.trim();
  let due = null;
  const dueMatch = title.match(/\s+due\s+(tomorrow|today|\d{4}-\d{2}-\d{2})$/i);
  if (dueMatch) {
    title = title.slice(0, dueMatch.index).trim();
    const d = new Date();
    if (/tomorrow/i.test(dueMatch[1])) d.setDate(d.getDate() + 1);
    due = /\d{4}/.test(dueMatch[1]) ? dueMatch[1] : d.toISOString().slice(0, 10);
  }
  const axis = axisFromText(title) || 'Portfolio';
  const m = {
    id: Date.now().toString(36), title, axis, status: 'open',
    due, priority: 2, externalId: null,
    created: new Date().toISOString(), completed: null
  };
  DB.missions.push(m);
  save(); renderMissions();
  say(`Mission logged: ${title}, filed under ${axis}${due ? ', due ' + due : ''}.`);
  return m;
}

function findMission(query) {
  const q = query.toLowerCase().trim();
  const open = DB.missions.filter(m => m.status !== 'done');
  return open.find(m => m.title.toLowerCase() === q)
    || open.find(m => m.title.toLowerCase().includes(q))
    || open.find(m => q.split(/\s+/).every(w => m.title.toLowerCase().includes(w)));
}

function completeMission(m) {
  m.status = 'done';
  m.completed = new Date().toISOString();
  save(); renderMissions();
  grantXp(30, `mission: ${m.title.slice(0, 40)}`);
  checkQuests();
  say(`Mission complete: ${m.title}. Thirty XP earned.`);
}

function missionsBrief() {
  ensureSchema();
  const open = DB.missions.filter(m => m.status === 'open' || m.status === 'doing');
  const blocked = DB.missions.filter(m => m.status === 'blocked');
  if (!open.length && !blocked.length) return 'No active missions. Create one with: create mission, then the title.';
  const parts = [];
  if (open.length) {
    const top = [...open].sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.priority - b.priority).slice(0, 3);
    parts.push(`${open.length} active. Top: ` + top.map(m => `${m.title}${m.due ? ' (due ' + m.due + ')' : ''}`).join('; '));
  }
  if (blocked.length) parts.push(`Blocked: ${blocked.map(m => m.title).join('; ')}.`);
  return parts.join(' ');
}

function renderMissions() {
  const el = $('#mission-list'); if (!el) return;
  ensureSchema();
  const order = { doing: 0, open: 1, blocked: 2, done: 3 };
  const ms = [...DB.missions].sort((a, b) =>
    order[a.status] - order[b.status] || (a.due || '9999').localeCompare(b.due || '9999'));
  el.innerHTML = ms.map(m => `
    <div class="mission s-${m.status}" data-id="${m.id}">
      <span class="m-status">${{ open: '◇', doing: '▶', blocked: '⛔', done: '◆' }[m.status]}</span>
      <span class="m-title">${m.title}</span>
      <span class="m-axis">${m.axis}</span>
      ${m.due ? `<span class="m-due ${m.due < today() && m.status !== 'done' ? 'overdue' : ''}">${m.due.slice(5)}</span>` : ''}
      <span class="m-actions">
        ${m.status !== 'done' ? `<button data-act="doing" title="start">▶</button><button data-act="done" title="complete">✔</button><button data-act="blocked" title="block">⛔</button>` : ''}
        <button data-act="del" title="delete">✖</button>
      </span>
    </div>`).join('') || '<div class="dim-note">no missions — create one below or say "create mission …"</div>';
  el.querySelectorAll('button').forEach(b => b.addEventListener('click', e => {
    const id = e.target.closest('.mission').dataset.id;
    const m = DB.missions.find(x => x.id === id); if (!m) return;
    const act = e.target.dataset.act;
    if (act === 'done') return completeMission(m);
    if (act === 'del') {
      DB.missions = DB.missions.filter(x => x.id !== id);
      save(); renderMissions(); sfx.confirm(); return;
    }
    m.status = act; save(); renderMissions(); sfx.blip();
  }));
  const sel = $('#form-mission [name=axis]');
  if (sel && !sel.options.length) sel.innerHTML = DB.axes.map(a => `<option>${a}</option>`).join('');
}
window.renderMissions = renderMissions;

/* ---------- FOCUS TIMER (Phase 5.2/5.3) ---------- */
const Focus = { timer: null, end: 0, label: '', mins: 0 };

function focusBadge() {
  let b = $('#focus-badge');
  if (!b) {
    b = document.createElement('div');
    b.id = 'focus-badge';
    document.body.appendChild(b);
    b.addEventListener('click', () => cancelFocus(true));
  }
  return b;
}

function startFocus(mins, label) {
  cancelFocus(false);
  Focus.end = Date.now() + mins * 60000;
  Focus.label = label; Focus.mins = mins;
  const b = focusBadge();
  b.classList.add('on');
  Focus.timer = setInterval(() => {
    const left = Focus.end - Date.now();
    if (left <= 0) return finishFocus();
    const m = Math.floor(left / 60000), s = Math.floor(left % 60000 / 1000);
    b.textContent = `◉ FOCUS ${m}:${String(s).padStart(2, '0')} — ${Focus.label} (click to abort)`;
  }, 500);
  sfx.confirm();
  say(`Focus block started: ${mins} minutes on ${label}. I'll log it when you're done.`);
}

function finishFocus() {
  const { mins, label } = Focus;
  cancelFocus(false);
  const axis = axisFromText(label) || 'DSA';
  DB.dailyLogs.push({ date: today(), axis, activity: `Focus block: ${label}`, minutes: mins, notes: 'auto-logged by focus timer' });
  DB.focusBlocks.push({ date: today(), label, minutes: mins });
  save(); renderAll();
  grantXp(20 + Math.floor(mins / 3), `${mins}-min focus block`);
  say(`Focus block complete. ${mins} minutes of ${label} logged under ${axis}. Well held.`);
}

function cancelFocus(announce) {
  if (Focus.timer) { clearInterval(Focus.timer); Focus.timer = null; }
  const b = $('#focus-badge'); if (b) { b.classList.remove('on'); b.textContent = ''; }
  if (announce) say('Focus block aborted. No log written.');
}

/* ---------- BRIEFING (Phase 5.4/5.5) ---------- */
async function briefing() {
  ensureSchema();
  const parts = [statusReport()];
  parts.push(missionsBrief());
  const ics = DB.integrations.calendar.icsUrl;
  if (ics) {
    try {
      const ev = await window.dexter.calToday(ics);
      if (ev.length) {
        parts.push(`Calendar: ${ev.slice(0, 4).map(e => `${e.time} ${e.title}`).join('; ')}.`);
        const now = new Date().toTimeString().slice(0, 5);
        const next = ev.find(e => e.time !== 'all-day' && e.time > now);
        if (next) {
          const gapMin = (parseInt(next.time) * 60 + parseInt(next.time.slice(3))) - (parseInt(now) * 60 + parseInt(now.slice(3)));
          if (gapMin >= 30) parts.push(`You have ${Math.floor(gapMin / 60)}h${gapMin % 60}m free before ${next.title} — enough for a ${gapMin >= 60 ? '50' : '25'} minute block.`);
        }
      } else parts.push('Calendar clear — good day for deep work.');
    } catch { parts.push('Calendar unreachable.'); }
  }
  say(parts.join(' '));
}

/* ---------- BRAIN (Phase 2.4/2.6) ---------- */
async function brainAsk(q) {
  showReply('…searching your notes');
  try {
    const res = await window.dexter.brainQuery(q, 5);
    if (res.type === 'error') return say(res.text.includes('no index') ? 'The brain has no index yet. Set a vault path in SYS and say: reindex brain.' : 'Brain error: ' + res.text);
    const chunks = res.chunks || [];
    if (!chunks.length) return say('Nothing in your notes matches that.');
    if (window.hasLlm && hasLlm()) {
      const ctx = chunks.map((c, i) => `[${i + 1}] (${c.source})\n${c.text}`).join('\n\n');
      const sys = `You are DEXTER. Answer the user's question using ONLY these excerpts from their personal notes. Cite sources like (source.md). Be concise (2-4 sentences). If the notes don't answer it, say so.\n\n${ctx}`;
      try {
        const ans = await llmAsk(sys, q);
        return say(ans + ` — from ${[...new Set(chunks.map(c => c.source))].slice(0, 2).join(', ')}`);
      } catch { /* fall through to raw chunk */ }
    }
    const top = chunks[0];
    say(`From ${top.source}: ${top.text.slice(0, 320).replace(/\s+/g, ' ')}`);
  } catch (e) { say('Brain query failed: ' + e.message); }
}

async function brainReindex() {
  ensureSchema();
  const vp = DB.integrations.brain.vaultPath;
  if (!vp) return say('No vault path set. Point me at your notes folder in SYS, module settings.');
  say('Indexing your vault. This may take a moment.');
  try {
    const res = await window.dexter.brainIndex(vp);
    if (res.type === 'error') return say('Index failed: ' + res.text);
    DB.integrations.brain.lastIndexed = new Date().toISOString();
    DB.integrations.brain.chunks = res.chunks;
    save();
    const st = $('#brain-status'); if (st) st.textContent = `${res.chunks} chunks indexed`;
    say(`Brain online. ${res.chunks} knowledge chunks indexed from your vault.`);
  } catch (e) { say('Index failed: ' + e.message); }
}

async function quizMe(topic) {
  try {
    const res = await window.dexter.brainQuery(topic, 6);
    const chunks = (res.chunks || []);
    if (!chunks.length) return say(`Your notes have nothing on ${topic}. Add notes and reindex.`);
    const c = chunks[Math.floor(Math.random() * Math.min(3, chunks.length))];
    if (window.hasLlm && hasLlm()) {
      try {
        const qn = await llmAsk('Generate ONE short oral quiz question from this note excerpt. Output only the question.', c.text);
        return say(`Quiz, from ${c.source}: ${qn} Answer out loud, then check your notes.`);
      } catch {}
    }
    const firstLine = c.text.split('\n')[0].slice(0, 120);
    say(`Quiz, from ${c.source}: your note says "${firstLine}". Explain this concept out loud, from memory, in 60 seconds.`);
  } catch (e) { say('Quiz failed: ' + e.message); }
}

/* ---------- CALCULATOR (Phase 4.5) ---------- */
function tryCalc(expr) {
  let e = ' ' + expr.toLowerCase() + ' ';
  e = e.replace(/\btimes\b|\bx\b|\bmultiplied by\b/g, '*')
       .replace(/\bplus\b/g, '+').replace(/\bminus\b/g, '-')
       .replace(/\bdivided by\b|\bover\b/g, '/')
       .replace(/\bpercent of\b/g, '/100*').replace(/,/g, '')
       .replace(/\bk\b/g, '*1000').replace(/\bmillion\b/g, '*1000000');
  e = e.trim();
  if (!/^[\d\s+\-*/().%]+$/.test(e) || !/\d/.test(e) || e.length > 80) return null;
  try {
    const v = Function('"use strict"; return (' + e + ')')();
    if (typeof v !== 'number' || !isFinite(v)) return null;
    return Math.round(v * 10000) / 10000;
  } catch { return null; }
}

/* ---------- SNIPPETS (Phase 1.4 / 4.3) ---------- */
function expandSnippet(text) {
  const now = new Date();
  return text
    .replace(/\{\{date\}\}/g, now.toISOString().slice(0, 10))
    .replace(/\{\{time\}\}/g, now.toTimeString().slice(0, 5))
    .replace(/\{\{day\}\}/g, now.toLocaleDateString('en-GB', { weekday: 'long' }));
}

/* ---------- REGISTRY ---------- */
window.COMMAND_REGISTRY = [
  /* --- confirm gate (must be first) --- */
  {
    name: 'confirm', early: true,
    test: t => t.match(/^confirm (.+)$/),
    run: m => {
      if (pendingConfirm && pendingConfirm.key === m[1].trim()) {
        const a = pendingConfirm.action; pendingConfirm = null; a();
      } else say('Nothing pending to confirm.');
    }
  },

  /* --- focus timer (early: must beat "start X" launcher) --- */
  {
    name: 'focus-start', early: true,
    test: t => t.match(/^start (?:a )?(\d{1,3})[ -]?min(?:ute)?s?(?: (.+?))?(?: (?:block|focus|timer|session))?$/),
    run: m => startFocus(parseInt(m[1]), (m[2] || 'deep work').trim())
  },
  {
    name: 'focus-stop', early: true,
    test: t => /^(stop|cancel|abort) (focus|timer|block)$/.test(t) ? [t] : null,
    run: () => cancelFocus(true)
  },
  {
    name: 'focus-done', early: true,
    test: t => /^(finish|complete) (focus|block|timer)( early)?$/.test(t) ? [t] : null,
    run: () => Focus.timer ? finishFocus() : say('No focus block running.')
  },

  /* --- missions (early: "start mission" must beat launcher) --- */
  {
    name: 'mission-create', early: true,
    test: t => t.match(/^(?:create|add|new) mission[,:]?\s+(.+)$/),
    run: m => createMission(m[1])
  },
  {
    name: 'mission-start', early: true,
    test: t => t.match(/^start mission[,:]?\s+(.+)$/),
    run: m => {
      const mi = findMission(m[1]);
      if (!mi) return say('No open mission matches that.');
      mi.status = 'doing'; save(); renderMissions();
      say(`Mission engaged: ${mi.title}.`);
    }
  },
  {
    name: 'mission-complete',
    test: t => t.match(/^(?:complete|finish|done|close) mission[,:]?\s+(.+)$/),
    run: m => {
      const mi = findMission(m[1]);
      mi ? completeMission(mi) : say('No open mission matches that.');
    }
  },
  {
    name: 'mission-block',
    test: t => t.match(/^block mission[,:]?\s+(.+)$/),
    run: m => {
      const mi = findMission(m[1]);
      if (!mi) return say('No open mission matches that.');
      mi.status = 'blocked'; save(); renderMissions();
      say(`${mi.title} marked blocked. Name the blocker in the OPS view when you can.`);
    }
  },
  {
    name: 'mission-list',
    test: t => /^(missions|list missions|show missions|what'?s blocking me|blockers)$/.test(t) ? [t] : null,
    run: (_m, t) => {
      switchView('missions');
      if (/blocking|blockers/.test(t)) {
        const blocked = DB.missions.filter(m => m.status === 'blocked');
        return say(blocked.length ? `Blocked: ${blocked.map(m => m.title).join('; ')}.` : 'Nothing is blocked. Clear runway.');
      }
      say(missionsBrief());
    }
  },

  /* --- trackers (T1 summary + T2 per-axis) --- */
  {
    name: 'trackers-status',
    test: t => /^(trackers?|tracker status|axis status)$/.test(t) ? [t] : null,
    run: () => say(trackersSummary())
  },
  {
    name: 'dsa-status', early: true,
    test: t => /^(dsa|leetcode) status$/.test(t) ? [t] : null,
    run: () => {
      const T = DB.trackers.dsa, lc = DB.leetcode;
      const next = T.topics.find(x => x.status === 'not_started') || T.topics.find(x => x.status === 'in_progress');
      const todayN = DB.dailyLogs.filter(l => l.date === today() && l.axis === 'DSA').length;
      switchView('placement'); renderTrackerPanel('dsa');
      say(`${lc ? lc.total + ' solved on LeetCode' : T.loggedProblemCount + ' problems logged'}. ${todayN ? todayN + ' sessions today.' : 'Nothing logged today.'} ${T.topics.filter(x => x.status === 'done').length} of ${T.topics.length} topics done. Next scope: ${next ? next.name : 'review'}.`);
    }
  },
  {
    name: 'dsa-gaps',
    test: t => /^what topics am i missing|missing topics$/.test(t) ? [t] : null,
    run: () => {
      const gaps = DB.trackers.dsa.topics.filter(x => x.status === 'not_started').map(x => x.name);
      say(gaps.length ? `Untouched: ${gaps.join(', ')}. Start with ${gaps[0]}.` : 'Every topic has been touched. Depth over breadth now.');
    }
  },
  {
    name: 'floodgate-status', early: true,
    test: t => /^floodgate status|what'?s left on floodgate$/.test(t) ? [t] : null,
    run: () => {
      const fg = DB.trackers.portfolio.projects.find(p => p.id === 'floodgate');
      const open = fg.milestones.filter(m => m.status === 'open' || m.status === 'planned');
      const blocked = fg.milestones.find(m => m.blocker);
      switchView('placement'); renderTrackerPanel('portfolio');
      say(`Floodgate: ${fg.milestones.filter(m => m.status.startsWith('done')).length} of ${fg.milestones.length} milestones shipped. ${blocked ? 'Blocker: ' + blocked.blocker + '.' : ''} Remaining: ${open.map(m => m.title).join('; ')}.`);
    }
  },
  {
    name: 'floodgate-sync', early: true,
    test: t => /^sync floodgate$/.test(t) ? [t] : null,
    run: () => {
      switchView('placement'); renderTrackerPanel('portfolio');
      setTimeout(() => { const b = $('#btn-fg-sync'); if (b) b.click(); }, 300);
    }
  },
  {
    name: 'corecs-status',
    test: t => /^core ?cs status$/.test(t) ? [t] : null,
    run: () => {
      const all = DB.trackers.corecs.subjects.flatMap(s => s.topics);
      const next = all.find(x => x.status === 'not_started');
      switchView('placement'); renderTrackerPanel('corecs');
      say(`Interview bank: ${all.filter(x => x.status === 'done').length} of ${all.length} topics documented. Next: ${next ? next.name : 'review pass'}.`);
    }
  },
  {
    name: 'sd-status',
    test: t => /^(system design|sd) status$/.test(t) ? [t] : null,
    run: () => {
      const T = DB.trackers.sysdesign;
      const done = T.fundamentals.filter(f => f.status === 'done').length;
      switchView('placement'); renderTrackerPanel('sysdesign');
      say(`System design: ${done} of ${T.fundamentals.length} fundamentals, ${T.reps.length} practice reps. Last rep: ${T.reps.length ? T.reps[T.reps.length - 1].prompt : 'none'}.`);
    }
  },
  {
    name: 'sd-mark-done',
    test: t => t.match(/^mark (.+?) (?:as )?done$/),
    run: m => {
      const q = m[1].toLowerCase();
      const f = DB.trackers.sysdesign.fundamentals.find(x => x.name.toLowerCase().includes(q) || x.id.includes(q.replace(/\s+/g, '-')));
      if (!f) return say(`No SD fundamental matches ${m[1]}.`);
      f.status = 'done'; save();
      if (activeTrackerTab === 'sysdesign') renderTrackerPanel();
      grantXp(15, `SD topic: ${f.name}`);
      say(`${f.name} marked done.`);
    }
  },
  {
    name: 'comms-status',
    test: t => /^communication status$/.test(t) ? [t] : null,
    run: () => {
      const T = DB.trackers.communication;
      switchView('placement'); renderTrackerPanel('comms');
      say(`${T.drills.filter(d => d.status === 'done').length} drills done. Floodgate walkthrough is still deferred — that's the priority rep.`);
    }
  },
  {
    name: 'blog-log', early: true,
    test: t => t.match(/^log blog[,:]?\s+(.+)$/),
    run: (m, _t, raw) => {
      const rawTitle = (raw.match(/^log blog[,:]?\s+(.+)$/i) || m)[1].trim();
      DB.trackers.blogs.entries.push({
        id: 'blog_' + Date.now().toString(36), title: rawTitle, url: null, source: '',
        dateRead: today(), axes: [], topics: [], takeaways: [], notionPageId: null, status: 'digested'
      });
      DB.dailyLogs.push({ date: today(), axis: 'DSA', activity: `Blog: ${rawTitle}`, minutes: 30, notes: 'via voice' });
      save(); renderAll();
      grantXp(15, 'blog digested');
      say(`${rawTitle} logged as digested. What was the one-sentence takeaway? Add it in the blogs tab.`);
    }
  },
  {
    name: 'practice-tmay', early: true,
    test: t => /^practice tmay|^tmay$/.test(t) ? [t] : null,
    run: () => {
      const tm = DB.trackers.communication.tmay;
      if (!tm) return say('No TMAY cached yet.');
      say(`Your locked version runs ${tm.timedSec} seconds. I'll read it — shadow me, then do it alone from memory. ${tm.text}`);
      switchView('placement'); renderTrackerPanel('comms');
    }
  },
  {
    name: 'notion-pull-trackers',
    test: t => /^pull (interview bank|communication|blogs|notion trackers)$/.test(t) ? t.match(/^pull (.+)$/) : null,
    run: m => {
      const what = m[1];
      if (/interview/.test(what)) return NotionSync.interviewBank();
      if (/comm/.test(what)) return NotionSync.communication();
      if (/blog/.test(what)) return NotionSync.blogs();
      NotionSync.interviewBank(); NotionSync.communication(); NotionSync.blogs();
    }
  },
  {
    name: 'blogs-week',
    test: t => /^(blogs this week|what blogs did i read)/.test(t) ? [t] : null,
    run: () => {
      const monday = new Date(); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
      const from = monday.toISOString().slice(0, 10);
      const wk = DB.trackers.blogs.entries.filter(b => b.dateRead && b.dateRead >= from);
      say(wk.length ? `This week: ${wk.map(b => b.title).join('; ')}.` : 'No blogs digested this week. The queue has ' + DB.trackers.blogs.entries.filter(b => b.status === 'queued').length + ' waiting.');
    }
  },

  /* --- briefing --- */
  {
    name: 'briefing',
    test: t => /^(morning )?brief(ing)?$|^good morning$/.test(t) ? [t] : null,
    run: () => briefing()
  },

  /* --- brain --- */
  {
    name: 'brain-ask', early: true,
    test: t => t.match(/^(?:ask brain|from my notes|search (?:my )?notes)[,:]?\s+(.+)$/),
    run: m => brainAsk(m[1])
  },
  {
    name: 'brain-reindex',
    test: t => /^(?:re)?index (?:brain|notes|vault)$/.test(t) ? [t] : null,
    run: () => brainReindex()
  },
  {
    name: 'quiz',
    test: t => t.match(/^quiz me(?: on)?[,:]?\s+(.+)$/),
    run: m => quizMe(m[1])
  },

  /* --- calculator (validates itself; falls through if not math) --- */
  {
    name: 'calc', early: true,
    test: t => {
      const m = t.match(/^(?:calc(?:ulate)?|compute|what is|what'?s)\s+(.+)$/);
      if (!m) return null;
      const v = tryCalc(m[1]);
      return v === null ? null : [t, v];
    },
    run: m => { say(`That's ${m[1]}.`); showReply(`= ${m[1]}`); }
  },

  /* --- clipboard ring --- */
  {
    name: 'clip-list',
    test: t => /^(clipboard|clip ring|show clipboard)$/.test(t) ? [t] : null,
    run: async () => {
      const ring = await window.dexter.clipRing();
      if (!ring.length) return say('Clipboard ring is empty.');
      showReply('CLIP RING:\n' + ring.slice(0, 8).map((c, i) => `${i + 1}. ${c.replace(/\s+/g, ' ').slice(0, 70)}`).join('\n'));
      say(`${ring.length} entries in the ring. Say: paste copy, then the number.`);
    }
  },
  {
    name: 'clip-paste',
    test: t => t.match(/^paste (?:last )?copy(?:\s+(\d{1,2}))?$/),
    run: async m => {
      const ring = await window.dexter.clipRing();
      const n = m[1] ? parseInt(m[1]) : 1;
      if (!ring[n - 1]) return say(`No entry ${n} in the ring.`);
      await window.dexter.clipCopy(ring[n - 1]);
      say(`Entry ${n} is on your clipboard. Control V to paste.`);
    }
  },

  /* --- snippets --- */
  {
    name: 'snippet-save', early: true,
    test: t => t.match(/^save snippet (\w[\w-]*)\s*[:\-]\s*(.+)$/),
    run: (m, _t, raw) => {
      ensureSchema();
      const rawMatch = raw.match(/^save snippet (\w[\w-]*)\s*[:\-]\s*([\s\S]+)$/i);
      DB.snippets[m[1].toLowerCase()] = rawMatch ? rawMatch[2] : m[2];
      save();
      say(`Snippet ${m[1]} saved. Say: copy snippet ${m[1]} to use it.`);
    }
  },
  {
    name: 'snippet-use',
    test: t => t.match(/^(?:paste|copy) snippet (\w[\w-]*)$/),
    run: async m => {
      ensureSchema();
      const s = DB.snippets[m[1].toLowerCase()];
      if (!s) return say(`No snippet named ${m[1]}. Saved: ${Object.keys(DB.snippets).join(', ') || 'none'}.`);
      await window.dexter.clipCopy(expandSnippet(s));
      say(`Snippet ${m[1]} is on your clipboard.`);
    }
  },
  {
    name: 'snippet-list',
    test: t => /^snippets$/.test(t) ? [t] : null,
    run: () => {
      ensureSchema();
      const names = Object.keys(DB.snippets);
      say(names.length ? `Snippets: ${names.join(', ')}.` : 'No snippets yet. Say: save snippet name, colon, then the text.');
    }
  },
  {
    name: 'snippet-delete',
    test: t => t.match(/^delete snippet (\w[\w-]*)$/),
    run: m => {
      const name = m[1].toLowerCase();
      if (!DB.snippets[name]) return say(`No snippet named ${name}.`);
      askConfirm(`delete snippet ${name}`, `This permanently deletes snippet ${name}.`, () => {
        delete DB.snippets[name]; save(); say(`Snippet ${name} deleted.`);
      });
    }
  },

  /* --- context (visual memory) --- */
  {
    name: 'context-lookup',
    test: t => t.match(/^what was i doing (?:at|around) (.+)$/),
    run: async m => {
      let ts = m[1].trim().replace(/\./g, ':');
      const ampm = ts.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
      if (!ampm) return say('Give me a time like: 3pm, or 15:30.');
      let h = parseInt(ampm[1]);
      if (ampm[3] === 'pm' && h < 12) h += 12;
      if (ampm[3] === 'am' && h === 12) h = 0;
      const hhmm = String(h).padStart(2, '0') + ':' + (ampm[2] || '00');
      const hit = await window.dexter.contextLookup(hhmm);
      if (!hit) return say(DB.settings.contextLog ? `No activity logged near ${hhmm} today.` : 'Context logging is off. Enable it in SYS, modules panel.');
      say(`At ${hit.ts.slice(11, 16)} you were in ${hit.exe || 'an app'}: ${hit.title.slice(0, 80)}.`);
    }
  },
  {
    name: 'context-clear',
    test: t => /^clear context history$/.test(t) ? [t] : null,
    run: () => askConfirm('clear context', 'This deletes all window-activity history.', async () => {
      await window.dexter.contextClear();
      say('Context history wiped.');
    })
  }
];

/* ---------- boot-time wiring (called from app.js boot) ---------- */
window.initExtras = function initExtras() {
  ensureSchema();
  // TRACKERS.md T1.2 — one-time derive tracker state from existing logs
  if (window.bootstrapTrackers && bootstrapTrackers()) {
    toast('xp', '⬡ TRACKERS ONLINE', 'axis trackers bootstrapped from your sprint history');
  }
  renderMissions();

  /* mission form */
  const fm = $('#form-mission');
  if (fm) fm.addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    DB.missions.push({
      id: Date.now().toString(36), title: f.title.value.trim(), axis: f.axis.value,
      status: 'open', due: f.due.value || null, priority: +f.priority.value,
      externalId: null, created: new Date().toISOString(), completed: null
    });
    save(); renderMissions(); f.reset(); sfx.confirm();
    say('Mission logged.');
  });

  /* modules form (brain vault, calendar, github, context) */
  const fmod = $('#form-modules');
  if (fmod) {
    fmod.vaultPath.value = DB.integrations.brain.vaultPath || '';
    fmod.icsUrl.value = DB.integrations.calendar.icsUrl || '';
    fmod.ghRepo.value = DB.integrations.github.repo || '';
    fmod.ghToken.value = DB.integrations.github.token || '';
    fmod.contextLog.checked = !!DB.settings.contextLog;
    const st = $('#brain-status');
    if (st && DB.integrations.brain.chunks) st.textContent = `${DB.integrations.brain.chunks} chunks · indexed ${(DB.integrations.brain.lastIndexed || '').slice(0, 10)}`;
    fmod.addEventListener('submit', async e => {
      e.preventDefault();
      DB.integrations.brain.vaultPath = fmod.vaultPath.value.trim();
      DB.integrations.calendar.icsUrl = fmod.icsUrl.value.trim();
      DB.integrations.github.repo = fmod.ghRepo.value.trim();
      DB.integrations.github.token = fmod.ghToken.value.trim();
      const ctxOn = fmod.contextLog.checked;
      if (ctxOn !== !!DB.settings.contextLog) {
        DB.settings.contextLog = ctxOn;
        if (ctxOn) await window.dexter.contextStart(); else await window.dexter.contextStop();
      }
      await save(); sfx.confirm();
      say('Module configuration saved.');
    });
    const rb = $('#btn-reindex');
    if (rb) rb.addEventListener('click', () => {
      DB.integrations.brain.vaultPath = fmod.vaultPath.value.trim();
      brainReindex();
    });
  }

  /* global palette hotkey landing */
  window.dexter.onPalette(() => {
    const c = $('#cmd');
    if (c) { c.focus(); c.select(); }
    sfx.wake();
  });

  /* GitHub CI sentinel events */
  window.dexter.onGhci(msg => {
    const good = msg.conclusion === 'success';
    toast(good ? 'xp' : 'ach', good ? '✔ CI GREEN' : '✖ CI RED', `${msg.name} on ${msg.branch}: ${msg.conclusion}`);
    say(good ? `Build passed on ${msg.branch}.` : `Build failed on ${msg.branch}. ${msg.name} reports ${msg.conclusion}.`);
  });

  /* LeetCode daily reminder (Phase 7.2) — evening nudge if no DSA today */
  let remindedOn = null;
  setInterval(() => {
    const now = new Date();
    if (now.getHours() < 20 || remindedOn === today()) return;
    const dsaToday = DB.dailyLogs.some(l => l.date === today() && l.axis === 'DSA');
    if (!dsaToday) {
      remindedOn = today();
      toast('ach', '⌬ DSA REMINDER', 'No DSA logged today — the streak is at stake');
      say("Heads up: you haven't logged DSA today. Even two problems keeps the streak alive.");
    }
  }, 30 * 60 * 1000);
};
