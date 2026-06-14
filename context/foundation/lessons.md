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
