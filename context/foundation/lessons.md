# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## RLS anon policies must not expose capability tokens

- **Context**: supabase/migrations/20260610000000_initial_schema.sql (anon SELECT policies on sets/flashcards)
- **Problem**: RLS filters rows, not columns — a `USING (share_token IS NOT NULL)` anon policy lets the anon role enumerate every share token via PostgREST, defeating capability-URL unguessability.
- **Rule**: Reads gated by a capability token go through SECURITY DEFINER RPCs or column-restricted views that never return the token; never grant broad anon SELECT on tables containing it.
- **Applies to**: all Supabase migrations / RLS policy design
