<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: User Settings Page

- **Plan**: context/changes/user-settings-page/plan.md
- **Scope**: All 3 phases (full plan review)
- **Date**: 2026-06-17
- **Verdict**: NEEDS ATTENTION
- **Findings**: 1 critical, 3 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | FAIL |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — New API routes not in middleware-protected routes

- **Severity**: CRITICAL
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/middleware.ts:5
- **Detail**: `/api/user-prompt`, `/api/auth/change-password`, and `/api/auth/delete-account` are not listed in `PROTECTED_API_ROUTES`. Each endpoint has inline auth checks (`if (!user?.id || !supabase)` return 401), so they are functionally protected, but this is inconsistent with the project pattern where all protected API routes are registered in middleware. A future endpoint added under these paths could easily forget the check.
- **Fix**: Add the new routes to `PROTECTED_API_ROUTES` in `src/middleware.ts`.
- **Decision**: FIXED

- **Severity**: WARNING
- **Impact**: MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/auth/delete-account.ts:52
- **Detail**: Account deletion requires typing "DELETE" on the client, but no current password verification on the server. Anyone with a valid session cookie can trigger irreversible account deletion. The plan explicitly states "No re-authentication — the user is already authenticated via middleware" for change-password, but deletion is far more destructive.
- **Fix A (Recommended)**: Add `currentPassword` field to the delete-account request body, verify it server-side before proceeding.
  - Strength: Standard practice for destructive actions; prevents session hijacking from causing account loss.
  - Tradeoff: Adds UX friction; requires the user to re-enter their password.
  - Confidence: HIGH — this is industry-standard for account deletion.
  - Blind spot: None significant.
- **Fix B**: Accept the current approach as-is — the DELETE confirmation is a client safeguard, and session hijacking is an unlikely edge case.
  - Strength: Simpler UX; matches the plan specification.
  - Tradeoff: Lower security bar for the most destructive action.
  - Confidence: MEDIUM — depends on threat model.
  - Blind spot: Session hijacking scenarios.
- **Decision**: FIXED

- **Severity**: WARNING
- **Impact**: MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/auth/change-password.ts:42
- **Detail**: `changePassword` calls `supabase.auth.updateUser({ password })` without verifying the current password. If a session cookie is compromised (e.g., XSS), an attacker can change the password. The plan explicitly specifies no re-authentication, so this is by design, but it's worth flagging.
- **Fix A (Recommended)**: Add `currentPassword` field, verify with `supabase.auth.signInWithPassword` before calling `updateUser`.
  - Strength: Prevents session-hijack password changes.
  - Tradeoff: Minor UX friction; Supabase's recommended approach for sensitive operations.
  - Confidence: HIGH — standard security practice.
  - Blind spot: None significant.
- **Fix B**: Accept as-is per plan spec.
  - Strength: Matches plan; simpler UX.
  - Tradeoff: Session compromise allows password change.
  - Confidence: MEDIUM — acceptable for MVP, risky for production.
  - Blind spot: XSS attack surface not fully assessed.
- **Decision**: FIXED

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/settings/SettingsPage.tsx:259-281
- **Detail**: The "switch to default" confirmation uses a raw `div` overlay instead of the project's `Dialog` component (used by `ChangePasswordDialog` and `DeleteAccountDialog`). Missing focus trapping, Escape key handling, and screen reader support.
- **Fix**: Refactor `switchConfirmOpen` to use the `Dialog` component from `@/components/ui/dialog`.
- **Decision**: SKIPPED — Unused import in delete-account.ts

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/api/auth/delete-account.ts:5
- **Detail**: `createClient` is imported from `@/lib/supabase` but never used in the file (the `supabase` instance comes from `context.locals.supabase`). Dead import.
- **Fix**: Remove the unused `import { createClient } from "@/lib/supabase"` line.
- **Decision**: PENDING

### F6 — DELETE /api/user-prompt never returns 404

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/api/user-prompt.ts:103-112
- **Detail**: Plan says DELETE "Returns `{ success: true }` or 404", but the implementation always returns `{ success: true }` even when no row existed. DELETE being idempotent is standard REST, but differs from the plan spec.
- **Fix**: Accept as-is (idempotent DELETE is standard) or add a check for row existence before deletion.
- **Decision**: PENDING

### F7 — Section order on settings page differs from plan

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/settings/SettingsPage.tsx:104-254
- **Detail**: Plan lists sections as Account→Language→AI Prompt→Danger Zone. Implementation renders AI Prompt→Language→Account→Danger Zone. This was an intentional user-requested change during implementation.
- **Fix**: Accept as-is (intentional change per user request during implementation).
- **Decision**: PENDING

### F8 — process.env.AI_RATE_LIMIT_HOURLY write in generate.ts (pre-existing)

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/sets/[id]/generate.ts:91-92
- **Detail**: Pre-existing code writes a secret to `process.env`. This may not work correctly in Cloudflare Workers runtime. Not part of this change, but noted for awareness.
- **Fix**: Out of scope for this review. Track separately.
- **Decision**: PENDING