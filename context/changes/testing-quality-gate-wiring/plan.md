# Quality-Gate Wiring Implementation Plan

## Overview

Close rollout Phase 5 of `context/foundation/test-plan.md` ("Quality-gate
wiring"): make the test suites shipped in Phases 1–4 actually run in a gate,
and make a red test block a production deploy. This is **wiring plus one
config fix** — no new tests, no oracle-problem surface. The work splits into a
cheap deterministic **floor** (GitHub Actions) that provides feedback, and the
**production gate** (Cloudflare build command) that actually keeps red code off
prod under this repo's direct-push flow.

## Current State Analysis

The quality gate is effectively dead and, if revived as-is, would fail on a
broken lint step. Three independent problems, all confirmed empirically against
the live files:

1. **CI triggers on a branch that doesn't exist.** `.github/workflows/ci.yml:4-7`
   runs `push`/`pull_request` on `branches: [master]`. Only `main` exists
   (`git branch -r` → `origin/main`, `origin/HEAD → origin/main`; no `master`
   anywhere). **CI does not run at all today.**
2. **CI runs no tests.** The job does `npm ci → npx astro sync → npm run lint →
   npm run build` (`ci.yml:18-24`). No `npm test` step, so it never gates the 87
   tests from Phases 1–4.
3. **`npm run lint` crashes.** `eslint.config.js:12-36` defines `baseConfig`
   (`tseslint.configs.strictTypeChecked`, incl. `no-misused-promises` further
   configured at `:34`) with **no `files:` restriction**, so the typed rules run
   on every file including `**/*.astro`. That combination aborts with
   `Non-null Assertion Failed: Expected node to have a parent` on
   `src/pages/index.astro` (lessons.md #59). Turning CI on for `main` without
   fixing lint = a permanently-red gate unrelated to test failures.

**The deploy interaction is load-bearing.** Cloudflare auto-deploys whatever
lands on `main` via its own dashboard↔GitHub Git integration (production branch
`main`; `context/archive/2026-06-07-deployment/deploy-plan.md:10,16`;
lessons.md #77). `ci.yml` does not deploy; the Cloudflare build does not run
tests. A GitHub Actions required status check gates only a **PR merge** — it
does **not** gate the Cloudflare deploy. Confirmed with the user: changes reach
`main` by **direct push** (matches the commit history — no merge commits, solo
dev). Therefore a GitHub-only check cannot protect production here; the prod
gate must live inside the Cloudflare build.

The cheapest reliable floor already exists in `package.json:13`: `npm test`
(= `vitest run --project node --project workers`) ran **87 tests / 10 files
green in ~4s** with zero external services. The integration suite
(`test:integration`, Risks #1–#4) is the expensive, flaky part — real Supabase,
serialized execution, and a self-skip guard — so it stays out of the automated
gate by decision (see "What We're NOT Doing").

### Key Discoveries:

- `.github/workflows/ci.yml:4-7` — triggers on `master` (inert; branch is `main`).
- `.github/workflows/ci.yml:18-24` — no test step; `build` already has
  `SUPABASE_URL`/`SUPABASE_KEY` wired from secrets.
- `eslint.config.js:12-36` — `baseConfig` typed rules applied globally (incl.
  `.astro`) → lint crash. `reactConfig:39` already shows the fix pattern:
  `files: ["**/*.{js,jsx,ts,tsx}"]`.
- `package.json:13` — `test` = node+workers (the deterministic floor);
  `:15` — `test:integration` = integration project (separate, service-dependent).
- `vitest.config.ts:55-81` — integration project has **no** `poolOptions`;
  needs `--no-file-parallelism` to be reliable (test-plan.md:302-310).
- `tests/integration/helpers/env.ts:37-54` — `hasSupabaseEnv` = 3-key presence
  (`SUPABASE_URL` + `SUPABASE_KEY` + `SUPABASE_SERVICE_ROLE_KEY`) **plus** a live
  2s `/auth/v1/health` probe; the suite `describe.skipIf(!hasSupabaseEnv)` **skips
  green** when absent → the silent-skip false-green trap.
- Cloudflare production branch is `main`, build command lives in the dashboard,
  not in `wrangler.jsonc` (research §Follow-up).

## Desired End State

After this plan:

1. **GitHub Actions CI fires on `main`**, `npm run lint` passes (no `.astro`
   crash), `npm test` runs the 87-test floor, and `npm run build` type-checks
   Astro. A red unit/component/worker test turns the workflow red. This is fast
   pre-push feedback.
2. **The Cloudflare build command is `npm ci && npm test && npm run build`**, so
   a red test fails the deploy build and no new version ships. This is the gate
   that actually keeps red off production under direct-push. It is documented
   in-repo (the command itself lives in the Cloudflare dashboard, outside
   version control).
3. **The test-plan reflects reality**: §3 Phase 5 status is `complete`; the §5
   "CI test gate" row describes the real two-mechanism setup (GitHub Actions
   floor + Cloudflare build gate) rather than the inaccurate "CI on PR"; §5
   records integration as an explicit **local-only** gate; a §6.6 note captures
   the deploy-vs-check gotcha for future readers.

**How to verify**: `ci.yml` fires on a push to `main` and is green;
`npm run lint` exits 0 locally; a Cloudflare build log shows the `npm test` step
executing; the test-plan reads as described above.

## What We're NOT Doing

- **Not running integration (Risks #1–#4) in the automated gate.** Decision:
  integration stays a **local-only** gate (`npm run test:integration --
  --no-file-parallelism` before pushing auth/persistence changes), recorded in
  test-plan §5 as a known choice. Rationale: cost×signal principle #1 — the
  node+workers floor is ~4s/zero-infra and deterministic; a CI Supabase job adds
  minutes of Docker boot, a new `SUPABASE_SERVICE_ROLE_KEY` secret, serialized
  execution, and (under direct-push) would gate only the GitHub job, not the CF
  deploy. A dedicated Supabase CI job remains an optional future sub-phase.
- **Not adopting a PR-flow or GitHub branch-protection rule.** The user pushes
  directly to `main`; Option A (branch protection / required check) is not the
  prod gate here and is explicitly out of scope. (Admin rights exist, so it
  remains available later as defense-in-depth if the flow changes.)
- **Not adding `--no-file-parallelism` / `poolOptions` to the integration
  project config.** That belongs with whoever wires integration into an
  automated gate; the local-only command carries the flag inline. No change to
  `vitest.config.ts`.
- **Not writing new tests or touching the Phase 1–4 suites.**
- **Not changing what `npm test` covers** (node+workers stays the floor;
  integration stays excluded from it).

## Implementation Approach

Deterministic floor first (cheapest, highest-confidence, entirely in-repo and
automatically verifiable), then the production gate (a manual dashboard step
plus in-repo documentation of it), then close out the test-plan so the recorded
strategy matches the wired reality. Phases 1 and 2 are independent mechanisms
and could land in either order, but Phase 1 first means the exact
`npm test`/`npm run build` commands are proven green locally and in Actions
before they are pasted into the Cloudflare build command.

## Critical Implementation Details

- **The lint fix is a scoping edit, not a rule change.** Add `files:
  ["**/*.{js,jsx,ts,tsx}"]` to `baseConfig` so the typed ruleset stops running on
  `.astro`. Do not disable `no-misused-promises` and do not weaken typed linting
  on TS/TSX. `.astro` files keep only the astro-specific rules (`astroConfig`,
  `eslint.config.js:56-63`) plus flat/recommended; Astro type-checking is covered
  by `npm run build` (`@astrojs/check`), not ESLint (lessons.md #59).
- **Resolve the install-step interaction before setting the build command.**
  Cloudflare Workers Builds usually has a *separate* install command
  (auto-detected, e.g. `npm install`) distinct from the build command. Check the
  project's install setting first: if deps are auto-installed, set the build
  command to `npm test && npm run build`; if there is no separate install step,
  set it to `npm ci && npm test && npm run build` so `vitest` is present in the
  clean checkout. Do NOT blindly prepend `npm ci` (redundant ~30s install if CF
  already installs) or blindly drop it (tests run with no `node_modules` → the
  first build fails). Record the chosen command in the CLAUDE.md note. The GitHub
  Actions floor keeps `npm ci` and `npm test` as separate steps as today.
- **Verifying the CF gate must not break prod.** Do not merge a deliberately
  failing test to `main` to "prove" the gate. Verify by (a) confirming the build
  command string in the dashboard, and (b) reading the next real build log to
  confirm the `npm test` step ran — optionally exercise the fail-path on a
  throwaway preview/branch build (non-production) if branch/preview builds are
  enabled. Treat gate-blocks-red as a manual verification item.

## Phase 1: CI Floor (GitHub Actions)

### Overview

Make GitHub Actions actually run on `main`, stop the lint crash, and execute
the 87-test floor. Outcome: a green, meaningful workflow that turns red on a
failing unit/component/worker test or a lint/type/build error. This is
feedback, not the production gate.

**What a red gate here catches**: a broken `npm test` (Risks #5/#6/#7 + the
service/parser contracts covered by node+workers), a real lint violation on
TS/TSX, or an Astro type/build error (`@astrojs/check` via `npm run build`).

### Changes Required:

#### 1. CI trigger branch

**File**: `.github/workflows/ci.yml`

**Intent**: Point the workflow at the branch that actually exists so CI runs at
all.

**Contract**: `on.push.branches` and `on.pull_request.branches` change from
`[master]` to `[main]` (`ci.yml:5,7`). No other trigger semantics change.

#### 2. Add the test step

**File**: `.github/workflows/ci.yml`

**Intent**: Execute the deterministic floor in CI so the 87 tests gate the
workflow.

**Contract**: Add `- run: npm test` (= `vitest run --project node --project
workers`) after `npm run lint` and before/after `npm run build` (order between
lint/test/build is not load-bearing; place `npm test` after `npm run lint` and
keep `npm run build` last so the existing build env block is untouched). No
external services, no new secrets — node+workers need none.

#### 3. Scope the typed ESLint base off `.astro`

**File**: `eslint.config.js`

**Intent**: Stop `@typescript-eslint/no-misused-promises` (and the rest of the
typed strict set) from running on `.astro` files, which crashes ESLint, without
weakening typed linting on TS/TSX.

**Contract**: Add `files: ["**/*.{js,jsx,ts,tsx}"]` to the `baseConfig`
`defineConfig({...})` object (`eslint.config.js:12`), mirroring `reactConfig`
(`:39`). `astroConfig` (`:56-63`) and the astro flat presets (`:69-70`) continue
to provide `.astro` linting. Everything else in the config is unchanged.

### Success Criteria:

#### Automated Verification:

- `npm run lint` exits 0 locally (no `Expected node to have a parent` crash).
- `npm test` exits 0 locally (87 tests / 10 files green).
- `npm run build` exits 0 locally (Astro typecheck via `@astrojs/check`).
- The pushed workflow run on `main` completes green in GitHub Actions.

#### Manual Verification:

- Confirm the GitHub Actions run is triggered by the push to `main` (not
  skipped/inert) — visible in the Actions tab.
- Sanity-confirm the run log shows all four steps executing: `lint`, `test`
  (87 tests), `build`.

**Implementation Note**: After completing this phase and all automated
verification passes, pause here for manual confirmation from the human that the
GitHub Actions run fired on `main` and is green before proceeding to Phase 2.

---

## Phase 2: Cloudflare Production Gate (Option B)

### Overview

Wire the mechanism that actually keeps a red test off production under
direct-push: make the Cloudflare deploy build run the tests, so a red test fails
the build and no new version ships. The command lives in the Cloudflare
dashboard (outside the repo), so this phase is one manual dashboard change plus
in-repo documentation recording that the gate exists and where it lives.

**What a red gate here catches**: any red `npm test` (or lint/build failure) on
a commit pushed to `main` — the deploy build fails, so the broken code never
becomes a live version. This is the direct-push equivalent of "block merge on
red."

### Changes Required:

#### 1. Cloudflare dashboard build command (manual)

**Location**: Cloudflare Workers dashboard → the `10xcards-td` project → Build /
deploy configuration (build command). Not a repo file.

**Intent**: Fail the production build when any test is red so no deploy ships.

**Contract**: First check the project's install-command setting (see Critical
Implementation Details). Set the build command to `npm test && npm run build`
if CF auto-installs deps, or `npm ci && npm test && npm run build` if there is no
separate install step (replacing whatever build-only command is configured
today). The existing `SUPABASE_URL`/`SUPABASE_KEY` build environment (already
used by `npm run build`) is unchanged; node+workers tests need no additional
secrets.

#### 2. Document the gate in-repo

**File**: `context/archive/2026-06-07-deployment/deploy-plan.md` is archived
(immutable) — do **not** edit it. Instead record the gate where the project's
live deployment/CI facts live and are read: `CLAUDE.md` ("## CI" section) and
the test-plan close-out in Phase 3.

**Intent**: Because the build command is not in version control, its existence
and content must be written down so it is a known fact, not tribal knowledge.

**Contract**: In `CLAUDE.md` under `## CI`, add a short note recording the
**exact** build command chosen at the dashboard (`npm test && npm run build` or
`npm ci && npm test && npm run build`) for the Cloudflare production build
(branch `main`), so a red test blocks the deploy; the GitHub Actions workflow
(`ci.yml`) is separate pre-push feedback and does not gate the Cloudflare deploy.
Correct the stale "push and PR to master" wording to `main` while there.

### Success Criteria:

#### Automated Verification:

- `CLAUDE.md` "## CI" section describes the Cloudflare build gate and the
  `main` branch (no remaining `master` reference in that section).

#### Manual Verification:

- The Cloudflare dashboard build command reads `npm ci && npm test && npm run
  build`.
- The next real deploy build log shows the `npm test` step executing and passing
  before `npm run build`.
- (Optional, non-prod) On a throwaway preview/branch build with a deliberately
  failing test, confirm the build fails and no deploy is published — only if
  preview/branch builds are enabled; never do this on `main`.

**Implementation Note**: After the dashboard change and doc edit, pause for
manual confirmation from the human that the build command is set and the next
build log shows tests running before proceeding to Phase 3.

---

## Phase 3: Documentation & Test-Plan Close-Out

### Overview

Make the recorded strategy match the wired reality: record integration as an
explicit local-only gate, flip the Phase 5 status, reword the quality-gate row
to describe the actual two-mechanism setup, and leave a cookbook note about the
deploy-vs-check gotcha. No code changes.

**What this prevents**: future readers mistaking integration's absence from CI
for a coverage gap, or assuming a GitHub required check protects production.

### Changes Required:

#### 1. Record integration as a local-only gate

**File**: `context/foundation/test-plan.md`

**Intent**: Document that integration (Risks #1–#4) is a deliberate local-only
gate, with the exact command, so its absence from automated gates is a known
choice.

**Contract**: In §5 (Quality Gates), add a row (or note under the table) for the
integration suite: run `npm run test:integration -- --no-file-parallelism`
locally before pushing auth/persistence changes; requires local Supabase
(`npx supabase start`) + the three keys in `.dev.vars`; **not** in CI/CF by
decision (cost×signal). Cross-reference §6.2/§6.3.

#### 2. Flip Phase 5 status

**File**: `context/foundation/test-plan.md`

**Intent**: Mark the rollout phase complete.

**Contract**: §3 table, Phase 5 row: Status `change opened` → `complete`. Update
the header "Last updated" line (§ top) to today with a Phase 5 note.

#### 3. Reword the "CI test gate" row

**File**: `context/foundation/test-plan.md`

**Intent**: The current §5 row says "CI test gate (`vitest run`) | CI on PR |
required after §3 Phase 5 | any red test reaching `main`". "CI on PR" is
inaccurate under direct-push. Reword to the real mechanism.

**Contract**: §5 row reworded so "Where" reflects two mechanisms — GitHub
Actions (`ci.yml`, runs `npm test` on push to `main` as pre-push feedback) and
the Cloudflare build command (`npm ci && npm test && npm run build`, the gate
that blocks a red deploy). "Catches" = any red node+workers test reaching a
`main` push / production build. Keep it accurate that this gates the *deploy*,
not a PR merge.

#### 4. Cookbook note (§6.6)

**File**: `context/foundation/test-plan.md`

**Intent**: Capture the non-obvious deploy-vs-check gotcha so a future
contributor doesn't wire a GitHub required check and assume prod is protected.

**Contract**: Append a short §6.6 "Phase 5 (Quality-gate wiring)" note: (a)
Cloudflare auto-deploys `main` via its own Git integration, independent of
GitHub Actions — a GitHub required check gates only a PR merge, so under
direct-push the real prod gate is the Cloudflare build command; (b) the lint
crash was a config-scope bug (typed rules on `.astro`), fixed by scoping
`baseConfig` to `**/*.{js,jsx,ts,tsx}`, and Astro types are checked by
`npm run build`, not ESLint; (c) integration is local-only by decision.

#### 5. Update change identity

**File**: `context/changes/testing-quality-gate-wiring/change.md`

**Intent**: Reflect completion.

**Contract**: Front-matter `status` → `complete` (or `implementing` until Phases
1–2 land — set at implement time), `updated` → today. Also update the
front-matter `title` — currently "…block merge on red" — to reflect the
delivered mechanism (block the Cloudflare deploy on red under direct-push), so
change.md matches the reworded test-plan §5. Not a blocker for the plan itself.

### Success Criteria:

#### Automated Verification:

- `context/foundation/test-plan.md` §3 Phase 5 Status reads `complete`.
- §5 contains the integration local-only entry and the reworded CI test-gate
  row (no "CI on PR" wording).
- §6.6 contains the Phase 5 note.

#### Manual Verification:

- The test-plan reads coherently end-to-end: a reader understands that GitHub
  Actions is feedback and the Cloudflare build is the prod gate, and that
  integration is intentionally local-only.

**Implementation Note**: Documentation-only phase; no manual app testing
required beyond a read-through.

---

## Testing Strategy

No new tests. This change wires and documents the existing suites. Verification
is the success criteria above: local `npm run lint` / `npm test` / `npm run
build` all green, a green GitHub Actions run on `main`, and a Cloudflare build
log showing tests execute.

### Manual Testing Steps:

1. Locally: `npm run lint` (exit 0), `npm test` (87 green), `npm run build`
   (exit 0).
2. Push to `main`; confirm the GitHub Actions run fires and is green.
3. Confirm the Cloudflare dashboard build command and read the next build log
   for the `npm test` step.

## Performance Considerations

The floor adds ~4s to CI and to each Cloudflare build (node+workers, no
services). Acceptable. Integration's minutes-of-Docker cost is deliberately kept
out of both gates.

## Migration Notes

None. No data or schema changes. The only out-of-repo change is the Cloudflare
dashboard build command (Phase 2), documented in `CLAUDE.md`.

**Rollback (Phase 2).** Before editing the Cloudflare build command, record its
current (pre-change) value — paste it into the `CLAUDE.md` note or the Phase 2
commit message. If the new command breaks builds (production stops updating),
revert is copy-paste: restore the recorded previous command in the dashboard.

## References

- Research: `context/changes/testing-quality-gate-wiring/research.md` (incl.
  "Follow-up Research — Cloudflare auto-deploy interaction")
- Change identity: `context/changes/testing-quality-gate-wiring/change.md`
- Test plan: `context/foundation/test-plan.md` §3 Phase 5, §5, §6.6
- Lint crash: lessons.md #59; Cloudflare deploy-on-`main`: lessons.md #77
- Fix pattern for lint scope: `eslint.config.js:39` (`reactConfig`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: CI Floor (GitHub Actions)

#### Automated

- [x] 1.1 `npm run lint` exits 0 locally (no crash) — 980d87f
- [x] 1.2 `npm test` exits 0 locally (87 tests green) — 980d87f
- [x] 1.3 `npm run build` exits 0 locally — 980d87f
- [x] 1.4 Pushed workflow run on `main` completes green in GitHub Actions — 980d87f

#### Manual

- [x] 1.5 GitHub Actions run triggered by the push to `main` (not inert) — 980d87f
- [x] 1.6 Run log shows lint, test (87), and build steps executing — 980d87f

### Phase 2: Cloudflare Production Gate (Option B)

#### Automated

- [x] 2.1 `CLAUDE.md` "## CI" describes the CF build gate and `main` (no `master`) — 8b56166

#### Manual

- [x] 2.2 Cloudflare build command reads `npm ci && npm test && npm run build` — 8b56166
- [x] 2.3 Next deploy build log shows `npm test` executing before `npm run build` — 8b56166
- [ ] 2.4 (Optional, non-prod) Failing test on a preview/branch build blocks the build

### Phase 3: Documentation & Test-Plan Close-Out

#### Automated

- [x] 3.1 test-plan §3 Phase 5 Status reads `complete`
- [x] 3.2 §5 has the integration local-only entry and the reworded CI test-gate row
- [x] 3.3 §6.6 has the Phase 5 note

#### Manual

- [x] 3.4 Test-plan reads coherently (Actions = feedback, CF build = prod gate, integration = local-only)
