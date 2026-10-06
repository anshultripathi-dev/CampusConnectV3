// Transparent SLA-risk scoring. This is a hand-weighted model (not trained): it
// combines how much of the SLA window is used with signals that make a breach
// more likely, and returns the reasons so staff can see why something is flagged.
const DONE = new Set(['Resolved', 'Closed', 'Rejected']);
const hoursSince = iso => (Date.now() - new Date(iso).getTime()) / 3600000;

function slaRisk(incident, ctx = {}) {
  if (DONE.has(incident.status)) return { score: 0, level: 'done', hoursLeft: null, reasons: [] };
  const sla = incident.slaHours || 24;
  const elapsed = hoursSince(incident.createdAt);
  const ratio = elapsed / sla;
  const hoursLeft = Number((sla - elapsed).toFixed(1));
  const reasons = [];
  if (ratio >= 1) return { score: 100, level: 'breached', hoursLeft, reasons: [`SLA exceeded by ${Math.abs(hoursLeft)}h`] };

  let score = ratio * 70;
  if (ratio >= 0.75) reasons.push(`${Math.round(ratio * 100)}% of SLA window used`);
  const unowned = !incident.assignedTo || ['Submitted', 'InReview', 'Reopened'].includes(incident.status);
  if (unowned && ratio > 0.25) { score += 12; reasons.push('No owner assigned yet'); }
  if (incident.status === 'Assigned' && ratio > 0.5) { score += 6; reasons.push('Assigned but work not started'); }
  if (incident.severity === 'Critical') { score += 10; reasons.push('Critical severity'); }
  else if (incident.severity === 'High') { score += 5; reasons.push('High severity'); }
  const load = ctx.openByDepartment?.[incident.department] || 0;
  if (load >= 5) { score += 6; reasons.push(`${incident.department} has ${load} open incidents`); }
  if (incident.status === 'PendingApproval') { score -= 12; reasons.push('Work done, awaiting approval'); }

  score = Math.max(0, Math.min(99, Math.round(score)));
  return { score, level: score >= 70 ? 'high' : score >= 40 ? 'elevated' : 'low', hoursLeft, reasons };
}

function riskMap(incidents) {
  const openByDepartment = {};
  for (const i of incidents) if (!DONE.has(i.status)) openByDepartment[i.department] = (openByDepartment[i.department] || 0) + 1;
  return Object.fromEntries(incidents.map(i => [i.id, slaRisk(i, { openByDepartment })]));
}
module.exports = { slaRisk, riskMap, DONE };
