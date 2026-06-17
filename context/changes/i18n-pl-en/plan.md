# Polish & English i18n Support — Implementation Plan

## Overview

Add bilingual (PL/EN) interface support to 10xCards. The app currently has zero i18n infrastructure, ~285 hardcoded strings mixed between English and Polish, and a disabled language-switcher stub in Settings. This plan builds the i18n foundation (locale resolution, translation system, persistence), then extracts strings for the main app UI (nav, dashboard, settings, auth pages) and activates the language switcher.

## Current State Analysis

- **No i18n library or config** — no `i18n` in `astro.config.mjs`, no translation files, no `t()` function
- **Language switcher is a disabled stub** — `SettingsPage.tsx:191-213`, two disabled `<button>` elements with "Coming soon"
- **~285 hardcoded strings** across ~30 files, mixing English (majority) and Polish (`ReviewSession.tsx`, `config-status.ts`, `Layout.astro` banner)
- **No locale persistence** — no `locale` column in any Supabase table, no cookie, no localStorage
- **Inconsistent date locales** — `pl-PL` in ReviewSession, `en-US`/`en` in dashboard and set cards
- **`<html lang="en">` hardcoded** in `Layout.astro:16`
- **Middleware** resolves user auth on every request — ideal hook point for locale detection
- **Astro SSR + React islands** — each island has its own React root, so i18n context must be explicitly provided per island

### Key Discoveries:

- `src/components/settings/SettingsPage.tsx:191-213` — Language UI stub (disabled EN/PL buttons)
- `src/middleware.ts:11-37` — auth middleware, locale detection should hook in after user resolution (line 18)
- `src/lib/services/user-settings.ts` — CRUD pattern for `user_ai_prompts`, same pattern for locale preference
- `src/layouts/Layout.astro:16` — `<html lang="en">` hardcoded
- `src/pages/settings.astro:6-24` — standard data-fetch → props → React island pattern
- `src/components/review/ReviewSession.tsx:17-290` — entirely in Polish, largest single block of non-English text
- All API routes return English error strings as JSON — these will be translated client-side via error codes

## Desired End State

Users can switch between Polish and English in the Settings page. The preference persists in Supabase (authenticated users) and a cookie (guests). All main app UI (nav, dashboard, settings, auth pages) displays in the selected language. API error messages are translated client-side using error codes. English is the base language with Polish translations; missing Polish translations fall back to English.

### Verification

1. Switch language in Settings → page reloads in selected language
2. Log out, log in on another device → language preference persists
3. Unauthenticated user → cookie-based locale, no errors
4. Every translatable string in scope has a key in both `en.json` and `pl.json`
5. `npm run lint` and `npm run build` pass
6. Test script validates all i18n keys have translations in both locales

## What We're NOT Doing

- **Review session (ReviewSession.tsx) translation** — out of scope for Phase 1; remains in Polish
- **Sets & flashcards CRUD pages translation** — out of scope for Phase 1
- **AI generation page translation** — out of scope for Phase 1
- **Share page translation** — out of scope for Phase 1
- **URL-based locale routing** (`/en/`, `/pl/`) — using cookie-based approach instead
- **SEO/multi-locale sitemap** — app is behind auth wall, not needed
- **Right-to-left language support** — only PL/EN, both LTR
- **Dynamic translation loading** — both locales bundled upfront (small app)

## Implementation Approach

**Two-track translation system:**
1. **Astro `.astro` files** — simple dictionary lookup via `useTranslations(lang)` helper (Astro's recommended pattern)
2. **React islands** — `react-i18next` with JSON namespace files, locale passed as prop from Astro

**Locale resolution order:** cookie → Supabase user preference → Accept-Language header → default (en)

**Persistence:** New `user_preferences` table in Supabase for authenticated users + `preferred-locale` cookie for all users. On login, Supabase preference syncs to cookie; on language change, both update.

**API error codes:** Replace hardcoded English error strings with error codes (e.g., `"UNAUTHORIZED"`, `"VALIDATION_FAILED"`). Client maps codes to localized messages via i18n keys.

## Critical Implementation Details

- **New pattern: I18nProvider wrapper** — This codebase currently has zero React context providers; all islands receive data via props. Introducing `I18nProvider` (which wraps each island with `I18nextProvider`) is a new pattern. Every page with a React island must wrap it in `<I18nProvider locale={locale} client:load>`. Consider creating a shared Astro component to reduce boilerplate.
- **Timing & lifecycle** — The locale must be resolved in middleware BEFORE `next()` so that `context.locals.locale` is available to all pages and API routes. The middleware already creates a Supabase client and resolves the user; locale resolution should happen after user resolution (lines 18-19) but before auth checks (line 25).
- **State sequencing** — On language switch: (1) save to Supabase (if authenticated), (2) set cookie, (3) reload page. The reload is necessary because Astro SSR pages need the new locale at render time; client-only locale switching would leave server-rendered content in the old language.
- **Cross-island sync** — Each React island gets locale as a prop from its parent `.astro` page. After a language change + page reload, all islands receive the new locale. No nanostore atom is needed because the page reload handles synchronization.

## Phase 1: Infrastructure & Locale Resolution

### Overview

Set up the foundational i18n infrastructure: types, Supabase migration, locale resolution in middleware, locale API endpoint, and Astro config.

### Changes Required:

#### 1. Types and constants

**File**: `src/lib/i18n/constants.ts`

**Intent**: Define supported locales, default locale, and cookie name as single source of truth.

**Contract**: Export `SUPPORTED_LOCALES`, `DEFAULT_LOCALE`, `LOCALE_COOKIE`, and a `SupportedLocale` type. Values: `SUPPORTED_LOCALES = ["en", "pl"]`, `DEFAULT_LOCALE = "en"`, `LOCALE_COOKIE = "preferred-locale"`, `SupportedLocale = "en" | "pl"`.

#### 2. Supabase migration — user_preferences table

**File**: `supabase/migrations/YYYYMMDDHHmmss_user_preferences.sql`

**Intent**: Create a table to persist each user's locale preference, following the same RLS pattern as `user_ai_prompts`.

**Contract**: Table `public.user_preferences` with columns `user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`, `locale TEXT NOT NULL DEFAULT 'en'`, `updated_at TIMESTAMPTZ DEFAULT now()`. RLS enabled. Policies: SELECT/INSERT/UPDATE for `auth.uid() = user_id`. Grant SELECT/INSERT/UPDATE on `user_preferences` to `authenticated` role. Add a trigger for `updated_at` (following the same pattern as existing tables if any, or a simple `BEFORE UPDATE` trigger).

#### 3. Locale service functions

**File**: `src/lib/services/user-settings.ts`

**Intent**: Add `getUserLocale` and `upsertUserLocale` functions following the existing `getUserPrompt`/`upsertUserPrompt` pattern.

**Contract**: `getUserLocale(supabase, userId) → { data: SupportedLocale | null, error }` and `upsertUserLocale(supabase, userId, locale) → { data: SupportedLocale, error }`. Query the `user_preferences` table. Use `maybeSingle()` like the existing pattern.

#### 4. Locale resolution in middleware

**File**: `src/middleware.ts`

**Intent**: Resolve the user's locale after auth resolution, following the priority order: cookie → Supabase user preference → Accept-Language → default. Make it available as `context.locals.locale`.

**Contract**: After the existing user resolution (line 18), add locale resolution. Read `preferred-locale` cookie → if authenticated, query `user_preferences` table → fall back to `Accept-Language` → fall back to `en`. Store result in `context.locals.locale`. Set/update the cookie with the resolved locale. Extend `App.Locals` type to include `locale: SupportedLocale`.

#### 5. Astro locals type extension

**File**: `src/env.d.ts` (or appropriate existing type declaration file)

**Intent**: Extend `App.Locals` to include `locale` so TypeScript knows about it.

**Contract**: Add `locale: SupportedLocale` to the `App.Locals` interface.

#### 6. API endpoint — save locale preference

**File**: `src/pages/api/user/locale.ts`

**Intent**: Create a PUT endpoint for authenticated users to save their locale preference. Updates both Supabase and the cookie. Separate from `user-prompt` because locale and AI prompt are unrelated domains, and Astro doesn't allow `user-prompt.ts` and `user-prompt/` to coexist.

**Contract**: `PUT` handler. Validate locale against `SUPPORTED_LOCALES` using zod. Upsert to `user_preferences`. Set `preferred-locale` cookie. Return `{ locale }` on success, `{ error }` on failure. Must export `export const prerender = false`.

#### 7. Astro config — i18n declaration

**File**: `astro.config.mjs`

**Intent**: Add Astro's built-in `i18n` config to declare supported locales. We use `routing: "manual"` because we're doing cookie-based locale detection, not URL-prefix routing.

**Contract**: Add `i18n: { locales: ["en", "pl"], defaultLocale: "en", routing: { prefixDefaultLocale: false } }` to the config. This enables `Astro.currentLocale` and `getRelativeLocaleUrl` helpers without forcing URL prefixes.

### Success Criteria:

#### Automated Verification:

- [ ] 1.1 Migration applies cleanly: `npx supabase db push` (or manual SQL verification)
- [ ] 1.2 Type checking passes: `npm run build` (includes astro check)
- [ ] 1.3 Linting passes: `npm run lint`
- [ ] 1.4 Unit test for locale resolution logic (cookie → DB → header → default)

#### Manual Verification:

- [x] 1.5 `context.locals.locale` is set correctly on page requests — d42d4bc
- [x] 1.6 API `/api/user/locale` accepts valid locales and rejects invalid ones — d42d4bc
- [x] 1.7 Cookie `preferred-locale` is set on first visit and updated on locale change — d42d4bc

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation.

---

## Phase 2: Translation System Setup

### Overview

Set up the translation infrastructure: react-i18next initialization, Astro dictionary helper, I18nProvider component, and create translation JSON files for Phase 1 scope (main app: nav, dashboard, settings, auth).

### Changes Required:

#### 1. Install react-i18next

**File**: `package.json`

**Intent**: Add i18next and react-i18next as dependencies.

**Contract**: `npm install i18next react-i18next`. These are the only new i18n dependencies needed.

#### 2. i18n initialization

**File**: `src/lib/i18n/index.ts`

**Intent**: Initialize i18next with react-i18next plugin, loading both locale JSON files. This is the shared i18n instance used by all React islands.

**Contract**: Import `en/common.json`, `en/auth.json`, `en/settings.json`, `en/dashboard.json` and their Polish counterparts. Initialize i18next with `fallbackLng: "en"`, `resources` containing both locales, and `interpolation.escapeValue: false`. Export the configured `i18n` instance.

#### 3. Astro UI dictionary and helper

**File**: `src/lib/i18n/ui.ts`

**Intent**: Create a dictionary of all translatable strings used in `.astro` files (Layout, NavBar, pages) and a `useTranslations(lang)` helper function, following Astro's recommended i18n pattern.

**Contract**: Export `ui` object with `en` and `pl` keys, each containing string key-value pairs. Export `useTranslations(lang: SupportedLocale)` that returns a `t(key)` function for looking up strings in the given language. Fallback to English for missing keys.

#### 4. I18nProvider component for React islands

**File**: `src/components/I18nProvider.tsx`

**Intent**: Create a React component that wraps each island with i18next context, setting the language based on the locale prop.

**Contract**: Takes `locale: SupportedLocale` and `children: React.ReactNode` props. Uses `I18nextProvider` from react-i18next with the shared `i18n` instance. Calls `i18n.changeLanguage(locale)` before rendering children. Export the component.

#### 5. Layout.astro — dynamic locale

**File**: `src/layouts/Layout.astro`

**Intent**: Accept a `locale` prop, set `<html lang={locale}>`, and use `useTranslations(locale)` for any translatable strings in the layout (banner text, default title).

**Contract**: Add `locale?: SupportedLocale` to Props. Default to `"en"`. Replace `<html lang="en">` with `<html lang={locale}>`. Translate hardcoded strings: "Uwaga:" → `t("banner.attention")`, "Dokumentacja" → `t("banner.docs")`, default title "10x Cards - TD" → `t("app.title")`.

#### 6. Translation JSON files — English (base)

**Files**: `src/lib/i18n/locales/en/common.json`, `auth.json`, `settings.json`, `dashboard.json`

**Intent**: Create English translation files for the main app scope. English is the base language; these files contain all keys with English values.

**Contract**: Keys organized by feature area. Each file corresponds to a react-i18next namespace. Key naming: dot-notation hierarchical (e.g., `"nav.dashboard"`, `"settings.language"`, `"auth.signin"`). Include all strings identified in scope: NavBar, Layout banner, SettingsPage (Language, Account, Danger Zone sections), auth pages (signin, signup, confirm-email), dashboard page, and error codes for API responses.

#### 7. Translation JSON files — Polish

**Files**: `src/lib/i18n/locales/pl/common.json`, `auth.json`, `settings.json`, `dashboard.json`

**Intent**: Create Polish translation files with all the same keys as English files, with Polish values.

**Contract**: Every key in `en/*.json` must have a corresponding Polish translation in `pl/*.json`. Strings currently in Polish in ReviewSession.tsx are NOT in scope for Phase 1 — they remain untouched. All other strings get Polish translations.

#### 8. Page-level locale passing pattern

**Files**: `src/pages/dashboard.astro`, `src/pages/settings.astro`, `src/pages/auth/signin.astro`, `src/pages/auth/signup.astro`, `src/pages/auth/confirm-email.astro`

**Intent**: Update each page to read locale from `Astro.locals.locale`, pass it to Layout and to React island components via I18nProvider.

**Contract**: In each page's frontmatter, add `const locale = Astro.locals.locale;`. Pass `locale` to `<Layout locale>`. Wrap each React island in `<I18nProvider locale={locale} client:load>`. For pages with inline `.astro` strings, use `useTranslations(locale)` for translations.

### Success Criteria:

#### Automated Verification:

- [x] 2.1 `npm run build` passes with new i18n imports
- [x] 2.2 `npm run lint` passes
- [x] 2.3 Translation completeness test passes
- [x] 2.4 Type checking passes

#### Manual Verification:

- [ ] 2.5 App loads without errors; strings render correctly in English (default)
- [ ] 2.6 Temporarily force `locale = "pl"` in middleware — verify Polish translations appear on dashboard, settings, and auth pages
- [ ] 2.7 English fallback works: remove a key from `pl/common.json`, verify English text appears instead

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation.

---

## Phase 3: String Extraction — Main App

### Overview

Replace all hardcoded strings in scope (nav, dashboard, settings, auth pages) with i18n calls. Convert API error messages to codes. Update ReviewSession date formatting to use the resolved locale.

### Changes Required:

#### 1. NavBar — string extraction

**File**: `src/components/NavBar.astro`

**Intent**: Replace hardcoded "Dashboard" and "10xCards" with translated strings from the Astro dictionary.

**Contract**: Use `useTranslations(locale).t("nav.dashboard")` etc. Brand name "10xCards" remains untranslated.

#### 2. SettingsPage — string extraction

**File**: `src/components/settings/SettingsPage.tsx`

**Intent**: Replace all hardcoded strings (headings, labels, button text, toast messages, dialog text) with `useTranslation()` calls. This is the largest single file extraction.

**Contract**: Import `useTranslation` from `react-i18next`. Every hardcoded string becomes `t("settings.xxx")`. Toast messages use `t()` for both error and success messages. The Language section UI is NOT wired up yet (that's Phase 4) — strings are extracted but the switcher remains disabled.

#### 3. ChangePasswordDialog — string extraction

**File**: `src/components/settings/ChangePasswordDialog.tsx`

**Intent**: Replace all hardcoded strings with `useTranslation()` calls.

**Contract**: Import `useTranslation`. Replace labels, placeholders, button text, toast messages, validation errors with `t("settings.changePassword.xxx")` keys.

#### 4. DeleteAccountDialog — string extraction

**File**: `src/components/settings/DeleteAccountDialog.tsx`

**Intent**: Replace all hardcoded strings with `useTranslation()` calls.

**Contract**: Import `useTranslation`. Replace dialog title, description, labels, button text, toast messages with `t("settings.deleteAccount.xxx")` keys.

#### 5. SignInForm — string extraction

**File**: `src/components/auth/SignInForm.tsx`

**Intent**: Replace all hardcoded strings (labels, placeholders, validation errors, button text) with `useTranslation()` calls.

**Contract**: Import `useTranslation`. Use namespace `"auth"`. Replace all strings with `t("auth.signin.xxx")` keys.

#### 6. SignUpForm — string extraction

**File**: `src/components/auth/SignUpForm.tsx`

**Intent**: Replace all hardcoded strings with `useTranslation()` calls.

**Contract**: Same pattern as SignInForm. Use `t("auth.signup.xxx")` keys.

#### 7. Auth pages (.astro) — string extraction

**Files**: `src/pages/auth/signin.astro`, `src/pages/auth/signup.astro`, `src/pages/auth/confirm-email.astro`

**Intent**: Replace hardcoded page titles and body text with `useTranslations(locale)` calls. `confirm-email.astro` has conditional English strings for both dev and prod modes that all need i18n keys.

**Contract**: Each page reads `locale` from `Astro.locals.locale`, passes it to Layout. Inline strings use `t()` from the Astro dictionary. For `confirm-email.astro`, both dev-mode strings ("Registration successful", "Your account has been created. You can now sign in.", "Go to sign in") and prod-mode strings ("Check your email", "We've sent a confirmation link...", "Back to sign in") get i18n keys.

#### 8. Dashboard components — string extraction

**Files**: `src/components/sets/SetDashboard.tsx`, `src/components/dashboard/StatsBlock.tsx`, `src/components/dashboard/DonatedSetsSection.tsx`

**Intent**: Replace all hardcoded strings in dashboard components with `useTranslation()` calls.

**Contract**: Use namespace `"dashboard"`. Date formatting calls (`toLocaleDateString("en", ...)`) switch to `toLocaleDateString(locale, ...)` where `locale` comes from i18n context.

#### 9. UserMenu — string extraction

**File**: `src/components/layout/UserMenu.tsx`

**Intent**: Replace "Settings" and "Sign out" / "Signing out..." with translated strings.

**Contract**: Import `useTranslation` from `react-i18next`. Use `t("nav.settings")`, `t("nav.signout")`, `t("nav.signingOut")`.

#### 9b. PasswordToggle — string extraction

**File**: `src/components/auth/PasswordToggle.tsx`

**Intent**: Replace hardcoded aria-labels "Hide password" / "Show password" with translated strings.

**Contract**: Import `useTranslation` from `react-i18next`. Use `t("auth.showPassword")` / `t("auth.hidePassword")` for the aria-label.

#### 10. API error codes — define code map

**File**: `src/lib/i18n/api-errors.ts`

**Intent**: Create a mapping from error codes (strings like `"UNAUTHORIZED"`, `"VALIDATION_FAILED"`) to i18n keys, so client-side code can map API error responses to localized messages.

**Contract**: Export a `getErrorI18nKey(code: string): string` function that maps error codes to i18n keys (e.g., `"UNAUTHORIZED"` → `"errors.unauthorized"`). Also export a `API_ERROR_CODES` constant object for type safety. Client-side error handling uses this mapping: `t(getErrorI18nKey(body.error)) ?? body.error`.

#### 11. API routes — switch to error codes (selected)

**Files**: `src/pages/api/auth/signin.ts`, `src/pages/api/auth/signup.ts`, `src/pages/api/auth/change-password.ts`, `src/pages/api/auth/delete-account.ts`, `src/pages/api/user-prompt.ts`

**Intent**: Replace hardcoded English error strings in JSON responses with error codes. Start with auth and settings routes since those are in Phase 1 scope.

**Contract**: Replace `{ error: "Unauthorized" }` with `{ error: "UNAUTHORIZED" }`, `{ error: "Supabase is not configured" }` with `{ error: "SUPABASE_NOT_CONFIGURED" }`, etc. Client-side code that reads `body.error` as a display string now maps it through `getErrorI18nKey()` first. Keep a fallback: if no mapping exists, display the raw code (which is English-readable).

#### 12. Config-status banner — string extraction

**Files**: `src/lib/config-status.ts`, `src/layouts/Layout.astro`

**Intent**: Replace Polish strings in config-status.ts and Layout.astro with i18n-aware data. Currently config-status.ts returns hardcoded Polish messages (e.g., `"Supabase nie jest skonfigurowany — funkcje uwierzytelniania są wyłączone."`) and Layout.astro hardcodes `"Uwaga:"` and `"Dokumentacja"`. Both need to be converted to use translation keys.

**Contract**: 
- In `config-status.ts`: Change `ConfigStatus` interface so `message` field contains an i18n key string (e.g., `"config.supabaseNotConfigured"`) instead of a Polish string. Add `docsLabelKey` field (e.g., `"config.docsLabel"`) alongside the existing `docsUrl`. The actual `ConfigStatus` check functions return these keys, not localized text.
- In `Layout.astro`: Replace `<strong>Uwaga:</strong>` with `<strong>{t("banner.attention")}</strong>`, replace `{cfg.message}` with `{t(cfg.message)}`, replace `{cfg.docsLabel ?? "Dokumentacja"}` with `{cfg.docsLabelKey ? t(cfg.docsLabelKey) : t("banner.docs")}`.

### Success Criteria:

#### Automated Verification:

- [ ] 3.1 `npm run build` passes
- [ ] 3.2 `npm run lint` passes
- [ ] 3.3 Translation completeness test passes (all keys present in both locales)
- [ ] 3.4 No remaining hardcoded English/Polish strings in Phase 1 scope files (grep check)

#### Manual Verification:

- [ ] 3.5 Settings page renders correctly in both EN and PL (all labels, buttons, toasts)
- [ ] 3.6 Auth pages (signin, signup, confirm-email) render in both languages
- [ ] 3.7 Dashboard page renders in both languages (nav, stats, sets)
- [ ] 3.8 API error messages display localized text in both languages
- [ ] 3.9 Date formatting adapts to locale (e.g., "June 17, 2026" vs "17 czerwca 2026")
- [ ] 3.10 Config-status banner shows localized text in both languages

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation.

---

## Phase 4: Language Switcher Activation

### Overview

Wire up the existing disabled language switcher in SettingsPage, add cross-component locale sync, and implement the full language change flow (Supabase save + cookie + page reload).

### Changes Required:

#### 1. Language switcher component

**File**: `src/components/settings/LanguageSwitcher.tsx`

**Intent**: Replace the hardcoded disabled buttons in SettingsPage with a functional language switcher component. This component shows EN/PL toggle, saves preference to Supabase and cookie, then triggers a page reload.

**Contract**: New component. Takes `currentLocale: SupportedLocale` prop. Renders two buttons (EN, PL) with active state matching `currentLocale`. On click: (1) PUT `/api/user/locale` with the new locale, (2) set `document.cookie` for `preferred-locale`, (3) `window.location.reload()` to re-render with new locale. Handle loading state during the API call. If API call fails (unauthenticated user or network error), still set the cookie and reload — cookie-only locale is valid.

#### 2. SettingsPage — integrate LanguageSwitcher

**File**: `src/components/settings/SettingsPage.tsx`

**Intent**: Replace the disabled Language section stub (lines 191-213) with the functional `LanguageSwitcher` component. Remove "Coming soon" text.

**Contract**: Import `LanguageSwitcher`. Replace the entire Language `<Card>` content block with `<LanguageSwitcher currentLocale={locale} />`. Add `locale` to the Props interface. Remove the "Coming soon" paragraph.

#### 3. Settings page — pass locale prop

**File**: `src/pages/settings.astro`

**Intent**: Read locale from `Astro.locals.locale` and pass it to `SettingsPage` as a prop.

**Contract**: Add `const locale = Astro.locals.locale;` in frontmatter. Add `locale={locale}` prop to `<SettingsPage>`. Wrap in `<I18nProvider locale={locale} client:load>`.

#### 4. Middleware — cookie-only locale for guests

**File**: `src/middleware.ts`

**Intent**: Ensure that unauthenticated users can also set locale via cookie. The locale resolution already handles this (cookie check first), but verify the flow: guest changes language → cookie set → page reload → middleware reads cookie → no Supabase query needed.

**Contract**: No code change needed if Phase 1 implementation correctly falls through to cookie. Verify that the locale resolution order works for both authenticated and unauthenticated users. Add a test or manual check.

#### 5. Layout — pass locale to all pages

**File**: `src/layouts/Layout.astro`

**Intent**: Ensure all pages that use Layout receive and pass the locale. This was partially done in Phase 2; this change ensures every page is covered.

**Contract**: Verify all pages in Phase 1 scope (dashboard, settings, auth pages) pass `locale` to Layout. This is a verification step, not new code — Phase 2 should have done this, but double-check.

#### 6. End-to-end test — locale switch flow

**Intent**: Verify the complete language switch flow works end-to-end.

**Contract**: Not a code change, but a verification checklist: (1) authenticated user switches language → Supabase updated + cookie set + page reloads in new language. (2) unauthenticated user switches language → cookie set + page reloads. (3) authenticated user logs in on new device → Supabase preference synced to cookie. (4) English fallback works when Polish translation is missing.

### Success Criteria:

#### Automated Verification:

- [ ] 4.1 `npm run build` passes
- [ ] 4.2 `npm run lint` passes
- [ ] 4.3 Translation completeness test passes
- [ ] 4.4 Unit test for LanguageSwitcher component (renders both buttons, active state matches locale)

#### Manual Verification:

- [ ] 4.5 Click EN → PL in Settings → page reloads in Polish
- [ ] 4.6 Click PL → EN in Settings → page reloads in English
- [ ] 4.7 Language persists after page navigation (dashboard → settings → back)
- [ ] 4.8 Language persists after logout + re-login
- [ ] 4.9 Unauthenticated user can switch language on auth pages
- [ ] 4.10 Cookie `preferred-locale` is set correctly (check DevTools)

## Testing Strategy

### Unit Tests:

- Locale resolution logic (cookie → DB → header → default, edge cases)
- `useTranslations()` helper (key lookup, fallback to English, missing key)
- `getErrorI18nKey()` mapping (all defined codes map to valid i18n keys)
- Translation completeness (every `en` key exists in `pl`)

### Integration Tests:

- API `/api/user/locale` endpoint (valid locale, invalid locale, unauthenticated)
- Middleware locale setting on `context.locals.locale`

### Manual Testing Steps:

1. Switch language in Settings — verify full page reload in new language
2. Navigate across pages — verify language persists
3. Log out, log in — verify language persists
4. Clear cookies — verify default language (English)
5. Check each Phase 1 page in both languages for missing/untranslated strings
6. Trigger API errors — verify localized error messages
7. Check date formatting in both locales (dashboard stats, set cards)

## Performance Considerations

- **Bundle size**: Both locale JSON files are bundled upfront. Estimated size: ~15-20KB total (English + Polish for Phase 1 scope). Acceptable for a small app.
- **SSR locale resolution**: One additional Supabase query per request for authenticated users (locale preference). Mitigated by: (a) cookie is checked first — no DB query if cookie is set; (b) query is on a tiny table with PK lookup — sub-millisecond.
- **Page reload on language switch**: Necessary because server-rendered Astro content must be regenerated in the new locale. Client-only switching would leave SSR content in the old language.

## Migration Notes

- The `user_preferences` table migration creates a new table with RLS — no data migration needed.
- Existing users will have no `user_preferences` row until they switch language — the `maybeSingle()` query returns null, and the default locale (`en`) is used.
- API error codes are a breaking change for any API consumers that parse error messages. Since this is a frontend-only app with no public API, this is safe.

## References

- Astro i18n docs: https://docs.astro.build/en/guides/i18n/
- react-i18next docs: https://react.i18next.com/
- Existing user settings pattern: `src/lib/services/user-settings.ts`
- Existing middleware: `src/middleware.ts`
- Language switcher stub: `src/components/settings/SettingsPage.tsx:191-213`
- Existing Supabase migration pattern: `supabase/migrations/20260613105815_grant_table_permissions.sql`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Infrastructure & Locale Resolution

#### Automated

- [x] 1.1 Migration applies cleanly — d42d4bc
- [x] 1.2 Type checking passes: `npm run build` — d42d4bc
- [x] 1.3 Linting passes: `npm run lint` — d42d4bc
- [x] 1.4 Unit test for locale resolution logic — d42d4bc

#### Manual

- [ ] 1.5 `context.locals.locale` is set correctly on page requests
- [ ] 1.6 API `/api/user/locale` accepts valid locales and rejects invalid ones
- [ ] 1.7 Cookie `preferred-locale` is set on first visit and updated on locale change

### Phase 2: Translation System Setup

#### Automated

- [ ] 2.1 `npm run build` passes with new i18n imports
- [ ] 2.2 `npm run lint` passes
- [ ] 2.3 Translation completeness test passes
- [ ] 2.4 Type checking passes

#### Manual

- [ ] 2.5 App loads without errors; strings render correctly in English (default)
- [ ] 2.6 Temporarily force `locale = "pl"` — verify Polish translations appear
- [ ] 2.7 English fallback works for missing Polish keys

### Phase 3: String Extraction — Main App

#### Automated

- [ ] 3.1 `npm run build` passes
- [ ] 3.2 `npm run lint` passes
- [ ] 3.3 Translation completeness test passes
- [ ] 3.4 No remaining hardcoded strings in Phase 1 scope files

#### Manual

- [ ] 3.5 Settings page renders correctly in both EN and PL
- [ ] 3.6 Auth pages render in both languages
- [ ] 3.7 Dashboard page renders in both languages
- [ ] 3.8 API error messages display localized text
- [ ] 3.9 Date formatting adapts to locale
- [ ] 3.10 Config-status banner shows localized text

### Phase 4: Language Switcher Activation

#### Automated

- [ ] 4.1 `npm run build` passes
- [ ] 4.2 `npm run lint` passes
- [ ] 4.3 Translation completeness test passes
- [ ] 4.4 Unit test for LanguageSwitcher component

#### Manual

- [ ] 4.5 Click EN → PL in Settings → page reloads in Polish
- [ ] 4.6 Click PL → EN in Settings → page reloads in English
- [ ] 4.7 Language persists after page navigation
- [ ] 4.8 Language persists after logout + re-login
- [ ] 4.9 Unauthenticated user can switch language on auth pages
- [ ] 4.10 Cookie `preferred-locale` is set correctly