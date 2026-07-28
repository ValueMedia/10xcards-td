# CSV Import Dialog Overflow Fix — Plan Brief

> Full plan: `context/changes/import-csv-fix/plan.md`
> Defect evidence: `import-csv-problem.png` (repo root, user-provided screenshot)

## What & Why

In the CSV import preview popup, the proposal list, its scrollbar, and the `Import N cards` button render **outside** the dialog's right edge, on top of the page behind it. The reported ask was "make the popup wider", but widening alone would not fix it: the shell is being sized by its longest single-line row, so any longer flashcard would escape again. This plan removes the overflow mechanism and widens the dialog.

## Starting Point

`ImportCsvDialog` uses the shared shadcn `DialogContent`, which is a CSS `grid` with one implicit `auto` column capped at `sm:max-w-lg` (512 px) and **no height bound**. Proposal rows use `truncate` (`white-space: nowrap`), so their min-content width is the full line length; the `auto` track grows to that and overflows the dialog's own box. The footer is a sibling grid item, so `justify-end` aligns the `Import` button to the blown-out track edge rather than the panel edge. Decisive evidence in the screenshot: no row is ellipsised despite `truncate`.

## Desired End State

A 672 px-wide import popup where everything sits inside the dark panel — rows, list scrollbar, `← Back` on the left, `Import N cards` on the right. Rows too long to fit are ellipsised instead of escaping. The dialog never exceeds the viewport height: long lists scroll inside the list while the header and footer stay pinned and the `Import` button stays clickable.

## Key Decisions Made

| Decision                      | Choice                                       | Why (1 sentence)                                                                                              |
| ----------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Root cause                    | Grid blowout, not insufficient width         | The screenshot shows a correctly-sized 512 px panel with un-ellipsised rows spilling out — the track outgrew the box. |
| Fix location                  | Local to `ImportCsvDialog` only              | Keeps the shadcn `dialog.tsx` primitive regenerable and keeps 10 other dialogs out of the regression surface.  |
| Shell layout                  | Flex column instead of grid                  | A column flex container has no cross-axis track sizing, so a `nowrap` descendant can no longer stretch it.     |
| Width                         | `sm:max-w-2xl` (672 px)                      | Fits most sentences from the user's CSV without ellipsis while still reading as a modal, not a page.           |
| Height                        | Cap at `calc(100dvh-2rem)`, list-only scroll | `DialogContent` has no height bound today, so on a short viewport or at 150% zoom the `Import` button falls off-screen. |
| Long rows                     | Keep `truncate` (no `line-clamp-2`)          | Uniform row height keeps the list length predictable; the ellipsis will finally actually appear.               |
| Footer alignment              | Add `sm:justify-between`                     | The primitive's `sm:justify-end` silently overrides the local `justify-between`, jamming `Back` and `Import` together. |
| Tests                         | Manual verification only                     | jsdom has no layout engine, so a component test could only assert class strings — a tautology, not a test.     |

## Scope

**In scope:**

- `src/components/sets/ImportCsvDialog.tsx` — shell display/width/height, `shrink-0` header and footer, list as the sole scroll region, footer alignment.

**Out of scope:**

- `src/components/ui/dialog.tsx` primitive (latent for future long-content dialogs; deliberate).
- Parse / chunking / retry / `onImport` logic — zero behavioural change.
- i18n for this dialog's hardcoded English strings (real gap, separate change).
- Wrapping long rows to two lines.

## Architecture / Approach

`DialogContent` becomes `flex flex-col` with `max-h-[calc(100dvh-2rem)]` and `sm:max-w-2xl`. Header and footer get `shrink-0`; the preview wrapper becomes `flex min-h-0 flex-1 flex-col gap-3`; the `<ul>` drops its fixed `max-h-96` and gains `min-h-0` next to the existing `overflow-y-auto`. One structural change fixes both axes: no track sizing means no horizontal blowout, and a bounded column means the list is the only scroll region.

## Phases at a Glance

| Phase                            | What it delivers                                                 | Key risk                                                                                      |
| -------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1. Bound the import dialog shell | Popup fully contains its list, scrollbar, and buttons on both axes | `grid` → `flex` swap relies on tailwind-merge resolving the display conflict; verify visually, not by reading classes. |

**Prerequisites:** local Supabase running (`npx supabase start`), `npm run dev`, a signed-in account with a set, and an Anki-format CSV containing at least one line longer than ~90 characters.
**Estimated effort:** one short session — a single-file layout change plus one manual verification pass.

## Open Risks & Assumptions

- The diagnosis rests on the screenshot plus static reading of the CSS, not on a live repro in DevTools. If after the change any content still escapes the panel, the remaining suspect is the min-content contribution chain inside the row (`li` → `min-w-0` child) rather than the shell; the follow-up is `min-w-0` on `li` / `overflow-hidden` on the wrapper.
- `dvh` units require a modern browser; on very old engines the height cap degrades to no cap, i.e. today's behaviour, never worse.
- The screenshot also shows page buttons painted over the escaped content. This is assumed to be a consequence of the overflow, not an independent z-index bug — manual step 1.4 checks it explicitly.

## Success Criteria (Summary)

- Importing a 28-card CSV shows every row, the scrollbar, and both footer buttons inside the popup, with long rows ellipsised.
- Shortening the window or zooming to 150% keeps the header and footer visible with only the list scrolling.
- Import still works end-to-end, and no other dialog in the app changes appearance.
