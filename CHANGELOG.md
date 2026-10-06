# Changelog

All notable changes to CampusConnect are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/). For upgrade instructions see [`docs/MIGRATION.md`](docs/MIGRATION.md).

## [Unreleased]

## [3.0.0] — 2026-10-07

The **V3** release: complete workflows, a hardened and offline-capable platform, a new UI, and the legacy code removed. Upgrading from V2 is automatic for the database — read the [migration guide](docs/MIGRATION.md) first.

### Added
- **Booking approval workflow** — requests start *Pending* and are approved or declined (reason required) by Facilities Head, Supervisor or Admin; requesters can cancel; only approved bookings hold a room; approvers see clash and competing-request warnings; approvers' own bookings auto-approve; notifications, audit and live updates for every decision.
- **Recurring bookings** — daily, weekday, weekly and fortnightly series (2–26 sessions, ≤ 1 year) generated in the user's timezone, with per-session availability preview, atomic creation, skip-booked-dates, one-card-per-series approvals (approve free sessions / decline all) and cancel-one-or-all.
- **Incident comments** with staff-only **internal notes** (never exposed to students in lists, counts, notifications or live events), edit/delete with moderation, notifications to the other party, counts on the list and board.
- **Offline AI** — live triage suggestions (Naive Bayes + severity signals), TF-IDF duplicate warnings, explainable SLA-risk scores, shared-cause clusters, a daily brief and natural-language search. No network or API key required.
- **Users & roles page** (Admin / Facilities Head) with guards, **admin password reset**, and **change password** for everyone.
- **Google sign-in** (optional) with server-side ID-token verification and a domain allow-list.
- **Incident action panel** — staff picker for assign/reassign, reasons for reject/send-back, hand-off to another department, and only legal next steps shown.
- **Kanban board** with drag-and-drop through the real command pipeline, **command palette** (`Ctrl/⌘+K`) with smart search, **analytics charts**, **photo evidence** on incidents.
- **Versioned database migrations** (001–008) and indexes.
- **Docker** image and `docker-compose.yml`, **GitHub Actions CI**, Dependabot, issue and PR templates.
- **Automated tests** — 65 `node:test` tests plus an updated smoke test.
- Comprehensive documentation: architecture with diagrams, API, database, AI, features, development, deployment and the V1 → V2 → V3 migration guide.

### Changed
- **UI redesigned** as a single token-based design system: light/dark by value swap, ≥ 12 px text, WCAG AA contrast, responsive. Fonts are bundled (no CDN).
- **Frontend restructured** from one monolithic file into pages, components and helpers; dependencies pinned.
- **Sessions** are persisted (hashed) in SQLite and revoked on logout or password change; **rate limiting** on sign-in and password change.
- **Notifications** are addressed to a user, a department or all management; reporters are told when their incident moves.
- **Real-time events are room-scoped** instead of broadcast to every client.
- **CORS** restricted to a configurable allow-list; security headers added.
- **Demo mode** and the shared demo password are disabled in production, which also no longer seeds demo data (opt in with `CAMPUSCONNECT_SEED_DEMO=1`).
- Booking validation: room must exist, attendees ≤ capacity, start not in the past; booking times normalised to UTC.

### Fixed
- **Data integrity:** ID counters reset on every restart, so a new incident could silently overwrite an existing one. IDs now continue from the database and collisions are refused. *(Databases from long-running V2 installs should be checked — see the migration guide.)*
- Users created via Google sign-in could have received the shared demo password at the next restart.
- Incident **Reject** was unreachable from a new incident; **Reassign** was declared but not wired; **Reopen** appeared on the wrong states; **Hand off** crashed.
- Department and management notifications were written but never shown to anyone.
- Every real-time event (including full incident details and all notifications) was delivered to all connected users.
- Booking overlap checks compared naive local timestamps with UTC strings.
- The smoke test hard-coded a past date and the pre-approval booking behaviour.

### Removed
- **Legacy API** (`/api/tickets`, `/api/bookings`, `/api/campus`, `/api/ai`), `server.legacy.js`, the vanilla `public/` UI, `src/routes/` and the legacy services, and `npm run legacy`.

### Security
- Hashed session tokens, rate limiting, scoped realtime/notifications/comments, upload validation by magic bytes, production hardening of demo mode, audited administrative actions. See [`SECURITY.md`](SECURITY.md).

## [2.3.0] — 2026-09-08

Initial tagged V2 release (private repository `CampusConnect`). **V2** turned the V1 prototype into a modular monolith:

- **Persistence** — SQLite via `node:sqlite`, repositories, reference-data seeding, persisted notifications, AI analyses and pattern traces.
- **Authentication & RBAC** — scrypt-hashed passwords, bearer-token sessions (8 h, in memory), server-enforced command permissions and department scoping; **audit log** of mutations.
- **Domain modules** for incidents, resources/bookings, dashboard, notifications and AI over an **EventBus**; **persistent command history** with restart-safe undo.
- **Real-time** — EventBus bridged to authenticated Socket.IO.
- **React + TypeScript + Vite** console and **Architecture Observatory** (live pattern traces).
- **AI** — duplicate detection and recommendations with optional Claude and a heuristic fallback.
- Legacy `/api/*` routes and `server.legacy.js` kept for compatibility and rollback.

Details: [`docs/history/V2_MIGRATION_PLAN.md`](docs/history/V2_MIGRATION_PLAN.md).

## [1.0.0] — original prototype

Not formally released or tagged. A teaching prototype of the 23 GoF patterns in a campus domain: Express server, **in-memory** state, a vanilla-JS UI with a role *dropdown* (no authentication), and Claude/heuristic triage. See the [migration guide](docs/MIGRATION.md#v1--the-original-prototype).

[Unreleased]: https://github.com/anshultripathi-dev/CampusConnectV3/compare/v3.0.0...HEAD
[3.0.0]: https://github.com/anshultripathi-dev/CampusConnectV3/releases/tag/v3.0.0
