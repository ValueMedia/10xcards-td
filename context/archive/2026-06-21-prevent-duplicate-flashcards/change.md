---
change_id: prevent-duplicate-flashcards
title: Prevent duplicate flashcards
status: archived
created: 2026-06-21
updated: 2026-06-21
archived_at: 2026-06-21T15:00:00Z
---

## Notes

Podczas dodawania nowe karty manualnie lub przez lookup_word sprawdzaj, czy istnieje już karta w danym zestawie z identycznym tekstem Front (Question). Jeżeli tak to wyrzucany błąd z odpowiednim komunikatem.
Kolejna funkcjonalność to generowanie propozycji fiszek przez AI. Tutaj sprawdzanie duplikatów przejmuje harness (nie LLM), który po dostaniu informacji o propozycjach od LLM, zanim je wyświetli na stronie, sprawdza czy już takie istnieją (fronty) i usuwa je z listy. Jeżeli jakieś duplikaty harness usunął, to wyświetla odpowiednią informację powyżej listy z propozycjami AI.
