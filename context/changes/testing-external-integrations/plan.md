# External Integration Failure Paths (Risks #5 & #6) Implementation Plan

## Overview

Phase 3 of `context/foundation/test-plan.md`. Add **failure-path tests** for the
two external-integration boundaries — AI flashcard generation (OpenRouter, Risk
#5) and Cambridge Dictionary lookup (Risk #6) — proving that provider failure,
timeout, and malformed/unavailable output surface as a **clean error with zero
silent data loss**, and that the `ai-rate-limit` gate holds. The phase also lands
two contained production fixes that make the risks genuinely closed rather than
merely documented: enforce the `<10s` generation NFR, and stop the dictionary
from silently blanking on a non-200 upstream.

## Current State Analysis

From `research.md` (this change) and direct code reading at commit `0d51752`:

- **The generate route never saves.** `POST /api/sets/[id]/generate`
  (`src/pages/api/sets/[id]/generate.ts:51-173`) returns flashcard *proposals*
  only; persistence is a separate, user-initiated, already-atomic batch endpoint
  (tested in Phase 2). "ZERO partial save" for Risk #5 is therefore a structural
  guarantee — the test proves the failure branches return a typed error and never
  reach the proposal-processing/response-with-flashcards path.
- **Provider-boundary failure branches are already unit-tested.**
  `src/lib/services/ai.test.ts` covers `apiError`/`timeout`/`unconfigured`/
  `parseError`/`noProposals` and the parse contract. The untested gaps are the
  **generate-route orchestration layer** (no test file) and **`ai-rate-limit.ts`**
  (no test file).
- **The `<10s` NFR is violated in code:** `REQUEST_TIMEOUT_MS = 40_000`
  (`src/lib/services/ai.ts:10`), a single wall-clock deadline created once
  (`ai.ts:209-212`) before the up-to-8-turn tool loop (`ai.ts:218`).
- **The dictionary silently blanks on non-200:** `lookupWord`
  (`src/lib/services/dictionary.ts:24-158`) never checks `response.ok`; a 503/500
  error-page body flows into `HTMLRewriter` (`dictionary.ts:152`), matches no
  selectors, and returns `[]`. At the API boundary "dictionary down" is
  indistinguishable from "unknown word" — both yield `200 {entries:[]}`. The
  endpoint's 502 catch (`dict/[word].ts:36-45`) only fires on a hard `fetch`
  rejection.
- **The endpoint 502 path and the happy paths are already tested** —
  `src/pages/api/dict/[word].test.ts:78-83` (lookup throws → 502),
  `dict/[word].test.ts:71-76` and `dictionary.test.ts:183` (unknown word → empty).
  Do NOT duplicate these.

### Test harness (from `research.md` §Architecture Insights):

- Three Vitest projects (`vitest.config.ts:16-77`): **`node`** (`environment:"node"`,
  glob `src/**/*.test.{ts,tsx}`, excludes `dictionary.test.ts`; aliases ONLY
  `cloudflare:workers`), **`workers`** (workerd, real `HTMLRewriter`+`fetch`,
  include is exactly `dictionary.test.ts`), **`integration`** (real Supabase,
  aliases `cloudflare:workers` + `astro:env/server` + `astro:middleware`).
- Mocking seams already in use: `vi.stubGlobal("fetch", vi.fn())` +
  `mockResolvedValueOnce(new Response(...))` (`dictionary.test.ts:16-27`,
  `ai.test.ts:102`); `vi.mock("@/lib/services/...")` module-mock
  (`dict/[word].test.ts:3-4`).
- `getSecret` stub for the node/integration path: `src/test/astro-env-server.stub.ts`
  (`getSecret(name)=process.env[name]`).
- Commands (`package.json:13-15`): `test` = `vitest run --project node --project
  workers`; `test:integration` = `vitest run --project integration`.

## Desired End State

`npm test` (node + workers projects) is green and now includes: dictionary
service failure tests, a generate-route orchestration test, an AI-timeout NFR
contract test, and an `ai-rate-limit` unit test. `lookupWord` throws on a non-200
upstream (endpoint → 502), and the AI generation deadline is `≤10s`. The test-plan
§3 Phase 3 row reads `complete`, cookbook §6.4 is filled, and two lessons are
recorded. Verify by running `npm test` and inspecting the four new/extended test
files plus the two production diffs.

### Key Discoveries:

- Generate route has no save path at all (`generate.ts` imports no write/insert) — "no partial save" is structural (`generate.ts:170-173` is the only success exit).
- Node project does NOT alias `astro:env/server` (`vitest.config.ts:19-25`); the generate route imports it (`generate.ts:14`) → alias must be added to test the route in node.
- `checkRateLimit` fails **closed** when `kv` is null (`ai-rate-limit.ts:20-22`); node stub gives `env={}` so a route test MUST mock `checkRateLimit` or it always 429s.
- Real error→status mapping lives in `getAiErrorHttpStatus` (`ai.ts:93-103`); the route test must exercise the REAL mapping (partial-mock `ai`, override only `generateFlashcardProposals`).
- Dictionary redirect short-circuit (`dictionary.ts:30-32`) must stay ahead of the new `response.ok` check so invalid-word (302→200 at base) still returns `[]`.

## What We're NOT Doing

- Not testing provider/dictionary uptime (untestable) — only the boundary contract via mocks.
- Not re-testing the parser's card contents (oracle problem) — assert `error.kind` and status, not recomputed card values.
- Not duplicating the existing dictionary happy-path or endpoint-502 tests.
- Not adding MSW or a new mocking library — reuse `vi.stubGlobal`/`vi.mock`.
- Not moving the generate-route test into the `integration` project (real ownership/RLS is Phase 1's job, already done).
- Not touching the batch save endpoint (its atomicity is covered by Phase 2).
- Not wiring CI enforcement (`vitest run` gate) — that is test-plan §3 Phase 5.
- Not reworking the tool-loop timeout architecture beyond changing the deadline value.

## Implementation Approach

Two production fixes are small and localized (one line-ish each) and each ships
with the test that proves it. Tests are placed by seam: dictionary scraper
failures in the **workers** project (real `HTMLRewriter`, stub `fetch`); the
generate-route orchestration and the rate-limit gate in the **node** project
(module-mocks, fake KV). Each phase is a single commit mirroring the Phase 2
rollout style. The final phase updates the durable docs and flips the rollout
status.

## Critical Implementation Details

- **Node project `astro:env/server` alias (Phase 3).** The generate route cannot
  even be imported under the node project until `astro:env/server` is aliased to
  `src/test/astro-env-server.stub.ts` (the integration project already does this
  at `vitest.config.ts:62`). Add the same alias to the node project's
  `resolve.alias` block; `getSecret` then reads `process.env`, so the test sets
  `process.env.OPENROUTER_API_KEY` to control the configured/unconfigured branch.
- **Rate-limit fails closed under test.** Because `env={}` in the node stub,
  `checkRateLimit(null, …)` returns `{allowed:false}`. The generate-route test
  must `vi.mock("@/lib/services/ai-rate-limit")` and default `checkRateLimit` to
  `{allowed:true}`, flipping to `{allowed:false}` only for the 429 case.
- **Dictionary `response.ok` check ordering.** Insert the throw AFTER the redirect
  short-circuit (`dictionary.ts:30-32`) so a valid-but-unknown word (302→200 at
  base URL) still returns `[]` instead of throwing. Existing fixtures build
  `new Response(html)` (status 200, `ok:true`), so happy-path tests stay green.

## Phase 1: Dictionary failure path (#6)

### Overview

Make `lookupWord` surface a non-200 upstream as a thrown error (so the endpoint
returns a clean 502 instead of a silent empty result), and cover the service-layer
failure modes that are currently untested.

### Changes Required:

#### 1. Dictionary service — throw on non-200

**File**: `src/lib/services/dictionary.ts`

**Intent**: Stop the silent-blank behavior: when Cambridge returns a non-200
status (down / error page), `lookupWord` should throw so the caller can surface a
clean error, instead of feeding an error page to `HTMLRewriter` and returning `[]`.

**Contract**: After the redirect short-circuit (`dictionary.ts:30-32`) and before
constructing the rewriter, add `if (!response.ok) throw new Error(...)`. Preserve
the redirect short-circuit ahead of it. No signature change; `lookupWord` still
returns `Promise<DictionaryEntry[]>` on success.

#### 2. Dictionary service failure tests

**File**: `src/lib/services/dictionary.test.ts` (workers project — extends the existing file, no glob change)

**Intent**: Cover the two genuinely-uncovered service-layer failure modes and
lock the fix, without duplicating existing happy-path/unknown-word cases.

**Contract**: Add cases using the existing `vi.stubGlobal("fetch")` harness —
(a) `fetch` rejects (`mockRejectedValueOnce(new TypeError("network"))`) →
`await expect(lookupWord("cat")).rejects.toThrow()`; (b) non-200 response
(`mockResolvedValueOnce(new Response("<html>503</html>", { status: 503 }))`) →
`rejects.toThrow()`. Keep the existing happy-path and redirect/unknown-word tests
passing unchanged.

### Success Criteria:

#### Automated Verification:

- [ ] `npm test` passes (node + workers projects)
- [ ] The two new dictionary failure cases pass in the `workers` project
- [ ] Existing dictionary happy-path + redirect tests still pass unchanged
- [ ] Existing `dict/[word].test.ts` "lookup throws → 502" still passes (now reachable via non-200 too)
- [ ] Typecheck passes: `npm run build` (Astro type-check; `npm run lint` may crash on `.astro` — lessons)

#### Manual Verification:

- [ ] With the fix, a simulated dictionary-down (non-200) surfaces as endpoint 502, not `200 {entries:[]}`
- [ ] A genuinely unknown word still returns `200 {entries:[]}` (redirect short-circuit intact)

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 2.

---

## Phase 2: AI provider timeout NFR (#5)

### Overview

Enforce the `<10s` generation NFR in code and prove it with a contract test, plus
confirm the existing timeout behavior test still demonstrates a clean surfaced
error.

### Changes Required:

#### 1. Reduce and export the generation deadline

**File**: `src/lib/services/ai.ts`

**Intent**: Bring the whole-request generation deadline within the `<10s` NFR and
make it assertable from a test.

**Contract**: Change `REQUEST_TIMEOUT_MS` from `40_000` to `10_000` (`ai.ts:10`)
and add `export` so a contract test can read it. The single `AbortController`
created before the tool loop (`ai.ts:209-212`) stays as the whole-request budget;
on abort the existing `AbortError` handler returns `{kind:"timeout"}`
(`ai.ts:306-309`) → route maps to 504. No other logic change.

#### 2. Timeout contract + behavior test

**File**: `src/lib/services/ai.test.ts`

**Intent**: Assert the configured deadline respects the NFR, and keep the
abort→timeout behavior covered.

**Contract**: Add a contract test importing `REQUEST_TIMEOUT_MS` and asserting
`≤ 10_000`. Confirm/retain the existing AbortError → `{kind:"timeout"}` case
(`ai.test.ts:153-167`). No oracle-style assertion on timing wall-clock.

### Success Criteria:

#### Automated Verification:

- [ ] `npm test` passes
- [ ] Contract test asserts `REQUEST_TIMEOUT_MS ≤ 10_000`
- [ ] Existing AbortError → `timeout` (kind) test still passes
- [ ] Typecheck passes: `npm run build`

#### Manual Verification:

- [ ] Confirm no legitimate generation path silently depends on the old 40s budget (note the tradeoff: multi-lookup tool loops now share a 10s wall-clock)

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 3.

---

## Phase 3: Generate-route orchestration (#5)

### Overview

Add the first test for the generate route, exercising the real error→status
mapping, the configured/unconfigured branch, input validation, the rate-limit
gate, and the zero-save guarantee — via module-mocks in the node project.

### Changes Required:

#### 1. Node project `astro:env/server` alias

**File**: `vitest.config.ts`

**Intent**: Let the node project import the generate route (which imports
`astro:env/server`).

**Contract**: Add `"astro:env/server": path.resolve(__dirname, "./src/test/astro-env-server.stub.ts")`
to the node project's `resolve.alias` block (`vitest.config.ts:19-25`), matching
the integration project (`vitest.config.ts:62`). No change to `workers` project.

#### 2. Generate-route failure/contract test

**File**: `src/pages/api/sets/[id]/generate.test.ts` (new, node project)

**Intent**: Prove the route maps each AI failure to the correct HTTP status,
guards config and input, holds the rate-limit gate, and never emits flashcards on
failure — mirroring the `dict/[word].test.ts` style.

**Contract**: Import `POST` from `./generate`. Mocks:
- `vi.mock("@/lib/services/ai", async (orig) => ({ ...(await orig()), generateFlashcardProposals: vi.fn() }))` — **partial** mock so the REAL `getAiErrorHttpStatus`/`errorMessage`/`generateInputSchema` run.
- `vi.mock("@/lib/services/ai-rate-limit", () => ({ checkRateLimit: vi.fn() }))` — default `{allowed:true, limit:10, remaining:9}`.
- `vi.mock("@/lib/services/user-settings", () => ({ getUserPrompt: vi.fn().mockResolvedValue({ data: null }) }))`.
- `vi.mock("@/lib/services/flashcards")` — to assert `checkDuplicateFronts` is NEVER called on the failure path.

Build a context with a fake `supabase` whose `from("sets").select().eq().eq().maybeSingle()` resolves `{ data: { id: setId }, error: null }`, and a real `Request` (`new Request("http://localhost/api/sets/s1/generate", { method:"POST", body: JSON.stringify({ text }) })`) so `.json()` and `.url` work. Set `process.env.OPENROUTER_API_KEY` in `beforeEach`.

Cases (assert `res.status` + parsed body):
- `error.kind:"apiError"` → 502; `"timeout"` → 504; `"parseError"` → 422; `"noProposals"` → 422 (drive via `generateFlashcardProposals` mock return `{data:[], error:{kind,message}}`; assert against REAL mapping).
- Missing `OPENROUTER_API_KEY` (unset env) → 500 `{error:"AI generation is not configured"}`.
- Invalid body (`text` too short) → 400 `{error:"Validation failed"}`.
- `checkRateLimit` → `{allowed:false}` → 429 with `Retry-After: 3600`, and `generateFlashcardProposals` NOT called.
- **Zero-save**: on any AI error, body has `error`+`kind` and no `flashcards`; `checkDuplicateFronts` never called; `generateFlashcardProposals` returns → route stops.

### Success Criteria:

#### Automated Verification:

- [ ] `npm test` passes
- [ ] Route maps `apiError→502`, `timeout→504`, `parseError→422`, `noProposals→422` via the real `getAiErrorHttpStatus`
- [ ] Unconfigured key → 500; invalid input → 400; rate-limited → 429 (`Retry-After: 3600`) with no provider call
- [ ] On failure, response contains no `flashcards` and `checkDuplicateFronts` is never invoked
- [ ] Typecheck passes: `npm run build`

#### Manual Verification:

- [ ] Confirm the partial-mock keeps the REAL error→status mapping (not a stubbed table), so the test has teeth if the mapping changes

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 4.

---

## Phase 4: ai-rate-limit gate unit test (#5)

### Overview

Directly verify the rate-limit gate the risk names ("the gate holds"), including
the fail-closed trap, with a fake KV.

### Changes Required:

#### 1. Rate-limit unit test

**File**: `src/lib/services/ai-rate-limit.test.ts` (new, node project)

**Intent**: Cover `checkRateLimit` and `checkDictRateLimit` boundary logic, the
fail-closed-on-null-KV behavior, and the key/TTL contract — none currently tested.

**Contract**: Build a fake KV: `{ get: async (k) => store.get(k) ?? null, put: async (k,v,opts) => { store.set(k,v); /* capture opts.expirationTtl */ } }` backed by a `Map`. Pass a fixed `now` (the functions accept `now` params — `ai-rate-limit.ts:9,17,46,54`) to make keys deterministic. Cases:
- Under limit → `{allowed:true}`, `remaining` decrements, `put` called with incremented count.
- At/over limit (seed `store` at `limit`) → `{allowed:false, remaining:0}`, `put` NOT called.
- `kv = null` → `{allowed:false}` (fail closed) for both functions.
- `rateLimitKey` → `ai:hourly:<uid>:<YYYY-MM-DDTHH>`; `dictRateLimitKey` → `dict:minute:<uid>:<YYYY-MM-DDTHH:MM>`.
- TTL contract: hourly `put` uses `expirationTtl: 3600`; dict uses `60`.
- `getHourlyLimit` default 10; `getDictLimit` 30.

### Success Criteria:

#### Automated Verification:

- [ ] `npm test` passes
- [ ] Under-limit allows and increments; at-limit denies without writing
- [ ] Null KV fails closed for both hourly and dict variants
- [ ] Key formats and TTLs (3600 / 60) asserted
- [ ] Typecheck passes: `npm run build`

#### Manual Verification:

- [ ] Confirm the fake KV mirrors the real KV get/put contract (string values, `expirationTtl` option)

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 5.

---

## Phase 5: Rollout wrap-up

### Overview

Record the durable knowledge and flip the rollout status so a future reader (and
`/10x-test-plan`) sees Phase 3 as complete.

### Changes Required:

#### 1. Cookbook §6.4

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the §6.4 "TBD" with the concrete pattern for external-integration failure-path tests.

**Contract**: Fill §6.4 (`test-plan.md:199-201`): which project per boundary
(dictionary scraper → `workers`, stub `fetch`; route/gate → `node`, module-mock +
fake KV), the partial-mock-to-keep-real-mapping rule, and the no-partial-save /
non-200-throws contracts.

#### 2. Phase 3 status → complete

**File**: `context/foundation/test-plan.md`

**Intent**: Advance the rollout state.

**Contract**: In §3 table (`test-plan.md:85`) change Phase 3 Status `change opened`
→ `complete`. Add a §6.6 per-phase note (2-3 lines) capturing the two fixes and
the node-project `astro:env/server` seam. Update the header "Last updated" line.

#### 3. Lessons entries

**File**: `context/foundation/lessons.md`

**Intent**: Record the two reusable rules discovered.

**Contract**: Append two entries — (a) "Scraper must check `response.ok` before
parsing — a non-200 body silently yields `[]`, making 'upstream down'
indistinguishable from 'not found'"; (b) "Testing an API route that imports
`astro:env/server` in the node Vitest project requires aliasing it to the stub;
mock `checkRateLimit` or the null-KV fail-closed makes every request 429."

### Success Criteria:

#### Automated Verification:

- [ ] Full suite green: `npm test`
- [ ] `context/foundation/test-plan.md` §3 Phase 3 row reads `complete`
- [ ] §6.4 no longer contains "TBD"

#### Manual Verification:

- [ ] Brief re-read of test-plan §6.4 + §6.6 for accuracy against what shipped
- [ ] Lessons entries are specific and actionable

**Implementation Note**: Final phase — after verification, the change is ready for `/10x-archive`.

---

## Testing Strategy

### Unit Tests:

- Dictionary service: fetch-reject throws; non-200 throws (workers project, stub `fetch`).
- AI timeout: `REQUEST_TIMEOUT_MS ≤ 10_000` contract; AbortError → `timeout` behavior.
- ai-rate-limit: boundary, fail-closed, key/TTL contract (fake KV, node project).

### Integration Tests:

- Generate route (node project, module-mocked): real error→status mapping, config/validation guards, 429 gate, zero-save on failure. (Not the `integration`/real-Supabase project — ownership/RLS is Phase 1's domain.)

### Manual Testing Steps:

1. Simulate dictionary non-200 → confirm endpoint 502 (not silent empty).
2. Confirm unknown word still returns `200 {entries:[]}`.
3. Confirm the generate-route mapping test fails if `getAiErrorHttpStatus` is altered (teeth check).

## Performance Considerations

Reducing the generation deadline from 40s to 10s tightens the whole-request budget
shared across the up-to-8-turn tool loop (each turn may issue up to 20 parallel
live dictionary scrapes). This satisfies the `<10s` NFR but may abort legitimate
heavy multi-lookup generations that previously completed between 10–40s; accepted
tradeoff per planning decision. No test asserts wall-clock timing (oracle-safe).

## Migration Notes

No data or schema migration. Two behavior changes: dictionary non-200 now throws
(endpoint 502 instead of `200 {entries:[]}`); AI generation aborts at 10s instead
of 40s. Both are surfaced as clean errors the UI already handles (502 / 504).

## References

- Related research: `context/changes/testing-external-integrations/research.md`
- Test plan: `context/foundation/test-plan.md` (§2 Risks #5/#6, §3 Phase 3, §6.2–§6.4)
- Reference test (route module-mock): `src/pages/api/dict/[word].test.ts`
- Reference test (scraper fetch-stub): `src/lib/services/dictionary.test.ts`
- Reference test (parse/status contract): `src/lib/services/ai.test.ts:322-332`
- Generate route: `src/pages/api/sets/[id]/generate.ts:51-173`
- AI service timeout: `src/lib/services/ai.ts:10, 209-212, 306-309`
- Dictionary service: `src/lib/services/dictionary.ts:24-158`
- Rate-limit gate: `src/lib/services/ai-rate-limit.ts:14-72`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Dictionary failure path (#6)

#### Automated

- [x] 1.1 `npm test` passes (node + workers projects)
- [x] 1.2 The two new dictionary failure cases pass in the `workers` project
- [x] 1.3 Existing dictionary happy-path + redirect tests still pass unchanged
- [x] 1.4 Existing `dict/[word].test.ts` "lookup throws → 502" still passes
- [x] 1.5 Typecheck passes: `npm run build`

#### Manual

- [x] 1.6 Simulated dictionary-down (non-200) surfaces as endpoint 502, not `200 {entries:[]}`
- [x] 1.7 A genuinely unknown word still returns `200 {entries:[]}`

### Phase 2: AI provider timeout NFR (#5)

#### Automated

- [ ] 2.1 `npm test` passes
- [ ] 2.2 Contract test asserts `REQUEST_TIMEOUT_MS ≤ 10_000`
- [ ] 2.3 Existing AbortError → `timeout` (kind) test still passes
- [ ] 2.4 Typecheck passes: `npm run build`

#### Manual

- [ ] 2.5 No legitimate generation path silently depends on the old 40s budget (tradeoff noted)

### Phase 3: Generate-route orchestration (#5)

#### Automated

- [ ] 3.1 `npm test` passes
- [ ] 3.2 Route maps `apiError→502`, `timeout→504`, `parseError→422`, `noProposals→422` via real `getAiErrorHttpStatus`
- [ ] 3.3 Unconfigured key → 500; invalid input → 400; rate-limited → 429 (`Retry-After: 3600`) with no provider call
- [ ] 3.4 On failure, response contains no `flashcards` and `checkDuplicateFronts` is never invoked
- [ ] 3.5 Typecheck passes: `npm run build`

#### Manual

- [ ] 3.6 Partial-mock keeps the REAL error→status mapping (teeth check)

### Phase 4: ai-rate-limit gate unit test (#5)

#### Automated

- [ ] 4.1 `npm test` passes
- [ ] 4.2 Under-limit allows and increments; at-limit denies without writing
- [ ] 4.3 Null KV fails closed for both hourly and dict variants
- [ ] 4.4 Key formats and TTLs (3600 / 60) asserted
- [ ] 4.5 Typecheck passes: `npm run build`

#### Manual

- [ ] 4.6 Fake KV mirrors the real KV get/put contract (string values, `expirationTtl`)

### Phase 5: Rollout wrap-up

#### Automated

- [ ] 5.1 Full suite green: `npm test`
- [ ] 5.2 `context/foundation/test-plan.md` §3 Phase 3 row reads `complete`
- [ ] 5.3 §6.4 no longer contains "TBD"

#### Manual

- [ ] 5.4 Re-read test-plan §6.4 + §6.6 for accuracy against what shipped
- [ ] 5.5 Lessons entries are specific and actionable
