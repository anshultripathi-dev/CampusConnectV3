import { useState } from 'react';
import { Columns3, List, MessageSquare, Plus, Search, Ticket } from 'lucide-react';
import { fmt } from '../lib';
import type { Incident, RiskMap, User } from '../types';
import { Empty, Panel, Severity, Status } from '../components/common';
import { KanbanBoard } from '../components/KanbanBoard';
import { RiskChip } from '../components/RiskChip';

export function IncidentsPage({
  user,
  incidents,
  query,
  setQuery,
  onOpen,
  onNew,
  risks,
  onMove,
}: {
  user: User;
  incidents: Incident[];
  query: string;
  setQuery: (x: string) => void;
  onOpen: (i: Incident) => void;
  onNew: () => void;
  risks: RiskMap;
  onMove: (id: string, action: string) => void;
}) {
  const [status, setStatus] = useState('All');
  const [severity, setSeverity] = useState('All');
  const [view, setView] = useState<'list' | 'board'>(() => {
    try {
      return localStorage.getItem('campusconnect_incident_view') === 'board' ? 'board' : 'list';
    } catch {
      return 'list';
    }
  });
  const chooseView = (v: 'list' | 'board') => {
    setView(v);
    try {
      localStorage.setItem('campusconnect_incident_view', v);
    } catch {}
  };
  const filtered = incidents.filter(
    (i) => (status === 'All' || i.status === status) && (severity === 'All' || i.severity === severity),
  );
  return (
    <section className="page">
      <div className="pageHead">
        <div>
          <span className="eyebrow">OPERATIONS</span>
          <h1>{user.role === 'Student' ? 'My incidents' : 'Incident control'}</h1>
          <p>
            {user.role === 'Student'
              ? 'Everything you have reported, with transparent status history.'
              : 'Route, prioritize and resolve campus issues with auditable state transitions.'}
          </p>
        </div>
        <button className="primary" onClick={onNew}>
          <Plus size={17} />
          Report incident
        </button>
      </div>
      <div className="toolbar">
        <div className="search">
          <Search size={17} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search incidents, locations, departments…"
          />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option>All</option>
          <option>Submitted</option>
          <option>InReview</option>
          <option>Assigned</option>
          <option>InProgress</option>
          <option>PendingApproval</option>
          <option>Resolved</option>
          <option>Closed</option>
        </select>
        <select value={severity} onChange={(e) => setSeverity(e.target.value)}>
          <option>All</option>
          <option>Critical</option>
          <option>High</option>
          <option>Medium</option>
          <option>Low</option>
        </select>
        <div className="viewToggle" role="group" aria-label="View mode">
          <button
            className={view === 'list' ? 'active' : ''}
            onClick={() => chooseView('list')}
            aria-pressed={view === 'list'}
          >
            <List size={14} />
            List
          </button>
          <button
            className={view === 'board' ? 'active' : ''}
            onClick={() => chooseView('board')}
            aria-pressed={view === 'board'}
          >
            <Columns3 size={14} />
            Board
          </button>
        </div>
      </div>
      {view === 'board' ? (
        <KanbanBoard user={user} incidents={filtered} risks={risks} onOpen={onOpen} onMove={onMove} />
      ) : (
        <Panel title={`${filtered.length} incidents`} icon={<Ticket size={17} />}>
          <div className="table">
            <div className="tr th">
              <span>Incident</span>
              <span>Severity</span>
              <span>Department</span>
              <span>Status</span>
              <span>Updated</span>
            </div>
            {filtered.map((i) => (
              <button className="tr" key={i.id} onClick={() => onOpen(i)}>
                <span>
                  <b>
                    {i.title}
                    {!!i.commentCount && (
                      <span
                        className="commentCount"
                        title={`${i.commentCount} comment${i.commentCount > 1 ? 's' : ''}`}
                      >
                        <MessageSquare size={12} />
                        {i.commentCount}
                      </span>
                    )}
                  </b>
                  <small>
                    {i.id} · {i.location}
                  </small>
                </span>
                <span>
                  <Severity s={i.severity} />
                </span>
                <span>{i.department || 'Unassigned'}</span>
                <span className="statusCell">
                  <Status status={i.status} />
                  <RiskChip risk={risks[i.id]} compact />
                </span>
                <span>{fmt(i.updatedAt)}</span>
              </button>
            ))}
            {!filtered.length && <Empty text="Nothing matches your filters" />}
          </div>
        </Panel>
      )}
    </section>
  );
}
