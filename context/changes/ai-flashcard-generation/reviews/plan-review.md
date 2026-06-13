<!-- PLAN-REVIEW-REPORT -->
# Plan Review: AI Flashcard Generation

- **Plan**: `context/changes/ai-flashcard-generation/plan.md`
- **Mode**: Deep
- **Date**: 2026-06-13
- **Verdict**: REVISE
- **Findings**: 1 critical, 3 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | WARNING |
| Architectural Fitness | WARNING |
| Blind Spots | FAIL |
| Plan Completeness | WARNING |

## Grounding

- Paths: 6/7 paths exist or are planned new; `src/components/ai/` and `src/pages/generate.astro` do not yet exist but are intentionally new. ✓
- Symbols: `PROTECTED_API_ROUTES`, `createFlashcard`, `FlashcardSet`, `sonner`/`Toaster` confirmed in codebase. `KVNamespace`/`runtime.env` not used anywhere yet. ⚠️
- Brief↔plan: consistent phases, decisions, and scope. ✓
- Sub-agent verification: middleware prefix match confirmed; KV/runtime access pattern is canonical but unconfigured; no test runner in project.

## Findings

### F1 — No test runner configured, yet plan promises unit tests

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Blind Spots
- **Location**: Phase 1, Testing Strategy, Progress 1.7
- **Detail**: `package.json` scripts contain only `dev`, `build`, `preview`, `astro`, `lint`, `lint:fix`, `format`. No `vitest`, `jest`, `playwright`, or any test runner dependency exists. The plan repeatedly requires "unit tests for `ai.ts` pass" and mock endpoint tests, but there is no infrastructure to run them.
- **Fix A ⭐ Recommended**: Add Vitest in Phase 0 (or Phase 1.0) — install `vitest`, add `test` script, configure `vite.config.ts` or `vitest.config.ts` compatible with the Cloudflare/Astro Vite setup, and add a minimal happy-path test for `ai.ts`.
  - Strength: Gives the plan a real verification path; matches the existing Vite-based Astro build.
  - Tradeoff: Adds a small setup phase and a dev dependency.
  - Confidence: HIGH — Vitest is the de facto choice for Vite/Astro projects and the existing `vite` override in `package.json` makes it a natural fit.
  - Blind spot: Whether `workerd` runtime specifics need `miniflare` for KV tests — document as out-of-scope for unit tests; mock KV in service tests.
- **Fix B**: Drop automated unit-test claims and rely only on lint/build + manual QA.
  - Strength: Avoids test infrastructure work.
  - Tradeoff: Removes regression safety for the AI service, which is the riskiest part of the slice.
  - Confidence: MEDIUM — feasible, but weakens the "verify before ship" story.
  - Blind spot: None significant; this is a scope tradeoff, not a technical unknown.
- **Decision**: FIXED via Fix A — Phase 0 added with Vitest setup and `src/lib/services/ai.test.ts`.

### F2 — KV rate limiting assumes runtime access without confirming types or local-dev behavior

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Phase 1, Changes 3, 5, 6
- **Detail**: The plan correctly identifies the canonical access pattern `context.locals.runtime?.env?.AI_RATE_LIMIT`, but no Cloudflare binding or TypeScript `App.Runtime` type declaration exists in the project. The plan also says "If `kv` is null (local dev without KV binding), allow the request." That fallback is fine, but the endpoint must still compile: `context.locals.runtime` needs a type that includes `env.AI_RATE_LIMIT: KVNamespace`. Without a type declaration, `tsc` will fail.
- **Fix A ⭐ Recommended**: Add an `src/env.d.ts` (or update existing) declaring `App.Runtime` with `env: { AI_RATE_LIMIT: KVNamespace }`, and add `kv_namespaces` to `wrangler.jsonc` with a placeholder `<your-kv-namespace-id>` plus a setup command in the runbook.
  - Strength: Makes the KV access compile-time safe and deploy-time explicit.
  - Tradeoff: Adds one more file and a wrangler setup step.
  - Confidence: HIGH — this is the standard `@astrojs/cloudflare` pattern.
  - Blind spot: Exact KV namespace ID is per-environment; leave it as a placeholder and document creation command.
- **Fix B**: Remove KV rate limiting from MVP and rely on OpenRouter's own rate limits or dashboard monitoring.
  - Strength: Simpler Phase 1, no KV setup.
  - Tradeoff: Loses the per-user cost guardrail promised in the brief's key decisions.
  - Confidence: MEDIUM — acceptable only if cost exposure is low and trusted.
  - Blind spot: OpenRouter account-level limits are not a substitute for per-user abuse control.
- **Decision**: FIXED via Fix A — `wrangler.jsonc` binding + `src/env.d.ts` `App.Runtime` added to Phase 1.

### F3 — Inline editing of proposals duplicates validation logic between frontend and backend

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Lean Execution
- **Location**: Phase 3, FlashcardProposalCard; Phase 1, ai.ts output schema
- **Detail**: The plan enforces 1000-char limits in the proposal card UI and again in `flashcardContentSchema` / the bulk endpoint. If the limits diverge later, the backend may reject data the UI accepted. The plan does not state that both should import the same schema constant.
- **Fix**: Import `flashcardContentSchema` (or a derived max-length constant) from `src/lib/services/flashcards.ts` in the UI and reuse it for client-side validation. Add a note to Phase 3 to this effect.
- **Decision**: FIXED via Fix in plan — UI imports limits from `flashcardContentSchema`.

### F4 — Phase 4 "Runbook snippet" plans to edit plan.md itself

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4, Changes 4
- **Detail**: The plan lists "File: `context/changes/ai-flashcard-generation/plan.md` (this document)" as a deliverable. Editing the plan document during implementation is circular and should not be a phase deliverable. Operational commands belong in `README.md`, `docs/runbook.md`, or the change folder's `runbook.md`, not in the plan itself.
- **Fix**: Replace the runbook file target with `context/changes/ai-flashcard-generation/runbook.md` (new file) and move the `wrangler secret put` commands there. Remove this item from phase deliverables or make it a documentation task.
- **Decision**: FIXED via Fix in plan — runbook moved to `context/changes/ai-flashcard-generation/runbook.md`.

### F5 — Default model named in plan may not be available on OpenRouter

- **Severity**: ⚠️ OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1, AI service module; Performance Considerations
- **Detail**: The plan uses `google/gemini-flash-1.5` as the default model. OpenRouter model IDs change and availability/cost vary. The plan does not specify how to verify the model ID or what the fallback behavior is if the env override points to an invalid model. This is an assumption, not a confirmed fact.
- **Fix**: Add a verification step to Phase 1 manual criteria: confirm the default model ID exists and returns a valid response on OpenRouter before marking the phase done. Optionally document a fallback constant or two.
- **Decision**: FIXED via Fix in plan — default model verification added to Phase 1 manual criteria.

## Triage Summary

- **Fixed**: F1 (Fix A), F2 (Fix A), F3 (Fix in plan), F4 (Fix in plan), F5 (Fix in plan)   (5)
- **Skipped**: —
- **Accepted**: —
- **Dismissed**: —

## Updated Verdict

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | PASS |

**Overall: SOUND** — all findings addressed; plan is ready for implementation.
