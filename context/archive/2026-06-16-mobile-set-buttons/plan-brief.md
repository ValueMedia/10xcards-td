# Fix Action Buttons Overflow on Mobile — Plan Brief

> Full plan: `context/changes/mobile-set-buttons/plan.md`

## What & Why

Action buttons on the set detail page overflow on mobile — the fixed 3-column grid leaves each button ~110-140px wide, which is too narrow for texts like "Rozpocznij sesję", "Generate with AI", "Import CSV", and "New flashcard". Text either wraps touching edges or overflows horizontally. This plan makes the grid responsive, adds shorter mobile labels, and increases touch target size.

## Starting Point

`SetDetailPage.tsx:114` uses `grid grid-cols-3 gap-2` with no responsive breakpoints. Button component enforces `whitespace-nowrap`, so text overflows rather than wraps. Touch targets are 36px (`h-9`), below Apple HIG's 44px recommendation.

## Desired End State

On mobile (<640px): 2-column grid, shorter button labels ("Sesja", "AI", "CSV", "Dodaj"), 44px touch targets. On desktop (640px+): 3-column grid with full labels, unchanged from today. No duplicate button sets — same buttons adapt via responsive classes.

## Key Decisions Made

| Decision | Choice | Why |
|----------|--------|-----|
| Layout approach | `grid-cols-2 sm:grid-cols-3` | Matches established SetGrid/StatsBlock pattern; simple one-class change |
| Long text handling | Shorter mobile labels via `hidden sm:inline` | Avoids DOM duplication; consistent with FlashcardProposalCard mobile/desktop swap pattern |
| Touch target size | `h-11` on mobile, `h-9` on sm+ | Meets 44px Apple HIG minimum on mobile where it matters most |
| Scope | Layout + texts + padding only | Minimal change, minimal regression risk |

## Scope

**In scope:** Grid responsive classes, mobile text variants for 4 buttons, responsive padding/height on all 6 buttons in `SetDetailPage.tsx`

**Out of scope:** Button component changes, per-flashcard Edit/Delete dropdown, icon-only mode, color/shape/icon changes, any JS logic

## Architecture / Approach

Purely CSS/Tailwind class changes in one file (`SetDetailPage.tsx`). No new components, no state changes, no API changes. Uses `hidden sm:inline` / `sm:hidden` for text variants and `grid-cols-2 sm:grid-cols-3` for layout transition at the `sm` (640px) breakpoint.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|-------|-----------------|----------|
| 1. Responsive grid + short texts + padding | Mobile-friendly button grid in SetDetailPage | "Sesja" and "AI" may lack clarity — needs manual UX check |

**Prerequisites:** Running dev server, a set with flashcards for testing
**Estimated effort:** ~1 session, 1 phase

## Open Risks & Assumptions

- Short mobile labels ("Sesja", "AI", "CSV", "Dodaj") may not be immediately clear to all users — needs manual UX verification
- `h-11` override on shadcn Button relies on `cn()` merging order (className prop wins over variants) — verified in `button.tsx:47`

## Success Criteria (Summary)

- All 6 buttons visible without overflow on 375px viewport
- Mobile text variants show below 640px, full labels above
- Touch targets ≥44px on mobile
- `npm run build` and `npm run lint` pass