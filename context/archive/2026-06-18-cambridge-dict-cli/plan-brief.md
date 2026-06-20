# Cambridge Dictionary CLI Integration — Plan Brief

> Full plan: `context/changes/cambridge-dict-cli/plan.md`

## What & Why

Reimplement the `cambd` Python CLI as a TypeScript service on Cloudflare Workers, exposed as `GET /api/dict/[word]`, and integrated into the flashcard generation pipeline via OpenRouter function-calling. The LLM will autonomously look up word definitions, CEFR levels, and example sentences from Cambridge Dictionary while creating flashcards — producing richer, more accurate cards without manual dictionary lookups.

## Starting Point

- **cambd** scrapes `dictionary.cambridge.org` via two GET endpoints, parses HTML with BeautifulSoup, returns structured `{Definition, Type, DictionaryRegion, Info, Examples}` dicts. No error handling, no rate limiting.
- **10xCards AI pipeline** (`src/lib/services/ai.ts`) does single-turn chat completion to OpenRouter — no tool definitions, no multi-turn support.
- **API routes** follow a consistent pattern: auth guard → zod validation → rate limit (Cloudflare KV) → service call → JSON response.
- No dictionary, MCP, or tool-calling infrastructure exists in the codebase.

## Desired End State

1. `GET /api/dict/[word]` returns all UK+US definitions with CEFR levels, part of speech, and up to 2 examples per definition. Auth required, rate-limited at 30 req/min per user.
2. `POST /api/sets/[id]/generate` sends a `tools` array with the dictionary function definition to OpenRouter. When the LLM requests a word lookup, the server executes it against the local scraper and feeds the result back inline. The LLM uses dictionary data to produce richer flashcards.
3. No cache — live scraping. Errors propagate to the LLM as tool-call error responses.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| LLM integration path | Function-calling via OpenRouter | LLM autonomously decides when to look up words — no manual intervention needed. | Plan |
| Dictionary scope | Full (all UK+US definitions, CEFR, examples) | Rich data lets LLM pick appropriate context, difficulty level, and example sentences. | Plan |
| Endpoint design | Standalone `GET /api/dict/[word]` | Clean separation from generate pipeline, reusable outside flashcard generation. | Plan |
| Caching | None (live scraping only) | Simplest implementation; cache can be added later if latency becomes an issue. | Plan |
| Error handling | Propagate errors to LLM | LLM sees tool-call failures and can adapt (skip word, use context clues). | Plan |
| Access control | Auth required + rate limit 30/min per user | Consistent with existing API patterns, prevents abuse. | Plan |
| Rate limit mechanism | Separate KV key prefix (`dict:minute:`) in existing `AI_RATE_LIMIT` namespace | Reuses existing KV binding, no new infrastructure. | Plan |
| Unknown word response | Empty array `[]` | Simple, unambiguous — LLM knows the word has no dictionary entry. | Plan |
| Testing level | Unit (scraper) + integration (endpoint) + extended unit (AI function-calling) | Covers parsing correctness, API behavior, and multi-turn loop logic. | Plan |

## Scope

**In scope:**
- `lookupWord()` TypeScript service using `HTMLRewriter`
- `GET /api/dict/[word]` endpoint with auth + rate limit
- Function-calling integration in `generateFlashcardProposals`
- Tool definition for `lookup_word` sent to OpenRouter
- Multi-turn loop: execute tool calls, feed results back, parse final response
- Unit + integration tests for all three layers

**Out of scope:**
- Spellcheck/suggestions endpoint
- Cache (SQLite, KV, or Supabase)
- MCP server
- US/UK region filter parameter
- CLI or standalone tool
- Retry logic on Cambridge fetch failures

## Architecture / Approach

```
User Browser
  │
  ├─ POST /api/sets/{id}/generate
  │    └─► generate.ts
  │         ├─ auth + rate limit (KV)
  │         ├─ renderFlashcardPrompt() → system + user messages
  │         └─ generateFlashcardProposals({ tools: [dict_tool], onToolCall })
  │              └─► OpenRouter (with tools array)
  │                   ├─ LLM returns tool_calls → onToolCall("lookup_word", {word})
  │                   │    └─► lookupWord() → fetch cambridge.org → HTMLRewriter → entries[]
  │                   │    └─► append tool result message, re-fetch OpenRouter
  │                   └─ LLM returns final content → parseProposals() → flashcards[]
  │
  └─ GET /api/dict/[word] (standalone, reusable)
       └─► dict/[word].ts
            ├─ auth guard
            ├─ rate limit (KV, 30/min)
            └─ lookupWord() → DictionaryEntry[]
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Dictionary Scraper Service | `lookupWord()` function + types + unit tests | HTMLRewriter event-driven model differs from BeautifulSoup — nested handler registration must be correct. |
| 2. API Endpoint | `GET /api/dict/[word]` with auth, rate limit, error handling | Rate-limit key prefix must not collide with existing AI hourly keys. |
| 3. Function-Calling Integration | Multi-turn tool-calling in AI pipeline, wired to dict tool | Infinite loop risk — must guard with max turns. Backward compatibility: existing single-turn flow must still work. |

**Prerequisites:** `AI_RATE_LIMIT` KV namespace binding exists in Cloudflare environment (already configured).
**Estimated effort:** ~2-3 sessions across 3 phases.

## Open Risks & Assumptions

- Cambridge Dictionary may change its HTML structure, breaking selectors. Mitigation: unit tests with saved HTML fixtures will catch this; fixtures need periodic refresh.
- OpenRouter models vary in function-calling support. `google/gemini-flash-1.5` (current default) supports it, but user-configured models may not. Mitigation: function-calling is opt-in via `tools` parameter — if model doesn't support it, it simply won't call tools.
- `HTMLRewriter` is Cloudflare Workers-only. Local dev (`wrangler dev`) supports it, but `astro dev` may not. Mitigation: tests mock `fetch` and use `HTMLRewriter` directly (available in workerd runtime).

## Success Criteria (Summary)

- `GET /api/dict/hello` returns real Cambridge Dictionary definitions
- Generating flashcards from text with rare words triggers automatic dictionary lookups
- Generating flashcards from simple text does not trigger unnecessary lookups
- Existing generate flow works unchanged when tools are not provided
