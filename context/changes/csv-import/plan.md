# CSV/TXT Import (Anki format) Implementation Plan

## Overview

Add CSV/TXT file import to the set detail page. The user opens a dialog, selects a `.csv` or `.txt` file, sees a preview of parsed cards (can delete individual entries), and imports them in bulk via the existing batch API. Parsing runs entirely client-side; no new backend endpoints are required.

## Current State Analysis

- `POST /api/sets/[id]/flashcards/batch` — accepts 1–50 `{front, back}` objects, returns created `Flashcard[]`. Ready to use without modification.
- `src/lib/services/flashcards.ts` — `createFlashcardsBulk()` hard limit of 50 items, enforced by Zod in the API schema. Chunking must happen in the client.
- `src/components/sets/SetDetailPage.tsx` — manages flashcard state locally; all dialogs follow a consistent `{ open, onOpenChange }` props pattern. Toast library: `sonner`.
- No file upload precedent in the codebase; `FileReader` API will be used client-side.

## Desired End State

User can click "Import CSV" on any set detail page, select a `.csv` or `.txt` file, review parsed cards in a two-step dialog (with per-card delete), and import. After import the flashcard list updates in place (no page reload) and a toast shows how many cards were imported and how many lines were skipped.

### Key Discoveries

- `src/pages/api/sets/[id]/flashcards/batch.ts:7-11` — batch schema enforces max 50 per request; chunking required for larger files.
- `src/components/sets/CreateFlashcardDialog.tsx` — canonical dialog pattern to follow (shadcn Dialog + sonner toast + `onOpenChange` reset on close).
- `src/components/sets/SetDetailPage.tsx:37-62` — local state pattern; new `handleImport` follows the same shape as `handleCreate`.
- `src/lib/services/flashcards.ts` — `flashcardContentSchema` validates front/back 1–1000 chars; parser must enforce the same limit and skip violating lines.

## What We're NOT Doing

- No server-side file parsing
- No drag-and-drop
- No import during set creation or from the dashboard
- No display of which specific lines were invalid (US-009 spec: silent skip)

## Implementation Approach

Three clean phases: (1) pure parser utility with unit tests, (2) the dialog component that drives the full upload → preview → import flow, (3) wiring the button and dialog into `SetDetailPage`. Each phase is independently verifiable before the next begins.

## Phase 1: CSV Parser Utility

### Overview

Pure TypeScript module with no external deps. Takes raw file text, returns valid `{front, back}` pairs and a skip count. All edge cases (empty lines, `#` headers, ambiguous separators, over-length fields) are handled here so the dialog stays simple.

### Changes Required

#### 1. CSV parser module

**File**: `src/lib/services/csv-parser.ts`

**Intent**: Implement `parseCSV(text)` — the single source of truth for all parsing logic. Exported type `ParseResult` is shared with the dialog.

**Contract**:
```ts
export interface ParseResult {
  valid: { front: string; back: string }[];
  skippedCount: number; // lines that had content but failed validation
}
export function parseCSV(text: string): ParseResult
```

Algorithm (in order):
1. Split on `\n`; strip `\r` from each line.
2. Filter out blank lines and lines starting with `#` — silently dropped, not counted in `skippedCount`.
3. **Separator auto-detection**: for each candidate `[";", "\t", "-"]`, count lines that split into exactly 2 non-empty trimmed parts. Pick the candidate with the highest count. On a tie, the earlier candidate in the array wins (i.e. `";"` beats `"\t"` beats `"-"`). If all counts are zero, return `{ valid: [], skippedCount: remaining.length }`.
4. For each remaining line: split by detected separator; if result length ≠ 2 → skip + increment `skippedCount`. Trim both parts. If either part is empty or its length > 1000 → skip + increment `skippedCount`.
5. Return `{ valid, skippedCount }`.

#### 2. Parser unit tests

**File**: `src/lib/services/csv-parser.test.ts`

**Intent**: Verify all branching in the parser before the dialog is built.

**Contract**: Test cases must cover:
- Tab-separated file → correct split
- Semicolon-separated file → correct split
- Dash-separated file → correct split
- Lines with `#` prefix → silently dropped (not in `skippedCount`)
- Empty lines → silently dropped
- Line with front > 1000 chars → skipped (counted in `skippedCount`)
- File with mixed separators → most-frequent wins
- File where all lines are invalid → `{ valid: [], skippedCount: N }`

### Success Criteria

#### Automated Verification

- `npm run lint` passes with no errors
- `npm run build` passes (new module resolves under `@/lib/services/csv-parser`)
- `npm test -- csv-parser` passes (all unit tests green)

#### Manual Verification

- Parser handles all three separator types correctly when tested against real Anki exports

**Implementation Note**: After Phase 1 automated checks pass, pause for manual confirmation before proceeding to Phase 2.

---

## Phase 2: ImportCsvDialog Component

### Overview

Two-step dialog component. Step 1: format instructions + file picker. Step 2: scrollable preview list with per-card delete and an "Import" button that chunks the request to the batch API.

### Changes Required

#### 1. Import dialog

**File**: `src/components/sets/ImportCsvDialog.tsx`

**Intent**: Self-contained dialog that drives the full upload → parse → preview → batch-import flow. Calls `onImport` with created flashcards and parse-time skip count so the parent can update state and show a toast.

**Contract**:
```ts
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  setId: string;
  onImport: (flashcards: Flashcard[], skippedCount: number) => void;
}
```

Internal state:
- `step: 'upload' | 'preview' | 'importing'`
- `proposals: { _key: string; front: string; back: string }[]` (`_key` is a client-only UUID for list keying)
- `parseSkippedCount: number`
- `error: string | null`

**Step 1 — upload:**
- Title: "Import from CSV / TXT"
- Description: one-sentence format hint (Anki format, one card per line, separated by `;` / tab / `-`)
- Hidden `<input type="file" accept=".csv,.txt">` triggered by a visible Button ("Select file")
- File guard before reading: `file.size > 1_000_000` → `error = "File too large (max 1 MB)"`
- On valid file: `FileReader.readAsText()` → on `onerror`: `error = "Failed to read file"`, stay on step 1. On `onload`: run `parseCSV(result)` → if `valid.length === 0` → `error = "No valid flashcards found in this file"`, stay on step 1; else → populate `proposals` + `parseSkippedCount`, transition to `'preview'`

**Step 2 — preview:**
- Sub-heading: "Found {proposals.length} cards · {parseSkippedCount} lines skipped"
- Scrollable list (`max-h-96 overflow-y-auto`); each row: front text / back text / delete icon button that removes that entry from `proposals`
- Footer: "← Back" text button (returns to step 1, resets proposals) + "Import {proposals.length} cards" primary button (disabled when `proposals.length === 0` or `step === 'importing'`)
- On import: set `step = 'importing'`; chunk `proposals` into groups of 50; call `POST /api/sets/{setId}/flashcards/batch` sequentially for each chunk; collect all returned `Flashcard[]`; call `onImport(allCreated, parseSkippedCount)`
- On any chunk HTTP error: track `committedCount` (number of proposals already successfully sent, i.e. `chunkIndex * 50`). Remove the first `committedCount` entries from `proposals` (they are already saved), set `error` with message, reset `step` to `'preview'`. This ensures a retry imports only the not-yet-saved cards, preventing duplicate flashcards.

**Dialog cleanup**: on `onOpenChange(false)` reset all state back to `step: 'upload'`.

### Success Criteria

#### Automated Verification

- `npm run lint` passes
- `npm run build` passes (TypeScript accepts all imports and prop types)

#### Manual Verification

- Upload a valid `.csv` file: preview step shows correct cards with front/back
- Upload a file with some invalid lines: skip count matches expected
- Delete a card from preview: entry disappears from the list
- Import: cards appear in the set's flashcard list without page reload
- Upload file > 1 MB: error message shown, step stays at upload
- Upload file with 0 valid lines: error message shown, step stays at upload

**Implementation Note**: After Phase 2 automated checks pass, pause for manual confirmation of all manual criteria before proceeding to Phase 3.

---

## Phase 3: SetDetailPage Integration

### Overview

Wire the new dialog into `SetDetailPage`: add state, a handler, and an "Import CSV" button in the existing action row.

### Changes Required

#### 1. SetDetailPage updates

**File**: `src/components/sets/SetDetailPage.tsx`

**Intent**: Add `importOpen` state + `handleImport` callback + "Import CSV" button + `<ImportCsvDialog>` mount. Follows the exact pattern used by `createOpen` / `handleCreate` / `CreateFlashcardDialog`.

**Contract**:
- New import: `import { ImportCsvDialog } from "@/components/sets/ImportCsvDialog"`
- New state: `const [importOpen, setImportOpen] = useState(false)`
- New handler:
  ```ts
  const handleImport = useCallback((flashcards: Flashcard[], skippedCount: number) => {
    setState((prev) => ({ ...prev, flashcards: [...flashcards, ...prev.flashcards] }));
    setImportOpen(false);
    const skippedNote = skippedCount > 0 ? ` · ${skippedCount} lines skipped` : "";
    toast.success(`Imported ${flashcards.length} flashcard${flashcards.length !== 1 ? "s" : ""}${skippedNote}`);
  }, []);
  ```
- New button in the actions `<div>` (between "Generate with AI" and "New flashcard"):
  ```tsx
  <Button type="button" onClick={() => setImportOpen(true)} variant="outline" className="border-white/10 bg-white/5 text-white hover:bg-white/10">
    <UploadIcon />
    Import CSV
  </Button>
  ```
  `UploadIcon` is an inline SVG (same pattern as `PlusIcon`/`SparklesIcon`).
- Mount `<ImportCsvDialog open={importOpen} onOpenChange={setImportOpen} setId={set.id} onImport={handleImport} />` alongside the other dialogs.

### Success Criteria

#### Automated Verification

- `npm run lint` passes
- `npm run build` passes

#### Manual Verification

- "Import CSV" button is visible in the set detail page action row
- Full flow: click button → dialog opens → select file → preview appears → import → flashcards prepended to list → toast shows imported count and skipped lines
- Dialog closes cleanly; reopening resets to step 1

**Implementation Note**: After Phase 3 automated checks pass, pause for full end-to-end manual test before marking the change complete.

---

## Testing Strategy

### Unit Tests

- `csv-parser.test.ts`: all separator types, silent-skip cases (empty / `#`), over-length rejection, most-frequent-separator election, all-invalid file

### Manual Testing Steps

1. Export a deck from Anki as `.txt` (tab-separated) — upload and verify cards parse and import correctly
2. Create a hand-crafted `.csv` with `;` separator — verify parse and import
3. Create a file with mixed valid/invalid lines — verify skip count in toast
4. Try a file > 1 MB — verify error message, no crash
5. Delete some cards in preview step — verify import count matches remaining cards

## References

- Batch API: `src/pages/api/sets/[id]/flashcards/batch.ts`
- Dialog pattern: `src/components/sets/CreateFlashcardDialog.tsx`
- State pattern: `src/components/sets/SetDetailPage.tsx`
- Flashcard schema: `src/lib/services/flashcards.ts` (`flashcardContentSchema`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: CSV parser utility

#### Automated

- [x] 1.1 `npm run lint` passes — 58584cc
- [x] 1.2 `npm run build` passes — 58584cc
- [x] 1.3 `npm test -- csv-parser` passes — 58584cc

#### Manual

- [x] 1.4 Parser handles all three separator types correctly when tested against real Anki exports — 58584cc

### Phase 2: ImportCsvDialog component

#### Automated

- [x] 2.1 `npm run lint` passes
- [x] 2.2 `npm run build` passes

#### Manual

- [ ] 2.3 Upload a valid `.csv` file: preview step shows correct cards
- [ ] 2.4 Upload a file with some invalid lines: skip count matches expected
- [ ] 2.5 Delete a card from preview: entry disappears from the list
- [ ] 2.6 Import: cards appear in the set's flashcard list without page reload
- [ ] 2.7 Upload file > 1 MB: error message shown, step stays at upload
- [ ] 2.8 Upload file with 0 valid lines: error message shown, step stays at upload

### Phase 3: SetDetailPage integration

#### Automated

- [ ] 3.1 `npm run lint` passes
- [ ] 3.2 `npm run build` passes

#### Manual

- [ ] 3.3 "Import CSV" button is visible in the set detail page action row
- [ ] 3.4 Full flow works end-to-end: open → select → preview → import → list updates + toast
- [ ] 3.5 Toast shows correct imported count and skipped line count
