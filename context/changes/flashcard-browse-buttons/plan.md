# Flashcard Browse Buttons + Set Detail i18n Implementation Plan

## Overview

Add visible **Next / Previous** labels (localized as **Następny / Poprzedni** in Polish) next to the existing arrow buttons in the flashcard browse view, and bring both the browse view and the set-detail view under the project's i18n system so the whole set→browse path renders in the user's locale.

## Current State Analysis

- **Browse view** — `src/components/sets/FlashcardBrowseView.tsx` is mounted from `src/pages/sets/[id]/browse.astro` with `client:only="react"`. Navigation is two `Button` components with `size="icon"` containing only `ChevronLeftIcon` / `ChevronRightIcon`, with hardcoded `aria-label="Previous card"` / `"Next card"`. All visible strings (`Shuffle`, aria-labels, the bottom hint `← → navigate · Space flip`) are hardcoded English. The view is **not** wired to i18n.
- **Set detail view** — `src/components/sets/SetDetailPage.tsx` (391 lines) is mounted from `src/pages/sets/[id]/index.astro` with `client:only="react"`. It is **not** wired to i18n and has many hardcoded English strings: the `Browse` button, action buttons (`Learn`/`Start learn session`, `Build with AI`/`Generate with AI`, `Share`, `Import`/`Import CSV`, `Add`/`New flashcard`, `Manually`, `Lookup Word`), the `Add flashcards first` disabled title, card/learned counters, `Reverse mode (Back first)`, the error fallback (`Failed to load set`, `The set data is missing or invalid.`, `Back to dashboard`), and four toasts (`Flashcard created/updated/deleted`, `Imported N flashcard(s) · M lines skipped`). The hosting `index.astro` also renders server-side English fallback strings (`Failed to load set. Please try again later.`, `Set not found`, `This set doesn't exist or you don't have access to it.`, `Back to dashboard`).
- **i18n pattern (established)** — React islands wrap their default export in `<I18nProvider locale={props.locale}>` and the inner component calls `useTranslation(ns)`; see `src/components/sets/SetDashboard.tsx:22-28`. `I18nProvider` (`src/components/I18nProvider.tsx`) clones a per-island i18next instance for the target locale. The locale is resolved server-side via `Astro.locals.locale` and passed as a prop; see `src/pages/dashboard.astro:10,41`.
- **Two translation stores** — React strings live in `src/lib/i18n/locales/{en,pl}/*.json` (namespaces: `common`, `auth`, `settings`, `dashboard`, `lookup`; `common` is default). Server-rendered `.astro` strings use the separate `getTranslations(locale)` helper backed by `src/lib/i18n/ui.ts`.

### Key Discoveries:

- i18next is configured with `keySeparator: false` and `nsSeparator: false` (`src/lib/i18n/index.ts`) — keys are flat strings like `"browse.next"` and namespaces are not addressable via `ns:key` syntax; pass the namespace through `useTranslation("common")` instead. `common` is the default namespace so `useTranslation()` is sufficient.
- `client:only="react"` islands have no SSR pass, so the `I18nProvider` + `cloneInstance` pattern works without hydration mismatch — consistent with the reverse-mode lesson (browse view reads `localStorage` and is already `client:only`).
- Pluralization in the existing codebase is done with plain conditionals (`flashcards.length === 1 ? "card" : "cards"`), not i18next plural suffixes. Keep that style to avoid touching i18next plural config.

## Desired End State

On the browse view (`/sets/:id/browse`), each navigation control shows an arrow **and** a text label — `‹ Poprzedni` / `Następny ›` in Polish, `‹ Previous` / `Next ›` in English — and `Shuffle` + aria-labels render in the active locale. On the set-detail view (`/sets/:id`), every visible string renders in the active locale, including server-rendered error fallbacks. Switching the locale cookie flips both views' language with no English left behind on these two routes. The bottom hint `← → navigate · Space flip` is intentionally left unchanged.

Verify by loading each route with `preferred-locale=pl` and `preferred-locale=en` and confirming all targeted strings switch.

## What We're NOT Doing

- Not changing the bottom hint `← → navigate · Space flip` in the browse view.
- Not internationalizing `/dashboard` (`SetDashboard`) — already fully localized.
- Not internationalizing child dialogs (`CreateFlashcardDialog`, `EditFlashcardDialog`, `ImportCsvDialog`, `ShareSetModal`, `FlashcardList`, etc.) — out of scope; only the two named views.
- Not adding i18next plural-suffix configuration; counters keep the existing conditional style.
- Not changing keyboard navigation, shuffle logic, flip behavior, or any data flow.

## Implementation Approach

Follow the established island i18n pattern verbatim: convert each component's default export into a thin wrapper that returns `<I18nProvider locale={locale}><Inner .../></I18nProvider>`, add a `locale: SupportedLocale` prop, move the body into `Inner`, and replace hardcoded strings with `t("...")` calls from `useTranslation("common")`. Add the new flat keys to both `en/common.json` and `pl/common.json`. Wire each hosting `.astro` to read `Astro.locals.locale` and pass it down; for the server-rendered fallback strings in `index.astro`, use `getTranslations(locale)` and add matching entries to `ui.ts`.

## Phase 1: Browse view i18n + Next/Previous labels

### Overview

Wire `FlashcardBrowseView` into i18n, replace the icon-only nav buttons with arrow+text buttons, and localize Shuffle + aria-labels. The bottom hint stays as-is.

### Changes Required:

#### 1. Browse view component

**File**: `src/components/sets/FlashcardBrowseView.tsx`

**Intent**: Bring the view under i18n and give the Previous/Next controls visible localized labels alongside their arrows, so users see `Poprzedni`/`Następny` (PL) or `Previous`/`Next` (EN).

**Contract**:
- Default export becomes a wrapper `({ ...props, locale }) => <I18nProvider locale={locale}><FlashcardBrowseViewInner {...props} /></I18nProvider>`; add `locale: SupportedLocale` to `Props` (import `SupportedLocale` from `@/lib/i18n/constants`, `I18nProvider` from `@/components/I18nProvider`). Inner component calls `const { t } = useTranslation("common")` (mirror `SetDashboard.tsx:22-31`).
- The two nav `Button`s drop `size="icon"`: Previous renders `<ChevronLeftIcon />{t("browse.previous")}`, Next renders `{t("browse.next")}<ChevronRightIcon />` (icon on the direction side, text inline). Keep `variant="ghost"`, the `disabled`/opacity classes, and the `onClick` handlers; adjust padding classes as needed for a text button instead of an icon button.
- `aria-label` values become `t("browse.previous")` / `t("browse.next")`; the `Shuffle` button text becomes `t("browse.shuffle")`.
- Leave the `{position + 1} / {flashcards.length}` counter and the `← → navigate · Space flip` hint unchanged.

#### 2. Browse translation keys

**File**: `src/lib/i18n/locales/en/common.json` and `src/lib/i18n/locales/pl/common.json`

**Intent**: Provide the localized strings for the browse nav.

**Contract**: Add flat keys to both files — EN: `browse.next` = "Next", `browse.previous` = "Previous", `browse.shuffle` = "Shuffle". PL: `browse.next` = "Następny", `browse.previous` = "Poprzedni", `browse.shuffle` = "Tasuj".

#### 3. Browse route wiring

**File**: `src/pages/sets/[id]/browse.astro`

**Intent**: Pass the server-resolved locale into the island.

**Contract**: Read `locale` from `Astro.locals` (alongside `user, supabase`) and add `locale={locale as SupportedLocale}` to the `<FlashcardBrowseView ... />` tag; import `SupportedLocale` type. Mirror `dashboard.astro:10,41`.

### Success Criteria:

#### Automated Verification:

- Build passes (Astro type-check): `npm run build`
- Lint passes on changed TS/TSX: `npx eslint src/components/sets/FlashcardBrowseView.tsx`
- Translation key-parity test passes: `npm run test -- translations` (en/pl `common.json` have matching keys)

#### Manual Verification:

- On `/sets/:id/browse` with `preferred-locale=pl`, the nav buttons read `‹ Poprzedni` and `Następny ›`, and the shuffle button reads `Tasuj`.
- On the same route with `preferred-locale=en`, they read `Previous`/`Next`/`Shuffle`.
- Arrow keys, Space-flip, shuffle, and prev/next disabled states still work; the bottom hint is unchanged.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to Phase 2.

---

## Phase 2: Set detail view i18n

### Overview

Wire `SetDetailPage` into i18n and localize all its strings, then wire `index.astro` to pass locale and localize its server-rendered fallback strings.

### Changes Required:

#### 1. Set detail component

**File**: `src/components/sets/SetDetailPage.tsx`

**Intent**: Bring the whole set-detail UI under i18n so every visible string (including the `Browse` button) renders in the active locale.

**Contract**:
- Default export becomes a wrapper returning `<I18nProvider locale={locale}><SetDetailPageInner {...props} /></I18nProvider>`; add `locale: SupportedLocale` to `Props`. Inner calls `useTranslation("common")`.
- Replace every hardcoded visible string with a `t("set.*")` key: error fallback (`Failed to load set`, `The set data is missing or invalid.`, `Back to dashboard`), counters (`card`/`cards` via conditional, `learned`), buttons (`Browse`, `Learn`/`Start learn session`, `Build with AI`/`Generate with AI`, `Share`, `Import`/`Import CSV`, `Add`/`New flashcard`, `Manually`, `Lookup Word`), the `Add flashcards first` disabled `title`, `Reverse mode (Back first)`, and the four toasts.
- The import toast keeps its conditional shape: `t("set.imported", { count })` plus a `count > 0` skipped suffix via `t("set.linesSkipped", { count: skippedCount })`. Use i18next interpolation (`{{count}}` in the value), not template literals.

#### 2. Set detail translation keys

**File**: `src/lib/i18n/locales/en/common.json` and `src/lib/i18n/locales/pl/common.json`

**Intent**: Provide localized strings for the set-detail UI.

**Contract**: Add a `set.*` block to both files covering every key referenced in change #1, with EN and PL values (e.g. `set.browse` = "Browse"/"Przeglądaj", `set.share` = "Share"/"Udostępnij", `set.reverseMode` = "Reverse mode (Back first)"/"Tryb odwrócony (najpierw tył)", interpolated `set.imported` = "Imported {{count}} flashcards"/"Zaimportowano {{count}} fiszek"). Keep key set identical across en/pl for the parity test.

#### 3. Set detail route wiring

**File**: `src/pages/sets/[id]/index.astro`

**Intent**: Pass locale to the island and localize the server-rendered fallback states.

**Contract**: Read `locale` from `Astro.locals`; pass `locale={locale as SupportedLocale}` to `<SetDetailPage ... />`. Replace the three hardcoded `.astro` fallback strings (`Failed to load set. Please try again later.`, `Set not found`, `This set doesn't exist or you don't have access to it.`) and the `Back to dashboard` link text with `getTranslations(locale)` calls (import from `@/lib/i18n/ui`), mirroring `dashboard.astro`.

#### 4. Server-side fallback keys

**File**: `src/lib/i18n/ui.ts`

**Intent**: Provide the `.astro` fallback strings for both locales.

**Contract**: Add keys to both `en` and `pl` maps in the `ui` object: `set.failedToLoad`, `set.notFound`, `set.notFoundDesc`, `set.backToDashboard` with appropriate EN/PL values. (Note: `ui.ts` is a separate dictionary from the JSON namespaces — keys here only feed `.astro`.)

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes on changed TS/TSX: `npx eslint src/components/sets/SetDetailPage.tsx`
- Translation key-parity test passes: `npm run test -- translations`

#### Manual Verification:

- On `/sets/:id` with `preferred-locale=pl`, all buttons, counters, the reverse-mode label, and toasts render in Polish (e.g. `Browse`→`Przeglądaj`); with `preferred-locale=en` they render in English.
- Creating/editing/deleting/importing a flashcard shows the localized toast.
- The error/not-found fallback routes render localized text.
- No regressions: all buttons still navigate/open dialogs as before.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation from the human.

---

## Testing Strategy

### Unit Tests:

- Rely on the existing translation key-parity test (`src/lib/i18n/__tests__/translations.test.ts`) to catch en/pl key drift after adding `browse.*` and `set.*`.

### Manual Testing Steps:

1. Set `preferred-locale=pl`, open `/sets/:id` → confirm Polish strings; click `Przeglądaj` → confirm browse nav reads `Poprzedni`/`Następny`/`Tasuj`.
2. Switch to `preferred-locale=en`, repeat → confirm English strings.
3. Exercise prev/next (buttons + arrow keys), shuffle, flip; create/edit/delete/import a card and read the toast.

## References

- Change identity: `context/changes/flashcard-browse-buttons/change.md`
- i18n island pattern: `src/components/sets/SetDashboard.tsx:22-31`, `src/components/I18nProvider.tsx`
- Locale passing in `.astro`: `src/pages/dashboard.astro:10,41`
- Server `.astro` translations: `src/lib/i18n/ui.ts`
- Lesson — React island hydration/provider boundary: `context/foundation/lessons.md` ("React Context i hydratacja muszą żyć WEWNĄTRZ jednej wyspy Astro")

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Browse view i18n + Next/Previous labels

#### Automated

- [x] 1.1 Build passes (Astro type-check): `npm run build`
- [x] 1.2 Lint passes on changed TS/TSX: `npx eslint src/components/sets/FlashcardBrowseView.tsx`
- [x] 1.3 Translation key-parity test passes: `npm run test -- translations`

#### Manual

- [x] 1.4 PL nav reads `‹ Poprzedni` / `Następny ›` and shuffle reads `Tasuj`
- [x] 1.5 EN nav reads `Previous` / `Next` / `Shuffle`
- [x] 1.6 Arrow keys, Space-flip, shuffle, disabled states work; bottom hint unchanged

### Phase 2: Set detail view i18n

#### Automated

- [ ] 2.1 Build passes: `npm run build`
- [ ] 2.2 Lint passes on changed TS/TSX: `npx eslint src/components/sets/SetDetailPage.tsx`
- [ ] 2.3 Translation key-parity test passes: `npm run test -- translations`

#### Manual

- [ ] 2.4 PL set-detail strings (buttons, counters, reverse-mode label) render in Polish
- [ ] 2.5 EN set-detail strings render in English
- [ ] 2.6 Create/edit/delete/import toasts render localized
- [ ] 2.7 Error/not-found fallback routes render localized text
- [ ] 2.8 No regressions: buttons navigate/open dialogs as before
