import React, { useEffect, useState } from 'react';
import { Activity, ChevronRight, X } from 'lucide-react';
import { api, fmt } from '../lib';
import type { Trace, PatternCatalog } from '../types';
import { Empty, Panel } from '../components/common';

export function ArchitecturePage({ traces }: { traces: Trace[] }) {
  const [catalog, setCatalog] = useState<PatternCatalog>({ creational: [], structural: [], behavioral: [] });
  const [selectedTrace, setSelectedTrace] = useState<Trace | null>(null);
  useEffect(() => {
    api<any>('/api/v2/architecture/patterns')
      .then(setCatalog)
      .catch(() => {});
  }, []);
  const labels: { key: 'creational' | 'structural' | 'behavioral'; label: string }[] = [
    { key: 'creational', label: 'Creational' },
    { key: 'structural', label: 'Structural' },
    { key: 'behavioral', label: 'Behavioral' },
  ];
  return (
    <section className="page">
      <div className="pageHead">
        <div>
          <span className="eyebrow">ARCHITECTURE OBSERVATORY</span>
          <h1>23 patterns. One system.</h1>
          <p>
            Each pattern is connected to an operational responsibility and can be observed through live
            execution traces.
          </p>
        </div>
        <div className="patternCount">
          <strong>{catalog.total || 23}</strong>
          <span>GoF patterns</span>
        </div>
      </div>
      <div className="patternBands">
        {labels.map((group) => (
          <div className="patternBand" key={group.key}>
            <div className="bandTitle">
              <span>{group.label}</span>
              <b>{(catalog[group.key] || []).length}</b>
            </div>
            <div className="patternGrid">
              {(catalog[group.key] || []).map((p: any) => (
                <div className="patternCard" key={p[0]}>
                  <span>{group.label}</span>
                  <b>{p[0]}</b>
                  <p>{p[1]}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <Panel
        title="Live execution traces"
        icon={<Activity size={17} />}
        action={traces.length ? 'Refresh traces' : undefined}
        onAction={() => window.location.reload()}
      >
        <div className="traceList">
          {traces.map((t) => (
            <button className="trace traceButton" key={t.traceId} onClick={() => setSelectedTrace(t)}>
              <div className="traceTop">
                <b>{t.operation}</b>
                <span>{t.status}</span>
              </div>
              <small>
                {fmt(t.startedAt)} · {t.traceId}
              </small>
              <div className="traceFlow">
                {t.steps.map((step, j) => (
                  <React.Fragment key={j}>
                    <span>{step.pattern}</span>
                    {j < t.steps.length - 1 && <ChevronRight size={13} />}
                  </React.Fragment>
                ))}
              </div>
            </button>
          ))}
          {!traces.length && <Empty text="Perform an incident or booking operation to generate a trace" />}
        </div>
      </Panel>
      {selectedTrace && (
        <div className="traceDetail">
          <div>
            <span className="eyebrow">TRACE DETAIL</span>
            <h3>{selectedTrace.operation}</h3>
          </div>
          <button className="iconBtn" onClick={() => setSelectedTrace(null)}>
            <X size={17} />
          </button>
          <div className="traceDetailFlow">
            {selectedTrace.steps.map((s, i) => (
              <div key={i}>
                <strong>{i + 1}</strong>
                <span>
                  <b>{s.pattern}</b>
                  <small>
                    {s.component}
                    {s.result ? ` · ${s.result}` : ''}
                  </small>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
