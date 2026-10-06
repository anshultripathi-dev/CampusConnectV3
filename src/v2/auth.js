const crypto = require('crypto');
const { db } = require('./infrastructure/database');

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
// Demo mode exposes seeded credentials on the login page. Off in production unless forced on.
const DEMO_MODE = process.env.CAMPUSCONNECT_DEMO ? process.env.CAMPUSCONNECT_DEMO === '1' : !IS_PRODUCTION;
const DEMO_PASSWORD = process.env.CAMPUSCONNECT_DEMO_PASSWORD || (IS_PRODUCTION ? crypto.randomBytes(18).toString('hex') : 'campus123');

const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');
function purgeExpiredSessions() { db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now()); }
purgeExpiredSessions();
setInterval(purgeExpiredSessions, 60 * 60 * 1000).unref();

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(hash, 'hex'));
}


const userColumns = db.prepare('PRAGMA table_info(users)').all();
if (userColumns.some(x => x.name === 'password_hash')) {
  const users = db.prepare('SELECT id,password_hash FROM users WHERE google_sub IS NULL').all();
  const update = db.prepare('UPDATE users SET password_hash=? WHERE id=?');
  for (const user of users) if (!user.password_hash) update.run(hashPassword(DEMO_PASSWORD), user.id);
}

function sanitize(row) {
  if (!row) return null;
  return { id: row.id, name: row.name, email: row.email, role: row.role, department: row.department_name || null, departmentId: row.department_id || null, avatarUrl: row.avatar_url || null };
}
function findByLogin(login) {
  return db.prepare(`SELECT u.*, d.name AS department_name FROM users u LEFT JOIN departments d ON d.id=u.department_id WHERE lower(u.email)=lower(?) OR lower(u.id)=lower(?)`).get(login, login);
}
function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)').run(hashToken(token), user.id, now, now + SESSION_TTL_MS);
  return { token, user: sanitize(user), expiresAt: now + SESSION_TTL_MS };
}
function login(login, password) {
  const user = findByLogin(login);
  if (!user || !verifyPassword(password, user.password_hash)) return null;
  return createSession(user);
}

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_ALLOWED_DOMAINS = (process.env.GOOGLE_ALLOWED_DOMAINS || '').split(',').map(d => d.trim().toLowerCase()).filter(Boolean);
let googleClient = null;
function googleEnabled() { return Boolean(GOOGLE_CLIENT_ID); }

// Verifies a Google ID token (signature, audience, expiry) and signs the user in.
// Known emails map to their existing account and role; unknown emails are
// provisioned as least-privilege Students, optionally limited to allowed domains.
async function loginWithGoogle(credential) {
  if (!googleEnabled()) throw Object.assign(new Error('Google sign-in is not configured'), { status: 503 });
  if (!googleClient) googleClient = new (require('google-auth-library').OAuth2Client)(GOOGLE_CLIENT_ID);
  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
  } catch (_) {
    throw Object.assign(new Error('Invalid Google credential'), { status: 401 });
  }
  const email = String(payload?.email || '').toLowerCase();
  if (!email || !payload.email_verified) throw Object.assign(new Error('Google account email is not verified'), { status: 401 });
  const domain = email.split('@')[1];
  if (GOOGLE_ALLOWED_DOMAINS.length && !GOOGLE_ALLOWED_DOMAINS.includes(domain)) {
    throw Object.assign(new Error('This Google account is not allowed. Use your campus email.'), { status: 403 });
  }
  let user = db.prepare('SELECT * FROM users WHERE google_sub=? OR lower(email)=?').get(payload.sub, email);
  if (user) {
    db.prepare('UPDATE users SET google_sub=?, avatar_url=? WHERE id=?').run(payload.sub, payload.picture || null, user.id);
  } else {
    const id = `u-g-${payload.sub.slice(-8)}`;
    db.prepare('INSERT INTO users(id,name,email,role,department_id,created_at,google_sub,avatar_url) VALUES(?,?,?,?,?,?,?,?)')
      .run(id, payload.name || email.split('@')[0], email, 'Student', null, new Date().toISOString(), payload.sub, payload.picture || null);
  }
  user = findByLogin(email);
  return createSession(user);
}
function authenticate(token) {
  if (!token) return null;
  const session = db.prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash=?').get(hashToken(token));
  if (!session) return null;
  if (Date.now() > session.expires_at) { logout(token); return null; }
  return sanitize(db.prepare(`SELECT u.*, d.name AS department_name FROM users u LEFT JOIN departments d ON d.id=u.department_id WHERE u.id=?`).get(session.user_id));
}
function revokeUserSessions(userId, exceptToken) {
  if (exceptToken) db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash != ?').run(userId, hashToken(exceptToken));
  else db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId);
}
function setPassword(userId, password) { db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(password), userId); }
function logout(token) { if (token) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(token)); }
function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const user = authenticate(token);
  if (!user) return res.status(401).json({ error: 'Authentication required' });
  req.user = user;
  req.authToken = token;
  next();
}
const ROLE_COMMAND_ACTIONS = {
  Student: [], Maintenance: ['assign','start','markDone','undo'], Security: ['assign','start','markDone','undo'], IT: ['assign','start','markDone','undo'],
  Supervisor: ['assign','start','markDone','approve','sendBack','resolve','reopen','undo'],
  FacilitiesHead: ['assign','start','markDone','approve','sendBack','resolve','reject','reopen','close','undo'],
  SecurityHead: ['assign','start','markDone','approve','sendBack','resolve','reject','reopen','close','undo'],
  Admin: ['assign','start','markDone','approve','sendBack','resolve','reject','reopen','close','undo']
};
function canCommand(role, action) { return (ROLE_COMMAND_ACTIONS[role] || []).includes(action); }
function requireRoles(...roles) {
  return (req, res, next) => roles.includes(req.user?.role) ? next() : res.status(403).json({ error: 'Insufficient permissions' });
}
module.exports = { hashPassword, verifyPassword, revokeUserSessions, setPassword, login, loginWithGoogle, googleEnabled, GOOGLE_CLIENT_ID, DEMO_MODE, authenticate, logout, requireAuth, requireRoles, canCommand, ROLE_COMMAND_ACTIONS, DEMO_PASSWORD };
