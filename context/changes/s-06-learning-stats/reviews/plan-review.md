<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Learning Stats Dashboard Implementation Plan

- **Plan**: context/changes/s-06-learning-stats/plan.md
- **Mode**: Deep
- **Date**: 2026-06-14
- **Verdict**: REVISE
- **Findings**: 1 critical · 3 warnings · 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | FAIL |

## Grounding

5/5 paths ✓ · 3/3 symbols (setId prop line 12, setPhase("summary") line 87-88, listSetsWithFlashcardCounts in dashboard.astro) ✓ · brief↔plan ✓

## Findings

### F1 — Brak `export const prerender = false` w kontrakcie endpointu

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — szybka decyzja; poprawka oczywista i wąska
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — src/pages/api/sessions/index.ts
- **Detail**: Plan mówi „Follow the pattern from src/pages/api/reviews/index.ts", ale nie wymieniał `export const prerender = false` jawnie w kontrakcie. CLAUDE.md wymaga tego eksportu na wszystkich API routes. Bez niego endpoint zwraca 404/405 w Cloudflare Workers.
- **Fix**: Dodaj `export const prerender = false` do kontraktu Phase 2.
- **Decision**: FIXED via Fix

### F2 — Phase 1 Progress brakuje checkboxa dla weryfikacji migracji

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — szybka decyzja; poprawka oczywista i wąska
- **Dimension**: Plan Completeness
- **Location**: Phase 1 Success Criteria vs. ## Progress
- **Detail**: Sekcja Automated Verification Phase 1 wymienia 3 kryteria (migration, lint, build) ale Progress miał tylko 2 (lint, build). /10x-implement parsuje wyłącznie Progress — brakujące kryterium nie zostałoby zweryfikowane.
- **Fix**: Dodaj `- [ ] 1.1 Migration applies cleanly` i przenumeruj pozostałe.
- **Decision**: FIXED via Fix

### F3 — Endpoint /api/sessions nie weryfikuje własności setu

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — warto się zatrzymać; realne tradeoffs
- **Dimension**: Blind Spots
- **Location**: Phase 2 — API Endpoint contract
- **Detail**: RLS INSERT sprawdza tylko `user_id = auth.uid()`, nie weryfikuje czy `set_id` należy do użytkownika. Uwierzytelniony user może wstawić sesję z cudzym set_id. lessons.md wymaga sprawdzenia własności na każdej operacji na secie.
- **Fix A ⭐ Recommended**: Dodaj ownership check przed `logSession`: query sets z eq(user_id) → 403 jeśli brak.
- **Decision**: ACCEPTED

### F4 — getLearningStats: dwa niezresolwowane pytania o PostgREST syntax

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architektoniczne stawki; poważnie pomyśl zanim zdecydujesz
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — getLearningStats function
- **Detail**: PostgREST nie wspiera GROUP BY date_trunc (pewnik). Supabase JS v2 nie wspiera dwóch różnych filtrów na tym samym embedded resource. Plan zostawiał otwarte pytania zamiast rozstrzygnąć — implementer trafiłby na ścianę mid-phase.
- **Fix A ⭐ Recommended**: TypeScript aggregation — fetch raw rows, aggregate in TS; dwa osobne queries dla total i learned counts.
- **Decision**: FIXED via Fix A
