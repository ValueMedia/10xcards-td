<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Cambridge Dictionary CLI Integration

- **Plan**: context/changes/cambridge-dict-cli/plan.md
- **Mode**: Deep
- **Date**: 2026-06-18
- **Verdict**: SOUND (po poprawkach)
- **Findings**: 0 critical, 0 warnings, 0 observations (wszystkie naprawione)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | PASS |

## Grounding
10/10 paths ✓, 5/5 symbols ✓, brief↔plan ✓

## Findings

### F1 — Backward compatibility: null content złamie istniejący flow

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — stawka architektoniczna; przemyśl uważnie
- **Dimension**: Blind Spots
- **Location**: Phase 3 — Function-Calling Integration
- **Detail**: Plan zmienia `content` w `openRouterResponseSchema` na nullable, ale `ai.ts:188` przekazuje go bezpośrednio do `parseProposals(content)`, która woła `raw.trim()` — crash na `null`. Plan nie wspomina o guardzie.
- **Fix A ⭐ Recommended**: Dodaj null guard w `generateFlashcardProposals` przed wywołaniem `parseProposals`
  - Strength: Minimalna zmiana, chroni istniejący flow, nie wymaga modyfikacji `parseProposals`.
  - Tradeoff: Nie obsługuje przypadku gdzie null content jest prawidłowy (np. tool_calls bez content).
  - Confidence: HIGH — dokładnie ten wzorzec guarda jest użyty w `ai.ts:181` dla `choices.length === 0`.
  - Blind spot: Czy OpenRouter kiedykolwiek zwraca null content w single-turn mode? Niezweryfikowane.
- **Fix B**: Przerób `parseProposals` na przyjmowanie `string | null` i zwracanie błędu zamiast crashowania.
  - Strength: Centralna obsługa nulla, chroni wszystkich callerów.
  - Tradeoff: Zmienia sygnaturę eksportowanej funkcji — blast radius na testy i potencjalnych przyszłych callerów.
  - Confidence: MEDIUM — `parseProposals` jest eksportowane, ale obecnie wołane tylko z `ai.ts:189`.
  - Blind spot: Czy inne części codebase polegają na tym, że `parseProposals` zawsze dostaje string?
- **Decision**: FIXED via Fix A

### F2 — Sprzeczność w propagacji błędów tool-calla

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — stawka architektoniczna; przemyśl uważnie
- **Dimension**: Blind Spots
- **Location**: Phase 3 — kontrakt handlera vs kontrakt testów
- **Detail**: Kontrakt handlera `onToolCall` łapie błędy i zwraca JSON do LLM (loop kontynuuje). Ale kontrakt testów mówi "error propagated" (do callera). Sprzeczność.
- **Fix A ⭐ Recommended**: Feeduj błędy do LLM (jak w kontrakcie handlera). Dodaj w planie: "Tool execution errors are returned to the LLM as JSON error strings; the LLM can adapt."
  - Strength: Zgodne z "What We're NOT Doing" — "Errors propagate to the LLM as tool-call error responses".
  - Tradeoff: LLM może zignorować błąd i wygenerować fiszkę bez definicji.
  - Confidence: HIGH — plan-brief.md:30 explicite mówi "Errors propagate to the LLM".
  - Blind spot: Czy wszystkie modele OpenRouter dobrze obsługują tool-result errors? Niezweryfikowane.
- **Fix B**: Propaguj błędy do callera (przerywaj generowanie).
  - Strength: Prostsze — brak kontynuacji po błędzie.
  - Tradeoff: Sprzeczne z "What We're NOT Doing" i plan-brief.
  - Confidence: LOW — plan nigdzie nie mówi o przerywaniu generowania przy błędzie słownika.
  - Blind spot: Czy użytkownicy wolą częściowe fiszki bez definicji trudnych słów, czy błąd i zero fiszek?
- **Decision**: FIXED via Fix A

### F3 — Rate-limit: plan nie precyzuje jak zaimplementować

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — szybka decyzja; fix jest oczywisty i wąski
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — API Endpoint
- **Detail**: `checkRateLimit` hardcoduje prefix `ai:hourly:`, TTL 3600s, limit z `HOURLY_LIMIT`. Plan mówi "reuse KV binding" ale nie mówi czy stworzyć nową funkcję czy refaktorować.
- **Fix**: Stwórz nową funkcję `checkDictRateLimit(kv, userId)` w `ai-rate-limit.ts` z prefixem `dict:minute:`, TTL 60s, limitem 30. Nie refaktoruj `checkRateLimit`.
- **Decision**: FIXED

### F4 — Niejasna semantyka "final response" dla mieszanych odpowiedzi

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — realny tradeoff; zastanów się
- **Dimension**: Blind Spots
- **Location**: Phase 3 — Tool-call loop
- **Detail**: "Final response" było niejednoznaczne — content z oryginalnej czy z re-fetchu?
- **Fix A ⭐ Recommended**: Zawsze używaj contentu z OSTATNIEJ odpowiedzi w loopie (po przetworzeniu wszystkich tool calls).
  - Strength: Jednoznaczne. Content placeholdera z pierwszej odpowiedzi nie trafi do użytkownika.
  - Tradeoff: Jeden dodatkowy round-trip jeśli LLM zwrócił content + tool_calls.
  - Confidence: HIGH — standardowe zachowanie w OpenAI function-calling.
  - Blind spot: None significant.
- **Fix B**: Użyj contentu z oryginalnej odpowiedzi jeśli jest niepusty, ignoruj tool_calls.
  - Strength: Mniej round-tripów.
  - Tradeoff: Ryzyko użycia niekompletnego/placeholderowego contentu.
  - Confidence: LOW.
  - Blind spot: Zachowanie modeli przy content+tool_calls niezweryfikowane.
- **Decision**: FIXED via Fix A (przy okazji F2)

### F5 — Manual testing: `astro dev` może nie wspierać HTMLRewriter

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — szybka decyzja; fix jest oczywisty i wąski
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Manual Verification
- **Detail**: Plan-brief przyznaje że `astro dev` może nie wspierać HTMLRewriter, ale manual verification używa portu 4321 (astro dev).
- **Fix**: Zmień instrukcje na `wrangler dev` (port 8787) z notką o HTMLRewriter.
- **Decision**: FIXED

### F6 — Brak explicite rollback story

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — szybka decyzja; fix jest oczywisty i wąski
- **Dimension**: Blind Spots
- **Location**: Cały plan
- **Detail**: Plan nie opisuje jak cofnąć zmiany. W praktyce `tools` jest opcjonalny, ale warto to zapisać.
- **Fix**: Dodaj sekcję "Rollback" z instrukcjami per faza.
- **Decision**: FIXED
