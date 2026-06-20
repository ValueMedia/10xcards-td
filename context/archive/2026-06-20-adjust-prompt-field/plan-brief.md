# Limit Prompt Content Field Height to 600px — Plan Brief

> Full plan: `context/changes/adjust-prompt-field/plan.md`

## What & Why

The AI prompt content field on the settings page currently grows without limit as the prompt text gets longer (the base `Textarea` uses `field-sizing-content`). Long prompts stretch the page awkwardly. We cap the field at 600px so longer text scrolls inside it instead.

## Starting Point

`src/components/settings/SettingsPage.tsx` renders the prompt as a shadcn `Textarea` twice — a disabled default-mode field (`:159-163`) and an editable custom-mode field (`:176-183`). Both have `min-h-40` but no max-height, and the base component (`src/components/ui/textarea.tsx:10`) sets `field-sizing-content`, causing unbounded growth.

## Desired End State

Both prompt fields stop growing at 600px. Short prompts behave exactly as today (auto-grow from a 160px minimum); prompts taller than 600px cap the field at 600px and show a vertical scrollbar inside it.

## Key Decisions Made

| Decision               | Choice                              | Why (1 sentence)                                                   |
| ---------------------- | ----------------------------------- | ----------------------------------------------------------------- |
| Complexity             | LOW                                 | Single-file Tailwind class change, no logic/data/API impact.      |
| Scope                  | Both fields (default + custom)      | Both show prompt content; consistent look across modes.           |
| Below-cap behavior     | Keep `min-h-40` (160px) auto-grow   | Short prompts unchanged; only the upper bound is added.           |
| Implementation         | `max-h-[600px] overflow-y-auto`     | Caps `field-sizing-content` growth and surfaces a scrollbar.      |

## Scope

**In scope:** Adding `max-h-[600px] overflow-y-auto` to both `Textarea` instances in `SettingsPage.tsx`.

**Out of scope:** Base `textarea.tsx` component, flashcard-count input, other settings controls, validation/save/API logic, fixed-height layout.

## Architecture / Approach

Pure presentational change. Existing `field-sizing-content` grows the field to fit content; the new `max-h-[600px]` caps growth; `overflow-y-auto` adds a vertical scrollbar only when content exceeds the cap. `min-h-40` preserved.

## Phases at a Glance

| Phase                          | What it delivers                          | Key risk                                              |
| ------------------------------ | ----------------------------------------- | ----------------------------------------------------- |
| 1. Cap prompt field height     | Both prompt fields capped at 600px + scroll | `field-sizing-content` interaction with `max-h` — verify scrollbar actually appears in-browser |

**Prerequisites:** None — existing component, no new deps.
**Estimated effort:** ~1 short session, single phase.

## Open Risks & Assumptions

- Assumes `field-sizing-content` + `max-h-[600px]` + `overflow-y-auto` yields a scrollbar at the cap; confirmed via manual in-browser check in Phase 1.

## Success Criteria (Summary)

- Long prompt in Custom mode caps at 600px with a vertical scrollbar.
- Short prompts render unchanged (≥160px, auto-grow).
- Default-mode field caps the same way; no other settings-page regression.
