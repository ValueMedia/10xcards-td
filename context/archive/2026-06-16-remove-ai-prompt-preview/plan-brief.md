# Remove AI Prompt Preview — Plan Brief

> Full plan: `context/changes/remove-ai-prompt-preview/plan.md`

## What & Why

Usunięcie przycisku Preview i komponentu `PromptPreview` z sekcji AI Prompt na stronie `/settings`. Podgląd jest niepotrzebnym elementem UI — użytkownik chce go usunąć.

## Starting Point

Strona ustawień (`/settings`) ma w sekcji AI Prompt (tryb Custom) przycisk "Preview" toggle oraz komponent `PromptPreview`, który client-side renderuje podgląd promptu z przykładowym tekstem. Funkcja `renderFlashcardPrompt` z `ai-prompt.ts` jest współdzielona z serwerowym generowaniem fiszek.

## Desired End State

Sekcja AI Prompt na `/settings` ma tylko przycisk Save. Plik `PromptPreview.tsx` jest usunięty. Stan `showPreview` i wszystkie referencje do niego znikają z `SettingsPage.tsx`. Funkcja `renderFlashcardPrompt` i `DEFAULT_SYSTEM_PROMPT` pozostają bez zmian.

## Key Decisions Made

| Decision | Choice | Why | Source |
|----------|--------|-----|--------|
| Keep `renderFlashcardPrompt` in `ai-prompt.ts` | Yes | Used by `ai.ts` for server-side generation — cannot remove | Plan |
| Single phase vs multi-phase | Single phase | Change is small and localized — no ordering risk | Plan |

## Scope

**In scope:** Remove Preview button, `showPreview` state, `PromptPreview` component from settings page; delete `PromptPreview.tsx` file

**Out of scope:** Modifying `ai-prompt.ts`, changing API endpoints, changing AI generation flow

## Architecture / Approach

Remove `showPreview` state, `PromptPreview` import, Preview button, and conditional rendering from `SettingsPage.tsx`. Delete `PromptPreview.tsx`. No backend changes.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|-------|------------------|----------|
| 1. Remove Preview UI | Preview button gone, PromptPreview.tsx deleted | None — straightforward deletion |

**Prerequisites:** None
**Estimated effort:** ~10 minutes

## Open Risks & Assumptions

None — the change is a simple UI removal with no cross-cutting concerns.

## Success Criteria (Summary)

- No Preview button on `/settings` AI Prompt section
- Save and mode switching still work
- Build and lint pass