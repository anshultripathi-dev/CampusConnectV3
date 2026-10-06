// ---- OBSERVER PATTERN ----
// When a ticket's status changes, both the original reporter and the
// assigned staff dashboard need to know immediately. TicketSubject notifies
// every registered observer without needing to know who or how many there are.

class TicketSubject {
  constructor() {
    this.observers = [];
  }
  subscribe(observer) {
    this.observers.push(observer);
  }
  unsubscribe(observer) {
    this.observers = this.observers.filter(o => o !== observer);
  }
  notifyAll(event) {
    return this.observers.map(o => o.update(event));
  }
}

class ReporterObserver {
  constructor(reporterName) {
    this.reporterName = reporterName;
    this.feed = [];
  }
  update(event) {
    const msg = `Hi ${this.reporterName}, your ticket ${event.ticketId} is now "${event.status}".`;
    this.feed.push(msg);
    return msg;
  }
}

class StaffDashboardObserver {
  constructor(department) {
    this.department = department;
    this.feed = [];
  }
  update(event) {
    if (event.department && event.department !== this.department) return null;
    const msg = `[${this.department} Dashboard] Ticket ${event.ticketId} -> ${event.status}`;
    this.feed.push(msg);
    return msg;
  }
}

module.exports = { TicketSubject, ReporterObserver, StaffDashboardObserver };
