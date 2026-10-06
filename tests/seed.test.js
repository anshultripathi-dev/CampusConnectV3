const os = require('os');
const path = require('path');
const fs = require('fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-seed-'));
process.env.CAMPUSCONNECT_DB = path.join(tmp, 'seed.db');
process.env.NODE_ENV = 'production';
delete process.env.CAMPUSCONNECT_SEED_DEMO;
const { db } = require('../src/v2/infrastructure/database');
const { seedDemoData } = require('../src/v2/seedDemoData');
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('production starts with reference data only — no demo incidents, bookings or comments', () => {
  seedDemoData();
  const n = t => db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;
  assert.equal(n('incidents'), 0);
  assert.equal(n('bookings'), 0);
  assert.equal(n('incident_comments'), 0);
  assert.ok(n('rooms') > 0 && n('users') > 0 && n('departments') > 0, 'reference data is still seeded');
});

test('CAMPUSCONNECT_SEED_DEMO=1 opts in to demo content even in production', () => {
  process.env.CAMPUSCONNECT_SEED_DEMO = '1';
  seedDemoData();
  assert.ok(db.prepare('SELECT COUNT(*) n FROM incidents').get().n >= 10);
});
