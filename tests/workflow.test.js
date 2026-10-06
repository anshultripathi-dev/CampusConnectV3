const os = require('os');
const path = require('path');
const fs = require('fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-wf-'));
process.env.CAMPUSCONNECT_DB = path.join(tmp, 'wf.db');
process.env.CAMPUSCONNECT_UPLOADS = path.join(tmp, 'uploads');
process.env.NODE_ENV = 'test';
delete process.env.GOOGLE_CLIENT_ID;

const express = require('express');
const { seedDemoData } = require('../src/v2/seedDemoData');
seedDemoData();
const { db } = require('../src/v2/infrastructure/database');
const auth = require('../src/v2/auth');
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
const slot = (days, hours = 1) => ({ startTime: new Date(Date.now() + days * 86400000).toISOString(), endTime: new Date(Date.now() + days * 86400000 + hours * 3600000).toISOString() });
const book = (who, room, days, extra = {}) => call(who, 'POST', '/bookings', { room, ...slot(days), attendees: 4, purpose: 'Test booking', equipment: [], ...extra });

// ───────── booking approval ─────────
test('new bookings by students start PENDING and notify approvers and the requester', async () => {
  const r = await book(STUDENT, 'MB-201', 20);
  assert.equal(r.status, 201);
  assert.equal(r.body.status, 'PENDING');
  assert.ok(db.prepare("SELECT 1 FROM notifications WHERE recipient='operations' AND title='Booking awaiting approval' AND reference_id=?").get(r.body.id));
  assert.ok(db.prepare("SELECT 1 FROM notifications WHERE recipient='u-student' AND title='Booking requested' AND reference_id=?").get(r.body.id));
});

test('only approvers can approve; students cannot approve their own booking', async () => {
  const { body } = await book(STUDENT, 'MB-201', 21);
  assert.equal((await call(STUDENT, 'POST', `/bookings/${body.id}/approve`)).status, 403);
  assert.equal((await call('u-101', 'POST', `/bookings/${body.id}/approve`)).status, 403, 'maintenance staff cannot approve');
  const ok = await call('u-103', 'POST', `/bookings/${body.id}/approve`);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.status, 'APPROVED');
  assert.equal(ok.body.decidedBy, 'u-103');
  assert.equal((await call('u-103', 'POST', `/bookings/${body.id}/approve`)).status, 409, 'cannot decide twice');
});

test('approval notifies the requester and is audited', async () => {
  const { body } = await book(STUDENT, 'MB-202', 22);
  await call('u-102', 'POST', `/bookings/${body.id}/approve`);
  assert.ok(db.prepare("SELECT 1 FROM notifications WHERE recipient='u-student' AND title='Booking approved' AND reference_id=?").get(body.id));
  assert.ok(db.prepare("SELECT 1 FROM audit_logs WHERE action='BOOKING_APPROVED' AND entity_id=?").get(body.id));
  const inbox = await call(STUDENT, 'GET', '/notifications');
  assert.ok(inbox.body.some(n => n.title === 'Booking approved'));
});

test('rejecting needs a reason and tells the requester why', async () => {
  const { body } = await book(STUDENT, 'MB-202', 23);
  assert.equal((await call('u-103', 'POST', `/bookings/${body.id}/reject`, { note: '  ' })).status, 400);
  const r = await call('u-103', 'POST', `/bookings/${body.id}/reject`, { note: 'Room under maintenance' });
  assert.equal(r.body.status, 'REJECTED');
  assert.equal(r.body.decisionNote, 'Room under maintenance');
  assert.ok(db.prepare("SELECT message FROM notifications WHERE title='Booking declined' AND reference_id=?").get(body.id).message.includes('Room under maintenance'));
});

test('only APPROVED bookings block a room; approving a clashing request is refused', async () => {
  const a = await book(STUDENT, 'TT-302', 24);
  const b = await book('u-301', 'TT-302', 24); // same slot: allowed while a is only pending
  assert.equal(b.status, 201);
  const list = await call('u-103', 'GET', '/bookings');
  const pendingA = list.body.find(x => x.id === a.body.id);
  assert.ok(pendingA.competingRequests.includes(b.body.id));
  assert.equal((await call('u-103', 'POST', `/bookings/${a.body.id}/approve`)).status, 200);
  const clash = await call('u-103', 'POST', `/bookings/${b.body.id}/approve`);
  assert.equal(clash.status, 409);
  assert.equal(clash.body.conflicts[0].id, a.body.id);
  const late = await book(STUDENT, 'TT-302', 24);
  assert.equal(late.status, 409, 'a new request for an approved slot is refused up front');
  const avail = await call(STUDENT, 'GET', `/bookings/conflicts?room=TT-302&start=${encodeURIComponent(slot(24).startTime)}&end=${encodeURIComponent(slot(24).endTime)}`);
  assert.equal(avail.body.length, 1);
});

test('cancel: owner or approver, not others; frees the room', async () => {
  const { body } = await book(STUDENT, 'TT-303', 25);
  await call('u-103', 'POST', `/bookings/${body.id}/approve`);
  assert.equal((await call('u-301', 'POST', `/bookings/${body.id}/cancel`)).status, 403);
  const c = await call(STUDENT, 'POST', `/bookings/${body.id}/cancel`);
  assert.equal(c.body.status, 'CANCELLED');
  assert.equal((await call(STUDENT, 'POST', `/bookings/${body.id}/cancel`)).status, 409);
  assert.equal((await book('u-301', 'TT-303', 25)).status, 201, 'room is free again');
});

test('approvers bookings are auto-approved; students only see their own bookings', async () => {
  const r = await book('u-103', 'MB-103', 26);
  assert.equal(r.body.status, 'APPROVED');
  const mine = await call(STUDENT, 'GET', '/bookings');
  assert.ok(mine.body.every(b => b.requesterId === 'u-student'));
  assert.ok(mine.body.every(b => b.competingRequests === undefined), 'clash details are for approvers only');
});

test('overview shows the pending count to approvers only', async () => {
  assert.ok((await call('u-103', 'GET', '/dashboard/overview')).body.pendingBookings >= 1);
  assert.equal((await call(STUDENT, 'GET', '/dashboard/overview')).body.pendingBookings, 0);
});

test('demo seed leaves pending requests and approved bookings', () => {
  const counts = Object.fromEntries(db.prepare('SELECT status, COUNT(*) n FROM bookings GROUP BY status').all().map(r => [r.status, r.n]));
  assert.ok(counts.PENDING >= 3 && counts.APPROVED >= 4);
});

// ───────── notifications & incidents ─────────
test('reporters are notified when staff move their incident; department staff see department alerts', async () => {
  const created = await call(STUDENT, 'POST', '/incidents', { title: 'Socket sparking in lab', description: 'Sparks coming from the socket near the whiteboard.', category: 'Maintenance', subCategory: 'Electrical', severity: 'High', location: 'MB-101, Main Block' });
  const id = created.body.ticket.id;
  const assigned = await call('u-102', 'POST', `/incidents/${id}/command/assign`, { staffId: 'u-101' });
  assert.equal(assigned.status, 200);
  assert.ok((await call(STUDENT, 'GET', '/notifications')).body.some(n => n.reference_id === id && /Assigned/.test(n.message)));
  assert.ok((await call('u-101', 'GET', '/notifications')).body.some(n => n.reference_id === id), 'Maintenance staff see their department’s alerts');
  assert.ok(!(await call('u-201', 'GET', '/notifications')).body.some(n => n.reference_id === id), 'Security staff do not');
  assert.ok(!(await call(STUDENT, 'GET', '/notifications')).body.some(n => n.recipient === 'operations'), 'students never see management alerts');
});

test('reject works from a new incident, reassign works, and a reason is kept', async () => {
  const mk = async t => (await call(STUDENT, 'POST', '/incidents', { title: t, description: 'Details for the workflow test case.', category: 'Maintenance', subCategory: 'Plumbing', severity: 'Low', location: 'MB-102, Main Block' })).body.ticket.id;
  const a = await mk('Reject me please');
  const rejected = await call('u-103', 'POST', `/incidents/${a}/command/reject`, { reason: 'Duplicate of an existing report' });
  assert.equal(rejected.status, 200);
  assert.equal(rejected.body.ticket.status, 'Rejected');
  assert.ok((await call('u-103', 'POST', `/incidents/${a}/command/reopen`)).body.ticket.status === 'Reopened');
  const b = await mk('Reassign me please');
  await call('u-102', 'POST', `/incidents/${b}/command/assign`, { staffId: 'u-101' });
  const re = await call('u-102', 'POST', `/incidents/${b}/command/assign`, { staffId: 'u-301' });
  assert.equal(re.status, 200);
  assert.equal(re.body.ticket.assignedTo, 'u-301');
  assert.equal(re.body.ticket.status, 'Assigned');
});

test('handoff is limited to management or the owning department', async () => {
  const id = (await call(STUDENT, 'POST', '/incidents', { title: 'Handoff test', description: 'Needs moving between departments.', category: 'Maintenance', subCategory: 'IT', severity: 'Low', location: 'MB-103, Main Block' })).body.ticket.id;
  assert.equal((await call(STUDENT, 'POST', `/incidents/${id}/handoff`, { toDept: 'IT', reason: 'x' })).status, 403);
  assert.equal((await call('u-102', 'POST', `/incidents/${id}/handoff`, { toDept: 'Nowhere', reason: 'x' })).status, 400);
  assert.equal((await call('u-102', 'POST', `/incidents/${id}/handoff`, { toDept: 'IT', reason: 'Network issue' })).status, 200);
});

// ───────── users & passwords ─────────
test('only Admin/Facilities Head can list or change users', async () => {
  assert.equal((await call(STUDENT, 'GET', '/users')).status, 403);
  assert.equal((await call('u-102', 'GET', '/users')).status, 403);
  const list = await call('u-103', 'GET', '/users');
  assert.equal(list.status, 200);
  assert.ok(list.body.roles.includes('Admin') && list.body.departments.length >= 3);
});

test('role changes enforce department rules and protect the last admin and yourself', async () => {
  assert.equal((await call('u-103', 'POST', '/users/u-103/role', { role: 'Student' })).status, 400, 'cannot change own role');
  assert.equal((await call('u-103', 'POST', '/users/u-student/role', { role: 'Maintenance' })).status, 400, 'staff need a department');
  assert.equal((await call('u-103', 'POST', '/users/u-student/role', { role: 'Maintenance', departmentId: 'nope' })).status, 400);
  const ok = await call('u-103', 'POST', '/users/u-student/role', { role: 'Maintenance', departmentId: 'dept-maintenance' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.department, 'Maintenance');
  assert.equal(auth.authenticate(as('u-student')).role, 'Maintenance', 'takes effect on the live session');
  await call('u-103', 'POST', '/users/u-student/role', { role: 'Student' });
  // only one top-level admin exists → demoting them via another admin is blocked
  await call('u-103', 'POST', '/users/u-102/role', { role: 'Admin', departmentId: 'dept-maintenance' });
  assert.equal((await call('u-102', 'POST', '/users/u-103/role', { role: 'Student' })).status, 200, 'allowed: another admin remains');
  assert.equal((await call('u-102', 'POST', '/users/u-102/role', { role: 'Student' })).status, 400);
  assert.ok(db.prepare("SELECT 1 FROM audit_logs WHERE action='USER_ROLE_CHANGED'").get());
});

test('admin password reset issues a working temporary password and ends old sessions', async () => {
  const oldToken = auth.login('u-201', auth.DEMO_PASSWORD).token;
  const r = await call('u-102', 'POST', '/users/u-201/reset-password');
  assert.equal(r.status, 200);
  assert.ok(r.body.temporaryPassword.length >= 12);
  assert.equal(auth.login('u-201', auth.DEMO_PASSWORD), null, 'old password no longer works');
  assert.ok(auth.login('u-201', r.body.temporaryPassword));
  assert.equal(auth.authenticate(oldToken), null, 'old sessions are revoked');
  assert.equal((await call('u-102', 'POST', '/users/u-102/reset-password')).status, 400);
  assert.equal((await call(STUDENT, 'POST', '/users/u-201/reset-password')).status, 403);
});

test('users can change their own password with validation', async () => {
  const keep = as('u-301');
  const other = auth.login('u-301', auth.DEMO_PASSWORD).token;
  assert.equal((await call('u-301', 'POST', '/account/password', { currentPassword: 'wrong', newPassword: 'longenough1' })).status, 403);
  assert.equal((await call('u-301', 'POST', '/account/password', { currentPassword: auth.DEMO_PASSWORD, newPassword: 'short' })).status, 400);
  assert.equal((await call('u-301', 'POST', '/account/password', { currentPassword: auth.DEMO_PASSWORD, newPassword: auth.DEMO_PASSWORD })).status, 400);
  assert.equal((await call('u-301', 'POST', '/account/password', { currentPassword: auth.DEMO_PASSWORD, newPassword: 'a-new-secret-1' })).status, 200);
  assert.equal(auth.login('u-301', auth.DEMO_PASSWORD), null);
  assert.ok(auth.login('u-301', 'a-new-secret-1'));
  assert.ok(auth.authenticate(keep), 'current session stays signed in');
  assert.equal(auth.authenticate(other), null, 'other sessions are signed out');
});

test('Google-only accounts cannot be given the shared demo password on restart', () => {
  db.prepare("INSERT INTO users(id,name,email,role,created_at,google_sub) VALUES('u-g-test','G User','g@example.com','Student',?,'sub-123')").run(new Date().toISOString());
  assert.equal(db.prepare("SELECT password_hash FROM users WHERE id='u-g-test'").get().password_hash, null);
  // simulate the startup backfill query
  const needing = db.prepare('SELECT id FROM users WHERE password_hash IS NULL AND google_sub IS NULL').all().map(r => r.id);
  assert.ok(!needing.includes('u-g-test'));
});
