// Offline AI facade for CampusConnect. Everything runs locally — no network, no API key.
const { triage, retrain } = require('./triage');
const { riskMap, slaRisk } = require('./risk');
const insights = require('./insights');
const query = require('./query');

// Re-train the triage model on live incidents so it adapts to this campus's wording.
let learnedSignature = '';
function learnFrom(incidents) {
  const signature = incidents.map(i => `${i.id}:${i.category}/${i.subCategory}`).join('|');
  if (signature === learnedSignature) return;
  learnedSignature = signature;
  retrain(incidents.filter(i => i.category && i.subCategory && i.title).map(i => ({ text: `${i.title}. ${i.description || ''}`, category: i.category, subCategory: i.subCategory })));
}
function search(q, incidents, user) {
  const parsed = query.parse(q);
  return { ...parsed, results: query.apply(incidents, parsed.filters, user) };
}
module.exports = { triage, learnFrom, riskMap, slaRisk, clusters: insights.clusters, similarTo: insights.similarTo, brief: insights.brief, search, parseQuery: query.parse, applyQuery: query.apply };
