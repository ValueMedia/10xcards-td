# 10xCards — Status & TODO

## Bootstrap chain — kompletny ✓

| Krok | Plik | Status |
|------|------|--------|
| `/10x-shape` | `context/foundation/shape-notes.md` | ✓ |
| `/10x-prd` | `context/foundation/prd.md` | ✓ |
| `/10x-tech-stack-selector` | `context/foundation/tech-stack.md` | ✓ |
| `/10x-bootstrapper` | projekt scaffoldowany (Astro 6 + Supabase + Cloudflare) | ✓ |

---

## Do zrobienia — zanim zaczniesz kodować

- [ ] Supabase: skopiuj `.env.example` → `.env`, załóż projekt na supabase.com, uzupełnij `SUPABASE_URL` i `SUPABASE_KEY`
- [ ] Zweryfikuj że projekt startuje: `npm run dev`

---

## Następna lekcja kursu

```
10x get m1l4
```

Lekcja 4 ("Memory Architecture") — skill `/10x-agents` wygeneruje `AGENTS.md` i zaktualizuje `CLAUDE.md` o kontekst projektu dla agenta AI.

---

## Implementacja PRD — kolejność startowa

| Priorytet | FR | Opis |
|-----------|----|------|
| 1 | FR-001 | Auth (rejestracja + logowanie) — Supabase już scaffoldowany |
| 2 | FR-007 | Zestawy fiszek (organizacja) |
| 3 | FR-004 / FR-005 / FR-006 | Ręczne tworzenie / edycja / usuwanie fiszek |
| 4 | FR-002 / FR-003 | AI generation + podgląd zbiorczy przed zapisem |
| 5 | FR-010 | Sesja SR (ts-fsrs lub inna biblioteka) |
| 6 | FR-009 | Import CSV/TXT (format Anki) |
| 7 | FR-011 | Statystyki i historia nauki |
| 8 | FR-008 | Link read-only do zestawu (nice-to-have) |
