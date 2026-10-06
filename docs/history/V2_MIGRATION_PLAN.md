# CampusConnect V1 → V2 Migration Plan

## Completed in foundation stage

- Persistent SQLite schema
- Reference-data seeding
- Incident repository
- Resource repository
- EventBus
- Notification persistence
- AI analysis persistence
- Pattern execution tracing
- Dashboard overview API
- V2 incident API
- V2 resource/booking API
- Architecture Observatory API
- Legacy API compatibility

## Next

### 1. Authentication

Replace the current role-switching demonstration with real authentication and RBAC.

### 2. Incident domain completion

Move every command, SLA operation, handoff and snapshot operation behind explicit application use cases and persist every state change.

### 3. Resource domain completion

Add room availability, approval, recurring booking templates and equipment reservation persistence.

### 4. Real-time

Connect Socket.IO to the EventBus so incident and booking changes appear without refresh.

### 5. Frontend migration

Replace the current vanilla UI with React + TypeScript using the role-specific layouts specified in the project design.

### 6. AI operations

Add duplicate detection, incident summaries, campus brief and predictive maintenance recommendations.

### 7. Quality

Add unit tests for all 23 patterns, integration tests for incident/booking workflows, API documentation, Docker and CI.

## Phase 3 — Authentication, RBAC & Audit (completed)
- Added token-based authenticated sessions using Node `crypto` and seeded users.
- Added password hashing with `scrypt` and an 8-hour in-memory session lifetime.
- Added authenticated `/api/v2/auth/login`, `/me`, and `/logout` endpoints.
- Removed reliance on client-supplied role for authenticated incident reads/mutations.
- Added server-side command authorization by role.
- Wired persistent audit records for incident creation, command transitions, escalation, handoff, snapshot restoration, and booking creation.
- Added `/api/v2/audit` for authenticated audit inspection.
- Added React login screen and authenticated API client.

Demo password defaults to `campus123` and can be changed with `CAMPUSCONNECT_DEMO_PASSWORD` before first password initialization.
