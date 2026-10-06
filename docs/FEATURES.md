# Features and permissions

- [Roles](#roles)
- [Permission matrix](#permission-matrix)
- [Incidents](#incidents)
- [Comments](#comments)
- [Room bookings](#room-bookings)
- [Smart assistance](#smart-assistance)
- [Console experience](#console-experience)
- [Administration](#administration)
- [Demo accounts](#demo-accounts)

## Roles

| Role | Purpose | Sees |
|---|---|---|
| **Student** | Reports issues, books spaces | Own incidents and bookings |
| **Maintenance / Security / IT** | Field staff | Their department's incidents; own bookings |
| **Supervisor** | Approves work and bookings | Everything |
| **Facilities Head** | Full management, bookings and user administration | Everything |
| **Security Head** | Management for safety incidents | Everything |
| **Admin** | Full management, bookings and user administration | Everything |

## Permission matrix

| Capability | Student | Staff | Supervisor | Security Head | Facilities Head / Admin |
|---|:-:|:-:|:-:|:-:|:-:|
| Report an incident, add photos, comment | ✔ | ✔ | ✔ | ✔ | ✔ |
| See incidents | own | department | all | all | all |
| Internal notes (write/read) | – | ✔ | ✔ | ✔ | ✔ |
| Assign / start / mark done | – | ✔ | ✔ | ✔ | ✔ |
| Approve / send back / resolve / reopen | – | – | ✔ | ✔ | ✔ |
| Reject / close | – | – | – | ✔ | ✔ |
| Escalate, restore, hand off anywhere | – | hand off own dept | ✔ | ✔ | ✔ |
| Delete others' comments | – | – | ✔ | ✔ | ✔ |
| Request a booking | ✔ | ✔ | ✔ (auto-approved) | ✔ | ✔ (auto-approved) |
| **Approve / decline bookings** | – | – | ✔ | – | ✔ |
| See all bookings | – | – | ✔ | ✔ | ✔ |
| Analytics & smart insights | – | ✔ | ✔ | ✔ | ✔ |
| Audit log | – | – | ✔ | ✔ | ✔ |
| **Users & roles, password reset** | – | – | – | – | ✔ |

The server enforces every row; the UI merely hides what would be refused.

## Incidents

**Reporting** — a guided form with live **triage** (suggested category, type, severity and department with the words that drove it), a **duplicate warning**, up to 3 **photos** (resized in the browser), and urgent flagging for Critical reports.

**Working an incident** — the drawer shows only the legal next steps for the current state and your role:

| State | Actions offered |
|---|---|
| New / In review / Reopened | **Assign** (staff picker, same department first), **Reject** (reason) |
| Assigned | **Start work**, **Reassign** |
| In progress | **Mark done** (work summary), **Resolve** |
| Pending approval | **Approve**, **Send back** (reason) |
| Resolved | **Close**, **Reopen** |
| Rejected | **Reopen** |
| any open state | **Escalate** (management), **Hand off** (department + reason), **Undo last** |

Each incident has a timeline, SLA with a live risk chip, photos, comments, AI tab and command history. **Reporters are notified** when their incident moves.

Views: a sortable **list** and a **Kanban board** with drag-and-drop between columns (or a *Move…* menu for touch/keyboard). Moves run through the same state machine and role checks.

## Comments

- A **Comments** tab for the reporter, the team handling the incident and management.
- **Internal notes** are staff-only: students never receive them in lists, counts, notifications or live events, and cannot post them.
- Authors can edit; authors and management can delete (audited). Closed incidents are read-only; 1,000 characters; 10 comments/minute.
- New comments notify the other side (reporter ⇄ assignee/department), never the author.

## Room bookings

**Requesting** — pick a room, time, attendees, purpose and equipment. The form checks availability live. Rooms must exist and fit the attendees.

**Approval** — requests start **Pending** and are reviewed by **Facilities Head, Supervisor or Admin**:

- *Approve* confirms the booking (re-checking for a clash).
- *Decline* requires a reason, which the requester sees.
- Requesters can *cancel* their own bookings; approvers can cancel any.
- **Only approved bookings hold a room.** Pending requests never block anyone. Approvers see which requests clash with an approved booking or compete with each other.
- Approvers' own bookings are approved automatically.
- Everyone involved is notified; decisions are audited and update screens live.

**Recurring bookings** — repeat **daily, every weekday, weekly or every 2 weeks**, 2–26 sessions, at most a year:

- Dates are generated in your timezone (10:00 stays 10:00 across daylight-saving changes).
- The form previews each session (free / already booked); booked dates are skipped. Creation is all-or-nothing.
- Approvers see **one card per series** with a per-session list. *Approve* confirms the free sessions and declines (naming the clash) any taken meanwhile; *Decline all* needs a reason.
- Requesters cancel **one session or all upcoming**. A series sends one summary notification.

## Smart assistance

Offline, on-server; details in [`AI.md`](AI.md): live triage, duplicate detection, SLA-risk scores with reasons, shared-cause clusters, a daily brief, and natural-language search ("open electrical issues in lab 204 this week").

## Console experience

- **Command palette** (`Ctrl/⌘ + K`): jump to pages, run actions, find incidents, ask questions.
- **Analytics**: incident flow, status/type/severity breakdowns, average resolution time (dependency-free SVG).
- **Notifications**: bell with live updates; clicking opens the incident or the Bookings page.
- **Light and dark themes**, responsive layout (icon rail on small screens), keyboard-friendly, reduced-motion aware.
- **Architecture Observatory**: browse the 23 patterns and inspect live execution traces.

## Administration

- **Users & roles** (Admin / Facilities Head): change role and department, reset a password (one-time temporary password). Guards: no self-demotion, never remove the last Admin/Facilities Head, staff need a department. All audited.
- **Change password** for everyone (profile chip → My account); other sessions are signed out.
- **Google sign-in** (optional): known emails keep their role; new accounts are Students; restrict by domain.
- **Audit log** of every meaningful change.

## Demo accounts

In demo mode (the default outside production) the login page offers one-click workspaces, or sign in with the password `campus123`:

| Login | Role |
|---|---|
| `student@campusconnect.local` | Student |
| `u-101` | Maintenance |
| `u-301` | IT |
| `u-201` | Security |
| `u-102` | Supervisor |
| `u-103` | Facilities Head |
| `u-202` | Security Head |

Demo mode and the shared password are disabled when `NODE_ENV=production` — see [`DEPLOYMENT.md`](DEPLOYMENT.md#first-sign-in-in-production).
