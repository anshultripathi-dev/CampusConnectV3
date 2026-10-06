# Security policy

## Supported versions

| Version | Supported |
|---|---|
| 3.x | ✅ |
| 2.x | ❌ — please upgrade ([migration guide](docs/MIGRATION.md)) |
| 1.x | ❌ |

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Use GitHub's private reporting: **Security → Report a vulnerability** on this repository. If that is unavailable, email **anshul.tripathi.dev@gmail.com** with the subject `CampusConnect security`.

Include what you found, how to reproduce it, the affected version, and the impact you see. You can expect an acknowledgement within a few days and a fix or mitigation plan after triage. Please allow a reasonable time to fix before disclosing publicly.

## Security model in brief

Full detail: [Architecture → Security architecture](docs/ARCHITECTURE.md#security-architecture).

- **Authentication** — `scrypt`-hashed passwords; random 256-bit session tokens, stored only as SHA-256 hashes, expiring after 8 hours and revoked on sign-out or password change; rate-limited sign-in; optional Google sign-in with server-side ID-token verification.
- **Authorisation** — enforced on the server for every route (role, department and ownership scoping). Real-time events, notifications and comments follow the same visibility rules; staff-only internal notes are never sent to students.
- **Uploads** — type and magic-byte validation, size and count limits, server-chosen file names, authorised access only.
- **Hardening** — security headers, CORS allow-list, no `x-powered-by`; demo mode and the shared demo password are disabled in production.
- **Audit** — role changes, password resets/changes, booking decisions and deletions are recorded.

## Known limitations

These are deliberate scope limits, not oversights; consider them before exposing an instance publicly:

- **Bearer token in `localStorage`.** A cross-site-scripting bug would expose it. The app renders user content through React (escaped by default) and the only inline script sets the theme class, but moving to an `httpOnly` cookie is on the roadmap.
- **Single instance, in-process rate limiting and EventBus** — not suitable for horizontal scaling.
- **No account lockout**, only per-IP rate limiting.
- **No email verification flow** and no manual account creation; accounts come from the seeded set or Google sign-in.
- **No CSRF tokens** — not needed for bearer-token auth, but would be required if cookies are adopted.
- **Offline AI is not a security control** and should not be relied on for safety-critical triage.

## Deployment guidance

See the [production checklist](docs/DEPLOYMENT.md#production-checklist): HTTPS, `NODE_ENV=production`, a strong bootstrap password, `CORS_ORIGINS`, `TRUST_PROXY` behind a proxy, and tested backups.
