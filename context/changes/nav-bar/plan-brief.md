# Nav Bar — Plan Brief

> Full plan: `context/changes/nav-bar/plan.md`

## What & Why

Dodajemy sticky nawigację do wszystkich stron zalogowanego użytkownika. Bez belki użytkownik nie widzi kto jest zalogowany ani nie ma łatwego dostępu do wylogowania — musi wchodzić w specyficzne URL-e. Belka rozwiązuje ten brak przy minimalnym nakładzie.

## Starting Point

`Layout.astro` to prosty wrapper bez nawigacji. `Astro.locals.user` jest dostępne na każdej stronie (middleware). Endpoint `POST /api/auth/signout` już istnieje.

## Desired End State

Na każdej chronionej stronie (dashboard, `/sets/[id]`) widoczna sticky belka: logo "10xCards" + link do dashboardu po lewej, email zalogowanego użytkownika + przycisk "Sign out" po prawej. Strony auth (`/auth/*`) nie mają belki.

## Key Decisions Made

| Decision | Choice | Why | Source |
|---|---|---|---|
| Dane użytkownika | Email + Wyloguj | Wystarczy do identyfikacji, bez nadmiarowego UI | Plan |
| Zasięg | Wszystkie strony przez Layout | Jedno miejsce zmiany, brak duplikacji | Plan |
| Strona lewa | Logo + linki nawigacji | Pełna nawigacja od razu | Plan |
| Pozycja | Sticky top | Dostępna zawsze podczas scrollowania | Plan |
| Sign-out | Natywny `<form method="POST">` | Zero JS, reużywa istniejący endpoint | Plan |

## Scope

**In scope:** NavBar.astro, aktualizacja Layout.astro, logo + dashboard link + email + sign-out

**Out of scope:** Avatar/inicjały, hamburger na mobile, active link highlighting, dodatkowe linki nav, strona profilu

## Architecture / Approach

Nowy `src/components/NavBar.astro` czyta `Astro.locals.user` bezpośrednio (Astro SSR — locals dostępne w każdym komponencie). Layout importuje NavBar i renderuje go bezwarunkowo — NavBar sam zwraca pusty fragment gdy `user === null`. Żadna strona nie wymaga zmian.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. NavBar + Layout | Działająca belka na wszystkich chronionych stronach | Sticky nav może nakładać się na treść stron |

**Prerequisites:** Działający dev server (`npm run dev`) do weryfikacji wizualnej  
**Estimated effort:** ~1 sesja, 1 faza

## Open Risks & Assumptions

- Sticky nav nie powinna nakładać się na istniejące treści (strony używają `p-4` w flow, nie `fixed` pozycjonowania) — do weryfikacji manualnej
- Strony auth nie mają użytkownika w `Astro.locals` → NavBar automatycznie się ukrywa

## Success Criteria (Summary)

- NavBar widoczna na `/dashboard` i `/sets/[id]` z emailem i przyciskiem wylogowania
- Sticky — pozostaje na górze podczas scrollowania
- Brak belki na stronach auth
