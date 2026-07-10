---
date: 2026-07-09T22:43:49+0200
researcher: value-media
git_commit: a61701a62fcd098bf487a1e225f764b6982c7a97
branch: main
repository: 10xcards
topic: "Quality-gate wiring — run the test suites in CI on main and block merge on red (test-plan §3 Phase 5)"
tags: [research, codebase, ci, github-actions, vitest, quality-gate, testing-quality-gate-wiring]
status: complete
last_updated: 2026-07-09
last_updated_by: value-media
last_updated_note: "Added follow-up: Cloudflare auto-deploy from main interacts with the merge gate — a GitHub Actions required check does NOT gate the Cloudflare deploy."
---

# Research: Quality-gate wiring (test-plan §3 Phase 5)

**Date**: 2026-07-09T22:43:49+0200
**Researcher**: value-media
**Git Commit**: a61701a62fcd098bf487a1e225f764b6982c7a97
**Branch**: main
**Repository**: 10xcards

## Research Question

Ground rollout Phase 5 of `context/foundation/test-plan.md` ("Quality-gate wiring"): prove the floor holds — the tests shipped in Phases 1–4 actually execute in CI on PRs to `main`, and a red test blocks merge. Ground: (1) current CI, (2) test wiring, (3) the two known integration constraints, (4) integration-in-CI vs local-only decision, (5) the lint caveat. Identify the cheapest reliable CI wiring that blocks merge on red without introducing flakiness.

## Summary

The current quality gate is **effectively dead and, if revived as-is, would fail on a broken lint step** — three independent problems, all confirmed empirically:

1. **The CI workflow triggers on `master`, but the only branch that exists is `main`.** `.github/workflows/ci.yml:4-7` runs on push/PR to `master`; `git branch -r` shows only `origin/main` with `origin/HEAD → origin/main`, and `master` exists nowhere (local or remote). **CI does not run at all today.** This is the #1 fix — without it, nothing else matters.
2. **CI runs no tests.** The workflow does `npm ci → astro sync → npm run lint → npm run build` (`ci.yml:18-24`). There is no `npm test` step. So even where it fires, it never gates on the 87 tests that Phases 1–4 shipped.
3. **`npm run lint` currently crashes.** Ran it live: `eslint .` aborts with `Non-null Assertion Failed: Expected node to have a parent` in `@typescript-eslint/no-misused-promises` on `src/pages/index.astro:6`, exit code 2 (lessons.md #59). Turning CI on for `main` without fixing lint would produce a permanently-red gate that has nothing to do with test failures.

The **cheapest reliable gate** is already sitting in `package.json`: `npm test` (= `vitest run --project node --project workers`) ran **87 tests / 10 files green in ~4s** with zero external services. That is the floor to enforce. The **integration suite (Risks #1–#4) is the expensive, flaky part** — it needs a real Supabase (Docker), serialized execution (`--no-file-parallelism`), and a silent-skip guard, so it should be a *separate decision* from the required floor, not bundled into it.

**Recommendation (for `/10x-plan`):** fix the branch trigger to `main`, fix the lint crash (scope typed rules off `.astro`), add `npm test` as the required gate, keep `npm run build` (the real Astro typecheck), and treat integration as a **separate, later sub-phase** — either local-only (documented) or its own CI job with `supabase start` + `--no-file-parallelism` + a `hasSupabaseEnv === true` assertion. Note that "blocks merge" additionally requires a **GitHub branch-protection rule** (a repo setting, not YAML).

## Detailed Findings

### 1. Current CI (`.github/workflows/ci.yml`)

Full file (`.github/workflows/ci.yml:1-25`):

- **Triggers** (`:3-7`): `push` and `pull_request` to `branches: [master]`.
- **Job** `ci` on `ubuntu-latest` (`:10-11`): `actions/checkout@v4` → `actions/setup-node@v4` (node 22, `cache: npm`) → `npm ci` → `npx astro sync` → `npm run lint` → `npm run build` with `SUPABASE_URL` / `SUPABASE_KEY` from secrets (`:13-24`).
- **No test step.** Confirmed by `health-check.md:60-73` ("Lint ✓, Build ✓, **Test ✗**", fix = "dodać krok `- run: npm test`").

**CLAUDE.md claim vs reality.** CLAUDE.md says CI "runs lint + build on every push and PR to master" and needs `SUPABASE_URL`/`SUPABASE_KEY` secrets — that matches the YAML *literally*, but the YAML is stale: the branch is now `main`. `git symbolic-ref refs/remotes/origin/HEAD` → `refs/remotes/origin/main`; `git rev-parse --verify origin/master` → fails ("no origin/master"). So **the trigger branch is wrong and the workflow is inert.** The `master` references are consistently stale across docs (`health-check.md:73,171`, `context/archive/2026-06-07-deployment/deploy-plan.md:16`), while the Phase 5 intent targets `main` (`test-plan.md:123`, `change.md:16`).

> Note on deploy: lessons.md #77 says Cloudflare deploys on push to `main` (Git integration tracks the production branch). So production ships from `main` while the *test* gate points at a dead `master` — the exact gap Phase 5 closes.

### 2. Test wiring (`vitest.config.ts`, `package.json`)

**Scripts** (`package.json:13-15`):
- `test` = `vitest run --project node --project workers`
- `test:watch` = `vitest --project node --project workers`
- `test:integration` = `vitest run --project integration`

**Three Vitest projects** (`vitest.config.ts:16-82`):

| Project | Env | Globs | External deps | CI-safe? |
|---|---|---|---|---|
| `node` (`:17-38`) | node | `src/**/*.test.{ts,tsx}` **excluding** `src/lib/services/dictionary.test.ts` | none (aliases `cloudflare:workers`, `astro:env/server` to stubs in `src/test/`) | **yes** |
| `workers` (`:39-54`) | workerd (miniflare) | `src/lib/services/dictionary.test.ts` | none (mocks `fetch`; real `HTMLRewriter`) | **yes** |
| `integration` (`:55-81`) | node | `tests/integration/**/*.test.ts` | **real local Supabase** (Postgres+Auth via Docker) | **no — needs a service** |

**Empirical run of `npm test` (node + workers):** `10 passed (10)`, `87 passed (87)`, `Duration 3.96s`, exit 0. Files: i18n constants/translations, `ai-rate-limit`, `csv-parser`, `dict/[word]`, `ai`, `generate`, `dictionary` (workers), `LanguageSwitcher`, `I18nProvider`. Two Windows-only noises that will not occur on `ubuntu-latest`: a miniflare `EBUSY … rmdir` temp-cleanup warning and a compat-date fallback warning (requested `2026-05-08` > installed runtime `2025-09-06`) — both warnings, not failures.

**So the split is clean:** `node` + `workers` are deterministic, fast, service-free → the required CI floor. `integration` is the only suite needing infrastructure.

### 3. The two known integration constraints — both confirmed

**(a) Flaky under default per-file parallelism.** The `integration` project sets **no** `poolOptions`/parallelism config (`vitest.config.ts:72-80` — only `testTimeout`/`hookTimeout`/`setupFiles`; the sole `poolOptions` in the file is the `workers` project's miniflare block at `:45`). `test-plan.md:302-310` documents the root cause: running all 10 integration files under Vitest's default per-file parallelism intermittently produced a spurious `500` on a 50-card batch and an `ERR_IPC_CHANNEL_CLOSED` worker crash — **load artifacts against the local Supabase pooler, not code defects**. Directive: `npm run test:integration -- --no-file-parallelism` is reliably green; Phase 5 should serialize (via `poolOptions`/`--no-file-parallelism`) before enforcing. Corroborated by `context/archive/2026-07-08-testing-external-integrations/research.md:242` and `README.md:148`.

**(b) Auto-skips via `describe.skipIf(!hasSupabaseEnv)`.** Confirmed across **all 10** integration files (grep: `smoke`, all `authorization/*`, both `persistence/*`, both `share/*` import `hasSupabaseEnv` and wrap their top `describe` in `.skipIf(!hasSupabaseEnv)`). The guard keys on more than env presence — `tests/integration/helpers/env.ts:37-54`:
- `loadDevVars()` fills `process.env` from `.dev.vars` for any key not already set ("real env vars win" → CI can override, `:12-31`);
- `hasSupabaseEnv` = a **live 2s reachability probe** of `${SUPABASE_URL}/auth/v1/health`, requiring `SUPABASE_URL` + `SUPABASE_KEY` + `SUPABASE_SERVICE_ROLE_KEY` all present AND the instance up (`:37-54`).

**The silent-skip trap.** Because the guard *skips* (green, not red) when Supabase is absent or unreachable, an integration job that is merely *added* to CI without a running Supabase would report "0 run / all skipped" as a **pass** — false confidence. Prior phases flagged this explicitly as Phase 5's job to close: `context/archive/2026-07-06-testing-authorization-data-isolation/follow-ups/review-fixes.md:7-13` and `.../reviews/impl-review.md:41-43` ("When Phase 5 wires the CI gate, make the integration job assert `hasSupabaseEnv === true` …"), plus `context/changes/testing-sr-state-persistence/plan.md:44` ("No fix for the silent-skip trap … Deferred to Phase 5").

### 4. Decision input — integration in CI vs local-only

To run integration in GitHub Actions you must stand up Supabase in the job:
- Add a step to `supabase start` (the `supabase` CLI is a devDep, `package.json:68`) — pulls Docker images and boots Postgres+Auth+GoTrue (minutes of wall-clock), or run a bare Postgres service + apply `supabase/migrations/**` + seed;
- Export `SUPABASE_URL`, `SUPABASE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` (the last is **not** in the current CI secret set — CI today only wires `SUPABASE_URL`/`SUPABASE_KEY` for build, `ci.yml:22-24`; the local values live in the gitignored `.dev.vars`, `test-plan.md:141`);
- Run `npm run test:integration -- --no-file-parallelism`;
- **Fail** the job if `hasSupabaseEnv !== true` (close the silent-skip trap).

**Cost vs signal.** The node+workers floor is ~4s, deterministic, zero infra. The integration job adds minutes of Docker/boot time, a new secret, serialized execution, and a real (if closeable) false-green risk. Per test-plan principle #1 (cheapest test that gives real signal; no flakiness), the two are not equal-cost and should not land as one blocking step.

**Recommendation:** make **node+workers the required merge gate now** (Risks #5/#6/#7 + services). Land **integration as a separate sub-phase**, and let the plan choose:
- **Option A — local-only (recommended first):** integration stays a documented local/on-demand gate (`npm run test:integration -- --no-file-parallelism` before pushing auth/persistence changes). Record it in test-plan §5 as "local-only" so its absence from CI is a *known* choice, not mistaken coverage. Cheapest; zero flakiness in CI.
- **Option B — dedicated CI job:** a separate job with `supabase start` + the three secrets + `--no-file-parallelism` + the `hasSupabaseEnv === true` assertion. Fuller coverage of Risks #1–#4 in CI; heavier and slower. Decide required-vs-informational when adopted.

Either way, the required floor should NOT wait on the integration decision.

### 5. Lint caveat — what the CI gate should invoke

`npm run lint` = `eslint .` (`package.json:11`) **crashes today** (ran live, exit 2): `Non-null Assertion Failed: Expected node to have a parent`, rule `@typescript-eslint/no-misused-promises`, on `src/pages/index.astro:6` — exactly lessons.md #59 ("`astro-eslint-parser` i `@typescript-eslint/no-misused-promises` nie współpracują … `npm run build` sprawdza typy Astro poprawnie").

**Root cause is config-level, and fixable.** `eslint.config.js:12-36` defines `baseConfig` with `tseslint.configs.strictTypeChecked` (which includes `no-misused-promises`, further configured at `:34`) and applies it with **no `files` restriction**, so the typed rules run on **every** file including `**/*.astro` (via `eslint-plugin-astro`'s parser, `:69-71`). The `.astro`-specific block (`:56-63`) only *adds* astro rules; it does not scope the typed rules away. Options for the plan:
- **Scope the typed base off `.astro`** — add `files: ["**/*.{js,jsx,ts,tsx}"]` to `baseConfig` (mirrors `reactConfig` at `:39`), so `.astro` gets only astro rules. Cleanest; keeps full typed linting on TS/TSX.
- **Or** disable `@typescript-eslint/no-misused-promises` for `**/*.astro` in a targeted block.
- **Then** CI can keep `- run: npm run lint` as a real gate.

Independently, **keep `- run: npm run build`** in CI: `astro build` runs `@astrojs/check` (`package.json:18` devDep), which is the project's real Astro typecheck (lessons #59). Build already has `SUPABASE_URL`/`SUPABASE_KEY` wired (`ci.yml:22-24`).

### 6. "Blocks merge" needs branch protection (not just a workflow)

Adding a test step makes CI *report* status; it does not *block merge* on its own. Blocking requires a **GitHub branch-protection rule** on `main` marking the CI check as a **required status check** (and, for the "on PR" semantics, requiring PRs rather than direct pushes). No such rule is documented anywhere in `context/` (Explore sweep found only the internal "required" matrix in `test-plan.md:119-123`, never a configured GitHub rule). This is a **repo-settings / `gh api` step, possibly needing admin rights** — the plan must call it out as an explicit deliverable (or an accepted manual follow-up), or "blocks merge" is not actually achieved.

## Code References

- `.github/workflows/ci.yml:3-7` — triggers on `master` (stale; branch is `main`)
- `.github/workflows/ci.yml:18-24` — `npm ci` → `astro sync` → `npm run lint` → `npm run build` (no test step)
- `package.json:11` — `lint` = `eslint .` (crashes on `.astro`)
- `package.json:13-15` — `test` (node+workers), `test:integration` (integration) scripts
- `vitest.config.ts:31-37` — `node` project globs `src/**/*.test.{ts,tsx}` (excl. dictionary)
- `vitest.config.ts:39-54` — `workers` project (dictionary in workerd)
- `vitest.config.ts:55-81` — `integration` project: `tests/integration/**`, no `poolOptions`, 30s timeouts
- `tests/integration/helpers/env.ts:37-54` — `hasSupabaseEnv` = 3-key presence + live `/auth/v1/health` probe
- `eslint.config.js:12-36` — `baseConfig` typed rules applied globally (incl. `.astro`) → lint crash
- `eslint.config.js:56-71` — `.astro` block adds astro rules but does not scope typed rules off

## Architecture Insights

- **The suites were built CI-ready by design.** The `node`/`workers` split is deterministic and service-free; the integration suite is deliberately fenced (separate project, excluded from `npm test`, self-skipping) precisely so it "never breaks the default run or CI before §3 Phase 5" (`test-plan.md:143`, `vitest.config.ts:56-60`). Phase 5's job is wiring + one config fix, not new tests — no oracle-problem surface.
- **The self-skip guard is a double-edged sword in CI.** Great for keeping integration inert where infra is absent; dangerous if a *blocking* integration job silently skips into green. Any CI job that runs integration must assert reachability, not just presence.
- **Deterministic floor first, infra-dependent coverage second** is the natural cost×signal ordering here.

## Historical Context (from prior changes)

Every prior rollout phase explicitly deferred CI wiring to Phase 5:
- `context/changes/testing-sr-state-persistence/plan.md:44,46` — silent-skip trap + `npm test`/CI wiring deferred to Phase 5.
- `context/archive/2026-07-06-testing-authorization-data-isolation/plan.md:43` — "No CI wiring / merge gate — that is test-plan Phase 5."
- `context/archive/2026-07-06-testing-authorization-data-isolation/follow-ups/review-fixes.md:5-13` — carried-forward requirement to assert `hasSupabaseEnv === true` when Phase 5 runs integration in CI.
- `context/archive/2026-07-08-testing-external-integrations/plan.md:86` — "Not wiring CI enforcement (`vitest run` gate) — that is test-plan §3 Phase 5."
- `context/archive/2026-07-09-testing-i18n-reactivity/plan.md:87` — "Not wiring CI to block on this test — that is rollout Phase 5."
- `context/foundation/health-check.md:60-73` — current CI baseline (Lint ✓ Build ✓ Test ✗); fix = add `- run: npm test`.
- `context/archive/2026-06-07-deployment/deploy-plan.md:16` — push to (then-)`master` triggers Cloudflare deploy; `ci.yml` runs lint+build only.

## Related Research

- `context/archive/2026-07-08-testing-external-integrations/research.md:242` — integration project lacks `poolOptions`; run with `--no-file-parallelism`.
- `context/changes/testing-sr-state-persistence/research.md:138` — `env.ts` `loadDevVars()` + reachability probe ("CI env wins").

## Open Questions

1. **Integration in CI — Option A (local-only) or Option B (dedicated Supabase job)?** A decision the plan/user must make (see §4). Recommendation: A first, B as an optional later sub-phase.
2. **Repo permissions for branch protection.** Does the account (`value-media` / tomasz.dominiak) have admin on the GitHub repo to add a required-status-check rule, or must "blocks merge" be a documented manual follow-up? (§6)
3. **PR-based flow vs direct push.** "Blocks merge on red" assumes PRs into `main`. The commit history suggests direct commits to `main` (no merge commits; solo). Confirm the actual flow — it decides whether the gate lives at PR-merge (Option A) or at the Cloudflare build (Option B). See Follow-up below.
4. **Lint fix scope.** Scope typed rules off `.astro` (recommended) vs disable the single rule — plan picks; both are small config edits to `eslint.config.js`.

## Follow-up Research 2026-07-09T22:47+0200 — Cloudflare auto-deploy interaction

**Question:** does the fact that syncing commits to `main` auto-triggers a Cloudflare deploy change the Phase 5 plan?

**Yes — it reframes the "block merge" sub-phase.** Confirmed config:

- Deploy runs via **Cloudflare dashboard ↔ GitHub Git integration** (configured in the Cloudflare Workers dashboard, NOT in GitHub Actions), production branch `main` (`context/archive/2026-06-07-deployment/deploy-plan.md:10,16,19`; lessons.md #77). `wrangler.jsonc` defines the worker `10xcards-td` but holds no CI/build config — the build command lives in the Cloudflare dashboard.
- `.github/workflows/ci.yml` does **not** deploy; Cloudflare's build does **not** run tests.

**The load-bearing consequence.** A GitHub Actions *required status check* only blocks a **PR merge**. It does **not** gate the Cloudflare deploy: Cloudflare builds+ships whatever lands on `main` on push, regardless of Actions status (the check even runs in parallel with, or after, the deploy on a direct push). So "block red from reaching prod" holds **only if** every change reaches `main` through a PR **and** direct pushes to `main` are forbidden. A single direct push to `main` = immediate production deploy that bypasses the gate entirely.

**Three ways to actually keep a red test off production:**

| Option | Mechanism | Gates | Fits current flow? |
|---|---|---|---|
| **A — PR flow + branch protection** | require PRs into `main`, mark the CI check required, disallow direct push | the *merge* (so deploy only sees green code) | requires adopting PRs + GitHub admin rights |
| **B — gate inside the Cloudflare build** | set the dashboard build command to `npm test && npm run build` (or `npm ci && npm test && npm run build`); a red test fails the build → no deploy | the *deploy* directly | yes — works even with push-straight-to-`main`; needs Cloudflare dashboard access, not GitHub admin |
| **C — pre-push hook** | local `npm test` on `git push` | nothing enforceably (bypassable, local-only) | weak; feedback only |

**Recommendation.** If the real flow is push-straight-to-`main` (history suggests it), **Option B is the cheapest reliable production gate** — it fails the deploy on red without PR ceremony or GitHub admin. Keep the GitHub Actions `npm test` step as fast pre-merge/pre-push feedback (and promote it to a required check under Option A if/when the team moves to PRs). Options A and B are not mutually exclusive — running both is defense-in-depth and closes the direct-push hole.

**Impact on the plan.** The floor sub-phase is unchanged (fix `master→main` trigger, fix lint crash, add `npm test`, keep `npm run build`). The former "branch-protection / block-merge" sub-phase (§6) becomes **"choose and wire the production gate: A (branch protection) and/or B (Cloudflare build command)"** — a decision to settle with the user before implementing. The test-plan §5 row "CI test gate … CI on PR … any red test reaching `main`" should be reworded by the final sub-phase to match whichever gate is chosen (PR-merge gate vs Cloudflare-build gate), since "on PR" is only accurate under Option A.
