// V3 smoke test uses only Node 22's built-in SQLite and the project modules.
// It does not require Express or an external database server.
const fs = require('fs');
const os = require('os');
const path = require('path');
// Always use a throwaway database so the smoke test can never touch real data.
const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-smoke-'));
process.env.CAMPUSCONNECT_DB = path.join(dbDir, 'smoke.db');
process.on('exit', () => { try { fs.rmSync(dbDir, { recursive: true, force: true }); } catch {} });

require('../src/v2/infrastructure/database');
const incidents = require('../src/v2/incidents/service');
const resources = require('../src/v2/resources/service');
const tracer = require('../src/v2/infrastructure/patternTracer');
const eventBus = require('../src/v2/infrastructure/eventBus');

let emittedIncident;
eventBus.subscribe('incident.created', payload => {
  // Socket.IO serializes events. This guards against circular domain objects.
  JSON.stringify(payload);
  emittedIncident = payload.ticket;
});

const incident = incidents.create({
  category: 'Maintenance',
  subCategory: 'Electrical',
  severity: 'High',
  title: 'Sparking socket in Lab 204',
  description: 'Electrical sparks coming from a socket in the lab.',
  location: 'TT-301',
  reporter: 'Demo Student',
});
if (!incident.success || incident.ticket.status !== 'Submitted') throw new Error('Incident creation failed');
if (!emittedIncident || emittedIncident.state || emittedIncident.status !== 'Submitted') throw new Error('Incident event is not a serializable DTO');

for (const [action, payload] of [
  ['assign', { role: 'Maintenance', staffId: 'u-101' }],
  ['start', { role: 'Maintenance' }],
  ['markDone', { role: 'Maintenance', note: 'Socket replaced' }],
  ['approve', { role: 'Admin', resolutionNote: 'Verified by facilities' }],
]) {
  const result = incidents.command(incident.ticket.id, action, payload);
  if (!result.success) throw new Error(`${action} failed: ${result.error}`);
}

const undoIncident = incidents.create({
  category: 'Maintenance',
  subCategory: 'Electrical',
  severity: 'Medium',
  title: 'Undo command verification',
  description: 'Verify persistent command history and undo.',
  location: 'TT-301',
  reporter: 'Demo Student',
});
if (!undoIncident.success) throw new Error('Undo test incident creation failed');
const assignedForUndo = incidents.command(undoIncident.ticket.id, 'assign', { role: 'Maintenance', staffId: 'u-101', actor: 'u-101' });
if (!assignedForUndo.success || assignedForUndo.ticket.status !== 'Assigned') throw new Error('Persistent command creation failed');
const undone = incidents.undo(undoIncident.ticket.id, 'u-101');
if (!undone.success || undone.ticket.status !== 'Submitted') throw new Error('Persistent undo failed');
const undoHistory = incidents.commandHistory(undoIncident.ticket.id);
if (!undoHistory[0]?.undone_at) throw new Error('Undo was not persisted');

// Dates relative to now, so the test never goes stale.
const at = (dayOffset, hour) => { const d = new Date(Date.now() + dayOffset * 86400000); d.setUTCHours(hour, 0, 0, 0); return d.toISOString(); };
const booking = resources.create({
  room: 'TT-301',
  startTime: at(5, 10),
  endTime: at(5, 12),
  attendees: 20,
  purpose: 'Project Review',
  equipment: ['eq-projector'],
});
if (!booking.id) throw new Error('Booking creation failed');
if (booking.status !== 'PENDING') throw new Error('New bookings must start PENDING');

const overlapsPending = resources.create({
  room: 'TT-301', startTime: at(5, 11), endTime: at(5, 13), attendees: 5, purpose: 'Competing request',
});
if (!overlapsPending.id) throw new Error('A pending booking must not block a room');

const approval = require('../src/v2/resources/approval');
const approver = { id: 'u-103', role: 'FacilitiesHead' };
if (approval.decide(booking.id, 'approve', approver).status !== 'APPROVED') throw new Error('Approval failed');
let blocked = false;
try { approval.decide(overlapsPending.id, 'approve', approver); } catch (e) { blocked = e.status === 409; }
if (!blocked) throw new Error('Approving a clashing request must be refused');

const conflict = resources.create({
  room: 'TT-301',
  startTime: at(5, 11),
  endTime: at(5, 13),
  attendees: 20,
  purpose: 'Conflict Test',
});
if (conflict.status !== 409) throw new Error('Conflict detection failed');

const trace = tracer.get(incident.traceId);
if (!trace || trace.steps.length < 4) throw new Error('Pattern trace was not recorded');

console.log('CampusConnect V3 smoke test: PASS');
console.log(`Incident: ${incident.ticket.id} → Resolved`);
console.log(`Booking: ${booking.id} → conflict detection PASS`);
console.log(`Command: ${undoIncident.ticket.id} → persistent undo PASS`);
console.log(`Trace: ${incident.traceId} → ${trace.steps.map(s => s.pattern).join(' → ')}`);
