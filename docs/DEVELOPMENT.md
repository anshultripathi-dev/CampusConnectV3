# Development guide

- [Prerequisites](#prerequisites)
- [Getting started](#getting-started)
- [Everyday commands](#everyday-commands)
- [Project conventions](#project-conventions)
- [Testing](#testing)
- [Common tasks](#common-tasks)
- [Debugging and troubleshooting](#debugging-and-troubleshooting)
- [Git workflow](#git-workflow)

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| **Node.js** | **≥ 22.5** (see `.nvmrc`) | Uses the built-in `node:sqlite` module |
| npm | ≥ 10 | Installs both workspaces |
| Docker (optional) | any recent | To run the container image |
| Google OAuth client (optional) | — | Only to try Google sign-in |

No database server is needed.

## Getting started

```bash
git clone https://github.com/anshultripathi-dev/CampusConnectV3.git
cd CampusConnectV3
npm install                 # backend dependencies
npm run web:install         # frontend dependencies
npm run build               # builds the React app into frontend/dist
cp .env.example .env        # optional: Google sign-in, Claude key, CORS…
npm start                   # http://localhost:3000
```

The database is created and seeded on first start. Sign in with a one-click demo workspace on the login page (or `u-103` / `campus123`).

### Live-reload development

Run two processes:

```bash
npm run dev          # backend on :3000 (restarts on change)
npm run web:dev      # Vite dev server on :5173, proxying /api to :3000
```

Open <http://localhost:5173>. For Google sign-in, add both origins to the OAuth client's *Authorized JavaScript origins*.

## Everyday commands

| Command | What it does |
|---|---|
| `npm start` | Start the server (serves `frontend/dist`) |
| `npm run dev` | Start the server with `--watch` |
| `npm run web:dev` | Vite dev server with hot reload |
| `npm run build` | Type-check and build the frontend |
| `npm test` | Run all `node:test` suites |
| `npm run smoke` | End-to-end smoke test on a temporary database |
| `npm run check` | `test` + `smoke` + `build` — what CI runs |
| `npm run web:format` | Format the frontend with Prettier |

## Project conventions

- **Backend** is CommonJS. New code should be readable and formatted normally; some older modules keep the original compact style — don't reformat them in unrelated changes.
- **Where logic goes** — routes stay thin (HTTP, role check, validation); business rules live in a domain module under `src/v2/`; SQL stays in repositories or the small module that owns the table.
- **Authorisation is server-side.** The UI hides what would be refused, but every route must check. If you add a visibility rule, apply it to REST, notifications **and** realtime rooms.
- **Frontend** is TypeScript with Prettier (`.prettierrc`). Components live in `components/` or `pages/`. **Colours come only from CSS variables** in `styles.css`; never hard-code a hex in a component. Keep text ≥ 12 px and AA contrast (check both themes).
- **Offline by default.** Don't add a runtime dependency on a CDN or external API.
- **IDs and migrations** — see [`DATABASE.md`](DATABASE.md): never bypass `syncSequences()`, never edit a shipped migration.
- **Comments** explain *why*, not *what*.

## Testing

```bash
npm test                    # everything
node --test tests/ai.test.js   # one file
```

| Suite | Covers |
|---|---|
| `tests/auth.test.js` | Login, hashed sessions, expiry, `requireAuth`, rate limiter |
| `tests/ai.test.js` | Tokenizer, triage, TF-IDF, risk, clusters, brief, query parser |
| `tests/api.test.js` | HTTP: scoping, student redaction, uploads, migrations, ID safety |
| `tests/workflow.test.js` | Booking approvals, notifications, user/role/password admin, incident workflow fixes |
| `tests/series_comments.test.js` | Recurring bookings (atomicity, partial approval, scoped cancel) and comments (internal-note privacy, moderation, limits) |
| `tests/seed.test.js` | Production starts without demo data |
| `scripts/smoke-v2.js` | Facade → Interpreter → Repository → Memento → Observer path, persistent undo, booking Builder + approval |

**How the HTTP tests work** — each file points `CAMPUSCONNECT_DB` and `CAMPUSCONNECT_UPLOADS` at a fresh temporary directory *before* requiring any app code, seeds demo data, mounts the real routers on an ephemeral Express port and drives them with `fetch`. They never touch `data/campusconnect.db`. Tests run in separate processes, so they cannot interfere.

**Writing a test** — copy the `call()` helper from an existing suite; log in with `auth.login(id, auth.DEMO_PASSWORD)`; assert on status codes *and* side effects (rows, notifications, audit entries). When a rule is about **who must not see something**, test the negative case explicitly. Beware per-user rate limits (comments: 10/min) when one test hammers an endpoint.

The frontend has no component tests yet; UI behaviour is verified manually and with scripted browser checks (see CHANGELOG notes). Contributions adding Vitest + Testing Library are welcome.

## Common tasks

### Add an endpoint
1. Domain logic in the right module (or a new one in `src/v2/`).
2. Route in `src/v2/routes.js` using `asyncRoute(...)`; throw errors with a `.status` so the message reaches the client.
3. Apply role/scope checks; decide what happens in notifications/realtime.
4. Document it in [`API.md`](API.md); add tests.

### Add a database column or table
Write a migration — see [`DATABASE.md`](DATABASE.md#writing-a-migration).

### Add a notification or realtime event
Publish on the EventBus from the service, then register a scoped forwarder in `src/v2/infrastructure/realtime.js` choosing **rooms**, not `io.emit`. Add a test that an unauthorised role does not receive it.

### Teach the triage model
Add examples to `src/v2/ai/trainingData.json` — see [`AI.md`](AI.md#triage).

### Add a page
Create `frontend/src/pages/Foo.tsx`, register it in the `nav` array and page switch in `Console.tsx`, gate it by role, and style with existing classes/tokens.

### Reset local data
Stop the server and delete `data/campusconnect.db` (and `data/uploads/`). It reseeds on next start.

## Debugging and troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `Frontend not built. Run: npm run build` | `frontend/dist` is missing — run the build |
| Blank page after pulling changes | Rebuild the frontend and hard-refresh |
| `Migration … failed` on start | The database rolled back untouched; fix or restore a backup, then restart |
| Port 3000 busy | `PORT=3001 npm start` |
| Google button missing | `GOOGLE_CLIENT_ID` not set, or offline (a notice is shown instead) |
| Google: `origin_mismatch` | Add the exact URL to *Authorized JavaScript origins* |
| 429 on sign-in | Rate limiter (10 / 15 min / IP); wait, or set `TRUST_PROXY=1` behind a proxy |
| New incident seems to replace an old one | Should be impossible in V3 (ID sequencing + collision guard). If you see it, you are on pre-V3 code |
| `ExperimentalWarning: SQLite` | Harmless; `node:sqlite` is still flagged experimental in some Node versions |

## Git workflow

- Branch from `main`: `feat/…`, `fix/…`, `docs/…`.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`).
- Open a pull request; CI (`.github/workflows/ci.yml`) must pass. See [`../CONTRIBUTING.md`](../CONTRIBUTING.md).
