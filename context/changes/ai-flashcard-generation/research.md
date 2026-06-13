---
date: 2026-06-13T00:00:00+02:00
researcher: 10x-research
git_commit: 84f2221c930da7d3fd44a73342c5e9e4c8a10ce1
branch: main
repository: 10xcards-td
topic: "ai-flashcard-generation: Czy integracja z OpenRouter przez endpointy Astro na Cloudflare Workers jest utrudnieniem?"
tags: [research, codebase, ai-flashcard-generation, openrouter, cloudflare-workers, astro-ssr]
status: complete
last_updated: 2026-06-13
last_updated_by: 10x-research
---

# Research: AI Flashcard Generation — OpenRouter via Astro endpoints

**Date**: 2026-06-13  
**Researcher**: 10x-research  
**Git Commit**: [`84f2221c930da7d3fd44a73342c5e9e4c8a10ce1`](https://github.com/ValueMedia/10xcards-td/blob/84f2221c930da7d3fd44a73342c5e9e4c8a10ce1)  
**Branch**: `main`  
**Repository**: `10xcards-td`

## Research Question

Czy jeżeli integracja z API zewnętrznym (OpenRouter) będzie realizowana przez endpointy Astro, to czy będzie to utrudnienie?

## Summary

**Nie, to nie jest utrudnienie — wręcz przeciwnie.** Obecna architektura (Astro 6 SSR na Cloudflare Workers) predysponuje do tego, by integrację z OpenRouter umieścić w endpointach Astro pod `src/pages/api/`. Jest to naturalne rozszerzenie istniejącego wzorca API (`/api/sets`, `/api/flashcards`, `/api/auth/*`), pozwala ukryć klucz API po stronie serwera i pasuje do modelu autentykacji opartego na `context.locals.user`. Ryzyko techniczne jest niskie/średnie — główne zastrzeżenia to wybór planu Cloudflare (CPU limits) i konieczność dodania timeoutu/abortu dla długich wywołań LLM.

## Detailed Findings

### 1. Astro 6 SSR + Cloudflare Workers — architektura

- Aplikacja działa w trybie pełnego SSR: [`astro.config.mjs:11`](https://github.com/ValueMedia/10xcards-td/blob/84f2221c930da7d3fd44a73342c5e9e4c8a10ce1/astro.config.mjs#L11) ustawia `output: "server"`, a linia 16 rejestruje adapter `@astrojs/cloudflare`.
- `wrangler.jsonc` (`compatibility_date: 2026-05-08`, `compatibility_flags: ["nodejs_compat"]`) oznacza, że deployowany runtime to prawdziwy Cloudflare `workerd` z kompatybilnością Node.js.
- W takim modelu każdy plik `src/pages/api/*.ts` staje się endpointem API działającym w Workerze, a strony renderowane są po stronie serwera.

### 2. Istniejące endpointy API i wzorce

- Istnieje spójny wzorzec endpointów `APIRoute`:
  - Auth: [`src/pages/api/auth/signin.ts`](https://github.com/ValueMedia/10xcards-td/blob/84f2221c930da7d3fd44a73342c5e9e4c8a10ce1/src/pages/api/auth/signin.ts), [`signup.ts`](https://github.com/ValueMedia/10xcards-td/blob/84f2221c930da7d3fd44a73342c5e9e4c8a10ce1/src/pages/api/auth/signup.ts), [`signout.ts`](https://github.com/ValueMedia/10xcards-td/blob/84f2221c930da7d3fd44a73342c5e9e4c8a10ce1/src/pages/api/auth/signout.ts).
  - Dane: `/api/sets/*`, `/api/flashcards/*`.
- Middleware [`src/middleware.ts:5`](https://github.com/ValueMedia/10xcards-td/blob/84f2221c930da7d3fd44a73342c5e9e4c8a10ce1/src/middleware.ts#L5) definiuje `PROTECTED_API_ROUTES = ["/api/sets", "/api/flashcards"]`. Nowy endpoint AI musi zostać tu dodany, jeśli ma być chroniony.
- W endpointach używany jest `context.locals.user` oraz `context.locals.supabase` (ustawiane w [`src/middleware.ts:18-19`](https://github.com/ValueMedia/10xcards-td/blob/84f2221c930da7d3fd44a73342c5e9e4c8a10ce1/src/middleware.ts#L18-L19)).
- Klient Supabase tworzony jest w [`src/lib/supabase.ts:9`](https://github.com/ValueMedia/10xcards-td/blob/84f2221c930da7d3fd44a73342c5e9e4c8a10ce1/src/lib/supabase.ts#L9) przez `createServerClient`, a sekrety czytane z `astro:env/server` (linia 3).

### 3. Zmienne środowiskowe i sekrety

- [`astro.config.mjs:18-21`](https://github.com/ValueMedia/10xcards-td/blob/84f2221c930da7d3fd44a73342c5e9e4c8a10ce1/astro.config.mjs#L18-L21) definiuje `env.schema` dla `SUPABASE_URL` i `SUPABASE_KEY` jako `server`/`secret`/`optional`.
- Klucz OpenRouter można dodać analogicznie: `OPENROUTER_API_KEY: envField.string({ context: "server", access: "secret", optional: true })`.
- `.dev.vars` (gitignored) służy lokalnemu dev Cloudflare/Wrangler; na produkcji sekrety powinny być ustawione przez `wrangler secret put OPENROUTER_API_KEY` lub panel Cloudflare.
- Cloudflare oficjalnie zaleca używanie secrets zamiast plaintext env vars: https://developers.cloudflare.com/workers/configuration/secrets/

### 4. Wywołanie OpenRouter z endpointu Astro

- Cloudflare Workers udostępniają standardowy `fetch()`: https://developers.cloudflare.com/workers/runtime-apis/fetch/
- Wywołanie `fetch("https://openrouter.ai/api/v1/chat/completions", ...)` z nagłówkami `Authorization`, `Content-Type`, opcjonalnie `HTTP-Referer` i `X-Title` jest w pełni możliwe.
- OpenRouter SDK istnieje (`@openrouter/sdk`), ale dla Astro/Cloudflare lepszy jest **czysty `fetch()`** — zero ryzyka bundlingu, mniejszy rozmiar, pełna kontrola.
- Subrequest limits Cloudflare: 50/invocation (Free), 10 000/invocation (Paid) — dla pojedynczego wywołania LLM nieistotne.

### 5. Limity czasowe Cloudflare Workers

- **CPU time**: Free = 10 ms, Paid = domyślnie 30 s, możliwość zwiększenia do 5 min.
- **Wall-clock duration dla HTTP**: brak twardego limitu, dopóki klient utrzymuje połączenie.
- Czekanie na odpowiedź `fetch()` **nie wlicza się** do CPU time.
- Wniosek: generowanie fiszek trwające 5–15 s nie zagrozi limitem na planie płatnym. Na Free plan może być problem.

### 6. Streaming odpowiedzi LLM

- Cloudflare Workers oficjalnie wspierają `ReadableStream`: https://developers.cloudflare.com/workers/runtime-apis/streams/
- OpenRouter wspiera streaming przez Server-Sent Events (`stream: true`).
- Astro SSR endpoint może zwrócić `new Response(response.body, response)`, przekazując strumień do klienta.

### 7. Alternatywa: Supabase Edge Function

- W tym stacku Edge Function nie ma przewagi nad Astro endpointem w Cloudflare Worker:
  - aplikacja już jest na Cloudflare Workers,
  - dodanie Edge Function = kolejny runtime (Deno), osobne sekrety, konfiguracja CORS, dodatkowy punkt autentykacji,
  - lepsza centralizacja logiki w jednym miejscu.

## Code References

- [`astro.config.mjs:10-22`](https://github.com/ValueMedia/10xcards-td/blob/84f2221c930da7d3fd44a73342c5e9e4c8a10ce1/astro.config.mjs#L10-L22) — konfiguracja SSR, adapter Cloudflare, schema env.
- [`src/middleware.ts:1-38`](https://github.com/ValueMedia/10xcards-td/blob/84f2221c930da7d3fd44a73342c5e9e4c8a10ce1/src/middleware.ts#L1-L38) — auth middleware, `PROTECTED_API_ROUTES`, `context.locals`.
- [`src/lib/supabase.ts:1-24`](https://github.com/ValueMedia/10xcards-td/blob/84f2221c930da7d3fd44a73342c5e9e4c8a10ce1/src/lib/supabase.ts#L1-L24) — SSR Supabase client, `astro:env/server`.
- [`src/pages/api/auth/signin.ts:1-20`](https://github.com/ValueMedia/10xcards-td/blob/84f2221c930da7d3fd44a73342c5e9e4c8a10ce1/src/pages/api/auth/signin.ts#L1-L20) — wzorzec endpointu POST.
- [`wrangler.jsonc:1-15`](https://github.com/ValueMedia/10xcards-td/blob/84f2221c930da7d3fd44a73342c5e9e4c8a10ce1/wrangler.jsonc#L1-L15) — konfiguracja deployu Workers.
- [`.env.example`](https://github.com/ValueMedia/10xcards-td/blob/84f2221c930da7d3fd44a73342c5e9e4c8a10ce1/.env.example) — wzorzec dla lokalnych zmiennych.

## Architecture Insights

- Astro endpointy API są w tym projekcie **naturalnym miejscem** na integrację z OpenRouter.
- Istniejący wzorzec: walidacja wejścia (zod), sprawdzenie `context.locals.user`, wywołanie zewnętrznej usługi/serwisu, zwrócenie JSON.
- Klucz API OpenRouter powinien być traktowany tak samo jak `SUPABASE_KEY`: `astro:env/server` + Cloudflare Secret.
- Należy dodać `export const prerender = false` w nowym endpointzie API (zgodnie z konwencją z AGENTS.md).

## Historical Context

Brak bezpośrednio powiązanych prior changes. Roadmap item S-01 (`ai-flashcard-generation`) jest w statusie `proposed` i jego głównym unknown był wybór dostawcy AI. Niniejszy research rozstrzyga kwestię architektury integracji.

## Related Research

Brak powiązanych research.md w `context/archive/` lub `context/changes/`.

## Open Questions

1. Czy plan Cloudflare Workers to Free czy Paid? Jeśli Free, 10 ms CPU time może być blokujące dla LLM.
2. Czy wymagane jest streaming odpowiedzi OpenRouter od razu, czy wystarczy blocking JSON? Blocking jest prostszy, streaming bardziej responsywny.
3. Jaki model OpenRouter zostanie użyty? Decyzja wpływa na koszt, format promptu i czas odpowiedzi.
4. Czy należy wprowadzić rate limiting na endpoint `/api/generate` per user, aby ograniczyć koszty API?

## Recommendation

**Zalecana architektura:**

1. Dodaj `src/pages/api/generate.ts` (lub `generate-flashcards.ts`) z `export const prerender = false`.
2. Rozszerz `astro.config.mjs` o `OPENROUTER_API_KEY` (i opcjonalnie `OPENROUTER_MODEL`, `APP_URL`) w `env.schema` jako `server`/`secret`.
3. Ustaw sekret na produkcji: `npx wrangler secret put OPENROUTER_API_KEY`.
4. W endpointzie użyj `context.locals.user` jako guard (lub dodaj ścieżkę do `PROTECTED_API_ROUTES`).
5. Wywołaj OpenRouter przez `fetch()` z `AbortController` timeout (np. 30 s).
6. Na start użyj non-streaming JSON (`stream: false`); streaming można dodać w kolejnej iteracji.
7. Logikę parsowania/promptowania wydziel do `src/lib/services/ai.ts`.
