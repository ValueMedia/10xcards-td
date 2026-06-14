# Frame Brief: Spaced repetition review session

> Framing step before /10x-plan. This document captures what is *actually*
> at issue, separated from what was initially assumed.

## Reported Observation

Roadmap item S-05 (`sr-review-session`) is the next slice to implement — all
prerequisites (F-01, S-01, S-02) are done. The feature requires a spaced
repetition review session end-to-end: fetch due cards, flip to reveal answer,
rate, update scheduling state, show summary.

## Initial Framing (preserved)

- **User's stated cause or approach**: ts-fsrs is the right library (decided in
  shape-notes); schema was pre-designed with ts-fsrs columns in mind — should be
  compatible.
- **User's proposed direction**: implement S-05 as specified in the roadmap.
- **Pre-dispatch narrowing**: primary concern is schema/ts-fsrs compatibility
  before planning begins; rating scale = 4 buttons (Again/Hard/Good/Easy);
  session ends when all due cards are shown → summary screen.

## Dimension Map

The compatibility question could break at any of these dimensions:

1. **ts-fsrs `Card` type vs `flashcards` table** — missing or mistyped columns
   would require a migration before implementation could start.  ← *initial framing*
2. **ts-fsrs `ReviewLog` type vs `reviews` table** — missing columns would mean
   the log insert after each rating would fail or lose data.
3. **`Rating` enum values** — wrong numeric mapping between UI buttons and stored
   `grade` values would corrupt review history.
4. **Due-card query path** — `reviews` has no `set_id`; "cards due for a set"
   could require a non-obvious join or extra index.

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| Card fields missing from `flashcards` | `node_modules/ts-fsrs/dist/index.d.ts` Card interface has 10 fields; all 10 are present in `flashcards` with compatible types (number↔integer, Date↔timestamptz are expected JS/SQL boundaries). | NONE — no mismatch |
| ReviewLog fields missing from `reviews` | ReviewLog has 10 fields; all 10 are present in `reviews`. Extra columns (`id`, `flashcard_id`, `user_id`, `created_at`) are app-specific additions, not ts-fsrs fields. | NONE — no mismatch |
| Rating enum misaligned | Rating enum: `Again=1, Hard=2, Good=3, Easy=4`. `grade` column stores `smallint`. 4-button UI (Nie wiem/Trudne/Wiem/Łatwe) maps cleanly to 1/2/3/4. | NONE — perfect fit |
| Due-card query requires schema change | `flashcards.due` field exists; query is `WHERE set_id = $id AND due <= now()`. No join through `reviews` needed. `state=0` (New) cards start with `due = now()` so they appear in the queue naturally. | NONE — no issue |

## Narrowing Signals

- User confirmed: 4-button rating scale → maps directly to `Rating.Again` through `Rating.Easy` (1–4).
- User confirmed: session ends after all due cards → no infinite queue complexity.
- `elapsed_days` and `last_elapsed_days` are `@deprecated` in ts-fsrs v5.4.1 and will be removed in v6. Schema has these columns; ts-fsrs v5 still populates them. Safe for now; plan a migration cleanup when upgrading to v6.

## Cross-System Convention

The RLS policy pattern in this project (per-operation, per-role) already covers
the reviews table: `reviews_select_own` and `reviews_insert_own` are in
`20260610000000_initial_schema.sql`. No new policies needed for the review
session API.

The `state` field on `flashcards` (0=New, 2=Review) is how S-06 (learning-stats)
will count "learned" cards — this schema decision is load-bearing for the next
slice downstream.

## Reframed (or Confirmed) Problem Statement

> **The initial framing was correct** — the existing schema is fully compatible
> with ts-fsrs v5.4.1. No migrations are needed before implementation.

The schema was designed with ts-fsrs in mind (F-01 explicitly listed ts-fsrs
compatibility as a requirement) and the investigation confirms a complete match.
The only future concern is the deprecated fields (`elapsed_days`,
`last_elapsed_days`) which will need a migration when upgrading to ts-fsrs v6 —
this is not a blocker today.

## Confidence

- **HIGH** — strong evidence from direct type inspection of installed library;
  all four hypotheses disproven; matches F-01's documented design intent.

## What Changes for /10x-plan

The original scope holds: implement the SR review session feature using ts-fsrs
v5.4.1. No pre-implementation migration. Key implementation contracts the plan
should cover:

1. **API endpoint**: fetch due cards for a set (`due <= now()`, `set_id = $id`)
2. **Rating flow**: `fsrs().next(card, now, rating)` → update `flashcards` row
   + insert `reviews` row (adding `flashcard_id`, `user_id` that ReviewLog omits)
3. **4-button UI**: Again=1 / Hard=2 / Good=3 / Easy=4
4. **Session completion**: all due cards shown once → summary screen (count reviewed,
   count `Again`)
5. **Deprecated fields note**: include `elapsed_days` and `last_elapsed_days` in
   insert/update for now; remove when upgrading ts-fsrs to v6.

## References

- Schema: `supabase/migrations/20260610000000_initial_schema.sql`
- Library types: `node_modules/ts-fsrs/dist/index.d.ts`
- Roadmap S-05: `context/foundation/roadmap.md` (lines 140–151)
- PRD FR-010: `context/foundation/prd.md` (line 121)
- Lessons (RLS convention): `context/foundation/lessons.md`
