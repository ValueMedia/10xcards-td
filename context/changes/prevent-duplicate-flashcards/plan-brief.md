# Prevent Duplicate Flashcards — Plan Brief

> Full plan: `context/changes/prevent-duplicate-flashcards/plan.md`

## What & Why

Podczas dodawania fiszek manualnie, przez lookup_word, lub przez generowanie AI, sprawdzamy czy front (pytanie) już istnieje w danym zestawie. Manualne tworzenie odrzuca duplikat z błędem 400. Batch creation (CSV, AI save) pomija duplikaty i raportuje je. AI harness filtruje propozycje z LLM po stronie serwera, zanim trafią do frontendu — użytkownik widzi banner z informacją o usuniętych duplikatach.

## Starting Point

Brak jakiejkolwiek detekcji duplikatów. Tabela `flashcards` nie ma unique constraint na `front`. Trzy ścieżki tworzenia kart (`createFlashcard`, `createFlashcardsBulk`, `generateFlashcardProposals`) nie sprawdzają istniejących frontów. Serwisy używają `ServiceError` discriminated union (kinds: `notFound`, `clientUnavailable`, `dbError`, `validationError`). Frontend obsługuje błędy przez sonner toasty + inline text.

## Desired End State

1. **Manual/lookup**: duplikat frontu → 400 "A flashcard with this front text already exists in this set."
2. **Batch (CSV/AI save)**: duplikaty pomijane, odpowiedź zawiera `skippedCount` + `skippedFronts`
3. **AI generate**: endpoint filtruje propozycje po stronie serwera, zwraca `{ flashcards, removedCount, removedFronts }`. Frontend pokazuje amber banner nad listą.
4. **OpenAPI** udokumentowany.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Porównywanie frontów | Normalized (trim + lowercase) | Łapie spacje i case bez ryzyka false positives agresywnej normalizacji. | Plan |
| Batch przy duplikatach | Skip duplicates, save rest | Nie tracimy poprawnych kart — kluczowe dla CSV i AI save. | Plan |
| Błąd manualnego duplikatu | 400 + `validationError` kind | Istniejący frontend już obsługuje 400 — zero zmian w `CreateFlashcardDialog` i `LookupWordPage`. | Plan |
| Harness AI | Server-side w `generate.ts` | Jedno źródło prawdy, frontend dostaje czyste dane, dodatkowe query do DB jest zaniedbywalne vs latency LLM. | Plan |
| Response shape generate | `{ flashcards, removedCount, removedFronts }` | Użytkownik widzi nie tylko liczbę ale i CO zostało usunięte. | Plan |
| UI dla usuniętych duplikatów | Amber banner nad listą propozycji | Wyraźne, nieinwazyjne, widoczne przed przeglądaniem kart. | Plan |
| Komunikat błędu | "A flashcard with this front text already exists in this set." | Jasne, konkretne, po angielsku (spójne z resztą API). | Plan |

## Scope

**In scope:**
- `checkDuplicateFronts` helper w `flashcards.ts`
- Duplicate check w `createFlashcard` (blokada) i `createFlashcardsBulk` (pomijanie)
- AI harness w `generate.ts` (filtrowanie propozycji)
- Banner w `GenerateFlashcardsPage.tsx`
- OpenAPI spec update

**Out of scope:**
- DB-level unique constraint
- Duplicate detection na `back`
- Fuzzy/near-duplicate matching
- Blokada duplikatów przy `updateFlashcard`
- Zmiany w `ImportCsvDialog` (działa naturalnie przez batch endpoint)
- i18n dla komunikatu błędu

## Architecture / Approach

```
checkDuplicateFronts(setId) → Set<normalizedFront>
         ↓
    ┌────┴────────────────────┐
    │                         │
createFlashcard          createFlashcardsBulk
  → block if dup            → skip dups, report
  → 400 validationError     → { data, skippedCount, skippedFronts }
    │                         │
    ▼                         ▼
POST /api/flashcards     POST /api/sets/{id}/flashcards/batch
(already handles 400)    (new fields in response)

generateFlashcardProposals (LLM)
         ↓
checkDuplicateFronts(setId)
         ↓
filter proposals → { flashcards, removedCount, removedFronts }
         ↓
POST /api/sets/{id}/generate (new fields)
         ↓
GenerateFlashcardsPage (amber banner)
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Service layer | `checkDuplicateFronts`, modified `createFlashcard` + `createFlashcardsBulk` | Query fetching all fronts for large sets (mitigated: front ≤ 1000 chars, typical sets < 500 cards) |
| 2. API endpoints | Batch response with skipped info, generate harness with removed info | Response shape changes must stay backward-compatible for existing callers |
| 3. Frontend | Amber banner in `GenerateFlashcardsPage` | Banner must clear on discard/new generation |
| 4. OpenAPI spec | Documented new fields and error scenarios | Must match actual implementation exactly |

**Prerequisites:** Local Supabase running, existing set with some flashcards for manual testing
**Estimated effort:** ~2-3 sessions across 4 phases

## Open Risks & Assumptions

- **Large sets**: `checkDuplicateFronts` fetches all fronts. For sets with 10k+ cards this could be slow. Assumption: typical sets have < 500 cards. If this becomes a problem, add a DB index on `(set_id, front)` and use a targeted query.
- **Concurrent creation**: Two users (or two tabs) could create the same front between the check and the insert. Assumption: acceptable race condition — the window is tiny and the impact is a duplicate that slips through, not data loss.
- **Normalization edge cases**: Unicode normalization (NFD/NFC) is not applied — "café" and "cafe\u0301" would be treated as different. Assumption: rare enough to ignore for now.

## Success Criteria (Summary)

- Manual creation of duplicate front → blocked with clear error message
- Batch creation silently skips duplicates and reports them
- AI generation filters duplicates server-side, frontend shows amber banner
- OpenAPI docs reflect all changes
