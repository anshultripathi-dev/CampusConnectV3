// The pattern library's CampusRegistry hands out IDs from in-memory counters that
// restart at 1 on every boot. Persisted records must never be overwritten by a reused
// ID, so before generating one we move the counter past the highest ID in the database.
const { db } = require('./database');
const CampusRegistry = require('../../patterns/creational/singleton');

function maxSuffix(table, prefix) {
  const rows = db.prepare(`SELECT id FROM ${table} WHERE id LIKE ?`).all(`${prefix}-%`);
  return rows.reduce((m, r) => Math.max(m, parseInt(String(r.id).slice(prefix.length + 1), 10) || 0), 0);
}
function syncSequences() {
  const registry = CampusRegistry.getInstance();
  registry.nextTicketId = Math.max(registry.nextTicketId, maxSuffix('incidents', 'TCK') + 1);
  registry.nextBookingId = Math.max(registry.nextBookingId, maxSuffix('bookings', 'BKG') + 1);
}
module.exports = { syncSequences };
