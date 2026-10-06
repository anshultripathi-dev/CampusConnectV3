// Account administration: roles, departments and passwords.
const crypto = require('crypto');
const { db } = require('./infrastructure/database');
const auth = require('./auth');
const audit = require('./audit');

const ROLES = ['Student', 'Maintenance', 'Security', 'IT', 'Supervisor', 'FacilitiesHead', 'SecurityHead', 'Admin'];
const DEPARTMENT_ROLES = ['Maintenance', 'Security', 'IT']; // work queues are scoped by department
const ADMIN_ROLES = ['Admin', 'FacilitiesHead'];
const canManageUsers = user => ADMIN_ROLES.includes(user?.role);
const fail = (status, error) => Object.assign(new Error(error), { status, expose: true });

function list() {
  const users = db.prepare(`SELECT u.id,u.name,u.email,u.role,u.department_id,d.name AS department,u.google_sub,u.password_hash,u.created_at
    FROM users u LEFT JOIN departments d ON d.id=u.department_id ORDER BY u.role='Student', u.role, u.name`).all()
    .map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, departmentId: u.department_id, department: u.department,
      signIn: [u.password_hash && 'password', u.google_sub && 'google'].filter(Boolean), createdAt: u.created_at }));
  return { users, roles: ROLES, departments: db.prepare('SELECT id,name FROM departments ORDER BY name').all() };
}

function setRole(targetId, { role, departmentId }, actor) {
  if (!canManageUsers(actor)) throw fail(403, 'Only Admin or Facilities Head can manage users');
  const target = db.prepare('SELECT * FROM users WHERE id=?').get(targetId);
  if (!target) throw fail(404, 'User not found');
  if (target.id === actor.id) throw fail(400, 'You cannot change your own role');
  if (!ROLES.includes(role)) throw fail(400, 'Unknown role');
  const dept = role === 'Student' ? null : (departmentId || null);
  if (dept && !db.prepare('SELECT 1 FROM departments WHERE id=?').get(dept)) throw fail(400, 'Unknown department');
  if (DEPARTMENT_ROLES.includes(role) && !dept) throw fail(400, `${role} staff must belong to a department`);
  if (ADMIN_ROLES.includes(target.role) && !ADMIN_ROLES.includes(role)) {
    const remaining = db.prepare(`SELECT COUNT(*) n FROM users WHERE role IN (${ADMIN_ROLES.map(() => '?').join(',')}) AND id != ?`).get(...ADMIN_ROLES, target.id).n;
    if (!remaining) throw fail(409, 'At least one Admin or Facilities Head must remain');
  }
  db.prepare('UPDATE users SET role=?, department_id=? WHERE id=?').run(role, dept, targetId);
  const after = db.prepare('SELECT id,name,role,department_id FROM users WHERE id=?').get(targetId);
  audit.write({ actor: actor.id, action: 'USER_ROLE_CHANGED', entityType: 'user', entityId: targetId, beforeState: { role: target.role, departmentId: target.department_id }, afterState: after });
  return list().users.find(u => u.id === targetId);
}

// Returns a one-time temporary password the admin passes to the user out-of-band.
function resetPassword(targetId, actor) {
  if (!canManageUsers(actor)) throw fail(403, 'Only Admin or Facilities Head can reset passwords');
  const target = db.prepare('SELECT id FROM users WHERE id=?').get(targetId);
  if (!target) throw fail(404, 'User not found');
  if (target.id === actor.id) throw fail(400, 'Use “Change password” for your own account');
  const temporary = crypto.randomBytes(9).toString('base64url');
  auth.setPassword(targetId, temporary);
  auth.revokeUserSessions(targetId);
  audit.write({ actor: actor.id, action: 'USER_PASSWORD_RESET', entityType: 'user', entityId: targetId, afterState: { reset: true } });
  return { temporaryPassword: temporary };
}

function changePassword(user, currentPassword, newPassword, currentToken) {
  const row = db.prepare('SELECT password_hash, google_sub FROM users WHERE id=?').get(user.id);
  if (!row.password_hash && row.google_sub) throw fail(400, 'This account signs in with Google and has no password to change');
  if (!auth.verifyPassword(String(currentPassword || ''), row.password_hash)) throw fail(403, 'Current password is incorrect');
  const next = String(newPassword || '');
  if (next.length < 8) throw fail(400, 'New password must be at least 8 characters');
  if (next.length > 128) throw fail(400, 'New password is too long');
  if (next === String(currentPassword)) throw fail(400, 'Choose a password different from the current one');
  auth.setPassword(user.id, next);
  auth.revokeUserSessions(user.id, currentToken); // sign out every other device
  audit.write({ actor: user.id, action: 'USER_PASSWORD_CHANGED', entityType: 'user', entityId: user.id, afterState: { changed: true } });
  return { success: true };
}
module.exports = { list, setRole, resetPassword, changePassword, canManageUsers, ROLES, DEPARTMENT_ROLES };
