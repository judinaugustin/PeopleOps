# Decisions

- **One Next.js application:** UI and API share one local process, so a new developer can run one web service and one database. Separate services would add setup and auth boundaries without helping the portfolio MVP.
- **MIT license:** the portfolio source is provided for reuse under a permissive open-source license; see the repository `LICENSE` file.
- **Postgres + pgvector:** policy metadata, workflows, sessions, and vectors share one locally runnable, open-source database. Vectors are fixed at 1,536 dimensions in the initial schema; changes need a schema migration.
- **DB-backed opaque sessions:** avoids trusting a client-supplied role or storing session state only in browser-readable storage. Passwords use Node's built-in scrypt implementation.
- **Demo lexical retrieval:** no-key mode needs an honest useful path without pretending embeddings or a model ran. It labels the response as simulated. It is a demonstration, not a retrieval quality claim.
- **Text/Markdown upload only:** simple extraction avoids OCR and document parser risks in the initial slice. PDF, size/page limits beyond byte limits, and retryable ingestion jobs remain future work.
- **In-app request queue:** requests never send email or mutate an external HR system; humans explicitly submit and reviewers use enumerated state transitions.
- **No paid services besides optional OpenAI:** all local runtime components use open-source packages. Live AI API usage may incur charges.
- **OpenAI model default:** use configurable `gpt-6-luna` with the Responses API and structured JSON output. The official model documentation lists GPT-6 Luna for focused, high-volume tasks and supports structured outputs; the deprecation page says GPT-4.1 mini is scheduled for shutdown on 14 January 2027. Recheck model availability and pricing before a live demo: [model page](https://developers.openai.com/api/docs/models/gpt-6-luna), [deprecations](https://developers.openai.com/api/docs/deprecations), [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).
