<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Cambridge Dictionary CLI Integration

- **Plan**: context/changes/cambridge-dict-cli/plan.md
- **Scope**: Phase 1 of 3 (Dictionary Scraper Service)
- **Date**: 2026-06-18
- **Verdict**: REJECTED (at review time) → all findings resolved during triage
- **Findings**: 1 critical, 2 warnings, 1 observation

## Verdicts (at review time)

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | FAIL (F1) |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | FAIL (F2, F3) |

## Findings

### F1 — Nested `el.on(...)` does not exist on Cloudflare HTMLRewriter; scraper throws at runtime

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/dictionary.ts:76,85,94,103-132 (original)
- **Detail**: Parser registered handlers via nested `el.on(".region", ...)` / `defEl.on(".dsense_pos", ...)`. The real Cloudflare `Element` interface (verified in `@cloudflare/workers-types`) has no `.on()` method — only `getAttribute`/`before`/`append`/`setInnerContent`/etc. `.on()` exists solely on `HTMLRewriter` (flat registration). The code would throw "el.on is not a function" on workerd; `any` casts + an eslint-disable block hid this from tsc, and the comment "The code is correct at runtime" was false. The plan itself prescribed this invalid approach ("plan for nested handler registration", plan.md:55).
- **Fix A ⭐ Recommended**: Rewrite using flat HTMLRewriter selectors (descendant selectors + boundary state).
  - Strength: Native-correct API path; zero npm deps (matches plan's tech choice).
  - Tradeoff: Region↔definition association across a flat event stream needs careful boundary state.
  - Confidence: HIGH — only API-correct path for HTMLRewriter on workerd.
  - Blind spot: Real Cambridge HTML nesting not validated against descendant selectors → mitigated by F2 (real-runtime tests now pass).
- **Decision**: FIXED via Fix A — rewrote parser to flat `.on()` selectors with boundary-based state; removed `any`/eslint-disable. Verified by the (now real) HTMLRewriter tests under F2.

### F2 — Tests mocked HTMLRewriter with an incompatible custom implementation

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM
- **Dimension**: Success Criteria
- **Location**: src/lib/services/dictionary.test.ts:85-119 (original)
- **Detail**: `MockHTMLRewriter`/`MockElement` implemented a fictional `.on()`-on-element API and regex-based parsing. The 8 passing tests validated the mock, not the scraper — so F1 (runtime crash) went undetected and criterion 1.2 was rubber-stamped. After F1's fix, 5/8 mock tests broke (proof the mock tested a fiction). Project had Vitest node-only; `@cloudflare/vitest-pool-workers` was not installed.
- **Fix**: Install `@cloudflare/vitest-pool-workers`, split Vitest into `node` + `workers` projects, rewrite the scraper test to run on the real HTMLRewriter (only `fetch` stubbed).
  - Strength: Tests now validate the real API/parsing — the only meaningful "tests pass" for HTMLRewriter code.
  - Tradeoff: One-time workers-pool setup; workers tests slower than pure Node mocks.
  - Confidence: HIGH — standard way to test Workers-specific APIs.
  - Blind spot: None significant (verified end-to-end).
- **Decision**: FIXED — installed `@cloudflare/vitest-pool-workers@^0.8` (vitest-3 compatible; the `0.16.x` default needed vitest 4), added two-project `vitest.config.ts`, rewrote `dictionary.test.ts`. 8/8 scraper tests pass on workerd; 44/44 node tests unaffected (52 total).

### F3 — Phase 1 marked done but `tsc --noEmit` criterion fails (exit 2); no commit SHA

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW
- **Dimension**: Success Criteria
- **Location**: plan.md:345-347 (Progress, Phase 1)
- **Detail**: Criterion 1.1 (`npx tsc --noEmit`) marked `[x]`, but project-wide tsc exits 2 (10 pre-existing errors in i18n, user-settings, generate.ts `AI_RATE_LIMIT`). Phase 1 files compile clean, so it's a criterion-wording defect, not a Phase 1 defect. Files were also uncommitted with no SHA appended despite `[x]`.
- **Fix**: Clarify 1.1 to "Phase 1 files compile (pre-existing project errors out of scope)".
- **Decision**: FIXED (criterion clarified) — updated both the Success Criteria block and the Progress checkbox in plan.md. Commit/SHA left to the user (commit only on request).

### F4 — Unknown/empty region cast to `"UK" | "US"` without validation

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/dictionary.ts (finalizeDefinition)
- **Detail**: `currentRegion.trim().toUpperCase() as "UK" | "US"` — a `.dictionary` block without `.region` yields `""` coerced to the union, a silent data lie reaching the endpoint and LLM.
- **Fix**: Validate region ∈ {UK, US}; emit `null` otherwise (widen `DictionaryEntry.dictionaryRegion` to `"UK" | "US" | null`).
- **Decision**: FIXED — widened the type in `types.ts` and emit `null` for unrecognized regions in `dictionary.ts`. Safe now (Phases 2/3 not yet built). tsc/eslint/tests green.

## Triage Summary

| Finding | Decision |
|---------|----------|
| F1 | FIXED via Fix A (flat HTMLRewriter selectors) |
| F2 | FIXED (real-workerd tests via vitest-pool-workers) |
| F3 | FIXED (criterion clarified in plan.md) |
| F4 | FIXED (nullable region, no blind `as` cast) |

Post-triage verification: `npx vitest run` → 52 passed (6 files); eslint clean on Phase 1 files; tsc clean on `dictionary.ts`/`types.ts` (project-wide pre-existing errors unchanged, out of scope).
