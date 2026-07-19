---
date: 2026-07-19T17:52:24+02:00
researcher: opencode (glm-5.2)
git_commit: d30e7c6a1976d357882cf5afb2660133d89a2494
branch: main
repository: ValueMedia/10xcards-td
topic: "Zbadanie integracji słownika niemieckiego (Pons + darmowe alternatywy) jako odpowiednika Cambridge Dictionary"
tags: [research, dictionary, pons, wiktionary, dwds, external-integration, scraper]
status: complete
last_updated: 2026-07-19
last_updated_by: opencode (glm-5.2)
---

# Research: Integracja słownika niemieckiego (Pons + darmowe alternatywy)

**Date**: 2026-07-19T17:52:24+02:00
**Researcher**: opencode (glm-5.2)
**Git Commit**: d30e7c6a1976d357882cf5afb2660133d89a2494
**Branch**: main
**Repository**: ValueMedia/10xcards-td

## Research Question

Chcę zbadać możliwości uruchomienia analogicznej funkcjonalności do Cambridge Dictionary dla angielskiego, tylko dla niemieckiego. Myślałem o platformie https://de.pons.com/ — zbadaj ją i ewentualnie poszukaj alternatyw, które można używać za darmo.

## Summary

Istniejąca integracja Cambridge (`src/lib/services/dictionary.ts` + `src/pages/api/dict/[word].ts` + UI `src/components/lookup/LookupWordPage.tsx`) ma czystą, kopiowalną architekturę: scraper HTMLRewriter → endpoint z rate-limit + auth → React island. Dla niemieckiego dostępne są trzy realne ścieżki:

1. **Pons API (rekomendowane jako primary)** — oficjalne, udokumentowane REST API z JSON, darmowy limit **1000 zapytań/miesiąc** na konto, wymaga darmowego konta i nagłówka `X-Secret`. Obsługuje 20 języków / 42 kombinatornie, w tym `deen` (Niemiecko-angielskie). Powyżej limitu: 3 EUR / 1000 zapytań. To **lepsza** opcja niż scraping Cambridge, bo daje stabilny JSON zamiast łamania się przy zmianie HTML.
2. **Wiktionary przez WiktApi / Free Dictionary API** — w 100% darmowe (CC BY-SA 4.0), bez klucza, ale dane są surowsze (definicje po angielsku w edycji EN, lub po niemiecku w edycji DE), bez regionalnych etykiet CEFR, bez audio w formacie gotowym do odtworzenia. Dobry fallback / uzupełnienie.
3. **DWDS (Berlin-Brandenburgische Akademie)** — darmowe API snippets `https://zwi.dwds.de/api/wb/snippet?q=...`, niemieckojęzyczne definicje, ale bardzo rudimentarne (tylko istnienie wpisu + część mowy). Pełne treści są dostępne tylko jako download (JSON/LMF), nie przez query API. Opcja tylko do wzbogacania, nie jako jedyne źródło.

**Nie polecam** scrapingu `de.pons.com` — strona ma paywall/ads wall (PONS Pur), regulamin wyraźnie wymaga kontraktu dla integracji produkcyjnej, a po co scrape'ować skoro oficjalne API ma darmowy limit. **Scraping Duden** (`duden.de/rechtschreibung/{word}`) istnieje jako lib Pythonowy, ale Duden silnie blokuje boty i regulamin tego zabrania.

**Rekomendacja**: wdrożyć Pons API jako primary (wykorzystać 1000 darmowych zapytań/mc) z fallbackiem na Free Dictionary API (Wiktionary) gdy limit Pons wyczerpany lub gdy Pons nie zna słowa. Architektura: nowy `src/lib/services/dictionary-de.ts` z `lookupWordDe(word)` (analogiczny kontrakt do `lookupWord`), nowy endpoint `GET /api/dict/de/[word]` współdzielący rate-limit z istniejącym (lub z osobnym prefixem), rozszerzenie `DictionaryEntry` o pole językowe, parametryzacja UI island `lang` (lub klon strony).

## Detailed Findings

### 1. Pons — oficjalne API (podstawowa rekomendacja)

**Źródła**: [de.pons.com/p/online-woerterbuch/fuer-entwickler/api](https://de.pons.com/p/online-woerterbuch/fuer-entwickler/api), [AGB-API](https://de.pons.com/p/agb-api), [dokumentacja PDF](https://en.pons.com/assets/docs/api_dict.pdf)

**Darmowy limit**: 1000 zapytań/miesiąc na konto (po darmowej rejestracji + aktywacji API). Powyżej: kontrakt pisemny, stawka 3 EUR / 1000 zapytań.

**Endpoint**:
- `GET https://api.pons.com/v1/dictionaries` — lista dostępnych słowników
- `GET https://api.pons.com/v1/dictionary?q={word}&l={dict}&in={srcLang}&language={out}&fm=1&ref=true`
  - nagłówek `X-Secret: {token}`
  - `l=deen` dla niemiecko-angielskiego (dwukierunkowy); można też `detr`, `defr`, `depl` itd.
  - `language=pl` lub `en` steruje językiem nagłówków/sensów w odpowiedzi
  - `fm=1` włącza fuzzy matching (tolerancja na literówki)
  - `ref=true` włącza referencje (polecane w docs)

**Kody odpowiedzi**:
- 200 OK (są wyniki, JSON)
- 204 NO CONTENT (brak wyników — analogiczne do `entries: []`)
- 404 NOT FOUND (słownik nie istnieje)
- 403 NOT AUTHORIZED (błędny/brak `X-Secret` lub brak dostępu do słownika)
- 500 INTERNAL SERVER ERROR

**To istotna zmiana vs Cambridge**: tu mamy **natywny JSON**, a nie HTML do scrapowania. `HTMLRewriter` nie jest potrzebny — wystarczy `fetch` + `response.json()`. Mniejsze ryzyko łamania się przy zmianie layoutu.

**Wady**:
- Wymaga sekretu (`X-Secret`) — nowa zmienna środowiskowa na Cloudflare (np. `PONS_API_SECRET`), przekazana przez `astro:env/server` (wzorzec z `SUPABASE_KEY`).
- Limit 1000/mc dzielony między wszystkich użytkowników aplikacji, jeśli używamy jednego konta. Przy 30 zapytanych słów/dzień/user i N aktywnych userów limit pęka szybko → dla produkcji trzeba: (a) per-user auth z własnym tokenem (nieREALne), (b) kontrakt komercyjny z Pons, lub (c) fallback na Wiktionary po wyczerpaniu limitu. **Można też** zrobić cache po słowie w KV (Cambridge celowo nie cache'uje, ale tu limity wymuszają).

**Na etapie MVP / wczesnego produktu**: 1000/mc wystarczy do walidacji funkcji. Należy zaplanować cache (Cloudflare KV, TTL np. 30 dni per `word+direction`).

**TOS / legal**: [AGB-API](https://de.pons.com/p/agb-api) wymaga logo PONS na stronie korzystającej, zakaz udostępniania tokenu, zakaz przekraczania limitu. Na produkcję: kontakt z `rights@pons.de`. Scrape'ować `de.pons.com` **nie wolno** (strona za paywallem/ads, regulamin wyraźnie wymaga API).

### 2. Free Dictionary API (Wiktionary EN) — fallback

**Źródło**: [freedictionaryapi.com](https://freedictionaryapi.com/)

- Endpoint: `GET https://api.dictionaryapi.dev/api/v2/entries/de/{word}` — wspiera `de` jako język docelowy (słowa niemieckie z edycji angielskiej Wiktionary, definicje po angielsku).
- **Bez klucza**, limit 1000 req/godz. na IP (reset co pełną godzinę UTC), 429 po przekroczeniu.
- Dane: CC BY-SA 4.0 (wymaga attribucji).
- Zwraca bogaty JSON: `phonetics` (IPA + audio URL!), `meanings[].definitions[].definition`, `meanings[].partOfSpeech`, czasem `examples`.
- **Wada**: definicje są po **angielsku** (bo to edycja EN Wiktionary). Dla uczącego się niemieckiego to akceptowalne (ucz się DE→PL/EN), ale nie zastąpi niemieckojęzycznego słownika monolingualnego.

### 3. WiktApi — strukturalny Wiktionary wielojęzyczny

**Źródło**: [wiktapi.dev](https://wiktapi.dev/) / [GitHub](https://github.com/TheAlexLichter/wiktionary-api)

- Hostowane na `api.wiktapi.dev` (z Scalar docs) lub self-hosted (pojedynczy plik SQLite).
- `GET /v1/de/word/{word}` — edycja DE Wiktionary, definicje po niemiecku (język docelowy = Niemiecki, uczący się DE jako obcy).
- `GET /v1/de/word/{word}/pronunciations` — IPA
- `GET /v1/de/word/{word}/translations` — tłumaczenia
- `GET /v1/de/word/{word}/forms` — fleksja (genus, przypadki, liczba)
- Dane pre-procesowane z [kaikki.org](https://kaikki.org/dictionary/rawdata.html) (JSONL Wiktionary).
- **Bez klucza, bez podanego limitu**, open-source, self-hostable.
- **Wada**: młody projekt (publikacja 2026-02), mała stabilność gwarantowana. Dla produkcji rozważyć self-hosting.

### 4. DWDS — niemieckojęzyczny słownik akademicki

**Źródło**: [zwei.dwds.de/d/api](https://zwei.dwds.de/d/api)

- `GET https://zwei.dwds.de/api/wb/snippet?q={lemma}` — zwraca **rudimentarne** info: istnienie wpisu, część mowy, linki. Nie pełne definicje przez API.
- Pełne treści dostępne tylko jako **download** (JSON, LMF, dump) — dla statycznego offline'owego słownika, nie do live query.
- Plus: `https://zwei.dwds.de/api/wb/random` — losowe słowa.
- Korpusy (corpus) z dostępem po loginie, ale API ograniczone.
- **Wniosek**: DWDS nie nadaje się jako jedyne źródło live lookup, ale można dodać jako uzupełnienie (np. przykład użycia z korpusu) w przyszłości.

### 5. Scraping Duden — odradzam

- Python lib [radomirbosak/duden](https://github.com/radomirbosak/duden) scrapuje `duden.de/rechtschreibung/{word}`.
- Duden agresywnie blokuje boty (Cloudflare/bot-detection), regulamin zabrania scrapingu, brak oficjalnego API.
- **Nie polecam**: łamie ToS, niestabilne, moralnie/legalnie ryzykowne na produkcję.

### 6. Pons scrape (strona www) — odradzam

- `de.pons.com` ma warstwę "PONS Pur" (paywall za brak reklam), regulamin jawnie wymaga API do integracji, strona blokuje/utrudnia boty.
- **Nie ma sensu scrape'ować**, skoro oficjalne API daje 1000 darmowych zapytań/mc + JSON zamiast HTML. To byłby krok w tył vs Cambridge.

## Code References (istniejąca integracja Cambridge)

| Element | Lokalizacja | Co tam jest |
|---|---|---|
| Typ `DictionaryEntry` | `src/types.ts:97-103` | `{ definition, type, dictionaryRegion:"UK"\|"US"\|null, info, examples[] }` — union regionów jest EN-centric, wymaga rozszerzenia lub nowego typu |
| Scraper serwis | `src/lib/services/dictionary.ts:24-166` | `lookupWord(word)` — HTMLRewriter z selektorami Cambridge, redirect short-circuit + `!response.ok` throw (w tej kolejności) |
| API endpoint | `src/pages/api/dict/[word].ts:8-51` | `GET`, auth-required, `checkDictRateLimit` (30/min/user), 502 on throw, 429 z `Retry-After: 60` |
| Rate-limit | `src/lib/services/ai-rate-limit.ts:37-72` | `checkDictRateLimit`, klucz `dict:minute:{uid}:{YYYY-MM-DDTHH:MM}`, KV `AI_RATE_LIMIT`, fail-closed, limit 30/min |
| Middleware | `src/middleware.ts:7, :16` | `/lookup_word` (page) + `/api/dict` (api) w listach protected |
| OpenAPI spec | `src/lib/openapi/openapi-spec.ts:108-206` | `DictionaryEntry` schema + path `/api/dict/{word}` z tagiem "Dictionary" |
| UI island | `src/components/lookup/LookupWordPage.tsx:21-367` | Form → `lookupWordClient` → `EntryCard` (region badge, type, info, definition, examples ≤2) |
| Klient | `src/lib/dict-client.ts:29-43` | `lookupWordClient(word)` fetch z credentials, `DictionaryLookupError` ze statusem |
| Strona | `src/pages/lookup_word.astro:1-35` | SSR + `<LookupWordPage client:load />`, protected |
| Integracja AI | `src/pages/api/sets/[id]/generate.ts:13, :19-43` | `DICTIONARY_TOOL` (`lookup_word`) woła `lookupWord` bezpośrednio (nie przez HTTP) |
| Testy scrapera | `src/lib/services/dictionary.test.ts:1-209` | 10 przypadków, projekt `workers` (real HTMLRewriter) |
| Testy endpointu | `src/pages/api/dict/[word].test.ts:1-84` | 6 przypadków (401/400/429/200/200-empty/502), projekt `node` |
| i18n | `src/lib/i18n/locales/{en,pl}/lookup.json` | namespace `lookup.*` (intro mówi "Cambridge Dictionary") |

## Architecture Insights

### Wzorzec Cambridge do skopiowania (lub zparametryzowania)

1. **Warstwa serwisu** (`dictionary.ts`) — ma jedno źródło (Cambridge). Dla DE można:
   - **(a) Nowy plik** `dictionary-de.ts` z `lookupWordDe(word)` — proste, explicit, ale duplikuje rate-limit/typowanie. **Rekomendowane dla MVP**.
   - **(b) Refaktor do dispatcher'a** `lookupWord(word, lang)` z rejestrem źródeł per `lang` — czystsze długoterminowo, ale większy scope (stuktura UI, AI tool, client, tests). Odradzam w tym change-id; zostawić jako osobny refactor.
2. **Warstwa API** — `src/pages/api/dict/de/[word].ts` (nowy) vs `?lang=de` na istniejącym. **Osobny endpoint** prostszy do rate-limitowania, OpenAPI i testów — zgodnie z lesson "każda zmiana kontraktu API musi aktualizować `openapi-spec.ts`" (`context/foundation/lessons.md:84-89`).
3. **Warstwa UI** — `LookupWordPage` jest hard-coded do Cambridge. Trzy opcje:
   - **Klon** `LookupWordPageDe.tsx` + `lookup_word_de.astro` — najszybsze, duplikat kodu.
   - **Parametr `lang`** na istniejącym + dispatch w `lookupWordClient(word, lang)` — **rekomendowane**, mniej duplikacji, jeden i18n namespace rozszerzony o `lookup.de.*`.
   - **Wspólny komponent + sloty źródłowe** — overkill na MVP.
4. **Rate-limit** — można współdzielić `checkDictRateLimit` (jeden limit na "wszystkie lookupy") lub dodać `checkDictDeRateLimit` z osobnym prefixem `dict-de:minute:`. Pons ma własny limit 1000/mc, więc lokalny rate-limit po stronie 10xCards chroni głównie przed nadużyciem usera, nie przed wyczerpaniem Pons. **Rekomendacja**: osobny prefix `dict-de:minute:` z tym samym progiem 30/min, żeby ruch DE nie zżerał limitu EN.

### Zastosowane lessons (z `context/foundation/lessons.md`)

- **L105-110 (scraper must check `response.ok`)** — dla Pons to proste: 204 = puste, 4xx/5xx → throw → 502. Kolejność: najpierw sprawdzić status, potem parse JSON.
- **L84-89 (każda zmiana API → update OpenAPI)** — endpoint `/api/dict/de/{word}` musi wejść do `openapi-spec.ts` w tym samym change.
- **L26-36 (JWT local Supabase do testowania serwisów)** — przy testach integracji Pons z `astro:env/server`.
- **L112-117 (test route'a API z `astro:env/server` w projekcie node)** — alias + `vi.mock` rate-limit. Testy endpointu DE w projekcie `node`, z `checkDictDeRateLimit` mockowane na `{allowed:true}`.
- **L77-82 (deploy przez push, nie `wrangler deploy`)** — sekret `PONS_API_SECRET` ustawić przez `wrangler secret put`, kod wchodzi przez push do main.

### Koszty / limity — model zużycia

| Źródło | Darmowy limit | Co po limicie | Klucz? | Cache? |
|---|---|---|---|---|
| Pons API | 1000/mc/konto | 3 EUR / 1000 (kontrakt) | tak (`X-Secret`) | **wskazany** (KV, TTL 30d) |
| Free Dictionary API | 1000/godz/IP | 429 do końca godziny | nie | opcjonalny |
| WiktApi | brak podanego | self-host | nie | opcjonalny |
| DWDS snippet | brak jawnego | — | nie | opcjonalny |
| Cambridge (istniejące) | brak (scrape) | 429/ban ryzyko | nie | świadomie brak |

Przykład: 30 aktywnych userów × 10 lookupów/dzień × 30 dni = 9000/mc → Pons darmowy limit pęka 1. dnia. Bez cache'a albo kontraktu Pons nie jest skalowalne. **Cache jest obowiązkowy** dla Pons (Cloudflare KV, key `pons:de:{word}`, TTL 30 dni — definicje się nie zmieniają codziennie).

## Historical Context (from prior changes)

- `context/archive/2026-06-18-cambridge-dict-cli/` — referencyjna implementacja. Architektura: scraper → endpoint → AI tool. Zostało zapomniane o aktualizacji `openapi-spec.ts` (stało się lesson L84-89). W change DE **musi** wejść aktualizacja spec-a w tej samej fazie.
- `context/archive/2026-06-19-lookup-word-page/` — UI `/lookup_word` + `dict-client.ts` + i18n namespace `lookup`. UI jest hard-coded do jednego źródła — dodaanie DE wymaga decyzji: klon vs parametr `lang` (patrz Architecture Insights).
- `context/archive/2026-07-08-testing-external-integrations/` — testy failure-path + dwa fixy produkcyjne (`!response.ok` check, timeout 40s→10s). **Kluczowe**: scraper DE musi mieć `AbortSignal.timeout(10000)` (Cambridge jeszcze nie ma — znany gap), sprawdzić `response.ok` przed `json()`. Testy scrapera w projekcie `workers`, testy endpointu w `node` z mockiem rate-limitu.
- `context/archive/2026-06-20-check-word-while-generating/` — przycisk "Check" na `/generate` otwiera `/lookup_word?word=...`. Jeśli UI DE będzie osobną stroną, ten flow trzeba zduplikować; jeśli parametryzacja `lang` — bez zmian.

## Open Questions

1. **UI: osobna strona `/lookup_word_de` czy parametr `lang` na istniejącej?** — decyzja projektowa przed `/10x-plan`. Parametr `lang` jest czystszy, ale wymaga refaktora `LookupWordPage` i `dict-client.ts`. Osobna strona to duplikat ~400 linii.
2. **Cache dla Pons: czy w tym change czy osobno?** — Pons bez cache'a pęka na 1 dzień aktywności. KV cache (key `pons:de:{word}`, TTL 30d) powinien wejść w tej samej fazie co serwis, inaczej MVP nie jest usable na dłuższą metę.
3. **Fallback Pons → Wiktionary: w scope tego change?** — Jeśli Pons 403/429 lub limit wyczerpany, czy automatycznie spróbować Free Dictionary API? Zwiększa resilientność, ale rozszerza scope. Proponuję: w MVP tylko Pons + cache, fallback jako osobny change.
4. **AI tool integration**: czy `lookup_word` w `generate.ts` ma dostać parametr `lang` (LLM sam wybiera) czy dodać osobne narzędzie `lookup_word_de`? Osobne narzędzie jest prostsze i nie psuje istniejącego kontraktu AI.
5. **Kierunek tłumaczenia Pons**: `l=deen` (DE↔EN) czy `l=depl` (DE↔PL)? Użytkownicy 10xCards są PL-native uczący się DE → `depl` daje tłumaczenia po polsku (lepszse UX), `deen` daje definicje EN (bardziej międzynarodowe). Może oba? Kosztuje osobne zapytania = 2× limit. **Proponuję `depl` jako primary** (zgodne z językiem UI), `deen` jako opcja w przyszłości.
6. **Self-host WiktApi jako długoterminowy backup?** — projekt open-source, SQLite, self-host na Cloudflare Worker z D1. Większy scope, osobny change.
7. **Sekret Pons**: jeden współdzielony `PONS_API_SECRET` (limit 1000/mc dla całej aplikacji) czy per-user token (wymaga rejestracji każdego usera u Pons — nie realne dla MVP)? **Jeden wspólny + cache + rate-limit per-user (30/min) po naszej stronie.**

## Related Research

- `context/archive/2026-07-08-testing-external-integrations/research.md` — wzorce testowania external integracji (HTMLRewriter, fail-closed rate-limit, testowe projekty Vitest `workers`/`node`)
- `context/archive/2026-06-18-cambridge-dict-cli/plan.md` — referencyjna 3-fazowa struktura implementacji (serwis → endpoint → AI tool)

## Rekomendowany następny krok

`/10x-plan pons-dictionary-integration` — na bazie tego researchu zaplanować fazy:
1. **Faza 1**: serwis `dictionary-de.ts` (Pons API + cache KV) + testy
2. **Faza 2**: endpoint `GET /api/dict/de/[word]` + rate-limit + OpenAPI spec + testy
3. **Faza 3**: UI — parametryzacja `LookupWordPage` i `dict-client.ts` o `lang`, nowy routing, i18n
4. **Faza 4**: integracja AI tool `lookup_word_de` w `generate.ts`
5. **Faza 5** (opcjonalnie): fallback na Free Dictionary API przy 429/403 z Pons