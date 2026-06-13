# Manual Flashcard CRUD Implementation Plan

## Overview

Add full manual CRUD for flashcards inside a set. Users can create new flashcards via a dialog, edit existing flashcards in a dialog, and delete flashcards with confirmation. The set detail page (`/sets/[id]`) becomes interactive. This change also replaces the placeholder card count on the dashboard with the real number of flashcards per set. This is S-03 and unlocks fallback content creation for edge cases AI cannot handle.

## Current State Analysis

- **Set detail page** (`src/pages/sets/[id].astro:1-119`): server-rendered, read-only list of flashcards. No React islands, no create/edit/delete controls, no client-side state.
- **Set service** (`src/lib/services/sets.ts:1-100`): covers set CRUD and `getSetWithFlashcards()`. No flashcard-specific service exists yet.
- **API layer**: `src/pages/api/sets/` handles sets. No flashcard mutation endpoints.
- **Middleware** (`src/middleware.ts:4-5`): protects `/dashboard`, `/sets` pages and `/api/sets` API. `/api/flashcards` is not protected yet.
- **UI components**: shadcn `Dialog`, `Input`, `Button`, `Card`, `DropdownMenu` already installed. Sonner toasts wired in layout.
- **Dashboard** (`src/components/sets/SetCard.tsx:70`): shows `&mdash; cards` placeholder because `FlashcardSet` has no count field.
- **Database**: `flashcards` table has `front`, `back`, all SR columns with defaults. RLS allows mutations only for owners via `set_id` ownership.

### Key Discoveries

- The existing `FlashcardCard` or `FlashcardList` component does not exist yet.
- The set detail page is pure Astro; adding interactivity means converting it to a React island or wrapping the list in one.
- `getSetWithFlashcards()` fetches flashcards ordered by `created_at DESC` so newest flashcards appear first, matching the optimistic UI update (`onCreate` prepends).
- RLS policies on `flashcards` gate by `set_id in (select id from sets where user_id = auth.uid())`. Service functions do not need to pass `userId` to Supabase for reads because RLS enforces it, but mutations should still validate ownership to return meaningful 404s.
- `dashboard.astro` serializes initial sets as JSON string because Astro props cannot pass non-serializable objects to React islands (`SetDashboard` already does this).

## Desired End State

Authenticated users viewing `/sets/[id]` see the set name and a list of flashcards. A "New flashcard" button opens a dialog with front/back inputs. Each flashcard has a dropdown menu with Edit and Delete actions. Edit opens the same dialog pre-filled. Delete opens a confirmation dialog. All mutations show sonner toasts and update the local list optimistically. The dashboard set cards display the real flashcard count. All new API routes return JSON and are protected by middleware.

## What We're NOT Doing

- AI flashcard generation — belongs to S-01.
- CSV import — belongs to S-04.
- Public share links — belongs to S-07.
- Spaced repetition review sessions — belongs to S-05.
- Learning statistics — belongs to S-06.
- Rich text / markdown / images in flashcard fields (plain text only).
- Bulk operations, drag-and-drop reordering, pagination.
- Soft delete or review-history preservation beyond existing `ON DELETE CASCADE`.
- Updating SR algorithm columns on manual create/edit (defaults from schema are used).

## Implementation Approach

Bottom-up: middleware extension, flashcard service layer, API routes, then UI. Reuse the patterns established by S-02 (`fetch` + JSON, Zod validation, sonner toasts, dialog-based mutations). Convert the set detail page from pure Astro to a server-rendered shell that passes serialized set + flashcards to a React island handling all client-side CRUD. Add a lightweight count query to the dashboard's set list.

## Critical Implementation Details

- **Middleware route matching**: adding `/api/flashcards` to `PROTECTED_API_ROUTES` uses the same boundary-aware check (`pathname === route || pathname.startsWith(route + "/")`) already fixed in S-02.
- **Ownership validation in service**: although RLS enforces it, `updateFlashcard` and `deleteFlashcard` should return `"Flashcard not found"` when no row matches both `id` and the user's set ownership, so the API can return `404` instead of leaking existence.
- **Dashboard count query**: `listSetsWithCounts()` performs a single query joining `sets` with a flashcard count aggregate to avoid N+1. For MVP scale (<50 sets) this is sufficient.
- **State initialization**: `SetDetailPage` receives `initialData` as a JSON string (same pattern as `SetDashboard`) because Astro props to React islands must be serializable.

---

## Phase 1: Middleware Extension & Flashcard Service Layer

### Overview

Extend middleware to protect the new flashcard API, create `src/lib/services/flashcards.ts` with CRUD functions and Zod schemas, and update `src/lib/services/sets.ts` to return flashcard counts for the dashboard.

### Changes Required

#### 1. Extend protected API routes

**File**: `src/middleware.ts`

**Intent**: Ensure unauthenticated requests to `/api/flashcards` receive a `401` JSON response, consistent with `/api/sets` protection.

**Contract**: Add `"/api/flashcards"` to `PROTECTED_API_ROUTES`. No other changes.

#### 2. Flashcard service module

**File**: `src/lib/services/flashcards.ts` (new file)

**Intent**: Encapsulate all Supabase flashcard query logic. Provide validation schemas shared with client forms.

**Contract**: Export:

- `flashcardContentSchema` — `z.object({ front: z.string().min(1).max(1000), back: z.string().min(1).max(1000) })`.
- `FlashcardContent = z.infer<typeof flashcardContentSchema>`.
- `createFlashcard(client, setId, content)` → `Promise<{ data: Flashcard | null; error: string | null }>` — inserts `{ set_id, front, back }`. Returns the created row.
- `updateFlashcard(client, flashcardId, content)` → `Promise<{ data: Flashcard | null; error: string | null }>` — updates `front`, `back`, and lets the trigger bump `updated_at`. Verifies ownership indirectly by joining to the user's set; returns `"Flashcard not found"` if the row is not accessible. Note: the service does not need to reorder rows; the UI prepends updated cards to match the `created_at DESC` display order.
- `deleteFlashcard(client, flashcardId)` → `Promise<{ error: string | null }>` — deletes the flashcard if accessible; returns `"Flashcard not found"` otherwise.

All functions handle `null` client by returning `{ data: null, error: "Supabase client not available" }`.

#### 3. Install shadcn/ui Textarea

**File**: `src/components/ui/textarea.tsx` (via `npx shadcn@latest add textarea`)

**Intent**: Add a multi-line Textarea component for flashcard front/back fields. Better UX than a single-line Input for content that may span multiple lines up to 1000 characters.

**Contract**: `textarea.tsx` exists in `src/components/ui/` exporting `Textarea`.

#### 4. Add flashcard count to set list

**File**: `src/lib/services/sets.ts`

**Intent**: Provide the dashboard with the real number of flashcards per set so `SetCard` can stop showing the placeholder.

**Contract**: Add a new function `listSetsWithFlashcardCounts(client, userId)` that returns `Promise<{ data: Array<FlashcardSet & { flashcard_count: number }> | null; error: string | null }>` using a single Supabase query that joins `sets` with a subquery counting `flashcards` grouped by `set_id`, ordered by `sets.updated_at DESC`. Keep `listSets()` unchanged for backward compatibility.

### Success Criteria

#### Automated Verification

- `npm run build` passes
- `npm run lint` passes

#### Manual Verification

- `PATCH /api/flashcards/[id]` without session returns `401`
- `POST /api/flashcards` without session returns `401`
- `DELETE /api/flashcards/[id]` without session returns `401`
- `listSetsWithFlashcardCounts()` returns sets with `flashcard_count` >= 0
- `src/components/ui/textarea.tsx` exists after `npx shadcn@latest add textarea`

---

## Phase 2: Flashcard API Routes

### Overview

Create two API route files for flashcard mutations: a collection endpoint for creation and a dynamic endpoint for update/delete.

### Changes Required

#### 1. Flashcard collection API

**File**: `src/pages/api/flashcards/index.ts` (new file)

**Intent**: Handle `POST /api/flashcards` to create a flashcard within a set.

**Contract**:

- Reads `context.locals.user` and `context.locals.supabase`; returns `401` if missing.
- Parses JSON body. Expects `{ set_id, front, back }`.
- Validates `set_id` as a non-empty string and `{ front, back }` against `flashcardContentSchema`. Returns `400 { error: "Validation failed", details: [...] }` on failure.
- Calls `createFlashcard(supabase, set_id, { front, back })`.
- Returns `201` with the created flashcard or `4xx/5xx` with error.

#### 2. Flashcard dynamic API

**File**: `src/pages/api/flashcards/[id].ts` (new file)

**Intent**: Handle `PATCH /api/flashcards/[id]` (edit) and `DELETE /api/flashcards/[id]` (delete).

**Contract**:

- Reads `context.params.id` and `context.locals.user`/`supabase`; returns `401`/`400` as appropriate.
- `PATCH`: parses JSON, validates `{ front, back }` against `flashcardContentSchema`, calls `updateFlashcard()`, returns `200` with updated flashcard or `404`/`500` with error.
- `DELETE`: calls `deleteFlashcard()`, returns `200 { success: true }` or `404`/`500` with error.

### Success Criteria

#### Automated Verification

- `npm run build` passes
- `npm run lint` passes

#### Manual Verification

- `POST /api/flashcards` with `{ set_id, front, "back" }` creates a flashcard and returns `201`
- `POST` with empty `front` returns `400` validation error
- `PATCH /api/flashcards/[id]` updates front/back and returns `200`
- `DELETE /api/flashcards/[id]` deletes and returns `200 { success: true }`
- Cross-user flashcard access returns `404` (not `403`) to avoid leaking existence

---

## Phase 3: Set Detail Page CRUD UI

### Overview

Convert the set detail page from a read-only Astro template into a server-rendered shell around a React island that handles flashcard CRUD with dialogs and toasts.

### Changes Required

#### 1. Server-rendered set detail shell

**File**: `src/pages/sets/[id].astro`

**Intent**: Keep server-side fetching of the set and flashcards, but delegate interactive rendering to a React island.

**Contract**: Frontmatter continues calling `getSetWithFlashcards(supabase, id)`. On error/404, render the existing error/not-found layouts. On success, render `<Layout title={data.set.name}>` and pass `initialData={JSON.stringify(data)}` to `<SetDetailPage client:load />`.

#### 2. Set detail page React island

**File**: `src/components/sets/SetDetailPage.tsx` (new file)

**Intent**: Top-level container for the set detail page. Manages flashcard list state, dialog open states, and orchestrates create/edit/delete dialogs.

**Contract**: Props `{ initialData: string }`. Internal state parsed from JSON into `{ set: FlashcardSet; flashcards: Flashcard[] }`. Manages `createOpen`, `editTarget`, `deleteTarget`. Callbacks:

- `onCreate(flashcard)` — prepends to list, closes dialog, toasts success.
- `onUpdate(flashcard)` — replaces item in list, closes dialog, toasts success.
- `onDelete(flashcardId)` — removes from list, closes dialog, toasts success.

Renders header (back link, set name, card count, "New flashcard" button) and `FlashcardList`.

#### 3. Flashcard list component

**File**: `src/components/sets/FlashcardList.tsx` (new file)

**Intent**: Render the list of flashcards with empty state and per-card action menu.

**Contract**: Props `{ flashcards: Flashcard[]; onEdit: (f: Flashcard) => void; onDelete: (f: Flashcard) => void }`. Maps each flashcard to `FlashcardCard`. Empty state: "No flashcards yet. Create your first flashcard to get started."

#### 4. Flashcard card component

**File**: `src/components/sets/FlashcardCard.tsx` (new file)

**Intent**: Display one flashcard with front/back text and a dropdown menu for Edit/Delete.

**Contract**: Props `{ flashcard: Flashcard; onEdit: () => void; onDelete: () => void }`. Uses glassmorphism card style. Dropdown triggered by `MoreHorizontal` icon. Edit and Delete menu items call the callbacks. No navigation link wrapping the card (unlike `SetCard`), because the card itself is not a link.

#### 5. Create flashcard dialog

**File**: `src/components/sets/CreateFlashcardDialog.tsx` (new file)

**Intent**: Dialog for creating a new flashcard with front/back inputs.

**Contract**: Props `{ open; onOpenChange; setId; onCreate }`. Internal state `front`, `back`, `error`, `pending`. Validates with `flashcardContentSchema.safeParse()`. Uses shadcn `Textarea` for both `front` and `back` fields. Calls `POST /api/flashcards`. On `201`: calls `onCreate(data)`, resets form, closes. On error: inline error + toast.

#### 6. Edit flashcard dialog

**File**: `src/components/sets/EditFlashcardDialog.tsx` (new file)

**Intent**: Dialog for editing an existing flashcard; pre-fills front/back.

**Contract**: Props `{ flashcard: Flashcard | null; open; onOpenChange; onUpdate }`. Same validation and fetch pattern as Create; uses `Textarea` for front/back. Calls `PATCH /api/flashcards/${flashcard.id}`. On `200`: calls `onUpdate(data)`, closes.

#### 7. Delete flashcard dialog

**File**: `src/components/sets/DeleteFlashcardDialog.tsx` (new file)

**Intent**: Confirmation dialog before deleting a flashcard.

**Contract**: Props `{ flashcard: Flashcard | null; open; onOpenChange; onDelete }`. Calls `DELETE /api/flashcards/${flashcard.id}`. On `200`: calls `onDelete(flashcard.id)`, closes, toasts success.

### Success Criteria

#### Automated Verification

- `npm run build` passes
- `npm run lint` passes

#### Manual Verification

- `/sets/[valid-id]` shows flashcards and a "New flashcard" button
- Creating a flashcard adds it to the list immediately with a success toast
- Validation rejects empty front/back with inline error
- Edit dialog pre-fills and updates the card in place
- Delete dialog removes the card with a toast
- Empty set shows empty state message
- Page remains responsive on mobile

---

## Phase 4: Dashboard Flashcard Count

### Overview

Replace the placeholder card count on dashboard set cards with the real count returned by the new service function.

### Changes Required

#### 1. Dashboard data fetch

**File**: `src/pages/dashboard.astro`

**Intent**: Fetch sets with flashcard counts instead of plain sets.

**Contract**: Replace `listSets(supabase, user.id)` with `listSetsWithFlashcardCounts(supabase, user.id)`. Pass the richer array to `SetDashboard` as JSON string.

#### 2. Update SetDashboard prop type

**File**: `src/components/sets/SetDashboard.tsx`

**Intent**: Accept sets that include `flashcard_count`.

**Contract**: Change internal state type to `Array<FlashcardSet & { flashcard_count: number }>`. Pass this through to `SetGrid` and `SetCard`.

#### 3. Update SetCard to display count

**File**: `src/components/sets/SetCard.tsx`

**Intent**: Show the real flashcard count.

**Contract**: Add `flashcardCount: number` prop. Replace `&mdash; cards` with `{flashcardCount} {flashcardCount === 1 ? "card" : "cards"}`.

#### 4. Update SetGrid prop types

**File**: `src/components/sets/SetGrid.tsx`

**Intent**: Pass count through to SetCard.

**Contract**: Use the richer `FlashcardSet & { flashcard_count: number }` type and pass `flashcardCount={set.flashcard_count}` to each `SetCard`.

### Success Criteria

#### Automated Verification

- `npm run build` passes
- `npm run lint` passes

#### Manual Verification

- Dashboard set cards show correct card counts
- New set shows "0 cards"
- After creating flashcards in a set, returning to dashboard shows updated count

---

## Testing Strategy

### Automated

- `npm run build` — catches TypeScript errors across all new components and API routes
- `npm run lint` — catches import errors, unused variables, style issues

### Manual Testing Steps

1. Sign in → navigate to `/dashboard` — confirm set cards show real counts.
2. Click a set → `/sets/[id]` — confirm list and "New flashcard" button.
3. Create a flashcard — dialog closes, card appears, toast shows.
4. Try creating with empty front/back — inline validation error.
5. Edit the flashcard — text updates in place, toast shows.
6. Delete the flashcard — confirmation dialog, then removal, toast shows.
7. Create several flashcards — newest card appears at the top of the list.
8. Sign out — try `POST /api/flashcards`, `PATCH /api/flashcards/[id]`, `DELETE /api/flashcards/[id]` — all return `401`.
9. Cross-user: as user A create a flashcard; sign in as user B; `PATCH`/`DELETE` that flashcard ID → `404`.
10. Return to dashboard — confirm count updated after mutations.

## Performance Considerations

- Dashboard count is a single aggregate query, no N+1.
- Set detail page server-renders initial data; mutations update client state without full page reload.
- No pagination for MVP scale (< 50 flashcards per set initially).

## Migration Notes

No schema or data migration needed. Existing `flashcards` table and RLS policies already support the operations. New service functions only add queries on top of the existing schema.

## References

- Roadmap S-03: `context/foundation/roadmap.md:104-114`
- PRD FR-004 / FR-005 / FR-006: `context/foundation/prd.md:113-122`
- PRD US-004: `context/foundation/prd.md:65-69`
- DB schema: `supabase/migrations/20260610000000_initial_schema.sql:15-32`
- RLS policies for flashcards: `supabase/migrations/20260610000000_initial_schema.sql:113-166`
- Prior set CRUD plan: `context/archive/2026-06-13-set-and-deck-management/plan.md`
- Set detail page: `src/pages/sets/[id].astro`
- Set service: `src/lib/services/sets.ts`
- Middleware: `src/middleware.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Middleware Extension & Flashcard Service Layer

#### Automated

- [x] 1.1 Dependencies install without conflicts: `npx shadcn@latest add textarea`
- [x] 1.2 Build passes: `npm run build`
- [x] 1.3 Lint passes: `npm run lint`

#### Manual

- [ ] 1.4 `/api/flashcards` endpoints return `401` without session
- [x] 1.5 `listSetsWithFlashcardCounts()` returns sets with counts
- [ ] 1.6 `Textarea` component exists in `src/components/ui/`

### Phase 2: Flashcard API Routes

#### Automated

- [ ] 2.1 Build passes: `npm run build`
- [ ] 2.2 Lint passes: `npm run lint`

#### Manual

- [ ] 2.3 `POST /api/flashcards` creates a flashcard, returns `201`
- [ ] 2.4 `POST` with empty front/back returns `400`
- [ ] 2.5 `PATCH /api/flashcards/[id]` updates and returns `200`
- [ ] 2.6 `DELETE /api/flashcards/[id]` deletes and returns `200`
- [ ] 2.7 Cross-user access returns `404`

### Phase 3: Set Detail Page CRUD UI

#### Automated

- [ ] 3.1 Build passes: `npm run build`
- [ ] 3.2 Lint passes: `npm run lint`

#### Manual

- [ ] 3.3 `/sets/[valid-id]` shows list + "New flashcard" button
- [ ] 3.4 Create dialog adds card to list + toast
- [ ] 3.5 Empty fields show inline validation error
- [ ] 3.6 Edit dialog updates card in place + toast
- [ ] 3.7 Delete dialog removes card + toast
- [ ] 3.8 Empty set shows empty state

### Phase 4: Dashboard Flashcard Count

#### Automated

- [ ] 4.1 Build passes: `npm run build`
- [ ] 4.2 Lint passes: `npm run lint`

#### Manual

- [ ] 4.3 Dashboard cards show real counts
- [ ] 4.4 New set shows "0 cards"
- [ ] 4.5 Count updates after creating/deleting flashcards
