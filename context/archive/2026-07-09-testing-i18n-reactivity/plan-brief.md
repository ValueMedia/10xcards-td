# i18n Reactivity Component Test — Plan Brief

> Full plan: `context/changes/testing-i18n-reactivity/plan.md`

## What & Why

Rollout Phase 4 of the test plan, covering Risk #7 ("UI text not updating on language
switch"). We add one component test (RTL) that proves switching the app locale
**immediately changes the visible text in a mounted island** and leaves no stale text
behind — the failure mode that actually shipped once (lessons.md #66: a `changeLanguage`
side effect in the component body that never tracked the prop).

## Starting Point

The production language switch is a server round-trip (`LanguageSwitcher` → POST
`/api/locale-switch` → cookie → redirect → server re-renders islands with a new `locale`
prop). The client-side reactive path lives in `src/components/I18nProvider.tsx`
(`useEffect(...changeLanguage(locale), [instance, locale])`). The only existing i18n test
(`LanguageSwitcher.test.tsx`) asserts text *exists* — never that it *changes* — which is
exactly the anti-pattern Risk #7's guidance calls out.

## Desired End State

A new test `src/components/__tests__/I18nProvider.test.tsx` renders the production
`I18nProvider` around a minimal consumer, flips `locale` en→pl→en via `rerender`, and
asserts the new-locale text appears **and the old-locale text is gone**. The cookbook
§6.5 documents the pattern and the test-plan marks Phase 4 complete.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Subject under test | Production `I18nProvider` + minimal `useTranslation` consumer | Isolates the exact reactivity mechanism; robust to unrelated island changes | Plan |
| Not a real island | Skip rendering `SettingsPage` | Real islands drag in fetch/toast/dialogs/child islands — brittle noise | Plan |
| Switch signal | `rerender` the `locale` prop | Same signal production sends (server re-render with new prop) | Plan |
| Core assertion | New text present AND old text absent | The risk is *stale text*, not missing text | Test plan §2 |
| Breadth | en→pl (+ stale guard) then pl→en | Covers the risk core plus reversibility, stays readable | Plan |
| Async handling | `findBy*` / `waitFor` after rerender | `changeLanguage` re-renders asynchronously via `languageChanged` | Plan |
| Phase scope | Test + cookbook §6.5 + rollout status/gate | Close the phase coherently on disk | Plan |

## Scope

**In scope:** one RTL reactivity test (en→pl→en, stale-text guard); a "has teeth" revert
check; cookbook §6.5 fill-in; test-plan §3 status → complete + §5 gate note.

**Out of scope:** the `.astro` slot-boundary bug (invisible to RTL); rendering a real
island; snapshot tests; changing `I18nProvider` production code; CI gate wiring (Phase 5).

## Architecture / Approach

Drive the locale switch the way production does — a changed `locale` prop on the real
`I18nProvider` — using RTL `rerender`, and assert on visible text (present + absent). A
tiny in-test consumer keeps the test focused on the reactivity mechanism.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Reactivity component test | The Risk #7 regression test, verified to have teeth | Async `changeLanguage` timing — must await the re-render |
| 2. Docs & rollout status | Cookbook §6.5 pattern + Phase 4 marked complete | Doc drift vs the shipped test |

**Prerequisites:** none — RTL + jsdom + Vitest `node` project already configured.
**Estimated effort:** ~1 session across 2 small phases.

## Open Risks & Assumptions

- Assumes RTL's `rerender` on the same `I18nProvider` instance exercises the `useEffect`
  path (it does — `useState` initializer runs once, instance is stable).
- The component layer cannot observe the `.astro` slot-boundary regression; that gap is
  accepted, not covered.

## Success Criteria (Summary)

- `npm run test` shows the new file green; overall suite stays green.
- Neutering `I18nProvider` reactivity turns the test red (has teeth), then reverted.
- Cookbook §6.5 documents the pattern and Phase 4 reads `complete` in the test plan.
