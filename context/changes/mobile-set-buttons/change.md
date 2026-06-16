---
change_id: mobile-set-buttons
title: Fix action buttons overflow on mobile set detail view
status: impl_reviewed
created: 2026-06-16
updated: 2026-06-16
archived_at: null
---

## Notes

Action buttons on the set detail page (`SetDetailPage.tsx`) use a fixed `grid-cols-3` layout with no responsive breakpoints. On mobile screens buttons either wrap text awkwardly touching top/bottom edges, or overflow horizontally ("New flashcard", "Rozpocznij sesję", "Generate with AI"). Approach: responsive grid (grid-cols-2 on mobile, grid-cols-3 on sm+), shorter text on small screens via hidden/sm:inline pattern, increased vertical padding — no duplicate button sets.