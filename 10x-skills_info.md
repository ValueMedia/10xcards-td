# 10x Skills — Kompletna Lista i Przeznaczenie

> Spis wszystkich dostępnych skill-i z rodziny 10x, pogrupowanych według fazy pracy i z przykładowymi flow.

---

## 🔍 Discovery & Specyfikacja (co budować)

### `/10x-shape`

- **Do czego służy:** Strukturyzowana rozmowa odkrywcza — zamysł na `shape-notes.md` (input do PRD).
- **Kiedy używać:** Na początku projektu lub dużej zmiany, gdy masz pomysł, ale jeszcze nie sformalizowany.
- **Trigger:** "new project", "from scratch", "starting an app", "shape an idea", "brainstorm a product", "greenfield", "I have an idea", "existing project", "brownfield", "zmiana w projekcie".
- **Wyjście:** `context/foundation/shape-notes.md`

### `/10x-prd`

- **Do czego służy:** Generowanie `context/foundation/prd.md` z shape-notes lub surowych notatek.
- **Kiedy używać:** Po `/10x-shape`, gdy masz gotowe notatki i chcesz sformalizować PRD.
- **Trigger:** "write the PRD", "generate PRD", "create the PRD from notes", "stwórz PRD", "turn notes into a PRD", "PRD from shape-notes".
- **Wyjście:** `context/foundation/prd.md` (10 sekcji dla greenfield, 11 dla brownfield)

### `/10x-roadmap`

- **Do czego służy:** Tworzenie roadmapy jako uporządkowany zbiór pionowych, end-to-end slice'ów z PRD.
- **Kiedy używać:** Po `/10x-prd`, gdy masz PRD i chcesz wiedzieć, co budować pierwsze.
- **Trigger:** "write the roadmap", "generate roadmap", "create the roadmap from PRD", "stwórz roadmapę", "turn PRD into a roadmap", "what should I build first".
- **Wyjście:** `context/foundation/roadmap.md`

### `/10x-frame`

- **Do czego służy:** Wyzwanie założeń framingowych — "czy to w ogóle dobry kierunek?"
- **Kiedy używać:** Gdy input to "bug + proposed fix", pytanie o scope, wybór designu, lub gdy obserwacja i przyczyna są przedstawione jako jedno.
- **Trigger:** "fix", "bug", "broken", "root cause", "should we even", "is this the right", "challenge the assumption", "rethink", "before I plan".
- **Kiedy NIE używać:** Gdy już wiesz CO budować i potrzebujesz tylko JAK — wtedy od razu `/10x-plan`.

---

## 🏗️ Architektura & Bootstrap

### `/10x-tech-stack-selector`

- **Do czego służy:** Wybór stacku technologicznego i startera dla projektu greenfield.
- **Kiedy używać:** Po `/10x-prd`, gdy masz PRD i chcesz wybrać framework/język.
- **Trigger:** "what stack should I use", "pick a stack", "choose framework", "co wybrać do projektu".
- **Wyjście:** `context/foundation/tech-stack.md` (hand-off dla `/10x-bootstrapper`)

### `/10x-bootstrapper`

- **Do czego służy:** Scaffolding projektu na podstawie wybranego stacku.
- **Kiedy używać:** Po `/10x-tech-stack-selector`, gdy masz `tech-stack.md`.
- **Trigger:** "bootstrap the project", "scaffold the app", "set up the codebase", "let's start the project".
- **Wyjście:** Zweryfikowany kod w katalogu roboczym + log w `context/changes/bootstrap-verification/verification.md`

### `/10x-infra-research`

- **Do czego służy:** Research i rekomendacja platformy deploymentowej dla MVP.
- **Kiedy używać:** Po `/10x-prd` lub `/10x-tech-stack-selector`, przed `/10x-implement`.
- **Trigger:** "choose a platform", "where should I deploy", "infra research", "deployment platform for my MVP", "wybierz platformę", "gdzie deployować", "infrastructure decision", "hosting choice", "jaka platforma do deploymentu".
- **Wyjście:** `context/foundation/infrastructure.md`

### `/10x-stack-assess`

- **Do czego służy:** Ocena stacku istniejącego projektu pod kątem "agent-friendliness".
- **Kiedy używać:** Na początku pracy z brownfield — zanim zaczniesz implementować.
- **Trigger:** "assess my stack", "evaluate my project", "is my stack agent-friendly", "oceń mój stack", "sprawdź projekt", "stack assessment", "brownfield assessment".
- **Wyjście:** `context/foundation/stack-assessment.md`

### `/10x-health-check`

- **Do czego służy:** Audyt projektu: zależności, security, test runner, CI/CD, brakująca konfiguracja.
- **Kiedy używać:** Po `/10x-stack-assess`, przed rozpoczęciem pracy z agentem.
- **Trigger:** "health check", "check my project", "audit my project", "is my project healthy", "sprawdź projekt", "audyt projektu", "health-check", "project health".
- **Wyjście:** `context/foundation/health-check.md`

---

## 📝 Planowanie & Research (jak budować)

### `/10x-research`

- **Do czego służy:** Głęboki research kodu — używa sub-agentów równolegle do eksploracji.
- **Kiedy używać:** Przed planowaniem zmiany, gdy potrzebujesz zrozumieć codebase.
- **Wyjście:** `context/changes/<change-id>/research.md`

### `/10x-plan`

- **Do czego służy:** Tworzenie szczegółowych planów implementacyjnych z iteracjami.
- **Kiedy używać:** Po research, gdy wiesz CO i dlaczego, i potrzebujesz JAK.
- **Wyjście:** `context/changes/<change-id>/plan.md`

### `/10x-plan-review`

- **Do czego służy:** Review planu pod kątem substance, feasibility, architectural fitness.
- **Kiedy używać:** Po `/10x-plan`, zanim zaczniesz implementować.
- **Trigger:** "is this plan good", "check my plan", "review this plan".

### `/10x-new`

- **Do czego służy:** Otwieranie nowego change folderu z `change.md`.
- **Kiedy używać:** Początek każdej nowej zmiany.
- **Wyjście:** `context/changes/<change-id>/change.md`

### `/10x-archive`

- **Do czego służy:** Archiwizowanie ukończonej zmiany do `context/archive/`.
- **Kiedy używać:** Gdy zmiana jest kompletna i zweryfikowana.

---

## 🔨 Implementacja

### `/10x-implement`

- **Do czego służy:** Realizacja planu faza po fazie z weryfikacją.
- **Kiedy używać:** Domyślny executor planów — gdy nie pasuje TDD ani E2E.
- **Wejście:** `context/changes/<change-id>/plan.md`

### `/10x-tdd`

- **Do czego służy:** Tryb test-first: red → green → refactor.
- **Kiedy używać:** Gdy potrafisz nazwać pierwszy failing test w jednym zdaniu.
- **Kiedy NIE używać:** Environment setup, CI/CD, dokumentacja, thin wiring, spike/discovery.
- **Rule:** Jeśli implementacja już istnieje, `/10x-tdd` odmawia — użyj `/10x-implement`.

### `/10x-e2e`

- **Do czego służy:** Browser-level / Playwright testing — tylko dla ryzyk, które naprawdę potrzebują przeglądarki.
- **Kiedy używać:** Gdy feature jest już zbudowany i test wymaga przeglądarki.
- **Kiedy NIE używać:** Gdy tańsza warstwa (unit/integration) daje ten sam sygnał.
- **Hard rules:** `getByRole` first, nigdy `waitForTimeout`, test independence + cleanup.

### `/10x-impl-review`

- **Do czego służy:** Review wdrożenia vs. plan — drift, niebezpieczne decyzje, compliance.
- **Kiedy używać:** Po implementacji, gdy chcesz sprawdzić, czy kod nie odbiegł od planu.

---

## 🧪 Strategia Testowania (Module 3)

### `/10x-test-plan`

- **Do czego służy:** **Stateful orchestrator** testów. Tworzy i prowadzi `test-plan.md`.
- **Kiedy używać:** Gdy masz PRD (i roadmap) i chcesz zacząć pisać testy, lub gdy widzisz, że AI generuje testy na helpery zamiast na krytyczne flow.
- **Trigger:** "create test plan", "plan tests", "test strategy", "phased test rollout", "continue test rollout", "risk map for testing", "QA spec", "AI-native testing strategy", "stwórz plan testów", "strategia jakości".
- **Wyjście:** `context/foundation/test-plan.md` (§1–§5 frozen + §6 cookbook grows)
- **Opcje:**
  - `/10x-test-plan --status` — snapshot obecnego stanu rolloutu
  - `/10x-test-plan --refresh` — odświeżenie planu (nowe ryzyka, zmiana stacku)
- **Rollout chain:** `/10x-new` → `/10x-research` → `/10x-plan` → `/10x-implement` (per faza)

---

## 🧠 Wiedza & Reguły (meta)

### `/10x-lesson`

- **Do czego służy:** Zapisywanie powtarzających się reguł/wzorców/pułapek.
- **Kiedy używać:** W trakcie pracy, gdy zauważysz coś, co "wraca".
- **Wyjście:** `context/foundation/lessons.md` (append-only)
- **Format:** Context, Problem, Rule, Applies to
- **Zasady:** Jeden wpis = jedno wywołanie. Append-only (nie edytujemy starych). Self-bootstrap.

### `/10x-agents-md`

- **Do czego służy:** Generowanie `AGENTS.md` — onboardingu dla przyszłych agentów.
- **Kiedy używać:** Gdy projekt ma już strukturę i chcesz pomóc przyszłym agentom.
- **Trigger:** "create AGENTS.md", "write an agent onboarding doc", "generate contributor guide for agents".

### `/10x-rule-review`

- **Do czego służy:** Ocena pliku reguł (CLAUDE.md, .cursor/rules/\*.mdc, .github/copilot-instructions.md, .windsurfrules).
- **Kiedy używać:** Gdy masz plik reguł i chcesz wiedzieć, czy jest "zdrowy".
- **Trigger:** "review AI rules", "audit AGENTS.md", "check my CLAUDE.md", "score my agent instructions".
- **Wyjście:** 5-punktowy scorecard + actionable fixes.

### `/10x-init`

- **Do czego służy:** Inicjalizacja katalogu `/context` (scaffold `changes/`, `archive/`, `foundation/` + README.md).
- **Kiedy używać:** Na początku pracy z systemem 10x, jeśli katalog `/context` nie istnieje.

---

## Typowe Flow

### Greenfield (nowy projekt od zera)

```
/10x-init (opcjonalnie)
    ↓
/10x-shape
    ↓
/10x-prd
    ↓
/10x-tech-stack-selector
    ↓
/10x-bootstrapper
    ↓
/10x-roadmap
    ↓
/10x-test-plan (jeśli projekt istnieje)
```

### Brownfield (zmiana w istniejącym)

```
/10x-stack-assess (opcjonalnie)
    ↓
/10x-health-check (opcjonalnie)
    ↓
/10x-frame (opcjonalnie — gdy "czy to w ogóle dobry kierunek?")
    ↓
/10x-new <change-id>
    ↓
/10x-research
    ↓
/10x-plan
    ↓
/10x-plan-review (opcjonalnie)
    ↓
/10x-implement / /10x-tdd / /10x-e2e
    ↓
/10x-impl-review (opcjonalnie)
    ↓
/10x-archive
```

### Testy (Module 3)

```
/10x-test-plan (tworzy test-plan.md)
    ↓
Dla każdej fazy:
    /10x-new <change-id>
        ↓
    /10x-research (oracle: co kod powinien robić)
        ↓
    /10x-plan (cost × signal, dwie warstwy: classic + AI-native)
        ↓
    /10x-tdd (jeśli potrafisz nazwać pierwszy red test)
       LUB
    /10x-implement (domyślnie)
       LUB
    /10x-e2e (jeśli wymaga przeglądarki)
        ↓
    Aktualizacja §6 cookbook w test-plan.md
```

---

## Granice Lekcji (Module 3)

| Lekcja                                      | Co robimy                                                   | Czego NIE robimy                      |
| ------------------------------------------- | ----------------------------------------------------------- | ------------------------------------- |
| **Lesson 1** (`/10x-test-plan`)             | Strategia, risk map, phased rollout, quality gates          | Nie piszemy kodu testów               |
| **Lesson 2** (`/10x-tdd`, `/10x-implement`) | Piszemy testy (unit/integration), oracle, anti-patterns     | Nie konfigurujemy hooków              |
| **Lesson 3** (hooki)                        | Per-edit hooks, pre-commit, pre-push, feedback loop         | Nie piszemy E2E, nie konfigurujemy CI |
| **Lesson 4** (`/10x-e2e`)                   | E2E z Playwright, locators, cleanup, vision jako supplement | Nie benchmarkujemy modeli VLM         |
| **Lesson 5**                                | Bug → fix → regression-test workflow                        | —                                     |

---

> **Data wygenerowania:** 2026-06-05
> **Wersja:** Na podstawie AGENTS.md z 10xDevs AI Toolkit — Module 3
