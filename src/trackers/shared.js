/* ============================================================
   TRACKERS — shared schema bootstrap + render utilities
   (TRACKERS.md Phase T1; loaded after app.js, before commands/)
   ============================================================ */

/* ---------- T1.2 bootstrap: derive tracker state from existing data ---------- */
function bootstrapTrackers() {
  DB.trackers = DB.trackers || {};
  const T = DB.trackers;
  if (T._bootstrapped) return false;

  const logs = DB.dailyLogs || [];
  const act = axis => logs.filter(l => l.axis === axis);
  const has = (axis, re) => act(axis).some(l => re.test(l.activity + ' ' + (l.notes || '')));

  /* --- DSA topics (spec §4.3, statuses from logged sessions) --- */
  const dsaLogs = act('DSA');
  const problemsFromLogs = dsaLogs.reduce((sum, l) => {
    const m = (l.activity || '').match(/(\d+)\s*(?:leetcode\s*)?problems?/i);
    return sum + (m ? parseInt(m[1]) : 0);
  }, 0);
  T.dsa = {
    weekTarget: 14, lastSync: null,
    loggedProblemCount: problemsFromLogs,
    problems: [],
    topics: [
      { id: 'arrays', name: 'Arrays / Two Pointers', status: has('DSA', /array|two pointer/i) ? 'in_progress' : 'not_started', count: 0 },
      { id: 'greedy', name: 'Greedy', status: has('DSA', /greedy|jump game|buy.?sell/i) ? 'done' : 'not_started', count: 3 },
      { id: 'sliding-window', name: 'Sliding Window', status: 'not_started', count: 0 },
      { id: 'bst', name: 'Binary Search Trees', status: has('DSA', /\bbst\b|binary search tree/i) ? 'done' : 'not_started', count: 0 },
      { id: 'trees', name: 'Binary Trees', status: 'not_started', count: 0 },
      { id: 'backtracking', name: 'Backtracking', status: has('DSA', /backtrack/i) ? 'done' : 'not_started', count: 0 },
      { id: 'dp', name: 'Dynamic Programming', status: has('DSA', /\bdp\b|dynamic programming/i) ? 'in_progress' : 'not_started', count: 0 },
      { id: 'graphs', name: 'Graphs', status: 'not_started', count: 0 },
      { id: 'heaps', name: 'Heaps / Priority Queue', status: 'not_started', count: 0 },
      { id: 'linked-lists', name: 'Linked Lists', status: 'not_started', count: 0 },
      { id: 'stacks', name: 'Stacks / Queues', status: 'not_started', count: 0 },
      { id: 'binary-search', name: 'Binary Search', status: 'not_started', count: 0 }
    ]
  };

  /* --- Portfolio / Floodgate milestones (spec §5.3, from sprint history) --- */
  T.portfolio = {
    projects: [
      {
        id: 'floodgate', name: 'Floodgate', repo: (DB.integrations?.github?.repo) || '',
        localPath: DB.settings.floodgateLocalPath || '',
        milestones: [
          { id: 'fg-redis-ping', title: 'Redis PING/PONG tracer bullet', status: 'done', completedDate: '2026-05-20' },
          { id: 'fg-v1', title: 'v1.0.0 — Gateway MVP (auth, dual rate-limit, Redis, distroless)', status: 'done', tag: 'v1.0.0', completedDate: '2026-06-10' },
          { id: 'fg-v2-health', title: 'health.Tracker — rolling p95 + error rate + /health', status: 'done', completedDate: '2026-06-16' },
          { id: 'fg-v2-pid', title: 'PID + adaptive per-route limiter', status: 'done_untagged', blocker: 'comprehension gap — tag deferred', completedDate: '2026-06-26' },
          { id: 'fg-v2-tag', title: 'Tag v2.0.0 after comprehension recovery', status: 'open', priority: 1 },
          { id: 'fg-v3-adaptive', title: 'v3 — TCP Vegas / adaptive limiter (Uber Cinnamon)', status: 'planned', dependsOn: ['fg-v2-tag'] }
        ],
        github: { lastRelease: null, lastTag: null, openIssues: 0, lastCommit: null }
      },
      { id: 'bloodconnect', name: 'BloodConnect', repo: '', localPath: '', milestones: [
        { id: 'bc-walkthrough', title: 'Interview walkthrough recorded', status: 'done', completedDate: '2026-06-19' }
      ], github: {} },
      { id: 'sphere', name: 'Sphere', repo: '', localPath: '', milestones: [], github: {} }
    ]
  };

  /* --- Core CS Interview Bank (spec §6.2, done-states from logs) --- */
  T.corecs = {
    lensNames: ['Definition', 'Comparison', 'Tradeoffs', 'When to use', 'Interview answer'],
    subjects: [
      { id: 'os', name: 'Operating Systems', topics: [
        { id: 'process-vs-thread', name: 'Process vs Thread', status: has('Core CS', /process.{0,4}thread/i) ? 'done' : 'not_started', lastReview: '2026-05-22' },
        { id: 'scheduling', name: 'CPU Scheduling', status: 'not_started' },
        { id: 'memory-mgmt', name: 'Memory Management / Paging', status: 'not_started' },
        { id: 'deadlocks', name: 'Deadlocks', status: 'not_started' }
      ]},
      { id: 'cn', name: 'Computer Networks', topics: [
        { id: 'tcp-vs-udp', name: 'TCP vs UDP', status: has('Core CS', /tcp.{0,4}udp/i) ? 'done' : 'not_started', lastReview: '2026-06-13' },
        { id: 'dns', name: 'DNS', status: 'not_started' },
        { id: 'http-https', name: 'HTTP / HTTPS / TLS', status: 'not_started' },
        { id: 'osi', name: 'OSI Model', status: 'not_started' }
      ]},
      { id: 'dbms', name: 'DBMS', topics: [
        { id: 'indexing', name: 'Indexing', status: has('Core CS', /indexing/i) ? 'done' : 'not_started', lastReview: '2026-06-22' },
        { id: 'normalization', name: 'Normalization', status: 'not_started' },
        { id: 'transactions', name: 'Transactions / ACID', status: 'not_started' },
        { id: 'sql-vs-nosql', name: 'SQL vs NoSQL', status: 'not_started' }
      ]},
      { id: 'oop', name: 'OOP / Design Patterns', topics: [
        { id: 'solid', name: 'SOLID principles', status: 'not_started' },
        { id: 'common-patterns', name: 'Common patterns (Factory, Observer…)', status: 'not_started' }
      ]}
    ]
  };

  /* --- System Design fundamentals (spec §7.2, Jun 1 Floodgate research = done) --- */
  const sdDone = ['api-gateway', 'reverse-proxy', 'token-bucket', 'cap-theorem'];
  T.sysdesign = {
    fundamentals: [
      ['api-gateway', 'API Gateway'], ['reverse-proxy', 'Reverse Proxy'],
      ['token-bucket', 'Token Bucket / Rate Limiting'], ['circuit-breaker', 'Circuit Breaker'],
      ['load-balancing', 'Load Balancing'], ['caching', 'Caching strategies'],
      ['cap-theorem', 'CAP / PACELC'], ['sharding', 'Sharding & partitioning'],
      ['message-queues', 'Message queues / Kafka'], ['db-replication', 'DB replication'],
      ['cdn', 'CDN'], ['consistent-hashing', 'Consistent hashing'],
      ['websockets', 'WebSockets / long polling'], ['backpressure', 'Backpressure / load shedding']
    ].map(([id, name]) => ({
      id, name,
      status: sdDone.includes(id) ? 'done' : (id === 'circuit-breaker' ? 'in_progress' : (id === 'backpressure' ? 'done' : 'not_started'))
    })),
    reps: [
      { id: 'sd_rep_001', date: '2026-06-20', prompt: 'Cold-attempt SD (Sunday catch-up)', durationMin: 90, selfGrade: null, notes: 'deferred sketch + new cold attempt' }
    ]
  };

  /* --- Communication drills (spec §8.1 evidence) --- */
  T.communication = {
    drills: [
      { id: 'tmay', name: 'Tell Me About Yourself', status: 'done', versions: [{ v: 1, date: '2026-05-22', note: '65s timed' }, { v: 2, date: '2026-05-22', note: 'recorded' }] },
      { id: 'walk-bloodconnect', name: 'BloodConnect walkthrough', status: 'done', versions: [{ v: 1, date: '2026-06-19', note: 'recorded after 3 weeks deferred' }] },
      { id: 'walk-floodgate', name: 'Floodgate walkthrough', status: 'deferred', versions: [] },
      { id: 'on-camera', name: 'On-camera presence (Polaris R2)', status: 'done', versions: [{ v: 1, date: '2026-06-12', note: 'who I am — real stakes' }] },
      { id: 'behavioral', name: 'Behavioral (STAR)', status: 'not_started', versions: [] }
    ],
    mockSessions: []
  };

  /* --- Blogs (spec §9.7 — bootstrap from logs, IDs from NOTION_MAP discovery) --- */
  T.blogs = {
    entries: [
      { id: 'blog_hawkins', title: 'Netflix — Hawkins Design System', source: 'Netflix Engineering', dateRead: '2026-06-05', minutes: 30, axes: ['DSA'], topics: [], takeaways: [], notionPageId: '3728d1b6-5577-8089-a4cc-ca19edb23fa5', status: 'digested' },
      { id: 'blog_cinnamon', title: 'Uber — Cinnamon load shedder (PID + TCP Vegas)', source: 'Uber Engineering', dateRead: '2026-06-15', minutes: 30, axes: ['DSA', 'Portfolio'], topics: ['pid-control', 'rate-limiting'], takeaways: ['PID loop maps to adaptive rate limiter', 'TCP Vegas congestion signals ≈ backend pressure'], links: { floodgateMilestone: 'fg-v3-adaptive', sysDesignTopic: 'token-bucket' }, notionPageId: '3808d1b6-5577-8077-b02d-eecb966b1620', status: 'digested' },
      { id: 'blog_cap', title: 'Zapier — CAP Theorem for engineering teams', source: 'Zapier', dateRead: '2026-06-24', minutes: 30, axes: ['System Design'], topics: ['cap-theorem'], takeaways: [], links: { sysDesignTopic: 'cap-theorem' }, notionPageId: '38c8d1b6-5577-801a-9210-f72c709f7c8d', status: 'digested' },
      { id: 'blog_routing', title: 'Netflix — State of Routing in Model Serving', source: 'Netflix Engineering', dateRead: null, axes: [], topics: [], takeaways: [], notionPageId: '3548d1b6-5577-80d4-8f30-dbcb15a2acd4', status: 'queued' },
      { id: 'blog_uber_agentic', title: 'Uber — Agentic System for Design Specs', source: 'Uber Engineering', dateRead: null, axes: [], topics: [], takeaways: [], notionPageId: '3578d1b6-5577-8012-82aa-ed8a7b68bf89', status: 'queued' },
      { id: 'blog_uber_load', title: 'Uber — Static Rate-Limiting → Intelligent Load Management', source: 'Uber Engineering', dateRead: null, axes: ['Portfolio'], topics: ['rate-limiting'], takeaways: [], notionPageId: '35b8d1b6-5577-80cf-90ef-ee7fbdd834b7', status: 'queued' },
      { id: 'blog_uber_search', title: 'Uber — Delivery Search Platform', source: 'Uber Engineering', dateRead: null, axes: [], topics: [], takeaways: [], notionPageId: '3638d1b6-5577-80d0-ad7c-f7c7a7954297', status: 'queued' },
      { id: 'blog_stripe', title: 'Stripe — Online migrations at scale', source: 'Stripe Engineering', dateRead: null, axes: ['System Design'], topics: [], takeaways: [], notionPageId: '36c8d1b6-5577-80ce-b419-c753c0edaeb2', status: 'queued' }
    ]
  };

  T._bootstrapped = true;
  T._bootstrappedAt = new Date().toISOString();
  save();
  return true;
}
window.bootstrapTrackers = bootstrapTrackers;

/* ---------- T1.3 shared render utilities (used by T2 tracker panels) ---------- */

/* progress ring — inline SVG, breath-synced glow */
function trackerRing(pct, label, size = 64) {
  const r = size / 2 - 6, c = 2 * Math.PI * r;
  return `<svg class="t-ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(0,240,255,.12)" stroke-width="4"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--cyan)" stroke-width="4"
      stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct / 100)}"
      stroke-linecap="round" transform="rotate(-90 ${size / 2} ${size / 2})"
      style="filter: drop-shadow(0 0 4px var(--cyan))"/>
    <text x="50%" y="46%" text-anchor="middle" fill="var(--cyan)" font-size="${size / 4.6}" font-family="inherit">${Math.round(pct)}%</text>
    <text x="50%" y="66%" text-anchor="middle" fill="var(--dim)" font-size="7" letter-spacing="1">${label}</text>
  </svg>`;
}

/* topic matrix — status grid chip row */
function trackerMatrix(items, onClickAttr) {
  const glyph = { done: '✓', in_progress: '◐', done_untagged: '⚠', not_started: '○', open: '○', planned: '◌', deferred: '⊘' };
  return `<div class="t-matrix">` + items.map(i =>
    `<span class="t-chip s-${i.status}" ${onClickAttr ? `data-tid="${i.id}"` : ''} title="${i.name} — ${i.status.replace('_', ' ')}">
      ${glyph[i.status] || '○'} ${i.name}${i.count ? ` <b>${i.count}</b>` : ''}</span>`
  ).join('') + `</div>`;
}

/* today chip — compact per-axis daily stat */
function trackerTodayChip(axis) {
  const todayLogs = (DB.dailyLogs || []).filter(l => l.date === today() && l.axis === axis);
  const mins = todayLogs.reduce((s, l) => s + (l.minutes || 0), 0);
  return todayLogs.length
    ? `<span class="t-today on">TODAY: ${todayLogs.length} session${todayLogs.length > 1 ? 's' : ''} · ${mins}m</span>`
    : `<span class="t-today">TODAY: —</span>`;
}

/* per-tracker completion % */
function trackerPct(tr) {
  const flat = {
    dsa: () => DB.trackers.dsa.topics,
    corecs: () => DB.trackers.corecs.subjects.flatMap(s => s.topics),
    sysdesign: () => DB.trackers.sysdesign.fundamentals,
    communication: () => DB.trackers.communication.drills,
    portfolio: () => (DB.trackers.portfolio.projects[0] || { milestones: [] }).milestones,
    blogs: () => DB.trackers.blogs.entries
  }[tr]();
  if (!flat.length) return 0;
  const doneStates = ['done', 'done_untagged', 'digested'];
  return 100 * flat.filter(i => doneStates.includes(i.status)).length / flat.length;
}

/* spoken one-line summary — powers the "trackers" voice command */
function trackersSummary() {
  const T = DB.trackers;
  const fg = T.portfolio.projects.find(p => p.id === 'floodgate');
  const fgNext = fg.milestones.filter(m => m.status === 'open').sort((a, b) => (a.priority || 9) - (b.priority || 9))[0];
  const sdOpen = T.sysdesign.fundamentals.filter(f => f.status === 'not_started').length;
  const ccTopics = T.corecs.subjects.flatMap(s => s.topics);
  return [
    `DSA: ${DB.leetcode ? DB.leetcode.total + ' solved' : T.dsa.loggedProblemCount + ' logged'}, ${T.dsa.topics.filter(t => t.status === 'done').length} of ${T.dsa.topics.length} topics done.`,
    `Floodgate: ${fg.milestones.filter(m => m.status.startsWith('done')).length} milestones shipped${fgNext ? ', next: ' + fgNext.title : ''}.`,
    `Core CS: ${ccTopics.filter(t => t.status === 'done').length} of ${ccTopics.length} topics.`,
    `System Design: ${Math.round(trackerPct('sysdesign'))} percent of fundamentals, ${sdOpen} remaining.`,
    `Communication: ${T.communication.drills.filter(d => d.status === 'done').length} drills done, Floodgate walkthrough still deferred.`,
    `Blogs: ${T.blogs.entries.filter(b => b.status === 'digested').length} digested, ${T.blogs.entries.filter(b => b.status === 'queued').length} in queue.`
  ].join(' ');
}
window.trackersSummary = trackersSummary;
window.trackerRing = trackerRing;
window.trackerMatrix = trackerMatrix;
window.trackerTodayChip = trackerTodayChip;
window.trackerPct = trackerPct;
