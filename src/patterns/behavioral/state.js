// ---- STATE PATTERN ----
// A ticket's allowed transitions depend entirely on its current lifecycle
// stage, and now also model the reporter -> staff -> admin workflow:
//   Submitted -> InReview -> Assigned -> InProgress -> PendingApproval
//   -> Resolved -> Closed (with Reopened/Rejected as branches).
// Staff can carry a ticket up to PendingApproval; only an admin can move it
// out of PendingApproval (approve -> Resolved, or sendBack -> InProgress).
// TicketStateMachine encapsulates the legal transitions so invalid moves are
// rejected close to where the rule actually lives — role permissions (who is
// allowed to call these methods) are enforced separately in permissions.js.

const TRANSITIONS = {
  Submitted:        { review: 'InReview' },
  InReview:          { assign: 'Assigned', reject: 'Rejected' },
  Assigned:          { start: 'InProgress', reassign: 'Assigned' },
  InProgress:        { markDone: 'PendingApproval', resolve: 'Resolved' },
  PendingApproval:   { approve: 'Resolved', sendBack: 'InProgress' },
  Resolved:          { close: 'Closed', reopen: 'Reopened' },
  Reopened:          { assign: 'Assigned' },
  Rejected:          { reopen: 'Reopened' },
  Closed:            {},
};

class TicketStateMachine {
  constructor(ticket, initial = 'Submitted') {
    this.ticket = ticket;
    this.current = initial;
    this.log = [{ state: initial, at: new Date().toISOString() }];
  }

  _transition(action) {
    const next = TRANSITIONS[this.current] && TRANSITIONS[this.current][action];
    if (!next) {
      throw new Error(`Cannot perform "${action}" from state "${this.current}"`);
    }
    this.current = next;
    this.log.push({ state: next, at: new Date().toISOString() });
    return this.current;
  }

  submit() { this.current = 'Submitted'; this.log = [{ state: 'Submitted', at: new Date().toISOString() }]; return this.current; }
  review() { return this._transition('review'); }

  // Staff step 1: claim the ticket.
  assign() {
    if (this.current === 'Submitted') this._transition('review');
    return this._transition(this.current === 'Assigned' ? 'reassign' : 'assign');
  }

  // Staff step 2: start doing the work.
  start() { return this._transition('start'); }

  // Staff step 3: hand the finished work to an admin for sign-off.
  markDone() { return this._transition('markDone'); }

  // Admin: approve the staff's work -> Resolved.
  approve() { return this._transition('approve'); }

  // Admin: not good enough yet -> send back to the staff for more work.
  sendBack() { return this._transition('sendBack'); }

  // Admin shortcut: resolve directly without the staff hand-off step
  // (auto-starts if still just Assigned).
  resolve() {
    if (this.current === 'Assigned') this._transition('start');
    return this._transition('resolve');
  }

  close() { return this._transition('close'); }
  reopen() { return this._transition('reopen'); }
  reject() {
    if (this.current === 'Submitted') this._transition('review');
    return this._transition('reject');
  }

  // Used by Command/Memento undo to force a state without re-validating the path.
  forceState(state) {
    this.current = state;
    this.log.push({ state: `${state} (restored)`, at: new Date().toISOString() });
  }
}

module.exports = { TicketStateMachine, TRANSITIONS };
