// Run with: npm test  (uses a throwaway SQLite file, never the real database)
const os = require('os');
const path = require('path');
const fs = require('fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cc-test-')), 'test.db');
process.env.CAMPUSCONNECT_DB = dbFile;
process.env.NODE_ENV = 'test';
delete process.env.GOOGLE_CLIENT_ID;
delete process.env.CAMPUSCONNECT_DEMO;

require('../src/v2/infrastructure/database');
const { seedDemoData } = require('../src/v2/seedDemoData');
seedDemoData();
const { db } = require('../src/v2/infrastructure/database');
const auth = require('../src/v2/auth');
const rateLimit = require('../src/v2/rateLimit');

test.after(() => fs.rmSync(path.dirname(dbFile), { recursive: true, force: true }));

test('password login returns a token and the user, without secrets', () => {
  const r = auth.login('u-101', auth.DEMO_PASSWORD);
  assert.ok(r.token && r.token.length === 64);
  assert.equal(r.user.id, 'u-101');
  assert.equal('password_hash' in r.user, false);
});

test('login accepts email case-insensitively and rejects bad credentials', () => {
  assert.ok(auth.login('STUDENT@campusconnect.local', auth.DEMO_PASSWORD));
  assert.equal(auth.login('u-101', 'wrong'), null);
  assert.equal(auth.login('nobody', auth.DEMO_PASSWORD), null);
  assert.equal(auth.login('u-101', ''), null);
});

test('sessions are stored hashed, authenticate, and are revoked on logout', () => {
  const { token } = auth.login('u-102', auth.DEMO_PASSWORD);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions WHERE token_hash=?').get(token).n, 0, 'raw token must not be stored');
  assert.equal(auth.authenticate(token).id, 'u-102');
  auth.logout(token);
  assert.equal(auth.authenticate(token), null);
});

test('expired sessions are rejected and removed', () => {
  const { token } = auth.login('u-101', auth.DEMO_PASSWORD);
  db.prepare('UPDATE sessions SET expires_at=?').run(Date.now() - 1000);
  assert.equal(auth.authenticate(token), null);
  const hash = require('crypto').createHash('sha256').update(token).digest('hex');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions WHERE token_hash=?').get(hash).n, 0);
});

test('authenticate ignores empty and unknown tokens', () => {
  assert.equal(auth.authenticate(''), null);
  assert.equal(auth.authenticate('deadbeef'), null);
});

test('requireAuth gates on the bearer token', () => {
  const { token } = auth.login('u-101', auth.DEMO_PASSWORD);
  const run = header => {
    const res = { code: 200, status(c) { this.code = c; return this; }, json() { return this; } };
    let called = false;
    const req = { get: () => header };
    auth.requireAuth(req, res, () => { called = true; });
    return { called, code: res.code, user: req.user };
  };
  assert.equal(run('').code, 401);
  assert.equal(run('Bearer nope').code, 401);
  const ok = run(`Bearer ${token}`);
  assert.ok(ok.called);
  assert.equal(ok.user.id, 'u-101');
});

test('role permissions: students cannot run commands, admins can close', () => {
  assert.equal(auth.canCommand('Student', 'assign'), false);
  assert.equal(auth.canCommand('Admin', 'close'), true);
  assert.equal(auth.canCommand('Maintenance', 'close'), false);
});

test('Google sign-in is disabled without a client ID', async () => {
  assert.equal(auth.googleEnabled(), false);
  await assert.rejects(() => auth.loginWithGoogle('x'), { status: 503 });
});

test('rateLimit blocks after max hits per IP and sets Retry-After', () => {
  const limiter = rateLimit({ max: 3, windowMs: 60_000 });
  const hit = ip => {
    const headers = {};
    const res = { code: 200, set(k, v) { headers[k] = v; }, status(c) { this.code = c; return this; }, json() {} };
    let passed = false;
    limiter({ ip }, res, () => { passed = true; });
    return { passed, code: res.code, headers };
  };
  assert.ok([1, 2, 3].every(() => hit('1.1.1.1').passed));
  const blocked = hit('1.1.1.1');
  assert.equal(blocked.passed, false);
  assert.equal(blocked.code, 429);
  assert.ok(Number(blocked.headers['Retry-After']) > 0);
  assert.ok(hit('2.2.2.2').passed, 'other IPs are unaffected');
});
