const { TfIdfIndex } = require('./text');
const { DONE, riskMap } = require('./risk');

const SEVERITY_RANK = { Low: 1, Medium: 2, High: 3, Critical: 4 };
const docText = i => `${i.title} ${i.title} ${i.description || ''} ${i.subCategory || ''}`;
const building = loc => String(loc || '').split(',').pop().trim().toLowerCase();

// Groups open incidents that probably share a root cause (similar text, boosted
// when they are in the same building). Single-link clustering via union-find.
function clusters(incidents, { threshold = 0.4 } = {}) {
  const open = incidents.filter(i => !DONE.has(i.status));
  const index = new TfIdfIndex(open.map(i => ({ id: i.id, text: docText(i) })));
  const parent = new Map(open.map(i => [i.id, i.id]));
  const find = x => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  for (let a = 0; a < open.length; a++) for (let b = a + 1; b < open.length; b++) {
    const sameBuilding = building(open[a].location) && building(open[a].location) === building(open[b].location);
    const sim = index.similarity(open[a].id, open[b].id) + (sameBuilding ? 0.1 : 0);
    if (sim >= threshold) parent.set(find(open[a].id), find(open[b].id));
  }
  const groups = new Map();
  for (const i of open) { const r = find(i.id); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(i); }
  return [...groups.values()].filter(g => g.length >= 2).map(g => {
    const merged = new Map();
    for (const i of g) for (const [t, w] of index.vectors.get(i.id)) merged.set(t, (merged.get(t) || 0) + w);
    return {
      size: g.length,
      topic: index.topTerms(merged, 3).join(' · '),
      ids: g.map(i => i.id),
      titles: g.map(i => i.title),
      locations: [...new Set(g.map(i => i.location).filter(Boolean))],
      maxSeverity: g.map(i => i.severity).sort((x, y) => (SEVERITY_RANK[y] || 0) - (SEVERITY_RANK[x] || 0))[0] || 'Medium',
    };
  }).sort((a, b) => b.size - a.size);
}

// Duplicate check for a not-yet-submitted report.
function similarTo(draft, incidents, { limit = 3, minScore = 0.3 } = {}) {
  const open = incidents.filter(i => !DONE.has(i.status));
  if (!open.length) return [];
  const index = new TfIdfIndex(open.map(i => ({ id: i.id, text: docText(i) })));
  const byId = new Map(open.map(i => [i.id, i]));
  return index.query(`${draft.title} ${draft.title} ${draft.description || ''} ${draft.location || ''}`, { limit, minScore })
    .map(r => ({ incident: byId.get(r.id), similarity: Number(r.score.toFixed(3)) }));
}

function brief(incidents) {
  const open = incidents.filter(i => !DONE.has(i.status));
  const risks = riskMap(incidents);
  const breached = open.filter(i => risks[i.id].level === 'breached');
  const high = open.filter(i => risks[i.id].level === 'high');
  const critical = open.filter(i => i.severity === 'Critical');
  const since = Date.now() - 24 * 3600000;
  const resolved24 = incidents.filter(i => i.resolvedAt && new Date(i.resolvedAt).getTime() >= since).length;
  const tally = (key) => { const m = {}; for (const i of open) { const k = key(i); if (k) m[k] = (m[k] || 0) + 1; } return Object.entries(m).sort((a, b) => b[1] - a[1]); };
  const [topType] = tally(i => i.subCategory)[0] || [];
  const [topPlace, topPlaceN] = tally(i => building(i.location))[0] || [];
  const bullets = [];
  if (breached.length) bullets.push(`${breached.length} incident${breached.length > 1 ? 's have' : ' has'} breached SLA — start with ${breached.slice(0, 3).map(i => i.id).join(', ')}.`);
  if (high.length) bullets.push(`${high.length} more ${high.length > 1 ? 'are' : 'is'} at high risk of breaching soon.`);
  if (topPlace && topPlaceN >= 2) bullets.push(`Hotspot: ${topPlaceN} open incidents in ${topPlace.replace(/\b\w/g, c => c.toUpperCase())}.`);
  if (topType) bullets.push(`Most common open issue type: ${topType}.`);
  if (!bullets.length) bullets.push('No SLA pressure right now. Keep ownership and timelines up to date.');
  const headline = `${open.length} open incident${open.length === 1 ? '' : 's'}${critical.length ? `, ${critical.length} critical` : ''} · ${resolved24} resolved in the last 24h`;
  return { headline, bullets, generatedAt: new Date().toISOString(), source: 'local' };
}
module.exports = { clusters, similarTo, brief };
