---
change_id: flashcard-reverse-front-flash
title: Reverse mode — hide the Front face flashing during card navigation on browse/review
status: impl_reviewed
created: 2026-06-19
updated: 2026-06-20
archived_at: null
---

## Notes

Production follow-up to `flashcard-reverse-mode`. With reverse mode ON, advancing to
the next card on `/browse` and `/review` briefly shows the new card's **Front** face
before the default **Back** face settles in. This defeats the point of reverse mode —
the user sees the answer side before they can think about it.

Root cause (see `research.md`): the reset-to-default-orientation on card change animates
the 0.6s CSS 3D flip, which rotates *through* the Front face while the content has already
swapped to the next card. It is NOT a hydration/SSR flash (islands are already
`client:only="react"`).

Goal: hide/suppress the Front content until the default Back orientation is settled.
User suggested blur or opacity animation; research recommends suppressing the flip
animation on card change instead (root-cause fix).
