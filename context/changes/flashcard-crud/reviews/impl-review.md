<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Manual Flashcard CRUD Implementation Plan

- **Plan**: `context/changes/flashcard-crud/plan.md`
- **Scope**: Full plan (phases 1–4)
- **Date**: 2026-06-13
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 7 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | WARNING |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Automated Verification

- `npm run build` — ✅ PASS
- `npm run lint` — ✅ PASS (tylko warningi parsera Astro `projectService`, nie związane z kodem)

## Findings

### F1 — Sort order drift in `getSetWithFlashcards`

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: `src/lib/services/sets.ts:113`
- **Detail**:
  Plan ("Key Discoveries" oraz manual testing step 7) zakłada, że `getSetWithFlashcards()` zwraca fiszki w kolejności `created_at DESC`, więc nowa fiszka pojawia się na górze i pasuje do optymistycznego `onCreate` prepend w UI. Implementacja używa `.order("created_at", { ascending: true })`, więc najnowsza fiszka jest na dole — optymistyczna aktualizacja dodaje ją na górę, ale po refreshu znajdzie się na dole. To niespójność UX.
- **Fix**: Zmienić `.order("created_at", { ascending: true })` na `.order("created_at", { ascending: false })`.
  - Strength: Przywraca zgodność z planem i spójność optymistycznej aktualizacji UI.
  - Tradeoff: Brak — jedna linijka.
  - Confidence: HIGH — plan jasno opisuje to wymaganie.
  - Blind spot: None significant.
- **Decision**: PENDING

### F2 — Service contract drift: `userId` parameter added

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `src/lib/services/flashcards.ts`
- **Detail**:
  Plan Phase 1 definiuje kontrakt serwisu bez parametru `userId`: `createFlashcard(client, setId, content)`. Implementacja dodaje `userId`: `createFlashcard(client, userId, setId, content)` (analogicznie update/delete). To pozytywna zmiana bezpieczeństwa (ownership check), ale kontrakt w planie jest nieaktualny.
- **Fix**: Zaktualizować kontrakt w `plan.md` Phase 1, aby odzwierciedlał `userId`.
  - Strength: Plan staje się ground truth dla przyszłych review i implementacji.
  - Tradeoff: Niewielka aktualizacja dokumentacji.
  - Confidence: HIGH — zmiana jest już wdrożona i działa.
  - Blind spot: None significant.
- **Decision**: PENDING

### F3 — `getSetWithFlashcards` lacks explicit ownership filter

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: `src/lib/services/sets.ts:104`
- **Detail**:
  Funkcja `getSetWithFlashcards(client, setId)` pobiera zestaw bez filtra `user_id`. Polega wyłącznie na RLS po stronie klienta SSR. To działa obecnie, ponieważ `src/pages/sets/[id].astro` i `src/pages/api/sets/[id]/flashcards.ts` przekazują `supabase` z kontekstu użytkownika. Jednak jeśli funkcja zostanie użyta z innym klientem (np. service role, admin, anon), filtr zniknie. Dodatkowo endpoint `GET /api/sets/[id]/flashcards` nie przekazuje `user.id` do serwisu, więc wszelka przyszła zmiana klienta otwiera furtkę do wycieku.
- **Fix A ⭐ Recommended**: Dodać `userId` do `getSetWithFlashcards` i filtrować `.eq("user_id", userId)` (lub join przez `sets!inner`). Zaktualizować wszystkich callerów.
  - Strength: Obronna głębokość — serwis sam gwarantuje własność, niezależnie od klienta.
  - Tradeoff: Wymaga zmiany sygnatury i aktualizacji callerów (`sets/[id].astro`, `api/sets/[id]/flashcards.ts`).
  - Confidence: HIGH — ten sam wzorzec już stosowany w `flashcards.ts`.
  - Blind spot: None significant.
- **Fix B**: Pozostawić jak jest i uznać RLS za wystarczające.
  - Strength: Mniej kodu, mniejszy diff.
  - Tradeoff: Serwis nie jest samodzielnie bezpieczny; przyszłe użycie z innym klientem może wyciekać.
  - Confidence: MEDIUM — RLS działa, ale jest jedną warstwą obrony.
  - Blind spot: Nie zweryfikowano wszystkich przyszłych callerów.
- **Decision**: PENDING

### F4 — Error-to-status mapping relies on string substring

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/pages/api/flashcards/index.ts:48`, `src/pages/api/flashcards/[id].ts:46,80`
- **Detail**:
  Kod mapuje błędy DB na kody HTTP przez `error.includes("not found")`. Jeśli komunikat błędu Supabase się zmieni, zwróci się 500 zamiast 404. To kruchy kontrakt.
- **Fix**: W serwisie zwracać kategoryczne kody błędów (np. enum `{ notFound, unknown }`) i sprawdzać je w API; lub zachować obecny string ale dodać testy/regresję.
  - Strength: Trwały kontrakt, niezależny od tekstów błędów Supabase.
  - Tradeoff: Większa zmiana — wymaga refaktoryzacji service + API.
  - Confidence: MEDIUM — zmiana jest poprawna, ale dotyka kilku plików.
  - Blind spot: None significant.
- **Decision**: PENDING

### F5 — TOCTOU in flashcard update/delete ownership check

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `src/lib/services/flashcards.ts:29-47,49-65`
- **Detail**:
  `updateFlashcard` i `deleteFlashcard` wykonują dwa zapytania: najpierw `select` sprawdzający własność, potem `update`/`delete`. Między nimi może nastąpić zmiana własności zestawu (choć `set_id` nie jest edytowalny przez CRUD, może być modyfikowany bezpośrednio w DB). RLS chroni przed złą modyfikacją, ale aplikacja nie otrzymuje jasnej informacji zwrotnej.
- **Fix**: Połączyć sprawdzenie własności z operacją w jednym zapytaniu, np. `.update(...).eq("id", flashcardId).eq("sets.user_id", userId)` lub użyć RLS jako źródła prawdy i obsługiwać pusty wynik jako 404.
  - Strength: Eliminuje okno czasowe między sprawdzeniem a operacją.
  - Tradeoff: Wymaga zmiany w serwisie; może być trudniejsze do debugowania bez jasnego komunikatu.
  - Confidence: MEDIUM — poprawne, ale marginalne ryzyko w praktyce.
  - Blind spot: None significant.
- **Decision**: PENDING

### F6 — `last_opened_at` not updated when opening a set

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architecture / Data consistency
- **Location**: `src/pages/sets/[id].astro:9`
- **Detail**:
  Strona `/sets/[id]` wyświetla zestaw, ale nie aktualizuje `last_opened_at`. `SetCard` na dashboardzie pokazuje to pole, więc informacja będzie nieaktualna (`null` lub starsza data).
- **Fix**: Po załadowaniu zestawu wykonać `UPDATE sets SET last_opened_at = now() WHERE id = ... AND user_id = ...`. Można dodać do `getSetWithFlashcards` lub jako osobne wywołanie w `sets/[id].astro`.
  - Strength: Dashboard wyświetla rzeczywiste dane.
  - Tradeoff: Dodatkowe zapytanie przy każdym otwarciu strony; dla MVP akceptowalne.
  - Confidence: HIGH — prosta zmiana.
  - Blind spot: None significant.
- **Decision**: PENDING

### F7 — `DELETE /api/sets/[id]` returns 500 for "not found"

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `src/pages/api/sets/[id].ts:81-85`
- **Detail**:
  `DELETE /api/sets/[id]` zawsze zwraca 500 przy błędzie, w tym gdy zestaw nie istnieje. Jest to niespójne z `PATCH` w tym samym pliku oraz z `DELETE /api/flashcards/[id].ts`, które mapują "not found" na 404.
- **Fix**: Dodać `const status = error.includes("not found") ? 404 : 500;` w `DELETE /api/sets/[id]`.
  - Strength: Spójność z resztą API i lepszy UX.
  - Tradeoff: Brak — jedna linijka.
  - Confidence: HIGH — ten sam wzorzec w innych endpointach.
  - Blind spot: None significant.
- **Decision**: PENDING

### F8 — Large sets loaded without pagination

- **Severity**: ⚠️ OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architecture / Performance
- **Location**: `src/lib/services/sets.ts:109-115`, `src/pages/sets/[id].astro:66`
- **Detail**:
  `getSetWithFlashcards` pobiera wszystkie fiszki zestawu bez limitu/offsetu. Przy dużych zestawach strona będzie ładować dużo danych. Plan wyraźnie mówi "No pagination for MVP scale (< 50 flashcards per set initially)".
- **Fix**: Brak wymaganej zmiany — poza scope MVP. Można dodać follow-up dla przyszłej paginacji.
  - Strength: Zgodne z planem.
  - Tradeoff: None.
  - Confidence: HIGH — plan wyraźnie wyklucza paginację.
  - Blind spot: None significant.
- **Decision**: PENDING

### F9 — `renameSet` manually sets `updated_at`

- **Severity**: ⚠️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture / Data consistency
- **Location**: `src/lib/services/sets.ts:71`
- **Detail**:
  `renameSet` ręcznie ustawia `updated_at: new Date().toISOString()` mimo istnienia triggera `sets_handle_updated_at` w bazie. To duplikacja logiki i ryzyko niespójności stref czasowych (Node.js vs Postgres).
- **Fix**: Usunąć ręczne ustawianie `updated_at` i polegać na triggerze DB.
  - Strength: Single source of truth dla timestamps.
  - Tradeoff: Minimalna zmiana; trzeba upewnić się, że trigger działa.
  - Confidence: HIGH — trigger istnieje w migracjach.
  - Blind spot: None significant.
- **Decision**: PENDING

## Triage Decisions

All findings currently pending; triage was not run.
