# Flashcard Reverse Mode — Hide Front-Face Flash on Card Switch — Plan Brief

> Full plan: `context/changes/flashcard-reverse-front-flash/plan.md`
> Research: `context/changes/flashcard-reverse-front-flash/research.md`

## What & Why

In reverse mode, switching to the next card on `/browse` and `/review` briefly shows the new card's
**Front** before the default **Back** settles in — the user sees the answer before they can think
about it. The cause is the 0.6s CSS 3D flip animating the orientation reset on card change, which
rotates *through* the Front face while the content has already swapped. We remove the flash by
remounting the card on every card change so it renders directly in the Back orientation with no
rotation, keeping the flip animation only for explicit user flips.

## Starting Point

Both screens reset the flip orientation to the default and swap to the next card's content in the
same render (`FlashcardBrowseView.tsx:24-57`, `ReviewSession.tsx:125-129`), driving an animated
rotation through the Front face (`global.css:121-131`). The shared `FlashcardBrowseCard` is fully
controlled and stateless. The earlier load-time flash was already fixed via `client:only="react"`;
this is a separate, navigation-time flash.

## Desired End State

With reverse ON, Next/Prev/Shuffle (browse) and grade-and-advance (review) show the Back face
immediately — no momentary Front. Manual flips still animate the 0.6s rotation. Reverse OFF is
unchanged. Users with `prefers-reduced-motion: reduce` get no flip rotation.

## Key Decisions Made

| Decision                          | Choice                              | Why (1 sentence)                                                              | Source   |
| --------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------- | -------- |
| Root cause                        | CSS flip animation, not hydration   | Islands are `client:only`; flash is the 0.6s rotation passing the Front face. | Research |
| Fix approach                      | Remount card via React `key`        | Removes the cause in ~2 lines; new card renders in default orientation, no transition. | Plan |
| Manual flip animation             | Keep it                             | The flash is only the on-navigation reset; user-initiated flips should stay animated. | Plan |
| Accessibility                     | Add `prefers-reduced-motion` guard  | Cheap one-time a11y win in the same CSS block.                                | Plan     |
| `/share` page                     | Out of scope                        | No reverse mode there; default shown side is the prompt, so no flash.         | Research |

## Scope

**In scope:**
- `key={currentCard.id}` on the browse card; `key={card.id}` on the review card.
- `@media (prefers-reduced-motion: reduce)` disabling the `card-flip-inner` transition.

**Out of scope:**
- Reverse-mode logic, `localStorage` hook, grading, SR API, shuffle, keyboard semantics.
- Blur/opacity mask; removing the manual-flip animation; `/share`; restructuring the card.

## Architecture / Approach

A React `key` tied to the current card's identity makes React unmount/remount `FlashcardBrowseCard`
on every card change. A freshly mounted element paints at its final `transform`, so CSS transitions
do not fire — the Back face appears instantly. The key is stable across an in-place `flipped`
toggle, so manual flips animate as before. The card is stateless and fixed-height, so remounting is
free and causes no layout shift.

## Phases at a Glance

| Phase                                              | What it delivers                                    | Key risk                                           |
| -------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------- |
| 1. Remount card on change + reduced-motion guard   | `key` on both cards + `prefers-reduced-motion` rule | Tailwind 4 `@utility` ordering for the media rule  |

**Prerequisites:** None — builds on the merged `flashcard-reverse-mode` change.
**Estimated effort:** ~1 short session, single phase.

## Open Risks & Assumptions

- The `@media (prefers-reduced-motion)` rule must come after the `@utility card-flip-inner`
  definition to override the transition (equal specificity, source order decides).
- Remounting the card drops focus on the card container during keyboard navigation; both screens
  drive navigation via `window` keydown listeners, so this has no functional impact.

## Success Criteria (Summary)

- Reverse ON: no momentary Front when switching cards on browse or review.
- Manual flip still animates; reverse OFF unchanged; no regressions.
- Reduce-motion users get instant, correct face switches with no rotation.
