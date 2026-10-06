// ---- CHAIN OF RESPONSIBILITY PATTERN ----
// An unresolved ticket escalates: department staff -> supervisor -> facilities
// head, each handler deciding whether it can act or must pass it up the chain
// based on how long the ticket has been open (SLA breach depth).

class EscalationHandler {
  setNext(handler) {
    this.next = handler;
    return handler;
  }
  handle(ticket, hoursOpen) {
    if (this.next) return this.next.handle(ticket, hoursOpen);
    return { handledBy: null, note: 'No further escalation levels available.' };
  }
}

class StaffHandler extends EscalationHandler {
  handle(ticket, hoursOpen) {
    if (hoursOpen <= ticket.slaHours) {
      return { handledBy: 'Staff', note: `Within SLA (${hoursOpen}h/${ticket.slaHours}h). Assigned to department staff.` };
    }
    return super.handle(ticket, hoursOpen);
  }
}

class SupervisorHandler extends EscalationHandler {
  handle(ticket, hoursOpen) {
    if (hoursOpen <= ticket.slaHours * 2) {
      return { handledBy: 'Supervisor', note: `SLA breached (${hoursOpen}h). Escalated to supervisor.` };
    }
    return super.handle(ticket, hoursOpen);
  }
}

class FacilitiesHeadHandler extends EscalationHandler {
  handle(ticket, hoursOpen) {
    return { handledBy: 'FacilitiesHead', note: `Severe SLA breach (${hoursOpen}h). Escalated to Facilities Head.` };
  }
}

function buildEscalationChain() {
  const staff = new StaffHandler();
  const supervisor = new SupervisorHandler();
  const head = new FacilitiesHeadHandler();
  staff.setNext(supervisor).setNext(head);
  return staff;
}

module.exports = { buildEscalationChain };
