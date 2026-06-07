# Deployment Plan

Status: **first deploy completed**. This document now serves as an operations reference.

## Stack

- Worker name: `10xcards-td` (see `wrangler.jsonc`)
- Runtime: Cloudflare Workers via `@astrojs/cloudflare`
- Secrets: `SUPABASE_URL` + `SUPABASE_KEY` (set in Cloudflare dashboard and in GitHub repo secrets)
- Branch: **`master`** (not `main`)

## How deploys happen

### Auto-deploy (primary path)

Push to `master` triggers a deploy via **Cloudflare dashboard ↔ GitHub Git integration** (configured in the Cloudflare Workers dashboard, not in GitHub Actions). The `.github/workflows/ci.yml` workflow runs lint + build only — it does **not** deploy.

```
git push origin master   # triggers auto-deploy via Cloudflare Git integration
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

## Notes

- Durable infrastructure decision: `context/foundation/infrastructure.md`
- Local dev uses `.dev.vars` (gitignored); production secrets live in Cloudflare dashboard only
