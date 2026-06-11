# Review fix follow-ups (impl-review 2026-06-12)

- **F1/F2 → S-07**: Replace broad anon SELECT policies (`sets_select_shared_anon`, `flashcards_select_shared_anon`) with a `SECURITY DEFINER` RPC or column-restricted view that (a) never exposes `share_token`/`user_id`, (b) works for anon AND authenticated callers. Drop both policies in the S-07 migration. See plan.md "Review Addendum".
