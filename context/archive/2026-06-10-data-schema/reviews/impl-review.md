<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Database Schema & RLS (data-scheme)

- **Plan**: context/changes/data-scheme/plan.md
- **Scope**: Full plan (Phases 1–3)
- **Date**: 2026-06-12
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Findings

### F1 — Anon policies allow bulk enumeration of share tokens

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260610000000_initial_schema.sql:107-111, 158-166
- **Detail**: RLS filters rows, not columns — anon PostgREST call `GET /rest/v1/sets?share_token=not.is.null` returns every shared set including `share_token` and `user_id`. The unguessable-token premise collapses when tokens are listable. Flaw in the plan's accepted-risk reasoning, not implementation drift. Only matters once sharing ships (S-07).
- **Fix A ⭐ Recommended**: Record as hard constraint for S-07 (plan addendum + lesson): shared reads via security-definer RPC or column-restricted view; drop broad anon policies in that migration.
  - Strength: Fix lands where the feature lands, with full context.
  - Tradeoff: Window with a misleading policy; relies on the note being honored.
  - Confidence: HIGH — nothing client-side uses the anon key for these tables today.
  - Blind spot: Another slice shipping anon-key client queries before S-07 opens the window early.
- **Fix B**: Drop the two anon SELECT policies now in a follow-up migration.
  - Strength: Removes the exposure class today.
  - Tradeoff: Deviates from reviewed plan post-completion; new migration + addendum anyway.
  - Confidence: MED.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A + ACCEPTED-AS-RULE: RLS anon policies must not expose capability tokens

### F2 — Authenticated users cannot open share links

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260610000000_initial_schema.sql:107-111
- **Detail**: Shared-select policies are `TO anon` only; a logged-in user visiting a share URL matches no policy → zero rows. "Anyone with the link" silently excludes signed-in users. Same root cause as F1.
- **Fix**: Fold into F1's resolution — S-07 constraint must state shared reads work for both anon and authenticated (RPC / security-definer view does this naturally).
- **Decision**: FIXED (folded into F1 addendum)

### F3 — Seed duplicates data on manual re-apply

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/seed.sql:18-25
- **Detail**: The header instructs re-applying the seed after creating a user (db reset wipes auth.users), but each re-application inserts a duplicate sample set + 3 cards.
- **Fix**: Guard insert with `if not exists (select 1 from public.sets where user_id = dev_user_id and name = 'Sample: Polish Basics')`.
- **Decision**: FIXED (existence guard added)

### F4 — `Set` interface shadows the global ES2015 `Set`

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: src/types.ts:6
- **Detail**: Importing `Set` from '@/types' blocks `new Set()` in the same module without aliasing. Compile-time friction (no silent bugs), but every future consumer pays the aliasing tax. Name came from the plan contract — flagging the plan itself. Zero consumers today.
- **Fix A ⭐ Recommended**: Rename to `FlashcardSet` now + plan addendum.
  - Strength: One-file change while nothing imports it.
  - Tradeoff: Deviates from literal plan contract; plan-brief.md may reference `Set`.
  - Confidence: HIGH.
  - Blind spot: plan-brief.md references.
- **Fix B**: Keep `Set`; consumers alias on import.
  - Strength: Plan contract stays literally true.
  - Tradeoff: Permanent friction.
  - Confidence: MED.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A (renamed FlashcardSet)

### F5 — Value export of State/Rating (plan said `export type`)

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/types.ts:4
- **Detail**: Deliberate, correct drift — State/Rating are runtime enums; type-only export would forbid `Rating.Good`. Related: Flashcard.state / Review.grade typed `number` instead of the enums.
- **Fix**: None required; optionally type state/grade as State/Rating.
- **Decision**: FIXED (state/grade typed as State/Rating)

### F6 — Unplanned .vscode/settings.json in Phase 1 commit

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: .vscode/settings.json (commit bff2090)
- **Detail**: VS Code terminal auto-approve entries rode along via user-chosen "stage all". Benign; auto-approving `npx supabase` is a mild local security-posture change.
- **Fix**: None required; revert the autoApprove entry if unintended.
- **Decision**: SKIPPED

### F7 — reviews append-only is implicit, not documented

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260610000000_initial_schema.sql (reviews section)
- **Detail**: No UPDATE/DELETE policies and no updated_at on reviews — coherent append-only default-deny, but undocumented; future reviewer may "fix" it. Also ON DELETE CASCADE erases review history when cards are deleted (MVP-acceptable).
- **Fix**: Add one-line SQL comment "reviews are append-only by design" in a future migration touching this area.
- **Decision**: SKIPPED
