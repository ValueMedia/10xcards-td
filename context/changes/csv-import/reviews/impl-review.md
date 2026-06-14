<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: CSV/TXT Import (Anki format)

- **Plan**: context/changes/csv-import/plan.md
- **Scope**: All phases (1–3)
- **Date**: 2026-06-14
- **Verdict**: APPROVED (after fixes)
- **Findings**: 0 critical · 2 warnings · 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Automated Verification

- `npm run lint` ✅ EXIT:0
- `npm run build` ✅ EXIT:0
- `npm test -- csv-parser` ✅ 17/17 tests passed

## Findings

### F1 — res.json() unguarded on import success path

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/sets/ImportCsvDialog.tsx:138
- **Detail**: On the 2xx success path, `await res.json()` had no `.catch()`. A malformed/empty body would leave `step` stuck at `"importing"` with no recovery path. The error path at line 129 correctly guarded with `.catch(() => ({}))`, making the inconsistency visible.
- **Fix**: Wrapped `await res.json()` in try/catch on success path; on failure: slice committedCount, setError, setStep("preview"), toast.error.
- **Decision**: FIXED — 699bcef

### F2 — FileReader UTF-8 encoding undocumented

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/sets/ImportCsvDialog.tsx:87
- **Detail**: `reader.readAsText(file)` without explicit encoding defaults to UTF-8. Anki on Windows exports Windows-1250 by default — Polish diacritics would silently corrupt.
- **Fix B**: Replaced `FileReader` with `file.arrayBuffer()` + `TextDecoder("utf-8", { fatal: false })`. If decoded text contains `�` replacement characters, falls back to `TextDecoder("windows-1250")`.
- **Decision**: FIXED via Fix B — 699bcef

### F3 — No mounted guard in async handleImport

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/sets/ImportCsvDialog.tsx:101
- **Detail**: `handleImport()` is async. If the component unmounts mid-import, `setState`/`setStep` calls execute on an unmounted component. React 18 doesn't throw, but the work is wasted.
- **Fix**: Added `mountedRef = useRef(true)` + `useEffect` cleanup. Guard `if (!mountedRef.current) return` added at each post-await state-mutation point.
- **Decision**: FIXED — 699bcef

### F4 — Variable shadowing: `flashcards` parameter in handleImport

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/sets/SetDetailPage.tsx:66
- **Detail**: `handleImport` parameter named `flashcards` shadows the outer `flashcards` from state destructuring. Correct but visually confusing.
- **Fix**: Renamed parameter to `imported`.
- **Decision**: FIXED — 699bcef

### F5 — INITIAL_STATE() factory diverges from sibling dialog pattern

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/sets/ImportCsvDialog.tsx:30
- **Detail**: `CreateFlashcardDialog` and `EditFlashcardDialog` call setters directly in their reset functions. `ImportCsvDialog` introduced an `INITIAL_STATE()` factory as intermediary — two reset patterns in the same component family.
- **Fix**: Removed `INITIAL_STATE()` factory; `resetState()` now calls each setter directly.
- **Decision**: FIXED — 699bcef
