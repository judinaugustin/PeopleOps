# PeopleOps Copilot

PeopleOps Copilot is a local-first prototype for finding answers in a small library of **approved HR policies**. It returns source passages, lets an employee prepare checklists and HR-request drafts, and provides an in-app queue for human review.

> **Synthetic data only. Do not enter real employee information or sensitive personal details.** This is not an HRIS, legal or benefits adviser, or employment decision system. It must not be used to screen candidates, score employees, decide eligibility, or take employment actions.

## What works

- Employee, HR reviewer, and admin demo roles with server-side sessions and route-level access checks.
- Policy chat with server-filtered retrieval and citations resolved from database records. Without a key it uses lexical demo search and clearly labels simulated responses. With an OpenAI key it uses configured embeddings and chat; a live provider failure returns an error and never falls back silently.
- Admin upload, preview, publish, version, and archive for UTF-8 Markdown/text policies. Audience and effective dates are recorded. Uploaded content is stored in Postgres under generated document IDs; raw upload names are display-only. PDF/OCR and automatic supersession are not included yet.
- Employee-owned request and checklist drafts. Explicitly submitting a request places it in the local HR queue. HR/admin reviewers can make enumerated status changes recorded as request events and audit records. Nothing is emailed or sent to an external system.
- Conversation history can be reopened and deleted; citations retain their source passages. A small operational dashboard shows document, request, answer-status, and feedback counts. These are workspace totals, not AI quality metrics.
- Responsive interface, synthetic sample policies, a local Docker Compose runtime, and unit/evaluation commands.

### Versioned policy test corpus

The demo seed includes seven fictional policy families, each with a superseded version and a current version effective during 2026: leave and time away, business expenses, remote work, onboarding, relocation, learning reimbursement, and respectful workplace reporting. The versions contain deliberately changed thresholds and timelines so retrieval can be checked against current rules. Employees see only policies effective today; admins can inspect the full history. Source Markdown lives in [docs/demo-policies](docs/demo-policies), and [tests/eval/current_policy_versions.json](tests/eval/current_policy_versions.json) records the expected current version for the evaluation command. These documents are synthetic test fixtures, not approved policies for a real employer.

Source code is released under the [MIT License](LICENSE).

## Run locally

Prerequisites: Docker Desktop with Compose, Node.js 20.11+, and npm. For a local npm run, start the Postgres service first.

```powershell
Copy-Item .env.example .env
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000). Compose stores Postgres data in the `peopleops-db` named volume. To stop the app, use `Ctrl+C`; `docker compose down` retains the volume. `docker compose down -v` deletes demo data.

### Demo logins

Development seeding creates three fictional accounts:

| Role        | Email                        | Default local password |
| ----------- | ---------------------------- | ---------------------- |
| Employee    | `employee@northstar.example` | `change-me-employee`   |
| HR reviewer | `hr@northstar.example`       | `change-me-hr`         |
| Admin       | `admin@northstar.example`    | `change-me-admin`      |

The included local Compose configuration opts into demo seeding with `SEED_DEMO_USERS=true` and disables Secure cookies for localhost HTTP. Change the three password values in `.env` before sharing this local environment. Set `SEED_DEMO_USERS=false` and `COOKIE_SECURE=true` for any HTTPS deployment; the seed script otherwise skips production. The login screen only shows account shortcuts in a development build.

## Demo mode and live mode

| Capability                                                                | No `OPENAI_API_KEY`                  | API key configured                                                 |
| ------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------ |
| Policy catalogue, upload preview, publishing, request/checklist workflows | Works locally                        | Works locally                                                      |
| Retrieval                                                                 | Clearly labelled lexical demo search | OpenAI embeddings with configured model and pgvector cosine search |
| Chat                                                                      | Simulated response labelled as demo  | OpenAI chat completion constrained to retrieved passage IDs        |
| External cost                                                             | None                                 | OpenAI chat and embedding usage may incur charges                  |

Set `OPENAI_API_KEY` only in the server environment or `.env`; never use a `NEXT_PUBLIC_` secret. `OPENAI_CHAT_MODEL` and `OPENAI_EMBEDDING_MODEL` select the models. The current schema expects 1,536-dimensional embeddings (`text-embedding-3-small` by default); a different dimension requires a migration. Chunks record their embedding model, so changing models requires re-indexing before those chunks can be retrieved. An app request limit is not a provider billing cap. Review current [provider pricing](https://developers.openai.com/api/docs/pricing) and [API data controls](https://developers.openai.com/api/docs/guides/your-data) before using live mode. This demo is designed for synthetic policies, not personal employee messages.

## Environment

See [.env.example](.env.example). The required values for Compose are `DATABASE_URL` and `AUTH_SECRET`; the included local database defaults are for development only. Use a random secret of at least 32 characters outside local development. `MAX_UPLOAD_BYTES` and `MAX_QUESTIONS_PER_HOUR` are application-level limits.

## Checks

```powershell
npm ci
npm run format:check
npm run lint
npm run typecheck
npm run test:unit
npm run test:eval
npm run build
```

The API and workflow checks need a running Postgres with pgvector. `npm run db:migrate` applies the idempotent schema in `db/schema.sql`; `npm run db:seed` inserts fictional policies and local development accounts. `npm run test:eval` reports expected-document hits and checks that each policy family has exactly one active version matching the version fixture. Add `-- --live` to make six real OpenAI policy-answer calls and check for current-version citations and changed rule values; these calls use API credits. See [docs/EVALUATION.md](docs/EVALUATION.md) for metric limits. No human-rated groundedness score is claimed.

## Architecture and limits

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md), [docs/PRIVACY_AND_SCOPE.md](docs/PRIVACY_AND_SCOPE.md), [docs/DECISIONS.md](docs/DECISIONS.md), and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). This prototype has not had a formal security review, production deployment review, or human evaluation. It does not include account recovery, organization administration, PDF parsing, checklist editing after save, a full conversation history viewer, or document version replacement/archival UI.
