<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Prevent Duplicate Flashcards

- **Plan**: context/changes/prevent-duplicate-flashcards/plan.md
- **Mode**: Deep
- **Date**: 2026-06-21
- **Verdict**: REVISE → SOUND after fixes
- **Findings**: 0 critical 4 warnings 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | WARNING |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

Grounding: 6/6 paths ✓, 4/4 symbols ✓, brief↔plan ✓

Verified paths:
- src/lib/services/flashcards.ts
- src/pages/api/flashcards/index.ts
- src/pages/api/sets/[id]/flashcards/batch.ts
- src/pages/api/sets/[id]/generate.ts
- src/components/ai/GenerateFlashcardsPage.tsx
- src/components/sets/ImportCsvDialog.tsx

## Findings

### F1 — Single-create endpoint mapuje validationError na 500, nie 400

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Phase 2 — API Endpoints
- **Detail**: Plan zakładał, że manualne tworzenie duplikatu zwróci HTTP 400, ale src/pages/api/flashcards/index.ts:47-52 mapował validationError na 500.
- **Fix**: Dodano nową sekcję Phase 2.1 z kontraktem na mapowanie `validationError` → 400 oraz test manualny.
- **Decision**: FIXED via Fix in plan

### F2 — Frontend GenerateFlashcardsPage nie obsługuje skippedCount/skippedFronts z batch save

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 3 — GenerateFlashcardsPage
- **Detail**: Po zapisie propozycji AI przez batch endpoint pominięte duplikaty nie były raportowane w UI.
- **Fix B**: Pozostawiono bez zmian — uznanie, że duplikaty przy zapisie AI są mało widoczne.
- **Decision**: FIXED via Apply Fix B

### F3 — ImportCsvDialog ignoruje nowe pola z batch endpoint

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2.2 oraz Phase 3
- **Detail**: CSV import nie raportował pominiętych kart istniejących już w bazie, bo ImportCsvDialog parsował odpowiedź jako `{ data: Flashcard[] }`.
- **Fix**: Usunięto ImportCsvDialog z listy "What We're NOT Doing" i dodano kontrakt w Phase 2.2/Phase 3, by sumować per-chunk skippedCount do parseSkippedCount.
- **Decision**: FIXED via Fix in plan

### F4 — Brak obsługi błędów checkDuplicateFronts w generate endpoint

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 2.3 — generate.ts
- **Detail**: Plan nie precyzował, jak zachować się, gdy checkDuplicateFronts zwróci błąd (clientUnavailable/dbError).
- **Fix B**: Przy błędzie checkDuplicateFronts endpoint zwraca oryginalne propozycje LLM z removedCount=0 i removedFronts=[] (nie 500), by nie tracić kosztownego wyniku LLM.
- **Decision**: FIXED via Apply Fix B

## Triage Summary

- Fixed: F1, F3
- Accepted: F2, F4
- Skipped: 0
- Dismissed: 0

Updated verdict after fixes: SOUND.
