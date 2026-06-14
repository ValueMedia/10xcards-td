# UX Fixes: Set View Title, Generate Auto-Focus and Scroll — Plan Brief

> Full plan: `context/changes/ux-fixes/plan.md`

## What & Why

Three isolated UX papercuts found during manual testing of the set detail and generate flows. The set title gets squeezed by action buttons on longer names; the generate textarea requires an extra click before typing; and generated card proposals appear off-screen with no indication the page changed.

## Starting Point

`SetDetailPage.tsx` uses a horizontal flex header with title and buttons side-by-side. `GenerateFlashcardsPage.tsx` renders a plain `<Textarea>` without auto-focus and calls `setProposals()` without any subsequent scroll.

## Desired End State

- Set view: title is on its own full-width line; buttons sit right-aligned in the row below.
- Generate: cursor lands in the textarea on page load; after generation the page smoothly scrolls to the proposals section.

## Key Decisions Made

| Decision | Choice | Why |
|---|---|---|
| Buttons alignment after layout change | Right-aligned (justify-end) | Matches existing `justify-end` on the buttons container; consistent with action-button-right convention elsewhere |
| Scroll trigger | `useEffect` on `proposals.length` | Fires after React flushes DOM; avoids scroll on edit/delete (count changes but list already visible) |
| Scroll behavior | `smooth`, `block: 'start'` to proposals header | User sees "N proposals" heading as anchor; smooth animation confirms a state change happened |
| Focus mechanism | Native `autoFocus` prop on `<Textarea>` | React handles deduplication; no extra ref or imperative focus call needed |

## Scope

**In scope:** layout fix in `SetDetailPage`, `autoFocus` and scroll in `GenerateFlashcardsPage`

**Out of scope:** responsive breakpoint variants, re-scroll on re-generation after first view, any API or data model changes

## Architecture / Approach

Pure component-level changes in two files. Phase 1 is a CSS class swap. Phase 2 adds one React import, one `useRef`, one `useEffect`, and one `autoFocus` prop.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Set View Header Layout | Title on its own line, buttons right-aligned below | None — pure class change |
| 2. Generate Auto-Focus & Scroll | Auto-focus textarea; smooth scroll to proposals | `useEffect` deps must be limited to `proposals.length` to avoid spurious re-scroll |

**Prerequisites:** none  
**Estimated effort:** ~1 session, 2 phases

## Open Risks & Assumptions

- `autoFocus` is suppressed by some browser extensions (password managers, ad blockers) — acceptable; no fallback needed.
- Scroll fires on first generation only if `proposals.length` goes 0→N; a second generation that returns the same count won't scroll. This edge case is acceptable (proposals are already visible).

## Success Criteria (Summary)

- Set title never wraps or gets squeezed by buttons on any viewport width.
- Textarea is ready for input immediately on `/generate` page load.
- After generation, user sees the proposals section without manual scrolling.
