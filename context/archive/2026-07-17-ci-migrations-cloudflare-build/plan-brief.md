# Apply Supabase Migrations During the Cloudflare Production Build — Plan Brief

> Full plan: `context/changes/ci-migrations-cloudflare-build/plan.md`

## What & Why

Wire `supabase db push` into the Cloudflare production build command so `supabase/migrations/*`
reach the remote prod DB automatically on every deploy. Motivated by the 2026-07-17
`reset_set_progress` incident: the migration existed locally but was never pushed to prod, so the
RPC returned PGRST202 and the `sets/[id]/review` Reset flow failed with a 500 while learned state
stayed unchanged.

## Starting Point

Migrations reach prod today only via a manual `npx supabase db push`; neither CI mechanism applies
them. The Cloudflare gate is the dashboard build command (`npm test && npm run build`), which lives
outside version control and is followed by `npx wrangler deploy`. GitHub Actions is a separate,
deploy-free floor.

## Desired End State

The Cloudflare build command becomes
`npm test && npx supabase db push --db-url "$SUPABASE_DB_URL" --yes && npm run build`. Every deploy
runs test → migrate → build → deploy; a failed migration fails the build so nothing ships.
`CLAUDE.md` §CI documents this exact command and the new secret.

## Key Decisions Made

| Decision                    | Choice                                          | Why (1 sentence)                                                                 | Source |
| --------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------- | ------ |
| Where to wire it            | Cloudflare build command (production gate)      | Only place that guarantees migrate-before-deploy ordering vs `wrangler deploy`.  | Plan   |
| Command order               | `test → migrate → build`                        | `npm test` fails fast without mutating prod; push runs only on green tests.      | Plan   |
| Connect flag                | `--db-url` + `--yes` (not `--linked`)           | Build checkout has no link state (`supabase/.temp/` gitignored); non-interactive. | Plan   |
| Connection string           | Session pooler (port 5432, IPv4)                | Build container may lack IPv6; session mode supports migration DDL (not 6543).   | Plan   |
| Packaging                   | Inline in dashboard (no npm-script wrapper)     | Minimal repo change; single command in one place.                                | Plan   |
| CLAUDE.md edit timing       | Committed together with the dashboard change    | Documented gate never describes a state not live in prod.                        | Plan   |

## Scope

**In scope:** finalize runbook; dry-run validation of the connection string; prepared `CLAUDE.md`
§CI text; dashboard secret + build-command change (manual); coupled `CLAUDE.md` commit;
end-to-end verification.

**Out of scope:** npm-script wrapper; GitHub Actions changes; manual `wrangler deploy`; migration
DDL-safety linting; any app-code, schema, or local-dev changes.

## Architecture / Approach

Two phases split by ownership. **Phase 1** (repo + read-only pre-flight): finalize the runbook, run
a non-mutating `--dry-run` against remote to prove the session-pooler URI works, and stage the
exact `CLAUDE.md` bullet. **Phase 2** (dashboard cutover, user-driven): add the `SUPABASE_DB_URL`
secret and change the build command in the Cloudflare dashboard, commit the coupled `CLAUDE.md`
edit, then verify the first post-cutover deploy shows test → push → build ordering.

## Phases at a Glance

| Phase                         | What it delivers                                             | Key risk                                              |
| ----------------------------- | ----------------------------------------------------------- | ----------------------------------------------------- |
| 1. Pre-flight & repo artifacts| Finalized runbook, validated connection string, staged doc  | Wrong/percent-encoding of URI; IPv6-only reachability |
| 2. Dashboard cutover & verify | Prod-only-build check → live migrate-in-build gate + truthful CLAUDE.md | Preview builds pushing to prod; bad secret blocks every deploy |

**Prerequisites:** access to the Cloudflare dashboard (Workers → `10xcards-td` → Settings → Build)
and the Supabase DB password / session-pooler URI. Both held by the user.
**Estimated effort:** ~1 session; most of it is two dashboard clicks + one verified deploy.

## Open Risks & Assumptions

- **Branch scope (gating risk, Phase 2 step 1):** the build command runs on *every* Workers Build.
  If non-production/preview branch builds are enabled, a feature branch's migration would push to
  prod before merge. Phase 2 confirms production-branch-only builds (or a branch guard) before
  cutover.
- After cutover, **every** prod deploy depends on Supabase reachability at build time — a
  pooler/DB outage, a wrong pooler URI, or a rotated password fails every deploy (fail-safe but
  noisy). Keep the secret in sync with password rotation.
- Migrations apply while old code is still live → they must be backward-compatible (expand/contract).
- A destructive/long-locking migration would run mid-deploy against live prod; DDL review is manual
  (no linting added).
- Assumes Workers Builds installs devDependencies (confirmed: today's build already runs vitest).

## Success Criteria (Summary)

- Every prod deploy applies pending migrations before shipping; a failed migration ships nothing.
- A new migration merged to `main` shows in the build log and in `migration list --linked` Remote.
- `sets/[id]/review` Reset works in prod (original incident cannot recur from a missing migration).
