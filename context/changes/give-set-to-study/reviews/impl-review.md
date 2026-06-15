<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Give Set to Study

- **Plan**: context/changes/give-set-to-study/plan.md
- **Scope**: All phases (1–4)
- **Date**: 2026-06-15
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 5 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — claim.ts: rows[0] unguarded — potential undefined dereference

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/share/claim.ts:51–53
- **Detail**: RPC result cast to ClaimRow[] and rows[0] accessed directly without length check. If the RPC returns an empty array (future regression), row is undefined and row.cloned_set_id throws a runtime 500.
- **Fix**: Guard with `if (!row) → 500 response`.
- **Decision**: FIXED — 68b01f0

### F2 — [token].astro: owner reaches "Clone to my sets" UI

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/share/[token].astro:34–48
- **Detail**: Server-side check queries set_shares but never checks whether user.id matches the set owner. Teacher sees "Clone to my sets", gets a toast error from the RPC. The plan listed self-clone as a guardrail.
- **Fix A ⭐ Recommended**: Return owner_id from get_shared_set_info RPC; check server-side in [token].astro.
  - Strength: Eliminates round-trip; consistent with plan guardrail.
  - Tradeoff: Migration change required.
  - Confidence: HIGH — RPC already queries sets table.
  - Blind spot: Need "already_owner" state in SharePageContent.
- **Fix B**: Second query for owner_id in Astro page (no migration).
  - Strength: No SQL change.
  - Tradeoff: Extra DB round-trip per page load.
  - Confidence: MED — tech debt.
  - Blind spot: None significant.
- **Decision**: FIXED — 68b01f0

### F3 — activateShareToken: TOCTOU race on token generation

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/sets.ts:133–147
- **Detail**: Read-then-write: reads share_token, if null generates UUID and writes it. Concurrent requests can both read null and each write a different UUID — silently changing the share link.
- **Fix A ⭐ Recommended**: Collapse to atomic `UPDATE … WHERE share_token IS NULL`, re-fetch if no row updated.
  - Strength: Eliminates race in one query; no migration needed.
  - Tradeoff: Slightly more complex service logic.
  - Confidence: HIGH — standard Postgres pattern.
  - Blind spot: None significant.
- **Fix B**: SECURITY DEFINER RPC with INSERT … ON CONFLICT DO NOTHING.
  - Strength: Fully atomic at DB level.
  - Tradeoff: Requires new migration.
  - Confidence: MED — overkill for low-frequency operation.
  - Blind spot: Migration deploy lag.
- **Decision**: FIXED — 68b01f0

### F4 — session_log(set_id) missing index for donated-sets JOIN

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality / Performance
- **Location**: supabase/migrations/20260614200000_give_set_to_study.sql:185–190
- **Detail**: get_donated_sets_for_teacher LEFT JOINs session_log ON set_id. No index on session_log(set_id) — sequential scan as table grows with every review session.
- **Fix**: Add `create index session_log_set_id_idx on public.session_log(set_id)` in a follow-up migration.
- **Decision**: FIXED — 68b01f0

### F5 — [token].astro: HTTP 200 returned when share token not found

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/share/[token].astro:58–69
- **Detail**: When get_shared_set_info returns 0 rows, page renders "Link is invalid" but returns HTTP 200. Astro.response.status = 404 only set for !token || !supabase, not for the notFound case.
- **Fix**: Add `Astro.response.status = 404` in the notFound branch.
- **Decision**: FIXED — 68b01f0

### F6 — /api/share not in PROTECTED_API_ROUTES

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/middleware.ts
- **Detail**: /api/sets, /api/flashcards, /api/reviews are in PROTECTED_API_ROUTES. /api/share is not — future endpoints under this path could accidentally skip auth.
- **Fix**: Add `"/api/share"` to PROTECTED_API_ROUTES in middleware.ts.
- **Decision**: FIXED — 68b01f0

### F7 — getDonatedSets: unused _userId parameter

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/sets.ts:151
- **Detail**: getDonatedSets(client, _userId) keeps userId prefixed with _ (never used — RPC uses auth.uid()). All other service functions actively use userId.
- **Fix**: Remove _userId parameter and update call-site in dashboard.astro.
- **Decision**: FIXED — 68b01f0

### F8 — claim.ts: 'Not authenticated' RPC error maps to HTTP 400

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/share/claim.ts:43–47
- **Detail**: Error mapper: "Share token not found" → 404, else → 400. The RPC can raise 'Not authenticated', which would return 400 instead of 401 (unreachable in practice but misleading).
- **Fix**: Add check for "Not authenticated" → 401.
- **Decision**: FIXED — 68b01f0
