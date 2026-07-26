<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Pons Dictionary Integration (DE→PL)

- **Plan**: context/changes/pons-dictionary-integration/plan.md
- **Scope**: Full plan (Phases 1–4 of 4)
- **Date**: 2026-07-26
- **Verdict**: APPROVED (after triage — all actionable findings fixed)
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Triage outcome

- Fixed: F1 (OpenAPI spec descriptions + cache-key prefix), F2 (KV best-effort try/catch), F3 (eslint-disable with rationale), F4 (plan.md §1.2 addendum)
- Skipped: F5 (intentional per "What We're NOT Doing")
- Post-fix verification (2026-07-26): `npx vitest run` 191/191 PASS, `npx eslint <changed .ts/.tsx>` 0 errors/0 warnings, `npm run build` PASS.

## Automated verification (re-run 2026-07-26)

- `npx vitest run --project workers src/lib/services/dictionary-de.test.ts` — 16/16 PASS
- `npx vitest run --project node src/pages/api/dict/de` — 6/6 PASS
- `npx vitest run --project node src/pages/api/sets` — 12/12 PASS (generate)
- `npx vitest run` (full suite) — 191/191 PASS
- `npm run build` — PASS (server built)
- `npx eslint <changed .ts/.tsx>` — 0 errors, 1 warning (F3)

Manual items: all `## Progress` Manual checkboxes marked `[x]` with commit SHAs; observable evidence present in the diff for each (UI island, endpoint, OpenAPI path, AI tool dispatch).

## Findings

### F1 — OpenAPI spec contradicts code: Pons DE `examples` is not always empty

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/openapi/openapi-spec.ts:111 (also :124, :221)
- **Detail**: Three spec strings claim Pons DE→PL `examples` is always empty ("Pons `depl` exposes no example sentences"). After the progress-3.16 example-grouping redesign, `dictionary-de.ts` ships up to 6 `"<German> — <Polish>"` example pairs per entry, and `EntryCard.tsx:42-61` has dedicated rendering that splits on the ` — ` separator. The spec actively misdocuments shipped behavior. Per lessons.md L84-89 (OpenAPI must stay in sync with API contract), this is unfinished work. The `dictionaryRegion is always null` half remains accurate; only the `examples` clause is stale.
- **Fix**: Update the three description strings (DictionaryEntry schema `:111`, examples field `:124`, DE path `:221`) to state `examples` contains up to 6 German↔Polish pairs joined by `" — "` for Pons DE, and `dictionaryRegion` is always `null`. Field description → "Up to 2 example sentences (Cambridge) or up to 6 German↔Polish example pairs (Pons DE→PL)."
- **Decision**: FIXED — applied all three description updates + corrected cache-key prefix `pons:de:` → `pons:de:v2:` in the DE path description. — KV read/write failures are fatal to the lookup (cache is not best-effort)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/dictionary-de.ts:106 (read), :132 (write)
- **Detail**: `kv.get` and `kv.put` are awaited without a try/catch. If KV throws (transient Cloudflare KV outage, binding issue), the error propagates through `lookupWordDe` → the endpoint's catch → 502 "Dictionary service unavailable", even though Pons itself is reachable. The cache is a performance optimization; a cache outage should degrade to a live fetch, not fail the lookup. The OpenAPI spec already states "Errors are never cached", implying best-effort posture that the code doesn't enforce on the read/write path.
- **Fix**: Wrap both KV calls in try/catch — read: on throw, fall through to fetch; write: on throw, swallow (best-effort). Cache stays a performance tier, never an availability dependency.
- **Decision**: FIXED — wrapped `kv.get` and `kv.put` in try/catch; 16/16 service tests still pass. (Optional follow-up: add a test case for KV-throw → live fetch, not done to keep the fix minimal.)

### F3 — ESLint warning: array index used as React key

- **Severity**: 📋 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/lookup/LookupWordPageDe.tsx:198
- **Detail**: `@eslint-react/no-array-index-key` warning — using item index as `key`. Lint exits 0 (warning, not error), so Phase success criteria "eslint passes" is technically met, but the EN sibling should be checked for the same pattern to keep parity. Low risk for a static results list, but worth a stable key (e.g. `definition + index` or a Pons headword id) if the list can reorder.
- **Fix**: Use a stable key derived from entry content (e.g. `${entry.definition}-${i}`) or confirm the EN sibling uses the same index-key pattern and accept parity.
- **Decision**: FIXED — the key was already composite (`${index}-${type}-${region}-${definition}`); the `index` prefix is intentional (Pons returns duplicate definitions across senses → EN-style key collides). Added a file-level `/* eslint-disable @eslint-react/no-array-index-key -- ... */` with rationale; lint now clean. JSX-internal `eslint-disable-next-line` forms parse-error inside `.map(() => (<X/>))`, so file-level was the reliable choice.

### F4 — Pons response mapping diverges from plan contract (justified, documented)

- **Severity**: 📋 OBSERVATION
- **Impact**: 🔎 MEDIUM — worth pausing; the divergence is material but reasoned
- **Dimension**: Plan Adherence
- **Location**: src/lib/services/dictionary-de.ts:158-204
- **Detail**: Plan §1.2 assumed response shape `hits[].roms[].arabs[].senses[].translations[]` with `type` from `rom/arab/sense.pos`, `info` from `sense.subject`, and up to 2 examples from `sense.examples`. The implementation walks `hits[].roms[].arabs[].translations[]` (no `senses` level), reads `type` from `rom.wordclass`, `info` from a `<span class="sense">`/`arab.header` fallback, and groups up to 6 example pairs. This is a real, material drift — but the plan's assumed shape was wrong against the live Pons API; the implementation tracks reality and is documented in the code comment (`:52-66`) and progress 3.16. No action on the code; flagging for transparency. The actionable derivative is F1 (the spec still describes the plan's old shape).
- **Fix**: No code change. Optionally annotate plan §1.2 with a one-line addendum noting the verified live-API shape, so future reviews don't re-derive the drift.
- **Decision**: FIXED — added an addendum to plan.md §1.2 recording the verified live Pons `depl` shape (flatter structure, `rom.wordclass`, sense-span/`arab.header` info, up to 6 example pairs, `pons:de:v2:` cache bump). No code change.

### F5 — DE island omits the "Back to generate" prefill flow present in the EN sibling

- **Severity**: 📋 OBSERVATION
- **Impact**: 🔎 MEDIUM — worth confirming intent before calling it a gap
- **Dimension**: Scope Discipline
- **Location**: src/components/lookup/LookupWordPageDe.tsx (absent)
- **Detail**: The EN `LookupWordPage.tsx` has `showBackToGenerate` / `consumeLookupPrefill()` / `clearGenerateSnapshot(setId)` and a "Back to generate" button; the DE island has only "Back to set". This is a substantive functional divergence from the sibling, but it appears intentional: the plan's "What We're NOT Doing" explicitly excludes a `/check`-style handoff for DE. No defect if the DE flow is meant to be set-only; a gap if `/generate` should hand off to DE lookup with prefill.
- **Fix**: Confirm against scope. If intentional (matches "NOT Doing"), no change. If DE should support generate-handoff, track as a follow-up change — out of scope here.
- **Decision**: SKIPPED — confirmed intentional. The plan's "What We're NOT Doing" explicitly excludes a `/check`-style handoff for DE, so the DE island having only "Back to set" is in-scope behavior, not a gap.