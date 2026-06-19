# Lookup Word Page Implementation Plan

## Overview

Add a dedicated "Lookup Word" page (`/lookup_word?setId=..`) where a user searches Cambridge Dictionary definitions (via the existing `GET /api/dict/{word}` endpoint) and then manually creates a flashcard in the given set. Entry to the page is from the set detail view: the current "New flashcard" button becomes a dropdown with two options — **Manually** (the existing create dialog) and **Lookup Word** (navigate to the new page).

## Current State Analysis

- **Set detail view**: `src/pages/sets/[id]/index.astro` renders `src/components/sets/SetDetailPage.tsx` (React island, `client:load`). The "New flashcard" button (`SetDetailPage.tsx` ~lines 168–178) calls `setCreateOpen(true)`, opening `CreateFlashcardDialog.tsx`. `set.id` is available in component state.
- **Flashcard creation API**: `POST /api/flashcards` with body `{ set_id, front, back }`, validated by `flashcardContentSchema` (front/back: 1–1000 chars) from `src/lib/services/flashcards.ts`. Returns `201` with a `Flashcard`; `400` validation, `401` unauth, `404` set not found.
- **Dictionary API**: `GET /api/dict/{word}` (path param), `prerender = false`, auth-required (in `PROTECTED_API_ROUTES`), rate-limited 30/min. Returns `{ word: string, entries: DictionaryEntry[] }`. `DictionaryEntry = { definition: string; type: string | null; dictionaryRegion: "UK" | "US" | null; info: string | null; examples: string[] }` (`src/types.ts:97-103`). Empty `entries: []` = word not found (not an error). Errors: `400` missing word, `401` unauth, `429` rate limit (`Retry-After: 60`), `502` dictionary unavailable. **No client-side fetch wrapper exists yet.**
- **UI conventions**: `src/layouts/Layout.astro` wraps pages (`bg-cosmic`, NavBar, `SonnerToaster`). Cards use `border-white/10 bg-white/10 backdrop-blur-xl`; pages center content in `max-w-2xl`/`max-w-3xl` with `p-4 pt-8`. shadcn `dropdown-menu.tsx`, `card`, `input`, `button`, `textarea`, `dialog` all exist in `src/components/ui/`. Feedback via `sonner` (`toast.success`/`toast.error`).
- **i18n**: React components use `react-i18next`; namespaces registered in `src/lib/i18n/index.ts` (`ns`, `resources`, JSON imports), `keySeparator: false`, `nsSeparator: false`. Astro `<title>` strings use the separate server-side `getTranslations` from `src/lib/i18n/ui.ts`. Both `en` and `pl` are first-class.
- **Routing/auth**: `src/middleware.ts` — `PROTECTED_PAGE_ROUTES = ["/dashboard", "/sets", "/generate", "/settings"]`. `/lookup_word` is **not** protected yet; `/api/dict` already is.

### Key Discoveries:

- React island boundary = React tree boundary — the i18n provider must live **inside** the `client:load` component, not wrapped around it in `.astro` (`context/foundation/lessons.md`: "React Context i hydratacja..."). Follow the `SettingsPage` pattern: exported component returns `<I18nProvider locale={...}><Inner/></I18nProvider>`.
- Any set/flashcard access must verify ownership, not trust `setId` from the URL (`lessons.md`: "Dostęp do udostępnionych zestawów...").
- This change does **not** alter any API contract, so no OpenAPI/Scalar update is required (unlike the cambridge-dict-cli lesson).

## Desired End State

From the set detail view, the user opens a dropdown on the former "New flashcard" button and picks **Lookup Word**, landing on `/lookup_word?setId=<id>`. The page shows a header stating definitions come from Cambridge Dictionary, a search row, a results section rendering the API response in the app's visual style, and — after the first search completes — a manual Question/Answer form that saves a flashcard into the set via `POST /api/flashcards`. After saving, the user stays on the page with the Q/A fields cleared (results preserved) and sees a success toast, ready to add another card. Verify by: visiting the page for an owned set, searching a real word (entries render), searching a nonsense word (empty-result message, form still appears), and saving a card (toast + cleared fields, card appears in the set afterward).

## What We're NOT Doing

- **No auto-fill / "insert" buttons** from dictionary results into the Q/A fields — the user fills both fields manually (per requirement). Results are read-only reference.
- **No API changes** — `/api/dict` and `/api/flashcards` are used as-is; no new endpoints, no OpenAPI edits.
- **No client-side caching** of dictionary lookups.
- **No change to the existing manual create flow** — the "Manually" dropdown option opens the same `CreateFlashcardDialog` exactly as today.
- **No prefilling of the search field** from the set or word history.
- **No pagination / multiple simultaneous searches** — one word at a time, latest result shown.

## Implementation Approach

Four incremental phases, each independently testable. Phase 1 changes only the set view (dropdown). Phase 2 stands up the new route, server-side ownership validation, and the page shell with the i18n namespace. Phase 3 adds the live dictionary search and result rendering with all empty/error states. Phase 4 adds the manual create form gated on a completed search. Strings are added to the new `lookup` i18n namespace in the phase that introduces them; the namespace itself is registered in Phase 2.

## Critical Implementation Details

- **Form-visibility gate (Phase 3→4)**: the Q/A form appears once a search has *completed* (success — including empty `entries` — counts as completed; a network/HTTP error does not). Track this with a state flag set after a resolved fetch, not merely "input is non-empty". A 429/502/network error must leave the form hidden.
- **i18n registration**: adding the `lookup` namespace requires editing `src/lib/i18n/index.ts` in three places — the JSON imports, the `resources.{en,pl}` maps, and the `ns` array. Because `nsSeparator: false`, access strings via `useTranslation("lookup")` and a flat key (no `"lookup:key"` syntax).
- **Auth ordering**: `/lookup_word` must be added to `PROTECTED_PAGE_ROUTES` so unauthenticated users are redirected to `/auth/signin` before the page renders (matches `/dashboard` behaviour). `isProtected` matches on `pathname` (no query string), so the literal `/lookup_word` entry is correct.

## Phase 1: Dropdown on the set detail view

### Overview

Replace the single "New flashcard" button in `SetDetailPage.tsx` with a shadcn `DropdownMenu` offering **Manually** (existing dialog) and **Lookup Word** (navigate to the lookup page). No behavioural change to the manual path.

### Changes Required:

#### 1. New-flashcard control

**File**: `src/components/sets/SetDetailPage.tsx`

**Intent**: Turn the existing button into a dropdown trigger. "Manually" preserves the current `setCreateOpen(true)` behaviour; "Lookup Word" navigates to `/lookup_word?setId=<set.id>`. Keep the existing button styling/responsive label (`Add` / `New flashcard`) on the trigger.

**Contract**: Use `DropdownMenu`, `DropdownMenuTrigger` (wrapping the existing `Button`), `DropdownMenuContent`, `DropdownMenuItem` from `@/components/ui/dropdown-menu`. Navigation via `window.location.assign(`/lookup_word?setId=${set.id}`)` (full navigation to an Astro-rendered page, not client routing). Guard on `set?.id` being present. Item labels use the `lookup` i18n namespace keys added in Phase 2 (`newCard.manually`, `newCard.lookupWord`) — until then, plain English placeholders are acceptable but prefer wiring the namespace in Phase 2 and importing here.

### Success Criteria:

#### Automated Verification:

- Type checking / build passes: `npm run build`
- Lint passes on changed file: `npx eslint src/components/sets/SetDetailPage.tsx`

#### Manual Verification:

- Clicking the new-flashcard control opens a dropdown with two items.
- "Manually" opens the existing create dialog and creating a card still works.
- "Lookup Word" navigates to `/lookup_word?setId=<current set id>`.
- Trigger keeps its current look and responsive label on mobile/desktop.

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 2.

---

## Phase 2: Lookup page route, server-side validation, and shell

### Overview

Create the `/lookup_word` route. The `.astro` page reads `setId` from the query, verifies the set exists and belongs to the user (server-side), fetches the set name, and renders the `LookupWordPage` React island with header + Cambridge-Dictionary intro. Register the `lookup` i18n namespace and add the page `<title>` string.

### Changes Required:

#### 1. Protect the route

**File**: `src/middleware.ts`

**Intent**: Require auth on `/lookup_word` like other app pages.

**Contract**: Add `"/lookup_word"` to `PROTECTED_PAGE_ROUTES` (line 7).

#### 2. Page route

**File**: `src/pages/lookup_word.astro` (new)

**Intent**: Server-render the page. Read `setId` from `Astro.url.searchParams`; if missing, or the set is not found / not owned by `Astro.locals.user`, redirect to `/dashboard`. On success, pass `setId`, the set `name`, and `locale` to the React island.

**Contract**: `prerender` defaults to server (page route, no need to set false explicitly — pages are SSR by `output: "server"`). Use `Astro.locals.{user, supabase, locale}`. Reuse an existing ownership-checking helper from `src/lib/services/sets.ts` if one exists (e.g. a `getSet`/`getSetWithFlashcards` by id+user); otherwise a scoped `supabase.from("sets").select("id,name").eq("id", setId).eq("user_id", user.id).single()`. Mount `<LookupWordPage setId={setId} setName={name} locale={locale} client:load />`. Page `<title>` via `getTranslations(locale)` key `lookup.title`.

#### 3. i18n namespace registration

**File**: `src/lib/i18n/index.ts`

**Intent**: Register a new `lookup` namespace for both locales.

**Contract**: Add imports `enLookup`/`plLookup`, add `lookup` to `resources.en`/`resources.pl`, and append `"lookup"` to the `ns` array.

#### 4. Lookup namespace strings (React)

**Files**: `src/lib/i18n/locales/en/lookup.json`, `src/lib/i18n/locales/pl/lookup.json` (new)

**Intent**: Hold all in-component strings introduced across phases. Phase 2 seeds the header/intro keys; Phases 3–4 add search/result/error/form keys.

**Contract**: Flat key/value JSON (no nesting needed given the existing pattern). Phase 2 keys: `lookup.heading`, `lookup.intro` (mentions Cambridge Dictionary), `lookup.addingTo` (e.g. `Adding to: {{name}}`).

#### 5. Page `<title>` string (server)

**File**: `src/lib/i18n/ui.ts`

**Intent**: Provide the server-rendered `<title>` for the page.

**Contract**: Add a `lookup.title` key to both `en` and `pl` maps in `ui.ts`.

#### 6. Page component shell

**File**: `src/components/lookup/LookupWordPage.tsx` (new)

**Intent**: The React island. Phase 2 renders only the page chrome: container in app style, heading, Cambridge intro, and "Adding to: <set name>". Wraps itself in the i18n provider per the island pattern.

**Contract**: Props `{ setId: string; setName: string; locale: SupportedLocale }`. Exported component returns `<I18nProvider locale={locale}><LookupWordPageInner .../></I18nProvider>` (mirror `SettingsPage`). Use `bg-cosmic` page wrapper, `max-w-2xl` centered, `Card` for sections. `useTranslation("lookup")`.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes on changed `.ts`/`.tsx`: `npx eslint src/middleware.ts src/lib/i18n/index.ts src/components/lookup/LookupWordPage.tsx`

#### Manual Verification:

- Visiting `/lookup_word?setId=<owned set>` shows the header, Cambridge intro, and the set name.
- Visiting with a missing `setId` or a set not owned by the user redirects to `/dashboard`.
- Visiting while logged out redirects to `/auth/signin`.
- UI matches the rest of the app (dark theme, card styling).
- Switching locale (en/pl) translates the header/intro.

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 3.

---

## Phase 3: Dictionary search and results rendering

### Overview

Add the search row and results section. A client fetch wrapper calls `GET /api/dict/{word}`; results render in app style. Handle empty results (message + unlock the form for Phase 4) and errors (429/502/network) inline plus a toast, leaving the form hidden.

### Changes Required:

#### 1. Client dictionary fetch wrapper

**File**: `src/lib/dict-client.ts` (new)

**Intent**: Single typed helper to call the dictionary endpoint and normalize outcomes (success-with-entries, success-empty, error-by-status) so the component logic stays clean.

**Contract**: Export e.g. `lookupWordClient(word: string): Promise<{ word: string; entries: DictionaryEntry[] }>`. `fetch(`/api/dict/${encodeURIComponent(word)}`, { credentials: "include" })`. On non-ok, throw a typed error carrying the HTTP status (so the component can map 429/502/other to messages). Import `DictionaryEntry` from `@/types`.

#### 2. Search + results UI

**File**: `src/components/lookup/LookupWordPage.tsx`

**Intent**: Add a search row (text `Input` + search `Button`) and a results section below it. Submitting triggers the fetch with loading state. Render each `DictionaryEntry` (definition, type, region badge, info, examples list) in a card-consistent layout. Empty `entries` shows a "no results" message. Errors show an inline message keyed by status and a `toast.error`. Mark "search completed" (success path only) to gate the Phase 4 form.

**Contract**: Local state for `query`, `loading`, `result` (`{ word, entries }` | null), `error` (string | null), and `searchCompleted` (boolean — true only after a resolved fetch, false on thrown error). Search on button click and Enter. Disable the button while `loading` and when `query` is blank. Empty-state and per-status error strings come from the `lookup` namespace. Region rendered as a small badge/label (`UK`/`US`) when non-null.

#### 3. Search/result/error strings

**Files**: `src/lib/i18n/locales/en/lookup.json`, `src/lib/i18n/locales/pl/lookup.json`

**Intent**: Strings for the search row, loading, empty state, and error variants.

**Contract**: Add keys e.g. `lookup.searchPlaceholder`, `lookup.searchButton`, `lookup.searching`, `lookup.noResults` (`No definitions found for "{{word}}"`), `lookup.error.rateLimit`, `lookup.error.unavailable`, `lookup.error.generic`. Add to both `en` and `pl`.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npx eslint src/lib/dict-client.ts src/components/lookup/LookupWordPage.tsx`

#### Manual Verification:

- Searching a real word (e.g. "run") renders one or more entries with definition/type/region/examples in app style.
- Searching a nonsense word shows the "no results" message (and the Phase 4 form appears once it exists).
- Triggering a network/HTTP error shows an inline message + toast and does NOT show the form.
- Search button is disabled on empty input and during loading; Enter triggers search.

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 4.

---

## Phase 4: Manual flashcard create form

### Overview

Add the Question/Answer form that appears after the first completed search. Fields are filled manually. "Zapisz"/Save POSTs to `/api/flashcards`; on success the user stays on the page, Q/A fields clear, results remain, and a success toast shows.

### Changes Required:

#### 1. Create form UI + submit

**File**: `src/components/lookup/LookupWordPage.tsx`

**Intent**: Render a Q/A form below the results, gated on `searchCompleted`. Validate front/back, POST to create the flashcard, then clear the two fields and toast success. Keep the search result visible so the user can add another card.

**Contract**: Two `Textarea` fields (Question→`front`, Answer→`back`) + Save `Button`. Reuse `flashcardContentSchema` from `@/lib/services/flashcards` for client validation (front/back 1–1000). `POST /api/flashcards` with `{ set_id: setId, front, back }`, `credentials: "include"`. On `201`: clear both fields, `toast.success`. On error: inline message + `toast.error`. Disable Save while pending. Field labels/messages from the `lookup` namespace.

#### 2. Form strings

**Files**: `src/lib/i18n/locales/en/lookup.json`, `src/lib/i18n/locales/pl/lookup.json`

**Intent**: Strings for the form section.

**Contract**: Add keys e.g. `lookup.form.heading`, `lookup.form.question`, `lookup.form.answer`, `lookup.form.save`, `lookup.form.saving`, `lookup.form.saved`, `lookup.form.error`, plus validation messages if not reusing schema messages. Both locales.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npx eslint src/components/lookup/LookupWordPage.tsx`

#### Manual Verification:

- The Q/A form is hidden before the first search and appears after a completed search (including empty results).
- Filling Q/A and saving creates the flashcard: success toast, both fields clear, results stay visible.
- The created card appears in the set when navigating back to `/sets/<id>`.
- Empty/over-1000-char fields are rejected with a clear message; a server error shows an inline message + toast.
- Saving twice in a row (two different cards) works without reload.

**Implementation Note**: After automated verification passes, pause for manual confirmation. This is the final phase.

---

## Testing Strategy

### Unit Tests:

- No new unit-test infrastructure is assumed; verification is via `npm run build` (type + Astro check) and manual testing, consistent with prior changes in this repo.

### Manual Testing Steps:

1. From a set detail page, open the new-flashcard dropdown → confirm two options; "Manually" still works.
2. Click "Lookup Word" → lands on `/lookup_word?setId=<id>` showing header, Cambridge intro, set name.
3. Search a real word → entries render; search a nonsense word → "no results" + form appears.
4. Force an error (e.g. spam to hit 429, or offline) → inline message + toast, form stays hidden.
5. Fill Q/A, Save → toast, fields clear, results remain; repeat for a second card.
6. Return to the set → both new cards present.
7. Log out and hit `/lookup_word?setId=<id>` → redirected to sign-in. Hit it with a foreign/missing `setId` → redirected to dashboard.
8. Toggle locale en/pl → all page strings translate.

## Performance Considerations

Dictionary lookups scrape live (no cache) and are rate-limited to 30/min per user server-side; the UI should disable the search button during an in-flight request to avoid burning the budget. No other performance concerns.

## Migration Notes

None — no schema or data changes.

## References

- Change identity: `context/changes/lookup-word-page/change.md`
- Dictionary API: `src/pages/api/dict/[word].ts`, type `src/types.ts:97-103`
- Create API: `src/pages/api/flashcards/index.ts`, schema `src/lib/services/flashcards.ts`
- Set view: `src/components/sets/SetDetailPage.tsx`, `src/pages/sets/[id]/index.astro`
- Island/i18n pattern: `src/components/settings/SettingsPage.tsx`, `src/lib/i18n/index.ts`, `src/lib/i18n/ui.ts`
- Lessons: `context/foundation/lessons.md` (island+context, ownership checks, ESLint-on-.astro crash → lint .ts/.tsx selectively)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Dropdown on the set detail view

#### Automated

- [x] 1.1 Build passes: `npm run build`
- [x] 1.2 Lint passes on changed file: `npx eslint src/components/sets/SetDetailPage.tsx`

#### Manual

- [x] 1.3 New-flashcard control opens a dropdown with two items
- [x] 1.4 "Manually" opens the existing create dialog and creating a card still works
- [x] 1.5 "Lookup Word" navigates to `/lookup_word?setId=<current set id>`
- [x] 1.6 Trigger keeps its look and responsive label on mobile/desktop

### Phase 2: Lookup page route, server-side validation, and shell

#### Automated

- [ ] 2.1 Build passes: `npm run build`
- [ ] 2.2 Lint passes on changed `.ts`/`.tsx`

#### Manual

- [ ] 2.3 `/lookup_word?setId=<owned set>` shows header, Cambridge intro, and set name
- [ ] 2.4 Missing `setId` or non-owned set redirects to `/dashboard`
- [ ] 2.5 Logged-out visit redirects to `/auth/signin`
- [ ] 2.6 UI matches the rest of the app (dark theme, card styling)
- [ ] 2.7 Locale en/pl translates the header/intro

### Phase 3: Dictionary search and results rendering

#### Automated

- [ ] 3.1 Build passes: `npm run build`
- [ ] 3.2 Lint passes on changed files

#### Manual

- [ ] 3.3 Searching a real word renders entries (definition/type/region/examples) in app style
- [ ] 3.4 Searching a nonsense word shows the "no results" message
- [ ] 3.5 Network/HTTP error shows inline message + toast and does NOT show the form
- [ ] 3.6 Search button disabled on empty input and during loading; Enter triggers search

### Phase 4: Manual flashcard create form

#### Automated

- [ ] 4.1 Build passes: `npm run build`
- [ ] 4.2 Lint passes on changed file

#### Manual

- [ ] 4.3 Q/A form hidden before first search, appears after a completed search (incl. empty results)
- [ ] 4.4 Saving creates the flashcard: success toast, fields clear, results stay visible
- [ ] 4.5 Created card appears in the set when navigating back to `/sets/<id>`
- [ ] 4.6 Empty/over-1000-char fields rejected; server error shows inline message + toast
- [ ] 4.7 Saving two different cards in a row works without reload
