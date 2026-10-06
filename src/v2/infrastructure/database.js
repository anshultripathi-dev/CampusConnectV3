const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const seed = require('../../../data/seed.json');

const dataDir = path.join(__dirname, '../../../data');
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = process.env.CAMPUSCONNECT_DB || path.join(dataDir, 'campusconnect.db');
const db = new DatabaseSync(dbPath);

db.exec(`
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  role TEXT NOT NULL,
  department_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(department_id) REFERENCES departments(id)
);
CREATE TABLE IF NOT EXISTS campuses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS buildings (
  id TEXT PRIMARY KEY,
  campus_id TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  latitude REAL,
  longitude REAL,
  FOREIGN KEY(campus_id) REFERENCES campuses(id)
);
CREATE TABLE IF NOT EXISTS floors (
  id TEXT PRIMARY KEY,
  building_id TEXT NOT NULL,
  name TEXT NOT NULL,
  floor_number INTEGER NOT NULL,
  FOREIGN KEY(building_id) REFERENCES buildings(id)
);
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  floor_id TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 20,
  status TEXT NOT NULL DEFAULT 'AVAILABLE',
  FOREIGN KEY(floor_id) REFERENCES floors(id)
);
CREATE TABLE IF NOT EXISTS equipment_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS equipment (
  id TEXT PRIMARY KEY,
  equipment_type_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'AVAILABLE',
  room_id TEXT,
  FOREIGN KEY(equipment_type_id) REFERENCES equipment_types(id),
  FOREIGN KEY(room_id) REFERENCES rooms(id)
);
CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  ticket_number TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT,
  severity TEXT,
  priority_score REAL DEFAULT 1,
  status TEXT NOT NULL,
  reporter TEXT,
  reporter_contact TEXT,
  department TEXT,
  assigned_to TEXT,
  location TEXT,
  room_code TEXT,
  suggested_route TEXT,
  sla_hours REAL DEFAULT 24,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE TABLE IF NOT EXISTS incident_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id TEXT NOT NULL,
  actor TEXT,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  message TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(incident_id) REFERENCES incidents(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS incident_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(incident_id) REFERENCES incidents(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  room TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  attendees INTEGER DEFAULT 0,
  purpose TEXT DEFAULT '',
  recurring INTEGER DEFAULT 0,
  status TEXT DEFAULT 'PENDING',
  requester_profile_json TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS booking_equipment (
  booking_id TEXT NOT NULL,
  equipment_id TEXT NOT NULL,
  PRIMARY KEY(booking_id, equipment_id),
  FOREIGN KEY(booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY(equipment_id) REFERENCES equipment(id)
);
CREATE TABLE IF NOT EXISTS booking_templates (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  template_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_state TEXT,
  after_state TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS command_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id TEXT NOT NULL,
  actor TEXT,
  action TEXT NOT NULL,
  before_state TEXT NOT NULL,
  after_state TEXT NOT NULL,
  created_at TEXT NOT NULL,
  undone_at TEXT,
  FOREIGN KEY(incident_id) REFERENCES incidents(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_command_history_incident ON command_history(incident_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id, id DESC);
CREATE TABLE IF NOT EXISTS ai_analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  category TEXT,
  subcategory TEXT,
  severity TEXT,
  confidence TEXT,
  summary TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(incident_id) REFERENCES incidents(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient TEXT,
  channel TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  reference_type TEXT,
  reference_id TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pattern_traces (
  trace_id TEXT PRIMARY KEY,
  operation TEXT NOT NULL,
  context_json TEXT NOT NULL,
  steps_json TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT
);
`);

require('./migrations').migrate(db);

function count(table) { return db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count; }

function seedReferenceData() {
  const now = new Date().toISOString();
  const departments = [
    ['dept-maintenance', 'Maintenance', 'Campus infrastructure and maintenance'],
    ['dept-security', 'Security', 'Campus safety and security'],
    ['dept-it', 'IT', 'Information technology support'],
    ['dept-facilities', 'Facilities', 'Facilities administration and approvals'],
  ];
  const insertDept = db.prepare('INSERT OR IGNORE INTO departments(id,name,description) VALUES(?,?,?)');
  departments.forEach(d => insertDept.run(...d));

  const deptMap = { Maintenance:'dept-maintenance', Security:'dept-security', IT:'dept-it', Facilities:'dept-facilities' };
  const insertUser = db.prepare('INSERT OR IGNORE INTO users(id,name,email,role,department_id,created_at) VALUES(?,?,?,?,?,?)');
  seed.staff.forEach(s => insertUser.run(s.id, s.name, `${s.id}@campusconnect.local`, s.role, deptMap[s.department] || 'dept-facilities', now));
  insertUser.run('u-student', 'Campus Student', 'student@campusconnect.local', 'Student', null, now);

  if (!count('campuses')) {
    const campusId = 'campus-main';
    db.prepare('INSERT INTO campuses(id,name,location) VALUES(?,?,?)').run(campusId, seed.campus.name, 'Main Campus');
    let buildingNo = 1, floorNo = 1, roomNo = 1;
    for (const building of seed.campus.buildings) {
      const bid = `bld-${buildingNo++}`;
      db.prepare('INSERT INTO buildings(id,campus_id,name,code) VALUES(?,?,?,?)').run(bid, campusId, building.name, `BLD-${buildingNo - 1}`);
      for (let i = 0; i < building.floors.length; i++) {
        const floor = building.floors[i];
        const fid = `floor-${floorNo++}`;
        db.prepare('INSERT INTO floors(id,building_id,name,floor_number) VALUES(?,?,?,?)').run(fid, bid, floor.name, i + 1);
        for (const code of floor.rooms) {
          db.prepare('INSERT INTO rooms(id,floor_id,code,name,capacity,status) VALUES(?,?,?,?,?,?)').run(`room-${roomNo++}`, fid, code, code, 40, 'AVAILABLE');
        }
      }
    }
  }

  const insertType = db.prepare('INSERT OR IGNORE INTO equipment_types(id,name,type) VALUES(?,?,?)');
  const insertEquipment = db.prepare('INSERT OR IGNORE INTO equipment(id,equipment_type_id,name,status) VALUES(?,?,?,?)');
  seed.equipment.forEach(e => {
    const typeId = `etype-${e.id}`;
    insertType.run(typeId, e.name, e.type);
    insertEquipment.run(e.id, typeId, e.name, 'AVAILABLE');
  });
}

seedReferenceData();
module.exports = { db, dbPath };
