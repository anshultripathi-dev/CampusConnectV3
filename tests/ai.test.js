const test = require('node:test');
const assert = require('node:assert/strict');
const { triage } = require('../src/v2/ai/triage');
const { TfIdfIndex, tokenize } = require('../src/v2/ai/text');
const { slaRisk } = require('../src/v2/ai/risk');
const { clusters, similarTo, brief } = require('../src/v2/ai/insights');
const query = require('../src/v2/ai/query');

const hoursAgo = h => new Date(Date.now() - h * 3600000).toISOString();
const inc = (o = {}) => ({ id: 'T-1', title: 't', description: '', status: 'Submitted', severity: 'Medium', category: 'Maintenance', subCategory: 'IT', department: 'Maintenance', slaHours: 24, createdAt: hoursAgo(1), location: 'MB-1, Main Block', ...o });

test('tokenizer lowercases, drops stopwords and stems', () => {
  assert.deepEqual(tokenize('The lights are Flickering in Wi-Fi zone'), ['light', 'flicker', 'wifi', 'zone']);
});

test('triage classifies the five incident types', () => {
  const cases = [
    ['Sparking socket in the lab, electrical sparks', 'Maintenance', 'Electrical'],
    ['Water leaking from the ceiling above the desks', 'Maintenance', 'Plumbing'],
    ['Wifi is down and there is no internet connection', 'Maintenance', 'IT'],
    ['Suspicious person loitering near the hostel gate', 'Safety', 'Security'],
    ['Lost my blue backpack near the cafeteria', 'LostFound', 'General'],
  ];
  for (const [text, category, subCategory] of cases) {
    const r = triage({ title: text });
    assert.equal(r.suggestion.category, category, text);
    assert.equal(r.suggestion.subCategory, subCategory, text);
    assert.ok(r.confidence > 0.35 && r.confidence <= 1);
  }
});

test('triage routes to the right department and rates severity', () => {
  assert.equal(triage({ title: 'Fire and smoke in the chemistry lab' }).suggestion.severity, 'Critical');
  assert.equal(triage({ title: 'Lost my calculator after the exam' }).suggestion.severity, 'Low');
  assert.equal(triage({ title: 'Someone stole my bike from the parking' }).suggestion.department, 'Security');
});

test('triage declines to guess on gibberish or empty input', () => {
  assert.equal(triage({ title: 'asdf qwer zxcv' }).suggestion, null);
  assert.equal(triage({}).suggestion, null);
});

test('TF-IDF ranks the most similar document first', () => {
  const idx = new TfIdfIndex([{ id: 'a', text: 'water leak in lab ceiling' }, { id: 'b', text: 'projector not working' }, { id: 'c', text: 'lost backpack' }]);
  const hits = idx.query('ceiling water leaking', { minScore: 0.1 });
  assert.equal(hits[0].id, 'a');
  assert.ok(!hits.some(h => h.id === 'c'));
});

test('SLA risk: done, breached and escalating cases', () => {
  assert.equal(slaRisk(inc({ status: 'Resolved' })).level, 'done');
  const breached = slaRisk(inc({ createdAt: hoursAgo(30) }));
  assert.equal(breached.level, 'breached');
  assert.equal(breached.score, 100);
  const fresh = slaRisk(inc({ createdAt: hoursAgo(1), assignedTo: 'u-1', status: 'InProgress' }));
  assert.equal(fresh.level, 'low');
  const late = slaRisk(inc({ createdAt: hoursAgo(20), severity: 'Critical' }));
  assert.ok(['high', 'elevated'].includes(late.level) && late.score > fresh.score);
  assert.ok(late.reasons.length > 0);
});

test('clusters group related open reports and ignore resolved ones', () => {
  const list = [
    inc({ id: 'A', title: 'Wifi dropping in Block B', description: 'wifi disconnects constantly', location: 'BB-1, Block B' }),
    inc({ id: 'B', title: 'No wifi on second floor Block B', description: 'wifi not working', location: 'BB-2, Block B' }),
    inc({ id: 'C', title: 'Lost blue backpack', description: 'near cafeteria', category: 'LostFound', subCategory: 'General', location: 'Cafeteria' }),
    inc({ id: 'D', title: 'Wifi dropping in Block B', description: 'wifi disconnects', status: 'Resolved', location: 'BB-3, Block B' }),
  ];
  const result = clusters(list);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].ids.sort(), ['A', 'B']);
});

test('similarTo finds duplicates for a draft report', () => {
  const list = [inc({ id: 'A', title: 'Water leak near Lab 204 ceiling', description: 'drip from ceiling tiles', subCategory: 'Plumbing' }), inc({ id: 'B', title: 'Projector broken' })];
  const matches = similarTo({ title: 'water leaking from ceiling in lab 204' }, list);
  assert.equal(matches[0].incident.id, 'A');
});

test('brief summarises SLA pressure', () => {
  const b = brief([inc({ id: 'A', createdAt: hoursAgo(30) }), inc({ id: 'B', status: 'Resolved', resolvedAt: hoursAgo(2) })]);
  assert.match(b.headline, /1 open incident/);
  assert.ok(b.bullets.some(x => /breached/.test(x)));
});

test('query parser extracts filters and free-text terms', () => {
  const { filters } = query.parse('open electrical issues in lab 204 this week');
  assert.equal(filters.open, true);
  assert.equal(filters.subCategory, 'Electrical');
  assert.equal(filters.sinceHours, 168);
  assert.deepEqual(filters.terms, ['lab', '204']);
  assert.equal(query.parse('critical plumbing').filters.severities[0], 'Critical');
  assert.equal(query.parse('unassigned wifi last 3 days').filters.sinceHours, 72);
  assert.equal(query.parse('breached').filters.risk, 'breached');
});

test('query apply filters a list', () => {
  const list = [inc({ id: 'A', subCategory: 'Electrical', title: 'Light out in Lab 204' }), inc({ id: 'B', subCategory: 'IT', title: 'Wifi' }), inc({ id: 'C', subCategory: 'Electrical', title: 'Fan', status: 'Closed' })];
  const ids = query.apply(list, query.parse('open electrical lab 204').filters).map(i => i.id);
  assert.deepEqual(ids, ['A']);
});
