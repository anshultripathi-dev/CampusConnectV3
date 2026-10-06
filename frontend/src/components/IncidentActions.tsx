import { useEffect, useState } from 'react';
import { ArrowRightLeft, Check, Undo2 } from 'lucide-react';
import { ROLE_ACTIONS, api, isManagement } from '../lib';
import type { Incident, StaffMember, User } from '../types';

const DEPARTMENTS = ['Maintenance', 'Security', 'IT', 'Facilities'];
type Pending =
  | { kind: 'assign'; action: 'assign'; label: string }
  | { kind: 'reason'; action: 'reject' | 'sendBack'; label: string; placeholder: string; required: boolean }
  | { kind: 'note'; action: 'markDone'; label: string }
  | { kind: 'handoff' };

/** Buttons for the legal next steps of an incident, with the inputs each step needs. */
export function IncidentActions({
  incident,
  user,
  hasUndo,
  run,
  onChanged,
  onToast,
}: {
  incident: Incident;
  user: User;
  hasUndo: boolean;
  run: (action: string, body?: object) => Promise<void> | void;
  onChanged: (ticket: Incident) => void;
  onToast: (m: string) => void;
}) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [staffId, setStaffId] = useState('');
  const [text, setText] = useState('');
  const [dept, setDept] = useState('');
  const [busy, setBusy] = useState(false);
  const can = (a: string) => (ROLE_ACTIONS[user.role] || []).includes(a);
  const s = incident.status;
  const finished = ['Resolved', 'Closed', 'Rejected'].includes(s);

  useEffect(() => {
    setPending(null);
    setText('');
  }, [incident.id, s]);
  useEffect(() => {
    if (pending?.kind !== 'assign' || staff.length) return;
    api<StaffMember[]>('/api/v2/staff')
      .then(setStaff)
      .catch(() => {});
  }, [pending, staff.length]);
  const candidates = [...staff].sort(
    (a, b) =>
      Number(b.department === incident.department) - Number(a.department === incident.department) ||
      a.name.localeCompare(b.name),
  );
  useEffect(() => {
    if (pending?.kind === 'assign')
      setStaffId(candidates.find((c) => c.id === incident.assignedTo)?.id || candidates[0]?.id || '');
  }, [pending, staff.length]);

  const buttons: { key: string; label: string; primary?: boolean; danger?: boolean; click: () => void }[] =
    [];
  const go = (action: string, body?: object) => () => run(action, body);
  if (['Submitted', 'InReview', 'Reopened'].includes(s) && can('assign'))
    buttons.push({
      key: 'assign',
      label: 'Assign',
      primary: true,
      click: () => setPending({ kind: 'assign', action: 'assign', label: 'Assign to' }),
    });
  if (s === 'Assigned' && can('start'))
    buttons.push({ key: 'start', label: 'Start work', primary: true, click: go('start') });
  if (s === 'Assigned' && can('assign'))
    buttons.push({
      key: 'reassign',
      label: 'Reassign',
      click: () => setPending({ kind: 'assign', action: 'assign', label: 'Reassign to' }),
    });
  if (s === 'InProgress' && can('markDone'))
    buttons.push({
      key: 'markDone',
      label: 'Mark done',
      primary: true,
      click: () => setPending({ kind: 'note', action: 'markDone', label: 'Mark done' }),
    });
  if (s === 'InProgress' && can('resolve'))
    buttons.push({ key: 'resolve', label: 'Resolve', click: go('resolve') });
  if (s === 'PendingApproval' && can('approve'))
    buttons.push({ key: 'approve', label: 'Approve', primary: true, click: go('approve') });
  if (s === 'PendingApproval' && can('sendBack'))
    buttons.push({
      key: 'sendBack',
      label: 'Send back',
      click: () =>
        setPending({
          kind: 'reason',
          action: 'sendBack',
          label: 'Send back',
          placeholder: 'What still needs to be done?',
          required: true,
        }),
    });
  if (s === 'Resolved' && can('close'))
    buttons.push({ key: 'close', label: 'Close', primary: true, click: go('close') });
  if (['Resolved', 'Rejected'].includes(s) && can('reopen'))
    buttons.push({ key: 'reopen', label: 'Reopen', click: go('reopen') });
  if (['Submitted', 'InReview'].includes(s) && can('reject'))
    buttons.push({
      key: 'reject',
      label: 'Reject',
      danger: true,
      click: () =>
        setPending({
          kind: 'reason',
          action: 'reject',
          label: 'Reject',
          placeholder: 'Why is this being rejected? (shown to the reporter)',
          required: true,
        }),
    });
  if (!finished && isManagement(user.role))
    buttons.push({ key: 'escalate', label: 'Escalate', click: go('escalate') });
  if (
    !finished &&
    s !== 'Closed' &&
    (isManagement(user.role) || (user.department && user.department === incident.department))
  )
    buttons.push({
      key: 'handoff',
      label: 'Hand off',
      click: () => {
        setDept(DEPARTMENTS.find((d) => d !== incident.department) || '');
        setPending({ kind: 'handoff' });
      },
    });

  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      if (pending.kind === 'assign') await run('assign', { staffId });
      else if (pending.kind === 'reason') await run(pending.action, { reason: text.trim() });
      else if (pending.kind === 'note') await run('markDone', { note: text.trim() });
      else {
        const r = await api<{ ticket: Incident; message: string }>(
          `/api/v2/incidents/${incident.id}/handoff`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ toDept: dept, reason: text.trim() }),
          },
        );
        onChanged(r.ticket);
        onToast(`Handed off to ${dept}`);
      }
      setPending(null);
      setText('');
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };
  const needsText =
    pending && ((pending.kind === 'reason' && pending.required) || pending.kind === 'handoff');
  const disabled =
    busy ||
    (pending?.kind === 'assign' && !staffId) ||
    (needsText && !text.trim()) ||
    (pending?.kind === 'handoff' && !dept);

  return (
    <div className="actionsBar">
      {pending && (
        <div className="actionForm">
          {pending.kind === 'assign' && (
            <label>
              {pending.label}
              <select value={staffId} onChange={(e) => setStaffId(e.target.value)}>
                {candidates.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} · {m.department || 'Campus-wide'}
                    {m.department === incident.department ? ' (this department)' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          {pending.kind === 'handoff' && (
            <>
              <label>
                Hand off to
                <select value={dept} onChange={(e) => setDept(e.target.value)}>
                  {DEPARTMENTS.filter((d) => d !== incident.department).map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </label>
              <label>
                Reason
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Why does it belong there?"
                  maxLength={200}
                  autoFocus
                />
              </label>
            </>
          )}
          {pending.kind === 'reason' && (
            <label>
              {pending.label}
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={pending.placeholder}
                maxLength={300}
                autoFocus
              />
            </label>
          )}
          {pending.kind === 'note' && (
            <label>
              Work summary (optional)
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="What was done? This goes to the approver."
                maxLength={300}
                autoFocus
              />
            </label>
          )}
          <div className="actionFormBtns">
            <button className="secondary" onClick={() => setPending(null)}>
              Back
            </button>
            <button className="primary" disabled={!!disabled} onClick={confirm}>
              <Check size={15} />{' '}
              {pending.kind === 'handoff' ? 'Hand off' : pending.kind === 'assign' ? 'Assign' : 'Confirm'}
            </button>
          </div>
        </div>
      )}
      {!pending && (
        <div className="actionButtons">
          {buttons.map((b) => (
            <button
              key={b.key}
              className={b.primary ? 'primary' : b.danger ? 'secondary dangerText' : 'secondary'}
              onClick={b.click}
            >
              {b.key === 'handoff' && <ArrowRightLeft size={14} />}
              {b.label}
            </button>
          ))}
          {hasUndo && can('undo') && (
            <button className="secondary" onClick={() => run('undo')}>
              <Undo2 size={14} /> Undo last
            </button>
          )}
          {!buttons.length && !(hasUndo && can('undo')) && (
            <span className="drawerHint">No actions available for your role on this incident.</span>
          )}
        </div>
      )}
    </div>
  );
}
