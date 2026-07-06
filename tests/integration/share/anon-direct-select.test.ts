// Risk #2 — anon must not directly SELECT sets/flashcards.
//
// Regression guard for the documented past defect: a broad anon SELECT policy
// (`USING (share_token IS NOT NULL)`) once let the anon role enumerate every
// share_token via PostgREST (lessons.md "RLS anon policies must not expose
// capability tokens"). That policy was dropped, and the dormant anon table GRANT
// is revoked by migration 20260707120000_revoke_anon_table_select.sql.
//
// This test asserts the invariant regardless of which layer enforces it:
//   - post-migration (GRANT revoked): the query fails with "permission denied";
//   - if the GRANT is ever re-added but no broad policy exists: zero rows;
// either way anon must obtain NO row — and above all no share_token. If someone
// re-introduces the broad anon SELECT policy, rows (with share_token) would come
// back and this test goes red.
import { describe, it, expect } from "vitest";
import { hasSupabaseEnv } from "../helpers/env";
import { anonClient } from "../helpers/supabase";

describe.skipIf(!hasSupabaseEnv)("Risk #2 — anon cannot directly SELECT sets/flashcards", () => {
  it("anon SELECT on sets yields no row and never a share_token", async () => {
    const anon = anonClient();
    const { data, error } = await anon.from("sets").select("*");

    if (error) {
      expect(error.message).toMatch(/permission denied/i);
    } else {
      expect(data).toEqual([]);
    }
    // Belt-and-suspenders: whatever came back, it must not carry the capability token.
    expect(JSON.stringify(data ?? [])).not.toContain("share_token");
  });

  it("anon SELECT on flashcards yields no row", async () => {
    const anon = anonClient();
    const { data, error } = await anon.from("flashcards").select("*");

    if (error) {
      expect(error.message).toMatch(/permission denied/i);
    } else {
      expect(data).toEqual([]);
    }
  });
});
