# Polish & English i18n Support — Plan Brief

> Full plan: `context/changes/i18n-pl-en/plan.md`

## What & Why

Add bilingual (Polish/English) interface support to 10xCards. The app currently has ~285 hardcoded strings mixing English and Polish, zero i18n infrastructure, and a disabled language-switcher stub in Settings. This plan builds the i18n foundation, extracts strings for the main app UI, and makes the language switcher functional.

## Starting Point

No i18n library, no translation files, no locale persistence. A disabled EN/PL button pair exists in `SettingsPage.tsx:191-213`. ReviewSession is entirely in Polish; everything else is English. Dates format inconsistently (`pl-PL` vs `en-US`). The middleware already resolves auth on every request — ideal hook for locale detection.

## Desired End State

Users switch language in Settings → preference saves to Supabase (authenticated) and cookie (all users) → page reloads in selected language. All main app UI (nav, dashboard, settings, auth) displays in PL or EN. API errors use codes mapped to localized messages. English fallback for missing Polish keys.

## Key Decisions Made

| Decision | Choice | Why | Source |
|----------|--------|-----|--------|
| Locale routing | Cookie + middleware | No URL redirects needed; app is behind auth wall | Plan |
| Locale persistence | Supabase + cookie | Syncs across devices for auth users; cookie for guests | Plan |
| i18n library | Astro built-in dict + react-i18next | Astro dict for `.astro` files, react-i18next for React islands | Plan |
| API error strings | Client-side translation via error codes | Clean separation, no API changes to language-agnostic contract | Plan |
| Existing PL strings | EN as base, PL as translation | Consistency — EN is always base, PL is always a translation | Plan |
| Phase 1 scope | Nav, dashboard, settings, auth | Core daily-use UI; ReviewSession and sets/flashcards deferred | Plan |
| Missing translation fallback | English | Users always see something sensible; easy to add translations incrementally | Plan |
| Testing | Translation completeness test (keys in both locales) | Catches missing translations at CI level | Plan |

## Scope

**In scope:**
- i18n infrastructure (types, constants, middleware, Supabase migration, API endpoint)
- react-i18next setup and Astro dictionary helper
- Translation files (EN base + PL) for: nav, dashboard, settings, auth
- String extraction from all Phase 1 scope components
- API error codes for auth/settings routes
- Language switcher activation in SettingsPage
- Cookie-based locale resolution for unauthenticated users

**Out of scope:**
- ReviewSession translation (remains Polish)
- Sets & flashcards CRUD pages
- AI generation page
- Share page
- URL-based locale routing (`/en/`, `/pl/`)
- SEO/multi-locale sitemap
- RTL support
- Lazy/dynamic locale loading

## Architecture / Approach

**Two-track translation:** Astro `.astro` files use a simple `useTranslations(lang)` dictionary helper; React islands use `react-i18next` with JSON namespace files, initialized via `I18nProvider` wrapper that receives `locale` as a prop from the parent `.astro` page.

**Locale resolution** (middleware): cookie → Supabase `user_preferences` → `Accept-Language` → default `en`. Result stored in `context.locals.locale`, passed to Layout and islands.

**Language switch flow:** User clicks EN/PL → PUT `/api/user-prompt/locale` (auth) + set cookie → `window.location.reload()` → middleware resolves new locale → SSR renders in new language.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|-------|-----------------|----------|
| 1. Infrastructure & Locale Resolution | Types, migration, middleware, API endpoint, Astro config | Middleware locale resolution must work for both auth and guest users |
| 2. Translation System Setup | react-i18next init, Astro dict, I18nProvider, translation JSON files | Cross-island i18n context — each island needs explicit provider |
| 3. String Extraction — Main App | Replace ~120 hardcoded strings with i18n calls, add API error codes | Completeness — missing a string means it renders raw key |
| 4. Language Switcher Activation | Functional EN/PL toggle, Supabase + cookie persistence, page reload | Page reload UX — users expect instant switch but SSR needs reload |

**Prerequisites:** Working local Supabase instance for migration testing.
**Estimated effort:** ~4-5 sessions across 4 phases

## Open Risks & Assumptions

- **Page reload on language switch** is a UX compromise — instant client-side switch would leave SSR content in old language. Acceptable for a settings-based toggle.
- **Both locales bundled upfront** (~20KB) — fine for 2 languages. Would need lazy loading if more languages are added later.
- **ReviewSession stays in Polish** until a future phase — users switching to English will see ReviewSession in Polish, which may be confusing. Document this as known limitation.
- **API error codes** are a breaking change for any hypothetical API consumer — safe since this is frontend-only.

## Success Criteria (Summary)

- Language switch works end-to-end: click EN/PL → save → reload → correct language
- Language persists across page navigation and login sessions
- All Phase 1 scope strings display correctly in both EN and PL
- Missing Polish keys fall back to English
- `npm run build` and `npm run lint` pass