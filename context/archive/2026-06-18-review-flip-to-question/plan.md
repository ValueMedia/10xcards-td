# Flip Flashcard Back to Question During Review — Implementation Plan

## Overview

On the `/sets/[id]/review` view, once the learner reveals a card's answer they can no longer see the question again — flipping is one-way. This plan makes the card flippable in both directions after reveal (Space / Enter / clicking the card), while keeping the grade buttons (and `1`–`4` shortcuts) available regardless of which side is currently showing. Selecting a grade still closes the card and advances.

## Current State Analysis

`src/components/review/ReviewSession.tsx` holds a single boolean `flipped` (`:50`) that conflates two distinct concepts:

- **Whether the answer has been revealed** — gates the reveal button vs. the grade buttons (`:259`) and the hint lines (`:289-290`).
- **Which side is currently shown** — passed to `FlashcardBrowseCard` as `flipped` (`:252`).

Because they share one boolean, flipping back to the question would also hide the grade buttons and bring back "Pokaż odpowiedź". Both flip triggers are also deliberately one-way:

- Card click: `onFlip={() => { if (!flipped) setFlipped(true); }}` (`:253-255`)
- Keyboard: `if (e.key === " " || e.key === "Enter") { ...; if (!flipped) setFlipped(true); }` (`:139-141`)

`src/components/sets/FlashcardBrowseCard.tsx` already supports bidirectional flipping — its `onClick`/`onKeyDown` call `onFlip` unconditionally and the aria-label already reads "Answer — click to flip back" (`:17-21`). No change is needed there; the gate is entirely in the parent.

### Key Discoveries:

- `ReviewSession.tsx:50` — single `flipped` state is the root constraint; must split into reveal-latch + current-side.
- `ReviewSession.tsx:135-153` — global keydown handler; Space/Enter currently only reveal, `1`–`4` grade only when revealed.
- `ReviewSession.tsx:253-255` — card `onFlip` is one-way.
- `ReviewSession.tsx:259` / `:289-290` — reveal-vs-grade UI and hint lines gate on `flipped`; must gate on the reveal-latch.
- `ReviewSession.tsx:124` — `handleRate` resets `flipped` when advancing; must reset both new states.
- `FlashcardBrowseCard.tsx:17-21` — already toggles both ways; the `flipped` prop is purely "which side shows".
- ReviewSession is intentionally out of i18n scope (Polish-only) per the i18n plan's "What We're NOT Doing" — keep hardcoded Polish strings; no `t()`.

## Desired End State

During a review, after the learner reveals the answer:

- Pressing Space or Enter, or clicking the card, flips it between question and answer, repeatedly.
- The grade buttons (Nie wiem / Trudne / Wiem / Łatwe) and the `1`–`4` shortcuts remain active no matter which side is showing.
- Choosing a grade records it and moves to the next card.
- The next card always starts on the question side, un-revealed (unchanged behavior).

Verify by running a review session: reveal an answer, flip back to the question and forward again via each trigger, confirm grade buttons stay visible and gradeable from either side, and confirm the next card resets to the question.

## What We're NOT Doing

- No i18n / translation of ReviewSession strings (explicitly out of scope; this component stays Polish).
- No changes to `FlashcardBrowseCard` (already supports bidirectional flip).
- No changes to the hint text wording (only the gating condition changes; same strings).
- No changes to grading logic, API calls, scoring, or session summary.
- No flip animation changes, no new keyboard shortcuts beyond reusing Space/Enter for toggle.
- No persistence of "preferred side" across cards.

## Implementation Approach

Replace the single `flipped` boolean with two states:

- `revealed: boolean` — latches `true` the first time the answer is shown; controls the reveal-button-vs-grade-buttons branch and the hint lines. Reset to `false` on each new card.
- `showingBack: boolean` — which side is currently displayed; passed to `FlashcardBrowseCard`. Reset to `false` on each new card.

Triggers:

- Reveal (when `!revealed`): Space / Enter / card click / "Pokaż odpowiedź" button → set `revealed = true` and `showingBack = true`.
- Toggle (when `revealed`): Space / Enter / card click → invert `showingBack`.
- Grade (when `revealed`): keys `1`–`4` or grade buttons → existing `handleRate`, independent of `showingBack`.

## Phase 1: Flip-back interaction in ReviewSession

### Overview

Split the flip state and rewire the card, keyboard handler, button branch, hint lines, and per-card reset so the answer can be revealed once and then flipped freely, with grading available from either side.

### Changes Required:

#### 1. Split flip state

**File**: `src/components/review/ReviewSession.tsx`

**Intent**: Replace the single `flipped` state with `revealed` (reveal latch) and `showingBack` (current side) so revealing and side-toggling are independent.

**Contract**: Remove `const [flipped, setFlipped] = useState(false)` (`:50`). Add `const [revealed, setRevealed] = useState(false)` and `const [showingBack, setShowingBack] = useState(false)`. All later references to `flipped` are replaced per the items below.

#### 2. Card flip handler (reveal + toggle)

**File**: `src/components/review/ReviewSession.tsx`

**Intent**: Make clicking the card reveal the answer the first time, and toggle sides thereafter.

**Contract**: `FlashcardBrowseCard` receives `flipped={showingBack}` and an `onFlip` that does: if `!revealed` → `setRevealed(true); setShowingBack(true)`; else → `setShowingBack((s) => !s)` (`:252-256`).

#### 3. Keyboard handler (reveal + toggle, grading unchanged)

**File**: `src/components/review/ReviewSession.tsx`

**Intent**: Space/Enter reveal on first press, then toggle sides; `1`–`4` grade once revealed, regardless of side.

**Contract**: In the keydown handler (`:135-153`): on `" "`/`Enter`, `preventDefault()` then if `!revealed` reveal (set both true), else invert `showingBack`. The `1`–`4` branch gates on `revealed && !submitting` (was `flipped && !submitting`). Keep the existing `closest("button, input")` early-return guard. Update the effect dependency array (`flipped` → `revealed`).

#### 4. Reveal-vs-grade button branch

**File**: `src/components/review/ReviewSession.tsx`

**Intent**: Keep grade buttons visible once revealed, even when the question side is showing.

**Contract**: The `{!flipped ? <Pokaż odpowiedź> : <grade buttons>}` branch (`:259-287`) gates on `!revealed`. The "Pokaż odpowiedź" button `onClick` sets `revealed = true` and `showingBack = true` (`:261-263`).

#### 5. Hint lines

**File**: `src/components/review/ReviewSession.tsx`

**Intent**: Preserve current hint wording; only change what they gate on.

**Contract**: `{!flipped && <Space / Enter — pokaż odpowiedź>}` → gate on `!revealed`; `{flipped && <1 – 4 — oceń kartę>}` → gate on `revealed` (`:289-290`). Text unchanged.

#### 6. Per-card reset

**File**: `src/components/review/ReviewSession.tsx`

**Intent**: Each new card starts un-revealed on the question side.

**Contract**: In `handleRate`, where it advances (`setCurrentIndex(nextIdx); setFlipped(false)` at `:123-124`), reset `setRevealed(false); setShowingBack(false)`.

### Success Criteria:

#### Automated Verification:

- [ ] 1.1 Build passes (includes astro check): `npm run build`
- [ ] 1.2 Tests pass: `npx vitest run`

#### Manual Verification:

- [ ] 1.3 Reveal an answer via the "Pokaż odpowiedź" button; grade buttons + "1 – 4" hint appear.
- [ ] 1.4 After reveal, Space toggles question ↔ answer repeatedly; grade buttons stay visible on both sides.
- [ ] 1.5 After reveal, Enter toggles the same way as Space.
- [ ] 1.6 After reveal, clicking the card toggles the same way.
- [ ] 1.7 Grading via keys `1`–`4` works while the question side is showing (not only the answer side).
- [ ] 1.8 Grading via the grade buttons works from either side and advances to the next card.
- [ ] 1.9 The next card starts on the question side, un-revealed (Space/Enter reveal again).
- [ ] 1.10 Before reveal, Space/Enter/card click still only reveal (no premature grading).

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation that the manual testing was successful.

## Testing Strategy

### Manual Testing Steps:

1. Start a review with at least 2 due cards.
2. Reveal the first card's answer (button), then flip back to the question with Space, forward with Space, back with Enter, forward by clicking the card — confirm grade buttons stay visible throughout.
3. With the question side showing, press `3` (Wiem) — confirm it records and advances.
4. On the next card, confirm it starts on the question with no grade buttons; reveal again and grade via a grade button.
5. Confirm completing all cards still reaches the summary screen unchanged.

## References

- Component under change: `src/components/review/ReviewSession.tsx`
- Flip card (unchanged, already bidirectional): `src/components/sets/FlashcardBrowseCard.tsx:10-42`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Flip-back interaction in ReviewSession

#### Automated

- [x] 1.1 Build passes (includes astro check): `npm run build` — 9c5c346
- [x] 1.2 Tests pass: `npx vitest run` — 9c5c346

#### Manual

- [x] 1.3 Reveal via button shows grade buttons + "1 – 4" hint — 9c5c346
- [x] 1.4 After reveal, Space toggles both ways; grade buttons stay on both sides — 9c5c346
- [x] 1.5 After reveal, Enter toggles like Space — 9c5c346
- [x] 1.6 After reveal, clicking the card toggles — 9c5c346
- [x] 1.7 Keys 1–4 grade while the question side is showing — 9c5c346
- [x] 1.8 Grade buttons work from either side and advance — 9c5c346
- [x] 1.9 Next card resets to question, un-revealed — 9c5c346
- [x] 1.10 Before reveal, Space/Enter/click only reveal (no premature grading) — 9c5c346
