<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Text-to-Speech Playback on Flashcards

- **Plan**: context/changes/flashcards-speech/plan.md
- **Scope**: Full plan (Phases 1–4 of 4)
- **Date**: 2026-07-17
- **Verdict**: APPROVED (with 1 warning to decide)
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Success criteria checked: `npm run build` ✓, `npx eslint` on changed TS/TSX ✓, `npm test` (112 tests) ✓.

## Findings

### F1 — TTS 300-char cap is below the 1000-char flashcard side limit

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (Reliability)
- **Location**: src/pages/api/tts.ts:13
- **Detail**: `text: z.string().min(1).max(300)`, but flashcard sides are stored up to 1000 chars (MAX_SIDE_LENGTH, ai.ts:5; openapi maxLength:1000). A card side of 301–1000 chars gets a 400 VALIDATION_FAILED, which useSpeech turns into a generic status="error" → "playback failed" toast (FlashcardBrowseCard.tsx:28-32) with no hint of the real cause. The plan deliberately chose 300 to bound synthesis cost/cache size, but never reconciled it with the 1000 card limit.
- **Fix A ⭐ Recommended**: Raise the cap to 1000 to match the card side max (zod + openapi-spec).
  - Strength: Any playable card becomes speakable; removes silent failure; still well under Google TTS ~5000 limit.
  - Tradeoff: Larger max synthesis cost + cache entry per request (bounded; edge cache still collapses repeats).
  - Confidence: HIGH — one-line schema change mirrored in openapi.
  - Blind spot: None significant.
- **Fix B**: Keep 300, guard client-side with a clear "too long to read aloud" message.
  - Strength: Preserves the plan's cost/cache bound.
  - Tradeoff: Long cards still can't be fully spoken; more UI surface; partial speech is poor UX.
  - Confidence: MED.
  - Blind spot: Whether real card data ever exceeds 300 in practice.
- **Decision**: FIXED via Fix A — raised max to 1000 in tts.ts:13 + openapi-spec.ts:1668; updated tts.test.ts boundary (301→valid, 1001→400).

### F2 — Provider error body echoed to client

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/tts.ts:84 → src/pages/api/tts.ts:110
- **Detail**: apiError message includes up to 200 chars of Google's raw error (quota/project detail). Consistent with sibling ai.ts:248 — a repo-wide pattern, not a divergence.
- **Fix**: (repo-wide, optional) return a generic client message; log raw body server-side only.
- **Decision**: SKIPPED — consistent with the repo-wide ai.ts pattern; not worth a divergence here.

### F3 — VoiceSwitcher doesn't roll back optimistic state on save failure

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/settings/VoiceSwitcher.tsx:37-45
- **Detail**: handleChange sets local state immediately, then PUTs. On failure it toasts but leaves the select showing the unsaved value (reverts only on reload). Concurrent-write race avoided (selects disabled while saving).
- **Fix**: revert local state in the else/catch branches.
- **Decision**: FIXED — persist() now takes the previous pair and restores setFront/setBack on non-ok and on network error.

### F4 — Object URL freed lazily, not on natural playback end

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: src/components/hooks/useSpeech.ts:65-69
- **Detail**: on `ended`, only status resets to idle; the object URL/audio are revoked on the next speak() or unmount. Bounded to one lingering URL (no unbounded leak).
- **Fix**: (tidiness) revoke the object URL in the `ended` handler too.
- **Decision**: FIXED — `ended` handler now revokes the URL and clears refs (guarded on `urlRef.current === url`).
