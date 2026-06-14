# UX Fixes: Set View Title Layout, Generate Page Auto-Focus and Scroll

## Overview

Three small UX fixes across two React components. No API changes, no type changes, no migrations.

## Current State Analysis

- `SetDetailPage.tsx:101` — header row is `flex items-start justify-between gap-4`, which places the `<h1>` title and the buttons container side-by-side. On longer set names the title wraps inside a constrained flex child.
- `GenerateFlashcardsPage.tsx:166` — `<Textarea id="source-text">` renders without `autoFocus`; the user must click manually before typing.
- `GenerateFlashcardsPage.tsx:84` — `setProposals(cards)` updates state but the page stays at the top; the proposals section at the bottom is not visible without scrolling.

## Desired End State

- Set view: title occupies its own full-width line; action buttons appear below it, right-aligned.
- Generate page: textarea receives focus immediately on page load.
- Generate page: after proposals appear, the page smoothly scrolls to the proposals section header so the user sees at minimum the "N proposals" heading and the first card.

### Key Discoveries

- `SetDetailPage.tsx:110` — buttons container already has `justify-end`; only the parent flex direction needs to change.
- `GenerateFlashcardsPage.tsx:247` — proposals section is conditionally rendered; scrolling must happen after React flushes the DOM update — a `useEffect` watching `proposals.length` is the right hook.
- `autoFocus` on `<Textarea>` must be guarded against double-invocation; React's own `autoFocus` prop handles this correctly.

## What We're NOT Doing

- Responsive breakpoint overrides (the layout change applies at all widths).
- Changing scroll position on re-generation (user already has cards visible; no scroll needed).
- Animation or transition beyond the native `behavior: 'smooth'`.

## Implementation Approach

Two phases matching the two affected components. Each phase is a handful of lines. Phase 1 is pure CSS class change. Phase 2 adds `useRef` + `useEffect` for scroll and `autoFocus` on the textarea.

## Phase 1: Set View Header Layout

### Overview

Change the header container from a horizontal flex row to a vertical column so the title is never squeezed by adjacent buttons.

### Changes Required

#### 1. Header container — direction and spacing

**File**: `src/components/sets/SetDetailPage.tsx`

**Intent**: Make the header a column so title and buttons each take their own full-width row.

**Contract**: Line 101 — change `flex items-start justify-between gap-4` to `flex flex-col gap-3`. Remove `shrink-0` from the buttons container div at line 110 (it's irrelevant in a column layout and causes no harm, but removing it keeps the class list clean).

### Success Criteria

#### Automated Verification

- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification

- On `/sets/<any-id>`, the set name is on its own line with no truncation.
- Action buttons appear as a right-aligned row below the title.
- No visual regressions on the flashcard list below the header.

**Implementation Note**: Pause after this phase for manual check before proceeding to Phase 2.

---

## Phase 2: Generate Page — Auto-Focus and Scroll to Proposals

### Overview

Two small additions to `GenerateFlashcardsPage.tsx`: `autoFocus` on the textarea so the user can type immediately, and a `useEffect` that scrolls to the proposals section after generation completes.

### Changes Required

#### 1. Auto-focus the source text textarea

**File**: `src/components/ai/GenerateFlashcardsPage.tsx`

**Intent**: Focus the textarea when the page mounts so the user can paste immediately without clicking.

**Contract**: Line 166 — add `autoFocus` prop to `<Textarea>`. No other change.

#### 2. Scroll to proposals on appearance

**File**: `src/components/ai/GenerateFlashcardsPage.tsx`

**Intent**: After proposals are set in state and rendered, smoothly scroll to the proposals section so the user sees the results without manual scrolling.

**Contract**:
- Import `useEffect` and `useRef` from React (line 1 — `useRef` is not yet imported).
- Declare `const proposalsRef = useRef<HTMLDivElement>(null)` alongside the other state declarations.
- Attach `ref={proposalsRef}` to the outermost `<div>` of the proposals section (currently line 248: `<div className="mt-6 space-y-4">`).
- Add a `useEffect` after the existing handlers:

```ts
useEffect(() => {
  if (proposals.length > 0 && proposalsRef.current) {
    proposalsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}, [proposals.length]);
```

The `proposals.length` dependency fires when the list goes from 0 to N (new generation) but not on individual proposal edits or deletions, which is the correct trigger scope.

### Success Criteria

#### Automated Verification

- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification

- On `/generate`, the source text textarea is focused on page load (cursor visible, no click needed).
- After clicking Generate and waiting for results, the page scrolls smoothly to the "N proposals" heading.
- If the user edits or deletes individual proposals, no unintended scrolling occurs.
- No regressions on the generate flow (generating, error states, saving).

---

## Testing Strategy

### Manual Testing Steps

1. Navigate to any set on `/sets/<id>` — confirm title is on its own line, buttons right-aligned below.
2. Navigate to `/generate?setId=<id>` — confirm textarea is focused on load.
3. Paste text, click Generate — after cards appear, confirm smooth scroll to proposals section.
4. Delete one proposal — confirm no scroll.
5. Click Discard all, generate again — confirm scroll fires again on the new results.

## References

- `src/components/sets/SetDetailPage.tsx`
- `src/components/ai/GenerateFlashcardsPage.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Set View Header Layout

#### Automated

- [x] 1.1 Lint passes: `npm run lint` — 0745fc3
- [x] 1.2 Build passes: `npm run build` — 0745fc3

#### Manual

- [x] 1.3 Set name on own line, no truncation — 0745fc3
- [x] 1.4 Buttons right-aligned below title — 0745fc3
- [x] 1.5 No visual regressions in flashcard list — 0745fc3

### Phase 2: Generate Page — Auto-Focus and Scroll to Proposals

#### Automated

- [x] 2.1 Lint passes: `npm run lint`
- [x] 2.2 Build passes: `npm run build`

#### Manual

- [x] 2.3 Textarea focused on page load
- [x] 2.4 Smooth scroll to proposals after generation
- [x] 2.5 No scroll on proposal edit/delete
- [x] 2.6 Scroll fires again on re-generation
