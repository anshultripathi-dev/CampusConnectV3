// ---- BUILDER PATTERN ----
// A room booking has several optional, order-independent parts (room, time
// slot, equipment list, attendee count, recurrence). BookingBuilder lets
// callers assemble a complex Booking object step by step and validates it
// only once build() is called.

class Booking {
  constructor() {
    this.room = null;
    this.startTime = null;
    this.endTime = null;
    this.equipment = [];
    this.attendees = 0;
    this.purpose = '';
    this.recurring = false;
  }
}

class BookingBuilder {
  constructor() {
    this.booking = new Booking();
  }

  setRoom(room) {
    this.booking.room = room;
    return this;
  }

  setTimeSlot(startTime, endTime) {
    this.booking.startTime = startTime;
    this.booking.endTime = endTime;
    return this;
  }

  addEquipment(equipmentId) {
    this.booking.equipment.push(equipmentId);
    return this;
  }

  setAttendees(count) {
    this.booking.attendees = count;
    return this;
  }

  setPurpose(text) {
    this.booking.purpose = text;
    return this;
  }

  setRecurring(flag) {
    this.booking.recurring = flag;
    return this;
  }

  build() {
    if (!this.booking.room) throw new Error('Booking requires a room');
    if (!this.booking.startTime || !this.booking.endTime) throw new Error('Booking requires a time slot');
    return this.booking;
  }
}

module.exports = { BookingBuilder, Booking };
