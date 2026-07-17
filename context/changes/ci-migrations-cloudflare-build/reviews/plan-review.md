<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Apply Supabase Migrations During the Cloudflare Production Build

- **Plan**: context/changes/ci-migrations-cloudflare-build/plan.md
- **Mode**: Deep
- **Date**: 2026-07-17
- **Verdict**: REVISE → SOUND (after triage)
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding
5/5 paths ✓, supabase/.gitignore ignores .temp ✓, devDeps (vitest:71, supabase:68) ✓ (npm test=vitest already runs in current build command → Workers Builds installs devDeps), CLAUDE.md gate bullet present ✓, brief↔plan ✓.

## Findings

### F1 — Push safety assumes prod-only builds; branch scope unverified

- **Severity**: ⚠️ WARNING (CRITICAL if preview builds are enabled)
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Blind Spots
- **Location**: Performance Considerations (line 255) / Desired End State
- **Detail**: The plan's core safety claim is "it runs only on production deploys ... not on PRs". But the build command runs for every Cloudflare Workers Build. If non-production branch builds or PR/preview builds are enabled, a feature branch containing a new migration would run `db push` against the PRODUCTION database before merge. The plan asserted prod-only builds without verifying Cloudflare's build-trigger config. Not verifiable from the repo (no dashboard access).
- **Fix A ⭐ Recommended**: Verify + enforce production-branch-only builds
  - Strength: Makes the stated assumption true instead of assumed; keeps the command a clean one-liner.
  - Tradeoff: Loses per-branch preview builds (if currently used).
  - Confidence: MED — config-dependent; needs a dashboard check.
  - Blind spot: Whether preview builds are currently relied on.
- **Fix B**: Guard the push by branch inside the build command
  - Strength: Safe even if non-prod builds stay enabled.
  - Tradeoff: Complicates the inline command; depends on the exact Workers-Builds branch env var.
  - Confidence: LOW — env-var name/availability unverified.
  - Blind spot: Wrong var name makes the guard always-skip or always-run.
- **Decision**: FIXED via Fix A — added Phase 2 step 1 "Verify & enforce production-branch-only builds (do FIRST)", manual verification bullet + Progress 2.5, corrected the Performance Considerations claim, and kept Fix B (branch guard) as the documented escalation path if preview builds must stay on.

### F3 — Phase 1 dry-run listed as Automated but needs the user's secret

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 Success Criteria (SC 1.3) / Progress 1.3
- **Detail**: SC 1.3 (the `--dry-run` against remote) sat under "Automated Verification", but "Automated" means commands the agent can run. The dry-run needs the session-pooler URI + DB password, which only the user has. /10x-implement would try to run it.
- **Fix**: Move SC 1.3 (and Progress 1.3) to Manual Verification / reword as user-run.
- **Decision**: FIXED — merged the dry-run into the Manual Verification bullet (folded with the former 1.4) and renumbered Phase 1 Progress (Automated 1.1–1.2, Manual 1.3–1.4).

### F2 — All prod deploys now gated on Supabase reachability at build time

- **Severity**: 📝 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Desired End State / Migration Notes
- **Detail**: After cutover, even a code-only deploy with zero pending migrations must reach Supabase (pooler) at build time or the build fails and nothing ships. A Supabase/pooler outage now blocks all prod deploys, not just migration-bearing ones.
- **Fix**: Add a line to Migration Notes acknowledging the accepted tradeoff.
- **Decision**: FIXED — added an "Accepted tradeoff (Option B)" paragraph to Migration Notes and a bullet to the brief's Open Risks.

## Triage Summary

- Fixed: F1 (Fix A), F3, F2 (3)
- Skipped: none
- Accepted: none
- Dismissed: none
- Verdict after fixes: **SOUND**
