---
change_id: testing-i18n-reactivity
title: Test i18n reactivity — UI text updates on language switch (rollout Phase 4)
status: implemented
created: 2026-07-09
updated: 2026-07-09
archived_at: null
---

## Notes

Open a change folder for rollout Phase 4 of context/foundation/test-plan.md: "i18n reactivity".
Risks covered: #7 (UI text not updating on language switch — stale text remains after a locale change due to island hydration / reactivity). Test types planned: component (RTL).
Risk response intent: prove that switching the app locale immediately changes the visible text in a mounted island — not merely that the text exists; the failure mode to protect against is stale text lingering after the switch. Cheapest useful layer is a component test (RTL) driving a language switch.
After creating the folder, follow the downstream continuation rule.
