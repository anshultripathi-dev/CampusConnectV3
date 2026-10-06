// Seeds a realistic, presentable set of demo incidents and bookings the
// first time the app runs against an empty database. This only ever
// inserts data through the real domain services (facade/state/command/etc.)
// so every pattern trace, audit entry, and notification is generated the
// same way a real user action would generate it — nothing here is a fake
// shortcut around the architecture. It is skipped entirely once real
// incidents exist.
const { db } = require('./infrastructure/database');
const repo = require('./incidents/repository');
const incidents = require('./incidents/service');
const resources = require('./resources/service');
const bookingRepo = require('./resources/repository');

function hoursAgoISO(h) { return new Date(Date.now() - h * 3600 * 1000).toISOString(); }

// Backdate an incident's created/updated timestamps (and its CREATED event)
// so the demo data shows a believable spread of SLA pressure instead of
// everything looking like it was just filed this second.
function backdate(incidentId, hoursAgo) {
  const createdAt = hoursAgoISO(hoursAgo);
  db.prepare('UPDATE incidents SET created_at=? WHERE id=?').run(createdAt, incidentId);
  db.prepare("UPDATE incident_events SET created_at=? WHERE incident_id=? AND event_type='CREATED'").run(createdAt, incidentId);
}

const INCIDENT_SPECS = [
  {
    title: 'Water leak near Lab 204 ceiling',
    description: 'Steady water drip from the ceiling tiles outside Lab 204, floor is getting slippery and a bucket has been placed underneath.',
    category: 'Maintenance', subCategory: 'Plumbing', severity: 'Critical',
    location: 'MB-102, Main Block', reporter: 'u-student',
    hoursAgo: 30, // SLA 24h -> breached
    steps: [{ action: 'assign', actor: 'u-102', payload: { staffId: 'u-101' } }, { action: 'start', actor: 'u-101' }],
    escalate: 'u-102',
  },
  {
    title: 'Fire alarm sounding intermittently',
    description: 'The fire alarm on the third floor has been going off every hour overnight with no visible cause, disrupting residents.',
    category: 'Safety', subCategory: 'Security', severity: 'Critical',
    location: 'TT-301, Tech Tower', reporter: 'u-student',
    hoursAgo: 50, resolvedHoursAgo: 3,
    steps: [{ action: 'assign', actor: 'u-202', payload: { staffId: 'u-201' } }, { action: 'start', actor: 'u-201' }, { action: 'resolve', actor: 'u-202', payload: { resolutionNote: 'Faulty smoke detector replaced by campus electrician.' } }, { action: 'close', actor: 'u-202' }],
  },
  {
    title: 'Projector not turning on',
    description: 'The ceiling-mounted projector will not power on even after replacing the remote batteries; class had to use a whiteboard instead.',
    category: 'Maintenance', subCategory: 'Electrical', severity: 'Medium',
    location: 'MB-101, Main Block', reporter: 'u-student',
    hoursAgo: 5,
    steps: [{ action: 'assign', actor: 'u-102', payload: { staffId: 'u-101' } }, { action: 'start', actor: 'u-101' }],
  },
  {
    title: 'Lost blue backpack near cafeteria',
    description: 'Left a blue backpack with a laptop sticker on it near the cafeteria seating area around lunchtime. Has a water bottle and notebooks inside.',
    category: 'LostFound', subCategory: 'General', severity: 'Low',
    location: 'Main Block, Ground Floor', reporter: 'u-student',
    itemDescription: 'Blue backpack with a laptop sticker, water bottle and notebooks inside.',
    hoursAgo: 1,
    steps: [],
  },
  {
    title: 'Hostel Wi-Fi outage on Floor 2',
    description: 'No Wi-Fi signal anywhere on the second floor since this morning; residents cannot access online coursework.',
    category: 'Maintenance', subCategory: 'IT', severity: 'High',
    location: 'HC-201, Hostel Block C', reporter: 'u-student',
    hoursAgo: 10, // SLA 12h -> at risk
    steps: [{ action: 'assign', actor: 'u-102', payload: { staffId: 'u-301' } }, { action: 'start', actor: 'u-301' }],
  },
  {
    title: 'Suspicious person near Hostel Block C',
    description: 'An unfamiliar individual was seen trying door handles along the ground floor corridor late in the evening.',
    category: 'Safety', subCategory: 'Security', severity: 'Critical',
    location: 'Hostel Block C, Ground Floor', reporter: 'u-student',
    hoursAgo: 26, resolvedHoursAgo: 22,
    steps: [{ action: 'assign', actor: 'u-202', payload: { staffId: 'u-201' } }, { action: 'start', actor: 'u-201' }, { action: 'resolve', actor: 'u-202', payload: { resolutionNote: 'Patrol confirmed individual was a visiting parent; escorted to front desk.' } }, { action: 'close', actor: 'u-202' }],
  },
  {
    title: 'AC not cooling in Tech Tower room',
    description: 'The air conditioning unit is running but blowing warm air, making the room uncomfortable during afternoon sessions.',
    category: 'Maintenance', subCategory: 'Electrical', severity: 'Medium',
    location: 'TT-303, Tech Tower', reporter: 'u-student',
    hoursAgo: 3,
    steps: [],
  },
  {
    title: 'Leaking faucet in washroom',
    description: 'Bathroom faucet on the first floor keeps dripping even when fully shut off, wasting water overnight.',
    category: 'Maintenance', subCategory: 'Plumbing', severity: 'Low',
    location: 'HC-101, Hostel Block C', reporter: 'u-student',
    hoursAgo: 15,
    steps: [{ action: 'assign', actor: 'u-102', payload: { staffId: 'u-101' } }, { action: 'start', actor: 'u-101' }, { action: 'markDone', actor: 'u-101', payload: { note: 'Replaced worn washer, tested for leaks over 20 minutes.' } }],
  },
  {
    title: 'Network down in server room',
    description: 'Core switch in the Tech Tower server room appears offline, taking down wired network access for the whole floor.',
    category: 'Maintenance', subCategory: 'IT', severity: 'Critical',
    location: 'TT-101, Tech Tower', reporter: 'u-student',
    hoursAgo: 1,
    steps: [{ action: 'assign', actor: 'u-102', payload: { staffId: 'u-301' } }],
  },
  {
    title: 'Found ID card near Main Block entrance',
    description: 'Picked up a student ID card dropped near the Main Block entrance steps; name on the card is partially worn off.',
    category: 'LostFound', subCategory: 'General', severity: 'Low',
    location: 'Main Block Entrance', reporter: 'u-student',
    itemDescription: 'Student ID card, name partially worn off, photo still visible.',
    hoursAgo: 8,
    steps: [{ action: 'assign', actor: 'u-103', payload: { staffId: 'u-103' } }, { action: 'resolve', actor: 'u-103', payload: { resolutionNote: 'Card matched to student record and held at Facilities desk for pickup.' } }],
  },
];

// A cluster of related reports from different people: the kind of pattern the AI
// insights panel is meant to surface as one probable root cause.
const SYSTEMIC_SPECS = [
  { title: 'Wi-Fi keeps dropping in Block B classrooms', description: 'Wifi disconnects every few minutes during lectures in Block B, cannot stay connected to the campus network.',
    category: 'Maintenance', subCategory: 'IT', severity: 'Medium', location: 'BB-201, Block B', reporter: 'u-student', hoursAgo: 5, steps: [] },
  { title: 'No wifi connection on second floor of Block B', description: 'Campus wifi is not working at all on the second floor, laptops show connected but no internet in Block B.',
    category: 'Maintenance', subCategory: 'IT', severity: 'Medium', location: 'BB-210, Block B', reporter: 'u-student', hoursAgo: 4, steps: [] },
  { title: 'Internet very slow and disconnecting in Block B lab', description: 'Network is extremely slow in the Block B computer lab and the wifi keeps disconnecting during practicals.',
    category: 'Maintenance', subCategory: 'IT', severity: 'High', location: 'BB-105, Block B', reporter: 'u-student', hoursAgo: 2, steps: [] },
  { title: 'Air conditioner blowing warm air in seminar hall', description: 'The air conditioning unit in the seminar hall is running but only blowing warm air, hall is uncomfortable.',
    category: 'Maintenance', subCategory: 'Electrical', severity: 'Low', location: 'TT-301, Tech Tower', reporter: 'u-student', hoursAgo: 6, steps: [] },
];

function seedDemoIncidents() {
  if (repo.list().length > 0) return; // real data exists — never touch it
  createFromSpecs(INCIDENT_SPECS);
  createFromSpecs(SYSTEMIC_SPECS);
}

// Adds the clustered demo reports to a database that holds only demo data (every
// incident filed by the demo student), so existing demos gain the AI insights too.
function seedDemoClusters() {
  const all = repo.list();
  if (!all.length || all.some(i => i.reporter !== 'u-student') || all.some(i => i.title === SYSTEMIC_SPECS[0].title)) return;
  createFromSpecs(SYSTEMIC_SPECS);
}

function createFromSpecs(specs) {
  for (const spec of specs) {
    try {
      const result = incidents.create({
        title: spec.title,
        description: spec.description,
        category: spec.category,
        subCategory: spec.subCategory,
        location: spec.location,
        severity: spec.severity,
        itemDescription: spec.itemDescription,
        reporter: spec.reporter,
        actor: spec.reporter,
        reporterContact: 'student@campusconnect.local',
        flags: spec.severity === 'Critical' ? ['Urgent'] : [],
      });
      if (!result.success) { console.warn(`[seed] skipped "${spec.title}": ${result.error}`); continue; }
      const id = result.ticket.id;
      if (spec.hoursAgo) backdate(id, spec.hoursAgo);
      for (const step of spec.steps || []) {
        const r = incidents.command(id, step.action, { actor: step.actor, role: 'Supervisor', ...step.payload });
        if (r.error) console.warn(`[seed] "${spec.title}" step "${step.action}" failed: ${r.error}`);
      }
      if (spec.resolvedHoursAgo != null) {
        db.prepare('UPDATE incidents SET resolved_at=?, updated_at=? WHERE id=?').run(hoursAgoISO(spec.resolvedHoursAgo), hoursAgoISO(spec.resolvedHoursAgo), id);
      }
      if (spec.escalate) {
        incidents.escalate(id, spec.escalate);
      }
    } catch (e) {
      console.warn(`[seed] error creating "${spec.title}":`, e.message);
    }
  }
  console.log(`[seed] Loaded ${specs.length} demo incidents so the dashboard has something to show.`);
}

const BOOKING_SPECS = [
  { room: 'MB-101', startHoursFromNow: 2, durationHours: 1, attendees: 18, purpose: 'Department planning meeting', equipment: ['eq-projector', 'eq-whiteboard'], requester: 'u-102' },
  { room: 'TT-301', startHoursFromNow: 26, durationHours: 2, attendees: 30, purpose: 'Guest lecture on renewable energy', equipment: ['eq-projector', 'eq-mic'], requester: 'u-103' },
  { room: 'HC-101', startHoursFromNow: -20, durationHours: 1, attendees: 8, purpose: 'Hostel committee meeting', equipment: ['eq-whiteboard'], requester: 'u-student' },
  { room: 'TT-101', startHoursFromNow: 5, durationHours: 3, attendees: 12, purpose: 'Workshop: intro to networking', equipment: ['eq-projector', 'eq-ac'], requester: 'u-301' },
];

// Requests waiting for a decision. Two of them compete for the same slot on purpose,
// so an approver can see what happens when only one can win the room.
const PENDING_BOOKING_SPECS = [
  { room: 'MB-102', startHoursFromNow: 30, durationHours: 2, attendees: 25, purpose: 'Final-year project demo rehearsal', equipment: ['eq-projector'], requester: 'u-student' },
  { room: 'MB-103', startHoursFromNow: 52, durationHours: 3, attendees: 35, purpose: 'Coding club hack session', equipment: ['eq-projector', 'eq-whiteboard'], requester: 'u-student' },
  { room: 'MB-103', startHoursFromNow: 53, durationHours: 2, attendees: 20, purpose: 'IT helpdesk training', equipment: ['eq-whiteboard'], requester: 'u-301' },
];

function seedDemoBookings() {
  if (resources.list().length > 0) return;
  for (const spec of BOOKING_SPECS) {
    try {
      const start = new Date(Date.now() + spec.startHoursFromNow * 3600 * 1000);
      const end = new Date(start.getTime() + spec.durationHours * 3600 * 1000);
      const r = resources.create({
        room: spec.room,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        attendees: spec.attendees,
        purpose: spec.purpose,
        equipment: spec.equipment,
        requester: spec.requester,
      });
      if (r.error) console.warn(`[seed] booking for ${spec.room} skipped: ${r.error}`);
      else bookingRepo.setDecision(r.id, { status: 'APPROVED', decidedBy: 'u-103', note: 'Approved' });
    } catch (e) {
      console.warn(`[seed] error creating booking for ${spec.room}:`, e.message);
    }
  }
}

function seedPendingBookings() {
  const demoRequesters = ['u-student', 'u-102', 'u-103', 'u-301'];
  const existing = bookingRepo.bookings();
  if (process.env.NODE_ENV === 'production') return;
  if (existing.some(b => b.purpose === PENDING_BOOKING_SPECS[0].purpose)) return;
  if (!existing.every(b => demoRequesters.includes(b.requesterId))) return; // real bookings exist
  for (const spec of PENDING_BOOKING_SPECS) {
    const start = new Date(Date.now() + spec.startHoursFromNow * 3600 * 1000);
    const r = resources.create({ room: spec.room, startTime: start.toISOString(), endTime: new Date(start.getTime() + spec.durationHours * 3600 * 1000).toISOString(), attendees: spec.attendees, purpose: spec.purpose, equipment: spec.equipment, requester: spec.requester });
    if (r.error) console.warn(`[seed] pending booking skipped: ${r.error}`);
  }
}

// A weekly recurring request and a sample conversation, so those features have something to show.
function seedRecurringAndComments() {
  if (process.env.NODE_ENV === 'production') return;
  const demoRequesters = ['u-student', 'u-102', 'u-103', 'u-301'];
  const bookings = bookingRepo.bookings();
  const purpose = 'Weekly robotics club';
  if (!bookings.some(b => b.purpose === purpose) && bookings.every(b => demoRequesters.includes(b.requesterId))) {
    const sessions = Array.from({ length: 6 }, (_, i) => {
      const s = new Date(); s.setDate(s.getDate() + 4 + i * 7); s.setHours(15, 0, 0, 0);
      return { startTime: s.toISOString(), endTime: new Date(s.getTime() + 2 * 3600000).toISOString() };
    });
    try { require('./resources/series').create({ room: 'MB-201', occurrences: sessions, pattern: 'weekly', attendees: 18, purpose, equipment: ['eq-projector'] }, { id: 'u-student', role: 'Student' }); }
    catch (e) { console.warn(`[seed] recurring booking skipped: ${e.message}`); }
  }
  const noComments = db.prepare('SELECT COUNT(*) n FROM incident_comments').get().n === 0;
  const all = repo.list();
  if (noComments && all.length && all.every(i => i.reporter === 'u-student')) {
    const comments = require('./comments');
    const student = { id: 'u-student', name: 'Campus Student', role: 'Student' };
    const crew = { id: 'u-101', name: 'Ramesh Kumar', role: 'Maintenance' };
    const lead = { id: 'u-102', name: 'Priya Singh', role: 'Supervisor' };
    const target = all.find(i => /Water leak near Lab 204/.test(i.title));
    if (target) {
      try {
        comments.add(target.id, student, { body: 'The drip is getting heavier and the corridor floor is wet. Please be careful.' });
        comments.add(target.id, lead, { body: 'Check the pipe joint above the false ceiling first — it failed once last year.', internal: true });
        comments.add(target.id, crew, { body: 'Thanks for the update. A crew is on the way with a sealant kit; please keep people away from the wet area.' });
      } catch (e) { console.warn(`[seed] comments skipped: ${e.message}`); }
    }
  }
}

// Demo content is for local use and demos. Production starts with reference data only
// (campus, rooms, equipment, accounts) unless CAMPUSCONNECT_SEED_DEMO=1 asks for it.
function seedDemoData() {
  if (process.env.NODE_ENV === 'production' && process.env.CAMPUSCONNECT_SEED_DEMO !== '1') return;
  seedDemoIncidents();
  seedDemoClusters();
  seedDemoBookings();
  seedPendingBookings();
  seedRecurringAndComments();
}

module.exports = { seedDemoData, seedDemoIncidents, seedDemoBookings, createFromSpecs, INCIDENT_SPECS };
