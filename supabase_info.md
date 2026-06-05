# Supabase — instalacja i konfiguracja lokalna

Instrukcja odtworzenia lokalnego środowiska Supabase po przeniesieniu repozytorium na nowy komputer.

## Wymagania wstępne

- **Node.js** w wersji z `.nvmrc` (v22.14.0). Supabase CLI uruchamiamy przez `npx`, więc nie trzeba go instalować globalnie.
- **Docker Desktop** — musi być uruchomiony. Lokalny Supabase to zestaw kontenerów Dockera (Postgres, GoTrue/Auth, Studio, Storage, itd.).
- Na Windows: Docker działa na backendzie WSL2.

## Kroki na nowym komputerze

### 1. Zależności projektu

```powershell
npm install
```

### 2. Utwórz brakujący katalog `supabase/snippets`

Na Windows/WSL CLI **nie tworzy** automatycznie katalogu, który Studio próbuje
bind-mountować. Bez niego `supabase start` kończy się błędem:

```
failed to create docker container: ... statfs .../supabase/snippets: no such file or directory
```

Utwórz katalog (jest pod kontrolą gita dzięki `.gitkeep`, więc po `git clone`
powinien już istnieć — ten krok jest na wypadek, gdyby go zabrakło):

```powershell
New-Item -ItemType Directory -Force supabase/snippets
New-Item -ItemType File -Force supabase/snippets/.gitkeep
```

### 3. Uruchom lokalny stack Supabase

```powershell
npx supabase start
```

Pierwsze uruchomienie pobiera obrazy Dockera (kilka minut). Po starcie CLI
wypisze adresy i klucze.

> **Uwaga (Windows):** usługa `analytics` (Logflare) wymaga wystawienia demona
> Dockera na `tcp://localhost:2375` i generuje ostrzeżenie. W tym projekcie jest
> **wyłączona** w `supabase/config.toml` (`[analytics] enabled = false`), bo nie
> jest potrzebna do developmentu.

### 4. Skonfiguruj `.env`

Skopiuj `.env.example` do `.env` i uzupełnij wartościami z outputu `supabase start`:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH
```

- `SUPABASE_URL` → **Project URL** (`http://127.0.0.1:54321`).
- `SUPABASE_KEY` → klucz **Publishable** (`sb_publishable_...`) — bezpieczny po
  stronie klienta, odpowiednik dawnego `anon`. **Nie** używaj klucza `Secret`
  (`sb_secret_...`) — omija on RLS i nie powinien trafiać do klienta ani repo.

> Klucze lokalne są **deterministycznymi domyślnymi wartościami** (wynikają z
> JWT secret w `config.toml`), więc są identyczne na każdym komputerze. Wartości
> powyżej powinny zadziałać bez zmian — ale zawsze warto je zweryfikować z
> outputem `npx supabase status`.

`.env` (oraz `.dev.vars`) jest w `.gitignore` — klucze nie trafiają do repo.

### 5. (Cloudflare) `.dev.vars`

`npm run dev` używa runtime Cloudflare (workerd). Astro dev wczytuje `.env`, ale
jeśli zmienne nie są widoczne, utwórz `.dev.vars` z tą samą zawartością co `.env`:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH
```

### 6. Migracje i dane

```powershell
npx supabase db reset
```

- Odtwarza schemat z `supabase/migrations/` i (jeśli istnieje) seeduje z `supabase/seed.sql`.
- Migracje to **źródło prawdy** schematu — trzymaj je w `supabase/migrations/`
  (nazewnictwo `YYYYMMDDHHmmss_opis.sql`, zawsze z włączonym RLS na nowych tabelach).
- Ostrzeżenie `no files matched pattern: supabase/seed.sql` jest nieszkodliwe,
  jeśli nie używasz pliku seed.

### 7. Uruchom aplikację

> **Ważne:** Supabase musi działać **zanim** uruchomisz `npm run dev`.
> `npm run dev` (`astro dev`) **nie** startuje Supabase — to dwa niezależne
> procesy. Aplikacja jedynie łączy się z Supabase po adresie z `.env`, więc bez
> działającego stacku logowanie i zapytania do bazy będą padać. Najpierw upewnij
> się, że Supabase działa (`npx supabase status`, a jeśli nie — `npx supabase start`),
> potem dopiero:

```powershell
npx supabase start    # jeśli jeszcze nie działa (Docker musi być uruchomiony)
npm run dev
```

Supabase żyje w tle nawet po zatrzymaniu `npm run dev` (Ctrl+C zamyka tylko
serwer Astro) — działa aż do `npx supabase stop` lub wyłączenia Dockera, więc
jeden `supabase start` obsłuży wiele sesji `npm run dev`.

## Przydatne adresy (po `supabase start`)

| Usługa        | URL                              |
| ------------- | -------------------------------- |
| Project / API | http://127.0.0.1:54321           |
| Studio        | http://127.0.0.1:54323           |
| Mailpit       | http://127.0.0.1:54324           |
| Postgres      | postgresql://postgres:postgres@127.0.0.1:54322/postgres |

## Trwałość danych

- `npx supabase stop` oraz restart Dockera/komputera **zachowują** dane
  (są w nazwanych wolumenach Dockera).
- `npx supabase stop --no-backup` oraz czyszczenie wolumenów Dockera
  (Docker Desktop → „Clean / Purge data", `docker system prune --volumes`)
  **usuwają** dane.
- Schemat zawsze odtworzysz z migracji; dane testowe — z `supabase/seed.sql`.

## Środowisko produkcyjne (Supabase Cloud)

Projekt produkcyjny: <https://supabase.com/dashboard/project/aoraelgjkiiexwhfotqf>
Aplikacja deployowana jest na **Cloudflare Workers** (`@astrojs/cloudflare`,
`npx wrangler deploy`).

### Skąd wziąć wartości

W dashboardzie: **Project Settings → API Keys** (oraz **Data API / Project URL**):

- **API URL** → `https://aoraelgjkiiexwhfotqf.supabase.co` → `SUPABASE_URL`
- **Publishable key** (`sb_publishable_...`) → `SUPABASE_KEY` — bezpieczny po
  stronie klienta, używany przez SSR. To jego wstawiamy jako `SUPABASE_KEY`.
- **Secret key** (`sb_secret_...`) → **NIE** wstawiamy go jako `SUPABASE_KEY`.
  Omija RLS; używać tylko po stronie serwera do operacji administracyjnych i
  trzymać wyłącznie jako sekret (nigdy w repo, nigdy w kodzie klienta). W tym
  projekcie kod (`src/lib/supabase.ts`) używa klucza publishable — Secret key nie
  jest na razie potrzebny.

> Te same dwie zmienne (`SUPABASE_URL`, `SUPABASE_KEY`) sterują wyborem
> środowiska. Lokalnie wskazują na `http://127.0.0.1:54321`, produkcyjnie na
> `https://aoraelgjkiiexwhfotqf.supabase.co`. Aplikacja nie ma osobnych nazw
> zmiennych dla prod — różnicują je miejsca, w których je ustawiasz (poniżej).

### 1. Runtime na Cloudflare Workers (produkcja)

Sekrety produkcyjne ustawiamy w Workerze przez `wrangler` — **nie** w żadnym
commitowanym pliku. Astro czyta je w runtime przez `astro:env/server`:

```powershell
npx wrangler secret put SUPABASE_URL
# wklej: https://aoraelgjkiiexwhfotqf.supabase.co

npx wrangler secret put SUPABASE_KEY
# wklej: sb_publishable_... (klucz produkcyjny z dashboardu)
```

Alternatywnie te same sekrety można ustawić w panelu Cloudflare:
**Workers & Pages → (twój worker) → Settings → Variables and Secrets**.

Deploy:

```powershell
npm run build
npx wrangler deploy
```

(`wrangler` wymaga zalogowania: `npx wrangler login`.)

### 2. Build w CI (GitHub Actions)

`.github/workflows/ci.yml` buduje projekt z sekretami repozytorium. Ustaw je raz
w GitHub: **Settings → Secrets and variables → Actions → New repository secret**:

| Sekret repo    | Wartość                                      |
| -------------- | -------------------------------------------- |
| `SUPABASE_URL` | `https://aoraelgjkiiexwhfotqf.supabase.co`   |
| `SUPABASE_KEY` | `sb_publishable_...` (produkcyjny)           |

### 3. Lokalny build/preview na danych produkcyjnych (opcjonalnie)

Jeśli chcesz lokalnie zbudować/podejrzeć aplikację wskazującą na prod, użyj
`.env.production` (jest w `.gitignore`):

```
SUPABASE_URL=https://aoraelgjkiiexwhfotqf.supabase.co
SUPABASE_KEY=sb_publishable_...
```

```powershell
npm run build
npm run preview
```

Do codziennego developmentu zostaw w `.env` wartości **lokalne** — nie pracuj na
produkcyjnej bazie.

### 4. Migracje na bazę produkcyjną

Połącz CLI ze zdalnym projektem i wypchnij migracje (schemat ze
`supabase/migrations/`):

```powershell
npx supabase login
npx supabase link --project-ref aoraelgjkiiexwhfotqf
npx supabase db push
```

`db push` aplikuje na produkcji tylko migracje — **nie** seeduje danych. Trzymaj
schemat w migracjach, żeby lokalne i produkcyjne środowisko były spójne.

### Checklista bezpieczeństwa (prod)

- [ ] Jako `SUPABASE_KEY` używasz klucza **Publishable**, nie **Secret**.
- [ ] Sekrety prod są w `wrangler secret` / panelu Cloudflare i w sekretach
      repo GitHub — **nie** w commitowanych plikach.
- [ ] Na każdej tabeli włączone **RLS** z granularnymi politykami (per operacja,
      per rola).
- [ ] `.env`, `.env.production`, `.dev.vars` pozostają w `.gitignore`.

## Najczęstsze komendy

```powershell
npx supabase start      # uruchom stack
npx supabase stop       # zatrzymaj (z backupem danych)
npx supabase status     # adresy i klucze działającej instancji
npx supabase db reset   # odtwórz schemat z migracji + seed
```
