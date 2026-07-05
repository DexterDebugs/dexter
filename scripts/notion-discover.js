/* Phase T0.1 — list every database/page shared with the Notion integration.
   Usage: node scripts/notion-discover.js   (requires settings.notionToken in dexter-data.json)
   Appends a fresh discovery section to docs/NOTION_MAP.md. */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { DATA_FILE } = require('../lib/paths');

const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
const token = (data.settings || {}).notionToken;
if (!token) {
  console.error('no notionToken in settings — add it in Dexter SYS first');
  process.exit(1);
}

function search(cursor) {
  const body = JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.notion.com', path: '/v1/search', method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`, 'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let out = '';
      res.on('data', c => out += c);
      res.on('end', () => {
        const j = JSON.parse(out);
        if (res.statusCode !== 200) return reject(new Error(j.message || res.statusCode));
        resolve(j);
      });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

(async () => {
  let results = [], cursor = null;
  do {
    const r = await search(cursor);
    results = results.concat(r.results);
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);

  const title = o =>
    o.object === 'database'
      ? (o.title || []).map(t => t.plain_text).join('') || '(untitled db)'
      : Object.values(o.properties || {}).filter(p => p.type === 'title')
          .flatMap(p => p.title).map(t => t.plain_text).join('') || '(untitled page)';

  const lines = [
    `\n## Live discovery — ${new Date().toISOString().slice(0, 10)} (shared with integration)\n`,
    '| Type | Title | ID |', '|---|---|---|',
    ...results.map(o => `| ${o.object} | ${title(o)} | \`${o.id}\` |`)
  ];
  const mapFile = path.join(__dirname, '..', 'docs', 'NOTION_MAP.md');
  fs.appendFileSync(mapFile, lines.join('\n') + '\n');
  console.log(`${results.length} objects visible to the integration — appended to docs/NOTION_MAP.md`);
  const KEYWORDS = { Interview: 'notionInterviewBankDb', 'System Design': 'notionSysDesignDb', Blog: 'notionBlogDb', Communication: 'notionCommunicationDb', 'Soft Skills': 'notionCommunicationDb', Project: 'notionFloodgatePageId' };
  for (const o of results) {
    const t = title(o);
    for (const [kw, key] of Object.entries(KEYWORDS))
      if (t.includes(kw)) console.log(`  suggest: settings.${key} = ${o.id}  (${t})`);
  }
})().catch(e => { console.error('discovery failed:', e.message); process.exit(1); });
