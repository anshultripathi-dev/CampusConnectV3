const { db } = require('../infrastructure/database');
const eventBus = require('../infrastructure/eventBus');
const { EmailChannel, SMSChannel, PushChannel, StatusUpdateNotification, EscalationNotification } = require('../../patterns/structural/bridge');

function notify({recipient='operations',channel='IN_APP',title,message,referenceType,referenceId}) {
  const createdAt=new Date().toISOString();
  const channels={EMAIL:new EmailChannel(),SMS:new SMSChannel(),PUSH:new PushChannel(),IN_APP:null};
  if (channels[channel]) {
    const NotificationType = title.toLowerCase().includes('escalat') ? EscalationNotification : StatusUpdateNotification;
    try { new NotificationType(channels[channel]).notify(recipient,{title,message,referenceId}); } catch {}
  }
  db.prepare('INSERT INTO notifications(recipient,channel,title,message,reference_type,reference_id,created_at) VALUES(?,?,?,?,?,?,?)').run(recipient,channel,title,message,referenceType||null,referenceId||null,createdAt);
  const item=db.prepare('SELECT * FROM notifications WHERE id=last_insert_rowid()').get();
  eventBus.publish('notification.created', item);
  return item;
}
// A notification's `recipient` is a user id, a department name, or 'operations'
// (all management roles). A user's inbox is everything addressed to any of those.
const MANAGEMENT = ['Supervisor', 'FacilitiesHead', 'SecurityHead', 'Admin'];
function audienceFor(user) {
  const a = [user.id];
  if (user.department) a.push(user.department);
  if (MANAGEMENT.includes(user.role)) a.push('operations');
  return a;
}
const marks = a => a.map(() => '?').join(',');
function listFor(user) { const a = audienceFor(user); return db.prepare(`SELECT * FROM notifications WHERE recipient IN (${marks(a)}) ORDER BY id DESC LIMIT 50`).all(...a); }
function markReadFor(id, user) { const a = audienceFor(user); const r = db.prepare(`UPDATE notifications SET read_at=? WHERE id=? AND recipient IN (${marks(a)})`).run(new Date().toISOString(), id, ...a); return { success: r.changes > 0 }; }
function markAllReadFor(user) { const a = audienceFor(user); db.prepare(`UPDATE notifications SET read_at=? WHERE read_at IS NULL AND recipient IN (${marks(a)})`).run(new Date().toISOString(), ...a); }
module.exports = { notify, listFor, markReadFor, markAllReadFor, audienceFor, MANAGEMENT };
