# ESLint 10 Upgrade — Implementation Plan

## Overview

Aktualizacja ESLint z 9.39.4 do 10.4.1 wraz z synchronizacją paczek (`@eslint/js`, `typescript-eslint`, `eslint-plugin-prettier`) i usunięciem dwóch nieużywanych zależności. Kod źródłowy jest już czysty względem 3 nowych reguł `eslint:recommended` — upgrade jest bezpieczny.

## Current State Analysis

- **ESLint 9.39.4** w flat config (`eslint.config.js`), `tseslint.config()` API, `projectService: true`
- Wszystkie pluginy kompatybilne z ESLint 10 (jedynie `eslint-plugin-react` nie deklaruje `^10` w peer deps, ale działa)
- 2 nieużywane paczki: `@eslint/compat` (pozostałość po migracji do flat config), `eslint-config-prettier` (`eslint-plugin-prettier/recommended` już pokrywa)
- `@eslint/config-helpers` jest błędnie w `dependencies` zamiast `devDependencies`
- Zero trafień dla nowych reguł (`no-unassigned-vars`, `no-useless-assignment`, `preserve-caught-error`) w całym `src/`
- Zero `/* eslint-env */` komentarzy w źródłach
- `eslint.config.js:1` — zbędny `@typescript-eslint/no-deprecated` disable (tseslint.config() nie jest deprecated)

### Key Discoveries

- Skan `src/` potwierdził 0 trafień dla 3 nowych reguł — kod jest już czysty
- `typescript-eslint@8.60.1` deklaruje `eslint: ^8.57.0 || ^9.0.0 || ^10.0.0` — nie trzeba czekać na v9
- Node.js 22.14.0 spełnia wymaganie ESLint 10 (>= 20.19.0)

## Desired End State

ESLint 10.4.1 działa z tą samą konfiguracją, `npm run lint` przechodzi bez błędów, CI jest zielone. Dwie nieużywane paczki usunięte, `@eslint/config-helpers` przeniesione do `devDependencies`.

## What We're NOT Doing

- Nie aktualizujemy TypeScript do 6.x ani lint-staged do 17.x — to osobne change-idy
- Nie aktualizujemy pozostałych 18 paczek z minor/patch bumps — można to zrobić zwykłym `npm update` przy okazji
- Nie zmieniamy reguł ESLinta — tylko bump wersji
- Nie dodajemy test runnera — to osobny change-id (health-check Fix #1)

## Implementation Approach

Bezpośredni upgrade `npm install` + drobne porządki w `eslint.config.js`. Dwie fazy: bump + weryfikacja.

## Phase 1: Bump paczek i usuń nieużywane

### Overview

Aktualizacja ESLint i powiązanych paczek do wersji kompatybilnych z ESLint 10. Usunięcie nieużywanych zależności.

### Changes Required

#### 1. `package.json` — bump wersji

**File**: `package.json`

**Intent**: Zaktualizować ESLint do 10.x, zsynchronizować `@eslint/js` i `typescript-eslint`, usunąć nieużywane paczki, przenieść `@eslint/config-helpers` z `dependencies` do `devDependencies`.

**Contract**:

- `eslint`: `^9.29.0` → `^10.4.1`
- `@eslint/js`: `^9.29.0` → `^10.0.1`
- `typescript-eslint`: `^8.59.2` → `^8.60.1`
- `eslint-plugin-prettier`: `^5.5.5` → `^5.5.6`
- Usunąć `@eslint/compat` z `devDependencies`
- Usunąć `eslint-config-prettier` z `devDependencies`
- Przenieść `@eslint/config-helpers` z `dependencies` do `devDependencies`

#### 2. `eslint.config.js` — usuń zbędny komentarz

**File**: `eslint.config.js`

**Intent**: Usunąć `/* eslint-disable @typescript-eslint/no-deprecated */` z linii 1 — `tseslint.config()` nie jest deprecated w v8 typescript-eslint.

**Contract**: Usunąć linię 1 (komentarz `/* eslint-disable ... */`). Zachować pustą linię na początku pliku.

### Success Criteria

#### Automated Verification

- `npm install` wykonuje się bez błędów (dopuszczalny warning od `eslint-plugin-react` peer dep)
- `npm run lint` przechodzi bez błędów
- `package.json` nie zawiera `@eslint/compat` ani `eslint-config-prettier`

#### Manual Verification

- Sprawdzić output `npm install` — potwierdzić, że jedyny warning to `eslint-plugin-react` peer dep gap

---

## Phase 2: Weryfikacja i czyszczenie

### Overview

Potwierdzić, że ESLint 10 działa poprawnie — lint przechodzi, CI jest zielone. Opcjonalnie uruchomić build.

### Changes Required

Brak zmian w kodzie — faza weryfikacyjna.

### Success Criteria

#### Automated Verification

- `npm run lint` — 0 errors, 0 warnings (lub tylko istniejące wcześniej warningi, np. `no-console`)
- `npm run build` przechodzi bez błędów (potwierdza, że `@astrojs/check` i TypeScript nie mają konfliktu)

#### Manual Verification

- Potwierdzić, że GitHub Actions CI jest zielone po pushu (lint + build)
- Sprawdzić, czy `eslint-plugin-react` działa poprawnie mimo braku `^10` w peer deps — zweryfikować, że reguły React (hooks, compiler) zgłaszają błędy na nieprawidłowym kodzie

---

## Testing Strategy

### Manual Testing Steps

1. Po `npm install`, uruchomić `npm run lint` — potwierdzić 0 errors
2. Uruchomić `npm run build` — potwierdzić sukces
3. Zrobić commit + push — potwierdzić zielone CI w GitHub Actions
4. Opcjonalnie: tymczasowo złamać regułę React (np. wywołać hook poza komponentem) i potwierdzić, że `eslint-plugin-react` zgłasza błąd

## References

- Research: `context/changes/eslint-10-upgrade/research.md`
- Health check: `context/foundation/health-check.md` (sekcja "Major version gaps")
- Stack assessment: `context/foundation/stack-assessment.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Bump paczek i usuń nieużywane

#### Automated

- [x] 1.1 `npm install` wykonuje się bez błędów — d628637
- [x] 1.2 `npm run lint` przechodzi bez błędów — d628637
- [x] 1.3 `package.json` nie zawiera `@eslint/compat` ani `@eslint/config-helpers` — d628637

#### Manual

- [ ] 1.4 Sprawdzić output `npm install` — jedyny warning to `eslint-plugin-react` peer dep gap

### Phase 2: Weryfikacja i czyszczenie

#### Automated

- [x] 2.1 `npm run lint` — 0 errors
- [x] 2.2 `npm run build` przechodzi

#### Manual

- [ ] 2.3 GitHub Actions CI zielone po pushu
- [ ] 2.4 `eslint-plugin-react` działa poprawnie (reguły React zgłaszają błędy)
