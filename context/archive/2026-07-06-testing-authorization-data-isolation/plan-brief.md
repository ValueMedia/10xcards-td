# Authorization & Data-Isolation Test Rollout (Phase 1) — Plan Brief

> Full plan: `context/changes/testing-authorization-data-isolation/plan.md`
> Research: `context/changes/testing-authorization-data-isolation/research.md`

## What & Why

Stand up the project's first API integration-test harness and use it to prove the two top data-isolation risks are protected: **cross-user access / IDOR** (Risk #1) and **share-token leak** (Risk #2). Data isolation is the PRD's critical guardrail, and today no test exercises an API route end-to-end.

## Starting Point

Authorization is real and layered (service `.eq(user_id)` + RLS under the caller's JWT + two RPCs), and Risk #2 is already closed in code (anon reads go through a SECURITY DEFINER RPC that never returns the token; the old broad anon policy was dropped). But there is no test proving any of it, one live IDOR gap (`POST /api/sessions` accepts a body `set_id` without an ownership check), and a dormant anon `SELECT` grant that could re-open the token leak if a future policy is careless.

## Desired End State

`npm run test:integration` runs a multi-user + anon authorization suite against a local Supabase and passes; it auto-skips when no DB is present so `npm test`/CI stay green. Cross-user attempts return 404 for reads and mutations, the sessions gap is closed (404 + no row), and anon share exposes only one set's metadata — never the token, never card content, no writes — backed by a hardening migration.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| DB backing for tests | Real local Supabase, per-user JWT clients | Only a real DB exercises RLS/RPC/DEFINER — the actual authorization logic | Plan |
| Test layer | Direct handler invocation, not `SELF.fetch()` | RLS lives in Postgres; workerd harness is high-cost, no gain | Research/Plan |
| Harness isolation | Separate Vitest `integration` project + `skipIf` env guard | Keeps DB-dependent tests out of the default run and current CI | Plan |
| `/api/sessions` gap | Reveal with a failing test, then fix (ownership check) | Closes the one live IDOR hole while proving it test-first | Plan |
| Anon hardening | Revoke dormant anon grant + regression contract test | Prevents silent return of the once-fixed token-enumeration defect | Plan |
| `owner_id` to anon | Accept, documented | Needed for SSR self-link detection; a UUID, not the token/PII | Research/Plan |
| Coverage breadth | Core + extensible pattern | Cover the riskiest paths now, make adding more trivial | Plan |
| Cross-user status code | Assert 404 (not 403) | Grounded contract — resources are hidden, not forbidden | Research |

## Scope

**In scope:** integration harness (helpers, per-user clients, seed, skip guard, script); IDOR suite (reads + mutations + 401 gate); `/api/sessions` fix; anon-share exposure + regression tests; anon-grant revoke migration; OpenAPI + cookbook updates.

**Out of scope:** `SELF.fetch()`/workerd harness; CI merge gate (rollout Phase 5); MSW/nock; authorization refactor; trimming `owner_id`; a test for every endpoint.

## Architecture / Approach

Reusable helpers under `tests/integration/` create throwaway users via the service-role Admin API, produce RLS-scoped per-user clients (JWT in `Authorization` header), seed data, invoke the real exported route handlers with a synthetic `APIContext`, assert on the `Response`, and tear down by deleting users (FK cascade — never `db reset`). A `cloudflare:workers` stub (existing) and a new `astro:env/server` stub let handlers/middleware load under Node-env Vitest.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Harness bootstrap | Auto-skipping integration harness + smoke test | Module resolution (`astro:env/server`, `cloudflare:workers`) under Vitest |
| 2. IDOR suite | User B → 404 on A's reads + mutations; anon → 401 | Middleware test needs the env stub; RLS-only writes must be cross-checked |
| 3. Sessions fix | 404 + no row for non-owned `setId` (RED→GREEN) | Return-shape change to `logSession`; OpenAPI sync |
| 4. Anon share + hardening | Metadata-only exposure proven; anon grant revoked | Migration ordering vs. the direct-select regression assertion |

**Prerequisites:** local Supabase running (`npx supabase start`, Docker); `.dev.vars` with anon + service-role keys (present).
**Estimated effort:** ~2–4 sessions across 4 phases (Phase 1 is the bulk — new infrastructure).

## Open Risks & Assumptions

- Teardown assumes FK `on delete cascade` from `auth.users` through `sets → flashcards → reviews` and `session_log`; if any link lacks cascade, delete children explicitly.
- `astro:env/server` resolution under Node-env Vitest is unproven; mitigated by a stub + building test clients directly (bypassing `src/lib/supabase.ts`).
- Integration tests are local-only until rollout Phase 5 wires CI; a future contributor without Docker sees skips, not failures.

## Success Criteria (Summary)

- User B provably cannot read or mutate user A's sets/flashcards (404), and anon cannot reach protected routes (401).
- The `/api/sessions` gap is closed and covered by a test that failed before the fix.
- An anon capability link exposes only that one set's metadata (never the token or card content) and permits no writes, with a regression guard and a grant-revoking migration in place.
