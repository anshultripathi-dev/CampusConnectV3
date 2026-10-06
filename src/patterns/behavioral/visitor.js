// ---- VISITOR PATTERN ----
// Different reports (maintenance cost summary, safety incident summary, room
// utilization) all need to walk the same collection of tickets/bookings but
// compute completely different outputs. Visitors let us add new report types
// without modifying the Ticket/Booking classes themselves.

class ReportVisitor {
  visitTicket(ticket) { throw new Error('visitTicket() must be implemented'); }
  visitBooking(booking) { throw new Error('visitBooking() must be implemented'); }
  result() { throw new Error('result() must be implemented'); }
}

class MaintenanceCostVisitor extends ReportVisitor {
  constructor(costPerHour = 15) {
    super();
    this.costPerHour = costPerHour;
    this.totalHours = 0;
    this.ticketCount = 0;
  }
  visitTicket(ticket) {
    if (ticket.category === 'Maintenance') {
      this.totalHours += ticket.slaHours;
      this.ticketCount += 1;
    }
  }
  visitBooking() { /* not relevant to this report */ }
  result() {
    return {
      report: 'Maintenance Cost Summary',
      ticketsCounted: this.ticketCount,
      estimatedCost: `$${(this.totalHours * this.costPerHour).toFixed(2)}`,
    };
  }
}

class SafetyIncidentVisitor extends ReportVisitor {
  constructor() {
    super();
    this.bySeverity = { High: 0, Normal: 0, Low: 0 };
  }
  visitTicket(ticket) {
    if (ticket.category === 'Safety') {
      this.bySeverity[ticket.severity] = (this.bySeverity[ticket.severity] || 0) + 1;
    }
  }
  visitBooking() {}
  result() {
    const total = Object.values(this.bySeverity).reduce((sum, n) => sum + n, 0);
    const parts = Object.entries(this.bySeverity).filter(([,n]) => n > 0).map(([sev,n]) => `${n} ${sev}`);
    return { report: 'Safety Incident Summary', total, breakdown: this.bySeverity, summary: parts.length ? `${parts.join(', ')} severity incidents on record.` : 'No safety incidents on record yet.' };
  }
}

class RoomUtilizationVisitor extends ReportVisitor {
  constructor() {
    super();
    this.usageByRoom = {};
  }
  visitTicket(ticket) {
    this.usageByRoom[ticket.location] = (this.usageByRoom[ticket.location] || 0) + 1;
  }
  visitBooking(booking) {
    this.usageByRoom[booking.room] = (this.usageByRoom[booking.room] || 0) + 1;
  }
  result() {
    return { report: 'Room Utilization Report', usageByRoom: this.usageByRoom };
  }
}

// The "acceptor" that walks the collections and applies a visitor to each item.
function generateReport(visitor, tickets, bookings) {
  tickets.forEach(t => visitor.visitTicket(t));
  bookings.forEach(b => visitor.visitBooking(b));
  return visitor.result();
}

module.exports = { MaintenanceCostVisitor, SafetyIncidentVisitor, RoomUtilizationVisitor, generateReport };
