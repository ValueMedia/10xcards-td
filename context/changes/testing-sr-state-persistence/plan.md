# SR State & Flashcard Persistence Tests (Test-Plan Phase 2) Implementation Plan

## Overview

Build the Phase 2 integration-test suite from `context/foundation/test-plan.md` — proving that spaced-repetition (SR) review state and flashcard batches neither vanish nor corrupt. Two risks are covered: **Risk #3** (SR review-state corruption / loss — learned count or "due" selection drifts, study history lost) and **Risk #4** (flashcard data loss on save/batch — partial batch, silent drop). The suite reuses the Phase 1 integration harness verbatim, adds no product-code changes, and fills in the stubbed `test-plan.md §6.3` cookbook.

## Current State Analysis

The Phase 1 harness (`context/archive/2026-07-06-testing-authorization-data-isolation/`) is complete and reusable:

- Vitest `integration` project (`vitest.config.ts:51-77`): `environment: node`, `include: tests/integration/**/*.test.ts`, setup `tests/integration/helpers/env.ts`, aliases `cloudflare:workers` / `astro:env/server` / `astro:middleware` → stubs in `src/test/`.
- Helpers (`tests/integration/helpers/`): `createTestUser` / `deleteTestUser`, `userClient` (RLS-scoped), `serviceClient` (scaffolding only — no app-table GRANT), `anonClient`, `seedSet(client, userId, {name?, cards?})`, `makeApiContext({user, supabase, params?, body?})`, `hasSupabaseEnv` + `describe.skipIf`.
- Reference: `tests/integration/authorization/reviews.idor.test.ts:42-98` already drives `POST /api/reviews` and reads back via the owner client — the direct template for Risk #3.

The three handlers this plan exercises import cleanly under the existing Node aliases (they receive the Supabase client via `locals`, not `@/lib/supabase`) — **no new stub files are required**:

- `POST /api/reviews` → `src/pages/api/reviews/index.ts:14` → `submitCardReview` (`src/lib/services/reviews.ts:50`) → RPC `submit_card_review` (`supabase/migrations/20260614120000_submit_card_review_rpc.sql:5`, atomic INSERT reviews + UPDATE flashcards).
- `GET /api/sets/[id]/due-cards` → `src/pages/api/sets/[id]/due-cards.ts:7` → `getDueCardsForSession` (`src/lib/services/reviews.ts:7`, due = `flashcards.due <= now()`).
- `POST /api/sets/[id]/flashcards/batch` → `src/pages/api/sets/[id]/flashcards/batch.ts:14` → `createFlashcardsBulk` (`src/lib/services/flashcards.ts:82`, single atomic `insert([...])`, silent dup-skip at `:133-140`).
- `POST /api/sets/[id]/reset-progress` → `resetSetProgress` (`src/lib/services/reviews.ts:120`) → RPC `reset_set_progress` (`supabase/migrations/20260620120000_reset_set_progress_rpc.sql:6`).

The one real gap — a helper to seed a card in a specific due/FSRS state — is **deliberately not built** (decided during planning): all SR state is produced by driving the real `POST /api/reviews` path, keeping the tests on the true production write path and free of DB-column manipulation.

Full grounding: `context/changes/testing-sr-state-persistence/research.md`.

## Desired End State

`npm run test:integration` runs a new SR-persistence suite and a new flashcard-batch suite (in addition to the Phase 1 authorization suites), all green against a running local Supabase, and auto-skipping when Supabase env is absent. `test-plan.md §6.3` documents the submit → re-fetch → assert-state pattern, `§6.6` carries a Phase-2 note, and the Phase 2 row in `§3` reads `complete`. No product code changes ship.

### Key Discoveries:

- Source of truth for scheduling is the `flashcards` FSRS columns (`due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review`), not the `reviews` audit log (`context/archive/2026-06-20-learn-stats-for-set/plan.md:14`). "Learned" = `state == 2` (`src/lib/services/stats.ts:135`).
- The `learning_steps` column was once dropped from the flashcard UPDATE, silently corrupting future scheduling (`context/archive/2026-06-14-sr-review-session/reviews/impl-review-phase-1.md` F1) — the happy-path test must assert **all** FSRS columns, not just `reps`.
- No server-side idempotency guard exists: `reviews` has no unique constraint (`supabase/migrations/20260610000000_initial_schema.sql:34-49`), and the read-compute in `submitCardReview` happens outside the RPC transaction. A repeated submit advances FSRS twice and inserts a second review row — this is documented as a known gap, not fixed here.
- The batch endpoint silently skips duplicate fronts and returns `201` with `count < submitted` (`src/lib/services/flashcards.ts:133-143`); an all-duplicate batch returns `201 count:0`. A status-only caller loses cards silently — the tests assert `count`/`skippedCount`, not just HTTP status.
- Cross-user denial (404) is Phase 1 territory and already covered; this plan asserts correctness/persistence, adding only one ownership guard for the batch endpoint as a boundary check.

## What We're NOT Doing

- **No product-code or DB changes.** Idempotency is documented via assertions on current behavior, not fixed (no new unique constraint / migration / service change).
- **No `setCardDue` / `seedReviewedCard` DB-manipulation helper.** SR state is produced through the real `POST /api/reviews` path.
- **No `claim_shared_set` coverage.** That is share/Risk-#2 territory; out of scope. `reset_set_progress` IS covered.
- **No CSV chunked-import test.** The multi-chunk partial-save is a client-component concern, not the batch-endpoint contract; it is only noted in the §6.3 cookbook, not tested here.
- **No fix for the silent-skip trap** (`describe.skipIf` green-on-zero-tests). Deferred to Phase 5 (CI gate).
- **No `openapi-spec.ts` update** — no API contract changes.
- **No `npm test` / CI wiring.** The suite lives under the `integration` project, excluded from the default run until Phase 5.

## Implementation Approach

Two new test files mirroring the Phase 1 conventions (`describe.skipIf(!hasSupabaseEnv)`, `beforeAll` seed via owner `userClient`, `afterAll` `deleteTestUser`, direct handler invocation, owner-client cross-checks), plus a small shared assertion helper to avoid duplicating the inline card/review readers Phase 1 wrote ad-hoc. Oracle-problem avoidance is a first-class rule: assertions check **invariants and relations** (reps incremented by exactly 1, `due` moved forward, `last_review` equals the review timestamp, `state` reached Review, `learning_steps` non-null/persisted) — never a value recomputed by calling `fsrs().next()` in the test. History integrity is checked by counting `reviews` rows directly via the owner client, which catches double-counting that column-state assertions alone would miss.

## Critical Implementation Details

- **Reaching `state == 2` (Review) deterministically.** `submitCardReview` reads a card by id and applies `fsrs().next()` regardless of due-ness, so a card can be advanced by repeated `POST /api/reviews` calls without waiting for its `due` to elapse. The learned-count test drives the card through however many `Good` grades ts-fsrs requires to graduate to Review, then asserts `state === 2` on re-fetch — it must not hard-code the interval math.
- **Freshly seeded cards are due now.** New cards default to `due = now()` (`context/archive/2026-06-14-sr-review-session/plan.md:24`), so a seeded card already appears in `GET /api/sets/[id]/due-cards`; the due-selection test submits a review and asserts the card drops out (its `due` moved to the future).
- **Concurrent-submit test is timing-sensitive.** Firing two parallel `POST /api/reviews` for the same card asserts `reviews` count reflects the current (unguarded) behavior; document the observed outcome rather than assuming a race winner.

## Phase 1: SR review-state persistence tests (Risk #3)

### Overview

Prove that submitting a review persists the correct FSRS state, that "due" selection and the learned count follow that state, that `reset_set_progress` cleans state atomically, and document the (unguarded) repeated-submit behavior — all via the real API path with oracle-safe assertions.

### Changes Required:

#### 1. Shared assertion helpers

**File**: `tests/integration/helpers/sr.ts` (new)

**Intent**: Factor the ad-hoc card/review readers Phase 1 inlined into reusable helpers so both new suites stay terse.

**Contract**: Export `readCardState(client, cardId)` → the FSRS columns (`reps, lapses, state, due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, last_review`) of one flashcard via the owner client; `countReviews(client, cardId)` → number of `reviews` rows for a flashcard; `countLearned(client, setId)` → count of `state == 2` flashcards in a set. All read-only via an owner RLS client, mirroring `reviews.idor.test.ts` readers.

#### 2. SR persistence suite

**File**: `tests/integration/persistence/sr-state.test.ts` (new)

**Intent**: Cover the six Risk-#3 scenarios from research (§ "Ready-to-plan test scenarios"). One test user, one seeded set per relevant test, cleaned up in `afterAll`.

**Contract**: `describe.skipIf(!hasSupabaseEnv)` suite invoking the exported `POST` from `@/pages/api/reviews`, `GET` from `@/pages/api/sets/[id]/due-cards`, and `POST` from `@/pages/api/sets/[id]/reset-progress` via `makeApiContext`, asserting on the returned `Response` and cross-checking with the helpers above. Scenarios:
- **Happy-path persistence (no oracle)**: submit `Good` on a fresh card → 200; re-fetch and assert `reps === 1`, `last_review` equals the review time, `due` in the future, `state` advanced past New, and `learning_steps` persisted (non-null). Assert relations/invariants, not recomputed FSRS values.
- **Repeated-submit idempotency (documented gap)**: submit the same `{flashcardId, grade}` twice sequentially; assert the **current** behavior — two `reviews` rows and a second FSRS advance — with a comment marking it a known, unfixed gap (per planning decision).
- **Concurrent-submit history**: fire two parallel submits for one card; assert `reviews` count reflects observed current behavior (documented).
- **Due-selection after submit**: seed a due card, confirm it appears in `due-cards`, submit `Good`, assert it no longer appears (and `nextDue` behaves).
- **Learned-count consistency**: drive a card to `state === 2` via repeated `Good`; assert `countLearned(setId) === 1` and that `getLearningStats`/set-detail counting agrees (the three independent `state==2` counters stay consistent).
- **reset_set_progress baseline**: after some reviews, `POST /api/sets/[id]/reset-progress` → assert FSRS columns back to defaults, `countReviews` for each card is 0, and all cards reappear in `due-cards`.

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes: `npm run build`
- [ ] Selective lint passes on new `.ts` files: `npx eslint tests/integration/helpers/sr.ts tests/integration/persistence/sr-state.test.ts`
- [ ] SR suite passes: `npm run test:integration` (with local Supabase running)
- [ ] Suite auto-skips cleanly when Supabase env absent (no failures)

#### Manual Verification:

- [ ] Test-has-teeth check: temporarily revert the `learning_steps` line in the `submit_card_review` RPC (or comment the column in the UPDATE), confirm the happy-path test goes red, then restore.
- [ ] Repeated-submit test's documented behavior matches what the running system actually does (comment is accurate).
- [ ] `deleteTestUser` teardown leaves no orphaned rows (spot-check via owner client after run).

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 2.

---

## Phase 2: Flashcard batch-save tests (Risk #4)

### Overview

Prove the batch endpoint is all-or-nothing on validation, respects the 1–50 cap, and that its intentional duplicate-skip / all-duplicate behaviors are surfaced (not silent data loss to a status-only caller), plus an ownership boundary check.

### Changes Required:

#### 1. Batch-save suite

**File**: `tests/integration/persistence/flashcard-batch.test.ts` (new)

**Intent**: Cover the seven Risk-#4 scenarios from research. Two test users (owner + a non-owner for the ownership check), seeded sets cleaned up in `afterAll`.

**Contract**: `describe.skipIf(!hasSupabaseEnv)` suite invoking the exported `POST` from `@/pages/api/sets/[id]/flashcards/batch` via `makeApiContext({user, supabase, params:{id}, body:{flashcards:[...]}})`, asserting on the `Response` and cross-checking card counts via the owner client. Scenarios:
- **Full-batch persistence**: N distinct cards → 201, `count === N`, owner card count === N.
- **Whole-batch atomicity on invalid element**: one card with empty or >1000-char `front` → 400, zero rows written (count unchanged).
- **Boundary cap**: 50 cards → 201; 51 cards → 400.
- **Silent duplicate skip**: pre-seed front "X"; submit "X" + new cards → 201 with `count < submitted`, `skippedCount`/`skippedFronts` set, only new cards persisted.
- **All-duplicate batch**: submit only existing fronts → 201, `count === 0`, `skippedCount === submitted`, no new rows.
- **Within-batch duplicate fronts**: two identical new fronts in one batch → both persist (`count === 2`) — documents the no-`UNIQUE` behavior.
- **Ownership**: non-owner batch to another user's set → 404, zero rows.

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes: `npm run build`
- [ ] Selective lint passes: `npx eslint tests/integration/persistence/flashcard-batch.test.ts`
- [ ] Batch suite passes: `npm run test:integration` (with local Supabase running)
- [ ] Suite auto-skips cleanly when Supabase env absent

#### Manual Verification:

- [ ] Test-has-teeth check: temporarily make `createFlashcardsBulk` skip the duplicate filter (or the `.max(50)` guard) and confirm the corresponding test goes red, then restore.
- [ ] Duplicate-skip and all-duplicate assertions match actual endpoint responses (inspect one response body manually).
- [ ] No orphaned rows after teardown.

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 3.

---

## Phase 3: Cookbook & rollout wrap-up

### Overview

Document the new patterns in the test plan and mark Phase 2 complete so the rollout state re-derives correctly.

### Changes Required:

#### 1. Fill the SR/persistence cookbook

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the `§6.3` stub with the concrete submit → re-fetch → assert-state pattern (oracle-avoidance rule, drive-state-via-real-API convention, direct `reviews`-count check), and add the batch note (single-call atomic vs the intentionally non-atomic chunked CSV import). Add a `§6.6` Phase-2 note capturing anything surprising (idempotency gap documented, learned-count = `state==2` in three places).

**Contract**: `§6.3` and `§6.6` prose sections; reference the new files `tests/integration/persistence/sr-state.test.ts`, `flashcard-batch.test.ts`, `tests/integration/helpers/sr.ts`.

#### 2. Advance rollout status

**File**: `context/foundation/test-plan.md`

**Intent**: Set the Phase 2 row in `§3` Status to `complete` and record the change folder path; refresh the "Last updated" line.

**Contract**: `§3` table row #2 Status `not started` → `complete`, Change folder → `context/changes/testing-sr-state-persistence/`.

### Success Criteria:

#### Automated Verification:

- [ ] Both new suites still green in one run: `npm run test:integration`
- [ ] `test-plan.md` has no remaining "TBD — see §3 Phase 2" in §6.3

#### Manual Verification:

- [ ] `§6.3`/`§6.6` read clearly for a future contributor (self-contained pattern).
- [ ] Phase 2 status and change-folder link are correct in `§3`.

**Implementation Note**: Final phase — after verification, the change is ready for `/10x-impl-review` and then `/10x-archive`.

---

## Testing Strategy

### Integration Tests:

- SR: happy-path all-columns persistence, repeated-submit (documented), concurrent-submit (documented), due-selection after submit, learned-count consistency, reset_set_progress baseline.
- Batch: full-batch persist, validation atomicity, 1–50 cap boundary, silent duplicate skip, all-duplicate, within-batch duplicates, ownership 404.

### Manual Testing Steps:

1. Run `npx supabase start`, then `npm run test:integration`; confirm both new suites pass.
2. Test-has-teeth: break `learning_steps` persistence and the duplicate filter/cap in turn; confirm the matching tests go red; restore.
3. Unset Supabase env (or stop Supabase); confirm the suites skip rather than fail.

## Performance Considerations

Each SR scenario issues a few sequential HTTP-less handler calls against local Supabase; the learned-count scenario drives a handful of reviews. Well within the 30s `testTimeout`. The concurrent-submit test uses `Promise.all` on two calls only.

## Migration Notes

None — no schema or product-code changes.

## References

- Related research: `context/changes/testing-sr-state-persistence/research.md`
- Phase 1 harness: `context/archive/2026-07-06-testing-authorization-data-isolation/plan.md`, `tests/integration/helpers/{env,supabase,seed,context}.ts`
- Submit template: `tests/integration/authorization/reviews.idor.test.ts:42-98`
- Test plan: `context/foundation/test-plan.md` (§2 Risk Response Guidance #3/#4, §3 Phase 2, §6.2/§6.3)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: SR review-state persistence tests (Risk #3)

#### Automated

- [x] 1.1 Type checking passes: `npm run build` — f46d230
- [x] 1.2 Selective lint passes on new `.ts` files — f46d230
- [x] 1.3 SR suite passes: `npm run test:integration` — f46d230
- [x] 1.4 Suite auto-skips cleanly when Supabase env absent — f46d230

#### Manual

- [x] 1.5 Test-has-teeth check: break `learning_steps` persistence → test red → restore — f46d230
- [x] 1.6 Repeated-submit documented behavior matches running system — f46d230
- [x] 1.7 No orphaned rows after teardown — f46d230

### Phase 2: Flashcard batch-save tests (Risk #4)

#### Automated

- [x] 2.1 Type checking passes: `npm run build` — 32c6a20
- [x] 2.2 Selective lint passes on new test file — 32c6a20
- [x] 2.3 Batch suite passes: `npm run test:integration` — 32c6a20
- [x] 2.4 Suite auto-skips cleanly when Supabase env absent — 32c6a20

#### Manual

- [x] 2.5 Test-has-teeth check: break duplicate filter / cap → test red → restore — 32c6a20
- [x] 2.6 Duplicate-skip and all-duplicate assertions match actual responses — 32c6a20
- [x] 2.7 No orphaned rows after teardown — 32c6a20

### Phase 3: Cookbook & rollout wrap-up

#### Automated

- [x] 3.1 Both new suites still green in one run: `npm run test:integration` — a81941e
- [x] 3.2 No remaining "TBD — see §3 Phase 2" in §6.3 — a81941e

#### Manual

- [x] 3.3 §6.3/§6.6 read clearly for a future contributor — a81941e
- [x] 3.4 Phase 2 status and change-folder link correct in §3 — a81941e
