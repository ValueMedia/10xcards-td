# CSV/TXT Import (Anki format) — Plan Brief

> Full plan: `context/changes/csv-import/plan.md`

## What & Why

Add CSV/TXT file import to the set detail page so users can bring in existing Anki decks without retyping every card. The feature targets US-009: one card per line, front and back separated by `;`, tab, or `-`, with invalid lines silently skipped.

## Starting Point

The `POST /api/sets/[id]/flashcards/batch` endpoint already accepts up to 50 `{front, back}` pairs per request and returns created `Flashcard[]`. `SetDetailPage` manages flashcard state locally using a consistent dialog + callback pattern. No file upload or parsing infrastructure exists yet.

## Desired End State

User clicks "Import CSV" on any set detail page, selects a `.csv` or `.txt` file, reviews parsed cards in a two-step dialog (can delete individual entries), clicks Import, and sees the new cards appear in the list with a toast showing how many were imported and how many lines were skipped.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
|----------|--------|------------------|
| Parsing location | Client-side (`FileReader` + pure TS) | No new endpoint needed; batch API already handles bulk insert |
| Separator strategy | Auto-detect most-frequent per file | Anki exports are consistent per file; per-line detection risks splitting dash-in-content |
| Over-limit handling | Chunking (multiple requests of 50) | Hard batch limit is 50; chunking prevents data loss without an artificial import cap |
| Preview step | Yes — two-step dialog | Consistent with AI generation flow; lets user remove unwanted cards before committing |
| Skip feedback | Toast with imported + skipped count | Concise, matches existing toast pattern; US-009 says skip silently (no invalid-line detail) |
| Over-length lines (>1000 chars) | Skip as invalid | Consistent with silent-skip rule; avoids truncated/nonsensical flashcards |
| Import location | Set detail page only | User already has set context; avoids additional scope |
| Comment lines (`#`) + empty lines | Silently ignore (not counted as skipped) | Anki exports include `#separator:tab` headers; counting them as errors is misleading |
| UI trigger | Dialog with instructions + file picker | User asked for this; leaves room for format hint without a dedicated help page |

## Scope

**In scope:**
- `src/lib/services/csv-parser.ts` — pure parser utility + unit tests
- `src/components/sets/ImportCsvDialog.tsx` — two-step dialog (upload → preview → import)
- `src/components/sets/SetDetailPage.tsx` — "Import CSV" button + dialog wiring

**Out of scope:**
- Drag-and-drop
- Server-side parsing
- Import during set creation or from dashboard
- Showing which specific lines were invalid

## Architecture / Approach

File is read client-side with `FileReader`. `parseCSV()` auto-detects the separator, skips comments/blanks, validates length, and returns `{ valid[], skippedCount }`. The dialog presents the valid cards in a preview list; user can delete individual entries. On confirm, the dialog chunks cards into groups of 50 and calls the existing batch endpoint sequentially, collecting returned `Flashcard[]`. `SetDetailPage.handleImport` prepends them to local state and shows a sonner toast.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|-------|-----------------|----------|
| 1. CSV parser utility | Pure `parseCSV()` + tests | Separator auto-detection edge cases (dash in content) |
| 2. ImportCsvDialog | Full upload → preview → batch-import dialog | Partial-chunk failure handling UX |
| 3. SetDetailPage integration | Button + dialog wired into existing page | None — follows established pattern |

**Prerequisites:** None beyond existing codebase (batch API and SetDetailPage already in place).  
**Estimated effort:** ~1–2 sessions across 3 phases.

## Open Risks & Assumptions

- Dash separator (`-`) can appear inside card content; auto-detection by most-frequent count mitigates but does not eliminate false splits in edge cases.
- If a chunk request fails mid-import, already-committed chunks are not rolled back — user sees partial import with an error message.

## Success Criteria (Summary)

- User can import a real Anki `.txt` export and see all valid cards appear in the set list.
- Toast accurately reports how many cards were imported and how many lines were skipped.
- Invalid lines (malformed, too long) are silently dropped without crashing the dialog.
