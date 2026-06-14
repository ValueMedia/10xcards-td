# Give Set to Study — Plan Brief

> Full plan: `context/changes/give-set-to-study/plan.md`
> Frame brief: `context/changes/give-set-to-study/frame.md`

## What & Why

Redefines S-07 (was: public read-only share link) into a set-clone mechanism: the teacher activates a share link for their set; any logged-in student who opens it clones the set into their own account and studies it with their own spaced repetition history; the teacher sees per-clone tiles ("Donated Sets") on their dashboard. The reframe was driven by the user's need for targeted sharing with study capability, confirmed incompatible with the original anonymous-broadcast design.

## Starting Point

`share_token uuid default null` already exists in the `sets` table with a unique index. Two anon RLS policies exist but are insecure (they expose the token via PostgREST — `lessons.md` forbids this pattern). No share UI, no share API, no claim mechanism exists yet.

## Desired End State

Teacher clicks "Share" on a set's detail page → gets a `/share/<uuid>` URL to send to students. Student opens the URL while logged in → clicks "Clone to my sets" → the set (with reset FSRS state) appears in their dashboard → they study it independently. Teacher's dashboard shows a "Donated Sets" section: one tile per claim with student email, claim date, total flashcards, learned count, last activity.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Delivery mechanism | Reuse share_token link (multi-use) | Existing column + index; no new token infrastructure needed | Frame |
| Recipient model | Clone with ownership transfer | Student needs independent SR history; shared access would require cross-owner RLS | Frame |
| Teacher stats granularity | Per-clone tiles (not aggregate) | User confirmed each student's clone is a separate visible tile | Plan |
| Student identity in tiles | recipient_email captured at claim time | Avoids auth.users join complexity; email stored in set_shares.recipient_email | Plan |
| Claim idempotency | Show "Already claimed" + link to copy | Clear UX; server returns existing cloned_set_id on duplicate claim | Plan |
| Share page route | /share/[token] | Top-level URL, short and shareable | Plan |
| Share activation | "Share" button on set detail page | Teacher consciously opts in | Plan |
| Cross-ownership read | SECURITY DEFINER RPCs only | lessons.md forbids anon RLS policies on tables containing capability tokens | Plan |

## Scope

**In scope:**
- set_shares migration + 3 SECURITY DEFINER RPCs
- POST /api/sets/[id]/share (activate sharing)
- /share/[token] page (show set info, trigger clone)
- POST /api/share/claim (calls claim_shared_set RPC)
- Share button + modal on set detail page
- Donated Sets section on teacher's dashboard

**Out of scope:**
- Deactivating or revoking share links
- Anonymous claiming (must be logged in)
- Per-student review grade breakdowns
- Teacher revoking individual claims
- Email notifications to students

## Architecture / Approach

All cross-ownership data access goes through SECURITY DEFINER RPCs in Postgres (same pattern as `submit_card_review`). The existing insecure anon policies are dropped in Phase 1. The share page is server-rendered (Astro), reads set info via `get_shared_set_info` RPC using the Supabase SSR client, and hydrates a minimal React island for the claim button. The dashboard extension follows the existing `Promise.all` parallel-fetch pattern in `dashboard.astro`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Database layer | set_shares table + 3 SECURITY DEFINER RPCs + drop insecure anon policies | claim_shared_set logic must guard self-clone, null auth.uid(), idempotency |
| 2. Share activation flow | POST /api/sets/[id]/share + Share button + modal in SetDetailPage | Token activation UX must feel intentional |
| 3. Share page + claim | /share/[token] + POST /api/share/claim | RPC error mapping to HTTP status codes |
| 4. Donated Sets dashboard | getDonatedSets service + DonatedSetsSection component | 4-way JOIN performance (acceptable at MVP scale) |

**Prerequisites:** Local Supabase running (Docker Desktop); `npx supabase db reset --local` approval from user before Phase 1 migration.
**Estimated effort:** ~3–4 sessions across 4 phases.

## Open Risks & Assumptions

- `claim_shared_set` joins `auth.users` to read `email` — this requires the function to run as a role with access to `auth.users` (postgres owner of the function has this). Verify in local Supabase before finalizing.
- Flashcard count in `get_donated_sets_for_teacher` is capped implicitly by the JOIN — performance is fine at MVP scale but will need a materialized view if a teacher has hundreds of claims.

## Success Criteria (Summary)

- Teacher can activate sharing, copy link, and send to a student
- Student can clone the set; their set appears in their dashboard; teacher sees the claim tile in Donated Sets
- Double-claim shows "Already claimed" with link to existing copy; self-claim is blocked
