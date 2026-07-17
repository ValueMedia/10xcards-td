---
change_id: ci-migrations-cloudflare-build
title: Apply Supabase migrations during the Cloudflare production build
status: implemented
created: 2026-07-17
updated: 2026-07-17
archived_at: null
---

## Notes

Wire `supabase db push` into the Cloudflare production gate (dashboard build command) so
`supabase/migrations/*` reach the remote prod DB automatically on every deploy, in the
order test → migrate → build → deploy. Motivated by the 2026-07-17 `reset_set_progress`
incident: the migration existed locally but was never pushed to prod, so the RPC returned
PGRST202 and the reset flow failed with a 500.

Draft runbook already written: `docs/runbooks/migrations-in-cloudflare-build.md` — plan
should formalize/supersede it. Key constraints: build checkout is not `--linked`
(`supabase/.temp/` gitignored) → use `--db-url` + `--yes`; new `SUPABASE_DB_URL` secret
(session pooler, port 5432, percent-encoded); leave GitHub Actions untouched (must not hold
prod DB creds). The build command lives in the Cloudflare dashboard (outside VCS), so the
version-controlled deliverable is the CLAUDE.md §CI update.
