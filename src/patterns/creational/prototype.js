// ---- PROTOTYPE PATTERN ----
// Recurring bookings (e.g. "weekly club meeting") are saved as prototype
// templates. Instead of rebuilding a booking from scratch each week, callers
// clone the prototype and only tweak the date/time.

class BookingTemplate {
  constructor({ name, room, durationMinutes, equipment, purpose, attendees }) {
    this.name = name;
    this.room = room;
    this.durationMinutes = durationMinutes;
    this.equipment = [...equipment];
    this.purpose = purpose;
    this.attendees = attendees;
  }

  // The core prototype operation: deep-ish clone so mutating the clone
  // never corrupts the stored template.
  clone(overrides = {}) {
    const cloned = new BookingTemplate({
      name: this.name,
      room: this.room,
      durationMinutes: this.durationMinutes,
      equipment: this.equipment,
      purpose: this.purpose,
      attendees: this.attendees,
    });
    return Object.assign(cloned, overrides);
  }
}

class BookingTemplateRegistry {
  constructor() {
    this.templates = new Map();
    // Seed a couple of realistic recurring templates
    this.register('weekly-club-meeting', new BookingTemplate({
      name: 'Weekly Club Meeting',
      room: 'MB-102',
      durationMinutes: 60,
      equipment: ['eq-projector', 'eq-whiteboard'],
      purpose: 'Robotics Club weekly sync',
      attendees: 15,
    }));
    this.register('exam-review-session', new BookingTemplate({
      name: 'Exam Review Session',
      room: 'TT-301',
      durationMinutes: 90,
      equipment: ['eq-projector', 'eq-mic'],
      purpose: 'End-semester review',
      attendees: 40,
    }));
  }

  register(key, template) {
    this.templates.set(key, template);
  }

  cloneFrom(key, overrides) {
    const template = this.templates.get(key);
    if (!template) throw new Error(`No booking template named "${key}"`);
    return template.clone(overrides);
  }

  list() {
    return Array.from(this.templates.entries()).map(([key, t]) => ({ key, ...t }));
  }
}

module.exports = { BookingTemplate, BookingTemplateRegistry };
