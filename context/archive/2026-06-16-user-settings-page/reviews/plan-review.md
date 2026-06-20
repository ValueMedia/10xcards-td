<!-- PLAN-REVIEW-REPORT -->
# Plan Review: User Settings Page

- **Plan**: `context/changes/user-settings-page/plan.md`
- **Mode**: Deep
- **Date**: 2026-06-16
- **Verdict**: SOUND
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | WARNING (1 finding) |
| Architectural Fitness | PASS |
| Blind Spots | WARNING (1 finding) |
| Plan Completeness | OBSERVATION (2 findings) |

## Grounding

9/10 paths ✓ (1 non-existent path is a new file to be created), 3/3 symbols ✓, brief↔plan ✓. All 5 riskiest claims verified against codebase.

## Findings

### F1 — Change password uses signInWithPassword for re-auth, creating a new session

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1, Step 7 — change-password.ts
- **Detail**: The plan called `supabase.auth.signInWithPassword()` to verify current password before updating. This creates a new session, refreshing access/refresh tokens. On Cloudflare Workers with cookie-based SSR auth, this creates new cookies and may invalidate the existing session.
- **Fix**: Use `supabase.auth.updateUser({ password: newPassword })` directly without re-authentication. The user is already authenticated (middleware resolves the user). Email sourced from `context.locals.user.email`, not request body.
- **Decision**: FIXED — Use updateUser only, no re-authentication.

### F2 — Sign out in dropdown uses form POST inside Radix DropdownMenuItem

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Lean Execution
- **Location**: Phase 3, Step 1 — UserMenu.tsx
- **Detail**: A `<form method="POST">` nested inside Radix DropdownMenuItem may conflict with Radix's pointer-events and focus management. The current NavBar works because the form is standalone, not inside Radix primitives.
- **Fix**: Use `fetch POST /api/auth/signout` with programmatic submission. On success, call `window.location.href = "/"`. Clean separation — Radix handles UI, fetch handles action.
- **Decision**: FIXED — Use fetch + redirect.

### F3 — Change password endpoint needs the user's email

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious
- **Dimension**: Plan Completeness
- **Location**: Phase 1, Step 7 — change-password.ts
- **Detail**: The plan didn't specify where the email comes from for signInWithPassword. Now moot since we're using updateUser without re-auth. But worth noting: `context.locals.user.email` is the source, not the request body.
- **Fix**: Add to Step 7 contract: "Email is sourced from `context.locals.user.email`, not from the request body."
- **Decision**: FIXED — Added to contract.

### F4 — renderFlashcardPrompt is client-safe

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious
- **Dimension**: Plan Completeness
- **Location**: Phase 2, Step 6 — PromptPreview.tsx
- **Detail**: The plan correctly noted that `renderFlashcardPrompt` is pure string manipulation and can be called client-side. Verified: `ai-prompt.ts` only imports from `zod` (client-safe). No action needed.
- **Fix**: No action needed — assumption confirmed correct.
- **Decision**: NOTED