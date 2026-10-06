// Booking approval workflow: PENDING → APPROVED | REJECTED, and PENDING/APPROVED → CANCELLED.
// Only approved bookings hold a room. Every decision is audited, notified and broadcast.
const repo = require('./repository');
const { db } = require('../infrastructure/database');
const audit = require('../audit');
const notifications = require('../notifications/service');
const eventBus = require('../infrastructure/eventBus');

const APPROVER_ROLES = ['FacilitiesHead', 'Admin', 'Supervisor'];
const canApprove = user => APPROVER_ROLES.includes(user?.role);
const fail = (status, error, extra = {}) => Object.assign(new Error(error), { status, ...extra });
const when = iso => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const asConflict = b => ({ id: b.id, room: b.room, startTime: b.start_time, endTime: b.end_time });

function decide(id, action, user, note = '') {
  const booking = repo.booking(id);
  if (!booking) throw fail(404, 'Booking not found');
  const text = String(note || '').trim().slice(0, 300);
  const ended = new Date(booking.end_time) <= new Date();
  let status;

  if (action === 'approve' || action === 'reject') {
    if (!canApprove(user)) throw fail(403, 'Only Facilities Head, Supervisor or Admin can approve or reject bookings');
    if (booking.status !== 'PENDING') throw fail(409, `This booking is already ${booking.status.toLowerCase()}`);
    if (action === 'reject') {
      if (!text) throw fail(400, 'Give a reason so the requester knows why it was declined');
      status = 'REJECTED';
    } else {
      if (ended) throw fail(409, 'This time slot has already passed');
      const clashes = repo.conflicts(booking.room, booking.start_time, booking.end_time, id);
      if (clashes.length) throw fail(409, 'Cannot approve: the room is already booked for part of that time', { conflicts: clashes.map(asConflict) });
      status = 'APPROVED';
    }
  } else if (action === 'cancel') {
    const owner = booking.requesterId === user.id;
    if (!owner && !canApprove(user)) throw fail(403, 'You can only cancel your own bookings');
    if (!['PENDING', 'APPROVED'].includes(booking.status)) throw fail(409, `A ${booking.status.toLowerCase()} booking cannot be cancelled`);
    if (ended) throw fail(409, 'This booking has already ended');
    status = 'CANCELLED';
  } else {
    throw fail(400, 'Unknown action');
  }

  const updated = applyDecision(booking, status, user, text);
  return updated;
}

// Records one decision: state change + audit + (optionally) the requester notification and live event.
function applyDecision(booking, status, user, text, { silent = false } = {}) {
  const updated = repo.setDecision(booking.id, { status, decidedBy: user.id, note: text });
  audit.write({ actor: user.id, action: `BOOKING_${status}`, entityType: 'booking', entityId: booking.id, beforeState: booking, afterState: updated });
  if (!silent) {
    const verb = { APPROVED: 'approved', REJECTED: 'declined', CANCELLED: 'cancelled' }[status];
    if (booking.requesterId && booking.requesterId !== user.id) {
      notifications.notify({
        recipient: booking.requesterId,
        title: `Booking ${verb}`,
        message: `${booking.room} • ${when(booking.start_time)} → ${when(booking.end_time)}${text ? ` — ${text}` : ''}`,
        referenceType: 'booking',
        referenceId: booking.id,
      });
    }
    eventBus.publish('booking.updated', { booking: updated, action: status.toLowerCase() });
  }
  return updated;
}

// Decide every upcoming session of a recurring booking in one go.
//  approve: sessions whose room is still free are approved; the rest are declined with the clash named.
//  reject / cancel: all upcoming open sessions.
function decideSeries(id, action, user, note = '') {
  const first = repo.booking(id);
  if (!first) throw fail(404, 'Booking not found');
  if (!first.seriesId) throw fail(400, 'This booking is not part of a recurring series');
  const text = String(note || '').trim().slice(0, 300);
  const now = new Date();
  const all = repo.seriesBookings(first.seriesId);
  const upcoming = all.filter(b => new Date(b.end_time) > now);

  let targets;
  if (action === 'approve' || action === 'reject') {
    if (!canApprove(user)) throw fail(403, 'Only Facilities Head, Supervisor or Admin can approve or reject bookings');
    if (action === 'reject' && !text) throw fail(400, 'Give a reason so the requester knows why it was declined');
    targets = upcoming.filter(b => b.status === 'PENDING');
    if (!targets.length) throw fail(409, 'No pending sessions left in this series');
  } else if (action === 'cancel') {
    if (first.requesterId !== user.id && !canApprove(user)) throw fail(403, 'You can only cancel your own bookings');
    targets = upcoming.filter(b => ['PENDING', 'APPROVED'].includes(b.status));
    if (!targets.length) throw fail(409, 'No upcoming sessions left to cancel');
  } else throw fail(400, 'Unknown action');

  const result = { approved: [], declined: [], cancelled: [] };
  db.exec('BEGIN');
  try {
    for (const b of targets) {
      if (action === 'approve') {
        const clashes = repo.conflicts(b.room, b.start_time, b.end_time, b.id);
        if (clashes.length) { applyDecision(b, 'REJECTED', user, `Room unavailable — clashes with ${clashes.map(c => c.id).join(', ')}`, { silent: true }); result.declined.push(b.id); }
        else { applyDecision(b, 'APPROVED', user, text, { silent: true }); result.approved.push(b.id); }
      } else if (action === 'reject') { applyDecision(b, 'REJECTED', user, text, { silent: true }); result.declined.push(b.id); }
      else { applyDecision(b, 'CANCELLED', user, text, { silent: true }); result.cancelled.push(b.id); }
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }

  const summary = action === 'approve'
    ? `${result.approved.length} of ${targets.length} sessions approved${result.declined.length ? `; ${result.declined.length} declined because the room was taken` : ''}`
    : action === 'reject' ? `${result.declined.length} sessions declined${text ? ` — ${text}` : ''}` : `${result.cancelled.length} sessions cancelled`;
  if (first.requesterId && first.requesterId !== user.id) {
    notifications.notify({ recipient: first.requesterId, title: `Recurring booking ${action === 'approve' ? 'reviewed' : action === 'reject' ? 'declined' : 'cancelled'}`, message: `${first.room} • ${first.seriesPattern || 'recurring'} — ${summary}`, referenceType: 'booking', referenceId: first.id });
  }
  eventBus.publish('booking.updated', { booking: repo.booking(first.id), action: `${action}-series` });
  return { seriesId: first.seriesId, action, summary, ...result, bookings: repo.seriesBookings(first.seriesId) };
}

// Approvers see, for each request, what it clashes with so they can decide knowingly.
function enrich(list, user) {
  if (!canApprove(user)) return list;
  return list.map(b => b.status !== 'PENDING' ? b : {
    ...b,
    approvedClashes: repo.conflicts(b.room, b.start_time, b.end_time, b.id).map(asConflict),
    competingRequests: repo.pendingOverlaps(b.room, b.start_time, b.end_time, b.id).map(x => x.id),
  });
}

// Approvers' own bookings need no second sign-off.
function autoApprove(id, user) {
  return repo.setDecision(id, { status: 'APPROVED', decidedBy: user.id, note: 'Auto-approved (requester is an approver)' });
}
module.exports = { decide, decideSeries, applyDecision, enrich, autoApprove, canApprove, APPROVER_ROLES, pendingCount: repo.pendingCount };
