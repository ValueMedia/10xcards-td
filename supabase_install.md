# Supabase — kontynuacja instalacji po restarcie

## Wymagania przed startem
- Docker Desktop musi być uruchomiony (na Windows: backend WSL2).
- Node.js zgodny z `.nvmrc` (v22.14.0).

---

## Krok 3. Uruchom lokalny stack Supabase

```powershell
npx supabase start
```

Pierwsze uruchomienie pobiera obrazy Dockera — może potrwać kilka minut.
Po starcie CLI wypisze adresy i klucze API.

> Uwaga: usługa `analytics` (Logflare) jest wyłączona w `supabase/config.toml`, więc ostrzeżenie o `tcp://localhost:2375` na Windows możesz zignorować.

---

## Krok 4. Skonfiguruj `.env`

Skopiuj `.env.example` do `.env` i uzupełnij wartościami z outputu `npx supabase status`:

```env
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH
```

- `SUPABASE_URL` → **Project URL** (`http://127.0.0.1:54321`).
- `SUPABASE_KEY` → klucz **Publishable** (`sb_publishable_...`).

**Nigdy nie używaj klucza `Secret` (`sb_secret_...`)** — omija on RLS i nie powinien trafiać do klienta ani repo.

Plik `.env` jest w `.gitignore`.

---

## Krok 5. (Cloudflare) Utwórz `.dev.vars`

Jeśli zmienne nie są widoczne w runtime Cloudflare (`workerd`), utwórz plik `.dev.vars` z tą samą zawartością co `.env`:

```env
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH
```

---

## Krok 6. Odtwórz schemat bazy (migracje)

```powershell
npx supabase db reset
```

Odtwarza schemat z `supabase/migrations/` i opcjonalnie seeduje z `supabase/seed.sql`.
Migracje to źródło prawdy schematu.

---

## Krok 7. Uruchom aplikację

**Najpierw** upewnij się, że Supabase działa:

```powershell
npx supabase status
```

Jeśli nie — `npx supabase start`. Następnie dopiero:

```powershell
npm run dev
```

> **Ważne:** `npm run dev` **nie** uruchamia Supabase. To dwa niezależne procesy.
> Supabase działa w tle nawet po zatrzymaniu serwera Astro (pozostaje aktywny aż do `npx supabase stop` lub wyłączenia Dockera).

---

## Przydatne adresy (po `supabase start`)

| Usługa        | URL                                                   |
|---------------|-------------------------------------------------------|
| Project / API | http://127.0.0.1:54321                                |
| Studio        | http://127.0.0.1:54323                                |
| Mailpit       | http://127.0.0.1:54324                                |
| Postgres      | postgresql://postgres:postgres@127.0.0.1:54322/postgres |

---

## Najczęstsze komendy

```powershell
npx supabase start      # uruchom stack
npx supabase stop       # zatrzymaj (z backupem danych)
px supabase status      # adresy i klucze działającej instancji
npx supabase db reset   # odtwórz schemat z migracji + seed
```

---

## Trwałość danych

- `npx supabase stop` oraz restart Dockera/komputera **zachowują** dane (są w nazwanych wolumenach Dockera).
- `npx supabase stop --no-backup` oraz czyszczenie wolumenów Dockera **usuwają** dane.
- Schemat zawsze odtworzysz z migracji; dane testowe — z `supabase/seed.sql`.
