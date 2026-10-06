import { useEffect, useState } from 'react';
import { BrainCircuit, Command, MessageSquare, Sparkles, Undo2, X } from 'lucide-react';
import { api, fmt, titleCase } from '../lib';
import type { Incident, EventItem, CommandItem, AIRecommendation, Risk, User } from '../types';
import { Empty, HistoryIcon, Severity, Status } from './common';
import { RiskChip } from './RiskChip';
import { PhotoGallery } from './PhotoGallery';
import { CommentsPanel } from './CommentsPanel';
import { useStaffNames } from '../hooks';
import { IncidentActions } from './IncidentActions';

export function IncidentDrawer({
  incident,
  close,
  action,
  user,
  risk,
  onToast,
  onChanged,
  commentTick = 0,
}: {
  incident: Incident;
  close: () => void;
  action: (id: string, a: string, opts?: { open?: boolean; body?: object }) => Promise<void> | void;
  onChanged: (ticket: Incident) => void;
  commentTick?: number;
  user: User;
  risk?: Risk;
  onToast: (m: string) => void;
}) {
  const staffNames = useStaffNames();
  const [history, setHistory] = useState<EventItem[]>([]);
  const [commands, setCommands] = useState<CommandItem[]>([]);
  const [recommendations, setRecommendations] = useState<AIRecommendation[]>([]);
  const [duplicates, setDuplicates] = useState<any[]>([]);
  const [tab, setTab] = useState<'timeline' | 'comments' | 'ai' | 'commands'>('timeline');
  const [aiBusy, setAiBusy] = useState(false);
  const [commentTotal, setCommentTotal] = useState(0);
  useEffect(() => {
    Promise.all([
      api<EventItem[]>(`/api/v2/incidents/${incident.id}/history`),
      api<CommandItem[]>(`/api/v2/incidents/${incident.id}/commands`),
      api<{ recommendations: AIRecommendation[] }>(`/api/v2/incidents/${incident.id}/ai/recommendations`),
      api<{ duplicates: any[] }>(`/api/v2/incidents/${incident.id}/ai/duplicates`),
    ])
      .then(([h, c, r, d]) => {
        setHistory(h);
        setCommands(c);
        setRecommendations(r.recommendations || []);
        setDuplicates(d.duplicates || []);
      })
      .catch(() => {});
  }, [incident.id]);
  const runAI = async () => {
    setAiBusy(true);
    try {
      await api(`/api/v2/incidents/${incident.id}/ai`, { method: 'POST' });
      const [r, d] = await Promise.all([
        api<{ recommendations: AIRecommendation[] }>(`/api/v2/incidents/${incident.id}/ai/recommendations`),
        api<{ duplicates: any[] }>(`/api/v2/incidents/${incident.id}/ai/duplicates`),
      ]);
      setRecommendations(r.recommendations || []);
      setDuplicates(d.duplicates || []);
    } catch {
    } finally {
      setAiBusy(false);
    }
  };
  const hasUndo = commands.some((c) => !c.undone_at);
  return (
    <div className="overlay" onMouseDown={(e) => e.currentTarget === e.target && close()}>
      <aside className="drawer">
        <div className="drawerHead">
          <div>
            <span className="eyebrow">{incident.id}</span>
            <h2>{incident.title}</h2>
          </div>
          <button className="iconBtn" onClick={close}>
            <X size={18} />
          </button>
        </div>
        <div className="drawerBody">
          <div className="statusLine">
            <Status status={incident.status} />
            <Severity s={incident.severity} />
            <RiskChip risk={risk} />
            <span>{incident.department || 'Unassigned'}</span>
          </div>
          <p className="description">{incident.description || 'No description provided.'}</p>
          <div className="detailGrid">
            <div>
              <span>Location</span>
              <b>{incident.location}</b>
            </div>
            <div>
              <span>Created</span>
              <b>{fmt(incident.createdAt)}</b>
            </div>
            <div>
              <span>SLA</span>
              <b>{incident.slaHours || 24} hours</b>
            </div>
            <div>
              <span>Assigned</span>
              <b>
                {(incident.assignedTo && (staffNames[incident.assignedTo] || incident.assignedTo)) ||
                  'Pending'}
              </b>
            </div>
          </div>
          <PhotoGallery incidentId={incident.id} user={user} onToast={onToast} />
          <div className="drawerTabs">
            <button className={tab === 'timeline' ? 'active' : ''} onClick={() => setTab('timeline')}>
              <HistoryIcon />
              <span>Timeline</span>
            </button>
            <button className={tab === 'comments' ? 'active' : ''} onClick={() => setTab('comments')}>
              <MessageSquare size={14} />
              <span>Comments{commentTotal > 0 ? ` (${commentTotal})` : ''}</span>
            </button>
            <button className={tab === 'ai' ? 'active' : ''} onClick={() => setTab('ai')}>
              <BrainCircuit size={14} />
              <span>AI operations</span>
            </button>
            <button className={tab === 'commands' ? 'active' : ''} onClick={() => setTab('commands')}>
              <Command size={14} />
              <span>Commands</span>
            </button>
          </div>
          {tab === 'timeline' && (
            <div className="timeline">
              {history.map((h) => (
                <div className="timelineItem" key={h.id}>
                  <div className="timelineDot" />
                  <div>
                    <b>{titleCase(h.event || 'Event')}</b>
                    <span>{h.message || `${h.fromStatus || ''} → ${h.toStatus || ''}`}</span>
                    <small>
                      {fmt(h.at)} · {h.actor || 'system'}
                    </small>
                  </div>
                </div>
              ))}
              {!history.length && <Empty text="No timeline events" />}
            </div>
          )}
          <div hidden={tab !== 'comments'}>
            <CommentsPanel
              incidentId={incident.id}
              user={user}
              closed={incident.status === 'Closed'}
              refreshKey={commentTick}
              onToast={onToast}
              onCount={setCommentTotal}
            />
          </div>
          {tab === 'commands' && (
            <div className="commandList">
              {commands.map((c) => (
                <div className="commandRow" key={c.id}>
                  <div>
                    <b>{titleCase(c.action)}</b>
                    <span>{c.actor}</span>
                  </div>
                  <small>{fmt(c.created_at)}</small>
                  {c.undone_at && <em>undone</em>}
                </div>
              ))}
              {!commands.length && <Empty text="No commands recorded" />}
            </div>
          )}
          {tab === 'ai' && (
            <div className="copilot">
              <div className="aiHeader">
                <div>
                  <b>Operational copilot</b>
                  <span>Heuristic + Claude adapter</span>
                </div>
                <button className="secondary" onClick={runAI} disabled={aiBusy}>
                  <Sparkles size={14} />
                  {aiBusy ? 'Analyzing…' : 'Analyze'}
                </button>
              </div>
              {recommendations.map((r) => (
                <div className={`recommendation ${r.priority}`} key={r.type}>
                  <Sparkles size={14} />
                  <div>
                    <b>{titleCase(r.type)}</b>
                    <span>{r.text}</span>
                  </div>
                </div>
              ))}
              {duplicates.length > 0 && (
                <div className="duplicateBox">
                  <b>Possible duplicates</b>
                  {duplicates.map((d) => (
                    <div key={d.id}>
                      <span>
                        {d.id} · {d.title}
                      </span>
                      <em>{Math.round(d.similarity * 100)}% similar</em>
                    </div>
                  ))}
                </div>
              )}
              {!recommendations.length && (
                <Empty text="Run AI analysis to generate operational recommendations" />
              )}
            </div>
          )}
        </div>
        <div className="drawerFoot">
          <IncidentActions
            incident={incident}
            user={user}
            hasUndo={hasUndo}
            run={(a, body) => action(incident.id, a, { body })}
            onChanged={onChanged}
            onToast={onToast}
          />
        </div>
      </aside>
    </div>
  );
}
