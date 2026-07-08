# 10xCards

Turn any text into study-ready flashcards in seconds, then learn them with a
proven spaced-repetition schedule.

10xCards is a web app for learners who want the effectiveness of spaced
repetition without the hours spent hand-writing cards. Paste your notes, an
article, or a textbook excerpt; an LLM proposes question/answer pairs; you
review, edit, and save them into a set; and a spaced-repetition engine decides
what to show you and when.

## Features

- **AI flashcard generation** — paste raw text and get a batch of proposed
  question/answer cards from an LLM (via OpenRouter). Review each proposal,
  edit it inline, or discard it before saving. Generation is bounded by a hard
  10-second deadline and a per-user hourly rate limit.
- **Manual & bulk creation** — add cards by hand, or import them from a
  CSV/TXT file in Anki format (two fields per line, separated by `;`, tab, or
  `-`).
- **Sets** — organize flashcards into named sets; full create / read / update /
  delete for both sets and cards.
- **Spaced-repetition review** — study sessions are scheduled by the
  [FSRS](https://github.com/open-spaced-repetition/ts-fsrs) algorithm
  (`ts-fsrs`), which tracks each card's stability, difficulty, and due date
  from your review history and surfaces only the cards that are due.
- **Learning stats** — a dashboard with daily study-time charts and per-set
  progress (total cards, learned cards, last opened).
- **Read-only share links** — publish a set behind a random capability token so
  anyone with the link can browse it without an account (no edit, no review).
- **Dictionary lookup** — look up a word against Cambridge Dictionary while
  building cards.
- **Internationalization** — full Polish / English UI (`i18next`).
- **Account management** — email/password auth, change password, delete account,
  and a customizable AI system prompt per user.

## Tech Stack

- [Astro](https://astro.build/) v6 — server-first rendering (`output: "server"`)
- [React](https://react.dev/) v19 — interactive islands
- [TypeScript](https://www.typescriptlang.org/) v5
- [Tailwind CSS](https://tailwindcss.com/) v4 + [shadcn/ui](https://ui.shadcn.com/) (new-york)
- [Supabase](https://supabase.com/) — auth, Postgres, and Row Level Security
- [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) — spaced-repetition scheduling
- [OpenRouter](https://openrouter.ai/) — LLM gateway for flashcard generation
- [Cloudflare Workers](https://workers.cloudflare.com/) — edge deployment (`@astrojs/cloudflare`), with a KV namespace for AI rate limiting
- [Vitest](https://vitest.dev/) — unit, worker, and integration tests

## Prerequisites

- Node.js v22.14.0 (see `.nvmrc`)
- npm
- [Docker](https://www.docker.com/) (~7 GB RAM) for local Supabase
- An [OpenRouter](https://openrouter.ai/) API key for AI generation

## Getting Started

1. Clone and install:

   ```bash
   git clone <your-fork-url>
   cd 10xcards
   npm install
   ```

2. Start local Supabase and apply migrations (requires Docker):

   ```bash
   npx supabase start
   npx supabase migration up
   ```

   The migrations in `supabase/migrations/` create the `sets`, `flashcards`,
   session-log, and preference tables, the `submit_card_review` /
   `reset_set_progress` RPCs, and the RLS policies that isolate each user's
   data.

3. Configure environment variables (see [Environment](#environment) below).
   Create `.env` for Node tooling and `.dev.vars` for the Cloudflare dev
   runtime:

   ```bash
   cp .env.example .env
   cp .env.example .dev.vars
   ```

   Fill in the Supabase credentials printed by `npx supabase start` and your
   OpenRouter key.

4. Run the dev server:

   ```bash
   npm run dev
   ```

## Environment

Server-only secrets are declared via Astro's `astro:env` schema
(`astro.config.mjs`) and are never exposed to the client.

| Variable                   | Required | Description                                                                   |
| -------------------------- | -------- | ----------------------------------------------------------------------------- |
| `SUPABASE_URL`             | yes      | Supabase project URL (local: `http://127.0.0.1:54321`)                        |
| `SUPABASE_KEY`             | yes      | Supabase publishable/anon key                                                 |
| `SUPABASE_SERVICE_ROLE_KEY`| tests    | Service-role key — used only by the integration test harness                  |
| `OPENROUTER_API_KEY`       | for AI   | OpenRouter API key; without it, AI generation returns a clean "unconfigured" error |
| `OPENROUTER_MODEL`         | no       | Override the default model (`google/gemini-flash-1.5`)                         |
| `OPENROUTER_SYSTEM_PROMPT` | no       | Override the default system prompt for generation                             |
| `AI_RATE_LIMIT_HOURLY`     | no       | Max AI generations per user per hour                                          |

- **Node tooling** (`npm run test`, Astro CLI) reads `.env`.
- **Cloudflare dev runtime** (`npm run dev`) reads `.dev.vars` (gitignored).
- On Cloudflare, set these with `npx wrangler secret put <NAME>` and bind the
  `AI_RATE_LIMIT` KV namespace (see `wrangler.jsonc`).

> **Note:** By default Supabase requires email confirmation before sign-in. For
> local development, disable it under **Authentication → Email → Confirm email**
> in Supabase Studio (`http://localhost:54323`).

## Available Scripts

- `npm run dev` — start the dev server (Cloudflare `workerd` runtime)
- `npm run build` — production build (SSR)
- `npm run preview` — preview the production build
- `npm run lint` / `npm run lint:fix` — ESLint (type-checked rules)
- `npm run format` — Prettier
- `npm run test` — unit + worker tests (`node` and `workers` Vitest projects)
- `npm run test:watch` — the same, in watch mode
- `npm run test:integration` — API integration tests against local Supabase

## Testing

Tests follow a risk-driven plan documented in
`context/foundation/test-plan.md`.

- **Unit / worker** (`npm run test`) — services, parsers, i18n, and the
  Cambridge scraper (against the real `workerd` `HTMLRewriter`/`fetch`).
- **Integration** (`npm run test:integration`) — API route handlers run against
  a **real local Supabase**, exercising RLS and the RPCs. Cover cross-user
  authorization (IDOR), share-token exposure, SR-state persistence, and
  external-integration failure paths. Requires `npx supabase start` and the
  Supabase env vars; the suite auto-skips when they are absent.

If integration tests flake under parallel file execution against local
Supabase, run them serially:

```bash
npm run test:integration -- --no-file-parallelism
```

## Project Structure

```md
.
├── src/
│   ├── pages/            # Astro pages
│   │   └── api/          # API endpoints (auth, sets, flashcards, reviews, share, dict, ...)
│   ├── components/       # Astro layout + React islands (ai, sets, review, dashboard, ...)
│   ├── lib/
│   │   ├── services/     # Business logic (ai, reviews/FSRS, flashcards, sets, stats, ...)
│   │   ├── i18n/         # Locales (pl/en) and helpers
│   │   └── openapi/      # OpenAPI spec (served at /docs/api via Scalar)
│   ├── middleware.ts     # Auth resolution + route protection + locale
│   └── types.ts          # Shared entities and DTOs
├── supabase/migrations/  # Schema, RPCs, and RLS policies
├── tests/integration/    # API integration suite (real local Supabase)
├── context/foundation/   # PRD, roadmap, test plan, and other project docs
└── wrangler.jsonc        # Cloudflare Workers config (KV binding, assets)
```

## Auth & Route Protection

Authentication uses Supabase Auth with cookie-based SSR sessions
(`src/lib/supabase.ts`). `src/middleware.ts` resolves the current user on every
request, attaches it to `context.locals.user`, and guards routes:

- Unauthenticated requests to protected **pages** (`/dashboard`, `/sets`,
  `/generate`, `/settings`, `/lookup_word`) redirect to `/auth/signin`.
- Unauthenticated requests to protected **API routes** return `401`.

Every set and flashcard is scoped to its owner both at the service layer
(`.eq("user_id", ...)`) and via Postgres RLS. Anonymous visitors can reach only
a single set through a read-only share token.

| Route                 | Description                                          |
| --------------------- | ---------------------------------------------------- |
| `/auth/signin`        | Email/password sign-in                               |
| `/auth/signup`        | Email/password sign-up                               |
| `/dashboard`          | Learning stats (protected)                           |
| `/generate`           | AI flashcard generation (protected)                  |
| `/sets/[id]`          | Set detail, browse, and review (protected)           |
| `/settings`           | Account settings (protected)                         |
| `/share/[token]`      | Read-only shared set (public)                        |
| `/docs/api`           | Interactive OpenAPI documentation                    |

## Deployment

Deploys to [Cloudflare Workers](https://workers.cloudflare.com/).

```bash
npm run build
npx wrangler deploy
```

Set `SUPABASE_URL`, `SUPABASE_KEY`, `OPENROUTER_API_KEY` (and any optional
overrides) via `npx wrangler secret put`, and ensure the `AI_RATE_LIMIT` KV
namespace from `wrangler.jsonc` exists in your account.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs lint + build on every push and
PR. Configure `SUPABASE_URL` and `SUPABASE_KEY` as repository secrets for the
build step.

## License

MIT
