// ---- SINGLETON PATTERN ----
// CampusRegistry is the single source of truth for buildings, rooms, tickets,
// bookings, and staff. Every service goes through this one instance so state
// never forks across the app.

const seed = require('../../../data/seed.json');

let instance = null;

class CampusRegistry {
  constructor() {
    if (instance) {
      throw new Error('CampusRegistry already instantiated. Use CampusRegistry.getInstance()');
    }
    this.campus = seed.campus;
    this.equipment = seed.equipment;
    this.staff = seed.staff;
    this.tickets = new Map();   // ticketId -> ticket
    this.bookings = new Map();  // bookingId -> booking
    this.nextTicketId = 1;
    this.nextBookingId = 1;
    instance = this;
  }

  static getInstance() {
    if (!instance) {
      instance = new CampusRegistry();
    }
    return instance;
  }

  newTicketId() {
    return `TCK-${String(this.nextTicketId++).padStart(4, '0')}`;
  }

  newBookingId() {
    return `BKG-${String(this.nextBookingId++).padStart(4, '0')}`;
  }

  allRoomCodes() {
    const codes = [];
    for (const b of this.campus.buildings) {
      for (const f of b.floors) {
        codes.push(...f.rooms);
      }
    }
    return codes;
  }

  findStaffByRole(role) {
    return this.staff.filter(s => s.role === role);
  }

  findStaffByDepartment(dept) {
    return this.staff.filter(s => s.department === dept);
  }
}

module.exports = CampusRegistry;
