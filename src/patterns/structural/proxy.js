// ---- PROXY PATTERN ----
// Security-category tickets are sensitive. SecureTicketProxy stands in front
// of the real ticket store and only lets callers with the right role/department
// see the full ticket, without the rest of the app needing to know about
// access control at all.

class SecureTicketProxy {
  constructor(realTicket) {
    this.realTicket = realTicket;
  }

  view(requester) {
    const isSensitive = this.realTicket.category === 'Safety';
    if (!isSensitive) {
      return { access: 'granted', ticket: this.realTicket };
    }

    const allowed = requester && (
      requester.department === 'Security' ||
      requester.role === 'SecurityHead' ||
      requester.role === 'FacilitiesHead' ||
      requester.role === 'Admin'
    );

    if (!allowed) {
      // Redacted view for unauthorized viewers
      return {
        access: 'redacted',
        ticket: {
          id: this.realTicket.id,
          category: this.realTicket.category,
          location: this.realTicket.location,
          status: this.realTicket.state ? this.realTicket.state.current : this.realTicket.status,
          note: 'Details restricted — Security clearance required.',
        },
      };
    }

    return { access: 'granted', ticket: this.realTicket };
  }
}

module.exports = { SecureTicketProxy };
