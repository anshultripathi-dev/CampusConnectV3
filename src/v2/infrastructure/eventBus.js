class EventBus {
  constructor() { this.handlers = new Map(); }
  subscribe(eventName, handler) {
    if (!this.handlers.has(eventName)) this.handlers.set(eventName, new Set());
    this.handlers.get(eventName).add(handler);
    return () => this.handlers.get(eventName)?.delete(handler);
  }
  publish(eventName, payload) {
    const handlers = this.handlers.get(eventName) || [];
    return [...handlers].map(handler => handler(payload));
  }
}
module.exports = new EventBus();
