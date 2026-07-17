# Apply Supabase Migrations During the Cloudflare Production Build — Implementation Plan

## Overview

Wire `supabase db push` into the Cloudflare production gate (the dashboard build command) so
`supabase/migrations/*` reach the remote production database automatically on every deploy, in
the order **test → migrate → build → deploy**. This closes the gap that caused the 2026-07-17
`reset_set_progress` incident: a migration existed locally but was never pushed to prod, so the
RPC returned PGRST202 and the reset flow failed with a 500 while the learned-state stayed
untouched.

## Current State Analysis

- **Two independent CI mechanisms** (see `CLAUDE.md` §CI):
  - GitHub Actions floor (`.github/workflows/ci.yml`) — lint + `npm test` + build on push/PR to
    `main`. No deploy, no DB mutation. Must stay that way (must not hold prod DB creds).
  - Cloudflare production gate — Cloudflare auto-deploys `main` via its dashboard↔GitHub
    integration; the real gate is the **dashboard build command**, currently
    `npm test && npm run build`, followed by `npx wrangler deploy`. This command lives in the
    dashboard, **outside version control**.
- **Migrations reach prod only via manual `supabase db push`.** Nothing in either mechanism
  applies them. Confirmed 2026-07-17: `npx supabase migration list --linked` showed
  `20260620120000` and `20260707120000` present locally, absent on remote (both have since been
  pushed manually).
- **`supabase` is a devDependency** (`package.json`, `^2.106.0`). Workers Builds installs
  devDependencies — proven because today's build command already runs `npm test` (vitest, a
  devDep). So `npx supabase` resolves to the local install with no download.
- **The build checkout is not `--linked`.** `supabase/.temp/` (holding `project-ref` /
  `linked-project.json`) is gitignored via `supabase/.gitignore`, so a fresh Cloudflare checkout
  has no link state → `--linked` cannot work; `--db-url` is required.
- **CLI flags confirmed** (`npx supabase db push --help`): `--db-url string` (must be
  percent-encoded), global `--yes` (answer all prompts, needed for non-interactive CI).
- **Draft runbook** already exists at `docs/runbooks/migrations-in-cloudflare-build.md` — this
  plan finalizes and supersedes it.

### Key Discoveries:

- `CLAUDE.md:57` — the Cloudflare gate bullet documents the current build command
  `npm test && npm run build` and the rollback note; this is the version-controlled artifact to
  update.
- `.github/workflows/ci.yml:1-26` — GHA floor; intentionally left untouched.
- `package.json:68` — `"supabase": "^2.106.0"` devDependency (CLI available in build).
- `supabase/.gitignore` ignores `.temp/` → no link state in build checkout (drives `--db-url`).
- Lessons: "Deploy na Cloudflare przez push do GitHub, nie `wrangler deploy`" — this plan is
  consistent (it strengthens the push-driven gate, never runs `wrangler deploy` by hand).

## Desired End State

Every production deploy runs, as the Cloudflare build command:

```
npm test && npx supabase db push --db-url "$SUPABASE_DB_URL" --yes && npm run build
```

so that: `npm test` fails fast without touching the DB; pending migrations then apply to the
remote prod DB; the build runs; and only then does Cloudflare's `npx wrangler deploy` ship the
new version. A failed migration fails the build and ships nothing. `CLAUDE.md` §CI documents this
exact command and the `SUPABASE_DB_URL` secret. Verified by: a new migration merged to `main`
appears in the build log's `Applying migration …` line and in the `Remote` column of
`npx supabase migration list --linked`.

## What We're NOT Doing

- **Not** adding a version-controlled npm-script wrapper — the full command goes **inline** in the
  dashboard (per decision). The only VCS artifact is the `CLAUDE.md` §CI update.
- **Not** touching `.github/workflows/ci.yml` — the GHA floor stays deploy-free and DB-cred-free.
- **Not** running `npx wrangler deploy` manually — deploy stays push-driven.
- **Not** adding migration-safety / DDL-locking linting — noted as a residual risk only.
- **Not** changing any application code, adding migrations, or altering the DB schema.
- **Not** modifying the local dev flow (`npx supabase start` / local reset) — unchanged.

## Implementation Approach

Two phases split by ownership. Phase 1 is everything doable inside the repo plus a read-only
pre-flight that proves the connection string works (`--dry-run` mutates nothing). Phase 2 is the
dashboard cutover (secret + build command — only the user can do this in the Cloudflare dashboard),
the coupled `CLAUDE.md` commit, and end-to-end verification on a real deploy.

The `CLAUDE.md` edit is deliberately **coupled to the dashboard change** (decision): its text is
prepared in Phase 1 but committed only after the dashboard command is switched, so the recorded
build command never describes a state that isn't live in production.

## Critical Implementation Details

- **Command ordering is load-bearing.** `npm test &&` must come first: it is the deterministic
  node+workers floor with no external services, so it fails fast **without** mutating prod. Only on
  green tests does `db push` run. Putting the push before tests would mutate prod even on a build
  that never ships.
- **Backward-compat window.** `db push` applies while the *previous* code version is still live
  (until `wrangler deploy` finishes). Migrations must be backward-compatible with the running code
  (expand/contract). The two already-pushed migrations satisfy this; the plan records the rule for
  future migrations.
- **Connection string.** Use the **Session pooler** URI (Supavisor session mode, port **5432**,
  IPv4) — the Cloudflare build container may lack IPv6, ruling out the IPv6-only direct
  connection, and session mode (unlike transaction/6543) supports migration DDL. `--db-url` needs
  the password **percent-encoded**.

## Phase 1: Pre-flight & Repo Artifacts

### Overview

Finalize the runbook to the confirmed decisions, prove the session-pooler connection string works
against remote with a non-mutating dry-run, and stage (but do not commit) the exact `CLAUDE.md`
§CI replacement text.

### Changes Required:

#### 1. Finalize the runbook

**File**: `docs/runbooks/migrations-in-cloudflare-build.md`

**Intent**: Bring the draft in line with the confirmed decisions so it is the single execution
reference: inline dashboard command (no npm-script wrapper), Session pooler (5432) as the chosen
connection, and `CLAUDE.md` committed together with the dashboard change.

**Contract**: The runbook's "build command", "connection string", and "implementation steps"
sections must state the exact command
`npm test && npx supabase db push --db-url "$SUPABASE_DB_URL" --yes && npm run build`, the
session-pooler URI shape, and the coupling of the doc commit to the dashboard cutover. No
`--linked`, no wrapper script.

#### 2. Stage the CLAUDE.md §CI replacement text (do not commit yet)

**File**: `context/changes/ci-migrations-cloudflare-build/plan.md` (this plan) + runbook

**Intent**: Have the precise replacement bullet ready so Phase 2 is a mechanical apply. The text
must keep the existing structure/facts (dashboard location, GHA separation, rollback note) and add
the migration step + `SUPABASE_DB_URL` secret.

**Contract**: The prepared bullet replaces the current `CLAUDE.md:57` "Cloudflare production gate"
bullet. It documents the new build command verbatim, states the order rationale (test fails
fast without DB mutation → push → build → deploy gates `wrangler deploy`), notes `--db-url`/`--yes`
and why not `--linked`, that `supabase` is a devDep, the new `SUPABASE_DB_URL` (session pooler,
5432, percent-encoded) secret alongside existing `SUPABASE_URL`/`SUPABASE_KEY`, and the rollback
command `npm test && npm run build`.

### Success Criteria:

#### Automated Verification:

- Runbook reflects the inline command exactly: `grep -q 'db push --db-url "\$SUPABASE_DB_URL" --yes' docs/runbooks/migrations-in-cloudflare-build.md`
- Runbook contains no `--linked` in the build-command context and no npm-wrapper script.

#### Manual Verification:

- The session-pooler URI is retrievable from the Supabase dashboard (Connect → Session pooler) and
  a read-only dry-run (`npx supabase db push --db-url "<session-pooler URI>" --dry-run`) connects
  over IPv4 without a network error and reports "Remote database is up to date." (both
  2026-06/2026-07 migrations already pushed). Run by the user — needs the DB password.
- The prepared `CLAUDE.md` bullet reads truthfully and matches the intended dashboard command
  character-for-character.

**Implementation Note**: After Phase 1 automated verification passes, pause for manual confirmation
that the dry-run connected cleanly (this needs the DB password, which only the user has) before
proceeding to Phase 2.

---

## Phase 2: Dashboard Cutover & Verification

### Overview

Apply the two dashboard changes (secret + build command) in the Cloudflare dashboard, commit the
coupled `CLAUDE.md` edit, then verify end-to-end on a real deploy.

### Changes Required:

#### 1. Verify & enforce production-branch-only builds (Cloudflare dashboard — manual, do FIRST)

**File**: Cloudflare dashboard → Workers → `10xcards-td` → Settings → Build → Branch control /
build configuration (not in VCS).

**Intent**: Make the plan's safety assumption true before wiring a prod-DB mutation into the build.
The build command runs on **every** Workers Build; if non-production branch builds or PR/preview
builds are enabled, `db push` would apply unmerged migrations to the production DB from a feature
branch. This step must be confirmed green before steps 2–3.

**Contract**: Confirm Workers Builds runs the build command **only** for the production branch
(`main`) — non-production/preview branch builds are disabled (or, if they must stay on, they are
proven not to run this build command). If preview builds are required for other reasons, escalate:
do NOT proceed to steps 2–3 until the push is guarded by branch (fallback to Fix B — a
`WORKERS_CI_BRANCH == main` guard in the command).

#### 2. Add the `SUPABASE_DB_URL` build secret (Cloudflare dashboard — manual)

**File**: Cloudflare dashboard → Workers → `10xcards-td` → Settings → Build → Build variables and
secrets (not in VCS).

**Intent**: Provide the encrypted session-pooler connection string the push uses.

**Contract**: Encrypted variable `SUPABASE_DB_URL` = percent-encoded session-pooler URI
`postgresql://postgres.aoraelgjkiiexwhfotqf:<PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres`.

#### 3. Change the build command (Cloudflare dashboard — manual)

**File**: same dashboard Build page (not in VCS).

**Intent**: Insert the migration step between test and build so migrations apply before the deploy.

**Contract**: Build command set to
`npm test && npx supabase db push --db-url "$SUPABASE_DB_URL" --yes && npm run build`.
Rollback value: `npm test && npm run build`.

#### 4. Commit the CLAUDE.md §CI update (VCS — coupled to steps 2–3)

**File**: `CLAUDE.md`

**Intent**: Record the now-live build command and the new secret so the documented gate matches
production reality.

**Contract**: Replace the `CLAUDE.md:57` "Cloudflare production gate" bullet with the text prepared
in Phase 1. Commit only after steps 2–3 are live.

### Success Criteria:

#### Automated Verification:

- `CLAUDE.md` documents the new command: `grep -q 'supabase db push --db-url' CLAUDE.md`
- `CLAUDE.md` still records the rollback command `npm test && npm run build`.
- Local floor still green (unchanged by this change): `npm test`.
- Remote/local migrations in sync: `npx supabase migration list --linked` shows every local
  migration present in the `Remote` column.

#### Manual Verification:

- Cloudflare builds are confirmed production-branch-only: no non-production/preview branch build
  runs the migration-bearing build command against the prod DB (or the branch guard is in place).
- Cloudflare build log of the first deploy after cutover shows `npm test` passing, then a
  `supabase db push` line ("Applying migration …" or "Remote database is up to date."), then the
  Astro build — in that order.
- A deliberately introduced new migration (or the next real one) merged to `main` appears in the
  build log's `Applying migration …` line and subsequently in `migration list --linked` Remote
  column.
- The `sets/[id]/review` Reset flow works in production (regression guard for the original
  incident).
- A forced red `npm test` (verified once, then reverted) fails the Cloudflare build and ships no
  new version.

**Implementation Note**: Steps 1–3 are performed by the user in the dashboard (agent cannot access
it), and step 1 (production-branch-only builds) must be confirmed before steps 2–3. After the user
confirms the dashboard is switched, the agent commits step 4, then both verify the first
post-cutover deploy together.

---

## Testing Strategy

### Automated:

- `npm test` — the node+workers floor stays green; this change does not touch app code.
- `npx supabase db push --dry-run` (Phase 1) — read-only proof the connection string resolves and
  nothing unexpected is pending.
- `npx supabase migration list --linked` — local vs remote parity check.

### Manual Testing Steps:

1. Retrieve the session-pooler URI, run the Phase-1 dry-run, confirm "up to date".
2. After dashboard cutover, watch the first build log for the test → push → build ordering.
3. Merge a trivial/next migration; confirm it applies in the build log and shows in Remote.
4. Exercise `sets/[id]/review` Reset in prod (incident regression guard).
5. Confirm a red `npm test` blocks the deploy (fail-safe), then revert.

## Migration Notes

Future migrations must be backward-compatible with the currently-running code (expand/contract),
because they apply before `wrangler deploy` swaps in the new version. `db push` is idempotent — it
applies only migrations missing from the remote `supabase_migrations.schema_migrations` table, so
running it on every deploy is safe and is a no-op when nothing is pending.

**Accepted tradeoff (Option B):** after cutover, *every* production deploy depends on Supabase
reachability at build time — even a code-only deploy with zero pending migrations must reach the
session pooler or the build fails and nothing ships. A Supabase/pooler outage (or a rotated DB
password / wrong secret) therefore blocks all prod deploys, not just migration-bearing ones. This
is inherent to gating migrations in the build command and is accepted as the cost of guaranteeing
migrate-before-deploy ordering.

## Performance Considerations

Negligible. `db push` adds a short DB round-trip per deploy; a no-op push returns quickly. It runs
on every Cloudflare Workers Build — which, per Phase 2 step 1, must be confirmed to fire only for
the production branch (`main`), never on the GHA floor. It does not run on the GHA floor regardless.

## References

- Runbook: `docs/runbooks/migrations-in-cloudflare-build.md`
- Current gate documentation: `CLAUDE.md:57` (§CI)
- GHA floor (left untouched): `.github/workflows/ci.yml`
- CLI: `npx supabase db push --help` (`--db-url`, `--yes`), `package.json:68` (`supabase` devDep)
- Incident origin: `src/lib/services/reviews.ts` `resetSetProgress` + migration `20260620120000`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Pre-flight & Repo Artifacts

#### Automated

- [x] 1.1 Runbook reflects the inline command exactly (`db push --db-url "$SUPABASE_DB_URL" --yes`)
- [x] 1.2 Runbook has no `--linked` in build-command context and no npm-wrapper script

#### Manual

- [x] 1.3 Session-pooler URI retrieved from dashboard; read-only dry-run connects over IPv4 and reports "up to date" (user runs — needs DB password)
- [x] 1.4 Prepared CLAUDE.md bullet reads truthfully and matches intended dashboard command exactly

### Phase 2: Dashboard Cutover & Verification

#### Automated

- [ ] 2.1 CLAUDE.md documents the new command (`grep -q 'supabase db push --db-url' CLAUDE.md`)
- [ ] 2.2 CLAUDE.md still records rollback command `npm test && npm run build`
- [ ] 2.3 Local floor still green (`npm test`)
- [ ] 2.4 `migration list --linked` shows all local migrations in the Remote column

#### Manual

- [ ] 2.5 Cloudflare builds confirmed production-branch-only (no preview/branch build pushes to prod), or branch guard in place
- [ ] 2.6 First post-cutover build log shows test → `supabase db push` → build ordering
- [ ] 2.7 A new migration merged to `main` applies in the build log and shows in Remote
- [ ] 2.8 `sets/[id]/review` Reset works in production (incident regression guard)
- [ ] 2.9 A forced red `npm test` blocks the Cloudflare deploy (fail-safe), then reverted
