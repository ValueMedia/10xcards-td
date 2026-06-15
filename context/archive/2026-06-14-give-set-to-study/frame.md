# Frame Brief: Set Clone with Teacher Stats Access — replacing S-07

> Framing step before /10x-plan. This document captures what is *actually*
> at issue, separated from what was initially assumed.

## Reported Observation

S-07 (`public-share-link`) occupies the last open slot in the roadmap as "proposed".
The user does not want to build it in its current form and wants to redefine the slot.

## Initial Framing (preserved)

- **User's stated cause or approach**: Replace S-07 with `give-set-to-study` — a teacher/mentor gives a flashcard set to a specific student (not publicly), and the student can study it with spaced repetition.
- **User's proposed direction**: Redefine the roadmap slot and plan the new feature.
- **Pre-dispatch narrowing**:
  - Need: share with a specific person — but clarified: the share link is reused by many students (not one-to-one)
  - Problem with S-07: both — public link has no value AND the new feature has merit
  - Recipient model: asymmetric (teacher shares link → any logged-in student who opens it can claim a copy)
- **Post-narrowing clarification (during frame)**:
  - Mechanism: the existing `share_token` link is the delivery mechanism; any authenticated user who opens it can create their own clone
  - Each student who claims becomes the full owner of their copy (independent SR history)
  - Teacher gets a "Donated Sets" section on their dashboard showing all sets cloned from their originals
  - Multiple students can claim the same link — `set_shares` is one-to-many (one original → many clones)

## Dimension Map

The framing question could break at any of these dimensions:

1. **PRD scope** — Non-Goals exclude "user-to-user sharing" broadly; the Donated Sets section introduces a bounded cross-ownership read for the teacher.
2. **Feature complexity: shared access vs. clone** — teacher→student with own SR history requires clone-with-ownership-transfer, not shared access. ← confirmed
3. **Stats tracking** — teacher seeing stats for sets they don't own requires a relationship table (`set_shares`) and a bounded stats-read mechanism (SECURITY DEFINER RPC or enriched dashboard query).
4. **Token mechanism** — claim-link reuses the existing `share_token`; no new token infrastructure needed. ← confirmed
5. **Many-to-one cloning** — multiple students can claim the same link; `set_shares` is one-to-many.

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| One-to-one targeted invitation (teacher picks a student) is needed | User confirmed: share_token link, multiple students can claim it | NONE — ruled out |
| Simple clone-from-link (no tracking, no teacher view) satisfies the need | User explicitly stated teacher sees "Donated Sets" on dashboard | NONE — insufficient |
| share_token link reused for claim, set_shares one-to-many, teacher dashboard section | Satisfies: reuses existing token, multiple claimers, teacher visibility. Requires: `set_shares` table, clone-on-claim server action, Donated Sets UI on dashboard. | STRONG |
| PRD Non-Goals are violated | Student OWNS their copy (no shared ownership). Teacher has read-only dashboard view of their donated sets. No collaboration, no editing across users. Divergence is minimal and bounded. | WEAK — manageable |

## Narrowing Signals

- `share_token` is the delivery mechanism (reuse existing column + index in `sets` table).
- Any authenticated user who opens the share link can claim a copy — no invitation, no restriction to one person.
- Each claimer gets full ownership of their copy and their own SR history.
- Teacher's dashboard gains a "Donated Sets" section showing clones of their original sets.
- `set_shares` tracks: `(id, original_set_id, cloned_set_id, sharer_user_id, recipient_user_id, claimed_at)`.
- Claim is a one-time action per user per original set (a user can't claim the same set twice).
- Lessons.md: "RLS anon policies must not expose capability tokens" — the claim action must verify the token server-side via SECURITY DEFINER or API route, not via a broad anon SELECT.

## Cross-System Convention

All existing data access in 10xCards is `auth.uid() = user_id`. The Donated Sets dashboard section is the first bounded cross-ownership read. Established pattern: SECURITY DEFINER RPC that verifies caller is the sharer via `set_shares`, then returns aggregated data. Precedent: `submit_card_review` RPC in `20260614120000_submit_card_review_rpc.sql`.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: extend the existing `share_token` mechanism so that authenticated users who open a share link can clone the set into their own account (becoming full owners with independent SR history), with the system tracking each clone in `set_shares` and surfacing a "Donated Sets" section on the teacher's dashboard showing basic stats for all sets cloned from their originals.

The original framing captured the right outcome. The reframe clarifies three things the framing left open: (1) the share link is multi-use (many students can claim, not one), (2) the existing `share_token` is the token mechanism, (3) teacher visibility is a dashboard section, not a separate stats app.

## Confidence

- **HIGH** — all key dimensions confirmed: token mechanism (share_token reuse), ownership model (clone), multiplicity (many claimers), teacher visibility (Donated Sets dashboard section). Clear implementation path. No remaining open questions.

## What Changes for /10x-plan

The plan should cover five concerns:

1. **`set_shares` table** — `(id, original_set_id, cloned_set_id, sharer_user_id, recipient_user_id, claimed_at)` with RLS: sharer can SELECT their own rows; recipient can SELECT their own rows.
2. **Claim action** — authenticated user opens share link → server verifies `share_token` exists + user hasn't already claimed → clones flashcards into new `sets` row owned by user → inserts `set_shares` record. (Idempotent guard: one claim per user per original set.)
3. **Donated Sets dashboard section** — teacher's dashboard lists sets others have cloned from their originals, with set name, clone count, and basic activity stats (last activity date, cards learned). Reads via `set_shares` where `sharer_user_id = auth.uid()`.
4. **Share link UI** — when an authenticated user opens a share link to a set they don't own and haven't claimed, show a "Clone to my sets" button. If already claimed, show a link to their copy.
5. **Roadmap update** — S-07 redefined from `public-share-link` to `set-clone-from-link` (change-id: `give-set-to-study`), outcome updated to reflect this feature.

Public anonymous read-only browsing (original S-07) is excluded — user confirmed public link has no value.

## References

- PRD Non-Goals: `context/foundation/prd.md:174`
- PRD Access Control: `context/foundation/prd.md:168`
- Schema `share_token`: `supabase/migrations/20260610000000_initial_schema.sql:9`
- RLS lesson (share_token security): `context/foundation/lessons.md` — "RLS anon policies must not expose capability tokens"
- SECURITY DEFINER precedent: `supabase/migrations/20260614120000_submit_card_review_rpc.sql`
- Roadmap S-07 (current): `context/foundation/roadmap.md:37`
