---
date: 2026-07-07T08:32:44+0200
researcher: value-media
git_commit: 9a7c9d5bb51aa756a6d027fc41359e395ea1447f
branch: main
repository: 10xcards
topic: "SR review-state persistence + flashcard batch save — test-plan Phase 2 (Risks #3, #4)"
tags: [research, codebase, sr-review, fsrs, flashcards, batch, persistence, integration-tests]
status: complete
last_updated: 2026-07-07
last_updated_by: value-media
---

# Research: SR review-state persistence + flashcard batch save (Test-Plan Phase 2)

**Date**: 2026-07-07T08:32:44+0200
**Researcher**: value-media
**Git Commit**: 9a7c9d5bb51aa756a6d027fc41359e395ea1447f
**Branch**: main
**Repository**: 10xcards

## Research Question

Phase 2 of `context/foundation/test-plan.md` covers Risk #3 (SR review-state
corruption / loss — learned count or "due" selection drifts, study history
lost) and Risk #4 (flashcard data loss on save/batch — partial batch, silent
drop). Map both persistence paths against the §2 Risk Response Guidance
unknowns — source of truth for "due", write ordering, idempotency of a
repeated submit, batch atomic-vs-partial semantics, per-flashcard validation —
and produce concrete, ready-to-plan test scenarios for the existing Phase 1
integration harness.

## Summary

**Risk #3 (SR state).** The source of truth for scheduling is the
`flashcards` table's FSRS columns, **not** the `reviews` table (which is an
immutable audit log). "Due" is decided purely by `flashcards.due <= now()`,
computed in TypeScript (`getDueCardsForSession`), and "learned" = `state == 2`.
The submit write itself is **atomic** (one SECURITY INVOKER RPC
`submit_card_review` does `INSERT reviews` + `UPDATE flashcards` in one
transaction). The real exposure is **idempotency**: there is **no server-side
guard** against a repeated/concurrent submit — the read-compute happens in TS
*outside* the RPC transaction, and there is no unique constraint on `reviews`.
A double submit advances the FSRS schedule twice and inserts two history rows.
This exactly matches the test-plan's named unknown ("idempotency of a repeated
submit") and is the highest-value scenario for Phase 2. There is also a concrete
past precedent for silent state corruption: the `learning_steps` column was once
dropped from the flashcard UPDATE, corrupting future scheduling.

**Risk #4 (batch).** A single `POST /api/sets/[id]/flashcards/batch` call is
**atomic** (one multi-row `insert([...])` — whole statement rolls back on any
error, no partial DB rows). Structural validation is **whole-batch, pre-write**
(zod, reject-all on any invalid card, cap 1–50). BUT two intentional
partial/silent behaviors exist: (1) **duplicate fronts are silently skipped**
and returned as `201` with `count < submitted` + `skippedCount` — a
status-only caller loses cards silently (an all-duplicate batch returns `201
count:0`); (2) **CSV import > 50 cards is chunked and NOT atomic across
chunks** — a mid-loop failure leaves earlier chunks committed (resumable via
`committedCount`, but abandonment = permanent partial import).

**Harness.** The Phase 1 integration harness is fully reusable and imports the
three relevant handlers cleanly under the existing Node aliases — **no new
stub files required**. The one real gap is a **"seed a due / reviewed card"
helper** (`seedSet` only makes fresh, default-state cards); Phase 2 must either
drive state through `POST /api/reviews` first or add a small helper that writes
FSRS columns directly via the owner client. Both risks are testable today with
the existing seams; watch the **oracle problem** (don't assert values recomputed
by the same `fsrs()` call) and the **silent-skip trap** (`describe.skipIf`
reports green with 0 tests if Supabase is down — deferred to Phase 5).

## Detailed Findings

### Risk #3 — SR review-state persistence

**Write path (client → API → service → RPC).**
- Client: `src/components/review/ReviewSession.tsx:116` — `POST /api/reviews` with `{ flashcardId, grade }`; only guard is the client `submitting` flag (`ReviewSession.tsx:112-113`).
- Endpoint: `src/pages/api/reviews/index.ts:14` (`POST`), zod-validates `{ flashcardId: uuid, grade: Rating.Again|Hard|Good|Easy }` (`reviews/index.ts:9-12`), calls `submitCardReview` (`reviews/index.ts:45`), returns `{ success: true }` (200), 404 not-found, 500 else.
- Service: `src/lib/services/reviews.ts:50` `submitCardReview` — **reads** the card in TS with ownership join `select("*, sets!inner(user_id)")` (`reviews.ts:58-63`), **computes** next FSRS state via `ts-fsrs` `f.next(card, now, grade)` (`reviews.ts:70-85`), **writes** via one RPC (`reviews.ts:87-113`).
- RPC: `supabase/migrations/20260614120000_submit_card_review_rpc.sql:5` — `plpgsql`, **SECURITY INVOKER** (RLS applies). One transaction: `INSERT INTO public.reviews` (lines 35-61) then `UPDATE public.flashcards SET due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, learning_steps, last_review WHERE id = p_flashcard_id` (lines 63-75); `if not found then raise exception 'Flashcard not found or access denied'` (lines 77-79).

**Source of truth for "due"** (computed in TS, not a view/RPC):
- `getDueCardsForSession` (`src/lib/services/reviews.ts:7`): `.eq("set_id", setId).lte("due", now).order("due", asc).limit(100)` (`reviews.ts:20-26`). The single driving column is **`flashcards.due` (timestamptz)**. Ownership gate first (`reviews.ts:14-16`). Empty → earliest-due hint (`reviews.ts:36-42`).
- FSRS columns live on `public.flashcards` (`supabase/migrations/20260610000000_initial_schema.sql:15-32`): `due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state (smallint default 0), last_review`.

**"Learned" count = `flashcards.state == 2`** (ts-fsrs `State.Review`; `src/types.ts:4-6`), computed independently in three places that must stay consistent:
- `src/lib/services/stats.ts:135` — `.eq("state", 2)` for dashboard `learned_count`.
- `supabase/migrations/20260614200000_give_set_to_study.sql:182` — `count(...) filter (where f.state = 2)`.
- Client: `src/components/sets/SetDetailPage.tsx:160`, `FlashcardCard.tsx:30` — `state === State.Review`.

**Idempotency & ordering (the core exposure).**
- **No server-side idempotency guard.** `public.reviews` has no unique constraint / dedup key (`initial_schema.sql:34-49`, PK on `id` only); no upsert. The only double-submit guard is the client `submitting` flag.
- The read-compute is **outside** the RPC transaction (`reviews.ts:58` read vs `reviews.ts:87` write); the `UPDATE` has no optimistic-lock / version check (`WHERE id` only).
- **Sequential double submit** (retry, slipped double-click, multi-tab): second call re-reads the *already-advanced* card, re-applies `f.next()` → `reps`/`lapses`/`due`/`state` advance again **+ a second `reviews` row** → count drift + history double-count.
- **Concurrent double submit**: flashcard UPDATE is last-writer-wins (identical values, schedule not double-advanced) but **both INSERTs land** → history inflated.

**Re-fetch entry points for tests.**
- Due selection: `GET /api/sets/[id]/due-cards` → `src/pages/api/sets/[id]/due-cards.ts:7` → `getDueCardsForSession`; returns `{ cards, nextDue }`.
- Learned/total (set detail): `getSetWithFlashcards` (`src/lib/services/sets.ts:100`, cards at `sets.ts:116`) — **note side-effect write** to `last_opened_at` in the same `Promise.all` (`sets.ts:117`).
- Dashboard counts: `getLearningStats` (`src/lib/services/stats.ts:84`, counts at `stats.ts:133-159`).
- Clean baseline: `POST /api/sets/[id]/reset-progress` → `resetSetProgress` (`reviews.ts:120`) → RPC `reset_set_progress` (`supabase/migrations/20260620120000_reset_set_progress_rpc.sql:6`, **SECURITY DEFINER**, guards ownership itself, atomically deletes `reviews` + resets FSRS columns, keeps `session_log`).

**DB-side logic / constraints / RLS / GRANTs.**
- Trigger `flashcards_handle_updated_at` (BEFORE UPDATE) sets `updated_at` (`initial_schema.sql:73-76`). **No trigger computes SR state — all FSRS math is TS-side.** No generated columns, no CHECK on SR fields.
- `reviews` columns are `not null` (grade, state, due, stability, difficulty, scheduled_days, review) → a malformed payload is rejected, not silently corrupted.
- RLS: `reviews_insert_own` requires `auth.uid()=user_id` AND set-ownership of the flashcard (`initial_schema.sql:174-187`); `flashcards_update_own` requires set-ownership (`initial_schema.sql:133-146`); `reviews` has **no UPDATE/DELETE policy** (client-immutable; deletion only via `reset_set_progress`). GRANT `select, insert on reviews to authenticated` (`20260613105815_grant_table_permissions.sql:13`); no anon access (`20260707120000_revoke_anon_table_select.sql:14-15`).

### Risk #4 — Flashcard batch persistence

**Entry points.**
- **`POST /api/sets/[id]/flashcards/batch`** — the only real bulk-insert endpoint. Handler `src/pages/api/sets/[id]/flashcards/batch.ts:14`. Body `{ flashcards: [{front,back}] }`, 1–50 (`batch.ts:7-12`), where `flashcardContentSchema` = `front/back` non-empty, max 1000 (`src/lib/services/flashcards.ts:5-8`). Calls `createFlashcardsBulk` (`batch.ts:53` → `flashcards.ts:82`). Returns 201 `{ data, count }` (+ `skippedCount`/`skippedFronts`), 404 not-owner, 400 validation.
  - Client callers: AI-save sends **all** proposals in one unchunked request (`src/components/ai/GenerateFlashcardsPage.tsx:175`); CSV import sends in **chunks of 50** in a loop (`src/components/sets/ImportCsvDialog.tsx:111-161`).
- `POST /api/flashcards` — single card (`src/pages/api/flashcards/index.ts:13`), not batch.
- `POST /api/sets/[id]/generate` — **does NOT persist** (`generate.ts:51`, returns proposals only, `generate.ts:170`).
- `claim_shared_set` RPC — server-side bulk clone (`give_set_to_study.sql:135-138`), atomic (SECURITY DEFINER, `raise exception` rolls back), invoked from `src/pages/api/share/claim.ts`.

**Atomic vs partial.**
- Batch endpoint: **ONE `insert([...]).select()`** (`flashcards.ts:146-149`) → atomic per Postgres statement; any constraint/RLS failure rolls back the whole statement, service returns `data:null` + `dbError` (`flashcards.ts:151-158`). No partial DB rows.
- **CSV import across chunks: NOT atomic** (`ImportCsvDialog.tsx:116-161`) — a failed/dropped chunk leaves chunks `0..N-1` committed; client slices off committed and asks to retry (`:127-131`), but abandonment = permanent partial import.
- `claim_shared_set`: atomic (implicit transaction).

**Validation semantics.**
- **Structural = whole-batch, pre-write** (`batch.ts:42` `safeParse`): any invalid `front/back` length/empty, empty array, or > 50 → **400, writes nothing** (`batch.ts:43-51`). Redundant server re-check of `>50`/`==0` in `createFlashcardsBulk` (`flashcards.ts:115,119-126`).
- **Duplicates = per-row, SILENT SKIP**: `checkDuplicateFronts` (`flashcards.ts:26-48`) loads existing fronts; `uniqueContents` filter drops rows whose normalized front already exists → `skippedFronts` (`flashcards.ts:133-140`). Dedup is only **vs existing DB rows**, not within the batch, and there is **no `UNIQUE(set_id, front)` constraint** → two identical new fronts in one batch both persist.
- CSV parser silent drops: empty/`#`-comment lines dropped uncounted (`src/lib/services/csv-parser.ts:23`); malformed/empty/>1000-char lines → `skippedCount` (`:57-60`); separator auto-detect (`:29-44`) can mis-split.
- AI save silently filters invalid proposals client-side before sending (`GenerateFlashcardsPage.tsx:160-163`), uncounted.

**DB constraints** (`initial_schema.sql`): `front/back text NOT NULL` (`:18-19`), `set_id NOT NULL references sets on delete cascade` (`:17`). **No length CHECK, no UNIQUE** — 1000-char limit + dedup are app-only. RLS `flashcards_insert_own` `with check (set_id in (select id from sets where user_id = auth.uid()))` (`:123-131`). GRANT insert to `authenticated` only. No CHECK exists that could silently reject *part* of a batch (a violation kills the whole single-statement insert).

**Response contract** (`batch.ts:68-77`): `{ data, count: data?.length ?? 0 }` + `skippedCount`/`skippedFronts` when > 0. `count` = rows actually inserted, NOT submitted. **All-duplicate batch → 201 `count:0`** (`flashcards.ts:142-143`). A caller checking only `res.ok` loses cards silently.

**Ownership: double-guarded.** `createFlashcardsBulk` checks `.eq("id", setId).eq("user_id", userId)` → 404 if not owned (`flashcards.ts:97`), plus RLS `flashcards_insert_own`. `generate` checks ownership too (`generate.ts:69`).

### Integration test harness (Phase 1 — reusable)

**Vitest `integration` project** (`vitest.config.ts:51-77`): `environment: node`, `include: tests/integration/**/*.test.ts`, `setupFiles: tests/integration/helpers/env.ts`, timeouts 30s. Aliases (`vitest.config.ts:58-66`) on top of global `@ → ./src`: `cloudflare:workers` → `src/test/cloudflare-workers.stub.ts` (empty `env`), `astro:env/server` → `src/test/astro-env-server.stub.ts` (`SUPABASE_URL/KEY/SERVICE_ROLE_KEY` from `process.env` + `getSecret`), `astro:middleware` → `src/test/astro-middleware.stub.ts` (identity `defineMiddleware`). Run: `npm run test:integration` = `vitest run --project integration` (excluded from default `npm test`).

**Helpers** (`tests/integration/helpers/`):
- `env.ts`: `loadDevVars()` parses `.dev.vars` into `process.env` (CI env wins); exports `hasSupabaseEnv` (`env.ts:54`, 2s reachability probe on `/auth/v1/health`). Every suite is `describe.skipIf(!hasSupabaseEnv)`.
- `supabase.ts`: `serviceClient()` (service-role — **no app-table GRANT**, so scaffolding only, cannot SELECT app tables), `createTestUser()` (Admin API, confirmed), `userClient(user)` (RLS-scoped bearer client — the one passed to handlers), `anonClient()`, `deleteTestUser(id)` (FK cascade cleans dependents).
- `seed.ts`: `seedSet(client, userId, { name?, cards? }) → { setId, flashcardIds }` (`seed.ts:16-41`) — inserts one set + flashcards **with DB-default SR state** (fresh `due`, `reps=0`, `state=New`); cannot seed arbitrary due/FSRS state.
- `context.ts`: `makeApiContext({ user, supabase, params?, body?, request?, locale? })` (`context.ts:19-34`) → synthetic `APIContext` with `locals.{user,supabase,locale}`; `body` present ⇒ POST + JSON, else GET. Handlers invoked directly, assert on `Response`.

**Reference tests** (uniform structure): `describe.skipIf` + `users: TestUser[]` + `afterAll` delete + `beforeAll` create/seed. Closest template for Phase 2(a) is `tests/integration/authorization/reviews.idor.test.ts:42-98` (drives a real `POST /api/reviews`, then reads back via owner client: `ownerClient.from("flashcards").select("reps").eq("id", cardId)`). Cross-checks use the **owner's own RLS client**, never `serviceClient`.

**Phase 2 handlers import cleanly** — `POST /api/reviews`, `POST /api/sets/[id]/flashcards/batch`, `GET /api/sets/[id]/due-cards` do NOT pull in `cloudflare:workers`/`astro:env` (they receive the client via `locals`). **No new stubs required.** `Flashcard` type exposes all FSRS columns (`src/types.ts:19-36`); `reviews` table readable via owner client; `Rating` importable from `@/types`.

**Gaps Phase 2 must add:**
1. **Seed-a-due/reviewed-card helper** — none exists. Either drive through `POST /api/reviews` first, or add `setCardDue(client, cardId, iso)` / `seedReviewedCard(...)` writing FSRS columns via the owner client. (Load-bearing for "due-selection after submit" scenarios.)
2. Batch-body builder — trivial inline `{ flashcards: [...] }` or a tiny `makeBatchBody(n)` (not load-bearing).
3. Shared state-assertion helpers (`readCardState`, `countReviews`) — convenience, not a blocker (Phase 1 inlines `ownerCardReps`/`ownerReviewCount`/`ownerCardCount`).

## Code References

- `src/pages/api/reviews/index.ts:14` — POST /api/reviews (submit) handler.
- `src/lib/services/reviews.ts:7` — `getDueCardsForSession` (due = `flashcards.due <= now()`).
- `src/lib/services/reviews.ts:50` — `submitCardReview` (TS read+compute outside the RPC txn).
- `src/lib/services/reviews.ts:120` — `resetSetProgress` (clean baseline for tests).
- `supabase/migrations/20260614120000_submit_card_review_rpc.sql:5` — atomic INSERT reviews + UPDATE flashcards (SECURITY INVOKER).
- `supabase/migrations/20260620120000_reset_set_progress_rpc.sql:6` — reset FSRS + delete reviews (SECURITY DEFINER).
- `src/pages/api/sets/[id]/due-cards.ts:7` — re-fetch entry point for due selection.
- `src/lib/services/stats.ts:135` — learned count `.eq("state", 2)`.
- `src/pages/api/sets/[id]/flashcards/batch.ts:14` — batch save handler (1–50, 201 `{data,count}`).
- `src/lib/services/flashcards.ts:82` — `createFlashcardsBulk` (single atomic insert; silent dup-skip at `:133-140`, all-dup 201 count:0 at `:142-143`).
- `src/components/sets/ImportCsvDialog.tsx:111-161` — CSV chunked (50) non-atomic import with `committedCount` resume.
- `supabase/migrations/20260610000000_initial_schema.sql:15-49` — flashcards FSRS columns + reviews table (no UNIQUE, no CHECK).
- `tests/integration/helpers/{env,supabase,seed,context}.ts` — reusable harness.
- `tests/integration/authorization/reviews.idor.test.ts:42-98` — submit-then-read-back template.
- `vitest.config.ts:51-77` — `integration` project + aliases.

## Architecture Insights

- **`flashcards` is the source of truth for scheduling; `reviews` is an immutable audit log; `session_log` feeds the activity chart.** All FSRS math is server-side TypeScript (`ts-fsrs`), persisted as pre-computed column values — the DB does no SR computation. This means correctness tests must guard the *persisted columns*, and must avoid recomputing the oracle with the same `fsrs()` call.
- **Atomicity is at the single-statement / single-RPC level, deliberately.** Within one submit RPC and one batch insert, writes are all-or-nothing. The genuine non-atomic surfaces are cross-transaction: the TS read-before-RPC in submit (idempotency), and the client-side chunk loop in CSV import.
- **"Silent partial success" is a UI/contract risk, not a DB risk.** The DB rejects wholesale; the losses happen where the app *chooses* to skip (duplicate fronts) or *chunks* (import), and are only visible if the caller inspects `count`/`skippedCount` rather than HTTP status.
- **Cross-user denial (404) is Phase 1 territory** — Phase 2 should assume authorization is covered and focus on correctness/persistence, not re-litigate IDOR. (Note the F3 caveat: RLS alone blocks cross-user writes, so IDOR tests pass even with the service check removed.)

## Historical Context (from prior changes)

- `context/archive/2026-06-14-sr-review-session/` — built the SR feature. `reviews/impl-review-phase-1.md` **F1** (HIGH): `learning_steps` was once dropped from the flashcard UPDATE → stale value corrupts future `f.next()` scheduling — a direct precedent for asserting **all** FSRS columns on re-fetch. **F2 → reviews/impl-review.md F3**: non-atomic two-call write escalated to the atomic RPC (`20260614120000_...sql`). **F5**: `last_review` must come from `result.log.review.toISOString()`, not a card fallback. `plan.md:26-32,195`: **no server-side idempotency / no session persistence** — the only double-submit guard is the UI `submitting` disable; the test-plan itself names "idempotency of a repeated submit" as an unresolved grounding item (`test-plan.md:69`).
- `context/archive/2026-06-20-learn-stats-for-set/plan.md:14` — codifies "learning progress lives entirely in the flashcards FSRS columns; reviews is an immutable audit log." `reset_set_progress` resets FSRS + deletes reviews, **keeps `session_log`**.
- `context/archive/2026-06-13-ai-flashcard-generation/` — batch endpoint + `createFlashcardsBulk`; impl-review added `.max(50)` cap (was unbounded).
- `context/archive/2026-06-14-csv-import/plan.md:139-140` — import chunks by 50, **partial-save-with-resumable-retry** by design; `reviews/impl-review.md` **F1**: unguarded `await res.json()` on the success path once left the dialog stuck in "importing" (silent-stuck / partial-save precedent).
- `context/archive/2026-06-21-prevent-duplicate-flashcards/` — `checkDuplicateFronts` loads all fronts unpaginated (accepted for sets < 500) — relevant if Phase 2 seeds large sets.
- `context/archive/2026-07-06-testing-authorization-data-isolation/` (Phase 1) — established the harness Phase 2 reuses: real local Supabase (not workerd), tests outside `src/`, `describe.skipIf(!hasSupabaseEnv)`, direct-handler invocation, owner-client cross-checks, `deleteTestUser` teardown, **never `db reset`**. Conventions: cross-user denial = **404** not 403; "test-has-teeth" check (temporarily weaken a guard to confirm red); any API contract change updates `src/lib/openapi/openapi-spec.ts`. **Deferred F2** (`follow-ups/review-fixes.md`): `describe.skipIf` reports green with 0 tests if Supabase is down — deferred to Phase 5. `test-plan.md §6.3` is stubbed for Phase 2 to fill in.

## Lessons priors applied (`context/foundation/lessons.md`)

- Service must check ownership OR `share_token`, never a bare `set_id` (`lessons.md:45`) — already enforced on the reviewed paths; Phase 2 treats it as covered.
- New RLS tables need explicit GRANTs (`lessons.md:52`) — relevant only if Phase 2 adds tables (it should not).
- Verify TS services against local Supabase via `npx tsx` + user JWT (`lessons.md:26`) — an alternative to the handler-invocation harness if a service needs isolated probing.
- Never `supabase db reset` (`lessons.md:19`) — teardown is `deleteTestUser` + FK cascade only.
- `npm run lint` crashes on `.astro`; use `npm run build` for Astro type-check and selective ESLint on `.ts` (`lessons.md:59`).

## Ready-to-plan test scenarios

### Risk #3 — SR state (submit → re-fetch → assert)

1. **Happy-path persistence (no oracle).** Seed a set (fresh card), `POST /api/reviews` `{cardId, Good}` → 200. Re-fetch the card via a **fresh owner client** and assert the persisted columns changed coherently — `reps == 1`, `last_review` set, `due > now()`, `state` advanced, and **`learning_steps` persisted** (the F1 regression). Do NOT assert exact FSRS numbers recomputed by `fsrs()` — assert *relations/invariants* (reps incremented, due moved forward, last_review == the review timestamp).
2. **Repeated-submit idempotency (highest value, currently unguarded).** Submit the same `{cardId, grade}` twice sequentially. Assert exactly **one** `reviews` row for that card and a **single** FSRS advance (`reps == 1`, not 2). This will likely **fail today** — the plan must decide whether to (a) encode current behavior as a documented gap or (b) treat it as a real defect to guard against. Flag for a plan-time decision.
3. **Concurrent-submit history integrity.** Fire two parallel `POST /api/reviews` for the same card; assert `reviews` count == 1 (or the intended contract). Probes history double-count under race.
4. **Due-selection after submit.** Seed a due card, submit `Good`, then `GET /api/sets/[id]/due-cards` and assert the card **no longer appears** (its `due` moved to the future). Then submit `Again` on another due card and assert the short interval behavior you intend (may resurface). This tests the actual "due" source of truth end-to-end.
5. **Learned-count consistency.** Drive a card to `state == 2`, assert it counts as learned in the set-detail re-fetch and dashboard stats; grade `Again` to lapse it and assert the count behaves as intended across `stats.ts` and the client counter (guards the three independent `state==2` counters diverging).
6. **Reset baseline (optional).** `POST /api/sets/[id]/reset-progress` → assert FSRS columns back to defaults, `reviews` rows deleted, and re-fetch shows all cards due again. Good as a fixture primitive and a second SR write path.

*New helper needed:* seed a card in a specific due/FSRS state (`setCardDue` / `seedReviewedCard`) — required by scenarios 4 & 5 unless driven through `POST /api/reviews`.

### Risk #4 — Flashcard batch (atomic vs partial, validation)

7. **Full-batch persistence (happy path).** `POST .../flashcards/batch` with N distinct cards → 201, `count == N`; cross-check `ownerCardCount == N`.
8. **Whole-batch atomicity on invalid element.** Submit a batch where one card has empty/over-1000-char `front` → **400, zero rows written** (cross-check count unchanged). Asserts reject-all validation.
9. **Boundary cap.** 50 cards → 201; 51 cards → 400. Asserts the `.max(50)` guard (past unbounded-insert defect).
10. **Silent duplicate skip (the Risk #4 trap).** Pre-seed a card with front "X"; submit a batch containing "X" + new cards → 201 with `count < submitted` and `skippedCount`/`skippedFronts` set; cross-check only the new cards persisted. Asserts status-only callers would lose "X" silently.
11. **All-duplicate batch → 201 count:0.** Submit only already-existing fronts → 201, `count == 0`, `skippedCount == submitted`, no new rows. Locks the "success with zero persisted" contract.
12. **Within-batch duplicate fronts both persist.** Submit two identical new fronts in one batch → both persist (no `UNIQUE`), `count == 2`. Documents the known inconsistency (data-integrity, not loss).
13. **Ownership.** Non-owner batch to another user's set → 404, zero rows (RLS + service both guard).

*Out of scope for the single-call unit but worth a note in §6.3:* CSV chunked import (> 50) is intentionally non-atomic across chunks with `committedCount` resume — a component-level concern, not the batch-endpoint contract; flag it in the cookbook so future readers don't mistake the endpoint's atomicity for whole-file atomicity.

## Open Questions

- **Idempotency contract decision (blocks scenario 2/3 wording).** Is unguarded repeated-submit an accepted limitation (encode current behavior + document) or a defect to fix (add a unique/version guard, then guard with a red→green test)? This is a plan-time product decision, not a research finding.
- **Should Phase 2 cover `reset_set_progress` and `claim_shared_set`** as additional SR/persistence write paths, or defer them? Both are atomic RPCs with their own ownership guards; low incremental cost but out of the strict Risk #3/#4 wording.
- **Silent-skip trap** (deferred Phase-1 F2): Phase 2 suites inherit the "green with 0 tests when Supabase down" risk. Confirm this stays deferred to Phase 5 (CI asserts `hasSupabaseEnv === true`) rather than being addressed here.

## Related Research

- `context/archive/2026-07-06-testing-authorization-data-isolation/research.md` — Phase 1 harness research (authorization).
- `context/archive/2026-06-14-sr-review-session/plan.md` + `reviews/impl-review*.md` — SR feature design + the atomicity/`learning_steps` fixes.
- `context/archive/2026-06-14-csv-import/plan.md` + `reviews/impl-review.md` — chunked import partial-save semantics.
