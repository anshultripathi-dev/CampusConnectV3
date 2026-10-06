# Offline AI

All "smart" features run **on the server, with no network access and no API key**. That makes them usable in a classroom with no internet, keeps incident text on campus, and means their behaviour can be explained and tested.

Code: [`src/v2/ai/`](../src/v2/ai/) — `text.js`, `triage.js`, `risk.js`, `insights.js`, `query.js`, `index.js`, `trainingData.json`.

> Honest framing: these are **small, transparent models and heuristics**, not large language models. Where something is trained it says so; where it is a hand-weighted formula it says that too.

| Feature | Technique | Trained? |
|---|---|---|
| [Triage suggestions](#triage) | Multinomial **Naive Bayes** text classifier + keyword-weight severity | Yes — bundled corpus + your incidents |
| [Duplicate detection](#duplicate-detection) | **TF-IDF** + cosine similarity | No (computed on the fly) |
| [SLA risk](#sla-risk) | Hand-weighted scoring with reasons | **No** |
| [Shared-cause clusters](#clusters) | Single-link clustering on TF-IDF similarity | No |
| [Daily brief](#daily-brief) | Template over computed statistics | No |
| [Natural-language search](#natural-language-search) | Rule-based interpreter | No |
| Per-incident analysis (optional) | Claude via `aiService.js`, heuristic fallback | External, only if `ANTHROPIC_API_KEY` is set |

## Text processing

`text.js` lower-cases, folds `wi-fi → wifi`, strips punctuation and stopwords, and applies a light suffix stemmer (`leaking/leaks → leak`). `TfIdfIndex` builds sparse TF-IDF vectors with L2 normalisation and exposes cosine similarity and top-k queries.

## Triage

As someone types a report, `POST /api/v2/ai/triage` suggests **category, issue type, severity and department**, with a confidence and the keywords that drove it.

- **Classifier** — Naive Bayes over `Category/SubCategory` labels (Maintenance/Electrical, Maintenance/Plumbing, Maintenance/IT, Safety/Security, LostFound/General) with Laplace smoothing. The likelihood is tempered for long texts so confidence isn't absurdly high, and displayed confidence is capped at 97 %.
- **Training data** — 60 hand-written examples in `trainingData.json`, **plus every incident already in the database** (the model re-trains when the set of incidents changes), so it adapts to your campus's vocabulary.
- **Severity** — regex signals with weights (e.g. *fire, smoke, sparking* = critical; *burst, outage, stolen* = high; *leak, broken, flickering* = medium; *minor, cosmetic* = negative). Lost-and-found never exceeds Low unless something dangerous is mentioned. The matched signals are returned.
- **Department** — fixed mapping: Maintenance→Maintenance, Safety→Security, LostFound→Facilities.
- **Refuses to guess** when fewer than two known words are present or no label reaches ~35 %.

**Improving it:** add labelled examples to `trainingData.json` (`{text, category, subCategory}`), keep the classes balanced, and run `npm test`.

**Limitations:** English only; five labels; the bundled corpus is small, so accuracy depends on real incidents accumulating; severity is heuristic.

## Duplicate detection

`POST /api/v2/ai/similar` compares a draft report against **open** incidents (title weighted ×2, description, location) by TF-IDF cosine similarity (threshold 0.3). Staff see the matching incidents; **students only learn that N similar reports exist** (other people's ids and titles are never exposed). (The per-incident *duplicates* tab in the drawer still uses the simpler token-overlap measure from V2 in `services/aiAdapter.js`.)

## SLA risk

`risk.js` scores every open incident 0–100 and returns `level` (`low`, `elevated`, `high`, `breached`) with **reasons**:

| Signal | Effect |
|---|---|
| Fraction of the SLA window used | `ratio × 70` (≥ 100 % ⇒ breached, score 100) |
| No owner after 25 % of the SLA | +12 |
| Assigned but not started after 50 % | +6 |
| Critical / High severity | +10 / +5 |
| Department already has ≥ 5 open incidents | +6 |
| Work done, awaiting approval | −12 |

It is a **transparent hand-weighted model, not a trained one**; the chip tooltip lists the reasons. A natural next step is to fit these weights on real resolution history.

## Clusters

`insights.clusters()` groups open incidents whose TF-IDF similarity ≥ 0.4 (+0.1 when they share a building) using union-find. Groups of two or more are shown as **"Possible shared causes"** — e.g. three Wi-Fi reports in Block B — labelled by their top terms and ranked by size.

## Daily brief

A short, deterministic summary: open and critical counts, resolved in the last 24 h, breached and high-risk incidents, the busiest building and the most common open issue type.

## Natural-language search

`POST /api/v2/ai/search` (and the command palette) interprets queries such as:

> `open electrical issues in lab 204 this week`

into filters — **status** (open, resolved, closed, in progress, awaiting approval…), **type** (electrical, plumbing, Wi-Fi/IT, security, lost & found), **severity**, **time window** (today, this week, last 3 days…), **ownership** (unassigned, assigned to me), **SLA** (breached, at risk) — and treats the remaining words as free text matched against id, title, description and location. Results are scoped to what the caller may see. The parsed meaning is shown back (e.g. *Open · Electrical · this week · matching "lab 204"*).

## Privacy

Nothing leaves the server. The only optional external call is the per-incident Claude analysis, and only when you set `ANTHROPIC_API_KEY`; the app never depends on it.

## Tests

`tests/ai.test.js` covers tokenisation, classification of all five types, severity, refusal on gibberish, TF-IDF ranking, SLA risk, clusters, duplicates, the daily brief and the query parser; `tests/api.test.js` covers the endpoints' scoping and student redaction.
