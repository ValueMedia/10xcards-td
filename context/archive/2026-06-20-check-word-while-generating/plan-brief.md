# Check Word While Generating — Plan Brief

> Full plan: `context/changes/check-word-while-generating/plan.md`

## What & Why

Add a **Check / Sprawdź** button next to **Generate** on `/generate`. It opens a popup to paste a word/phrase, then hands that word to `/lookup_word` (Cambridge dictionary lookup) with the search pre-filled and auto-run — so users can quickly verify a word's meaning mid-generation without losing their in-progress work.

## Starting Point

`/generate` (`GenerateFlashcardsPage`) is an English-only `client:load` island with a Generate button and a source-text area; it does not use i18n. `/lookup_word` (`LookupWordPage`) is a separate, i18n-aware page with a search field and a "Back to set" link. Navigation between them is a full page reload, so React state does not survive the hop.

## Desired End State

Clicking Check → popup → confirm lands the user on `/lookup_word` with the field filled, results already loading, and the word never visible in the URL. A **Back / Wróć** button returns them to `/generate` with their source text and generated proposals restored intact. The whole `/generate` page renders in both Polish and English.

## Key Decisions Made

| Decision                          | Choice                                              | Why (1 sentence)                                                                 | Source |
| --------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------- | ------ |
| Word handoff mechanism            | `sessionStorage`, same tab (no URL `?word=`)        | Word never lingers in the URL; same-tab `sessionStorage` is fully reliable.      | Plan   |
| Navigation target                 | Same tab + save/restore `/generate` state           | Solves lost-proposals concern without new-tab `sessionStorage` fragility.        | Plan   |
| On arrival at `/lookup_word`      | Fill field **and** auto-run the search              | User clicked Check to see a result — one fewer click.                            | Plan   |
| i18n scope on `/generate`         | Fully internationalize the page (new `generate` ns) | Closes the last untranslated view; new button works in PL/EN.                    | Plan   |
| Popup input validation            | Trim + non-empty + ≤100 chars                       | Blocks empty/absurdly long dictionary queries.                                   | Plan   |
| Return path                       | "Back" button on `/lookup_word` → restore + clear   | Lets the user resume generation; snapshot cleared to avoid stale restores.       | Plan   |

## Scope

**In scope:**
- Check button + Dialog popup on `/generate` with validation
- `sessionStorage` handoff (word) + state snapshot (text + proposals)
- `/lookup_word` prefill + auto-search + "Back to generate" button
- Full i18n of `GenerateFlashcardsPage`

**Out of scope:**
- New-tab opening; URL query param for the word
- Generic unsaved-changes guard for other exits from `/generate`
- Any API / data model / migration change; persistence beyond `sessionStorage`

## Architecture / Approach

A small shared helper (`src/lib/handoff.ts`) owns the `sessionStorage` keys and safe read/write/clear. `/generate` writes the word + a `{ text, proposals }` snapshot on confirm, then `window.location.href` to `/lookup_word?setId=…`. `/lookup_word` consumes the word in a post-mount `useEffect` (fills field, auto-searches, removes key) and shows a Back button that returns to `/generate`, where a post-mount effect restores and clears the snapshot. All `sessionStorage` reads happen in `useEffect` (not `useState` initializers) to avoid React-19 hydration mismatches under `client:load`.

## Phases at a Glance

| Phase                                   | What it delivers                                          | Key risk                                                  |
| --------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------- |
| 1. Internationalize `/generate`         | `generate` i18n namespace + locale-aware page             | Missing a hardcoded string; provider-inside-island wiring |
| 2. Check button + `/generate` handoff   | Popup, validation, write+navigate, restore-on-mount       | Hydration mismatch if snapshot read in initializer        |
| 3. `/lookup_word` consume + Back        | Prefill + auto-search + Back-to-generate button           | Stale snapshot restore; `runSearch` state-timing race     |

**Prerequisites:** Logged-in user with an owned set (both pages require `setId`); local Supabase running for manual verification.
**Estimated effort:** ~1 session across 3 phases.

## Open Risks & Assumptions

- A snapshot abandoned on `/lookup_word` (user leaves via "Back to set" or closes tab) is mitigated by clearing on the "Back to set" click + consume-on-restore; the tab-close/browser-back edge is accepted.
- Auto-search consumes one dictionary lookup (rate-limited) even if the user wanted to edit the phrase first — accepted per the chosen UX.
- `npm run lint` may crash on `.astro` files (known issue); lint changed `.ts`/`.tsx` selectively.

## Success Criteria (Summary)

- Check → popup → confirm lands on `/lookup_word` with field filled, results loading, no `word` in the URL.
- Back returns to `/generate` with source text + proposals restored.
- `/generate` renders fully in both PL and EN with no regression to the generate/save flow.
