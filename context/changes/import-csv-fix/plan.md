# CSV Import Dialog Overflow Fix — Implementation Plan

## Overview

The CSV import preview popup renders its proposal list, the list's scrollbar, and the `Import N cards` button **outside** the dialog's right edge, on top of the page behind it. The cause is a CSS grid blowout in `DialogContent`, not an insufficient width. This plan bounds the dialog shell — horizontally and vertically — and widens it to `sm:max-w-2xl` so the preview rows are actually readable.

## Current State Analysis

`src/components/sets/ImportCsvDialog.tsx` renders a three-step dialog (`upload` → `preview` → `importing`). In the `preview`/`importing` steps it mounts a `<ul>` of proposals inside the shared shadcn `DialogContent`.

**The blowout mechanism:**

1. `src/components/ui/dialog.tsx:51` — `DialogContent` is `grid` with an implicit single `auto` column, `p-6`, `gap-4`, `w-full max-w-[calc(100%-2rem)] sm:max-w-lg`. The box is correctly capped at 512 px.
2. `ImportCsvDialog.tsx:207-208` — each proposal row renders `<p class="truncate">`. `truncate` implies `white-space: nowrap`, so the paragraph's **min-content width is the full length of the line**.
3. An `auto` grid track's base size is the largest min-content contribution of its items. The `min-w-0` on the inner flex child (`ImportCsvDialog.tsx:206`) only relaxes the *flex* layout inside a row; it does not clamp the grid item's content-based minimum. The track therefore grows past the 464 px content box and the grid overflows its own container.
4. Because the footer is a sibling grid item stretched to the same blown-out track, `justify-end` right-aligns the `Import` button to the **track** edge, not the box edge — which is why the button escapes too.

**Evidence** (`import-csv-problem.png` in the repo root, provided by the user): the dark dialog panel is ~512 CSS px wide, while rows, the `<ul>` scrollbar, and the `Import 28 cards` button sit clearly to the right of it, overlapping the page's `Generuj z AI` / `Nowa fiszka` buttons. Decisive detail: **no row is ellipsised** despite `truncate` — proof that the width was dictated by the longest line (`"We succeeded in passing the exam, which was a surprise to us. - SURPRISE"`), not by the dialog.

**Two secondary defects visible in the same screenshot:**

- `DialogContent` has **no height bound at all** (no `max-h`, no `overflow`). Today the dialog is ~547 CSS px tall and fits, but on a shorter viewport or at higher browser/OS zoom the footer with the `Import` button falls off-screen — the same class of defect on the other axis.
- `DialogFooter` receives `justify-between` (`ImportCsvDialog.tsx:233`), but the primitive's `sm:justify-end` (`dialog.tsx:92`) wins from the `sm` breakpoint up, because responsive utilities are emitted after base utilities. `← Back` and `Import` end up jammed together on the right, contradicting the local class's intent.

**What is NOT wrong:** the list already scrolls (`overflow-y-auto`, which also computes `overflow-x` to `auto`), the fetch/chunking logic is untouched by this defect, and no other dialog in the repo is affected — `ImportCsvDialog` is the only one with long `nowrap` content (all others are short forms capped at `sm:max-w-md`).

## Desired End State

Opening the CSV import preview with a real 28-card Anki export shows a 672 px-wide popup in which **everything** — proposal rows, the list scrollbar, `← Back` on the left, and `Import N cards` on the right — sits inside the dark panel. Rows too long to fit end with an ellipsis instead of escaping. The dialog never exceeds the viewport height: when the list is long, the list itself scrolls while the header and footer stay pinned and visible.

Verified by: importing a CSV whose longest line exceeds the dialog width, at both a normal window and a deliberately shortened one.

### Key Discoveries:

- `src/components/ui/dialog.tsx:51` — the shared `DialogContent` is a `grid` with no height bound; both defects originate here but are only triggered by this one consumer.
- `src/components/sets/ImportCsvDialog.tsx:200` — `<ul class="max-h-96 space-y-2 overflow-y-auto pr-1">`; the fixed `max-h-96` becomes redundant once the shell is viewport-bounded and the list becomes the flex-shrinking scroll region.
- `src/components/sets/ImportCsvDialog.tsx:206` — `min-w-0 flex-1` is already correct for the row's internal flex layout; it is not the missing piece and must stay.
- Tailwind class merging goes through `cn()` (clsx + tailwind-merge), so a local `flex` replaces the primitive's `grid` and a local `sm:max-w-2xl` replaces `sm:max-w-lg` — same-group conflicts resolve to the local value. Cross-variant pairs (`justify-between` vs `sm:justify-end`) do **not** conflict and both survive, which is exactly the footer bug; it needs an explicit `sm:justify-between`.
- `context/foundation/lessons.md` — `npm run lint` crashes on `.astro` files (`@typescript-eslint/no-misused-promises` + `astro-eslint-parser`). Lint this change selectively with `npx eslint <file>`; `npm run build` is what actually type-checks.
- No component test exists for this dialog (`src/components/sets/__tests__/` holds only `FlashcardBrowseCard.test.tsx`).

## What We're NOT Doing

- Not touching the shared `src/components/ui/dialog.tsx` primitive. The blowout is latent there for any future long-content dialog, but hardening it would put every dialog in the app into the regression surface and would be overwritten by a `npx shadcn@latest add dialog` reinstall. Decided: local fix.
- Not changing `truncate` to `line-clamp-2`. Rows stay single-line front + single-line back so row height stays uniform and the list stays predictable.
- Not touching the parse, chunking, retry, or `onImport` logic — no behavioral change to importing.
- Not internationalising this dialog. Its strings are hardcoded English (`"Import from CSV / TXT"`, `"Select file"`, error messages) while the rest of the app uses i18n. Real gap, separate change.
- Not fixing the same latent height/width exposure in other dialogs — none of them have content that triggers it.
- Not adding a component test — see Testing Strategy for why jsdom cannot verify this.

## Implementation Approach

Convert the dialog shell from a grid to a bounded flex column. A column flex container has no cross-axis track sizing, so a `nowrap` descendant can no longer stretch the container past its `max-width` — that single change removes the blowout mechanism for both the list and the footer. The same flex column then gives the height fix for free: header and footer are `shrink-0`, the list region is `min-h-0 flex-1`, and `max-h` on the shell makes the list the only thing that scrolls. Width goes from `sm:max-w-lg` to `sm:max-w-2xl` because the user asked for it and because it reduces how often a row needs ellipsising.

## Phase 1: Bound the import dialog shell

### Overview

One file, layout-only. Make `DialogContent` a viewport-bounded flex column, make the proposal list the sole scroll region, and stop the footer from being right-aligned against a phantom width.

### Changes Required:

#### 1. Dialog shell

**File**: `src/components/sets/ImportCsvDialog.tsx`

**Intent**: Stop the shell from being sized by its longest `nowrap` descendant, and stop it from growing past the viewport. Widen it to the agreed 672 px.

**Contract**: `DialogContent`'s `className` (line 171) keeps its colour classes and additionally sets: display `flex` + `flex-col` (replaces the primitive's `grid` via tailwind-merge), a viewport-relative height cap of roughly `calc(100dvh-2rem)`, and `sm:max-w-2xl` in place of `sm:max-w-lg`. `dvh` rather than `vh` so mobile browser chrome is accounted for. The primitive's `gap-4` keeps working unchanged in flex.

#### 2. Non-shrinking header and footer

**File**: `src/components/sets/ImportCsvDialog.tsx`

**Intent**: In a height-capped column, the header and footer must never be compressed to make room for the list — the `Import` button has to stay visible and clickable at any list length.

**Contract**: `DialogHeader` (line 172) and `DialogFooter` (line 233) both get `shrink-0`.

#### 3. Proposal list as the only scroll region

**File**: `src/components/sets/ImportCsvDialog.tsx`

**Intent**: Let the list absorb the leftover vertical space and scroll internally, instead of carrying its own fixed 384 px cap that is unrelated to how much room the dialog actually has.

**Contract**: the `preview`/`importing` wrapper `<div>` (line 198) becomes a flex column that may shrink — `flex min-h-0 flex-1 flex-col gap-3` replacing `space-y-3`. The `<ul>` (line 200) drops `max-h-96` and gains `min-h-0` alongside its existing `overflow-y-auto`; `space-y-2 pr-1` stay. The error `<p>` (line 229) stays a non-shrinking sibling below the list, so an error message never scrolls out of reach. The `upload` step's wrapper (line 182) is left as-is — it has nothing to scroll.

#### 4. Footer alignment

**File**: `src/components/sets/ImportCsvDialog.tsx`

**Intent**: Restore the alignment the local `justify-between` was already asking for; the primitive's responsive `sm:justify-end` silently overrides it above 640 px.

**Contract**: `DialogFooter`'s `className` (line 233) adds `sm:justify-between`. `← Back` ends up on the left edge, `Import N cards` on the right, at every breakpoint.

### Success Criteria:

#### Automated Verification:

- Lint passes on the changed file: `npx eslint src/components/sets/ImportCsvDialog.tsx`
- Production build and type check pass: `npm run build`
- Deterministic test floor stays green: `npm test`

#### Manual Verification:

- With a 28+ card CSV whose longest line exceeds the dialog width, nothing crosses the dialog's right edge — rows, the list scrollbar, and the `Import N cards` button are all inside the dark panel, and no page content (`Generuj z AI` / `Nowa fiszka` buttons) shows through or over the popup.
- Rows too long for the wider dialog end with an ellipsis, and the row's delete (trash) button is visible on every row including the first.
- `← Back` sits on the left, `Import N cards` on the right, both fully inside the panel.
- With the browser window shortened (or zoom raised to ~150%) so the list cannot fit, the dialog stops at the viewport edge, the header and footer stay visible, and only the list scrolls; the `Import` button remains clickable.
- Deleting rows down to a short list shrinks the dialog rather than leaving a tall empty panel; deleting all rows shows the `All cards removed` message with the footer still correct.
- Import still works end-to-end: the button imports all cards and the dialog closes (guards against an accidental behavioural change).
- The narrow-viewport case (~375 px wide) still renders the dialog inside the screen with the footer buttons reachable.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Testing Strategy

### Unit Tests:

None added. The defect is a computed-layout overflow; jsdom implements no layout engine, so a component test could only assert that specific Tailwind class strings are present — a tautology that restates the diff instead of testing behaviour, and that breaks on any future restyle. The existing `npm test` floor is run as a regression guard only.

### Manual Testing Steps:

1. `npx supabase start`, then `npm run dev`; sign in and open a set's detail page.
2. Click `Import CSV`, select an Anki-format export with ~30 cards including at least one line longer than ~90 characters (the screenshot's file qualifies).
3. In the preview step, check the right edge: rows, list scrollbar, and `Import N cards` all inside the panel; long rows ellipsised; trash icon present on every row.
4. Shorten the browser window height (or set zoom to 150%) and confirm the dialog caps at the viewport, header and footer stay put, and only the list scrolls.
5. Delete a few rows, then all rows — check the dialog shrinks and the empty-state message renders with the footer intact.
6. Press `Import` and confirm the cards land in the set and the dialog closes.
7. Narrow the window to ~375 px and confirm the dialog and its footer stay on screen.
8. Open `Create flashcard` and `Rename set` dialogs once to confirm they are visually unchanged (they share the primitive, which this change does not touch).

## Performance Considerations

None. Layout-only change; the list already virtualises nothing and does not need to — proposals are capped by a 1 MB file limit and rows are cheap.

## Migration Notes

Not applicable — no data, schema, or API contract touched. Revert is a single-file `git revert`.

## References

- User-provided screenshot of the defect: `import-csv-problem.png` (repo root)
- Original feature plan: `context/archive/2026-06-14-csv-import/plan.md`
- Affected component: `src/components/sets/ImportCsvDialog.tsx:171-255`
- Shared primitive (read-only for this change): `src/components/ui/dialog.tsx:37-103`
- Lint caveat: `context/foundation/lessons.md` — "ESLint crashuje na plikach .astro"

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Bound the import dialog shell

#### Automated

- [x] 1.1 Lint passes on the changed file: `npx eslint src/components/sets/ImportCsvDialog.tsx`
- [x] 1.2 Production build and type check pass: `npm run build`
- [x] 1.3 Deterministic test floor stays green: `npm test`

#### Manual

- [x] 1.4 Nothing crosses the dialog's right edge with a 28+ card CSV; no page content shows over the popup
- [x] 1.5 Long rows ellipsised; trash button visible on every row
- [x] 1.6 `← Back` left, `Import N cards` right, both inside the panel
- [x] 1.7 Shortened viewport / 150% zoom: dialog capped, header and footer visible, only the list scrolls
- [x] 1.8 Short list shrinks the dialog; empty state renders with footer intact
- [x] 1.9 Import still works end-to-end and the dialog closes
- [x] 1.10 ~375 px viewport: dialog and footer stay on screen
- [x] 1.11 `Create flashcard` and `Rename set` dialogs visually unchanged
