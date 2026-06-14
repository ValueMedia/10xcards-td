# Spaced Repetition Review Session — Plan Brief

> Full plan: `context/changes/sr-review-session/plan.md`
> Frame brief: `context/changes/sr-review-session/frame.md`

## What & Why

Implement S-05: a spaced repetition review session that lets users practice flashcards from a set. The initial framing was confirmed correct — the existing schema is fully compatible with ts-fsrs v5.4.1, no migrations are needed. The feature is the first real integration of the ts-fsrs library and delivers the core learning loop the product is built around.

## Starting Point

All prerequisites are done (F-01 schema, S-01 AI generation, S-02 set management). The `flashcards` and `reviews` tables have all ts-fsrs fields; RLS policies for reviews are already in place. No `fsrs()` calls exist in the codebase yet — `src/types.ts` only re-exports `State` and `Rating` from ts-fsrs.

## Desired End State

A user can open any set, click "Rozpocznij sesję", and work through all flashcards due today: see the front, self-test, flip to reveal the answer, and rate it with four buttons (Nie wiem / Trudne / Wiem / Łatwe). Each rating saves the updated SR state to the DB. After the last card, a summary screen shows total reviewed and grade breakdown. If no cards are due, the page shows the next scheduled date.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Session entry point | New page `/sets/[id]/review` | Dedicated route gives full-screen focus and a bookmarkable URL without conflating session logic with set management |
| Again cards handling | Each card shown once (no re-queue) | Simpler implementation; ts-fsrs schedules the next review at the correct short interval automatically |
| Empty state | Informational screen with next due date | Users need to know when to come back — a blank redirect is disorienting |
| Summary screen | Card count + per-grade breakdown | Client-side data, zero extra queries; historical trends belong to S-06 |
| ts-fsrs call location | Server-side in the service | Keeps algorithm off the client; consistent with SSR-first architecture |

## Scope

**In scope:**
- `GET /api/sets/[id]/due-cards` — due cards + next scheduled date
- `POST /api/reviews` — save single rating, update flashcard state, insert review log
- `src/lib/services/reviews.ts` — ts-fsrs integration, DB mutations
- `src/pages/sets/[id]/review.astro` + `ReviewSession.tsx` — full session UI
- Rename `[id].astro` → `[id]/index.astro` to free the Astro route
- "Rozpocznij sesję" button in SetDetailPage

**Out of scope:**
- Again cards re-queue within a session
- Session persistence / resume after browser close
- Time tracking (S-06)
- Force-review cards not yet due
- ts-fsrs v6 migration (deprecated field cleanup)

## Architecture / Approach

The client fetches all due cards on session mount (single GET), then drives the flip → rate → advance loop entirely client-side. Each rating triggers one POST (no batching); the server calls `fsrs().next()`, atomically updates the flashcard row and inserts a review log. The React component is a state machine with five phases: loading → empty | reviewing (front) → reviewing (flipped) → summary.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Backend | Reviews service + due-cards GET + submit-review POST | ts-fsrs Date↔string conversion errors; `reviews.grade` vs `ReviewLog.rating` field name mismatch |
| 2. UI | ReviewSession component, Astro page, navigation button | Astro routing conflict if `[id].astro` rename is missed; regression on set detail page |

**Prerequisites:** F-01, S-01, S-02 all done (confirmed). ts-fsrs v5.4.1 installed.
**Estimated effort:** ~2 sessions across 2 phases

## Open Risks & Assumptions

- `elapsed_days` / `last_elapsed_days` are deprecated in ts-fsrs v5 (removed in v6) — included for now; removal requires a future migration
- The Astro rename (`[id].astro` → `[id]/index.astro`) must happen atomically with adding `review.astro` — doing one without the other breaks either the set detail or the review route

## Success Criteria (Summary)

- User can complete a full review session (flip → rate → summary) for a set with due cards
- Each rated card's `flashcards` row is updated and a `reviews` row is inserted with correct ts-fsrs state
- Empty state correctly shows the next due date when no cards are due
