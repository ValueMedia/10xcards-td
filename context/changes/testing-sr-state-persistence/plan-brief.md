# SR State & Flashcard Persistence Tests (Test-Plan Phase 2) — Plan Brief

> Full plan: `context/changes/testing-sr-state-persistence/plan.md`
> Research: `context/changes/testing-sr-state-persistence/research.md`

## What & Why

Build the Phase 2 integration-test suite from `context/foundation/test-plan.md`: prove study history and flashcards neither vanish nor corrupt. Covers **Risk #3** (SR review-state corruption/loss — learned count or "due" drifts, history lost) and **Risk #4** (flashcard data loss on save/batch — partial batch, silent drop). These are the plan's two persistence risks (#3 is High×High).

## Starting Point

The Phase 1 authorization harness is complete and reusable: a Vitest `integration` project running against real local Supabase, with `createTestUser`/`userClient`/`seedSet`/`makeApiContext` helpers and a `describe.skipIf(!hasSupabaseEnv)` guard. The three handlers this plan exercises (`POST /api/reviews`, `GET .../due-cards`, `POST .../flashcards/batch`) import cleanly under existing aliases — no new stubs. SR state lives in `flashcards` FSRS columns; the batch endpoint silently skips duplicate fronts.

## Desired End State

`npm run test:integration` runs two new suites (SR persistence + flashcard batch) green against local Supabase, auto-skipping when env is absent. `test-plan.md §6.3` documents the submit→re-fetch→assert pattern, and the Phase 2 rollout row reads `complete`. No product-code changes ship.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Repeated-submit idempotency | Document current behavior | No server guard exists; encode actual behavior as a known gap without touching product/DB. | Plan |
| Extra SR write paths | `reset_set_progress` yes, `claim_shared_set` no | Reset is cheap and a useful clean-state fixture; claim is share/Risk-#2 territory. | Plan |
| Seeding SR state | Drive through real `POST /api/reviews` | Stays on the true production write path; avoids oracle-risky DB-column manipulation. | Plan |
| Silent-skip trap (green on 0 tests) | Defer to Phase 5 (CI gate) | Matches the rollout plan; keeps phase responsibilities clean. | Plan |
| Coverage level | Full coverage of both risks | Closes Phase 2 per §2 Risk Response Guidance. | Plan |
| Source of truth for scheduling | `flashcards` FSRS columns (assert all, incl. `learning_steps`) | Past defect dropped `learning_steps`, silently corrupting scheduling. | Research |

## Scope

**In scope:** SR happy-path all-column persistence, repeated/concurrent submit (documented), due-selection after submit, learned-count (`state==2`) consistency, `reset_set_progress`; batch happy-path, validation atomicity, 1–50 cap, silent duplicate skip, all-duplicate `count:0`, within-batch duplicates, ownership 404; fill `§6.3`/`§6.6` and mark Phase 2 complete.

**Out of scope:** product/DB changes, idempotency fix, `setCardDue` DB helper, `claim_shared_set`, CSV chunked-import test, `openapi-spec.ts`, CI/`npm test` wiring, the silent-skip fix.

## Architecture / Approach

Two new test files under `tests/integration/persistence/` plus a small `helpers/sr.ts` (readCardState/countReviews/countLearned), following Phase 1 conventions (skipIf guard, seed via owner client, direct handler invocation, owner-client cross-checks, `deleteTestUser` teardown). Oracle-problem avoidance is a rule: assert invariants/relations (reps +1, `due` moved forward, `state` reached Review, `learning_steps` persisted) and count `reviews` rows directly — never recompute expected values with `fsrs()`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. SR persistence (#3) | `sr-state.test.ts` + `helpers/sr.ts` — 6 scenarios | Reaching `state==2` deterministically; concurrent-submit timing |
| 2. Batch save (#4) | `flashcard-batch.test.ts` — 7 scenarios | Asserting silent-skip contract (count, not just 201) |
| 3. Cookbook & wrap-up | `§6.3`/`§6.6` filled, Phase 2 = complete | Keeping docs self-contained |

**Prerequisites:** local Supabase running (`npx supabase start`); `.dev.vars` with `SUPABASE_URL`/`SUPABASE_KEY`/`SUPABASE_SERVICE_ROLE_KEY`.
**Estimated effort:** ~1–2 sessions across 3 phases.

## Open Risks & Assumptions

- Concurrent-submit test is timing-sensitive; it documents observed behavior rather than asserting a race winner.
- Learned-count scenario assumes ts-fsrs graduates a card to Review after a bounded number of `Good` grades; the test asserts `state===2` is reached, not the exact interval.
- Suites inherit the Phase-1 silent-skip risk until Phase 5.

## Success Criteria (Summary)

- Submitting a review persists correct, coherent FSRS state (all columns incl. `learning_steps`), verified on re-fetch without an oracle.
- A flashcard batch is all-or-nothing on validation, and duplicate-skip / all-duplicate outcomes are surfaced via `count`/`skippedCount` (no silent loss to a status-only caller).
- `test-plan.md` documents the pattern and Phase 2 reads `complete`.
