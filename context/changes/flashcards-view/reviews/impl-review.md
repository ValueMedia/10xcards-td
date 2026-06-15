<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Flashcard Browse View

- **Plan**: context/changes/flashcards-view/plan.md
- **Scope**: Wszystkie fazy (1–3 + post-plan changes)
- **Date**: 2026-06-16
- **Verdict**: NEEDS ATTENTION → APPROVED (po triage)
- **Findings**: 0 critical · 4 warnings · 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING (manualne niepotwierzone) |

## Findings

### F1 — browse.astro: wzorzec auth diverguje od review.astro

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW
- **Dimension**: Pattern Consistency
- **Location**: src/pages/sets/[id]/browse.astro:18
- **Detail**: Ternary zamiast wczesnego if-guard jak w review.astro. Middleware chroni trasę, brak luki bezpieczeństwa.
- **Fix**: Ujednolicić z review.astro — zastąpić ternary wczesnym if-guardem.
- **Decision**: FIXED

### F2 — FlashcardBrowseView: zbędny dep `position` w goNext/goPrev

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: src/components/sets/FlashcardBrowseView.tsx:22–34
- **Detail**: goNext/goPrev używają functional update settera, ale mają `position` w deps — powoduje re-rejestrację keyboard listener'a przy każdej zmianie karty.
- **Fix**: Przenieść guard do wnętrza functional settera i usunąć `position` z deps.
- **Decision**: FIXED

### F3 — FlashcardBrowseCard: brak role/tabIndex na klikalnym div

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: src/components/sets/FlashcardBrowseCard.tsx:12
- **Detail**: Zewnętrzny div z onClick nie ma role="button", tabIndex ani aria-label. Niedostępny przez Tab.
- **Fix**: Dodać role="button" tabIndex={0} aria-label i onKeyDown dla Enter.
- **Decision**: FIXED

### F4 — FlashcardBrowseView: brak guard na undefined currentCard

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: src/components/sets/FlashcardBrowseView.tsx:18
- **Detail**: Runtime crash przy pustym flashcards array bez defensive guard.
- **Fix**: Dodać early return gdy currentCard jest falsy.
- **Decision**: FIXED

### F5 — FlashcardBrowseCard: obie faces widoczne dla screen reader

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🔎 MEDIUM
- **Dimension**: Safety & Quality
- **Location**: src/components/sets/FlashcardBrowseCard.tsx:13–22
- **Detail**: CSS 3D flip nie usuwa elementów z DOM — screen reader widzi oba teksty jednocześnie.
- **Fix**: Dodać aria-hidden="true" na nieaktywną face.
- **Decision**: FIXED

### F6 — ReviewSession: keyboard guard nie obejmuje span-dzieci przycisków

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: src/components/review/ReviewSession.tsx:137
- **Detail**: `instanceof HTMLButtonElement` nie wychwytuje klików na <span> wewnątrz przycisków.
- **Fix**: Zmienić na `.closest('button, input')`.
- **Decision**: FIXED

### F7 — SetDetailPage: Browse renderuje <a> zamiast shadcn Button

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Pattern Consistency
- **Location**: src/components/sets/SetDetailPage.tsx:117
- **Detail**: Raw <a> zamiast Button component; wzorzec już istnieje (Rozpocznij sesję).
- **Fix**: Bez pilnej konieczności — tech debt.
- **Decision**: SKIPPED

### F8 — FlashcardBrowseView: shuffle dep na referencję tablicy flashcards

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: src/components/sets/FlashcardBrowseView.tsx:40
- **Detail**: `[flashcards]` dep powoduje nową referencję shuffle przy re-renderze. Aktualnie bez wpływu.
- **Fix**: Reguła exhaustive-deps wymaga [flashcards] — pozostawiono.
- **Decision**: SKIPPED (exhaustive-deps wymaga pełnego dep)
