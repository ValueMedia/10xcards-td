# AI Flashcard Generation — Plan Brief

> Full plan: `context/changes/ai-flashcard-generation/plan.md`  
> Research: `context/changes/ai-flashcard-generation/research.md`

## What & Why

Implement S-01 from the roadmap: a logged-in user can paste source text and receive AI-generated flashcard proposals, review them in a bulk editor, optionally edit or delete each proposal, and save the accepted cards into an existing set. This is the core value proposition of 10xCards and directly tests the PRD success criterion that 75% of AI-generated cards are accepted without editing.

## Starting Point

The project already runs Astro 6 SSR on Cloudflare Workers with auth, Supabase, and CRUD endpoints for sets and flashcards (`/api/sets/*`, `/api/flashcards/*`). OpenRouter is not integrated yet, there is no AI service, no bulk-save endpoint, and no UI for generation. Research confirmed that calling OpenRouter from an Astro API route on Cloudflare Workers is the right architecture.

## Desired End State

From any set detail page the user clicks "Generate with AI", lands on `/generate?setId=...`, pastes text (up to ~1000 words), and clicks Generate. Within ~10 seconds the page shows editable/deletable flashcard proposals. Clicking Save inserts them into that set and returns the user to the set detail page.

## Key Decisions Made

| Decision                  | Choice                                                    | Why (1 sentence)                                                                                                          | Source   |
| ------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------- |
| Architecture              | OpenRouter called from Astro API route on Cloudflare      | Natural extension of existing `/api` pattern; hides API key server-side and reuses existing auth middleware.                | Research |
| Response format           | Plain JSON array                                          | Easiest to validate with zod and avoids fragile markdown parsers.                                                         | Plan     |
| Streaming                 | Blocking JSON only in MVP                                 | Simpler endpoint and UI; streaming can be added later without breaking the contract.                                      | Plan     |
| Default model             | Cheap/fast model (`google/gemini-flash-1.5`)              | Keeps latency under the 10 s UX target and minimizes API costs while quality is validated.                              | Plan     |
| Model override            | `OPENROUTER_MODEL` as optional Cloudflare secret          | Allows prompt/model tuning without code redeploy.                                                                         | Plan     |
| Save target               | Always the pre-selected existing set                      | Fewer UI decisions; entry point lives on the set detail page.                                                             | Plan     |
| Rate limiting             | Per-user hourly counter via Cloudflare KV               | MVP cost guardrail without adding a second runtime or database table.                                                   | Plan     |
| Input limit               | ~1000 words (~8000 chars)                                 | Balances PRD NFR with reliable sub-10-second response time.                                                                 | Plan     |
| Tests                     | Unit + mock endpoint tests, manual quality QA             | Deterministic logic is covered in CI; real LLM quality is validated manually because it is stochastic and cost-bearing. | Plan     |
| Full flow vs minimal flow | Full flow with inline edit/delete                         | Required by PRD acceptance criteria and is the core product promise.                                                      | Plan     |

## Scope

**In scope:**

- Env schema for `OPENROUTER_API_KEY` and `OPENROUTER_MODEL`.
- Cloudflare KV binding `AI_RATE_LIMIT` for per-user rate limiting.
- AI service module (`src/lib/services/ai.ts`) with prompt, fetch, JSON parse, validation, and timeout.
- Protected endpoint `POST /api/sets/[id]/generate`.
- Bulk-save service + endpoint `POST /api/sets/[id]/flashcards/batch`.
- UI entry point on set detail, `/generate` page, proposal review/edit/delete, and save flow.
- Toast feedback via `sonner`.
- Unit tests for AI service and rate-limit helper.
- Manual quality run on 3-5 sample texts.

**Out of scope:**

- Streaming responses.
- User-facing model selection.
- Creating a new set inside the generate flow.
- Persistent storage of raw AI generations.
- Public/anonymous generation.
- PDF/DOCX import.
- Automated 75% acceptance metric evaluation in CI.

## Architecture / Approach

The user triggers generation from a set detail page, which links to `/generate?setId=...`. The generate page renders a React island that POSTs the input text to `POST /api/sets/[id]/generate`. That endpoint checks ownership, enforces a per-user KV rate limit, and calls OpenRouter via `src/lib/services/ai.ts`. The response is cleaned, parsed, and validated into `{front, back}` proposals. The UI displays the proposals; the user edits or deletes them, then POSTs the accepted list to `POST /api/sets/[id]/flashcards/batch`, which bulk-inserts rows into the existing set.

## Phases at a Glance

| Phase | What it delivers                                                   | Key risk                                                              |
| ----- | ------------------------------------------------------------------ | --------------------------------------------------------------------- |
| 1.    | Backend AI service + OpenRouter endpoint + KV rate limit + tests | OpenRouter latency/quality may exceed 10 s budget; needs prompt/model tuning |
| 2.    | Bulk-save service and endpoint                                     | Ownership validation must reject writes to other users' sets        |
| 3.    | UI entry point, `/generate` page, proposal review/edit/delete/save | UX complexity of inline editing and deletion on mobile              |
| 4.    | Error mapping, toast feedback, manual quality run, runbook         | Quality run may fall short of 75%; prompt iteration may be needed     |

**Prerequisites:**

- Cloudflare Workers account and `wrangler` access.
- OpenRouter account with API key.
- KV namespace `AI_RATE_LIMIT` created via Wrangler.
- Existing Supabase schema and RLS policies remain unchanged.

**Estimated effort:** ~3-4 focused sessions across 4 phases, with phase 1 carrying the most technical risk due to external API latency and quality validation.

## Open Risks & Assumptions

- The chosen cheap model produces acceptable quality on the first prompt; if not, prompt/model iteration in phase 4 may delay completion.
- Cloudflare Workers plan supports the required wall-clock duration (paid plan is assumed; Free plan CPU limit is too low).
- KV is available in the deployed Worker environment; local dev can fall back to allowing all requests if KV binding is missing.
- The user already owns a set before entering the generate flow.

## Success Criteria (Summary)

- User can generate, review, edit, delete, and save flashcards end-to-end.
- Generation latency stays under 10 seconds for typical input.
- API key is never exposed to the client.
- Bulk save correctly inserts only into the owned set.
- Manual quality run reaches at least 60% raw acceptance, with a clear path to iterate toward the 75% PRD target.
