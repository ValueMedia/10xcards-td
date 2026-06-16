# Remove AI Prompt Preview — Implementation Plan

## Overview

Remove the Preview button and its associated `PromptPreview` component from the AI Prompt section on the settings page (`/settings`). The preview is a client-side feature that renders the custom prompt with sample text — it is being removed as unnecessary UI.

## Current State Analysis

- **Settings page** (`src/pages/settings.astro`) loads the `SettingsPage` React component with `client:load`.
- **SettingsPage** (`src/components/settings/SettingsPage.tsx`) contains:
  - `showPreview` state (line 34) toggled by the Preview button
  - `PromptPreview` import (line 6)
  - Preview button (lines 189-195) toggling `showPreview`
  - Conditional `<PromptPreview>` rendering (lines 197-199)
  - `setShowPreview(false)` calls in `handleSwitchToDefault` (line 80) and `handleModeSwitch` (line 101)
- **PromptPreview** (`src/components/settings/PromptPreview.tsx`) — standalone component (34 lines) that calls `renderFlashcardPrompt` with sample text and renders system/user messages.
- **`renderFlashcardPrompt`** (`src/lib/services/ai-prompt.ts`) is shared — used by both `PromptPreview` and the server-side AI generation in `ai.ts`. **Must NOT be removed.**

### Key Discoveries:

- `renderFlashcardPrompt` in `src/lib/services/ai-prompt.ts:25` is shared between `PromptPreview` (client) and `ai.ts` (server). It stays.
- No API endpoint exists for preview — it is purely client-side.
- `PromptPreview.tsx` is only imported by `SettingsPage.tsx`. Safe to delete.

## Desired End State

The AI Prompt section on `/settings` has only the Save button (no Preview button). The `PromptPreview.tsx` file is deleted. The `showPreview` state and all references to it are removed from `SettingsPage.tsx`. The `renderFlashcardPrompt` function and `DEFAULT_SYSTEM_PROMPT` in `ai-prompt.ts` remain unchanged.

### Verification

- Settings page renders without the Preview button
- Custom prompt editing and saving still works
- `npm run build` passes
- `npm run lint` passes

## What We're NOT Doing

- Removing or modifying `renderFlashcardPrompt` or `DEFAULT_SYSTEM_PROMPT` in `ai-prompt.ts`
- Changing any API endpoints
- Modifying the AI generation flow in `ai.ts`

## Implementation Approach

Single-phase: remove the preview UI from `SettingsPage.tsx` and delete `PromptPreview.tsx`.

## Phase 1: Remove Preview Button and PromptPreview Component

### Overview

Remove all preview-related code from the settings page and delete the PromptPreview component file.

### Changes Required:

#### 1. SettingsPage — remove preview state, import, button, and conditional render

**File**: `src/components/settings/SettingsPage.tsx`

**Intent**: Remove the `showPreview` state, the `PromptPreview` import, the Preview button, the conditional rendering of `<PromptPreview>`, and the `setShowPreview(false)` reset calls.

**Contract**:
- Remove line 6: `import { PromptPreview } from "@/components/settings/PromptPreview";`
- Remove line 34: `const [showPreview, setShowPreview] = useState(false);`
- Remove line 80: `setShowPreview(false);` (inside `handleSwitchToDefault`)
- Remove line 101: `setShowPreview(false);` (inside `handleModeSwitch`)
- Remove lines 189-195: the Preview `<Button>` element
- Remove lines 197-199: the conditional `{showPreview && (<PromptPreview ...>)}` rendering

#### 2. Delete PromptPreview component

**File**: `src/components/settings/PromptPreview.tsx`

**Intent**: Delete the entire file — it is no longer imported anywhere.

**Contract**: File deleted. No other file imports this component.

### Success Criteria:

#### Automated Verification:

- `npm run build` passes
- `npm run lint` passes

#### Manual Verification:

- Navigate to `/settings`, verify the Preview button is gone in the AI Prompt section (custom mode)
- Verify the Save button still appears and saves the prompt correctly
- Verify switching between Default and Custom modes still works

## Testing Strategy

### Manual Testing Steps:

1. Log in, navigate to `/settings`
2. Switch to Custom mode — verify only the Save button appears (no Preview)
3. Edit the custom prompt text, click Save — verify toast "AI prompt saved"
4. Switch back to Default — verify confirmation dialog appears, confirm, verify mode switches
5. Switch to Custom again — verify the saved prompt is loaded

## References

- `src/components/settings/SettingsPage.tsx` — main component with preview code
- `src/components/settings/PromptPreview.tsx` — component to delete
- `src/lib/services/ai-prompt.ts` — shared service (NOT modified)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Remove Preview Button and PromptPreview Component

#### Automated

- [x] 1.1 `npm run build` passes
- [x] 1.2 `npm run lint` passes

#### Manual

- [x] 1.3 Preview button removed from settings page AI Prompt section
- [x] 1.4 Save button and prompt editing still functional
- [x] 1.5 Default/Custom mode switching still works