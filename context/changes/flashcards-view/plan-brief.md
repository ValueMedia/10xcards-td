# Flashcard Browse View — Plan Brief

> Full plan: `context/changes/flashcards-view/plan.md`

## What & Why

Add a read-only browse mode to the set detail page — a Quizlet-style view where the user steps through flashcards one at a time, flips them to reveal the answer via a 3D animation, and can shuffle the order. Currently the only active mode is a graded review session (FSRS); users have no way to casually look through cards without triggering spaced-repetition scoring.

## Starting Point

The set page (`/sets/[id]`) already loads all flashcard data server-side and passes it to `SetDetailPage.tsx`. The sister route `/sets/[id]/review` (review.astro + ReviewSession.tsx) establishes the exact pattern to follow for a new route. No 3D flip animations exist anywhere in the project; the global CSS already uses `@utility` for custom Tailwind utilities.

## Desired End State

A "Browse" button on the set page navigates to `/sets/[id]/browse`. The user sees one card at a time (large, centred, Quizlet-scale), clicks to flip it with a smooth 3D rotation, uses ←/→ buttons or keyboard arrows to navigate, and sees a live counter (e.g. "3/10"). A Shuffle button re-orders cards in-session. A back link returns to the set. The button is disabled when the set has no flashcards.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| View structure | Separate route `/sets/[id]/browse` | Consistent with review.astro pattern; full layout control | Plan |
| Flip animation | CSS 3D perspective + rotateY via `@utility` | No extra dependencies, identical effect to Quizlet, project already has `@utility` pattern | Plan |
| Session state location | `FlashcardBrowseView` (all state in one component) | Pure display card + stateful parent matches existing review pattern | Plan |
| Data loading | SSR via `getSetWithFlashcards` in browse.astro | All data available at render time, no client-side API call needed | Plan |
| Keyboard support | ArrowLeft/Right + Space | Standard in Quizlet; one useEffect, low cost | Plan |
| Shuffle | Fisher-Yates on in-memory index array | No DB write, session-only, zero latency | Plan |
| Empty set handling | Disable button in SetDetailPage + safety redirect in browse.astro | Defensive double-guard; clear UI signal before navigation | Plan |
| Access control | Owner-only (middleware-protected `/sets` prefix) | Consistent with existing security model, no new RLS logic | Plan |

## Scope

**In scope:**
- New React component `FlashcardBrowseCard` (3D flip, pure display)
- New React component `FlashcardBrowseView` (session state, navigation, shuffle, keyboard)
- New Astro route `src/pages/sets/[id]/browse.astro`
- Five `@utility` CSS classes for 3D flip in `global.css`
- "Browse" button in `SetDetailPage.tsx`

**Out of scope:**
- Grading or FSRS state changes
- Swipe gesture support
- Public/shared-set access from browse view
- Persisting shuffle state or last-viewed card
- Progress bar (counter only)

## Architecture / Approach

`browse.astro` fetches `{ set, flashcards }` server-side (same service call as the set detail page) and passes them as props to `FlashcardBrowseView client:load`. The view component owns all session state (`order`, `position`, `flipped`) and renders `FlashcardBrowseCard` as a controlled child. The 3D effect is pure CSS — five `@utility` classes define perspective container, preserve-3d inner, the flipped transform, and backface-hidden faces. No new npm packages.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. CSS utilities + BrowseCard | Animated flip card component in isolation | Absolute positioning inside flip-inner must be relative; faces visible simultaneously if backface-hidden missing |
| 2. FlashcardBrowseView | Full session UI with navigation, shuffle, keyboard | Keyboard handler closure capturing stale state if deps omitted |
| 3. Astro route + button | `/sets/[id]/browse` wired up end-to-end | Astro routing: `browse.astro` must sit beside `index.astro` inside `[id]/` directory |

**Prerequisites:** None — all required code and services already exist  
**Estimated effort:** ~1-2 focused sessions across 3 phases

## Open Risks & Assumptions

- `tw-animate-css`'s `@utility` syntax must be supported by the Tailwind v4 build; verified by existing `bg-cosmic` utility using the same pattern
- Card height is hardcoded to `320px` — if flashcard text is very long, it will overflow; accepted trade-off for now (same limitation as Quizlet's fixed card size)
- `getSetWithFlashcards` is assumed to verify ownership (middleware + RLS cover this at the DB level per existing patterns)

## Success Criteria (Summary)

- User can open browse mode from any set with cards, flip each card with a 3D animation, navigate and shuffle, and return to the set
- 3D flip animation runs at ~600 ms with no faces visible simultaneously mid-animation
- No regressions on set detail page (existing buttons and dialogs unaffected)
