# Spaced Repetition Review Session Implementation Plan

## Overview

Implement the S-05 roadmap slice: a dedicated review session page where users can practice flashcards using the ts-fsrs spaced repetition algorithm. The session fetches all cards due for a set, shows each card one at a time (flip to reveal answer), collects a 4-button rating (Again/Hard/Good/Easy), updates the card's SR state, and ends with a summary screen.

## Current State Analysis

All prerequisites are complete (F-01, S-01, S-02). The schema is confirmed fully compatible with ts-fsrs v5.4.1 (frame brief, HIGH confidence): `flashcards` maps to `Card`, `reviews` maps to `ReviewLog` with app-specific additions (`flashcard_id`, `user_id`). RLS policies for `reviews` (`reviews_insert_own`, `reviews_select_own`) are already in place. `src/types.ts` exports `State` and `Rating` from ts-fsrs; no `fsrs()` calls exist yet — this is the first real integration.

The existing set detail page lives at `src/pages/sets/[id].astro`. Adding `src/pages/sets/[id]/review.astro` requires renaming the existing file to `src/pages/sets/[id]/index.astro` — Astro's router cannot have both a file and a folder with the same dynamic segment name.

## Desired End State

A user who opens a set can click "Rozpocznij sesję" to navigate to `/sets/[id]/review`. The page fetches cards where `due <= now()`, shows each card front-first, lets the user flip to reveal the answer and rate it (Nie wiem / Trudne / Wiem / Łatwe). After rating, the card's SR state is saved (flashcard updated + review log inserted) and the next card appears. When all cards are done, a summary screen shows how many were reviewed and the grade distribution. If no cards are due, the page shows the next scheduled date instead. Every card appears exactly once per session.

### Key Discoveries

- `src/pages/sets/[id].astro` must be renamed to `src/pages/sets/[id]/index.astro` before adding the review route — Astro routing conflict
- ts-fsrs `Card` type expects `Date` objects; DB stores `timestamptz` strings — conversion required at the service boundary
- `reviews.grade` column name differs from `ReviewLog.rating` field — explicit mapping needed on insert
- `elapsed_days` and `last_elapsed_days` are deprecated in ts-fsrs v5 (removed in v6) but must be included in both flashcard update and review insert — ts-fsrs still populates them
- `state=0` (New) cards start with `due = now()` per DB default — they appear in the first session naturally without any special handling
- `src/lib/services/flashcards.ts` `ServiceError` pattern (`kind` + `message`) is the project convention for service-layer errors

## What We're NOT Doing

- No "Again cards re-queue": each card appears exactly once per session; ts-fsrs schedules the next review automatically
- No session persistence: if the user closes the browser mid-session, completed reviews are already saved; the session restarts from scratch on next visit
- No timer or time-tracking per session (that belongs to S-06 learning stats)
- No study mode for cards not yet due ("force review all")
- No ts-fsrs upgrade to v6 — deprecated fields stay until an explicit migration change

## Implementation Approach

Two-phase delivery: Phase 1 builds the backend (service + two API endpoints) that can be tested directly; Phase 2 adds the React component, Astro page, and navigation button. The ts-fsrs calculation happens server-side — the client sends only `{flashcardId, grade}` and receives confirmation; all state mutation (flashcard update + review insert) is atomic within the service call.

## Critical Implementation Details

**ts-fsrs Date conversion**: The DB returns `timestamptz` as ISO strings; `fsrs().next()` expects `Date` objects. Convert on the way in: `due: new Date(flashcard.due)`, `last_review: flashcard.last_review ? new Date(flashcard.last_review) : undefined`. Convert back to ISO strings for Supabase upsert: `result.card.due.toISOString()`.

**Astro routing rename**: Before adding `src/pages/sets/[id]/review.astro`, rename `src/pages/sets/[id].astro` → `src/pages/sets/[id]/index.astro`. The file content is unchanged; only the path moves. Verify that `/sets/[id]` still resolves correctly after the rename.

---

## Phase 1: Backend — Service + API Endpoints

### Overview

Create the reviews service and two API endpoints. The service encapsulates ts-fsrs integration and all DB mutations; the endpoints are thin wrappers that handle auth, validation, and HTTP plumbing.

### Changes Required

#### 1. Reviews service

**File**: `src/lib/services/reviews.ts`

**Intent**: New service module providing two operations — fetching cards due for a session and submitting a single card review. Centralises ts-fsrs integration and all DB access for the review session.

**Contract**:
- `getDueCardsForSession(supabase, setId): Promise<ServiceResult<{cards: Flashcard[], nextDue: string | null}>>` — queries `flashcards WHERE set_id = $setId AND due <= now()` (RLS enforces user isolation). If the result is empty, also queries `MIN(due)` from the same set to populate `nextDue`.
- `submitCardReview(supabase, userId, flashcardId, grade: Rating): Promise<ServiceResult<void>>` — loads the flashcard by id, calls `fsrs().next(card, new Date(), grade)`, updates all 10 `Card` fields on `flashcards` (including deprecated `elapsed_days`), inserts a `reviews` row mapping `result.log.rating → grade`, `result.log.*` → corresponding columns, plus `flashcard_id` and `user_id`.
- Follow `ServiceError` discriminated union pattern from `src/lib/services/flashcards.ts`.

#### 2. Due-cards API endpoint

**File**: `src/pages/api/sets/[id]/due-cards.ts`

**Intent**: GET endpoint that returns the session payload for a set — the list of due flashcards plus the next scheduled date (for empty state). Called once on ReviewSession mount.

**Contract**: `export const GET: APIRoute`. Reads `context.locals.user` and `context.locals.supabase`. Validates `id` param is a non-empty string. Calls `getDueCardsForSession`. Returns `200 {cards: Flashcard[], nextDue: string | null}` or standard error codes (401/400/500). Export `export const prerender = false`.

#### 3. Submit-review API endpoint

**File**: `src/pages/api/reviews/index.ts`

**Intent**: POST endpoint that saves one card rating. Called after the user taps a rating button; the client does not need the updated card state back.

**Contract**: `export const POST: APIRoute`. Request body (Zod): `{flashcardId: z.string().uuid(), grade: z.number().int().min(1).max(4)}`. Calls `submitCardReview`. Returns `200 {success: true}` or standard error codes (401/400/404/500). Export `export const prerender = false`.

### Success Criteria

#### Automated Verification

- `npm run build` succeeds with no TypeScript errors
- `npm run lint` passes

#### Manual Verification

- `GET /api/sets/[id]/due-cards` returns `{cards: [...], nextDue: null}` for a set with due cards
- `GET /api/sets/[id]/due-cards` returns `{cards: [], nextDue: "2026-…"}` for a set with no cards currently due
- `POST /api/reviews` with valid body updates the `flashcards` row (new `due`, `state`, `stability`, etc.) and inserts a row in `reviews`
- Supabase Studio confirms both the flashcard update and the review log insert are correct

**Implementation Note**: After Phase 1 is complete and manual API verification passes, confirm before starting Phase 2.

---

## Phase 2: UI — Review Session Component, Page, Navigation

### Overview

Add the `SessionSummary` type, rename the existing set detail Astro page to make room for the review route, create the Astro page and React session component, and add the entry-point button in SetDetailPage.

### Changes Required

#### 1. Add SessionSummary type

**File**: `src/types.ts`

**Intent**: Add a shared type for the session result used by the summary screen.

**Contract**: Add `export interface SessionSummary { total: number; byGrade: { again: number; hard: number; good: number; easy: number }; }` alongside the existing type exports.

#### 2. Rename set detail page

**File**: `src/pages/sets/[id].astro` → `src/pages/sets/[id]/index.astro`

**Intent**: Free up the `[id]` dynamic segment so that `review.astro` can live alongside `index.astro` in the same folder. File content is unchanged.

**Contract**: After rename, `src/pages/sets/[id]/index.astro` exists and `src/pages/sets/[id].astro` does not. Verify `/sets/[id]` still resolves.

#### 3. Review Astro page

**File**: `src/pages/sets/[id]/review.astro`

**Intent**: Server-rendered entry point for the review session. Verifies the set exists and belongs to the user (redirect to `/sets/[id]` if not found or unauthorized). Passes `setId` and `setName` to the React component.

**Contract**: Follows the same auth + set-fetch pattern as `src/pages/sets/[id]/index.astro`. Renders `<ReviewSession client:load setId={id} setName={set.name} />`. Export `export const prerender = false`.

#### 4. ReviewSession React component

**File**: `src/components/review/ReviewSession.tsx`

**Intent**: Full client-side session state machine. Fetches due cards on mount, drives the flip → rate → advance flow, and renders the appropriate view for each session phase.

**Contract**: Props `{setId: string, setName: string}`. Internal session phase: `'loading' | 'empty' | 'reviewing' | 'summary'`. Session state: `cards: Flashcard[]`, `currentIndex: number`, `flipped: boolean`, `submitting: boolean`, `summary: SessionSummary`, `nextDue: string | null`.

Views:
- `loading` — spinner while `GET /api/sets/[setId]/due-cards` is in flight
- `empty` — "Brak kart do powtórki" + formatted `nextDue` date + "Wróć do zestawu" link
- `reviewing` (not flipped) — card front text + progress indicator (`X / Y`) + "Pokaż odpowiedź" button
- `reviewing` (flipped) — card front + divider + card back + 4 rating buttons (Nie wiem / Trudne / Wiem / Łatwe); clicking a button calls `POST /api/reviews`, increments summary counters, advances to next card or transitions to `summary`
- `summary` — "Sesja zakończona!" + total count + grade breakdown + "Wróć do zestawu" link

Use `cn()` + shadcn/ui `Button` and `Card` components. Follow `SetDetailPage.tsx` patterns for toast error handling (`toast.error` from Sonner) if the API call fails.

#### 5. Add session entry button in SetDetailPage

**File**: `src/components/sets/SetDetailPage.tsx`

**Intent**: Add a "Rozpocznij sesję" button in the set header area that navigates to `/sets/[setId]/review`. Uses a standard `<a>` or `<Button asChild>` with `href`.

**Contract**: Button placed near the existing set title/actions area. Navigates to `/sets/${set.id}/review`. Style consistent with existing action buttons in the component.

### Success Criteria

#### Automated Verification

- `npm run build` succeeds (including renamed Astro page)
- `npm run lint` passes

#### Manual Verification

- `/sets/[id]` loads correctly after the Astro page rename — no regression in set detail functionality
- "Rozpocznij sesję" button appears on the set detail page and navigates to `/sets/[id]/review`
- Review page loads and shows the loading spinner, then the first due card
- Card front is shown; "Pokaż odpowiedź" reveals the back + rating buttons
- Rating a card advances to the next one; last card transitions to summary screen
- Summary shows correct total and per-grade counts
- Visiting `/sets/[id]/review` for a set with no due cards shows the empty state with next date
- No regressions in set detail, flashcard list, or CSV import

**Implementation Note**: After all manual verification passes, confirm before closing this phase.

---

## Testing Strategy

### Manual Testing Steps

1. Create or use an existing set with several flashcards (new cards start with `due = now()`)
2. Click "Rozpocznij sesję" — verify navigation to `/sets/[id]/review`
3. Verify card front is shown with progress counter
4. Click "Pokaż odpowiedź" — verify back is revealed and 4 rating buttons appear
5. Rate each card with a different button; verify the card advances
6. After the last card, verify summary screen shows correct counts per grade
7. Check Supabase Studio: `flashcards` rows should have updated `due`, `state`, `stability`; `reviews` table should have one new row per rated card
8. Navigate back to the set and click "Rozpocznij sesję" again — if all cards are in a future `due`, verify empty state shows the next date
9. Verify "Wróć do zestawu" links on empty and summary screens work
10. Verify no regressions: set detail page, create/edit/delete flashcard, CSV import

## Performance Considerations

All due cards are fetched at session start in a single query — acceptable because sets are user-scoped and practically bounded (hundreds of cards at most). No pagination needed for this slice. Rating submits one card at a time via sequential API calls; the UI disables buttons during `submitting` to prevent double-submits.

## References

- Frame brief: `context/changes/sr-review-session/frame.md`
- Roadmap S-05: `context/foundation/roadmap.md` (lines 140–151)
- Schema: `supabase/migrations/20260610000000_initial_schema.sql`
- API pattern reference: `src/pages/api/flashcards/[id].ts`
- Service pattern reference: `src/lib/services/flashcards.ts`
- Existing set page: `src/pages/sets/[id].astro` (to be renamed)
- React component pattern: `src/components/sets/SetDetailPage.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Backend — Service + API Endpoints

#### Automated

- [ ] 1.1 `npm run build` succeeds with no TypeScript errors
- [ ] 1.2 `npm run lint` passes

#### Manual

- [ ] 1.3 GET /api/sets/[id]/due-cards returns cards and null nextDue for a set with due cards
- [ ] 1.4 GET /api/sets/[id]/due-cards returns empty cards array and nextDue date for a set with no due cards
- [ ] 1.5 POST /api/reviews updates flashcard row and inserts review log in DB

### Phase 2: UI — Review Session Component, Page, Navigation

#### Automated

- [ ] 2.1 `npm run build` succeeds after Astro page rename
- [ ] 2.2 `npm run lint` passes

#### Manual

- [ ] 2.3 /sets/[id] loads correctly after Astro page rename (no regression)
- [ ] 2.4 "Rozpocznij sesję" button appears and navigates to /sets/[id]/review
- [ ] 2.5 Review page loads, shows first due card with flip interaction
- [ ] 2.6 Rating a card advances session; last card shows summary with correct counts
- [ ] 2.7 Empty state shows next due date when no cards are due
- [ ] 2.8 No regressions in set detail, flashcard list, CSV import
