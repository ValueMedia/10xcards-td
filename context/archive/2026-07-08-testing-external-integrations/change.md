---
change_id: testing-external-integrations
title: Test external integration failure paths (AI generation + Cambridge Dictionary)
status: archived
created: 2026-07-08
updated: 2026-07-08
archived_at: 2026-07-08T22:11:55Z
---

## Notes

Rollout Phase 3 of context/foundation/test-plan.md: "External integration failure paths".

Risks covered:
- #5 (AI generation failure does not surface cleanly — provider unavailable, >10s timeout, or malformed output leads to an empty/garbage saved set or endless spinner instead of a clean error)
- #6 (Cambridge Dictionary integration failure does not surface cleanly — dictionary down or format-changed crashes or blanks instead of a clean error)

Test types planned: integration with a mocked provider boundary + contract test.

Risk response intent:
- #5: prove that failure/timeout/malformed output yields a clean UI error, ZERO partial save, respects the <10s NFR, and the ai-rate-limit gate holds; do not test provider uptime, do not fall into the oracle problem on the parser output.
- #6: prove the dictionary error path (down / format change) yields a clean error and no crash; the happy path is already covered (dictionary.test.ts, dict/[word].test.ts) — cover the error path, not a duplicate happy path.
