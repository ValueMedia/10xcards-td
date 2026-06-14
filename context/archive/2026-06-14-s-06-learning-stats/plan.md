# Learning Stats Dashboard Implementation Plan

## Overview

Add a learning statistics section to the dashboard: a 14-day activity bar chart (minutes per day) and tiles for the 3 most recently opened sets (name, flashcard count, learned count, last-opened date). Requires a new `session_log` table, session instrumentation in `ReviewSession.tsx`, a stats service, and a new `StatsBlock` React component on the dashboard.

## Current State Analysis

- `sets.last_opened_at` is already written by `getSetWithFlashcards()` in `src/lib/services/sets.ts:112` — no additional work needed for recent-sets tiles.
- `flashcards.state` (smallint) stores FSRS state: 0=New, 1=Learning, 2=Review, 3=Relearning. State 2 = "learned".
- `reviews` table has per-card `review` timestamp but no session start/end fields — cannot derive session duration without new data.
- `ReviewSession.tsx` transitions to `'summary'` phase at line 87-88 when the last card is graded — this is the natural hook for session logging.
- Dashboard: `dashboard.astro` fetches sets server-side and passes as JSON to `SetDashboard` React component — same SSR pattern for stats.
- No chart library installed — bar chart implemented with CSS/Tailwind percentage widths.

## Desired End State

- `POST /api/sessions` endpoint records session start/end times.
- `ReviewSession.tsx` sends a session log on completion.
- `dashboard.astro` fetches learning stats server-side alongside sets.
- Dashboard renders a `StatsBlock` above the sets grid showing: 14-day bar chart of minutes per day, and 3 recently-opened set tiles with learned/total counts.

### Key Discoveries

- `src/lib/services/sets.ts:112` — `last_opened_at` already updated; no changes to set detail flow needed.
- `src/components/review/ReviewSession.tsx:87-88` — session-end hook: `setPhase("summary")` fires when `currentIndex + 1 >= cards.length`.
- `src/pages/dashboard.astro:10` — pattern: `listSetsWithFlashcardCounts(supabase, user.id)` → JSON string → `SetDashboard`.
- `supabase/migrations/20260610000000_initial_schema.sql:34` — `reviews` table has no session fields; new `session_log` table is the clean model.

## What We're NOT Doing

- No modification to the `reviews` table schema.
- No approximation of session duration from review timestamps.
- No chart library (Recharts or similar) — pure CSS.
- No separate `/stats` page — stats live on `/dashboard`.
- No session editing/deletion UI.
- No caching layer — SSR on each dashboard load is sufficient for MVP.

## Implementation Approach

Three sequential phases: database foundation → session instrumentation → stats UI. Each phase is independently verifiable. Phase 2 depends on Phase 1 (table must exist before inserts). Phase 3 depends on Phase 2 data being present for meaningful manual testing.

## Critical Implementation Details

**`session_log` RLS**: INSERT policy must allow the authenticated user to insert rows where `user_id = auth.uid()` — SELECT and DELETE are owner-only. No UPDATE policy needed (sessions are write-once).

**Session start time**: use `useRef<Date>` (not `useState`) in `ReviewSession.tsx` to capture mount time without triggering re-renders. Fire the POST as a side-effect inside the `setPhase("summary")` branch — no `useEffect` needed.

**Daily chart time zone**: aggregate by UTC day in the SQL query (`date_trunc('day', started_at)`). Frontend labels show `Mon`, `Tue`… derived from the returned date strings. No timezone conversion on the client.

**"0 minutes" days**: the stats service must fill in all 14 days even when `session_log` has no rows for a given day — return a dense array of 14 `{ day, minutes }` objects, padding missing days with `minutes: 0`.

---

## Phase 1: Database Foundation — session_log Table

### Overview

Create the `session_log` table with RLS and an index, then verify the migration applies cleanly.

### Changes Required

#### 1. Migration: session_log

**File**: `supabase/migrations/20260614000001_session_log.sql`

**Intent**: Introduce a table that records one row per completed review session — the source of truth for the daily minutes chart.

**Contract**: Table columns: `id uuid PK`, `user_id uuid NOT NULL → auth.users`, `set_id uuid NOT NULL → public.sets ON DELETE CASCADE`, `started_at timestamptz NOT NULL`, `ended_at timestamptz NOT NULL`. RLS enabled; policies: `authenticated` INSERT where `user_id = auth.uid()`, `authenticated` SELECT where `user_id = auth.uid()`. Index: `(user_id, started_at DESC)`.

### Success Criteria

#### Automated Verification

- Migration applies cleanly: `npx supabase db reset --local` (**ask user first per lesson**) or `npx supabase migration up`
- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification

- `session_log` table visible in Supabase Studio with correct columns and RLS enabled.
- Authenticated user can INSERT a row via Studio; another user cannot SELECT it.

**Implementation Note**: Pause after this phase for manual DB verification before proceeding.

---

## Phase 2: Session Tracking — API Endpoint + ReviewSession Instrumentation

### Overview

Add a `POST /api/sessions` endpoint and instrument `ReviewSession.tsx` to fire it when a session completes. This is the data-collection layer; without it Phase 3's chart has no data.

### Changes Required

#### 1. Stats service — logSession function

**File**: `src/lib/services/stats.ts` (new file)

**Intent**: Encapsulate the `session_log` insert behind a typed service function, following the established `{ data, error }` tuple pattern.

**Contract**: Export `logSession(client: SupabaseClient, userId: string, setId: string, startedAt: Date, endedAt: Date): Promise<{ error: string | null }>`. Inserts one row into `session_log`. Returns `{ error: null }` on success; `{ error: message }` on failure.

#### 2. API endpoint — POST /api/sessions

**File**: `src/pages/api/sessions/index.ts` (new file)

**Intent**: Authenticated endpoint that accepts session timing data from the client and persists it via `logSession`.

**Contract**: `export const prerender = false`. Zod schema: `{ setId: z.string().uuid(), startedAt: z.string().datetime(), endedAt: z.string().datetime() }`. Auth check → parse body → validate `endedAt > startedAt` (return 400 if not) → call `logSession` → return `{ success: true }`. Follow the pattern from `src/pages/api/reviews/index.ts`.

#### 3. ReviewSession.tsx — session timing and POST on completion

**File**: `src/components/review/ReviewSession.tsx`

**Intent**: Capture session start time on mount and fire a POST to `/api/sessions` when the session transitions to the summary phase.

**Contract**:
- Add `import { useRef } from "react"` (already has `useState`).
- Declare `const sessionStartedAt = useRef<Date>(new Date())` immediately after the existing state declarations (line 28 area).
- In the branch at line 87-88 where `setPhase("summary")` is called, add an async fire-and-forget call:

```ts
void fetch("/api/sessions", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    setId,
    startedAt: sessionStartedAt.current.toISOString(),
    endedAt: new Date().toISOString(),
  }),
});
```

No error handling needed in the component — session logging is best-effort and should not block the summary screen.

`setId` is available as a prop on `ReviewSession` (check the props interface; if missing, pass it from the parent Astro page).

### Success Criteria

#### Automated Verification

- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification

- Complete a review session; verify a row appears in `session_log` in Supabase Studio with correct `started_at`, `ended_at`, and `set_id`.
- Incomplete sessions (navigating away mid-session) do NOT create a row.
- `POST /api/sessions` with mismatched times (endedAt before startedAt) returns 400.

---

## Phase 3: Stats Service, Types, and Dashboard UI

### Overview

Implement `getLearningStats`, add types, fetch stats SSR in `dashboard.astro`, and render the `StatsBlock` component above the sets grid.

### Changes Required

#### 1. Types — DailyStats, RecentSetStats, LearningStats

**File**: `src/types.ts`

**Intent**: Typed contracts for the stats payload passed from Astro to React.

**Contract**: Add three interfaces:
- `DailyStats { day: string; minutes: number }` — one entry per day, 14 entries total.
- `RecentSetStats { id: string; name: string; last_opened_at: string; total_flashcards: number; learned_count: number }`.
- `LearningStats { dailyMinutes: DailyStats[]; recentSets: RecentSetStats[] }`.

#### 2. Stats service — getLearningStats function

**File**: `src/lib/services/stats.ts`

**Intent**: Fetch daily session minutes and recently-opened set stats in two parallel Supabase queries and return a dense 14-day array.

**Contract**: Export `getLearningStats(client: SupabaseClient, userId: string): Promise<{ data: LearningStats | null; error: string | null }>`.

Three queries (all via Supabase JS, no extra migration needed):

1. **Daily minutes (TypeScript aggregation)**: `client.from("session_log").select("started_at, ended_at").eq("user_id", userId).gte("started_at", <14 days ago ISO>)` — fetch raw rows, then aggregate in TypeScript: group by UTC date (`new Date(r.started_at).toISOString().slice(0, 10)`), sum minutes per day (`Math.round((ended_at - started_at) / 60000)`), fill missing days with `minutes: 0` to produce exactly 14 `DailyStats` entries ordered oldest-first. PostgREST does not support `GROUP BY date_trunc` — TypeScript aggregation is the reliable path.

2. **Total flashcards per set**: `client.from("flashcards").select("set_id").in("set_id", recentSetIds)` — count per `set_id` in TypeScript.

3. **Learned flashcards per set**: same query with `.eq("state", 2)` — count per `set_id` in TypeScript.

Fetch recently-opened sets first: `client.from("sets").select("id, name, last_opened_at").eq("user_id", userId).not("last_opened_at", "is", null).order("last_opened_at", { ascending: false }).limit(3)`. Then run queries 2 and 3 in parallel using `Promise.all`, join by `set_id` in TypeScript. Dataset is small (max 3 sets, 14 days of sessions) — TypeScript aggregation is appropriate.

#### 3. dashboard.astro — fetch stats server-side

**File**: `src/pages/dashboard.astro`

**Intent**: Fetch learning stats alongside sets in the Astro server handler and pass to `SetDashboard`.

**Contract**: Add `import { getLearningStats } from "@/lib/services/stats"`. After the existing `listSetsWithFlashcardCounts` call, add `const { data: stats } = await getLearningStats(supabase, user.id)`. Pass `stats` to `SetDashboard` as a new `initialStats` prop (JSON-serialized string, same pattern as `initialSets`). On error or null, pass an empty stats object `{ dailyMinutes: [], recentSets: [] }`.

#### 4. SetDashboard.tsx — accept and render StatsBlock

**File**: `src/components/sets/SetDashboard.tsx`

**Intent**: Accept the new `initialStats` prop and render `StatsBlock` above the existing sets grid.

**Contract**: Add `initialStats: string` to the `Props` interface. Parse it on mount (same pattern as `initialSets`). Render `<StatsBlock stats={stats} />` above the sets grid section.

#### 5. StatsBlock component

**File**: `src/components/dashboard/StatsBlock.tsx` (new file)

**Intent**: Render the 14-day bar chart and the 3 recent-sets tiles using Tailwind CSS — no chart library.

**Contract**: Props: `{ stats: LearningStats }`. Two sub-sections:

**Bar chart**: 14 vertical bars side-by-side. Bar height = `(minutes / maxMinutes) * 100%` where `maxMinutes = Math.max(...dailyMinutes.map(d => d.minutes), 1)`. Day labels below each bar (Mon, Tue, etc. from `new Date(d.day).toLocaleDateString('en', { weekday: 'short' })`). Show minute value on hover (CSS `title` attribute or Tailwind `group/tooltip` pattern). Bars use `bg-purple-500` on days with activity, `bg-white/10` for zero days.

**Recent sets tiles**: 3 cards in a row (or 1-col on mobile). Each tile: set name, "X / Y cards learned" (learned_count / total_flashcards), last-opened date formatted as relative time or locale date. Link to `/sets/{id}`. If `stats.recentSets` is empty (no sets opened yet), render a muted hint "Start a review session to see your recent activity."

**Empty state for chart**: if all 14 values are 0, render a muted "No review sessions in the last 14 days" placeholder instead of a flat bar chart.

### Success Criteria

#### Automated Verification

- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification

- Dashboard renders `StatsBlock` above the sets grid with no layout regressions.
- Bar chart shows 14 columns; today's column is populated after completing a review session.
- "0 sessions" state renders the muted placeholder instead of flat bars.
- Recent sets tiles show correct names, learned counts, and last-opened dates.
- Clicking a recent set tile navigates to `/sets/{id}`.
- No regressions on create/rename/delete set dialogs.

---

## Testing Strategy

### Manual Testing Steps

1. Complete a review session for any set.
2. Open dashboard — bar chart should show today's column with minutes > 0.
3. Open dashboard without any sessions — bar chart shows the empty placeholder.
4. Verify recent sets tiles list the 3 sets opened most recently (check order by opening sets in sequence).
5. Verify learned count matches FSRS state=2 cards visible in the set detail view.
6. Resize to mobile — StatsBlock stacks correctly, chart is scrollable or responsive.

## Migration Notes

Phase 1 adds `session_log`. No second migration is needed — Phase 3 uses TypeScript aggregation for daily minutes and separate Supabase JS queries for learned counts.

## References

- `supabase/migrations/20260610000000_initial_schema.sql` — base schema
- `src/lib/services/sets.ts:112` — last_opened_at update pattern
- `src/components/review/ReviewSession.tsx:87-88` — session-end hook
- `src/pages/dashboard.astro` — SSR pattern for dashboard data
- `src/pages/api/reviews/index.ts` — API endpoint pattern

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Database Foundation — session_log Table

#### Automated

- [x] 1.1 Migration applies cleanly: `npx supabase migration up` — da25534
- [x] 1.2 Lint passes: `npm run lint` — da25534
- [x] 1.3 Build passes: `npm run build` — da25534

#### Manual

- [x] 1.4 session_log table visible in Supabase Studio with correct columns and RLS enabled — da25534
- [x] 1.5 Authenticated user can INSERT a row; another user cannot SELECT it — da25534

### Phase 2: Session Tracking — API Endpoint + ReviewSession Instrumentation

#### Automated

- [x] 2.1 Lint passes: `npm run lint` — 9d475b0
- [x] 2.2 Build passes: `npm run build` — 9d475b0

#### Manual

- [x] 2.3 Complete a review session — row appears in session_log with correct started_at, ended_at, set_id — 9d475b0
- [x] 2.4 Navigating away mid-session does NOT create a row — 9d475b0
- [x] 2.5 POST /api/sessions with endedAt before startedAt returns 400 — 9d475b0

### Phase 3: Stats Service, Types, and Dashboard UI

#### Automated

- [x] 3.1 Lint passes: `npm run lint` — 12e754d
- [x] 3.2 Build passes: `npm run build` — 12e754d

#### Manual

- [x] 3.3 Dashboard renders StatsBlock above sets grid, no layout regressions — 12e754d
- [x] 3.4 Bar chart today column populated after completing a review session — 12e754d
- [x] 3.5 Empty-state placeholder shown when no sessions in 14 days — 12e754d
- [x] 3.6 Recent sets tiles show correct names, learned counts, last-opened dates — 12e754d
- [x] 3.7 Clicking a tile navigates to /sets/{id} — 12e754d
- [x] 3.8 No regressions on set create/rename/delete dialogs — 12e754d
