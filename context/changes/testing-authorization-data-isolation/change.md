---
change_id: testing-authorization-data-isolation
title: Test rollout Phase 1 — authorization and data-isolation coverage
status: implementing
created: 2026-07-06
updated: 2026-07-06
archived_at: null
---

## Notes

Rollout Phase 1 of context/foundation/test-plan.md: "Authorization & data-isolation".

Risks covered:
- #1 Cross-user access / IDOR — a logged-in user reads or edits another user's set or flashcard because an endpoint checks "authenticated," not "owns this resource."
- #2 Share-token leak / read-only link over-exposure — an anon visitor via a capability link enumerates other sets' tokens or performs writes.

Test types planned: integration (multi-user + anon/token) and contract. This phase also bootstraps the API integration harness using @cloudflare/vitest-pool-workers against the workerd runtime (no API integration tests exist yet).

Risk response intent (from test-plan §5, to verify not blindly accept in research):
- #1: prove user B gets 403/404 on user A's resource for reads AND mutations; challenge "authenticated = authorized" and "RLS handles authorization on its own."
- #2: prove an anon link exposes only that one set — never the share_token, never other sets — and permits no writes.

Related lessons: "Dostęp do udostępnionych zestawów: serwis musi sprawdzać własność LUB share_token"; "RLS anon policies must not expose capability tokens."
