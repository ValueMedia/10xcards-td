# Text-to-Speech Playback on Flashcards — Plan Brief

> Full plan: `context/changes/flashcards-speech/plan.md`
> Research: `context/changes/flashcards-speech/research.md`

## What & Why

Add a speaker-icon button to flashcards in review and browse modes that plays the currently-visible card text via Google Cloud TTS. Each account picks a voice per card side (Front and Back independently), so a card with a German term on the front and its English translation on the back is spoken with the German voice on the front and the English voice on the back. This lets learners of different languages hear correct, high-quality pronunciation while studying.

## Starting Point

The app already has all the seams this feature needs: one shared flip card (`FlashcardBrowseCard`) rendering both modes, a `user_preferences` table with an established preference service/UI pipeline, and a complete external-provider integration template (`ai.ts` + `generate.ts`: env-agnostic service, `getSecret`, never-throw error union, KV rate-limit). No TTS/audio code exists yet — this is greenfield within those patterns.

## Desired End State

In Settings a user picks a Front voice and a Back voice (default: first English voice). On a card in review or browse, a speaker icon plays the visible side in that side's voice, showing a spinner while synthesizing and a toast on failure — without flipping the card. Repeated plays of the same text+voice come from the edge cache; the endpoint caps text at 300 characters and is rate-limited per user.

## Key Decisions Made

| Decision              | Choice                                              | Why (1 sentence)                                                                 | Source   |
| --------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------- | -------- |
| Provider              | Google Cloud TTS (API-key auth)                    | Quality ties Azure; user already has a GCP project with billing — no new account. | Plan     |
| Two-language cards    | Separate Front/Back per-account voices             | The visible side is spoken with that side's configured voice.                    | Research |
| Default voice         | First en-US catalog entry, both sides              | Sensible default for new accounts until changed.                                 | Research |
| Voice catalog         | Curated static list (en/de/pl/es/fr)               | No runtime dependency to render Settings; simple validation, mirrors locales.    | Plan     |
| Caching               | Edge Cache API keyed on hash(text+voice)           | No new binding; collapses review replays to one GCP call.                        | Plan     |
| Playback UX           | Button-click only, loading spinner + error toast   | Explicit gesture (mobile audio-unlock); degrades gracefully.                     | Plan     |
| Text length cap       | ~300 characters                                    | Covers words/phrases/short sentences and protects the free quota.               | Plan     |

## Scope

**In scope:** two voice columns on `user_preferences`; voice-pair service; `/api/user-voice` + `VoiceSwitcher` in Settings; `/api/tts` synthesis endpoint (rate-limited, edge-cached); speaker button + playback threaded into both islands; OpenAPI + i18n updates.

**Out of scope:** per-card/per-set language field; autoplay; dynamic voice-list fetch; R2/persistent cache; speed/pitch/SSML UI controls; Web Speech fallback.

## Architecture / Approach

Vertical build in four phases: persistence + catalog → preference API + Settings UI → TTS backend → playback wiring. The card button computes `flipped ? {voiceBack,back} : {voiceFront,front}` (one source of truth for text and voice) and POSTs to `/api/tts`, which checks the edge cache before rate-limit and provider call, calls Google Cloud `text:synthesize` with an API key, decodes base64 to bytes, and returns `audio/mpeg`. Voices are threaded as serializable props from the `.astro` pages into the `client:only` islands; all `Audio` logic lives inside the island.

## Phases at a Glance

| Phase                              | What it delivers                                  | Key risk                                             |
| ---------------------------------- | ------------------------------------------------- | --------------------------------------------------- |
| 1. Schema + service + catalog      | Voice columns, service pair, static voice registry | Column-add regressions (low — additive, no GRANT)   |
| 2. Voice API + Settings UI         | `/api/user-voice`, two dropdowns in Settings       | Island hydration / dead buttons                     |
| 3. TTS service + endpoint          | `/api/tts` (cached, rate-limited, audio/mpeg)      | GCP auth/response shape (base64 decode), quota       |
| 4. Playback button + threading     | Speaker button playing the visible side           | `stopPropagation`, audio lifecycle/leaks            |

**Prerequisites:** GCP project with Text-to-Speech API enabled and an API key set as `GOOGLE_TTS_API_KEY` (`.dev.vars` locally; Cloudflare build secret for prod).
**Estimated effort:** ~3-4 sessions across 4 phases.

## Open Risks & Assumptions

- Google Cloud free tier (WaveNet/Neural2 ~1M chars/month) stays free under real usage — mitigated by caching + rate-limit + 300-char cap.
- API-key auth (not service-account OAuth) is acceptable; the key must be API-restricted to Text-to-Speech.
- Cache API is per-edge (not global); adequate for in-session replay — R2 remains a later upgrade if cross-session hit rate matters.

## Success Criteria (Summary)

- A user hears the visible card side in the correct per-side voice in both review and browse, via a button that never flips the card.
- Voice choices persist per account and default sensibly for new accounts.
- Repeated plays are cached; the endpoint refuses over-long text and is rate-limited; `/docs/api` documents it.
