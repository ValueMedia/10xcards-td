# External Integration Failure Paths (Risks #5 & #6) — Plan Brief

> Full plan: `context/changes/testing-external-integrations/plan.md`
> Research: `context/changes/testing-external-integrations/research.md`

## What & Why

Phase 3 of the test-plan rollout: prove the AI-generation (#5) and Cambridge-
Dictionary (#6) boundaries fail *cleanly* — provider failure, timeout, or
malformed/unavailable output must surface as a typed error with zero silent data
loss, and the `ai-rate-limit` gate must hold. Research showed both risks have a
real defect behind them, so the phase also lands two contained fixes rather than
just documenting the gaps.

## Starting Point

The generate route (`generate.ts`) returns proposals only — it never saves (save
is a separate, already-tested atomic batch endpoint), so "no partial save" is
structural. Provider-boundary failures are already unit-tested in `ai.test.ts`.
But: the generate **route** and `ai-rate-limit.ts` have **no tests**; the `<10s`
NFR is violated (40s timeout, `ai.ts:10`); and `lookupWord` **silently returns
`[]` on a non-200 upstream** (no `response.ok` check), making "dictionary down"
indistinguishable from "unknown word".

## Desired End State

`npm test` (node + workers) is green with four new/extended test files.
`lookupWord` throws on non-200 (endpoint → clean 502), the AI generation deadline
is `≤10s`, the test-plan Phase 3 row reads `complete`, cookbook §6.4 is filled,
and two lessons are recorded.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| `<10s` NFR (code has 40s) | Fix now + green test | Actually satisfies the NFR instead of deferring | Plan |
| Dictionary silent-blank on non-200 | Fix now (`response.ok` throw) + green test | Small, contained fix that achieves Risk #6's "clean error" goal | Plan |
| Generate-route test location | `node` project, module-mocked | Cheapest, mirrors `dict/[word].test.ts`; RLS is Phase 1's job | Plan |
| ai-rate-limit coverage | Dedicated unit test with fake KV | "The gate holds" is a named Risk #5 concern; catches the fail-closed trap | Plan |
| Scope | All four targets in | User selected all in scope | Plan |
| No oracle assertions | Assert `error.kind`/status, not card contents or wall-clock | Research §oracle-problem guardrail | Research |

## Scope

**In scope:** dictionary `response.ok` fix + service failure tests; AI timeout
fix + contract test; generate-route orchestration test; ai-rate-limit unit test;
docs/status wrap-up.

**Out of scope:** provider/dictionary uptime; re-testing existing happy-path or
endpoint-502 cases; parser card-content assertions; MSW; the batch save endpoint
(Phase 2); CI enforcement (Phase 5 of the rollout); tool-loop timeout redesign.

## Architecture / Approach

Tests placed by seam: **dictionary scraper** failures in the **workers** project
(real `HTMLRewriter`, `vi.stubGlobal("fetch")`); **generate route** + **rate-limit
gate** in the **node** project (module-mocks + fake KV). Two production fixes ship
with the tests that prove them. Each phase = one commit (Phase 2 rollout style).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Dictionary failure path (#6) | `response.ok` throw + fetch-reject/non-200 tests | Redirect short-circuit must stay ahead of the new throw |
| 2. AI timeout NFR (#5) | Deadline `≤10s` + contract/behavior test | 10s budget may abort heavy multi-lookup generations |
| 3. Generate-route orchestration (#5) | node test: error→status, guards, 429, zero-save | node project must alias `astro:env/server`; mock `checkRateLimit` (fail-closed) |
| 4. ai-rate-limit unit test (#5) | Fake-KV boundary/fail-closed/key-TTL tests | Fake KV must mirror real get/put contract |
| 5. Rollout wrap-up | Cookbook §6.4, lessons, status → complete | Keep docs accurate to what shipped |

**Prerequisites:** none beyond the existing Vitest setup (`npm test`); no Supabase needed (route test is node-project module-mocked).
**Estimated effort:** ~1-2 sessions across 5 small phases (2 one-line prod fixes + 3 test files + docs).

## Open Risks & Assumptions

- 10s whole-request deadline is shared across the up-to-8-turn tool loop; heavy multi-lookup generations that took 10–40s will now abort with a clean 504 (accepted tradeoff).
- Assumes Cambridge uses 302→200-at-base for unknown words (so `response.ok` throw won't fire on them) — confirmed by existing redirect test.
- Partial-mock of `@/lib/services/ai` must keep the REAL `getAiErrorHttpStatus` mapping, else the route test loses its teeth.

## Success Criteria (Summary)

- A dictionary-down (non-200) surfaces as a clean 502, not a silent empty result; unknown words still return `200 {entries:[]}`.
- Every AI failure kind maps to the correct HTTP status, the 429 gate holds, and no `flashcards` are ever emitted on failure.
- `npm test` is green including the new dictionary, generate-route, timeout, and rate-limit tests.
