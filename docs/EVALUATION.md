# Evaluation

`npm run test:unit` covers deterministic chunking and lexical matching. `npm run test:eval` reads the labelled fictional cases and reports whether lexical retrieval selects the expected policy title. It requires a migrated and seeded local database. The evaluation command deliberately uses lexical retrieval so results are reproducible and do not incur API charges.

The current fixture set has 30 fictional cases covering leave, onboarding, relocation, expenses, remote work, version ambiguity, out-of-scope questions, and adversarial instructions. Recall is a simple expected-document hit rate. It does not measure answer correctness, citation support, latency, or human-rated groundedness. No quality score is claimed until the runner is executed against the seeded database and its output reviewed.

Live mode should be evaluated separately with a fixed model/version, actual usage metadata, human-reviewed citation support, and a documented environment. No LLM judge is treated as ground truth. Unauthorized retrieval and invalid citation IDs should be covered with database-backed integration tests before external use.
