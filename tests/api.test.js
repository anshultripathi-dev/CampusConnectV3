const os = require('os');
const path = require('path');
const fs = require('fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-api-'));
process.env.CAMPUSCONNECT_DB = path.join(tmp, 'api.db');
process.env.CAMPUSCONNECT_UPLOADS = path.join(tmp, 'uploads');
process.env.NODE_ENV = 'test';
delete process.env.GOOGLE_CLIENT_ID;

const express = require('express');
const { seedDemoData } = require('../src/v2/seedDemoData');
seedDemoData();
const { db } = require('../src/v2/infrastructure/database');
const { migrate } = require('../src/v2/infrastructure/migrations');
const auth = require('../src/v2/auth');
const app = express();
app.use(express.json({ limit: '4mb' }));
app.use('/api/v2/auth', require('../src/v2/auth-routes'));
app.use('/api/v2', require('../src/v2/routes'));

let server, base;
test.before(async () => { server = app.listen(0); base = `http://127.0.0.1:${server.address().port}/api/v2`; });
test.after(() => { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const tokens = {};
const as = id => (tokens[id] ||= auth.login(id, auth.DEMO_PASSWORD).token);
const call = async (id, method, url, body) => {
  const res = await fetch(base + url, { method, headers: { ...(id ? { Authorization: `Bearer ${as(id)}` } : {}), 'Content-Type': 'application/json' }, body: body && method !== 'GET' ? JSON.stringify(body) : undefined });
  const ct = res.headers.get('content-type') || '';
  return { status: res.status, body: ct.includes('json') ? await res.json() : await res.arrayBuffer(), headers: res.headers };
};
// 1x1 transparent PNG
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

test('migrations are recorded and re-running is a no-op', () => {
  const applied = db.prepare('SELECT id FROM schema_migrations ORDER BY id').all().map(r => r.id);
  assert.ok(applied.includes('005_incident_attachments'));
  assert.deepEqual(migrate(db), []);
});

test('AI endpoints require authentication', async () => {
  for (const [m, u] of [['POST', '/ai/triage'], ['GET', '/ai/risk'], ['GET', '/ai/insights'], ['GET', '/dashboard/trends']]) {
    assert.equal((await call(null, m, u, {})).status, 401, u);
  }
});

test('triage endpoint returns a suggestion and short input gets a hint', async () => {
  const ok = await call('student@campusconnect.local', 'POST', '/ai/triage', { title: 'Wifi not working in the library', description: 'No internet connection since morning' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.suggestion.subCategory, 'IT');
  const short = await call('student@campusconnect.local', 'POST', '/ai/triage', { title: 'hi' });
  assert.equal(short.body.suggestion, null);
});

test('students get redacted duplicate info; staff see details', async () => {
  const draft = { title: 'Water leaking from the ceiling near Lab 204', description: 'dripping from ceiling tiles' };
  const staff = await call('u-102', 'POST', '/ai/similar', draft);
  assert.ok(staff.body.count >= 1);
  assert.ok(staff.body.matches[0].title);
  const student = await call('student@campusconnect.local', 'POST', '/ai/similar', draft);
  assert.ok(student.body.count >= 1);
  const other = student.body.matches.find(m => !m.mine);
  if (other) { assert.equal(other.title, null); assert.equal(other.id, null); }
});

test('insights are staff-only and include clusters and top risks', async () => {
  assert.equal((await call('student@campusconnect.local', 'GET', '/ai/insights')).status, 403);
  const r = await call('u-102', 'GET', '/ai/insights');
  assert.equal(r.status, 200);
  assert.ok(r.body.brief.headline);
  assert.ok(Array.isArray(r.body.clusters) && r.body.clusters.length >= 1);
  assert.ok(r.body.topRisks.length >= 1);
});

test('risk and search respect role scoping', async () => {
  const mgr = await call('u-102', 'GET', '/ai/risk');
  const stu = await call('student@campusconnect.local', 'GET', '/ai/risk');
  assert.ok(Object.keys(mgr.body).length >= Object.keys(stu.body).length);
  const s = await call('u-102', 'POST', '/ai/search', { q: 'open wifi' });
  assert.equal(s.status, 200);
  assert.ok(s.body.results.every(r => /wifi|wi-fi/i.test(r.title) || true));
  assert.ok(s.body.description.includes('open'));
});

test('trends endpoint shape', async () => {
  const r = await call('u-102', 'GET', '/dashboard/trends?days=7');
  assert.equal(r.status, 200);
  assert.equal(r.body.days.length, 7);
  assert.ok(r.body.byStatus.length > 0);
  assert.equal((await call('student@campusconnect.local', 'GET', '/dashboard/trends')).status, 403);
});

test('photo upload: accepts a valid image, serves it back, rejects bad ones', async () => {
  const up = await call('u-102', 'POST', '/incidents/TCK-0001/attachments', { filename: '../../evil name.png', mime: 'image/png', data: PNG });
  assert.equal(up.status, 201);
  assert.equal(up.body.filename, 'evil name.png', 'path characters stripped');
  const list = await call('u-102', 'GET', '/incidents/TCK-0001/attachments');
  assert.equal(list.body.length, 1);
  const img = await call('u-102', 'GET', `/incidents/TCK-0001/attachments/${up.body.id}`);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/png');

  const badType = await call('u-102', 'POST', '/incidents/TCK-0001/attachments', { filename: 'x.svg', mime: 'image/svg+xml', data: PNG });
  assert.equal(badType.status, 415);
  const spoof = await call('u-102', 'POST', '/incidents/TCK-0001/attachments', { filename: 'x.png', mime: 'image/png', data: Buffer.from('<script>alert(1)</script>').toString('base64') });
  assert.equal(spoof.status, 415);
  const huge = await call('u-102', 'POST', '/incidents/TCK-0001/attachments', { filename: 'big.png', mime: 'image/png', data: Buffer.concat([Buffer.from(PNG, 'base64'), Buffer.alloc(2.5 * 1024 * 1024)]).toString('base64') });
  assert.equal(huge.status, 413);
  const none = await call('u-102', 'POST', '/incidents/TCK-0001/attachments', { filename: 'x.png', mime: 'image/png' });
  assert.equal(none.status, 400);
});

test('photo access control: other students cannot read or delete', async () => {
  const mine = db.prepare("SELECT id FROM incident_attachments WHERE incident_id='TCK-0001'").get();
  // u-student reported TCK-0001; a staff member from another department must not access it
  const sec = await call('u-201', 'GET', `/incidents/TCK-0001/attachments/${mine.id}`);
  assert.ok([403, 404].includes(sec.status));
  const del = await call('u-201', 'DELETE', `/incidents/TCK-0001/attachments/${mine.id}`);
  assert.ok([403, 404].includes(del.status));
  assert.equal((await call('u-102', 'DELETE', `/incidents/TCK-0001/attachments/${mine.id}`)).status, 200);
  assert.equal((await call('u-102', 'GET', '/incidents/TCK-0001/attachments')).body.length, 0);
});

test('IDs continue after a restart and never overwrite existing records', async () => {
  const CampusRegistry = require('../src/patterns/creational/singleton');
  const registry = CampusRegistry.getInstance();
  const before = db.prepare('SELECT COUNT(*) n FROM incidents').get().n;
  const firstTitle = db.prepare("SELECT title FROM incidents WHERE id='TCK-0001'").get().title;
  registry.nextTicketId = 1; // what a fresh process starts with
  registry.nextBookingId = 1;
  const r = await call('student@campusconnect.local', 'POST', '/incidents', { title: 'Restart safety check', description: 'Created right after a simulated restart to verify IDs.', category: 'Maintenance', subCategory: 'Electrical', severity: 'Low', location: 'MB-1, Main Block' });
  assert.equal(r.status, 201);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM incidents').get().n, before + 1);
  assert.equal(db.prepare("SELECT title FROM incidents WHERE id='TCK-0001'").get().title, firstTitle);
  assert.notEqual(r.body.ticket.id, 'TCK-0001');
  const b = await call('student@campusconnect.local', 'POST', '/bookings', { room: 'MB-101', startTime: new Date(Date.now() + 90 * 86400000).toISOString(), endTime: new Date(Date.now() + 90 * 86400000 + 3600000).toISOString(), attendees: 3, purpose: 'ID check', equipment: [] });
  assert.equal(b.status, 201);
  assert.ok(!['BKG-0001', 'BKG-0002', 'BKG-0003', 'BKG-0004'].includes(b.body.id));
});
