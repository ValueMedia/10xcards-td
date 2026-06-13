# Deployment Plan

Status: **first deploy completed**. This document now serves as an operations reference.

## Stack

- Worker name: `10xcards-td` (see `wrangler.jsonc`)
- Runtime: Cloudflare Workers via `@astrojs/cloudflare`
- Secrets: `SUPABASE_URL` + `SUPABASE_KEY` (set in Cloudflare dashboard and in GitHub repo secrets)
- Branch: **`main`**

## How deploys happen

### Auto-deploy (primary path)

Push to `master` triggers a deploy via **Cloudflare dashboard ↔ GitHub Git integration** (configured in the Cloudflare Workers dashboard, not in GitHub Actions). The `.github/workflows/ci.yml` workflow runs lint + build only — it does **not** deploy.

```
git push origin main   # triggers auto-deploy via Cloudflare Git integration
```

### Manual re-deploy (secondary path)

Use when you need to deploy without pushing new code (e.g. after rotating secrets):

```
npm run build
npx wrangler deploy
```

Wrangler auth: OAuth token for `domino30.td+10x@gmail.com` (run `npx wrangler whoami` to verify).

## Rollback

Cloudflare Workers keeps previous deployments. Roll back via:
- Cloudflare dashboard → Workers → `10xcards-td` → Deployments → select a previous version → "Set as production"
- Or redeploy an older commit: `git push origin <older-sha>:master --force`

## Environment variables

| Variable | Where set | Used by |
|---|---|---|
| `SUPABASE_URL` | Cloudflare secrets + GitHub Actions secret | production build + runtime |
| `SUPABASE_KEY` | Cloudflare secrets + GitHub Actions secret | production build + runtime |
| `SUPABASE_URL` | `.dev.vars` | local dev (`npm run dev`) |
| `SUPABASE_KEY` | `.dev.vars` | local dev (`npm run dev`) |

Do **not** use `NEXT_PUBLIC_*` aliases — only the names above.

## Database migrations

Cloudflare deployment only ships the Worker code; it **does not** run Supabase migrations. After every schema change you must apply `supabase/migrations/*.sql` to the production database manually.

### Current production database status

- Production Supabase project: `aoraelgjkiiexwhfotqf`
- Tables required by the app: `sets`, `flashcards`, `reviews`
- First migration applied: **no** (this caused dashboard "Failed to load sets" error on 2026-06-13).

### How to apply migrations

1. Concatenate all migration files in order:
   ```powershell
   Get-ChildItem supabase\migrations -Filter *.sql | Sort-Object Name | ForEach-Object { Get-Content $_.FullName -Raw } | Out-File production-migrations.sql -Encoding utf8
   ```
2. Open the production Supabase project dashboard → SQL Editor → New query.
3. Paste the SQL and run it.
4. Verify the tables exist:
   ```sql
   select tablename from pg_tables where schemaname = 'public';
   ```
5. Re-deploy the Worker if the schema change requires code updates:
   ```bash
   npm run build
   npx wrangler deploy
   ```

### Idempotent migration script

For the initial schema, an idempotent version was prepared at:
`C:\Users\fract\AppData\Local\Temp\10xcards_production_migrations.sql`

Use it for the first-time setup; later changes should be applied as numbered migrations from `supabase/migrations/`.

## Notes

- Durable infrastructure decision: `context/foundation/infrastructure.md`
- Local dev uses `.dev.vars` (gitignored); production secrets live in Cloudflare dashboard only
- `SUPABASE_KEY` stored in Cloudflare secrets must be a **service role / secret key** (`sb_secret_*`) with full access to the database; the publishable/anon key is not sufficient
