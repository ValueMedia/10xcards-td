# Text-to-Speech Playback on Flashcards Implementation Plan

## Overview

Add a speaker-icon button to the shared flip card (`FlashcardBrowseCard`) used in both **review** and **browse** modes. Clicking it synthesizes and plays the currently-visible card text (`flipped ? back : front`) via **Google Cloud Text-to-Speech**. Each account stores **two** voice preferences — one for the Front side, one for the Back — so a card whose front is a German term and back is an English translation is spoken by the German voice on the front and the English voice on the back. A curated voice catalog (en/de/pl/es/fr) drives two dropdowns in Settings. The synthesis endpoint is rate-limited and edge-cached to keep the free tier free.

## Current State Analysis

- **No TTS/audio code exists anywhere** in `src/` (greenfield for this feature). No `speechSynthesis`, `new Audio`, `<audio>`, or `Volume2` usage.
- **One shared card** renders both modes: `FlashcardBrowseCard.tsx:10` (`{ front, back, flipped, onFlip }`). Front face at `:29`, Back at `:37`. Root `onClick={onFlip}` at `:18` — a nested button must call `e.stopPropagation()`.
- **Both islands are `client:only="react"`** (`review.astro:31`, `browse.astro:34`) and each already receives a serializable `locale` prop. Voice must be threaded the same way (serializable props, playback logic inside the island).
- **`user_preferences`** (`20260617000001_user_preferences.sql`) has `user_id`, `locale`, `updated_at`, RLS + per-op policies for `authenticated`, and a **table-level GRANT** (`:33`). Adding columns needs **no new GRANT/RLS** — the GRANT lesson applies to new tables, not new columns.
- **Preference service** `user-settings.ts:88-131` — `UserPreferencesRow` interface + `getUserLocale`/`upsertUserLocale` (`.maybeSingle()` / `.upsert(..., { onConflict: "user_id" })`) is a ready mirror template.
- **Voice-registry template** `i18n/constants.ts` — `SUPPORTED_LOCALES`/`DEFAULT_LOCALE`/`isValidLocale` is the exact shape for a static voice catalog.
- **JSON-preference API template** `user-prompt.ts` — GET/PUT with `prerender = false`, `locals.user`+`locals.supabase` auth (401), zod body validation (400), 500 on service error, 200 with JSON. `SettingsPage.tsx:65-82` calls it via `fetch` + `sonner` toasts.
- **External-provider template** `ai.ts` + `generate.ts` — env-agnostic service (apiKey passed in, `ai.ts:48`), route reads secret via `getSecret` (`generate.ts:113`), `AbortController` + timeout (`ai.ts:209-212`), `response.ok` guard (`:242`), never-throw `{ data, error }` union with `kind` set + static `HTTP_STATUS_BY_ERROR_KIND` map (`:93-103`), route ordering auth→ownership→zod→rate-limit→secret→call→map-errors→respond.
- **Rate limiting** `ai-rate-limit.ts` — `checkDictRateLimit` (`:51-72`) already reuses the `AI_RATE_LIMIT` KV with a `dict:minute:` prefix and 60s TTL, fail-closed on null KV. Exact precedent for a `tts:` prefix.
- **Bindings** `wrangler.jsonc:15-21` — only `AI_RATE_LIMIT` KV. No AI/R2/Cache binding. Bindings accessed via `import { env } from "cloudflare:workers"` (not `locals.runtime.env`). Secrets declared in `astro.config.mjs:28-38` `env.schema` + read with `getSecret`.
- **Middleware** `middleware.ts:8-17` — `PROTECTED_API_ROUTES` array (must add new routes); `/api/*` is skipped by the page `no-store` rewrap (`:103`), so an audio endpoint under `/api/` is safe.

### Key Discoveries:

- Single insertion point: `FlashcardBrowseCard` has `front`/`back`/`flipped` in scope → one button serves both surfaces (`FlashcardBrowseCard.tsx:10`).
- The nested button must `stopPropagation()` — the card root flips on click (`FlashcardBrowseCard.tsx:18`). Review's `window` keydown guard already excludes `button` clicks (`ReviewSession.tsx:192`).
- `tts_voice_front`/`tts_voice_back` are additive columns — no RLS/GRANT churn (`lessons.md:52-57` applies to tables).
- React Context / hydration must live **inside** one island; pass voice as serializable props, never via Context across the island boundary (`lessons.md` i18n island rule).
- Consuming provider output requires a `response.ok` check before parsing (`lessons.md` scraper rule; `ai.ts:242`).
- Any API-contract change must update `openapi-spec.ts` in the same phase (`lessons.md` OpenAPI rule).

## Desired End State

A signed-in user opens Settings and picks a Front voice and a Back voice from two dropdowns (defaulting to the first English voice). In review or browse, a speaker icon sits on the card; clicking it plays the visible side's text in that side's configured voice, showing a spinner while synthesizing and a toast if synthesis fails, without flipping the card. Repeated plays of the same text+voice are served from the edge cache; the endpoint refuses text over 300 characters and is rate-limited per user. Verified by: migration applies cleanly, unit/component tests pass, `npm run build` succeeds, and manual playback works in both modes with the correct per-side voice.

## What We're NOT Doing

- **No per-card / per-set language field.** The account's chosen Front/Back voices encode language; we do not add language metadata to `Flashcard`/`FlashcardSet`.
- **No autoplay** on card reveal — button-click only (explicit gesture; satisfies mobile audio-unlock).
- **No dynamic `voices/list` fetch** — the catalog is a curated static list.
- **No R2 / persistent cross-session cache** — edge Cache API only.
- **No speed/pitch/SSML controls** in the UI — plain text synthesis with catalog-fixed voices.
- **No Web Speech API fallback** — cloud provider only.
- **No changes to locale/`I18nProvider`** beyond adding new settings strings.

## Implementation Approach

Build vertically in four phases, each independently testable: (1) persistence + catalog, (2) preference API + Settings UI, (3) TTS backend, (4) playback wiring in the card. Phases 1-2 reuse the `user_preferences` + `user-prompt.ts` + `constants.ts` patterns almost verbatim. Phase 3 mirrors the `ai.ts`/`generate.ts` provider seam (env-agnostic service, route owns the secret, never-throw union, rate-limit, `response.ok` guard) and adds two genuinely new bits: returning audio bytes and edge caching. Phase 4 threads two serializable voice props from the `.astro` pages down into the shared card and adds the button + `Audio` playback inside the island.

## Critical Implementation Details

- **Google Cloud TTS auth & response shape.** Use **API-key auth** (`?key=<GOOGLE_TTS_API_KEY>`) against `POST https://texttospeech.googleapis.com/v1/text:synthesize`, not OAuth/service-account (avoids JWT signing in the Worker). Request body: `{ input: { text }, voice: { languageCode, name }, audioConfig: { audioEncoding: "MP3" } }`. Response is JSON `{ audioContent: "<base64>" }` — decode base64 to bytes before returning `audio/mpeg`. This differs from the OpenRouter template, which returns text.
- **Cache key ordering (Phase 3).** Check `caches.default` **before** the rate-limit counter and before the provider call, so cached hits neither consume quota nor count against the rate limit. Key the cache on a stable hash of `text + "␟" + voice` wrapped in a synthetic `https://tts.local/...` request URL (Cache API keys are Requests).
- **Voice prop resolves per visible side (Phase 4).** The button computes `showing back ? voiceBack : voiceFront` locally in `FlashcardBrowseCard` using the same `flipped` flag that selects the text — one source of truth, no divergence between spoken text and spoken voice.
- **Playback lifecycle (Phase 4).** Abort/replace any in-flight `Audio` when the card changes or the button is clicked again; revoke the object URL on cleanup to avoid leaks. Keep all `Audio` construction inside the `client:only` island.

## Phase 1: Preferences schema + service + voice registry

### Overview

Persist two per-account voice columns, expose them through the preference service, and define the curated voice catalog that the UI, API validation, and playback all read.

### Changes Required:

#### 1. Migration — add voice columns

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_user_preferences_tts_voices.sql`

**Intent**: Add `tts_voice_front` and `tts_voice_back` to `user_preferences` so each account stores a voice per card side. Additive columns only — no new policy or GRANT.

**Contract**: `alter table public.user_preferences add column tts_voice_front text; add column tts_voice_back text;` Nullable (app supplies `DEFAULT_VOICE` when null). No RLS/GRANT statements — existing table-level grant + own-row policies cover new columns.

#### 2. Voice catalog module

**File**: `src/lib/tts/voices.ts` (new)

**Intent**: Curated static registry mapping an app-facing voice id → Google Cloud voice, mirroring `i18n/constants.ts`. Single source of truth for the Settings dropdowns, the API validation, and the TTS request.

**Contract**: Export `SUPPORTED_VOICES` — an ordered readonly array of `{ id: string; label: string; languageCode: string; gcpVoice: string }` covering en-US, de-DE, pl-PL, es-ES, fr-FR (1-2 Neural2/WaveNet voices each). Export `type VoiceId`, `DEFAULT_VOICE` (= first entry's id; must be an en-US voice), `isValidVoice(value): value is VoiceId`, and a lookup `getVoiceById(id): (typeof SUPPORTED_VOICES)[number] | undefined`. Entry `gcpVoice` = the Google voice `name` (e.g. `en-US-Neural2-C`, `de-DE-Neural2-B`).

#### 3. Preference service — voice pair getters/setters

**File**: `src/lib/services/user-settings.ts`

**Intent**: Mirror `getUserLocale`/`upsertUserLocale` for the voice pair. Reads return `DEFAULT_VOICE` for null/missing columns so callers always get a valid pair.

**Contract**: Extend `UserPreferencesRow` (`:88-92`) with `tts_voice_front: string | null` and `tts_voice_back: string | null`. Add `getUserVoices(supabase, userId): Promise<{ data: { front: VoiceId; back: VoiceId }; error }>` (`.select("tts_voice_front, tts_voice_back").maybeSingle()`, coalescing null/invalid → `DEFAULT_VOICE`) and `upsertUserVoices(supabase, userId, { front, back }): Promise<{ data: { front, back }; error }>` (`.upsert(..., { onConflict: "user_id" })`).

### Success Criteria:

#### Automated Verification:

- [ ] Migration applies cleanly against local Supabase: `npx supabase db push` (or `db reset` only with explicit approval — see lessons)
- [ ] Type checking / build passes: `npm run build`
- [ ] Lint passes on changed TS: `npx eslint src/lib/tts/voices.ts src/lib/services/user-settings.ts`
- [ ] `DEFAULT_VOICE` resolves to an en-US entry and `isValidVoice(DEFAULT_VOICE)` is true (unit test)

#### Manual Verification:

- [ ] `tts_voice_front`/`tts_voice_back` columns exist on `user_preferences` in the local DB (Studio or `\d`)

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 2.

---

## Phase 2: Voice preference API + Settings UI

### Overview

Expose the voice pair over a JSON API (mirroring `user-prompt.ts`) and add a two-dropdown control to Settings so users can pick Front and Back voices.

### Changes Required:

#### 1. Voice preference endpoint

**File**: `src/pages/api/user-voice.ts` (new)

**Intent**: GET returns the account's `{ front, back }` voices; PUT validates against the catalog and upserts. Same auth/error shape as `user-prompt.ts`.

**Contract**: `export const prerender = false`. `GET` → `{ front: VoiceId, back: VoiceId }` (defaults applied by the service). `PUT` body zod schema `{ front: z.string(), back: z.string() }` refined with `isValidVoice` on both fields → 400 on invalid; 401 when `!user?.id || !supabase`; 500 on service error; 200 with the saved pair. Calls `getUserVoices`/`upsertUserVoices`.

#### 2. Protect the new route

**File**: `src/middleware.ts`

**Intent**: Require auth for the voice API.

**Contract**: Add `"/api/user-voice"` to `PROTECTED_API_ROUTES` (`:8-17`).

#### 3. VoiceSwitcher component

**File**: `src/components/settings/VoiceSwitcher.tsx` (new)

**Intent**: Two labelled dropdowns (Front voice, Back voice) populated from `SUPPORTED_VOICES`, persisting via `fetch` PUT `/api/user-voice` with a `sonner` toast on success/failure — mirroring `SettingsPage`'s prompt-save flow.

**Contract**: Props `{ initialFront: VoiceId; initialBack: VoiceId }`. Renders two `<select>` (or shadcn Select) over `SUPPORTED_VOICES` (`label` shown, `id` as value). On change, PUT both current values; toast via `t(...)`. Card theme matches existing settings cards (`border-white/10 bg-white/10`).

#### 4. Wire into Settings page + island

**File**: `src/components/settings/SettingsPage.tsx`, `src/pages/settings.astro`

**Intent**: Load the account's voices server-side and render a new "Voice" settings card containing `VoiceSwitcher`.

**Contract**: `settings.astro` reads `getUserVoices(supabase, user.id)` and passes `initialVoiceFront`/`initialVoiceBack` into `SettingsPage`; `SettingsPage` props gain both fields and render `<VoiceSwitcher .../>` in a new `Card` (near the Language card, `SettingsPage.tsx:210-218`).

#### 5. i18n strings

**File**: `src/lib/i18n/locales/en/*.json`, `src/lib/i18n/locales/pl/*.json` (settings namespace)

**Intent**: Labels/toasts for the voice section (title, "Front voice", "Back voice", saved/failed).

**Contract**: Add keys under the `settings` namespace in both `en` and `pl` (match existing key style, e.g. `settings.voiceTitle`, `settings.voiceFront`, `settings.voiceBack`, `settings.voiceSaved`, `settings.voiceSaveFailed`).

### Success Criteria:

#### Automated Verification:

- [ ] Build passes: `npm run build`
- [ ] Lint passes on changed TS/TSX: `npx eslint src/pages/api/user-voice.ts src/components/settings/VoiceSwitcher.tsx src/middleware.ts`
- [ ] `PUT /api/user-voice` rejects an invalid voice id with 400 and accepts a valid pair with 200 (route unit test, mirroring `user-prompt` test patterns)

#### Manual Verification:

- [ ] Settings shows two voice dropdowns; changing them persists across reload
- [ ] New account shows the default en-US voice on both sides
- [ ] No dead buttons — the island hydrates (`client:load` on `SettingsPage`)

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 3.

---

## Phase 3: TTS service + endpoint

### Overview

Add an env-agnostic Google Cloud TTS service and a rate-limited, edge-cached `POST /api/tts` endpoint that returns audio bytes, following the `ai.ts`/`generate.ts` template.

### Changes Required:

#### 1. TTS service

**File**: `src/lib/services/tts.ts` (new)

**Intent**: Env-agnostic synthesis call (API key passed in), never-throw result union, timeout, `response.ok` guard, base64 decode. Route owns the secret.

**Contract**: `synthesizeSpeech({ text, gcpVoice, languageCode, apiKey }): Promise<{ data: Uint8Array | null; error: TtsServiceError | null }>`. `TtsServiceError` union `kind ∈ unconfigured | timeout | apiError` with a static `HTTP_STATUS_BY_TTS_ERROR_KIND` map (`unconfigured→500`, `apiError→502`, `timeout→504`) and `getTtsErrorHttpStatus`/`ttsErrorMessage` exports (mirror `ai.ts:93-121`). `fetch` GCP `text:synthesize` with `?key=`, `AbortController` + timeout, check `response.ok` before parsing (throw/return `apiError` on non-200 per lessons), parse `{ audioContent }`, decode base64 → `Uint8Array`.

#### 2. Rate limiter — tts prefix

**File**: `src/lib/services/ai-rate-limit.ts`

**Intent**: Reuse `AI_RATE_LIMIT` KV with a `tts:minute:` prefix (no new binding), mirroring `checkDictRateLimit`.

**Contract**: Add `checkTtsRateLimit(kv, userId, now?)` and `ttsRateLimitKey`/`getTtsLimit` with a `tts:minute:${userId}:${minute}` key, 60s TTL, sensible per-minute cap (e.g. 60), fail-closed on null KV — copy of the `dict` block (`:37-72`).

#### 3. TTS endpoint

**File**: `src/pages/api/tts.ts` (new)

**Intent**: Auth → zod body → **cache lookup** → rate-limit → read secret → synthesize → cache store → return `audio/mpeg`. Cache-before-rate-limit so hits are free.

**Contract**: `export const prerender = false`. `POST` body zod `{ text: z.string().min(1).max(300), voice: z.string().refine(isValidVoice) }`; 401 unauth; 400 invalid. Resolve `getVoiceById(voice)` → `{ gcpVoice, languageCode }`. Build cache key Request from `hash(text + voice)`; `caches.default.match` → return cached response if present. Else `checkTtsRateLimit` (429 + `Retry-After`), `getSecret("GOOGLE_TTS_API_KEY")` (500 if missing), `synthesizeSpeech`, map `error` via `getTtsErrorHttpStatus`, else build `Response(bytes, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=86400" } })`, `caches.default.put` a clone, return it. KV via `import { env } from "cloudflare:workers"`.

#### 4. Protect route + declare secret

**File**: `src/middleware.ts`, `src/astro.config.mjs`

**Intent**: Require auth for `/api/tts`; declare the Google secret.

**Contract**: Add `"/api/tts"` to `PROTECTED_API_ROUTES`. Add `GOOGLE_TTS_API_KEY: envField.string({ context: "server", access: "secret", optional: true })` to `astro.config.mjs` `env.schema` (`:28-38`).

#### 5. OpenAPI documentation

**File**: `src/lib/openapi/openapi-spec.ts`

**Intent**: Document the new endpoints so Scalar stays in sync (lessons rule).

**Contract**: Add `POST /api/tts` (request `{ text, voice }`, `200 audio/mpeg`, `400/401/429/500/502/504`) and `GET`+`PUT /api/user-voice` paths, with schemas in `components.schemas` and an appropriate tag.

### Success Criteria:

#### Automated Verification:

- [ ] Build passes: `npm run build`
- [ ] Lint passes on changed TS: `npx eslint src/lib/services/tts.ts src/lib/services/ai-rate-limit.ts src/pages/api/tts.ts`
- [ ] `synthesizeSpeech` returns `apiError` on a non-ok provider response and `timeout` on abort (unit test, mocked `fetch`)
- [ ] `POST /api/tts` returns 400 for text > 300 chars and for an invalid voice; 200 `audio/mpeg` on the happy path with `synthesizeSpeech` mocked (route unit test — alias `astro:env/server` stub + mock `checkTtsRateLimit` to `{allowed:true}`, per lessons)

#### Manual Verification:

- [ ] With `GOOGLE_TTS_API_KEY` set in `.dev.vars`, `POST /api/tts` returns playable MP3 for an English and a German voice
- [ ] Second identical request is served from cache (no new GCP call — verify via logs/latency)
- [ ] `/docs/api` shows the new endpoints

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 4.

---

## Phase 4: Playback button + prop threading

### Overview

Thread the account's Front/Back voices from the pages into both islands and the shared card, then add the speaker button that plays the visible side.

### Changes Required:

#### 1. Thread voices from pages

**File**: `src/pages/sets/[id]/review.astro`, `src/pages/sets/[id]/browse.astro`

**Intent**: Read the account's voices server-side and pass them as serializable props into the islands (same pattern as `locale`).

**Contract**: Call `getUserVoices(supabase, user.id)` and pass `voiceFront`/`voiceBack` (`VoiceId`) into `ReviewSession` (`review.astro:31`) and `FlashcardBrowseView` (`browse.astro:34-40`).

#### 2. Extend island props + pass to card

**File**: `src/components/review/ReviewSession.tsx`, `src/components/sets/FlashcardBrowseView.tsx`

**Intent**: Accept the two voice props and forward them to `FlashcardBrowseCard`.

**Contract**: Add `voiceFront: VoiceId; voiceBack: VoiceId` to each `Props`, thread through the `Inner` component (`ReviewSession.tsx:52-60`, `FlashcardBrowseView.tsx:18-26`), and pass both into `<FlashcardBrowseCard ...>` at the render sites (`ReviewSession.tsx:324-330`, `FlashcardBrowseView.tsx:112-118`).

#### 3. Speaker button + playback in the card

**File**: `src/components/sets/FlashcardBrowseCard.tsx`, and a new hook `src/components/hooks/useSpeech.ts`

**Intent**: Render a `Volume2` icon button that plays the visible side's text in that side's voice, with loading/error state, without flipping the card.

**Contract**: `FlashcardBrowseCard` Props gain `voiceFront?: VoiceId; voiceBack?: VoiceId` (optional so existing usages/tests stay valid). Button uses shadcn `Button variant="ghost" size="icon"` + `Volume2` from `lucide-react` (`FlashcardCard.tsx:33-40` pattern), positioned in a card corner, `aria-label` set, `onClick` calls `e.stopPropagation()` then plays. Voice = `flipped ? voiceBack : voiceFront`; text = `flipped ? back : front`. `useSpeech` encapsulates: POST `/api/tts` `{ text, voice }`, `URL.createObjectURL(blob)` → `new Audio(url)` → `play()`, abort/replace previous audio, revoke URL on cleanup; exposes `{ speak, status }` where `status ∈ idle | loading | error`. On `loading` show a spinner in the button; on `error` show a `sonner` toast and return to `idle`. All audio logic runs inside the island.

### Success Criteria:

#### Automated Verification:

- [ ] Build passes: `npm run build`
- [ ] Lint passes on changed TSX: `npx eslint src/components/sets/FlashcardBrowseCard.tsx src/components/hooks/useSpeech.ts src/components/review/ReviewSession.tsx src/components/sets/FlashcardBrowseView.tsx`
- [ ] `useSpeech`/button component test: clicking the speaker calls `/api/tts` with the visible side's text+voice and does not trigger `onFlip` (`stopPropagation`)

#### Manual Verification:

- [ ] In review and browse, clicking the speaker plays the visible side; flipping and clicking plays the other side in its voice
- [ ] Button does not flip the card; keyboard flip still works
- [ ] Loading spinner shows during synthesis; a forced failure shows a toast and leaves the island usable
- [ ] Correct per-side voice: e.g. Front=de-DE, Back=en-US spoken accordingly

**Implementation Note**: After automated verification passes, pause for final manual confirmation.

---

## Testing Strategy

### Unit Tests:

- `voices.ts`: `DEFAULT_VOICE` is en-US and valid; `isValidVoice` rejects unknown ids; `getVoiceById` round-trips.
- `tts.ts`: `apiError` on non-ok response (mocked `fetch`), `timeout` on abort, base64 decode on happy path.
- `ai-rate-limit.ts`: `checkTtsRateLimit` fail-closed on null KV; blocks at cap.

### Integration Tests:

- `POST /api/tts` route (node project): 400 (too-long / invalid voice), 401 (unauth), 200 `audio/mpeg` (mocked service). Alias `astro:env/server` stub + mock `checkTtsRateLimit` → `{allowed:true}` (lessons).
- `PUT /api/user-voice`: 400 invalid, 200 valid pair persisted.

### Manual Testing Steps:

1. Set two voices in Settings; reload — persisted.
2. Review a set: play Front (voice A), flip, play Back (voice B).
3. Browse the same set: same behavior; navigation resets side; speaker plays correct side.
4. Click speaker twice quickly — no overlap/leak; second play replaces first.
5. Temporarily unset `GOOGLE_TTS_API_KEY` — button shows error toast, island stays alive.

## Performance Considerations

- Edge Cache API keyed on `hash(text+voice)` collapses repeated plays (review replays the same card text) to a single GCP call — checked before rate-limit and provider call so hits cost nothing.
- 300-char cap bounds per-request synthesis cost and cache value size.
- Per-minute KV rate limit (`tts:` prefix) caps abuse; fail-closed when KV is unavailable.

## Migration Notes

- Single additive migration (two nullable text columns). No backfill: existing rows read as null → service coalesces to `DEFAULT_VOICE`. No RLS/GRANT change. Migrations apply on prod via the Cloudflare build command (`test → db push → build`); locally via `npx supabase db push` (never `db reset` without approval — lessons).

## References

- Research: `context/changes/flashcards-speech/research.md`
- Provider/service template: `src/lib/services/ai.ts:13-121,209-251`, `src/pages/api/sets/[id]/generate.ts:51-150`
- Preference template: `src/lib/services/user-settings.ts:88-131`, `src/pages/api/user-prompt.ts`, `src/lib/i18n/constants.ts`
- Rate-limit precedent: `src/lib/services/ai-rate-limit.ts:37-72`
- Card + islands: `src/components/sets/FlashcardBrowseCard.tsx:10,18`, `src/components/review/ReviewSession.tsx:52-60,324-330`, `src/components/sets/FlashcardBrowseView.tsx:18-26,112-118`
- Bindings/secrets: `wrangler.jsonc:15-21`, `astro.config.mjs:28-38`, `src/env.d.ts`
- Lessons: island Context boundary, `response.ok` guard, OpenAPI sync, no destructive DB reset (`context/foundation/lessons.md`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Preferences schema + service + voice registry

#### Automated

- [x] 1.1 Migration applies cleanly against local Supabase — 02ed7d7
- [x] 1.2 Type checking / build passes (`npm run build`) — 02ed7d7
- [x] 1.3 Lint passes on `voices.ts` + `user-settings.ts` — 02ed7d7
- [x] 1.4 `DEFAULT_VOICE` is en-US and `isValidVoice(DEFAULT_VOICE)` true (unit test) — 02ed7d7

#### Manual

- [x] 1.5 Voice columns exist on `user_preferences` in local DB — 02ed7d7

### Phase 2: Voice preference API + Settings UI

#### Automated

- [x] 2.1 Build passes (`npm run build`) — eb9a4c0
- [x] 2.2 Lint passes on `user-voice.ts` + `VoiceSwitcher.tsx` + `middleware.ts` — eb9a4c0
- [x] 2.3 `PUT /api/user-voice` 400 on invalid voice, 200 on valid pair (route test) — eb9a4c0

#### Manual

- [x] 2.4 Settings shows two voice dropdowns; changes persist across reload — eb9a4c0
- [x] 2.5 New account shows default en-US voice on both sides — eb9a4c0
- [x] 2.6 No dead buttons — island hydrates — eb9a4c0

### Phase 3: TTS service + endpoint

#### Automated

- [x] 3.1 Build passes (`npm run build`) — 3d5e9fb
- [x] 3.2 Lint passes on `tts.ts` + `ai-rate-limit.ts` + `api/tts.ts` — 3d5e9fb
- [x] 3.3 `synthesizeSpeech` returns `apiError` on non-ok, `timeout` on abort (unit test) — 3d5e9fb
- [x] 3.4 `POST /api/tts` 400 too-long/invalid voice, 200 audio/mpeg happy path (route test) — 3d5e9fb

#### Manual

- [x] 3.5 `POST /api/tts` returns playable MP3 for English and German voices — 3d5e9fb
- [x] 3.6 Second identical request served from cache (no new GCP call) — 3d5e9fb
- [x] 3.7 `/docs/api` shows the new endpoints — 3d5e9fb

### Phase 4: Playback button + prop threading

#### Automated

- [x] 4.1 Build passes (`npm run build`)
- [x] 4.2 Lint passes on card + `useSpeech.ts` + both island views
- [x] 4.3 Speaker click calls `/api/tts` with visible side's text+voice and does not flip (component test)

#### Manual

- [x] 4.4 Review + browse: speaker plays visible side; flip plays other side in its voice
- [x] 4.5 Button does not flip card; keyboard flip still works
- [x] 4.6 Loading spinner during synthesis; forced failure shows toast, island stays usable
- [x] 4.7 Correct per-side voice (e.g. Front de-DE, Back en-US)
