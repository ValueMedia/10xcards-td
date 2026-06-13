<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Set & Deck Management

- **Plan**: `context/changes/set-and-deck-management/plan.md`
- **Scope**: All phases (1–5, full plan)
- **Date**: 2026-06-13
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 6 warnings, 2 observations

## Verdicts

| Dimension            | Verdict |
|----------------------|---------|
| Plan Adherence       | WARNING |
| Scope Discipline     | PASS    |
| Safety & Quality     | WARNING |
| Architecture         | WARNING |
| Pattern Consistency  | PASS    |
| Success Criteria     | PASS    |

## Findings

### F1 — Middleware redirects API routes to HTML sign-in instead of JSON 401

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Architecture
- **Location**: `src/middleware.ts:25-31`
- **Detail**: Middleware protects `/api/sets/*` the same way as page routes — redirecting to `/auth/signin` with a 302. The dialog components call `fetch("/api/sets/...")` and expect JSON `{ error: "Unauthorized" }` on 401. An expired session now returns an HTML redirect, causing a JSON parse error in the dialogs instead of a clean "session expired" message.
- **Fix A ⭐ Recommended**: In middleware, return `new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } })` for `/api/*` paths instead of redirecting.
  - Strength: Matches the contract all API route handlers already implement; dialogs can handle JSON errors cleanly.
  - Tradeoff: Small middleware change — add a path-type check before the redirect.
  - Confidence: HIGH — the API handlers at lines 7-12 already define the right pattern.
  - Blind spot: None significant.
- **Fix B**: Remove API auth from middleware entirely; let each route handler own the 401.
  - Strength: Cleaner separation — middleware only guards pages.
  - Tradeoff: Every new API route must remember to add its own auth check; more boilerplate.
  - Confidence: MEDIUM — current handlers do already check auth, so this works, but it's harder to audit.
  - Blind spot: Any future API route that forgets the check becomes publicly accessible.
- **Decision**: PENDING

### F2 — `getSetWithFlashcards` uses `.single()` — returns 500 for not-found instead of 404

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `src/lib/services/sets.ts:79`
- **Detail**: `.single()` throws a Supabase error when zero rows are returned (PGRST116). The service returns `{ data: null, error: "..." }` which the set detail page and flashcards API treat as a generic error — rendering "Set not found" via 404 in one case but returning 500 from `/api/sets/[id]/flashcards`. The distinction matters for callers who inspect HTTP status codes.
- **Fix**: Replace `.single()` with `.maybeSingle()` in `getSetWithFlashcards`. Check `data === null` for the not-found case vs a real DB error on `error`.
- **Decision**: PENDING

### F3 — `RenameSetDialog` input state doesn't reset when target set changes

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `src/components/sets/RenameSetDialog.tsx:24`
- **Detail**: `name` is initialized via `useState(set?.name ?? "")` once at mount. Because the component stays mounted, opening the rename dialog for set B after previously renaming set A shows set A's name (or blank). The `open` flag changes but the `name` state doesn't reset. This is a user-visible bug.
- **Fix**: Add `useEffect(() => { if (open && set) { setName(set.name); setError(null); } }, [open, set])` to sync state when the dialog opens for a new target.
- **Decision**: PENDING

### F4 — `getSetWithFlashcards` has no `userId` filter — relies solely on RLS

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/lib/services/sets.ts:70`
- **Detail**: All other service functions (`listSets`, `renameSet`, `deleteSet`) pass `userId` and include `.eq("user_id", userId)` filters as a defensive layer. `getSetWithFlashcards` only filters by `id` and relies entirely on RLS. Pattern is inconsistent and leaves a gap if RLS is ever misconfigured.
- **Fix**: Add `userId` parameter and `.eq("user_id", userId)` to the set query in `getSetWithFlashcards`; update the two call sites (`src/pages/sets/[id].astro`, `src/pages/api/sets/[id]/flashcards.ts`).
- **Decision**: PENDING

### F5 — `deleteSet` returns 200 even when no row was deleted

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/lib/services/sets.ts:57-67`
- **Detail**: `deleteSet` calls `.delete().eq("id", setId).eq("user_id", userId)` but doesn't check if any row was actually affected. Deleting a nonexistent or already-deleted set silently returns `{ error: null }`, propagating `200 { success: true }` to the client. The client removes the card from local state for a set that may never have existed.
- **Fix**: Chain `.select("id")` before executing, or use PostgREST `Prefer: return=representation` header; return a not-found error when count is 0.
- **Decision**: PENDING

### F6 — SSR pages swallow service errors, rendering them as empty/not-found states

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/pages/dashboard.astro:7`, `src/pages/sets/[id].astro:8`
- **Detail**: `dashboard.astro` destructures only `{ data: sets }`, dropping `error`. `sets/[id].astro` destructures only `{ data }` — a DB timeout or config error silently renders as empty dashboard or "Set not found" 404. Real infrastructure failures become indistinguishable from normal empty states.
- **Fix**: Destructure `{ data, error }` and render a distinct error state (or 500 response) when `error` is non-null and `data` is null.
- **Decision**: PENDING

### F7 — Dashboard passes `initialSets` as JSON string, not typed `FlashcardSet[]`

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `src/pages/dashboard.astro:11`, `src/components/sets/SetDashboard.tsx:10`
- **Detail**: Plan contracted `{ initialSets: FlashcardSet[]; userId: string }`. Implementation passes `initialSets={JSON.stringify(sets ?? [])}` and the component parses it internally; `userId` prop is absent. This works correctly at runtime but drifts from the plan contract, and losing `userId` as a prop means the component can't be tested in isolation with a known user context.
- **Fix**: No urgent code change — note as acceptable adaptation. If isolation testing becomes a priority for S-03, pass `userId` as a typed prop then.
- **Decision**: PENDING

### F8 — SetCard uses `onClick` callback instead of `<a href>` wrapper for navigation

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `src/components/sets/SetCard.tsx:30`
- **Detail**: Plan specified the card body wrapped in `<a href={/sets/${set.id}}>`. Implementation uses `onClick={onOpen}` on the Card div (which calls `window.location.href`). Functionally equivalent for mouse clicks but loses right-click → "Open in new tab", keyboard navigation, and browser prefetch hints. `flashcardCount` prop is also absent — showing "—" inline per the plan note.
- **Fix**: Replace card-level `onClick` + `window.location.href` with a proper `<a>` wrapper or an `<a>` overlay using the CSS stretched-link pattern, preserving `stopPropagation` on the dropdown trigger.
- **Decision**: PENDING
