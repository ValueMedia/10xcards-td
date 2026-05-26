---
project: "10xCards"
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 5
  hard_deadline: null
  after_hours_only: true
created: 2026-05-26
updated: 2026-05-26
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  frs_drafted: 11
  quality_check_status: accepted
  gray_areas_resolved:
    - topic: "pain category"
      decision: "workflow friction — manual flashcard creation is possible but too slow; AI removes the barrier"
    - topic: "primary persona"
      decision: "self-learner — new languages, exams, course material; individual user with lots of text to internalize"
    - topic: "insight"
      decision: "existing tools (Anki, Quizlet) don't generate flashcards from user's own text smoothly — import works but quality is low or requires extensive editing"
    - topic: "auth model"
      decision: "email+password/OAuth login; flat user model — each user sees only their own sets; shareable read-only link per set (no login required for viewer)"
    - topic: "MVP timeline"
      decision: "5-6 weeks after-hours; user accepted sustained-effort cost on 2026-05-26"
    - topic: "SR algorithm"
      decision: "ready-made library (e.g. ts-fsrs) — not building a custom algorithm"
    - topic: "primary success criterion"
      decision: "75% of AI-generated flashcards accepted by user (quality gate); 75% AI usage share = secondary"
  frs_drafted: 0
  quality_check_status: pending
---

## Vision & Problem Statement

Ręczne tworzenie wysokiej jakości fiszek edukacyjnych jest procesem czasochłonnym, który zniechęca do korzystania z metody spaced repetition — mimo że jest ona jedną z najskuteczniejszych metod uczenia. Osoba ucząca się nowego języka, przygotowująca się do egzaminu lub przyswajająca materiał kursowy staje przed wyborem: poświęcić czas na tworzenie fiszek albo zrezygnować z SR na rzecz mniej efektywnych metod.

Istniejące narzędzia (Anki, Quizlet) umożliwiają co prawda import tekstu, ale generowane fiszki są niskiej jakości lub wymagają rozbudowanej ręcznej edycji — luka, której LLM z rozumieniem kontekstu może dziś wiarygodnie zaradzić.

## User & Persona

### Primary persona

**Samodzielny uczący się** — osoba, która chce przyswoić duże ilości tekstu (nowy język, skrypt egzaminacyjny, materiał kursowy). Osiąga ten cel najefektywniej przez spaced repetition, ale bariera czasowa tworzenia fiszek sprawia, że albo pomija SR, albo tworzy fiszki niskiej jakości na skróty.

Moment sięgnięcia po produkt: ma gotowy tekst (notatki, artykuł, fragment podręcznika) i chce jak najszybciej zamienić go w gotowy zestaw fiszek do powtórek.

## Access Control

Model wielopoziomowy z domyślną izolacją danych:

- **Zalogowany użytkownik** (email + hasło / OAuth) — pełny dostęp do własnych zestawów fiszek (tworzenie, edycja, usuwanie, nauka). Nie widzi zestawów innych użytkowników.
- **Odwiedzający przez link** (bez logowania) — tylko odczyt konkretnego zestawu, do którego właściciel wygenerował link. Brak możliwości edycji, tworzenia ani dostępu do innych zestawów.

Model ról: płaski — jedna rola `user`; brak ról administracyjnych w MVP. Brak możliwości "zapraszania do współpracy" — link jest read-only i nie tworzy konta.

## Success Criteria

### Primary
- 75% fiszek wygenerowanych przez AI jest akceptowanych przez użytkownika bez edycji lub z minimalną edycją — mierzone jako stosunek zaakceptowanych do wygenerowanych w sesji.

### Secondary
- 75% wszystkich fiszek tworzonych przez użytkowników pochodzi z generatora AI (nie ręcznie).
- Integracja z gotowym algorytmem SR (biblioteka, np. ts-fsrs) działa bez widocznych błędów w sesjach powtórkowych.

### Guardrails
- Dane jednego użytkownika (fiszki, zestawy, historia powtórek) nie są dostępne dla innych użytkowników — naruszenie tej zasady to regresja krytyczna.
- Czas generowania fiszek przez AI < 10 sekund na zestaw (przy typowej długości tekstu wejściowego) — przekroczenie tego progu dyskwalifikuje UX flow jako workable.

## Functional Requirements

### Konta użytkowników
- FR-001: Użytkownik może zarejestrować się i zalogować. Priority: must-have
  > Socrates: Kontrargument rozważony: "MVP bez kont — dane w localStorage, konta w v2." Odrzucony: konta są niezbędne do przechowywania fiszek między sesjami i urządzeniami — app bez nich jest bezstanowa.

### Fiszki
- FR-002: Użytkownik może wkleić tekst i otrzymać zestaw propozycji fiszek wygenerowanych przez AI. Priority: must-have
  > Socrates: Kontrargument rozważony: "Jakość AI może być za niska by uzasadnić MVP — ryzyko unknowne." Pozostaje: to core value proposition; jakość weryfikuje kryterium sukcesu (75% akceptacji), nie FR. Bez FR-002 nie ma co weryfikować.

- FR-003: Użytkownik przegląda wygenerowane fiszki zbiorczo i edytuje/usuwa wybrane przed zapisem zestawu. Priority: must-have
  > Socrates: Kontrargument rozważony: "Zapis od razu, edycja później — mniej kodu w flow generowania." Odrzucony: bez podglądu przed zapisem niemożliwe jest mierzenie kryterium sukcesu (75% akceptacji bez edycji).

- FR-004: Użytkownik może ręcznie stworzyć fiszkę (pytanie / odpowiedź). Priority: must-have
  > Socrates: Kontrargument rozważony: "Usuń ręczne tworzenie — zostaw tylko AI." Odrzucony: ręczne tworzenie to fallback dla treści trudnych do AI-generowania; usuwa frustrację użytkownika przy edge casach.

- FR-005: Użytkownik może edytować istniejącą fiszkę. Priority: must-have
  > Socrates: Brak kontrargumentu — podstawowe CRUD, nie ma produktu bez możliwości korekty.

- FR-006: Użytkownik może usunąć fiszkę. Priority: must-have
  > Socrates: Brak kontrargumentu — podstawowe CRUD.

### Zestawy
- FR-007: Użytkownik może organizować fiszki w zestawy. Priority: must-have
  > Socrates: Kontrargument rozważony: "MVP z jednym domyślnym zestawem — segmentacja w v2." Odrzucony: bez zestawów niemożliwe jest uruchomienie celowanej sesji SR ani wygenerowanie linku do konkretnej kolekcji.

- FR-008: Użytkownik może wygenerować link read-only do zestawu dostępny bez logowania. Priority: nice-to-have
  > Socrates: Kontrargument rozważony: "Usunąć z MVP całkowicie — dodatkowa powierzchnia ataku i dodatkowy widok." Pozostaje jako nice-to-have: wartość społeczna i demonstracyjna jest wysoka przy niskim ryzyku, o ile widok gościa jest czysto read-only.

- FR-009: Użytkownik może zaimportować fiszki z pliku CSV/TXT w formacie Anki. Priority: must-have
  > Socrates: Kontrargument rozważony: "Import do nice-to-have — MVP skupia się na nowych użytkownikach." Odrzucony: bez importu użytkownicy Anki z latami danych nie wykonają migracji; bariera wejścia eliminuje kluczowy segment adopcji.

### Nauka
- FR-010: Użytkownik może przeprowadzić sesję powtórkową zestawu z użyciem algorytmu SR. Priority: must-have
  > Socrates: Kontrargument rozważony: "Biblioteka SR może okazać się trudna do integracji — ryzyko techniczne." Pozostaje: bez SR app jest tylko generatorem fiszek, nie rozwiązuje problemu nauki. Ryzyko integracji zarządzane przez wybór dojrzałej biblioteki (ts-fsrs).

- FR-011: Użytkownik może przeglądać statystyki i historię uczenia się dla zestawu. Priority: must-have
  > Socrates: Kontrargument rozważony: "Algorytm SR sam zarządza kolejnością — statystyki to nice-to-have." Odrzucony: widoczność postępów jest niezbędna do podtrzymania motywacji; bez dashboardu użytkownicy porzucają naukę mimo działającego SR.

## User Stories

### US-01: Generowanie fiszek z tekstu przez AI

- **Given** zalogowany użytkownik, który wkleił tekst do pola wejściowego
- **When** uruchamia generowanie AI
- **Then** widzi zbiorczy podgląd wygenerowanych fiszek (pytanie / odpowiedź), może edytować lub usunąć wybrane fiszki, a następnie zapisać cały zestaw

#### Acceptance Criteria
- AI generuje co najmniej jedną fiszkę z podanego tekstu
- Każda fiszka ma pole "pytanie" i "odpowiedź" widoczne od razu w podglądzie
- Użytkownik może edytować treść każdej fiszki inline przed zapisem
- Użytkownik może usunąć niechciane fiszki przed zapisem
- Całość generowania zajmuje < 10 sekund
- Po zapisaniu fiszki trafiają do wskazanego zestawu (lub nowego)

## Business Logic

Aplikacja ocenia, które fragmenty wklejonego tekstu najlepiej nadają się na pytanie i odpowiedź, i generuje z nich fiszki gotowe do nauki.

Wejście: surowy tekst dostarczony przez użytkownika (notatki, artykuł, fragment podręcznika) — bez narzucania formatu. Wyjście: lista par pytanie/odpowiedź, z których każda izoluje pojedynczy fakt lub pojęcie. Użytkownik napotyka wynik jako zbiorczy podgląd do przejrzenia przed zapisem — może dowolnie edytować lub usunąć każdą propozycję.

Algorytm spaced repetition (biblioteka zewnętrzna, np. ts-fsrs) następnie decyduje, kiedy i w jakiej kolejności fiszki pojawiają się w sesjach powtórkowych, na podstawie historii odpowiedzi użytkownika.

## Non-Functional Requirements

- Użytkownik otrzymuje widoczny feedback na każdą akcję w < 200 ms; każda operacja trwająca > 2 s pokazuje ciągły wskaźnik postępu.
- Generowanie fiszek przez AI kończy się i wyświetla wyniki w < 10 sekund dla typowej długości tekstu wejściowego (do ~2000 słów).
- Aplikacja jest w pełni użyteczna na urządzeniach mobilnych (layout responsywny) — bez dedykowanej aplikacji natywnej.
- Aplikacja działa poprawnie na dwóch ostatnich głównych wersjach przeglądarek: Chrome, Firefox, Safari, Edge.

## Non-Goals

- **Własny algorytm powtórek** — MVP używa gotowej biblioteki SR (np. ts-fsrs); budowanie własnego SuperMemo / Anki poza scope i poza kompetencją MVP.
- **Import wielu formatów (PDF, DOCX, itp.)** — jedynym obsługiwanym formatem importu jest CSV/TXT w formacie Anki; inne formaty wymagają dodatkowych parserów i nie są priorytetem MVP.
- **Współdzielenie zestawów między użytkownikami** — link read-only to eksponowanie, nie współpraca; brak wspólnej edycji, komentarzy, team workspaces.
- **Aplikacje mobilne natywne** — tylko responsive web; dedykowane aplikacje iOS/Android poza scope MVP.

## Timeline acknowledgment

Acknowledged on 2026-05-26: 5–6-week MVP requires sustained after-hours dedication; user accepted.
SR algorithm: ready-made library (e.g. ts-fsrs) — no custom algorithm in MVP.



