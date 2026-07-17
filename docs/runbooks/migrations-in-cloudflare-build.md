# Runbook: apply Supabase migrations during the Cloudflare production build (Option B)

## Goal

Make `supabase/migrations/*` reach the **remote** (production) database automatically on
every production deploy, in the correct order (**migrate before new code ships**), so a
missing migration can no longer cause a prod-only failure like the `reset_set_progress`
incident (2026-07-17).

This wires migrations into the **Cloudflare production gate** (the dashboard build command),
which is the only place that guarantees ordering relative to `wrangler deploy`. It does
**not** touch the GitHub Actions floor (that stays fast, deploy-free, and never mutates the
DB — see `CLAUDE.md` §CI).

## Design decisions

- **Command order — `test → migrate → build`:**
  `npm test && npx supabase db push --db-url "$SUPABASE_DB_URL" --yes && npm run build`
  - `npm test` runs first: cheap deterministic node+workers floor, fails fast **without**
    mutating the DB.
  - `db push` runs only if tests pass; `--yes` makes it non-interactive.
  - `npm run build` runs only if the push succeeds.
  - Cloudflare's deploy command (`npx wrangler deploy`) runs only if the whole build command
    exits 0. So a failed migration ⇒ failed build ⇒ **no new version ships** (same gate model
    as a red test).
- **`--db-url`, not `--linked`:** the Cloudflare build checks out a fresh tree where the
  linked-project state (`supabase/.temp/`) is gitignored and therefore absent. `--db-url`
  needs no `link` step and no `SUPABASE_ACCESS_TOKEN` — just one connection-string secret.
- **CLI availability:** `supabase` is already a devDependency (`package.json`), and Workers
  Builds installs devDependencies (proven: today's build command already runs `npm test`,
  i.e. vitest, a devDep). So `npx supabase` resolves to the local install — no download at
  build time.
- **Idempotency:** `db push` applies only migrations missing from the remote
  `supabase_migrations.schema_migrations` table. When nothing is pending it is a no-op, so
  running it on every deploy is safe.
- **Backward-compat window:** migrations apply while the *previous* code version is still
  live (until `wrangler deploy` finishes). Keep migrations backward-compatible with the
  currently-running code (expand/contract). The existing pending migrations — add RPC,
  revoke anon SELECT — satisfy this.
- **Production-branch-only builds (safety precondition):** the build command runs on
  **every** Workers Build. Before wiring a prod-DB mutation into it, confirm Workers Builds
  fires only for the production branch (`main`). If non-production / preview branch builds
  are enabled, a feature branch's migration would `db push` to prod **before merge**. Either
  disable non-production builds, or guard the push by branch (fallback: prefix the push with
  a `[ "$WORKERS_CI_BRANCH" = main ] &&` guard — verify the env-var name in the build log
  first, or the guard silently no-ops).

## Connection string (the `SUPABASE_DB_URL` secret)

Use the **Session pooler** URI (IPv4, port **5432**), not the transaction pooler (6543) —
transaction mode does not support all DDL that migrations may run. Direct connection
(`db.<ref>.supabase.co:5432`) is IPv6-only on most projects and may be unreachable from the
Cloudflare build container, so prefer the session pooler.

Get it from: Supabase Dashboard → Project `aoraelgjkiiexwhfotqf` → **Connect** →
**Session pooler** → URI. It looks like:

```
postgresql://postgres.aoraelgjkiiexwhfotqf:<PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

- `--db-url` requires the value to be **percent-encoded**. If the DB password contains
  special characters (`@ : / ? # [ ] % &` …), URL-encode them (e.g. `@` → `%40`).
- This string contains the DB password — store it **only** as a Cloudflare build secret,
  never commit it.

## Implementation steps (all in the Cloudflare dashboard — cannot be done from the repo)

1. **Verify & enforce production-branch-only builds (do FIRST).** Workers → `10xcards-td` →
   Settings → **Build** → branch control. Confirm builds run **only** for `main`; disable
   non-production / preview branch builds (or put the branch guard in place). Do not proceed
   to steps 2–3 until this is green — otherwise a feature branch's migration would reach prod
   before merge.
2. **Add the secret.** Workers → `10xcards-td` → Settings → **Build** → *Build variables and
   secrets* → add **`SUPABASE_DB_URL`** as an **encrypted** variable, value = the
   percent-encoded session-pooler URI above.
3. **Change the build command.** Same page, set **Build command** to:
   ```
   npm test && npx supabase db push --db-url "$SUPABASE_DB_URL" --yes && npm run build
   ```
   (Previous, for rollback: `npm test && npm run build`.)
4. **Apply the doc edit below** to `CLAUDE.md` in the same change, so the recorded build
   command stays truthful (the command lives in the dashboard, outside version control).

## CLAUDE.md edit (apply together with step 3)

Replace the **Cloudflare production gate** bullet in `CLAUDE.md` §CI with:

> - **Cloudflare production gate (blocks a red deploy; applies migrations).** Cloudflare
>   auto-deploys whatever lands on `main` via its own dashboard↔GitHub Git integration
>   (production branch `main`). Under this repo's direct-push flow, the real production gate
>   is the Cloudflare build command, set in the dashboard (Workers → `10xcards-td` →
>   Settings → Build) to **`npm test && npx supabase db push --db-url "$SUPABASE_DB_URL"
>   --yes && npm run build`**. Order is deliberate: `npm test` (the deterministic
>   node+workers floor) runs first and fails fast **without** touching the DB; `supabase db
>   push` then applies any pending `supabase/migrations/*` to the remote prod DB (via the
>   `SUPABASE_DB_URL` session-pooler connection secret, `--yes` for non-interactive, no
>   `--linked` because the build checkout is not linked); `npm run build` runs last. Any red
>   step fails the build so `npx wrangler deploy` never runs and no new version ships —
>   migrations therefore always precede shipped code. `supabase` is a devDependency so
>   `npx supabase` needs no download. `SUPABASE_URL`/`SUPABASE_KEY` build env is already
>   wired for `npm run build`; add `SUPABASE_DB_URL` (session pooler, port 5432, percent-
>   encoded) for the push. This is safe only because Workers Builds is configured to build
>   the production branch (`main`) only — non-production/preview branch builds must stay off
>   (or the push must be branch-guarded), else a feature branch would migrate prod before
>   merge. (Previous build command, for rollback: `npm test && npm run build`.)

## Verification

1. **Before shipping**, dry-run against prod from your machine to confirm the string works
   and that nothing unexpected is pending:
   ```
   npx supabase db push --db-url "<the same URI>" --dry-run
   ```
   Expect "Remote database is up to date." (the two 2026-06/2026-07 migrations were already
   pushed on 2026-07-17).
2. **First real deploy after the change:** watch the Workers build log — you should see the
   `Applying migration …` / "up to date" line before the Astro build output.
3. **End-to-end:** add a trivial no-op migration (or the next real one), push to `main`,
   confirm the build log applies it and `npx supabase migration list --linked` shows it in
   the **Remote** column.

## Rollback

Set the build command back to `npm test && npm run build` in the dashboard. The
`SUPABASE_DB_URL` secret can stay (unused) or be removed. Revert the CLAUDE.md bullet.

## Risks / notes

- **Branch scope (verify first — step 1).** The build command runs on every Workers Build.
  If non-production / preview branch builds are enabled, a feature branch's migration reaches
  prod before merge. Confirm production-branch-only builds, or branch-guard the push.
- After cutover, **every** prod deploy depends on Supabase reachability at build time — even
  a code-only deploy with zero pending migrations. A pooler/DB outage, a wrong pooler URI, or
  a rotated password fails every deploy (fail-safe: blocks shipping rather than shipping
  unmigrated). Keep the secret in sync with any DB-password rotation.
- A destructive/long-locking migration will run mid-deploy against live prod. Review DDL for
  locking before merging; this runbook does not add migration-safety linting.
- GitHub Actions is intentionally left untouched — it must not hold prod DB credentials.
