import { useState } from 'react';
import { GripVertical, MessageSquare, User as UserIcon } from 'lucide-react';
import { ROLE_ACTIONS } from '../lib';
import { useStaffNames } from '../hooks';
import type { Incident, RiskMap, User } from '../types';
import { Severity } from './common';
import { RiskChip } from './RiskChip';

type Column = { id: string; title: string; statuses: string[] };
export const COLUMNS: Column[] = [
  { id: 'new', title: 'New', statuses: ['Submitted', 'InReview', 'Reopened'] },
  { id: 'assigned', title: 'Assigned', statuses: ['Assigned'] },
  { id: 'progress', title: 'In progress', statuses: ['InProgress'] },
  { id: 'approval', title: 'Awaiting approval', statuses: ['PendingApproval'] },
  { id: 'done', title: 'Resolved', statuses: ['Resolved'] },
];
// Which command moves an incident (by its current status) into a column.
const MOVES: Record<string, Record<string, string>> = {
  assigned: { Submitted: 'assign', InReview: 'assign', Reopened: 'assign' },
  progress: { Assigned: 'start', PendingApproval: 'sendBack' },
  approval: { InProgress: 'markDone' },
  done: { PendingApproval: 'approve', InProgress: 'resolve', Assigned: 'resolve' },
};
export const moveAction = (user: User, incident: Incident, columnId: string) => {
  const action = MOVES[columnId]?.[incident.status];
  return action && ROLE_ACTIONS[user.role]?.includes(action) ? action : null;
};

export function KanbanBoard({
  user,
  incidents,
  risks,
  onOpen,
  onMove,
}: {
  user: User;
  incidents: Incident[];
  risks: RiskMap;
  onOpen: (i: Incident) => void;
  onMove: (id: string, action: string) => void;
}) {
  const staffNames = useStaffNames();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const dragging = incidents.find((i) => i.id === dragId) || null;
  const hidden = incidents.filter((i) => !COLUMNS.some((c) => c.statuses.includes(i.status))).length;
  const canMoveAny = (ROLE_ACTIONS[user.role] || []).length > 0;

  const drop = (colId: string) => {
    setOverCol(null);
    setDragId(null);
    if (!dragging) return;
    const action = moveAction(user, dragging, colId);
    if (action) onMove(dragging.id, action);
  };

  return (
    <div className="kanban" role="list" aria-label="Incident board">
      {COLUMNS.map((col) => {
        const items = incidents
          .filter((i) => col.statuses.includes(i.status))
          .sort((a, b) => (risks[b.id]?.score ?? 0) - (risks[a.id]?.score ?? 0));
        const droppable = !!dragging && !!moveAction(user, dragging, col.id);
        return (
          <section
            key={col.id}
            role="listitem"
            className={`kanbanCol${droppable ? ' droppable' : ''}${overCol === col.id && droppable ? ' over' : ''}`}
            onDragOver={(e) => {
              if (droppable) {
                e.preventDefault();
                setOverCol(col.id);
              }
            }}
            onDragLeave={() => setOverCol((c) => (c === col.id ? null : c))}
            onDrop={(e) => {
              e.preventDefault();
              drop(col.id);
            }}
          >
            <div className="kanbanHead">
              <b>{col.title}</b>
              <span>{items.length}</span>
            </div>
            <div className="kanbanBody">
              {items.map((i) => {
                const targets = COLUMNS.filter((c) => c.id !== col.id && moveAction(user, i, c.id));
                return (
                  <article
                    key={i.id}
                    className={`kCard${dragId === i.id ? ' dragging' : ''}`}
                    draggable={targets.length > 0}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', i.id);
                      setDragId(i.id);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverCol(null);
                    }}
                  >
                    <button className="kCardMain" onClick={() => onOpen(i)}>
                      <span className="kCardTop">
                        <Severity s={i.severity} />
                        <RiskChip risk={risks[i.id]} compact />
                      </span>
                      <b>{i.title}</b>
                      <small>
                        {i.id} · {i.location}
                      </small>
                    </button>
                    <div className="kCardFoot">
                      <span>{i.department || 'Unassigned'}</span>
                      {!!i.commentCount && (
                        <span className="commentCount" title={`${i.commentCount} comments`}>
                          <MessageSquare size={12} />
                          {i.commentCount}
                        </span>
                      )}
                      {i.assignedTo && (
                        <span
                          className="kAvatar"
                          title={`Assigned to ${staffNames[i.assignedTo] || i.assignedTo}`}
                        >
                          <UserIcon size={13} />
                        </span>
                      )}
                      {targets.length > 0 && (
                        <select
                          className="kMove"
                          aria-label={`Move ${i.id}`}
                          value=""
                          onChange={(e) => {
                            const target = COLUMNS.find((c) => c.id === e.target.value);
                            const action = target && moveAction(user, i, target.id);
                            if (action) onMove(i.id, action);
                          }}
                        >
                          <option value="">Move…</option>
                          {targets.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.title}
                            </option>
                          ))}
                        </select>
                      )}
                      {targets.length > 0 && <GripVertical size={14} className="kGrip" aria-hidden />}
                    </div>
                  </article>
                );
              })}
              {!items.length && <div className="kanbanEmpty">{droppable ? 'Drop here' : 'Nothing here'}</div>}
            </div>
          </section>
        );
      })}
      {(hidden > 0 || !canMoveAny) && (
        <p className="kanbanNote">
          {!canMoveAny && 'Read-only view — staff can drag cards between columns. '}
          {hidden > 0 &&
            `${hidden} closed or rejected incident${hidden > 1 ? 's are' : ' is'} hidden from the board.`}
        </p>
      )}
    </div>
  );
}
