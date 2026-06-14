# AI Flashcard Generation Implementation Plan

## Overview

Implement S-01: a logged-in user can paste source text into `/generate?setId=...`, trigger AI flashcard generation through OpenRouter, review a bulk preview of generated `front`/`back` proposals, edit or delete individual proposals inline, and save accepted flashcards into the selected existing set. The whole flow must stay under the 10-second UX budget defined in the PRD.

## Current State Analysis

- The project is Astro 6 SSR with the Cloudflare adapter (`output: "server"`).
- Existing API routes under `src/pages/api/` already follow a consistent pattern: read `context.locals.user`/`supabase`, validate JSON body with zod, call a service in `src/lib/services/`, return JSON.
- Services for sets (`src/lib/services/sets.ts`) and flashcards (`src/lib/services/flashcards.ts`) already exist with ownership checks and typed error unions.
- Middleware at `src/middleware.ts` protects `/api/sets` and `/api/flashcards`; the new AI route must be added to `PROTECTED_API_ROUTES`.
- Secrets are declared in `astro.config.mjs` as `server`/`secret`/`optional` and read via `astro:env/server`. Cloudflare secrets are managed with `wrangler secret put` / `.dev.vars` for local dev.
- KV is not yet configured in `wrangler.jsonc`; rate limiting will require a new KV namespace binding.
- There is no OpenRouter integration, no AI service, no bulk-save endpoint, and no UI for AI generation yet.
- The system prompt is currently inline in `ai.ts`; no externalized prompt template or override mechanism exists.

### Key Discoveries

- `astro.config.mjs:18-21` already defines the `env.schema` pattern for server secrets. Adding `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` fits this pattern.
- `src/pages/api/flashcards/index.ts` is the canonical example of validating a request body with zod and returning a typed JSON response.
- `src/lib/services/flashcards.ts` exposes single-card `createFlashcard`; a bulk path is needed for saving accepted proposals efficiently.
- `src/pages/sets/[id].astro` and `src/components/sets/SetDetailPage.tsx` are the natural places for the "Generate with AI" entry point.
- `zod` and `sonner` are already dependencies, so no new UI libraries are required.

## Desired End State

A logged-in user viewing one of their sets sees a "Generate with AI" button. Clicking it navigates to `/generate?setId=<id>` with a large textarea. The user pastes text (up to ~1000 words), clicks "Generate", and within ~10 seconds sees a list of flashcard proposals. Each proposal shows `front` and `back` in editable fields and can be deleted. The user clicks "Save N flashcards" and the accepted proposals are inserted as `flashcards` rows in the selected set. On timeout, parse error, empty result, or rate-limit hit, the UI shows a clear error message via `sonner` without exposing the API key. The default prompt template lives in `src/lib/services/ai-prompt.ts` and can be overridden via the `OPENROUTER_SYSTEM_PROMPT` Cloudflare secret without redeploy.

## What We're NOT Doing

- No streaming response in MVP (blocking JSON only).
- No user-configurable model selection in UI.
- No creating a new set inside the generate flow — save always goes to the pre-selected existing set.
- No persistent storage of raw AI generations or prompt version history.
- No public/anonymous access to the generate endpoint.
- No PDF/DOCX import, no multi-file upload.
- No automated evaluation of the 75% acceptance metric — manual QA only for this slice.

## Implementation Approach

Build in four phases:

1. **Backend AI service + OpenRouter endpoint** — add env vars, implement `src/lib/services/ai.ts`, create `POST /api/sets/[id]/generate.ts`, wire Cloudflare KV for per-user rate limiting, and write unit tests with mocked `fetch`.
2. **Bulk save endpoint** — add `POST /api/sets/[id]/flashcards/batch.ts` and a corresponding service function to insert multiple accepted flashcards in one Supabase call.
3. **UI flow** — add entry point on the set detail page, create `/generate.astro`, and build the React component for input, loading, proposal review, inline editing, deletion, and save.
4. **Polish + observability** — add error handling, toast feedback, timeout handling, externalize the prompt template, and manual quality testing on sample texts.

## Critical Implementation Details

- **Timeout & CPU**: OpenRouter calls must use an `AbortController` with a server-side timeout (e.g., 25 s). Cloudflare Workers count only active CPU time toward the limit; waiting on `fetch()` does not count. Still, wall-clock must stay under the PRD 10-second UX target, so the timeout plus model choice must keep typical calls under ~8 s.
- **Rate limiting**: Use a Cloudflare KV binding (e.g., `AI_RATE_LIMIT`) keyed by `user_id` with an hourly counter. KV writes are eventually consistent, so the limit is best-effort. Document that this is an MVP guardrail. The hourly limit is configurable via the `AI_RATE_LIMIT_HOURLY` secret; if KV is unavailable, requests are rejected (fail-closed).
- **Output cleaning**: The prompt must request raw JSON (`{"flashcards":[{"front":"...","back":"..."}]}`). The parser should strip markdown fences if present and then run through zod.
- **Auth**: The new endpoint must be added to `PROTECTED_API_ROUTES` so unauthenticated callers receive 401 automatically.
- **Prompt template**: Keep the default system prompt in `src/lib/services/ai-prompt.ts` as a versioned template. Wrap the user source text in delimiter tags. Allow full override via the `OPENROUTER_SYSTEM_PROMPT` secret without code redeploy.

## Phase 0: Test Infrastructure

### Overview

Add a test runner so the AI service and rate-limit helper can be verified automatically before the OpenRouter integration is wired up.

### Changes Required:

#### 1. Install Vitest

**File**: `package.json`

**Intent**: Provide a test runner compatible with the existing Vite/Astro build pipeline.

**Contract**:

- Add `vitest` to `devDependencies`.
- Add script `"test": "vitest run"` and `"test:watch": "vitest"`.

#### 2. Vitest config

**File**: `vitest.config.ts`

**Intent**: Configure Vitest to resolve `@/*` aliases and support TypeScript.

**Contract**:

- Reuse Vite alias `@/* → ./src/*` from `tsconfig.json`.
- Use `environment: "node"` (services under test do not depend on `workerd` runtime APIs; KV is injected as a parameter).

#### 3. First service test

**File**: `src/lib/services/ai.test.ts`

**Intent**: Validate the test setup with a trivial initial test that will expand in Phase 1.

**Contract**:

- Test the JSON/markdown cleaning utility (or a pure helper extracted from `ai.ts`) with mocked `fetch`.

### Success Criteria:

#### Automated

- `npm install` completes without conflicts.
- `npm run test` passes with at least one real test.
- `npm run lint` and `npm run build` still pass.

---

## Phase 1: Backend AI Service + OpenRouter Endpoint

### Overview

Create the server-side infrastructure to call OpenRouter safely: env schema, service module, protected endpoint, KV rate limit, and tests.

### Changes Required:

#### 1. Env schema

**File**: `astro.config.mjs`

**Intent**: Declare server secrets for the OpenRouter API key and optional model override so Astro validates them at build time and they are only available server-side.

**Contract**: Add two entries to `env.schema`:

```js
OPENROUTER_API_KEY: envField.string({ context: "server", access: "secret", optional: true }),
OPENROUTER_MODEL: envField.string({ context: "server", access: "secret", optional: true }),
```

#### 2. Local secrets template

**File**: `.env.example` and `.dev.vars`

**Intent**: Provide local placeholders for the new secrets.

**Contract**: Add `OPENROUTER_API_KEY=` and `OPENROUTER_MODEL=` to both files. Values must be gitignored for `.dev.vars`; `.env.example` stays empty/commented.

#### 3. Wrangler KV binding and TypeScript types

**Files**: `wrangler.jsonc`, `src/env.d.ts` (create or update)

**Intent**: Expose a KV namespace to the Worker and make `context.locals.runtime.env.AI_RATE_LIMIT` type-safe in Astro API routes.

**Contract**:

- Add a top-level `kv_namespaces` array in `wrangler.jsonc`:

```jsonc
"kv_namespaces": [
  { "binding": "AI_RATE_LIMIT", "id": "<your-kv-namespace-id>" }
]
```

- Declare `App.Runtime` in `src/env.d.ts`:

```ts
declare namespace App {
  interface Runtime {
    env: {
      AI_RATE_LIMIT: KVNamespace;
    };
  }
}
```

- Document that the namespace must be created via `npx wrangler kv namespace create "AI_RATE_LIMIT"` and that the id is per-environment.

#### 4. AI service module

**File**: `src/lib/services/ai.ts`

**Intent**: Encapsulate the OpenRouter prompt, request, response cleaning, and JSON parsing. Keep the endpoint thin and testable.

**Contract**:

- Export a function `generateFlashcardProposals(input: GenerateInput): Promise<{ data: FlashcardProposal[]; error: AiServiceError | null }>`.
- Input schema with zod: `text` (string, min 10 chars, max ~8000 chars to enforce ~1000 words), optional `count` (number, default 5, max 20).
- Output schema: `z.object({ flashcards: z.array(z.object({ front: z.string().min(1).max(1000), back: z.string().min(1).max(1000) })) })`.
- Use plain `fetch()` to `https://openrouter.ai/api/v1/chat/completions` with `Authorization`, `Content-Type`, `HTTP-Referer`, and `X-Title` headers.
- Default model constant `DEFAULT_MODEL = "google/gemini-flash-1.5"` (or other agreed cheap/fast model); overridden by `OPENROUTER_MODEL` env if provided.
- Clean response content by stripping optional markdown fences, then parse JSON and validate with zod.
- Use `AbortController` with 25 s timeout.
- Return typed errors: `timeout`, `parseError`, `apiError`, `noProposals`, `unconfigured`.

#### 5. Rate-limit helper

**File**: `src/lib/services/ai-rate-limit.ts`

**Intent**: Provide a small, testable helper to check and increment a per-user hourly counter in KV.

**Contract**:

- Function `checkRateLimit(kv: KVNamespace | null, userId: string): Promise<{ allowed: boolean; limit: number; remaining: number }>`.
- Key format: `ai:hourly:<userId>:<YYYY-MM-DD-HH>`.
- Limit: 10 requests/hour/user in MVP.
- If `kv` is null (local dev without KV binding), allow the request.

#### 6. Generate endpoint

**File**: `src/pages/api/sets/[id]/generate.ts`

**Intent**: Expose the AI generation as a protected POST route bound to a specific set.

**Contract**:

- `export const prerender = false`.
- Add `/api/sets` prefix to `PROTECTED_API_ROUTES` in `src/middleware.ts` (it already matches `/api/sets/*`).
- Validate `id` from `context.params` and confirm set ownership via `getSetByIdForUser` (reuse existing service or add a small helper).
- Read JSON body, validate with the same input schema as the AI service.
- Check rate limit using `context.locals.runtime?.env?.AI_RATE_LIMIT` (Cloudflare binding).
- Call `generateFlashcardProposals`.
- Return 200 with `{ flashcards: [...] }`, or appropriate 400/401/429/500 with `{ error }`.

#### 7. Unit tests

**File**: `src/lib/services/ai.test.ts` (or `tests/unit/ai.test.ts` if project convention exists)

**Intent**: Cover deterministic AI service logic without real API calls.

**Contract**:

- Mock `global.fetch` to return valid JSON, markdown-wrapped JSON, malformed JSON, and timeout.
- Assert parsing, validation errors, and error kinds.
- Do not commit a real API key.

### Success Criteria:

#### Automated Verification

- `npm run build` passes with new env schema.
- `npm run lint` passes.
- Unit tests for `ai.ts` pass.
- Endpoint returns 401 when called unauthenticated.
- Endpoint returns 429 after exceeding mock/hourly limit.

#### Manual Verification

- Run dev server with `.dev.vars` populated and a real OpenRouter key; generate proposals from a short text and confirm response under 10 s.
- Verify the default model ID exists on OpenRouter and returns valid JSON; if not, update `DEFAULT_MODEL` before finishing Phase 1.
- Verify the API key is never present in client-side bundles or network responses.

---

## Phase 2: Bulk Save Endpoint

### Overview

Add the ability to save multiple accepted proposals as flashcards in the selected set in one request.

### Changes Required:

#### 1. Bulk create service

**File**: `src/lib/services/flashcards.ts`

**Intent**: Insert many flashcards in a single Supabase call while reusing ownership validation.

**Contract**:

- Add `createFlashcardsBulk(client, userId, setId, contents: FlashcardContent[]): Promise<{ data: Flashcard[] | null; error: ServiceError | null }>`.
- Validate set ownership once before insert.
- Use `client.from("flashcards").insert(contents.map(c => ({ set_id: setId, ...c }))).select()`.

#### 2. Batch endpoint

**File**: `src/pages/api/sets/[id]/flashcards/batch.ts`

**Intent**: Receive the final accepted proposals from the UI and persist them.

**Contract**:

- `export const prerender = false`.
- Body schema: `{ flashcards: z.array(flashcardContentSchema) }`.
- Validate ownership and insert via `createFlashcardsBulk`.
- Return 201 with `{ data: Flashcard[], count: number }`.

### Success Criteria:

#### Automated Verification

- `npm run lint` and `npm run build` pass.
- Endpoint returns 401 for unauthenticated requests.
- Empty `flashcards` array returns 400.

#### Manual Verification

- Send a batch of 3 valid proposals to the endpoint and confirm they appear in the target set.
- Attempt to save to another user's set and confirm 403/404.

---

## Phase 3: UI Flow

### Overview

Build the user-facing generate flow: entry point from the set detail, generate page, proposal review, inline editing, deletion, and save.

### Changes Required:

#### 1. Set detail entry point

**File**: `src/components/sets/SetDetailPage.tsx`

**Intent**: Add a visible "Generate with AI" button that links to `/generate?setId=<id>`.

**Contract**:

- Place the button near the existing "Add flashcard" action.
- Use existing button classes (Tailwind + `cn` helper) for visual consistency.

#### 2. Generate page

**File**: `src/pages/generate.astro`

**Intent**: Render the server shell for the generate flow, passing the selected set id and verifying ownership.

**Contract**:

- Read `setId` from `Astro.url.searchParams`.
- If no `setId` or not owned by current user, redirect to `/dashboard` with a toast-compatible query or render an error layout.
- Pass `setId` and serialized set name to a React island.
- `export const prerender = false`.

#### 3. Generate React component

**File**: `src/components/ai/GenerateFlashcardsPage.tsx`

**Intent**: Implement the interactive generate-review-save flow.

**Contract**:

- State: `text`, `isGenerating`, `proposals`, `isSaving`, `errorMessage`.
- Textarea with character/word hint and a "Generate" button disabled while generating or when text is too short/long.
- On submit, POST to `/api/sets/<id>/generate` and render loading skeleton/spinner.
- On success, render `ProposalList` with each proposal editable inline and deletable.
- "Save" button persists accepted proposals via `POST /api/sets/<id>/flashcards/batch`.
- After successful save, redirect to `/sets/<id>` with a `sonner` success toast.
- On any error, show `sonner.error(message)` and keep the UI state for retry.

#### 4. Proposal card component

**File**: `src/components/ai/FlashcardProposalCard.tsx`

**Intent**: Single editable/deletable proposal row.

**Contract**:

- Two textarea inputs for `front` and `back`.
- Delete button with confirmation or immediate removal from local list.
- Enforce max length per side by importing constants from `flashcardContentSchema` in `src/lib/services/flashcards.ts` so client and server limits stay identical.

#### 5. Empty/error states

**File**: `src/components/ai/GenerateFlashcardsPage.tsx`

**Intent**: Provide feedback when AI returns nothing or fails.

**Contract**:

- Empty proposals: show "No flashcards were generated. Try a longer or clearer text."
- API error: show error message and a retry button that preserves the input text.

### Success Criteria:

#### Automated Verification

- `npm run lint` and `npm run build` pass.
- TypeScript checks for new React components pass.

#### Manual Verification

- Open `/sets/[id]`, click "Generate with AI", land on `/generate?setId=...`.
- Paste text, generate, edit one proposal, delete another, save, and land back on the set detail page with new flashcards visible.
- Test validation: too-short input, too-long input, empty save request.
- Test mobile viewport layout.

---

## Phase 4: Polish + Observability

### Overview

Harden error handling, verify quality, and document operational runbook.

### Changes Required:

#### 1. Error handling in endpoint

**File**: `src/pages/api/sets/[id]/generate.ts`

**Intent**: Map AI service error kinds to appropriate HTTP statuses and user-safe messages.

**Contract**:

- `timeout` → 504.
- `parseError` / `noProposals` → 422.
- `apiError` → 502 with sanitized message.
- `rateLimited` → 429 with `Retry-After` hint if available.

#### 2. Toast feedback wiring

**File**: `src/components/ai/GenerateFlashcardsPage.tsx`

**Intent**: Surface all user-relevant events via `sonner` consistently with the rest of the app.

**Contract**:

- `toast.success("N flashcards saved")`.
- `toast.error("Generation failed: ...")`.
- `toast.info("Generation may take a few seconds")` if generation starts.

#### 3. Manual quality run

**Intent**: Validate the 75% acceptance guardrail with real inputs.

**Contract**:

- Test 3-5 sample texts of varying length and domain.
- Record: total generated, accepted without edit, edited, deleted.
- If acceptance < 60%, iterate prompt or model before marking phase done.

#### 4. Runbook snippet

**File**: `context/changes/ai-flashcard-generation/runbook.md` (new)

**Intent**: Capture how to rotate the OpenRouter key, adjust the model, and create the KV namespace.

**Contract**:

- `npx wrangler kv namespace create "AI_RATE_LIMIT"`.
- `npx wrangler secret put OPENROUTER_API_KEY`.
- Optional `npx wrangler secret put OPENROUTER_MODEL`.

### Success Criteria:

#### Automated Verification

- `npm run lint` and `npm run build` pass.
- All prior phase tests still pass.

#### Manual Verification

- Simulate OpenRouter timeout by using a very short `AbortController` timeout locally and confirm graceful UI error.
- Confirm rate-limit hit after 11 rapid requests by the same user.
- Confirm no API key leakage in browser dev tools or build output.
- Quality run yields ≥ 60% raw acceptance (aiming for 75% in subsequent prompt iterations).

---

## Testing Strategy

### Unit Tests

- `src/lib/services/ai.ts`: response cleaning, zod validation, error mapping, timeout behavior (mocked fetch).
- `src/lib/services/ai-prompt.ts`: prompt template rendering, delimiter wrapping, override handling.
- `src/lib/services/ai-rate-limit.ts`: key formatting, limit enforcement, null-KV fallback.

### Integration / API Tests

- `src/pages/api/sets/[id]/generate.ts` with mocked `fetch` and mock KV: 200 success, 400 validation, 401 unauthenticated, 429 rate limited, 504 timeout.
- `src/pages/api/sets/[id]/flashcards/batch.ts`: 201 save, 400 empty, 401 unauthenticated, 403/404 wrong owner.

### Manual Testing Steps

1. Create a set from the dashboard.
2. Open the set detail and click "Generate with AI".
3. Paste a ~200-word educational text.
4. Click Generate; observe loading state and results under 10 s.
5. Edit one card, delete one card, click Save.
6. Confirm redirect to set detail and new cards appear.
7. Repeat with edge cases: empty text, 1200-word text (should be rejected), very short text.
8. Inspect Network tab: verify no OpenRouter key in responses.

## Performance Considerations

- Use the cheapest/fastest model that meets quality (default `google/gemini-flash-1.5`) and allow override via `OPENROUTER_MODEL`.
- Limit input to ~8000 characters (~1000 words) to keep latency under the 10-second UX target.
- Use non-streaming JSON in MVP to keep the endpoint simple; streaming can be added later without breaking the API contract.
- KV rate limiting is best-effort but sufficient for MVP cost control.

## Migration Notes

No database migration is required. The existing `flashcards` and `sets` tables already support the data shape.

## References

- Research: `context/changes/ai-flashcard-generation/research.md`
- PRD: `context/foundation/prd.md` (FR-002, FR-003, US-01, NFR)
- Existing API pattern: `src/pages/api/flashcards/index.ts`, `src/pages/api/sets/index.ts`
- Existing services: `src/lib/services/sets.ts`, `src/lib/services/flashcards.ts`
- Middleware: `src/middleware.ts`
- Env schema: `astro.config.mjs:18-21`

## Progress

### Phase 0: Test Infrastructure

#### Automated

- [ ] 0.1 Vitest added to `devDependencies` with `test` and `test:watch` scripts
- [ ] 0.2 `vitest.config.ts` created with `@/*` alias
- [ ] 0.3 `src/lib/services/ai.test.ts` exists and passes
- [ ] 0.4 `npm run lint` and `npm run build` still pass

### Phase 1: Backend AI Service + OpenRouter Endpoint

#### Automated

- [x] 1.1 `astro.config.mjs` env schema extended with `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` — 3639859
- [x] 1.2 `.env.example` and `.dev.vars` updated with placeholders — 3639859
- [x] 1.3 `wrangler.jsonc` includes `AI_RATE_LIMIT` KV namespace binding — 3639859
- [x] 1.4 `src/lib/services/ai.ts` implemented with prompt, fetch, parse, zod validation, and timeout — 3639859
- [x] 1.5 `src/lib/services/ai-rate-limit.ts` implemented with per-user hourly counter — 3639859
- [x] 1.6 `src/pages/api/sets/[id]/generate.ts` created and added to protected API routes — 3639859
- [x] 1.7 Unit tests for AI service pass — 3639859
- [x] 1.8 `npm run lint` passes — 3639859
- [x] 1.9 `npm run build` passes — 3639859

#### Manual

- [x] 1.10 Dev server generates real proposals from OpenRouter under 10 s
- [x] 1.11 API key is not exposed in client responses or bundles

### Phase 2: Bulk Save Endpoint

#### Automated

- [x] 2.1 `createFlashcardsBulk` added to `src/lib/services/flashcards.ts` — 6ba31e8
- [x] 2.2 `src/pages/api/sets/[id]/flashcards/batch.ts` created and protected — 6ba31e8
- [x] 2.3 `npm run lint` and `npm run build` pass — 6ba31e8

#### Manual

- [ ] 2.4 Batch save persists multiple flashcards to the target set
- [ ] 2.5 Saving to another user's set returns 403/404

### Phase 3: UI Flow

#### Automated

- [x] 3.1 `src/components/sets/SetDetailPage.tsx` includes "Generate with AI" link
- [x] 3.2 `src/pages/generate.astro` renders shell and validates set ownership
- [x] 3.3 `src/components/ai/GenerateFlashcardsPage.tsx` implements input + review + save flow
- [x] 3.4 `src/components/ai/FlashcardProposalCard.tsx` supports inline edit and delete
- [x] 3.5 `npm run lint` and `npm run build` pass — b1a1ed3

#### Manual

- [x] 3.6 Full end-to-end generate → edit → delete → save → redirect works
- [x] 3.7 Validation rejects too-short and too-long input
- [x] 3.8 Layout is usable on mobile

### Phase 4: Polish + Observability

#### Automated

- [x] 4.1 Endpoint maps all AI error kinds to correct HTTP statuses
- [x] 4.2 Toast feedback integrated for success, error, and info states
- [x] 4.3 `npm run lint` and `npm run build` pass
- [x] 4.4 All earlier tests still pass

#### Manual

- [x] 4.5 Timeout/rate-limit errors show graceful UI messages
- [x] 4.6 Quality run on 3-5 texts records acceptance rate (target ≥ 60% raw, iterate toward 75%) — quality run passed by user on 2026-06-14
