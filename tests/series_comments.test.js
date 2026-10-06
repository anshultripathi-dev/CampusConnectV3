const os = require('os');
const path = require('path');
const fs = require('fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-sc-'));
process.env.CAMPUSCONNECT_DB = path.join(tmp, 'sc.db');
process.env.CAMPUSCONNECT_UPLOADS = path.join(tmp, 'uploads');
process.env.NODE_ENV = 'test';
delete process.env.GOOGLE_CLIENT_ID;

const express = require('express');
const { seedDemoData } = require('../src/v2/seedDemoData');
seedDemoData();
const { db } = require('../src/v2/infrastructure/database');
const auth = require('../src/v2/auth');
const eventBus = require('../src/v2/infrastructure/eventBus');
const app = express();
app.use(express.json({ limit: '4mb' }));
app.use('/api/v2/auth', require('../src/v2/auth-routes'));
app.use('/api/v2', require('../src/v2/routes'));

let server, base;
test.before(() => { server = app.listen(0); base = `http://127.0.0.1:${server.address().port}/api/v2`; });
test.after(() => { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const STUDENT = 'student@campusconnect.local';
const tokens = {};
const as = id => (tokens[id] ||= auth.login(id, auth.DEMO_PASSWORD).token);
const call = async (id, method, url, body) => {
  const res = await fetch(base + url, { method, headers: { ...(id ? { Authorization: `Bearer ${as(id)}` } : {}), 'Content-Type': 'application/json' }, body: body && method !== 'GET' ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

// ───────────────────────── recurring bookings ─────────────────────────
const DAY = 86400000;
const sessions = (startDays, count, every = 7, hours = 1, startHour = 10) => Array.from({ length: count }, (_, i) => {
  const s = new Date(Date.now() + (startDays + i * every) * DAY); s.setUTCHours(startHour, 0, 0, 0);
  return { startTime: s.toISOString(), endTime: new Date(s.getTime() + hours * 3600000).toISOString() };
});
const series = (who, room, occurrences, extra = {}) => call(who, 'POST', '/bookings', { room, occurrences, pattern: 'weekly', attendees: 10, purpose: 'Weekly seminar', equipment: [], ...extra });

test('a recurring request creates one pending booking per session, linked by a series id', async () => {
  const r = await series(STUDENT, 'MB-201', sessions(40, 4));
  assert.equal(r.status, 201);
  assert.equal(r.body.created, 4);
  assert.equal(r.body.status, 'PENDING');
  const bks = r.body.bookings;
  assert.equal(new Set(bks.map(b => b.seriesId)).size, 1);
  assert.deepEqual(bks.map(b => b.seriesIndex), [1, 2, 3, 4]);
  assert.ok(bks.every(b => b.seriesTotal === 4 && b.seriesPattern === 'Weekly' && b.recurring && b.status === 'PENDING'));
});

test('a series sends one aggregated notification to approvers and one to the requester', async () => {
  const before = db.prepare("SELECT COUNT(*) n FROM notifications WHERE title LIKE 'Recurring booking%'").get().n;
  await series(STUDENT, 'MB-202', sessions(41, 3));
  assert.equal(db.prepare("SELECT COUNT(*) n FROM notifications WHERE title LIKE 'Recurring booking%'").get().n, before + 2);
  const op = db.prepare("SELECT message FROM notifications WHERE title='Recurring booking awaiting approval' ORDER BY id DESC").get();
  assert.match(op.message, /3 sessions/);
});

test('validation: session limits, ordering, overlaps, past dates, unknown pattern, room and capacity', async () => {
  assert.equal((await series(STUDENT, 'MB-201', sessions(40, 27, 1))).status, 400, 'more than 26');
  assert.equal((await series(STUDENT, 'MB-201', sessions(40, 1))).status, 400, 'needs at least two');
  assert.equal((await series(STUDENT, 'MB-201', sessions(40, 2, 400))).status, 400, 'spans more than a year');
  const overlap = sessions(40, 2, 0); // same slot twice
  assert.equal((await series(STUDENT, 'MB-201', overlap)).status, 400);
  assert.equal((await series(STUDENT, 'MB-201', sessions(-3, 3))).status, 400, 'starts in the past');
  assert.equal((await series(STUDENT, 'MB-201', sessions(40, 3), { pattern: 'hourly' })).status, 400);
  assert.equal((await series(STUDENT, 'NOPE-1', sessions(40, 3))).status, 400, 'unknown room');
  const big = await series(STUDENT, 'MB-201', sessions(40, 3), { attendees: 500 });
  assert.equal(big.status, 400);
  assert.match(big.body.error, /seats 40/);
  assert.equal((await call(STUDENT, 'POST', '/bookings', { room: 'MB-201', startTime: new Date(Date.now() - 3 * DAY).toISOString(), endTime: new Date(Date.now() - 3 * DAY + 3600000).toISOString(), attendees: 3, purpose: 'x' })).status, 400, 'single bookings cannot start in the past either');
});

test('clashing dates are reported; the request can proceed by skipping them; nothing is half-created', async () => {
  const occ = sessions(50, 4);
  const a = await series('u-103', 'TT-302', [occ[1], occ[2]].map(o => ({ ...o })));
  assert.equal(a.body.status, 'APPROVED', 'approver series is auto-approved');
  const before = db.prepare('SELECT COUNT(*) n FROM bookings').get().n;
  const refused = await series(STUDENT, 'TT-302', occ);
  assert.equal(refused.status, 409);
  assert.equal(refused.body.conflictDates.length, 2);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM bookings').get().n, before, 'atomic: no partial series');
  const skipped = await series(STUDENT, 'TT-302', occ, { skipConflicts: true });
  assert.equal(skipped.status, 201);
  assert.equal(skipped.body.created, 2);
  assert.equal(skipped.body.skipped.length, 2);
  assert.ok(skipped.body.bookings.every(b => b.seriesTotal === 2));
  const none = await series(STUDENT, 'TT-302', [occ[1], occ[2]], { skipConflicts: true });
  assert.equal(none.status, 409, 'nothing left to book');
});

test('preview marks which dates are free', async () => {
  const occ = sessions(60, 3);
  await series('u-103', 'TT-303', [occ[1]]).catch(() => {}); // single-date "series" is refused …
  await call('u-103', 'POST', '/bookings', { room: 'TT-303', ...occ[1], attendees: 5, purpose: 'Block date' }); // … so block it normally
  const p = await call(STUDENT, 'POST', '/bookings/preview', { room: 'TT-303', occurrences: occ });
  assert.equal(p.status, 200);
  assert.deepEqual(p.body.map(x => x.available), [true, false, true]);
  assert.equal(p.body[1].clashesWith.length, 1);
});

test('approving a series approves free sessions and declines the ones that were taken meanwhile', async () => {
  const occ = sessions(70, 4);
  const r = await series(STUDENT, 'MB-103', occ);
  const ids = r.body.bookings.map(b => b.id);
  await call('u-103', 'POST', '/bookings', { room: 'MB-103', ...occ[2], attendees: 5, purpose: 'Took the slot' }); // approver booking auto-approved
  assert.equal((await call(STUDENT, 'POST', `/bookings/${ids[0]}/approve`, { scope: 'series' })).status, 403);
  assert.equal((await call('u-101', 'POST', `/bookings/${ids[0]}/approve`, { scope: 'series' })).status, 403);
  const d = await call('u-103', 'POST', `/bookings/${ids[0]}/approve`, { scope: 'series' });
  assert.equal(d.status, 200);
  assert.equal(d.body.approved.length, 3);
  assert.equal(d.body.declined.length, 1);
  const rows = Object.fromEntries(db.prepare(`SELECT id,status,decision_note FROM bookings WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids).map(x => [x.id, x]));
  assert.equal(rows[ids[2]].status, 'REJECTED');
  assert.match(rows[ids[2]].decision_note, /clashes with BKG-/);
  assert.equal(rows[ids[0]].status, 'APPROVED');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM notifications WHERE recipient='u-student' AND title='Recurring booking reviewed' AND reference_id=?").get(ids[0]).n, 1, 'one summary notification');
  assert.equal((await call('u-103', 'POST', `/bookings/${ids[0]}/approve`, { scope: 'series' })).status, 409, 'nothing pending left');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action IN ('BOOKING_APPROVED','BOOKING_REJECTED') AND entity_id IN (" + ids.map(() => '?').join(',') + ')').get(...ids).n, 4, 'every session is audited');
});

test('declining a series needs a reason; cancelling can target one session or the whole series', async () => {
  const r = await series(STUDENT, 'MB-102', sessions(80, 3));
  const ids = r.body.bookings.map(b => b.id);
  assert.equal((await call('u-103', 'POST', `/bookings/${ids[0]}/reject`, { scope: 'series' })).status, 400);
  const rej = await call('u-103', 'POST', `/bookings/${ids[0]}/reject`, { scope: 'series', note: 'Room closed for refurbishment' });
  assert.equal(rej.body.declined.length, 3);

  const r2 = await series(STUDENT, 'MB-102', sessions(90, 4));
  const ids2 = r2.body.bookings.map(b => b.id);
  await call('u-103', 'POST', `/bookings/${ids2[0]}/approve`, { scope: 'series' });
  assert.equal((await call('u-301', 'POST', `/bookings/${ids2[0]}/cancel`, { scope: 'series' })).status, 403, 'not the owner');
  const one = await call(STUDENT, 'POST', `/bookings/${ids2[1]}/cancel`);
  assert.equal(one.body.status, 'CANCELLED');
  const rest = await call(STUDENT, 'POST', `/bookings/${ids2[0]}/cancel`, { scope: 'series' });
  assert.equal(rest.body.cancelled.length, 3, 'the already-cancelled session is left alone');
  assert.equal((await series('u-301', 'MB-102', sessions(90, 4))).status, 201, 'room is free again');
});

test('series rows expose their position so the UI can group them', async () => {
  const list = await call('u-103', 'GET', '/bookings');
  const withSeries = list.body.filter(b => b.seriesId);
  assert.ok(withSeries.length >= 10);
  assert.ok(withSeries.every(b => b.seriesIndex >= 1 && b.seriesTotal >= 2));
});

// ───────────────────────── incident comments ─────────────────────────
const newIncident = async (who = STUDENT) => (await call(who, 'POST', '/incidents', { title: 'Comment test incident', description: 'A description long enough for the validator.', category: 'Maintenance', subCategory: 'Electrical', severity: 'Low', location: 'MB-101, Main Block' })).body.ticket.id;
const say = (who, id, body, internal = false) => call(who, 'POST', `/incidents/${id}/comments`, { body, internal });

test('reporter and staff can talk on an incident; both see public comments, with author details', async () => {
  const id = await newIncident();
  await call('u-102', 'POST', `/incidents/${id}/command/assign`, { staffId: 'u-101' });
  const a = await say(STUDENT, id, 'The socket is still sparking.');
  assert.equal(a.status, 201);
  assert.equal(a.body.authorName, 'Campus Student');
  const b = await say('u-101', id, 'On my way — please keep clear of the area.');
  assert.equal(b.body.authorRole, 'Maintenance');
  const asStudent = await call(STUDENT, 'GET', `/incidents/${id}/comments`);
  assert.deepEqual(asStudent.body.map(c => c.body), ['The socket is still sparking.', 'On my way — please keep clear of the area.']);
});

test('internal notes are staff-only everywhere: list, counts and live events', async () => {
  const id = await newIncident();
  assert.equal((await say(STUDENT, id, 'sneaky', true)).status, 403, 'students cannot write internal notes');
  assert.equal((await say('u-102', id, 'Check the breaker panel first — previous fault in this room.', true)).status, 201);
  await say('u-102', id, 'We are looking into it.');
  const student = await call(STUDENT, 'GET', `/incidents/${id}/comments`);
  assert.equal(student.body.length, 1);
  assert.ok(!JSON.stringify(student.body).includes('breaker'));
  const staff = await call('u-102', 'GET', `/incidents/${id}/comments`);
  assert.equal(staff.body.length, 2);
  assert.equal(staff.body.find(c => c.internal).body.startsWith('Check the breaker'), true);
  const studentList = (await call(STUDENT, 'GET', '/incidents')).body.find(i => i.id === id);
  const staffList = (await call('u-102', 'GET', '/incidents')).body.find(i => i.id === id);
  assert.equal(studentList.commentCount, 1);
  assert.equal(staffList.commentCount, 2);
});

test('internal notes never create a notification for the reporter', async () => {
  const id = await newIncident();
  await call('u-102', 'POST', `/incidents/${id}/command/assign`, { staffId: 'u-101' });
  await say('u-102', id, 'Internal: escalate to the electrician contractor.', true);
  const mine = await call(STUDENT, 'GET', '/notifications');
  assert.ok(!mine.body.some(n => n.reference_id === id && /Internal note/.test(n.title)));
  const assignee = await call('u-101', 'GET', '/notifications');
  assert.ok(assignee.body.some(n => n.reference_id === id && /Internal note/.test(n.title)));
});

test('public comments notify the other side (reporter ⇄ assignee), never the author', async () => {
  const id = await newIncident();
  await call('u-102', 'POST', `/incidents/${id}/command/assign`, { staffId: 'u-101' });
  await say('u-101', id, 'Part ordered, fix expected tomorrow.');
  assert.ok((await call(STUDENT, 'GET', '/notifications')).body.some(n => n.reference_id === id && /New comment/.test(n.title)));
  await say(STUDENT, id, 'Thanks — what time tomorrow?');
  assert.ok((await call('u-101', 'GET', '/notifications')).body.some(n => n.reference_id === id && /Thanks/.test(n.message)));
  assert.ok(!db.prepare("SELECT 1 FROM notifications WHERE recipient='u-101' AND reference_id=? AND message LIKE 'Ramesh Kumar:%'").get(id), 'authors are not notified of their own comments');
});

test('only people with access can read or write; closed incidents are read-only', async () => {
  const id = await newIncident();
  const other = await call('u-201', 'GET', `/incidents/${id}/comments`);
  assert.ok([403, 404].includes(other.status), 'other-department staff have no access');
  assert.ok([403, 404].includes((await say('u-201', id, 'hi')).status));
  assert.equal((await call(null, 'GET', `/incidents/${id}/comments`)).status, 401);
  assert.equal((await call('u-102', 'GET', '/incidents/TCK-9999/comments')).status, 404);
  for (const a of ['assign', 'start', 'resolve']) await call('u-102', 'POST', `/incidents/${id}/command/${a}`, { staffId: 'u-101' });
  await call('u-103', 'POST', `/incidents/${id}/command/close`);
  const closed = await say('u-102', id, 'late comment');
  assert.equal(closed.status, 409);
});

test('validation: empty, too long and rapid-fire comments are refused', async () => {
  const id = await newIncident();
  assert.equal((await say(STUDENT, id, '   ')).status, 400);
  assert.equal((await say(STUDENT, id, 'x'.repeat(1001))).status, 400);
  let last;
  for (let i = 0; i < 12; i++) last = await say('u-202', id, `note ${i}`); // a dedicated user, so other tests are not throttled
  assert.equal(last.status, 429);
});

test('authors can edit and delete their own comments; managers can delete any; others cannot', async () => {
  const id = await newIncident();
  const c = (await say(STUDENT, id, 'Original text')).body;
  assert.equal((await call('u-102', 'POST', `/incidents/${id}/comments/${c.id}`, { body: 'hijack' })).status, 403, 'even managers cannot edit others’ words');
  const edited = await call(STUDENT, 'POST', `/incidents/${id}/comments/${c.id}`, { body: 'Corrected text' });
  assert.equal(edited.body.body, 'Corrected text');
  assert.ok(edited.body.editedAt);
  assert.equal((await call(STUDENT, 'POST', `/incidents/${id}/comments/${c.id}`, { body: ' ' })).status, 400);
  const d = (await say('u-102', id, 'A staff reply')).body;
  assert.equal((await call(STUDENT, 'DELETE', `/incidents/${id}/comments/${d.id}`)).status, 403);
  assert.equal((await call(STUDENT, 'DELETE', `/incidents/${id}/comments/${c.id}`)).status, 200);
  assert.equal((await call('u-103', 'DELETE', `/incidents/${id}/comments/${d.id}`)).status, 200, 'management moderates');
  assert.equal((await call(STUDENT, 'GET', `/incidents/${id}/comments`)).body.length, 0);
  assert.equal((await call(STUDENT, 'DELETE', `/incidents/${id}/comments/${c.id}`)).status, 404, 'already gone');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='INCIDENT_COMMENT_DELETED' AND entity_id=?").get(id).n, 2);
});

test('the live comment event carries no comment text and flags internal notes', async () => {
  const id = await newIncident();
  const seen = [];
  const off = eventBus.subscribe('incident.comment', p => seen.push(p));
  await say('u-102', id, 'secret internal detail', true);
  off();
  assert.equal(seen.length, 1);
  assert.equal(seen[0].internal, true);
  assert.ok(!JSON.stringify(seen[0]).includes('secret internal detail'));
});
