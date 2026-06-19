---
change_id: flashcard-reverse-mode
title: Reverse mode on browse and review pages (Back-first, per-set toggle in localStorage)
status: impl_reviewed
created: 2026-06-19
updated: 2026-06-19
archived_at: null
---

## Notes

Na stronach browse i review, gdzie wyświetlane są fiszki ma być uwzględniony reverse mode, czyli domyślnie zamiast wyświetlania Front będzie wyświetlany Back i dopiero po odwróceniu Front. Domyślnie flashcard_reverse_mode=false (undefined). Zmienić to ustawienie można na stronie zestawu, przełącznik w wierszu nad listą fiszek. Domyślnie nie ustawiony (czyli false), jeżeli użytkownik go zmieni, to jest on zapisywany (na poziomie zestawu) w localStorage.
