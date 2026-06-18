<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Polish & English i18n Support

- **Plan**: context/changes/i18n-pl-en/plan.md
- **Scope**: Phases 1–4 (full plan)
- **Date**: 2026-06-18
- **Verdict**: NEEDS ATTENTION (all findings triaged & fixed)
- **Findings**: 0 critical, 4 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | WARNING |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

Phases 1–3 faithful to plan intent (full en/pl key parity, all strings extracted, error-code system in place). Phase 4 intentionally diverged from the planned client `fetch`+`reload` flow to a server-side anchor → `/api/locale-switch` mechanism (coherent and complete; old path removed). Automated success criteria pass: vitest 44/44, `npm run build` clean.

## Findings

### F1 — Shared module-level i18n singleton: English first-paint + SSR leak hazard

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes
- **Dimension**: Architecture
- **Location**: src/components/I18nProvider.tsx:11-27, src/lib/i18n/index.ts
- **Detail**: `i18n` singleton imported by every island; `client:load` means SSR renders too. `void changeLanguage` is async/discarded so SSR always renders in `en` (PL first-paint flash) and the design is fragile against future sync/await changes leaking locale across concurrent requests in a worker isolate.
- **Fix A (chosen)**: Per-island `i18n.cloneInstance({ lng: locale })` via lazy `useState`, with `useEffect` reacting to locale prop changes. Shares resource store, keeps own language, no global mutation.
- **Decision**: FIXED via Fix A

### F2 — Dead endpoint `PUT /api/user/locale` (+ raw Postgrest error leak)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW
- **Dimension**: Scope Discipline / Pattern Consistency
- **Location**: src/pages/api/user/locale.ts (whole file; line 48)
- **Detail**: Orphaned after the Phase 4 rework (writes now go through `GET/POST /api/locale-switch`); no callers in `src/`. Line 48 also returned the raw `PostgrestError.message` to the client, diverging from siblings that return `SERVER_ERROR`.
- **Fix**: Deleted the file (and the now-empty `src/pages/api/user/` directory).
- **Decision**: FIXED

### F3 — `locale-switch` mutates state via `GET` (HTTP semantics + CSRF)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/locale-switch.ts:8-22
- **Detail**: DB write + cookie set on a `GET` request with no CSRF token; a third-party `<img src>` could silently change a logged-in user's preference. Low impact (locale only) but violates GET safety semantics.
- **Fix A (chosen)**: Endpoint switched to `POST` (reads `formData`); `LanguageSwitcher` now renders a `<form method="post" action="/api/locale-switch">` per locale with hidden `locale`/`redirect` inputs (works without JS). Test updated to assert form method/action/hidden input.
- **Decision**: FIXED via Fix A

### F4 — Missing `Secure` on `preferred-locale` cookie

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: src/middleware.ts:68-75, src/pages/api/locale-switch.ts:27-33
- **Detail**: Neither Set-Cookie included `Secure`. `HttpOnly:false` + `SameSite=Lax` intentional/correct; Workers deploy is HTTPS-only. (localhost is a secure context, so local dev unaffected.)
- **Fix**: Added `Secure` to both cookie writes.
- **Decision**: FIXED

### F5 — GRANT `delete` without a DELETE RLS policy

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260617000001_user_preferences.sql:33
- **Detail**: GRANT included `delete` but no `for delete` policy exists (RLS denies anyway — dead grant, not a hole).
- **Fix**: Dropped `delete` from the GRANT. NOTE: editing an already-applied migration only affects fresh applies / resets, not the live local DB.
- **Decision**: FIXED

### F6 — `Accept-Language` ignores quality weights

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: src/middleware.ts:22-31
- **Detail**: Parser used positional order, not `q` weights (`en;q=0.5, pl;q=0.9` would wrongly pick `en`).
- **Fix**: Parse and sort candidates by `q` (descending, stable on ties) before matching.
- **Decision**: FIXED

### F7 — Dead translation key `settings.comingSoon`

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Pattern Consistency
- **Location**: src/lib/i18n/locales/{en,pl}/settings.json:20
- **Detail**: "Coming soon" UI removed per plan, but the key lingered in both locale files.
- **Fix**: Removed the key from both files.
- **Decision**: FIXED
