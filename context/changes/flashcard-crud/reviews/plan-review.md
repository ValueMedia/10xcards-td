<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Manual Flashcard CRUD Implementation Plan

- **Plan**: `context/changes/flashcard-crud/plan.md`
- **Mode**: Deep
- **Date**: 2026-06-13
- **Verdict**: REVISE
- **Findings**: 1 critical, 2 warnings, 0 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | WARNING |
| Architectural Fitness | FAIL    |
| Blind Spots           | FAIL    |
| Plan Completeness     | PASS    |

## Grounding

- Paths checked: `src/middleware.ts`, `src/lib/services/flashcards.ts`, `src/lib/services/sets.ts`, `src/pages/api/flashcards/index.ts`, `src/pages/api/flashcards/[id].ts`, `src/pages/sets/[id].astro`, `src/components/sets/*`, `src/pages/dashboard.astro`.
- Middleware already protects `/api/flashcards` (`src/middleware.ts:5`).
- Service and API routes for flashcards already exist and are isolated (no unexpected callers).
- `listSetsWithFlashcardCounts` already exists and handles both aggregate response shapes.
- Set detail page is still pure Astro; UI components do not exist yet.

## Findings

### F1 — Broken ownership validation in flashcard service

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Architectural Fitness / Blind Spots
- **Location**: `src/lib/services/flashcards.ts:29-63`, `src/pages/api/flashcards/index.ts:11-59`

- **Detail**:
  - `updateFlashcard` and `deleteFlashcard` use `.filter("set_id", "in", "(select id from sets where user_id = auth.uid())")`. This is not valid PostgREST `in` filter syntax; the subquery is treated as a literal string value, so the filter likely matches nothing and always returns "Flashcard not found" for the owner.
  - `createFlashcard` accepts any `setId` and does not verify that the target set belongs to the current user before inserting.
  - API route `POST /api/flashcards` does not verify `set_id` ownership and returns generic `500` for FK violations instead of `404`.

- **Fix ⭐ Recommended**: Add `userId: string` parameter to all flashcard service functions. In `createFlashcard`, verify set ownership first (query `sets` by `id` + `user_id`). In `updateFlashcard`/`deleteFlashcard`, join to `sets` and filter by `sets.user_id = userId`, or fetch the flashcard plus its set and verify ownership in code. Remove the broken `.filter("set_id", "in", ...)` calls.
  - Strength: Matches the explicit ownership pattern already used in `src/lib/services/sets.ts` and is testable/auditable.
  - Tradeoff: Requires updating both API routes to pass `user.id`.
  - Confidence: HIGH — the `sets.ts` pattern already works and is consistent with RLS.
  - Blind spot: None significant.

- **Decision**: PENDING

### F2 — Service function signatures inconsistent with sets.ts

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: `src/lib/services/flashcards.ts:1-65` vs `src/lib/services/sets.ts:1-124`

- **Detail**:
  - `sets.ts` functions accept `userId` explicitly and use `.eq("user_id", userId)`.
  - `flashcards.ts` functions omit `userId` and rely on `auth.uid()` inside a subquery filter. This creates two different ownership-validation styles in the same codebase.

- **Fix**: Align `flashcards.ts` signatures with `sets.ts`: accept `client, userId, ...` and validate ownership explicitly.
  - Strength: Single, consistent pattern across all service modules.
  - Tradeoff: Slightly more verbose function calls in API routes.
  - Confidence: HIGH — already the established convention in this codebase.
  - Blind spot: None significant.

- **Decision**: PENDING

### F3 — POST /api/flashcards returns 500 for invalid set_id

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: `src/pages/api/flashcards/index.ts:42-52`

- **Detail**:
  - The route does not validate that the provided `set_id` exists or belongs to the user before calling `createFlashcard`.
  - If the set does not exist, the database FK constraint produces an error that is surfaced as a generic `500`.
  - Combined with F1, this also opens a cross-user write path if RLS has any gap.

- **Fix**: After adding `userId` to `createFlashcard`, have the service first verify set ownership; return `"Set not found"` if missing/unauthorized so the API can return `404`.
  - Strength: Meaningful HTTP status codes and no information leak.
  - Tradeoff: One extra query before insert.
  - Confidence: HIGH — same approach as `createSet` ownership checks in `sets.ts`.
  - Blind spot: None significant.

- **Decision**: PENDING

## Triage Decisions

All findings currently pending; triage was not run.
