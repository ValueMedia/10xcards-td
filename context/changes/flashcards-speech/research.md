---
date: 2026-07-17T17:57:43Z
researcher: Claude (value-media)
git_commit: 3f14313f013efde6f3266c00e719799375b98089
branch: main
repository: 10xcards
topic: "TTS speaker button on flashcards (review + browse) with per-account voice selection via a free cloud TTS provider"
tags: [research, codebase, tts, flashcards, user-preferences, cloudflare-workers, review, browse]
status: complete
last_updated: 2026-07-17
last_updated_by: Claude (value-media)
last_updated_note: "Locked provider = Azure Speech F0 (verified Workers AI TTS has no German); added separate Front/Back per-account voice selection, default = first (English) voice"
---

# Research: TTS speaker button on flashcards with per-account voice selection

**Date**: 2026-07-17T17:57:43Z
**Researcher**: Claude (value-media)
**Git Commit**: 3f14313f013efde6f3266c00e719799375b98089
**Branch**: main
**Repository**: 10xcards

## Research Question

Add a speaker-icon button to flashcards in **review** and **browse** modes that plays the currently-visible card text. Requirement: a **free cloud TTS** provider (user's choice), good pronunciation quality, and a per-account **voice selection** stored on the user's account (e.g. one user learns English → English voice, another German → German voice). Scope: feature + integration points.

## Summary

The feature slots cleanly onto three existing, well-established seams:

1. **One shared card component** (`FlashcardBrowseCard`) renders the flip UI in both modes, and the currently-visible string is always `flipped ? back : front`. A speaker button placed inside it serves both review and browse from a single insertion point.
2. **`user_preferences`** already stores a per-account `locale`; a `tts_voice` column mirrors it with **no new RLS/GRANT** (table-level grant covers new columns). The `locale`→settings-UI→persistence→app-threading pipeline is a ready template for a `voice` preference.
3. **The OpenRouter AI integration** (`src/lib/services/ai.ts` + `src/pages/api/sets/[id]/generate.ts`) is a complete template for a cloud-provider call: env-secret via `getSecret`, `AbortController` timeout, a never-throw result tuple with a `kind`-union + HTTP-status map, and KV-backed rate limiting. A TTS service + endpoint mirrors it.

The main **open decisions** are provider choice (Cloudflare Workers AI vs external free-tier provider — see Open Questions), audio caching to protect free-tier quota, and how a single per-account voice interacts with two-language cards (front vs back).

Critically: **no per-card/per-set language field exists** — the only language signal is the app-UI `locale`. With cloud TTS the chosen **voice** encodes the language, so the account's selected voice drives pronunciation for the whole set.

## Decisions Locked (2026-07-17 follow-up)

1. **Provider = Microsoft Azure Speech, free tier (F0).** Chosen for full language coverage (incl. de-DE), many neural voices per language, 0.5M chars/month free (ample with caching), and a stable official keyed API that fits the repo's `getSecret` + service + rate-limit + cache pattern. **Cloudflare Workers AI TTS was ruled out**: verified against current docs (2026-07-17) — its only TTS models are `@cf/deepgram/aura-2-en` (English-only, 39 voices), `@cf/deepgram/aura-2-es` (Spanish-only), `@cf/deepgram/aura-1` (English), and `@cf/myshell-ai/melotts` (multilingual but docs confirm only en/fr, no voice-picker, **no German**). No German on any Workers AI model → disqualified for the user's German example. Refs: developers.cloudflare.com/workers-ai/models/{melotts,aura-2-en,aura-2-es}.
2. **Separate per-account voices for Front and Back.** Instead of one account voice, the user picks **two** voices independently — one for the Front side, one for the Back — stored per account. This resolves the two-language-card problem (open question #2): a card whose front is a German term and back is an English translation is spoken by the German voice on the front and the English voice on the back. The speaker button synthesizes the **currently-visible side** using **that side's** configured voice: `showing back ? tts_voice_back : tts_voice_front`.
3. **Default voices = the first available (English) voice.** Both Front and Back default to `DEFAULT_VOICE`, which is the first entry of the voice registry and must be an English (e.g. en-US) Azure neural voice. New accounts thus get a sensible English voice on both sides until the user changes them.

### Impact on the integration model (supersedes single-`tts_voice` assumption)

- **Preferences schema**: add **two** columns to `user_preferences` — `tts_voice_front text` and `tts_voice_back text` (both additive; still no new GRANT/RLS per the column-add finding). Nullable with app-side default, or `not null default '<default en voice id>'`.
- **Service** (`user-settings.ts`): `getUserVoices(supabase, userId)` → `{ front, back }` and `upsertUserVoices(...)` (or a pair of getters/setters), mirroring the locale functions; extend `UserPreferencesRow` with both columns.
- **Voice registry** (`SUPPORTED_VOICES`): an **Azure voice catalog** — entries map an app-facing id → Azure voice short-name (e.g. `de-DE-KatjaNeural`, `en-US-JennyNeural`) + a language/label for the settings dropdowns. `DEFAULT_VOICE` = first entry = an English voice. `isValidVoice()` validates against this registry. (Azure exposes a `voices/list` endpoint; the plan decides curated-static list vs. dynamic fetch — a curated static list is simpler and avoids a runtime dependency for rendering settings.)
- **Settings UI**: `VoiceSwitcher` renders **two** dropdowns — "Front voice" and "Back voice" — each persisting via the `fetch`+JSON API (`/api/user-voice`, PUT with `{ front, back }` or per-field), mirroring `user-prompt.ts`.
- **Threading + playback**: `review.astro`/`browse.astro` read both voices and pass `voiceFront`/`voiceBack` props to `ReviewSession`/`FlashcardBrowseView` → down to the speaker button in `FlashcardBrowseCard`, which picks the voice by the visible side and calls the TTS endpoint.
- **TTS endpoint**: `POST /api/.../speak` body `{ text, voice }` (`voice` = resolved Azure voice id for the visible side) → Azure Speech synthesis → `audio/mpeg`. Rate-limit (`tts:` prefix on `AI_RATE_LIMIT` KV) + cache keyed on `hash(text + voice)`.

## Detailed Findings

### Flashcard card components (review + browse)

- **Shared presentational card**: `src/components/sets/FlashcardBrowseCard.tsx:10` — `FlashcardBrowseCard({ front, back, flipped, onFlip })`. CSS 3D flip; Front face renders `{front}` (`:29`), Back `{back}` (`:37`). Fully controlled (no internal state); `role="button"`, flips on click (`:18`) and Enter (`:19-21`).
- **Review**: `src/components/review/ReviewSession.tsx` — `ReviewSessionInner` (`:60`) renders the card at `:324-330` with `flipped={showingBack}` (`:328`); current card `cards[currentIndex]` (`:284`). Mounted `client:only="react"` from `src/pages/sets/[id]/review.astro:31`.
- **Browse**: `src/components/sets/FlashcardBrowseView.tsx` — `FlashcardBrowseViewInner` (`:26`) renders card at `:112-118` with `flipped={flipped}` (`:116`); current card `flashcards[order[position]]` (`:33`). Mounted `client:only="react"` from `src/pages/sets/[id]/browse.astro:34`.
- **Currently-visible text** (the string to speak):
  - Review: `showingBack ? card.back : card.front`. `showingBack` inits to `reverse` (`:67`); `flipCard` (`:180-187`) sets `showingBack = !reverse` on first reveal, then toggles.
  - Browse: `flipped ? currentCard.back : currentCard.front`. `flipped` inits to `reverse` (`:31`), reset to `reverse` on navigation.
  - **Reverse mode**: `src/components/hooks/useReverseMode.ts:14` — per-set boolean in `localStorage` (`reverseMode:<setId>`). Hook doc (`:8-12`) mandates `client:only="react"` mounting to avoid hydration mismatch.
- **Insertion point**: because `FlashcardBrowseCard` has `front`, `back`, and `flipped` in scope, a speaker button there computes the visible string locally and serves both modes. **Must call `e.stopPropagation()`** — the card's root `onClick={onFlip}` (`:18`) would otherwise also flip the card. Review's `window` keydown guard already excludes clicks on `button` elements (`ReviewSession.tsx:192`).

### Button / icon conventions

- Icons: **lucide-react** is the standard (`FlashcardCard.tsx:1`, `SetCard.tsx`, …) — use `import { Volume2 } from "lucide-react"`, sized `className="h-4 w-4"`. (The two flip views currently use hand-rolled inline SVGs, but lucide is available and preferred.)
- Buttons: shadcn `Button` (`src/components/ui/button.tsx:7`, `cva`), icon-only via `size="icon"`; class merging via `cn()` from `@/lib/utils`. Card theme: translucent white on dark (`border-white/10 bg-white/5 text-white hover:bg-white/10`).
- Example (`FlashcardCard.tsx:33-40`): `<Button variant="ghost" size="icon" className="h-8 w-8 …" aria-label="…"><MoreHorizontal className="h-4 w-4" /></Button>`.

### No existing audio / language infra

- **No TTS/audio code anywhere** in `src/` (grep for `speechSynthesis`, `new Audio`, `<audio`, `utterance`, `Volume2`, `tts` → zero). Greenfield.
- **No per-card / per-set language**: `Flashcard` (`src/types.ts:19-36`) = front/back + FSRS fields; `FlashcardSet` (`:9-17`) = name/share_token/timestamps. DB schema confirms (`20260610000000_initial_schema.sql:5-32`). Only `user_preferences.locale` exists (app-UI language). `DictionaryEntry.dictionaryRegion` (`types.ts:100`) is unrelated (word-lookup feature).
- Both flip islands already receive a `locale` prop (app UI language) used only to init `I18nProvider`; it is **not** plumbed to the card today.

### user_preferences infrastructure

- **Table** `supabase/migrations/20260617000001_user_preferences.sql`: `user_id uuid pk → auth.users`, `locale text not null default 'en'`, `updated_at`. RLS enabled; per-op policies for `authenticated` keyed on `auth.uid() = user_id` (SELECT/INSERT/UPDATE; no DELETE). Table-level `grant select, insert, update … to authenticated` (line 33). Trigger `handle_updated_at`.
- **Adding `tts_voice`**: a single `alter table public.user_preferences add column tts_voice text …` — **no new GRANT, no new policy** (the table-level grant + own-row policies cover new columns). The lessons rule about GRANT applies to *new tables*, not new columns (`context/foundation/lessons.md:52-57`).
- **Service** `src/lib/services/user-settings.ts`: private `UserPreferencesRow` (`:88-92`); `getUserLocale` (`:94-113`, selects `locale`, `maybeSingle`); `upsertUserLocale` (`:115-131`, `.upsert(..., { onConflict: "user_id" })`). Mirror with `getUserVoice`/`upsertUserVoice`, add `tts_voice` to the row interface.
- **Constants** live in `src/lib/i18n/constants.ts` (`SUPPORTED_LOCALES`, `DEFAULT_LOCALE`, `isValidLocale`). For voice, add an analogous registry (`SUPPORTED_VOICES`, `DEFAULT_VOICE`, `isValidVoice`) — this is the **app-side voice catalog** (curated provider voice IDs), matching the "voices registered in the app" model.
- **Reaching the app**: middleware (`src/middleware.ts:56-75`) resolves `locale` (cookie → DB → Accept-Language) into `context.locals.locale`; typed in `src/env.d.ts:1-6`. Voice does not need the per-request cookie fast-path — fetch it only on review/browse pages (or add to `locals` if wanted app-wide).

### Settings UI + persistence patterns (two options)

- **Form-POST + redirect** (locale): `LanguageSwitcher.tsx` posts a native `<form>` to `src/pages/api/locale-switch.ts`, which `upsertUserLocale` + returns a 302 with a hand-built `Set-Cookie` (the Cloudflare adapter may drop `cookies.set` on redirects). Needs a full reload — appropriate for locale (SSR `<html lang>`).
- **`fetch` + JSON API** (AI prompt): `src/pages/api/user-prompt.ts` (GET/PUT/DELETE, zod-validated, `prerender = false`, uses `locals.supabase`+`user`, JSON 401/400/500/200); `SettingsPage.tsx` calls it via `fetch` and shows `sonner` toasts.
- **Voice should use the `fetch`+JSON pattern** (like user-prompt): a new `src/pages/api/user-voice.ts` (PUT, zod-validated against the voice registry) + a `VoiceSwitcher` component wired into `SettingsPage.tsx`. No cookie/reload needed. Add `/api/user-voice` to `PROTECTED_API_ROUTES` (`middleware.ts:8-17`).
- **Threading to the card**: mirror the `locale` prop — read voice in `review.astro`/`browse.astro` (from `getUserVoice` or `locals`) and pass `voice={...}` into `ReviewSession` / `FlashcardBrowseView`, then down to the speaker button.

### External-provider integration template (OpenRouter → TTS)

- **Service/route split** (`ai.ts` + `generate.ts`): the **service is env-agnostic** — the API key is passed in as input (`ai.ts:48`), so only the route touches `getSecret("OPENROUTER_API_KEY")` (`generate.ts:14,113-119`). Replicate this seam for TTS (testable service, route owns secrets).
- **Provider call**: plain `fetch` (`ai.ts:230-240`), `Authorization: Bearer`, `AbortController` + 10s timeout (`:209-212`), zod-validated response.
- **Never-throw result**: `{ data, error }` tuple; `AiServiceError` union `kind ∈ unconfigured|timeout|parseError|apiError|noProposals` (`ai.ts:13-18`); static `HTTP_STATUS_BY_ERROR_KIND` map (`:93-99`); `getAiErrorHttpStatus`/`errorMessage` exports. Route maps error→status (`generate.ts:133-150`).
- **Route ordering** (good template): auth → ownership → zod body → **rate limit** → read secret → call service → map errors → respond.
- **Rate limiting** `src/lib/services/ai-rate-limit.ts`: `checkRateLimit(kv, userId)` fixed-window counter in **Cloudflare KV** (`AI_RATE_LIMIT` namespace), fail-closed when `kv` null (`:20-22`). `checkDictRateLimit` (`:51-72`) already **reuses the same KV** with a `dict:` prefix — exact precedent for a `checkTtsRateLimit` with a `tts:` prefix (no new binding).

### Cloudflare bindings & audio delivery

- **`wrangler.jsonc`**: `compatibility_date 2026-05-08`, `nodejs_compat`; `ASSETS` assets binding; observability on; **one KV namespace `AI_RATE_LIMIT`**. **No `AI` binding, no R2, no D1, no Cache binding.**
- **Binding access** is via `import { env } from "cloudflare:workers"` (`generate.ts:15,104`; `dict/[word].ts:4,26`) — **not** `locals.runtime.env`. New bindings must be added to `wrangler.jsonc` **and** typed in `src/env.d.ts` (`App.Runtime.env` + `Cloudflare.Env`). Secrets go through `getSecret` + a new `envField` in `astro.config.mjs:28-38`.
- **Audio response**: no non-JSON endpoint exists today, but standard Web `Response` works: `new Response(bytes, { headers: { "Content-Type": "audio/mpeg" } })` (bytes = `ArrayBuffer`/`Uint8Array`/stream). Middleware rewraps *page* responses with `Cache-Control: no-store` but **skips `/api/*`** (`middleware.ts:103`) — keep the TTS endpoint under `/api/`.
- **Caching** (to protect free-tier quota): none exists. Options — add an **R2 bucket** binding (durable audio blobs; KV's 25 MiB value cap is workable but R2 is the right tool), or the binding-free **Cache API** (`caches.default`) keyed by a hash of `(text, voice)`. Review sessions replay the same card text repeatedly, so caching materially cuts synthesis calls.

## Code References

- `src/components/sets/FlashcardBrowseCard.tsx:10,18,29,37` — shared flip card; single TTS-button insertion point.
- `src/components/review/ReviewSession.tsx:67,180-187,192,284,324-330` — review state, `showingBack`, keydown button-guard.
- `src/components/sets/FlashcardBrowseView.tsx:31,33,112-118` — browse state, `flipped`, current card.
- `src/components/hooks/useReverseMode.ts:8-12,14` — reverse mode + client:only requirement.
- `src/components/ui/button.tsx:7,25` — Button variants; `size="icon"`.
- `src/types.ts:9-17,19-36` — Set/Flashcard types (no language field).
- `supabase/migrations/20260617000001_user_preferences.sql:1-5,7-26,33` — prefs table, RLS, GRANT.
- `src/lib/services/user-settings.ts:88-92,94-113,115-131` — prefs service to mirror.
- `src/lib/i18n/constants.ts:1-9` — constants/registry pattern for a voice catalog.
- `src/middleware.ts:8-17,56-75,103` — protected API routes, locale resolution, `/api/*` no-store skip.
- `src/pages/api/user-prompt.ts` — `fetch`+JSON preference API template (mirror for `user-voice.ts`).
- `src/pages/api/locale-switch.ts` — form-POST+302+Set-Cookie preference template (the other option).
- `src/lib/services/ai.ts:13-18,48,93-103,230-251,306-309` — provider service template (result union, status map, fetch+timeout).
- `src/pages/api/sets/[id]/generate.ts:14,52-150,170-173` — route ordering + error mapping + secret read.
- `src/lib/services/ai-rate-limit.ts:9-35,51-72` — KV rate limiter; `dict:`/`tts:` prefix reuse precedent.
- `wrangler.jsonc:15-21` — the only binding (`AI_RATE_LIMIT` KV); no AI/R2.
- `src/env.d.ts:1-12,17-21` — `App.Locals`, `App.Runtime.env`, `Cloudflare.Env` typing.
- `astro.config.mjs:28-38` — `env.schema` secret declarations.

## Architecture Insights

- **Single-insertion-point win**: both modes share `FlashcardBrowseCard` and the same `flipped ? back : front` rule → one button, both surfaces. Guard against the card's flip-on-click with `stopPropagation`.
- **Preferences are a solved pattern**: `tts_voice` is an additive column (no RLS/GRANT churn) + a mirrored service pair + a `fetch`-JSON API + a settings control. The voice registry (`SUPPORTED_VOICES`) is the app-side "registered voices" catalog the user described.
- **Provider integration is a solved pattern**: the OpenRouter service/route/rate-limit/error-map template transfers almost 1:1 to TTS; the only genuinely new bits are (a) provider choice, (b) returning audio bytes, (c) caching.
- **Free-tier discipline is the real constraint**: rate limiting (reuse `AI_RATE_LIMIT` KV, `tts:` prefix) + audio caching (R2 or Cache API keyed on `hash(text,voice)`) are what keep a "free" cloud TTS actually free under repeated review replays. Treat caching as in-scope, not optional.
- **Cloudflare-native option is compelling**: since the app already runs on Workers, **Workers AI TTS** (add an `AI` binding; models like `@cf/myshell-ai/melotts` (multilingual) or Deepgram `aura-1` (EN)) avoids external billing/keys entirely and bills against the Workers AI free neuron allowance — the closest match to "free + good quality" without a third-party account. Its limit is language/voice coverage (see Open Questions).
- **Reliability**: mirror the never-throw result union so the button can degrade gracefully (e.g. show a disabled/greyed speaker + toast on `apiError`/`timeout`/`unconfigured`) rather than crash the island. Follow the dictionary lesson (`lessons.md`): check `response.ok` before consuming provider output.

## Historical Context (from prior changes)

- `context/archive/2026-07-08-testing-external-integrations/` — the dictionary (Cambridge scraper) integration + its lesson "scraper/parser must check `response.ok` before parsing" (`lessons.md`). Directly relevant to consuming a TTS provider response safely.
- `context/archive/2026-06-16-user-settings-page/` — established `user_preferences` + settings UI; the lesson "new RLS table needs GRANT to authenticated" originates here (applies to tables, not the `tts_voice` column add).
- `context/archive/2026-06-17-i18n-pl-en/` — the locale preference + island/Context lessons (Provider must live *inside* the `client:*` island; pass serializable props across the island boundary). The voice prop must be threaded the same way; the speaker button + `Audio`/playback must live inside the `client:only` island.
- `context/archive/2026-06-19-flashcard-reverse-mode/` & `2026-06-19-flashcard-reverse-front-flash/` — established `useReverseMode` and the front/back flip semantics this feature reads to pick the spoken text.
- `context/archive/2026-06-13-ai-flashcard-generation/` — the OpenRouter integration + rate-limit infra being reused as the TTS template.

## Related Research

- None prior for TTS. This is the first research artifact for `flashcards-speech`.

## Open Questions

1. **~~Provider choice~~ — RESOLVED: Azure Speech F0.** See "Decisions Locked" above. Workers AI verified as having no German; Azure chosen for coverage + stability + free tier. (Remaining sub-detail for the plan: curated-static voice registry vs. dynamic `voices/list` fetch.)
2. **~~Two-language cards~~ — RESOLVED: separate Front/Back per-account voices.** See "Decisions Locked" above. The visible side is spoken with that side's configured voice; both default to the first (English) registry voice.
3. **Caching store.** R2 bucket (durable, add binding) vs. Cache API (`caches.default`, no binding) vs. none. Recommend at least Cache API keyed on `hash(text+voice)` given review replay; confirm.
4. **Voice registry shape.** How the app-side `SUPPORTED_VOICES` maps to provider voice IDs + language labels shown in settings; default voice; validation. Depends on provider.
5. **Playback UX.** Autoplay on reveal vs. explicit button only; loading/error state on the button; interrupt/replay behavior; `prefers-reduced-motion`/accessibility; mobile audio unlock (some mobile browsers require a user gesture — the button click satisfies this).
6. **Text length / abuse bounds.** Max characters per synthesis (zod bound) to protect quota; what to do for very long card text.
