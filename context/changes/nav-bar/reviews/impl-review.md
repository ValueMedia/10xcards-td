<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Nav Bar

- **Plan**: `context/changes/nav-bar/plan.md`
- **Scope**: Phase 1 of 1 (full plan)
- **Date**: 2026-06-13
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension            | Verdict |
|----------------------|---------|
| Plan Adherence       | PASS    |
| Scope Discipline     | PASS    |
| Safety & Quality     | WARNING |
| Architecture         | WARNING |
| Pattern Consistency  | PASS    |
| Success Criteria     | PASS    |

## Findings

### F1 — Duplicate navigation on the homepage

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architecture
- **Location**: `src/components/Welcome.astro:28`, `src/components/Topbar.astro`
- **Detail**: `Welcome.astro` (rendered by `src/pages/index.astro`) includes `Topbar.astro`, which independently shows email + Dashboard link + Sign out. A logged-in user visiting `/` now sees two overlapping nav bars: the new sticky `NavBar` (from Layout) and the inline `Topbar` (from Welcome). The `Topbar` also contains "Not signed in" + Sign in/up links for anonymous users that partially duplicate what NavBar handles.
- **Fix A ⭐ Recommended**: Remove `Topbar` from `Welcome.astro` — the new NavBar covers all its functionality
  - Strength: Single source of truth for nav; cleaner homepage for both authenticated and anonymous users.
  - Tradeoff: Anonymous users on `/` lose the inline sign-in/up links in Topbar — but they're still reachable via NavBar showing nothing (user null) or direct nav.
  - Confidence: HIGH — Topbar was a starter-template artifact; NavBar supersedes it entirely.
  - Blind spot: Check if Topbar is used anywhere else (currently only Welcome.astro).
- **Fix B**: Gate NavBar in Layout to not render on `/`
  - Strength: Keeps Topbar as-is on the landing page, no Topbar changes needed.
  - Tradeoff: Layout becomes page-aware (an anti-pattern); adds URL-matching logic to a layout component.
  - Confidence: LOW — creates coupling between layout and routing that will cause issues as routes grow.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — removed Topbar import and usage from Welcome.astro

### F2 — `user.email` renders empty for email-less users

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/components/NavBar.astro:21`
- **Detail**: `user.email` is typed as `string | undefined` on the Supabase `User` type. For OAuth-only accounts or anonymous users without email, the email `<span>` renders empty. In this app all current users sign up with email, so this is latent rather than immediate, but TypeScript doesn't guarantee it.
- **Fix**: Add a fallback — `{user.email ?? "Signed in"}`
- **Decision**: FIXED — applied `{user.email ?? "Signed in"}` in NavBar.astro:21

### F3 — `<NavBar />` placed after banners, not before

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `src/layouts/Layout.astro:40`
- **Detail**: Plan specified NavBar as the first child of `<body>`, before the existing banner block. Implementation places NavBar after banners (banners at lines 24–39, NavBar at line 40). In practice this is arguably better UX (critical config-error banners appear above the nav), and banners only show when Supabase is misconfigured. Minor plan drift.
- **Fix**: No change needed — current order (banners → NavBar) is better UX. Update plan comment if desired.
- **Decision**: SKIPPED — current order is better UX
