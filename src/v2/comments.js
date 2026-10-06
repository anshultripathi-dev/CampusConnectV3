// Comments on incidents.
//  • Public comments are visible to everyone who can see the incident (including the reporter).
//  • Internal notes are staff-only: students never receive them, over HTTP or live events.
const { db } = require('./infrastructure/database');
const audit = require('./audit');
const notifications = require('./notifications/service');
const eventBus = require('./infrastructure/eventBus');
const incidentRepo = require('./incidents/repository');

const MAX_LENGTH = 1000;
const MAX_PER_MINUTE = 10;
const MANAGEMENT = ['Supervisor', 'FacilitiesHead', 'SecurityHead', 'Admin'];
const isStaff = user => user.role !== 'Student';
const fail = (status, error) => Object.assign(new Error(error), { status });
const snippet = text => (text.length > 90 ? `${text.slice(0, 87)}…` : text);

function shape(row) {
  return { id: row.id, incidentId: row.incident_id, authorId: row.author_id, authorName: row.author_name || row.author_id, authorRole: row.author_role || null,
    body: row.body, internal: Boolean(row.internal), createdAt: row.created_at, editedAt: row.edited_at || null };
}
const SELECT = `SELECT c.*, u.name AS author_name, u.role AS author_role FROM incident_comments c LEFT JOIN users u ON u.id=c.author_id`;

function list(incidentId, user) {
  const rows = db.prepare(`${SELECT} WHERE c.incident_id=? AND c.deleted_at IS NULL ${isStaff(user) ? '' : 'AND c.internal=0'} ORDER BY c.id`).all(incidentId);
  return rows.map(shape);
}

function counts(incidentIds, user) {
  if (!incidentIds.length) return {};
  const marks = incidentIds.map(() => '?').join(',');
  const rows = db.prepare(`SELECT incident_id, COUNT(*) n FROM incident_comments WHERE deleted_at IS NULL ${isStaff(user) ? '' : 'AND internal=0'} AND incident_id IN (${marks}) GROUP BY incident_id`).all(...incidentIds);
  return Object.fromEntries(rows.map(r => [r.incident_id, r.n]));
}

function clean(body) {
  const text = String(body ?? '').trim();
  if (!text) throw fail(400, 'Write something first');
  if (text.length > MAX_LENGTH) throw fail(400, `Comments are limited to ${MAX_LENGTH} characters`);
  return text;
}

function add(incidentId, user, { body, internal = false }) {
  const incident = incidentRepo.get(incidentId);
  if (!incident) throw fail(404, 'Incident not found');
  if (incident.status === 'Closed') throw fail(409, 'Closed incidents cannot be commented on — reopen it first');
  const text = clean(body);
  const isInternal = Boolean(internal);
  if (isInternal && !isStaff(user)) throw fail(403, 'Only staff can write internal notes');
  const recent = db.prepare('SELECT COUNT(*) n FROM incident_comments WHERE author_id=? AND created_at > ?').get(user.id, new Date(Date.now() - 60000).toISOString()).n;
  if (recent >= MAX_PER_MINUTE) throw fail(429, 'You are commenting too quickly. Please wait a moment.');

  const info = db.prepare('INSERT INTO incident_comments(incident_id,author_id,body,internal,created_at) VALUES(?,?,?,?,?)').run(incidentId, user.id, text, isInternal ? 1 : 0, new Date().toISOString());
  const comment = shape(db.prepare(`${SELECT} WHERE c.id=?`).get(info.lastInsertRowid));

  // Tell the other side: reporter ⇄ the people handling it. Internal notes never reach the reporter.
  const title = `${isInternal ? 'Internal note' : 'New comment'} on ${incidentId}`;
  const message = `${user.name}: ${snippet(text)}`;
  const send = recipient => recipient && recipient !== user.id && notifications.notify({ recipient, title, message, referenceType: 'incident', referenceId: incidentId });
  if (!isInternal && incident.reporter && incident.reporter !== user.id) send(incident.reporter);
  if (incident.assignedTo) send(incident.assignedTo);
  if (user.id === incident.reporter || !incident.assignedTo) send(incident.department || 'operations');
  else if (isInternal) send(incident.department);

  eventBus.publish('incident.comment', { incidentId, incident, internal: isInternal, comment: { id: comment.id, authorId: user.id } });
  return comment;
}

function loadOwned(id, user) {
  const row = db.prepare('SELECT * FROM incident_comments WHERE id=? AND deleted_at IS NULL').get(id);
  if (!row) throw fail(404, 'Comment not found');
  return row;
}

function edit(id, user, body) {
  const row = loadOwned(id, user);
  if (row.author_id !== user.id) throw fail(403, 'You can only edit your own comments');
  const text = clean(body);
  db.prepare('UPDATE incident_comments SET body=?, edited_at=? WHERE id=?').run(text, new Date().toISOString(), id);
  return shape(db.prepare(`${SELECT} WHERE c.id=?`).get(id));
}

function remove(id, user) {
  const row = loadOwned(id, user);
  if (row.author_id !== user.id && !MANAGEMENT.includes(user.role)) throw fail(403, 'You can only delete your own comments');
  db.prepare('UPDATE incident_comments SET deleted_at=? WHERE id=?').run(new Date().toISOString(), id);
  audit.write({ actor: user.id, action: 'INCIDENT_COMMENT_DELETED', entityType: 'incident', entityId: row.incident_id, beforeState: { commentId: id, author: row.author_id, internal: Boolean(row.internal) } });
  return { success: true };
}
module.exports = { list, counts, add, edit, remove, MAX_LENGTH };
