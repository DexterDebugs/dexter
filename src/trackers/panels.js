/* ============================================================
   TRACKER PANELS (TRACKERS.md Phase T2) — sprint axis sub-tabs
   Loaded after trackers/shared.js; uses app.js globals.
   ============================================================ */
let activeTrackerTab = 'overview';

function weekDsaCount() {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const from = monday.toISOString().slice(0, 10);
  return (DB.dailyLogs || []).filter(l => l.axis === 'DSA' && l.date >= from)
    .reduce((s, l) => {
      const m = (l.activity || '').match(/(\d+)\s*(?:leetcode\s*)?problems?/i);
      return s + (m ? parseInt(m[1]) : 1);
    }, 0);
}

function cycleStatus(cur, states) {
  return states[(states.indexOf(cur) + 1) % states.length];
}

/* ---------- panel renderers ---------- */
const TrackerPanels = {

  dsa() {
    const T = DB.trackers.dsa;
    const lc = DB.leetcode;
    const doneT = T.topics.filter(t => t.status === 'done').length;
    const week = weekDsaCount();
    const next = T.topics.filter(t => t.status === 'not_started')[0]
      || T.topics.filter(t => t.status === 'in_progress')[0];
    return `
      <div class="grid two-col">
        <div class="panel">
          <div class="panel-head">DSA UPLINK ${trackerTodayChip('DSA')}</div>
          <div class="t-hero">
            ${trackerRing(100 * doneT / T.topics.length, 'TOPICS', 84)}
            <div class="t-hero-stats">
              <div class="t-big">${lc ? lc.total : T.loggedProblemCount}<small> solved${lc ? '' : ' (logged)'}</small></div>
              ${lc ? `<div class="t-line"><span class="easy">E ${lc.easy}</span> · <span class="med">M ${lc.medium}</span> · <span class="hard">H ${lc.hard}</span> · streak ${lc.streak}d</div>` : '<div class="t-line dim-note">sync leetcode for live totals</div>'}
              <div class="t-line">WEEK: <b class="${week >= T.weekTarget ? 'ok' : ''}">${week} / ${T.weekTarget}</b> target</div>
              <div class="t-line">NEXT SCOPE: <b>${next ? next.name : 'all topics touched'}</b></div>
            </div>
          </div>
          <button class="btn" onclick="refreshLeetCode(DB.settings.leetcodeUsername).then(()=>renderTrackerPanel())">⇣ SYNC LEETCODE</button>
        </div>
        <div class="panel">
          <div class="panel-head">TOPIC MATRIX <span class="xp-hint">click to cycle status</span></div>
          ${trackerMatrix(T.topics, true)}
        </div>
        <div class="panel span2">
          <div class="panel-head">DSA SESSION LOG</div>
          <div class="log-list tall">${(DB.dailyLogs || []).filter(l => l.axis === 'DSA').reverse().slice(0, 25)
            .map(l => logLine('DSA', l.date, `${l.activity}${l.minutes ? ` (${l.minutes}m)` : ''}`)).join('') || 'no sessions'}</div>
        </div>
      </div>`;
  },

  portfolio() {
    const fg = DB.trackers.portfolio.projects.find(p => p.id === 'floodgate');
    const done = fg.milestones.filter(m => m.status.startsWith('done')).length;
    const glyph = { done: '✓', done_untagged: '⚠', open: '○', planned: '◌' };
    const next = fg.milestones.filter(m => m.status === 'open').sort((a, b) => (a.priority || 9) - (b.priority || 9))[0];
    const gh = fg.github || {};
    return `
      <div class="grid two-col">
        <div class="panel">
          <div class="panel-head">FLOODGATE ${trackerTodayChip('Portfolio')}</div>
          <div class="t-hero">
            ${trackerRing(100 * done / fg.milestones.length, 'SHIPPED', 84)}
            <div class="t-hero-stats">
              <div class="t-line">TAGS: ${gh.tags ? gh.tags.join(' · ') : (fg.milestones.find(m => m.tag) ? 'v1.0.0 (from log)' : '—')}
                ${gh.tags && !gh.tags.some(t => /^v?2/.test(t)) ? '<span class="warn">· v2.0.0 missing</span>' : ''}</div>
              <div class="t-line">LAST COMMIT: ${gh.lastCommit ? `${gh.lastCommit.msg} <small>(${gh.lastCommit.date.slice(0, 10)})</small>` : 'not synced'}</div>
              <div class="t-line">OPEN ISSUES: ${gh.openIssues ?? '—'}</div>
              <div class="t-line">NEXT: <b class="warn">${next ? next.title : 'clear'}</b></div>
            </div>
          </div>
          <button class="btn" id="btn-fg-sync">⇣ SYNC GITHUB</button>
          <div id="fg-sync-status" class="dim-note">${gh.syncedAt ? 'synced ' + gh.syncedAt.slice(0, 16).replace('T', ' ') : DB.integrations.github.repo ? 'ready — repo: ' + DB.integrations.github.repo : 'set GitHub repo in SYS → MODULES first'}</div>
        </div>
        <div class="panel">
          <div class="panel-head">MILESTONES <span class="xp-hint">click ○ to complete (+30 XP)</span></div>
          <div class="ms-list">${fg.milestones.map(m => `
            <div class="ms-row s-${m.status}" data-mid="${m.id}">
              <span class="ms-glyph">${glyph[m.status] || '○'}</span>
              <span class="ms-title">${m.title}${m.blocker ? `<small class="warn"> — ${m.blocker}</small>` : ''}</span>
              <span class="ms-date">${m.completedDate ? m.completedDate.slice(5) : ''}</span>
            </div>`).join('')}</div>
        </div>
        <div class="panel span2">
          <div class="panel-head">BUILD LOG</div>
          <div class="log-list tall">${(DB.dailyLogs || []).filter(l => l.axis === 'Portfolio').reverse().slice(0, 20)
            .map(l => logLine('BUILD', l.date, l.activity)).join('') || 'no sessions'}</div>
        </div>
      </div>`;
  },

  corecs() {
    const T = DB.trackers.corecs;
    const all = T.subjects.flatMap(s => s.topics);
    const done = all.filter(t => t.status === 'done').length;
    const next = all.find(t => t.status === 'not_started');
    return `
      <div class="grid two-col">
        <div class="panel">
          <div class="panel-head">INTERVIEW BANK ${trackerTodayChip('Core CS')}</div>
          <div class="t-hero">
            ${trackerRing(100 * done / Math.max(1, all.length), 'COVERAGE', 84)}
            <div class="t-hero-stats">
              ${T.subjects.map(s => `<div class="t-line">${s.name}: <b>${s.topics.filter(t => t.status === 'done').length}/${s.topics.length}</b></div>`).join('')}
              <div class="t-line">NEXT: <b>${next ? next.name : 'all covered'}</b></div>
            </div>
          </div>
          <div class="dim-note">5 lenses per topic: ${T.lensNames.join(' · ')}</div>
          <button class="btn" id="btn-cc-pull" style="margin-top:10px">⇣ PULL NOTION (checkbox states)</button>
        </div>
        <div class="panel">
          <div class="panel-head">TOPICS <span class="xp-hint">click to cycle status</span></div>
          ${T.subjects.map(s => `<div class="t-subject">${s.name}</div>${trackerMatrix(s.topics, true)}`).join('')}
        </div>
      </div>`;
  },

  sysdesign() {
    const T = DB.trackers.sysdesign;
    const done = T.fundamentals.filter(f => f.status === 'done').length;
    const CLASSICS = ['URL shortener', 'Notification service', 'Chat app', 'News feed', 'BloodConnect at scale', 'Twitter timeline'];
    const attempted = T.reps.map(r => r.prompt.toLowerCase());
    const nextRep = CLASSICS.find(c => !attempted.some(a => a.includes(c.toLowerCase().split(' ')[0])));
    return `
      <div class="grid two-col">
        <div class="panel">
          <div class="panel-head">SD FUNDAMENTALS ${trackerTodayChip('System Design')}</div>
          <div class="t-hero">
            ${trackerRing(100 * done / T.fundamentals.length, 'SYLLABUS', 84)}
            <div class="t-hero-stats">
              <div class="t-line"><b>${done} / ${T.fundamentals.length}</b> fundamentals</div>
              <div class="t-line">REPS: <b>${T.reps.length}</b> sketches logged</div>
              <div class="t-line">NEXT REP: <b>${nextRep || 'rotation complete'}</b></div>
            </div>
          </div>
          ${trackerMatrix(T.fundamentals, true)}
        </div>
        <div class="panel">
          <div class="panel-head">PRACTICE REPS <span class="xp-hint">+25 XP per sketch</span></div>
          <form id="form-sd-rep">
            <input name="prompt" placeholder="what did you sketch? (e.g. URL shortener cold)" required />
            <div class="row-flex">
              <input name="durationMin" type="number" min="5" placeholder="minutes" style="flex:1" required />
              <input name="selfGrade" type="number" min="1" max="10" placeholder="grade /10" style="flex:1" />
            </div>
            <button type="submit" class="btn">LOG SKETCH</button>
          </form>
          <div class="log-list" style="margin-top:10px">${T.reps.slice().reverse().map(r =>
            logLine('SKETCH', r.date, `${r.prompt} (${r.durationMin}m${r.selfGrade ? ` · ${r.selfGrade}/10` : ''})`)).join('') || 'no reps yet'}</div>
        </div>
      </div>`;
  },

  comms() {
    const T = DB.trackers.communication;
    const glyph = { done: '✓', deferred: '⊘', not_started: '○', drafted: '◐' };
    const bank = T.hrBank || [];
    const bankDone = bank.filter(h => h.status === 'done').length;
    return `
      <div class="grid two-col">
        <div class="panel">
          <div class="panel-head">DRILLS ${trackerTodayChip('Communication')}</div>
          <div class="ms-list">${T.drills.map(d => `
            <div class="ms-row s-${d.status === 'deferred' ? 'open' : d.status}">
              <span class="ms-glyph ${d.status === 'deferred' ? 'warn' : ''}">${glyph[d.status] || '○'}</span>
              <span class="ms-title">${d.name}${d.versions.length ? `<small> — v${d.versions[d.versions.length - 1].v}, ${d.versions[d.versions.length - 1].date.slice(5)}</small>` : ''}</span>
            </div>`).join('')}</div>
          ${T.tmay ? `<div class="dim-note" style="margin-top:8px">TMAY v${T.tmay.version} cached (${T.tmay.timedSec}s${T.tmay.locked ? ' · LOCKED' : ''}) — say "practice tmay" to hear it.</div>` : ''}
          <div class="dim-note" style="margin-top:4px">NEXT: Floodgate walkthrough — say "create mission floodgate walkthrough".</div>
          <button class="btn" id="btn-comm-pull" style="margin-top:10px">⇣ PULL NOTION</button>
        </div>
        <div class="panel">
          <div class="panel-head">HR / STAR BANK <b class="ok">${bankDone}</b>/${bank.length} <span class="xp-hint">click to cycle ○→◐→✓</span></div>
          <div class="ms-list">${bank.map(h => `
            <div class="ms-row hr-item s-${h.status === 'done' ? 'done' : 'open'}" data-hid="${h.id}" style="cursor:pointer">
              <span class="ms-glyph">${glyph[h.status] || '○'}</span>
              <span class="ms-title">${h.q}</span>
            </div>`).join('') || '<div class="dim-note">no bank — pull from Notion</div>'}</div>
          <div class="log-list" style="margin-top:10px">${T.mockSessions.slice().reverse().map(s =>
            logLine('MOCK', s.date, `${s.type} — ${s.prompt}`)).join('') || ''}</div>
        </div>
      </div>`;
  },

  blogs() {
    const T = DB.trackers.blogs;
    const counts = { queued: 0, reading: 0, digested: 0 };
    T.entries.forEach(e => counts[e.status] = (counts[e.status] || 0) + 1);
    return `
      <div class="grid two-col">
        <div class="panel">
          <div class="panel-head">SIGNAL DIGEST</div>
          <div class="t-line" style="margin-bottom:10px">QUEUE <b>${counts.queued}</b> · READING <b>${counts.reading || 0}</b> · DIGESTED <b class="ok">${counts.digested}</b></div>
          <form id="form-blog">
            <input name="title" placeholder="blog title" required />
            <input name="url" placeholder="url (optional)" />
            <input name="takeaway" placeholder="one-sentence takeaway (your rule)" />
            <button type="submit" class="btn">ADD TO DIGEST</button>
          </form>
          <button class="btn" id="btn-blog-pull" style="margin-top:10px">⇣ PULL NOTION</button>
        </div>
        <div class="panel">
          <div class="panel-head">ENTRIES <span class="xp-hint">click status to advance queue→reading→digested</span></div>
          <div class="ms-list">${T.entries.slice().reverse().map(b => `
            <div class="ms-row s-${b.status === 'digested' ? 'done' : 'open'}" data-bid="${b.id}">
              <span class="ms-glyph b-status" style="cursor:pointer" title="advance status">${{ queued: '◌', reading: '◐', digested: '✓' }[b.status]}</span>
              <span class="ms-title">${b.title}${b.takeaways && b.takeaways.length ? `<small> — ${b.takeaways[0]}</small>` : ''}</span>
              <span class="ms-date">${(b.dateRead || '').slice(5)}</span>
            </div>`).join('')}</div>
        </div>
      </div>`;
  }
};

/* ---------- tab switching + event wiring ---------- */
function renderTrackerPanel(tab) {
  tab = tab || activeTrackerTab;
  activeTrackerTab = tab;
  document.querySelectorAll('.axis-tabs .tt').forEach(b => b.classList.toggle('active', b.dataset.tt === tab));
  const panel = $('#tracker-panel'), overview = $('#sprint-overview');
  if (tab === 'overview') {
    panel.classList.add('hidden'); overview.classList.remove('hidden');
    return;
  }
  overview.classList.add('hidden'); panel.classList.remove('hidden');
  panel.innerHTML = TrackerPanels[tab]();
  wireTrackerEvents(tab, panel);
}
window.renderTrackerPanel = renderTrackerPanel;

function wireTrackerEvents(tab, panel) {
  /* status-cycling chips (DSA topics, Core CS topics, SD fundamentals) */
  panel.querySelectorAll('.t-chip[data-tid]').forEach(ch => ch.addEventListener('click', () => {
    const id = ch.dataset.tid;
    const pools = {
      dsa: DB.trackers.dsa.topics,
      corecs: DB.trackers.corecs.subjects.flatMap(s => s.topics),
      sysdesign: DB.trackers.sysdesign.fundamentals
    };
    const item = (pools[tab] || []).find(t => t.id === id);
    if (!item) return;
    item.status = cycleStatus(item.status, ['not_started', 'in_progress', 'done']);
    if (item.status === 'done') { sfx.confirm(); toast('xp', '✓ ' + item.name, 'marked done'); }
    else sfx.blip();
    save(); renderTrackerPanel();
  }));

  /* milestone completion */
  panel.querySelectorAll('.ms-row[data-mid]').forEach(row => row.addEventListener('click', () => {
    const fg = DB.trackers.portfolio.projects.find(p => p.id === 'floodgate');
    const m = fg.milestones.find(x => x.id === row.dataset.mid);
    if (!m || m.status.startsWith('done')) return;
    m.status = 'done'; m.completedDate = today();
    save(); renderTrackerPanel();
    grantXp(30, `milestone: ${m.title.slice(0, 40)}`);
    say(`Milestone shipped: ${m.title}.`);
  }));

  /* GitHub sync */
  const gs = panel.querySelector('#btn-fg-sync');
  if (gs) gs.addEventListener('click', async () => {
    const repo = DB.integrations.github.repo;
    if (!repo) return say('Set your GitHub repo in SYS, modules panel, first.');
    $('#fg-sync-status').textContent = 'syncing…';
    try {
      const res = await window.dexter.githubProject(repo, DB.integrations.github.token);
      const fg = DB.trackers.portfolio.projects.find(p => p.id === 'floodgate');
      fg.github = res;
      /* auto-match: tags close milestones (spec §5.4) */
      if ((res.tags || []).some(t => /^v?1\./.test(t))) {
        const m = fg.milestones.find(x => x.id === 'fg-v1');
        if (m.status !== 'done') { m.status = 'done'; m.tag = res.tags.find(t => /^v?1\./.test(t)); }
      }
      if ((res.tags || []).some(t => /^v?2\./.test(t))) {
        const m = fg.milestones.find(x => x.id === 'fg-v2-tag');
        if (m.status !== 'done') {
          m.status = 'done'; m.completedDate = today();
          grantXp(30, 'milestone: v2.0.0 tagged (detected on GitHub)');
          say('v2.0.0 tag detected on GitHub. Milestone closed. That comprehension debt is paid.');
        }
      }
      save(); renderTrackerPanel();
    } catch (e) {
      $('#fg-sync-status').textContent = 'sync failed: ' + e.message;
      sfx.error();
    }
  });

  /* SD rep form */
  const sf = panel.querySelector('#form-sd-rep');
  if (sf) sf.addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    DB.trackers.sysdesign.reps.push({
      id: 'sd_rep_' + Date.now().toString(36), date: today(),
      prompt: f.prompt.value.trim(), durationMin: +f.durationMin.value,
      selfGrade: f.selfGrade.value ? +f.selfGrade.value : null, notes: ''
    });
    DB.dailyLogs.push({ date: today(), axis: 'System Design', activity: `SD sketch: ${f.prompt.value.trim()}`, minutes: +f.durationMin.value, notes: 'via SD tracker' });
    save(); renderAll(); renderTrackerPanel();
    grantXp(25, 'SD practice rep');
    say('Sketch logged. The Saturday slot lives.');
  });

  /* Notion pulls (T3) */
  const ccp = panel.querySelector('#btn-cc-pull');
  if (ccp) ccp.addEventListener('click', () => NotionSync.interviewBank());
  const cmp = panel.querySelector('#btn-comm-pull');
  if (cmp) cmp.addEventListener('click', () => NotionSync.communication());
  const blp = panel.querySelector('#btn-blog-pull');
  if (blp) blp.addEventListener('click', () => NotionSync.blogs());

  /* HR bank cycling */
  panel.querySelectorAll('.hr-item').forEach(el => el.addEventListener('click', () => {
    const h = (DB.trackers.communication.hrBank || []).find(x => x.id === el.dataset.hid);
    if (!h) return;
    h.status = cycleStatus(h.status, ['not_started', 'drafted', 'done']);
    if (h.status === 'done') { sfx.confirm(); grantXp(10, 'STAR answer: ' + h.q.slice(0, 30)); }
    else sfx.blip();
    save(); renderTrackerPanel();
  }));

  /* blog form + status advance */
  const bf = panel.querySelector('#form-blog');
  if (bf) bf.addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    DB.trackers.blogs.entries.push({
      id: 'blog_' + Date.now().toString(36), title: f.title.value.trim(),
      url: f.url.value.trim() || null, source: '', dateRead: null,
      axes: [], topics: [], takeaways: f.takeaway.value.trim() ? [f.takeaway.value.trim()] : [],
      notionPageId: null, status: 'queued'
    });
    save(); renderTrackerPanel(); sfx.confirm();
    say('Added to the signal queue.');
  });
  panel.querySelectorAll('.b-status').forEach(el => el.addEventListener('click', () => {
    const b = DB.trackers.blogs.entries.find(x => x.id === el.closest('.ms-row').dataset.bid);
    if (!b) return;
    b.status = cycleStatus(b.status, ['queued', 'reading', 'digested']);
    if (b.status === 'digested') { b.dateRead = today(); grantXp(15, 'blog digested'); }
    else sfx.blip();
    save(); renderTrackerPanel();
  }));
}

/* tab clicks */
document.querySelectorAll('.axis-tabs .tt').forEach(b =>
  b.addEventListener('click', () => { sfx.blip(); renderTrackerPanel(b.dataset.tt); }));
