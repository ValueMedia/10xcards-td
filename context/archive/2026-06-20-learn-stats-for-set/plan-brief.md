# Activity Chart on Set Detail + Reset Progress on Review — Plan Brief

> Full plan: `context/changes/learn-stats-for-set/plan.md`

## What & Why

Add a per-set 14-day activity bar chart at the top of the set detail page (`/sets/[id]`), matching the `/dashboard` chart, and a "Reset progress" button on the review page that lets a user wipe a set's learning state and start over.

## Starting Point

The dashboard already has a custom Tailwind activity chart (`StatsBlock`) fed by per-day `session_log` minutes. `session_log` carries `set_id`, so per-set scoping is a simple filter. Learning progress lives in the `flashcards` FSRS columns; `reviews` is an immutable audit log with SELECT+INSERT RLS only (no DELETE). `ReviewSession` is a `client:only` island with hardcoded Polish strings and no i18n.

## Desired End State

`/sets/[id]` opens with a bar chart of minutes spent reviewing that set (or a "no activity" note). During an active review session, the header shows a Reset button (responsive: full label desktop / short mobile, EN+PL); confirming a dialog resets FSRS state + deletes the set's review history (keeping `session_log`) and restarts the session from the first card.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Chart data scope | This set only | Contextual to the set being viewed; `session_log.set_id` makes it cheap | Plan |
| Reset scope | FSRS state + delete `reviews` | Clean restart with consistent history; keep `session_log` for the chart | Plan |
| After reset | Reload session from scratch | User immediately restudies all (now-due) cards | Plan |
| Button i18n | Full i18n of the button only | Honors given EN/PL texts without rewriting the whole component | Plan |
| Button placement | `reviewing` header only | User's explicit choice (limits reset to active sessions) | Plan |
| Confirmation | Confirmation dialog | Reset is irreversible (deletes review history) | Plan |
| Reset RPC mode | `SECURITY DEFINER` + ownership guard | `reviews` has no DELETE RLS policy; invoker mode would fail | Plan |

## Scope

**In scope:** per-set `getSetActivity` service; shared `ActivityChart` extracted from `StatsBlock`; chart on set page; reset RPC migration; `resetSetProgress` service; `POST /api/sets/[id]/reset-progress` + OpenAPI; reset button + dialog + i18n in `ReviewSession`.

**Out of scope:** reset button in empty/summary phases; full i18n of `ReviewSession`; clearing `session_log`; recent-sets block on the set page; undo for reset.

## Architecture / Approach

Phase 1 (chart) is independent. Phase 2 (reset backend) and Phase 3 (reset UI) are coupled: an atomic `SECURITY DEFINER` RPC does the destructive work behind a POST endpoint; the UI confirms, calls it, then reuses the existing `retryCount` load effect to restart the session.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Activity chart | Per-set chart + shared `ActivityChart` | Refactor regressing the dashboard chart |
| 2. Reset backend | RPC + service + endpoint + OpenAPI | RLS/ownership correctness on destructive delete |
| 3. Reset UI | Button + dialog + i18n + session reload | i18n wiring inside a `client:only` island |

**Prerequisites:** local Supabase running (Docker) to apply the migration.
**Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- Reset is only reachable during an active `reviewing` session (user's choice): a set with no due cards cannot be reset from the review page.
- Assumes `dashboard.activity` / `dashboard.noActivity` exist in both en/pl (confirmed for en; verify pl parity during Phase 1).
- `SECURITY DEFINER` must include a strict ownership guard — a missing guard would let any authenticated user reset any set.

## Success Criteria (Summary)

- Set page shows correct per-set activity; dashboard chart unchanged.
- Reset (after confirm) clears FSRS + review history for the set, keeps session_log, and restarts the session.
- Reset button label is correct across viewport sizes and locales.
