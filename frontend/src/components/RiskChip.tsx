import { Clock3 } from 'lucide-react';
import { formatHours } from '../lib';
import type { Risk } from '../types';

const LABEL: Record<string, string> = {
  breached: 'Breached',
  high: 'High risk',
  elevated: 'Watch',
  low: 'On track',
};

export function RiskChip({ risk, compact = false }: { risk?: Risk; compact?: boolean }) {
  if (!risk || risk.level === 'done') return null;
  const time =
    risk.hoursLeft == null
      ? ''
      : risk.hoursLeft < 0
        ? `${formatHours(risk.hoursLeft)} over`
        : `${formatHours(risk.hoursLeft)} left`;
  const title = risk.reasons.length ? risk.reasons.join(' · ') : 'Comfortably within SLA';
  return (
    <span className={`riskChip ${risk.level}`} title={`${LABEL[risk.level]} (${risk.score}/100) — ${title}`}>
      <Clock3 size={11} />
      {compact ? time : `${LABEL[risk.level]} · ${time}`}
    </span>
  );
}
