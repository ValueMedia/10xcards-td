# Deployment Plan

Problem: ship the first Cloudflare deployment for 10xCards using the recorded infrastructure decision and the existing Astro/Supabase stack.

Proposed approach:
1. Verify Wrangler CLI availability/auth, then verify or create the Cloudflare account / Worker target and confirm GitHub repo access for deployment secrets.
2. Confirm the Supabase env-var naming for deploy-time and local dev use.
3. Normalize any legacy `NEXT_PUBLIC_*` values to the stack’s server-only Supabase variables while keeping the existing local `.dev.vars` `SUPABASE_KEY`.
4. Set Cloudflare production secrets and any required GitHub Actions secrets from the decided Supabase values.
5. Run the production build and first Wrangler deploy.
6. Verify the deployed app and note the rollback path.

Todos:
- Verifying Wrangler CLI auth/setup
- Configuring Cloudflare deployment access
- Configuring GitHub Actions secrets
- Normalizing dev environment variables
- Setting Cloudflare Supabase secrets
- Running the first Cloudflare deploy
- Verifying the first rollout

Notes:
- Use `SUPABASE_URL` and `SUPABASE_KEY`; ignore the legacy `NEXT_PUBLIC_*` aliases.
- Local development already has `SUPABASE_KEY` in `.dev.vars`; keep it and only wire production secrets into Cloudflare.
- Cloudflare account setup and GitHub Actions secret setup are part of the rollout plan, not preconditions.
- Wrangler CLI setup/auth is part of the rollout plan, not a separate prerequisite.
- Durable reference for the infrastructure decision lives at `context/foundation/infrastructure.md`.
