# User Settings Page — Implementation Plan

## Overview

Add a user settings page (`/settings`) accessible via a profile icon + dropdown menu in the NavBar. The page includes: read-only email display, change password form, language switcher placeholder (en/pl toggle, non-functional), AI prompt editor (toggle between default read-only view and custom editable prompt with preview, plus a configurable flashcard count field), and account deletion with textual confirmation ("Type DELETE"). Requires a new `user_ai_prompts` database table (storing prompt text and flashcard count), three new API endpoints, and a NavBar refactor from static email text to a React dropdown.

## Current State Analysis

- **NavBar** (`src/components/NavBar.astro`): Astro component showing `user.email` as static `<span>` text + a "Sign out" `<form>`. No hover/click on the email.
- **No settings page or route** exists under `src/pages/`.
- **No `user_settings` or `user_ai_prompts` table** exists in Supabase. The only user data is `auth.users` (id, email, etc.).
- **AI prompt**: `DEFAULT_SYSTEM_PROMPT` is hardcoded in `src/lib/services/ai-prompt.ts`. The generation endpoint accepts `systemPromptOverride` but only from server-side env var `OPENROUTER_SYSTEM_PROMPT` — there is no per-user prompt mechanism.
- **Auth API**: `supabase.auth.updateUser` is unused; no change-password or delete-account endpoints exist.
- **No admin Supabase client** exists — the codebase only uses the anon-key SSR client. Account deletion requires `supabase.auth.admin.deleteUser()` which needs the service_role key.
- **Protected routes** (`src/middleware.ts:4`): `PROTECTED_PAGE_ROUTES` is `["/dashboard", "/sets", "/generate"]` — `/settings` must be added.
- **UI components available**: shadcn/ui `DropdownMenu`, `Dialog`, `Button`, `Input`, `Textarea`, `Card`. Lucide icons from `lucide-react`. Toast via `sonner`.

### Key Discoveries:

- `src/lib/services/ai-prompt.ts:3-15` — `DEFAULT_SYSTEM_PROMPT` is exported as a module-private `const`; it must be exported so the settings page can display it.
- `src/pages/api/sets/[id]/generate.ts:86-88` — the generate endpoint reads `OPENROUTER_SYSTEM_PROMPT` env var as a global override. The per-user prompt must be injected here, fetched from `user_ai_prompts` before calling `renderFlashcardPrompt`.
- `src/lib/supabase.ts:5-24` — `createClient` uses the anon key. A separate admin client factory is needed for account deletion.
- `src/components/ui/dropdown-menu.tsx` — full DropdownMenu component suite already available from shadcn/ui, with `variant="destructive"` support on items.
- `src/components/sets/DeleteSetDialog.tsx` — existing delete confirmation dialog pattern to follow for account deletion modal.

## Desired End State

A logged-in user clicks a profile icon in the NavBar, sees a dropdown with their email, a "Settings" link, and a "Sign out" button. Clicking "Settings" navigates to `/settings` which shows:

1. **Account section**: Read-only email display + "Change password" button that opens a dialog.
2. **Language section**: A non-functional en/pl toggle (placeholder for future i18n).
3. **AI Prompt section**: A toggle between "Default prompt" (read-only, showing the app's built-in prompt) and "Custom prompt" (editable textarea with save). When custom is active, a preview shows how the prompt renders with sample text. A "Flashcards per generation" number input (1–20, default 5) allows the user to override the hardcoded count. Both the prompt and count are persisted per-user and used in flashcard generation.
4. **Danger zone**: "Delete account" button that opens a modal requiring the user to type "DELETE" to confirm.

The generation endpoint uses the user's custom prompt (if set) and count (if set), falling back to defaults. After account deletion, all user data (sets, flashcards, reviews, session_log, set_shares, user_ai_prompts) is cascade-deleted.

## What We're NOT Doing

- **i18n implementation** — the language toggle is UI-only; no actual locale switching or translation infrastructure.
- **Email change functionality** — display only; changing email requires email verification flow that's out of scope.
- **Per-set prompts** — the AI prompt is global per user, not per flashcard set.
- **Profile avatar or profile picture** — just a generic user icon.
- **Password reset via email link** — only change password (knowing current password) is in scope.
- **Admin settings or role-based settings** — single settings page for all authenticated users.

## Implementation Approach

Build in three phases: (1) database + service + API foundation, (2) settings page with all sections, (3) NavBar dropdown and integration. This sequencing ensures the backend is ready before the UI, and the NavBar change (most visible) comes last after everything is tested.

Phase 1 creates the `user_ai_prompts` table with RLS, a service module for CRUD operations, the admin Supabase client, and all API endpoints (prompt CRUD, change password, delete account). Phase 2 builds the settings page React island with all four sections. Phase 3 refactors NavBar from Astro-only to a React dropdown island, and wires the AI prompt into the generation endpoint.

## Critical Implementation Details

- **NavBar hydration boundary**: The current `NavBar.astro` is a pure Astro component (no `client:*` directive). Converting the user menu to a React island requires splitting NavBar — the navigation links stay in Astro, but the user menu area becomes a React `<UserMenu client:load />` island. The `user` data must be passed as a JSON prop.
- **Account deletion requires service_role key**: `supabase.auth.admin.deleteUser()` needs the Supabase service_role key. This must be added to `astro.config.mjs` env schema and a new `createAdminClient()` function created. The admin key must NEVER be exposed client-side.
- **AI prompt injection point**: The generate endpoint (`src/pages/api/sets/[id]/generate.ts:86-88`) must query `user_ai_prompts` before calling `renderFlashcardPrompt`. The user's custom prompt takes priority over both the default and the `OPENROUTER_SYSTEM_PROMPT` env var (user prompt > env var > default).

## Phase 1: Database, Services, and API Endpoints

### Overview

Create the database table, admin client, service functions, and all API endpoints. No UI changes yet — all backend work that the settings page will consume.

### Changes Required:

#### 1. Database migration: `user_ai_prompts` table

**File**: `supabase/migrations/20260616000001_user_ai_prompts.sql`

**Intent**: Create the `user_ai_prompts` table to store each user's custom AI prompt, with RLS policies ensuring users can only read/write their own prompt.

**Contract**: Table `user_ai_prompts` with columns: `id` (uuid PK, default `gen_random_uuid()`), `user_id` (uuid FK → `auth.users.id` ON DELETE CASCADE, NOT NULL, UNIQUE), `prompt` (text NOT NULL), `flashcard_count` (integer, nullable, CHECK constraint `flashcard_count >= 1 AND flashcard_count <= 20`), `created_at` (timestamptz default `now()`), `updated_at` (timestamptz default `now()`). RLS enabled. Policies: authenticated users can SELECT/INSERT/UPDATE/DELETE their own row (`auth.uid() = user_id`). Unique constraint on `user_id` ensures one settings row per user. `flashcard_count` is nullable — null means "use app default (5)".

#### 2. Admin Supabase client

**File**: `src/lib/supabase-admin.ts`

**Intent**: Create a server-side admin Supabase client using the service_role key for privileged operations (account deletion).

**Contract**: Export `createAdminClient()` that returns `SupabaseClient | null`. Uses `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from `astro:env/server`. Returns `null` if either env var is missing. No cookie handling — this is a service_role client, not a user session client.

#### 3. Env schema update

**File**: `astro.config.mjs`

**Intent**: Add `SUPABASE_SERVICE_ROLE_KEY` to the env schema so it's available as a server secret.

**Contract**: Add `SUPABASE_SERVICE_ROLE_KEY: envField.string({ context: "server", access: "secret", optional: true })` to the `env.schema` object, after `SUPABASE_KEY`.

#### 4. AI prompt service

**File**: `src/lib/services/user-settings.ts`

**Intent**: Create service functions for the user_ai_prompts CRUD and user account operations (change password, delete account).

**Contract**:
- `getUserPrompt(supabase: SupabaseClient, userId: string)` → `{ data: { prompt: string; flashcard_count: number | null } | null, error: PostgrestError | null }` — returns the user's custom prompt and count, or null if none exists.
- `upsertUserPrompt(supabase: SupabaseClient, userId: string, prompt: string, flashcardCount: number | null)` → `{ data: { prompt: string; flashcard_count: number | null } | null, error: PostgrestError | null }` — inserts or updates the user's prompt and count.
- `deleteUserPrompt(supabase: SupabaseClient, userId: string)` → `{ error: PostgrestError | null }` — deletes the user's prompt row.
- `changePassword(supabase: SupabaseClient, newPassword: string)` → `{ error: AuthError | null }` — calls `supabase.auth.updateUser({ password: newPassword })`. No re-authentication — the user is already authenticated via middleware.
- `deleteUserAccount(adminClient: SupabaseClient, userId: string)` → `{ error: Error | null }` — calls `adminClient.auth.admin.deleteUser(userId)` and returns error if any.

#### 5. Export DEFAULT_SYSTEM_PROMPT

**File**: `src/lib/services/ai-prompt.ts`

**Intent**: Export `DEFAULT_SYSTEM_PROMPT` so the settings page and API can display the default prompt to the user.

**Contract**: Change `const DEFAULT_SYSTEM_PROMPT` to `export const DEFAULT_SYSTEM_PROMPT`. No other changes.

#### 6. API endpoint: Prompt CRUD

**File**: `src/pages/api/user-prompt.ts`

**Intent**: Create API endpoints for reading, creating/updating, and deleting the user's AI prompt.

**Contract**:
- `GET` — returns `{ prompt: string | null, flashcard_count: number | null }` (null values if user has no custom settings). Auth required.
- `PUT` — body `{ prompt: string, flashcard_count: number | null }` validated with zod (`prompt: z.string().min(1).max(2000)`, `flashcard_count: z.number().int().min(1).max(20).nullable().optional()`). Upserts the user's prompt and count. Returns `{ prompt: string, flashcard_count: number | null }`.
- `DELETE` — deletes the user's prompt row. Returns `{ success: true }` or 404.
- All methods require `user?.id && supabase`, return 401 otherwise.

#### 7. API endpoint: Change password

**File**: `src/pages/api/auth/change-password.ts`

**Intent**: API endpoint for authenticated users to change their password.

**Contract**:
- `POST` — body `{ newPassword: string }` validated with zod (`newPassword: z.string().min(6)`).
- Calls `changePassword(supabase, newPassword)` directly. No re-authentication — the user is already authenticated via middleware. Returns `{ success: true }` on success, or `{ error: string }` on failure.
- Email is sourced from `context.locals.user.email` (not from the request body) — only if needed for logging or error messages.

#### 8. API endpoint: Delete account

**File**: `src/pages/api/auth/delete-account.ts`

**Intent**: API endpoint for authenticated users to delete their account and all associated data.

**Contract**:
- `POST` — body `{ confirmation: string }` validated with zod (`confirmation: z.literal("DELETE")`). Only accepts the exact string "DELETE" — any other value returns 400 validation error.
- Creates an admin Supabase client via `createAdminClient()`. Returns 503 with `{ error: "Service unavailable" }` if admin client is null (missing service_role key).
- Calls `deleteUserAccount(adminClient, user.id)`. On success, signs the user out and returns `{ success: true }`. On failure, returns 500 with `{ error: string }`.
- The `ON DELETE CASCADE` on `user_ai_prompts.user_id` FK and existing FKs on `sets.user_id`, `reviews.user_id`, `session_log.user_id`, `set_shares.sharer_user_id`, `set_shares.recipient_user_id` handle cascade deletion.

#### 9. Middleware: protect /settings route

**File**: `src/middleware.ts`

**Intent**: Add `/settings` to `PROTECTED_PAGE_ROUTES` so unauthenticated users are redirected to sign-in.

**Contract**: Add `"/settings"` to the `PROTECTED_PAGE_ROUTES` array on line 4.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly: `npx supabase db push --local` (or `supabase migration up`)
- Type checking passes: `npm run build` (or `npm run typecheck` if available)
- Linting passes: `npm run lint`

#### Manual Verification:

- API endpoints return correct responses (tested via curl or browser dev tools)
- RLS policies prevent cross-user access to prompts
- Account deletion cascades correctly (all user data removed)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Settings Page UI

### Overview

Create the `/settings` page and React island component with all four sections: Account (email + change password), Language (placeholder toggle), AI Prompt (default/custom toggle with preview), and Danger Zone (delete account).

### Changes Required:

#### 1. Settings page route

**File**: `src/pages/settings.astro`

**Intent**: Server-rendered settings page that fetches the user's current prompt and passes it to the React island.

**Contract**: Follows `dashboard.astro` pattern — destructures `user` and `supabase` from `Astro.locals`, fetches `getUserPrompt(supabase, user.id)`, passes `user.email`, `initialPrompt` and `initialFlashcardCount` as JSON stringified props to `<SettingsPage client:load />`. Uses `<Layout title="Settings">` wrapper. Protected by middleware (`/settings` added in Phase 1).

#### 2. Export DEFAULT_SYSTEM_PROMPT constant for frontend

**File**: `src/lib/services/ai-prompt.ts`

**Intent**: Already exported in Phase 1 step 5. The settings page will import `DEFAULT_SYSTEM_PROMPT` to show the default prompt in read-only mode.

**Contract**: No additional change needed — the export from Phase 1 step 5 is sufficient.

#### 3. Settings page React component

**File**: `src/components/settings/SettingsPage.tsx`

**Intent**: Main settings page React island with four sections.

**Contract**: Component receives props: `{ email: string; initialPrompt: string | null; initialFlashcardCount: number | null }`. Contains four sections:

1. **Account section** — Displays email (read-only, styled text). "Change password" button that opens `<ChangePasswordDialog />`.
2. **Language section** — A non-functional en/pl toggle (e.g., two buttons or a toggle switch showing "EN" and "PL", with EN selected and visually active). Displays a subtle "Coming soon" hint. No API call.
3. **AI Prompt section** — Two modes controlled by a toggle/switch:
   - **Default mode** (default): Shows `DEFAULT_SYSTEM_PROMPT` in a read-only textarea. The textarea is disabled/grayed out. A "Flashcards per generation" number input shows `5` (app default) and is disabled.
   - **Custom mode**: Shows an editable textarea pre-filled with the user's custom prompt (or empty if creating). A "Flashcards per generation" number input (1–20) shows the user's saved count or defaults to 5. A "Save" button persists via `PUT /api/user-prompt`. A "Preview" button/toggle shows how the prompt renders with sample input text (using `renderFlashcardPrompt` logic — replaces `$COUNT` with the user's count, shows how the user message wraps sample text).
   - Switching from Custom to Default prompts the user to confirm (if they have unsaved changes) and deletes the custom prompt via `DELETE /api/user-prompt`.
4. **Danger Zone section** — Red-accented section at the bottom. "Delete account" button that opens `<DeleteAccountDialog />`.

Uses `toast` from `sonner` for success/error feedback. Styled consistently with the cosmic theme (`bg-cosmic`, `border-white/10 bg-white/10 backdrop-blur-xl`, `text-white`, gradient headings).

#### 4. Change password dialog

**File**: `src/components/settings/ChangePasswordDialog.tsx`

**Intent**: Dialog for changing the user's password. Follows the pattern of `DeleteSetDialog.tsx`.

**Contract**: Uses shadcn/ui `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`, `DialogClose`. Form fields: new password, confirm new password (no current password field — re-authentication is not required since the user is already authenticated). Client-side validation: all fields required, new password min 6 chars, confirm matches new. Submits via `fetch POST /api/auth/change-password`. Shows toast on success/error. On success, closes dialog and shows success toast.

#### 5. Delete account dialog

**File**: `src/components/settings/DeleteAccountDialog.tsx`

**Intent**: Modal requiring the user to type "DELETE" to confirm account deletion. Follows pattern of `DeleteSetDialog.tsx` but with text input confirmation.

**Contract**: Uses shadcn/ui `Dialog` components. Contains an `Input` field where the user must type exactly "DELETE" to enable the destructive button. The "Delete account" button is disabled until the input matches "DELETE". On submit, calls `POST /api/auth/delete-account` with `{ confirmation: "DELETE" }`. On success, redirects to `/` (user is signed out and data deleted). On error, shows toast.

#### 6. AI prompt preview component

**File**: `src/components/settings/PromptPreview.tsx`

**Intent**: Shows a read-only preview of how the prompt renders with sample input text.

**Contract**: Receives `prompt: string` and optionally `count?: number` (default 5). Renders the prompt with `$COUNT` replaced by the count value, and shows how a sample source text would be wrapped in `<source_text>` tags. Displays in a styled pre/code block with monospace font. Uses the same `renderFlashcardPrompt` logic but renders the output client-side (the function is pure string manipulation, no server dependency).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- Settings page renders correctly at `/settings` for authenticated users
- Change password dialog opens, validates, and submits correctly
- AI prompt section toggles between default and custom modes
- Custom prompt saves and loads correctly after page refresh
- Prompt preview shows the rendered prompt with sample text
- Delete account dialog requires exact "DELETE" text to enable the button
- Language toggle shows "Coming soon" and is non-functional
- Unauthenticated users are redirected to sign-in from `/settings`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: NavBar Dropdown and Generation Integration

### Overview

Refactor the NavBar to show a profile icon with a dropdown menu instead of the static email text. Wire the AI prompt into the generation endpoint so user custom prompts override the default.

### Changes Required:

#### 1. NavBar dropdown React component

**File**: `src/components/layout/UserMenu.tsx`

**Intent**: Replace the static email span and sign-out form in NavBar with a profile icon button that opens a DropdownMenu with email display, Settings link, and Sign out action.

**Contract**: React component receiving `{ email: string }` prop. Renders a `DropdownMenu` with:
- `DropdownMenuTrigger`: A circular button with `UserIcon` (from `lucide-react`), styled with hover state (`hover:bg-white/10`, `transition-colors`).
- `DropdownMenuContent` (aligned `end`):
  - `DropdownMenuLabel`: Email address displayed as a muted label
  - `DropdownMenuSeparator`
  - `DropdownMenuItem` with `SettingsIcon` + "Settings" linking to `/settings`
  - `DropdownMenuSeparator`
  - `DropdownMenuItem` with `LogOutIcon` + "Sign out" — clicking triggers a `fetch POST /api/auth/signout`, then redirects to `/` via `window.location.href`. Uses programmatic fetch instead of a nested `<form>` to avoid Radix DropdownMenuItem pointer-events conflicts.
  
Uses shadcn/ui `DropdownMenu` components. Styled with cosmic theme colors.

#### 2. NavBar refactor

**File**: `src/components/NavBar.astro`

**Intent**: Replace the static email span and sign-out form with the `<UserMenu />` React island.

**Contract**: Remove lines 20-39 (the `<div class="flex items-center gap-4">` containing the email span and sign-out form). Replace with `<UserMenu email={user.email ?? ""} client:load />`. Import `UserMenu` from `@/components/layout/UserMenu`. The navigation links (Dashboard, 10xCards logo) remain as Astro server-rendered HTML. The `user` check (`user &&`) wrapper remains.

#### 3. Wire user prompt into generation endpoint

**File**: `src/pages/api/sets/[id]/generate.ts`

**Intent**: Modify the generation endpoint to fetch the user's custom prompt from `user_ai_prompts` and pass it as `systemPromptOverride` to `renderFlashcardPrompt`, taking priority over the env var override.

**Contract**: After the auth guard and set ownership check, query `getUserPrompt(supabase, user.id)`. If the user has a custom prompt, use it as `systemPromptOverride`. If the user has a `flashcard_count`, use it as the generation count (overriding the request body default). Otherwise, fall back to `OPENROUTER_SYSTEM_PROMPT` env var (current behavior). Priority for prompt: user custom prompt > env var `OPENROUTER_SYSTEM_PROMPT` > `DEFAULT_SYSTEM_PROMPT`. Priority for count: user `flashcard_count` > request body `count` > hardcoded 5. Import `getUserPrompt` from `@/lib/services/user-settings`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- Profile icon appears in NavBar for authenticated users
- Dropdown opens on click with email, Settings link, and Sign out
- Clicking "Settings" navigates to `/settings`
- Clicking "Sign out" signs the user out and redirects to home
- Dropdown has hover effect on the profile icon
- Generating flashcards with a custom prompt produces different results than the default
- Generating flashcards without a custom prompt still uses the default prompt
- NavBar looks correct on mobile (responsive)

---

## Testing Strategy

### Unit Tests:

- `user-settings.ts` service: prompt CRUD operations, change password, delete account
- `ai-prompt.ts`: verify `DEFAULT_SYSTEM_PROMPT` export works correctly
- API endpoint input validation (zod schemas for all three endpoints)

### Integration Tests:

- Full flow: create prompt → generate flashcards with custom prompt → verify different results
- Change password flow: verify current password check → update → sign in with new password
- Delete account flow: create account → add data → delete → verify all data removed

### Manual Testing Steps:

1. Navigate to `/settings` while authenticated — page renders with all sections
2. Verify email is displayed read-only and correct
3. Change password: enter current password → new password → confirm → submit → verify can sign in with new password
4. Language toggle: verify EN/PL toggle visible, non-functional, shows "Coming soon"
5. AI prompt default mode: verify default prompt is displayed read-only
6. Switch to custom mode: verify textarea becomes editable, type custom prompt, save, refresh — custom prompt persists
7. Prompt preview: verify the rendered prompt shows with `$COUNT` replaced and sample text
8. Switch back to default: verify custom prompt is deleted, default shown again
9. Generate flashcards with custom prompt: verify the AI uses the custom prompt
10. Delete account: type "DELETE" → confirm → verify user is signed out and all data removed
11. NavBar dropdown: verify profile icon, dropdown menu, hover state, navigation

## Performance Considerations

- The settings page fetches the user's prompt on server render — no additional client-side fetch on initial load.
- The NavBar dropdown is a small React island (`client:load`) — minimal hydration cost since it's just a trigger + dropdown.
- Prompt preview computation is pure string manipulation (no API call) — instant client-side rendering.

## Migration Notes

- The `user_ai_prompts` migration includes `ON DELETE CASCADE` on `user_id` FK — when a user is deleted via `admin.deleteUser()`, the `auth.users` row is removed, and PostgreSQL cascades to delete the `user_ai_prompts` row. The existing FKs on `sets`, `flashcards`, `reviews`, `session_log`, and `set_shares` should also cascade (verify existing migrations have `ON DELETE CASCADE`; if not, a separate migration may be needed).
- The `SUPABASE_SERVICE_ROLE_KEY` env var must be added to `.dev.vars` (local) and Cloudflare secrets (production) for account deletion to work. The endpoint returns 503 if the key is missing rather than failing silently.

## References

- Similar implementation: `src/components/sets/DeleteSetDialog.tsx` (delete confirmation dialog pattern)
- Similar implementation: `src/components/sets/RenameSetDialog.tsx` (form dialog with zod validation)
- Similar implementation: `src/pages/api/auth/signin.ts` (auth API pattern)
- Default prompt: `src/lib/services/ai-prompt.ts:3-15`
- NavBar: `src/components/NavBar.astro`
- DropdownMenu: `src/components/ui/dropdown-menu.tsx`
- Dialog: `src/components/ui/dialog.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Database, Services, and API Endpoints

#### Automated

- [x] 1.1 Migration applies cleanly (`npx supabase db push --local`) — 04f4c9e
- [x] 1.2 Type checking passes (`npm run build`) — 04f4c9e
- [x] 1.3 Linting passes (`npm run lint`) — 04f4c9e

#### Manual

- [x] 1.4 API endpoints return correct responses (tested via curl/dev tools) — 04f4c9e
- [x] 1.5 RLS policies prevent cross-user prompt access — 04f4c9e
- [x] 1.6 Account deletion cascades correctly (all user data removed) — 04f4c9e

### Phase 2: Settings Page UI

#### Automated

- [x] 2.1 Type checking passes (`npm run build`) — 7bbca46
- [x] 2.2 Linting passes (`npm run lint`) — 7bbca46

#### Manual

- [x] 2.3 Settings page renders correctly at `/settings` for authenticated users — 7bbca46
- [x] 2.4 Change password dialog opens, validates, and submits correctly — 7bbca46
- [x] 2.5 AI prompt section toggles between default and custom modes — 7bbca46
- [x] 2.6 Custom prompt saves and loads correctly after page refresh — 7bbca46
- [x] 2.7 Prompt preview shows rendered prompt with sample text — 7bbca46
- [x] 2.8 Delete account dialog requires "DELETE" text to enable button — 7bbca46
- [x] 2.9 Language toggle shows "Coming soon" and is non-functional — 7bbca46
- [x] 2.10 Unauthenticated users redirected to sign-in from `/settings` — 7bbca46

### Phase 3: NavBar Dropdown and Generation Integration

#### Automated

- [x] 3.1 Type checking passes (`npm run build`)
- [x] 3.2 Linting passes (`npm run lint`)

#### Manual

- [x] 3.3 Profile icon appears in NavBar for authenticated users
- [x] 3.4 Dropdown opens with email, Settings link, and Sign out
- [x] 3.5 Clicking "Settings" navigates to `/settings`
- [x] 3.6 Clicking "Sign out" signs out and redirects to home
- [x] 3.7 Dropdown hover effect works on profile icon
- [x] 3.8 Generating flashcards with custom prompt produces different results
- [x] 3.9 Generating flashcards without custom prompt uses default
- [x] 3.10 NavBar looks correct on mobile (responsive)