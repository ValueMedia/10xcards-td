# Flashcard Reverse Mode Implementation Plan

## Overview

Add a per-set "reverse mode" to the browse (`/sets/[id]/browse`) and review (`/sets/[id]/review`) screens. When reverse mode is on, a flashcard shows its **Back** text first and reveals the **Front** on flip — the inverse of the current Front-first behavior. The preference is toggled from a switch in a row above the flashcard list on the set page, defaults to off (false), and is persisted per-set in `localStorage` only when the user changes it.

## Current State Analysis

- **Shared card component** `src/components/sets/FlashcardBrowseCard.tsx` renders both faces: a front face labeled "Question" showing the `front` prop, and a back face labeled "Answer" showing the `back` prop. A `flipped` boolean controls which face is visible via CSS transform. Both browse and review reuse this component.
- **Browse** (`src/components/sets/FlashcardBrowseView.tsx:13-132`) holds `flipped` state initialized to `false`, resets it to `false` on `goNext`/`goPrev`/`shuffle`, and passes `front={currentCard.front}` / `back={currentCard.back}` to the card.
- **Review** (`src/components/review/ReviewSession.tsx:46-308`) holds `revealed` (latch: prompt vs grade buttons) and `showingBack` (current visible side). It starts at front (`showingBack=false`), and "Pokaż odpowiedź" sets both `revealed` and `showingBack` to true. After reveal, click/Space/Enter toggle `showingBack`. Advancing a card resets both to false. This split came from the prior `review-flip-to-question` change.
- **Set page** `src/components/sets/SetDetailPage.tsx` is a `client:load` island. The header area (lines 110-201) is a title block plus a responsive grid of action buttons, sitting directly above `<FlashcardList>` (line 203).
- **Data shape**: `Flashcard` has `front: string` and `back: string` (`src/types.ts:22-23`).
- **No `localStorage` usage anywhere** in `src/**`; **no** `src/components/hooks/` directory; **no** shadcn `Switch` component installed (no `@radix-ui/react-switch` dependency).

## Desired End State

- On the set page, a labeled switch sits in a row directly above the flashcard list. Toggling it persists the choice to `localStorage` under `reverseMode:<setId>` and reflects immediately. On reload, the switch shows the persisted value (defaults off when absent).
- On `/browse`, with reverse on, each card shows its **Back** text first; flip (click / Space) reveals the **Front**. Navigation and shuffle reset to the Back side. With reverse off, behavior is unchanged (Front first).
- On `/review`, with reverse on, each card's prompt is the **Back** text; "Pokaż odpowiedź" reveals the **Front**; flip toggles between the two; advancing resets to the Back-first prompt. Grading is unchanged. With reverse off, behavior is unchanged.
- Card faces are labeled **Front** / **Back** (replacing Question / Answer) so the label always names the real card field regardless of mode and which side is shown first.

### Key Discoveries:

- `FlashcardBrowseCard` is shared by both screens (`FlashcardBrowseView.tsx:97`, `ReviewSession.tsx:256`) — relabeling and any face logic must stay consistent for both.
- Browse/review components are `client:load` islands, so reading `localStorage` in a `useState` initializer (with a `typeof window` guard) is safe and avoids a Front→Back flash.
- The set-page toggle and the browse/review consumers live on **separate page loads / separate islands** — they coordinate purely through `localStorage`, no shared React state needed.
- Reverse must compose with the existing `revealed` + `showingBack` split in review (the `review-flip-to-question` design): reverse changes *which field maps to the prompt/answer side*, not the latch logic.

## What We're NOT Doing

- Not applying reverse mode to the public share page (`/share`) or any other view — browse + review only.
- Not persisting the preference server-side or per-user; it is per-set, client-only (`localStorage`).
- Not changing grading, the spaced-repetition API, session summary, shuffle algorithm, or keyboard-shortcut semantics.
- Not adding animations or restyling the card beyond the label text change.
- Not adding a toggle to the browse/review screens themselves — the only control is on the set page.

## Implementation Approach

Keep `FlashcardBrowseCard` "dumb": its front face always renders the `front` prop labeled "Front", its back face always renders `back` labeled "Back", and the `flipped` prop selects the visible face. Do **not** swap props anywhere. Reverse mode is expressed entirely by *which face the consumer treats as the starting/prompt side* — i.e. the initial and reset value of the "showing back" state flips from `false` to `true`.

A single shared hook `useReverseMode(setId)` owns the `localStorage` key naming and SSR guard, returning `[reverse, setReverse]`. The set page uses both (read + write); browse and review use only the read value to seed their initial showing state.

## Phase 1: Foundation & Set-Page Toggle

### Overview

Add the building blocks (Switch component, persistence hook), relabel the shared card, and wire the toggle into the set page. No browse/review behavior change yet.

### Changes Required:

#### 1. shadcn Switch component

**File**: `src/components/ui/switch.tsx` (new, via `npx shadcn@latest add switch`)

**Intent**: Provide the toggle control, consistent with the project's new-york shadcn setup and accessible by default.

**Contract**: Standard shadcn `Switch` export backed by `@radix-ui/react-switch` (added to `package.json`). Default generated file — no custom API.

#### 2. Reverse-mode persistence hook

**File**: `src/components/hooks/useReverseMode.ts` (new; create the `hooks/` directory)

**Intent**: Centralize the per-set preference: read the initial value from `localStorage` and expose a setter that persists changes. This is the single source of truth for the key name and SSR guard.

**Contract**: `useReverseMode(setId: string): [boolean, (value: boolean) => void]`. Reads `localStorage.getItem(\`reverseMode:${setId}\`) === "true"` inside a `useState` initializer guarded by `typeof window !== "undefined"` (defaults `false`). The setter updates state and writes `"true"`/`"false"` to the same key. No write occurs on mount (only on explicit set), matching "saved only when the user changes it".

#### 3. Relabel shared card faces

**File**: `src/components/sets/FlashcardBrowseCard.tsx`

**Intent**: Replace the "Question"/"Answer" face labels with "Front"/"Back" so the label always names the real card field, independent of mode or shown order.

**Contract**: The two `<span>` labels change text ("Question" → "Front" at line 28, "Answer" → "Back" at line 36). No prop or structural change; the `front` prop stays on the front face, `back` on the back face. The `aria-label` wording on the container (line 17) is updated to neutral phrasing ("Front side — click to flip" / "Back side — click to flip") to stay accurate in both modes.

#### 4. Toggle row on the set page

**File**: `src/components/sets/SetDetailPage.tsx`

**Intent**: Add a row containing a labeled Switch directly above the flashcard list; toggling persists the per-set reverse preference.

**Contract**: Insert a new row between the action-button grid (closes at line 201) and `<FlashcardList>` (line 203). It uses `useReverseMode(set.id)` and renders the `Switch` with a visible label (e.g. "Reverse mode (Back first)"). The row is shown whenever the set has flashcards (mirror the Browse-button gating), and is hidden/disabled when there are no cards. No change to existing flashcard CRUD state.

### Success Criteria:

#### Automated Verification:

- Type checking passes (build): `npm run build`
- Linting passes on changed TS/TSX: `npx eslint src/components/hooks/useReverseMode.ts src/components/sets/SetDetailPage.tsx src/components/sets/FlashcardBrowseCard.tsx src/components/ui/switch.tsx`
- `@radix-ui/react-switch` is present in `package.json` dependencies.

#### Manual Verification:

- The set page shows a "Reverse mode" switch in a row above the flashcard list.
- Toggling the switch on, then reloading the page, shows the switch still on; `localStorage` has `reverseMode:<setId> = "true"`.
- Toggling it back off updates `localStorage` to `"false"` and persists across reload.
- A fresh set with no stored value shows the switch off and has no `reverseMode:<setId>` key until toggled.
- Browse/review card faces now read "Front"/"Back"; existing Front-first behavior is unchanged.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Apply Reverse Mode on Browse & Review

### Overview

Consume `useReverseMode` in the browse and review screens so that, when on, the card starts on the Back side and flip reveals the Front, with correct reset on navigation/advance.

### Changes Required:

#### 1. Browse: start on Back when reverse is on

**File**: `src/components/sets/FlashcardBrowseView.tsx`

**Intent**: Seed and reset the visible side from the reverse preference instead of always starting on the front.

**Contract**: Call `const [reverse] = useReverseMode(setId)`. Initialize `flipped` to `reverse` instead of `false`, and replace the three `setFlipped(false)` resets (in `goNext` line 25, `goPrev` line 36, `shuffle` line 54) with `setFlipped(reverse)`. The card's `front`/`back` props and the `flip` toggle are unchanged. The keyboard hint text may stay as-is.

#### 2. Review: prompt on Back when reverse is on

**File**: `src/components/review/ReviewSession.tsx`

**Intent**: Make the Back text the prompt and the Front text the revealed answer when reverse is on, while preserving the `revealed` latch and bidirectional flip from the `review-flip-to-question` design.

**Contract**: Call `const [reverse] = useReverseMode(setId)`. The "prompt side" of the card corresponds to `flipped = reverse` and the "answer side" to `flipped = !reverse`. Concretely: initialize `showingBack` to `reverse`; in the reveal action ("Pokaż odpowiedź" button at line 273-281, card `onFlip` at line 260-267, and the keyboard reveal at line 143-148) set `showingBack` to the answer side (`!reverse`) when first revealing; the post-reveal toggle (`setShowingBack((s) => !s)`) is unchanged; on advancing to the next card (lines 125-126) reset `showingBack` to `reverse` (and `revealed` to false). Grading, summary, and API calls are untouched.

**Contract note**: Because `FlashcardBrowseCard`'s `flipped=true` shows the `back` prop, mapping "prompt = Back" to `showingBack=reverse` makes the prompt render the Back text when `reverse` is true and the Front text when false — exactly the desired inversion, with labels remaining accurate.

### Success Criteria:

#### Automated Verification:

- Type checking passes (build): `npm run build`
- Linting passes on changed files: `npx eslint src/components/sets/FlashcardBrowseView.tsx src/components/review/ReviewSession.tsx`

#### Manual Verification:

- With reverse **on**: `/browse` shows the Back text first; click/Space reveals the Front; Next/Prev/Shuffle return to the Back side.
- With reverse **on**: `/review` shows the Back text as the prompt; "Pokaż odpowiedź" (and Space/Enter) reveals the Front; flipping back and forth works; grading advances and the next card starts on the Back prompt.
- With reverse **off**: both screens behave exactly as before (Front first).
- Changing the toggle on the set page, then navigating to browse/review, reflects the new mode without a visible Front→Back flash on load.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation.

---

## Testing Strategy

### Manual Testing Steps:

1. On a set with cards, toggle Reverse mode on; reload — switch stays on, `localStorage` shows `reverseMode:<setId>="true"`.
2. Open `/browse` — first face is the Back text labeled "Back"; flip reveals the Front; Next/Prev/Shuffle reset to Back.
3. Open `/review` — prompt is the Back text; reveal shows the Front; flip toggles; grade and advance — next card prompts with Back.
4. Toggle Reverse mode off; confirm both screens revert to Front-first.
5. On a set never toggled, confirm switch is off and no `reverseMode` key exists.

## Performance Considerations

None — a single synchronous `localStorage` read/write per island mount and per toggle.

## Migration Notes

None. Absent `localStorage` key is treated as `false`, so existing users default to current behavior.

## References

- Shared card: `src/components/sets/FlashcardBrowseCard.tsx`
- Browse: `src/components/sets/FlashcardBrowseView.tsx`
- Review: `src/components/review/ReviewSession.tsx` (builds on `context/archive/.../review-flip-to-question` design; active folder `context/changes/review-flip-to-question/plan-brief.md`)
- Set page: `src/components/sets/SetDetailPage.tsx`
- Types: `src/types.ts:19-24`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Foundation & Set-Page Toggle

#### Automated

- [x] 1.1 Type checking passes (build): `npm run build` — 08f6c65
- [x] 1.2 Linting passes on changed TS/TSX files — 08f6c65
- [x] 1.3 `@radix-ui/react-switch` present in `package.json` — 08f6c65

#### Manual

- [x] 1.4 Set page shows a "Reverse mode" switch in a row above the flashcard list — 08f6c65
- [x] 1.5 Toggling on + reload persists on; `localStorage` has `reverseMode:<setId>="true"` — 08f6c65
- [x] 1.6 Toggling off updates `localStorage` to `"false"` and persists across reload — 08f6c65
- [x] 1.7 Fresh set shows switch off with no `reverseMode` key until toggled — 08f6c65
- [x] 1.8 Card faces read "Front"/"Back"; existing Front-first behavior unchanged — 08f6c65

### Phase 2: Apply Reverse Mode on Browse & Review

#### Automated

- [x] 2.1 Type checking passes (build): `npm run build` — 13eee88
- [x] 2.2 Linting passes on changed files — 13eee88

#### Manual

- [x] 2.3 Reverse on: `/browse` shows Back first; flip reveals Front; Next/Prev/Shuffle reset to Back — 13eee88
- [x] 2.4 Reverse on: `/review` prompts with Back; reveal shows Front; flip toggles; grading advances with Back-first next card — 13eee88
- [x] 2.5 Reverse off: both screens behave exactly as before (Front first) — 13eee88
- [x] 2.6 Toggle change reflected on browse/review without a Front→Back flash on load — 13eee88
