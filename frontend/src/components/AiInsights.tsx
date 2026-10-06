import { useEffect, useState } from 'react';
import { AlertTriangle, ChevronRight, Layers, ShieldCheck, Sparkles } from 'lucide-react';
import { api } from '../lib';
import type { Incident, Insights } from '../types';
import { Severity, Status } from './common';
import { RiskChip } from './RiskChip';

export function AiInsights({ incidents, onOpen }: { incidents: Incident[]; onOpen: (i: Incident) => void }) {
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    api<Insights>('/api/v2/ai/insights')
      .then((d) => {
        setData(d);
        setError(false);
      })
      .catch(() => setError(true));
  }, [incidents]);
  const open = (id: string) => {
    const i = incidents.find((x) => x.id === id);
    if (i) onOpen(i);
  };
  if (error) return null;
  return (
    <section className="aiPanel" aria-label="Smart insights">
      <div className="aiHead">
        <span className="aiBadge">
          <Sparkles size={14} />
          Smart insights
        </span>
        <span className="aiPrivacy">
          <ShieldCheck size={13} />
          Runs on this server · no data leaves campus
        </span>
      </div>
      {!data ? (
        <div className="aiLoading">Analysing incidents…</div>
      ) : (
        <div className="aiGrid">
          <div className="aiCard">
            <h3>Today’s brief</h3>
            <p className="aiHeadline">{data.brief.headline}</p>
            <ul>
              {data.brief.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
          <div className="aiCard">
            <h3>
              <Layers size={14} />
              Possible shared causes
            </h3>
            {data.clusters.length === 0 && <p className="aiMuted">No groups of related reports right now.</p>}
            {data.clusters.slice(0, 3).map((c) => (
              <button key={c.ids.join()} className="clusterRow" onClick={() => open(c.ids[0])}>
                <span className="clusterCount">{c.size}</span>
                <span className="clusterText">
                  <b>{c.topic}</b>
                  <small>
                    {c.locations.slice(0, 2).join(' · ')}
                    {c.locations.length > 2 ? ` +${c.locations.length - 2}` : ''}
                  </small>
                </span>
                <Severity s={c.maxSeverity} />
              </button>
            ))}
          </div>
          <div className="aiCard">
            <h3>
              <AlertTriangle size={14} />
              Highest SLA risk
            </h3>
            {data.topRisks.length === 0 && <p className="aiMuted">Nothing at risk.</p>}
            {data.topRisks.slice(0, 4).map((t) => (
              <button key={t.id} className="riskRow" onClick={() => open(t.id)}>
                <span className="riskRowText">
                  <b>{t.title}</b>
                  <small>
                    {t.id} · <Status status={t.status} />
                  </small>
                </span>
                <RiskChip risk={t.risk} compact />
                <ChevronRight size={14} />
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
