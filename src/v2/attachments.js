// Photo attachments for incidents. Files live on disk under data/uploads/<incident>/
// with a random name; the client-supplied filename is only ever used for display.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { db } = require('./infrastructure/database');

const ROOT = path.resolve(process.env.CAMPUSCONNECT_UPLOADS || path.join(__dirname, '../../data/uploads'));
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_PER_INCIDENT = 5;
const TYPES = {
  'image/jpeg': { ext: 'jpg', magic: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { ext: 'png', magic: b => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/webp': { ext: 'webp', magic: b => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' },
};
const fail = (status, error) => Object.assign(new Error(error), { status });
const publicRow = r => ({ id: r.id, incidentId: r.incident_id, filename: r.filename, mime: r.mime, size: r.size, uploadedBy: r.uploaded_by, createdAt: r.created_at });

function list(incidentId) {
  return db.prepare('SELECT * FROM incident_attachments WHERE incident_id=? ORDER BY id').all(incidentId).map(publicRow);
}
function add(incidentId, { filename, mime, data }, uploader) {
  const type = TYPES[mime];
  if (!type) throw fail(415, 'Only JPEG, PNG or WebP images are allowed');
  if (typeof data !== 'string' || !data) throw fail(400, 'Image data is required');
  const buf = Buffer.from(data, 'base64');
  if (!buf.length) throw fail(400, 'Image data is empty');
  if (buf.length > MAX_BYTES) throw fail(413, 'Image is larger than 2 MB');
  if (!type.magic(buf)) throw fail(415, 'File contents do not match the declared image type');
  const count = db.prepare('SELECT COUNT(*) n FROM incident_attachments WHERE incident_id=?').get(incidentId).n;
  if (count >= MAX_PER_INCIDENT) throw fail(409, `At most ${MAX_PER_INCIDENT} photos per incident`);
  const dir = path.join(ROOT, incidentId.replace(/[^A-Za-z0-9_-]/g, '_'));
  fs.mkdirSync(dir, { recursive: true });
  const stored = `${crypto.randomUUID()}.${type.ext}`;
  fs.writeFileSync(path.join(dir, stored), buf);
  const displayName = String(filename || 'photo').split(/[\\/]/).pop().replace(/[^\w.\- ]/g, '').slice(0, 80) || 'photo';
  const info = db.prepare('INSERT INTO incident_attachments(incident_id,filename,mime,size,storage_path,uploaded_by,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(incidentId, displayName, mime, buf.length, path.relative(ROOT, path.join(dir, stored)), uploader, new Date().toISOString());
  return publicRow(db.prepare('SELECT * FROM incident_attachments WHERE id=?').get(info.lastInsertRowid));
}
function file(incidentId, id) {
  const row = db.prepare('SELECT * FROM incident_attachments WHERE id=? AND incident_id=?').get(id, incidentId);
  if (!row) return null;
  const abs = path.resolve(ROOT, row.storage_path);
  if (!abs.startsWith(ROOT + path.sep) || !fs.existsSync(abs)) return null;
  return { row: publicRow(row), abs };
}
function remove(incidentId, id, user) {
  const row = db.prepare('SELECT * FROM incident_attachments WHERE id=? AND incident_id=?').get(id, incidentId);
  if (!row) throw fail(404, 'Photo not found');
  const management = ['Supervisor', 'FacilitiesHead', 'SecurityHead', 'Admin'].includes(user.role);
  if (!management && row.uploaded_by !== user.id) throw fail(403, 'You can only remove your own photos');
  try { fs.unlinkSync(path.resolve(ROOT, row.storage_path)); } catch (_) {}
  db.prepare('DELETE FROM incident_attachments WHERE id=?').run(id);
}
module.exports = { list, add, file, remove, MAX_BYTES, MAX_PER_INCIDENT };
