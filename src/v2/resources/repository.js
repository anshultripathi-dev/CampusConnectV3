const { db } = require('../infrastructure/database');
function rooms() { return db.prepare(`SELECT r.*, f.name floor_name, b.name building_name FROM rooms r JOIN floors f ON f.id=r.floor_id JOIN buildings b ON b.id=f.building_id ORDER BY b.name,f.floor_number,r.code`).all().map(r=>({...r,capacity:Number(r.capacity),building:r.building_name,floor:r.floor_name})); }
function equipment() { return db.prepare(`SELECT e.*, et.name type_name, et.type FROM equipment e JOIN equipment_types et ON et.id=e.equipment_type_id ORDER BY e.name`).all().map(e=>({...e,typeName:e.type_name})); }
function bookings(requesterId=null) {
  const rows = requesterId
    ? db.prepare('SELECT * FROM bookings WHERE requester_id=? ORDER BY datetime(start_time) ASC').all(requesterId)
    : db.prepare('SELECT * FROM bookings ORDER BY datetime(start_time) ASC').all();
  const names = new Map(db.prepare('SELECT id,name FROM users').all().map(u => [u.id, u.name]));
  const equipmentOf = db.prepare('SELECT equipment_id FROM booking_equipment WHERE booking_id=?');
  return rows.map(b => ({
    ...b,
    attendees: Number(b.attendees),
    recurring: Boolean(b.recurring),
    requesterId: b.requester_id || null,
    requesterName: names.get(b.requester_id) || b.requester_id || 'Unknown',
    requesterProfile: b.requester_profile_json ? JSON.parse(b.requester_profile_json) : null,
    decidedBy: b.decided_by || null,
    decidedByName: names.get(b.decided_by) || null,
    decidedAt: b.decided_at || null,
    decisionNote: b.decision_note || null,
    seriesId: b.series_id || null,
    seriesIndex: b.series_index || null,
    seriesTotal: b.series_total || null,
    seriesPattern: b.series_pattern || null,
    equipment: equipmentOf.all(b.id).map(x => x.equipment_id),
  }));
}
function booking(id) { return bookings().find(b=>b.id===id)||null; }
function createBooking(b) {
  const series = b.series || {};
  db.prepare(`INSERT INTO bookings(id,room,start_time,end_time,attendees,purpose,recurring,status,requester_profile_json,requester_id,created_at,series_id,series_index,series_total,series_pattern)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(b.id, b.room, b.startTime, b.endTime, b.attendees || 0, b.purpose || '', b.recurring ? 1 : 0, b.status || 'PENDING',
    b.requesterProfile ? JSON.stringify(b.requesterProfile) : null, b.requesterId || null, b.createdAt || new Date().toISOString(),
    series.id || null, series.index || null, series.total || null, series.pattern || null);
  const ins = db.prepare('INSERT INTO booking_equipment(booking_id,equipment_id) VALUES(?,?)');
  (b.equipment || []).forEach(id => ins.run(b.id, id));
  return booking(b.id);
}
function seriesBookings(seriesId) { return bookings().filter(b => b.seriesId === seriesId).sort((a, b) => a.start_time.localeCompare(b.start_time)); }
// Only APPROVED bookings hold a room; a pending request does not block anyone.
function conflicts(room,start,end,excludeId=null) { return db.prepare(`SELECT * FROM bookings WHERE room=? AND status='APPROVED' AND (? < end_time AND ? > start_time) AND (? IS NULL OR id != ?)`).all(room,start,end,excludeId,excludeId); }
// Requests still competing for the same slot (used to warn approvers).
function pendingOverlaps(room,start,end,excludeId=null) { return db.prepare(`SELECT * FROM bookings WHERE room=? AND status='PENDING' AND (? < end_time AND ? > start_time) AND (? IS NULL OR id != ?)`).all(room,start,end,excludeId,excludeId); }
function setDecision(id,{status,decidedBy,note}) { db.prepare('UPDATE bookings SET status=?, decided_by=?, decided_at=?, decision_note=? WHERE id=?').run(status,decidedBy||null,new Date().toISOString(),note||null,id); return booking(id); }
function pendingCount() { return db.prepare("SELECT COUNT(*) n FROM bookings WHERE status='PENDING' AND end_time > ?").get(new Date().toISOString()).n; }
function campusTree() { const campus=db.prepare('SELECT * FROM campuses LIMIT 1').get(); const buildings=db.prepare('SELECT * FROM buildings WHERE campus_id=?').all(campus.id); return {name:campus.name,buildings:buildings.map(b=>({name:b.name,floors:db.prepare('SELECT * FROM floors WHERE building_id=? ORDER BY floor_number').all(b.id).map(f=>({name:f.name,rooms:db.prepare('SELECT code FROM rooms WHERE floor_id=? ORDER BY code').all(f.id).map(r=>r.code)}))}))}; }
module.exports={rooms,equipment,bookings,booking,createBooking,seriesBookings,conflicts,pendingOverlaps,setDecision,pendingCount,campusTree};
