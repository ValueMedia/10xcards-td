<!-- PLAN-REVIEW-REPORT -->
# Plan Review: CSV/TXT Import (Anki format)

- **Plan**: `context/changes/csv-import/plan.md`
- **Mode**: Deep
- **Date**: 2026-06-14
- **Verdict**: SOUND (after fixes)
- **Findings**: 0 critical · 2 warnings · 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

3/3 existing paths ✓ · 5/5 symbols ✓ (vitest config, Button variant="outline", Dialog exports, SetDetailPage consumers ×1, batch endpoint callers ×2) · brief↔plan ✓

## Findings

### F1 — Testy jednostkowe napisane, ale nigdy nie uruchamiane

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — szybka decyzja; naprawa oczywista i wąska
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Automated Verification
- **Detail**: Phase 1 tworzy csv-parser.test.ts, ale automated criteria sprawdzają tylko lint + build. Projekt ma vitest skonfigurowany. Testy mogły być niefunkcjonalne bez wykrycia.
- **Fix**: Dodaj `npm test -- csv-parser` do Automated Verification Phase 1 + Progress.
- **Decision**: FIXED — dodano kryterium 1.3 `npm test -- csv-parser passes` do Phase 1 i Progress.

### F2 — Duplikaty fiszek przy retry po częściowym błędzie chunka

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — prawdziwy tradeoff; przemyśl przed decyzją
- **Dimension**: Blind Spots
- **Location**: Phase 2 — on import error path
- **Detail**: Po częściowym błędzie preview nadal pokazuje WSZYSTKIE oryginalne karty. Retry zduplikowałby już zapisane karty.
- **Fix A ⭐**: Po błędzie usuń z proposals karty commitowanych chunków; retry importuje tylko niezapisane.
- **Fix B**: Zablokuj retry — partial-success to stan końcowy.
- **Decision**: FIXED via Fix A — plan zaktualizowany o `committedCount` bookkeeping i usuwanie commitowanych propozycji z listy przed resetem do preview.

### F3 — FileReader.onerror nie jest opisany w planie

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — szybka decyzja
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Step 1 upload
- **Detail**: Plan opisuje wyłącznie ścieżkę onload. FileReader.onerror połknąłby błąd w ciszy.
- **Fix**: Dodaj obsługę onerror do Phase 2 Contract.
- **Decision**: FIXED — dodano: "on onerror: error = 'Failed to read file', stay on step 1."

### F4 — Tie-breaking separatorów nieokreślony

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — szybka decyzja
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — CSV parser algorithm (krok 3)
- **Detail**: Algorytm nie definiuje rozstrzygnięcia remisu przy autodetekcji separatora.
- **Fix**: Dopisz regułę: wcześniejszy w tablicy wygrywa.
- **Decision**: FIXED — dodano: "On a tie, the earlier candidate in the array wins (i.e. ";" beats "\t" beats "-")."
