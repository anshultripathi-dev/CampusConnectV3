// ---- MEMENTO PATTERN ----
// Before an edit (e.g. a staff member changes ticket details), a snapshot is
// captured so the edit can be reverted without the caretaker (TicketCareTaker)
// needing to know anything about the ticket's internal structure.

class TicketMemento {
  constructor(state) {
    // Store a shallow-cloned snapshot, timestamped for auditing.
    this._state = JSON.parse(JSON.stringify(state));
    this._takenAt = new Date().toISOString();
  }
  getState() {
    return this._state;
  }
}

class TicketCareTaker {
  constructor() {
    this.snapshots = {}; // ticketId -> stack of mementos
  }

  save(ticket) {
    const snapshot = { ...ticket, state: undefined }; // omit non-serializable state machine ref
    snapshot.stateSnapshot = ticket.state ? ticket.state.current : ticket.status;
    const memento = new TicketMemento(snapshot);
    if (!this.snapshots[ticket.id]) this.snapshots[ticket.id] = [];
    this.snapshots[ticket.id].push(memento);
    return memento;
  }

  restore(ticket) {
    const stack = this.snapshots[ticket.id];
    if (!stack || stack.length === 0) return null;
    const memento = stack.pop();
    const restoredState = memento.getState();
    Object.assign(ticket, restoredState, { state: ticket.state }); // keep live state machine ref
    if (ticket.state) ticket.state.forceState(restoredState.stateSnapshot);
    return ticket;
  }
}

module.exports = { TicketMemento, TicketCareTaker };
