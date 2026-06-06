---
project: "10xCards (10x-astro-starter)"
checked_at: 2026-06-06T00:00:00Z
health_status: needs-attention
context_type: brownfield
language_family: js
stack_assessment_available: true
checks_run:
  - lockfile
  - dependency_audit
  - outdated_deps
  - test_runner
  - ci_cd
  - configuration
audit_findings:
  critical: 0
  high: 0
  moderate: 0
  low: 0
test_runner_detected: false
ci_provider: GitHub Actions
recommended_fixes: 5
---

## Dependency Health

### Lockfile

Status: present (`package-lock.json`)
Package manager: npm

### Security Audit

Tool: `npm audit --json`
Summary: 0 CRITICAL, 0 HIGH, 0 MODERATE, 0 LOW
Direct vs transitive: not distinguished — 896 total dependencies (470 prod, 293 dev, 142 optional)

**No vulnerabilities found.** Dependencies są czyste — żadnego znanego CVE w obecnych wersjach.

### Outdated Dependencies

Packages with major version gaps: 3

Pakiety z luką >= 2 major versions:

- **eslint**: 9.39.4 → 10.4.1 (1 major version behind)
- **lint-staged**: 16.4.0 → 17.0.7 (1 major version behind)
- **typescript**: 5.9.3 → 6.0.3 (1 major version behind)

Pozostałe 18 pakietów ma aktualizacje minor/patch (w obrębie tej samej major version). Wszystkie są bezpieczne do `npm update`.

## Test Suite

Test runner: **not detected**

Brak jakiegokolwiek runnera testów w `package.json` (brak `vitest`, `jest`, `mocha`). Brak plików `*.test.ts`/`*.spec.ts` w `src/`.

⚠ **To najważniejszy finding tego raportu.** Agent nie może zweryfikować poprawności swoich zmian bez test runnera. Stack-assessment (context/foundation/stack-assessment.md) zidentyfikował tę samą lukę jako jedyny gap w skądinąd bardzo przyjaznym agentowi stacku.

## CI/CD

Provider: GitHub Actions
Configuration: `.github/workflows/ci.yml`

| Stage      | Status | Notes                                                              |
| ---------- | ------ | ------------------------------------------------------------------ |
| Lint       | ✓      | `npm run lint` (ESLint)                                            |
| Test       | ✗      | Brak kroku testowego — wynika z braku test runnera                 |
| Build      | ✓      | `npm run build` (z env secrets dla Supabase)                       |
| Type check | ✗      | `npx astro sync` generuje typy, ale nie ma osobnego `tsc --noEmit` |
| Security   | ✗      | Brak `npm audit` lub CodeQL/Dependabot                             |

Pipeline jest skonfigurowany i działa (lint + build na push/PR do master). Brak kroku testowego jest bezpośrednią konsekwencją braku test runnera — zostanie uzupełniony razem z nim.

## Configuration

### High severity

- **Test runner (Vitest)** — brak możliwości weryfikacji zmian przez agenta. Fix: `npm install -D vitest @vitest/coverage-v8`, dodać `vitest.config.ts`, dodać skrypty testowe do `package.json`.

- **CI: brak kroku `npm test`** — pipeline nie weryfikuje testów. Fix: dodać krok `- run: npm test` do `.github/workflows/ci.yml` po instalacji Vitest.

### Medium severity

- **CI: brak type-check** — `npx astro sync` sprawdza integralność Astro, ale nie uruchamia pełnego `tsc --noEmit`. Fix: dodać krok `- run: npx astro check` do CI (korzysta z `@astrojs/check` który już jest w dependencies).

### Low severity

- **`.editorconfig`** — brak pliku konfiguracji formatowania niezależnego od edytora. Fix: utworzyć `.editorconfig` z podstawowymi ustawieniami (indent, charset, end_of_line).

## Stack Assessment Cross-Reference

Stack assessment: `context/foundation/stack-assessment.md`
Agent readiness (from stack-assess): `ready-with-compensation`

| Quality Gate Gap                                              | Health-Check Finding                              | Status       |
| ------------------------------------------------------------- | ------------------------------------------------- | ------------ |
| Brak test runnera (stack-assess §Gaps)                        | Test runner not detected, CI lacks test step      | Potwierdzone |
| Rekomendowane wpisy do CLAUDE.md (stack-assess §Compensation) | CLAUDE.md nie zawiera jeszcze sekcji test runnera | Otwarte      |

Stack-assessment dał `ready-with-compensation` — wszystkie 4 bramki jakości przechodzą, jedyną luką jest brak test runnera. Health-check potwierdza ten obraz: projekt jest czysty pod względem bezpieczeństwa, ma dobrą konfigurację i działające CI, ale nie ma infrastruktury testowej.

## Recommended Fixes

### Fix before agent work (Category A)

#### 1. Zainstaluj Vitest — test runner

**Impact**: Agent nie może zweryfikować poprawności swoich zmian. `/10x-test-plan` z Modułu 3 wymaga działającego runnera przed rozpoczęciem rolloutu testów.

**Severity**: high

**Effort**: moderate (15–30 min)

**Fix**:

```bash
npm install -D vitest @vitest/coverage-v8
```

Utwórz `vitest.config.ts` w root projektu:

```ts
import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
```

Dodaj do `package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

Dodaj do CLAUDE.md (zgodnie z rekomendacją ze stack-assessment):

```markdown
## Test runner

**Vitest** z `@vitest/coverage-v8`. Testy w plikach `*.test.ts`/`*.test.tsx` obok kodu lub w `src/__tests__/`.

### Commands

- `npm run test` — uruchamia całą suitę testów (vitest run)
- `npm run test:watch` — tryb watch (vitest)
- `npm run test:coverage` — testy z coverage (vitest run --coverage)

### Konwencje

- Testy jednostkowe dla `src/lib/` i `src/components/hooks/` hermetyczne (mockowane zależności zewnętrzne)
- Testy integracyjne dla API routes (`src/pages/api/`) z real Supabase (lokalne `npx supabase start`)
- Każdy plik testowy opisuje zachowanie, nie implementację — asercje wobec oczekiwanego outputu, nie wewnętrznego stanu
```

#### 2. Dodaj krok testowy do CI

**Impact**: Bez testów w pipeline, regresje mogą trafić na master niezauważone.

**Severity**: high

**Effort**: quick (< 5 min)

**Fix**: W `.github/workflows/ci.yml`, po `npm run lint`, dodaj:

```yaml
- run: npm test
```

#### 3. Dodaj type-check do CI

**Impact**: Bez pełnego sprawdzenia typów w CI, błędy TypeScript mogą przejść niezauważone (ESLint z type-checked rules nie pokrywa wszystkiego).

**Severity**: medium

**Effort**: quick (< 5 min)

**Fix**: W `.github/workflows/ci.yml`, po `npx astro sync`, dodaj:

```yaml
- run: npx astro check
```

#### 4. Major version gaps w zależnościach

**Impact**: ESLint 10, TypeScript 6 i lint-staged 17 mogą wprowadzić breaking changes przy przyszłej aktualizacji. Im dłużej zwlekasz, tym większy skok.

**Severity**: medium

**Effort**: moderate (15–30 min)

**Fix**: Zbadaj changelogi przed aktualizacją:

```bash
# Sprawdź co się zmieniło (same npm update nie skoczy o major version)
npm view eslint@10 --json | grep -E '"version"|"description"'
npm view typescript@6 --json | grep -E '"version"|"description"'
npm view lint-staged@17 --json | grep -E '"version"|"description"'
```

ESLint 10 i TypeScript 6 to znaczące aktualizacje — zaplanuj je jako osobny change-id z pełnym `/10x-new → /10x-research → /10x-plan → /10x-implement`.

#### 5. Dodaj `.editorconfig`

**Impact**: Niski — różni edytorzy mogą formatować inaczej, ale Prettier już to normalizuje. Czysty komfort.

**Severity**: low

**Effort**: quick (< 5 min)

**Fix**:

```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true
```

### Addressed in upcoming lessons (Category B)

#### CI: Security scanning

**Lesson**: [Sprint Zero z Agentem: infrastruktura, walking skeleton i pierwszy deploy (M1L5)](https://platforma.przeprogramowani.pl/external/10xdevs-3/m1-l5)

**What you'll do there**: Skonfigurujesz CodeQL lub Dependabot w GitHub Actions do automatycznego skanowania podatności. Dla teraz `npm audit` jest czysty — nie ma palących problemów.

## Summary

Health status: **needs-attention**

Projekt jest w bardzo dobrym stanie: zero podatności (896 dependencies, 0 CVE), lockfile obecny, TypeScript strict, ESLint + Prettier skonfigurowane na pre-commit hookach, CI działa (lint + build), oba pliki instrukcji dla agenta (CLAUDE.md + AGENTS.md) są szczegółowe i aktualne. Stack-assessment dał `ready-with-compensation` — i health-check to potwierdza.

Jedynym istotnym gapem jest **brak test runnera** — bez niego agent nie może weryfikować swoich zmian, a `/10x-test-plan` z Modułu 3 nie może wystartować. Zainstaluj Vitest (Fix #1), dodaj go do CI (Fix #2), a projekt przechodzi na `healthy`.

Pozostałe findingi są niskiego priorytetu: type-check w CI (Fix #3) i major version gaps (Fix #4) warto zaadresować, ale nie blokują pracy agenta.

Next step: Zainstaluj Vitest (Fix #1), potem przejdź do `/10x-test-plan` aby rozpocząć Moduł 3.
