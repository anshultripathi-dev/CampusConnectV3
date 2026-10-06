# Deployment

CampusConnect is a **single Node.js process** with an embedded SQLite database. It is meant for one campus, one instance.

- [Docker quick start](#docker-quick-start)
- [Running without Docker](#running-without-docker)
- [Configuration](#configuration)
- [First sign-in in production](#first-sign-in-in-production)
- [Reverse proxy and HTTPS](#reverse-proxy-and-https)
- [Production checklist](#production-checklist)
- [Backups](#backups)
- [Upgrading](#upgrading)
- [Operations](#operations)
- [Limits of the design](#limits-of-the-design)

## Docker quick start

```bash
cp .env.example .env            # edit as needed
docker compose up -d --build
open http://localhost:3000
```

`docker-compose.yml` builds the image (multi-stage: builds the React app, then a slim Node runtime), publishes port 3000, stores the database and uploads in the named volume `campusconnect-data` (mounted at `/data`; the image sets `CAMPUSCONNECT_DB=/data/campusconnect.db` and `CAMPUSCONNECT_UPLOADS=/data/uploads`) and runs as the unprivileged `node` user and defines a health check against `/api/health`.

```bash
docker compose logs -f          # follow logs
docker compose down             # stop (data is kept in the volume)
docker compose down -v          # stop AND delete the data volume
```

Plain Docker:

```bash
docker build -t campusconnect .
docker run -d --name campusconnect -p 3000:3000 \
  -e NODE_ENV=production -e CAMPUSCONNECT_DEMO_PASSWORD='choose-a-strong-one' \
  -v campusconnect-data:/data campusconnect
```

## Running without Docker

```bash
npm ci && npm run web:install && npm run build
NODE_ENV=production PORT=3000 npm start
```

Use a process manager (systemd, pm2) to keep it running. Example systemd unit:

```ini
[Service]
WorkingDirectory=/opt/campusconnect
Environment=NODE_ENV=production
EnvironmentFile=/opt/campusconnect/.env
ExecStart=/usr/bin/node server.js
Restart=on-failure
User=campusconnect
```

## Configuration

Set through environment variables (or `.env`, loaded by `dotenv`). See [`../.env.example`](../.env.example).

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `NODE_ENV` | — | `production` hides demo mode, randomises the seeded password, skips demo data |
| `CAMPUSCONNECT_DB` | `data/campusconnect.db` | SQLite file |
| `CAMPUSCONNECT_UPLOADS` | `data/uploads` | Photo directory |
| `CAMPUSCONNECT_DEMO_PASSWORD` | `campus123` (random in production) | Password given to seeded accounts that have none |
| `CAMPUSCONNECT_DEMO` | on outside production | `1`/`0` forces demo mode (one-click demo logins) |
| `CAMPUSCONNECT_SEED_DEMO` | off in production | `1` seeds demo incidents/bookings/comments even in production |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:3000` | Allowed browser origins (same-origin always works) |
| `TRUST_PROXY` | off | `1` behind a reverse proxy, so rate limiting sees real client IPs |
| `GOOGLE_CLIENT_ID` | — | Enables Google sign-in |
| `GOOGLE_ALLOWED_DOMAINS` | — | Comma-separated email domains allowed for Google sign-in |
| `ANTHROPIC_API_KEY` | — | Optional Claude analysis in the incident drawer |

## First sign-in in production

With `NODE_ENV=production` there is no demo mode and no known password. On the **first start of a new database**:

1. Set `CAMPUSCONNECT_DEMO_PASSWORD` to a strong secret **before** the first start. Seeded accounts without a password receive it as their initial password. (If you forget, the accounts are created with a random password that nobody knows: stop the server, delete the database, set the variable and start again.)
2. Sign in as **`u-103`** (Facilities Head) with that password.
3. Open **My account → Change password** immediately.
4. Open **Users & roles** to review the seeded staff accounts, change roles/departments and **reset passwords** (a one-time temporary password is shown to you to hand over).
5. Optionally enable **Google sign-in** with `GOOGLE_ALLOWED_DOMAINS` so people can sign in with campus accounts; new people become **Students** and you promote them in *Users & roles*.

> Current limitation: accounts cannot be created manually — people appear through Google sign-in or the seeded set. A "create user" form is on the [roadmap](../README.md#roadmap).

## Reverse proxy and HTTPS

Terminate TLS at a proxy and forward **WebSocket upgrades**. Set `TRUST_PROXY=1` and `CORS_ORIGINS` to your public origin.

**Caddy**

```caddy
campus.example.edu {
    reverse_proxy localhost:3000
}
```

**nginx**

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;       # Socket.IO
    proxy_set_header Connection "upgrade";
    client_max_body_size 4m;                      # photo uploads
}
```

For Google sign-in, add the public HTTPS origin to the OAuth client's *Authorized JavaScript origins*.

## Production checklist

- [ ] `NODE_ENV=production`
- [ ] Strong `CAMPUSCONNECT_DEMO_PASSWORD` set before first start, then every seeded password changed or reset
- [ ] HTTPS in front, `TRUST_PROXY=1`, `CORS_ORIGINS` set to the public origin
- [ ] `GOOGLE_ALLOWED_DOMAINS` set if using Google sign-in
- [ ] `data/` on persistent storage; **backups scheduled and restore tested**
- [ ] Health check wired to `GET /api/health`
- [ ] Logs collected (stdout)
- [ ] OS/user permissions: run as an unprivileged user; `data/` writable only by it
- [ ] Reviewed [`../SECURITY.md`](../SECURITY.md)

## Backups

Back up the database and the photos:

```bash
node -e "const {DatabaseSync}=require('node:sqlite');new DatabaseSync('data/campusconnect.db').exec(\"VACUUM INTO 'backup-$(date +%F).db'\")"
tar czf uploads-$(date +%F).tgz data/uploads
```

In Docker the files are in the volume at `/data`: for example `docker compose exec campusconnect node -e "const {DatabaseSync}=require('node:sqlite');new DatabaseSync('/data/campusconnect.db').exec(\"VACUUM INTO '/data/backup.db'\")"` and then `docker cp campusconnect:/data/backup.db .`. Details and restore steps: [`DATABASE.md`](DATABASE.md#backup-and-restore).

## Upgrading

1. Read the [`CHANGELOG`](../CHANGELOG.md) and, for a major version, [`MIGRATION.md`](MIGRATION.md).
2. **Back up** the database and uploads.
3. Pull the new version and rebuild (`docker compose up -d --build`, or `npm ci && npm run build` and restart).
4. Start it: migrations apply automatically; a failure rolls back and stops the server with the migration id.
5. Verify `GET /api/health` and sign in.

## Operations

- **Health** — `GET /api/health` → `{"status":"ok","version":…}`.
- **Logs** — plain text on stdout: start-up banner, database path, seed messages, migration errors.
- **Sessions** — stored in the database (hashed), valid for 8 hours from sign-in; expired ones are purged hourly.
- **Photos** — files in `data/uploads/<incident-id>/` with random names.
- **Audit** — `audit_logs` records role changes, password resets/changes, booking decisions, comment deletions and more.

## Limits of the design

- **One instance.** The EventBus, Socket.IO rooms and rate limiter are in-process, and SQLite allows one writer. Do not run multiple replicas behind a load balancer.
- **Campus scale.** Designed for a single campus; it has **not been load-tested**. If you outgrow one process or SQLite, plan a PostgreSQL port ([`DATABASE.md`](DATABASE.md#moving-to-postgresql)).
- **No email/SMS delivery.** Notifications are in-app only.
