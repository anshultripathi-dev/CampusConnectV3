# CampusConnect V2 Architecture

CampusConnect V2 is a modular monolith. The existing 23 GoF pattern implementations remain in `src/patterns/` and are being integrated into domain-oriented modules instead of being used as isolated examples.

## Runtime

- Node.js 22.5+
- Express
- SQLite via Node's built-in `node:sqlite`
- EventBus for domain events
- Existing Claude integration with heuristic fallback

## V2 API

- `/api/v2/dashboard/*`
- `/api/v2/incidents/*`
- `/api/v2/resources/*`
- `/api/v2/bookings/*`
- `/api/v2/notifications`
- `/api/v2/analytics/*`
- `/api/v2/architecture/*`

## Persistence

The database is created automatically at `data/campusconnect.db`. The schema is created on startup and reference data is seeded from `data/seed.json`.

## Pattern integration

Creational: Singleton, Abstract Factory, Factory Method, Builder, Prototype.
Structural: Adapter, Bridge, Composite, Decorator, Facade, Flyweight, Proxy.
Behavioral: Chain of Responsibility, Command, Interpreter, Iterator, Mediator, Memento, Observer, State, Strategy, Template Method, Visitor.

## Compatibility

The original `/api/tickets`, `/api/bookings`, `/api/campus` and `/api/ai` compatibility routes and `server.legacy.js` have been removed; all functionality is served from `/api/v2`.

## Phase 4 additions

### Persistent Command History
`command_history` stores each incident command's actor, action, before-state and after-state. The latest command can be undone when the current incident still matches its recorded after-state. This preserves Command semantics across HTTP requests and server restarts.

### Real-time Event Layer
The domain EventBus is bridged to Socket.IO. Authenticated browser clients receive `incident.created`, `incident.updated`, `booking.created`, `notification.created`, and `audit.created` events. The same session token used by the REST API authenticates the WebSocket connection.

### AI Operations
The incident workspace can request duplicate candidates and operational recommendations. The adapter remains provider-neutral: Claude can be used for triage while deterministic similarity/recommendation logic provides a transparent fallback.
