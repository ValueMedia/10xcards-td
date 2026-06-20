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

## Nowa tabela z RLS wymaga GRANT dla roli authenticated

- **Context**: user-settings-page Phase 1 — migracja tworząca `user_ai_prompts` z RLS nie nadawała GRANT SELECT/INSERT/UPDATE/DELETE dla roli `authenticated`. Zapytania zwracały `permission denied for table user_ai_prompts` mimo poprawnych polityk RLS.
- **Problem**: Supabase wymaga dwóch warunków dostępu: (1) GRANT na poziomie tabeli (czy rola w ogóle może dotknąć tabeli), (2) polityki RLS (które wiersze/kolumny). Brak GRANT = odmowa dostępu niezależnie od polityk RLS. Istniejąca migracja `20260613105815_grant_table_permissions.sql` nadała GRANT dla starszych tabel, ale nowe tabele muszą mieć GRANT w swojej migracji.
- **Rule**: Każda migracja tworząca nową tabelę z RLS musi zawierać `GRANT SELECT, INSERT, UPDATE, DELETE ON public.<tabela> TO authenticated;` (i ewentualnie `GRANT SELECT ON public.<tabela> TO anon;`). Sprawdź wzorzec w `20260613105815_grant_table_permissions.sql`.
- **Applies to**: wszystkie nowe migracje Supabase tworzące tabele z RLS

## ESLint crashuje na plikach .astro z @typescript-eslint/no-misused-promises

- **Context**: i18n-pl-en Phase 1 — `npm run lint` crashuje na plikach `.astro` z błędem "Non-null Assertion Failed: Expected node to have a parent" w regule `@typescript-eslint/no-misused-promises`. Problem występuje na wielu plikach `.astro` (index, settings, dashboard), nie jest związany ze zmianami i18n.
- **Problem**: `astro-eslint-parser` i `@typescript-eslint/no-misused-promises` nie współpracują poprawnie. Uruchomienie `npm run lint` na całym projekcie kończy się crashem zamiast raportu. Lintowanie tylko plików `.ts`/`.tsx` działa poprawnie.
- **Rule**: Kiedy `npm run lint` crashuje, uruchom ESLint selektywnie na zmienionych plikach `.ts`/`.tsx` (np. `npx eslint src/middleware.ts src/lib/i18n/constants.ts`). Nie trać czasu na debugowanie crasha `astro-eslint-parser` — to znany problem. `npm run build` sprawdza typy Astro poprawnie.
- **Applies to**: wszystkie fazy implementacji, gdy ESLint crashuje na `.astro`

## React Context i hydratacja muszą żyć WEWNĄTRZ jednej wyspy Astro, nie nad nią

- **Context**: i18n-pl-en (commity `89d655d`, `8f1eacc`) — przyciski w `SignInForm`, `SignUpForm`, `UserMenu`, `SetDashboard`, `SettingsPage` nie reagowały na kliknięcia. Provider był owijany w `.astro`: `<I18nProvider locale={locale} client:load><SignInForm serverError={error} /></I18nProvider>`.
- **Problem**: `client:load` postawione na wrapperze hydratuje TYLKO wrapper. Dziecko wstawione przez Astro trafia tam jako slot (`<slot/>`) — to osobny, statyczny HTML wyrenderowany na serwerze, NIE część tego samego drzewa React. Skutki: (1) dziecko nigdy się nie hydratuje → cały JS (`useState`, `onClick`) martwy → „martwe przyciski"; (2) React Context nie przekracza granicy wyspy przez slot; (3) komponent bez providera nad sobą (UserMenu) rzuca „Invalid hook call" w SSR. Dodatkowo efekt uboczny (`i18n.changeLanguage`) wołany w ciele komponentu odpala się przy każdym renderze i nie śledzi zmiany propa.
- **Rule**:
  1. Granica wyspy Astro = granica drzewa React. Provider (context) montuj WEWNĄTRZ komponentu, który ma `client:*`, nie nad nim w `.astro`. Wzorzec: eksportowany komponent zwraca `<Provider><Inner/></Provider>`, a `.astro` hydratuje go bezpośrednio (`<SignInForm locale={locale} client:load />`).
  2. Przez granicę wyspy przekazuj dane serializowalnymi propsami (np. `locale: string`), nigdy przez React Context.
  3. „Martwe przyciski" to prawie zawsze brak hydratacji, nie błąd w handlerze — najpierw sprawdź, czy komponent ma `client:*` i czy jest korzeniem wyspy.
  4. Efekty uboczne (jak `changeLanguage`) trzymaj w `useEffect`/inicjalizacji z guardem (`useRef`), nie w ciele komponentu — inaczej odpalają się co render i nie reagują na zmianę propów.
- **Applies to**: wszystkie wyspy React + Context (i18n, theme, store) renderowane z plików `.astro`

## Deploy na Cloudflare przez push do GitHub, nie `wrangler deploy`

- **Context**: Wdrożenia aplikacji na Cloudflare Workers (worker `10xcards-td`) — zmiany w kodzie i konfiguracji.
- **Problem**: Agent może odruchowo uruchomić `npx wrangler deploy`, omijając pipeline CI/CD i potencjalnie rozjeżdżając produkcję z gałęzią `main`. Zmiany w kodzie nie trafiają na produkcję, dopóki nie zostaną wypchnięte do GitHub.
- **Rule**: Nie uruchamiaj `npx wrangler deploy`. Wdrożenie kodu następuje automatycznie po pushu do `main` (synchronizacja z GitHub / CI). Wyjątek to sekrety — ustawiaj je przez `wrangler secret put` (aktywują się od razu), ale zmiany w kodzie wchodzą na produkcję dopiero po pushu.
- **Applies to**: implement, impl-review

## Zmiana funkcji API wymaga aktualizacji dokumentacji OpenAPI/Scalar

- **Context**: Każda zmiana kontraktu API w `src/pages/api/**` — nowy endpoint, zmiana metody, parametrów, kształtu request/response lub kodów błędów. Dokumentacja żyje w `src/lib/openapi/openapi-spec.ts` i zasila Scalar pod `/docs/api`.
- **Problem**: Zmiana cambridge-dict-cli dodała `GET /api/dict/{word}`, ale nie zaktualizowała `openapi-spec.ts`. Dokumentacja rozjechała się z faktycznym API — konsumenci (i Scalar) nie widzieli nowego endpointu, mimo że działał on na produkcji.
- **Rule**: Przy każdej zmianie kontraktu API zaktualizuj `src/lib/openapi/openapi-spec.ts` w tej samej fazie/commicie: ścieżka + parametry, schematy w `components.schemas`, kody odpowiedzi i tag. Dodanie lub zmianę endpointu bez aktualizacji spec-a traktuj jako pracę niedokończoną.
- **Applies to**: plan, implement, impl-review

## Stan z localStorage w wyspie Astro: czytaj w client:only, nie client:load

- **Context**: flashcard-reverse-mode — `useReverseMode` czyta `localStorage` w inicjalizatorze `useState`, a wyspy (`SetDetailPage`, `FlashcardBrowseView`, `ReviewSession`) były montowane przez `client:load`.
- **Problem**: Serwer renderuje wyspę bez `window`, więc wartość początkowa = domyślna (np. `false`). Klient w inicjalizatorze czyta `localStorage` i dostaje inną wartość (`true`). React 19 **NIE patchuje** tej niezgodności hydratacji („This won't be patched up") — w DOM zostaje stan serwerowy, więc UI pokazuje złą wartość po przeładowaniu. Dodatkowo: rzut z `localStorage` (Safari private mode → `QuotaExceededError`, storage zablokowany → `SecurityError`) w inicjalizatorze `useState` wywala całą wyspę; przy `client:only` nie ma fallbacku SSR, więc strona renderuje pustkę.
- **Rule**: Wyspę, która czyta `localStorage` (albo inny stan dostępny tylko po stronie klienta) w inicjalizatorze `useState`, montuj przez `client:only="react"`, nie `client:load` — wtedy nie ma renderu serwerowego i nie ma niezgodności hydratacji ani migotania. Zawsze owijaj `localStorage.getItem`/`setItem` w `try/catch` (read → wartość domyślna, write → ciche zignorowanie). Alternatywa zachowująca SSR: inicjalizuj wartością zgodną z serwerem i synchronizuj z `localStorage` w `useEffect` po montażu (kosztem jednokadrowego migotania).
- **Applies to**: wszystkie wyspy React renderowane z `.astro`, które czytają localStorage/sessionStorage/inny stan klienta

## Remount kluczem React zamiast animowanego resetu orientacji przy podmianie treści

- **Context**: flashcard-reverse-front-flash — w trybie reverse na `/browse` i `/review` przy przejściu do następnej karty przez moment widoczna była strona Front, zanim ustawił się domyślny Back. Wspólny komponent `FlashcardBrowseCard` (flip 3D, obie strony zawsze w DOM).
- **Problem**: Zmiana karty resetowała orientację flipa (`setFlipped(reverse)` / `setShowingBack(reverse)`) **jednocześnie** z podmianą treści w tym samym renderze. Animowany obrót CSS (`transition: transform 0.6s` na `card-flip-inner`) przejeżdżał przez stronę Front (0–90°, gdzie `backface-visibility` ją odsłania), pokazując treść **nowej** karty na „złej" stronie podczas obrotu. To NIE jest migotanie hydratacji (wyspy są już `client:only`) — to czysto animacja CSS odpalana przez zmianę propa sterującego transformacją.
- **Rule**: Gdy element z animowaną `transition` CSS ma przy podmianie treści wrócić do stanu domyślnego **bez** animacji, rozprzęgnij zmianę treści od animacji orientacji: nadaj komponentowi `key` tożsamości treści (`key={item.id}`). Remount renderuje element od razu w stanie docelowym — transition CSS nie odpala się na pierwszym renderze — więc brak animacji/migotania, a animacja zostaje tylko dla zmian stanu na **zamontowanej** instancji (intencja użytkownika, np. ręczny flip). Warunek: komponent bezstanowy albo stan bezpieczny do odtworzenia. Alternatywa bez remountu: chwilowe `transition: none` przy resecie (przełączane w `requestAnimationFrame`/`useLayoutEffect`) — więcej kodu i ryzyko błędu w timingu. Przy okazji warto dodać guard `@media (prefers-reduced-motion: reduce)` wyłączający transition.
- **Applies to**: wszystkie komponenty React z animacją CSS `transition`/`transform`, które przy podmianie treści mają natychmiast wrócić do stanu domyślnego (flip kart, slide/fade w galeriach i karuzelach, przejścia między krokami)
