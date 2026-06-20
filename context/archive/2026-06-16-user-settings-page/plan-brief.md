# User Settings Page — Plan Brief

> Full plan: `context/changes/user-settings-page/plan.md`

## What & Why

Add a user settings page (`/settings`) so authenticated users can view their email, change their password, manage a custom AI prompt for flashcard generation (including a configurable flashcard count), and delete their account. The entry point is a profile icon in the NavBar that opens a dropdown menu — replacing the current static email display with an interactive navigation pattern.

## Starting Point

The NavBar (`src/components/NavBar.astro`) shows the user's email as static text with a "Sign out" form. There is no settings page, no per-user AI prompt storage, no change-password or delete-account endpoints. AI generation uses a hardcoded default prompt with an optional global env var override — no per-user customization. Flashcard count is hardcoded to 5 in the frontend (`GenerateFlashcardsPage.tsx:75`).

## Desired End State

A logged-in user clicks a profile icon in the NavBar, sees a dropdown (email, Settings, Sign out), navigates to `/settings` which shows: read-only email, change password dialog, language toggle placeholder (en/pl, non-functional), AI prompt editor (toggle between read-only default and editable custom prompt with preview, plus a "Flashcards per generation" count field 1–20), and account deletion with "Type DELETE" confirmation. Custom prompts and count override the defaults during flashcard generation.

## Key Decisions Made

| Decision | Choice | Why | Source |
|---|---|---|---|
| Prompt storage | Separate `user_ai_prompts` table (prompt text + flashcard_count) | Clean separation of concerns, easy to add fields later | Plan |
| Prompt scope | Global per user (1 prompt) | Simpler than per-set; user requested global | Plan |
| NavBar pattern | Profile icon + DropdownMenu (React island) | Scalable for future actions, shadcn/ui component available | Plan |
| Account deletion | In scope, with "Type DELETE" modal confirmation | User requested; requires service_role key for admin API | Plan |
| Language toggle | UI placeholder only, non-functional | i18n is a future change; just the toggle UI now | Plan |
| UI language | English labels | Polish i18n deferred to a later change | Plan |
| Custom prompt UX | Toggle between default (read-only) and custom (editable with preview + count field) | User requested "use custom prompt" opt-in with preview and count control | Plan |
| Flashcard count | Per-user setting in `user_ai_prompts.flashcard_count` (1–20, nullable = use app default 5) | User wants to control `$COUNT`; nullable keeps backward compat | Plan |
| Prompt priority | User custom > env var > default; count: user setting > request body > 5 | Per-user overrides global, global overrides built-in | Plan |
| Admin client | New `createAdminClient()` with `SUPABASE_SERVICE_ROLE_KEY` | Needed for `auth.admin.deleteUser()`; separate from anon client | Plan |

## Scope

**In scope:**
- `user_ai_prompts` table with RLS (prompt text + flashcard_count)
- Admin Supabase client for account deletion
- API endpoints: prompt/count CRUD, change password, delete account
- Settings page with sections (email, password, language placeholder, AI prompt with count field, danger zone)
- NavBar refactor: profile icon + dropdown menu
- Wire custom prompt and count into flashcard generation endpoint
- Export `DEFAULT_SYSTEM_PROMPT` for frontend display

**Out of scope:**
- Actual i18n/locale switching (language toggle is UI-only)
- Email change functionality
- Per-set AI prompts
- Profile avatar/picture
- Password reset via email link
- Admin-specific settings

## Architecture / Approach

Three-phase build: (1) database + services + API, (2) settings page UI, (3) NavBar dropdown + generation integration. The NavBar is refactored last to minimize the visible change window. The custom prompt and count are stored in `user_ai_prompts` (one row per user, `user_id` unique constraint, `flashcard_count` nullable) and injected into the generation endpoint by querying the table before calling `renderFlashcardPrompt`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Database, Services & API | `user_ai_prompts` table, admin client, prompt CRUD + auth API endpoints | CASCADE delete on account deletion must cover all user-owned data |
| 2. Settings Page UI | `/settings` page with all four sections, dialogs, prompt toggle + preview | Custom prompt toggle UX — switching modes must handle unsaved changes |
| 3. NavBar & Generation | Profile icon dropdown, wire custom prompt into generation | NavBar Astro→React island split — must preserve server-rendered nav links |

**Prerequisites:** `SUPABASE_SERVICE_ROLE_KEY` must be added to `.dev.vars` and Cloudflare secrets for account deletion.
**Estimated effort:** ~2-3 sessions across 3 phases

## Open Risks & Assumptions

- **CASCADE deletion**: Assumes existing FKs on `sets`, `flashcards`, `reviews`, `session_log`, `set_shares` have `ON DELETE CASCADE`. If not, a supplementary migration is needed.
- **Service role key availability**: Account deletion returns 503 if `SUPABASE_SERVICE_ROLE_KEY` is not configured — the rest of the app works without it.
- **Supabase password change**: `changePassword` calls `supabase.auth.updateUser({ password })` directly without re-authentication. The user is already authenticated via middleware. If re-authentication is desired in the future, `supabase.auth.reauthenticate()` (Supabase Auth v2.64+) can be added.

## Success Criteria (Summary)

- User can navigate to `/settings` via profile dropdown and see their email, change password, manage AI prompt, and delete account
- Custom AI prompt and flashcard count persist across page refreshes and correctly override defaults during generation
- Account deletion removes all user data (sets, flashcards, reviews, prompts)
- NavBar shows a profile icon with dropdown instead of static email text