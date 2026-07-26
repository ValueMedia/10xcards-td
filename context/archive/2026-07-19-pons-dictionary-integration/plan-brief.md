# Pons Dictionary Integration (DE→PL) — Plan Brief

> Full plan: `context/changes/pons-dictionary-integration/plan.md`
> Research: `context/changes/pons-dictionary-integration/research.md`

## What & Why

Dodajemy niemiecko-polski słownik Pons (`l=depl`) jako drugie źródło lookup obok istniejącej integracji Cambridge English. Użytkownicy 10xCards uczący się niemieckiego dostają tę samą funkcjonalność co uczący się angielskiego: wyszukiwanie tłumaczeń + tworzenie fiszek z wyników + autonomia AI w wywoływaniu słownika podczas generowania. Pons zwraca natywny JSON (nie HTML do scrapowania jak Cambridge), ale nakłada limit **1000 zapytań/miesiąc** na konto — wymusza to warstwę cache w KV, której Cambridge nie ma.

## Starting Point

Istnieje pełna integracja Cambridge w 5 warstwach: serwis (`dictionary.ts`), endpoint (`/api/dict/[word]`), OpenAPI spec, UI (`/lookup_word` + `LookupWordPage.tsx` + `dict-client.ts`), AI tool (`lookup_word` w `generate.ts`). Wzorzec jest sprawdzony (3 commity archiwum: `cambridge-dict-cli`, `lookup-word-page`, `testing-external-integrations`). Brakuje: drugiego źródła dla DE, sekretu Pons, cache'a KV, drugiego narzędzia AI.

## Desired End State

Polish-native user uczący się niemieckiego klika "Wyszukaj słowo niemieckie" na stronie zestawu DE, wpisuje `Haus`, widzi polskie tłumaczenia ze słownika Pons (~2s dla cached, ~3-5s dla świeżych), tworzy fiszkę. Może wygenerować fiszki AI dla zestawu DE — LLM autonomcznie wywołuje `lookup_word_de`, gdy potrzebuje polskiego tłumaczenia niemieckiego słowa. Limit 30 lookupów/min/user współdzielony z EN; cache 30 dni w KV ochroni limit Pons 1000/mc.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Kierunek Pons | `depl` (DE→PL) | Zgodne z językiem UI — polski użytkownik uczy się niemieckiego, polskie tłumaczenia są naturalne. | Plan (pytanie Q1) |
| Cache | KV, TTL 30 dni, key `pons:de:{word}` | Bez cache'a limit 1000/mc pęka pierwszego dnia aktywności (30 userów × 10 słów × 30 dni = 9000). | Plan (pytanie Q2) |
| Fallback Pons→Wiktionary | Nie — osobny change | Mniejszy scope MVP; Pons + cache wystarczy na wczesny etap. | Plan (pytanie Q3) |
| AI tool | Osobne `lookup_word_de` obok `lookup_word` | Nie psuje kontraktu AI dla EN; LLM wybiera po opisie narzędzia. | Plan (pytanie Q4) |
| Sekret Pons | Jeden wspólny `PONS_API_SECRET` | Realistyczne dla MVP — userzy nie muszą zakładać kont u Pons; per-user rate-limit 30/min chroni przed nadużyciem. | Plan (pytanie Q5) |
| UI | Osobna strona `/lookup_word_de` (nie parametr `lang`) | Wybrana przez użytkownika opcja 1 — duplikat kodu jest akceptowalny za czystą separację. | Plan (pytanie wstępne) |
| Współdzielenie `DictionaryEntry` | Tak — Pons wstawia `dictionaryRegion: null`, `info` = Pons subject | Brak rozgałęzienia typów; UI używa tego samego `EntryCard`. | Research |
| Rate-limit EN+DE | Współdzielony `checkDictRateLimit` (30/min) | User hammerujący DE nie dostaje więcej pojemności niż EN; Pons quota i tak jest wiążące. | Plan |
| KV namespace | Reuse `AI_RATE_LIMIT` (key prefix `pons:de:`) | Brak nowego bindingu; prefix rozdziela namespaces. | Research |
| Timeout | `AbortSignal.timeout(10000)` dla Pons | Cambridge nie ma timeoutu (znany gap); Pons dostaje go od pierwszego dnia. | Research + lessons L105-110 |

## Scope

**In scope:**
- Nowy serwis `src/lib/services/dictionary-de.ts` z `lookupWordDe` + cache KV (TTL 30d) + 10s timeout
- Nowy endpoint `GET /api/dict/de/[word]` z auth + rate-limit + Pons status mapping (204→[], 403/5xx→502, 200→cache)
- Nowy OpenAPI path `/api/dict/de/{word}` współdzielący `DictionaryEntry` schema
- Nowa strona `/lookup_word_de.astro` + React island `LookupWordPageDe.tsx` + klon `dict-client.ts`
- Nowy wpis w `SetDetailPage.tsx` — przycisk do `/lookup_word_de?setId=...`
- i18n keys `lookup_de.*` i `set.lookupWordDe` (PL + EN)
- Nowy AI tool `lookup_word_de` w `generate.ts` + rozszerzenie `handleToolCall`
- `PONS_API_SECRET` w `astro.config.mjs` env schema + instrukcja `wrangler secret put`
- Testy: 15 przypadków serwisu (workers project), 6 przypadków endpointu (node project), 3 przypadki generate.ts (node project)
- Middleware: `/lookup_word_de` w `PROTECTED_PAGE_ROUTES`

**Out of scope:**
- Fallback na Free Dictionary API / Wiktionary (osobny change)
- Refactor `dictionary.ts` do dispatchera `lookupWord(word, lang)` (osobny change)
- Konta per-user u Pons (nie-realne dla MVP)
- Kierunek `deen` (EN tłumaczenia dla DE)
- IPA / audio / wymowa (Pons ma URL-e audio, ale renderowanie jest osobnym UX workiem)
- Przycisk "Check" na `/generate` linkujący do `/lookup_word_de` (osobny change)
- Timeout fix dla Cambridge `dictionary.ts:28` (osobny change)
- Podział `DictionaryEntry` na schema per-źródło
- Feature flag — endpoint działa, gdy sekret istnieje; 502 gdy brak

## Architecture / Approach

```
dictionary.ts (Cambridge, EN)      dictionary-de.ts (Pons, DE→PL)   ← Phase 1
        │                                  │
        ▼                                  ▼
/api/dict/[word]                    /api/dict/de/[word]              ← Phase 2
        │                                  │
        ▼                                  ▼
dict-client.ts → LookupWordPage    dict-de-client.ts → LookupWordPageDe  ← Phase 3
        │                                  │
        ▼                                  ▼
DICTIONARY_TOOL (lookup_word)      DICTIONARY_TOOL_DE (lookup_word_de)   ← Phase 4
   in generate.ts                     in generate.ts
```

Parallel surfaces, nie refactor. 4 fazy, każda niezależnie commitowalna z zielonymi testami. Cache read-through w istniejącym KV `AI_RATE_LIMIT` (key prefix `pons:de:`). Rate-limit współdzielony z EN przez `checkDictRateLimit`. Sekret przez `astro:env/server` `getSecret("PONS_API_SECRET")` (wzorzec `SUPABASE_KEY`).

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Pons service + KV cache | `dictionary-de.ts` z 15 testami | Mapping JSON Pons → `DictionaryEntry` (zagnieżdżenie `hits→roms→arabs→senses→translations`); cache poisoning — nie cache'ować 204/4xx/5xx |
| 2. Endpoint + OpenAPI + middleware | `GET /api/dict/de/[word]` z 6 testami, spec w `/docs/api` | Status mapping 204→[] vs 403→502; współdzielenie rate-limitu z EN nie psuje istniejących testów Cambridge |
| 3. UI — `/lookup_word_de` | Strona + wyspa React + klon klienta + i18n + przycisk na SetDetailPage | Ekstrakcja `EntryCard`/`CreateCardForm` do współdzielonych plików bez regressji Cambridge; ukrycie pustego badge'a regionu |
| 4. AI tool `lookup_word_de` | Drugi tool w `generate.ts`, dispatch, 3 testy | LLM musi pickować właściwe narzędzie po opisie — opis `lookup_word_de` musi jednoznacznie mówić "German word, Polish translation"; test regresji na EN |

**Prerequisites:** Konto Pons z aktywnym API (darmowe, 1000/mc), `PONS_API_SECRET` ustawiony przez `wrangler secret put` (i w `.dev.vars` dla local dev). Local Supabase działające (`npx supabase start`). Node 22.14.0.
**Estimated effort:** ~2-3 sesje po 2-3h każda (faza 1+2 razem ~3h, faza 3 ~3h, faza 4 ~1.5h).

## Open Risks & Assumptions

- **Pons JSON shape nieudokumentowany publicznie poza PDF** — `hits[].roms[].arabs[].senses[].translations[]` jest opisany w PDF, ale realny response może mieć pola opcjonalne/brakujące. Faza 1 manual verification z `npx tsx` i prawdziwym sekretem jest obowiązkowa, żeby zmapować mapping przed pisaniem endpointu.
- **Limit 1000/mc jest per-konto, nie per-IP** — przy \u003e30 aktywnych userów aplikacja przestanie działać na koniec miesiąca. Cache 30-dniowy mocno opóźnia ten moment, ale go nie eliminuje. Fallback (osobny change) lub kontrakt komercyjny z Pons (3 EUR/1000) są długoterminowo wymagane — MVP z 1000/mc + cache jest OK na walidację funkcji.
- **Pons może zmienić JSON response** — Cambridge scraping pęka przy zmianie HTML (już zdarzone w `testing-external-integrations`); Pons JSON jest stabilniejszy, ale nie ma SLA. Testy workers-project z fixture JSON są regression-guardiem.
- **LLM może wybrać złe narzędzie** — jeśli opisy `lookup_word` (EN) i `lookup_word_de` (DE→PL) nie są wystarczająco rozróżnialne, LLM może próbować tłumaczyć polskie słowa niemieckim słownikiem. Faza 4 manual verification (EN set → `lookup_word`, DE set → `lookup_word_de`) jest obowiązkowa.
- **Współdzielony rate-limit 30/min EN+DE** — user używający obu języków w tej samej minucie może czuć się ograniczony. Akceptowalne dla MVP; jeśli problem, dodać osobny prefix `dict-de:minute:` w osobnym change.
- **Brak feature flag** — endpoint jest aktywny od razu po deployu z sekretem; brak możliwości stopniowego rollout (np. 10% userów). Akceptowalne dla MVP; user base jest mały.

## Success Criteria (Summary)

- Polish-native user może na `/lookup_word_de` wyszukać niemieckie słowo, zobaczyć polskie tłumaczenia, i stworzyć fiszkę w ≤5 kliknięciach.
- AI generation dla niemieckiego zestawu autonomnie używa `lookup_word_de` (potwierdzone w logach dev).
- Limit 1000/mc Pons przetrwa realny ruch miesiąca dzięki cache'owi 30-dniowemu.
- Cambridge integration (EN) działa bez regressji — wszystkie istniejące testy zielone, manual check strony `/lookup_word` OK.