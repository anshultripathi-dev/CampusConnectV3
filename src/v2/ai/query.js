// Natural-language incident search, e.g. "open electrical issues in lab 204 this week".
// A small rule-based interpreter: it extracts structured filters and treats whatever
// is left as free-text terms to match against title / description / location.
const { tokenize, STOPWORDS } = require('./text');
const { riskMap, DONE } = require('./risk');

const STATUS_WORDS = [
  [/\b(open|active|pending|ongoing|unresolved)\b/, { open: true }],
  [/\b(resolved|fixed|completed|done)\b/, { statuses: ['Resolved'] }],
  [/\b(closed)\b/, { statuses: ['Closed'] }],
  [/\b(new|unreviewed|submitted)\b/, { statuses: ['Submitted'] }],
  [/\bin progress\b/, { statuses: ['InProgress'] }],
  [/\b(awaiting approval|pending approval|needs approval)\b/, { statuses: ['PendingApproval'] }],
  [/\breopened\b/, { statuses: ['Reopened'] }],
];
const TYPE_WORDS = [
  [/\belectric\w*|\bpower\b|\blight(s|ing)?\b|\bsocket\b/, { subCategory: 'Electrical' }],
  [/\bplumbing\b|\bleak\w*|\bwater\b|\bpipe\b|\btoilet\b/, { subCategory: 'Plumbing' }],
  [/\bwi-?fi\b|\bnetwork\b|\binternet\b|\bit\b|\bprojector\b/, { subCategory: 'IT' }],
  [/\bsecurity\b|\bsafety\b|\btheft\b|\bsuspicious\b/, { category: 'Safety' }],
  [/\blost\b|\bfound\b|\blost and found\b/, { category: 'LostFound' }],
];
const SEVERITY_WORDS = [[/\bcritical\b/, ['Critical']], [/\burgent\b|\bhigh( priority| severity)?\b/, ['High', 'Critical']], [/\bmedium\b/, ['Medium']], [/\blow( priority)?\b/, ['Low']]];
const RISK_WORDS = [[/\b(breached|overdue|late)\b/, 'breached'], [/\bat risk\b|\babout to breach\b/, 'atRisk']];

function parse(q) {
  let rest = ` ${String(q || '').toLowerCase()} `;
  const f = {}; const parts = [];
  const take = (rx, fn) => { const m = rest.match(rx); if (m) { fn(m); rest = rest.replace(rx, ' '); return true; } return false; };

  if (take(/\bunassigned\b/, () => { f.unassigned = true; parts.push('unassigned'); })) {}
  if (take(/\b(assigned to me|my incidents|mine)\b/, () => { f.mine = true; parts.push('assigned to you'); })) {}
  for (const [rx, v] of RISK_WORDS) if (take(rx, () => { f.risk = v; parts.push(v === 'breached' ? 'SLA breached' : 'SLA at risk'); })) break;
  for (const [rx, v] of STATUS_WORDS) if (take(rx, () => { Object.assign(f, v); parts.push(v.open ? 'open' : v.statuses[0]); })) break;
  for (const [rx, v] of SEVERITY_WORDS) if (take(rx, () => { f.severities = v; parts.push(v.join('/')); })) break;
  for (const [rx, v] of TYPE_WORDS) if (take(rx, () => { Object.assign(f, v); parts.push(v.subCategory || v.category); })) break;
  let m;
  if (take(/\b(?:in the |in |over the |within the )?last (\d+) (hour|day|week)s?\b/, mm => { f.sinceHours = Number(mm[1]) * ({ hour: 1, day: 24, week: 168 })[mm[2]]; parts.push(`last ${mm[1]} ${mm[2]}s`); })) {}
  else if (take(/\btoday\b/, () => { f.sinceHours = 24; parts.push('today'); })) {}
  else if (take(/\byesterday\b/, () => { f.sinceHours = 48; parts.push('since yesterday'); })) {}
  else if (take(/\b(this|past) week\b/, () => { f.sinceHours = 168; parts.push('this week'); })) {}
  else if (take(/\b(this|past) month\b/, () => { f.sinceHours = 720; parts.push('this month'); })) {}

  const terms = rest.replace(/\b(issues?|incidents?|tickets?|problems?|show|me|find|list|all)\b/g, ' ').split(/\s+/)
    .filter(t => t && !STOPWORDS.has(t) && t.length > 1);
  if (terms.length) { f.terms = terms; parts.push(`matching “${terms.join(' ')}”`); }
  return { filters: f, description: parts.join(' · ') || 'all incidents' };
}

function apply(incidents, filters, user = {}) {
  const risks = (filters.risk) ? riskMap(incidents) : null;
  return incidents.filter(i => {
    if (filters.open && DONE.has(i.status)) return false;
    if (filters.statuses && !filters.statuses.includes(i.status)) return false;
    if (filters.category && i.category !== filters.category) return false;
    if (filters.subCategory && i.subCategory !== filters.subCategory) return false;
    if (filters.severities && !filters.severities.includes(i.severity)) return false;
    if (filters.sinceHours && Date.now() - new Date(i.createdAt).getTime() > filters.sinceHours * 3600000) return false;
    if (filters.unassigned && i.assignedTo) return false;
    if (filters.mine && i.assignedTo !== user.id) return false;
    if (filters.risk === 'breached' && risks[i.id].level !== 'breached') return false;
    if (filters.risk === 'atRisk' && !['high', 'elevated'].includes(risks[i.id].level)) return false;
    if (filters.terms) {
      const hay = `${i.id} ${i.title} ${i.description || ''} ${i.location || ''}`.toLowerCase();
      if (!filters.terms.every(t => hay.includes(t))) return false;
    }
    return true;
  });
}
module.exports = { parse, apply };
