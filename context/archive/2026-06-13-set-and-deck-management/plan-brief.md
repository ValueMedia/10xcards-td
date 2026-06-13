# Set & Deck Management — Plan Brief

> Full plan: `context/changes/set-and-deck-management/plan.md`

## What & Why

Użytkownik potrzebuje zarządzać zestawami fiszek — przeglądać, tworzyć, zmieniać nazwę i usuwać. Zestawy to główny kontener nawigacyjny aplikacji: bez nich nie da się dotrzeć do sesji powtórkowej (S-05), statystyk (S-06), ani wygenerować linku read-only (S-07). Dashboard z siatką kart zastępuje obecny placeholder.

## Starting Point

Dashboard to statyczny placeholder (`src/pages/dashboard.astro`) — wyświetla tylko email użytkownika i przycisk wylogowania. Nie ma żadnych API endpointów dla zestawów, żadnych React komponentów związanych z zestawami, ani żadnego wywołania `supabase.from()` w całym codebase. Schemat bazy (`sets`, `flashcards`) i RLS są gotowe z F-01. Typy `FlashcardSet`, `Flashcard` istnieją w `src/types.ts`. Auth i middleware działają.

## Desired End State

Zalogowany użytkownik widzi dashboard z responsywną siatką kart zestawów (nazwa, liczba fiszek, data otwarcia). Przycisk "+" otwiera dialog tworzenia zestawu. Każda karta ma dropdown menu z opcjami Rename i Delete — obie otwierają dialogi potwierdzenia. Wszystkie mutacje pokazują sonner toast. Kliknięcie karty przenosi do `/sets/[id]` gdzie użytkownik przegląda fiszki w trybie read-only. API zwraca JSON, jest chronione przez middleware, a logika Supabase jest w warstwie serwisowej.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| API structure | RESTful `/api/sets/` + `/api/sets/[id]` | Przewidywalny, pasuje do Astro file-based routingu. | Plan |
| Dashboard UX | Siatka kart (grid) | Wizualnie atrakcyjne, pasuje do cosmic/glassmorphism theme. | Plan |
| Input validation | Zod (server + client) | Spójna walidacja po obu stronach, standard w ekosystemie. | Plan |
| Notifications | Sonner toast | Nowoczesny, nieinwazyjny UX, React 19-kompatybilny. | Plan |
| Data access layer | Service (`src/lib/services/sets.ts`) | Testowalność, reuse, czystsze API routes. | Plan |
| Flashcard browsing | Osobna strona `/sets/[id]` | Czysta separacja, gotowa pod S-03 (flashcard-crud). | Plan |
| Set deletion UX | Dialog potwierdzenia | Chroni przed przypadkowym usunięciem + kaskadą fiszek. | Plan |
| shadcn components | Dialog + Input + Card + DropdownMenu | Pełny zestaw pod S-02 i przyszłe slice'y. | Plan |
| Middleware fix | Boundary-aware `startsWith` | `startsWith("/sets")` łapie też `/settings` — latent bug. | Plan |

## Scope

**In scope:**
- Dashboard z siatką kart zestawów
- Tworzenie zestawu przez dialog
- Zmiana nazwy zestawu przez dialog
- Usuwanie zestawu przez dialog potwierdzenia
- Przeglądanie fiszek w zestawie (read-only, `/sets/[id]`)
- Sonner toast notifications dla wszystkich mutacji
- Zod walidacja nazwy zestawu
- Warstwa serwisowa `src/lib/services/sets.ts`
- Middleware ochrona `/sets` i `/api/sets`

**Out of scope:**
- CRUD fiszek (S-03)
- Generowanie AI (S-01)
- Import CSV (S-04)
- Linki read-only (S-07)
- Sesje powtórkowe (S-05)
- Statystyki (S-06)
- Paginacja, wyszukiwanie, filtrowanie
- Drag-and-drop, bulk operations

## Architecture / Approach

Bottom-up: zależności → middleware → serwis + API → UI. Dashboard renderuje początkową listę zestawów server-side (Astro frontmatter + Supabase query), a React island (`SetDashboard`) zarządza mutacjami client-side przez fetch + JSON. API routes używają Zod do walidacji i zwracają JSON — nowy wzorzec w codebase. Sonner `<Toaster />` w shared layoucie.

```
Astro SSR (dashboard.astro)
  ├── server-side: supabase.from("sets") → initialSets
  └── client-side: <SetDashboard sets={initialSets}>
        ├── SetGrid → SetCard (×N)
        ├── CreateSetDialog → fetch POST /api/sets
        ├── RenameSetDialog → fetch PATCH /api/sets/[id]
        └── DeleteSetDialog → fetch DELETE /api/sets/[id]

Astro SSR (sets/[id].astro)
  └── server-side: supabase.from("sets") + supabase.from("flashcards")
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Dependencies & shadcn | zod, sonner, Dialog, Input, Card, DropdownMenu | Nic — same install commands. |
| 2. Middleware | Protected `/sets` + `/api/sets`, fixed `startsWith` bug | Regresja na `/dashboard` — testować. |
| 3. Service & API | `sets.ts` service + 3 endpointy REST + Zod walidacja | Pierwsze `supabase.from()` — obsługa null clienta. |
| 4. Dashboard UI | Siatka kart, dialogi create/rename/delete, sonner toasty | Najwięcej komponentów — integracja fetch + state. |
| 5. Set detail page | `/sets/[id]` z listą fiszek (read-only) | Pierwszy dynamic route — testować 404/403. |

**Prerequisites:** F-01 (schema + RLS) — done. Local Supabase running.
**Estimated effort:** ~3-4 sesje implementacyjne (5 faz, każda ~30-60 min).

## Open Risks & Assumptions

- **Pierwsze `supabase.from()` w codebase** — brak wzorca do naśladowania; serwis musi obsłużyć `null` client case.
- **Flashcard count na kartach** — `FlashcardSet` nie ma pola `flashcard_count`; MVP pokazuje "—". S-03 może dodać count query.
- **Sonner w layoucie** — `client:load` directive; upewnić się, że nie powoduje layout shiftu.
- **Dynamic route `[id]`** — pierwszy w projekcie; Astro SSR mode powinien działać bez `getStaticPaths`.

## Success Criteria (Summary)

- Dashboard pokazuje siatkę kart zestawów (lub empty state)
- Tworzenie, zmiana nazwy i usuwanie zestawu działa przez dialogi + toasty
- Walidacja nazwy (pusta/nadmiarowa) pokazuje błędy inline
- `/sets/[id]` pokazuje fiszki w zestawie (read-only)
- Niezalogowany użytkownik jest redirectowany z `/sets` i `/api/sets`
- Cross-user isolation: nie można zobaczyć cudzego zestawu
