# Activity Chart on Set Detail + Reset Progress on Review — Implementation Plan

## Overview

Two user-facing additions to the flashcard set flow:

1. **Per-set activity chart** at the top of the set detail page (`/sets/[id]`), styled identically to the 14-day activity bar chart on `/dashboard`, but scoped to the minutes spent reviewing *this* set.
2. **"Reset progress" button** in the review page (`/sets/[id]/review`) header that, after a confirmation dialog, wipes the FSRS learning state for the set so the user can start over — then immediately reloads the review session from scratch.

## Current State Analysis

- **Dashboard chart**: `StatsBlock.tsx` (`src/components/dashboard/StatsBlock.tsx:15-44`) renders a custom Tailwind bar chart from `LearningStats.dailyMinutes` (`DailyStats[]` = `{day, minutes}[]`, 14 days). Data is computed server-side in `getLearningStats()` (`src/lib/services/stats.ts:36-114`) by aggregating `session_log` rows (which carry `set_id`) into minutes-per-day. The chart block uses `useTranslation("dashboard")` and keys `dashboard.activity` / `dashboard.noActivity` (both present in `locales/{en,pl}/dashboard.json`).
- **Set detail page**: `src/pages/sets/[id]/index.astro` loads `getSetWithFlashcards()` and mounts `SetDetailPage` as `client:only="react"` with props `initialData` (JSON `{set, flashcards}`) + `locale`. `SetDetailPage` wraps `SetDetailPageInner` in `<I18nProvider locale>` and uses `useTranslation("common")` (`src/components/sets/SetDetailPage.tsx:34-55`).
- **Learning progress** lives entirely in the `flashcards` table FSRS columns (`due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review`). The `reviews` table is an immutable audit log. `session_log` feeds the activity chart.
- **Review page**: `src/pages/sets/[id]/review.astro` mounts `ReviewSession` as `client:only="react"` with props `setId, setName` — **no `locale`, no i18n**. `ReviewSession.tsx` has all strings hardcoded in Polish and no `I18nProvider`/`useTranslation`. Header (`ReviewSession.tsx:251-262`) shows a back link + `X / Y` counter. Session reload is driven by a `retryCount` state bump that re-runs the due-cards `useEffect` (`ReviewSession.tsx:66-92`).
- **Reset feasibility**: `reviews` RLS has only SELECT + INSERT policies (`20260610000000_initial_schema.sql:168-175`) — **no DELETE policy**. A security-invoker RPC deleting from `reviews` would fail RLS. The existing `submit_card_review` RPC is security-invoker because it only INSERTs reviews + UPDATEs flashcards (both allowed by RLS).

### Key Discoveries:

- `session_log` has `set_id` — per-set activity is a trivial filter on the existing aggregation (`src/lib/services/stats.ts:57-79`).
- The chart block (`StatsBlock.tsx:18-44`) is self-contained and extractable into a shared `ActivityChart` taking `dailyMinutes: DailyStats[]`; it can keep using `useTranslation("dashboard")` regardless of parent namespace because `dashboard` is in the i18next `ns` list (`src/lib/i18n/index.ts`).
- Reset must be `SECURITY DEFINER` with an explicit `set.user_id = p_user_id` ownership guard (no `reviews` DELETE RLS policy exists) — see lesson "RLS anon policies must not expose capability tokens" and "Nowa tabela z RLS wymaga GRANT".
- Session reload after reset = set phase to `loading`, reset `currentIndex`/`revealed`/`showingBack`, and bump `retryCount` — the existing load effect repopulates `cards` + `summary` (all cards become due after reset).
- Lesson: any API contract change requires updating `src/lib/openapi/openapi-spec.ts` in the same phase.
- Lesson: `ReviewSession` is `client:only` and the i18n wrapper must live *inside* the hydrated island (provider inside the component, not above it in `.astro`).

## Desired End State

- Visiting `/sets/[id]` shows, above the set title, a 14-day bar chart of minutes spent reviewing that specific set (or a "no activity" message), visually matching `/dashboard`.
- On `/sets/[id]/review`, during an active review session, a "Reset progress" / "Resetuj postęp" button (desktop) — "Reset" / "Resetuj" (mobile) — appears in the header. Clicking it opens a confirmation dialog; confirming resets all FSRS state for the set, deletes the set's `reviews` rows, keeps `session_log`, and reloads the session from the first card.
- Verify: review a few cards in a set, open the set page → chart shows minutes; open review, reset → dialog → confirm → session restarts with all cards due; the activity chart still shows prior session minutes (session_log untouched).

## What We're NOT Doing

- **Not** showing the reset button in the `empty` / `summary` / `error` phases — by explicit user decision it lives only in the active `reviewing` header. Consequence: a fully-learned set with no due cards cannot be reset from the review page (see Open Risks).
- **Not** internationalizing the rest of `ReviewSession` — only the new reset button/dialog get i18n; existing hardcoded Polish strings stay as-is.
- **Not** deleting or zeroing `session_log` on reset — the activity chart history is preserved.
- **Not** adding the "recently opened sets" block to the set detail page — only the activity bar chart is reused.
- **Not** adding an undo/restore mechanism for reset (it is irreversible by design; the dialog is the safeguard).

## Implementation Approach

Three sequenced phases. Phase 1 (chart) is fully independent. Phase 2 (reset backend) and Phase 3 (reset UI) are coupled — Phase 3 consumes the Phase 2 endpoint. Reuse over duplication: extract the dashboard chart block into a shared `ActivityChart`; add a focused `getSetActivity` service rather than overloading `getLearningStats`.

## Critical Implementation Details

- **Reset RPC security mode**: must be `SECURITY DEFINER` with `set search_path = public` and an explicit ownership check (`select user_id from sets where id = p_set_id` must equal `p_user_id`, else `raise exception`). Security-invoker will fail because `reviews` has no DELETE RLS policy. Wrap the FSRS update + reviews delete in one function body (implicitly transactional) so a partial reset cannot occur.
- **Session reload sequencing** (Phase 3): on reset success, set `currentIndex=0`, `revealed=false`, `showingBack=reverse`, `phase="loading"`, then bump `retryCount` — order matters so the load effect (keyed on `retryCount`) starts from a clean slate.

---

## Phase 1: Per-set activity chart on the set detail page

### Overview

Add a server-computed per-set activity series, extract a shared chart component, and render it at the top of the set detail page.

### Changes Required:

#### 1. Per-set activity service

**File**: `src/lib/services/stats.ts`

**Intent**: Add `getSetActivity` that returns the 14-day `DailyStats[]` for a single set, scoped by `user_id` + `set_id`. Reuse the same 14-day UTC window and minutes-per-day aggregation already in `getLearningStats`.

**Contract**: `getSetActivity(client: SupabaseClient, userId: string, setId: string): Promise<{ data: DailyStats[] | null; error: string | null }>`. Query: `session_log` filtered by `.eq("user_id", userId).eq("set_id", setId).gte("started_at", cutoff)`. Build the dense 14-element array exactly as `stats.ts:73-79`.

#### 2. Shared `ActivityChart` component

**File**: `src/components/dashboard/ActivityChart.tsx` (new)

**Intent**: Extract the bar-chart block (`StatsBlock.tsx:18-44`) — the `<h2>` title, the bars, and the empty-state message — into a reusable component taking `dailyMinutes`. Keep `useTranslation("dashboard")` and keys `dashboard.activity` / `dashboard.noActivity`.

**Contract**: `export function ActivityChart({ dailyMinutes }: { dailyMinutes: DailyStats[] })`. Renders the same markup currently at `StatsBlock.tsx:18-44`.

#### 3. Refactor `StatsBlock` to use `ActivityChart`

**File**: `src/components/dashboard/StatsBlock.tsx`

**Intent**: Replace the inline bar-chart block with `<ActivityChart dailyMinutes={dailyMinutes} />`; leave the "recent sets" block unchanged. No behavior change on the dashboard.

**Contract**: `StatsBlock` still takes `stats: LearningStats`; bar-chart markup now delegated.

#### 4. Compute and pass activity from the set page

**File**: `src/pages/sets/[id]/index.astro`

**Intent**: When `data` exists, call `getSetActivity(supabase, user.id, id)` server-side and pass the result to `SetDetailPage` as a new `activity` prop (JSON-stringified). Tolerate errors by passing an empty array.

**Contract**: `<SetDetailPage initialData=... activity={JSON.stringify(activityData ?? [])} locale=... client:only="react" />`.

#### 5. Render the chart in `SetDetailPage`

**File**: `src/components/sets/SetDetailPage.tsx`

**Intent**: Add `activity: string` to `Props`, parse it defensively (fallback `[]`) like `initialData`, and render `<ActivityChart dailyMinutes={parsed} />` at the very top of `SetDetailPageInner`'s main container, above the set title header. The existing `<I18nProvider>` wrapper already supplies the i18n context the chart needs.

**Contract**: `Props` gains `activity: string`. New parse + top-of-content render; existing layout otherwise unchanged.

### Success Criteria:

#### Automated Verification:

- Type checking + Astro check passes: `npm run build`
- Lint passes on changed TS/TSX: `npx eslint src/lib/services/stats.ts src/components/dashboard/ActivityChart.tsx src/components/dashboard/StatsBlock.tsx src/components/sets/SetDetailPage.tsx`

#### Manual Verification:

- After reviewing cards in a set, `/sets/[id]` shows a bar chart at the top with non-zero bars on the days reviewed.
- A set never reviewed shows the "no activity" message, not a broken/empty chart.
- `/dashboard` chart is visually unchanged after the `StatsBlock` refactor.
- Chart reflects only the current set (reviewing a *different* set does not change this set's chart).

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 2: Reset-progress backend (RPC + service + endpoint)

### Overview

An atomic, ownership-guarded operation that resets FSRS state and deletes review history for a set, exposed via a POST endpoint.

### Changes Required:

#### 1. Reset RPC migration

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_reset_set_progress_rpc.sql` (new; e.g. `20260620120000_reset_set_progress_rpc.sql`)

**Intent**: Create `reset_set_progress(p_set_id uuid, p_user_id uuid)` that (1) verifies the set belongs to the user (raise exception otherwise), (2) resets FSRS columns to schema defaults for all flashcards in the set, (3) deletes `reviews` rows for those flashcards. Grant execute to `authenticated`.

**Contract**: `SECURITY DEFINER`, `set search_path = public`, `returns void`, `language plpgsql`. FSRS reset values match the `flashcards` table defaults (`due = now()`, `stability = 0`, `difficulty = 0`, `elapsed_days = 0`, `scheduled_days = 0`, `learning_steps = 0`, `reps = 0`, `lapses = 0`, `state = 0`, `last_review = null`). Delete: `delete from reviews where flashcard_id in (select id from flashcards where set_id = p_set_id)`. End with `grant execute on function public.reset_set_progress to authenticated;`. Ownership guard pattern:

```sql
if not exists (select 1 from public.sets where id = p_set_id and user_id = p_user_id) then
  raise exception 'Set not found or access denied';
end if;
```

#### 2. Reset service function

**File**: `src/lib/services/reviews.ts`

**Intent**: Add `resetSetProgress` that calls the RPC and maps the result to the module's `ServiceError` shape used by the other functions here.

**Contract**: `resetSetProgress(client: SupabaseClient | null, userId: string, setId: string): Promise<{ error: ServiceError | null }>`. Calls `client.rpc("reset_set_progress", { p_set_id: setId, p_user_id: userId })`.

#### 3. Reset API endpoint

**File**: `src/pages/api/sets/[id]/reset-progress.ts` (new)

**Intent**: `POST` handler that validates the `id` param (uuid via zod), resolves user + supabase from `locals`, calls `resetSetProgress`, and returns `{ success: true }` or an error JSON. Mirror the auth/error conventions of `src/pages/api/reviews/index.ts`. Must `export const prerender = false`.

**Contract**: `POST /api/sets/{id}/reset-progress` → `200 { success: true }`; `400` invalid id, `401` no user, `404`/`500` on service error. Uppercase `POST` export, zod validation.

#### 4. OpenAPI spec update

**File**: `src/lib/openapi/openapi-spec.ts`

**Intent**: Document the new endpoint (path, method, path param, 200/4xx/5xx responses, tag) per the lesson "Zmiana funkcji API wymaga aktualizacji dokumentacji OpenAPI/Scalar".

**Contract**: New `POST /sets/{id}/reset-progress` path entry with response schemas matching the endpoint.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly against local Supabase: `npx supabase migration up` (or `npx supabase db push --local`)
- Type checking + build passes: `npm run build`
- Lint passes on changed files: `npx eslint src/lib/services/reviews.ts src/pages/api/sets/[id]/reset-progress.ts src/lib/openapi/openapi-spec.ts`

#### Manual Verification:

- Calling `POST /api/sets/[id]/reset-progress` for an owned set returns `{ success: true }`; afterwards all flashcards in the set have `state = 0` / `reps = 0` and `reviews` rows for the set are gone (verify via SQL in the Docker `supabase_db` container).
- Calling it for a set owned by another user returns an error and changes nothing.
- `session_log` rows for the set are untouched.
- New endpoint appears in Scalar at `/docs/api`.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 3: Reset-progress UI in ReviewSession

### Overview

Add i18n to the island, a header reset button with a responsive label, a confirmation dialog, and post-reset session reload.

### Changes Required:

#### 1. i18n keys

**File**: `src/lib/i18n/locales/en/common.json` and `src/lib/i18n/locales/pl/common.json`

**Intent**: Add keys for the button (full + short), the dialog (title, description, cancel, confirm, pending), and toast (success/error). Maintain en/pl parity.

**Contract**: New keys under `set.*`, e.g. `set.resetProgress` ("Reset progress" / "Resetuj postęp"), `set.resetProgressShort` ("Reset" / "Resetuj"), `set.resetProgressConfirmTitle`, `set.resetProgressConfirmDesc`, `set.resetProgressCancel`, `set.resetProgressConfirm`, `set.resetting`, `set.resetProgressSuccess`, `set.resetProgressError`.

#### 2. Pass `locale` to ReviewSession

**File**: `src/pages/sets/[id]/review.astro`

**Intent**: Read `locale` from `Astro.locals` and pass it as a prop to the `ReviewSession` island.

**Contract**: `<ReviewSession client:only="react" setId={id} setName={setName} locale={locale as SupportedLocale} />`.

#### 3. Wrap ReviewSession in I18nProvider + add reset UI

**File**: `src/components/review/ReviewSession.tsx`

**Intent**: Split into an exported wrapper that renders `<I18nProvider locale={locale}><ReviewSessionInner .../></I18nProvider>` (provider inside the hydrated island per the lesson) and the existing body as `ReviewSessionInner`. Add `useTranslation("common")`. In the `reviewing`-phase header (`:251-262`), add a reset button next to the `X / Y` counter using shadcn `Button` (outline style matching existing `border-white/10 bg-white/5` usage). Render the label responsively: full text in a `hidden sm:inline` span, short text in a `sm:hidden` span. Wire a confirmation dialog (see #4); on confirm, POST to `/api/sets/${setId}/reset-progress`, and on success reset session state (`currentIndex=0`, `revealed=false`, `showingBack=reverse`, `phase="loading"`, bump `retryCount`) and toast success; on failure toast error.

**Contract**: New `Props.locale: SupportedLocale`. Wrapper + `ReviewSessionInner` split. Reset button only in the `reviewing` header. Reuses existing `retryCount`/load-effect for reload.

#### 4. Reset confirmation dialog

**File**: `src/components/review/ResetProgressDialog.tsx` (new)

**Intent**: A shadcn `Dialog` confirmation modeled on `src/components/sets/DeleteSetDialog.tsx` (same dark styling): title, destructive description, Cancel + destructive Confirm button with a pending state. Controlled via `open` / `onOpenChange` and an `onConfirm` callback; uses `useTranslation("common")` for its strings.

**Contract**: `ResetProgressDialog({ open, onOpenChange, onConfirm, pending }: {...})`. Confirm button disabled + shows `set.resetting` while `pending`.

### Success Criteria:

#### Automated Verification:

- Type checking + build passes: `npm run build`
- Lint passes on changed files: `npx eslint src/components/review/ReviewSession.tsx src/components/review/ResetProgressDialog.tsx`
- en/pl `common.json` have identical key sets for the new keys (manual diff or `npm run build` if a parity check exists)

#### Manual Verification:

- During a review session, the header shows "Reset progress" on desktop and "Reset" on a narrow viewport (and "Resetuj postęp" / "Resetuj" with `?locale=pl` or PL UI).
- Clicking it opens the confirmation dialog; Cancel closes it with no change.
- Confirming resets progress and the session restarts from the first card (all cards due again); a success toast appears.
- Network failure on reset shows an error toast and leaves the session unchanged.
- The rest of the review UI (grades, summary) is visually unchanged.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation.

---

## Testing Strategy

### Manual Testing Steps:

1. Create/seed a set, run a review session grading several cards. Confirm `/sets/[id]` chart shows minutes on today's bar.
2. Open `/dashboard` and confirm its chart is unchanged (refactor regression check).
3. Open `/sets/[id]/review`; with cards due, click Reset → confirm → session restarts; verify in DB that flashcards are `state=0`/`reps=0` and `reviews` for the set are deleted while `session_log` remains.
4. Reload `/sets/[id]` — chart still shows the earlier session minutes (session_log preserved).
5. Resize to mobile width and confirm the button label collapses to "Reset"/"Resetuj".

### Edge Cases:

- Set with no sessions → chart shows "no activity".
- Reset attempted on a set not owned by the user → endpoint error, no mutation.
- Reset network failure → error toast, session intact.

## Migration Notes

- One new migration adds `reset_set_progress` (SECURITY DEFINER). No data migration; existing rows unaffected until reset is invoked.
- Local apply via `npx supabase migration up`. Never run `supabase db reset` (lesson).

## References

- Dashboard chart: `src/components/dashboard/StatsBlock.tsx:18-44`
- Stats service: `src/lib/services/stats.ts:36-114`
- Existing atomic RPC pattern: `supabase/migrations/20260614120000_submit_card_review_rpc.sql`
- Reviews RLS (no DELETE policy): `supabase/migrations/20260610000000_initial_schema.sql:168-175`
- Review endpoint conventions: `src/pages/api/reviews/index.ts`
- Confirmation dialog pattern: `src/components/sets/DeleteSetDialog.tsx`
- I18nProvider-inside-island pattern: `src/components/sets/SetDetailPage.tsx:34-40`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Per-set activity chart on the set detail page

#### Automated

- [x] 1.1 Type checking + Astro check passes: `npm run build`
- [x] 1.2 Lint passes on changed TS/TSX files

#### Manual

- [x] 1.3 Set page shows bar chart with non-zero bars after reviewing
- [x] 1.4 Never-reviewed set shows the "no activity" message
- [x] 1.5 Dashboard chart visually unchanged after refactor
- [x] 1.6 Chart reflects only the current set

### Phase 2: Reset-progress backend (RPC + service + endpoint)

#### Automated

- [ ] 2.1 Migration applies cleanly to local Supabase
- [ ] 2.2 Type checking + build passes: `npm run build`
- [ ] 2.3 Lint passes on changed files

#### Manual

- [ ] 2.4 POST reset on owned set returns success; flashcards reset + reviews deleted
- [ ] 2.5 Reset on non-owned set errors and changes nothing
- [ ] 2.6 session_log rows for the set untouched
- [ ] 2.7 New endpoint appears in Scalar at `/docs/api`

### Phase 3: Reset-progress UI in ReviewSession

#### Automated

- [ ] 3.1 Type checking + build passes: `npm run build`
- [ ] 3.2 Lint passes on changed files
- [ ] 3.3 en/pl common.json have identical new key sets

#### Manual

- [ ] 3.4 Responsive label: full on desktop, short on mobile; EN/PL correct
- [ ] 3.5 Dialog opens; Cancel is a no-op
- [ ] 3.6 Confirm resets progress and restarts session from first card + success toast
- [ ] 3.7 Network failure shows error toast, session unchanged
- [ ] 3.8 Rest of review UI visually unchanged
