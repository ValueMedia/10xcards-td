<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Polish & English i18n Support

- **Plan**: context/changes/i18n-pl-en/plan.md
- **Mode**: Deep
- **Date**: 2026-06-17
- **Verdict**: REVISE
- **Findings**: 2 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS ✅ |
| Lean Execution | WARNING ⚠️ (1 finding) |
| Architectural Fitness | FAIL ❌ (1 finding) |
| Blind Spots | WARNING ⚠️ (1 finding) |
| Plan Completeness | PASS ✅ |

## Grounding

10/10 paths ✓, 0/3 symbols ✓ (all are new — expected), brief↔plan ✓

## Findings

### F1 — API endpoint path breaks existing route

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Architectural Fitness
- **Location**: Phase 1, Change 6 — `src/pages/api/user-prompt/locale.ts`
- **Detail**: The plan puts the locale endpoint at `src/pages/api/user-prompt/locale.ts`, but the existing user-prompt route is a **flat file** `src/pages/api/user-prompt.ts`. Astro does not allow both `user-prompt.ts` and `user-prompt/` directory — creating the directory would break the existing route. Additionally, "user prompt" and "locale preference" are unrelated concepts — conflating them makes the API harder to understand.
- **Fix**: Move the endpoint to `src/pages/api/user/locale.ts` (separate domain). This avoids the route conflict and keeps concerns separated.
- **Decision**: PENDING

### F2 — config-status.ts returns Polish strings, not keys

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 3, Change 12 — `src/lib/config-status.ts`
- **Detail**: The plan says config-status.ts "returns structured data (message key + docsUrl)" and that Layout.astro translates the message key. In reality, config-status.ts returns **hardcoded Polish strings** in the `message` field (`"Supabase nie jest skonfigurowany — funkcje uwierzytelniania są wyłączone."`), and Layout.astro renders them directly with a hardcoded Polish label `"Uwaga:"` (line 27). The plan's Change 12 description is inaccurate — the conversion from Polish strings to message keys is more substantial than described, because Layout.astro also hardcodes the `"Uwaga:"` prefix and the `"Dokumentacja"` fallback label (line 32). The change must account for: (1) converting config-status return type from string to key, (2) translating in Layout.astro using `t()`, (3) handling the `docsLabel` field which also has a Polish fallback.
- **Fix**: Update Phase 3 Change 12 to explicitly describe: (1) change `ConfigStatus.message` from Polish string to an i18n key string (e.g., `"config.supabaseNotConfigured"`), (2) add a `ConfigStatus.docsLabelKey` field or use a key convention for the `docsLabel` fallback, (3) Layout.astro renders `t(cfg.message)` and `t("banner.attention")` instead of hardcoded Polish.
- **Decision**: PENDING

### F3 — Phase 1 scope misses 4 auth sub-components

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Lean Execution
- **Location**: Phase 3, Changes 5-6 — auth form extraction
- **Detail**: The plan lists SignInForm.tsx and SignUpForm.tsx but misses 4 shared auth sub-components that also contain hardcoded strings: `FormField.tsx` (labels/placeholders passed as props — these are fine, they come from parent forms), `SubmitButton.tsx` (has `"Signing in..."` / `"Creating account..."` as `pendingText` prop — fine, passed by parent), `ServerError.tsx` (renders dynamic `message` prop — fine), and `PasswordToggle.tsx` (has hardcoded `"Hide password"` / `"Show password"` aria-labels). Only `PasswordToggle.tsx` has strings that need extraction — the others receive their strings from parents. Additionally, `confirm-email.astro` has conditional English strings that the plan lists but doesn't provide a change entry for.
- **Fix**: Add `src/components/auth/PasswordToggle.tsx` to Phase 3 changes (aria-labels need i18n). The other auth sub-components are fine since they receive translatable strings from their parents. Add a change entry for `confirm-email.astro` page-level strings (currently listed in scope but no Change entry exists).
- **Decision**: PENDING

### F4 — I18nProvider is a new pattern with no precedent

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 2, Change 4 — `src/components/I18nProvider.tsx`
- **Detail**: The codebase currently has zero React context providers. All islands receive data via props. The plan introduces I18nProvider as a wrapper component for every island. This is a valid pattern for react-i18next, but the plan doesn't specify the wrapping mechanism — should each `.astro` page manually wrap its island in `<I18nProvider>`? This is what Phase 2 Change 8 implies, but it's worth making explicit that this is a new pattern and listing exactly which pages need the wrapper in Phase 2. The blast-radius check shows 16 API files and 11 island usages that would need the locale prop threading.
- **Fix**: No code change needed — Phase 2 Change 8 already lists the pages. But add a note in Critical Implementation Details confirming this is a new pattern and that every page with a React island must wrap it in I18nProvider. Consider creating a shared Astro component `<IslandWrapper locale>` to reduce boilerplate.
- **Decision**: PENDING

### F5 — Plan says "routing: manual" in brief but "prefixDefaultLocale: false" in plan

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1, Change 7 — `astro.config.mjs`
- **Detail**: The plan body says `routing: { prefixDefaultLocale: false }` (object config), while the plan-brief says "Cookie + middleware" approach. The research sub-agent confirmed that `prefixDefaultLocale: false` is the default and valid, and that Astro 6.x also supports `routing: "manual"` for fully custom routing. Since the plan uses cookie-based locale detection (not URL prefixes), either config works — but the plan should pick one and be consistent. `prefixDefaultLocale: false` is simpler and correct for this use case since we don't need manual routing helpers.
- **Fix**: No change needed — `prefixDefaultLocale: false` is correct and sufficient for cookie-based detection. This is just an observation about the plan-brief description.
- **Decision**: PENDING