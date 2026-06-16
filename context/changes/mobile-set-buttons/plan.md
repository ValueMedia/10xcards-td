# Fix Action Buttons Overflow on Mobile Set Detail View

## Overview

Action buttons on the set detail page (`SetDetailPage.tsx`) overflow on mobile because the grid uses a fixed 3-column layout with no responsive breakpoints. Texts like "Rozpocznij sesję", "Generate with AI", "Import CSV", and "New flashcard" don't fit in ~110-140px-wide buttons. This plan makes the button grid responsive, adds shorter mobile text labels, and increases vertical padding for better touch targets.

## Current State Analysis

- `SetDetailPage.tsx:114` uses `grid grid-cols-3 gap-2` — 6 buttons crammed into 3 equal columns regardless of viewport width.
- Button component (`button.tsx`) applies `whitespace-nowrap` — text never wraps, it overflows instead.
- The 3 custom `<a>` buttons (Browse, Rozpocznij sesję, Generate with AI) have `h-9 px-4 py-2 text-sm` — 36px touch target, below Apple HIG's 44px minimum.
- No responsive breakpoints exist on the button grid — unlike other components (SetGrid uses `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`, Welcome.astro uses `flex-col sm:flex-row`).

### Key Discoveries:

- `src/components/sets/SetGrid.tsx:40` — established responsive grid pattern: `grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3`
- `src/components/ui/button.tsx:8` — `whitespace-nowrap` means text will always overflow rather than wrap
- `src/components/sets/FlashcardProposalCard.tsx:61,105` — mobile/desktop swap pattern using `md:hidden` / `hidden md:grid md:grid-cols-2`
- `src/components/Welcome.astro:39` — button stack pattern: `flex flex-col gap-4 sm:flex-row`

## Desired End State

On mobile (<640px): buttons display in a 2-column grid with shorter text labels and comfortable vertical padding (44px touch target). On desktop (640px+): buttons display in the current 3-column grid with full text labels and original padding. No duplicate button sets — the same buttons adapt via responsive classes.

### Verification

- Open `/sets/[id]` on a 375px-wide viewport: all 6 buttons visible, no text overflow, no edge-touching, comfortable tap targets.
- Open on 1024px+ viewport: layout unchanged from current (3-column grid, full labels).
- Run `npm run build` and `npm run lint` without errors.

## What We're NOT Doing

- Adding a separate button set for mobile (no DOM duplication)
- Changing button colors, shapes, icons, or functionality
- Adding icon-only mode for very small screens (<360px)
- Modifying the Button component itself or its `whitespace-nowrap` behavior
- Changing per-flashcard action buttons (Edit/Delete dropdown in FlashcardCard.tsx)
- Adding any JavaScript/runtime logic — purely CSS/Tailwind class changes

## Implementation Approach

Apply responsive Tailwind classes to the existing button grid and text content. Use the `hidden sm:inline` / `sm:hidden` pattern for mobile/desktop text variants, matching the codebase's established approach (FlashcardProposalCard, DialogFooter).

## Phase 1: Responsive Grid, Shorter Mobile Texts, Increased Padding

### Overview

Change the button grid to 2 columns on mobile and 3 on sm+, add shorter text labels for mobile via hidden/sm:inline, and increase vertical padding on mobile for 44px touch targets.

### Changes Required:

#### 1. Button grid container

**File**: `src/components/sets/SetDetailPage.tsx`

**Intent**: Make the grid responsive — 2 columns on mobile, 3 on sm+ — matching the pattern used in SetGrid and StatsBlock.

**Contract**: The `div` at line 114 changes from `className="grid grid-cols-3 gap-2"` to `className="grid grid-cols-2 gap-2 sm:grid-cols-3"`.

#### 2. Custom link buttons — responsive height and padding

**File**: `src/components/sets/SetDetailPage.tsx`

**Intent**: Increase touch target on mobile by using `h-11` (44px) on small screens and `h-9` (36px) on sm+, and increase vertical padding from `py-2` to `py-2.5` on mobile.

**Contract**: The 3 custom `<a>` and disabled `<button>` elements (lines 116-131) change `h-9` to `h-11 sm:h-9` and `py-2` to `py-2.5 sm:py-2`. The `px-4` class stays.

#### 3. Shadcn Button components — responsive height and padding

**File**: `src/components/sets/SetDetailPage.tsx`

**Intent**: Override the Button component's default `h-9` to use `h-11` on mobile for the 3 shadcn `<Button>` elements (Share, Import CSV, New flashcard).

**Contract**: Add `h-11 sm:h-9` to each Button's `className` prop (lines 146, 157, 168). This overrides the component's default `h-9` because `className` is merged last via `cn()`.

#### 4. "Rozpocznij sesję" button — shorter mobile text

**File**: `src/components/sets/SetDetailPage.tsx`

**Intent**: Show "Sesja" on mobile and "Rozpocznij sesję" on sm+.

**Contract**: Replace the text node at line 137 (`Rozpocznij sesję`) with two spans:

```tsx
<span className="sm:hidden">Sesja</span><span className="hidden sm:inline">Rozpocznij sesję</span>
```

#### 5. "Generate with AI" button — shorter mobile text

**File**: `src/components/sets/SetDetailPage.tsx`

**Intent**: Show "AI" on mobile and "Generate with AI" on sm+.

**Contract**: Replace the text node at line 144 (`Generate with AI`) with:

```tsx
<span className="sm:hidden">AI</span><span className="hidden sm:inline">Generate with AI</span>
```

#### 6. "Import CSV" button — shorter mobile text

**File**: `src/components/sets/SetDetailPage.tsx`

**Intent**: Show "CSV" on mobile and "Import CSV" on sm+.

**Contract**: Replace the text node at line 166 (`Import CSV`) with:

```tsx
<span className="sm:hidden">CSV</span><span className="hidden sm:inline">Import CSV</span>
```

#### 7. "New flashcard" button — shorter mobile text

**File**: `src/components/sets/SetDetailPage.tsx`

**Intent**: Show "Dodaj" on mobile and "New flashcard" on sm+.

**Contract**: Replace the text node at line 176 (`New flashcard`) with:

```tsx
<span className="sm:hidden">Dodaj</span><span className="hidden sm:inline">New flashcard</span>
```

### Success Criteria:

#### Automated Verification:

- `npm run build` completes without errors
- `npm run lint` passes without errors

#### Manual Verification:

- On 375px viewport: all 6 buttons visible in 2-column grid, no text overflow, no edge-touching
- On 375px viewport: "Sesja", "AI", "CSV", "Dodaj" labels appear (mobile variants)
- On 1024px+ viewport: 3-column grid, "Rozpocznij sesję", "Generate with AI", "Import CSV", "New flashcard" labels appear
- Button touch targets measure 44px tall on mobile (h-11)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Manual Testing Steps:

1. Open dev server (`npm run dev`) and navigate to a set detail page
2. Use browser DevTools responsive mode: test at 320px, 375px, 414px, 640px, 768px, 1024px
3. At each size: verify button text fits inside buttons, no overflow, no edge-touching
4. Verify the 2→3 column transition happens at 640px (sm breakpoint)
5. Verify mobile text variants show below 640px, full text above
6. Click each button to confirm actions still work (dialogs open, navigation works)

## Performance Considerations

None — purely CSS class changes, no runtime impact.

## Migration Notes

None — no data or schema changes.

## References

- Responsive grid pattern: `src/components/sets/SetGrid.tsx:40`
- Mobile/desktop swap pattern: `src/components/sets/FlashcardProposalCard.tsx:61,105`
- Button component: `src/components/ui/button.tsx`

## Progress

### Phase 1: Responsive Grid, Shorter Mobile Texts, Increased Padding

#### Automated

- [x] 1.1 `npm run build` completes without errors
- [x] 1.2 `npm run lint` passes without errors

#### Manual

- [x] 1.3 All 6 buttons visible in 2-column grid on 375px viewport, no text overflow
- [x] 1.4 Mobile text variants ("Sesja", "AI", "CSV", "Dodaj") appear below 640px
- [x] 1.5 Full text variants appear at 640px+ with 3-column grid
- [x] 1.6 Button touch targets measure 44px on mobile