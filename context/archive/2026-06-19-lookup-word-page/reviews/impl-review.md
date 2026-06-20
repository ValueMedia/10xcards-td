<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Lookup Word Page

- **Plan**: context/changes/lookup-word-page/plan.md
- **Scope**: Phases 1–4 (all)
- **Date**: 2026-06-19
- **Verdict**: NEEDS ATTENTION (resolved during triage)
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

Automated success criteria re-verified post-triage: `npm run build` ✅ (Complete!), `npx eslint` on changed TS/TSX ✅ (exit 0).

## Findings

### F1 — No response-ordering guard in runSearch

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: src/components/lookup/LookupWordPage.tsx:50-78
- **Detail**: `runSearch` had no AbortController or request-id guard, so an out-of-order (superseded) dictionary response could overwrite the latest search's state. Heavily mitigated in practice — the input and button are disabled while loading and `runSearch` early-returns on `loading` — so UI-triggered overlap is nearly impossible. This was a correctness backstop, not a live bug.
- **Fix**: Added a monotonic `searchSeqRef`; each call captures `seq = ++searchSeqRef.current` and bails before any setState if `seq !== searchSeqRef.current` (also guards the `finally` setLoading).
- **Decision**: FIXED (Fix now)

### F2 — Create form ignores the server error body

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/lookup/LookupWordPage.tsx (CreateCardForm.submit)
- **Detail**: On a non-201 response the form showed a single generic localized message and never read `res.json()`, diverging from the sibling `CreateFlashcardDialog`, which surfaces `body.error` (e.g. 404 "Set not found", 400 "Validation failed"). Defensible (client validates with the same `flashcardContentSchema`) but weaker than the established pattern.
- **Fix**: Read `res.json()` (with a null-safe catch) and show `body.error` when present, falling back to the generic `lookup.form.error`.
- **Decision**: FIXED (Fix now)

### F3 — Scrollable results container (max 2 cards) not described in plan

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/components/lookup/LookupWordPage.tsx (ResultsList, MAX_VISIBLE_CARDS)
- **Detail**: `ResultsList` caps visible result cards to 2 via a `useLayoutEffect` height measurement, with the rest scrolling. Not in the plan, but explicitly requested by the user mid-implementation. Legitimate scope expansion, not drift; no risk.
- **Decision**: ACCEPTED (no change)
