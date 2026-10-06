const { db } = require('../infrastructure/database');

function mapRow(r) {
  if (!r) return null;
  return {
    ...r,
    priorityScore: Number(r.priority_score || 0),
    reporterContact: r.reporter_contact,
    subCategory: r.subcategory,
    assignedTo: r.assigned_to,
    suggestedRoute: r.suggested_route,
    roomCode: r.room_code,
    slaHours: Number(r.sla_hours || 24),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    resolvedAt: r.resolved_at,
  };
}
function get(id) { return mapRow(db.prepare('SELECT * FROM incidents WHERE id=?').get(id)); }
function list(filters = {}) {
  let sql = 'SELECT * FROM incidents WHERE 1=1'; const args = [];
  if (filters.department) { sql += ' AND department=?'; args.push(filters.department); }
  if (filters.status) { sql += ' AND status=?'; args.push(filters.status); }
  if (filters.category) { sql += ' AND category=?'; args.push(filters.category); }
  if (filters.reporter) { sql += ' AND reporter=?'; args.push(filters.reporter); }
  sql += ' ORDER BY datetime(created_at) DESC';
  return db.prepare(sql).all(...args).map(mapRow);
}
function save(t) {
  const status = (t.state && t.state.current) || t.status || 'Submitted';
  db.prepare(`INSERT INTO incidents
    (id,ticket_number,title,description,category,subcategory,severity,priority_score,status,reporter,reporter_contact,department,assigned_to,location,room_code,suggested_route,sla_hours,created_at,updated_at,resolved_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,category=excluded.category,subcategory=excluded.subcategory,severity=excluded.severity,priority_score=excluded.priority_score,status=excluded.status,reporter=excluded.reporter,reporter_contact=excluded.reporter_contact,department=excluded.department,assigned_to=excluded.assigned_to,location=excluded.location,room_code=excluded.room_code,suggested_route=excluded.suggested_route,sla_hours=excluded.sla_hours,updated_at=excluded.updated_at,resolved_at=excluded.resolved_at`).run(
    t.id, t.id, t.title, t.description, t.category, t.subCategory || null, t.severity || null, t.priorityScore || 1, status, t.reporter || null, t.reporterContact || null, t.department || null, t.assignedTo || null, t.location || null, t.roomCode || null, t.suggestedRoute || null, t.slaHours || 24, t.createdAt, t.updatedAt, t.resolvedAt || null);
  return get(t.id);
}
function addEvent(id, event) {
  db.prepare('INSERT INTO incident_events(incident_id,actor,event_type,from_status,to_status,message,metadata_json,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id,event.actor||'system',event.eventType,event.fromStatus||null,event.toStatus||null,event.message||'',JSON.stringify(event.metadata||{}),event.at||new Date().toISOString());
}
function history(id) { return db.prepare('SELECT * FROM incident_events WHERE incident_id=? ORDER BY id ASC').all(id).map(e => ({ id:e.id, actor:e.actor, event:e.event_type, fromStatus:e.from_status, toStatus:e.to_status, message:e.message, metadata:JSON.parse(e.metadata_json||'{}'), at:e.created_at })); }
function snapshot(id, obj) { const safe = {...obj}; delete safe.state; db.prepare('INSERT INTO incident_snapshots(incident_id,snapshot_json,created_at) VALUES(?,?,?)').run(id,JSON.stringify(safe),new Date().toISOString()); }
function latestSnapshot(id) { const r=db.prepare('SELECT * FROM incident_snapshots WHERE incident_id=? ORDER BY id DESC LIMIT 1').get(id); return r ? JSON.parse(r.snapshot_json) : null; }
function addAIAnalysis(id, result) { db.prepare('INSERT INTO ai_analyses(incident_id,provider,category,subcategory,severity,confidence,summary,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id,result.source||'heuristic',result.category||null,result.subCategory||null,result.severity||null,String(result.confidence||''),result.summary||'',new Date().toISOString()); }
function aiAnalysis(id) { return db.prepare('SELECT * FROM ai_analyses WHERE incident_id=? ORDER BY id DESC LIMIT 1').get(id); }
function recordCommand({incidentId,actor,action,beforeState,afterState}) {
  const r=db.prepare('INSERT INTO command_history(incident_id,actor,action,before_state,after_state,created_at) VALUES(?,?,?,?,?,?)')
    .run(incidentId,actor||'system',action,JSON.stringify(beforeState),JSON.stringify(afterState),new Date().toISOString());
  return db.prepare('SELECT * FROM command_history WHERE id=?').get(r.lastInsertRowid);
}
function commandHistory(id,{includeUndone=true,limit=50}={}) {
  let sql='SELECT * FROM command_history WHERE incident_id=?'; const args=[id];
  if(!includeUndone) sql+=' AND undone_at IS NULL';
  sql+=' ORDER BY id DESC LIMIT ?'; args.push(Math.min(Number(limit)||50,200));
  return db.prepare(sql).all(...args).map(r=>({...r,beforeState:JSON.parse(r.before_state),afterState:JSON.parse(r.after_state)}));
}
function latestUndoableCommand(id) {
  const r=db.prepare('SELECT * FROM command_history WHERE incident_id=? AND undone_at IS NULL ORDER BY id DESC LIMIT 1').get(id);
  return r?{...r,beforeState:JSON.parse(r.before_state),afterState:JSON.parse(r.after_state)}:null;
}
function markCommandUndone(id) { db.prepare('UPDATE command_history SET undone_at=? WHERE id=?').run(new Date().toISOString(),id); }
// Escalation (Chain of Responsibility) is logged as an event rather than a
// ticket status, so "how many open incidents have been escalated" has to be
// derived from the event log rather than a status filter.
function escalatedOpenIds() {
  return db.prepare(`
    SELECT DISTINCT e.incident_id AS id FROM incident_events e
    JOIN incidents i ON i.id = e.incident_id
    WHERE e.event_type = 'ESCALATED' AND i.status NOT IN ('Resolved','Closed')
  `).all().map(r => r.id);
}
module.exports = { get, list, save, addEvent, history, snapshot, latestSnapshot, addAIAnalysis, aiAnalysis, recordCommand, commandHistory, latestUndoableCommand, markCommandUndone, escalatedOpenIds };
