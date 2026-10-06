import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Inbox,
  Repeat as RepeatIcon,
  X,
} from 'lucide-react';
import { api, canApproveBookings, fmt } from '../lib';
import { useDebounced } from '../hooks';
import type { Booking, OccurrencePreview, User } from '../types';
import { MAX_SESSIONS, REPEAT_OPTIONS, Repeat, buildOccurrences, sessionLabel } from '../recurrence';
import { Empty, Panel, Status } from '../components/common';

const post = (url: string, body?: object) =>
  api<any>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
const isLive = (b: Booking) => new Date(b.end_time) > new Date();
const ACTION_WORD = { approve: 'approved', reject: 'declined', cancel: 'cancelled' } as const;

type QueueItem = { key: string; bookings: Booking[]; series: boolean };

export function BookingsPage({
  user,
  onToast,
  refreshKey = 0,
}: {
  user: User;
  onToast: (x: string) => void;
  refreshKey?: number;
}) {
  const approver = canApproveBookings(user.role);
  const [rooms, setRooms] = useState<any[]>([]);
  const [equipment, setEquipment] = useState<any[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [form, setForm] = useState({
    room: '',
    startTime: '',
    endTime: '',
    attendees: '2',
    purpose: '',
    equipment: [] as string[],
  });
  const [repeat, setRepeat] = useState<Repeat>('none');
  const [sessions, setSessions] = useState('6');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{
    state: 'idle' | 'checking' | 'ready';
    items: OccurrencePreview[];
  }>({ state: 'idle', items: [] });
  const [declining, setDeclining] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [acting, setActing] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = () =>
    Promise.all([
      api<any[]>('/api/v2/resources/rooms'),
      api<any[]>('/api/v2/resources/equipment'),
      api<Booking[]>('/api/v2/bookings'),
    ])
      .then(([r, e, b]) => {
        setRooms(r);
        setEquipment(e);
        setBookings(b);
      })
      .catch((e) => onToast(e.message));
  useEffect(() => {
    load();
  }, [refreshKey]);
  useEffect(() => {
    if (!form.room && rooms[0]) setForm((f) => ({ ...f, room: rooms[0].code }));
  }, [rooms.length]);

  // Live availability for every session. Only approved bookings hold a room.
  const recurring = repeat !== 'none';
  const count = Math.min(Math.max(Number(sessions) || 2, 2), MAX_SESSIONS);
  const draft = useDebounced(
    { room: form.room, start: form.startTime, end: form.endTime, repeat, count },
    350,
  );
  const occurrences = useMemo(
    () =>
      draft.room && draft.start && draft.end
        ? buildOccurrences(draft.start, draft.end, draft.repeat, draft.count)
        : [],
    [draft.room, draft.start, draft.end, draft.repeat, draft.count],
  );
  useEffect(() => {
    if (!occurrences.length) return setPreview({ state: 'idle', items: [] });
    let live = true;
    setPreview((p) => ({ ...p, state: 'checking' }));
    post('/api/v2/bookings/preview', { room: draft.room, occurrences })
      .then((items: OccurrencePreview[]) => live && setPreview({ state: 'ready', items }))
      .catch(() => live && setPreview({ state: 'idle', items: [] }));
    return () => {
      live = false;
    };
  }, [occurrences, refreshKey]);
  const freeCount = preview.items.filter((i) => i.available).length;
  const clashCount = preview.items.length - freeCount;

  const toggle = (id: string) =>
    setForm((f) => ({
      ...f,
      equipment: f.equipment.includes(id) ? f.equipment.filter((x) => x !== id) : [...f.equipment, id],
    }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const common = {
        room: form.room,
        attendees: Number(form.attendees),
        purpose: form.purpose,
        equipment: form.equipment,
      };
      const r = recurring
        ? await post('/api/v2/bookings', {
            ...common,
            occurrences,
            pattern: repeat,
            skipConflicts: clashCount > 0,
          })
        : await post('/api/v2/bookings', {
            ...common,
            startTime: new Date(form.startTime).toISOString(),
            endTime: new Date(form.endTime).toISOString(),
          });
      const approved = r.status === 'APPROVED';
      onToast(
        recurring
          ? `${r.created} sessions ${approved ? 'confirmed' : 'requested — you will be notified when they are reviewed'}${r.skipped?.length ? ` (${r.skipped.length} booked dates skipped)` : ''}`
          : approved
            ? `Booking ${r.id} confirmed`
            : `Request ${r.id} sent — you will be notified when it is reviewed`,
      );
      setForm((f) => ({ ...f, startTime: '', endTime: '', purpose: '', equipment: [] }));
      setRepeat('none');
      load();
    } catch (x) {
      onToast(x instanceof Error && x.message ? x.message : 'Booking failed');
    } finally {
      setBusy(false);
    }
  };

  const decide = async (
    b: Booking,
    action: 'approve' | 'reject' | 'cancel',
    note?: string,
    scope?: 'series',
  ) => {
    setActing(b.id);
    try {
      const res = await post(`/api/v2/bookings/${b.id}/${action}`, { note, scope });
      onToast(scope ? res.summary : `Booking ${b.id} ${ACTION_WORD[action]}`);
      setDeclining(null);
      setCancelling(null);
      setReason('');
      await load();
    } catch (x) {
      onToast(x instanceof Error ? x.message : 'Action failed');
    } finally {
      setActing(null);
    }
  };

  // Pending requests, with the sessions of a recurring request grouped into one card.
  const queue: QueueItem[] = useMemo(() => {
    const items: QueueItem[] = [];
    const bySeries = new Map<string, QueueItem>();
    for (const b of bookings.filter((x) => x.status === 'PENDING' && isLive(x))) {
      if (!b.seriesId) items.push({ key: b.id, bookings: [b], series: false });
      else if (bySeries.has(b.seriesId)) bySeries.get(b.seriesId)!.bookings.push(b);
      else {
        const it = { key: b.seriesId, bookings: [b], series: true };
        bySeries.set(b.seriesId, it);
        items.push(it);
      }
    }
    return items;
  }, [bookings]);
  const pendingSessions = queue.reduce((n, q) => n + q.bookings.length, 0);
  const upcoming = bookings.filter(isLive).slice(0, 40);

  const decision = (item: QueueItem) => {
    const first = item.bookings[0];
    const scope = item.series ? ('series' as const) : undefined;
    const clashing = item.bookings.filter((b) => (b.approvedClashes || []).length > 0);
    const allClash = clashing.length === item.bookings.length;
    return declining === item.key ? (
      <div className="approvalDecline">
        <input
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason shown to the requester"
          maxLength={300}
          aria-label="Reason for declining"
        />
        <button
          className="secondary"
          onClick={() => {
            setDeclining(null);
            setReason('');
          }}
        >
          Back
        </button>
        <button
          className="primary danger"
          disabled={!reason.trim() || acting === first.id}
          onClick={() => decide(first, 'reject', reason, scope)}
        >
          <X size={15} /> Decline{item.series ? ' all' : ''}
        </button>
      </div>
    ) : (
      <div className="approvalActions">
        <button
          className="primary"
          disabled={acting === first.id || allClash}
          onClick={() => decide(first, 'approve', undefined, scope)}
        >
          <Check size={15} /> {item.series ? `Approve ${item.bookings.length - clashing.length}` : 'Approve'}
        </button>
        <button className="secondary" disabled={acting === first.id} onClick={() => setDeclining(item.key)}>
          Decline{item.series ? ' all' : ''}
        </button>
      </div>
    );
  };

  return (
    <section className="page">
      <div className="pageHead">
        <div>
          <span className="eyebrow">RESOURCE SCHEDULING</span>
          <h1>Book a campus space.</h1>
          <p>
            {approver
              ? 'Review requests, then approve or decline. Only approved bookings hold a room.'
              : 'Requests are reviewed by Facilities Head, Supervisor or Admin — you will be notified of the decision.'}
          </p>
        </div>
        <div className="heroBadge">
          <CalendarDays size={16} /> {approver ? `${pendingSessions} awaiting approval` : 'Approval required'}
        </div>
      </div>

      {approver && (
        <Panel title={`Awaiting approval (${pendingSessions})`} icon={<Inbox size={17} />}>
          <div className="approvalList">
            {queue.map((item) => {
              const first = item.bookings[0];
              const last = item.bookings[item.bookings.length - 1];
              const clashing = item.bookings.filter((b) => (b.approvedClashes || []).length > 0);
              const competing = [...new Set(item.bookings.flatMap((b) => b.competingRequests || []))];
              return (
                <div className="approvalCard" key={item.key}>
                  <div className="approvalMain">
                    <div className="approvalTitle">
                      <b>{first.purpose || 'Campus booking'}</b>
                      {item.series ? (
                        <span className="seriesChip">
                          <RepeatIcon size={12} /> {first.seriesPattern} · {item.bookings.length} of{' '}
                          {first.seriesTotal} sessions
                        </span>
                      ) : (
                        <span className="mono">{first.id}</span>
                      )}
                    </div>
                    <div className="approvalMeta">
                      <span>{first.room}</span>
                      <span>{first.attendees} people</span>
                      <span>{first.requesterName}</span>
                      {first.equipment && first.equipment.length > 0 && (
                        <span>{first.equipment.length} equipment</span>
                      )}
                    </div>
                    <div className="approvalWhen">
                      <Clock3 size={14} /> {fmt(first.start_time)} → {fmt(first.end_time)}
                      {item.series && <> · until {fmt(last.start_time)}</>}
                    </div>
                    {clashing.length > 0 && (
                      <div className="approvalWarn danger">
                        <AlertTriangle size={14} />
                        {item.series
                          ? `${clashing.length} of ${item.bookings.length} sessions overlap approved bookings and will be declined if you approve the series.`
                          : `Overlaps approved booking ${(first.approvedClashes || []).map((c) => c.id).join(', ')} — it cannot be approved.`}
                      </div>
                    )}
                    {competing.length > 0 && (
                      <div className="approvalWarn">
                        <AlertTriangle size={14} /> Competes for the same slot with{' '}
                        {competing.slice(0, 4).join(', ')}
                        {competing.length > 4 ? '…' : ''}. Approving one will block the others.
                      </div>
                    )}
                    {item.series && (
                      <>
                        <button
                          className="textButton"
                          onClick={() => setExpanded(expanded === item.key ? null : item.key)}
                        >
                          {expanded === item.key ? 'Hide sessions' : 'Show sessions'}
                        </button>
                        {expanded === item.key && (
                          <ul className="sessionList">
                            {item.bookings.map((b) => (
                              <li key={b.id} className={(b.approvedClashes || []).length ? 'clash' : ''}>
                                {sessionLabel(b.start_time)}
                                <small>
                                  {(b.approvedClashes || []).length
                                    ? `clashes with ${b.approvedClashes!.map((c) => c.id).join(', ')}`
                                    : 'free'}
                                </small>
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                  </div>
                  {decision(item)}
                </div>
              );
            })}
            {!queue.length && <Empty text="No requests waiting — you are all caught up." />}
          </div>
        </Panel>
      )}

      <div className="bookingLayout">
        <Panel title="New booking" icon={<CalendarDays size={17} />}>
          <form className="bookingForm" onSubmit={submit}>
            <label>
              Room
              <select
                required
                value={form.room}
                onChange={(e) => setForm((f) => ({ ...f, room: e.target.value }))}
              >
                {rooms.map((r) => (
                  <option key={r.id} value={r.code}>
                    {r.code} · {r.building} · {r.capacity} seats
                  </option>
                ))}
              </select>
            </label>
            <div className="formGrid">
              <label>
                Start
                <input
                  required
                  type="datetime-local"
                  value={form.startTime}
                  onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                />
              </label>
              <label>
                End
                <input
                  required
                  type="datetime-local"
                  value={form.endTime}
                  onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                />
              </label>
            </div>
            <div className="formGrid">
              <label>
                Repeat
                <select value={repeat} onChange={(e) => setRepeat(e.target.value as Repeat)}>
                  {REPEAT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              {recurring && (
                <label>
                  Number of sessions
                  <input
                    type="number"
                    min={2}
                    max={MAX_SESSIONS}
                    value={sessions}
                    onChange={(e) => setSessions(e.target.value)}
                  />
                  <small>2 to {MAX_SESSIONS}, spanning at most a year.</small>
                </label>
              )}
            </div>
            {preview.state !== 'idle' && preview.items.length > 0 && (
              <div
                className={`slotStatus ${preview.state === 'checking' ? 'checking' : freeCount === 0 ? 'busy' : clashCount ? 'partial' : 'free'}`}
                role="status"
              >
                {preview.state === 'checking' && 'Checking availability…'}
                {preview.state === 'ready' && freeCount === preview.items.length && (
                  <>
                    <CheckCircle2 size={15} />{' '}
                    {recurring ? `All ${freeCount} sessions are free.` : 'Room is free for this time.'}
                  </>
                )}
                {preview.state === 'ready' && freeCount === 0 && (
                  <>
                    <AlertTriangle size={15} />{' '}
                    {recurring
                      ? 'Every session is already booked — choose another slot.'
                      : 'Already booked for part of this time — choose another slot.'}
                  </>
                )}
                {preview.state === 'ready' && freeCount > 0 && clashCount > 0 && (
                  <>
                    <AlertTriangle size={15} /> {clashCount} of {preview.items.length} sessions are already
                    booked and will be skipped.
                  </>
                )}
              </div>
            )}
            {recurring && preview.items.length > 0 && (
              <ul className="sessionChips" aria-label="Sessions">
                {preview.items.map((o) => (
                  <li
                    key={o.startTime}
                    className={o.available ? 'free' : 'busy'}
                    title={o.available ? 'Free' : `Booked (${o.clashesWith.join(', ')})`}
                  >
                    {o.available ? <Check size={12} /> : <X size={12} />}
                    {sessionLabel(o.startTime)}
                  </li>
                ))}
              </ul>
            )}
            <div className="formGrid">
              <label>
                Attendees
                <input
                  type="number"
                  min="1"
                  value={form.attendees}
                  onChange={(e) => setForm((f) => ({ ...f, attendees: e.target.value }))}
                />
              </label>
              <label>
                Purpose
                <input
                  required
                  value={form.purpose}
                  onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}
                  placeholder="Meeting / study / event"
                />
              </label>
            </div>
            <div>
              <span className="fieldLabel">Equipment</span>
              <div className="checkGrid">
                {equipment.map((e) => (
                  <label className="checkItem" key={e.id}>
                    <input
                      type="checkbox"
                      checked={form.equipment.includes(e.id)}
                      onChange={() => toggle(e.id)}
                    />
                    <span>{e.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <button
              className="primary"
              disabled={
                busy || (preview.state === 'ready' && freeCount === 0) || (recurring && !occurrences.length)
              }
            >
              {busy
                ? 'Sending…'
                : recurring
                  ? `${approver ? 'Confirm' : 'Request'} ${freeCount || occurrences.length || ''} sessions`
                  : approver
                    ? 'Confirm booking'
                    : 'Request booking'}
            </button>
          </form>
        </Panel>

        <Panel title={approver ? 'Upcoming bookings' : 'My bookings'} icon={<Clock3 size={17} />}>
          <div className="bookingList">
            {upcoming.map((b) => {
              const canAct =
                ['PENDING', 'APPROVED'].includes(b.status) && (b.requesterId === user.id || approver);
              return (
                <div className="bookingRow" key={b.id}>
                  <div>
                    <b>{b.room}</b>
                    <span>{b.purpose || 'Campus booking'}</span>
                    {b.seriesId && (
                      <small className="seriesChip">
                        <RepeatIcon size={11} /> {b.seriesIndex}/{b.seriesTotal} · {b.seriesPattern}
                      </small>
                    )}
                    {approver && <small>by {b.requesterName}</small>}
                    {b.decisionNote && b.status !== 'APPROVED' && (
                      <small className="decisionNote">“{b.decisionNote}”</small>
                    )}
                  </div>
                  <div>
                    <strong>{fmt(b.start_time)}</strong>
                    <small>to {fmt(b.end_time)}</small>
                  </div>
                  <div className="bookingSide">
                    <Status status={b.status} />
                    {canAct &&
                      (cancelling === b.id ? (
                        <div className="cancelChoice">
                          <button
                            className="textButton"
                            disabled={acting === b.id}
                            onClick={() => decide(b, 'cancel')}
                          >
                            This session
                          </button>
                          <button
                            className="textButton danger"
                            disabled={acting === b.id}
                            onClick={() => decide(b, 'cancel', undefined, 'series')}
                          >
                            All upcoming
                          </button>
                          <button className="textButton" onClick={() => setCancelling(null)}>
                            Keep
                          </button>
                        </div>
                      ) : (
                        <button
                          className="textButton"
                          disabled={acting === b.id}
                          onClick={() => (b.seriesId ? setCancelling(b.id) : decide(b, 'cancel'))}
                        >
                          Cancel
                        </button>
                      ))}
                  </div>
                </div>
              );
            })}
            {!upcoming.length && <Empty text="No upcoming bookings" />}
          </div>
        </Panel>
      </div>
    </section>
  );
}
