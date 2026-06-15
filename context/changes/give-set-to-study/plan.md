# Give Set to Study — Implementation Plan

## Overview

Redefines S-07 from a pure read-only public share link into a **set clone with teacher stats**: the teacher activates a share link for a set; any authenticated student who opens `/share/[token]` can clone the set into their own account and study it with their own spaced repetition history; the teacher sees a "Donated Sets" section on their dashboard showing per-clone tiles with student email and learning stats.

## Current State Analysis

- `sets.share_token uuid default null` and `sets_share_token_idx` unique index already exist — no share UI or API yet.
- Two anon RLS policies (`sets_select_shared_anon`, `flashcards_select_shared_anon`) grant broad anon SELECT on tables containing the share token — this violates `lessons.md` ("RLS anon policies must not expose capability tokens"). These must be dropped in Phase 1.
- Service pattern: `src/lib/services/*.ts` — typed functions, `SupabaseClient` as first param, `{ data, error }` returns, Zod for validation.
- Dashboard: `dashboard.astro` fetches sets + stats in parallel, passes JSON strings to `SetDashboard.tsx` React island.
- Set detail page: `src/pages/sets/[id]/index.astro` → `SetDetailPage.tsx` (manages flashcard CRUD + dialogs).
- Cross-ownership reads (teacher sees student's `session_log`, `flashcards`) require SECURITY DEFINER RPCs — RLS enforces `auth.uid() = user_id` everywhere.

## Desired End State

Teacher opens their set's detail page → clicks "Share" → gets a link (e.g. `https://app/share/<uuid>`). Student opens the link while logged in → sees set name and flashcard count → clicks "Clone to my sets" → set appears in their dashboard; if they already claimed it, they see "You already have this set" with a link to their copy. Teacher's dashboard shows a "Donated Sets" section listing each claim as a tile: original set name, student email, claim date, total flashcards, learned count, last activity date.

### Key Discoveries

- `src/pages/api/sets/[id].ts:1` — PATCH/DELETE pattern for set endpoints; share endpoint follows the same `[id]` namespace: `src/pages/api/sets/[id]/share.ts`.
- `src/lib/services/stats.ts:36` — `getLearningStats` queries session_log as the learning user; `get_donated_sets_for_teacher` RPC is the cross-user analogue.
- `supabase/migrations/20260614120000_submit_card_review_rpc.sql` — precedent for SECURITY DEFINER RPC with `auth.uid()` inside.
- `src/components/sets/SetDetailPage.tsx:8` — already imports `Button` from shadcn; Share button follows this pattern.
- `src/pages/sets/[id]/review.astro` — routing pattern confirms `[id]/` directory works; `src/pages/share/[token].astro` is a new top-level dynamic route.
- `src/types.ts:FlashcardSet` — already includes `share_token: string | null`; no type change needed for the set model.

## What We're NOT Doing

- Anonymous (unauthenticated) claiming — only logged-in users can clone.
- Deactivating share links (once activated, a set is shareable until deleted).
- Showing individual per-student review grade breakdowns — only total/learned count + last activity.
- Joining on `auth.users` in client queries — `recipient_email` is captured at claim time in `set_shares`.
- Teacher can revoke a specific claim (not in scope).

## Implementation Approach

Four phases in dependency order: (1) all DB objects land first so every phase after has a stable foundation; (2) share activation gives teachers a way to produce tokens that phase 3 consumes; (3) the share page and claim API enable the student-facing flow; (4) the dashboard extension makes the teacher's view complete.

Cross-ownership data access (teacher reads student's flashcards and session_log) goes exclusively through SECURITY DEFINER RPCs — never via direct table queries with broadened RLS.

## Critical Implementation Details

**SECURITY DEFINER caution:** `claim_shared_set` runs as the function owner (postgres) and bypasses RLS. It must guard against: (a) null `auth.uid()` (anonymous callers), (b) caller = original owner (prevent self-clone), (c) double-claim (idempotent check before insert). Return the existing `cloned_set_id` on double-claim rather than raising an error — the caller route uses this to redirect.

**Flashcard FSRS state reset on clone:** The copied flashcards get only `front` and `back` — all FSRS fields default (due = now, state = 0, reps = 0, etc.). Do not copy the teacher's review state.

**Anon policies to drop:** `sets_select_shared_anon` and `flashcards_select_shared_anon` (both created in `20260610000000_initial_schema.sql`) are replaced by the SECURITY DEFINER `get_shared_set_info` RPC. Drop them in the new migration.

---

## Phase 1: Database layer

### Overview

Creates the `set_shares` tracking table, drops the insecure anon policies, and installs three SECURITY DEFINER RPCs. Also updates the roadmap to reflect the redefined S-07.

### Changes Required

#### 1. New migration file

**File**: `supabase/migrations/20260614200000_give_set_to_study.sql`

**Intent**: Single migration that (a) drops insecure anon policies, (b) creates `set_shares`, (c) installs three SECURITY DEFINER functions, (d) grants minimal execute permissions.

**Contract**:

Table `public.set_shares`:
- `id uuid primary key default gen_random_uuid()`
- `original_set_id uuid not null references public.sets(id) on delete cascade`
- `cloned_set_id uuid not null references public.sets(id) on delete cascade`
- `sharer_user_id uuid not null references auth.users(id) on delete cascade`
- `recipient_user_id uuid not null references auth.users(id) on delete cascade`
- `recipient_email text not null`
- `claimed_at timestamptz not null default now()`
- `constraint set_shares_unique_claim unique (original_set_id, recipient_user_id)`

Indexes: `set_shares_sharer_idx(sharer_user_id)`, `set_shares_original_set_idx(original_set_id)`.

RLS: authenticated sharer can SELECT where `sharer_user_id = auth.uid()`; authenticated recipient can SELECT where `recipient_user_id = auth.uid()`. No client-side INSERT (insert is done by SECURITY DEFINER RPC).

GRANTs on `set_shares`: `GRANT SELECT ON public.set_shares TO authenticated` (RLS restricts rows). No INSERT grant to authenticated (RPC inserts directly as definer).

`get_shared_set_info(p_token uuid)` — SECURITY DEFINER, STABLE:
- Returns `(set_id uuid, set_name text, flashcard_count bigint)` for the set matching `share_token = p_token`. Returns 0 rows if token not found.
- GRANT to `authenticated, anon` (anon so server-rendered share page works for non-logged-in visitors).

`claim_shared_set(p_token uuid)` — SECURITY DEFINER, VOLATILE:
- Guards: raise if `auth.uid()` is null; raise if caller = original owner; return `(cloned_set_id, already_claimed=true)` if claim already exists.
- Happy path: INSERT new set (name = original name, user_id = caller), INSERT flashcards (front + back only, FSRS defaults), INSERT set_shares row (with `recipient_email` from `auth.users.email`).
- Returns `(cloned_set_id uuid, already_claimed boolean)`.
- GRANT to `authenticated` only.

`get_donated_sets_for_teacher()` — SECURITY DEFINER, STABLE:
- Returns one row per `set_shares` where `sharer_user_id = auth.uid()`.
- Columns: `share_id, cloned_set_id, original_set_name, cloned_set_name, recipient_email, claimed_at, total_flashcards bigint, learned_count bigint, last_activity timestamptz`.
- JOINs: `set_shares` → `sets orig` (original) → `sets clone` (cloned) → `flashcards` (count, state=2) → `session_log` (max ended_at grouped by clone set_id).
- GRANT to `authenticated` only.

#### 2. Roadmap update

**File**: `context/foundation/roadmap.md`

**Intent**: Redefine S-07 entry to reflect the actual feature. Update change-id, outcome, and status.

**Contract**: Change the S-07 row in the "At a glance" table: `change-id` → `give-set-to-study`, outcome → "wygenerować link do zestawu, który zalogowany użytkownik może sklonować do swojego konta i uczyć się z własną historią SR; przeglądać sklonowane zestawy w Donated Sets". Status stays `proposed` (work starts now). Update the S-07 slice section body similarly.

### Success Criteria

#### Automated Verification

- Migration applies cleanly: `npx supabase db reset --local` (requires explicit user approval per lessons.md — coordinate with user first)
- `npx supabase db diff` shows no drift
- `npm run build` passes (no TypeScript errors)

#### Manual Verification

- Connect to local Supabase → confirm `set_shares` table exists with correct columns and constraints
- Call `get_shared_set_info(gen_random_uuid())` via SQL editor → returns 0 rows (valid token not found)
- Call `claim_shared_set(gen_random_uuid())` as authenticated user → raises exception (token not found)
- Call `get_donated_sets_for_teacher()` as authenticated user → returns 0 rows (no shares yet)
- Roadmap file updated with new S-07 definition

**After completing this phase and automated verification passes, pause for manual confirmation before proceeding.**

---

## Phase 2: Share activation flow

### Overview

Teacher-side: API endpoint to generate the share_token, service function, and UI (Share button + modal on the set detail page).

### Changes Required

#### 1. Share API endpoint

**File**: `src/pages/api/sets/[id]/share.ts`

**Intent**: `POST` generates (or returns existing) share_token for the set; `GET` returns current share status. Both require authenticated owner.

**Contract**:
- `export const prerender = false`
- `GET` returns `{ share_token: string | null }` — reads set from DB via `getSetByIdForUser`, returns the token field.
- `POST` calls `activateShareToken(supabase, userId, setId)` — returns `{ share_token: string }`. Returns 404 if set not found, 401 if not authenticated.

#### 2. `activateShareToken` service function

**File**: `src/lib/services/sets.ts` (append)

**Intent**: If `share_token` is null, generates a new UUID and UPDATEs the set; returns the existing token if already set.

**Contract**: `activateShareToken(client: SupabaseClient | null, userId: string, setId: string): Promise<{ data: string | null; error: string | null }>` — returns the share_token string on success.

#### 3. New types

**File**: `src/types.ts` (append)

**Intent**: Types for the share info RPC result and donated set tiles — consumed by services and components.

**Contract**:
```typescript
export interface SharedSetInfo {
  set_id: string;
  set_name: string;
  flashcard_count: number;
}

export interface DonatedSetTile {
  share_id: string;
  cloned_set_id: string;
  original_set_name: string;
  cloned_set_name: string;
  recipient_email: string;
  claimed_at: string;
  total_flashcards: number;
  learned_count: number;
  last_activity: string | null;
}
```

#### 4. ShareSetModal component

**File**: `src/components/sets/ShareSetModal.tsx` (new)

**Intent**: Modal that shows the shareable URL, a "Copy link" button, and a note that any logged-in user who opens it can clone the set.

**Contract**: Props `{ setId: string; shareToken: string | null; onTokenGenerated: (token: string) => void }`. If `shareToken` is null, shows "Activate sharing" button that calls `POST /api/sets/[setId]/share` and calls `onTokenGenerated` on success. If `shareToken` is set, shows the full URL `{window.location.origin}/share/{shareToken}` with a copy-to-clipboard button. Uses `toast` from `sonner` for feedback.

#### 5. Share button in SetDetailPage

**File**: `src/components/sets/SetDetailPage.tsx` (modify)

**Intent**: Add a "Share" button in the set detail header that opens `ShareSetModal`. Thread `share_token` from set state into the modal.

**Contract**: Add `shareModalOpen` boolean state. Render `<ShareSetModal setId={set.id} shareToken={set.share_token} onTokenGenerated={...} />`. The `onTokenGenerated` callback updates `state.set.share_token` in local React state. Button placement: alongside existing action buttons in the set header area.

### Success Criteria

#### Automated Verification

- `npm run build` passes
- `npm run lint` passes

#### Manual Verification

- Open a set detail page → "Share" button is visible
- Click "Share" → modal opens
- Click "Activate sharing" (first time) → link appears, toast shows
- Copy link button copies URL to clipboard
- Reload set page → Share button opens modal with same link (token persisted in DB)

**After completing this phase and verification passes, pause for manual confirmation before proceeding.**

---

## Phase 3: Share page + claim flow

### Overview

Student-facing: the `/share/[token]` page shows set info and triggers cloning via `claim_shared_set` RPC.

### Changes Required

#### 1. Share page

**File**: `src/pages/share/[token].astro` (new)

**Intent**: Server-rendered page that looks up the set by token (via `get_shared_set_info` RPC), checks if the authenticated user already claimed (via `set_shares` SELECT), and renders appropriate state.

**Contract**:
- `export const prerender = false`
- Reads `token` from `Astro.params.token`
- Calls `supabase.rpc('get_shared_set_info', { p_token: token })` — returns set info or 0 rows.
- If 0 rows → render 404 ("Link is invalid or the set was deleted").
- If user is authenticated → check `set_shares` SELECT for `(original_set_id = setInfo.set_id, recipient_user_id = user.id)` to determine claim status.
- Passes `setInfo`, `claimStatus` (`'unclaimed' | 'already_claimed'`), `claimedSetId` (if claimed), and `user` (null if anon) as JSON props to `SharePageContent` React island.

#### 2. SharePageContent component

**File**: `src/components/share/SharePageContent.tsx` (new)

**Intent**: Renders set info (name, flashcard count) + action area: "Clone to my sets" button (if authenticated + unclaimed), "You already have this set → [Open]" (if claimed), or "Log in to claim" (if not authenticated).

**Contract**: Props `{ setInfo: SharedSetInfo; claimStatus: 'unclaimed' | 'already_claimed' | 'unauthenticated'; claimedSetId?: string }`. "Clone to my sets" calls `POST /api/share/claim` with `{ token }` (from URL path read via `window.location.pathname`). On success, redirects to `/sets/{cloned_set_id}`. On error, shows toast. Uses `client:load` directive in the Astro page.

#### 3. Claim API

**File**: `src/pages/api/share/claim.ts` (new)

**Intent**: Receives `{ token: string }`, calls `claim_shared_set` RPC, returns `{ cloned_set_id, already_claimed }`.

**Contract**:
- `export const prerender = false`
- `POST` only; requires authentication (401 if not).
- Body schema: `z.object({ token: z.string().uuid() })`.
- Calls `supabase.rpc('claim_shared_set', { p_token: token })`.
- Returns `200 { cloned_set_id: string; already_claimed: boolean }`.
- Returns `404` if RPC raises "Share token not found", `400` if RPC raises other errors.

### Success Criteria

#### Automated Verification

- `npm run build` passes
- `npm run lint` passes

#### Manual Verification

- Open `/share/some-invalid-uuid` → 404 message rendered
- Activate sharing for a set (Phase 2) → copy the link → open in incognito (unauthenticated) → see set name + "Log in to claim" button
- Log in → open share link → see "Clone to my sets" button
- Click "Clone to my sets" → redirected to the new cloned set in `/sets/[newId]` → set appears in My Sets on dashboard
- Open share link again (same user) → see "You already have this set" + link to existing clone
- Open share link as a different user → see "Clone to my sets" → claim works independently
- Check Supabase `set_shares` table → two rows for the same original set (one per claimant)
- Teacher cannot claim their own set → error toast shown

**After completing this phase and verification passes, pause for manual confirmation before proceeding.**

---

## Phase 4: Donated Sets dashboard

### Overview

Teacher-facing: fetches donated set tiles via RPC and renders them as a new section on the dashboard.

### Changes Required

#### 1. `getDonatedSets` service function

**File**: `src/lib/services/sets.ts` (append)

**Intent**: Calls the `get_donated_sets_for_teacher` SECURITY DEFINER RPC and returns typed tiles.

**Contract**: `getDonatedSets(client: SupabaseClient | null, userId: string): Promise<{ data: DonatedSetTile[] | null; error: string | null }>`. Note: the RPC uses `auth.uid()` internally, but `userId` is kept as a param for consistency with other service functions (not used in the RPC call body — the RPC relies on the session context).

#### 2. Dashboard page extension

**File**: `src/pages/dashboard.astro` (modify)

**Intent**: Add parallel fetch for donated sets alongside the existing sets and stats fetches.

**Contract**: Add `getDonatedSets(supabase, user.id)` to the `Promise.all` call. Pass result as `initialDonatedSets={JSON.stringify(donatedSets)}` to `SetDashboard` component.

#### 3. SetDashboard component extension

**File**: `src/components/sets/SetDashboard.tsx` (modify)

**Intent**: Accept `initialDonatedSets` prop and render `DonatedSetsSection` below the `StatsBlock` and above (or below) "My Sets".

**Contract**: Add `initialDonatedSets: string` to `Props`. Parse into `DonatedSetTile[]` state. Render `<DonatedSetsSection tiles={donatedSets} />` only when `donatedSets.length > 0` (section hidden for teachers with no donations yet).

#### 4. DonatedSetsSection component

**File**: `src/components/dashboard/DonatedSetsSection.tsx` (new)

**Intent**: Renders a titled section with one tile per `DonatedSetTile`. Each tile shows: original set name (as title), student email, claim date, total flashcards, learned count, last activity.

**Contract**: Props `{ tiles: DonatedSetTile[] }`. Tile layout follows the visual pattern of `StatsBlock`'s recent set tiles (rounded card, subtle border, white/muted text). No interactive actions (read-only). Date formatting: `claimed_at` and `last_activity` formatted as relative time or short date string.

### Success Criteria

#### Automated Verification

- `npm run build` passes
- `npm run lint` passes

#### Manual Verification

- Log in as teacher → claim a set as a different user (Phase 3 verified this works)
- Open dashboard as teacher → "Donated Sets" section is visible
- Section shows the correct tile: original set name, student email, claim date
- After the student completes a review session → last_activity date updates on teacher dashboard (may require page reload)
- Teacher with no donated sets → section is hidden entirely

**After completing this phase and verification passes, this change is complete.**

---

## Testing Strategy

### Manual Testing Steps

1. End-to-end as teacher: create set → activate sharing → copy link
2. End-to-end as student: open link → clone → study flashcards
3. Idempotency: student opens link again → sees "Already claimed" state
4. Cross-user: two different students claim the same link → both get independent copies
5. Teacher dashboard: confirm Donated Sets section shows both claims separately
6. Self-claim guard: teacher opens their own share link → receives error
7. Invalid token: `/share/00000000-0000-0000-0000-000000000000` → 404 state

### Performance Considerations

`get_donated_sets_for_teacher` does a 4-way JOIN (set_shares + 2×sets + flashcards + session_log). Index `set_shares_sharer_idx(sharer_user_id)` ensures the filter is fast. At MVP scale (< 100 claims per teacher) this is not a concern. If it becomes one, a materialized view is the next step.

## References

- Frame brief: `context/changes/give-set-to-study/frame.md`
- Initial schema: `supabase/migrations/20260610000000_initial_schema.sql`
- SECURITY DEFINER precedent: `supabase/migrations/20260614120000_submit_card_review_rpc.sql`
- Lessons (anon RLS policy): `context/foundation/lessons.md`
- Dashboard page: `src/pages/dashboard.astro`
- SetDashboard component: `src/components/sets/SetDashboard.tsx`
- SetDetailPage component: `src/components/sets/SetDetailPage.tsx`
- Stats service: `src/lib/services/stats.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Database layer

#### Automated

- [x] 1.1 Migration applies cleanly (npx supabase db reset — coordinate with user first) — 8906631
- [x] 1.2 No drift: npx supabase db diff — 8906631
- [x] 1.3 npm run build passes — 8906631

#### Manual

- [x] 1.4 set_shares table exists with correct schema and unique constraint — 8906631
- [x] 1.5 get_shared_set_info returns 0 rows for unknown token — 8906631
- [x] 1.6 claim_shared_set raises exception for unknown token — 8906631
- [x] 1.7 get_donated_sets_for_teacher returns 0 rows for fresh user — 8906631
- [x] 1.8 Roadmap S-07 updated — 8906631

### Phase 2: Share activation flow

#### Automated

- [x] 2.1 npm run build passes — b706eed
- [x] 2.2 npm run lint passes — b706eed

#### Manual

- [x] 2.3 Share button visible on set detail page — b706eed
- [x] 2.4 Activate sharing generates token and shows link — b706eed
- [x] 2.5 Copy link button works — b706eed
- [x] 2.6 Token persists after page reload — b706eed

### Phase 3: Share page + claim flow

#### Automated

- [x] 3.1 npm run build passes — f2e2cb5
- [x] 3.2 npm run lint passes — f2e2cb5

#### Manual

- [x] 3.3 Invalid token → 404 state rendered — f2e2cb5
- [x] 3.4 Unauthenticated visitor → set info + "Log in to claim" shown — f2e2cb5
- [x] 3.5 Authenticated user → "Clone to my sets" → redirect to new set — f2e2cb5
- [x] 3.6 Second claim attempt → "You already have this set" shown — f2e2cb5
- [x] 3.7 Two different users can claim the same link independently — f2e2cb5
- [x] 3.8 set_shares has one row per (original_set_id, recipient_user_id) — f2e2cb5
- [x] 3.9 Self-claim by teacher → error toast shown — f2e2cb5

### Phase 4: Donated Sets dashboard

#### Automated

- [x] 4.1 npm run build passes — a26ce59
- [x] 4.2 npm run lint passes — a26ce59

#### Manual

- [x] 4.3 Donated Sets section visible on teacher dashboard after claim — a26ce59
- [x] 4.4 Tile shows: original set name, student email, claim date, flashcard counts — a26ce59
- [x] 4.5 Teacher with no donations → section hidden — a26ce59
- [x] 4.6 Last activity updates after student completes review — a26ce59
