---
date: 2026-07-08T21:34:44+0200
researcher: value-media
git_commit: 0d51752c57e239dcabfe769081bb8b860889afd3
branch: main
repository: 10xcards
topic: "External integration failure paths — AI generation (#5) & Cambridge Dictionary (#6)"
tags: [research, codebase, testing, ai-generation, dictionary, openrouter, ai-rate-limit, contract-test]
status: complete
last_updated: 2026-07-08
last_updated_by: value-media
---

# Research: External integration failure paths (Risks #5 & #6)

**Date**: 2026-07-08T21:34:44+0200
**Researcher**: value-media
**Git Commit**: 0d51752c57e239dcabfe769081bb8b860889afd3
**Branch**: main
**Repository**: 10xcards

## Research Question

Phase 3 of `context/foundation/test-plan.md` ("External integration failure
paths"). Ground in the codebase where AI-generation and Cambridge-Dictionary
failures actually live, so we can write **failure-path** tests that:

- **#5 (AI):** prove failure/timeout/malformed output yields a clean UI error,
  ZERO partial save, respects the <10s NFR, and the `ai-rate-limit` gate holds —
  without testing provider uptime or falling into the oracle problem on parser output.
- **#6 (Dictionary):** prove the dictionary error path (down / format change)
  yields a clean error and no crash — covering the error path, NOT a duplicate
  of the already-covered happy path.

## Summary

The research produced several findings that **reshape the test scope** versus the
plan's phrasing. Read these first — they change what is worth testing.

1. **Risk #5's "ZERO partial save" is guaranteed by construction, not by careful
   error handling.** The generate route (`POST /api/sets/[id]/generate`) **never
   saves anything** — it only returns flashcard *proposals*. Persistence is a
   separate, user-initiated call to the batch endpoint
   (`POST /api/sets/[id]/flashcards/batch`), which is atomic and already tested in
   Phase 2. A failed/malformed/timed-out generation returns a typed error
   (422/502/504) with zero proposals and writes nothing. So the test for
   "no partial save" is really: **prove the failure branches return an error and
   an empty proposal list, and that nothing reaches the (separate) save path.**

2. **The <10s NFR is currently VIOLATED in code.** The provider timeout is
   `REQUEST_TIMEOUT_MS = 40_000` (`src/lib/services/ai.ts:10`) — 4× the NFR.
   We cannot "prove <10s" because the code does not meet <10s. This is a **decision
   point for planning** (see Open Questions): assert the *actual* contract (~40s,
   clean 504 on abort) and flag the NFR miss, or write a deliberately-red test
   documenting the gap.

3. **Risk #5's provider-boundary failure branches are already unit-tested.**
   `src/lib/services/ai.test.ts` already covers `apiError` (non-ok), `timeout`
   (AbortError), `unconfigured`, `parseError`, `noProposals`, and the parse
   contract. The genuine gap is the **generate-route orchestration layer**
   (auth → ownership → validation → rate-limit → error→status mapping → 200 shape),
   which has **no test at all**, plus `ai-rate-limit.ts` which is **untested**.

4. **Risk #6's endpoint 502 path is already tested; the real gap is the service
   layer.** `src/pages/api/dict/[word].test.ts:78-83` already asserts
   "lookup throws → 502". The uncovered, non-duplicate targets are in
   `lookupWord` itself: **(a)** a rejected `fetch` propagates as a throw (the
   precondition the endpoint's 502 relies on, currently unasserted), and **(b)**
   a **non-200 upstream status silently returns `[]`** — dictionary-down is
   indistinguishable from "unknown word" at the API boundary (both → HTTP 200
   `{entries:[]}`). This silent-blank behavior IS the Risk #6 defect.

## Detailed Findings

### Risk #5 — AI generation failure path

#### The generate route — `src/pages/api/sets/[id]/generate.ts`

Single JSON response (NOT streaming). `export const POST` at `generate.ts:51`,
`prerender = false` at `generate.ts:17`. Ordered flow and every error branch:

- **Auth** (`generate.ts:52-59`): missing `locals.user`/`locals.supabase` → `401 {"error":"Unauthorized"}`.
- **Set ID param** (`generate.ts:61-67`): missing → `400 {"error":"Set ID is required"}`.
- **Ownership** (`generate.ts:69-81`): `sets.select("id").eq("id",setId).eq("user_id",user.id).maybeSingle()`. DB error → `500 {"error":"Database error"}`; no row → `404 {"error":"Set not found"}`.
- **Body parse** (`generate.ts:83-91`): `request.json()` in try/catch → `400 {"error":"Invalid JSON body"}`.
- **Zod validation** (`generate.ts:45-49, 93-102`): `text` (min 10 / max 8000) + optional `count` (1–20). Failure → `400 {"error":"Validation failed","details":[...]}`.
- **Rate-limit gate** (`generate.ts:104-111`): see below.
- **API-key check** (`generate.ts:113-119`): `getSecret("OPENROUTER_API_KEY")` missing → `500 {"error":"AI generation is not configured"}`.
- **AI call** (`generate.ts:133-142`): `generateFlashcardProposals(...)` with a dictionary tool (`generate.ts:19-31`) and `handleToolCall` (`generate.ts:33-43`).
- **AI error branch** (`generate.ts:144-150`): status from `getAiErrorHttpStatus(error)` (`ai.ts:93-99`: `unconfigured`→500, `apiError`→502, `timeout`→504, `parseError`→422, `noProposals`→422); body `{"error": message, "kind": error.kind}`.
- **Duplicate filtering** (`generate.ts:152-168`): `checkDuplicateFronts` filters in-memory. RISK NOTE — a `duplicateError` is silently swallowed (`generate.ts:158`), proposals pass unfiltered on DB error.
- **Success** (`generate.ts:170-173`): `200 {"flashcards":[...], "removedCount", "removedFronts"}`.

**Architecture fact (load-bearing for the whole risk):** the route returns
proposals only — it does not persist. Save happens later via the batch endpoint
driven from the UI (`src/components/.../GenerateFlashcardsPage.tsx:165-202`).

#### The provider boundary (OpenRouter) — `src/lib/services/ai.ts`

- **Exact network call to mock**: `fetch(OPENROUTER_API_URL, {...})` at `ai.ts:230-240`, inside `generateFlashcardProposals`. Inline `fetch` — there is no separate provider-client module.
- Constants: `OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"` (`ai.ts:9`); `DEFAULT_MODEL = "google/gemini-flash-1.5"` (`ai.ts:8`).
- Request contract (`ai.ts:219-240`): POST `{model, messages, temperature:0.3, tools?}`; headers `Authorization: Bearer <key>`, `HTTP-Referer`, `X-Title: 10xCards`; `signal: controller.signal`.
- Response contract parsed back — `openRouterResponseSchema` (`ai.ts:65-82`): `{choices:[{message:{content:string|null, tool_calls?:[...]}}]}`.
- Multi-turn tool loop (`ai.ts:218-300`), capped `MAX_TOOL_TURNS = 8` (`ai.ts:11`).

#### Parsing / output validation — `parseProposals` (`ai.ts:149-180`)

Pipeline: `stripMarkdownFences` (`ai.ts:123-138`) → `JSON.parse` → on throw
`extractJsonObject` (`ai.ts:142-147`) retry → `proposalsResponseSchema.safeParse`
(`ai.ts:84-91`: each `front`/`back` 1–1000 chars) → empty-array check.
Malformed output is caught and converted to a typed error, never returned as garbage:

- Both JSON parses fail → `{kind:"parseError","Failed to parse AI response as JSON"}` (`ai.ts:160-163`).
- Schema mismatch → `{kind:"parseError","AI response did not match expected format"}` (`ai.ts:167-173`).
- Empty array → `{kind:"noProposals","No flashcards were generated"}` (`ai.ts:175-177`).
- `content === null` → `{kind:"apiError","OpenRouter returned no content"}` (`ai.ts:295-298`).
- Unexpected top-level shape → `{kind:"apiError","...unexpected response format"}` (`ai.ts:254-260`).

**Oracle-problem guardrail:** assert the discriminated-union `error.kind` and the
route status mapping — do NOT re-parse model output with a parallel parser and
compare card contents. RISK NOTE: the schema does not enforce array length against
requested `count`, so "fewer cards than asked" passes silently.

#### The <10s NFR / timeout — `ai.ts:10, 209-212, 239, 306-319`

`AbortController` + `setTimeout(abort, REQUEST_TIMEOUT_MS)` at `ai.ts:209-212`,
signal passed at `ai.ts:239`, AbortError → `{kind:"timeout"}` (`ai.ts:306-309`) →
HTTP 504. **RISK NOTE: `REQUEST_TIMEOUT_MS = 40_000` (`ai.ts:10`) violates the
<10s NFR by 4×.** The single timer is created once before the up-to-8-turn tool
loop (`ai.ts:209` before `ai.ts:218`), so it is a ~40s wall-clock deadline for the
whole loop (not reset per turn). There is no <10s deadline anywhere.

#### Partial-save semantics

Generation never saves (above). The separate batch save (`src/pages/api/sets/[id]/flashcards/batch.ts`)
validates via zod (1–50 cards, `flashcardContentSchema`) before a single atomic
`.insert([...])` (`src/lib/services/flashcards.ts:82-160`, insert at `flashcards.ts:146-149`).
Already tested: `tests/integration/persistence/flashcard-batch.test.ts` (all-or-nothing,
1–50 cap, duplicate-skip, within-batch dupes). Nothing new to add for save atomicity.

#### The `ai-rate-limit` gate — `src/lib/services/ai-rate-limit.ts`

- Exports for AI path: `getHourlyLimit` (`:5`), `rateLimitKey` (`:9`), `checkRateLimit` (`:14`). For dict path: `getDictLimit` (`:42`), `dictRateLimitKey` (`:46`), `checkDictRateLimit` (`:51`).
- Backed by Cloudflare **KV** `AI_RATE_LIMIT`, key `ai:hourly:<userId>:<YYYY-MM-DDTHH>` (`:9-12`), TTL 3600s (`:33`). Limit default **10/hour** from `AI_RATE_LIMIT_HOURLY` (`:3,6`).
- Enforced at `generate.ts:104-111`: `!allowed` → `429 {"error":"Rate limit exceeded. Try again later."}`, header `Retry-After: 3600`. Ordered BEFORE the API-key check and provider call, so it holds even when AI is unconfigured.
- **RISK NOTE (fail-closed):** `checkRateLimit` returns `{allowed:false}` when `kv` is null (`ai-rate-limit.ts:20-22`). The Node test stub exposes `env = {}` (`src/test/cloudflare-workers.stub.ts:7`), so `env.AI_RATE_LIMIT` is `undefined` → the gate 429s **every** request. A route-level test MUST `vi.mock("@/lib/services/ai-rate-limit")` (as `dict/[word].test.ts:4` does) or the route always 429s.
- RISK NOTE (non-atomic): get-then-put (`ai-rate-limit.ts:25,33`) — concurrent requests can race past the limit. Out of scope for this phase.

#### Existing #5 tests (do NOT duplicate)

- `src/lib/services/ai.test.ts` — parse contract + provider-boundary branches (`apiError` `:139-151`, `timeout` `:153-167`, `unconfigured` `:169-177`, parse cases `:54-98`, tool loop incl. max-rounds `:180-320`, status map `:322-332`). **Provider-boundary failures already covered at the service level.**
- **No test for `src/pages/api/sets/[id]/generate.ts`** (route orchestration) — the gap.
- **No test for `ai-rate-limit.ts`** (`checkRateLimit` KV logic, boundary, fail-closed) — the gap.

### Risk #6 — Cambridge Dictionary failure path

#### `lookupWord` error handling — `src/lib/services/dictionary.ts`

Single-attempt scraper. `fetch` at `dictionary.ts:28`; redirect short-circuit
`if (response.redirected && response.url === BASE_URL) return []` at `dictionary.ts:30-32`.

- **(a) fetch rejects (network/DNS):** NOT caught → `lookupWord` **throws** (propagates). No try/catch in the function.
- **(b) non-200 status (500/503/404):** **`response.ok`/`response.status` is NEVER checked** (nothing between `dictionary.ts:28` and the `HTMLRewriter.transform` at `dictionary.ts:152` except the redirect guard). The error-page body flows into HTMLRewriter, no selectors match → **returns `[]`**.
- **(c) format change / no selectors match (redesign):** HTMLRewriter runs, no handlers fire, `finalizeDefinition` no-ops (`dictionary.ts:53` guard) → **returns `[]`**.
- **(d) garbage / non-HTML body:** lenient parser matches nothing → **returns `[]`**.

Net: `lookupWord` **throws only on a hard `fetch` rejection**; every content-level
failure (down/redesign/garbage) returns `[]` — no distinction between "not found"
and "upstream broken."

#### Endpoint branches — `src/pages/api/dict/[word].ts`

401 auth (`:11-16`), 400 empty word (`:18-24`), 429 rate-limit (`:27-33`,
`Retry-After: 60`), **502** `try{lookupWord}catch → {error:"Dictionary service
unavailable"}` (`:36-45`), 200 `{word, entries}` including `entries: []` (`:47-50`).

**Consequence:** because `lookupWord` returns `[]` for non-200/redesign/garbage,
the endpoint returns **200 `{entries:[]}`** for those — the 502 catch is effectively
wired to transport-level rejection alone.

#### Coverage-gap table (the key #6 deliverable)

| Failure mode | `lookupWord` behavior | Endpoint outcome | Already tested? | Gap |
|---|---|---|---|---|
| fetch **rejects** (network/DNS) | throws | 502 | Endpoint 502 covered (`[word].test.ts:78-83`); **service throw NOT covered** | **Service-layer throw test** |
| **non-200 status** (503/500 error page) | returns `[]` (no `.ok` check) | **200 `{entries:[]}`** (silent blank) | **NOT covered** — all `stubFetchHtml` fixtures return 200 (`dictionary.test.ts:16-18`) | **TOP priority — the Risk #6 defect** |
| format change / no selectors | returns `[]` | 200 `{entries:[]}` | `[]` path covered as "no dictionary blocks" (`dictionary.test.ts:183`) | Low incremental value |
| garbage / non-HTML body | returns `[]` | 200 `{entries:[]}` | NOT covered, but same `[]` code path as non-200 | Low incremental value |
| timeout / hang | hangs (no abort) | hangs until platform kill | NOT covered — no mechanism to test | Absence-of-timeout finding |
| redirect to base (invalid word) | returns `[]` | 200 `{entries:[]}` | Covered (`dictionary.test.ts:35-51`, `[word].test.ts:71-76`) | — |

**Genuinely uncovered, non-duplicate targets:** (a) `lookupWord` propagates a
`fetch` rejection as a throw; (b) `lookupWord` on a non-200 response returns `[]`
(documents/locks the silent-blank defect).

#### No timeout — `dictionary.ts:28`

`fetch(url, {headers})` — no `signal`, no AbortController, no `AbortSignal.timeout`.
A hung upstream hangs until the Workers platform kills the request; the endpoint
comment (`dict/[word].ts:39-40`) claiming "network/timeout" is caught by the 502 is
misleading — a genuine hang never rejects promptly, so it never reaches the catch.

#### Contract shape

`DictionaryEntry` at `src/types.ts:97-103` (`definition`, `type|null`,
`dictionaryRegion:"UK"|"US"|null`, `info|null`, `examples:string[]`).
Endpoint JSON `{word, entries}` at `dict/[word].ts:47`. Client mirror in
`src/lib/dict-client.ts:3-6`; the client **does** map `!res.ok` → throw with status
(`dict-client.ts:39-41`), but cannot recover the server-side silent `[]` (a 200 with
empty entries reads as a successful "not found").

## Code References

- `src/pages/api/sets/[id]/generate.ts:51-173` — generate route flow and all error branches (no save).
- `src/lib/services/ai.ts:230-240` — OpenRouter `fetch` boundary (mock seam for service tests).
- `src/lib/services/ai.ts:149-180` — `parseProposals`; `ai.ts:84-91` proposal schema.
- `src/lib/services/ai.ts:10` — `REQUEST_TIMEOUT_MS = 40_000` (NFR violation).
- `src/lib/services/ai.ts:93-99` / `getAiErrorHttpStatus` `:101-103` — error-kind → HTTP status contract.
- `src/lib/services/ai-rate-limit.ts:14-33` — `checkRateLimit` (KV, fail-closed on null).
- `src/lib/services/dictionary.ts:28-32, 152` — fetch, redirect short-circuit, transform (no `.ok` check).
- `src/pages/api/dict/[word].ts:36-50` — 502 catch + 200 empty.
- `src/lib/services/ai.test.ts` — existing AI unit/contract tests.
- `src/lib/services/dictionary.test.ts` / `src/pages/api/dict/[word].test.ts` — existing dictionary tests.
- `src/types.ts:97-103` — `DictionaryEntry`.

## Architecture Insights (test harness & mocking seams)

Three Vitest projects (`vitest.config.ts:16-77`):

- **`node`** (`:17-34`) — `environment: "node"`, glob `src/**/*.test.{ts,tsx}` (excludes `dictionary.test.ts`). Plain Node: `fetch`/`HTMLRewriter` are NOT real; stub `fetch` or module-mock. Aliases `cloudflare:workers` → `src/test/cloudflare-workers.stub.ts` (`env = {}`).
- **`workers`** (`:35-50`, `defineWorkersProject`) — includes ONLY `dictionary.test.ts`. **Real Workers `HTMLRewriter` + real `fetch`.** New scraper tests must be added to the include glob at `vitest.config.ts:40`.
- **`integration`** (`:51-77`) — `environment: "node"`, glob `tests/integration/**/*.test.ts`, setup `tests/integration/helpers/env.ts`, `testTimeout: 30000`. Real local Supabase; aliases `cloudflare:workers`, `astro:env/server` (→ `src/test/astro-env-server.stub.ts`, exposing `getSecret(name)=process.env[name]`), `astro:middleware`. Auto-skips via `describe.skipIf(!hasSupabaseEnv)` (`env.ts:54`). Kept out of default `npm test`.

**Mocking seams for this phase:**
- AI provider boundary — service test: `vi.stubGlobal("fetch", ...)` + `mockResolvedValueOnce(new Response(...))` / `mockRejectedValueOnce(AbortError)` (as `ai.test.ts:102, 141, 153`). Route test: `vi.mock("@/lib/services/ai")` to force each `error.kind`, plus `vi.mock("@/lib/services/ai-rate-limit")`.
- Dictionary boundary — scraper test (`workers` project): stub `fetch` with a non-200 `Response` (as `dictionary.test.ts:16-18`, but with `{status:503}` / `mockRejectedValueOnce`). Route test (`node` project): `vi.mock("@/lib/services/dictionary")` + `mockRejectedValue` (already done at `[word].test.ts:78`).

**Contract-test house style:** `it.each` table mapping input → `error.kind` / HTTP
status (`ai.test.ts:322-332`); route tests assert `res.status` + `await res.json()`
`toEqual` (`[word].test.ts:67, 82`).

**Test commands** (`package.json:13-15`): `test` = `vitest run --project node --project workers` (integration excluded); `test:integration` = `vitest run --project integration`. The integration project does NOT yet set `poolOptions`/no-parallelism (`vitest.config.ts:68-76`) — run new integration tests with `-- --no-file-parallelism` (test-plan §6.3).

## Historical Context (from prior changes)

- `context/changes/testing-authorization-data-isolation/` (Phase 1) — bootstrapped the integration harness (`makeApiContext`, `createTestUser`, `userClient`, `anonClient`, `serviceClient`, `seedSet`); IDOR/anon contract tests.
- `context/changes/testing-sr-state-persistence/` (Phase 2) — submit→re-fetch persistence pattern; `flashcard-batch.test.ts` already covers batch save atomicity (relevant to #5's "no partial save" — the save layer is done).
- `context/archive/2026-06-13-ai-flashcard-generation/` — original AI generation feature.
- `context/archive/2026-06-18-cambridge-dict-cli/` — dictionary integration; note the lesson "Zmiana funkcji API wymaga aktualizacji dokumentacji OpenAPI/Scalar" traces to this change.

## Related Research

- `context/changes/testing-authorization-data-isolation/research.md`
- `context/changes/testing-sr-state-persistence/research.md`

## Open Questions (decisions for `/10x-plan`)

1. **The <10s NFR is violated in code (40s timeout, `ai.ts:10`).** We cannot
   "prove <10s". Choose: (a) assert the *actual* contract — AbortError → clean 504,
   zero proposals — and record the 40s>10s NFR miss as a lesson/finding; or
   (b) write a deliberately-red test asserting <10s to force the fix. Recommendation:
   (a) + a lessons.md entry, since Phase 3 is about clean-failure surfacing, not
   fixing the NFR — but this is the user's call.

2. **The dictionary silent-blank (non-200 → `[]`) is arguably a defect, not just
   a gap.** Choose: (a) a *characterization* test asserting current behavior
   (`lookupWord` returns `[]` on 503) with a comment flagging it, so a future fix
   trips it deliberately (mirrors Phase 2's "repeated submit not idempotent"
   approach); or (b) a red test asserting it *should* throw/signal, forcing a
   `response.ok` check to be added. Recommendation: (a) to match house style
   (Phase 2 documented known gaps rather than fixing them mid-test-rollout).

3. **Where does the AI route-orchestration test live?** A pure failure-path/contract
   test fits the **`node`** project (module-mock `ai` + `ai-rate-limit`, stub the
   `sets` ownership query, no Supabase) — cheapest and matches `[word].test.ts`.
   A full route test with real ownership/rate-limit would go in **`integration`**.
   Recommendation: `node` project for the orchestration + contract, matching the
   existing dict-route test precedent; reserve integration for anything needing
   real RLS. Confirm during planning.

4. **Should `ai-rate-limit.ts` get its own unit test** (`checkRateLimit` boundary,
   fail-closed-on-null-kv, count increment)? It is untested and the gate is a named
   Risk #5 concern ("the rate-limit gate holds"). Recommendation: yes — a small
   `node`-project unit test with a fake KV.
