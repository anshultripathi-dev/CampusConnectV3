// Recurring bookings. A series is a set of ordinary bookings that share a series_id, so
// each session is approved, conflict-checked and cancelled like any other booking.
// The client generates the dates in the user's own timezone (so "every Tuesday 10:00"
// stays 10:00 across daylight-saving changes); the server validates and stores them.
const crypto = require('crypto');
const repo = require('./repository');
const resources = require('./service');
const approval = require('./approval');
const audit = require('../audit');
const notifications = require('../notifications/service');
const eventBus = require('../infrastructure/eventBus');
const { db } = require('../infrastructure/database');

const PATTERNS = { daily: 'Daily', weekdays: 'Every weekday', weekly: 'Weekly', biweekly: 'Every 2 weeks' };
const MIN_SESSIONS = 2;
const MAX_SESSIONS = 26;
const MAX_SPAN_DAYS = 366;
const fail = (status, error, extra = {}) => Object.assign(new Error(error), { status, ...extra });
const when = iso => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const toUtc = v => { const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };

function normalise(occurrences) {
  if (!Array.isArray(occurrences) || !occurrences.length) throw fail(400, 'Choose at least one session');
  if (occurrences.length > MAX_SESSIONS) throw fail(400, `A series can have at most ${MAX_SESSIONS} sessions`);
  const list = occurrences.map(o => ({ startTime: toUtc(o?.startTime), endTime: toUtc(o?.endTime) }));
  if (list.some(o => !o.startTime || !o.endTime)) throw fail(400, 'Every session needs a valid start and end time');
  list.sort((a, b) => a.startTime.localeCompare(b.startTime));
  list.forEach((o, i) => {
    if (o.endTime <= o.startTime) throw fail(400, 'Each session must end after it starts');
    if (i && o.startTime < list[i - 1].endTime) throw fail(400, 'Sessions in a series cannot overlap each other');
  });
  const span = (new Date(list.at(-1).startTime) - new Date(list[0].startTime)) / 86400000;
  if (span > MAX_SPAN_DAYS) throw fail(400, 'A series can span at most one year');
  return list;
}

// Which sessions would clash with an approved booking right now.
function preview(room, occurrences) {
  const list = normalise(occurrences);
  return list.map((o, index) => {
    const clashes = repo.conflicts(room, o.startTime, o.endTime, null);
    return { index, ...o, available: !clashes.length, clashesWith: clashes.map(c => c.id) };
  });
}

function create(payload, user, { skipConflicts = false } = {}) {
  const pattern = payload.pattern;
  if (!PATTERNS[pattern]) throw fail(400, 'Choose how the booking repeats');
  const list = normalise(payload.occurrences);
  if (list.length < MIN_SESSIONS) throw fail(400, 'A recurring booking needs at least two sessions');
  if (new Date(list[0].startTime) < new Date(Date.now() - 5 * 60000)) throw fail(400, 'Start time cannot be in the past');

  const checked = preview(payload.room, list);
  const clashing = checked.filter(c => !c.available);
  if (clashing.length && !skipConflicts) {
    throw fail(409, `${clashing.length} of ${checked.length} dates are already booked`, { conflictDates: clashing });
  }
  const sessions = checked.filter(c => c.available);
  if (!sessions.length) throw fail(409, 'Every date is already booked', { conflictDates: clashing });
  if (sessions.length < MIN_SESSIONS && skipConflicts) throw fail(409, 'Fewer than two free dates remain — pick another room or time', { conflictDates: clashing });

  const seriesId = `SER-${crypto.randomBytes(4).toString('hex')}`;
  const created = [];
  db.exec('BEGIN');
  try {
    sessions.forEach((s, i) => {
      let r;
      try { r = resources.create({
        room: payload.room, startTime: s.startTime, endTime: s.endTime, attendees: payload.attendees, purpose: payload.purpose,
        equipment: payload.equipment, requester: user.id, recurring: true, silent: true,
        series: { id: seriesId, index: i + 1, total: sessions.length, pattern: PATTERNS[pattern] },
      }); } catch (e) { throw e.status ? e : fail(400, e.message); }
      if (r.error) throw fail(r.status || 400, r.error, { conflicts: r.conflicts });
      created.push(r);
    });
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }

  const first = created[0], last = created.at(-1);
  audit.write({ actor: user.id, action: 'BOOKING_SERIES_CREATED', entityType: 'booking', entityId: first.id, afterState: { seriesId, sessions: created.length, pattern: PATTERNS[pattern], room: payload.room } });
  const summary = `${first.room} • ${PATTERNS[pattern]} • ${created.length} sessions, ${when(first.start_time)} → ${when(last.start_time)} • ${payload.purpose || 'Campus booking'}`;
  eventBus.publish('booking.created', { booking: first });

  let status = 'PENDING';
  if (approval.canApprove(user)) {
    created.forEach(b => approval.autoApprove(b.id, user));
    status = 'APPROVED';
  } else {
    notifications.notify({ recipient: 'operations', title: 'Recurring booking awaiting approval', message: summary, referenceType: 'booking', referenceId: first.id });
    notifications.notify({ recipient: user.id, title: 'Recurring booking requested', message: `${summary} — awaiting approval`, referenceType: 'booking', referenceId: first.id });
  }
  return { seriesId, status, created: created.length, skipped: clashing.map(c => ({ startTime: c.startTime, clashesWith: c.clashesWith })), bookings: repo.seriesBookings(seriesId) };
}
module.exports = { create, preview, PATTERNS, MAX_SESSIONS };
