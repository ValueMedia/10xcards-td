# Nav Bar Implementation Plan

## Overview

Add a sticky top navigation bar to all authenticated pages. Left side: logo ("10xCards") + navigation links. Right side: logged-in user's email + sign-out button. The bar renders only when a user is authenticated — auth pages (sign in/up) stay clean.

## Current State Analysis

- `src/layouts/Layout.astro` — simple wrapper (`<html>/<head>/<body>/<slot>`), no navigation, accepts only `title` prop.
- `src/middleware.ts` — attaches `Astro.locals.user` (Supabase `User | null`) and `Astro.locals.supabase` to every request.
- `POST /api/auth/signout` — signs the user out and redirects to `/`. Standard HTML form POST is enough; no fetch needed.
- In Astro SSR all components (pages, layouts, sub-components) can read `Astro.locals` directly — no prop drilling required.
- Design language: dark gradient background, `border-white/10 bg-white/5 backdrop-blur-xl` glassmorphism pattern, gradient text `from-blue-200 to-purple-200`.

## Desired End State

Every authenticated page shows a sticky bar at the top:

- **Left**: "10xCards" logo (gradient text, links to `/`) + "Dashboard" link
- **Right**: user email (muted text) + "Sign out" button (form POST)

Auth pages (`/auth/signin`, `/auth/signup`, `/auth/confirm-email`) show no nav bar. Unauthenticated visitors see no nav bar.

## What We're NOT Doing

- User profile page or avatar
- Mobile hamburger menu / drawer
- Notification bell or badge
- Active link highlighting (future enhancement)
- Additional nav links beyond Dashboard (added as features ship)

## Implementation Approach

Create `src/components/NavBar.astro` that reads `Astro.locals.user` directly (no prop needed). Update `Layout.astro` to render `<NavBar />` when the user is present. The sign-out action reuses the existing `POST /api/auth/signout` endpoint via a native `<form>` — zero JavaScript required.

---

## Phase 1: NavBar Component & Layout Integration

### Overview

Create the NavBar Astro component and wire it into the Layout. Auth pages automatically skip it because `Astro.locals.user` is `null` there (middleware doesn't set a user for unauthenticated requests, and the nav only renders when user is truthy).

### Changes Required

#### 1. NavBar component

**File**: `src/components/NavBar.astro` (new file)

**Intent**: Render the sticky top navigation bar. Reads the authenticated user from `Astro.locals` — no prop needed. Conditionally returns nothing when `user` is null (safe to include in Layout unconditionally).

**Contract**: No props. Reads `const { user } = Astro.locals`. Returns an empty fragment when `user` is null. When user is present, renders a `<nav>` with:

- `sticky top-0 z-50` + glassmorphism classes (`border-b border-white/10 bg-black/20 backdrop-blur-xl`)
- Left: `<a href="/">` with gradient "10xCards" logo text + `<a href="/dashboard">` Dashboard link
- Right: `<span>` with `user.email` (muted color) + `<form method="POST" action="/api/auth/signout">` containing a submit button labeled "Sign out"

#### 2. Layout — include NavBar

**File**: `src/layouts/Layout.astro`

**Intent**: Render `<NavBar />` at the top of every page. Because NavBar handles the null-user case internally, Layout needs no conditional logic.

**Contract**: Import `NavBar` from `@/components/NavBar.astro`. Place `<NavBar />` as the first child inside `<body>`, before the existing banner and `<slot />`. No prop changes to Layout's own interface.

#### 3. Page content padding

**File**: `src/components/sets/SetDashboard.tsx`, `src/pages/sets/[id].astro`

**Intent**: The existing page wrappers use `p-4` with a full-height `min-h-screen` background. Adding a sticky nav shifts content down — no explicit padding-top adjustment is needed because the nav is `position: sticky` (takes up flow space), not `fixed`. Verify visually; adjust only if content clips under the bar.

**Contract**: No change required unless visual inspection reveals overlap. If needed, add `pt-0` or increase the existing top padding on the outermost `div` of each page.

### Success Criteria

#### Automated Verification

- Build passes: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification

- `/dashboard` shows NavBar with logo, Dashboard link, email, Sign out button
- NavBar sticks to top of viewport when scrolling
- Clicking "Sign out" signs the user out and redirects to `/`
- `/auth/signin` and `/auth/signup` show no NavBar
- Logo "10xCards" links back to `/`
- "Dashboard" link navigates to `/dashboard`

---

## Testing Strategy

### Manual Testing Steps

1. Sign in → navigate to `/dashboard` — confirm NavBar appears with email
2. Scroll down past the fold — confirm NavBar stays fixed at top
3. Click "Sign out" — confirm redirect to `/` with no NavBar
4. Visit `/auth/signin` — confirm no NavBar
5. Visit `/sets/[id]` — confirm NavBar appears identically

## References

- Layout: `src/layouts/Layout.astro`
- Middleware locals: `src/middleware.ts:16-18`
- Sign-out endpoint: `src/pages/api/auth/signout.ts`
- Glassmorphism pattern: `src/pages/sets/[id].astro:60` (`rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl`)
- Gradient text pattern: `src/components/sets/SetDashboard.tsx:56-58`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: NavBar Component & Layout Integration

#### Automated

- [x] 1.1 Build passes: `npm run build` — 57d006b
- [x] 1.2 Lint passes: `npm run lint` — 57d006b

#### Manual

- [x] 1.3 `/dashboard` shows NavBar with logo, Dashboard link, email, Sign out button — 57d006b
- [x] 1.4 NavBar sticks to top of viewport when scrolling — 57d006b
- [x] 1.5 Clicking "Sign out" signs the user out and redirects to `/` — 57d006b
- [x] 1.6 `/auth/signin` and `/auth/signup` show no NavBar — 57d006b
- [x] 1.7 Logo links to `/`, Dashboard link navigates to `/dashboard` — 57d006b
