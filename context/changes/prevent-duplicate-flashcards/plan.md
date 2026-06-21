# Prevent Duplicate Flashcards — Implementation Plan

## Overview

Add duplicate detection when creating flashcards: manual/lookup creation rejects duplicates with an error, batch creation skips duplicates and reports them, and the AI generation endpoint filters out proposals whose front text already exists in the set before returning them to the frontend.

## Current State Analysis

- **No duplicate detection exists anywhere.** The `flashcards` table has no unique constraint on `front` or `(set_id, front)`. All three creation paths (`createFlashcard`, `createFlashcardsBulk`, `generateFlashcardProposals`) insert/return data without checking for existing fronts.
- **Three creation paths:**
  1. `POST /api/flashcards` → `createFlashcard()` — single manual/lookup creation (`src/pages/api/flashcards/index.ts:42`, `src/lib/services/flashcards.ts:26`)
  2. `POST /api/sets/{id}/flashcards/batch` → `createFlashcardsBulk()` — CSV import + AI save (`src/pages/api/sets/[id]/flashcards/batch.ts:53`, `src/lib/services/flashcards.ts:48`)
  3. `POST /api/sets/{id}/generate` → `generateFlashcardProposals()` — AI proposals, returned directly to frontend with no filtering (`src/pages/api/sets/[id]/generate.ts:132-151`)
- **Error patterns:** `ServiceError` discriminated union with kinds `notFound`, `clientUnavailable`, `dbError`, `validationError` (`src/lib/services/flashcards.ts:12-16`). API routes map `validationError` → 400, `notFound` → 404, others → 500.
- **Frontend error display:** sonner toasts + inline `<p className="text-sm text-red-400">` in dialogs/forms. `GenerateFlashcardsPage` uses a larger error banner (`border-red-400/30 bg-red-400/10`) for generation errors.
- **OpenAPI spec:** `src/lib/openapi/openapi-spec.ts` (1691 lines) — must be updated per the lessons.md rule (line 88).

### Key Discoveries

- `src/lib/services/flashcards.ts:26-46` — `createFlashcard` checks set ownership then inserts; no front uniqueness check
- `src/lib/services/flashcards.ts:48-75` — `createFlashcardsBulk` same pattern, returns `{ data, error }`
- `src/pages/api/sets/[id]/generate.ts:132-151` — LLM proposals pass through with zero filtering
- `src/components/ai/GenerateFlashcardsPage.tsx:100-136` — `handleGenerate` receives `{ flashcards }` and sets state directly
- `src/components/sets/CreateFlashcardDialog.tsx:51-72` — handles 400/500 errors via `toast.error` + inline error text
- `src/components/lookup/LookupWordPage.tsx:204-224` — same pattern, handles non-201 responses with toast + inline error

## Desired End State

1. **Manual/lookup creation:** Attempting to add a card with a front that already exists (normalized: trim + lowercase) in the same set returns HTTP 400 with message "A flashcard with this front text already exists in this set." The existing error display in `CreateFlashcardDialog` and `LookupWordPage` handles this naturally.
2. **Batch creation (CSV import, AI save):** Duplicate fronts are silently skipped; only unique cards are saved. The response includes `skippedCount` and `skippedFronts` so callers can report what was filtered.
3. **AI generation:** The `generate` endpoint queries existing fronts after receiving LLM proposals, removes duplicates, and returns `{ flashcards, removedCount, removedFronts }`. The frontend displays a banner above the proposals list when `removedCount > 0`.
4. **OpenAPI spec** documents all new response fields and error scenarios.

## What We're NOT Doing

- No database-level unique constraint — duplicate detection is application-level only
- No duplicate detection on `back` text — only `front` is checked
- No near-duplicate/fuzzy matching — exact normalized match only (trim + lowercase)
- No changes to the `updateFlashcard` path — editing an existing card's front to match another card's front is not blocked
- No i18n for the duplicate error message — English string in the service layer

## Implementation Approach

Add a `checkDuplicateFronts` helper to the flashcards service that queries all fronts for a set and returns a normalized `Set<string>`. Use it in three places:

1. **`createFlashcard`** — check before insert, return `validationError` on match
2. **`createFlashcardsBulk`** — filter out duplicates before insert, return skipped info
3. **`generate.ts` endpoint** — filter LLM proposals before responding, return removed info

Frontend changes are minimal: `GenerateFlashcardsPage` adds a banner for removed duplicates; `CreateFlashcardDialog` and `LookupWordPage` already handle 400 errors correctly.

## Phase 1: Service Layer — Duplicate Detection

### Overview

Add a `checkDuplicateFronts` helper and modify `createFlashcard` and `createFlashcardsBulk` to detect and handle duplicates. No API or frontend changes yet.

### Changes Required

#### 1.1 Add `checkDuplicateFronts` helper

**File**: `src/lib/services/flashcards.ts`

**Intent**: Query all `front` values for a given set, normalize them (trim + lowercase), and return a `Set<string>` for O(1) lookup. This is the single source of truth for "what fronts already exist in this set."

**Contract**: New exported function:
```ts
checkDuplicateFronts(
  client: SupabaseClient,
  setId: string,
): Promise<{ normalizedFronts: Set<string>; error: ServiceError | null }>
```
Queries `SELECT front FROM flashcards WHERE set_id = $1`, builds a `Set` of `f.trim().toLowerCase()` values. Returns `clientUnavailable` if no client, `dbError` on query failure.

#### 1.2 Modify `createFlashcard` — block duplicates

**File**: `src/lib/services/flashcards.ts`

**Intent**: After verifying set ownership but before inserting, check whether the normalized front already exists in the set. If it does, return a `validationError` instead of inserting.

**Contract**: Insert a call to `checkDuplicateFronts` between the ownership check (line 36) and the insert (line 38). If the normalized `content.front` is in the returned set, return:
```ts
{ data: null, error: { kind: "validationError", message: "A flashcard with this front text already exists in this set." } }
```
Otherwise proceed with the existing insert logic unchanged.

#### 1.3 Modify `createFlashcardsBulk` — skip duplicates, report them

**File**: `src/lib/services/flashcards.ts`

**Intent**: Before inserting, filter out cards whose normalized front already exists in the set. Insert only the unique ones. Return information about what was skipped so callers can report it.

**Contract**: 
- Insert a call to `checkDuplicateFronts` between the ownership check (line 58) and the insert (line 68).
- Filter `contents` to only those whose normalized front is NOT in the existing set.
- Compute `skippedCount = contents.length - uniqueContents.length` and `skippedFronts` = the original `front` values that were filtered out.
- If `uniqueContents.length === 0`, return `{ data: [], skippedCount, skippedFronts, error: null }` (not an error — just nothing to save).
- Extend the return type from `{ data, error }` to `{ data, skippedCount, skippedFronts, error }`. `skippedCount` and `skippedFronts` are always present (0 and `[]` when nothing skipped).

### Success Criteria

#### Automated Verification

- TypeScript compiles: `npx tsc --noEmit` on `src/lib/services/flashcards.ts`
- Existing tests pass (if any touch these functions)
- Lint passes on changed files: `npx eslint src/lib/services/flashcards.ts`

#### Manual Verification

- Not directly testable in isolation — verified in Phase 2 via API endpoints

---

## Phase 2: API Endpoints — Wire Up Duplicate Handling

### Overview

Update the three API endpoints to surface duplicate information: single-create endpoint must be updated to map `validationError` → 400, batch endpoint includes skipped info, and generate endpoint gains the AI harness.

### Changes Required

#### 2.1 Single-create endpoint — map `validationError` to 400

**File**: `src/pages/api/flashcards/index.ts`

**Intent**: Once `createFlashcard` can return `validationError` for a duplicate front, the API route must expose it as HTTP 400 so existing frontend error handlers in `CreateFlashcardDialog` and `LookupWordPage` work correctly.

**Contract**: Update the error status mapping (line 47) from `const status = isNotFound(error) ? 404 : 500;` to:
```ts
const status = isNotFound(error) ? 404 : error.kind === "validationError" ? 400 : 500;
```

#### 2.2 Batch endpoint — include skipped info in response

**File**: `src/pages/api/sets/[id]/flashcards/batch.ts`

**Intent**: After `createFlashcardsBulk` returns `skippedCount` and `skippedFronts`, include them in the JSON response so callers (`ImportCsvDialog`, `GenerateFlashcardsPage.handleSave`) can report what was filtered.

**Contract**: Destructure `skippedCount` and `skippedFronts` from the service call (line 53). Extend the success response (line 63) shape from `{ data, count }` to `{ data, count, skippedCount, skippedFronts }`. Include `skippedCount` and `skippedFronts` only when `skippedCount > 0` to keep responses clean for the common case.

Update `ImportCsvDialog` so it adds per-chunk `skippedCount` to its existing `parseSkippedCount` before calling `onImport`. This is the minimal UI change needed so CSV imports report database duplicates as skipped lines.

#### 2.3 Generate endpoint — AI harness for duplicate filtering

**File**: `src/pages/api/sets/[id]/generate.ts`

**Intent**: After `generateFlashcardProposals` returns successfully (line 132-141), query existing fronts in the set and filter out proposals whose normalized front matches an existing card. Return only unique proposals plus information about removed ones. This is the "harness" — the LLM never sees duplicates, the filtering happens server-side before the frontend receives data.

**Contract**: 
- After line 141 (successful generation), call `checkDuplicateFronts(supabase, setId)`.
- Filter `data` (the proposals) to only those whose `front.trim().toLowerCase()` is NOT in the normalized set.
- Compute `removedCount = data.length - uniqueProposals.length` and `removedFronts` = the original `front` values that were removed.
- Change the success response (line 151) from `{ flashcards: data }` to `{ flashcards: uniqueProposals, removedCount, removedFronts }`. Always include both fields (0 and `[]` when nothing removed).
- If ALL proposals are duplicates (`uniqueProposals.length === 0`), still return 200 with `{ flashcards: [], removedCount, removedFronts }` — the frontend will show an appropriate message.
- If `checkDuplicateFronts` returns an error, return the original LLM proposals unchanged with `removedCount: 0` and `removedFronts: []`. Do not fail the request; the duplicate race/edge is acceptable when the database query fails because the alternative is discarding a costly LLM response.

### Success Criteria

#### Automated Verification

- TypeScript compiles on changed files
- Lint passes: `npx eslint src/pages/api/sets/[id]/flashcards/batch.ts src/pages/api/sets/[id]/generate.ts`

#### Manual Verification

- **Single create**: `POST /api/flashcards` with a duplicate front → 400, message "A flashcard with this front text already exists in this set."
- **Single create**: `POST /api/flashcards` with same front different case → 400 (normalized match)
- **Batch create**: `POST /api/sets/{id}/flashcards/batch` with mix of new + duplicate → 201, `skippedCount > 0`, `skippedFronts` populated
- **Batch create**: `POST /api/sets/{id}/flashcards/batch` with all duplicates → 201, `data: []`, `skippedCount = N`
- **AI generate**: `POST /api/sets/{id}/generate` → 200, `removedCount` reflects duplicates, `removedFronts` lists them
- **AI generate**: All proposals are duplicates → 200, `flashcards: []`, `removedCount > 0`

---

## Phase 3: Frontend — Display Duplicate Information

### Overview

`CreateFlashcardDialog` and `LookupWordPage` already handle 400 errors with toast + inline text — they work without changes. `GenerateFlashcardsPage` needs a banner for removed AI duplicates. `ImportCsvDialog` needs to include per-chunk `skippedCount` in its existing skipped-lines counter.

### Changes Required

#### 3.1 GenerateFlashcardsPage — handle removed duplicates from AI harness

**File**: `src/components/ai/GenerateFlashcardsPage.tsx`

**Intent**: When the generate endpoint returns `removedCount > 0`, display an informational banner above the proposals list showing how many and which proposals were removed because they already exist in the set.

**Contract**:
- Extend the `GenerateResponse` interface (line 30-34) to include `removedCount?: number` and `removedFronts?: string[]`.
- In `handleGenerate` (line 100-136), after a successful response, capture `removedCount` and `removedFronts` from the result.
- Add state: `const [removedInfo, setRemovedInfo] = useState<{ count: number; fronts: string[] } | null>(null)`.
- When `removedCount > 0`, set `removedInfo` before setting proposals.
- In the proposals section (lines 313-370), render a banner above the proposals list when `removedInfo` is set:
  ```
  <div className="rounded-md border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200">
    {removedInfo.count} proposal(s) skipped — already exist in this set: {removedInfo.fronts.join(", ")}
  </div>
  ```
  Use amber/yellow styling (not red — this is informational, not an error).
- Clear `removedInfo` when discarding proposals or generating new ones.

### Success Criteria

#### Automated Verification

- TypeScript compiles: `npx tsc --noEmit` on `src/components/ai/GenerateFlashcardsPage.tsx`
- Lint passes: `npx eslint src/components/ai/GenerateFlashcardsPage.tsx`

#### Manual Verification

- **Manual create duplicate**: Open CreateFlashcardDialog, enter a front that already exists → inline error + toast with duplicate message
- **Lookup create duplicate**: On `/lookup_word`, create a card with existing front → inline error + toast
- **AI generate with duplicates**: Generate proposals for a set that already has some of the generated fronts → amber banner appears above proposals showing count + list of removed fronts
- **AI generate no duplicates**: Generate proposals for an empty set → no banner, normal flow
- **AI generate all duplicates**: Generate for a set where all proposals match existing → banner shows all removed, empty proposals list, appropriate message

---

## Phase 4: OpenAPI Specification

### Overview

Document the new response fields and error scenarios in the OpenAPI spec so the Scalar docs at `/docs/api` stay accurate.

### Changes Required

#### 4.1 Update batch endpoint response schema

**File**: `src/lib/openapi/openapi-spec.ts`

**Intent**: Document the new `skippedCount` and `skippedFronts` fields in the 201 response for `POST /api/sets/{id}/flashcards/batch`.

**Contract**: In the 201 response schema (around line 701-717), add optional properties `skippedCount` (integer) and `skippedFronts` (array of strings). Add a 409 response for the duplicate conflict case (though the current implementation returns 201 with skipped info — document the actual behavior).

#### 4.2 Update generate endpoint response schema

**File**: `src/lib/openapi/openapi-spec.ts`

**Intent**: Document the new `removedCount` and `removedFronts` fields in the 200 response for `POST /api/sets/{id}/generate`.

**Contract**: In the 200 response schema (around line 868-890), add required properties `removedCount` (integer) and `removedFronts` (array of strings). Update the description to mention duplicate filtering.

#### 4.3 Update single create endpoint error responses

**File**: `src/lib/openapi/openapi-spec.ts`

**Intent**: Document the new duplicate error scenario for `POST /api/flashcards`.

**Contract**: Add a 409 response (or note in the existing 400 response description) that a duplicate front returns a validation error with the specific message. Since the implementation uses 400 (not 409), update the 400 response description to mention duplicate front as a possible cause.

### Success Criteria

#### Automated Verification

- TypeScript compiles: `npx tsc --noEmit` on `src/lib/openapi/openapi-spec.ts`
- Lint passes: `npx eslint src/lib/openapi/openapi-spec.ts`

#### Manual Verification

- Open `/docs/api` in browser, navigate to `POST /api/flashcards` → 400 response mentions duplicate front
- Navigate to `POST /api/sets/{id}/flashcards/batch` → 201 response shows `skippedCount` and `skippedFronts`
- Navigate to `POST /api/sets/{id}/generate` → 200 response shows `removedCount` and `removedFronts`

---

## Testing Strategy

### Unit Tests

- `checkDuplicateFronts` returns correct normalized set for a set with cards
- `checkDuplicateFronts` returns empty set for a set with no cards
- `createFlashcard` returns `validationError` when normalized front matches existing
- `createFlashcard` succeeds when front is unique (including case differences that normalize to different strings)
- `createFlashcardsBulk` filters duplicates and returns `skippedCount`/`skippedFronts`
- `createFlashcardsBulk` returns empty data + full skipped info when all are duplicates

### Integration Tests

- `POST /api/flashcards` with duplicate → 400, correct message
- `POST /api/flashcards` with unique → 201
- `POST /api/sets/{id}/flashcards/batch` with mixed → 201, correct skipped info
- `POST /api/sets/{id}/generate` with existing fronts → 200, correct removed info

### Manual Testing Steps

1. Create a flashcard with front "Hello" in a set
2. Try to create another with front "  hello  " → should be blocked as duplicate
3. Try to create "Hello World" → should succeed (different normalized string)
4. Generate AI proposals from text that would produce "Hello" → banner shows it was removed
5. Import CSV with some duplicate rows → skipped count reported

## Performance Considerations

- `checkDuplicateFronts` fetches all `front` columns for a set. For sets with thousands of cards, this could be a large payload. Mitigation: `front` is capped at 1000 chars, and typical sets have < 500 cards. If this becomes a bottleneck, add a database index on `(set_id, front)` and use a targeted query with normalized comparison. This is a known trade-off documented in the plan; no code change needed at this scale.
- The generate endpoint now makes one extra DB query (after the LLM call). This is negligible compared to the LLM call latency (~5-40s).

## References

- Change request: `context/changes/prevent-duplicate-flashcards/change.md`
- Flashcards service: `src/lib/services/flashcards.ts`
- AI generation endpoint: `src/pages/api/sets/[id]/generate.ts`
- Batch endpoint: `src/pages/api/sets/[id]/flashcards/batch.ts`
- Single create endpoint: `src/pages/api/flashcards/index.ts`
- Generate frontend: `src/components/ai/GenerateFlashcardsPage.tsx`
- OpenAPI spec: `src/lib/openapi/openapi-spec.ts`
- Lessons: `context/foundation/lessons.md` (OpenAPI update rule, line 88)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Service Layer — Duplicate Detection

#### Automated

- [x] 1.1 TypeScript compiles on `src/lib/services/flashcards.ts` (no new errors vs. main baseline) — f30750f
- [x] 1.2 Lint passes on `src/lib/services/flashcards.ts` — f30750f

#### Manual

- [x] 1.3 Manual verification deferred to Phase 2 (API endpoints) — f30750f

### Phase 2: API Endpoints — Wire Up Duplicate Handling

#### Automated

- [x] 2.1 TypeScript compiles on changed API files (no new errors vs. main baseline) — 56dc92b
- [x] 2.2 Lint passes on `src/pages/api/sets/[id]/flashcards/batch.ts` and `src/pages/api/sets/[id]/generate.ts` — 56dc92b

#### Manual

- [x] 2.3 Single create: duplicate front → 400 with correct message
- [x] 2.4 Single create: case-different duplicate → 400
- [x] 2.5 Batch create: mixed new + duplicate → 201 with skipped info
- [x] 2.6 Batch create: all duplicates → 201 with empty data + skipped info
- [x] 2.7 AI generate: duplicates removed → 200 with removedCount/removedFronts
- [x] 2.8 AI generate: all duplicates → 200 with empty flashcards + removed info

### Phase 3: Frontend — Display Duplicate Information

#### Automated

- [x] 3.1 TypeScript compiles on `src/components/ai/GenerateFlashcardsPage.tsx` (no new errors vs. main baseline) — b7f16e3
- [x] 3.2 Lint passes on `src/components/ai/GenerateFlashcardsPage.tsx` — b7f16e3

#### Manual

- [x] 3.3 Manual create: duplicate shows inline error + toast
- [x] 3.4 Lookup create: duplicate shows inline error + toast
- [x] 3.5 AI generate: amber banner with removed count + fronts
- [x] 3.6 AI generate: no duplicates → no banner
- [x] 3.7 AI generate: all duplicates → banner + empty proposals

### Phase 4: OpenAPI Specification

#### Automated

- [x] 4.1 TypeScript compiles on `src/lib/openapi/openapi-spec.ts` (no new errors vs. main baseline) — bd7791b
- [x] 4.2 Lint passes on `src/lib/openapi/openapi-spec.ts` — bd7791b

#### Manual

- [x] 4.3 `/docs/api` shows updated schemas for all three endpoints
