---
change_id: check-word-while-generating
title: Add Check button on /generate that opens /lookup_word prefilled with a pasted word/phrase
status: implementing
created: 2026-06-20
updated: 2026-06-20
archived_at: null
---

## Notes

Chę dodać przycisk Sprawdź/Check, obok Generate, na widoku /generate. Przycisk otwiera popup z polem do wklejenia sprawdzanego słowa/frazy. Po zatwierdzeniu otwierana jest strona /lookup_word, która jako parametr przyjmuje to nowe słowo i uzupełnia pole wyszukiwania tym słowem/frazą. Jeżeli implemenetacja przez query w url, to niech strona lookup_word "połyka" parametr z szukanym słowem (wpisując go w pole wyszukiwania i nie zostawiając jako parametr query). Jeżeli jest inny sposób, nie używający używania parametru w url-u, to warto się nad tym zastanowić. Po/przed otwarciem nowej strony, popup na stronie /generate się zamyka.
