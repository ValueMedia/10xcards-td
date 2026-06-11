# Database Schema & RLS — Plan Brief

> Full plan: `context/changes/data-scheme/plan.md`

## What & Why

Create the foundational PostgreSQL schema for 10xCards — tables `sets`, `flashcards`, and `reviews` with Row Level Security policies, ts-fsrs v5-compatible columns, TypeScript entity types, and a dev seed. This is F-01: the critical blocker for every other roadmap slice. Without it, no feature can store or query data.

## Starting Point

No migrations exist (`supabase/migrations/` is absent). The Supabase client, auth middleware, and `config.toml` are fully configured and ready. The schema is built on top of Supabase-managed `auth.users`; no auth work is needed in this change.

## Desired End State

Three tables exist in local and production Supabase. Any authenticated user can manage their own sets and flashcards and cannot access another user's data. Anonymous users can read sets reachable by share token. TypeScript entity types are importable from `@/types`. `ts-fsrs` is installed. `npx supabase db reset` populates sample data for instant local browsing. S-01, S-02, S-03, S-04, S-05, and S-07 can all begin implementation.

## Key Decisions Made

| Decision | Choice | Why |
|---|---|---|
| `share_token` in F-01 | Include as nullable UUID | Avoids a later ALTER TABLE migration; zero-cost nullable column addition now |
| `last_opened_at` | Column on `sets` | O(1) stats read vs expensive MAX aggregation per set |
| Deletions | Hard delete + CASCADE | Simplest; no undo requirement in MVP; clean orphan prevention |
| Date format for ts-fsrs fields | `TIMESTAMPTZ` | Idiomatic Supabase/Postgres; readable in Studio; one `new Date()` call to adapt |
| ts-fsrs version | v5.x (FSRS v6 algorithm) | Best algorithm quality; `learning_steps` included from the start |
| Anon RLS | Stub in F-01 | Column and its policy co-locate; S-07 only adds UI + token generation |
| TypeScript scope | SQL + `src/types.ts` + ts-fsrs install | Unblocks all downstream slices immediately without a dependency gap |
| Seed data | Minimal `seed.sql` | Dev DX: local environment has real data after `db reset` |

## Scope

**In scope:**
- `supabase/migrations/20260610000000_initial_schema.sql` — full schema, triggers, indexes, RLS
- `src/types.ts` — `Set`, `Flashcard`, `Review` interfaces + `State`/`Rating` re-exports
- `npm install ts-fsrs` (v5.x)
- `supabase/seed.sql` — 1 set + 3 flashcards for first dev user

**Out of scope:**
- API endpoints (S-01/S-02)
- Admin/service-role Supabase client for share-link reads (S-07)
- Any UI components
- CSV parser (S-04)
- Full-text search indexes

## Architecture / Approach

Single migration file, no incremental patches. `flashcards` carries ts-fsrs `Card` state columns directly (due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review) — each row is a valid ts-fsrs `Card` object after a thin date conversion. `reviews` is append-only; each row is a ts-fsrs `ReviewLog`. `reviews.user_id` is denormalised for O(1) RLS without a 2-level join subquery.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. SQL Migration | 3 tables + RLS + indexes in Supabase | ts-fsrs columns wrong → breaking migration on S-05 |
| 2. TypeScript Layer | `src/types.ts` + ts-fsrs installed | Type drift from schema if columns change later |
| 3. Seed Data | Sample data on `db reset` | Seed breaks if no auth user exists (handled by DO block) |

**Prerequisites:** `npx supabase start` working (Docker required for local Supabase).
**Estimated effort:** ~1 session across 3 phases.

## Open Risks & Assumptions

- ts-fsrs v6.0 (not yet released) will drop `elapsed_days` and `last_elapsed_days` — these columns are present but deprecated; a future migration will remove them when upgrading
- `share_token` anon RLS uses capability-URL security (UUID unguessability) — acceptable for a low-security share feature; if compliance requirements change, a signed-URL pattern would be needed

## Success Criteria (Summary)

- `npx supabase db reset` applies cleanly and seeds sample data with no errors
- Supabase Studio shows all 3 tables with RLS enabled and 6 policies
- `npm run build && npm run lint` pass with ts-fsrs installed and `src/types.ts` present
