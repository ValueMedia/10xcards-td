# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## RLS anon policies must not expose capability tokens

- **Context**: supabase/migrations/20260610000000_initial_schema.sql (anon SELECT policies on sets/flashcards)
- **Problem**: RLS filters rows, not columns — a `USING (share_token IS NOT NULL)` anon policy lets the anon role enumerate every share token via PostgREST, defeating capability-URL unguessability.
- **Rule**: Reads gated by a capability token go through SECURITY DEFINER RPCs or column-restricted views that never return the token; never grant broad anon SELECT on tables containing it.
- **Applies to**: all Supabase migrations / RLS policy design

## Komunikuj się z użytkownikiem po polsku

- **Context**: Cała komunikacja agenta z użytkownikiem w tym projekcie: raporty, pytania (AskUserQuestion), podsumowania faz, opisy znalezisk w review.
- **Problem**: Agent domyślnie odpowiada po angielsku (język skillów i planów), przez co użytkownik czyta raporty i pytania w obcym języku, mimo że sam pisze po polsku.
- **Rule**: Komunikuj się z użytkownikiem po polsku (raporty, pytania, podsumowania). Artefakty projektu (kod, komentarze, plan.md, commity, dokumentacja) pozostają po angielsku, chyba że użytkownik zdecyduje inaczej.
- **Applies to**: all

## Never reset Supabase (or any local DB) without explicit user approval

- **Context**: Local Supabase development with Docker Desktop. During manual testing of `/api/sets/[id]/generate`, an agent ran `npx supabase db reset --local` to recover from a stuck dev environment.
- **Problem**: `supabase db reset --local` wipes the entire local database, including `auth.users` and all application tables (`sets`, `flashcards`, `reviews`). This destroys test accounts and any data the user may have created locally, and it was done without asking.
- **Rule**: Before running any destructive database operation (`supabase db reset`, `supabase stop --no-backup`, dropping tables, truncating auth.users, etc.), ask the user for explicit approval. Prefer non-destructive recovery first: restart the dev server, recreate a single isolated test record via API/SQL, or use a dedicated test fixture instead of resetting the whole database.
- **Applies to**: all local database operations, especially Supabase CLI commands

## Weryfikacja serwisów TypeScript przez npx tsx + JWT użytkownika (local Supabase)

- **Context**: sr-review-session Phase 1 — weryfikacja `getDueCardsForSession` i `submitCardReview` bez serwera HTTP.
- **Problem**: service_role key nie ma GRANT SELECT/UPDATE na tabelach aplikacji (migracje nie dodają tych grantów). `psql` nie jest w PATH na Windows. Nie można testować endpointów API bez sesji HTTP.
- **Rule**: Aby wywołać serwisy TypeScript bezpośrednio przeciwko lokalnemu Supabase:
  1. `npx supabase status` → pobierz ANON_KEY, SERVICE_ROLE_KEY
  2. Uzyskaj JWT użytkownika przez Admin API: `PUT /auth/v1/admin/users/:id` z `{"password":"..."}`, potem `POST /auth/v1/token?grant_type=password`
  3. Stwórz klienta Supabase z `global: { headers: { Authorization: \`Bearer ${JWT}\` } }`
  4. Napisz skrypt `.mts` w katalogu projektu i uruchom: `USER_JWT="..." npx tsx skrypt.mts`
  Alternatywa dla surowego SQL: `docker exec supabase_db_<project> psql -U postgres -d postgres -c "..."` (psql w kontenerze Docker, pełny dostęp superusera).
- **Applies to**: all local Supabase service-layer verification

## Astro: `[id].astro` and `[id]/` directory cannot coexist — rename to `[id]/index.astro` first

- **Context**: `src/pages/sets/[id].astro` (sr-review-session, Phase 2) — adding a nested route `src/pages/sets/[id]/review.astro` required the rename.
- **Problem**: Astro's file-based router cannot have both a flat file `pages/foo/[id].astro` and a directory `pages/foo/[id]/` with the same dynamic segment name. Adding `[id]/review.astro` alongside the existing `[id].astro` creates a routing conflict — one of the routes silently wins and the other breaks.
- **Rule**: Before adding any nested route under a dynamic segment (e.g., `/sets/[id]/review`), check whether `[id].astro` already exists as a flat file. If it does, rename it to `[id]/index.astro` first (content unchanged) and verify the parent route still resolves before adding the nested file.
- **Applies to**: all Astro page additions under an existing dynamic route segment

## Dostęp do udostępnionych zestawów: serwis musi sprawdzać własność LUB share_token

- **Context**: `src/lib/services/reviews.ts` — `getDueCardsForSession` (sr-review-session)
- **Problem**: Serwis pobiera karty po `set_id` bez weryfikacji właściciela. Zestawy mają kolumnę `share_token` umożliwiającą dostęp innym użytkownikom, ale logika dostępu nie rozróżnia między właścicielem a użytkownikiem z tokenem — aktualnie akceptuje każde `set_id`.
- **Rule**: Każda operacja na zestawie/kartach powinna sprawdzać: (1) `user_id` = właściciel, LUB (2) `set.share_token IS NOT NULL` i użytkownik przyszedł z poprawnym tokenem. Nie zezwalaj na dostęp po samym `set_id` bez żadnej z tych weryfikacji.
- **Applies to**: wszystkie serwisy i endpointy operujące na zestawach i ich kartach
