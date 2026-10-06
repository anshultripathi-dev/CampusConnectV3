## What does this change?

<!-- A short summary. Link the issue it closes: "Closes #123" -->

## Why?

<!-- The problem being solved or the behaviour being improved. -->

## How was it tested?

- [ ] `npm run check` passes locally
- [ ] Added/updated tests (including the *refused* case for any permission/visibility rule)
- [ ] Checked the UI in light **and** dark themes (if the UI changed)

## Checklist

- [ ] Authorisation is enforced on the server (REST, notifications **and** real-time rooms where relevant)
- [ ] Docs updated (`docs/API.md`, `docs/DATABASE.md`, `CHANGELOG.md` under *Unreleased*)
- [ ] New database change is a **new migration** (no shipped migration edited)
- [ ] No secrets, `.env`, databases or uploads committed
