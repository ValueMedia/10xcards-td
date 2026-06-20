---
change_id: lookup-word-page
title: Add a "Lookup Word" page to create flashcards from Cambridge Dictionary results
status: archived
created: 2026-06-19
updated: 2026-06-20
archived_at: 2026-06-20T05:55:43Z
---

## Notes

chcę dodać stronę do generowania nowej fiszki w zestawie na podstawie informacji z narzędzia lookup_word (url: /lookup_word?setId=.. ) Na stronę można wejść z widoku zestawu. Zmieniamy przycisk New flashcard na dropdown button z dwiema opcjami: Manually (dotychczasowa funkcjonalność) oraz "Lookup Word" (przejście na stronę lookup_word). Na nowej stronie (lookup) jest informacja (na górze strony), że można wyszukiwać definicje słów za pomocą Cambridge Dictionary. Potem jest wiersz z polem: szukane słowo/fraza oraz przycisk wyszukaj (klliknięcie powoduje wywołanie /api/dict/{word}).
następnie jest sekcja, która pokazuje wyniki działania funkcji api (obiekt typu:
 { "word": "string",
"entries": [ {
"definition": "string", "type": "string", "dictionaryRegion": "string", "info": "string", 
"examples": [ "string" ] 
} ]
}
 
) - layout spójny z resztą UI.
Następnie jest formularz tworzenia nowej fiszki z dwoma polami Question/Answer i przyciskiem Zapisz. 
Użytkownik sam wypełnia te pola.
