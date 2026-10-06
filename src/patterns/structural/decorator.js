// ---- DECORATOR PATTERN ----
// Tickets can pick up runtime flags (Urgent, VIP-area, Repeat-issue) that
// change their display priority and score without altering the base Ticket
// class or requiring a subclass per flag combination.

class TicketComponent {
  constructor(ticket) {
    this.ticket = ticket;
  }
  getPriorityScore() { return this.ticket.baseScore || 1; }
  getTags() { return []; }
}

class TicketDecorator extends TicketComponent {
  constructor(wrapped) {
    super(wrapped.ticket);
    this.wrapped = wrapped;
  }
  getPriorityScore() { return this.wrapped.getPriorityScore(); }
  getTags() { return this.wrapped.getTags(); }
}

class UrgentDecorator extends TicketDecorator {
  getPriorityScore() { return this.wrapped.getPriorityScore() + 10; }
  getTags() { return [...this.wrapped.getTags(), 'Urgent']; }
}

class VipAreaDecorator extends TicketDecorator {
  getPriorityScore() { return this.wrapped.getPriorityScore() + 5; }
  getTags() { return [...this.wrapped.getTags(), 'VIP-Area']; }
}

class RepeatIssueDecorator extends TicketDecorator {
  getPriorityScore() { return this.wrapped.getPriorityScore() + 7; }
  getTags() { return [...this.wrapped.getTags(), 'Repeat-Issue']; }
}

// Helper to apply a list of flag names to a base ticket.
function decorateTicket(ticket, flags = []) {
  let component = new TicketComponent(ticket);
  for (const flag of flags) {
    if (flag === 'Urgent') component = new UrgentDecorator(component);
    else if (flag === 'VIP-Area') component = new VipAreaDecorator(component);
    else if (flag === 'Repeat-Issue') component = new RepeatIssueDecorator(component);
  }
  return component;
}

module.exports = { decorateTicket };
