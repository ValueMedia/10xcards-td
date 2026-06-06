# ESLint 10 Upgrade — Plan Brief

> Full plan: `context/changes/eslint-10-upgrade/plan.md`
> Research: `context/changes/eslint-10-upgrade/research.md`

## What & Why

Aktualizacja ESLint z 9.39.4 do 10.4.1. ESLint 10 to najnowsza wersja major — projekt jest obecnie 1 major version za, a im dłużej zwlekamy, tym większy skok przy przyszłej aktualizacji. Upgrade jest bezpieczny: kod źródłowy jest już czysty względem 3 nowych reguł `eslint:recommended`, wszystkie pluginy są kompatybilne, Node.js spełnia wymagania.

## Starting Point

Projekt używa ESLint 9.39.4 z flat config (`eslint.config.js`), TypeScript strict, React 19, Astro 6. W `package.json` są dwie nieużywane paczki (`@eslint/compat`, `eslint-config-prettier`) i jeden zbędny komentarz disable w `eslint.config.js:1`.

## Desired End State

ESLint 10.4.1 działa identycznie jak 9.x — `npm run lint` przechodzi, CI jest zielone, package.json jest czysty z nieużywanych paczek.

## Key Decisions Made

| Decision                         | Choice                     | Why                                                            | Source   |
| -------------------------------- | -------------------------- | -------------------------------------------------------------- | -------- |
| Nowe reguły `eslint:recommended` | Poprawić kod, nie wyłączać | Kod jest już czysty — zero trafień w skanie `src/`             | Plan     |
| Nieużywane paczki                | Usunąć obie                | `@eslint/compat` i `eslint-config-prettier` nie są importowane | Research |
| Zakres upgrade                   | Tylko ESLint + powiązane   | TypeScript 6 i lint-staged 17 to osobne change-idy             | Plan     |
| CI po upgrade                    | Fail na nowych warningach  | CI od razu weryfikuje poprawność — i tak przejdzie             | Plan     |

## Scope

**In scope:** bump `eslint` → 10.4.1, `@eslint/js` → 10.0.1, `typescript-eslint` → 8.60.1, `eslint-plugin-prettier` → 5.5.6. Usunięcie `@eslint/compat`, `eslint-config-prettier`. Przeniesienie `@eslint/config-helpers` do devDependencies. Usunięcie zbędnego komentarza disable.

**Out of scope:** TypeScript 6, lint-staged 17, pozostałe minor/patch bumps, dodanie test runnera.

## Architecture / Approach

Bezpośredni `npm install` z nowymi wersjami + 1-linijkowa zmiana w `eslint.config.js`. Żadnych zmian w kodzie źródłowym — skan potwierdził 0 trafień dla nowych reguł.

## Phases at a Glance

| Phase                            | What it delivers                | Key risk                                                                    |
| -------------------------------- | ------------------------------- | --------------------------------------------------------------------------- |
| 1. Bump paczek + usuń nieużywane | ESLint 10 + czysty package.json | `eslint-plugin-react` peer dep warning przy npm install                     |
| 2. Weryfikacja i czyszczenie     | Zielone lint, build, CI         | `eslint-plugin-react` reguły mogą nie działać — do zweryfikowania manualnie |

**Prerequisites:** Node.js >= 20.19.0 (spełnione — 22.14.0)
**Estimated effort:** ~15 minut (2 fazy)

## Open Risks & Assumptions

- `eslint-plugin-react@7.37.5` nie deklaruje `^10` w peer deps — zakładamy, że działa (ESLint 10 nie zmienił rule-level API). Zweryfikować manualnie w fazie 2.
- `typescript-eslint@8.60.1` deklaruje wsparcie dla ESLint 10 — zweryfikowane przez `npm view`.

## Success Criteria (Summary)

- `npm run lint` przechodzi bez błędów po upgrade
- `npm run build` przechodzi
- CI zielone
- Package.json bez nieużywanych paczek
