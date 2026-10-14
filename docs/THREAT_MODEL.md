# Threat model

## Assets and trust boundaries

Assets include session tokens, password hashes, server API keys, fictional policy text, user questions, private drafts, HR request descriptions, and audit events. The browser is untrusted. API input, user prompts, and policy text are untrusted. Postgres and the server process are the trusted local boundary. OpenAI is an optional external processor in live mode.

## Main risks and mitigations

| Risk                                | Current mitigation                                                                                          | Residual risk                                                                                    |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Cross-user IDOR                     | Owner/org predicates in request, checklist, conversation, and document queries; server-resolved identity    | Coverage needs comprehensive authorization integration tests                                     |
| Role escalation                     | Role comes from active DB user session; admin and HR route guards                                           | No account admin UI or strong production auth operations                                         |
| Session theft / CSRF                | Random DB-backed token, SHA-256 stored hash, HttpOnly/SameSite cookie, same-origin guard on state changes   | No device/session management, CSRF token, or login rate limiter                                  |
| Prompt injection in question/source | Retrieved content is bracketed as evidence; constrained schema; no arbitrary tools; citation allowlist      | Model can still produce unsupported prose; human evaluation is absent                            |
| Fake citations                      | Citation IDs must resolve to retrieved records; title/version/quote are database-derived                    | Semantic support is not proven by ID validity alone                                              |
| Malicious upload/path traversal     | Only `.txt`/`.md`, size cap, generated document UUID, uploaded name never used as a path, no static serving | UTF-8 text is stored in Postgres; no parser sandbox or file scanning                             |
| Cost abuse                          | Question length and per-user hourly limit; embedding batches; output token limit                            | In-memory/DB quotas are app controls, not provider spend caps; shared quota can still cost money |
| Secret leakage                      | OpenAI key is server-only; no public-prefixed secret; generic errors                                        | Needs secret scanning and deployment-secret review                                               |
| Sensitive HR content                | Visible synthetic-data warning and minimal request fields                                                   | Users can still type sensitive text; prototype has no retention automation                       |

## Out of scope

Candidate screening, employee ranking/performance analysis, eligibility decisions, employment action recommendations, HRIS/payroll mutation, email, arbitrary web access, and real employee records. The app is not a production HR system and has not received a formal security review.
