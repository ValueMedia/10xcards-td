---
date: 2026-06-19T00:00:00+02:00
researcher: value-media
git_commit: a581eef6cbc342d4b8157edbef8ac0010ff69e73
branch: main
repository: 10xcards-td
topic: "Reverse mode: Front face flashes for a moment before Back when switching to the next card on browse/review"
tags: [research, codebase, flashcard-reverse-mode, css-animation, flip, browse, review]
status: complete
last_updated: 2026-06-19
last_updated_by: value-media
---

# Research: Front face flashes before Back on card switch (reverse mode)

**Date**: 2026-06-19T00:00:00+02:00
**Researcher**: value-media
**Git Commit**: a581eef6cbc342d4b8157edbef8ac0010ff69e73
**Branch**: main
**Repository**: ValueMedia/10xcards-td

## Research Question

Po opublikowaniu na produkcję: gdy włączony jest `flashcard-reverse-mode`, na stronach
`/browse` i `/review`, przy przełączaniu do następnej fiszki — zanim włączy się domyślny
tryb **Back** — przez moment widoczna jest strona **Front**. Psuje to przeglądanie/naukę,
bo użytkownik widzi odpowiedź (Front) zanim zdąży się zastanowić. Jak ukryć treść fiszki,
zanim ustawi się domyślny Back? Może blur albo animacja opacity?

## Summary

**To NIE jest miganie hydratacji/SSR.** Wyspy są już montowane przez `client:only="react"`
(naprawione w `flashcard-reverse-mode`, patrz [lessons.md](../../foundation/lessons.md) wpis
„Stan z localStorage w wyspie Astro"). Migotanie na **zmianie karty** ma inną przyczynę.

**Przyczyna źródłowa: animacja obrotu CSS 3D „przejeżdża" przez stronę Front.**
Karta odwraca się obrotem `rotateX(180deg)` z `transition: transform 0.6s`
([global.css:121-131](https://github.com/ValueMedia/10xcards-td/blob/a581eef6cbc342d4b8157edbef8ac0010ff69e73/src/styles/global.css#L121-L131)).
Front leży na `rotateX(0)`, Back jest wstępnie obrócony o 180° i widoczny dopiero gdy cały
kontener obróci się o 180°.

W trybie reverse stan domyślny to `flipped = true` (Back z przodu). Przebieg powodujący
błysk:

1. Użytkownik jest na karcie N i **odwrócił ją, żeby zobaczyć Front** (odpowiedź) → `flipped = false`.
2. Klika „następna" → handler ustawia jednocześnie `setFlipped(reverse)` (= `true`) **oraz**
   zmienia indeks/pozycję na kartę N+1.
3. W tym samym renderze treść podmienia się na `front`/`back` karty N+1, a `flipped` zmienia
   się `false → true`.
4. CSS animuje obrót `0deg → 180deg` przez 0.6s. Przez ~pierwsze 300 ms **przodem do widza
   jest strona Front** (już z treścią nowej karty), dopiero potem dojeżdża Back.

To jest dokładnie „przez moment widoczna jest strona Front, zanim włączy się Back". Błysk
pojawia się **zawsze, gdy opuszczamy kartę, której aktualnie pokazaną stroną jest Front** —
czyli w trybie reverse tuż po sprawdzeniu odpowiedzi, co jest najczęstszym momentem nawigacji.

**Rekomendacja:** nie maskować błysku (blur/opacity to kosmetyka — obrót dalej zachodzi),
tylko **usunąć animację obrotu przy zmianie karty**, zostawiając animację tylko przy ręcznym
odwracaniu przez użytkownika. Najprościej: wymusić remount karty kluczem React
(`key={pozycja}`) — świeżo zamontowany element renderuje się od razu w docelowej orientacji,
a transition CSS nie odpala się na pierwszym renderze. Szczegóły i alternatywy niżej.

## Detailed Findings

### Mechanizm odwracania (shared card)

`FlashcardBrowseCard` jest komponentem w pełni kontrolowanym — jedna prop `flipped` decyduje,
która strona jest widoczna; obie strony są zawsze w DOM
([FlashcardBrowseCard.tsx:10-42](https://github.com/ValueMedia/10xcards-td/blob/a581eef6cbc342d4b8157edbef8ac0010ff69e73/src/components/sets/FlashcardBrowseCard.tsx#L10-L42)):

- `card-flip-inner` + (`flipped && card-flip-inner-flipped`) steruje obrotem kontenera.
- Strona Back ma `backface-visibility: hidden` i jest wstępnie obrócona o 180°, więc jest
  „odsłaniana" dopiero po obróceniu kontenera.

CSS ([global.css:121-142](https://github.com/ValueMedia/10xcards-td/blob/a581eef6cbc342d4b8157edbef8ac0010ff69e73/src/styles/global.css#L121-L142)):

```css
@utility card-flip-inner {
  transform-style: preserve-3d;
  transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);  /* <- to animuje przejazd przez Front */
}
@utility card-flip-inner-flipped { transform: rotateX(180deg); }
@utility card-flip-face { backface-visibility: hidden; }
@utility card-flip-back  { transform: rotateX(180deg); }
```

`backface-visibility: hidden` ukrywa stronę dopiero gdy jest odwrócona tyłem (>90°). W pierwszej
połowie obrotu (0–90°) Front jest **widoczny przodem** — to jest okno błysku.

### Browse: reset orientacji animuje obrót

[FlashcardBrowseView.tsx](https://github.com/ValueMedia/10xcards-td/blob/a581eef6cbc342d4b8157edbef8ac0010ff69e73/src/components/sets/FlashcardBrowseView.tsx) —
`flipped` to stan rodzica, inicjalizowany na `reverse` (linia 18). Nawigacja resetuje orientację
**i** zmienia pozycję w tym samym renderze:

- `goNext` → `setFlipped(reverse)` + `p + 1` ([FlashcardBrowseView.tsx:24-32](https://github.com/ValueMedia/10xcards-td/blob/a581eef6cbc342d4b8157edbef8ac0010ff69e73/src/components/sets/FlashcardBrowseView.tsx#L24-L32))
- `goPrev` → `setFlipped(reverse)` + `p - 1` ([:34-42](https://github.com/ValueMedia/10xcards-td/blob/a581eef6cbc342d4b8157edbef8ac0010ff69e73/src/components/sets/FlashcardBrowseView.tsx#L34-L42))
- `shuffle` → `setFlipped(reverse)` + `position = 0` ([:48-57](https://github.com/ValueMedia/10xcards-td/blob/a581eef6cbc342d4b8157edbef8ac0010ff69e73/src/components/sets/FlashcardBrowseView.tsx#L48-L57))

Gdy poprzednia karta pokazywała Front (`flipped=false`), `flipped` zmienia się na `true` → obrót
animowany → błysk Front nowej karty. Gdy poprzednia karta już pokazywała Back (`flipped=true`),
`setFlipped(true)` to no-op → brak animacji → brak błysku. Stąd błysk występuje warunkowo, ale
w reverse mode to najczęstszy scenariusz.

### Review: identyczny mechanizm na „advance"

[ReviewSession.tsx](https://github.com/ValueMedia/10xcards-td/blob/a581eef6cbc342d4b8157edbef8ac0010ff69e73/src/components/review/ReviewSession.tsx) —
osobny `showingBack` (która strona) + `revealed` (latch). Inicjalizacja `showingBack = reverse`
([:53](https://github.com/ValueMedia/10xcards-td/blob/a581eef6cbc342d4b8157edbef8ac0010ff69e73/src/components/review/ReviewSession.tsx#L53)).
Reveal ustawia stronę odpowiedzi `!reverse` ([flipCard, :142-149](https://github.com/ValueMedia/10xcards-td/blob/a581eef6cbc342d4b8157edbef8ac0010ff69e73/src/components/review/ReviewSession.tsx#L142-L149)).
Po ocenie karta przechodzi dalej: `setCurrentIndex(nextIdx); setRevealed(false); setShowingBack(reverse)`
([:125-129](https://github.com/ValueMedia/10xcards-td/blob/a581eef6cbc342d4b8157edbef8ac0010ff69e73/src/components/review/ReviewSession.tsx#L125-L129)).
Po obejrzeniu odpowiedzi `showingBack=false` → na advance wraca do `reverse=true` → ten sam
animowany przejazd przez Front nowej karty. Karta renderowana w
[:265](https://github.com/ValueMedia/10xcards-td/blob/a581eef6cbc342d4b8157edbef8ac0010ff69e73/src/components/review/ReviewSession.tsx#L265).

### Dlaczego to nie jest migotanie hydratacji

Strony montują wyspy przez `client:only="react"`:
- [browse.astro:33](https://github.com/ValueMedia/10xcards-td/blob/a581eef6cbc342d4b8157edbef8ac0010ff69e73/src/pages/sets/%5Bid%5D/browse.astro#L33)
- [review.astro:30](https://github.com/ValueMedia/10xcards-td/blob/a581eef6cbc342d4b8157edbef8ac0010ff69e73/src/pages/sets/%5Bid%5D/review.astro#L30)

`useReverseMode` czyta `localStorage` w inicjalizatorze `useState` z guardem SSR
([useReverseMode.ts:17-25](https://github.com/ValueMedia/10xcards-td/blob/a581eef6cbc342d4b8157edbef8ac0010ff69e73/src/components/hooks/useReverseMode.ts#L17-L25)).
Bez renderu serwerowego nie ma niezgodności hydratacji — błysk na **wczytaniu strony** był
naprawiony i zweryfikowany (manual check 2.6 w planie). Obecny problem dotyczy **zmiany karty
w trakcie sesji**, którego ten check nie obejmował.

## Rozwiązania (z rekomendacją)

### ✅ Opcja A — Usuń animację obrotu przy zmianie karty (REKOMENDOWANA, root-cause)

Błysk istnieje **tylko dlatego, że reset orientacji jest animowany**. Przy zmianie karty
orientacja powinna „przeskoczyć" do domyślnej bez obrotu; ręczne odwracanie przez użytkownika
nadal animowane.

- **A1 — remount kluczem React (najmniej kodu).** Dodaj `key` do karty:
  - browse: `<FlashcardBrowseCard key={order[position]} ... />`
  - review: `<FlashcardBrowseCard key={currentIndex} ... />`

  Przy zmianie karty React odmontowuje starą i montuje nową instancję już w docelowej
  orientacji (`flipped=reverse`). Transition CSS **nie odpala się na pierwszym renderze** —
  element renderuje się od razu z finalnym `transform`, więc brak obrotu i brak błysku. Ręczny
  flip nadal animuje (ta sama instancja przełącza `flipped`). `FlashcardBrowseCard` jest
  bezstanowy, więc remount jest darmowy. Drobny efekt uboczny: utrata focusu na kontenerze karty
  przy nawigacji klawiaturą (nawigacja i tak idzie przez `window`, nie przez focus karty).

- **A2 — chwilowe `transition: none` podczas resetu.** Flaga „instant" dorzucana na inner przy
  zmianie karty, zdejmowana w `requestAnimationFrame`/`useLayoutEffect`. Działa bez remountu,
  ale więcej kodu i łatwo o pomyłkę w timingu. A1 osiąga to samo prościej.

### ⚠️ Opcja B — Maska blur/opacity podczas przejścia (pomysł użytkownika)

Owinąć kartę i na czas nawigacji ustawić `opacity:0`/`blur`, podmienić treść, potem wygasić maskę.
**Ukrywa objaw, nie usuwa przyczyny** — obrót dalej zachodzi, dochodzi dodatkowy ruch na każdej
nawigacji, a timing trzeba sprzęgnąć z 0.6s. Plan `flashcard-reverse-mode` świadomie nie dodawał
animacji („Not adding animations… beyond the label text change"). A1 daje czysty, natychmiastowy
efekt zgodny z tą decyzją. B traktować jako fallback/uzupełnienie, nie główne rozwiązanie.

### Opcja C — Nie renderować treści Front dopóki nieodsłonięta

Trzymać tekst odpowiedzi pusty/`visibility:hidden` do momentu reveal. Najbardziej inwazyjne,
zmienia odczucie flipa, częściowo redundantne z `backface-visibility`. Niezalecane.

**Rekomendacja:** Opcja **A1** jako podstawa (jednolinijkowy `key` w obu widokach), ewentualnie
respektować `prefers-reduced-motion` przy okazji. Jeśli zespół chce uniknąć remountów — A2.

## Code References

- `src/components/sets/FlashcardBrowseCard.tsx:10-42` — współdzielona karta; obie strony zawsze w DOM, `flipped` steruje obrotem
- `src/styles/global.css:121-142` — `transition: transform 0.6s` + `rotateX(180deg)` (źródło animowanego przejazdu przez Front)
- `src/components/sets/FlashcardBrowseView.tsx:18,24-57,99` — init i reset `flipped` na `reverse` przy nawigacji/shuffle; render karty
- `src/components/review/ReviewSession.tsx:53,125-129,142-149,265` — init/reset `showingBack` na `reverse` przy advance; flipCard; render karty
- `src/components/hooks/useReverseMode.ts:17-38` — odczyt/zapis preferencji w localStorage (guard SSR + try/catch)
- `src/pages/sets/[id]/browse.astro:33`, `src/pages/sets/[id]/review.astro:30` — montaż wysp `client:only="react"`

## Architecture Insights

- **Flip 3D = obie strony zawsze obecne**, więc strona „odpowiedzi" jest fizycznie w DOM zawsze;
  jedyna ochrona przed jej zobaczeniem to orientacja kontenera + `backface-visibility`. Każda
  animowana zmiana orientacji odsłania drugą stronę na czas obrotu.
- **Sprzężenie zmiany treści ze zmianą orientacji** w jednym renderze to istota buga: nowa treść
  + animowany powrót do domyślnej strony = widoczna treść na „złej" stronie podczas obrotu. Lek:
  rozprzęgnąć je — przy zmianie karty orientacja ma być natychmiastowa (remount/`transition:none`),
  animowana tylko intencja użytkownika (ręczny flip).
- Wzorzec spójny dla obu ekranów — poprawka musi trafić w **oba** (`FlashcardBrowseView` i
  `ReviewSession`), bo dzielą `FlashcardBrowseCard`.

## Historical Context (from prior changes)

- `context/changes/flashcard-reverse-mode/plan.md` — wprowadził reverse mode (init `flipped`/
  `showingBack` na `reverse`, reset na nawigacji/advance). Plan explicite: „Not adding animations"
  i zakładał, że `client:load` „avoids a Front→Back flash" — co później skorygowano na
  `client:only` (load-flash), ale **animacji obrotu przy zmianie karty plan nie rozważał**.
- `context/changes/flashcard-reverse-mode/reviews/impl-review.md` — F1/F2 utrwaliły decyzję
  `client:only` + try/catch wokół localStorage. Potwierdza, że warstwa hydratacji jest już OK.
- `context/foundation/lessons.md` (wpis „Stan z localStorage w wyspie Astro") — rozróżnia
  load-flash (hydratacja) od innych; ten bug to osobna klasa (animacja CSS), nie hydratacja.
- `review-flip-to-question` — pochodzenie rozdziału `revealed` + `showingBack` w review.

## Open Questions

- Czy zespół chce zachować animowany flip przy **ręcznym** odwracaniu (tak — A1 to zachowuje),
  czy uprościć do braku animacji w ogóle?
- Czy dodać `@media (prefers-reduced-motion: reduce)` wyłączające `transition` na `card-flip-inner`
  przy okazji (dostępność)?
- Czy ten sam mikro-błysk występuje na publicznej stronie `/share` (poza zakresem reverse mode,
  ale dzieli kartę)? — do sprawdzenia jeśli `/share` używa `FlashcardBrowseCard`.
