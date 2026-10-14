# Deployment

## Canonical local run

Use Docker Compose from the repository root: copy `.env.example` to `.env`, set a unique `AUTH_SECRET`, choose local demo passwords, then run `docker compose up --build`. Postgres uses a named volume and a health check. Keep `.env`, database volumes, logs, and any backups out of Git.

## Before any shared or public deployment

This portfolio prototype is not production-ready. Before deployment, use managed secrets, TLS, a hardened Postgres account/network, secure cookies, durable rate limits, request/body timeouts, structured redacted logs, backup/restore rehearsal, retention/deletion controls, account recovery/administration, and a security review. Do not enable the demo users in production. Ensure OpenAI calls are disclosed and limited to synthetic policy/question content. The configured database vector dimension and embedding model must remain compatible.

No public deployment is provided or claimed. Free hosting can change; local Docker is the supported target.
