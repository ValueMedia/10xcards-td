# Pons Dictionary Integration (DE→PL) Implementation Plan

## Overview

Add a German–Polish dictionary lookup feature mirroring the existing Cambridge English integration, using the **Pons Online Dictionary API** (`l=depl`) as the data source. Unlike Cambridge (HTML scraping), Pons returns native JSON — but imposes a shared **1000 requests/month** quota, which forces a KV cache layer Cambridge does not have. Delivered as a parallel surface: `src/lib/services/dictionary-de.ts` + `GET /api/dict/de/[word]` + a separate `/lookup_word_de` page + a second AI tool `lookup_word_de` in the generation pipeline.

## Current State Analysis

The Cambridge integration (`context/archive/2026-06-18-cambridge-dict-cli/`) is the reference architecture. Five layers exist for EN and must be cloned/extended for DE:

- **Service**: `src/lib/services/dictionary.ts:24-166` — `lookupWord(word)` using Cloudflare `HTMLRewriter` against `dictionary.cambridge.org/dictionary/english/`. No cache, no timeout, redirect short-circuit before `!response.ok` throw. Returns `DictionaryEntry[]` (`src/types.ts:97-103`).
- **Endpoint**: `src/pages/api/dict/[word].ts:8-51` — `GET`, auth-required (`context.locals.user?.id`), `checkDictRateLimit` (30/min/user, fail-closed on null KV), 502 on `lookupWord` throw, 429 with `Retry-After: 60`.
- **Rate-limit**: `src/lib/services/ai-rate-limit.ts:37-72` — `checkDictRateLimit`, key `dict:minute:{uid}:{YYYY-MM-DDTHH:MM}`, TTL 60s, reuses `AI_RATE_LIMIT` KV binding (no separate namespace).
- **OpenAPI**: `src/lib/openapi/openapi-spec.ts:108-206` — `DictionaryEntry` schema (region enum `["UK","US"]`), path `/api/dict/{word}` tagged `"Dictionary"`. Per `lessons.md:84-89`, any new endpoint must update this spec in the same change.
- **UI**: `src/pages/lookup_word.astro` + `src/components/lookup/LookupWordPage.tsx:21-367` (React island, `client:load`) + `src/lib/dict-client.ts:29-43` (`lookupWordClient`). i18n namespace `lookup` in `src/lib/i18n/locales/{en,pl}/lookup.json`.
- **AI tool**: `src/pages/api/sets/[id]/generate.ts:19-43` — `DICTIONARY_TOOL` (`lookup_word`) declared and dispatched in `handleToolCall`; passed via `tools: [DICTIONARY_TOOL]` at `:140`.
- **Middleware**: `src/middleware.ts:7, :16` — `/lookup_word` in `PROTECTED_PAGE_ROUTES`, `/api/dict` in `PROTECTED_API_ROUTES`.
- **Env schema**: `astro.config.mjs:29-38` — secrets via `envField.string({ context: "server", access: "secret" })`. No dictionary-specific secret exists yet.

### Key Discoveries:

- `DictionaryEntry.dictionaryRegion` is hardcoded to `"UK" | "US" | null` (`src/types.ts:100`) — Pons `depl` has no region concept; reuse this field as `null` or repurpose as Pons "subject"/"register" label. Decision: **keep `DictionaryEntry` shared**; for DE entries set `dictionaryRegion: null` and put Pons "subject area" (`Sachgebiet`) into `info`.
- `AI_RATE_LIMIT` KV namespace (`astro.config.mjs` + `wrangler.toml`) is already bound and used by AI/dict/TTS rate-limiters. **Reuse it for the Pons cache** — no new binding needed; cache key prefix `pons:de:` keeps namespaces disjoint.
- Pons API has no rate-limit response header to parse; the 1000/month quota is account-wide, enforced server-side by Pons returning **403 NOT AUTHORIZED** when the secret is bad/revoked, and (per community reports) informal outreach when the quota is exceeded — there is no documented 429. Treat 403/500/502/503/504 from Pons as upstream-unavailable → 502 to the client; 204 as "no entries".
- `src/test/astro-env-server.stub.ts` exists and is aliased in the `node` Vitest project (`vitest.config.ts`) — the DE endpoint will import `astro:env/server` to read `PONS_API_SECRET`, so the same alias/stub applies. Per `lessons.md:112-117`, route tests must `vi.mock("@/lib/services/ai-rate-limit")` to avoid fail-closed 429s.
- Cambridge `lookupWord` has **no `AbortSignal.timeout`** (`src/lib/services/dictionary.ts:28`) — known gap from `testing-external-integrations`. The Pons service must add one (10s, matching the AI provider timeout that was reduced in that change).
- Pons response shape is documented in `https://en.pons.com/assets/docs/api_dict.pdf`: `GET https://api.pons.com/v1/dictionary?q={word}&l=depl&language=pl&fm=1&ref=true`, header `X-Secret`. Response is a JSON array of hits, each with `roms` → `arabs` → `senses` → `translations` (with `source`/`target` fields). Mapping to `DictionaryEntry`: `target` → `definition`, `headword`/`pos` → `type`, `subject` → `info`, example `source`/`target` → `examples` (≤2).
- `/lookup_word.astro:24-28` redirects to `/dashboard` if the user is not the set owner — this gate must be preserved verbatim in `/lookup_word_de.astro`.

## Desired End State

A Polish-speaking user learning German can:

1. Navigate to `/lookup_word_de?setId=...` from a German set's detail page.
2. Type a German word, see Pons DE→PL definitions (Polish translations, part of speech, subject area, up to 2 example sentence pairs) within ~1-2s for cached words and ~3-5s for fresh ones.
3. Turn a definition into a flashcard in the active set, identical UX flow to the Cambridge page.
4. Hit the same 30 lookups/minute per-user rate limit (shared with EN lookup via the existing `dict:minute:` prefix).
5. Use `/api/sets/{id}/generate` for a German set and have the LLM autonomously call `lookup_word_de` when it needs a Polish translation of a German word — without changing behavior of the existing `lookup_word` tool for English.

### Verification

- `npx vitest run` — all existing tests still pass; new tests for `dictionary-de.ts` (workers project) and `/api/dict/de/[word].ts` (node project) pass.
- `npm run build` succeeds (Astro typecheck of the new route + island).
- `npm run lint` on changed `.ts`/`.tsx` files passes (per `lessons.md:59-64`, do not run lint on `.astro` files).
- Manual: open `/lookup_word_de?setId=<a German set id>`, look up `Haus`, see Polish translations; look up a nonexistent word, see "no results" empty state; trigger 31 rapid lookups, see the 429 message; hit `/api/sets/<id>/generate` on a German set, observe `lookup_word_de` tool call in the worker logs.
- Cloudflare: `wrangler secret put PONS_API_SECRET` set; first deploy after push to `main` does not 500 — `PONS_API_SECRET` resolves via `astro:env/server`.

## What We're NOT Doing

- **No fallback to Free Dictionary API / Wiktionary** — explicit decision; will be a separate change if Pons quota becomes a real bottleneck.
- **No refactor of `dictionary.ts` into a multi-source dispatcher** — keep `dictionary.ts` (Cambridge) and `dictionary-de.ts` (Pons) as parallel files; a `lang` parameter on a shared `lookupWord(word, lang)` is a future refactor, not this change.
- **No per-user Pons accounts / tokens** — one shared `PONS_API_SECRET`; per-user isolation is purely via our 30/min rate-limit.
- **No `deen` direction** — only `depl`. EN translations for German words are out of scope (Free Dictionary API fallback would cover that, also out of scope).
- **No pronunciation / IPA / audio rendering** — Cambridge has no IPA either (`research.md`); Pons has audio URLs in its JSON, but extracting and rendering them is a UX extension, not part of this MVP.
- **No `/check`-style handoff for DE** — the existing `/generate` → `/lookup_word` "Check" button (`context/archive/2026-06-20-check-word-while-generating/`) stays English-only for now.
- **No timeout fix for Cambridge** — adding `AbortSignal.timeout` to the existing `dictionary.ts:28` is out of scope; only the new Pons service gets a timeout.
- **No `DictionaryEntry` schema split** — the interface stays shared. Pons fills `dictionaryRegion: null` and uses `info` for the Pons subject label.

## Implementation Approach

Four phases, each independently committable and verifiable. Phases 1–2 build the backend (service + endpoint + spec); phase 3 builds the UI; phase 4 wires AI tool integration. Each phase ends with a commit on green tests, per the 10x workflow.

**Architecture** — parallel surfaces, not a refactor:

```
dictionary.ts (Cambridge, EN)      dictionary-de.ts (Pons, DE→PL)   ← Phase 1
        │                                  │
        ▼                                  ▼
/api/dict/[word]                    /api/dict/de/[word]              ← Phase 2
        │                                  │
        ▼                                  ▼
dict-client.ts → LookupWordPage    dict-de-client.ts → LookupWordPageDe  ← Phase 3
        │                                  │
        ▼                                  ▼
DICTIONARY_TOOL (lookup_word)      DICTIONARY_TOOL_DE (lookup_word_de)   ← Phase 4
   in generate.ts                     in generate.ts
```

Cache strategy (Phase 1): **read-through cache in `AI_RATE_LIMIT` KV**, key `pons:de:{normalizedWord}`, TTL 30 days (2592000s). On a cache hit, return the parsed JSON without calling Pons. On a miss, call Pons, store the result (including empty arrays for 204 — a 204 today will likely still be a 204 next week), return. On Pons 4xx/5xx, **do not cache** the error — a transient 503 should not poison the cache for 30 days.

Rate-limit strategy (Phase 2): **reuse `checkDictRateLimit`** so EN and DE lookups share the same 30/min/user budget. Rationale: a user hammering DE shouldn't get more total capacity than a user using EN; and the Pons shared quota is the real ceiling, not our per-minute bucket. The cache (Phase 1) further dampens load on Pons.

## Critical Implementation Details

- **Secret wiring**: `PONS_API_SECRET` must be declared in `astro.config.mjs` `env.schema` (matching the `SUPABASE_KEY` pattern at `:31`) **before** the service imports it. Local dev: add to `.dev.vars`; production: `npx wrangler secret put PONS_API_SECRET` (per `lessons.md:77-82`, never `wrangler deploy`). The service reads it via `import { getSecret } from "astro:env/server"; const secret = getSecret("PONS_API_SECRET")` — same pattern as `generate.ts:14`. If the secret is missing, the endpoint returns 502 (configured-but-unconfigured posture: fail closed, do not silently call Pons without auth).
- **Pons error → HTTP status mapping**: 200 → 200; 204 → 200 with `entries: []`; 403 → 502 (treat as secret invalid/quota exhausted — caller cannot fix); 404 → 200 with `entries: []` (dictionary `depl` missing is a config error, but indistinguishable from "no entry" to the user — log and return empty); 500/502/503/504 → 502; network failure / `AbortSignal` timeout → 502. **Never return 502 on a 204** — that's the "unknown word" signal.
- **Cache poisoning prevention**: only cache Pons 200 responses (including 200 with empty `hits`). Do not cache 204 (treat 204 as "no entry today" — Pons may add one tomorrow; a 30-day blackout for a valid word is worse than re-fetching). Do not cache any 4xx/5xx. This is a deliberate asymmetry from a naive "cache everything" — it trades 1 extra Pons call per unknown word per month for correctness.
- **Test project placement** (per `lessons.md:112-117` and `testing-external-integrations` archive): service tests → `vitest` `workers` project (real `fetch` is stubbed, no HTMLRewriter needed since Pons returns JSON — but `workers` project keeps the Cloudflare-runtime fidelity); route tests → `node` project (alias `astro:env/server` → `src/test/astro-env-server.stub.ts`, `vi.mock("@/lib/services/ai-rate-limit")` with `{allowed:true}` default, partial-mock `ai` if testing `generate.ts` error mapping).
- **Middleware ordering**: add `/api/dict/de` to `PROTECTED_API_ROUTES` (`src/middleware.ts:8-19`) and `/lookup_word_de` to `PROTECTED_PAGE_ROUTES` (`src/middleware.ts:7`). The existing `isProtected` matcher (`:21-23`) uses `startsWith(route + "/")`, so `/api/dict/de` will match `/api/dict/de/<word>` correctly. **Caution**: `/api/dict` already in the list would also match `/api/dict/de` via `startsWith("/api/dict/")` — verify the existing entry already covers it (it does: `pathname.startsWith("/api/dict/")` is true for `/api/dict/de/foo`). So no new API-route entry is strictly needed; only the page route `/lookup_word_de` must be added. (Phase 2 will double-check by test.)
- **AI tool description** (Phase 4): the LLM picks the tool by description. `lookup_word_de` must say explicitly: *"Look up a **German** word in the Pons German→Polish dictionary. Returns Polish translations, part of speech, subject area, and up to 2 example sentence pairs. Use this when generating flashcards for a German-language set where the user's target language is Polish."* The existing `lookup_word` description must be updated to clarify *"English word in the Cambridge Dictionary"* (already says this — keep as is). Do not let the LLM pick the wrong tool — names and descriptions are the only signal it has.

## Phase 1: Pons service + KV cache

### Overview

Build the data-fetching layer in isolation: a TypeScript service that calls Pons `depl`, normalizes the JSON response to `DictionaryEntry[]`, and caches results in the existing `AI_RATE_LIMIT` KV namespace with a 30-day TTL. No endpoint, no UI — just the service and its unit tests.

### Changes Required:

#### 1.1 Add `PONS_API_SECRET` to the env schema

**File**: `astro.config.mjs`

**Intent**: Declare the new server-only secret so `astro:env/server`'s `getSecret("PONS_API_SECRET")` resolves at runtime. Without this entry, `getSecret` returns `undefined` even if the secret is set in Cloudflare.

**Contract**: Add one line inside `env.schema` (after `GOOGLE_TTS_API_KEY` at `:37`):

```js
PONS_API_SECRET: envField.string({ context: "server", access: "secret", optional: true }),
```

`optional: true` so local dev without a Pons account still builds; the service fails closed at runtime if the secret is missing.

#### 1.2 Create the Pons service

**File**: `src/lib/services/dictionary-de.ts` (new)

**Intent**: Provide `lookupWordDe(word: string): Promise<DictionaryEntry[]>` that calls Pons `depl` with caching, normalization, and Pons-specific error mapping. Mirror the public contract of `dictionary.ts:lookupWord` so callers (endpoint, AI tool) are symmetric.

**Contract**:

- Export `lookupWordDe(word, opts?)` where `opts` is `{ kv?: KVNamespace | null; skipCache?: boolean }` (the endpoint passes its KV; the AI tool in `generate.ts` passes the same `env.AI_RATE_LIMIT`).
- Also export `PONS_CACHE_TTL_SECONDS = 2592000` (30 days) and `ponsCacheKey(word: string): string` returning `pons:de:${normalized}` for test access.
- Internal constants: `PONS_BASE_URL = "https://api.pons.com/v1/dictionary"`, `PONS_DICT = "depl"`, `PONS_LANGUAGE = "pl"`, `PONS_TIMEOUT_MS = 10000`.
- Word normalization: same as Cambridge (`word.trim().replace(/\s+/g, "-").toLowerCase()`) — put in a small internal helper, do not import from `dictionary.ts` (keep files decoupled).
- Fetch: `fetch(url, { headers: { "X-Secret": secret }, signal: AbortSignal.timeout(PONS_TIMEOUT_MS) })`. URL: `${PONS_BASE_URL}?q=${encodeURIComponent(word)}&l=${PONS_DICT}&language=${PONS_LANGUAGE}&fm=1&ref=true`.
- Cache flow (read-through):
  1. If `opts.kv` and not `skipCache`, `await kv.get(ponsCacheKey(word), "json")`. If hit, return the parsed `DictionaryEntry[]` directly.
  2. Fetch from Pons with the timeout above.
  3. If `!response.ok`:
     - 204 → return `[]` (do not cache — see Critical Implementation Details).
     - 403/500/502/503/504 → throw `Error("Pons request failed with status <N>")`.
     - 404 → return `[]` (treat as "no entry"; do not cache).
     - Other 4xx → throw.
  4. Parse `await response.json()` as `PonsHit[]`. Map to `DictionaryEntry[]` (mapping helper below).
  5. If `opts.kv` and the response was 200 (even with empty `hits`), `await kv.put(key, JSON.stringify(entries), { expirationTtl: PONS_CACHE_TTL_SECONDS })`. **Do not cache empty-by-204 results** — only cache successful 200 responses.
  6. Return `entries`.
- Secret missing: if `getSecret("PONS_API_SECRET")` is falsy, throw `Error("PONS_API_SECRET not configured")` — the endpoint maps this to 502.
- Pons JSON → `DictionaryEntry` mapping: walk `hits[].roms[].arabs[].senses[]`. For each `sense`, iterate `translations[]`; each `translation` is one `DictionaryEntry`:
  - `definition` = `translation.target` (the Polish side, strip HTML tags Pons embeds — `<srcref>`, `<headword>` etc. — via a small regex)
  - `type` = `rom.pos` or `arab.pos` or `sense.pos` (first non-empty), else `null`
  - `dictionaryRegion` = `null` (Pons `depl` has no UK/US equivalent)
  - `info` = `sense.subject` (e.g. "Bauwesen", "linguist.") — join multiple with `, ` if array, else `null`
  - `examples` = first 2 entries from `sense.examples` (each example has `source` + `target` — join as `${source} — ${target}`), else `[]`
  - Apply the same `cleanDefinition` rule as Cambridge (`dictionary.ts:16-22`): trim, capitalize first char, strip trailing `:`, collapse whitespace, append `.`. Duplicate the helper locally (do not import from `dictionary.ts`).
- Cap result at **8 entries** to keep payloads reasonable (Cambridge caps examples per sense at 2, but not senses per word; for Pons DE→PL a hard cap on total senses avoids a 50-entry dump for polysemous words like `stellen`).

> **Addendum (verified against the live Pons `depl` API during Phase 3, recorded in progress 3.16):** the actual response shape is `hits[].roms[].arabs[].translations[]` — there is no `senses` level. `type` is read from `rom.wordclass`; `info` from a `<span class="sense">` inside the headword `source`, falling back to `arab.header`; examples are grouped as up to **6** `<German> — <Polish>` pairs per sense (not 2 from a `sense.examples` array). The mapping contract above assumed a shape the live API does not expose; the shipped implementation in `dictionary-de.ts` tracks the real shape, and the cache key was bumped to `pons:de:v2:` to invalidate stale `v1` entries.

#### 1.3 Service unit tests

**File**: `src/lib/services/dictionary-de.test.ts` (new)

**Intent**: Cover the contract of `lookupWordDe` with the same test placements as `dictionary.test.ts` (workers project), plus cache-specific tests the Cambridge suite does not need.

**Contract**: Test cases (each as a separate `it`):

1. Returns `[]` for a Pons 204 (no entries) — stub `fetch` to return `{ status: 204, ok: false }`.
2. Throws on `fetch` rejection (network/DNS) — precondition for endpoint's 502.
3. Throws on `AbortSignal` timeout — stub `fetch` to reject with `TimeoutError`/`AbortError`.
4. Throws on Pons 403 (secret invalid / quota exhausted).
5. Throws on Pons 500/502/503/504.
6. Word normalization (trim, spaces→hyphens, lowercase).
7. Parses a representative Pons `depl` JSON fixture (provide a small embedded fixture) into `DictionaryEntry[]` — assert `definition` is Polish, `type` from `rom.pos`, `info` from `sense.subject`, `examples` joined as `source — target`, max 2 examples.
8. Strips Pons inline HTML tags (`<srcref>...</srcref>`, `<headword>...</headword>`) from `definition`.
9. Caps total entries at 8 for a polysemous-word fixture.
10. Cache hit: stub KV `get` to return a pre-cached `[{...}]`, assert `fetch` is **not** called.
11. Cache miss + 200: stub KV `get` to return `null`, assert `kv.put` called with key `pons:de:<word>`, TTL 2592000, value is the stringified entries.
12. Cache miss + 204: assert `kv.put` is **not** called (do not cache unknown words).
13. Cache miss + 403: assert `kv.put` is **not** called (do not cache errors).
14. `skipCache: true` bypasses both read and write — assert `kv.get` and `kv.put` are not called, `fetch` is called.
15. Secret missing: stub `getSecret` to return `undefined`, assert `lookupWordDe` throws `"PONS_API_SECRET not configured"`.

Project: `vitest` `workers` (real `AbortSignal`, real `TextEncoder`); stub `fetch` with `vi.stubGlobal("fetch", vi.fn())`. Mock `astro:env/server` `getSecret` via `vi.mock("astro:env/server", () => ({ getSecret: vi.fn(...) }))` — verify the alias is already in the `workers` project config; if not, add it.

### Success Criteria:

#### Automated Verification:

- `npx vitest run --project workers src/lib/services/dictionary-de.test.ts` — all 15 cases pass.
- `npm run build` succeeds (typecheck of `dictionary-de.ts` and the env schema change).
- `npx eslint src/lib/services/dictionary-de.ts src/lib/services/dictionary-de.test.ts` passes.

#### Manual Verification:

- In a scratch `npx tsx` script (per `lessons.md:26-36`), call `lookupWordDe("Haus", { kv: null, skipCache: true })` with a real `PONS_API_SECRET` from `.dev.vars` — visually confirm Polish translations come back, not English.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: API endpoint + rate-limit + OpenAPI spec + middleware

### Overview

Expose `lookupWordDe` as `GET /api/dict/de/[word]` with auth, rate-limit (shared with Cambridge via `checkDictRateLimit`), and the Pons-specific error → HTTP status mapping. Update the OpenAPI spec in the same commit (per `lessons.md:84-89`). Add `/lookup_word_de` to the protected page list (the API route is already covered by the existing `/api/dict` entry — verify by test).

### Changes Required:

#### 2.1 Create the endpoint

**File**: `src/pages/api/dict/de/[word].ts` (new)

**Intent**: Auth-gated, rate-limited wrapper around `lookupWordDe` that mirrors `src/pages/api/dict/[word].ts:8-51` but with Pons-specific status mapping and KV passed through for cache.

**Contract**:

- `export const prerender = false;`
- `export const GET: APIRoute = async (context) => { ... }` with this body order:
  1. Auth check (`user?.id` + `supabase`) → 401 if missing.
  2. Trim `context.params.word`, empty → 400.
  3. `const kv = env.AI_RATE_LIMIT as KVNamespace | undefined;`
  4. `const rateLimit = await checkDictRateLimit(kv ?? null, user.id);` → 429 with `Retry-After: 60` if `!rateLimit.allowed`.
  5. `entries = await lookupWordDe(word, { kv: kv ?? null });` in try/catch.
  6. catch → 502 `{ error: "Dictionary service unavailable" }` (covers secret missing, Pons 4xx/5xx, timeout, network).
  7. 200 `{ word, entries }`.
- Imports: `lookupWordDe` from `@/lib/services/dictionary-de`, `checkDictRateLimit` from `@/lib/services/ai-rate-limit`, `env` from `cloudflare:workers`. **Do not** import `getSecret` here — the service handles secret resolution; the endpoint stays symmetric with the Cambridge one.

#### 2.2 Endpoint unit tests

**File**: `src/pages/api/dict/de/[word].test.ts` (new)

**Intent**: Mirror the 6 cases of `src/pages/api/dict/[word].test.ts:1-84` with one addition for the secret-missing path.

**Contract**: Test cases:

1. 401 when no authenticated user; `lookupWordDe` not called.
2. 400 when word is empty after trimming.
3. 429 when `checkDictRateLimit` returns `{allowed:false}`; `lookupWordDe` not called; `Retry-After: 60` header present.
4. 200 with `{ word, entries }` for a valid word; `lookupWordDe` called with `{ kv }`.
5. 200 with empty `entries` for a 204-from-Pons case (mock `lookupWordDe` to resolve `[]`).
6. 502 with `{ error: "Dictionary service unavailable" }` when `lookupWordDe` rejects (covers secret missing, Pons 5xx, timeout).

Project: `node`. Mocks: `vi.mock("@/lib/services/dictionary-de", ...)` for `lookupWordDe`; `vi.mock("@/lib/services/ai-rate-limit", () => ({ checkDictRateLimit: vi.fn(async () => ({ allowed: true, limit: 30, remaining: 29 })) }))` per `lessons.md:112-117`. Verify the `astro:env/server` alias resolves (it does for the existing dict route test, so the pattern is established).

#### 2.3 Update the OpenAPI spec

**File**: `src/lib/openapi/openapi-spec.ts`

**Intent**: Add the new path and re-use the existing `DictionaryEntry` schema (no schema change — Pons fills the same shape with `dictionaryRegion: null`). Per `lessons.md:84-89`, this update is part of the same phase as the endpoint.

**Contract**:

- Add a new path entry `"/api/dict/de/{word}"` alongside the existing `"/api/dict/{word}"` at `:131`.
- `get` operation: `summary: "Look up a German word in the Pons DE→PL dictionary"`, `description` mentioning: Pons API, `l=depl`, Polish translations, 30-day KV cache (unlike Cambridge — explicitly note cache), same 30/min rate limit, also used by AI tool `lookup_word_de` in `generate`.
- `tags: ["Dictionary"]` (same tag, groups the two endpoints in Scalar).
- `security: [{ cookieAuth: [] }]`.
- Responses: 200 (ref `DictionaryEntry`), 400, 401, 429 with `Retry-After`, 502 — copy the structure from the existing `:148-203` block. Update the 502 description to "Pons API unavailable (network/timeout/quota exhausted/secret missing)".
- The `word` parameter description should note "German word or phrase; spaces normalized to hyphens, case-insensitive".
- **Do not** add a new `DictionaryEntry` schema variant — reuse the existing one. The `dictionaryRegion` enum stays `["UK", "US"]` with `nullable: true`; Pons always sends `null`. Add a one-line note to the schema description at `:109` acknowledging that for Pons DE entries, `dictionaryRegion` is always `null` and `info` carries the Pons subject label.

#### 2.4 Middleware: protect the new page route

**File**: `src/middleware.ts`

**Intent**: Add `/lookup_word_de` to `PROTECTED_PAGE_ROUTES` so unauthenticated users are redirected to sign-in instead of seeing the page. The API route is already covered by the `/api/dict` entry (`startsWith("/api/dict/")` matches `/api/dict/de/<word>`), but add an explicit test to prevent regressions if someone reorders the list.

**Contract**: Extend `PROTECTED_PAGE_ROUTES` at `:7` from `["/dashboard", "/sets", "/generate", "/settings", "/lookup_word"]` to include `"/lookup_word_de"`. No change to `PROTECTED_API_ROUTES` — but add a test asserting `/api/dict/de/foo` is gated.

#### 2.5 Middleware test (small)

**File**: extend an existing `src/middleware.test.ts` if present, else add a focused test alongside `src/pages/api/dict/de/[word].test.ts`

**Intent**: Verify the existing `/api/dict` matcher covers `/api/dict/de/<word>` (regression guard) and that `/lookup_word_de` redirects unauthenticated users.

**Contract**: Two assertions:

1. Unauthenticated GET `/api/dict/de/Haus` returns 401 (proves the existing `/api/dict` entry covers the nested DE route).
2. Unauthenticated GET `/lookup_word_de` redirects to `/auth/signin` (302).

If there is no existing middleware test file, do not create a new one just for this — instead cover case (1) in `src/pages/api/dict/de/[word].test.ts` test case #1 (already does 401 when no user) and document case (2) as a Phase 3 manual check.

### Success Criteria:

#### Automated Verification:

- `npx vitest run --project node src/pages/api/dict/de` — all 6 endpoint tests pass.
- `npx vitest run` — full suite green, no regression in Cambridge tests.
- `npm run build` succeeds (Astro picks up the new route).
- `npx eslint src/pages/api/dict/de/\[word\].ts src/lib/openapi/openapi-spec.ts src/middleware.ts` passes.
- OpenAPI spec sanity: start `npm run dev`, open `/docs/api`, confirm `/api/dict/de/{word}` appears under the "Dictionary" tag with the correct response schema.

#### Manual Verification:

- With `PONS_API_SECRET` set in `.dev.vars` and local Supabase running, sign in, `curl -b cookies.txt http://localhost:4321/api/dict/de/Haus` — expect 200 with Polish translations.
- `curl http://localhost:4321/api/dict/de/Haus` (no cookies) — expect 401.
- Hit the endpoint 31 times in under a minute — expect 429 on the 31st with `Retry-After: 60`.
- Look up the same word twice; the second response should be measurably faster (cache hit). Verify `pons:de:haus` is in local KV via `wrangler kv --local key list`.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: UI — `/lookup_word_de` page + i18n + client wrapper

### Overview

Build the user-facing surface: a new Astro page `src/pages/lookup_word_de.astro`, a React island `LookupWordPageDe.tsx`, and a client wrapper `dict-de-client.ts`. Mirror the Cambridge UX so a user who knows the EN page can use the DE page without re-learning. Add a DE-specific entry point on `SetDetailPage` and i18n strings. Do **not** modify the existing Cambridge UI files.

### Changes Required:

#### 3.1 Client wrapper

**File**: `src/lib/dict-de-client.ts` (new)

**Intent**: Browser-side fetcher for `/api/dict/de/<word>`, structurally identical to `src/lib/dict-client.ts:1-44` so error handling and types stay consistent.

**Contract**:

- Export `DictionaryLookupResult` = `{ word: string; entries: DictionaryEntry[] }` (re-export the type alias; do not duplicate the `DictionaryEntry` interface).
- Export `DictionaryLookupError` (same shape as `dict-client.ts:13-21`: `extends Error`, `status: number`, `status === 0` for network failure).
- Export `lookupWordDeClient(word: string): Promise<DictionaryLookupResult>` — `fetch("/api/dict/de/${encodeURIComponent(word)}", { credentials: "include" })`, throw `DictionaryLookupError(0, "Network error")` on transport failure, throw `DictionaryLookupError(res.status)` on `!res.ok`, else `res.json()`.

#### 3.2 React island

**File**: `src/components/lookup/LookupWordPageDe.tsx` (new)

**Intent**: Polish-localized mirror of `LookupWordPage.tsx` calling `lookupWordDeClient`. Reuse the same component structure (form → results → create-card) and the same `I18nProvider`-inside-island pattern (per `lessons.md:66-75` — provider must live inside the hydrated component, not wrap it from the `.astro` parent).

**Contract**:

- `export function LookupWordPageDe({ setId, setName, locale }: Props)` — `Props` is `{ setId: string; setName: string; locale: SupportedLocale }`.
- Internal structure mirrors `LookupWordPage.tsx`: `LookupWordPageDe` wraps `LookupWordPageDeInner` in `<I18nProvider locale={locale}>`.
- Use `lookupWordDeClient` instead of `lookupWordClient`. Reuse the same out-of-order protection (`searchSeqRef` pattern at `LookupWordPage.tsx:42, :62, :72, :76, :84`).
- Reuse `EntryCard` rendering shape (`LookupWordPage.tsx:342-367`): word, type italic, region badge (will always be `null` for Pons — **hide the badge when `entry.dictionaryRegion === null`**, do not render an empty badge), info muted, definition paragraph, examples list. Extract `EntryCard` into a shared `src/components/lookup/EntryCard.tsx` if it is not already extracted; if extracting, update `LookupWordPage.tsx` to import the shared one (one-line change, no behavior diff).
- `CreateCardForm` can be reused as-is from `LookupWordPage.tsx:186-283` — extract to `src/components/lookup/CreateCardForm.tsx` and import in both islands.
- Per `lessons.md:91-96`: the island reads no `localStorage` at init, so `client:load` is correct (not `client:only`).
- Max-visible-cards scroll logic (`LookupWordPage.tsx:286-325`) — duplicate the constants and `useLayoutEffect`; do not over-engineer a shared hook in this phase.

#### 3.3 Astro page

**File**: `src/pages/lookup_word_de.astro` (new)

**Intent**: Server-rendered wrapper that resolves the active set, redirects non-owners to `/dashboard`, and hydrates the DE island. Structurally identical to `src/pages/lookup_word.astro:1-35`.

**Contract**:

- `export const prerender = false;`
- Same `getSetByIdForUser` ownership gate as `lookup_word.astro:16-28` — redirect to `/dashboard` if `!isOwner || !setId || !setName`.
- Render `<Layout title={t("lookup_de.title")} locale={locale}><LookupWordPageDe setId={setId} setName={setName} locale={locale} client:load /></Layout>`.

#### 3.4 i18n strings

**File**: `src/lib/i18n/locales/pl/lookup.json` and `src/lib/i18n/locales/en/lookup.json`

**Intent**: Add a parallel `lookup_de.*` namespace so the DE page reads Polish/English copy independent of the Cambridge page. Do not modify existing `lookup.*` keys.

**Contract**: New keys (Polish first, English mirror in the `en` file):

- `lookup_de.title` — "Wyszukaj słowo niemieckie" / "Look up a German word"
- `lookup_de.heading` — "Wyszukaj słowo niemieckie" / "Look up a German word"
- `lookup_de.intro` — "Wyszukuj tłumaczenia niemiecko-polskie w słowniku Pons, a następnie utwórz fiszkę w swoim zestawie." / "Look up German→Polish translations in the Pons dictionary, then create a flashcard in your set."
- `lookup_de.addingTo` — reuse `lookup.addingTo` (do not duplicate)
- `lookup_de.backToSet`, `lookup_de.backToGenerate` — reuse the `lookup.*` equivalents
- `lookup_de.searchPlaceholder` — "Słowo lub fraza niemiecka" / "German word or phrase"
- `lookup_de.searchButton`, `lookup_de.searching` — reuse or duplicate (translation is identical)
- `lookup_de.responseHeading` — "Odpowiedź ze słownika Pons" / "Response from Pons dictionary"
- `lookup_de.noResults` — "Nie znaleziono tłumaczenia dla \"{{word}}\"." / "No translation found for \"{{word}}\"."
- `lookup_de.error.rateLimit` / `.unavailable` / `.generic` — reuse `lookup.error.*` (semantics identical)
- `lookup_de.form.*` — reuse `lookup.form.*`

For reused keys, the DE island calls `t("lookup.addingTo", ...)` directly — i18n keys are global, not namespaced per page. Only genuinely DE-specific copy gets new keys.

#### 3.5 Entry point on SetDetailPage

**File**: `src/components/sets/SetDetailPage.tsx`

**Intent**: Let a user reach `/lookup_word_de?setId=...` from a German set's detail page, parallel to the existing `t("set.lookupWord")` button at `:239` that links to `/lookup_word`.

**Contract**: Add a second button (or a dropdown split) labeled `t("set.lookupWordDe")` linking to `/lookup_word_de?setId=${setId}`. Add the i18n key `set.lookupWordDe` = "Wyszukaj słowo niemieckie" / "Look up German word" in `common.json` for both locales. **Do not infer the set's language** — both buttons are visible; the user picks. (In a future change, set-language metadata can hide the irrelevant button; not this change.)

### Success Criteria:

#### Automated Verification:

- `npm run build` succeeds (Astro compiles the new page + island).
- `npx eslint src/lib/dict-de-client.ts src/components/lookup/LookupWordPageDe.tsx src/pages/lookup_word_de.astro src/components/sets/SetDetailPage.tsx` passes (per `lessons.md:59-64`, skip `.astro` from lint — but include the `.tsx`/`.ts`).
- `npx vitest run` — full suite green (no new tests for the UI in this phase; the island is a thin wrapper over the already-tested client + endpoint, and Snapshot/E2E tests are out of scope for this change).

#### Manual Verification:

- Sign in, open a German set's detail page, click the new "Wyszukaj słowo niemieckie" button — land on `/lookup_word_de?setId=...` with the correct set name shown.
- Look up `Haus` — see Polish translations within ~2s (cache hit from Phase 2 manual test), no region badge, subject label visible (e.g. "budownictwo" / "lingwist.").
- Look up a nonexistent word (`qqqqxyz`) — see the empty state with the "no translation found" message.
- Submit the create-card form — flashcard is saved to the set (verify on the set detail page).
- Hit the page without signing in — redirect to `/auth/signin`.
- Open the page directly without `?setId=...` — redirect to `/dashboard`.
- Open `/lookup_word_de?setId=<someone-elses-set>` as non-owner — redirect to `/dashboard`.
- Verify the existing Cambridge `/lookup_word` page still works unchanged (regression check).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: AI tool integration in `generate.ts`

### Overview

Wire `lookupWordDe` into the flashcard-generation pipeline as a second OpenRouter tool `lookup_word_de`, so the LLM can autonomously look up Polish translations of German words when generating flashcards for a German set. Do not modify the existing `lookup_word` tool — add alongside.

### Changes Required:

#### 4.1 Declare and dispatch the second tool

**File**: `src/pages/api/sets/[id]/generate.ts`

**Intent**: Give the LLM a way to call the Pons dictionary when the input text is German and the user's target flashcard language is Polish. The LLM picks the tool by name + description, so the description must be unambiguous about "German word, Polish translation."

**Contract**:

- Import `lookupWordDe` from `@/lib/services/dictionary-de` alongside the existing `lookupWord` import at `:13`.
- Add `DICTIONARY_TOOL_DE: ToolDefinition` (after `DICTIONARY_TOOL` at `:19-31`):
  - `name: "lookup_word_de"`
  - `description`: "Look up a German word in the Pons German→Polish dictionary. Returns Polish translations, part of speech, subject area, and up to 2 example sentence pairs per sense. Use this when generating flashcards for a German-language set where the user wants Polish translations. For English words, use `lookup_word` (Cambridge) instead."
  - `parameters`: same shape as `DICTIONARY_TOOL` — `{ word: string }`.
- Extend `handleToolCall(name, args)` at `:33-43` to dispatch both names:
  - `if (name === "lookup_word") { ... existing ... }`
  - `else if (name === "lookup_word_de") { const word = ...; const entries = await lookupWordDe(word, { kv: env.AI_RATE_LIMIT ?? null }); return JSON.stringify(entries); }` — wrap in try/catch returning `{ error: "Dictionary lookup failed" }` (same posture as the EN branch).
  - The KV is passed so the AI tool benefits from the same cache as the endpoint — a `lookup_word_de` call for a word the user just looked up via the UI should be a cache hit.
- Pass both tools at `:140`: `tools: [DICTIONARY_TOOL, DICTIONARY_TOOL_DE]`.
- **Do not** change the system prompt or any other AI behavior. The LLM decides which tool to call based on the input language and tool descriptions.

#### 4.2 Generate-route test for the new tool

**File**: extend `src/pages/api/sets/[id]/generate.test.ts` if it has tool-dispatch tests, else add one new case

**Intent**: Verify `handleToolCall` dispatches `lookup_word_de` to `lookupWordDe` and returns JSON-stringified entries; verify an unknown tool name still returns `{ error: "Unknown tool" }`.

**Contract**: New `it`:

1. `handleToolCall("lookup_word_de", { word: "Haus" })` with `lookupWordDe` mocked to resolve `[{ definition: "dom", type: "noun", dictionaryRegion: null, info: null, examples: [] }]` → returns `JSON.stringify` of that array.
2. `handleToolCall("unknown", {})` → returns `JSON.stringify({ error: "Unknown tool" })` (regression: adding the DE branch must not break the unknown-tool fallback).
3. If `handleToolCall` is not directly exported (it is a module-internal function in `generate.ts:33`), test indirectly by mocking `generateFlashcardProposals` to capture the `tools` argument and asserting it contains both `DICTIONARY_TOOL` and `DICTIONARY_TOOL_DE` (by name). Use the partial-mock pattern from `lessons.md:112-117` (`{ ...(await orig()), generateFlashcardProposals: vi.fn() }`) so `getAiErrorHttpStatus` stays real.

Project: `node`. Mocks: `vi.mock("@/lib/services/dictionary-de", () => ({ lookupWordDe: vi.fn() }))`, `vi.mock("@/lib/services/ai-rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ allowed: true, limit: 10, remaining: 9 })) }))`, `vi.mock("@/lib/services/dictionary", () => ({ lookupWord: vi.fn() }))` (to keep the EN branch from firing if the test triggers it).

### Success Criteria:

#### Automated Verification:

- `npx vitest run --project node src/pages/api/sets` — new and existing generate tests pass.
- `npx vitest run` — full suite green.
- `npm run build` succeeds.
- `npx eslint src/pages/api/sets/\[id\]/generate.ts` passes.

#### Manual Verification:

- With `PONS_API_SECRET` set, sign in, open a German set, go to `/generate`, paste a short German text (e.g. a 2-sentence paragraph about daily routine), submit — observe in the Cloudflare Workers local dev logs (`npm run dev` terminal) that `lookup_word_de` tool calls fire (or not, depending on the LLM's judgment — the key is the tool is available and the LLM can invoke it without errors).
- Verify the generated flashcards have Polish fronts/backs when the set is a German→Polish set.
- Verify an English set's generation still uses `lookup_word` (not `lookup_word_de`) — regression check on an EN set.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- `dictionary-de.test.ts` (workers project) — 15 cases covering: Pons status mapping (200/204/403/404/500+), network failure, timeout, normalization, JSON parsing, HTML tag stripping, 8-entry cap, cache hit/miss/poisoning-prevention, secret missing. See Phase 1.3.
- `dict/de/[word].test.ts` (node project) — 6 cases mirroring the Cambridge endpoint test + secret-missing path. See Phase 2.2.
- `generate.test.ts` extension (node project) — 3 new cases for `lookup_word_de` dispatch. See Phase 4.2.

### Integration Tests:

- No new integration tests in this change. The endpoint-to-service integration is covered by the route unit tests with `lookupWordDe` mocked; the service-to-Pons integration is covered manually in Phase 1 manual verification with a real Pons secret.

### Manual Testing Steps:

1. Phase 1: scratch `npx tsx` script calling `lookupWordDe("Haus")` with a real secret — Polish translations come back.
2. Phase 2: `curl` against local dev `/api/dict/de/Haus` (auth + unauth + rate-limit + cache hit timing).
3. Phase 3: full UI flow on `/lookup_word_de` — lookup, empty state, create card, auth redirect, ownership redirect, Cambridge page regression.
4. Phase 4: `/generate` on a German set — observe `lookup_word_de` tool calls in dev logs; verify Polish flashcards; verify EN set still uses `lookup_word`.

## Performance Considerations

- **Cache hit latency**: ~10-50ms (KV read) vs ~500-2000ms (Pons round-trip). After warm-up, most repeat lookups are cache hits — the 1000/month Pons quota is not the binding constraint for active users; our 30/min rate-limit is.
- **Cold-cache miss**: Pons typical response is 300-800ms for `depl`; with the 10s timeout we have a hard ceiling. Worst case for the user is a ~10s wait on a hung Pons → 502.
- **Cache size**: each `DictionaryEntry[]` is ~200-2000 bytes; at 1000 cached words we are ~2MB in KV — well under Cloudflare KV's per-key 25 MiB limit and the namespace's free-tier quota.
- **No `Promise.all` fanout**: each lookup is a single Pons request; we do not parallelize multiple words. If the AI tool fires 5 `lookup_word_de` calls in one generation, they are sequential in `handleToolCall` — acceptable for MVP (the AI generation itself takes 5-15s; 5 sequential 500ms Pons calls add 2.5s, within budget).
- **AbortSignal.timeout**: 10s, matching the AI provider timeout reduced in `testing-external-integrations`. Cloudflare Workers supports `AbortSignal.timeout` natively.

## Migration Notes

- **No database migration** — no new Supabase tables, no RLS changes. All state is in KV (cache + rate-limit) and Cloudflare secrets.
- **No data backfill** — the cache starts cold; first lookups populate it.
- **Rollback**: revert the four phase commits. The `PONS_API_SECRET` Cloudflare secret can stay (harmless if unused). KV entries with prefix `pons:de:` will expire naturally after 30 days, or can be purged with `wrangler kv key delete` — no urgency.
- **Feature flag**: not added. The feature is gated by the existence of `PONS_API_SECRET` — if the secret is missing, the endpoint returns 502 but does not crash; the UI page still loads (it just shows errors on lookup). If a safer rollout is desired, add a `PONS_ENABLED` boolean secret later (out of scope).

## References

- Research: `context/changes/pons-dictionary-integration/research.md`
- Reference implementation (Cambridge): `context/archive/2026-06-18-cambridge-dict-cli/plan.md`
- Test patterns for external integrations: `context/archive/2026-07-08-testing-external-integrations/research.md`
- Pons API docs: `https://en.pons.com/assets/docs/api_dict.pdf` (endpoint, params, status codes)
- Pons API terms: `https://de.pons.com/p/agb-api` (1000/month free, 3 EUR/1000 above)
- Relevant lessons: `context/foundation/lessons.md` L26-36 (local Supabase JWT testing), L59-64 (ESLint on .astro), L66-75 (React Context inside island), L77-82 (deploy via push, secret via wrangler), L84-89 (OpenAPI sync), L91-96 (localStorage islands), L105-110 (scraper `response.ok` check), L112-117 (route tests with `astro:env/server`)
- Code references: `src/lib/services/dictionary.ts:24` (`lookupWord`), `src/pages/api/dict/[word].ts:8-51` (endpoint), `src/lib/services/ai-rate-limit.ts:37-72` (`checkDictRateLimit`), `src/lib/openapi/openapi-spec.ts:108-206` (spec), `src/components/lookup/LookupWordPage.tsx:21-367` (UI), `src/lib/dict-client.ts:29-43` (client), `src/pages/lookup_word.astro:1-35` (page), `src/pages/api/sets/[id]/generate.ts:19-43,140` (AI tool), `src/middleware.ts:7,16` (protected routes), `astro.config.mjs:29-38` (env schema)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Pons service + KV cache

#### Automated

- [x] 1.1 `PONS_API_SECRET` declared in `astro.config.mjs` env schema, `npm run build` succeeds — a2b2817
- [x] 1.2 `src/lib/services/dictionary-de.ts` created with `lookupWordDe`, `ponsCacheKey`, `PONS_CACHE_TTL_SECONDS` exports — a2b2817
- [x] 1.3 `src/lib/services/dictionary-de.test.ts` — all 15 cases pass under `npx vitest run --project workers` — a2b2817
- [x] 1.4 `npx eslint src/lib/services/dictionary-de.ts src/lib/services/dictionary-de.test.ts` passes — a2b2817

#### Manual

- [x] 1.5 Scratch `npx tsx` script confirms `lookupWordDe("Haus", { kv: null, skipCache: true })` returns Polish translations with a real `PONS_API_SECRET` — a2b2817

### Phase 2: API endpoint + rate-limit + OpenAPI spec + middleware

#### Automated

- [x] 2.1 `src/pages/api/dict/de/[word].ts` created with the 7-step body order (auth, trim, KV, rate-limit, lookup, 502, 200) — 0ea756e
- [x] 2.2 `src/pages/api/dict/de/[word].test.ts` — all 6 cases pass under `npx vitest run --project node` — 0ea756e
- [x] 2.3 `src/lib/openapi/openapi-spec.ts` updated with `/api/dict/de/{word}` path reusing `DictionaryEntry` schema — 0ea756e
- [x] 2.4 `src/middleware.ts` — `/lookup_word_de` added to `PROTECTED_PAGE_ROUTES` — 0ea756e
- [x] 2.5 `npx vitest run` full suite green (no Cambridge regression) — 0ea756e
- [x] 2.6 `npm run build` succeeds — 0ea756e
- [x] 2.7 `npx eslint src/pages/api/dict/de/\[word\].ts src/lib/openapi/openapi-spec.ts src/middleware.ts` passes — 0ea756e

#### Manual

- [x] 2.8 `/docs/api` shows `/api/dict/de/{word}` under "Dictionary" tag — 0ea756e
- [x] 2.9 `curl` authenticated `/api/dict/de/Haus` returns 200 with Polish translations — 0ea756e
- [x] 2.10 `curl` unauthenticated returns 401 — 0ea756e
- [x] 2.11 31 rapid requests → 429 with `Retry-After: 60` — 0ea756e
- [x] 2.12 Second lookup of same word is measurably faster (cache hit); `pons:de:haus` visible in local KV — 0ea756e

### Phase 3: UI — `/lookup_word_de` page + i18n + client wrapper

#### Automated

- [x] 3.1 `src/lib/dict-de-client.ts` created with `lookupWordDeClient`, `DictionaryLookupError`, `DictionaryLookupResult` — ff686b5
- [x] 3.2 `src/components/lookup/LookupWordPageDe.tsx` created; `EntryCard` and `CreateCardForm` extracted to shared files if not already — ff686b5
- [x] 3.3 `src/pages/lookup_word_de.astro` created with ownership gate matching `lookup_word.astro` — ff686b5
- [x] 3.4 `src/lib/i18n/locales/{pl,en}/lookup.json` and `common.json` updated with `lookup_de.*` and `set.lookupWordDe` keys — ff686b5
- [x] 3.5 `src/components/sets/SetDetailPage.tsx` — "Wyszukaj słowo niemieckie" button added linking to `/lookup_word_de?setId=...` — ff686b5
- [x] 3.6 `npm run build` succeeds — ff686b5
- [x] 3.7 `npx eslint src/lib/dict-de-client.ts src/components/lookup/LookupWordPageDe.tsx src/components/sets/SetDetailPage.tsx` passes — ff686b5
- [x] 3.16 Example rows grouped under their sense as `"<German> — <Polish>"` pairs (service + `EntryCard`); cache prefix bumped to `pons:de:v2`; service test #16 covers it — ff686b5

#### Manual

- [x] 3.8 German set detail page → "Wyszukaj słowo niemieckie" → `/lookup_word_de?setId=...` with correct set name — ff686b5
- [x] 3.9 Lookup `Haus` → Polish translations within ~2s, no region badge, subject label visible — ff686b5
- [x] 3.10 Lookup `qqqqxyz` → "no translation found" empty state — ff686b5
- [x] 3.11 Create-card form saves a flashcard to the set (verified on set detail page) — ff686b5
- [x] 3.12 Unauthenticated access redirects to `/auth/signin` — ff686b5
- [x] 3.13 Direct access without `?setId=...` redirects to `/dashboard` — ff686b5
- [x] 3.14 Access as non-owner of someone else's set redirects to `/dashboard` — ff686b5
- [x] 3.15 Cambridge `/lookup_word` page still works unchanged (regression) — ff686b5

### Phase 4: AI tool integration in `generate.ts`

#### Automated

- [x] 4.1 `src/pages/api/sets/[id]/generate.ts` — `DICTIONARY_TOOL_DE` declared, `handleToolCall` dispatches both tools, `tools: [DICTIONARY_TOOL, DICTIONARY_TOOL_DE]` passed — 2cd38b4
- [x] 4.2 `src/pages/api/sets/[id]/generate.test.ts` — 3 new cases pass (`lookup_word_de` dispatch, unknown-tool fallback, both tools in `tools` array) — 2cd38b4
- [x] 4.3 `npx vitest run` full suite green — 2cd38b4
- [x] 4.4 `npm run build` succeeds — 2cd38b4
- [x] 4.5 `npx eslint src/pages/api/sets/\[id\]/generate.ts` passes — 2cd38b4

#### Manual

- [x] 4.6 `/generate` on a German set with a short German input text → `lookup_word_de` tool calls visible in `npm run dev` logs; generated flashcards have Polish fronts/backs — 2cd38b4
- [x] 4.7 `/generate` on an English set → still uses `lookup_word` (not `lookup_word_de`) — regression check — 2cd38b4