// Versioned, idempotent schema migrations. Each migration runs once, inside a
// transaction, and is recorded in schema_migrations. Append new entries to the
// end of MIGRATIONS; never edit or reorder ones that have shipped.
const hasColumn = (db, table, column) => db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === column);
const addColumn = (db, table, column, definition) => {
  if (!hasColumn(db, table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
};

const MIGRATIONS = [
  {
    id: '001_booking_requester',
    up: db => addColumn(db, 'bookings', 'requester_id', 'TEXT'),
  },
  {
    id: '002_user_auth_columns',
    up: db => {
      addColumn(db, 'users', 'password_hash', 'TEXT');
      addColumn(db, 'users', 'google_sub', 'TEXT');
      addColumn(db, 'users', 'avatar_url', 'TEXT');
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub) WHERE google_sub IS NOT NULL');
    },
  },
  {
    id: '003_sessions',
    up: db => db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);`),
  },
  {
    id: '004_query_indexes',
    up: db => db.exec(`
      CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
      CREATE INDEX IF NOT EXISTS idx_incidents_dept_status ON incidents(department, status);
      CREATE INDEX IF NOT EXISTS idx_incidents_reporter ON incidents(reporter);
      CREATE INDEX IF NOT EXISTS idx_incidents_created ON incidents(created_at);
      CREATE INDEX IF NOT EXISTS idx_events_incident ON incident_events(incident_id, id);
      CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient, created_at);
      CREATE INDEX IF NOT EXISTS idx_bookings_room_time ON bookings(room, start_time, end_time);
      CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);`),
  },
  {
    id: '005_incident_attachments',
    up: db => db.exec(`
      CREATE TABLE IF NOT EXISTS incident_attachments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        incident_id TEXT NOT NULL,
        filename TEXT NOT NULL,
        mime TEXT NOT NULL,
        size INTEGER NOT NULL,
        storage_path TEXT NOT NULL,
        uploaded_by TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(incident_id) REFERENCES incidents(id)
      );
      CREATE INDEX IF NOT EXISTS idx_attachments_incident ON incident_attachments(incident_id);`),
  },
  {
    // Bookings now need approval. Existing rows were already blocking their rooms, so
    // they are grandfathered in as APPROVED rather than reappearing as new requests.
    id: '006_booking_approval',
    up: db => {
      addColumn(db, 'bookings', 'decided_by', 'TEXT');
      addColumn(db, 'bookings', 'decided_at', 'TEXT');
      addColumn(db, 'bookings', 'decision_note', 'TEXT');
      db.exec("UPDATE bookings SET status='APPROVED' WHERE status='PENDING'");
      db.exec('CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status, start_time)');
    },
  },
  {
    id: '007_booking_series',
    up: db => {
      addColumn(db, 'bookings', 'series_id', 'TEXT');
      addColumn(db, 'bookings', 'series_index', 'INTEGER');
      addColumn(db, 'bookings', 'series_total', 'INTEGER');
      addColumn(db, 'bookings', 'series_pattern', 'TEXT');
      db.exec('CREATE INDEX IF NOT EXISTS idx_bookings_series ON bookings(series_id)');
    },
  },
  {
    id: '008_incident_comments',
    up: db => db.exec(`
      CREATE TABLE IF NOT EXISTS incident_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        incident_id TEXT NOT NULL,
        author_id TEXT NOT NULL,
        body TEXT NOT NULL,
        internal INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        edited_at TEXT,
        deleted_at TEXT,
        FOREIGN KEY(incident_id) REFERENCES incidents(id)
      );
      CREATE INDEX IF NOT EXISTS idx_comments_incident ON incident_comments(incident_id, id);`),
  },
];

function migrate(db) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const applied = new Set(db.prepare('SELECT id FROM schema_migrations').all().map(r => r.id));
  const record = db.prepare('INSERT INTO schema_migrations(id, applied_at) VALUES(?, ?)');
  const ran = [];
  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    db.exec('BEGIN');
    try { m.up(db); record.run(m.id, new Date().toISOString()); db.exec('COMMIT'); ran.push(m.id); }
    catch (e) { db.exec('ROLLBACK'); throw new Error(`Migration ${m.id} failed: ${e.message}`); }
  }
  return ran;
}
module.exports = { migrate, MIGRATIONS };
