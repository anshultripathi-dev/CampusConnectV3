// ---- ITERATOR PATTERN ----
// TicketHistoryIterator provides sequential access to a ticket's (or a
// building's) event/ticket collection without exposing whether that
// collection is stored as an array, Map, or something else internally.

class TicketHistoryIterator {
  constructor(historyArray) {
    this.items = historyArray;
    this.index = 0;
  }
  hasNext() {
    return this.index < this.items.length;
  }
  next() {
    if (!this.hasNext()) return null;
    return this.items[this.index++];
  }
  reset() {
    this.index = 0;
  }
  toArray() {
    return [...this.items];
  }
}

// Iterator over all tickets belonging to a particular room/location.
class RoomTicketIterator {
  constructor(allTickets, roomName) {
    this.items = allTickets.filter(t => t.location === roomName);
    this.index = 0;
  }
  hasNext() { return this.index < this.items.length; }
  next() { return this.hasNext() ? this.items[this.index++] : null; }
}

module.exports = { TicketHistoryIterator, RoomTicketIterator };
