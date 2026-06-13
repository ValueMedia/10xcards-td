---
project: "10xCards (10x-cards-td)"
assessed_at: 2026-06-06T00:00:00Z
agent_readiness: ready-with-compensation
context_type: brownfield
stack_components:
  language: TypeScript (5.9, strict mode via astro/tsconfigs/strict)
  framework: Astro 6 (SSR) + React 19 (islands)
  build_tool: Vite + Wrangler
  test_runner: null
  package_manager: npm (package-lock.json)
  ci_provider: GitHub Actions
  deployment_target: Cloudflare Workers (@astrojs/cloudflare)
gates_passed: 3
gates_failed: 0
---

## Stack Components

**Language:** TypeScript ^5.9.3 w trybie `strict` (dziedziczony z `astro/tsconfigs/strict`). W pełni typowany — `@astrojs/check` jako osobny krok sprawdzania typów. ESLint z `typescript-eslint` w konfiguracji lint-staged.

**Framework:** Astro 6 w trybie SSR (`output: "server"`) z adapterem `@astrojs/cloudflare`. React 19 jako integracja wyspowa (`@astrojs/react`) — komponenty React używane tylko gdy potrzebna interaktywność. Routing file-based (Astro pages), middleware przez `src/middleware.ts`. Tailwind 4 z `@tailwindcss/vite`. Komponenty shadcn/ui (new-york) w `src/components/ui/`.

**Build:** Vite przez Astro. Deploy przez Wrangler (`wrangler.jsonc`) na Cloudflare Workers. `@astrojs/cloudflare` jako entrypoint serwerowy.

**Auth:** Supabase z `@supabase/ssr` — sesje cookie-based, middleware na `context.locals.user`. RLS na wszystkich tabelach.

**Brak test runnera** — w `package.json` nie ma vitest, jest, mocha ani żadnych plików `*.test.ts`/`*.spec.ts`. ESLint i Prettier są skonfigurowane jako quality gates (lint-staged + husky pre-commit). GitHub Actions CI (`ci.yml`) odpala lint + build.

**Instruction files:** CLAUDE.md (378 linii) i AGENTS.md (323 linii) z bardzo szczegółową dokumentacją architektury, konwencji i komend.

## Quality Gate Assessment

| Component                      | Typed | Convention | Training Data | Documented | Werdykt            |
| ------------------------------ | ----- | ---------- | ------------- | ---------- | ------------------ |
| Language (TypeScript strict)   | ✓     | —          | —             | —          | pass               |
| Framework (Astro 6 + React 19) | —     | ✓          | ✓             | ✓          | pass               |
| Build tool (Vite / Wrangler)   | —     | ✓          | ✓             | ✓          | pass               |
| Test runner                    | —     | —          | —             | —          | nie dotyczy (brak) |

### Gate Details

**Gate 1 — Typed:** ✓ PASS

- Evidence: `tsconfig.json` rozszerza `astro/tsconfigs/strict`, `typescript` ^5.9.3 w devDependencies, `@astrojs/check` w dependencies, ESLint z `typescript-eslint` ^8.59.2.

**Gate 2 — Convention-based:** ✓ PASS

- Evidence: Astro używa file-based routingu (`src/pages/`), middleware (`src/middleware.ts`), integracji wyspowej. React ograniczony do komponentów interaktywnych. shadcn/ui w `src/components/ui/` z wariantem new-york. CLAUDE.md dokumentuje pełną strukturę katalogów i konwencje.

**Gate 3 — Popular in training data:** ✓ PASS

- Evidence: Astro jest mainstreamowym frameworkiem JS/TS, wymienionym w kryteriach jako przykład pass dla convention-based. React 19 to najpopularniejszy framework UI na świecie. Tailwind CSS wszechobecny w danych treningowych.

**Gate 4 — Well-documented:** ✓ PASS

- Evidence: Astro ma version-pinned docs (astro.build), React 19 docs (react.dev), Tailwind 4 docs. Wszystkie z przykładami i API reference.

**Test runner — luka:** Brak jakiegokolwiek runnera testów. Nie jest to fail bramki (test runner nie byłby oceniany w żadnej z 4 bramek), ale jest to istotna luka praktyczna dla workflow agenta — każda zmiana w kodzie nie może być zweryfikowana przez testy.

## Gaps & Compensation

### Gap: Brak test runnera

**Dlaczego to problem dla agenta:** Agent nie może uruchomić testów, by zweryfikować poprawność zmian. `test-plan.md` z Modułu 3 wymaga runnera przed rozpoczęciem rolloutu testów. Bez runnera nie działa TDD, nie ma feedback loop, nie ma mutation testing.

**Strategia kompensacji:** Dodać Vitest — naturalny wybór dla projektu opartego na Vite/Astro. Konfiguracja jest minimalna, Vitest współdzieli `tsconfig.json` i rozumie alias `@/*`.

### Recommended Instruction File Additions

Poniższe wpisy są gotowe do wklejenia do CLAUDE.md (pod sekcją `## Commands`):

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

## Summary

**Stack jest bardzo przyjazny agentowi.** Wszystkie 4 bramki jakości przechodzą: TypeScript strict zapewnia typowanie, Astro 6 dostarcza silne konwencje, cały ekosystem jest dobrze reprezentowany w danych treningowych i świetnie udokumentowany. CLAUDE.md i AGENTS.md są wyjątkowo szczegółowe (razem ~700 linii konwencji i komend), co dodatkowo wzmacnia pozycję agenta.

**Jedyną luką jest brak test runnera.** Projekt nie ma jeszcze Vitest ani żadnego innego runnera — to blokuje workflow `/10x-test-plan` z Modułu 3. Rekomendowane jest dodanie Vitest przed rozpoczęciem fazy testowej.

**Następny krok:** `/10x-health-check` — audyt zależności, konfiguracji i gotowości projektu do pracy z agentem.
