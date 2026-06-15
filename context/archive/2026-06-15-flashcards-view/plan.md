# Flashcard Browse View Implementation Plan

## Overview

Add a read-only flashcard browse view accessible from the set detail page. The view shows one card at a time with a Quizlet-style 3D flip animation (front → back), navigation controls (prev/next), a card counter (e.g. 2/10), a shuffle button, and a back link to the set. Implemented as a new SSR route `/sets/[id]/browse` + two new React components, with 3D CSS flip utilities added to the global stylesheet.

## Current State Analysis

- Set detail page: `src/pages/sets/[id]/index.astro` fetches all flashcards via `getSetWithFlashcards` and mounts `SetDetailPage.tsx` via `client:load`
- Existing flip behavior in `ReviewSession.tsx` and `FlashcardProposalCard.tsx` is plain state-conditional DOM toggle — no CSS animation
- No 3D perspective transforms exist anywhere in the project; `tw-animate-css` is installed but underutilised
- The `[id]/` directory already exists (renamed from `[id].astro` for the review route), so adding `browse.astro` requires no restructuring — lessons.md route-conflict rule is not triggered
- `getSetWithFlashcards` returns `{ set: FlashcardSet, flashcards: Flashcard[] }` — suitable for server-side rendering the browse view without an extra API call

## Desired End State

Users see a "Browse" button on the set detail page. Clicking it opens `/sets/[id]/browse` — a full-page view showing one flashcard at a time, centered, large, with animated 3D flip on click. Navigation arrows and keyboard shortcuts (← → Space) move between cards and flip them. A shuffle button randomises order in-session. The back link returns to the set. The button is disabled (with tooltip) when the set has zero flashcards.

### Key Discoveries

- `src/pages/sets/[id]/review.astro:1-31` — exact template to follow for browse.astro (prerender false, getSetByIdForUser, redirect on missing, Layout wrapper with React component)
- `src/components/sets/SetDetailPage.tsx:126-131` — "Rozpocznij sesję" link styled as button is the visual pattern for the Browse link
- `src/styles/global.css:113-115` — `@utility bg-cosmic` is the only custom utility; adding flip utilities follows the same pattern
- `src/types.ts` — `Flashcard` has `front: string`, `back: string`, `id: string`; no additional fields needed

## What We're NOT Doing

- No editing, grading, or FSRS state changes — browse is read-only
- No persistence of shuffle state or last-viewed card between sessions
- No share/public access — browse route is owner-only (same as `/sets/[id]/review`)
- No swipe gesture support (mobile users use tap-to-flip + arrow buttons)
- No progress indicator beyond the counter (no progress bar)

## Implementation Approach

Three phases in dependency order: (1) CSS primitives + card component, (2) the full browse view component, (3) Astro route and the trigger button in SetDetailPage. Each phase is independently verifiable before the next starts.

The 3D flip uses the standard CSS `perspective` / `transform-style: preserve-3d` / `backface-visibility: hidden` / `rotateY(180deg)` pattern. Five `@utility` classes in `global.css` keep Tailwind's JIT happy without arbitrary-property hacks. The card component receives `flipped: boolean` and `onFlip: () => void` as props — it is a pure display component with no internal state. All session state (position, order, flipped) lives in `FlashcardBrowseView`.

## Critical Implementation Details

**Absolute positioning for flip faces**: Both `.card-flip-face` elements are `position: absolute; inset: 0`. Their parent `.card-flip-inner` must be `position: relative` with an explicit height (set via Tailwind on the wrapper `<div>`). Without `position: relative` on the inner element the faces escape the container.

**Transition on `card-flip-inner-flipped`**: The `transition: transform 0.6s` must be declared on `card-flip-inner`, not on `card-flip-inner-flipped`. Declaring it on the flipped state only means the un-flip has no animation.

**Keyboard handler closure**: The `keydown` useEffect depends on `position`, `flipped`, and `order` to call the correct derived handlers. Use `useCallback` for `goNext`/`goPrev`/`flip` and include them in the dependency array, or place the entire handler logic inline with the primitives in scope.

---

## Phase 1: CSS flip utilities + FlashcardBrowseCard component

### Overview

Add five `@utility` classes to `global.css` that implement the CSS 3D flip card pattern, then create `FlashcardBrowseCard.tsx` — a pure display component that uses them.

### Changes Required

#### 1. Global CSS — 3D flip utilities

**File**: `src/styles/global.css`

**Intent**: Add five utility classes that implement the CSS 3D flip-card pattern. These replace arbitrary-property Tailwind hacks which are verbose and don't support vendor prefixes.

**Contract**:
```css
@utility card-flip-container {
  perspective: 1200px;
}

@utility card-flip-inner {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

@utility card-flip-inner-flipped {
  transform: rotateY(180deg);
}

@utility card-flip-face {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

@utility card-flip-back {
  transform: rotateY(180deg);
}
```

---

#### 2. FlashcardBrowseCard component

**File**: `src/components/sets/FlashcardBrowseCard.tsx`

**Intent**: A controlled, pure-display card that shows either `front` or `back` depending on `flipped`, with 3D rotation animation. All flip state is owned by the parent.

**Contract**:
```ts
interface Props {
  front: string;
  back: string;
  flipped: boolean;
  onFlip: () => void;
}
```

The outer wrapper is `card-flip-container w-full` with `style={{ height: '320px' }}` (explicit height required for absolute-positioned faces). Inside is a `card-flip-inner cursor-pointer` div that gains `card-flip-inner-flipped` when `flipped` is true. Both face divs use `card-flip-face` plus the app's card styling (`bg-white/5 border border-white/10 backdrop-blur-xl rounded-2xl`). The back face additionally carries `card-flip-back`. Both faces centre their text (`flex items-center justify-center p-8`). The front face has a small "Click to flip" hint at the bottom (`absolute bottom-4 text-xs text-blue-100/30`). Clicking anywhere on the outer wrapper calls `onFlip`.

---

### Success Criteria

#### Automated Verification

- Type checking passes: `npm run lint`
- No TypeScript errors on the new file

#### Manual Verification

- Card renders with visible front text and dark card styling matching the app
- Clicking the card triggers a smooth 3D rotation (~600 ms) revealing the back
- Clicking again rotates back to front
- No visual glitch (faces are not simultaneously visible mid-animation)

**Implementation Note**: Pause here for manual confirmation before Phase 2.

---

## Phase 2: FlashcardBrowseView component

### Overview

Create the full browse session component that manages card order, position, flip state, shuffle, keyboard shortcuts, and renders the header/navigation UI.

### Changes Required

#### 1. FlashcardBrowseView component

**File**: `src/components/sets/FlashcardBrowseView.tsx`

**Intent**: Session-level state container for the browse view. Handles all user interactions and renders the complete page layout — header bar, card, counter, navigation, and keyboard listener.

**Contract**:
```ts
interface Props {
  setId: string;
  setName: string;
  flashcards: Flashcard[];  // from src/types.ts
}
```

**State**:
- `order: number[]` — indices into `flashcards`, initially `[0, 1, ..., n-1]`
- `position: number` — current index into `order`, starts at 0
- `flipped: boolean` — whether the current card shows its back, starts false

**Derived**:
- `currentCard = flashcards[order[position]]`
- `isFirst = position === 0`
- `isLast = position === order.length - 1`

**Handlers**:
- `goNext()`: if not last → `setPosition(p + 1)`, `setFlipped(false)`
- `goPrev()`: if not first → `setPosition(p - 1)`, `setFlipped(false)`
- `flip()`: `setFlipped(f => !f)`
- `shuffle()`: Fisher-Yates on a copy of `[0..n-1]`, then `setOrder(shuffled)`, `setPosition(0)`, `setFlipped(false)`

**Keyboard handler** (useEffect with `[goNext, goPrev, flip]` deps):
- `ArrowRight` → `goNext()`
- `ArrowLeft` → `goPrev()`
- `Space` → `e.preventDefault()`, `flip()`

**Layout**:

Top bar (`flex items-center justify-between mb-8`):
- Left: `<a href={/sets/${setId}}>` with BackIcon + set name, styled like SetDetailPage's back link
- Right: Shuffle button (`Button variant="outline"` with ShuffleIcon)

Card area (`flex flex-col items-center gap-6`):
- `FlashcardBrowseCard` with `front`, `back`, `flipped`, `onFlip={flip}`  
- Counter: `<p className="text-sm text-blue-100/40">{position + 1} / {flashcards.length}</p>`
- Navigation row: `<Button variant="ghost" size="icon">` prev arrow | counter text | `<Button variant="ghost" size="icon">` next arrow; prev disabled when `isFirst`, next disabled when `isLast`

Keyboard hint below navigation: `<p className="mt-4 text-xs text-blue-100/30">← → navigate · Space flip</p>`

Outer wrapper: `bg-cosmic min-h-screen p-4 text-white` with an inner `mx-auto max-w-2xl`.

---

### Success Criteria

#### Automated Verification

- Type checking passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification

- Counter shows correct `n / total` and updates when navigating
- Prev is disabled on card 1, next is disabled on the last card
- Navigating to a new card always shows the front (flip resets)
- Shuffle re-orders cards and resets to position 1/total
- Keyboard: ArrowRight/ArrowLeft navigate, Space flips (no page scroll on Space)
- Layout is centred and card is large (~600 px wide on desktop)

**Implementation Note**: Pause here for manual confirmation before Phase 3.

---

## Phase 3: Astro route + Browse button in SetDetailPage

### Overview

Add `browse.astro` (mirrors `review.astro`) and a "Browse" link-button in `SetDetailPage.tsx`.

### Changes Required

#### 1. browse.astro — new SSR route

**File**: `src/pages/sets/[id]/browse.astro`

**Intent**: Server-renders the browse session with full flashcard data; redirects to the set page if the set is missing or has no cards.

**Contract**: Mirrors `review.astro` but uses `getSetWithFlashcards` (not just `getSetByIdForUser`) because the browse view needs all flashcard data upfront. The route exports `prerender = false`. If `data` is null or `data.flashcards.length === 0`, redirect to `/sets/${id}` (safety net — the button in SetDetailPage is disabled when there are no cards so this path should not be reached in normal use). Otherwise render:
```astro
<Layout title={`Browse — ${data.set.name}`}>
  <FlashcardBrowseView
    client:load
    setId={id}
    setName={data.set.name}
    flashcards={data.flashcards}
  />
</Layout>
```

---

#### 2. Browse button in SetDetailPage

**File**: `src/components/sets/SetDetailPage.tsx`

**Intent**: Add a "Browse" action in the header button row that links to `/sets/${set.id}/browse`. Disabled (with tooltip-like title attribute) when `flashcards.length === 0`.

**Contract**: Place the Browse element in the `flex flex-wrap items-center justify-end gap-2` div, between the Share button and "Rozpocznij sesję" link. When `flashcards.length > 0`, render an `<a href={/sets/${set.id}/browse}>` styled identically to "Rozpocznij sesję" but with a distinct colour (e.g., `bg-teal-700 hover:bg-teal-600`) and `<EyeIcon />` + "Browse" label. When `flashcards.length === 0`, render a `<button disabled title="Add flashcards first">` with the same visual style but `opacity-50 cursor-not-allowed`. Add an `EyeIcon` SVG function alongside the other icon functions at the bottom of the file (Lucide `eye` icon path).

---

### Success Criteria

#### Automated Verification

- Build succeeds: `npm run build`
- Type checking passes: `npm run lint`

#### Manual Verification

- "Browse" button appears on set detail page with correct icon and colour
- Button is visually disabled (muted, no pointer) when set has 0 flashcards
- Clicking Browse navigates to `/sets/[id]/browse`
- Back link in browse view returns to `/sets/[id]`
- Full end-to-end: open set → Browse → flip cards → shuffle → navigate with keyboard → return to set
- No regressions on set detail page (other buttons still work, dialogs open correctly)

---

## Testing Strategy

### Manual Testing Steps

1. Navigate to a set with multiple flashcards → confirm Browse button is visible
2. Create an empty set → confirm Browse button is disabled with tooltip "Add flashcards first"
3. Click Browse → confirm the first card front is shown, counter reads "1/N"
4. Click the card → confirm 3D flip animation (~600 ms), back text visible
5. Click next (→ button) → confirm counter advances, card resets to front
6. Press Space → confirm flip without page scroll
7. Press ArrowLeft/ArrowRight → confirm navigation
8. Reach last card → confirm next button is disabled
9. Click Shuffle → confirm order changes (front shows, counter resets to 1/N)
10. Click back link → confirm return to set detail page
11. Verify no regressions: create flashcard, edit flashcard, delete flashcard dialogs all still work

## References

- Pattern reference: `src/pages/sets/[id]/review.astro`
- State pattern: `src/components/sets/SetDetailPage.tsx`
- Type definitions: `src/types.ts` (Flashcard, FlashcardSet)
- CSS utilities pattern: `src/styles/global.css:113-115`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: CSS flip utilities + FlashcardBrowseCard component

#### Automated

- [x] 1.1 Type checking passes: `npm run lint` — 953080a

#### Manual

- [ ] 1.2 Card renders with visible front text and dark card styling matching the app
- [ ] 1.3 Clicking the card triggers a smooth 3D rotation (~600 ms) revealing the back
- [ ] 1.4 Clicking again rotates back to front
- [ ] 1.5 No visual glitch (faces are not simultaneously visible mid-animation)

### Phase 2: FlashcardBrowseView component

#### Automated

- [x] 2.1 Type checking passes: `npm run lint` — ae7225c
- [x] 2.2 Build succeeds: `npm run build` — ae7225c

#### Manual

- [ ] 2.3 Counter shows correct `n / total` and updates when navigating
- [ ] 2.4 Prev is disabled on card 1, next is disabled on the last card
- [ ] 2.5 Navigating to a new card always shows the front (flip resets)
- [ ] 2.6 Shuffle re-orders cards and resets to position 1/total
- [ ] 2.7 Keyboard: ArrowRight/ArrowLeft navigate, Space flips (no page scroll on Space)
- [ ] 2.8 Layout is centred and card is large (~600 px wide on desktop)

### Phase 3: Astro route + Browse button in SetDetailPage

#### Automated

- [x] 3.1 Build succeeds: `npm run build`
- [x] 3.2 Type checking passes: `npm run lint`

#### Manual

- [ ] 3.3 Browse button appears on set detail page with correct icon and colour
- [ ] 3.4 Button is visually disabled (muted, no pointer) when set has 0 flashcards
- [ ] 3.5 Clicking Browse navigates to `/sets/[id]/browse`
- [ ] 3.6 Back link in browse view returns to `/sets/[id]`
- [ ] 3.7 Full end-to-end flow works correctly
- [ ] 3.8 No regressions on set detail page
