// ---- TEMPLATE METHOD PATTERN ----
// Every ticket resolution follows the same skeleton (verify -> perform fix ->
// document -> notify), but the "perform fix" and "document" steps differ per
// ticket type. Subclasses override just those hooks; the overall algorithm
// shape stays fixed in the base class.

class ResolutionProcess {
  // The template method — defines the fixed skeleton.
  run(ticket) {
    const steps = [];
    steps.push(this.verify(ticket));
    steps.push(this.performFix(ticket));
    steps.push(this.document(ticket));
    steps.push(this.notifyStakeholders(ticket));
    return steps;
  }

  verify(ticket) {
    return `Verified ticket ${ticket.id} details and location (${ticket.location}).`;
  }

  performFix(ticket) {
    throw new Error('performFix() must be overridden');
  }

  document(ticket) {
    throw new Error('document() must be overridden');
  }

  notifyStakeholders(ticket) {
    return `Notified reporter that ticket ${ticket.id} is resolved.`;
  }
}

class MaintenanceResolutionProcess extends ResolutionProcess {
  performFix(ticket) {
    return `Dispatched ${ticket.subCategory || 'general'} technician to fix the issue on-site.`;
  }
  document(ticket) {
    return `Logged parts used and labor hours in maintenance records for ${ticket.id}.`;
  }
}

class SafetyResolutionProcess extends ResolutionProcess {
  performFix(ticket) {
    return `Security team responded and neutralized/contained the safety issue.`;
  }
  document(ticket) {
    return `Filed an incident report for ${ticket.id} with severity ${ticket.severity}.`;
  }
}

class LostFoundResolutionProcess extends ResolutionProcess {
  performFix(ticket) {
    return `Matched item description against found-items log.`;
  }
  document(ticket) {
    return `Logged item handover (or storage) for ${ticket.id} at the front desk.`;
  }
}

function getResolutionProcess(category) {
  switch (category) {
    case 'Maintenance': return new MaintenanceResolutionProcess();
    case 'Safety': return new SafetyResolutionProcess();
    case 'LostFound': return new LostFoundResolutionProcess();
    default: throw new Error(`Unknown category: ${category}`);
  }
}

module.exports = { getResolutionProcess };
