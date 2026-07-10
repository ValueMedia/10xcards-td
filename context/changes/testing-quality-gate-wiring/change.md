---
change_id: testing-quality-gate-wiring
title: Quality-gate wiring — run the test suites in CI (GitHub Actions) and block the Cloudflare deploy on red under direct-push
status: impl_reviewed
created: 2026-07-09
updated: 2026-07-10
archived_at: null
---

## Notes

Rollout Phase 5 of context/foundation/test-plan.md: "Quality-gate wiring".

Risks covered: cross-cutting — every regression the Phase 1–4 suites protect against (#1 IDOR, #2 token leak, #3 SR state, #4 batch persistence, #5 AI failure paths, #6 dictionary failure, #7 i18n reactivity).

Test types planned: quality gate — `vitest run` in CI on PRs to `main`, blocking merge on red.

Risk response intent: prove the floor holds — the tests already shipped in Phases 1–4 actually execute in CI and a red test blocks merge. Two constraints the plan must ground (from §6.6 Phase 2 notes):

- The integration suite is flaky under Vitest's default per-file parallelism and needs `--no-file-parallelism` (or serialized poolOptions) in CI.
- The integration suite auto-skips when Supabase env is absent (`describe.skipIf`), so the plan must decide whether integration runs in CI (requires a Supabase env / service) or stays a local-only gate while unit+component run in CI.
