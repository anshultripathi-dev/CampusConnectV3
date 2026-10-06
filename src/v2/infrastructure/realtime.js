const eventBus = require('./eventBus');
const auth = require('../auth');

let io = null;
let unsubscribers = [];
const MANAGEMENT = ['Supervisor', 'FacilitiesHead', 'SecurityHead', 'Admin'];
const managementRooms = MANAGEMENT.map(r => `role:${r}`);

function init(socketServer) {
  io = socketServer;
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');
    const user = auth.authenticate(token);
    if (!user) return next(new Error('Authentication required'));
    socket.user = user;
    next();
  });

  io.on('connection', socket => {
    socket.join(`role:${socket.user.role}`);
    socket.join(`user:${socket.user.id}`);
    if (socket.user.department) socket.join(`department:${socket.user.department}`);
    socket.emit('system.connected', { user: socket.user, connectedAt: new Date().toISOString() });
  });

  // Each event is delivered only to the rooms whose members are allowed to see it.
  const forward = (eventName, socketEvent, transform, rooms) => {
    const unsub = eventBus.subscribe(eventName, payload => {
      if (!io) return;
      const body = transform(payload);
      const targets = rooms(body);
      if (targets.length) io.to(targets).emit(socketEvent, body);
    });
    unsubscribers.push(unsub);
  };
  const compact = list => [...new Set(list.filter(Boolean))];
  const incidentRooms = ({ incident }) => compact([...managementRooms, incident?.department && `department:${incident.department}`, incident?.reporter && `user:${incident.reporter}`, incident?.assignedTo && `user:${incident.assignedTo}`]);
  const bookingRooms = ({ booking }) => compact([...managementRooms, booking?.requester_id && `user:${booking.requester_id}`, booking?.requesterId && `user:${booking.requesterId}`]);
  const notificationRooms = n => (n?.recipient === 'operations' ? managementRooms : compact([`user:${n?.recipient}`, `department:${n?.recipient}`]));

  forward('incident.created', 'incident.created', x => ({ incident: x.ticket || x.incident, at: new Date().toISOString() }), incidentRooms);
  forward('incident.updated', 'incident.updated', x => ({ incident: x.incident || x.ticket, action: x.action, at: new Date().toISOString() }), incidentRooms);
  const commentRooms = ({ incident, internal }) => compact([...managementRooms, incident?.department && `department:${incident.department}`, incident?.assignedTo && `user:${incident.assignedTo}`, !internal && incident?.reporter && `user:${incident.reporter}`]);
  forward('incident.comment', 'incident.comment', x => ({ incident: { id: x.incidentId, department: x.incident?.department, assignedTo: x.incident?.assignedTo, reporter: x.incident?.reporter }, internal: x.internal, at: new Date().toISOString() }), commentRooms);
  forward('booking.created', 'booking.created', x => ({ booking: x.booking || x, at: new Date().toISOString() }), bookingRooms);
  forward('booking.updated', 'booking.updated', x => ({ booking: x.booking || x, action: x.action, at: new Date().toISOString() }), bookingRooms);
  forward('notification.created', 'notification.created', x => x, notificationRooms);
  forward('audit.created', 'audit.created', x => x, () => managementRooms);
  return io;
}

function publish(event, payload) {
  if (io) io.emit(event, payload);
}
function close() { unsubscribers.forEach(fn => fn()); unsubscribers = []; io = null; }
module.exports = { init, publish, close };
