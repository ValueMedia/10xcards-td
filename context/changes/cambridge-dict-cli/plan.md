# Cambridge Dictionary CLI Integration — Implementation Plan

## Overview

Reimplement the `cambd` Python CLI tool as a TypeScript service running on Cloudflare Workers, exposed as `GET /api/dict/[word]`, and integrated into the flashcard generation pipeline via OpenRouter function-calling so the LLM can autonomously look up word definitions, examples, and CEFR levels while creating flashcards.

## Current State Analysis

- **cambd** (`C:\Users\fract\Documents\apps\cambridge-dict-promts\cambd\cambd\cambd.py`): scrapes `dictionary.cambridge.org` via two endpoints (spellcheck + definitions), parses HTML with BeautifulSoup, returns structured dicts `{Definition, Type, DictionaryRegion, Info, Examples}`, caches in SQLite. No error handling, no rate limiting.
- **10xCards AI pipeline** (`src/lib/services/ai.ts:125-204`): single-turn chat completion to OpenRouter — sends system + user messages, parses JSON response. No tool/function definitions, no multi-turn support.
- **API route pattern** (`src/pages/api/sets/[id]/generate.ts`): auth guard → zod validation → rate limit (KV, hourly) → service call → JSON response. Consistent across all endpoints.
- **Rate limiting** (`src/lib/services/ai-rate-limit.ts`): Cloudflare KV, hourly buckets, key format `ai:hourly:{userId}:{YYYY-MM-DDTHH}`.
- **Middleware** (`src/middleware.ts:8-16`): `PROTECTED_API_ROUTES` guards `/api/sets`, `/api/flashcards`, etc. New dict endpoint must be added here.
- **No existing dictionary, MCP, or tool-calling infrastructure** in the codebase.

### Key Discoveries

- OpenRouter supports OpenAI-compatible function-calling (`tools` parameter in chat completion request) — `src/lib/services/ai.ts:157-164` currently sends only `model`, `messages`, `temperature`.
- Cloudflare Workers have native `HTMLRewriter` (streaming CSS-selector-based HTML parser) — no npm dependency needed for scraping.
- Cambridge Dictionary HTML structure uses 6 CSS classes: `.dictionary`, `.ddef_block`, `.region`, `.dsense_pos`/`.dpos`, `.def-info`, `.ddef_d`, `.examp` — `cambd.py:73-114`.
- Word normalization: `.strip().replace(" ", "-").lower()` — `cambd.py:181`.
- Invalid-word detection: 302 redirect chain ending at base URL — `cambd.py:63-68`.

## Desired End State

1. `GET /api/dict/[word]` returns all UK+US definitions with CEFR levels, part of speech, and up to 2 examples per definition. Auth required, rate-limited at 30 req/min per user. Returns `[]` for unknown words.
2. `POST /api/sets/[id]/generate` sends a `tools` array with the dictionary function definition to OpenRouter. When the LLM requests a word lookup, the server executes it against the local scraper and feeds the result back in the same request cycle. The LLM receives dictionary data inline and uses it to produce richer flashcards.
3. No cache — every request scrapes live. Errors from Cambridge Dictionary propagate to the LLM as tool-call error responses.

## What We're NOT Doing

- No spellcheck/suggestions endpoint (cambd's `get_suggestions`). Unknown words return `[]`.
- No cache (SQLite, KV, or Supabase). Live scraping only.
- No MCP server. Function-calling via OpenRouter is the sole integration path.
- No US/UK region filter parameter on the endpoint. Always returns both regions.
- No CLI or standalone tool. API-only, consumed by the generate pipeline.
- No retry logic on Cambridge fetch failures. Single attempt, propagate error.

## Rollback

- **Phase 3 rollback**: removing the `tools` parameter from the `generateFlashcardProposals` call in `generate.ts` reverts to single-turn behavior. The function-calling loop code remains in `ai.ts` but is never triggered.
- **Phase 2 rollback**: removing `src/pages/api/dict/[word].ts` and the `/api/dict` entry from `PROTECTED_API_ROUTES` disables the dict endpoint. The scraper service (`dictionary.ts`) can remain — it's only used by the endpoint and the tool handler.
- **Phase 1 rollback**: removing `src/lib/services/dictionary.ts` and the `DictionaryEntry` type from `src/types.ts`. No other code depends on them until Phase 2+3 wire them in.

## Implementation Approach

Three phases, each building on the previous:

1. **Scraper service** — pure TypeScript function using `HTMLRewriter`, no HTTP endpoint yet.
2. **API endpoint** — wires the scraper behind `GET /api/dict/[word]` with auth, rate-limit, and error handling.
3. **Function-calling integration** — modifies the AI pipeline to send tool definitions and handle multi-turn `tool_calls` responses.

## Critical Implementation Details

- **HTMLRewriter streaming model**: `HTMLRewriter` is event-driven — handlers fire as the HTML streams through. State must be accumulated in closures (arrays, stacks). The scraper needs to track: current dictionary region, current definition block, and collect entries across multiple `.dictionary` sections. This is unlike BeautifulSoup's tree-based API — plan for nested handler registration.
- **Tool-call loop termination**: OpenRouter may return multiple `tool_calls` in one response, or a mix of `content` + `tool_calls`. The implementation must handle: (a) no tool calls → return content as before, (b) tool calls present → execute all, append results as `role: "tool"` messages, re-request, (c) guard against infinite loops with a max turn limit (e.g., 5 round-trips).
- **Rate-limit key prefix**: Use `dict:minute:` prefix in the same `AI_RATE_LIMIT` KV namespace (no new binding needed). Minute-granularity key: `dict:minute:{userId}:{YYYY-MM-DDTHH:MM}` with 60s TTL.

## Phase 1: Dictionary Scraper Service

### Overview

Create `src/lib/services/dictionary.ts` with a `lookupWord(word: string): Promise<DictionaryEntry[]>` function that fetches and parses Cambridge Dictionary HTML using the native Cloudflare Workers `HTMLRewriter`.

### Changes Required

#### 1. Dictionary types

**File**: `src/types.ts` (append)

**Intent**: Define the `DictionaryEntry` interface matching cambd's output shape so the scraper, endpoint, and AI pipeline share a single type.

**Contract**: Add `DictionaryEntry` interface with fields: `definition: string`, `type: string | null` (part of speech), `dictionaryRegion: "UK" | "US"`, `info: string | null` (CEFR + labels), `examples: string[]` (max 2).

#### 2. Dictionary scraper service

**File**: `src/lib/services/dictionary.ts` (new)

**Intent**: Reimplement cambd's `get_definitions()` in TypeScript using `fetch` + `HTMLRewriter`. No cache, no spellcheck — definitions only.

**Contract**:
- Export `async function lookupWord(word: string): Promise<DictionaryEntry[]>`
- Normalize word: `word.trim().replace(/\s+/g, "-").toLowerCase()`
- Fetch `https://dictionary.cambridge.org/dictionary/english/{normalizedWord}` with headers `{ "User-Agent": "Mozilla/5.0 ...", "Accept-Language": "en-US,en;q=0.5" }`
- Detect invalid word: if response has redirect chain (check `response.redirected` + final URL equals base URL), return `[]`
- Parse with `HTMLRewriter`:
  - Selector `.dictionary` → enter dictionary block, capture `.region` text for region
  - Selector `.ddef_block` (within `.dictionary`) → enter definition block
  - Within `.ddef_block`: `.dsense_pos` or fallback to parent's `.dpos` for word type; `.def-info` for CEFR/labels; `.ddef_d` for definition text; `.examp` for examples (max 2)
  - Clean definition text: strip, capitalize, remove trailing `:`, collapse whitespace, append `.`
- Return `DictionaryEntry[]` — empty array if no definitions found
- No try/catch — let fetch errors propagate to caller

#### 3. Unit tests for scraper

**File**: `src/lib/services/dictionary.test.ts` (new)

**Intent**: Verify HTML parsing logic against saved HTML fixtures (mock fetch), covering: valid word with multiple definitions, word not found (redirect), empty page, missing optional fields (type, info, examples).

**Contract**: Vitest tests using `vi.stubGlobal("fetch", ...)` with HTML fixtures. Test cases:
- Word with UK+US definitions, CEFR levels, examples
- Word with missing `dsense_pos` (falls back to `dpos`)
- Word with >2 examples (truncates to 2)
- Invalid word (redirect to base URL) → returns `[]`
- Definition text cleaning (trailing colon, whitespace collapse, capitalization)

### Success Criteria

#### Automated Verification

- Phase 1 files compile (no new tsc errors in `dictionary.ts`/`types.ts`): `npx tsc --noEmit 2>&1 | grep -E "dictionary.ts|types.ts"` returns nothing. NOTE: project-wide `npx tsc --noEmit` currently exits non-zero on pre-existing errors unrelated to this change (i18n, user-settings, generate.ts AI_RATE_LIMIT) — out of scope for Phase 1.
- Unit tests pass on the real HTMLRewriter (workers project): `npx vitest run --project workers`
- Linting passes: `npx eslint src/lib/services/dictionary.ts src/lib/services/dictionary.test.ts src/types.ts`

#### Manual Verification

- None (pure service, no UI)

---

## Phase 2: API Endpoint `GET /api/dict/[word]`

### Overview

Expose the dictionary scraper as an authenticated, rate-limited API endpoint following existing route patterns.

### Changes Required

#### 1. API endpoint

**File**: `src/pages/api/dict/[word].ts` (new)

**Intent**: Wire `lookupWord` behind a GET endpoint with auth guard, rate limiting (30/min per user), and JSON response.

**Contract**:
- `export const prerender = false`
- `export const GET: APIRoute` — extract `word` from `context.params.word`, validate non-empty after trimming
- Auth guard: `if (!user?.id || !supabase) return 401`
- Rate limit: check KV key `dict:minute:{userId}:{YYYY-MM-DDTHH:MM}` with limit 30, TTL 60s. Reuse `AI_RATE_LIMIT` KV binding with different key prefix. **Implementation**: create a new `checkDictRateLimit(kv, userId)` function in `src/lib/services/ai-rate-limit.ts` (do NOT refactor the existing `checkRateLimit` — it has a different contract: hourly vs minute, different prefix and TTL).
- Call `lookupWord(word)` — if fetch throws (network error, timeout), return 502 `{ error: "Dictionary service unavailable" }`
- Return 200 `{ word, entries: DictionaryEntry[] }` — empty `entries` array when word not found
- Zod validation on response shape (optional, for consistency)

#### 2. Middleware protection

**File**: `src/middleware.ts` (line 8-16)

**Intent**: Add `/api/dict` to `PROTECTED_API_ROUTES` so unauthenticated requests get 401 before reaching the handler.

**Contract**: Append `"/api/dict"` to the `PROTECTED_API_ROUTES` array.

#### 3. Integration test for endpoint

**File**: `src/pages/api/dict/[word].test.ts` (new — or colocate with scraper tests if simpler)

**Intent**: Verify the endpoint's auth, rate-limit, and response behavior end-to-end with mocked `lookupWord`.

**Contract**: Vitest tests mocking `lookupWord` and `context.locals`:
- 401 when no user
- 429 when rate limit exceeded
- 200 with entries for valid word
- 200 with empty entries for unknown word
- 502 when `lookupWord` throws

### Success Criteria

#### Automated Verification

- TypeScript compiles: `npx tsc --noEmit`
- Unit/integration tests pass: `npx vitest run src/pages/api/dict`
- Linting passes: `npx eslint src/pages/api/dict/[word].ts src/middleware.ts`

#### Manual Verification

- `curl http://localhost:8787/api/dict/hello` (authenticated, via `wrangler dev` — `HTMLRewriter` requires the workerd runtime, `astro dev` may not support it)
- `curl http://localhost:8787/api/dict/xyznotaword` returns `{ word: "xyznotaword", entries: [] }`
- 31st request within a minute returns 429
- Unauthenticated request returns 401

---

## Phase 3: Function-Calling Integration in AI Pipeline

### Overview

Modify `generateFlashcardProposals` to accept tool definitions, send them to OpenRouter, and handle multi-turn `tool_calls` responses — executing dictionary lookups locally and feeding results back to the LLM.

### Changes Required

#### 1. Tool definitions and multi-turn support in AI service

**File**: `src/lib/services/ai.ts`

**Intent**: Extend the AI service to support OpenAI-compatible function-calling: accept tool definitions, detect `tool_calls` in responses, execute them via a caller-provided handler, and loop until the LLM produces a final text response.

**Contract**:

- Add to `GenerateInput`:
  ```ts
  tools?: Array<{
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
  onToolCall?: (name: string, args: Record<string, unknown>) => Promise<string>;
  ```
- Modify `generateFlashcardProposals`:
  - If `tools` and `onToolCall` are provided, include `tools` in the fetch body
  - After receiving response, check `choices[0].message.tool_calls`
  - If `tool_calls` present and no `content` (or content is empty):
    - For each tool call, invoke `onToolCall(name, args)` → get result string
    - Append assistant message (with tool_calls) and tool result messages to `messages` array
    - Re-fetch OpenRouter with updated messages
    - Guard: max 5 round-trips; if exceeded, return `apiError`
  - If response has both `content` and `tool_calls`, process tool calls first, then return content from the **re-fetched** response (the last response in the loop). The original response's content is discarded — it may be a placeholder.
  - **Error propagation**: `onToolCall` catches errors internally and returns a JSON error string (e.g. `{"error":"Dictionary lookup failed"}`). This error string is fed back to the LLM as the tool result — the LLM can adapt (skip the word, use context clues). Errors are NOT propagated to the caller unless max turns are exceeded or OpenRouter itself fails.
  - If no tool calls, parse content as before (existing flow unchanged)
  - **Null guard**: before calling `parseProposals(content)`, check `if (content === null || content === undefined)` and return `apiError` — the schema change makes `content` nullable, and `parseProposals` expects `string`
- Update `openRouterResponseSchema` to include optional `tool_calls` in message:
  ```ts
  message: z.object({
    content: z.string().nullable(),
    tool_calls: z.array(z.object({
      id: z.string(),
      type: z.literal("function"),
      function: z.object({ name: z.string(), arguments: z.string() })
    })).optional(),
  })
  ```

#### 2. Wire dictionary tool in generate endpoint

**File**: `src/pages/api/sets/[id]/generate.ts`

**Intent**: Pass the dictionary tool definition and a local `onToolCall` handler (calling `lookupWord`) to `generateFlashcardProposals`.

**Contract**:

- Import `lookupWord` from `@/lib/services/dictionary`
- Define `DICTIONARY_TOOL` constant:
  ```ts
  {
    type: "function" as const,
    function: {
      name: "lookup_word",
      description: "Look up an English word in the Cambridge Dictionary. Returns definitions, part of speech, CEFR level (A1-C2), usage labels (formal/informal), and up to 2 example sentences per definition. Use this when you need to understand a word's meaning or find example sentences for flashcards.",
      parameters: {
        type: "object",
        properties: { word: { type: "string", description: "The English word to look up" } },
        required: ["word"],
      },
    },
  }
  ```
- Define `onToolCall` handler:
  ```ts
  async (name: string, args: Record<string, unknown>) => {
    if (name !== "lookup_word") return JSON.stringify({ error: "Unknown tool" });
    const word = typeof args.word === "string" ? args.word : "";
    if (!word) return JSON.stringify({ error: "Missing word argument" });
    try {
      const entries = await lookupWord(word);
      return JSON.stringify(entries);
    } catch (e) {
      return JSON.stringify({ error: "Dictionary lookup failed" });
    }
  }
  ```
- Pass `tools: [DICTIONARY_TOOL]` and `onToolCall` to `generateFlashcardProposals`

#### 3. Update AI service tests

**File**: `src/lib/services/ai.test.ts`

**Intent**: Add test cases for the function-calling loop: tool_calls response → handler invoked → final content returned.

**Contract**: New test cases:
- LLM returns `tool_calls` → `onToolCall` invoked → second fetch with tool results → final content parsed
- LLM returns `tool_calls` but `onToolCall` returns error JSON → error fed to LLM as tool result → LLM adapts and returns content (or continues with more tool calls)
- Max turns exceeded → `apiError` returned
- No tools provided → existing single-turn behavior unchanged (regression)

### Success Criteria

#### Automated Verification

- TypeScript compiles: `npx tsc --noEmit`
- All AI service tests pass: `npx vitest run src/lib/services/ai.test.ts`
- Linting passes: `npx eslint src/lib/services/ai.ts src/pages/api/sets/[id]/generate.ts`

#### Manual Verification

- Generate flashcards from text containing an uncommon word (e.g., "The somnambulist walked through the night"). Verify the LLM calls `lookup_word("somnambulist")` and produces a flashcard using the definition.
- Generate flashcards from simple text — verify no unnecessary dictionary calls (LLM should only call when needed).
- Verify the generate endpoint still works for users without the dictionary tool (backward compatibility — `tools` is optional).

---

## Testing Strategy

### Unit Tests

- `dictionary.test.ts`: HTML parsing with fixtures (valid word, missing fields, redirect, text cleaning)
- `ai.test.ts` (extended): function-calling loop, tool call execution, max turns guard, backward compatibility

### Integration Tests

- `dict/[word].test.ts`: auth guard, rate limiting, success/empty/error responses

### Manual Testing Steps

1. `curl` the dict endpoint with valid/invalid words, verify response shape
2. Trigger rate limit (31 rapid requests), verify 429
3. Generate flashcards with text containing rare words, observe tool calls in server logs
4. Generate flashcards with simple text, confirm no unnecessary tool calls

## Performance Considerations

- Each `lookupWord` call makes one HTTP fetch to `dictionary.cambridge.org`. Typical latency: 200-500ms.
- Function-calling adds 1-2 extra OpenRouter round-trips when the LLM uses the tool. Total generate time may increase from ~3s to ~5-8s.
- No cache means repeated lookups of the same word within a session will re-fetch. Acceptable for MVP; add cache later if needed.
- `HTMLRewriter` is streaming and memory-efficient — no large allocations.

## References

- cambd source: `C:\Users\fract\Documents\apps\cambridge-dict-promts\cambd\cambd\cambd.py:52-116` (definition scraping)
- Existing AI service: `src/lib/services/ai.ts:125-204`
- Existing rate limiter: `src/lib/services/ai-rate-limit.ts:1-35`
- API route pattern: `src/pages/api/sets/[id]/generate.ts:17-120`
- Middleware protected routes: `src/middleware.ts:8-16`
- Types: `src/types.ts:1-95`
- Env schema: `astro.config.mjs:28-38`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Dictionary Scraper Service

#### Automated

- [x] 1.1 Phase 1 files compile (no tsc errors in `dictionary.ts`/`types.ts`; project-wide pre-existing errors out of scope)
- [x] 1.2 Unit tests pass on real HTMLRewriter: `npx vitest run --project workers`
- [x] 1.3 Linting passes: `npx eslint src/lib/services/dictionary.ts src/lib/services/dictionary.test.ts src/types.ts`

### Phase 2: API Endpoint GET /api/dict/[word]

#### Automated

- [x] 2.1 Phase 2 files compile (dict endpoint/middleware/ai-rate-limit/env.d.ts clean; also fixed the AI_RATE_LIMIT-on-Env gap in generate.ts; project-wide pre-existing errors out of scope)
- [x] 2.2 Unit/integration tests pass: `npx vitest run src/pages/api/dict`
- [x] 2.3 Linting passes: `npx eslint src/pages/api/dict/[word].ts src/middleware.ts`

#### Manual

- [x] 2.4 curl authenticated request returns definitions (hello → UK+US entries, CEFR/labels/examples, via wrangler dev)
- [x] 2.5 curl unknown word returns empty entries (xyznotaword → {"entries":[]})
- [x] 2.6 31st request in a minute returns 429 (30 allowed, 31st cumulative → 429)
- [x] 2.7 Unauthenticated request returns 401

### Phase 3: Function-Calling Integration in AI Pipeline

#### Automated

- [ ] 3.1 TypeScript compiles: `npx tsc --noEmit`
- [ ] 3.2 All AI service tests pass: `npx vitest run src/lib/services/ai.test.ts`
- [ ] 3.3 Linting passes: `npx eslint src/lib/services/ai.ts src/pages/api/sets/[id]/generate.ts`

#### Manual

- [ ] 3.4 Generate with uncommon word triggers dictionary tool call
- [ ] 3.5 Generate with simple text makes no unnecessary tool calls
- [ ] 3.6 Generate works without tools (backward compatibility)
