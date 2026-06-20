# Check Word While Generating — Implementation Plan

## Overview

Add a **Check / Sprawdź** button next to **Generate** on the `/generate` view. Clicking it opens a popup (shadcn Dialog) with a single input where the user pastes a word or phrase. On confirm, the app — staying in the **same browser tab** — saves the current `/generate` state (source text + generated proposals) and the looked-up word to `sessionStorage`, closes the popup, and navigates to `/lookup_word?setId=<setId>`. On arrival, `/lookup_word` fills its search field with the word, auto-runs the search, and removes the prefill key from `sessionStorage`. A **Back / Wróć** button appears on `/lookup_word` (only when a saved `/generate` snapshot exists) that navigates back to `/generate?setId=<setId>`; on return, `/generate` restores its saved state and clears the snapshot.

This change also fully internationalizes `GenerateFlashcardsPage` (currently English-only, no `I18nProvider`) so the new button — and the rest of the page — works in PL/EN, consistent with the rest of the app.

## Current State Analysis

- **`src/pages/generate.astro`** (`generate.astro:1-31`) — server-renders `GenerateFlashcardsPage` with `client:load`. Requires `setId` in the URL (server guard redirects to `/dashboard` otherwise). Does **not** read or pass `Astro.locals.locale`.
- **`src/components/ai/GenerateFlashcardsPage.tsx`** — the island. All UI strings are **hardcoded English** ("Generate with AI", "Generate", "Source text", "Discard all", error messages, etc.). No `I18nProvider`, no `useTranslation`. The **Generate** button sits in a flex row with the character counter (`GenerateFlashcardsPage.tsx:197-220`). State of interest for the snapshot: `text` (string) and `proposals` (`FlashcardProposal[]`, JSON-serializable).
- **`src/pages/lookup_word.astro`** (`lookup_word.astro:1-35`) — server-renders `LookupWordPage` with `client:load`, reads `Astro.locals.locale`, requires `setId`. Same `setId` ownership guard.
- **`src/components/lookup/LookupWordPage.tsx`** — uses i18n (`lookup` namespace, `I18nProvider`). Has `query` state (`LookupWordPage.tsx:31`), `runSearch()` (`:54-82`) reading `query` from closure, and an existing "Back to set" link to `/sets/${setId}` (`:92-98`). The `CreateCardForm` unlocks after a completed search.
- **i18n** (`src/lib/i18n/index.ts`) — flat dotted keys, `keySeparator: false`, `nsSeparator: false`. Namespaces are declared in both the `resources` object and the `ns` array. Locale JSON lives in `src/lib/i18n/locales/{en,pl}/<ns>.json`.
- **`src/components/I18nProvider.tsx`** — clones a per-island i18n instance for the given `locale`. Pattern: the exported component returns `<I18nProvider locale={...}><Inner/></I18nProvider>` and `.astro` hydrates it directly (per `lessons.md` — provider must live **inside** the `client:*` island, not above it in `.astro`).
- **`src/components/ui/dialog.tsx`** — shadcn Dialog available: `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`, `DialogTrigger`, `DialogClose`.

## Desired End State

On `/generate`, a **Sprawdź / Check** button sits next to **Generate**. Clicking it opens a popup; the user pastes a word/phrase and confirms. The tab navigates to `/lookup_word` with the search field pre-filled and the search already running; the word never lingers in the URL (it travels via `sessionStorage`, not a query param). `/lookup_word` shows a **Wróć / Back** button; clicking it returns to `/generate` with the previously typed source text and any generated proposals restored intact. The entire `/generate` page renders correctly in both Polish and English.

Verify by: clicking Check with a word → lands on `/lookup_word`, field filled, results shown, URL is just `?setId=...`; clicking Back → `/generate` shows the prior text + proposals; switching locale (PL/EN) flips all `/generate` strings.

### Key Discoveries:

- Navigation between the two pages is a **full page reload** (`window.location.href`), so React state does not survive — handoff must go through `sessionStorage` (same tab → fully reliable).
- `lessons.md`: reading `sessionStorage` in a `useState` initializer under `client:load` causes a hydration mismatch React 19 will not patch. **Restore/prefill must happen in `useEffect` after mount** (field starts empty/default, fills post-mount; one-frame flicker accepted), and every `sessionStorage` access must be wrapped in `try/catch`.
- `lessons.md`: the i18n provider must be mounted **inside** the hydrated island (mirror `LookupWordPage`'s `I18nProvider` wrapper), and `locale` must cross the island boundary as a serializable prop — never via React context.
- No API contract changes → no OpenAPI/Scalar update needed.

## What We're NOT Doing

- Not opening `/lookup_word` in a new tab (reconsidered: same-tab + state save/restore solves the lost-proposals concern more reliably than a new tab, where `sessionStorage` copying is browser/`noopener`-dependent).
- Not using a URL query parameter for the word (no `?word=` to "swallow").
- Not adding a generic "unsaved changes" guard to every other way of leaving `/generate` — only the Check → Back round-trip preserves state.
- Not changing the dictionary lookup API, the generate/save APIs, or any data model / migration.
- Not adding persistence beyond `sessionStorage` (no localStorage, no server-side draft).

## Implementation Approach

Three phases, each independently verifiable:

1. Internationalize `GenerateFlashcardsPage` first, so the new Check button (and the whole page) has working PL/EN strings to build on.
2. Build the `/generate` side: a shared `sessionStorage` handoff helper, the Check button + Dialog + validation, the write-on-confirm + navigate, and the restore-on-mount + clear.
3. Build the `/lookup_word` side: consume the prefill word (fill + auto-search + clear key), and add the Back-to-generate button.

A small shared helper module centralizes the `sessionStorage` keys and read/write/clear logic so the two pages cannot drift apart.

## Critical Implementation Details

- **Restore/prefill timing**: both the `/generate` snapshot restore and the `/lookup_word` prefill run in `useEffect` (post-mount), never in `useState` initializers — see Key Discoveries. Keep both islands on `client:load`; do not switch to `client:only` (we want SSR for `setName`/locale). Wrap all `sessionStorage` calls in `try/catch`.
- **Snapshot lifecycle (avoid stale restore)**: the `/generate` snapshot is keyed by `setId`. `/generate` restores it on mount and **immediately removes it**. To prevent a snapshot abandoned on `/lookup_word` (e.g. user clicks "Back to set") from later restoring stale proposals, also clear the snapshot in the `onClick` of `/lookup_word`'s existing "Back to set" link. The remaining edge (tab closed / browser-back) is acceptable.
- **Auto-search wiring**: `runSearch` currently reads `query` from its closure; calling it right after `setQuery(prefill)` would race the state update. Refactor `runSearch` to accept an optional explicit word — `runSearch(wordArg?)` using `const word = (wordArg ?? query).trim()` — and the mount effect calls `setQuery(prefill); void runSearch(prefill);`.

## Phase 1: Internationalize `/generate`

### Overview

Make `GenerateFlashcardsPage` locale-aware (PL/EN) by introducing a `generate` i18n namespace, wiring `locale` through the page, and replacing all hardcoded strings.

### Changes Required:

#### 1. New locale namespace files

**File**: `src/lib/i18n/locales/en/generate.json` (new), `src/lib/i18n/locales/pl/generate.json` (new)

**Intent**: Hold every user-visible string in `GenerateFlashcardsPage`, including the new Check-button/popup strings added in Phase 2 (define them here now so Phase 2 only consumes keys). Interpolation for dynamic bits (`setName`, counts, character totals).

**Contract**: Flat dotted keys (e.g. `generate.heading`, `generate.sourceLabel`, `generate.generateButton`, `generate.generating`, `generate.backToSet` with `{{name}}`, `generate.charCount` with `{{count}}`/`{{max}}`, `generate.tooShort`, `generate.proposalsHeading` with count plural handling, `generate.discardAll`, `generate.saveButton`, `generate.saving`, error keys mirroring `FRIENDLY_ERROR_MESSAGES` + toasts). Same key set in both `en` and `pl`. Match the existing `lookup.json` style (no `nsSeparator`, plain `{{var}}`).

#### 2. Register the namespace

**File**: `src/lib/i18n/index.ts`

**Intent**: Import the two new JSON files and register `generate` in both `resources.{en,pl}` and the `ns` array.

**Contract**: Add `generate: enGenerate` / `generate: plGenerate` to `resources`, and `"generate"` to the `ns: [...]` list.

#### 3. Pass locale into the page

**File**: `src/pages/generate.astro`

**Intent**: Read `Astro.locals.locale` and pass it to the island so the provider can localize.

**Contract**: Destructure `locale` from `Astro.locals`; pass `locale={locale as SupportedLocale}` to `<GenerateFlashcardsPage ... client:load />`. Import `SupportedLocale` type. Mirror `lookup_word.astro:10,34`.

#### 4. Localize the island

**File**: `src/components/ai/GenerateFlashcardsPage.tsx`

**Intent**: Add a `locale` prop, wrap the component body in `I18nProvider` (split into exported wrapper + inner, mirroring `LookupWordPage`), use `useTranslation("generate")`, and replace every hardcoded string (headings, labels, buttons, char counter, error messages, toasts, `FRIENDLY_ERROR_MESSAGES`) with `t(...)` calls.

**Contract**: `Props` gains `locale: SupportedLocale`. Exported `GenerateFlashcardsPage` returns `<I18nProvider locale={props.locale}><GenerateFlashcardsPageInner {...props} /></I18nProvider>`. `friendlyErrorMessage` becomes locale-aware (resolve via `t` keyed by `kind`). No behavior change beyond text.

### Success Criteria:

#### Automated Verification:

- Type check / build passes: `npm run build`
- Lint passes on changed TS/TSX: `npx eslint src/components/ai/GenerateFlashcardsPage.tsx src/lib/i18n/index.ts` (per `lessons.md`, `npm run lint` may crash on `.astro` — lint changed `.ts`/`.tsx` selectively)

#### Manual Verification:

- `/generate` renders correctly with `locale=en` (all strings English, unchanged from today)
- `/generate` renders correctly with `locale=pl` (all strings Polish)
- Generate flow still works end-to-end (generate → proposals → save) with no regressions

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 2: Check button, popup & `/generate`-side handoff

### Overview

Add the Check button + popup on `/generate`, the shared `sessionStorage` handoff helper, the write-and-navigate on confirm, and the restore-on-mount of the saved page state.

### Changes Required:

#### 1. Shared handoff helper

**File**: `src/lib/handoff.ts` (new)

**Intent**: Centralize the `sessionStorage` keys and safe read/write/clear so `/generate` and `/lookup_word` share one contract and cannot drift. All access wrapped in `try/catch`.

**Contract**: Export key constants and typed helpers, e.g. `saveLookupPrefill(word: string)`, `consumeLookupPrefill(): string | null` (read + remove), `saveGenerateSnapshot(setId, { text, proposals })`, `consumeGenerateSnapshot(setId): { text, proposals } | null` (read + remove), `clearGenerateSnapshot(setId)`, `hasGenerateSnapshot(setId): boolean`. Snapshot type imports `FlashcardProposal`. Keys namespaced (e.g. `cwg:lookup-prefill`, `cwg:generate-snapshot:<setId>`). Every function no-ops/returns null on `sessionStorage` throw.

#### 2. Check button + popup

**File**: `src/components/ai/GenerateFlashcardsPage.tsx`

**Intent**: Add a **Sprawdź / Check** button next to **Generate** that opens a Dialog containing a single input for the word/phrase and a confirm button. The button is always enabled (independent of the source-text constraints). On confirm: validate, save the prefill word + the current page snapshot, close the popup, navigate same-tab to `/lookup_word?setId=<setId>`.

**Contract**: New local state for dialog open + input value. Validation: `value.trim()`, block confirm when empty, cap length at 100 chars (`maxLength={100}`); Enter submits. On confirm → `saveGenerateSnapshot(setId, { text, proposals }); saveLookupPrefill(trimmed); window.location.href = \`/lookup_word?setId=${setId}\`;`. Uses Dialog primitives from `@/components/ui/dialog`. All strings via `t("generate.check...")` keys (added in Phase 1).

#### 3. Restore on mount

**File**: `src/components/ai/GenerateFlashcardsPage.tsx`

**Intent**: On mount, if a snapshot exists for this `setId`, restore `text` and `proposals` into state, then clear the snapshot.

**Contract**: A `useEffect(() => { const snap = consumeGenerateSnapshot(setId); if (snap) { setText(snap.text); setProposals(snap.proposals); } }, [setId])`. Runs post-mount (no hydration mismatch). `consume*` removes the key so a manual refresh does not re-restore.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes on changed files: `npx eslint src/components/ai/GenerateFlashcardsPage.tsx src/lib/handoff.ts`

#### Manual Verification:

- Check button appears next to Generate and is clickable; popup opens with an input
- Empty/whitespace input blocks confirm; >100 chars is prevented
- Confirm navigates to `/lookup_word?setId=...` (same tab) and the popup is closed
- After navigating away and back to `/generate` (with a snapshot present), the source text and proposals are restored, then a manual refresh shows them cleared

**Implementation Note**: Pause for manual confirmation before proceeding to Phase 3.

---

## Phase 3: `/lookup_word` — consume prefill, auto-search, Back button

### Overview

On arrival, fill the search field from the handoff and auto-run the search; clear the prefill key. Add a **Wróć / Back** button (shown only when a `/generate` snapshot exists) that returns to `/generate`.

### Changes Required:

#### 1. Consume prefill + auto-search

**File**: `src/components/lookup/LookupWordPage.tsx`

**Intent**: On mount, read the prefill word; if present, fill the query and run the search automatically, then remove the prefill key.

**Contract**: Refactor `runSearch` to `runSearch(wordArg?: string)` using `const word = (wordArg ?? query).trim()`. Add `useEffect(() => { const w = consumeLookupPrefill(); if (w) { setQuery(w); void runSearch(w); } }, [])`. Wrapped via helper's `try/catch`. Runs post-mount (no hydration mismatch).

#### 2. Back-to-generate button

**File**: `src/components/lookup/LookupWordPage.tsx`

**Intent**: When a `/generate` snapshot exists for this `setId`, render a "Back to generate / Wróć do generowania" button that navigates same-tab to `/generate?setId=<setId>` (where Phase 2's restore effect picks up the snapshot). Also clear the snapshot in the existing "Back to set" link's `onClick` to avoid stale restores.

**Contract**: Read `hasGenerateSnapshot(setId)` once (post-mount state, since `sessionStorage` is client-only). Render the back-to-generate control near the existing "Back to set" link (`LookupWordPage.tsx:92-98`). Navigation: `window.location.href = \`/generate?setId=${setId}\``. "Back to set" link gains `onClick={() => clearGenerateSnapshot(setId)}`. New i18n keys in `lookup.json` (en/pl): `lookup.backToGenerate`.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes on changed files: `npx eslint src/components/lookup/LookupWordPage.tsx`

#### Manual Verification:

- Arriving from Check fills the search field and shows results without a manual click; URL is `/lookup_word?setId=...` (no `word` param)
- A manual refresh of `/lookup_word` does NOT re-run the prefilled search (key consumed)
- "Back to generate" button appears (only when arriving from Check) and returns to `/generate` with text + proposals restored
- Clicking "Back to set" from a Check-originated lookup does not later restore stale proposals on `/generate`
- Both PL and EN render the new button label correctly

**Implementation Note**: Pause for manual confirmation; this completes the feature.

---

## Testing Strategy

### Manual Testing Steps:

1. On `/generate?setId=<owned set>`, type some source text and click **Generate**; wait for proposals.
2. Click **Check**, paste a word (e.g. "ephemeral"), confirm.
3. Verify: lands on `/lookup_word?setId=...`, field shows "ephemeral", results load automatically, URL has no `word` param, popup is gone.
4. Click **Back to generate**; verify the source text and proposals are exactly as left.
5. Refresh `/generate`; verify proposals are NOT re-restored (snapshot consumed).
6. Repeat 1–2, then on `/lookup_word` click **Back to set**; navigate to `/generate` fresh and confirm no stale restore.
7. Edge cases: empty/whitespace word blocked in popup; >100 chars prevented; switch locale PL↔EN and confirm all `/generate` strings translate.

## References

- Change identity: `context/changes/check-word-while-generating/change.md`
- Generate island: `src/components/ai/GenerateFlashcardsPage.tsx`
- Lookup island: `src/components/lookup/LookupWordPage.tsx`
- i18n provider pattern: `src/components/I18nProvider.tsx`, `src/components/lookup/LookupWordPage.tsx:20-26`
- Dialog primitives: `src/components/ui/dialog.tsx`
- Relevant lessons: `context/foundation/lessons.md` — "React Context i hydratacja…", "Stan z localStorage w wyspie Astro…"

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Internationalize /generate

#### Automated

- [x] 1.1 Build passes: `npm run build` — 3e16fd1
- [x] 1.2 Lint passes on changed TS/TSX — 3e16fd1

#### Manual

- [x] 1.3 `/generate` renders correctly with `locale=en` — 3e16fd1
- [x] 1.4 `/generate` renders correctly with `locale=pl` — 3e16fd1
- [x] 1.5 Generate flow works end-to-end with no regressions — 3e16fd1

### Phase 2: Check button, popup & /generate-side handoff

#### Automated

- [x] 2.1 Build passes: `npm run build` — fe05ff3
- [x] 2.2 Lint passes on changed files — fe05ff3

#### Manual

- [x] 2.3 Check button appears next to Generate; popup opens with an input — fe05ff3
- [x] 2.4 Empty/whitespace blocks confirm; >100 chars prevented — fe05ff3
- [x] 2.5 Confirm navigates to `/lookup_word?setId=...` (same tab), popup closed — fe05ff3
- [x] 2.6 Returning to `/generate` restores text + proposals; refresh clears them — fe05ff3

### Phase 3: /lookup_word — consume prefill, auto-search, Back button

#### Automated

- [x] 3.1 Build passes: `npm run build` — c09d78e
- [x] 3.2 Lint passes on changed files — c09d78e

#### Manual

- [x] 3.3 Arriving from Check fills field + auto-searches; URL has no `word` param — c09d78e
- [x] 3.4 Refresh of `/lookup_word` does not re-run the prefilled search — c09d78e
- [x] 3.5 "Back to generate" returns to `/generate` with state restored — c09d78e
- [x] 3.6 "Back to set" from a Check-originated lookup leaves no stale restore — c09d78e
- [x] 3.7 New button label renders correctly in PL and EN — c09d78e
