// Dependency-free SVG charts that work offline and follow the light/dark theme.
const PALETTE = ['#2b6cf6', '#12a594', '#e0a43b', '#df574f', '#7953bd', '#8794a8'];

export function TrendChart({ days }: { days: { date: string; created: number; resolved: number }[] }) {
  const W = 620,
    H = 220,
    L = 34,
    R = 12,
    T = 14,
    B = 28;
  const max = Math.max(3, ...days.flatMap((d) => [d.created, d.resolved]));
  const x = (i: number) => L + (days.length <= 1 ? 0 : (i * (W - L - R)) / (days.length - 1));
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const line = (key: 'created' | 'resolved') =>
    days.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(' ');
  const area = `${line('created')} L${x(days.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  const ticks = [0, Math.ceil(max / 2), max];
  const every = Math.ceil(days.length / 7);
  return (
    <figure className="chart" aria-label="Incidents created and resolved per day">
      <svg viewBox={`0 0 ${W} ${H}`} role="img">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="chartGrid" />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" className="chartLabel">
              {t}
            </text>
          </g>
        ))}
        <path d={area} fill={PALETTE[0]} opacity="0.1" />
        <path d={line('created')} fill="none" stroke={PALETTE[0]} strokeWidth="2.5" strokeLinejoin="round" />
        <path
          d={line('resolved')}
          fill="none"
          stroke={PALETTE[1]}
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeDasharray="5 4"
        />
        {days.map((d, i) => (
          <g key={d.date}>
            <circle cx={x(i)} cy={y(d.created)} r="3.5" fill={PALETTE[0]}>
              <title>{`${d.date}: ${d.created} created`}</title>
            </circle>
            <circle cx={x(i)} cy={y(d.resolved)} r="3.5" fill={PALETTE[1]}>
              <title>{`${d.date}: ${d.resolved} resolved`}</title>
            </circle>
            {i % every === 0 && (
              <text x={x(i)} y={H - 8} textAnchor="middle" className="chartLabel">
                {d.date.slice(5)}
              </text>
            )}
          </g>
        ))}
      </svg>
      <figcaption className="chartLegend">
        <span>
          <i style={{ background: PALETTE[0] }} />
          Created
        </span>
        <span>
          <i style={{ background: PALETTE[1] }} />
          Resolved
        </span>
      </figcaption>
    </figure>
  );
}

export function Donut({ data, center }: { data: { label: string; count: number }[]; center: string }) {
  const total = data.reduce((a, d) => a + d.count, 0);
  const R = 56,
    C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="donutWrap">
      <svg viewBox="0 0 150 150" className="donut" role="img" aria-label={`${center}: ${total}`}>
        <circle cx="75" cy="75" r={R} fill="none" className="donutTrack" strokeWidth="18" />
        {total > 0 &&
          data.map((d, i) => {
            const len = (d.count / total) * C;
            const el = (
              <circle
                key={d.label}
                cx="75"
                cy="75"
                r={R}
                fill="none"
                stroke={PALETTE[i % PALETTE.length]}
                strokeWidth="18"
                strokeDasharray={`${Math.max(0, len - 1.5)} ${C - Math.max(0, len - 1.5)}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 75 75)"
              >
                <title>{`${d.label}: ${d.count}`}</title>
              </circle>
            );
            offset += len;
            return el;
          })}
        <text x="75" y="73" textAnchor="middle" className="donutNum">
          {total}
        </text>
        <text x="75" y="91" textAnchor="middle" className="chartLabel">
          {center}
        </text>
      </svg>
      <ul className="donutLegend">
        {data.map((d, i) => (
          <li key={d.label}>
            <i style={{ background: PALETTE[i % PALETTE.length] }} />
            {d.label}
            <b>{d.count}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HBars({ data }: { data: { label: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <ul className="hbars">
      {data.map((d, i) => (
        <li key={d.label}>
          <span>{d.label}</span>
          <div>
            <i style={{ width: `${(d.count / max) * 100}%`, background: PALETTE[i % PALETTE.length] }} />
          </div>
          <b>{d.count}</b>
        </li>
      ))}
    </ul>
  );
}
