---
change_id: flashcard-reverse-mode
title: Reverse mode on browse and review pages (Back-first, per-set toggle in localStorage)
status: archived
created: 2026-06-19
updated: 2026-06-20
archived_at: 2026-06-20T05:55:43Z
---

## Notes

Na stronach browse i review, gdzie wyświetlane są fiszki ma być uwzględniony reverse mode, czyli domyślnie zamiast wyświetlania Front będzie wyświetlany Back i dopiero po odwróceniu Front. Domyślnie flashcard_reverse_mode=false (undefined). Zmienić to ustawienie można na stronie zestawu, przełącznik w wierszu nad listą fiszek. Domyślnie nie ustawiony (czyli false), jeżeli użytkownik go zmieni, to jest on zapisywany (na poziomie zestawu) w localStorage.
