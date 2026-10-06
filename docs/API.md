# REST API reference

Base URL: `http://localhost:3000`. Everything lives under **`/api/v2`**, except the unauthenticated health check `GET /api/health`. Unknown `/api/*` paths return `404 {"error":"Not found"}`.

- [Conventions](#conventions)
- [Authentication](#authentication)
- [Dashboard & analytics](#dashboard--analytics)
- [Incidents](#incidents)
- [Comments](#comments)
- [Photo attachments](#photo-attachments)
- [Smart (AI) endpoints](#smart-ai-endpoints)
- [Resources & bookings](#resources--bookings)
- [Notifications, audit, staff](#notifications-audit-staff)
- [Users & accounts](#users--accounts)
- [Architecture Observatory](#architecture-observatory)
- [Real-time events](#real-time-events)
- [Errors](#errors)

## Conventions

- **JSON** request and response bodies. Max request body: 4 MB.
- **Auth**: every route except those under *Authentication → public* needs `Authorization: Bearer <token>`.
- **Roles** — *Student*; *Staff* = Maintenance, Security, IT; *Management* = Supervisor, FacilitiesHead, SecurityHead, Admin; *Approver* = FacilitiesHead, Admin, Supervisor; *Admin-level* = Admin, FacilitiesHead.
- **Scoping** — students see only their own incidents/bookings; staff see their department's incidents; management sees everything.
- **Timestamps** are ISO-8601 UTC (`2026-10-14T10:00:00.000Z`). Booking times are normalised to UTC on the server.
- **IDs** — `TCK-0001` (incident), `BKG-0001` (booking), `SER-1a2b3c4d` (booking series).

## Authentication

| Method & path | Access | Description |
|---|---|---|
| `GET /api/health` | public | `{status, app, version, architecture, database, realTime}` |
| `GET /api/v2/auth/config` | public | `{googleClientId \| null, demoMode}` — what the login page should offer |
| `POST /api/v2/auth/login` | public, rate-limited | `{login, password}` → `{token, user, expiresAt}`. `login` is an email or user id |
| `POST /api/v2/auth/google` | public, rate-limited | `{credential}` (Google ID token) → `{token, user}`. 503 if Google sign-in is not configured |
| `GET /api/v2/auth/demo-users` | public, **demo mode only** (404 otherwise) | Demo password and account ids |
| `GET /api/v2/auth/me` | any | `{user}` |
| `POST /api/v2/auth/logout` | any | Revokes the current token |

```bash
curl -s -X POST localhost:3000/api/v2/auth/login \
  -H 'content-type: application/json' \
  -d '{"login":"u-103","password":"campus123"}'
# → {"token":"…","user":{"id":"u-103","name":"Dr. Anand Rao","role":"FacilitiesHead",…}}
```

## Dashboard & analytics

| Method & path | Access | Description |
|---|---|---|
| `GET /dashboard/overview` | any | KPIs: open, SLA at risk, breached, escalated, resolved today, room utilisation, campus health, and `pendingBookings` (approvers only) |
| `GET /dashboard/activity` | any | Recent activity |
| `GET /dashboard/departments` | any | Open incidents per department |
| `GET /dashboard/trends?days=14` | staff | Per-day created/resolved, breakdowns by status/type/severity, average resolution hours (2–60 days) |
| `GET /analytics/report/:type` | any | Visitor-pattern reports, e.g. `maintenance-cost`, `safety-incidents`, `room-utilization` |

## Incidents

| Method & path | Access | Description |
|---|---|---|
| `POST /incidents` | any | Create. `{title, description, category, subCategory, severity, location, reporterContact?, itemDescription?, flags?}`. Returns `{success, ticket, traceId}` |
| `GET /incidents` | any (scoped) | List. Each item includes `commentCount` (internal notes counted for staff only) |
| `GET /incidents/rank?strategy=sla` | any | Ranked queue (`sla`, `severity`, `fifo`) |
| `GET /incidents/:id` | access | One incident (sensitive Safety incidents are redacted by role via the Proxy pattern) |
| `GET /incidents/:id/history` | access | Timeline events |
| `GET /incidents/:id/commands` | access | Command history |
| `POST /incidents/:id/command/:action` | role-checked | Run a workflow command (below) |
| `POST /incidents/:id/undo` | role-checked | Undo the latest command (refused if the incident changed since) |
| `POST /incidents/:id/escalate` | management | Evaluate/escalate through the chain of responsibility |
| `POST /incidents/:id/handoff` | management or owning department | `{toDept, reason}` — `toDept` ∈ Maintenance, Security, IT, Facilities |
| `POST /incidents/:id/restore` | management | Restore the latest snapshot |
| `POST /incidents/:id/resolve-checklist` | access | Category-specific resolution steps |

**Commands** (`:action`) and who may run them:

| Action | Body | Allowed roles |
|---|---|---|
| `assign` | `{staffId}` (reassign allowed) | Staff, Management |
| `start`, `markDone` (`{note}`) | | Staff, Management |
| `approve` (`{resolutionNote}`), `sendBack` (`{reason}`), `resolve`, `reopen` | | Supervisor and above |
| `reject` (`{reason}`), `close` | | FacilitiesHead, SecurityHead, Admin |

Illegal transitions return `409` (see the [lifecycle](ARCHITECTURE.md#incident-lifecycle)). Reporters are notified when their incident moves.

## Comments

| Method & path | Access | Description |
|---|---|---|
| `GET /incidents/:id/comments` | access | Chronological. **Internal notes are returned to staff only** |
| `POST /incidents/:id/comments` | access | `{body, internal?}` — 1–1000 chars; `internal` is staff-only (403 for students); 409 on closed incidents; 429 over 10/min |
| `POST /incidents/:id/comments/:cid` | author | `{body}` — edit |
| `DELETE /incidents/:id/comments/:cid` | author or management | Soft delete, audited |

## Photo attachments

| Method & path | Access | Description |
|---|---|---|
| `GET /incidents/:id/attachments` | access | Metadata list |
| `POST /incidents/:id/attachments` | access | `{filename, mime, data}` — `data` is base64; JPEG/PNG/WebP only, ≤ 2 MB, ≤ 5 per incident; content is verified against the declared type |
| `GET /incidents/:id/attachments/:aid` | access | The image (`Content-Type` set, private cache) |
| `DELETE /incidents/:id/attachments/:aid` | uploader or management | |

## Smart (AI) endpoints

All run **offline** on the server. See [`AI.md`](AI.md).

| Method & path | Access | Description |
|---|---|---|
| `POST /ai/triage` | any | `{title, description}` → `{suggestion:{category,subCategory,severity,department}, confidence, confident, alternatives, signals}` or `{suggestion:null}` |
| `POST /ai/similar` | any | `{title, description, location}` → similar open incidents. **Students only learn that matches exist** (no foreign ids/titles) |
| `GET /ai/risk` | any (scoped) | `{<incidentId>: {score, level, hoursLeft, reasons}}` |
| `GET /ai/insights` | staff | `{brief, clusters, topRisks}` |
| `POST /ai/search` | any (scoped) | `{q}` — natural-language query → `{description, filters, results, total}` |
| `GET/POST /incidents/:id/ai`, `GET /incidents/:id/ai/duplicates`, `GET /incidents/:id/ai/recommendations` | access | Per-incident analysis, duplicates, recommendations (Claude used only if `ANTHROPIC_API_KEY` is set) |

## Resources & bookings

| Method & path | Access | Description |
|---|---|---|
| `GET /resources/campus` · `/rooms` · `/equipment` · `/equipment-stats` | any | Campus tree, rooms, equipment |
| `GET /bookings` | any (scoped) | Own bookings; management sees all. Approvers also get `approvedClashes` and `competingRequests` on pending items. Series sessions carry `seriesId/Index/Total/Pattern` |
| `GET /bookings/conflicts?room=&start=&end=` | any | **Approved** bookings overlapping the slot |
| `POST /bookings/preview` | any | `{room, occurrences:[{startTime,endTime}]}` → `[{index,startTime,endTime,available,clashesWith}]` |
| `POST /bookings` | any | Single booking `{room,startTime,endTime,attendees,purpose,equipment}` **or** a series `{…, occurrences[], pattern, skipConflicts?}` |
| `POST /bookings/:id/approve` | approver | Add `{scope:"series"}` to decide every pending session |
| `POST /bookings/:id/reject` | approver | `{note}` **required** |
| `POST /bookings/:id/cancel` | requester or approver | Add `{scope:"series"}` to cancel all upcoming sessions |

**Rules** — only `APPROVED` bookings block a room; approving re-checks clashes (409 with `conflicts[]`); approvers' own bookings are auto-approved; room must exist, attendees ≤ capacity, start not in the past.

**Series** — `pattern` ∈ `daily`, `weekdays`, `weekly`, `biweekly`; 2–26 sessions, at most one year; sessions must not overlap each other. If any date clashes with an approved booking the request is refused with `409 {conflictDates:[…]}` unless `skipConflicts:true`, which books the free dates. Creation is atomic. Series approve = free sessions approved, clashing ones declined with the clash named. Response: `{seriesId, status, created, skipped, bookings}`.

```bash
curl -s -X POST localhost:3000/api/v2/bookings -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{
    "room":"MB-201","pattern":"weekly","attendees":18,"purpose":"Robotics club","equipment":["eq-projector"],
    "occurrences":[{"startTime":"2026-10-14T10:00:00Z","endTime":"2026-10-14T12:00:00Z"},
                   {"startTime":"2026-10-21T10:00:00Z","endTime":"2026-10-21T12:00:00Z"}]}'
```

## Notifications, audit, staff

| Method & path | Access | Description |
|---|---|---|
| `GET /notifications` | any | Items addressed to you, your department, or (management) `operations` |
| `POST /notifications/:id/read` · `/notifications/read-all` | any | |
| `GET /audit?limit=100` | management | Audit trail |
| `GET /staff` | any | Non-student users (id, name, role, department) for assignment pickers |

## Users & accounts

| Method & path | Access | Description |
|---|---|---|
| `GET /users` | Admin-level | `{users, roles, departments}` |
| `POST /users/:id/role` | Admin-level | `{role, departmentId}` — staff roles need a department; you cannot change your own role or remove the last Admin/FacilitiesHead |
| `POST /users/:id/reset-password` | Admin-level | → `{temporaryPassword}` (shown once); signs the user out everywhere |
| `POST /account/password` | any, rate-limited | `{currentPassword, newPassword}` (≥ 8 chars); signs out other sessions. 400 for Google-only accounts |

## Architecture Observatory

`GET /architecture/patterns` (the catalogue, 23 patterns), `/architecture/traces`, `/architecture/traces/:id`, `/architecture/health`.

## Real-time events

Connect with Socket.IO and the same token:

```js
import { io } from 'socket.io-client';
const socket = io({ auth: { token } });
socket.on('incident.updated', ({ incident, action }) => { /* … */ });
```

Events: `incident.created`, `incident.updated`, `incident.comment`, `booking.created`, `booking.updated`, `notification.created`, `audit.created`, `system.connected`. Delivery is scoped — see [Architecture](ARCHITECTURE.md#event-driven-flow-and-real-time-delivery).

## Errors

```json
{ "error": "Human-readable message", "conflicts": [ … ], "conflictDates": [ … ] }
```

| Status | Meaning |
|---|---|
| 400 | Validation failed (message says what) |
| 401 | Missing/invalid/expired token, or bad credentials |
| 403 | Authenticated but not allowed |
| 404 | Not found, or an `/api/*` path that does not exist |
| 409 | Conflict with current state (illegal transition, double-booking, already decided) |
| 413 / 415 | Upload too large / wrong type |
| 429 | Rate limited (`Retry-After` is set for sign-in) |
| 503 | Feature not configured (Google sign-in) |
