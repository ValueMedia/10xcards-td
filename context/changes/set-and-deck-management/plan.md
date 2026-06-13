# Set & Deck Management Implementation Plan

## Overview

Implement full CRUD for flashcard sets: a dashboard with a card grid listing all user's sets, dialog-based create/rename/delete operations with toast notifications, and a separate set detail page for browsing flashcards within a set. This is S-02 — it establishes the primary navigation container for the entire app and unblocks S-03, S-04, S-05, and S-07.

## Current State Analysis

- **Dashboard** (`src/pages/dashboard.astro:1-27`): placeholder — static welcome message + sign-out button. No data fetching, no set listing, no React islands.
- **API layer** (`src/pages/api/auth/`): only auth endpoints (signin/signup/signout). All use `context.redirect()` — no JSON responses exist. No `supabase.from()` calls anywhere in the codebase.
- **React components** (`src/components/auth/`): `SignInForm`, `SignUpForm`, `FormField`, `SubmitButton`, `ServerError` — form patterns exist but are auth-specific. No set-related components.
- **Types** (`src/types.ts:1-53`): `FlashcardSet`, `Flashcard`, `Review` interfaces exist with `State`/`Rating` re-exports from ts-fsrs. Named `FlashcardSet` (not `Set`) per impl-review fix F4.
- **Database** (`supabase/migrations/20260610000000_initial_schema.sql`): `sets` table with full RLS (SELECT/INSERT/UPDATE/DELETE per `user_id = auth.uid()`). `flashcards` table with RLS gated through set ownership.
- **Middleware** (`src/middleware.ts:4,18`): `PROTECTED_ROUTES = ["/dashboard"]` with `startsWith` check — has a latent false-positive bug (`/sets` would match `/settings`).
- **UI foundation**: shadcn Button only. Cosmic theme (dark gradient bg, glassmorphism cards, gradient text). `cn()` helper from `@/lib/utils`. lucide-react icons.
- **No existing**: dynamic routes, JSON API responses, service layer, toast notifications, form validation library, Dialog/Input/Card/DropdownMenu components.

### Key Discoveries

- `output: "server"` in `astro.config.mjs:12` means dynamic routes (`[id]`) work without `getStaticPaths` — `Astro.params.id` / `context.params.id` available at request time.
- `startsWith("/sets")` in middleware would accidentally match `/settings` — needs boundary-aware check (`pathname === route || pathname.startsWith(route + "/")`).
- `FlashcardSet` is the canonical type name (not `Set`) per `context/archive/2026-06-10-data-schema/plan.md:351`.
- `State` and `Rating` are value re-exports (runtime enums), not type-only — per `src/types.ts:4-6`.
- No existing `supabase.from()` calls — this change introduces the first database query pattern in the codebase.
- Auth forms use HTML `<form method="POST" action="...">` with server redirects. Dialog-based CRUD needs fetch + JSON instead — no full-page navigation.

## Desired End State

Authenticated users see a dashboard with a responsive grid of set cards (name, flashcard count, last-opened date). A "+" button opens a dialog to create a new set. Each card has a dropdown menu with Rename and Delete actions — both open confirmation dialogs. All mutations show sonner toast notifications (success/error). Clicking a card navigates to `/sets/[id]` where the user browses flashcards in a read-only list. All API routes return JSON and are protected by middleware. A service layer (`src/lib/services/sets.ts`) encapsulates Supabase query logic.

## What We're NOT Doing

- Flashcard CRUD (create/edit/delete flashcards) — belongs to S-03
- AI flashcard generation — belongs to S-01
- CSV import — belongs to S-04
- Public share links — belongs to S-07
- Spaced repetition review sessions — belongs to S-05
- Learning statistics — belongs to S-06
- Full-text search or filtering of sets/flashcards
- Pagination (MVP scale: < 50 sets per user)
- Drag-and-drop reordering of sets
- Bulk operations (multi-select delete, etc.)

## Implementation Approach

Bottom-up: dependencies first, then middleware fix, then service layer + API routes, then UI. Each phase is independently verifiable. The service layer pattern (`src/lib/services/sets.ts`) establishes the convention for all future feature slices. API routes use Zod for input validation and return JSON — a new pattern for this codebase. React components use fetch + client state for dialog-based mutations (not HTML form POST + redirect). Sonner provides toast notifications for all mutation outcomes.

## Critical Implementation Details

- **Middleware boundary check**: `startsWith("/sets")` matches `/settings`. Use `pathname === route || pathname.startsWith(route + "/")` for both page routes (`/sets`) and API routes (`/api/sets`). This is a latent bug fix, not just a feature addition.
- **`FlashcardSet` not `Set`**: The entity type is `FlashcardSet` to avoid shadowing the global ES2015 `Set`. All imports, service functions, and component props must use `FlashcardSet`.
- **First `supabase.from()` usage**: This change introduces the first database query pattern. The service layer must handle the `null` client case (when Supabase is unconfigured) — return a meaningful error, not crash.

---

## Phase 1: Dependencies & shadcn/ui Components

### Overview

Install zod (validation), sonner (toast notifications), and four shadcn/ui components (Dialog, Input, Card, DropdownMenu). This phase has no code to write — only install commands and verification.

### Changes Required

#### 1. Install zod

**File**: `package.json` (via `npm install zod`)

**Intent**: Add zod as a production dependency for server-side and client-side input validation. Zod schemas will validate set names (non-empty, max 200 chars) in API routes and React forms.

**Contract**: `zod` appears in `dependencies` at `^4.x.x`.

#### 2. Install sonner

**File**: `package.json` (via `npm install sonner`)

**Intent**: Add sonner v2 as a production dependency for toast notifications on create/rename/delete operations. Sonner v2 is React 19-compatible.

**Contract**: `sonner` appears in `dependencies` at `^2.x.x`.

#### 3. Install shadcn/ui Dialog

**File**: `src/components/ui/dialog.tsx` (via `npx shadcn@latest add dialog`)

**Intent**: Add the Dialog component for create-set, rename-set, and delete-set confirmation modals. Uses the "new-york" style already configured in `components.json`.

**Contract**: `dialog.tsx` exists in `src/components/ui/` with exports for `Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription`, `DialogClose`. Pulls in `@radix-ui/react-dialog` automatically.

#### 4. Install shadcn/ui Input

**File**: `src/components/ui/input.tsx` (via `npx shadcn@latest add input`)

**Intent**: Add the Input component for text fields in create/rename dialogs.

**Contract**: `input.tsx` exists in `src/components/ui/` exporting `Input`.

#### 5. Install shadcn/ui Card

**File**: `src/components/ui/card.tsx` (via `npx shadcn@latest add card`)

**Intent**: Add Card sub-components (`Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`) for set display cards in the dashboard grid.

**Contract**: `card.tsx` exists in `src/components/ui/` with the six named exports.

#### 6. Install shadcn/ui DropdownMenu

**File**: `src/components/ui/dropdown-menu.tsx` (via `npx shadcn@latest add dropdown-menu`)

**Intent**: Add DropdownMenu for per-card action menus (Rename, Delete). Uses the "new-york" style.

**Contract**: `dropdown-menu.tsx` exists in `src/components/ui/` with exports for `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, etc. Pulls in `@radix-ui/react-dropdown-menu` automatically.

### Success Criteria

#### Automated Verification

- Dependencies install without conflicts: `npm install` exits 0
- Build passes: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification

- `src/components/ui/dialog.tsx`, `input.tsx`, `card.tsx`, `dropdown-menu.tsx` all exist
- `zod` and `sonner` appear in `package.json` `dependencies`
- Importing any of the four shadcn components in a scratch `.tsx` file resolves without errors

---

## Phase 2: Middleware & Protected Routes

### Overview

Fix the `startsWith` false-positive bug in middleware and add `/sets` and `/api/sets` routes to the protected routes list. This ensures unauthenticated users are redirected away from set pages and API endpoints.

### Changes Required

#### 1. Fix middleware route matching

**File**: `src/middleware.ts`

**Intent**: Replace the bare `startsWith` check with a boundary-aware comparison that won't match `/settings` when protecting `/sets`. Add `/sets` page routes and `/api/sets` API routes as separate protected groups.

**Contract**: The `PROTECTED_ROUTES` array is replaced with two arrays: `PROTECTED_PAGE_ROUTES` (`["/dashboard", "/sets"]`) and `PROTECTED_API_ROUTES` (`["/api/sets"]`). The guard uses `pathname === route || pathname.startsWith(route + "/")` for each group. The existing behavior for `/dashboard` is preserved exactly.

### Success Criteria

#### Automated Verification

- Build passes: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification

- Visiting `/dashboard` while signed out → redirected to `/auth/signin`
- Visiting `/sets` while signed out → redirected to `/auth/signin`
- Visiting `/sets/any-uuid` while signed out → redirected to `/auth/signin`
- Visiting `/api/sets` while signed out → redirected to `/auth/signin`
- Visiting `/api/sets/any-uuid` while signed out → redirected to `/auth/signin`
- Visiting `/settings` (if it existed) while signed out → NOT redirected (false-positive fixed)
- Visiting `/dashboard` while signed in → passes through normally

---

## Phase 3: Service Layer & API Routes

### Overview

Create `src/lib/services/sets.ts` with Supabase query functions, Zod validation schemas, and three API route files. This phase establishes the service-layer pattern and the JSON API response pattern for the entire codebase.

### Changes Required

#### 1. Set service

**File**: `src/lib/services/sets.ts` (new file)

**Intent**: Encapsulate all Supabase query logic for sets in a single service module. API routes call these functions rather than writing inline queries. This establishes the `src/lib/services/` convention for all future feature slices.

**Contract**: The file exports the following functions, each accepting a Supabase client and relevant parameters:

- `listSets(client, userId)` → `Promise<{ data: FlashcardSet[] | null; error: string | null }>` — selects all sets for the user, ordered by `updated_at DESC`.
- `createSet(client, userId, name)` → `Promise<{ data: FlashcardSet | null; error: string | null }>` — inserts a new set with `user_id = userId` and the given name.
- `renameSet(client, userId, setId, name)` → `Promise<{ data: FlashcardSet | null; error: string | null }>` — updates `name` and `updated_at` for the set, gated by `user_id` match (RLS enforces this; the service passes `userId` for the RLS check).
- `deleteSet(client, userId, setId)` → `Promise<{ error: string | null }>` — deletes the set (cascades to flashcards via FK). RLS enforces ownership.
- `getSetWithFlashcards(client, setId)` → `Promise<{ data: { set: FlashcardSet; flashcards: Flashcard[] } | null; error: string | null }>` — fetches a single set with all its flashcards, ordered by `created_at ASC`. Used by the set detail page.

All functions handle the `null` client case (Supabase unconfigured) by returning `{ data: null, error: "Supabase client not available" }`.

#### 2. Zod validation schemas

**File**: `src/lib/services/sets.ts` (same file, top-level)

**Intent**: Define Zod schemas for set name validation, shared between server and client.

**Contract**: Export `setNameSchema` — a Zod string schema: `z.string().min(1, "Set name is required").max(200, "Set name must be 200 characters or less")`. Also export the inferred type `SetName = z.infer<typeof setNameSchema>`.

#### 3. Sets API index route

**File**: `src/pages/api/sets/index.ts` (new file)

**Intent**: Handle `GET /api/sets` (list all user's sets) and `POST /api/sets` (create a new set). This is the first JSON-response API route in the codebase.

**Contract**:

- `GET`: Reads `context.locals.user` (attached by middleware). If no user, returns `401 { error: "Unauthorized" }`. Creates Supabase client, calls `listSets()`, returns `200` with the array or `500` with error.
- `POST`: Reads `context.locals.user`. Parses request body as JSON (`context.request.json()`). Validates `{ name }` against `setNameSchema`. On validation failure, returns `400 { error: "Validation failed", details: [...] }`. Calls `createSet()`, returns `201` with the created set or `500` with error.

Both handlers use `new Response(JSON.stringify(...), { status, headers: { "Content-Type": "application/json" } })`.

#### 4. Sets API dynamic route

**File**: `src/pages/api/sets/[id].ts` (new file)

**Intent**: Handle `PATCH /api/sets/[id]` (rename a set) and `DELETE /api/sets/[id]` (delete a set). First dynamic API route in the codebase.

**Contract**:

- `PATCH`: Reads `context.params.id` for the set UUID. Reads `context.locals.user`. Parses JSON body, validates `{ name }` against `setNameSchema`. Calls `renameSet()`. Returns `200` with updated set or `4xx/5xx` with error.
- `DELETE`: Reads `context.params.id` and `context.locals.user`. Calls `deleteSet()`. Returns `200 { success: true }` or `4xx/5xx` with error.

#### 5. Set flashcards API route

**File**: `src/pages/api/sets/[id]/flashcards.ts` (new file)

**Intent**: Handle `GET /api/sets/[id]/flashcards` — return all flashcards for a given set. Used by the set detail page.

**Contract**: `GET`: Reads `context.params.id`. Reads `context.locals.user` (auth required — only owners can browse their flashcards). Calls `getSetWithFlashcards()`. Returns `200` with `{ set: FlashcardSet, flashcards: Flashcard[] }` or `4xx/5xx` with error.

### Success Criteria

#### Automated Verification

- Build passes: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification

- `GET /api/sets` with valid session → returns JSON array of user's sets (empty `[]` for new user)
- `POST /api/sets` with `{ "name": "My Set" }` → returns `201` with the created set object
- `POST /api/sets` with `{ "name": "" }` → returns `400` with validation error
- `PATCH /api/sets/[id]` with `{ "name": "Renamed" }` → returns `200` with updated set
- `DELETE /api/sets/[id]` → returns `200 { success: true }`; subsequent GET confirms set is gone
- `GET /api/sets/[id]/flashcards` → returns set + flashcards array
- All endpoints return `401` when called without a valid session (e.g., via `curl` without cookies)

---

## Phase 4: Dashboard Page & React Components

### Overview

Rewrite `src/pages/dashboard.astro` to fetch the user's sets server-side and render a React island with a card grid, create dialog, per-card dropdown menu (rename/delete), and sonner toast notifications. Add the Sonner `<Toaster />` to the shared layout.

### Changes Required

#### 1. Add Sonner Toaster to layout

**File**: `src/layouts/Layout.astro`

**Intent**: Render the Sonner `<Toaster />` component in the shared layout so toast notifications work on every page without per-page setup.

**Contract**: Import `Toaster` from `sonner` and render `<Toaster client:load />` inside `<body>`, after `<slot />`. Use the `client:load` directive so it hydrates immediately. Position: `rich-colors` + `closeButton` props for a polished look matching the cosmic theme.

#### 2. Rewrite dashboard page

**File**: `src/pages/dashboard.astro`

**Intent**: Replace the placeholder content with a server-side data fetch (Supabase query for user's sets) and a React island (`SetDashboard`) that receives the initial data as a prop. The page is fully server-rendered with the initial set list; the React island handles mutations (create/rename/delete) client-side.

**Contract**: The frontmatter block:
1. Reads `Astro.locals.user` (guaranteed non-null by middleware).
2. Creates a Supabase client via `createClient(Astro.request.headers, Astro.cookies)`.
3. Calls `listSets(client, user.id)` from the service layer.
4. Passes `sets` array and `user.id` as props to `<SetDashboard client:load />`.

The template renders `<Layout title="Dashboard">` wrapping the `SetDashboard` island.

#### 3. SetDashboard component

**File**: `src/components/sets/SetDashboard.tsx` (new file)

**Intent**: Top-level React component for the dashboard. Receives the initial set list and user ID as props. Manages client-side state for the set list (add/remove/update on mutations). Renders the card grid, the "New Set" button, and orchestrates dialog open/close state.

**Contract**: Props: `{ initialSets: FlashcardSet[]; userId: string }`. State: `sets` array (initialized from `initialSets`), dialog state (`createOpen`, `renameTarget`, `deleteTarget`). Renders:
- Header with "My Sets" title and a "New Set" button (opens `CreateSetDialog`).
- `SetGrid` component with the current `sets` array.
- `CreateSetDialog` (controlled by `createOpen` state).
- `RenameSetDialog` (controlled by `renameTarget` state).
- `DeleteSetDialog` (controlled by `deleteTarget` state).

Callback functions passed to dialogs: `onCreate`, `onRename`, `onDelete` — each calls the appropriate API endpoint via fetch, updates local state, and triggers a sonner toast.

#### 4. SetGrid component

**File**: `src/components/sets/SetGrid.tsx` (new file)

**Intent**: Render a responsive grid of `SetCard` components. Handles the empty state (no sets yet).

**Contract**: Props: `{ sets: FlashcardSet[]; onRename: (set: FlashcardSet) => void; onDelete: (set: FlashcardSet) => void; onOpen: (setId: string) => void }`. Renders a CSS grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`). Empty state: centered message "No sets yet. Create your first set to get started." with a muted style.

#### 5. SetCard component

**File**: `src/components/sets/SetCard.tsx` (new file)

**Intent**: Display a single set as a card in the grid. Shows set name, flashcard count, last-opened date. Has a dropdown menu with Rename and Delete actions. Clicking the card body navigates to `/sets/[id]`.

**Contract**: Props: `{ set: FlashcardSet; flashcardCount: number; onRename: () => void; onDelete: () => void }`. Uses shadcn `Card` sub-components. The card body is wrapped in an `<a href={/sets/${set.id}}>` for navigation. The dropdown menu (shadcn `DropdownMenu`) is positioned in the card header/footer, triggered by a `MoreHorizontal` icon button. Flashcard count is fetched separately or passed from the parent — for MVP, display a static "0 cards" until S-03 populates them (or fetch count via a lightweight query).

**Note on flashcard count**: The `FlashcardSet` type has no `flashcard_count` field. For MVP, the dashboard can show the count as "—" or fetch it via a separate lightweight query. Decision: show "—" for now; S-03 (flashcard-crud) can add a count query or a denormalized counter column.

#### 6. CreateSetDialog component

**File**: `src/components/sets/CreateSetDialog.tsx` (new file)

**Intent**: Modal dialog for creating a new set. Contains a single text input for the set name, client-side Zod validation, and a submit button. On success, calls the `onCreate` callback and closes.

**Contract**: Props: `{ open: boolean; onOpenChange: (open: boolean) => void; onCreate: (set: FlashcardSet) => void }`. Uses shadcn `Dialog` components. Internal state: `name` string, `error` string | null, `pending` boolean. On submit: validates with `setNameSchema.safeParse()`, calls `fetch("/api/sets", { method: "POST", body: JSON.stringify({ name }) })`, handles response. On 201: calls `onCreate(data)`, closes dialog, shows success toast. On 4xx/5xx: displays inline error.

#### 7. RenameSetDialog component

**File**: `src/components/sets/RenameSetDialog.tsx` (new file)

**Intent**: Modal dialog for renaming a set. Pre-fills the input with the current name. Same validation and fetch pattern as CreateSetDialog.

**Contract**: Props: `{ set: FlashcardSet | null; open: boolean; onOpenChange: (open: boolean) => void; onRename: (set: FlashcardSet) => void }`. When `set` is null, dialog is hidden. Uses shadcn `Dialog`. Internal state: `name` (initialized from `set.name`), `error`, `pending`. On submit: `fetch("/api/sets/" + set.id, { method: "PATCH", body: JSON.stringify({ name }) })`. On 200: calls `onRename(data)`, closes, shows success toast.

#### 8. DeleteSetDialog component

**File**: `src/components/sets/DeleteSetDialog.tsx` (new file)

**Intent**: Confirmation dialog for deleting a set. Shows the set name and warns that all flashcards in the set will be permanently deleted.

**Contract**: Props: `{ set: FlashcardSet | null; open: boolean; onOpenChange: (open: boolean) => void; onDelete: (setId: string) => void }`. Uses shadcn `Dialog`. Shows `DialogTitle` "Delete set?", `DialogDescription` with the set name and warning text. Two buttons: Cancel (`DialogClose`) and Delete (destructive variant, calls `fetch("/api/sets/" + set.id, { method: "DELETE" })`). On 200: calls `onDelete(set.id)`, closes, shows success toast. On error: shows error toast.

### Success Criteria

#### Automated Verification

- Build passes: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification

- Dashboard at `/dashboard` shows a grid of set cards (or empty state for new user)
- "New Set" button opens a dialog; entering a name and submitting creates the set, shows a success toast, and the card appears in the grid
- Submitting an empty name shows a validation error inline in the dialog
- Each set card has a dropdown menu with Rename and Delete options
- Rename opens a dialog pre-filled with the current name; submitting updates the card and shows a toast
- Delete opens a confirmation dialog; confirming removes the card and shows a toast
- Clicking a set card navigates to `/sets/[id]`
- Toast notifications appear for all mutations (create/rename/delete success and errors)
- Dashboard is responsive: single column on mobile, 2 columns on tablet, 3 columns on desktop

---

## Phase 5: Set Detail Page

### Overview

Create `src/pages/sets/[id].astro` — a page that fetches a single set with its flashcards server-side and renders them in a read-only list. This is the first dynamic route in the codebase.

### Changes Required

#### 1. Set detail page

**File**: `src/pages/sets/[id].astro` (new file)

**Intent**: Server-render a set detail page showing the set name and a list of its flashcards (front/back pairs). Read-only — no edit/delete controls (those belong to S-03). Includes a back link to the dashboard.

**Contract**: The frontmatter block:
1. Reads `Astro.params.id` for the set UUID.
2. Reads `Astro.locals.user` (guaranteed non-null by middleware).
3. Creates a Supabase client.
4. Calls `getSetWithFlashcards(client, id)` from the service layer.
5. If the set is not found or belongs to another user (RLS blocks), returns a 404 page.
6. Passes `set` and `flashcards` to the template.

The template renders `<Layout title={set.name}>` with:
- Back link to `/dashboard` (styled as a text link with arrow icon).
- Set name as a heading.
- Flashcard count summary.
- A list of flashcards, each showing `front` and `back` text in a card-like layout (using the glassmorphism card pattern). Empty state if the set has no flashcards.

#### 2. FlashcardList component (optional React island)

**File**: `src/components/sets/FlashcardList.tsx` (new file)

**Intent**: Render the list of flashcards. Could be a pure Astro component, but a React island allows future interactivity (S-03 will add edit/delete). For S-02, it's a simple read-only list.

**Contract**: Props: `{ flashcards: Flashcard[] }`. Renders each flashcard as a card with `front` text on top and `back` text below, separated by a divider. Uses the glassmorphism card pattern (`rounded-xl border border-white/10 bg-white/5 p-4`).

**Decision**: For MVP, this can be a pure Astro template (no React) since there's zero interactivity. The `FlashcardList.tsx` React component is optional — create it only if the list benefits from client-side behavior. Default: render flashcards inline in the Astro template.

### Success Criteria

#### Automated Verification

- Build passes: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification

- Navigating to `/sets/[valid-id]` shows the set name and its flashcards
- Navigating to `/sets/[non-existent-id]` shows a 404 page or "Set not found" message
- Navigating to `/sets/[another-users-set-id]` shows a 404/page not found (RLS blocks cross-user access)
- Back link returns to `/dashboard`
- Set with zero flashcards shows an appropriate empty state
- Page is responsive on mobile

---

## Testing Strategy

### Automated

- `npm run build` — catches TypeScript errors across all phases
- `npm run lint` — catches import errors, unused variables, style issues

### Manual Testing Steps

1. Sign up a test user at `/auth/signup`
2. Navigate to `/dashboard` — confirm empty state
3. Create a set via the "New Set" dialog — confirm card appears + success toast
4. Create a second set — confirm grid layout
5. Rename a set via dropdown → Rename — confirm name updates + toast
6. Delete a set via dropdown → Delete — confirm confirmation dialog, then removal + toast
7. Click a set card → confirm navigation to `/sets/[id]` with set name and flashcards displayed
8. Test validation: try creating a set with empty name → confirm inline error
9. Test auth: sign out, try visiting `/dashboard`, `/sets`, `/api/sets` → confirm redirect to sign-in
10. Test cross-user isolation: create a set as user A, sign in as user B, try `GET /api/sets/[user-A-set-id]` → confirm 404/not found

## Performance Considerations

- Dashboard server-renders the initial set list — no client-side loading spinner needed for the first render
- Set list is fetched once at page load; mutations update client state optimistically (no refetch)
- Flashcard count is not fetched per-card in MVP (displays "—") — avoids N+1 query problem
- No pagination needed for MVP scale (< 50 sets per user)

## Migration Notes

No data migration needed. The `sets` and `flashcards` tables already exist from F-01. This change only adds read/write operations on existing schema.

## References

- Roadmap S-02: `context/foundation/roadmap.md:92-102`
- PRD FR-007: `context/foundation/prd.md:126-128`
- DB schema: `supabase/migrations/20260610000000_initial_schema.sql:5-13` (sets table), `15-32` (flashcards table)
- RLS policies: `supabase/migrations/20260610000000_initial_schema.sql:82-105` (sets CRUD), `113-156` (flashcards CRUD)
- Entity types: `src/types.ts:9-17` (FlashcardSet), `19-36` (Flashcard)
- Auth middleware: `src/middleware.ts:1-25`
- Supabase client: `src/lib/supabase.ts:1-24`
- Prior plan structure: `context/archive/2026-06-10-data-schema/plan.md`
- Lessons: `context/foundation/lessons.md:5-10` (RLS anon policy rule), `19-23` (Polish communication)
- shadcn config: `components.json`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Dependencies & shadcn/ui Components

#### Automated

- [x] 1.1 Dependencies install without conflicts: `npm install` exits 0 — adbf0ed
- [x] 1.2 Build passes: `npm run build` — adbf0ed
- [x] 1.3 Lint passes: `npm run lint` — adbf0ed

#### Manual

- [x] 1.4 Four shadcn component files exist in `src/components/ui/` — adbf0ed
- [x] 1.5 `zod` and `sonner` appear in `package.json` `dependencies` — adbf0ed

### Phase 2: Middleware & Protected Routes

#### Automated

- [x] 2.1 Build passes: `npm run build` — 33a0bb4
- [x] 2.2 Lint passes: `npm run lint` — 33a0bb4

#### Manual

- [x] 2.3 Unauthenticated access to `/sets`, `/api/sets` redirects to sign-in — 33a0bb4
- [x] 2.4 Authenticated access to `/dashboard`, `/sets` passes through — 33a0bb4
- [x] 2.5 `/settings` (hypothetical) is NOT caught by `/sets` protection — 33a0bb4

### Phase 3: Service Layer & API Routes

#### Automated

- [x] 3.1 Build passes: `npm run build`
- [x] 3.2 Lint passes: `npm run lint`

#### Manual

- [ ] 3.3 `GET /api/sets` returns JSON array (empty for new user)
- [ ] 3.4 `POST /api/sets` creates a set, returns 201
- [ ] 3.5 `POST /api/sets` with empty name returns 400 validation error
- [ ] 3.6 `PATCH /api/sets/[id]` renames a set, returns 200
- [ ] 3.7 `DELETE /api/sets/[id]` deletes a set, returns 200
- [ ] 3.8 `GET /api/sets/[id]/flashcards` returns set + flashcards
- [ ] 3.9 All endpoints return 401 without valid session

### Phase 4: Dashboard Page & React Components

#### Automated

- [ ] 4.1 Build passes: `npm run build`
- [ ] 4.2 Lint passes: `npm run lint`

#### Manual

- [ ] 4.3 Dashboard shows grid of set cards (or empty state)
- [ ] 4.4 "New Set" dialog creates a set with success toast
- [ ] 4.5 Empty name shows validation error inline
- [ ] 4.6 Dropdown menu has Rename and Delete actions
- [ ] 4.7 Rename dialog updates card + shows toast
- [ ] 4.8 Delete confirmation dialog removes card + shows toast
- [ ] 4.9 Clicking a card navigates to `/sets/[id]`
- [ ] 4.10 Dashboard is responsive (1/2/3 columns)

### Phase 5: Set Detail Page

#### Automated

- [ ] 5.1 Build passes: `npm run build`
- [ ] 5.2 Lint passes: `npm run lint`

#### Manual

- [ ] 5.3 `/sets/[valid-id]` shows set name + flashcards
- [ ] 5.4 `/sets/[non-existent-id]` shows 404 / not found
- [ ] 5.5 Cross-user set access returns 404 / not found
- [ ] 5.6 Back link returns to dashboard
- [ ] 5.7 Empty set shows appropriate empty state
