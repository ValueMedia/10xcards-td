# AI Flashcard Generation — Runbook

Operational commands and configuration notes for the OpenRouter-powered flashcard generation feature.

## Prerequisites

- Cloudflare account with Workers + KV enabled.
- `wrangler` CLI authenticated (`npx wrangler whoami`).
- Supabase project linked (auth + `sets`/`flashcards` tables).

## KV namespace

The feature uses a KV namespace bound as `AI_RATE_LIMIT` in `wrangler.jsonc`.

### Create or list namespaces

```bash
# Production namespace
npx wrangler kv namespace create "AI_RATE_LIMIT"

# Preview namespace (optional, for `wrangler dev` / preview deployments)
npx wrangler kv namespace create "AI_RATE_LIMIT" --preview

# List existing namespaces
npx wrangler kv namespace list
```

After creation, copy the returned `id` and `preview_id` into `wrangler.jsonc`:

```jsonc
"kv_namespaces": [
  {
    "binding": "AI_RATE_LIMIT",
    "id": "<production-id>",
    "preview_id": "<preview-id>"
  }
]
```

## Secrets

### Production

```bash
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler secret put OPENROUTER_MODEL   # optional
npx wrangler secret put OPENROUTER_SYSTEM_PROMPT # optional, overrides default prompt template
npx wrangler secret put AI_RATE_LIMIT_HOURLY # optional, default 10
```

### Local development

Create `.dev.vars` in the project root (gitignored):

```bash
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODEL=google/gemini-flash-1.5
OPENROUTER_SYSTEM_PROMPT=           # leave empty to use default template in ai-prompt.ts
AI_RATE_LIMIT_HOURLY=10
```

A non-empty `OPENROUTER_SYSTEM_PROMPT` overrides the default template entirely. It can be a single-line value with `\n` escapes, or set via `npx wrangler secret put` for multiline input.

## Environment variables reference

| Name | Required | Default | Purpose |
|------|----------|---------|---------|
| `OPENROUTER_API_KEY` | Yes | — | Bearer token for OpenRouter API |
| `OPENROUTER_MODEL` | No | `google/gemini-flash-1.5` | Model ID override |
| `OPENROUTER_SYSTEM_PROMPT` | No | template in `src/lib/services/ai-prompt.ts` | Full system prompt override |
| `AI_RATE_LIMIT_HOURLY` | No | `10` | Max AI generations per user per hour |

## Rotate the OpenRouter key

1. Generate a new key in the OpenRouter dashboard.
2. Update the production secret:
   ```bash
   npx wrangler secret put OPENROUTER_API_KEY
   ```
3. Update `.dev.vars` for local development.
4. Revoke the old key in the OpenRouter dashboard after confirming the new one works.

## Change the prompt

Set `OPENROUTER_SYSTEM_PROMPT` to override the default template from `src/lib/services/ai-prompt.ts`.

For a production / preview deployment, paste the full prompt via stdin:

```bash
npx wrangler secret put OPENROUTER_SYSTEM_PROMPT
```

The prompt may contain `$COUNT`, which is replaced by the requested number of flashcards. Include the `<source_text>` delimiter instructions if you want the model to treat the user text as a bounded input.

To revert to the default template, set the secret to an empty value or delete it.

## Change the model

Set `OPENROUTER_MODEL` to any model ID supported by OpenRouter, e.g.:

```bash
npx wrangler secret put OPENROUTER_MODEL
# value: openai/gpt-4o-mini
```

Then verify generation quality and latency before keeping the change.

## Reset or inspect rate-limit counters

Rate-limit keys follow the pattern:

```
ai:hourly:<userId>:YYYY-MM-DDTHH
```

Examples:

```bash
# Read a user's current counter (replace userId and hour)
npx wrangler kv key get "ai:hourly:<userId>:2026-06-14T02"

# Delete / reset a counter
npx wrangler kv key delete "ai:hourly:<userId>:2026-06-14T02" --binding AI_RATE_LIMIT

# List keys with a prefix (use sparingly)
npx wrangler kv key list --binding AI_RATE_LIMIT --prefix "ai:hourly:<userId>:"
```

## Common operational checks

- Build passes: `npm run build`
- Tests pass: `npm run test`
- Lint passes: `npm run lint`
- Local dev: `npm run dev` (requires `.dev.vars`)

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `AI generation is not configured` (500) | `OPENROUTER_API_KEY` missing | Set secret in Wrangler / `.dev.vars` |
| `Too many AI requests` (429) | Hourly rate limit reached | Wait one hour or delete the KV key for that user-hour |
| Generation works locally but not after deploy | KV namespace ID mismatch or secret not set in prod | Verify `wrangler.jsonc` IDs and `wrangler secret list` |
| `Save failed: Validation failed` | Batch > 50 cards or invalid card content | Save fewer cards or fix empty/too-long fields |

## Related files

- `src/lib/services/ai.ts` — prompt, OpenRouter call, response parsing
- `src/lib/services/ai-rate-limit.ts` — per-user hourly counter
- `src/pages/api/sets/[id]/generate.ts` — generation endpoint
- `src/pages/api/sets/[id]/flashcards/batch.ts` — batch save endpoint
- `wrangler.jsonc` — KV binding configuration
- `astro.config.mjs` — env schema declarations
