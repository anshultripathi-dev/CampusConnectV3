import { useEffect, useState } from 'react';
import { BarChart3, Users, ClipboardCheck, ShieldAlert, TrendingUp, PieChart, Timer } from 'lucide-react';
import { api, roleLabel } from '../lib';
import type { DepartmentLoad, Trends, User } from '../types';
import { Empty, KPI, Panel } from '../components/common';
import { Donut, HBars, TrendChart } from '../components/Charts';

export function AnalyticsPage({ user }: { user: User }) {
  const [load, setLoad] = useState<DepartmentLoad[]>([]);
  const [report, setReport] = useState<any>(null);
  const [trends, setTrends] = useState<Trends | null>(null);
  const [range, setRange] = useState(14);
  useEffect(() => {
    api<Trends>(`/api/v2/dashboard/trends?days=${range}`)
      .then(setTrends)
      .catch(() => {});
  }, [range]);
  useEffect(() => {
    api<DepartmentLoad[]>('/api/v2/dashboard/departments')
      .then(setLoad)
      .catch(() => {});
    api<any>('/api/v2/analytics/report/safety-incidents')
      .then(setReport)
      .catch(() => {});
  }, []);
  return (
    <section className="page">
      <div className="pageHead">
        <div>
          <span className="eyebrow">OPERATIONS ANALYTICS</span>
          <h1>Evidence for decisions.</h1>
          <p>{roleLabel(user.role)} view · visitor-driven reports and live department workload.</p>
        </div>
        <div className="heroBadge">
          <BarChart3 size={16} />
          Visitor analytics
        </div>
      </div>
      <div className="kpis kpis3">
        <KPI
          label={`Created (${range}d)`}
          value={trends ? trends.days.reduce((a, d) => a + d.created, 0) : '–'}
          icon={TrendingUp}
        />
        <KPI
          label={`Resolved (${range}d)`}
          value={trends ? trends.days.reduce((a, d) => a + d.resolved, 0) : '–'}
          icon={ClipboardCheck}
          kind="good"
        />
        <KPI
          label="Avg. time to resolve"
          value={trends?.avgResolutionHours != null ? `${trends.avgResolutionHours}h` : '–'}
          icon={Timer}
          kind="warn"
        />
      </div>
      <Panel title="Incident flow" icon={<TrendingUp size={17} />}>
        <div className="chartPanel">
          <div className="rangeToggle" role="group" aria-label="Date range">
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                className={range === d ? 'active' : ''}
                onClick={() => setRange(d)}
                aria-pressed={range === d}
              >
                {d} days
              </button>
            ))}
          </div>
          {trends ? <TrendChart days={trends.days} /> : <Empty text="Loading trend…" />}
        </div>
      </Panel>
      <div className="grid3 chartGrid">
        <Panel title="By status" icon={<PieChart size={17} />}>
          <div className="chartPanel">
            {trends ? <Donut data={trends.byStatus} center="incidents" /> : <Empty text="Loading…" />}
          </div>
        </Panel>
        <Panel title="By issue type" icon={<BarChart3 size={17} />}>
          <div className="chartPanel">
            {trends ? <HBars data={trends.byCategory} /> : <Empty text="Loading…" />}
          </div>
        </Panel>
        <Panel title="By severity" icon={<ShieldAlert size={17} />}>
          <div className="chartPanel">
            {trends ? <Donut data={trends.bySeverity} center="by severity" /> : <Empty text="Loading…" />}
          </div>
        </Panel>
      </div>
      <div className="grid2">
        <Panel title="Department load" icon={<Users size={17} />}>
          <div className="loadList">
            {load.map((d) => (
              <div className="loadRow" key={d.department}>
                <div>
                  <b>{d.department}</b>
                  <span>{d.count} active incidents</span>
                </div>
                <div className="loadBar">
                  <i style={{ width: `${d.percent}%` }} />
                </div>
                <strong>{d.percent}%</strong>
              </div>
            ))}
            {!load.length && <Empty text="No active workload" />}
          </div>
        </Panel>
        <Panel title="Safety incident report" icon={<ShieldAlert size={17} />}>
          <div className="statCard">
            <span className="reportValue">{report?.count ?? report?.total ?? 0}</span>
            <b>tracked safety incidents</b>
            <p>{report?.summary || 'Visitor-generated cross-domain report.'}</p>
          </div>
        </Panel>
      </div>
      <Panel title="Recommended management actions" icon={<ClipboardCheck size={17} />}>
        <div className="actionGrid">
          <div>
            <b>Watch SLA pressure</b>
            <span>Review departments above 75% workload.</span>
          </div>
          <div>
            <b>Use escalation selectively</b>
            <span>Escalate breached cases through the configured chain.</span>
          </div>
          <div>
            <b>Close the loop</b>
            <span>Require resolution evidence before final closure.</span>
          </div>
        </div>
      </Panel>
    </section>
  );
}
