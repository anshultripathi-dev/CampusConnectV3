// ---- STRATEGY PATTERN ----
// Admins can switch how open tickets are ranked without changing any
// calling code: by SLA urgency, by raw severity, or plain first-come-first-served.

class PriorityStrategy {
  score(ticket, hoursOpen) { throw new Error('score() must be implemented'); }
}

class SlaBasedStrategy extends PriorityStrategy {
  score(ticket, hoursOpen) {
    const urgencyRatio = hoursOpen / ticket.slaHours;
    return Math.round(urgencyRatio * 100);
  }
}

class SeverityBasedStrategy extends PriorityStrategy {
  score(ticket) {
    const map = { High: 90, Normal: 50, Low: 20 };
    return map[ticket.severity] || 50;
  }
}

class FifoStrategy extends PriorityStrategy {
  score(ticket) {
    // Older createdAt -> higher score (processed first)
    return -new Date(ticket.createdAt).getTime();
  }
}

class TicketRanker {
  constructor(strategy) {
    this.strategy = strategy;
  }
  setStrategy(strategy) {
    this.strategy = strategy;
  }
  rank(tickets, hoursOpenFn) {
    return [...tickets]
      .map(t => ({ ticket: t, score: this.strategy.score(t, hoursOpenFn(t)) }))
      .sort((a, b) => b.score - a.score);
  }
}

const STRATEGIES = {
  sla: new SlaBasedStrategy(),
  severity: new SeverityBasedStrategy(),
  fifo: new FifoStrategy(),
};

module.exports = { TicketRanker, STRATEGIES };
