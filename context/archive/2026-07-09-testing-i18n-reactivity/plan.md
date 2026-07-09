# i18n Reactivity Component Test Implementation Plan

## Overview

Prove — with a component test (RTL) — that switching the app locale **immediately
changes the visible text in a mounted island**, and that stale text does not linger
after the switch. This is rollout Phase 4 of `context/foundation/test-plan.md`,
covering Risk #7 ("UI text not updating on language switch").

The subject under test is the production `src/components/I18nProvider.tsx` — the
per-island i18n root whose `useEffect(...changeLanguage(locale), [instance, locale])`
is the exact reactivity path that broke in the past (lessons.md #66 — "React Context
i hydratacja muszą żyć WEWNĄTRZ jednej wyspy", commits `89d655d` / `8f1eacc`, where a
`changeLanguage` side effect in the component body fired every render and never tracked
the prop, leaving dead/stale text).

## Current State Analysis

- **Production language switch is a full server round-trip.** `LanguageSwitcher`
  (`src/components/settings/LanguageSwitcher.tsx:18`) POSTs to `/api/locale-switch`,
  which sets a cookie and redirects; the server then re-renders each island with a new
  `locale` prop. There is no in-page client toggle — the locale reaches a mounted
  island **as a prop**.
- **The client-side reactive path lives in `I18nProvider`**
  (`src/components/I18nProvider.tsx`): it clones a per-island i18n instance
  (`useState(() => i18n.cloneInstance({ lng: locale }))`) and reacts to a changed
  `locale` prop via `useEffect(() => { if (instance.language !== locale) void
  instance.changeLanguage(locale); }, [instance, locale])`. Real islands follow the
  pattern `export fn() { return <I18nProvider locale={props.locale}><Inner/></I18nProvider> }`
  — e.g. `SettingsPage` (`src/components/settings/SettingsPage.tsx:33-39`).
- **The existing test is the anti-pattern for Risk #7.**
  `src/components/settings/__tests__/LanguageSwitcher.test.tsx` renders the **raw**
  `I18nextProvider` (not the production `I18nProvider`), calls `i18n.changeLanguage("en")`
  once in `beforeEach`, and only asserts that text/links *exist* — it never drives a
  locale change to prove the text *changes*. Risk guidance §2 warns against exactly this
  ("asserting the text exists rather than that it changes").
- **Test infra is ready.** Vitest `node` project includes `src/**/*.test.{ts,tsx}`
  (`vitest.config.ts:35`); RTL + jsdom are installed and used via a file-level
  `// @vitest-environment jsdom` pragma. i18n resources are preloaded
  (`initImmediate: false`, `src/lib/i18n/index.ts:45`), and `settings.title` differs
  by locale ("Settings" / "Ustawienia"), giving a clean visible-text oracle.
- **Cookbook §6.5** currently reads "TBD — see §3 Phase 4"; §3 Phase 4 status is
  `change opened`; §5 lists the "component (i18n reactivity)" gate as required after
  Phase 4.

## Desired End State

A new component test `src/components/__tests__/I18nProvider.test.tsx` that:
1. Renders the production `I18nProvider` with `locale="en"` wrapping a minimal
   `useTranslation` consumer, and asserts the English string is visible.
2. Re-renders with `locale="pl"` and asserts the Polish string appears **and the
   English string is gone** (the stale-text guard — the heart of the risk).
3. Re-renders back to `locale="en"` and asserts reversibility.

Verify: `npm run test` (node project) shows the new file green; a manual "test has
teeth" check confirms that neutering `I18nProvider`'s reactivity turns it red. Cookbook
§6.5 documents the pattern, and the test-plan status/gate lines reflect that Phase 4 has
landed.

### Key Discoveries:

- Reactivity mechanism: `src/components/I18nProvider.tsx:18-22` (`useEffect` on
  `[instance, locale]`) — the thing under test.
- Anti-pattern to *not* copy: `src/components/settings/__tests__/LanguageSwitcher.test.tsx`
  (asserts existence, not change).
- Visible-text oracle differing by locale: `settings.title` = "Settings" / "Ustawienia"
  (`src/lib/i18n/locales/{en,pl}/settings.json:2`).
- jsdom is opt-in per file via `// @vitest-environment jsdom` (top of the reference test).
- `changeLanguage` is event-driven/async in react-i18next; the re-render from the
  `languageChanged` event must be awaited in RTL (`findBy*` / `waitFor`), not asserted
  synchronously after `rerender`.

## What We're NOT Doing

- **Not testing the `.astro` slot-boundary bug** from lessons.md #66 (provider mounted
  *over* the island so context/hydration never crosses the slot). jsdom does not run
  Astro, so RTL cannot observe that wiring; a component test covers only the React-side
  reactivity of `I18nProvider`. This is an accepted layer limitation, not a gap to close
  with a heavier test.
- **Not rendering a real island** (e.g. `SettingsPage`) as the subject — it pulls in
  `fetch`, `sonner`, dialogs, and child islands that add brittleness and noise unrelated
  to the reactivity mechanism.
- **Not a snapshot test** — a snapshot would assert text *exists*, which the risk
  guidance explicitly rejects.
- **Not modifying `I18nProvider` production code** — the mechanism is already correct
  (post-fix); this phase locks it in with a regression test.
- **Not wiring CI to block on this test** — that is rollout Phase 5 (Quality-gate
  wiring), out of scope here.

## Implementation Approach

Drive the locale switch through the **same signal production uses** — a changed `locale`
prop on `I18nProvider` — via RTL's `rerender`. Assert on visible text: the new-locale
string is present *and* the old-locale string is absent. Use a minimal in-test consumer
(`useTranslation("settings")` rendering one key) so the test isolates the `I18nProvider`
reactivity and stays robust against unrelated island changes. Await the async
`changeLanguage`-driven re-render with `findBy*` / `waitFor`.

## Critical Implementation Details

- **Await the language change.** After `rerender({ locale: "pl" })`, the `useEffect`
  calls `instance.changeLanguage("pl")`, which resolves asynchronously and re-renders on
  the `languageChanged` event. Assert with `await screen.findByText("Ustawienia")` (and
  `queryByText("Settings")` to be `null`) or wrap in `waitFor` — a synchronous
  `getByText` immediately after `rerender` will flake/fail.
- **Same instance across rerenders is the point.** `useState(() => i18n.cloneInstance(...))`
  runs its initializer once, so `rerender` keeps the *same* cloned instance and exercises
  the `useEffect` reactivity path (not a fresh mount). Do not remount between locales.

## Phase 1: Reactivity component test

### Overview

Add the RTL test that drives an en→pl→en locale switch through `I18nProvider` and
asserts the visible text changes (with a stale-text guard), then verify it has teeth.

### Changes Required:

#### 1. New reactivity test

**File**: `src/components/__tests__/I18nProvider.test.tsx` (new)

**Intent**: Prove the production `I18nProvider` reacts to a changed `locale` prop by
swapping the visible text of a mounted consumer, with no stale text left behind, and
that the switch is reversible. This is the Risk #7 regression test.

**Contract**:
- File-level `// @vitest-environment jsdom` pragma (first line), matching the reference
  test.
- Import `render`, `screen`, `waitFor` from `@testing-library/react`; the production
  `I18nProvider` from `@/components/I18nProvider`; `useTranslation` from `react-i18next`.
- A minimal in-file consumer, e.g. `Probe = () => { const { t } = useTranslation("settings"); return <p>{t("settings.title")}</p>; }`.
- Test 1 — en→pl with stale guard: `const { rerender } = render(<I18nProvider locale="en"><Probe/></I18nProvider>)`;
  assert "Settings" visible; `rerender(<I18nProvider locale="pl"><Probe/></I18nProvider>)`;
  `await screen.findByText("Ustawienia")`; assert `screen.queryByText("Settings")` is
  `null`.
- Test 2 — reversibility: after switching to "pl", `rerender` back to "en"; await
  "Settings", assert "Ustawienia" is gone.
- Keep the consumer and assertions on the `settings` namespace (single namespace, per
  the chosen scope).

### Success Criteria:

#### Automated Verification:

- New test file passes: `npm run test` (node project) is green, including
  `src/components/__tests__/I18nProvider.test.tsx`.
- No regression in the existing suite: `npm run test` overall stays green.
- Type checking passes: `npm run build` (Astro type-check; `npm run lint` may crash on
  `.astro` per lessons.md — lint the changed `.tsx` selectively if needed:
  `npx eslint src/components/__tests__/I18nProvider.test.tsx`).

#### Manual Verification:

- **Test has teeth**: temporarily neuter `I18nProvider` reactivity (e.g. comment out the
  `useEffect` body, or move `changeLanguage` back into the component body) and confirm
  the new test goes **red** on the stale-text assertion; then revert.
- Assertion messages are readable and the test name states the risk it protects.

**Implementation Note**: After Phase 1 automated verification passes, pause for manual
confirmation that the "test has teeth" check was performed and the code reverted, before
proceeding to Phase 2.

---

## Phase 2: Docs & rollout status

### Overview

Close out the rollout phase on disk: document the reactivity pattern in the cookbook and
advance the test-plan status/gate lines so the next orchestrator run reads the truth.

### Changes Required:

#### 1. Cookbook pattern

**File**: `context/foundation/test-plan.md` (§6.5)

**Intent**: Replace the "TBD — see §3 Phase 4" placeholder with the concrete
language-switch reactivity pattern a future contributor can copy.

**Contract**: §6.5 documents: location (`src/components/__tests__/I18nProvider.test.tsx`),
the `// @vitest-environment jsdom` pragma, the subject (production `I18nProvider`, not raw
`I18nextProvider`), the core assertion shape (rerender the `locale` prop → new text present
AND old text absent), the async-await gotcha (`findBy*`/`waitFor` for the
`changeLanguage`-driven re-render), and the "has teeth" revert check. Reference the
existing `LanguageSwitcher.test.tsx` as the *existence* test and contrast it as the
anti-pattern for reactivity.

#### 2. Rollout status + gate

**File**: `context/foundation/test-plan.md` (§3 table, §5 table, optional §6.6)

**Intent**: Reflect that Phase 4 has landed.

**Contract**: §3 Phase 4 `Status` → `complete`. In §5, the "component (i18n reactivity)"
gate note stays "required after §3 Phase 4" but may gain a one-line "landed" marker
consistent with how Phases 1–3 were recorded. Optionally append a 2–3 line §6.6 note for
Phase 4 capturing the async-`changeLanguage` gotcha and the "component test can't see the
`.astro` slot boundary" limitation. Update the header "Last updated" line.

### Success Criteria:

#### Automated Verification:

- Both files exist and are internally consistent:
  `context/changes/testing-i18n-reactivity/plan.md` and `plan-brief.md` present; the test
  file referenced in §6.5 exists.
- No literal "TBD — see §3 Phase 4" remains in §6.5:
  `grep -n "TBD — see §3 Phase 4" context/foundation/test-plan.md` returns nothing.

#### Manual Verification:

- §3 Phase 4 status reads `complete`; §6.5 accurately describes the shipped test; §6.6
  note (if added) matches what the phase actually taught.
- Markdown renders cleanly (tables intact, no broken headings).

**Implementation Note**: After Phase 2, pause for manual confirmation that the doc edits
read correctly before the phase is committed.

---

## Testing Strategy

### Unit / Component Tests:

- The reactivity test itself is the deliverable (Phase 1). Namespace: `settings`; oracle
  key: `settings.title` ("Settings" / "Ustawienia").
- Key edge case: **stale text after switch** — assert the old-locale string is absent,
  not merely that the new one is present.
- Reversibility: en→pl→en round-trip on the same mounted instance.

### Integration Tests:

- None. Risk #7 is a client-side reactivity concern; the server round-trip
  (`/api/locale-switch`) is out of scope for this phase.

### Manual Testing Steps:

1. Run `npm run test`; confirm the new file is green and nothing else regressed.
2. Neuter `I18nProvider` reactivity; re-run; confirm the new test goes red on the
   stale-text assertion; revert.
3. Read §6.5 and confirm it matches the shipped test.

## Performance Considerations

None — a single jsdom render with two rerenders. Negligible runtime.

## Migration Notes

None. No production code or schema changes; the test locks in already-correct behavior.

## References

- Test plan: `context/foundation/test-plan.md` (§2 Risk #7, §2 Risk Response, §3 Phase 4,
  §6.5)
- Subject under test: `src/components/I18nProvider.tsx:18-22`
- Anti-pattern (existence, not change): `src/components/settings/__tests__/LanguageSwitcher.test.tsx`
- Root-cause lesson: lessons.md "React Context i hydratacja muszą żyć WEWNĄTRZ jednej
  wyspy Astro" (commits `89d655d`, `8f1eacc`)
- Visible-text oracle: `src/lib/i18n/locales/{en,pl}/settings.json:2`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Reactivity component test

#### Automated

- [x] 1.1 New test file passes: `npm run test` includes `src/components/__tests__/I18nProvider.test.tsx` green — 26cc963
- [x] 1.2 No regression: `npm run test` overall stays green — 26cc963
- [x] 1.3 Type checking passes: `npm run build` (lint changed `.tsx` selectively if `npm run lint` crashes on `.astro`) — 26cc963

#### Manual

- [x] 1.4 Test has teeth: neutering `I18nProvider` reactivity turns the test red on the stale-text assertion, then reverted — 26cc963
- [x] 1.5 Assertion messages readable; test name states the risk it protects — 26cc963

### Phase 2: Docs & rollout status

#### Automated

- [x] 2.1 plan.md and plan-brief.md present; test file referenced in §6.5 exists — d27920d
- [x] 2.2 No literal "TBD — see §3 Phase 4" remains in §6.5 — d27920d

#### Manual

- [x] 2.3 §3 Phase 4 status reads `complete`; §6.5 accurately describes the shipped test; §6.6 note (if added) matches reality — d27920d
- [x] 2.4 Markdown renders cleanly (tables intact, no broken headings) — d27920d
