/* ============================================================
   NOTION TRACKER SYNC (TRACKERS.md T3) — block-parser pulls.
   Needs settings.notionToken + pages shared with the integration.
   Merge rule: Notion can promote status (checked→done) but never
   downgrades local progress.
   ============================================================ */
const NotionSync = {

  _guard() {
    if (!DB.settings.notionToken) {
      say('Notion sync needs your integration token — add it in SYS, Notion uplink, and share the tracker pages with the integration.');
      return false;
    }
    return true;
  },

  /* Interview Bank: to_do topics grouped under subject headings */
  async interviewBank() {
    if (!this._guard()) return;
    say('Pulling the interview bank.');
    try {
      const blocks = await window.dexter.notionBlocks(DB.settings.notionToken, DB.settings.notionInterviewBankDb);
      const T = DB.trackers.corecs;
      let subject = null, promoted = 0, added = 0;
      const subjectByName = { os: 'os', dbms: 'dbms', cn: 'cn', oops: 'oop', oop: 'oop' };
      for (const b of blocks) {
        if (/^heading/.test(b.type) && subjectByName[b.text.trim().toLowerCase()]) {
          subject = T.subjects.find(s => s.id === subjectByName[b.text.trim().toLowerCase()]);
        } else if (b.type === 'to_do' && subject && b.text.trim()) {
          const name = b.text.trim();
          let topic = subject.topics.find(t =>
            t.name.toLowerCase().startsWith(name.toLowerCase().slice(0, 12)) ||
            name.toLowerCase().startsWith(t.name.toLowerCase().slice(0, 12)));
          if (!topic) {
            topic = { id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40), name, status: 'not_started' };
            subject.topics.push(topic); added++;
          }
          if (b.checked && topic.status !== 'done') { topic.status = 'done'; promoted++; }
        }
      }
      save(); if (typeof renderTrackerPanel === 'function') renderTrackerPanel();
      say(`Interview bank synced. ${added} new topics, ${promoted} promoted to done.`);
    } catch (e) { sfx.error(); say('Interview bank pull failed: ' + e.message); }
  },

  /* Communication: HR bank to_dos → hrBank statuses */
  async communication() {
    if (!this._guard()) return;
    say('Pulling the communication lab.');
    try {
      const blocks = await window.dexter.notionBlocks(DB.settings.notionToken, DB.settings.notionCommunicationDb);
      const C = DB.trackers.communication;
      C.hrBank = C.hrBank || [];
      let promoted = 0;
      for (const b of blocks) {
        if (b.type !== 'to_do' || !b.text.trim()) continue;
        const q = b.text.trim().replace(/\s*\(.*\)$/, '');
        let item = C.hrBank.find(h => h.q.toLowerCase().slice(0, 15) === q.toLowerCase().slice(0, 15));
        if (!item) { item = { id: q.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30), q, status: 'not_started' }; C.hrBank.push(item); }
        if (b.checked && item.status !== 'done') { item.status = 'done'; promoted++; }
      }
      save(); if (typeof renderTrackerPanel === 'function') renderTrackerPanel();
      say(`Communication lab synced. ${promoted} questions promoted.`);
    } catch (e) { sfx.error(); say('Communication pull failed: ' + e.message); }
  },

  /* Blog Notes: child pages → entries */
  async blogs() {
    if (!this._guard()) return;
    say('Pulling the blog digest.');
    try {
      const blocks = await window.dexter.notionBlocks(DB.settings.notionToken, DB.settings.notionBlogDb);
      const B = DB.trackers.blogs;
      let added = 0;
      for (const b of blocks) {
        if (!b.childPage) continue;
        const title = b.childPage.title.replace(/^Blog \d+\s*-\s*/i, '').trim();
        if (!B.entries.some(e => e.notionPageId === b.childPage.id || e.title.toLowerCase() === title.toLowerCase())) {
          B.entries.push({
            id: 'blog_' + Date.now().toString(36) + added, title, url: null, source: '',
            dateRead: null, axes: [], topics: [], takeaways: [], notionPageId: b.childPage.id, status: 'queued'
          });
          added++;
        }
      }
      save(); if (typeof renderTrackerPanel === 'function') renderTrackerPanel();
      say(`Blog digest synced. ${added} new entries queued.`);
    } catch (e) { sfx.error(); say('Blog pull failed: ' + e.message); }
  }
};
window.NotionSync = NotionSync;
