# Flip Flashcard Back to Question During Review — Plan Brief

> Full plan: `context/changes/review-flip-to-question/plan.md`

## What & Why

On `/sets/[id]/review`, revealing a card's answer is one-way — the learner can't see the question again. This change lets them flip the card back and forth (Space / Enter / click) after revealing, while keeping the grade buttons available from either side.

## Starting Point

`ReviewSession.tsx` uses a single `flipped` boolean that conflates "answer revealed" with "which side is showing", and both flip triggers are coded to only go forward. `FlashcardBrowseCard` already supports bidirectional flipping — the restriction lives entirely in the parent.

## Desired End State

After revealing, Space/Enter/card-click flip the card between question and answer repeatedly; grade buttons and `1`–`4` shortcuts stay active regardless of the shown side; picking a grade advances; the next card resets to the question.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Grading after flip-back | Grade always available once revealed | Matches intent — see the question yet still grade | Plan |
| Toggle triggers | Space + Enter + card click | Consistent with existing reveal triggers, easy to hit | Plan |
| `1`–`4` semantics | Grade and close the card (unchanged) | Grading finalizes the card | Plan |
| Hint text | Unchanged wording, re-gated on reveal-latch | User opted for no hint changes | Plan |
| Next-card reset | Back to question, un-revealed | Keeps the question-first review flow | Plan |
| State model | Split into `revealed` + `showingBack` | Decouples reveal latch from current side | Plan |

## Scope

**In scope:** State split and rewiring of card/keyboard/buttons/hints/reset in `ReviewSession.tsx`.

**Out of scope:** i18n (ReviewSession stays Polish), `FlashcardBrowseCard`, grading/API/summary logic, hint wording, animations.

## Architecture / Approach

Replace `flipped` with `revealed` (latch, gates reveal-button-vs-grade-buttons + hints) and `showingBack` (current side, passed to the flip card). Reveal sets both true; subsequent Space/Enter/click invert `showingBack`; `1`–`4` and grade buttons call the existing `handleRate` independent of side; advancing resets both.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Flip-back interaction | Bidirectional flip with persistent grading | Keyboard focus guard interacting with Space on focused buttons |

**Prerequisites:** None — single-component change.
**Estimated effort:** ~1 short session, 1 phase.

## Open Risks & Assumptions

- Assumes the existing `closest("button, input")` keydown guard keeps Space/Enter from double-firing on focused grade buttons; verified during manual testing.
- Assumes no automated test exists for ReviewSession (none in repo today); coverage is build/lint + manual checks.

## Success Criteria (Summary)

- After reveal, the card flips both ways via Space, Enter, and click, with grade buttons visible on both sides.
- Grading works from either side and advances; the next card starts on the question, un-revealed.
