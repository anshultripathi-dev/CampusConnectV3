// ---- BRIDGE PATTERN ----
// Notification "kind" (StatusUpdate, Escalation, Reminder) and delivery
// "channel" (Email, SMS, Push) can vary independently. The bridge lets us
// combine any kind with any channel without an explosion of subclasses.

// -- Implementor hierarchy: delivery channels --
class NotificationChannel {
  send(recipient, subject, message) { throw new Error('send() must be implemented'); }
}

class EmailChannel extends NotificationChannel {
  send(recipient, subject, message) {
    const log = `[EMAIL to ${recipient}] ${subject}: ${message}`;
    return { channel: 'email', log };
  }
}

class SMSChannel extends NotificationChannel {
  send(recipient, subject, message) {
    const log = `[SMS to ${recipient}] ${message.slice(0, 100)}`;
    return { channel: 'sms', log };
  }
}

class PushChannel extends NotificationChannel {
  send(recipient, subject, message) {
    const log = `[PUSH to ${recipient}] ${subject}`;
    return { channel: 'push', log };
  }
}

// -- Abstraction hierarchy: notification kinds, bridged to a channel --
class Notification {
  constructor(channel) {
    this.channel = channel; // the bridge to the implementor
  }
  notify(recipient, context) { throw new Error('notify() must be implemented'); }
}

class StatusUpdateNotification extends Notification {
  notify(recipient, context) {
    return this.channel.send(recipient, 'Ticket Status Update', `Your ticket ${context.ticketId} is now "${context.status}".`);
  }
}

class EscalationNotification extends Notification {
  notify(recipient, context) {
    return this.channel.send(recipient, 'Escalation Notice', `Ticket ${context.ticketId} has been escalated to you: ${context.reason}`);
  }
}

module.exports = { EmailChannel, SMSChannel, PushChannel, StatusUpdateNotification, EscalationNotification };
