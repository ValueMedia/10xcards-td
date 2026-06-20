# Flashcard Browse Buttons + Set Detail i18n — Plan Brief

> Full plan: `context/changes/flashcard-browse-buttons/plan.md`

## What & Why

Add visible **Next / Previous** labels (Następny / Poprzedni in Polish) next to the existing arrow buttons in the flashcard browse view. Doing this properly requires bringing the browse view — and the set-detail view it's reached from — under the project's i18n system, so the whole set→browse path renders in the user's locale instead of hardcoded English.

## Starting Point

`FlashcardBrowseView` (browse) and `SetDetailPage` (set detail) are both `client:only="react"` islands that are **not** wired to i18n; all their strings are hardcoded English. The dashboard (`SetDashboard`) is already localized and is the template to follow.

## Desired End State

Browse nav controls show arrow + localized text (`‹ Poprzedni` / `Następny ›`), and the set-detail view renders every string in the active locale (including the `Browse` button → `Przeglądaj` and all toasts/fallbacks). Flipping the locale cookie flips both views with no English left behind. The bottom hint `← → navigate · Space flip` stays unchanged.

## Key Decisions Made

| Decision                    | Choice                                       | Why                                                      | Source |
| --------------------------- | -------------------------------------------- | ------------------------------------------------------- | ------ |
| i18n scope (browse)         | Whole view (labels + Shuffle + aria)         | Coherent localized screen, not a half-translated mix    | Plan   |
| Extra scope                 | Also internationalize `SetDetailPage`        | User confirmed the set-detail view ("Browse" lives here)| Plan   |
| Button layout               | Inline arrow + text                          | Standard pagination pattern, single click target        | Plan   |
| Key location (React)        | `common.json` under `browse.*` / `set.*`     | Generic strings, no new namespace needed                | Plan   |
| Bottom hint                 | Leave unchanged                              | Keeps scope on navigation                               | Plan   |
| Pluralization               | Plain conditionals (existing style)          | Avoids touching i18next plural config                   | Plan   |

## Scope

**In scope:** browse-view Next/Previous labels; i18n for `FlashcardBrowseView` and `SetDetailPage`; locale passing + server fallbacks in `browse.astro` and `index.astro`; new `browse.*`/`set.*` keys in `common.json` + `ui.ts` fallback keys.

**Out of scope:** `/dashboard` (already localized); child dialogs (`FlashcardList`, create/edit/import/share); the bottom hint; keyboard/shuffle/flip logic.

## Architecture / Approach

Reuse the established island pattern: default export → `<I18nProvider locale={locale}><Inner/></I18nProvider>`, add `locale: SupportedLocale` prop, inner uses `useTranslation("common")`. React keys go in `locales/{en,pl}/common.json`; server-rendered `.astro` fallbacks use `getTranslations(locale)` backed by `ui.ts`. Locale comes from `Astro.locals.locale`.

## Phases at a Glance

| Phase                                | What it delivers                                          | Key risk                                              |
| ------------------------------------ | -------------------------------------------------------- | ---------------------------------------------------- |
| 1. Browse view i18n + labels         | Next/Previous labels + localized browse view             | Button layout shift from icon→text button            |
| 2. Set detail view i18n              | Fully localized set-detail view + route fallbacks        | Many strings incl. interpolated toasts — easy to miss one |

**Prerequisites:** none — i18n infra and the `I18nProvider` pattern already exist.
**Estimated effort:** ~1 session across 2 phases.

## Open Risks & Assumptions

- Assumes `Astro.locals.locale` is populated on both routes (set by middleware, as on `dashboard.astro`).
- `keySeparator: false` / `nsSeparator: false` means flat keys via `useTranslation("common")`; verified in `src/lib/i18n/index.ts`.
- Translation key-parity test guards against en/pl drift.

## Success Criteria (Summary)

- Browse nav shows localized Next/Previous labels next to arrows in both locales.
- Set-detail view (incl. `Browse` button, toasts, fallbacks) renders fully in the active locale.
- No regression in navigation, shuffle, flip, or dialog actions.
