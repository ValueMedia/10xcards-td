# Flashcard Reverse Mode — Hide Front-Face Flash on Card Switch Implementation Plan

## Overview

With reverse mode ON, advancing to the next card on `/browse` and `/review` briefly shows the
new card's **Front** face before the default **Back** face settles. This plan removes that flash
by decoupling the card-content change from the flip-orientation animation: the card is remounted
(via a React `key`) on every card change, so the new card renders directly in its default
orientation with no rotation, while the 0.6s flip animation is preserved for explicit user flips.
A `prefers-reduced-motion` CSS guard is added at the same time.

## Current State Analysis

The shared, fully-controlled `FlashcardBrowseCard` renders both faces at all times; a `flipped`
prop drives a CSS 3D rotation (`src/components/sets/FlashcardBrowseCard.tsx:10-42`). The rotation
is animated by `transition: transform 0.6s` on `card-flip-inner` (`src/styles/global.css:121-131`).

In reverse mode the default orientation is `flipped = true` (Back facing the viewer). Both screens
reset the orientation to the default **and** swap to the next card's content in the same render:

- Browse: `goNext`/`goPrev`/`shuffle` call `setFlipped(reverse)` while changing `position`
  (`src/components/sets/FlashcardBrowseView.tsx:24-57`); card rendered at line 99.
- Review: advancing calls `setShowingBack(reverse)` + `setCurrentIndex(nextIdx)`
  (`src/components/review/ReviewSession.tsx:125-129`); card rendered at line 265.

When the previous card was showing its Front (`flipped=false`) — the common case in reverse mode,
right after checking the answer — the orientation animates `0deg → 180deg`. During the first ~300ms
the Front face (already holding the **new** card's text) faces the viewer. That is the flash.

This is **not** a hydration/SSR flash: both islands are mounted `client:only="react"`
(`src/pages/sets/[id]/browse.astro:33`, `src/pages/sets/[id]/review.astro:30`) and the load-time
flash was already fixed in the `flashcard-reverse-mode` change.

### Key Discoveries:

- `FlashcardBrowseCard` is stateless (no `useState`/`useRef`) — remounting it via `key` is free,
  with no state to preserve (`src/components/sets/FlashcardBrowseCard.tsx:10-42`).
- `card.id` is available on the `Flashcard` type and already used (`ReviewSession.tsx:103`), so it
  is a stable per-card identity for the `key`.
- A freshly mounted element renders directly at its final `transform`; CSS transitions only fire on
  a subsequent change, not on initial render — so a remounted card in Back orientation does not
  animate (no flash), while an in-place `flipped` toggle on the same mounted card still animates.
- The card has a fixed `height: 320px` (`FlashcardBrowseCard.tsx:14`), so remounting causes no
  layout shift.
- `/share` has no reverse mode (its default shown side is the Front, which is the prompt), so it is
  unaffected — explicitly out of scope.

## Desired End State

With reverse mode ON, switching cards (Next/Prev/Shuffle on browse; grade-and-advance on review)
shows the **Back** face immediately, with no momentary Front. Manual flips (click / Space / Enter)
still animate with the existing 0.6s rotation. Reverse OFF behaves exactly as before. Users with
`prefers-reduced-motion: reduce` get no flip rotation at all.

## What We're NOT Doing

- Not changing reverse-mode logic, the `localStorage` hook, grading, the SR API, shuffle, or
  keyboard semantics.
- Not adding a blur/opacity mask (it masks the symptom; the chosen fix removes the cause).
- Not removing the manual-flip animation.
- Not touching `/share` or any non-reverse view's behavior.
- Not restructuring `FlashcardBrowseCard` or its faces.

## Implementation Approach

Add a React `key` tied to the current card's identity on `<FlashcardBrowseCard>` in both consumers.
On card change the key changes → React remounts the card → it renders in the default orientation
(`flipped`/`showingBack` already equal `reverse`) without a transition. On a manual flip the key is
unchanged → same instance toggles `flipped` → the transition fires as today. Add a
`prefers-reduced-motion` media rule disabling the `card-flip-inner` transition.

## Phase 1: Remount card on card change + reduced-motion guard

### Overview

Eliminate the on-navigation flip animation in both screens via a per-card `key`, and add the
reduced-motion CSS guard.

### Changes Required:

#### 1. Browse: remount card per card identity

**File**: `src/components/sets/FlashcardBrowseView.tsx`

**Intent**: Make navigation/shuffle swap the card without animating the orientation reset, so the
Back face appears immediately in reverse mode.

**Contract**: Add `key={currentCard.id}` to the `<FlashcardBrowseCard>` element (line 99). No other
logic changes — `flipped` init/reset on `reverse` and the `flip` toggle stay as-is. The `key`
changes on Next/Prev/Shuffle (different card id) and is stable across an in-place `flip`.

#### 2. Review: remount card per card identity

**File**: `src/components/review/ReviewSession.tsx`

**Intent**: Make grade-and-advance swap the card without animating the orientation reset.

**Contract**: Add `key={card.id}` to the `<FlashcardBrowseCard>` element (line 265). The `revealed`
+ `showingBack` latch logic and `flipCard` are unchanged. The `key` changes on advance (new
`currentIndex` → new card id) and is stable across reveal/flip on the same card.

#### 3. Reduced-motion guard for the flip

**File**: `src/styles/global.css`

**Intent**: Respect users who opt out of motion by disabling the flip rotation entirely for them.

**Contract**: Add a `@media (prefers-reduced-motion: reduce)` rule setting `transition: none` on
`.card-flip-inner`, placed after the `@utility card-flip-inner` definition (lines 121-127) so it
overrides the transition. Faces still switch (via `flipped`); only the animation is removed.

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes (build): `npm run build`
- [ ] Linting passes on changed TS/TSX: `npx eslint src/components/sets/FlashcardBrowseView.tsx src/components/review/ReviewSession.tsx`

#### Manual Verification:

- [ ] Reverse ON, `/browse`: Next/Prev/Shuffle show the Back face immediately — no momentary Front.
- [ ] Reverse ON, `/review`: grading and advancing to the next card shows the Back prompt immediately — no momentary Front.
- [ ] Manual flip (click / Space / Enter) still animates the 0.6s rotation on the same card, in both screens and both modes.
- [ ] Reverse OFF: both screens behave exactly as before (Front first), no regressions.
- [ ] With OS "reduce motion" enabled, flips switch faces instantly (no rotation) and content is still correct.

**Implementation Note**: After completing this phase and all automated verification passes, pause
for manual confirmation before closing the change.

---

## Testing Strategy

### Manual Testing Steps:

1. Enable reverse mode on a set with several cards.
2. `/browse`: click Next repeatedly after flipping to Front each time — confirm no Front flash on the next card; confirm a manual click/Space still animates the flip.
3. `/browse`: Shuffle and Prev — confirm same (Back first, no flash).
4. `/review`: reveal the answer, grade, advance — confirm the next card prompts with Back, no Front flash; confirm reveal still animates.
5. Toggle reverse OFF — confirm Front-first behavior unchanged on both screens.
6. Enable OS reduce-motion — confirm flips are instant (no rotation), content correct.

## Performance Considerations

Negligible. Remounting a stateless ~40-line component on card change is cheap and the card has a
fixed height (no layout shift).

## Migration Notes

None. No data, schema, or API changes.

## References

- Related research: `context/changes/flashcard-reverse-front-flash/research.md`
- Prior change: `context/changes/flashcard-reverse-mode/plan.md`
- Shared card: `src/components/sets/FlashcardBrowseCard.tsx:10-42`
- Flip CSS: `src/styles/global.css:121-142`
- Browse render: `src/components/sets/FlashcardBrowseView.tsx:99`
- Review render: `src/components/review/ReviewSession.tsx:265`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Remount card on card change + reduced-motion guard

#### Automated

- [x] 1.1 Type checking passes (build): `npm run build`
- [x] 1.2 Linting passes on changed TS/TSX files

#### Manual

- [x] 1.3 Reverse ON `/browse`: Next/Prev/Shuffle show Back immediately — no Front flash
- [x] 1.4 Reverse ON `/review`: grade-and-advance shows Back immediately — no Front flash
- [x] 1.5 Manual flip still animates the 0.6s rotation (both screens, both modes)
- [x] 1.6 Reverse OFF: both screens behave exactly as before — no regressions
- [x] 1.7 With reduce-motion enabled: flips switch instantly, content correct
