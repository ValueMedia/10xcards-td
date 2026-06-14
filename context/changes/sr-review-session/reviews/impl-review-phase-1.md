<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Spaced Repetition Review Session

- **Plan**: context/changes/sr-review-session/plan.md
- **Scope**: Phase 1 of 2
- **Date**: 2026-06-14
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical  4 warnings  3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | WARNING |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — `learning_steps` missing from flashcard UPDATE

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/reviews.ts:78–89
- **Detail**: Flashcard UPDATE omitted `learning_steps`. ts-fsrs computes a new value and returns it in `result.card.learning_steps`. Without persisting it, subsequent `f.next()` calls use a stale value, corrupting scheduling. Reviews INSERT correctly wrote `learning_steps` — inconsistency between flashcard row and review log.
- **Fix**: Add `learning_steps: result.card.learning_steps` to the `.update()` object.
- **Decision**: FIXED

### F2 — Non-atomic flashcard UPDATE + review INSERT

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Architecture
- **Location**: src/lib/services/reviews.ts:76–111
- **Detail**: Two separate PostgREST calls with no transaction. If INSERT fails after UPDATE succeeds, flashcard has advanced FSRS state but no review record exists.
- **Fix A ⭐ Recommended**: Swap order — INSERT review log first, then UPDATE flashcard.
- **Decision**: FIXED via Fix A (insert-first order)

### F3 — `submitCardReview` fetches flashcard without ownership join

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency / Safety & Quality
- **Location**: src/lib/services/reviews.ts:52–54
- **Detail**: Fetches by id alone without service-layer ownership join. Sibling services (updateFlashcard, deleteFlashcard) always join sets!inner(user_id).
- **Fix**: Add ownership join before update, matching flashcards.ts:85–90.
- **Decision**: SKIPPED — intentional: fetch-by-id-only is required for future shared-set review support; RLS provides sufficient isolation.

### F4 — Unbounded due-card fetch (no session cap)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/reviews.ts:15–21
- **Detail**: `.select("*").lte("due", now)` has no `.limit()`. Plan says sets are bounded to hundreds of cards but a safety ceiling is prudent.
- **Fix**: Add `.limit(500)` to the due-cards query.
- **Decision**: FIXED

### F5 — `last_review` fallback — prefer `result.log.review`

- **Severity**: ℹ️ OBSERVATION
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/reviews.ts:88
- **Detail**: `result.card.last_review ? ... : now.toISOString()` — authoritative timestamp is `result.log.review` (always set by ts-fsrs).
- **Fix**: Replace with `last_review: result.log.review.toISOString()`.
- **Decision**: FIXED

### F6 — `grade` param typed as `Rating`, should be `Grade`

- **Severity**: ℹ️ OBSERVATION
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/reviews.ts:46
- **Detail**: ts-fsrs `f.next()` expects `Grade = Exclude<Rating, Rating.Manual>`. Param typed as `Rating` includes Manual=0. Zod min(1) guards the boundary.
- **Fix**: Change `grade: Rating` → `grade: Grade` and import `Grade` from ts-fsrs.
- **Decision**: FIXED

### F7 — `due-cards.ts` maps all errors to 500

- **Severity**: ℹ️ OBSERVATION
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/sets/[id]/due-cards.ts:27–31
- **Detail**: All service errors return 500. Reference route uses `isNotFound(error) ? 404 : 500`. Service currently never returns notFound here, so harmless today.
- **Fix**: Add `const status = isNotFound(error) ? 404 : 500;` consistent with reference pattern.
- **Decision**: FIXED
