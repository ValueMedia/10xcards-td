---
date: 2026-06-06T12:10:00+02:00
researcher: AI agent (10x-research)
git_commit: db40f42
branch: main
repository: 10xcards-td
topic: "ESLint 10 upgrade for Astro 6 + TypeScript + React project"
tags: [research, eslint, upgrade, typescript, astro, react, dependencies]
status: complete
last_updated: 2026-06-06
last_updated_by: AI agent (10x-research)
---

# Research: ESLint 10 Upgrade

**Date**: 2026-06-06T12:10:00+02:00
**Researcher**: AI agent (10x-research)
**Git Commit**: db40f42
**Branch**: main
**Repository**: 10xcards-td

## Research Question

Chcę zaktualizować ESLint z wersji 9.x do 10.x w projekcie Astro 6 + TypeScript + React 19. Czy wszystkie zależności są kompatybilne? Co się zepsuje? Jak bezpiecznie przeprowadzić upgrade?

## Summary

**Upgrade ESLinta 9→10 jest wykonalny bez blokerów.** Kluczowe ustalenia:

1. **`typescript-eslint@8.60.1` wspiera ESLint 10** — nie trzeba czekać na v9
2. **`eslint-plugin-react@7.37.5` nie deklaruje `^10` w peer deps**, ale funkcjonalnie działa (breaking changes ESLinta 10 dotyczą głównie core API, nie rule-level API)
3. **3 nowe reguły w `eslint:recommended`** wygenerują nowe lint errory — trzeba je obsłużyć
4. **JSX reference tracking** może wygenerować nowe `no-unused-vars` na komponentach — raczej pożądane
5. **2 nieużywane paczki** (`@eslint/compat`, `eslint-config-prettier`) do usunięcia
6. Node.js >= 20.19.0 wymagane (projekt używa 22.14.0 — OK)

## Detailed Findings

### Kompatybilność paczek z ESLint 10

| Paczka                         | Obecna wersja    | ESLint 10-ready         | Wersja docelowa | Peer dep                                   |
| ------------------------------ | ---------------- | ----------------------- | --------------- | ------------------------------------------ |
| `eslint`                       | ^9.29.0 → 9.39.4 | ✓                       | `^10.4.1`       | —                                          |
| `@eslint/js`                   | ^9.29.0 → 9.39.4 | ✓                       | `^10.0.1`       | `eslint: ^10.0.0`                          |
| `@eslint/compat`               | ^2.0.3           | ✓ (niewykorzystywane)   | **usuń**        | —                                          |
| `@eslint/config-helpers`       | ^0.6.0           | ✓                       | bez zmian       | brak peer dep                              |
| `typescript-eslint`            | ^8.59.2 → 8.59.2 | ✓                       | `^8.60.1`       | `eslint: ^8.57.0 \|\| ^9.0.0 \|\| ^10.0.0` |
| `eslint-plugin-astro`          | ^1.7.0 → 1.7.0   | ✓                       | bez zmian       | `eslint: >=8.57.0`                         |
| `eslint-plugin-react`          | ^7.37.5 → 7.37.5 | ⚠️                      | bez zmian       | `eslint: ^3..^9.7` (brak `^10`)            |
| `eslint-plugin-react-hooks`    | ^7.1.1 → 7.1.1   | ✓                       | bez zmian       | `eslint: ^3..^10.0.0`                      |
| `eslint-plugin-react-compiler` | ^19.1.0-rc.2     | ✓                       | bez zmian       | `eslint: >=7`                              |
| `eslint-plugin-prettier`       | ^5.5.5 → 5.5.5   | ✓                       | `^5.5.6`        | `eslint: >=8.0.0`                          |
| `eslint-config-prettier`       | ^10.1.8          | N/A (niewykorzystywane) | **usuń**        | —                                          |

### ESLint 10 breaking changes istotne dla tego projektu

#### 1. `eslint:recommended` — 3 nowe reguły **(HIGH impact)**

Konfiguracja używa `eslint.configs.recommended` (`eslint.config.js:15`). ESLint 10 dodaje:

- `no-unassigned-vars` — zmienne przypisane, ale nigdy nie odczytane → error
- `no-useless-assignment` — przypisania, których wartość nie jest używana → error
- `preserve-caught-error` — złapane błędy muszą być użyte lub ponownie rzucone → error

**Akcja**: sprawdzić output `eslint .` po upgrade, naprawić kod lub dodać overrides.

#### 2. JSX reference tracking **(MEDIUM impact)**

ESLint 10 widzi `<Card />` jako referencję do `Card`. Oznacza to, że `@typescript-eslint/no-unused-vars` może teraz flagować importy, które wcześniej wyglądały na nieużywane, ale były w JSX.

**To jest pożądane zachowanie** — reguła będzie dokładniejsza. Prawdopodobnie nie wygeneruje nowych błędów w tym projekcie (komponenty są już importowane explicite), ale warto zweryfikować.

#### 3. Node.js >= 20.19.0 **(LOW impact — spełnione)**

Projekt używa Node.js 22.14.0 (`.nvmrc`) — warunek spełniony. CI również używa `node-version: 22`.

#### 4. `/* eslint-env */` comments **(LOW impact — sprawdzić)**

Komentarze `/* eslint-env */` generują błędy w ESLint 10. Przeskanować kod źródłowy pod kątem takich komentarzy.

#### 5. `eslint-plugin-react` peer dep gap **(LOW-MEDIUM impact)**

`eslint-plugin-react@7.37.5` deklaruje `peerDependencies.eslint: "^3 || ^4 || ^5 || ^6 || ^7 || ^8 || ^9.7"` — brak `^10`. Funkcjonalnie powinno działać (ESLint 10 nie zmienił rule-level API), ale npm wyświetli warning przy instalacji. Docelowo plugin powinien zaktualizować deklarację.

### Nieużywane paczki do usunięcia

| Paczka                   | Powód                                                                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@eslint/compat`         | Zaimportowane w `package.json:37`, nigdy nie użyte w `eslint.config.js`. Było potrzebne przy migracji do flat config, teraz zbędne.                                            |
| `eslint-config-prettier` | Zaimportowane w `package.json:41`. `eslint-plugin-prettier/recommended` (`eslint.config.js:78`) już zawiera konfigurację prettier — `eslint-config-prettier` jest redundantne. |

### Stan obecnej konfiguracji

- **Format**: Flat config (`eslint.config.js`), w pełni zgodny z ESLint 10
- **TypeScript**: `tseslint.configs.strictTypeChecked` + `tseslint.configs.stylisticTypeChecked`, `projectService: true`
- **React**: `pluginReact.configs.flat.recommended` + hooks + compiler
- **Astro**: `eslintPluginAstro.configs["flat/recommended"]` + `["flat/jsx-a11y-recommended"]`
- **Prettier**: `eslintPluginPrettier` jako ostatni config (nadpisuje formatowanie)
- **Ignores**: `.gitignore` przez `includeIgnoreFile` z `@eslint/config-helpers`

`eslint.config.js:1` — komentarz `@typescript-eslint/no-deprecated` może być nieaktualny. `tseslint.config()` nie jest deprecated w v8.

### Kontekst historyczny

- Brak wcześniejszych change-id związanych z ESLint
- `health-check.md` rekomenduje zaplanowanie ESLint 10 jako osobnego change-id z pełnym `/10x-new → /10x-research → /10x-plan → /10x-implement`
- `npm audit` czysty — 0 podatności
- Aktualne wersje `@eslint/js` i `eslint` to już 9.39.4 (zainstalowane), mimo że `package.json` deklaruje `^9.29.0`

## Code References

- `eslint.config.js:15` — `eslint.configs.recommended` (3 nowe reguły w ESLint 10)
- `eslint.config.js:25` — `@typescript-eslint/no-unused-vars` (JSX tracking może zmienić zachowanie)
- `eslint.config.js:71-79` — eksport konfiguracji z `includeIgnoreFile`, `baseConfig`, `reactConfig`, `astroConfig`, `eslintPluginPrettier`
- `package.json:14-34` — dependencies (z `@eslint/config-helpers` błędnie w `dependencies`)
- `package.json:36-57` — devDependencies (z nieużywanymi `@eslint/compat`, `eslint-config-prettier`)
- `.nvmrc` — Node.js 22.14.0 (spełnia wymaganie ESLint 10)
- `.github/workflows/ci.yml:20` — `npm run lint` w CI
- `context/foundation/health-check.md:199-214` — rekomendacja zaplanowania upgrade jako osobnego change-id

## Historical Context (from prior changes)

- `context/foundation/health-check.md` — jedyna wzmianka o ESLint 10: zaplanować jako change-id, severity medium, effort moderate

## Related Research

Brak — pierwszy research dotyczący ESLint w tym repozytorium.

## Open Questions

1. Czy `eslint-plugin-react@7.37.5` działa bez problemów z ESLint 10 mimo braku `^10` w peer deps? (Prawdopodobnie tak — breaking changes ESLinta 10 są w core API, nie w rule-level API. Do zweryfikowania po upgrade.)
2. Czy są jakieś `/* eslint-env */` komentarze w źródłach? (Do sprawdzenia przed upgrade.)
3. Czy `@typescript-eslint/no-deprecated` disable w linii 1 `eslint.config.js` jest nadal potrzebny? (Prawdopodobnie nie — `tseslint.config()` nie jest deprecated.)
