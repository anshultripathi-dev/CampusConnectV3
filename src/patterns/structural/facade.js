// ---- FACADE PATTERN ----
// Submitting a ticket really requires coordinating validation (Abstract
// Factory), routing, subtype creation (Factory Method), decoration,
// state initialization, and notification (Bridge). TicketSubmissionFacade
// hides all of that behind one simple submitTicket() call.

const { getTicketFamilyFactory } = require('../creational/abstractFactory');
const { ReportFactory } = require('../creational/factoryMethod');
const { decorateTicket } = require('./decorator');
const { EmailChannel, StatusUpdateNotification } = require('./bridge');
const { TicketStateMachine } = require('../behavioral/state');
const CampusRegistry = require('../creational/singleton');

class TicketSubmissionFacade {
  submitTicket(payload) {
    const registry = CampusRegistry.getInstance();
    const family = getTicketFamilyFactory(payload.category);

    // 1. Validate using the category's matched validator
    const validator = family.createValidator();
    const validationError = validator.validate(payload);
    if (validationError) {
      return { success: false, error: validationError };
    }

    // 2. Create the specific report subtype (Factory Method)
    const id = registry.newTicketId();
    const report = ReportFactory.create(payload.subCategory, {
      id,
      title: payload.title,
      description: payload.description,
      location: payload.location,
    });

    // 3. Determine routing (Abstract Factory family member)
    const router = family.createRouter();

    // 4. Assemble the ticket, with its own state machine
    const ticket = {
      id,
      category: payload.category,
      subCategory: payload.subCategory || null,
      title: payload.title,
      description: payload.description,
      location: payload.location,
      severity: payload.severity || 'Normal',
      itemDescription: payload.itemDescription || null,
      reporter: payload.reporter || 'Anonymous',
      department: router.department,
      assignedTo: null,
      baseScore: report.slaHours <= 12 ? 8 : report.slaHours <= 24 ? 5 : 2,
      icon: report.icon,
      slaHours: report.slaHours,
      flags: payload.flags || [],
      createdAt: new Date().toISOString(),
      history: [],
    };

    ticket.state = new TicketStateMachine(ticket);
    ticket.state.submit();

    // 5. Apply decorators for priority scoring/tags
    const decorated = decorateTicket(ticket, ticket.flags);
    ticket.priorityScore = decorated.getPriorityScore();
    ticket.tags = decorated.getTags();

    registry.tickets.set(id, ticket);

    // 6. Notify the reporter via the bridge (kind + channel combined freely)
    const notification = new StatusUpdateNotification(new EmailChannel());
    const notifyResult = notification.notify(payload.reporterContact || 'reporter@campus.edu', {
      ticketId: id,
      status: ticket.state.current,
    });

    return { success: true, ticket, notifyLog: notifyResult.log };
  }
}

module.exports = { TicketSubmissionFacade };
