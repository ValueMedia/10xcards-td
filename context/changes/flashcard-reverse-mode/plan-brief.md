# Flashcard Reverse Mode — Plan Brief

> Full plan: `context/changes/flashcard-reverse-mode/plan.md`

## What & Why

Add a per-set "reverse mode" so learners can study Back→Front instead of Front→Back. On the browse and review screens, a flashcard shows its **Back** text first and reveals the **Front** on flip. The preference is toggled from a switch on the set page and remembered per-set in `localStorage`, defaulting to off.

## Starting Point

A shared `FlashcardBrowseCard` renders both faces (front="Question", back="Answer"), with a `flipped` prop choosing the visible side; both `FlashcardBrowseView` (browse) and `ReviewSession` (review) reuse it and always start on the front. The set page (`SetDetailPage`, a `client:load` island) has a button grid directly above the flashcard list. There is no `localStorage` use, no `hooks/` directory, and no shadcn `Switch` in the project yet.

## Desired End State

The set page shows a "Reverse mode" switch above the flashcard list that persists per-set. With it on, browse shows Back-first (flip → Front) and review prompts with Back (reveal → Front), with correct resets on navigation/advance; grading and the SR flow are unchanged. With it off, everything behaves exactly as today. Card faces are relabeled **Front**/**Back** so labels always name the real field.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Face labels in reverse | Relabel to neutral "Front"/"Back" (both modes) | Label names the real card field regardless of which side shows first | Plan |
| Toggle control | shadcn `Switch` (`npx shadcn add switch`) | Matches the project's new-york shadcn convention + ARIA out of the box | Plan |
| Persistence key | `reverseMode:<setId>` = `"true"`/`"false"` | Readable, per-set isolation, easy to inspect in DevTools | Plan |
| Scope of reverse | Browse + review only (not `/share`) | Exactly the task note; avoids scope creep | Plan |
| Hydration | Read in `useState` initializer with `typeof window` guard | Islands are `client:load`, so no real SSR mismatch and no Front→Back flash | Plan |
| Card mechanic | Keep card "dumb"; reverse = initial/reset value of "showing back" | No prop swapping; reuse the existing flip component untouched | Plan |

## Scope

**In scope:** shadcn `Switch`, a `useReverseMode(setId)` hook, relabeling `FlashcardBrowseCard`, a toggle row on `SetDetailPage`, and consuming the preference in `FlashcardBrowseView` and `ReviewSession`.

**Out of scope:** the `/share` page, server/per-user persistence, grading/SR/API/summary/shuffle logic, animations, and any toggle on the browse/review screens themselves.

## Architecture / Approach

A single `useReverseMode(setId)` hook owns the `localStorage` key and SSR guard, returning `[reverse, setReverse]`. The set page reads+writes it via the Switch; browse and review read only the value and use it to seed (and reset) their "showing back" state — `FlashcardBrowseCard` stays dumb (front prop = front face = "Front" label). The set-page control and the browse/review consumers are separate islands that coordinate purely through `localStorage`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Foundation & set-page toggle | Switch component, persistence hook, relabeled card, working toggle on set page | Getting the hook's no-write-on-mount + SSR guard right |
| 2. Apply reverse on browse & review | Back-first browse and review with correct resets, composing with the reveal latch | Review's `revealed`/`showingBack` mapping when prompt = Back |

**Prerequisites:** None — frontend-only, no backend/migration.
**Estimated effort:** ~1 session across 2 phases.

## Open Risks & Assumptions

- Assumes browse/review render client-side only (`client:load`), so the `useState` initializer read of `localStorage` is safe — verified by the page wiring.
- Assumes no automated tests cover these components today; coverage is build/lint + manual checks.
- Relabeling faces to Front/Back intentionally changes the normal-mode wording too (accepted).

## Success Criteria (Summary)

- A persisted per-set switch on the set page toggles reverse mode (off by default).
- With it on, browse and review show Back first and reveal Front; with it off, behavior is unchanged.
- No Front→Back flash when loading browse/review with reverse on.
