# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-07-06 (Phase 1 change opened)

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the team
   is worried about X, and the failure would surface somewhere in <area>"
   carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/` (excluding docs,
fixtures, build output). 95 commits in the last 30 days.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|-------------------------|--------|------------|--------------------------------|
| 1 | Cross-user access / IDOR — a logged-in user reads or edits another user's set or flashcard because an endpoint checks "authenticated," not "owns this resource." | High | High | PRD Success Criteria guardrail (data isolation = critical regression); interview Q1, Q4 (AUTH); lessons "Dostęp do udostępnionych zestawów"; hot-spot dir `src/pages/api` (54 commits/30d) |
| 2 | Share-token leak / read-only link over-exposure — an anon visitor via a capability link enumerates other sets' tokens or performs writes. | High | Medium | lessons "RLS anon policies must not expose capability tokens" (past defect); PRD FR-008 + Access Control; interview Q1 |
| 3 | SR review-state corruption / loss — submitting a review persists the wrong state, so the learned-cards count or "due" selection drifts and study history is lost. | High | High | interview Q1, Q3, Q4 (reviews); hot-spot dir `src/components/review` (12 commits/30d), `src/lib/services` (45 commits/30d) |
| 4 | Flashcard data loss on save/batch — generated or imported flashcards fail to persist in full (partial batch, silent drop). | High | Medium | interview Q1; PRD US-01 / FR-003; hot-spot dir `src/pages/api` (54 commits/30d), `src/components/sets` (61 commits/30d) |
| 5 | AI generation failure does not surface cleanly — the provider is unavailable, times out (>10s), or returns malformed output, and the user gets an empty/garbage saved set or an endless spinner instead of a clean error. | High | High | interview Q1, Q2, Q3; PRD FR-002 + NFR (<10s); hot-spot dir `src/components/ai` (10 commits/30d), `src/pages/api` (generate route) |
| 6 | Cambridge Dictionary integration failure does not surface cleanly — the dictionary is down or changed format and lookup crashes or blanks instead of showing a clean error. | Medium | Medium | interview Q1, Q2; happy path already covered (`dictionary.test.ts`, `dict/[word].test.ts`) |
| 7 | UI text not updating on language switch — after changing the app locale, stale text remains because of island hydration / reactivity. | Medium | Medium | interview Q2, Q5 (explicit exception); lessons "React Context i hydratacja muszą żyć WEWNĄTRZ jednej wyspy"; hot-spot dir `src/lib/i18n` (43 commits/30d), `src/components/settings` (24 commits/30d) |

**Impact × Likelihood rubric.** High = user loses access/data/money or the
failure is publicly visible / area changes weekly or we have already been
burned. Medium = feature degrades with a workaround / touched occasionally
and has produced bugs. Low = cosmetic, stable code. Protect High × High
first (Risks #1, #3, #5).

**Abuse / security lens.** The product has auth and accepts user input, so
the map carries authorization (Risk #1 — IDOR / ownership checks) and
secret leakage (Risk #2 — capability-token exposure). Resource abuse (the
cost of AI generation) is folded into Risk #5 as a check on the existing
`ai-rate-limit` gate rather than a separate row.

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | User B gets 403/404 on user A's resource, for reads AND mutations. | "Authenticated = authorized"; "RLS handles authorization on its own." | Where ownership is enforced: endpoint vs RLS vs service; shape of session / `locals.user`. | Integration (API, two users). | Testing only the owner's happy path; relying on RLS without an endpoint-level test. |
| #2 | An anon link exposes only that one set — never the token, never other sets — and permits no writes. | "A token in the URL is safe"; "a broad anon SELECT is fine." | The anon path: RPC/view vs table; whether the `share_token` column is ever returned. | Integration + contract on the anon response shape. | Testing that the link works without testing that everything else does NOT leak. |
| #3 | After submit, the "due"/learned state is verifiably correct on the next fetch. | "HTTP 200 means the state was saved correctly." | Source of truth for "due"; write ordering; idempotency of a repeated submit. | Integration (submit → re-fetch → assert state). | Oracle problem: asserting a value computed by the same logic as the code; happy path without a re-fetch. |
| #4 | Every flashcard in a batch persists, or the whole batch fails atomically with a clear error. | "An OK response means everything was saved." | Batch semantics: atomic vs partial write; per-flashcard validation. | Integration (batch endpoint). | Testing a single flashcard; no test for a partial or rejected batch. |
| #5 | Failure / timeout / malformed output yields a clean UI error, ZERO partial save, respects the <10s NFR, and the rate-limit gate holds. | "A final 200 means success"; "the parser returned something, so it's fine." | Provider boundary (OpenRouter) and where to mock it; the response contract shape; `ai-rate-limit` behavior. | Integration with a mocked boundary + contract test on parsing. | Oracle problem on the parser's output; testing provider uptime (untestable). |
| #6 | Dictionary down / format change yields a clean error and no crash; the happy path already exists. | "The provider always returns this shape." | The error path in `dict/[word]`, timeout handling, the response contract shape. | Integration (error path) — happy path already covered. | Duplicating the existing happy-path test instead of the error path. |
| #7 | Switching the language immediately changes the visible text in a mounted island. | "The provider rendered once, so it reacts to a locale change." | Island boundary, where the i18n Context lives, how locale enters as a prop. | Component test (RTL, language switch). | Meaningless snapshot; asserting the text exists rather than that it changes. |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|------------|-----------------|---------------|------------|--------|---------------|
| 1 | Authorization & data-isolation | Prove a user cannot reach another user's data (PRD critical guardrail); bootstrap the API integration harness. | #1, #2 | integration (multi-user + anon/token), contract | complete | context/changes/testing-authorization-data-isolation/ |
| 2 | SR state & flashcard persistence | Prove study history and flashcards neither vanish nor corrupt. | #3, #4 | integration (submit→re-fetch, batch) | not started | — |
| 3 | External integration failure paths | Prove AI and dictionary failures surface cleanly, with no silent data loss. | #5, #6 | integration with mocked boundary + contract | not started | — |
| 4 | i18n reactivity | Prove a language switch immediately refreshes the UI. | #7 | component (RTL) | not started | — |
| 5 | Quality-gate wiring | Lock the floor: CI blocks merge on red tests. | cross-cutting | gates (`vitest run` in CI) | not started | — |

**Status vocabulary** (fixed — parser literals): `not started` →
`change opened` → `researched` → `planned` → `implementing` → `complete`.

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.

| Layer | Tool | Version | Notes |
|-------|------|---------|-------|
| unit + integration | Vitest | ^3.0.0 | Configured (`vitest.config.ts`); 7 test files, profile `sparse` — clustered in `services` + `i18n`. |
| API / Worker integration | `@cloudflare/vitest-pool-workers` | ^0.8.71 | Present in devDeps; the intended path for testing API routes against the `workerd` runtime. Addressed by §3 Phase 1. |
| component | `@testing-library/react` + `jsdom` | ^16.3.2 / ^29.1.1 | Present; used by the LanguageSwitcher test. Basis for §3 Phase 4. |
| API mocking | none yet — see §3 Phase 3 | — | No MSW. Mock the provider boundary (OpenRouter / dictionary) at the network edge; verify tool choice during research. |
| e2e | none | — | Not adopted. No browser-level flow is in scope for this rollout (Q5 excludes UI beyond i18n). |
| accessibility | none | — | Out of scope for this rollout. |

**Stack grounding tools (current session):**
- Docs: none — Context7 not available in current session; recommend installing before §3 Phase 1 `/10x-research` for `workerd` + Vitest / `vitest-pool-workers` setup details; checked: 2026-07-06
- Search: WebSearch available — not yet used; use to verify current `@cloudflare/vitest-pool-workers` and mocking-boundary guidance during research; checked: 2026-07-06
- Runtime/browser: none — no Playwright MCP; no browser-level tests planned; checked: 2026-07-06
- Provider/platform: Supabase MCP present but interactive-auth only — read-only DB inspection could support integration-test fixtures; not used yet; checked: 2026-07-06

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required after §3 Phase N" means the gate is enforced once that rollout
phase lands; before that, the gate is `planned`.

| Gate | Where | Required? | Catches |
|------|-------|-----------|---------|
| lint + typecheck | local + CI | required | syntactic / type drift (note: `npm run lint` may crash on `.astro`; `npm run build` type-checks Astro — see lessons) |
| unit + integration | local + CI | required after §3 Phase 1 | authorization, data-loss, and integration-failure regressions |
| component (i18n reactivity) | local + CI | required after §3 Phase 4 | stale UI on locale change |
| CI test gate (`vitest run`) | CI on PR | required after §3 Phase 5 | any red test reaching `main` |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase N."

### 6.1 Adding a unit test

- **Location**: next to the unit under test (e.g. `src/lib/services/<name>.test.ts`) or under a co-located `__tests__/`.
- **Reference test**: `src/lib/services/csv-parser.test.ts`.
- **Run locally**: `npm run test` (single run) or `npm run test:watch`.

### 6.2 Adding an integration test (API / Worker)

API authorization tests run against a **real local Supabase** (not workerd/`SELF.fetch()`) — RLS/RPCs live in Postgres, so an authenticated `@supabase/supabase-js` client injected into a route handler exercises the true access path.

- **Prerequisite**: `npx supabase start` (Docker). Env is read from the gitignored `.dev.vars` (`SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).
- **Location**: `tests/integration/**/*.test.ts` (outside `src/`, so the default `npm test` never runs them). Helpers live in `tests/integration/helpers/`.
- **Run**: `npm run test:integration` (the `integration` Vitest project). The suite **auto-skips** when Supabase env is absent (`describe.skipIf(!hasSupabaseEnv)`), so it never breaks the default run or CI before §3 Phase 5.
- **Pattern**:
  1. `createTestUser()` → throwaway confirmed user (Admin API); `userClient(user)` → RLS-scoped client authenticated as that user; `anonClient()` → `anon` role.
  2. `seedSet(client, userId, { cards })` to create owned data.
  3. `makeApiContext({ user, supabase, params, body })` and call the exported handler (`GET`/`POST`) directly; assert on the `Response`.
  4. `deleteTestUser(id)` in `afterAll` (FK cascade cleans up dependents — **never** `supabase db reset`).
  5. Cross-check with `serviceClient()` (service-role) when asserting another user's data is untouched.
- **Reference**: `tests/integration/smoke.test.ts` (owner happy path); `tests/integration/authorization/**` (multi-user + anon).
- **Module resolution**: the `integration` project aliases `cloudflare:workers` and `astro:env/server` to stubs in `src/test/` so handlers/middleware load under Node; build test clients directly, not via `src/lib/supabase.ts`.

### 6.3 Adding a test for SR state / persistence

- TBD — see §3 Phase 2. Will cover the submit → re-fetch → assert-state pattern that guards against oracle-problem assertions.

### 6.4 Adding a test for an external integration failure path

- TBD — see §3 Phase 3. Will cover mocking the provider boundary (OpenRouter / dictionary) and the clean-failure / no-partial-save contract.

### 6.5 Adding a component test (i18n reactivity)

- TBD — see §3 Phase 4. Will cover the language-switch reactivity pattern; reference the existing `src/components/settings/__tests__/LanguageSwitcher.test.tsx`.

### 6.6 Per-rollout-phase notes

(Optional. After each phase lands, `/10x-implement` appends a 2–3 line note
here capturing anything surprising the rollout phase taught.)

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **Internal tools with no blast radius** — low user count, low impact; test budget is better spent on data-isolation and persistence. Re-evaluate if such a tool gains external exposure or writes shared data. (Source: Phase 2 interview Q5.)
- **UI appearance / snapshots** — brittle, low signal; excluded EXCEPT i18n reactivity (Risk #7), which stays in scope because it is a real past incident. Re-evaluate if a visual regression causes a user-visible failure. (Source: Phase 2 interview Q5, Q2.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-07-06
- Stack versions last verified: 2026-07-06
- AI-native tool references last verified: 2026-07-06

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
