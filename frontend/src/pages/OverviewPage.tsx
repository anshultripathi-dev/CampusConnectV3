import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Command,
  Plus,
  Sparkles,
  Ticket,
  Workflow,
} from 'lucide-react';
import { roleLabel, isManagement, canApproveBookings } from '../lib';
import type { Incident, Overview, User } from '../types';
import { Empty, KPI, Panel, Severity, Status } from '../components/common';
import { AiInsights } from '../components/AiInsights';

export function OverviewPage({
  user,
  overview,
  incidents,
  onOpen,
  onNew,
  setPage,
}: {
  user: User;
  overview: Overview | null;
  incidents: Incident[];
  onOpen: (i: Incident) => void;
  onNew: () => void;
  setPage: (p: string) => void;
}) {
  const management = isManagement(user.role);
  const student = user.role === 'Student';
  const queue = incidents.filter((i) => !['Resolved', 'Closed'].includes(i.status)).slice(0, 6);
  const status = student
    ? 'Student Portal'
    : management
      ? 'Command Center'
      : `${roleLabel(user.role)} Work Queue`;
  const title = student
    ? 'Report, track, and get back to campus life.'
    : management
      ? 'Make the next operational decision with confidence.'
      : `Your ${user.department || 'operations'} response board.`;
  const subtitle = student
    ? 'Your reports stay visible from submission through closure.'
    : management
      ? 'Review SLA pressure, escalations, approvals, and campus health in one place.'
      : 'Start assigned work, keep evidence current, and escalate only when needed.';
  const primary = student ? 'Report an issue' : management ? 'Create incident' : 'Log field issue';
  return (
    <section className="page">
      <div className="hero">
        <div>
          <span className="eyebrow">{status.toUpperCase()}</span>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <div className="heroActions">
          <div className="heroBadge">
            <Sparkles size={16} />
            {student ? 'Self-service' : 'Live operations'}
          </div>
          <button className="primary" onClick={onNew}>
            <Plus size={16} />
            {primary}
          </button>
        </div>
      </div>
      <div className="kpis">
        <KPI
          label={student ? 'My active reports' : management ? 'Open incidents' : 'My open queue'}
          value={overview?.openIncidents ?? 0}
          icon={Ticket}
        />
        <KPI label="SLA at risk" value={overview?.slaAtRisk ?? 0} icon={Clock3} kind="warn" />
        <KPI label="Breached" value={overview?.breached ?? 0} icon={AlertTriangle} kind="danger" />
        <KPI label="Resolved today" value={overview?.resolvedToday ?? 0} icon={CheckCircle2} kind="good" />
        <KPI
          label={student ? 'Campus health' : 'Service health'}
          value={`${overview?.campusHealth ?? 0}%`}
          icon={Activity}
          kind="good"
        />
      </div>
      {canApproveBookings(user.role) && (overview?.pendingBookings ?? 0) > 0 && (
        <div className="rolePanel actionNeeded">
          <span className="eyebrow">ACTION NEEDED</span>
          <b>
            {overview?.pendingBookings} booking request{overview?.pendingBookings === 1 ? '' : 's'} waiting
            for your approval.
          </b>
          <button className="primary" onClick={() => setPage('bookings')}>
            Review requests
          </button>
        </div>
      )}
      <div className="rolePanel">
        <span className="eyebrow">
          {student ? 'YOUR NEXT STEP' : management ? 'MANAGEMENT FOCUS' : 'FIELD WORKFLOW'}
        </span>
        <b>
          {student
            ? 'Submit a complete report with location and category to speed up routing.'
            : management
              ? 'Prioritize breached cases, then review pending approvals and department workload.'
              : 'Open an incident, move it through its legal state transition, and record resolution evidence.'}
        </b>
        <button className="textButton" onClick={() => setPage(student ? 'bookings' : 'incidents')}>
          {student ? 'Book a space' : 'Open work queue'} <ChevronRight size={13} />
        </button>
      </div>
      {!student && <AiInsights incidents={incidents} onOpen={onOpen} />}
      <div className="grid2">
        <Panel
          title={student ? 'My recent reports' : management ? 'Priority queue' : 'Assigned response queue'}
          icon={<AlertTriangle size={17} />}
          action="View all"
          onAction={() => setPage('incidents')}
        >
          <div className="incidentList">
            {queue.map((i) => (
              <button className="incidentRow" onClick={() => onOpen(i)} key={i.id}>
                <span className={`severity ${i.severity.toLowerCase()}`} />
                <span className="incidentMain">
                  <b>{i.title}</b>
                  <span>
                    {i.id} · {i.location}
                  </span>
                </span>
                <Severity s={i.severity} />
                <ChevronRight size={14} />
              </button>
            ))}
            {!queue.length && (
              <Empty
                text={student ? 'No active reports — you are all caught up.' : 'No active work items.'}
              />
            )}
          </div>
        </Panel>
        <Panel
          title={management ? 'Campus posture' : student ? 'Report transparency' : 'Shift posture'}
          icon={<Activity size={17} />}
        >
          <div className="posture">
            <div>
              <span>{management ? 'Live feed' : student ? 'Status visibility' : 'Response readiness'}</span>
              <b>{overview?.campusHealth ?? 0}% healthy</b>
            </div>
            <div className="progress">
              <i style={{ width: `${overview?.campusHealth ?? 0}%` }} />
            </div>
            <div className="postureGrid">
              <div>
                <span>SLA risk</span>
                <b>{overview?.slaAtRisk ?? 0}</b>
              </div>
              <div>
                <span>Escalated</span>
                <b>{overview?.escalated ?? 0}</b>
              </div>
              <div>
                <span>Room usage</span>
                <b>{overview?.roomUtilization ?? 0}%</b>
              </div>
            </div>
          </div>
        </Panel>
      </div>
      <div className="quickActions">
        <button onClick={onNew}>
          <Plus size={17} />
          <div>
            <b>{primary}</b>
            <span>Start with a guided triage form</span>
          </div>
        </button>
        <button onClick={() => setPage(student ? 'bookings' : 'analytics')}>
          <BarChart3 size={17} />
          <div>
            <b>{student ? 'Book a room' : 'Review operations'}</b>
            <span>{student ? 'Check availability and equipment' : 'Inspect workload and SLA pressure'}</span>
          </div>
        </button>
        <button onClick={() => setPage('architecture')}>
          <Workflow size={17} />
          <div>
            <b>Architecture observatory</b>
            <span>See real pattern execution traces</span>
          </div>
        </button>
      </div>
    </section>
  );
}
