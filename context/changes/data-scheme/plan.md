# Database Schema & RLS Implementation Plan

## Overview

Create the foundational Supabase PostgreSQL schema for 10xCards: three tables (`sets`, `flashcards`, `reviews`) with Row Level Security policies isolating data per user, ts-fsrs v5-compatible columns for spaced-repetition state, TypeScript entity types, and a development seed. This is F-01 — it unblocks every other roadmap slice.

## Current State Analysis

- `supabase/migrations/` does not exist; this change creates it from scratch
- `supabase/config.toml` is fully configured (PostgreSQL 17, `migrations.enabled = true`, `seed.sql` loading enabled)
- Supabase client (`src/lib/supabase.ts`) uses `@supabase/ssr` with cookie-based sessions — already wired; schema builds on top of it
- Auth is fully in place (`src/middleware.ts`, `auth.users` managed by Supabase); RLS policies reference `auth.uid()`
- `src/types.ts` does not exist — entity types start from scratch
- ts-fsrs not installed; v5.x (FSRS v6 algorithm) requires `learning_steps` on both Card and ReviewLog

### Key Discoveries

- `supabase/migrations/` is created implicitly when the first `.sql` file is placed there — git tracks files, not directories
- ts-fsrs v5.3.2 adds `learning_steps INTEGER` to both the `Card` interface (on the flashcard row) and the `ReviewLog` interface (on each review row); omitting it from either table causes silent deserialization errors in the SR engine
- `createEmptyCard()` initialises a card with `state = 0 (New)`, `due = NOW()`, all numeric fields to 0, `last_review = null` — the column defaults below replicate this so every newly inserted flashcard is immediately a valid ts-fsrs card
- PostgreSQL `UNIQUE` allows multiple `NULL` values, so `share_token UUID UNIQUE DEFAULT NULL` is the correct declaration for an opt-in share token with collision protection when set

## Desired End State

Three tables exist in the local Supabase PostgreSQL instance (and in production via migration), each with RLS enabled and per-operation policies. Any authenticated user can fully manage their own sets and flashcards, can read and append their own review history, and cannot access another user's data. Anonymous users can read sets and flashcards reachable by a non-null `share_token`. TypeScript entity types for `Set`, `Flashcard`, and `Review` are importable from `@/types`. ts-fsrs v5 is installed. Running `npx supabase db reset` on a fresh local instance produces a clean schema plus sample data.

## What We're NOT Doing

- Building API endpoints — those belong to S-01 / S-02 / S-03
- Creating the Supabase admin (service-role) client for share-link reads — that belongs to S-07
- Adding full-text search indexes — not required for MVP
- Installing a CSV parser — belongs to S-04
- Writing any React/Astro UI components
- Writing any data-access service layer — belongs to individual feature slices

## Implementation Approach

A single initial migration file covers the complete schema. TypeScript types mirror the DB schema column-for-column with no transformation layer; `State` and `Rating` enums are re-exported from ts-fsrs so feature slices import from one place. The seed uses a dynamic `DO $$ ... $$` block to avoid hardcoding a dev user UUID.

## Critical Implementation Details

**ts-fsrs `learning_steps`**: This column was introduced in ts-fsrs v5 and must appear on **both** `flashcards` (as a Card field) and `reviews` (as a ReviewLog field). Missing it from `reviews` causes ts-fsrs to throw when reconstructing the full review history for its optimizer. Set `DEFAULT 0` on both — matches the library's `createEmptyCard()` initial value.

**Anon RLS intent**: The anon SELECT policies use `share_token IS NOT NULL` as their predicate, not a token match. This is the correct design for capability-URL access control: UUID unguessability is the security mechanism; the server-side Astro route then filters by `WHERE share_token = :token`. The RLS only gates which role can query which rows — the server does the actual token check in the query.

Accepted risk: anon role can query all rows where `share_token IS NOT NULL`. For MVP, public sharing is supported only via server-side token-filtered routes; direct client-side anon queries are explicitly unsupported.

**`user_id` on `reviews`**: `reviews.user_id` is a denormalised FK to `auth.users`. Keep `SELECT` policy as a single equality check (`user_id = auth.uid()`), but enforce ownership on `INSERT` with an additional `WITH CHECK` that `flashcard_id` belongs to a set owned by `auth.uid()`. Populate `user_id` from `auth.uid()` at insert time.

---

## Phase 1: SQL Migration

### Overview

Create `supabase/migrations/20260610000000_initial_schema.sql` with all three tables, an `updated_at` trigger, indexes, and RLS policies. This is the sole artifact that needs to exist for downstream slices to proceed.

### Changes Required

#### 1. Initial Schema Migration

**File**: `supabase/migrations/20260610000000_initial_schema.sql`

**Intent**: Define the complete initial schema — tables, constraints, triggers, indexes, and RLS — in a single migration that `supabase db reset` applies cleanly on any dev machine and that `wrangler deploy` + Supabase migration will apply in production.

**Contract**: The migration must produce the following tables with the exact columns listed. Downstream slices depend on these names and types.

`sets`:
```
id             UUID         PRIMARY KEY DEFAULT gen_random_uuid()
user_id        UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
name           TEXT         NOT NULL
share_token    UUID         DEFAULT NULL  -- UNIQUE; NULL = not shared
last_opened_at TIMESTAMPTZ
created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
```

`flashcards`:
```
id             UUID             PRIMARY KEY DEFAULT gen_random_uuid()
set_id         UUID             NOT NULL REFERENCES sets(id) ON DELETE CASCADE
front          TEXT             NOT NULL
back           TEXT             NOT NULL
-- ts-fsrs Card fields (v5 / FSRS v6)
due            TIMESTAMPTZ      NOT NULL DEFAULT NOW()
stability      DOUBLE PRECISION NOT NULL DEFAULT 0
difficulty     DOUBLE PRECISION NOT NULL DEFAULT 0
elapsed_days   INTEGER          NOT NULL DEFAULT 0
scheduled_days INTEGER          NOT NULL DEFAULT 0
learning_steps INTEGER          NOT NULL DEFAULT 0  -- ts-fsrs v5 addition
reps           INTEGER          NOT NULL DEFAULT 0
lapses         INTEGER          NOT NULL DEFAULT 0
state          SMALLINT         NOT NULL DEFAULT 0  -- 0=New 1=Learning 2=Review 3=Relearning
last_review    TIMESTAMPTZ                           -- nullable; NULL for State.New cards
created_at     TIMESTAMPTZ      NOT NULL DEFAULT NOW()
updated_at     TIMESTAMPTZ      NOT NULL DEFAULT NOW()
```

`reviews` (append-only):
```
id                UUID             PRIMARY KEY DEFAULT gen_random_uuid()
flashcard_id      UUID             NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE
user_id           UUID             NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
-- ts-fsrs ReviewLog fields (v5 / FSRS v6)
grade             SMALLINT         NOT NULL  -- 1=Again 2=Hard 3=Good 4=Easy
state             SMALLINT         NOT NULL  -- card State at review time
due               TIMESTAMPTZ      NOT NULL  -- when card was due before this review
stability         DOUBLE PRECISION NOT NULL
difficulty        DOUBLE PRECISION NOT NULL
elapsed_days      INTEGER          NOT NULL DEFAULT 0
last_elapsed_days INTEGER          NOT NULL DEFAULT 0
scheduled_days    INTEGER          NOT NULL
learning_steps    INTEGER          NOT NULL DEFAULT 0  -- ts-fsrs v5 addition
review            TIMESTAMPTZ      NOT NULL  -- exact timestamp of this review
created_at        TIMESTAMPTZ      NOT NULL DEFAULT NOW()
```

Indexes to create:
- `sets(user_id)`
- `sets(share_token) UNIQUE` — allows multiple NULLs, enforces uniqueness when non-null
- `flashcards(set_id)`
- `reviews(flashcard_id)`
- `reviews(user_id)`
- `reviews(flashcard_id, review)` — supports stats queries (last review per card, count per day)

`updated_at` trigger: a `handle_updated_at()` PL/pgSQL function that sets `NEW.updated_at = NOW()`, applied `BEFORE UPDATE` on `sets` and `flashcards`.

RLS: Enable on all three tables. Per-operation policies:

| Table | Role | Operation | Predicate |
|---|---|---|---|
| sets | authenticated | SELECT / UPDATE / DELETE | `user_id = auth.uid()` |
| sets | authenticated | INSERT | `user_id = auth.uid()` |
| sets | anon | SELECT | `share_token IS NOT NULL` |
| flashcards | authenticated | SELECT / INSERT / UPDATE / DELETE | `set_id IN (SELECT id FROM sets WHERE user_id = auth.uid())` |
| flashcards | anon | SELECT | `set_id IN (SELECT id FROM sets WHERE share_token IS NOT NULL)` |
| reviews | authenticated | SELECT | `user_id = auth.uid()` |
| reviews | authenticated | INSERT | `user_id = auth.uid() AND EXISTS (SELECT 1 FROM flashcards f JOIN sets s ON s.id = f.set_id WHERE f.id = reviews.flashcard_id AND s.user_id = auth.uid())` |

### Success Criteria

#### Automated Verification

- Migration applies cleanly: `npx supabase db reset` exits 0 with no errors
- Build passes (no TS errors from schema-adjacent code): `npm run build`

#### Manual Verification

- Supabase Studio (http://localhost:54323) shows `sets`, `flashcards`, `reviews` with correct column names and types
- RLS is marked as Enabled on all three tables in Studio → Table Editor
- All six policies are visible under Authentication → Policies

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation that Studio shows the tables, columns, and RLS policies before proceeding to Phase 2.

---

## Phase 2: TypeScript Layer

### Overview

Install ts-fsrs v5 and create `src/types.ts` with TypeScript entity interfaces that mirror the migration schema exactly. Feature slices import types from here rather than deriving them independently.

### Changes Required

#### 1. Install ts-fsrs

**File**: `package.json` (via `npm install ts-fsrs`)

**Intent**: Add ts-fsrs as a production dependency so the SR algorithm is available for S-05 and entity types for `State`/`Rating` enums are importable from `src/types.ts` without duplication.

**Contract**: `ts-fsrs` appears in `dependencies` at `^5.x.x`.

#### 2. Entity Types

**File**: `src/types.ts` (new file)

**Intent**: Declare TypeScript interfaces for `Set`, `Flashcard`, and `Review` that match the migration schema column-for-column, and re-export `State` and `Rating` from ts-fsrs. This is the single source of truth for entity shape across all feature slices.

**Contract**: The file exports the following named types and re-exports:

```typescript
export type { State, Rating } from 'ts-fsrs'

export interface Set {
  id: string
  user_id: string
  name: string
  share_token: string | null
  last_opened_at: string | null
  created_at: string
  updated_at: string
}

export interface Flashcard {
  id: string
  set_id: string
  front: string
  back: string
  due: string
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  learning_steps: number
  reps: number
  lapses: number
  state: number   // State enum value
  last_review: string | null
  created_at: string
  updated_at: string
}

export interface Review {
  id: string
  flashcard_id: string
  user_id: string
  grade: number          // Rating enum value
  state: number
  due: string
  stability: number
  difficulty: number
  elapsed_days: number
  last_elapsed_days: number
  scheduled_days: number
  learning_steps: number
  review: string
  created_at: string
}
```

Note: Supabase JS client returns date columns as ISO 8601 strings; types use `string` not `Date` for all timestamp columns.

### Success Criteria

#### Automated Verification

- Dependencies install without conflicts: `npm install` exits 0
- Build passes with new types: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification

- `import { State, Rating } from '@/types'` resolves correctly in a scratch `.ts` file
- `ts-fsrs` is listed in `node_modules` and importable

**Implementation Note**: Pause after automated checks pass for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Seed Data

### Overview

Create `supabase/seed.sql` so that `npx supabase db reset` leaves the local dev database with one sample set and three flashcards, making the UI immediately browsable without manual data entry.

### Changes Required

#### 1. Seed File

**File**: `supabase/seed.sql` (new file)

**Intent**: Insert one named set and three flashcards for the first authenticated user found in `auth.users`. The insert is wrapped in a `DO $$ ... $$` block to avoid hardcoding a user UUID that would differ across dev machines.

**Contract**: The block:
1. Selects `id` from `auth.users LIMIT 1` into a variable; if no user exists, exits silently
2. Inserts one row into `sets` with `name = 'Sample: Polish Basics'`
3. Inserts three rows into `flashcards` for that set with `front`/`back` pairs; all ts-fsrs columns use their `DEFAULT` values (State.New, due = NOW(), all numeric = 0)

### Success Criteria

#### Manual Verification

- After `npx supabase db reset`: Supabase Studio shows 1 row in `sets` and 3 rows in `flashcards`
- Seed is idempotent with `db reset`: running reset a second time produces exactly 1 set and 3 flashcards (reset truncates before seeding)

---

## Testing Strategy

### Automated

- `npx supabase db reset` — primary migration correctness check
- `npm run build` — catches TypeScript type errors at every phase
- `npm run lint` — catches import errors after ts-fsrs install

### Manual Testing Steps

1. Run `npx supabase start` then `npx supabase db reset`
2. Open Supabase Studio at http://localhost:54323 → Table Editor; confirm `sets`, `flashcards`, `reviews` exist with correct columns
3. Check Authentication → Policies: six policies across three tables
4. Check Table Editor → `sets`: 1 sample row; `flashcards`: 3 sample rows
5. In Studio SQL editor, run: `SELECT * FROM sets; SELECT * FROM flashcards; SELECT * FROM reviews;` — confirms RLS is not blocking the Studio admin view
6. Optionally: sign up a test user via http://localhost:4321/auth/signup and insert a set via Studio under that user's UUID; confirm another user's JWT cannot SELECT it

## Migration Notes

This is the initial migration — no existing data to handle. For future schema changes, create a new timestamped file in `supabase/migrations/`; never edit the initial migration after it has been applied to any shared environment.

## References

- Roadmap F-01: `context/foundation/roadmap.md` — lines 64-75
- ts-fsrs Card interface: [open-spaced-repetition/ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs)
- Supabase RLS docs: https://supabase.com/docs/guides/database/postgres/row-level-security
- CLAUDE.md conventions: `supabase/migrations/` naming, RLS per-operation requirement

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: SQL Migration

#### Automated

- [x] 1.1 Migration applies cleanly: `npx supabase db reset` exits 0
- [x] 1.2 Build passes: `npm run build`

#### Manual

- [x] 1.3 Supabase Studio shows `sets`, `flashcards`, `reviews` with correct columns and types
- [x] 1.4 RLS enabled on all three tables; six policies visible in Studio

### Phase 2: TypeScript Layer

#### Automated

- [ ] 2.1 Dependencies install: `npm install` exits 0
- [ ] 2.2 Build passes: `npm run build`
- [ ] 2.3 Lint passes: `npm run lint`

#### Manual

- [ ] 2.4 `State` and `Rating` importable from `@/types`; ts-fsrs in node_modules

### Phase 3: Seed Data

#### Manual

- [ ] 3.1 After `npx supabase db reset`: Studio shows 1 set + 3 flashcards
