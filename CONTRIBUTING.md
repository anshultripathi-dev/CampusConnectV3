# Contributing to CampusConnect

Thanks for helping improve CampusConnect! This guide keeps contributions smooth.

## Ways to contribute

- **Report a bug** — open an issue using the *Bug report* template.
- **Suggest a feature** — open an issue using the *Feature request* template and describe the problem first.
- **Improve the docs** — fixes and clarifications are always welcome.
- **Send a pull request** — see below.
- **Security issues** — do **not** file a public issue; see [`SECURITY.md`](SECURITY.md).

## Development setup

```bash
git clone https://github.com/anshultripathi-dev/CampusConnectV3.git
cd CampusConnectV3
npm install && npm run web:install
npm run build
npm start        # http://localhost:3000
```

Requires **Node.js ≥ 22.5**. The full guide is [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).

## Before you open a pull request

1. **Branch from `main`** — `feat/short-name`, `fix/short-name` or `docs/short-name`.
2. **Keep it focused.** One concern per PR; unrelated reformatting makes review hard.
3. **Add or update tests.** Every behaviour change needs a test — especially anything about *who may see or do what* (test the refusal, not just the success).
4. **Run the checks locally:**
   ```bash
   npm run check          # tests + smoke test + frontend type-check/build
   npm run web:format     # Prettier for the frontend
   ```
5. **Update the docs** — API changes in `docs/API.md`, schema changes in `docs/DATABASE.md`, user-visible changes in `CHANGELOG.md` (under *Unreleased*).
6. **Describe the change** in the PR template: what, why, how you tested.

## Standards

- **Authorisation on the server.** Never rely on the UI hiding something. If you add a visibility rule, apply it to REST, notifications **and** real-time rooms.
- **Migrations are append-only** — never edit a shipped migration (see [`docs/DATABASE.md`](docs/DATABASE.md#writing-a-migration)).
- **Offline by default** — no CDN or third-party API at runtime without an opt-in configuration.
- **Design tokens** — frontend colours come from CSS variables; no hard-coded hex values in components. Keep text ≥ 12 px and AA contrast in both themes.
- **Commit messages** follow [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`.
- **Never commit secrets**, `.env` files, databases or uploaded photos (they are git-ignored; keep it that way).

## Review

A maintainer will review your PR; CI must pass. Small, well-tested changes merge fastest.

## Code of conduct

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
