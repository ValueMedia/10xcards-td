# Lookup Word Page — Plan Brief

> Full plan: `context/changes/lookup-word-page/plan.md`

## What & Why

Add a "Lookup Word" page (`/lookup_word?setId=..`) so users can look up Cambridge Dictionary definitions while building a set, then manually create a flashcard from what they read. The set view's "New flashcard" button becomes a dropdown with **Manually** (today's dialog) and **Lookup Word** (the new page).

## Starting Point

The set detail view (`SetDetailPage.tsx`) already has a "New flashcard" button that opens `CreateFlashcardDialog`. The dictionary endpoint `GET /api/dict/{word}` and the create endpoint `POST /api/flashcards` both already exist and are auth-protected. No client-side wrapper for the dictionary endpoint exists yet.

## Desired End State

From a set, the user picks "Lookup Word", lands on a page that explains it searches Cambridge Dictionary, searches a word, sees the definitions rendered in app style, and then fills a Question/Answer form (shown only after the first search) to save a card into the set. After saving, they stay on the page with the Q/A fields cleared and results preserved, ready to add another.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| After save | Stay on page, clear Q/A, keep results | Lets the user add multiple cards from one lookup quickly. |
| `setId` validation | Server-side in `.astro` + show set name | Matches the ownership-check rule in lessons; bad/foreign id redirects before render. |
| Q/A filling | Fully manual, no auto-fill | Exactly the requirement — results are read-only reference. |
| Empty dictionary result | "No results" message, form still appears | User can still author a card for a word Cambridge doesn't have. |
| Search errors (429/502/network) | Inline message + toast, form stays hidden | Clear, status-specific feedback consistent with sonner. |
| i18n | New `lookup` namespace, en + pl | Follows the project's bilingual convention. |

## Scope

**In scope:** dropdown on the set view; new `/lookup_word` route with server-side ownership check; React page (header/intro, search, results, gated Q/A form); client fetch wrapper for `/api/dict`; `lookup` i18n namespace (en/pl).

**Out of scope:** any API changes / OpenAPI edits; auto-fill from results into Q/A; dictionary caching; changes to the existing manual create dialog; search prefill; pagination.

## Architecture / Approach

Astro SSR page validates `setId` ownership and mounts a single `client:load` React island (`LookupWordPage`) that wraps its own i18n provider (island-boundary rule). The island holds search state, calls `/api/dict/{word}` via a thin typed client, renders `DictionaryEntry[]`, and — once a search completes — shows a manual Q/A form that POSTs to `/api/flashcards`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Dropdown | "New flashcard" → dropdown (Manually / Lookup Word) | Not regressing the existing manual dialog |
| 2. Page shell | Route + server ownership validation + i18n namespace + header | Getting `PROTECTED_PAGE_ROUTES` and the island/i18n wiring right |
| 3. Search + results | Dict fetch client, results rendering, empty/error states | Correctly gating "search completed" vs error for the form |
| 4. Create form | Gated Q/A form → POST, stay + clear | Validation parity with the API (1–1000 chars) |

**Prerequisites:** running app with auth + at least one owned set; existing `/api/dict` and `/api/flashcards` working.
**Estimated effort:** ~1–2 sessions across 4 small phases.

## Open Risks & Assumptions

- Assumes a reusable ownership-aware set fetch exists in `src/lib/services/sets.ts`; if not, a scoped Supabase query is used instead.
- `npm run lint` is known to crash on `.astro` files (lessons) — lint `.ts`/`.tsx` selectively; rely on `npm run build` for Astro/type checks.

## Success Criteria (Summary)

- Dropdown works; "Manually" unchanged, "Lookup Word" navigates to the page.
- Searching renders Cambridge results in app style; empty/error states behave as specified.
- Manual Q/A form (shown after a search) saves a card; user stays on page with fields cleared and the card present in the set afterward.
