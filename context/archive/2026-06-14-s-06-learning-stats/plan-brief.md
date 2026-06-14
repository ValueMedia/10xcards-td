# Learning Stats Dashboard — Plan Brief

> Full plan: `context/changes/s-06-learning-stats/plan.md`

## What & Why

S-06 closes the Stream A learning loop: after a user generates flashcards (S-01) and reviews them (S-05), they now get visibility into their learning activity. The dashboard gains a 14-day minutes-per-day bar chart and tiles for the 3 most recently opened sets (with learned/total card counts), directly satisfying US-011 from the PRD.

## Starting Point

Dashboard shows a flat grid of sets with flashcard counts. `session_log` table does not exist — no session duration data is captured. `sets.last_opened_at` is already written on set-open. `flashcards.state` encodes FSRS state (2 = Review = "learned").

## Desired End State

Dashboard opens and immediately shows (SSR): a 14-day bar chart of minutes spent reviewing, and 3 tiles for recently opened sets with learned/total counts. Completing a review session updates today's bar on next dashboard load.

## Key Decisions Made

| Decision | Choice | Why |
|---|---|---|
| Session duration model | New `session_log` table | Clean schema; accurate timing; no approximation hacks |
| "Learned" definition | `flashcards.state = 2` (FSRS Review) | Semantically correct per FSRS; column exists |
| Stats location on page | Above sets grid on /dashboard | One view; context of learning alongside sets |
| Chart rendering | Pure CSS / Tailwind | No new dependency; sufficient for a simple bar chart |
| Data fetch strategy | SSR in dashboard.astro | Consistent with existing sets pattern; no extra round-trip |
| Recent sets ordering | `sets.last_opened_at DESC` | Column already written by set-open; no extra query needed |

## Scope

**In scope:** `session_log` migration, `POST /api/sessions`, ReviewSession instrumentation, `getLearningStats` service, `StatsBlock` component, dashboard wiring

**Out of scope:** Timezone-aware day boundaries (UTC only), chart tooltips/interactivity beyond CSS hover, `/stats` dedicated page, session editing/deletion, caching

## Architecture / Approach

```
ReviewSession.tsx ──POST /api/sessions──► session_log (Supabase)
                                               │
dashboard.astro (SSR) ──getLearningStats()────►│
                           + sets query         │
                                └──► SetDashboard ──► StatsBlock
                                                        ├── BarChart (CSS)
                                                        └── RecentSetTiles
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. DB Foundation | `session_log` table + RLS | Migration must apply before Phase 2 inserts |
| 2. Session Tracking | `POST /api/sessions` + ReviewSession fires it | `setId` prop must exist on ReviewSession; verify before wiring |
| 3. Stats UI | `getLearningStats`, StatsBlock, dashboard wiring | Supabase JS aggregation syntax for daily grouping + learned count may need RPC fallback |

**Prerequisites:** Local Supabase running (`npx supabase start`); at least one set with flashcards in state=2 for meaningful manual testing of learned counts  
**Estimated effort:** ~2-3 sessions across 3 phases

## Open Risks & Assumptions

- Supabase JS PostgREST may not support `GROUP BY date_trunc` or filtered counts natively — plan notes an RPC fallback path; Phase 3 may add a second migration for SQL functions.
- `setId` availability in ReviewSession.tsx needs verification before Phase 2 wiring (likely already a prop given the review page URL structure).
- Sessions shorter than 1 second will record 0 minutes — acceptable for MVP.

## Success Criteria (Summary)

- Complete a review session → dashboard bar chart shows today's minutes updated.
- Dashboard tiles show the 3 most recently opened sets with accurate learned counts.
- No regressions on existing dashboard set management (create/rename/delete).
