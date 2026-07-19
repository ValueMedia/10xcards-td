# Hide the TTS Speaker Button While a Flashcard Flips — Plan Brief

> Full plan: `context/changes/hide-speaker-button/plan.md`

## What & Why

On `/browse` and `/review` the flashcard flips with a 0.6s 3D rotation, but the TTS speaker button sits outside the rotating element and stays frozen over the spinning card. This change hides the button (smooth fade) while the flip animates and restores it once the rotation settles, so it no longer floats statically mid-flip.

## Starting Point

The speaker button lives in one shared component, `FlashcardBrowseCard.tsx`, used by both views. It is an absolutely-positioned sibling of the rotating `.card-flip-inner`, so the CSS flip never moves it. The flip is a `transform 0.6s` transition toggled by the `flipped` prop; under `prefers-reduced-motion` it is instant. Both consumers remount the card per `key={card.id}`, so state resets on card change.

## Desired End State

Flipping a card fades the speaker button out at the start of the rotation and fades it back in when the ~600ms flip completes; while hidden it is non-interactive. Advancing to the next card shows the button immediately. Users with reduced-motion keep the button visible (their flip is instant).

## Key Decisions Made

| Decision                 | Choice                          | Why (1 sentence)                                                        | Source |
| ------------------------ | ------------------------------- | ---------------------------------------------------------------------- | ------ |
| Visual transition        | Fade (opacity + transition)     | Matches the glassmorphism aesthetic; avoids a hard "blink."            | Plan   |
| Reduced-motion behavior  | Keep button visible             | Flip is instant there — nothing to hide, so no needless flicker.       | Plan   |
| Flip-end detection       | 600ms timeout                   | Simple, deterministic, robust to `transitionend` not firing.           | Plan   |
| Interaction while hidden | Block (`pointer-events: none`)  | Prevents accidental TTS trigger on the invisible button.               | Plan   |

## Scope

**In scope:**
- Hide/restore the speaker button during the flip in `FlashcardBrowseCard.tsx` (covers both `/browse` and `/review`).
- Respect `prefers-reduced-motion` and per-card remount semantics.
- Test coverage in the existing component test file.

**Out of scope:**
- Moving the button into the rotating element; changing the flip animation or its CSS.
- Any change to TTS logic, `useSpeech`, the API, or voice resolution.
- New settings or persistence; edits to the two consumer components.

## Architecture / Approach

Add local `isFlipping` state to `FlashcardBrowseCard`. An effect on the `flipped` prop — guarded to skip the first mount and to skip when reduced-motion matches — sets `isFlipping = true`, then clears it after a 600ms timeout (timeout id in a ref, cleared on next flip and on unmount). The button gains an opacity transition and, while `isFlipping`, `opacity-0 pointer-events-none` via the existing `cn(...)`.

## Phases at a Glance

| Phase                                    | What it delivers                                          | Key risk                                                        |
| ---------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------- |
| 1. Hide the speaker button during flip   | Fade-out/in tied to `flipped`, reduced-motion-aware, tested | First-render/remount hiding the button on card change; leaked timers on rapid flips |

**Prerequisites:** None — self-contained client-side change.
**Estimated effort:** ~1 short session, single file + test.

## Open Risks & Assumptions

- Assumes the flip stays 600ms; the timeout constant is coupled to `global.css:126` and documented with a comment.
- Assumes the per-card remount (`key={card.id}`) in both consumers stays in place — it is what keeps the button visible on card change without extra logic.
- jsdom lacks `matchMedia`; the reduced-motion branch is verified manually (or via a `matchMedia` stub) rather than in the default test env.

## Success Criteria (Summary)

- Flipping a card on both views fades the speaker button out during the rotation and back in after.
- Advancing cards and rapid flipping never leave the button stuck hidden; button visible immediately on a new card.
- Reduced-motion users keep the button visible; while hidden the button cannot trigger TTS.
