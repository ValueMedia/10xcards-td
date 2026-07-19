# Hide the TTS Speaker Button While a Flashcard Flips Implementation Plan

## Overview

On the `/browse` and `/review` views the flashcard flips with a 0.6s 3D CSS rotation, but the TTS speaker button sits outside the rotating element and stays frozen in place during the flip. This plan hides the button (smooth fade) for the duration of the flip and brings it back once the rotation settles, so it no longer floats statically over a spinning card. Users who opt out of motion (`prefers-reduced-motion`) keep the button visible, because for them the flip is instant and there is nothing to hide.

## Current State Analysis

- The speaker button lives in a single shared component, `src/components/sets/FlashcardBrowseCard.tsx`, rendered by both `/browse` (`FlashcardBrowseView.tsx:115`) and `/review` (`ReviewSession.tsx:327`). One change covers both views.
- The button is a **sibling** of the rotating `div.card-flip-inner`, positioned `absolute top-3 right-3 z-10` (`FlashcardBrowseCard.tsx:46-61`). Because it is not inside the rotating element, the CSS flip never moves it — hence the "frozen button" symptom.
- The flip is pure CSS: `transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)` on `.card-flip-inner`, toggled by adding the `card-flip-inner-flipped` class (`global.css:121-131`). The class is driven by the `flipped` prop (`FlashcardBrowseCard.tsx:62`).
- Under `@media (prefers-reduced-motion: reduce)` the transition is overridden to `none`, so the face switch is instantaneous (`global.css:146-149`).
- Both consumers mount the card with `key={card.id}` (`FlashcardBrowseView.tsx:116`, `ReviewSession.tsx:328`). **Card change = remount**, so local component state resets and the flip transition does not fire on a new card (see lesson *flashcard-reverse-front-flash*). Consequence: the hide behavior must trigger only on a real flip of an already-mounted card, never on the initial render or on advancing to the next card. A remount naturally gives us this for free — fresh state means the button starts visible.
- The button already stops propagation on click and calls `speak(currentText, currentVoice)` (`FlashcardBrowseCard.tsx:54-57`); `status` drives the loading spinner.

### Key Discoveries:

- Single shared component means one edit, both views — `src/components/sets/FlashcardBrowseCard.tsx:19`.
- Flip duration is a known constant, 600ms — `src/styles/global.css:126`.
- Reduced-motion makes the flip instant — `src/styles/global.css:146-149` — so hiding must be skipped there.
- `key`-based remount per card resets state on card change — `FlashcardBrowseView.tsx:116`, `ReviewSession.tsx:328` — so no cross-card state leakage; button is visible on mount.
- Existing test file `src/components/sets/__tests__/FlashcardBrowseCard.test.tsx` covers this component and is the place to add coverage.

## Desired End State

On `/browse` and `/review`, clicking (or Enter-ing) a card to flip it fades the speaker button out at the start of the rotation and fades it back in when the ~600ms rotation completes. During the fade-out/hidden window the button is non-interactive (no accidental TTS trigger). Advancing to the next card shows the button immediately (no flicker). Users with `prefers-reduced-motion: reduce` see the button remain visible throughout (their flip is instant).

Verified by: watching a flip on both views (button fades out then back in), rapidly flipping back and forth (button tracks each flip, no stuck-hidden state), advancing cards (button visible immediately), and toggling OS reduced-motion (button stays visible).

## What We're NOT Doing

- Not moving the button inside the rotating element (that would make it flip with the card — a different, unwanted behavior).
- Not changing the flip animation itself, its duration, or the CSS in `global.css`.
- Not changing the TTS logic, the `useSpeech` hook, the API, or voice resolution.
- Not touching `FlashcardBrowseView.tsx` or `ReviewSession.tsx` (they already pass `flipped` and remount via `key`).
- Not adding a new user setting or persistence — this is unconditional UI behavior.

## Implementation Approach

Add a local `isFlipping` boolean to `FlashcardBrowseCard`. An effect watching the `flipped` prop sets `isFlipping = true` when `flipped` changes (skipping the first mount so a card that mounts already-flipped in reverse mode does not hide the button), then clears it after 600ms via a timeout. The timeout is cleaned up on the next flip and on unmount, so rapid flips and card-change remounts never leave the button stuck hidden. When `prefers-reduced-motion: reduce` matches, the effect skips the hide entirely (flip is instant). The button gets an opacity transition plus, while `isFlipping`, `opacity-0` and `pointer-events-none` — a smooth fade out and back in that also blocks clicks on the invisible button.

## Critical Implementation Details

- **First-render skip**: because both consumers remount the card per `key={card.id}`, the component can mount with `flipped` already `true` (reverse mode). A naive `useEffect([flipped])` runs on mount and would hide the button on every card change. Guard the effect with a `useRef` "mounted" flag (or a ref holding the previous `flipped` value) so the hide fires only on a genuine change of an already-mounted card, not on initial render.
- **Reduced-motion**: read `window.matchMedia("(prefers-reduced-motion: reduce)").matches` inside the effect (client-only code path — these islands are `client:only`, per lesson *localStorage w wyspie*). If reduced motion is on, do not enter the flipping state. Wrap in a `typeof window`/`matchMedia` existence check for safety.
- **Timeout hygiene**: store the timeout id in a ref; clear it at the start of each effect run and in the effect cleanup, so back-to-back flips and unmounts cannot leak a timer that re-shows or stays hidden.

## Phase 1: Hide the speaker button during the flip

### Overview

Introduce the `isFlipping` state and drive the button's opacity + interactivity from it, honoring reduced-motion and the per-card remount semantics. Add test coverage.

### Changes Required:

#### 1. Flip-aware hide state and button styling

**File**: `src/components/sets/FlashcardBrowseCard.tsx`

**Intent**: Hide the speaker button (smooth fade, non-interactive) while a flip animation is running, and restore it when the flip completes — without hiding on initial mount, on card change, or under reduced-motion.

**Contract**:
- New local state `isFlipping: boolean` (default `false`).
- An effect keyed on `flipped` that: (a) skips the first run via a mounted-ref guard; (b) returns early if `prefers-reduced-motion: reduce` matches; (c) otherwise sets `isFlipping = true`, clears any prior timeout, and schedules a 600ms timeout that sets `isFlipping = false`. Cleanup clears the pending timeout (use a `useRef<ReturnType<typeof setTimeout>>` for the id). The 600ms mirrors `global.css:126` — add a brief comment noting the coupling.
- The existing `<Button>` (`FlashcardBrowseCard.tsx:47-60`) gains an opacity transition (e.g. `transition-opacity`) and, when `isFlipping`, `opacity-0 pointer-events-none`, merged via the existing `cn(...)` helper. Keep all current classes (`absolute top-3 right-3 z-10 ...`).
- No change to `speak`, `status`, voice resolution, props, or the flip markup.

### Success Criteria:

#### Automated Verification:

- [ ] Type checking / build passes: `npm run build`
- [ ] Lint passes on the changed file: `npx eslint src/components/sets/FlashcardBrowseCard.tsx` (project-wide `npm run lint` may crash on `.astro` — see lesson; scoped lint is the reliable check)
- [ ] Component tests pass: `npm test -- FlashcardBrowseCard`

#### Manual Verification:

- [ ] On `/browse`, clicking the card fades the speaker button out during the flip and fades it back in after the rotation settles.
- [ ] Same behavior on `/review` when revealing the back.
- [ ] Advancing to the next card shows the button immediately (no flicker / no stuck-hidden state).
- [ ] Rapid back-and-forth flipping keeps the button in sync (never stuck hidden).
- [ ] With OS "reduce motion" enabled, the button stays visible throughout (flip is instant).
- [ ] While hidden, the button cannot be clicked to trigger TTS.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before considering the change done.

---

## Testing Strategy

### Unit / Component Tests (`src/components/sets/__tests__/FlashcardBrowseCard.test.tsx`):

- Re-rendering with a toggled `flipped` prop transitions the button to the hidden state (assert the `opacity-0` / `pointer-events-none` classes are applied on flip). Use fake timers to advance 600ms and assert the button returns to visible.
- Initial mount with `flipped={true}` (reverse-mode remount case) does **not** hide the button.
- Existing tests (render, voice/text resolution, speak on click) continue to pass.

Note on reduced-motion: jsdom's `window.matchMedia` is not implemented by default. If a reduced-motion-path test is added, stub `window.matchMedia`; otherwise keep the reduced-motion branch as manual-only verification and ensure the default test env reports "no preference" (matchMedia stub returning `matches: false`) so the hide path is exercised.

### Manual Testing Steps:

1. Open a set's `/browse`, click a card, watch the speaker button fade out then back in.
2. Repeat on `/review` (reveal the back).
3. Click "next" / advance — button is immediately visible.
4. Flip rapidly several times — button always recovers.
5. Enable OS reduce-motion, reload, flip — button stays visible.

## Performance Considerations

Negligible: one boolean state, one 600ms timeout per flip, one `matchMedia` read per flip. No new renders beyond the flip itself.

## Migration Notes

None — pure client-side UI behavior, no data or schema changes.

## References

- Shared component: `src/components/sets/FlashcardBrowseCard.tsx:19`
- Flip CSS + duration: `src/styles/global.css:121-149`
- Consumers (remount via key): `src/components/sets/FlashcardBrowseView.tsx:115`, `src/components/review/ReviewSession.tsx:327`
- Lesson — remount by key avoids transition on content swap: `context/foundation/lessons.md` (*flashcard-reverse-front-flash*)
- Lesson — client-only islands read client APIs safely: `context/foundation/lessons.md` (*localStorage w wyspie Astro*)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Hide the speaker button during the flip

#### Automated

- [x] 1.1 Type checking / build passes: `npm run build` — 754361b
- [x] 1.2 Lint passes on the changed file: `npx eslint src/components/sets/FlashcardBrowseCard.tsx` — 754361b
- [x] 1.3 Component tests pass: `npm test -- FlashcardBrowseCard` — 754361b

#### Manual

- [x] 1.4 On `/browse`, clicking the card fades the button out during the flip and back in after — 754361b
- [x] 1.5 Same behavior on `/review` when revealing the back — 754361b
- [x] 1.6 Advancing to the next card shows the button immediately (no flicker) — 754361b
- [x] 1.7 Rapid back-and-forth flipping keeps the button in sync (never stuck hidden) — 754361b
- [x] 1.8 With OS reduce-motion enabled, the button stays visible throughout — 754361b
- [x] 1.9 While hidden, the button cannot be clicked to trigger TTS — 754361b
