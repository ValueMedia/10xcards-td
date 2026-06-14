<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Learning Stats Dashboard

- **Plan**: context/changes/s-06-learning-stats/plan.md
- **Scope**: All phases (1–3)
- **Date**: 2026-06-14
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical · 2 warnings · 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Automated Verification
- lint: ✅ PASS
- build: ✅ PASS

## Findings

### F1 — Unbounded flashcard count queries

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/stats.ts:85-88
- **Detail**: Two flashcard queries (total and learned) fetched every row for up to 3 recent sets with no LIMIT. A set with 5000 cards would transfer all rows just to count them.
- **Fix A ⭐ Recommended**: Add `.limit(2000)` to both queries — pragmatic MVP cap.
  - Strength: One-line change; bounds memory and network cost.
  - Tradeoff: Counts silently truncate above 2000 cards per set.
  - Confidence: HIGH — MVP decks rarely exceed hundreds of cards.
  - Blind spot: No user-visible warning when truncated.
- **Fix B**: Move to Supabase RPC returning COUNT per set — correct at any scale but requires new migration.
- **Decision**: FIXED via Fix A

### F2 — Fire-and-forget session POST is silently best-effort

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/review/ReviewSession.tsx:92
- **Detail**: `void fetch("/api/sessions", ...)` — errors swallowed completely. Session loss on network error is invisible to the user and undocumented as intentional.
- **Fix**: Add comment `// best-effort: session loss on network error is acceptable` above void fetch.
- **Decision**: FIXED via Fix

### F3 — Duplicate GRANT in migration 0002

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260614000002_session_log_grants.sql
- **Detail**: GRANT in 0001 is identical to the entire content of 0002. 0002 was a hotfix for `migration up --include-all` skipping the grant on first local apply. Idempotent in SQL but confusing.
- **Fix**: Add comment explaining why 0002 exists.
- **Decision**: FIXED via Fix

### F4 — No DB-level CHECK constraint on session duration

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260614000001_session_log.sql
- **Detail**: API validates `endedAt > startedAt` (400), but DB has no `CHECK (ended_at > started_at)`. Direct DB writes or future services bypassing the API could insert invalid rows.
- **Fix**: New migration `20260614000003_session_log_duration_check.sql` with `ALTER TABLE ADD CONSTRAINT session_log_valid_duration CHECK (ended_at > started_at)`.
- **Decision**: FIXED via Fix

### F5 — No set ownership check when logging sessions

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/sessions/index.ts
- **Detail**: Endpoint accepts any setId without verifying the set belongs to the authenticated user. An authenticated user can log sessions against any set. Risk: stats pollution only, no data leak. Previously accepted as F3 in plan-review.
- **Fix**: Add ownership check: query sets where id=setId AND user_id=user.id; return 403 if not found.
- **Decision**: SKIPPED (accepted MVP risk)
