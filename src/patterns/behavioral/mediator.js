// ---- MEDIATOR PATTERN ----
// Departments (Maintenance, Security, IT, Facilities) sometimes need to hand
// a ticket to each other (e.g. a "safety" report turns out to be an
// electrical fault). DepartmentMediator centralizes that handoff logic so
// departments never reference each other directly.

class DepartmentMediator {
  constructor() {
    this.departments = {}; // name -> handler function
    this.log = [];
  }

  register(name, handlerFn) {
    this.departments[name] = handlerFn;
  }

  handoff(ticket, fromDept, toDept, reason) {
    if (!this.departments[toDept]) {
      throw new Error(`Unknown department: ${toDept}`);
    }
    const entry = { ticketId: ticket.id, from: fromDept, to: toDept, reason, at: new Date().toISOString() };
    this.log.push(entry);
    ticket.department = toDept;
    // Let the receiving department react (e.g. auto-assign a default staffer)
    const receivedNote = this.departments[toDept](ticket, reason);
    return { ...entry, receivedNote };
  }

  getLog(ticketId) {
    return this.log.filter(e => e.ticketId === ticketId);
  }
}

module.exports = { DepartmentMediator };
