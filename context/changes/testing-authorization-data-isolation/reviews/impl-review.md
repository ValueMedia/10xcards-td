<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Authorization & Data-Isolation Test Rollout

- **Plan**: context/changes/testing-authorization-data-isolation/plan.md
- **Scope**: Full plan (Phases 1–4 of 4)
- **Date**: 2026-07-07
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

Success-criteria evidence (this session): `npx supabase migration up --local` clean; `npm run test:integration` 21/21; `npm test` (node+workers) 64/64; `npm run build` OK; manual 4.5 (anon SSR share page) and 4.6 (authenticated claim post-migration) driven and passing.

## Findings

### F1 — Two unplanned production changes breach the "no product code changes" guardrail

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: src/lib/services/reviews.ts (resetSetProgress), src/lib/services/sets.ts (renameSet) — commit c5af5ef (Phase 2)
- **Detail**: Phase 2's overview says "no product code changes" and the plan's "What We're NOT Doing" states the only production change is the /api/sessions ownership check + anon-grant revoke. But Phase 2 shipped two error-mapping fixes: renameSet switched .single()→.maybeSingle() (+ "Set not found") so a non-owner PATCH yields 404 not a PGRST116 500; resetSetProgress regex-matches the DEFINER guard message and returns notFound instead of dbError. Both are correct, low-risk, and required for Phase 2's own 404 assertions; the plan under-scoped Phase 2. Disclosed in the c5af5ef commit message as "Product fixes" — a plan-documentation gap, not hidden drift.
- **Fix**: Add a short addendum to plan.md Phase 2 (or "What We're NOT Doing") recording that renameSet + resetSetProgress error-mapping were corrected to make the planned 404s real, so the plan matches what shipped.
- **Decision**: FIXED — addendum added to plan.md "What We're NOT Doing" (2026-07-07).

### F2 — Integration suite can pass by silently skipping when it is meant to run

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: tests/integration/helpers/env.ts:37-54
- **Detail**: hasSupabaseEnv comes from a 2s reachability probe; every suite gates on describe.skipIf(!hasSupabaseEnv). If Supabase is down/misconfigured the whole IDOR/share suite skips and reports green with no sentinel. By design for now — the plan defers CI/quality-gate wiring to test-plan §3 Phase 5 — so a forward note, not a defect in this change.
- **Fix**: When Phase 5 wires the CI gate, make the integration job assert hasSupabaseEnv === true (or add one non-skipped guard test that fails if env is absent) so "0 run, all skipped" cannot masquerade as success.
- **Decision**: SKIPPED (deferred to test-plan §3 Phase 5) — queued in follow-ups/review-fixes.md.

### F3 — Flashcard/INVOKER-review IDOR tests are also guarded by RLS, so they don't isolate the service gate

- **Severity**: 🔷 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency (test integrity)
- **Location**: tests/integration/authorization/flashcards.idor.test.ts, reviews.idor.test.ts
- **Detail**: For flashcards and the INVOKER review path, RLS alone already blocks the cross-user write, so these tests would still pass (404 + unchanged row) even if the explicit service-layer ownership check were deleted. Good behavioral/regression guards, but they don't prove the service gate specifically. (sessions.idor.test.ts correctly targets the genuinely RLS-uncatchable gap.)
- **Fix**: Optional — add a one-line comment in each noting RLS is the primary enforcer there.
- **Decision**: FIXED — clarifying comments added to flashcards.idor.test.ts and reviews.idor.test.ts (INVOKER path).

### F4 — logSession omits the `client: SupabaseClient | null` guard its siblings share

- **Severity**: 🔷 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/stats.ts:20-26
- **Detail**: Every sibling (createFlashcard, updateFlashcard, submitCardReview, resetSetProgress) takes `client: SupabaseClient | null` and opens with an `if (!client) return { kind: "clientUnavailable" }` guard. logSession takes a non-null client and omits it. Safe today because sessions/index.ts rejects !supabase with 401 before calling — purely a consistency gap.
- **Fix**: Optional — widen the param to `| null` and add the clientUnavailable guard to match siblings.
- **Decision**: FIXED — logSession now takes `SupabaseClient | null` with a clientUnavailable guard (stats.ts:20-27).
