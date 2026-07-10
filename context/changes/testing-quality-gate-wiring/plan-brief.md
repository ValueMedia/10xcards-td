# Quality-Gate Wiring — Plan Brief

> Full plan: `context/changes/testing-quality-gate-wiring/plan.md`
> Research: `context/changes/testing-quality-gate-wiring/research.md`

## What & Why

Close test-plan §3 Phase 5. The 87 tests shipped in Phases 1–4 are green but
nothing runs them in a gate — CI is inert (triggers on a non-existent `master`
branch), runs no tests, and `npm run lint` crashes. Worse, the real deploy path
(Cloudflare auto-deploys `main`) is *not* gated by GitHub Actions at all. This
change makes the tests run and makes a red test actually block a production
deploy.

## Starting Point

`.github/workflows/ci.yml` triggers on `master` (only `main` exists → inert),
runs `lint`+`build` but no `npm test`, and `npm run lint` aborts because
`eslint.config.js` applies typed strict rules to `.astro` files. Cloudflare
ships whatever lands on `main` via its own dashboard Git integration; its build
command does not run tests. Changes reach `main` by **direct push** (solo dev,
no PRs).

## Desired End State

GitHub Actions fires on `main`, lint passes, `npm test` gates the 87-test floor
(fast pre-push feedback). The **Cloudflare build command runs `npm ci && npm
test && npm run build`**, so a red test fails the deploy build and no broken
version ships — the mechanism that genuinely keeps red off prod under
direct-push. The test-plan is updated to describe this two-mechanism reality and
to record integration as an intentional local-only gate.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Git flow | Direct push to `main` | Matches commit history; means a GitHub check can't gate the deploy. | Plan (user) |
| Production gate | Option B only — Cloudflare build command | The only mechanism that blocks a red deploy under direct-push; cheapest reliable gate. | Plan (user) |
| GitHub branch protection | Not adopted | User pushes directly; admin rights exist but Option A isn't the prod gate here. | Plan (user) |
| Integration in CI | Local-only, documented in §5 | node+workers floor is ~4s/zero-infra; a CI Supabase job is minutes + a secret + false-green risk for little marginal signal. | Research + Plan |
| Lint crash fix | Scope `baseConfig` to `**/*.{js,jsx,ts,tsx}` | Stops typed rules crashing on `.astro` without weakening TS/TSX linting; mirrors `reactConfig`. | Research |
| Astro type-checking | Keep `npm run build` (`@astrojs/check`) | ESLint doesn't type-check `.astro`; the build does. | Research |

## Scope

**In scope:**
- Fix CI trigger `master → main`; add `- run: npm test`; keep `npm run build`.
- Scope the typed ESLint base off `.astro` (fix the lint crash).
- Set the Cloudflare build command to `npm ci && npm test && npm run build`; document it in `CLAUDE.md`.
- Update test-plan §3 status, §5 gate rows (incl. integration local-only), §6.6 note.

**Out of scope:**
- Running integration (Risks #1–#4) in any automated gate.
- Adopting PR-flow / GitHub branch-protection as the prod gate.
- Editing `vitest.config.ts` (no `poolOptions`/`--no-file-parallelism` in config).
- New tests or changes to the Phase 1–4 suites.

## Architecture / Approach

Two independent gates. **GitHub Actions** (`ci.yml`) = fast feedback on push to
`main`: lint → test (node+workers, 87) → build. **Cloudflare build** = the prod
gate: `npm ci && npm test && npm run build` fails the deploy on red. Deterministic
floor first (all in-repo, auto-verifiable), then the dashboard gate (manual +
documented), then test-plan close-out.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. CI floor (GitHub Actions) | CI runs on `main`, lint fixed, `npm test` gates the workflow | Lint scope edit must not weaken TS/TSX linting |
| 2. Cloudflare production gate | Build command runs tests → red blocks deploy; documented in `CLAUDE.md` | Command lives outside the repo; verify without breaking prod |
| 3. Docs & test-plan close-out | §3 status `complete`, §5 rows reworded + integration local-only, §6.6 note | Wording must not re-introduce the "CI on PR" inaccuracy |

**Prerequisites:** GitHub admin (have) + Cloudflare dashboard access (have); local Supabase only for the local-only integration gate.
**Estimated effort:** ~1 session; small edits + one dashboard change + doc updates.

## Open Risks & Assumptions

- Verifying "red blocks the CF deploy" safely: confirm the command + read a real
  build log; only exercise the fail-path on a non-production preview/branch build.
- The Cloudflare build command is not version-controlled — its correctness relies
  on the `CLAUDE.md` note staying accurate.
- Integration coverage in CI is deferred by choice; if the flow gains
  contributors, revisit (branch protection / a Supabase CI job).

## Success Criteria (Summary)

- GitHub Actions fires on `main` and is green; `npm run lint` no longer crashes.
- The Cloudflare build runs `npm test`; a red test fails the build (no deploy).
- The test-plan accurately records the gate mechanisms and the local-only
  integration decision.
