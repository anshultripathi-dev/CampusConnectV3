import { useEffect, useState } from 'react';
import { FileClock } from 'lucide-react';
import { api, fmt } from '../lib';
import { Empty, Panel } from '../components/common';

export function AuditPage() {
  const [logs, setLogs] = useState<any[]>([]);
  useEffect(() => {
    api<any[]>('/api/v2/audit?limit=100')
      .then(setLogs)
      .catch(() => {});
  }, []);
  return (
    <section className="page">
      <div className="pageHead">
        <div>
          <span className="eyebrow">GOVERNANCE</span>
          <h1>Audit trail</h1>
          <p>Every meaningful mutation is recorded with actor, entity and before/after state.</p>
        </div>
        <div className="heroBadge">
          <FileClock size={16} />
          Immutable history
        </div>
      </div>
      <Panel title={`${logs.length} recent events`} icon={<FileClock size={17} />}>
        <div className="auditList">
          {logs.map((l) => (
            <div className="auditRow" key={l.id}>
              <div className="auditIcon">
                <FileClock size={14} />
              </div>
              <div>
                <b>{l.action}</b>
                <span>
                  {l.entity_type} · {l.entity_id}
                </span>
              </div>
              <div>
                <strong>{l.actor}</strong>
                <small>{fmt(l.created_at)}</small>
              </div>
            </div>
          ))}
          {!logs.length && <Empty text="No audit events yet" />}
        </div>
      </Panel>
    </section>
  );
}
