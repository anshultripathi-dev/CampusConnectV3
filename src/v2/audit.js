const { db } = require('./infrastructure/database');
const eventBus = require('./infrastructure/eventBus');
function snapshot(value) {
  if (value == null) return null;
  const seen = new WeakSet();
  return JSON.stringify(value, (key, val) => {
    if (key === 'state' || key === 'ticket') return undefined;
    if (typeof val === 'object' && val !== null) {
      if (seen.has(val)) return undefined;
      seen.add(val);
    }
    return val;
  });
}
function write({actor, action, entityType, entityId, beforeState=null, afterState=null}) {
  db.prepare(`INSERT INTO audit_logs(actor,action,entity_type,entity_id,before_state,after_state,created_at) VALUES(?,?,?,?,?,?,?)`)
    .run(actor || 'system', action, entityType, entityId, snapshot(beforeState), snapshot(afterState), new Date().toISOString());
  const item = db.prepare('SELECT * FROM audit_logs WHERE id=last_insert_rowid()').get();
  eventBus.publish('audit.created', item);
  return item;
}
function list({limit=100, entityType, entityId}={}) {
  let sql='SELECT * FROM audit_logs WHERE 1=1', params=[];
  if(entityType){sql+=' AND entity_type=?';params.push(entityType)}
  if(entityId){sql+=' AND entity_id=?';params.push(entityId)}
  sql+=' ORDER BY id DESC LIMIT ?';params.push(Math.min(Number(limit)||100,500));
  return db.prepare(sql).all(...params);
}
module.exports={write,list};
