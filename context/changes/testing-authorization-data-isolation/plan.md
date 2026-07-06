# Authorization & Data-Isolation Test Rollout (Phase 1) — Implementation Plan

## Overview

Bootstrap the project's first API integration-test harness (`@supabase/supabase-js` clients authenticated per user against a local Supabase), then use it to prove the two top data-isolation risks are protected:

- **Risk #1 — Cross-user access / IDOR:** a logged-in user must not read or mutate another user's set or flashcard.
- **Risk #2 — Share-token leak / read-only link over-exposure:** an anonymous visitor via a capability link must see only that one set's metadata — never the `share_token`, never card content, never other sets — and must not write anything.

Along the way we close the single live IDOR gap (`POST /api/sessions`) test-first, and land a hardening migration that revokes the dormant anon `SELECT` grant so the once-fixed token-enumeration defect cannot silently return.

## Current State Analysis

Grounded in `context/changes/testing-authorization-data-isolation/research.md`:

- **Authorization is defense-in-depth.** `context.locals.supabase` is an `@supabase/ssr` client built from the anon key + the user's session-cookie JWT (`src/lib/supabase.ts:9`, `src/middleware.ts:43-50`) — **RLS runs under the caller's identity**. On top of RLS, the service layer adds explicit `.eq("user_id", userId)` / `sets!inner(user_id)` gates, and two RPCs carry part of the guarantee.
- **Cross-user access returns 404** ("resource hidden"), not 403 — via "Set/Flashcard not found" mappings (`src/lib/services/sets.ts:88-92,105-108`; `src/pages/api/sets/[id].ts:47-52`).
- **RPC nuance:** `submit_card_review` is SECURITY INVOKER (RLS applies); `reset_set_progress` is **SECURITY DEFINER → bypasses RLS**, enforcing ownership only via its own guard `where id = p_set_id and user_id = p_user_id` (`supabase/migrations/20260620120000_reset_set_progress_rpc.sql:16-18`).
- **Fragile write spot:** `updateFlashcard`/`deleteFlashcard` do a join access-check then issue the actual write filtered by `id` only (`src/lib/services/flashcards.ts:180-185,209`) — the write's correctness leans entirely on RLS. Highest-value IDOR test target.
- **Live IDOR gap:** `logSession` inserts `{ user_id, set_id }` from a body `set_id` with no ownership check (`src/lib/services/stats.ts:26-31`); RLS `session_log` only checks `auth.uid() = user_id`, so user B can log a session against user A's `set_id` (`src/pages/api/sessions/index.ts:53`).
- **Risk #2 is closed but has residuals.** Anon read path is the SECURITY DEFINER RPC `get_shared_set_info(p_token)` returning only `{set_id, owner_id, set_name, flashcard_count}` — never the token, never card content (`supabase/migrations/20260615000001_fix_get_shared_set_info_owner.sql:8-26`). The broad anon policy `USING (share_token IS NOT NULL)` was dropped (`20260614200000_give_set_to_study.sql:7-8`). Residual: a **dormant anon `SELECT` GRANT** on `sets`/`flashcards` was never revoked (`20260613105815_grant_table_permissions.sql:8,11`); and the RPC now returns `owner_id` (a UUID) to anon.
- **No integration harness exists.** `vitest.config.ts` has a `node` project (`src/**/*.test.{ts,tsx}`) and a `workers` project (only `dictionary.test.ts` for real HTMLRewriter). No test hits an API route end-to-end. The only route-ish test invokes the handler directly with a synthetic `APIContext` and mocks the service (`src/pages/api/dict/[word].test.ts:1-27`).
- **Local Supabase is ready:** `supabase` CLI is a devDep; `.dev.vars` (gitignored, untracked — confirmed) holds `SUPABASE_URL=http://localhost:54321`, the anon JWT, and the service-role JWT.

### Key Discoveries:

- Handlers read auth exclusively from `context.locals` and never trust a body `user_id` — so a synthetic context injecting a **real** authenticated client into `locals.supabase` exercises the true RLS/RPC path (`src/pages/api/sessions/index.ts:13-16`).
- `@vitejs/plugin-react` is imported by `vitest.config.ts:2` but is **not** an explicit dependency (resolves transitively) — harden by adding it.
- The `node` project globs `src/**/*.test.{ts,tsx}`; putting integration tests **outside** `src/` (under `tests/integration/`) keeps them out of the default run for free — critical because they require a running local Supabase (CI enforcement is deferred to test-plan Phase 5).
- Lessons: mint per-user JWTs via the Admin API / service-role (`lessons.md` "Weryfikacja serwisów… JWT użytkownika"); **never `db reset`** for teardown (`lessons.md` "Never reset Supabase…") — delete only created test users; any API contract change updates `src/lib/openapi/openapi-spec.ts` (`lessons.md` "Zmiana funkcji API…").

## Desired End State

- `npm run test:integration` spins the authorization suite against a locally running Supabase and passes; the suite **auto-skips** cleanly when no local Supabase env is present, so `npm test` and current CI stay green.
- Multi-user tests prove user B receives **404** on user A's sets/flashcards for reads AND mutations (including the RLS-only flashcard writes and the DEFINER `reset_set_progress`), plus a middleware test proving anon → protected API route → **401**.
- The `POST /api/sessions` gap is closed: a non-owned `setId` yields **404** and writes no `session_log` row, with a test that failed before the fix and passes after.
- Anon-share tests prove the capability link exposes only that one set's metadata, never the `share_token` or card content, rejects wrong tokens, and permits no writes; a regression test proves anon cannot directly `SELECT` `sets`/`flashcards`; and a migration revokes the dormant anon grant.
- `context/foundation/test-plan.md` §6.2 cookbook is filled in with the reusable integration-test recipe.

## What We're NOT Doing

- **No `SELF.fetch()` / full workerd Worker harness** (needs `dist/server` build, `wrangler.configPath`, miniflare secret injection) — RLS is fully exercisable via direct-handler + real-local-Supabase; high cost, negligible gain.
- **No CI wiring / merge gate** — that is test-plan Phase 5. Phase 1 only guarantees local runnability + clean auto-skip.
- **No MSW/nock** — authorization tests need a real DB, not a mocked boundary (that's Phase 3 of the rollout).
- **No refactor of the authorization architecture** — we test the existing contract; the only production change is the `/api/sessions` ownership check and the anon-grant revoke.
- **Not trimming `owner_id` from `get_shared_set_info`** — it is required for SSR self-link detection; accepted and documented (it is a UUID, not the token, not PII).
- **Not adding tests for every endpoint** — core + extensible pattern (per decision); `generate` and other set/flashcard routes are left as documented extension points.

## Implementation Approach

Build the harness once (Phase 1) as reusable helpers under `tests/integration/`, then add thin per-risk test files that consume them. Each test creates uniquely-named throwaway users via the service-role Admin API, seeds data through authenticated per-user clients, invokes the real exported route handlers with a synthetic `APIContext`, asserts on the `Response`, and tears down by deleting the users (FK cascade). A single env-guard helper makes every suite `describe.skipIf(!hasSupabaseEnv)` so the harness is inert without a local DB.

## Critical Implementation Details

- **Test isolation & teardown:** create users with unique emails per run (derive uniqueness from the test file/index, not `Date.now()` if a deterministic seed is preferred); tear down with `serviceClient.auth.admin.deleteUser(id)`. Confirm the FK cascade chain (`auth.users → sets → flashcards → reviews`, and `session_log`) actually deletes dependents; if any FK lacks `on delete cascade`, delete child rows explicitly before the user. Never run `supabase db reset`.
- **Module resolution under Vitest (node env):** route handlers may transitively import `cloudflare:workers` (via `ai-rate-limit`) and middleware imports `astro:env/server` (via `@/lib/supabase`). The integration project must alias `cloudflare:workers` to the existing stub and add an `astro:env/server` stub that re-exports values from `process.env`. Build the authenticated test clients **directly** with `@supabase/supabase-js` — do not route through `src/lib/supabase.ts`.
- **Env loading:** a setup file parses the existing `.dev.vars` (simple `KEY=VALUE`) into `process.env` when unset, exposing `SUPABASE_URL`, anon key, and service-role key; `hasSupabaseEnv` is false when any is missing → suites skip.
- **RLS-under-JWT is the thing under test:** the per-user client must send `Authorization: Bearer <access_token>` and disable session persistence, so each request runs as that Postgres role. A service-role client is used only for user create/delete and cross-check assertions (e.g. verifying user A's rows are untouched after a rejected write).

---

## Phase 1: Integration-test harness bootstrap

### Overview

Create the reusable, auto-skipping integration harness and prove it with an owner happy-path smoke test. No product code changes.

### Changes Required:

#### 1. Vitest integration project

**File**: `vitest.config.ts`

**Intent**: Add a third project `integration` that runs Node-env tests under `tests/integration/`, isolated from the default `node`/`workers` projects so it never runs without a local Supabase.

**Contract**: New project entry with `test.name: "integration"`, `environment: "node"`, `include: ["tests/integration/**/*.test.ts"]`, `plugins: [react()]`, a `setupFiles` entry for the env loader, and `resolve.alias` extending the base alias with the `cloudflare:workers` stub and a new `astro:env/server` stub. The existing `node` project keeps `include: ["src/**/*.test.{ts,tsx}"]` (integration tests live outside `src/`, so no exclude change needed).

#### 2. Test scripts + explicit devDep

**File**: `package.json`

**Intent**: Add an on-demand integration script and keep the default test run limited to node+workers; pin `@vitejs/plugin-react` explicitly.

**Contract**: `"test:integration": "vitest run --project integration"`; change `"test"` to `"vitest run --project node --project workers"` and `"test:watch"` accordingly; add `@vitejs/plugin-react` to `devDependencies`.

#### 3. Env stub for `astro:env/server`

**File**: `src/test/astro-env-server.stub.ts`

**Intent**: Let modules that import server env (middleware via `@/lib/supabase`) load under Vitest by re-exporting `process.env` values.

**Contract**: Named exports `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (and any other `astro:env/server` names used) sourced from `process.env`.

#### 4. Env loader / skip guard

**File**: `tests/integration/helpers/env.ts`

**Intent**: Populate `process.env` from `.dev.vars` when unset and expose a boolean the suites gate on.

**Contract**: Exports `hasSupabaseEnv: boolean` and resolved `{ supabaseUrl, anonKey, serviceRoleKey }`. Consumed as a `setupFiles` module and imported by helpers.

#### 5. Supabase auth/user helper

**File**: `tests/integration/helpers/supabase.ts`

**Intent**: Create/sign-in throwaway users and produce per-user RLS-scoped clients; provide a service-role client for setup/teardown/cross-checks.

**Contract**: `serviceClient()`; `createTestUser({ email?, password? }) → { id, email, password }` (via `auth.admin.createUser`, `email_confirm: true`); `userClient(email, password) → SupabaseClient` (signs in, returns a client with `global.headers.Authorization: Bearer <token>`, `auth.persistSession: false`); `deleteTestUser(id)`. All keyed off `env.ts`.

#### 6. Synthetic API context factory

**File**: `tests/integration/helpers/context.ts`

**Intent**: Generalize the dict-test `makeContext` pattern so any route handler can be invoked with an injected user + real client.

**Contract**: `makeApiContext({ user, supabase, params?, body?, request? }) → APIContext` (cast `as unknown as`), where `request.json()` resolves `body`. Mirrors `src/pages/api/dict/[word].test.ts:16-27`.

#### 7. Seed helper

**File**: `tests/integration/helpers/seed.ts`

**Intent**: Create a set (and optional flashcards) owned by a given user client, returning ids for assertions.

**Contract**: `seedSet(userClient, { name?, cards? }) → { setId, flashcardIds }` using the same insert shapes the services use (`sets`, `flashcards`).

#### 8. Smoke test

**File**: `tests/integration/smoke.test.ts`

**Intent**: Prove the harness end-to-end: an authenticated owner creates a set and reads it back through a real handler; confirm auto-skip when env is absent.

**Contract**: `describe.skipIf(!hasSupabaseEnv)`; owner seeds a set, invokes `GET /api/sets/[id]/flashcards` handler via `makeApiContext`, expects `200` and the owned set; `afterAll` deletes the user.

#### 9. Cookbook update

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the §6.2 "TBD" with the concrete recipe (helpers, per-user client, skip guard, `npm run test:integration`, `npx supabase start` prerequisite).

**Contract**: §6.2 prose only; no strategy (§1–§5) changes beyond the Phase 1 status already set to `researched` (implement will advance to `implementing`/`complete`).

### Success Criteria:

#### Automated Verification:

- [ ] Integration project is recognized: `npm run test:integration` runs (0 failures) with local Supabase started.
- [ ] Auto-skip works: with Supabase stopped / env unset, `npm run test:integration` reports the suite skipped (not failed).
- [ ] Default run unaffected: `npm test` runs only node+workers and stays green.
- [ ] Type-check passes: `npm run build`.

#### Manual Verification:

- [ ] `npx supabase start`, then `npm run test:integration` — smoke test creates a user, reads its set, and cleans up (verify no leftover test users via Supabase Studio).
- [ ] Stop Supabase; re-run — suite skips cleanly with a clear message.

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 2.

---

## Phase 2: Risk #1 — cross-user IDOR authorization suite

### Overview

Prove user B is denied (404) on user A's resources for representative reads and the highest-risk mutations, and that the anon→protected-route gate returns 401. Consumes Phase 1 helpers; no product code changes.

### Changes Required:

#### 1. Set-level IDOR tests

**File**: `tests/integration/authorization/sets.idor.test.ts`

**Intent**: User B cannot read or mutate user A's set.

**Contract**: Two users, A seeds a set. Assert B → `404` on: `GET /api/sets/[id]/flashcards`, `GET /api/sets/[id]/due-cards`, `GET /api/sets/[id]/share` (and assert the response body never contains `share_token`), `PATCH /api/sets/[id]` (rename), `DELETE /api/sets/[id]`. Positive control: A succeeds. After B's rejected delete, use the service client to assert A's set still exists.

#### 2. Flashcard-level IDOR tests (RLS-only write focus)

**File**: `tests/integration/authorization/flashcards.idor.test.ts`

**Intent**: Cover the fragile check-then-act writes where correctness depends on RLS.

**Contract**: A seeds a set with a card. Assert B → `404` on: `POST /api/flashcards` (body `set_id` = A's set), `POST /api/sets/[id]/flashcards/batch`, `PATCH /api/flashcards/[id]` (A's card), `DELETE /api/flashcards/[id]` (A's card). After each rejected mutation, service-client cross-check that A's card is unchanged / still present.

#### 3. Review + reset-progress IDOR tests (RPC paths)

**File**: `tests/integration/authorization/reviews.idor.test.ts`

**Intent**: Cover the INVOKER and DEFINER RPC authorization paths.

**Contract**: Assert B → `404` on `POST /api/reviews` (A's `flashcardId`) and `POST /api/sets/[id]/reset-progress` (A's set). For reset, service-client cross-check that A's flashcard FSRS state and `reviews` rows are untouched (proves the DEFINER guard, not RLS, held).

#### 4. Middleware 401-gate test

**File**: `tests/integration/authorization/middleware.auth-gate.test.ts`

**Intent**: Prove an unauthenticated request to a protected API route is blocked before reaching a handler.

**Contract**: Import the middleware `onRequest`; build a cookie-less `APIContext` for a `PROTECTED_API_ROUTES` path (e.g. `/api/sets`); assert it resolves to `401` JSON (does not call `next` through to a handler). Relies on the `astro:env/server` stub from Phase 1.

### Success Criteria:

#### Automated Verification:

- [ ] `npm run test:integration` passes with all Phase 2 suites green (local Supabase up).
- [ ] Every cross-user assertion expects `404` (not 403); the 401-gate test expects `401`.
- [ ] Type-check passes: `npm run build`.

#### Manual Verification:

- [ ] Spot-check one failing-path assertion by temporarily weakening a service ownership check locally and confirming the test goes red (proves the test has teeth), then revert.
- [ ] Confirm no test users remain after the run.

**Implementation Note**: Pause for manual confirmation before Phase 3.

---

## Phase 3: Close the `POST /api/sessions` IDOR gap (reveal → fix)

### Overview

Write a failing multi-user test that demonstrates user B logging a session against user A's `set_id`, then add the missing ownership check so the endpoint returns 404 and writes nothing.

### Changes Required:

#### 1. Failing IDOR test (RED)

**File**: `tests/integration/authorization/sessions.idor.test.ts`

**Intent**: Encode the intended behavior — B cannot log a session against A's set.

**Contract**: A seeds a set; B calls `POST /api/sessions` with `setId` = A's set. Assert `404` and, via service client, assert **no** `session_log` row exists for `(user_id = B, set_id = A's set)`. Positive control: B logging against B's own set → `200`.

#### 2. Ownership check in `logSession`

**File**: `src/lib/services/stats.ts`

**Intent**: Verify the caller owns `setId` before inserting, mirroring the reviews/flashcards service pattern.

**Contract**: Before the `session_log` insert, `select id from sets where id = setId and user_id = userId`; if absent, return a not-found signal. Extend the return type to `{ error: string | null; notFound?: boolean }` (or a discriminated result consistent with sibling services).

#### 3. Map not-found to 404

**File**: `src/pages/api/sessions/index.ts`

**Intent**: Translate the service not-found signal into a 404 response.

**Contract**: After `logSession`, branch on the not-found signal → `404 { error: "Set not found" }`; keep `500` for genuine DB errors and `200` on success.

#### 4. OpenAPI spec update

**File**: `src/lib/openapi/openapi-spec.ts`

**Intent**: Keep the API contract doc in sync (per lessons rule) — `POST /api/sessions` now has a 404.

**Contract**: Add the `404` response to the `POST /api/sessions` operation.

### Success Criteria:

#### Automated Verification:

- [ ] The new test fails before the `logSession` change and passes after (verified by running it against the pre-fix code once).
- [ ] `npm run test:integration` passes (all suites).
- [ ] `npm test` (node+workers) still green — no regression in existing stats/service unit expectations.
- [ ] Type-check passes: `npm run build`; lint the changed `.ts` files: `npx eslint src/lib/services/stats.ts src/pages/api/sessions/index.ts src/lib/openapi/openapi-spec.ts`.

#### Manual Verification:

- [ ] Owner can still log a session (dashboard study flow records activity) after the fix.
- [ ] Scalar docs (`/docs/api`) show the 404 on `POST /api/sessions`.

**Implementation Note**: Pause for manual confirmation before Phase 4.

---

## Phase 4: Risk #2 — anon share exposure tests + hardening migration

### Overview

Prove the anon capability path leaks nothing beyond one set's metadata and permits no writes; add a regression test for the once-broad anon SELECT; and revoke the dormant anon table grant.

### Changes Required:

#### 1. Anon share-path exposure tests

**File**: `tests/integration/share/anon-share.test.ts`

**Intent**: Prove the RPC contract and that anon sees only its one set.

**Contract**: Owner A seeds a set and activates its `share_token` (via the `/api/sets/[id]/share` handler as A). Using an **anon** client: `rpc("get_shared_set_info", { p_token })` returns exactly one row with keys `{set_id, owner_id, set_name, flashcard_count}` and **no `share_token`** and **no card front/back**; a random/unknown token → 0 rows; a second owner's set is never returned. Assert anon cannot `claim`: `POST /api/share/claim` with `locals.user = null` → `401`.

#### 2. Anon direct-table regression test

**File**: `tests/integration/share/anon-direct-select.test.ts`

**Intent**: Guard against re-introducing a broad anon SELECT (the dropped policy) — the documented past defect.

**Contract**: Anon client `from("sets").select("*")` and `from("flashcards").select("*")` return **no rows** (and, after the migration below, a permission-denied error). Explicitly assert that no returned row exposes `share_token`.

#### 3. Revoke dormant anon grant (migration)

**File**: `supabase/migrations/20260706120000_revoke_anon_table_select.sql` (implementer sets the real `YYYYMMDDHHmmss`)

**Intent**: Remove the latent footgun so the anon path is exclusively the token-scoped RPC.

**Contract**: `revoke select on public.sets from anon;` and `revoke select on public.flashcards from anon;` (execute grant on `get_shared_set_info` to anon is retained). Include a short comment citing the lesson.

#### 4. Document `owner_id` acceptance

**File**: `context/changes/testing-authorization-data-isolation/plan.md` (this file) + inline test comment

**Intent**: Record that `owner_id` in the RPC output is intentional (SSR self-link detection), not a leak to remediate.

**Contract**: Note in the anon-share test that `owner_id` is expected and acceptable; no code change.

### Success Criteria:

#### Automated Verification:

- [ ] Migration applies cleanly: `npx supabase migration up --local`.
- [ ] `npm run test:integration` passes with Phase 4 suites; the direct-select regression test confirms anon reads nothing (post-migration: access denied).
- [ ] The RPC-shape assertion fails if `share_token` ever appears in the output (verified by a negative check).
- [ ] Type-check passes: `npm run build`.

#### Manual Verification:

- [ ] Visit `/share/[token]` in a browser as an anonymous visitor — the shared set's name + count render; no console/network response contains `share_token`.
- [ ] A logged-in user can still claim the shared set (clone-on-claim flow) after the migration.

**Implementation Note**: After Phase 4, update `context/foundation/test-plan.md` §3 Phase 1 status to `complete` and note the harness in §6.2.

---

## Testing Strategy

### Unit Tests:

- Existing unit/component tests remain untouched and green under the `node` project.

### Integration Tests:

- Multi-user IDOR: reads (flashcards, due-cards, share) and mutations (set rename/delete, flashcard create/batch/update/delete, review, reset-progress) — user B always 404; owner always succeeds; A's data verified untouched after rejected writes via the service client.
- Auth gate: anon → protected API route → 401 (middleware).
- Sessions gap: B → A's set → 404 + no row (RED before fix, GREEN after).
- Anon share: RPC returns metadata only, one set, no token, no card content; unknown token → empty; anon claim → 401; anon direct SELECT → empty/denied.

### Manual Testing Steps:

1. `npx supabase start`; `npm run test:integration` → all green; confirm no residual test users.
2. Stop Supabase; `npm run test:integration` → suites skip cleanly.
3. Browser: anon `/share/[token]` renders metadata only, no token in responses; authenticated claim still works.
4. Owner study flow still logs sessions after the `/api/sessions` fix; Scalar shows the new 404.

## Performance Considerations

Integration tests hit a local DB and are inherently slower than unit tests; keep them out of the default `npm test` (already ensured by the separate project) so the fast feedback loop and current CI are unaffected. Use per-test users to allow parallelism without cross-test interference.

## Migration Notes

The only schema change is `revoke select on public.sets, public.flashcards from anon` — purely a privilege removal with no data migration. It is safe because anon already reads 0 rows (RLS default-deny after the dropped policies); the revoke strengthens the posture from "allowed but filtered to nothing" to "not permitted." Rollback is a matching `grant select ... to anon` if ever needed (not expected).

## References

- Research: `context/changes/testing-authorization-data-isolation/research.md`
- Test plan: `context/foundation/test-plan.md` (§2 Risks #1/#2, §3 Phase 1, §4 Stack, §6.2 cookbook)
- Pattern to mirror (synthetic `APIContext`): `src/pages/api/dict/[word].test.ts:1-27`
- Existing Vitest config: `vitest.config.ts`
- Anon RPC: `supabase/migrations/20260615000001_fix_get_shared_set_info_owner.sql:8-26`
- Dormant grant: `supabase/migrations/20260613105815_grant_table_permissions.sql:8,11`
- Sessions gap: `src/lib/services/stats.ts:26-31`, `src/pages/api/sessions/index.ts:53`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Integration-test harness bootstrap

#### Automated

- [x] 1.1 Integration project recognized: `npm run test:integration` runs (0 failures) with local Supabase — fbe56ed
- [x] 1.2 Auto-skip works: suite skips (not fails) when Supabase stopped / env unset — fbe56ed
- [x] 1.3 Default run unaffected: `npm test` runs only node+workers and stays green — fbe56ed
- [x] 1.4 Type-check passes: `npm run build` — fbe56ed

#### Manual

- [x] 1.5 `supabase start` + `test:integration`: smoke test creates user, reads its set, cleans up (no leftovers) — fbe56ed
- [x] 1.6 Stopped Supabase: suite skips cleanly with a clear message — fbe56ed

### Phase 2: Risk #1 — cross-user IDOR authorization suite

#### Automated

- [x] 2.1 `npm run test:integration` passes with all Phase 2 suites green — c5af5ef
- [x] 2.2 Cross-user assertions expect 404; the 401-gate test expects 401 — c5af5ef
- [x] 2.3 Type-check passes: `npm run build` — c5af5ef

#### Manual

- [x] 2.4 Temporarily weakening an ownership check turns a test red (test has teeth), then revert — c5af5ef
- [x] 2.5 No test users remain after the run — c5af5ef

### Phase 3: Close the POST /api/sessions IDOR gap (reveal → fix)

#### Automated

- [x] 3.1 New sessions test fails before the fix and passes after — 73c8bf6
- [x] 3.2 `npm run test:integration` passes (all suites) — 73c8bf6
- [x] 3.3 `npm test` (node+workers) still green — 73c8bf6
- [x] 3.4 Type-check + lint changed files pass (`npm run build`; `npx eslint` on the 3 changed files) — 73c8bf6

#### Manual

- [x] 3.5 Owner can still log a session after the fix — 73c8bf6
- [x] 3.6 Scalar `/docs/api` shows the 404 on POST /api/sessions — 73c8bf6

### Phase 4: Risk #2 — anon share exposure tests + hardening migration

#### Automated

- [x] 4.1 Migration applies cleanly: `npx supabase migration up --local`
- [x] 4.2 `npm run test:integration` passes with Phase 4 suites; direct-select regression confirms anon reads nothing
- [x] 4.3 RPC-shape assertion fails if `share_token` ever appears in output (negative check)
- [x] 4.4 Type-check passes: `npm run build`

#### Manual

- [x] 4.5 Anon `/share/[token]` renders metadata only; no `share_token` in any response
- [x] 4.6 Logged-in user can still claim the shared set after the migration
