---
project: "10xCards"
researched_at: "2026-06-07T16:14:30.5003392+02:00"
recommended_platform: "Cloudflare"
runner_up: "Railway"
context_type: "mvp"
tech_stack:
  language: "TypeScript"
  framework: "Astro 6 + React 19"
  runtime: "Cloudflare Workers / workerd"
---

## Recommendation

**Deploy on Cloudflare.**

It is the cheapest fit for this MVP, it already matches the live repo’s Cloudflare Workers setup, and it gives strong CLI, docs, and MCP support without forcing a stack migration. The main caveat is that Cloudflare is still an edge runtime, not a true always-on server; that is acceptable here because the current product does not actually need background jobs or realtime coordination.

## Platform Comparison

| Platform | CLI-first | Managed / serverless | Agent-readable docs | Stable deploy API | MCP / Integration | Total | Notes |
|---|---|---|---|---|---|---:|---|
| Cloudflare | Pass | Pass | Pass | Pass | Pass | 10 | Cheapest option; already aligned with the current Workers-based repo. |
| Railway | Pass | Pass | Pass | Pass | Pass | 10 | Best low-cost always-on fallback; small monthly floor, good for persistent Node services. |
| Fly.io | Pass | Pass | Pass | Pass | Partial | 9 | Strongest always-on/process story, but pricier and rollback is more manual. |
| Render | Pass | Pass | Pass | Pass | Pass | 10 | Viable, but higher minimum cost than Cloudflare/Railway for this MVP. |
| Vercel | Pass | Pass | Pass | Pass | Pass | 10 | Dropped by hard filter: serverless-only for this use case and Hobby timeout is too tight for AI generation. |
| Netlify | Pass | Pass | Pass | Pass | Pass | 10 | Dropped by hard filter: no persistent server process. |

### Shortlisted Platforms

#### 1. Cloudflare (Recommended)

Best overall fit because it is already the repo’s live path, it stays at $0 at the MVP scale, and it pairs cleanly with Supabase’s HTTP-based SDKs. The risk is that it does not give you a real always-on process; if that later becomes non-negotiable, the fallback is to move that specific workload elsewhere rather than the whole app.

#### 2. Railway

Best low-cost always-on alternative. It keeps persistent Node services simple, costs little at MVP scale, and has solid CLI/MCP support. It loses to Cloudflare on cost and to Fly on raw process flexibility.

#### 3. Fly.io

Best choice if the app truly needs a traditional always-on service. It is the strongest process/WebSocket option, but the lack of a permanent free tier and the extra operational overhead make it a weaker MVP default than Cloudflare or Railway.

## Anti-Bias Cross-Check: Cloudflare

### Devil's Advocate — Weaknesses

1. It is not a true always-on server, so any future feature that really needs a resident process will force a redesign.
2. The edge runtime can surprise Node-minded code, especially around environment variables and compatibility flags.
3. The platform is easy to misread as "just Pages," but the live repo is actually wired for Workers, so deployment drift is a real risk.
4. Bundle size and CPU ceilings can become painful if the AI flow grows heavier than the current MVP scope.

### Pre-Mortem — How This Could Fail

Six months from now the team has shipped the MVP on Cloudflare because it was cheap and already aligned with the starter. The app works well until AI generation grows into a longer streaming workflow and a few libraries assume a normal Node server. The team then spends time fighting runtime quirks: compatibility flags, environment-variable handling, and route-size limits, instead of shipping product changes. A second mistake follows: someone treats Workers and Pages as interchangeable, the deployment path drifts, and preview or secret handling becomes inconsistent. Nothing is catastrophically broken, but the platform stops feeling invisible and starts dominating the maintenance budget. At that point the original "cheap and fast" decision has quietly turned into a platform tax.

### Unknown Unknowns

- `process.env` is not automatically populated unless you opt into the right compatibility behavior.
- Raw Postgres/TCP assumptions do not hold; the Supabase SDK path works, but `pg`-style direct connections do not.
- Durable Objects are GA, but paid-only if you later need stateful coordination.
- The Cloudflare product split can blur the line between Workers and Pages if the deployment path is not documented tightly.

## Operational Story

- **Preview deploys**: keep a separate preview/staging deployment in the same Cloudflare ecosystem; the current repo deploys with `npm run build` + `npx wrangler deploy`, so preview should stay on the same path and not introduce a second platform.
- **Secrets**: store `SUPABASE_URL` and `SUPABASE_KEY` as Cloudflare secrets via `npx wrangler secret put`; keep the publishable Supabase key, not the secret service-role key.
- **Rollback**: redeploy the last known-good commit from Git/CI; Cloudflare Pages has one-click rollback in the dashboard, while the current Workers setup should treat redeploying the previous build as the rollback path.
- **Approval**: a human should approve production publishes and any secret rotation; preview deploys and log inspection are fine for an agent.
- **Logs**: tail runtime logs with `npx wrangler tail`; use the Cloudflare dashboard for deployment history and rollback when needed.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Future work needs a real always-on process | Devil's advocate / pre-mortem | M | H | Keep the current app stateless; move only the long-lived piece to a process platform if that need appears. |
| Environment-variable / compatibility-flag surprises | Unknown unknowns | M | M | Pin compatibility dates, keep secrets in Wrangler, and rely on Astro env schema instead of ad hoc `process.env` reads. |
| Direct Postgres/TCP usage breaks on Workers | Research finding | M | H | Stay on `@supabase/supabase-js` / `@supabase/ssr`; do not introduce raw `pg` connections. |
| Bundle size or CPU ceilings become a bottleneck | Research finding | M | M | Keep React islands small, watch build size, and avoid pulling heavy Node-only libraries into the worker bundle. |
| Workers/Pages confusion causes deployment drift | Research finding | M | M | Document one canonical path (`npm run build` + `npx wrangler deploy`) and stick to it. |

## Getting Started

1. Install the pinned runtime from `.nvmrc` (`22.14.0`) and run `npm install`.
2. Copy `.env.example` to `.dev.vars` for local Cloudflare dev secrets, then set `SUPABASE_URL` and `SUPABASE_KEY`.
3. Start the app with `npm run dev` for the local Cloudflare workerd runtime.
4. Build production artifacts with `npm run build`.
5. Deploy with `npx wrangler deploy`, using `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_KEY` first for production secrets.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup
- Production-scale architecture (multi-region, HA, DR)
