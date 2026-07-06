---
date: 2026-07-06T00:00:00Z
researcher: value-media (Claude Code)
git_commit: 2b451ee36e8ef28f1c7532527502c31b33cbfd06
branch: main
repository: 10xcards
topic: "Ground Test-Plan Phase 1 — authorization & data-isolation (IDOR + share-token leak)"
tags: [research, codebase, authorization, rls, idor, share-token, testing, vitest-pool-workers]
status: complete
last_updated: 2026-07-06
last_updated_by: value-media (Claude Code)
---

# Research: Test-Plan Phase 1 — authorization & data-isolation

**Date**: 2026-07-06T00:00:00Z
**Researcher**: value-media (Claude Code)
**Git Commit**: 2b451ee36e8ef28f1c7532527502c31b33cbfd06
**Branch**: main
**Repository**: 10xcards

## Research Question

Ground rollout Phase 1 of `context/foundation/test-plan.md` (change `testing-authorization-data-isolation`) in real code. For each risk: find where authorization is actually enforced (endpoint vs service vs RLS vs RPC), quote it, verify or correct the risk-response guidance, locate existing tests, and pick the cheapest useful test layer.

- **Risk #1 — Cross-user access / IDOR:** a logged-in user reads or edits another user's set/flashcard because an endpoint checks "authenticated," not "owns this resource."
- **Risk #2 — Share-token leak / read-only link over-exposure:** an anon visitor via a capability link enumerates other sets' tokens or performs writes.

## Summary

**Both risks are largely mitigated in the current code, and the mitigations are grounded and quotable. The test plan's response guidance is correct in intent but needs three concrete corrections before it becomes test contracts** (see [Response-Guidance Verdict](#response-guidance-verified-and-corrected)).

Core architecture fact that reframes everything: `context.locals.supabase` is **not** a service-role client. It is an `@supabase/ssr` client built from the **anon key + the user's session cookie**, so **RLS runs under the caller's JWT on every query** (`src/lib/supabase.ts:9`, `src/middleware.ts:43-50`). Ownership is therefore enforced in **defense-in-depth**, not by any single layer:

1. **Service layer (primary, explicit gate):** `.eq("user_id", userId)` on `sets`, and `sets!inner(user_id)` joins for `flashcards`/`reviews`.
2. **RLS (real backstop):** per-operation, per-role policies keyed on `auth.uid() = user_id`.
3. **RPCs (for two mutations):** `submit_card_review` (SECURITY INVOKER → RLS applies) and `reset_set_progress` (**SECURITY DEFINER → bypasses RLS**, enforces ownership with its own `p_user_id` guard).

Cross-user reads/mutations return **404** ("resource hidden"), not 403 — the guidance's "403/404" should be pinned to **404**.

The anon share path is a single **SECURITY DEFINER RPC** `get_shared_set_info(p_token)` that returns only `{set_id, owner_id, set_name, flashcard_count}` — **never the `share_token`, never card content, exactly one set per token, no enumeration** (`20260615000001_fix_get_shared_set_info_owner.sql:8-26`). The dangerous broad anon policy (`USING (share_token IS NOT NULL)`) once existed but was **dropped** (`20260614200000_give_set_to_study.sql:7-8`). Two residual **hardening flags** remain (dormant anon GRANT; `owner_id` returned to anon).

Cheapest useful test layer: **direct handler invocation with a real `@supabase/supabase-js` client authenticated per test-user against local Supabase** — RLS/RPCs live in Postgres, so workerd/`SELF.fetch()` is unnecessary and not recommended for Phase 1. `vitest-pool-workers` is wired but only for one HTMLRewriter test, not for API routes.

## Detailed Findings

### The authorization architecture (the frame for both risks)

- `src/lib/supabase.ts:5-24` — one cookie-backed factory; always uses `SUPABASE_KEY` (anon/publishable key). It becomes "user-scoped" only through the session JWT in the cookie; with no cookie it is the Postgres `anon` role. **No service-role client exists anywhere in the request path.**
- `src/middleware.ts:42-54` — resolves the user via `supabase.auth.getUser()` (server-verified, the correct call, not `getSession()`), attaches `locals.user` (the GoTrue `User`; code reads `user.id`) and the same per-request `locals.supabase` (carrying the JWT).
- `src/middleware.ts:7-17,87-97` — `PROTECTED_API_ROUTES` = `["/api/sets","/api/flashcards","/api/reviews","/api/share","/api/user-prompt","/api/dict","/api/auth/change-password","/api/auth/delete-account"]`; unauthenticated hits on these return **401 JSON**. The anon public page `/share/[token]` is deliberately **not** protected.

Consequence: "RLS handles it on its own" is only *partly* true — it is bypassed by the `reset_set_progress` SECURITY DEFINER RPC, and direct-handler tests bypass the middleware 401 gate. Endpoint-level integration tests are justified for exactly these reasons.

### Risk #1 — IDOR: per-endpoint ground truth

Every set/flashcard handler reads `const user = locals.user; const supabase = locals.supabase; if (!user?.id || !supabase) return 401`. No handler trusts a `user_id` from the request body — it always uses `user.id` from the session.

**Reads — all scoped (non-owner → 404):**
- `GET /api/sets` — `listSets` `.eq("user_id", userId)` (`src/lib/services/sets.ts:18`). Not IDOR-shaped (no id in URL).
- `GET /api/sets/[id]/flashcards` — `getSetWithFlashcards` checks the set `.eq("id", setId).eq("user_id", userId).maybeSingle()` → "Set not found" (`src/lib/services/sets.ts:105-108`).
- `GET /api/sets/[id]/due-cards` — `getDueCardsForSession` gates on `.eq("id", setId).eq("user_id", userId)` (`src/lib/services/reviews.ts:14-16`).
- `GET /api/sets/[id]/share` — `getSetByIdForUser` `.eq("id", setId).eq("user_id", userId)` (`src/lib/services/sets.ts:172`) — prevents leaking another user's `share_token`.

**Mutations — all scoped (non-owner → 404), with two fragile spots:**
- `PATCH /api/sets/[id]` — `renameSet` update `.eq("id", setId).eq("user_id", userId)` (`src/lib/services/sets.ts:72-73`) → `.single()` errors → 404 (`src/pages/api/sets/[id].ts:47-52`).
- `DELETE /api/sets/[id]` — `deleteSet` `.eq("id", setId).eq("user_id", userId).select("id")`; empty → "Set not found" (`src/lib/services/sets.ts:88-92`).
- `POST /api/flashcards` (body-supplied `set_id`) — `createFlashcard` verifies parent set owned `.eq("id", setId).eq("user_id", userId)` before insert (`src/lib/services/flashcards.ts:58-60`).
- `POST /api/sets/[id]/flashcards/batch` — same set-ownership pre-check (`src/lib/services/flashcards.ts:97-113`).
- `POST /api/sets/[id]/generate` — inline endpoint check `.eq("id", setId).eq("user_id", user.id)` (`src/pages/api/sets/[id]/generate.ts:69-81`) — also guards LLM cost.
- `POST /api/reviews` (body-supplied `flashcardId`) — `submitCardReview` gates `.eq("id", flashcardId).eq("sets.user_id", userId)` (`src/lib/services/reviews.ts:58-66`) before the RPC.
- `POST /api/sets/[id]/reset-progress` — delegates to RPC; ownership enforced **inside** it (see RPC section).

**Fragile spot A — check-then-act on flashcards.** `updateFlashcard`/`deleteFlashcard` do a join-based access check (`src/lib/services/flashcards.ts:170-175`, `199-207`) but the actual write is filtered by `.eq("id", flashcardId)` only (`flashcards.ts:180-185`, `209`). Not exploitable today — the pre-check gates it and RLS `flashcards_update/delete_own` independently blocks the write — but the **write's correctness leans entirely on RLS**. A two-user test here is the highest-value IDOR test.

**Fragile spot B (genuine gap) — `POST /api/sessions`.** `logSession` inserts `{ user_id: userId, set_id: setId }` from a body `set_id` with **no ownership check** on `set_id` (`src/lib/services/stats.ts:26-31`). RLS `session_log` only checks `auth.uid() = user_id` (`20260614000001_session_log.sql:19`), which passes because the row is stamped with the caller's own id. **User B can insert a `session_log` row pointing at user A's `set_id`.** Impact is low (pollutes only B's own stats; reads nothing of A's), but it is the one place a set id is accepted and written without an ownership check — the concrete instance of "authenticated ≠ authorized." Worth a test that documents intended behavior (reject vs. accept-but-harmless).

**IDOR verdict:** enforcement is a **mix** — service layer is the primary explicit gate, RLS is a real backstop, two RPCs carry part of the guarantee. No unscoped *read* IDOR exists. The residual write concerns are Fragile spots A (RLS-dependent) and B (`/api/sessions`, unchecked cross-reference).

### RPC bodies (previously unverified — now grounded)

- `reset_set_progress` (`supabase/migrations/20260620120000_reset_set_progress_rpc.sql:6-39`) — `security definer`, so **RLS is bypassed**; ownership is enforced *only* by its own guard: `if not exists (select 1 from public.sets where id = p_set_id and user_id = p_user_id) then raise exception 'Set not found or access denied'` (`:16-18`). Safe because `p_user_id` = `user.id` from the session, un-spoofable. **Test target:** user B → reset on A's set must raise → 404, and A's cards/reviews must be untouched.
- `submit_card_review` (`supabase/migrations/20260614120000_submit_card_review_rpc.sql:5-83`) — SECURITY INVOKER (default) → **RLS applies**. Inserts review with `user_id = p_user_id` (INSERT RLS `with check auth.uid()=user_id`), then updates flashcard `where id = p_flashcard_id` with `if not found raise 'Flashcard not found or access denied'` (`:75-79`). A cross-user attempt fails the flashcard UPDATE RLS → 0 rows → exception → whole tx rolls back. Double-gated (TS pre-check + RLS).

### Risk #2 — share-token leak: anon path ground truth

- **Schema:** `share_token uuid default null` lives on `public.sets` (`20260610000000_initial_schema.sql:5-13`); `flashcards` has no `user_id` (ownership is transitive via `set_id → sets.user_id`).
- **The dangerous anon policy existed, then was removed.** Initial schema had `sets_select_shared_anon ... using (share_token is not null)` and the flashcards equivalent (`20260610000000_initial_schema.sql:107-111,158-166`) — exactly the lessons.md anti-pattern (RLS filters rows, not columns → token enumeration via PostgREST). **Dropped** in `20260614200000_give_set_to_study.sql:7-8`, citing the lesson. No later migration re-adds any anon policy. **Current state: zero anon RLS policies on `sets`/`flashcards` → default-deny → anon reads 0 rows via direct table access.**
- **Anon read path = one SECURITY DEFINER RPC.** `get_shared_set_info(p_token uuid)` (`20260615000001_fix_get_shared_set_info_owner.sql:8-26`): `security definer`, `stable`, `set search_path = ''`, `grant execute ... to authenticated, anon`. Returns `returns table(set_id uuid, owner_id uuid, set_name text, flashcard_count bigint)`; `where s.share_token = p_token`. **The `share_token` is only an input filter, never a returned column. Card content (front/back) is not returned either — anon gets metadata + count only.** Returns exactly the one matching set; wrong/absent token → 0 rows; **no enumeration possible.** Called from `src/pages/share/[token].astro:23`.
- **No anon writes anywhere.** Anon has no INSERT/UPDATE/DELETE grant and no write RPC. The claim/write path `claim_shared_set` (`20260614200000_give_set_to_study.sql:76-150`) is SECURITY DEFINER but `grant execute ... to authenticated` only (`:150`), raises `Not authenticated` if `auth.uid()` is null (`:92-94`), and **clones** the set into the caller's ownership (clone-on-claim model). The endpoint `src/pages/api/share/claim.ts` is itself in `PROTECTED_API_ROUTES` (401 for anon) and maps RPC errors to 404/401/400 (`claim.ts:41-50`).

**Sharing model correction (important for framing the tests):** this is **clone-on-claim**, not "anon read-only view of the cards." Anon sees only `{set_id, owner_id, set_name, flashcard_count}`; to get the actual flashcards a user must be authenticated and `claim` (clone) the set. The test plan's "read-only link over-exposure" should be grounded to: *anon sees metadata only; card content requires an authenticated claim.*

**Two residual hardening flags (not live exploits):**
1. **Dormant anon table-level `SELECT` GRANT** on `sets`/`flashcards` was never revoked (`20260613105815_grant_table_permissions.sql:8,11` grant `select ... to anon`). Inert today because RLS default-denies, but a latent footgun: re-adding any permissive anon policy — or disabling RLS — would immediately let anon read every row *including `share_token`* via PostgREST. Recommend an explicit `revoke select on public.sets, public.flashcards from anon`. A **contract test** can assert anon direct PostgREST `SELECT` on `sets` returns 0 rows.
2. **`get_shared_set_info` returns `owner_id`** (owner UUID) to anon (`20260615000001:9`) — added so the SSR page can detect self-links. Not the token, not PII, but a mild identifier exposure worth a one-line note.

### Existing tests & the harness

- **All existing tests are unit/component; none hit an API route or Worker fetch end-to-end.** Inventory: `src/pages/api/dict/[word].test.ts` (only route test — calls the exported `GET` directly with a synthetic `APIContext`, mocks the service, `locals.supabase = {}`), `src/lib/services/dictionary.test.ts` (workers pool, real HTMLRewriter), `src/lib/services/ai.test.ts`, `src/lib/services/csv-parser.test.ts`, `src/lib/i18n/__tests__/{constants,translations}.test.ts`, `src/components/settings/__tests__/LanguageSwitcher.test.tsx`.
- **`vitest-pool-workers` is wired but narrowly.** `vitest.config.ts` defines a `node` project and a `workers` project (`defineWorkersProject`, `:35-50`) whose `include` is a single file (`dictionary.test.ts`) for real HTMLRewriter. It sets `miniflare.compatibilityDate/Flags` inline, **does not** reference `wrangler.jsonc` via `wrangler.configPath`, has **no `main`/entry** for `SELF.fetch()`, and injects **no Supabase vars**. The node project stubs `cloudflare:workers` (`vitest.config.ts:24`, `src/test/cloudflare-workers.stub.ts`).
- **Wrangler:** `wrangler.jsonc` — only binding is `AI_RATE_LIMIT` KV; no `[vars]`/secrets for Supabase (those flow via `astro:env/server` + Cloudflare secrets).
- **Astro env:** `astro.config.mjs:28-38` declares `SUPABASE_URL`/`SUPABASE_KEY`/`SUPABASE_SERVICE_ROLE_KEY` as `context:"server", access:"secret", optional:true`; `src/lib/supabase.ts:6-8` returns `null` when unset (why current tests run without Supabase).
- **Local Supabase is ready.** `supabase` CLI is a devDep; `.dev.vars` exists locally with `SUPABASE_URL=http://localhost:54321`, anon JWT, and service-role JWT (standard local demo keys). **Correction to an earlier draft: `.dev.vars` is gitignored and untracked (`git check-ignore` confirms) — the secrets are *not* committed.**

### Cheapest useful test layer (recommendation)

**Direct handler invocation + real per-user `@supabase/supabase-js` client against local Supabase.** Rationale: the authorization guarantees (service `.eq(user_id)`, RLS, `get_shared_set_info`/`claim_shared_set`/`reset_set_progress` RPCs) all live in Postgres and only need a *correctly authenticated* client — you do **not** need workerd or `SELF.fetch()`. Mirror the established `dict/[word].test.ts` synthetic-`APIContext` pattern, but inject a *real* authenticated client into `locals.supabase`.

- Build the test client **directly** (sign-in / mint JWT), bypassing `src/lib/supabase.ts` (which is hardwired to `astro:env/server` + cookies and whose resolution under plain node Vitest is unproven).
- The middleware **401 gate is bypassed** by direct invocation — cover it separately (assert `isProtected` list / call middleware) or note as out-of-scope for the handler tests.
- **Not recommended for Phase 1:** full `SELF.fetch()` Worker harness (needs `dist/server` build, `wrangler.configPath`, miniflare secret injection) — high cost, negligible gain over the direct layer since RLS is the real thing under test.
- **Contract test** for Risk #2: assert the anon `get_shared_set_info` response shape excludes `share_token` and card content; assert anon direct PostgREST `SELECT` on `sets` returns 0 rows (guards flag #1).

**Must be built (Phase 1 harness bootstrap):** per-user authenticated-client + JWT helper; per-test seeding/teardown for two users + a shared set; a generalized `makeContext` factory (the current one is local to the dict test); fixtures for the anon share-token → `claim_shared_set` flow (no test covers it). Add `@vitejs/plugin-react` as an explicit devDep (imported by `vitest.config.ts:2` but only resolving transitively). No MSW/nock present — not needed for authz tests; continue `vi.stubGlobal("fetch", …)` if a boundary must be faked.

## Response-Guidance Verified (and Corrected)

| Risk | Guidance | Verdict | Correction / grounding to apply |
|------|----------|---------|---------------------------------|
| #1 | User B gets **403/404** on A's resource, reads AND mutations | **Confirmed achievable** | Pin the contract to **404** (resources are hidden via "Set/Flashcard not found", not 403). |
| #1 | Challenge "authenticated = authorized" | **Valid — and it finds a real gap** | Reads are all scoped; the live gap is `POST /api/sessions` (`stats.ts:26`, unchecked body `set_id`). Add a test. |
| #1 | Challenge "RLS handles authorization on its own" | **Valid — critical** | True for reads/most writes, but `reset_set_progress` is SECURITY DEFINER (**bypasses RLS**; guard is in the function). `updateFlashcard`/`deleteFlashcard` writes are RLS-only. Endpoint-level tests are justified. |
| #1 | Cheapest layer: integration (API, two users) | **Confirmed** | Direct handler + real per-user local-Supabase client; not `SELF.fetch()`. |
| #2 | Anon link exposes only that one set — never token, never other sets, no writes | **Confirmed in code** | Reframe to clone-on-claim: anon sees **metadata only** (`{set_id, owner_id, set_name, flashcard_count}`), not card content; content requires an authenticated claim. |
| #2 | Challenge "a broad anon SELECT is fine" | **Valid — was a real past defect** | The broad policy existed and was dropped (`give_set_to_study.sql:7-8`). Add a **regression contract test** so it can't silently return. |
| #2 | Challenge "a token in the URL is safe" | **Valid** | Token is never returned by the RPC; add hardening for the **dormant anon GRANT** + note `owner_id` exposure. |

## Code References

- `src/lib/supabase.ts:5-24` — cookie-backed anon-key SSR client (RLS via JWT).
- `src/middleware.ts:7-17,42-54,87-97` — user resolution, `locals`, `PROTECTED_API_ROUTES`, 401 gate.
- `src/lib/services/sets.ts:18,72-73,88-92,105-108,137-139,172` — ownership `.eq("user_id", userId)` throughout.
- `src/lib/services/flashcards.ts:58-60,97-113,170-175,180-185,199-207,209` — set-ownership pre-checks; RLS-only write (fragile spot A).
- `src/lib/services/reviews.ts:14-16,58-66,127-130` — due-cards ownership gate; submit gate; reset delegation.
- `src/lib/services/stats.ts:26-31` — `logSession` unchecked body `set_id` (fragile spot B / IDOR gap).
- `src/pages/api/sets/[id].ts`, `src/pages/api/flashcards/[id].ts`, `src/pages/api/sets/[id]/{generate,reset-progress,flashcards,due-cards,share,flashcards/batch}.ts`, `src/pages/api/{reviews,sessions,flashcards}/index.ts`, `src/pages/api/share/claim.ts` — handlers.
- `supabase/migrations/20260610000000_initial_schema.sql:5-13,52,78-187` — schema + RLS (incl. old anon policies at :107-111,158-166).
- `supabase/migrations/20260613105815_grant_table_permissions.sql:7-11` — GRANTs (dormant anon SELECT at :8,11).
- `supabase/migrations/20260614120000_submit_card_review_rpc.sql:5-83` — INVOKER RPC.
- `supabase/migrations/20260614200000_give_set_to_study.sql:7-8,76-150` — drops anon policies; `claim_shared_set` (authenticated-only).
- `supabase/migrations/20260615000001_fix_get_shared_set_info_owner.sql:8-26` — anon SECURITY DEFINER read RPC (no token returned).
- `supabase/migrations/20260620120000_reset_set_progress_rpc.sql:6-39` — DEFINER RPC, ownership guard at :16-18.
- `vitest.config.ts:2,17-50` — dual-project config; workers pool narrowly scoped.
- `src/pages/api/dict/[word].test.ts:1-27` — the pattern to mirror (synthetic `APIContext`).
- `wrangler.jsonc`, `astro.config.mjs:11,27,28-38`, `package.json:5-15,45,52,61,69-70` — harness config/versions.

## Architecture Insights

- **Defense-in-depth is the design, not an accident** — service `.eq(user_id)` (readable belt) + RLS (suspenders) + RPCs. Tests should assert the *observable contract* (404 / no leak / no write), which holds regardless of which layer would catch a given attempt.
- **SECURITY DEFINER = the exception to "RLS covers it."** `get_shared_set_info` and `reset_set_progress` bypass RLS by design; their guards (`where share_token = p_token`, `where user_id = p_user_id`) are the whole authorization. That is precisely why an endpoint/integration test — not "we have RLS" — is the right evidence.
- **Clone-on-claim sharing** decouples "anon can see a set exists" (metadata via RPC) from "a user can study it" (authenticated clone). This is why `getDueCardsForSession` checks ownership *only* (not share_token) — recipients study an owned clone.
- **404-not-403** is the consistent posture: cross-user resources are made to look non-existent.

## Historical Context (from prior changes / lessons)

- `context/foundation/lessons.md` — "RLS anon policies must not expose capability tokens": the exact defect that once lived in `20260610000000_initial_schema.sql` and was fixed in `20260614200000_give_set_to_study.sql`. **Grounded as fixed; recommend a regression test.**
- `context/foundation/lessons.md` — "Dostęp do udostępnionych zestawów: serwis musi sprawdzać własność LUB share_token" (originally about `reviews.ts:getDueCardsForSession`): now enforces ownership (`reviews.ts:14-16`); the "OR share_token" branch is handled by the clone-on-claim RPC model, not this service.
- `context/foundation/lessons.md` — "Nowa tabela z RLS wymaga GRANT dla roli authenticated": relevant to the dormant *anon* GRANT flag (the mirror concern — an over-broad grant that outlived its policy).
- `context/foundation/lessons.md` — "Weryfikacja serwisów TypeScript przez npx tsx + JWT użytkownika": a proven local recipe for minting a per-user JWT against local Supabase — directly reusable for the Phase 1 authenticated-client test helper.

## Related Research

- `context/foundation/test-plan.md` §2 (Risk Map #1, #2), §3 (Phase 1), §4 (Stack), §6.2 (integration cookbook — TBD, this phase fills it).

## Open Questions

1. **`POST /api/sessions` cross-set write** (`stats.ts:26`) — intended behavior? Reject non-owned `set_id`, or accept-but-harmless? The test should encode the decision.
2. **Middleware coverage** — do we test the 401 gate separately (direct-invocation bypasses it), or accept it as out-of-scope for handler tests in Phase 1?
3. **Dormant anon GRANT** — fold an explicit `revoke select on public.sets, public.flashcards from anon` into this phase (with a contract test), or leave as a documented hardening item?
4. **`owner_id` exposed to anon** by `get_shared_set_info` — acceptable, or trim to what the SSR page strictly needs?
