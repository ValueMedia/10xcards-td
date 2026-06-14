---
project: 10xCards
version: 1
status: draft
created: 2026-06-10
updated: 2026-06-14
prd_version: 1
main_goal: market-feedback
top_blocker: capacity
---

# Roadmap: 10xCards

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Ręczne tworzenie fiszek edukacyjnych jest barierą wejścia do spaced repetition — metody uznawanej za jedną z najskuteczniejszych, ale wymagającej żmudnego przygotowania materiału. Istniejące narzędzia (Anki, Quizlet) umożliwiają import tekstu, ale jakość generowanych fiszek jest niska lub wymaga rozbudowanej ręcznej edycji. 10xCards rozwiązuje ten problem: użytkownik wkleja własny tekst (notatki, artykuł, skrypt egzaminacyjny), a AI generuje gotowe fiszki do nauki — eliminując czas przygotowania i pozostawiając człowiekowi decyzję o akceptacji każdej propozycji.

## North star

**S-01: AI generuje fiszki, user recenzuje i zapisuje do zestawu** — bezpośrednio testuje kryterium sukcesu (75% fiszek AI zaakceptowanych bez edycji) i udowadnia core hypothesis: model językowy rozumie tekst wystarczająco dobrze, by produkować fiszki warte natychmiastowego użycia.

> Gwiazda przewodnia — pierwsza historyjka end-to-end, której pomyślne dostarczenie udowadnia, że produkt spełnia swoją podstawową obietnicę — sequenced as early as possible, because everything else only matters if this works. Jeśli AI nie produkuje akceptowalnych fiszek, cała reszta roadmapy nie ma znaczenia.

## At a glance

| ID   | Change ID               | Outcome (user can …)                                             | Prerequisites    | PRD refs                       | Status   |
| ---- | ----------------------- | ---------------------------------------------------------------- | ---------------- | ------------------------------ | -------- |
| F-01 | data-schema             | (foundation) tabele sets, flashcards, reviews z RLS              | —                | FR-001, §Access Control        | done     |
| S-01 | ai-flashcard-generation | wkleić tekst, otrzymać propozycje AI i zapisać fiszki do zestawu | F-01             | FR-002, FR-003, US-01          | done     |
| S-02 | set-and-deck-management | przeglądać zestawy, tworzyć, zmieniać nazwę i usuwać             | F-01             | FR-007                         | done     |
| S-03 | flashcard-crud          | ręcznie tworzyć, edytować i usuwać fiszki w zestawie             | F-01, S-02       | FR-004, FR-005, FR-006, US-004 | done     |
| S-04 | csv-import              | importować fiszki z pliku CSV/TXT w formacie Anki                | F-01, S-02       | FR-009, US-009                 | done     |
| S-07 | public-share-link       | wygenerować link read-only do zestawu dostępny bez logowania     | F-01, S-02       | FR-008, US-008                 | proposed |
| S-05 | sr-review-session       | przeprowadzić sesję powtórkową z algorytmem spaced repetition    | F-01, S-01, S-02 | FR-010, US-019                 | done     |
| S-06 | learning-stats          | przeglądać statystyki i historię nauki                           | F-01, S-05       | FR-011, US-011                 | done     |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme               | Chain                             | Note                                                                   |
| ------ | ------------------- | --------------------------------- | ---------------------------------------------------------------------- |
| A      | AI core + nauka     | `F-01` → `S-01` → `S-05` → `S-06` | Gwiazda przewodnia; waliduje kryterium sukcesu 75% akceptacji AI.      |
| B      | Zarządzanie treścią | `S-02` → `S-03` / `S-04` / `S-07` | Równolegle z S-01 po wylądowaniu F-01; S-05 (Stream A) zależy od S-02. |

## Baseline

What's already in place in the codebase as of 2026-06-10 (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** partial — Astro + React + Tailwind + Radix UI scaffold; auth pages + pusty dashboard (`src/pages/dashboard.astro`). Brak UI fiszek, zestawów, statystyk.
- **Backend / API:** partial — wyłącznie `src/pages/api/auth/{signin,signup,signout}.ts`. Brak endpointów dla fiszek, zestawów, SR, statystyk.
- **Data:** absent — brak migracji, brak schematu (`supabase/migrations/` nie istnieje). Brak biblioteki SR w `package.json`.
- **Auth:** present — `src/middleware.ts`, `src/pages/api/auth/`, `src/pages/auth/{signin,signup,confirm-email}.astro` — w pełni wired up.
- **Deploy / infra:** partial — Cloudflare adapter w `astro.config.mjs`; CI w `.github/workflows/ci.yml`. Brak `wrangler.toml`.
- **Observability:** absent — brak loggingu, error trackingu, metryk.

## Foundations

### F-01: Schemat bazy danych i polityki RLS

- **Outcome:** (foundation) tabele `sets`, `flashcards`, `reviews` w Supabase PostgreSQL z politykami Row Level Security izolującymi dane per użytkownik; minimalny kontrakt danych umożliwiający budowę wszystkich user-facing slices.
- **Change ID:** `data-schema`
- **PRD refs:** FR-001 (RLS realizuje izolację danych z modelu auth), §Access Control (izolacja danych między użytkownikami — guardrail krytyczny), §Non-Functional Requirements (dane jednego użytkownika niedostępne dla innych)
- **Unlocks:** S-01, S-02, S-03, S-04, S-05, S-07 (wszystkie slices wymagają tabel i polityk RLS); redukuje Unknown w S-05 (schemat `reviews` musi być zgodny z ts-fsrs)
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** Schemat tabeli `reviews` musi być zgodny z wymaganiami biblioteki SR (ts-fsrs) co do kolumn stanów, interwałów i historii — weryfikacja API biblioteki przed tworzeniem migracji. — Owner: author. Block: no.
- **Risk:** Brak schematu blokuje całą resztę roadmapy; zaprojektowanie `reviews` z uwzględnieniem wymagań ts-fsrs od razu eliminuje późniejszą łamiącą migrację danych SR.
- **Status:** done

## Slices

### S-01: Generowanie fiszek AI

- **Outcome:** user can paste text into an input field, trigger AI flashcard generation, see a bulk preview of generated flashcard proposals (question/answer pairs), edit or delete individual proposals inline, and save the accepted flashcards to a new or existing set.
- **Change ID:** `ai-flashcard-generation`
- **PRD refs:** FR-002, FR-003, US-01
- **Prerequisites:** F-01
- **Parallel with:** S-02
- **Blockers:** —
- **Unknowns:**
  - Wybór dostawcy AI (Anthropic Claude, OpenRouter, OpenAI) i model — wpływa na SDK, format promptu i konfigurację klucza API w Cloudflare Worker. — Owner: author. Block: no.
- **Risk:** Jakość generowania AI jest bezpośrednio mierzona przez kryterium sukcesu (75% akceptacji); jeśli pierwsza wersja promptu daje niską jakość, potrzebna iteracja. Sekwencjonowany jako pierwszy user-facing slice, by jak najszybciej uzyskać sygnał o jakości.
- **Status:** done

### S-02: Zarządzanie zestawami

- **Outcome:** user can view a dashboard listing all their sets, create a new set, rename an existing set, delete a set, and browse flashcards within a set.
- **Change ID:** `set-and-deck-management`
- **PRD refs:** FR-007
- **Prerequisites:** F-01
- **Parallel with:** S-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Zestawy to główny kontener nawigacyjny aplikacji; bez S-02 użytkownik nie może dotrzeć do SR session ani statystyk. Sekwencjonowany równolegle z S-01, by minimalizować czas do działającej nawigacji.
- **Status:** done

### S-03: Ręczne zarządzanie fiszkami

- **Outcome:** user can manually create a new flashcard (front + back text), edit the content of an existing flashcard inline, and delete a flashcard from a set.
- **Change ID:** `flashcard-crud`
- **PRD refs:** FR-004, FR-005, FR-006, US-004
- **Prerequisites:** F-01, S-02
- **Parallel with:** S-04, S-07
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Ręczne tworzenie jest fallbackiem dla treści trudnych dla AI i dla użytkowników chcących zacząć bez tekstu źródłowego. Wymaga kontekstu zestawu (S-02) w UI edytora.
- **Status:** done

### S-04: Import CSV/TXT

- **Outcome:** user can upload a CSV or TXT file in Anki format, have its contents validated (lines split by `;`, `\t`, or `-` into exactly two parts), and have valid lines imported as flashcards into a selected set (invalid lines silently skipped per US-009 spec).
- **Change ID:** `csv-import`
- **PRD refs:** FR-009, US-009
- **Prerequisites:** F-01, S-02
- **Parallel with:** S-03, S-07
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Parser musi obsłużyć warianty separatorów (`;`, `\t`, `-`) zgodnie ze specyfikacją US-009; błędna walidacja może prowadzić do milczącego pominięcia prawidłowych wierszy lub złej struktury fiszek.
- **Status:** done

### S-07: Link read-only do zestawu

- **Outcome:** user can generate a shareable read-only link (random GUID-based URL) to a set, and any visitor — authenticated or not — can open the link and browse flashcards in view-only mode without the ability to edit, delete, or start a review session.
- **Change ID:** `public-share-link`
- **PRD refs:** FR-008, US-008
- **Prerequisites:** F-01, S-02
- **Parallel with:** S-03, S-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Nice-to-have per PRD; sekwencjonowany na równi z S-03/S-04, ale przy presji `capacity` powinien być realizowany jako ostatni w tym równoległym bloku — nie blokuje żadnego must-have slice'a.
- **Status:** proposed

### S-05: Sesja powtórkowa SR

- **Outcome:** user can start a spaced repetition review session for a set, see flashcards due for review (scheduled by the SR algorithm based on their answer history), flip a card to reveal the answer, rate their response (e.g. Again / Good / Easy), and have the algorithm update the card's next scheduled review date.
- **Change ID:** `sr-review-session`
- **PRD refs:** FR-010, US-019
- **Prerequisites:** F-01, S-01, S-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Wybór konkretnej biblioteki SR — ts-fsrs jest domyślnym kandydatem (wskazana w shape-notes.md); weryfikacja API biblioteki i wymagań dotyczących schematu `reviews` przed implementacją. — Owner: author. Block: no.
- **Risk:** Integracja zewnętrznej biblioteki SR jest jedynym technicznym ryzykiem wskazanym wprost w PRD (FR-010 Socrates note); F-01 musi uwzględnić kolumny wymagane przez ts-fsrs w tabeli `reviews`, by uniknąć łamiącej migracji.
- **Status:** done

### S-06: Statystyki i historia nauki

- **Outcome:** user can view a statistics dashboard showing a daily bar chart of minutes spent in the app (last 14 days) and tiles for the 3 most recently opened sets (set name, total flashcard count, count of learned flashcards, last-opened date).
- **Change ID:** `learning-stats`
- **PRD refs:** FR-011, US-011
- **Prerequisites:** F-01, S-05
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - US-011 wymaga "minut spędzonych w aplikacji dziennie" — skąd pochodzi czas trwania sesji (timestampy start/end w tabeli `reviews`, czy osobna tabela `session_log`)? Decyzja implementacyjna; nie blokuje planowania. — Owner: author. Block: no.
  - "Liczba nauczonych fiszek" wymaga operacyjnej definicji (np. karty z `state = 'review'` w ts-fsrs). — Owner: author. Block: no.
- **Risk:** Statystyki zależą od danych generowanych przez S-05 (historia odpowiedzi SR); sekwencjonowane jako ostatnie, by S-05 zdążyło wygenerować reprezentatywne dane.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID               | Suggested issue title                             | Ready for `/10x-plan` | Notes                                          |
| ---------- | ----------------------- | ------------------------------------------------- | --------------------- | ---------------------------------------------- |
| F-01       | data-schema             | [DB] Schema: sets, flashcards, reviews + RLS      | yes                   | Run `/10x-plan data-schema`                    |
| S-01       | ai-flashcard-generation | [Feature] AI flashcard generation and review flow | no                    | Awaits F-01; resolve AI provider Unknown first |
| S-02       | set-and-deck-management | [Feature] Sets dashboard — browse, create, manage | no                    | Awaits F-01; parallel with S-01                |
| S-03       | flashcard-crud          | [Feature] Manual flashcard create/edit/delete     | no                    | Awaits F-01 + S-02                             |
| S-04       | csv-import              | [Feature] CSV/TXT import (Anki format)            | no                    | Awaits F-01 + S-02                             |
| S-07       | public-share-link       | [Feature] Read-only shareable link per set        | no                    | Awaits F-01 + S-02; nice-to-have — plan last   |
| S-05       | sr-review-session       | [Feature] Spaced repetition review session        | no                    | Awaits F-01 + S-01 + S-02; pick SR lib first   |
| S-06       | learning-stats          | [Feature] Learning stats dashboard                | no                    | Awaits S-05                                    |

## Open Roadmap Questions

1. **Wybór dostawcy AI** — który LLM API (Anthropic Claude, OpenRouter, OpenAI)? Decyzja wpływa na wybór SDK, format promptu i konfigurację klucza API w Cloudflare Worker. Owner: author. Block: S-01 endpoint architecture (nie blokuje planowania pozostałych slices).

## Parked

- **FR-008 / US-008: Link read-only** — Why parked from must-have path: PRD klasyfikuje jako nice-to-have; uwzględniony jako S-07 w roadmapie, ale przy presji `capacity` realizowany jako ostatni.
- **Własny algorytm powtórek** — Why parked: PRD §Non-Goals. MVP integruje gotową bibliotekę SR (ts-fsrs); budowanie własnego algorytmu poza scope.
- **Import formatów PDF, DOCX i innych** — Why parked: PRD §Non-Goals. Jedynym obsługiwanym formatem importu jest CSV/TXT w formacie Anki.
- **Współdzielenie zestawów (edycja wspólna, komentarze, team workspaces)** — Why parked: PRD §Non-Goals. S-07 (link read-only) to eksponowanie, nie współpraca.
- **Aplikacje mobilne natywne** — Why parked: PRD §Non-Goals. Tylko responsive web; dedykowane aplikacje iOS/Android poza scope MVP.

## Done

- **F-01: (foundation) tabele sets, flashcards, reviews z RLS** — Archived 2026-06-13 → `context/archive/2026-06-10-data-scheme/`. Lesson: —.
- **S-02: user can view a dashboard listing all their sets, create a new set, rename an existing set, delete a set, and browse flashcards within a set.** — Archived 2026-06-13 → `context/archive/2026-06-13-set-and-deck-management/`. Lesson: —.
- **S-03: user can manually create a new flashcard (front + back text), edit the content of an existing flashcard inline, and delete a flashcard from a set.** — Archived 2026-06-13 → `context/archive/2026-06-13-flashcard-crud/`. Lesson: —.

- **S-01: user can paste text into an input field, trigger AI flashcard generation, see a bulk preview of generated flashcard proposals (question/answer pairs), edit or delete individual proposals inline, and save the accepted flashcards to a new or existing set.** — Archived 2026-06-14 → `context/archive/2026-06-13-ai-flashcard-generation/`. Lesson: —.

(Empty on first generation. `/10x-archive` appends an entry here — and flips that item's `Status` to `done` — when a change whose `Change ID` matches a roadmap item is archived.)

- **S-04: user can upload a CSV or TXT file in Anki format, have its contents validated (lines split by `;`, `\t`, or `-` into exactly two parts), and have valid lines imported as flashcards into a selected set (invalid lines silently skipped per US-009 spec).** — Archived 2026-06-14 → `context/archive/2026-06-14-csv-import/`. Lesson: —.
- **S-05: user can start a spaced repetition review session for a set, see flashcards due for review (scheduled by the SR algorithm based on their answer history), flip a card to reveal the answer, rate their response (e.g. Again / Good / Easy), and have the algorithm update the card's next scheduled review date.** — Archived 2026-06-14 → `context/archive/2026-06-14-sr-review-session/`. Lesson: —.
