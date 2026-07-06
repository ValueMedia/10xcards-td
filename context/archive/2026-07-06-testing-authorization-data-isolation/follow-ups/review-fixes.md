# Review follow-ups — testing-authorization-data-isolation

Deferred items surfaced by the 2026-07-07 impl-review (see `../reviews/impl-review.md`).

## For test-plan §3 Phase 5 (Quality-gate wiring)

- **F2 — integration suite must not pass by silently skipping.** `hasSupabaseEnv`
  (`tests/integration/helpers/env.ts:37-54`) gates every suite via
  `describe.skipIf(!hasSupabaseEnv)`. In the CI job that is meant to RUN these
  tests, assert `hasSupabaseEnv === true` (or add one non-skipped guard test that
  fails when the env is absent), so a down/misconfigured Supabase cannot report
  "0 run, all skipped" as green. Deferred here by design — Phase 1 only guarantees
  local runnability + clean auto-skip.
