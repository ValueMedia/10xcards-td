<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: External Integration Failure Paths (#5 & #6)

- **Plan**: context/changes/testing-external-integrations/plan.md
- **Scope**: All 5 phases
- **Date**: 2026-07-09
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Automated criteria re-verified during review: `npm test` = 85/85 green (node + workers); `npm run build` completes (Astro type-check clean; the CSS "flex" warning is pre-existing and unrelated). All Manual Progress rows checked with diff-backed evidence.

## Findings

### F1 — 10s deadline bounds the whole tool loop, including uncancelled scrapes

- **Severity**: 🟢 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/ai.ts:209
- **Detail**: The single AbortController is created once before the up-to-8-turn tool loop, so 10s now bounds the entire conversation (turns + up to 20 parallel live dictionary scrapes per turn). Those scrapes' own fetch (dictionary.ts:28) is not wired to controller.signal, so tool-heavy generations hit the 10s ceiling more often than at 40s. Intended NFR tightening, explicitly accepted in plan §Performance Considerations — not a bug.
- **Fix**: None required — accepted tradeoff, already documented in the plan.
- **Decision**: ACCEPTED — accepted tradeoff already documented in plan §Performance Considerations.

### F2 — Dictionary non-200 test asserts only that it throws, not the useful message

- **Severity**: 🟢 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/lib/services/dictionary.test.ts:62
- **Detail**: The non-200 case asserted `.rejects.toThrow()` only. The value of the fix is a distinguishable error (message carries the status), so asserting the message locks that property in against a future regression that throws a generic/empty error.
- **Fix**: Tighten to `.rejects.toThrow(/status 503/)` on the non-200 case.
- **Decision**: FIXED — assertion tightened to `.rejects.toThrow(/status 503/)`; `npm test` re-run 85/85 green.

### F3 — getHourlyLimit env-override / NaN-fallback branch untested

- **Severity**: 🟢 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/lib/services/ai-rate-limit.ts:3
- **Detail**: The unit test covers the default-10 path but not the AI_RATE_LIMIT_HOURLY env override nor its Number.isNaN fallback. The branch reads env at load time, so exercising it needs a module reset (vi.resetModules + stubbed env). The plan only committed to "getHourlyLimit default 10", which is covered.
- **Fix**: Optional — add a module-reset case if env-configurable limits become load-bearing later.
- **Decision**: SKIPPED — out of plan scope; low value while limits are not env-configured in practice.
