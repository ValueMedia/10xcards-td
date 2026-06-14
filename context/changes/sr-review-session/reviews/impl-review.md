<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Spaced Repetition Review Session

- **Plan**: context/changes/sr-review-session/plan.md
- **Scope**: Fazy 1–2 (pełny plan)
- **Date**: 2026-06-14
- **Verdict**: REJECTED → FIXED (wszystkie krytyczne naprawione w triażu)
- **Findings**: 2 krytyczne · 3 ostrzeżenia · 2 obserwacje

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | FAIL → FIXED |
| Architecture | PASS |
| Pattern Consistency | WARNING → FIXED |
| Success Criteria | PASS |

## Findings

### F1 — getDueCardsForSession: brak weryfikacji właściciela zestawu

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — rzeczywisty problem, nieoczywista naprawa
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/reviews.ts:15–21
- **Detail**: Funkcja filtrowała po set_id bez sprawdzenia user_id. Każdy uwierzytelniony użytkownik mógł odczytać karty cudzego zestawu po GET /api/sets/<cudzy_uuid>/due-cards. RLS zwracał 0 wyników (brak wycieku danych), ale odpowiedź była semantycznie błędna.
- **Fix**: Dodano userId do sygnatury i sprawdzenie własności zestawu przez zapytanie na sets.
- **Decision**: FIXED + ACCEPTED-AS-RULE (lekcja: dostęp do zestawów musi sprawdzać user_id LUB share_token)

### F2 — submitCardReview: brak weryfikacji właściciela karty

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — cross-user mutacja stanu FSRS
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/reviews.ts:53
- **Detail**: Flashcard był pobierany tylko po id. Każdy uwierzytelniony użytkownik mógł wstawić review log i (próbować) zmutować stan FSRS cudzej karty. RLS blokował UPDATE, ale INSERT review logu z user_id atakującego przechodziły.
- **Fix**: Zmieniono zapytanie na join przez sets!inner(user_id) z filtrem .eq("sets.user_id", userId).
- **Decision**: FIXED (wraz z F1)

### F3 — Nieatomiczny zapis: insert reviews + update flashcards

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — niespójny stan DB przy awarii
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/reviews.ts:77–113
- **Detail**: Dwa osobne round-tripy bez transakcji. Jeśli insert przeszedł ale update nie — review log istniał, flashcard miał stary stan FSRS.
- **Fix A ⭐**: Supabase RPC (plpgsql) — atomowy INSERT + UPDATE w jednej transakcji. Migracja: supabase/migrations/20260614120000_submit_card_review_rpc.sql. Serwis wywołuje client.rpc("submit_card_review", {...}).
- **Decision**: FIXED via Fix A

### F4 — Limit 500 kart ładowanych do klienta bez dokumentacji

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — szybka decyzja
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/reviews.ts:21
- **Detail**: .limit(500) bez dokumentacji jako świadoma decyzja produktowa.
- **Fix**: Zmieniono limit na 100.
- **Decision**: FIXED

### F5 — /api/reviews nie w PROTECTED_API_ROUTES middleware

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — auth działał na poziomie endpointu
- **Dimension**: Pattern Consistency
- **Location**: src/middleware.ts:5
- **Detail**: Brak "/api/reviews" w PROTECTED_API_ROUTES. Auth sprawdzany tylko na poziomie endpointu.
- **Fix**: Dodano "/api/reviews" do PROTECTED_API_ROUTES.
- **Decision**: FIXED

### F6 — Błąd ładowania kart → faza "empty" zamiast "error"

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — toast informował, ale UI semantycznie mylący
- **Dimension**: Safety & Quality
- **Location**: src/components/review/ReviewSession.tsx:55–59
- **Detail**: Catch block ustawiał phase = "empty". Użytkownik widział "Brak kart do powtórki" mimo błędu sieciowego.
- **Fix**: Dodano fazę "error" z komunikatem i przyciskiem "Spróbuj ponownie" (retryCount trigger dla useEffect).
- **Decision**: FIXED

### F7 — grade: z.number().int() zamiast powiązania z Rating enum

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — zakres 1–4 był poprawny
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/reviews/index.ts:10
- **Detail**: Implicit coupling z ts-fsrs enum przez liczby magiczne.
- **Fix**: Zamieniono na z.union([z.literal(Rating.Again), z.literal(Rating.Hard), z.literal(Rating.Good), z.literal(Rating.Easy)]) (z.nativeEnum deprecated w tej wersji Zod).
- **Decision**: FIXED
