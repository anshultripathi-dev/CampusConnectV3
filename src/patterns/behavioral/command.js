// ---- COMMAND PATTERN ----
// Staff actions on a ticket (assign, resolve, reopen, reject) are wrapped as
// command objects so they can be executed uniformly, logged, and undone via
// a shared invoker/history stack.

class TicketCommand {
  constructor(ticket) { this.ticket = ticket; }
  execute() { throw new Error('execute() must be implemented'); }
  undo() { throw new Error('undo() must be implemented'); }
}

class AssignCommand extends TicketCommand {
  constructor(ticket, staffId) {
    super(ticket);
    this.staffId = staffId;
    this.previousAssignee = ticket.assignedTo;
  }
  execute() {
    this.ticket.assignedTo = this.staffId;
    this.ticket.state.assign();
    return `Ticket ${this.ticket.id} assigned to ${this.staffId}`;
  }
  undo() {
    this.ticket.assignedTo = this.previousAssignee;
    return `Assignment of ${this.ticket.id} undone`;
  }
}

class ResolveCommand extends TicketCommand {
  constructor(ticket, resolutionNote) {
    super(ticket);
    this.resolutionNote = resolutionNote;
    this.previousState = ticket.state.current;
  }
  execute() {
    this.ticket.state.resolve();
    this.ticket.resolutionNote = this.resolutionNote;
    return `Ticket ${this.ticket.id} marked resolved`;
  }
  undo() {
    this.ticket.state.forceState(this.previousState);
    return `Resolution of ${this.ticket.id} undone, reverted to ${this.previousState}`;
  }
}

class CloseCommand extends TicketCommand {
  constructor(ticket){ super(ticket); this.previousState=ticket.state.current; }
  execute(){ this.ticket.state.close(); return `Ticket ${this.ticket.id} closed`; }
  undo(){ this.ticket.state.forceState(this.previousState); return `Close of ${this.ticket.id} undone`; }
}

class ReopenCommand extends TicketCommand {
  constructor(ticket) {
    super(ticket);
    this.previousState = ticket.state.current;
  }
  execute() {
    this.ticket.state.reopen();
    return `Ticket ${this.ticket.id} reopened`;
  }
  undo() {
    this.ticket.state.forceState(this.previousState);
    return `Reopen of ${this.ticket.id} undone`;
  }
}

class RejectCommand extends TicketCommand {
  constructor(ticket, reason) {
    super(ticket);
    this.reason = reason;
    this.previousState = ticket.state.current;
  }
  execute() {
    this.ticket.state.reject();
    this.ticket.rejectionReason = this.reason;
    return `Ticket ${this.ticket.id} rejected: ${this.reason}`;
  }
  undo() {
    this.ticket.state.forceState(this.previousState);
    return `Rejection of ${this.ticket.id} undone`;
  }
}

class StartCommand extends TicketCommand {
  constructor(ticket) {
    super(ticket);
    this.previousState = ticket.state.current;
  }
  execute() {
    this.ticket.state.start();
    return `Ticket ${this.ticket.id} moved to In Progress`;
  }
  undo() {
    this.ticket.state.forceState(this.previousState);
    return `Start of ${this.ticket.id} undone`;
  }
}

class MarkDoneCommand extends TicketCommand {
  constructor(ticket, note) {
    super(ticket);
    this.note = note;
    this.previousState = ticket.state.current;
  }
  execute() {
    this.ticket.state.markDone();
    this.ticket.staffNote = this.note;
    return `Ticket ${this.ticket.id} marked done by staff — pending admin approval`;
  }
  undo() {
    this.ticket.state.forceState(this.previousState);
    return `"Mark done" on ${this.ticket.id} undone`;
  }
}

class ApproveCommand extends TicketCommand {
  constructor(ticket, note) {
    super(ticket);
    this.note = note;
    this.previousState = ticket.state.current;
  }
  execute() {
    this.ticket.state.approve();
    this.ticket.resolutionNote = this.note;
    return `Ticket ${this.ticket.id} approved and resolved by admin`;
  }
  undo() {
    this.ticket.state.forceState(this.previousState);
    return `Approval of ${this.ticket.id} undone`;
  }
}

class SendBackCommand extends TicketCommand {
  constructor(ticket, reason) {
    super(ticket);
    this.reason = reason;
    this.previousState = ticket.state.current;
  }
  execute() {
    this.ticket.state.sendBack();
    this.ticket.sendBackReason = this.reason;
    return `Ticket ${this.ticket.id} sent back to staff: ${this.reason}`;
  }
  undo() {
    this.ticket.state.forceState(this.previousState);
    return `Send-back of ${this.ticket.id} undone`;
  }
}

class TicketCommandInvoker {
  constructor() {
    this.history = []; // per-ticket undo stacks keyed by ticket id
  }
  run(command) {
    const result = command.execute();
    if (!this.history[command.ticket.id]) this.history[command.ticket.id] = [];
    this.history[command.ticket.id].push(command);
    return result;
  }
  undoLast(ticketId) {
    const stack = this.history[ticketId];
    if (!stack || stack.length === 0) return 'Nothing to undo for this ticket';
    const command = stack.pop();
    return command.undo();
  }
}

module.exports = {
  AssignCommand, ResolveCommand, CloseCommand, ReopenCommand, RejectCommand,
  StartCommand, MarkDoneCommand, ApproveCommand, SendBackCommand,
  TicketCommandInvoker,
};
