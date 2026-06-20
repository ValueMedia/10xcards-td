# Limit Prompt Content Field Height to 600px Implementation Plan

## Overview

On the settings page, the AI prompt content field must have a maximum height of 600px. When the prompt text exceeds that height, a vertical scrollbar appears inside the field instead of the field growing unbounded.

## Current State Analysis

The prompt content field is the shadcn `Textarea` component, used twice in `src/components/settings/SettingsPage.tsx`:

- **Default mode** (`SettingsPage.tsx:159-163`) — `disabled`, displays `DEFAULT_SYSTEM_PROMPT`, class `min-h-40 border-white/10 bg-white/5 text-blue-100/50`.
- **Custom mode** (`SettingsPage.tsx:176-183`) — editable `customPrompt`, class `min-h-40 border-white/10 bg-white/5 text-white placeholder:text-blue-100/30`.

The base `Textarea` (`src/components/ui/textarea.tsx:10`) sets `field-sizing-content` and `min-h-16`. `field-sizing-content` makes the textarea auto-grow with its content **without any upper bound** — so a long prompt stretches the field indefinitely and no scrollbar ever appears. Both instances add `min-h-40` (min-height 160px) but no max-height.

## Desired End State

Both prompt content fields (default and custom mode) stop growing at 600px. A prompt shorter than 600px renders the field at its natural auto-grown height (down to the existing 160px minimum). A prompt longer than 600px caps the field at 600px and shows a vertical scrollbar inside it. No other settings-page behavior changes.

Verify: open `/settings`, switch between Default and Custom modes, paste a very long prompt into the Custom field — the field caps at 600px and scrolls vertically; short prompts behave as before.

### Key Discoveries:

- `field-sizing-content` on the base Textarea (`src/components/ui/textarea.tsx:10`) is what causes unbounded growth — capping requires a `max-h-*` utility plus `overflow-y-auto` to surface the scrollbar.
- Both prompt fields show the same prompt content, so the limit applies to both for visual consistency (user-confirmed).
- Existing `min-h-40` stays — short prompts must keep current behavior (user-confirmed).

## What We're NOT Doing

- Not changing the base `src/components/ui/textarea.tsx` component (would affect every textarea app-wide).
- Not changing the flashcard-count `Input`, mode buttons, or any other settings control.
- Not adding a fixed height — the field still auto-grows from `min-h-40` up to the 600px cap.
- Not touching prompt validation, save logic, or API.

## Implementation Approach

Add Tailwind utilities `max-h-[600px] overflow-y-auto` to the `className` of both `Textarea` instances in `SettingsPage.tsx`. The existing `field-sizing-content` (from the base component) grows the field to fit content; `max-h-[600px]` caps that growth at 600px; `overflow-y-auto` shows a vertical scrollbar only when content exceeds the cap. `min-h-40` is preserved.

## Phase 1: Cap prompt field height at 600px

### Overview

Constrain both prompt `Textarea` fields to a 600px max height with vertical overflow scrolling.

### Changes Required:

#### 1. Settings page prompt fields

**File**: `src/components/settings/SettingsPage.tsx`

**Intent**: Cap both prompt content textareas (default-mode at lines 159-163, custom-mode at lines 176-183) at 600px so long prompts scroll instead of stretching the page, while keeping the current 160px minimum for short prompts.

**Contract**: Append `max-h-[600px] overflow-y-auto` to the `className` of both `Textarea` elements, preserving their existing classes (`min-h-40` and the per-mode color classes). No prop or signature changes.

### Success Criteria:

#### Automated Verification:

- Type checking + Astro check passes: `npm run build`
- Linting passes on the changed file: `npx eslint src/components/settings/SettingsPage.tsx`

#### Manual Verification:

- On `/settings` in Custom mode, a prompt longer than 600px caps the field at 600px and shows a vertical scrollbar inside it.
- A short prompt renders the field at its normal height (≥160px), unchanged from before.
- Default mode field also caps at 600px with the same scrolling behavior.
- No layout regression elsewhere on the settings page.

**Implementation Note**: After automated verification passes, pause for manual confirmation that the UI behaves as expected before considering the change complete.

---

## Testing Strategy

### Manual Testing Steps:

1. Run `npm run dev`, open `/settings`.
2. Switch to Custom mode, paste a long prompt (e.g. 100+ lines) — confirm the field stops at 600px and scrolls.
3. Clear to a short prompt — confirm the field shrinks back toward 160px.
4. Switch to Default mode — confirm the (disabled) field also caps at 600px with scroll for the long default prompt.

## References

- Change identity: `context/changes/adjust-prompt-field/change.md`
- Target component: `src/components/settings/SettingsPage.tsx:159-163`, `:176-183`
- Base textarea: `src/components/ui/textarea.tsx:10`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Cap prompt field height at 600px

#### Automated

- [x] 1.1 Type checking + Astro check passes: `npm run build` — 1daf3a2
- [x] 1.2 Linting passes on the changed file: `npx eslint src/components/settings/SettingsPage.tsx` — 1daf3a2

#### Manual

- [x] 1.3 Custom-mode field caps at 600px with vertical scrollbar for long prompts — 1daf3a2
- [x] 1.4 Short prompt renders field at normal height (≥160px), unchanged — 1daf3a2
- [x] 1.5 Default-mode field also caps at 600px with scroll — 1daf3a2
- [x] 1.6 No layout regression elsewhere on the settings page — 1daf3a2
