// Risk #2 — anon share-path exposure.
//
// The ONLY anon read path is the SECURITY DEFINER RPC get_shared_set_info(p_token),
// which returns column-restricted metadata for exactly the one set the token
// unlocks. This suite proves that contract end-to-end against a real local
// Supabase: owner A activates a capability link, then an anon client exercises the
// RPC and the claim endpoint.
//
// What must hold for an anon caller holding a valid token:
//   - the RPC returns exactly one row, and only the keys
//     {set_id, owner_id, set_name, flashcard_count};
//   - the share_token is NEVER echoed back (not as a key, not as a value);
//   - card front/back content is NEVER exposed;
//   - a random/unknown token yields zero rows (no enumeration);
//   - a second owner's set is never returned by A's token;
//   - anon cannot claim (write) — POST /api/share/claim → 401.
//
// NOTE on owner_id: it is INTENTIONAL in the RPC output — required for SSR
// self-link detection ("is the viewer the owner of this shared set?"). It is a
// UUID, not the capability token and not PII. Accepted and documented (plan.md
// "What We're NOT Doing"): it is not a leak to remediate.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { hasSupabaseEnv } from "../helpers/env";
import { createTestUser, userClient, anonClient, deleteTestUser, type TestUser } from "../helpers/supabase";
import { seedSet } from "../helpers/seed";
import { makeApiContext } from "../helpers/context";
import type { SupabaseClient } from "@supabase/supabase-js";
import { POST as POST_SHARE } from "@/pages/api/sets/[id]/share";
import { POST as POST_CLAIM } from "@/pages/api/share/claim";

describe.skipIf(!hasSupabaseEnv)("Risk #2 — anon share-path exposure", () => {
  const users: TestUser[] = [];
  let ownerA: TestUser;
  let ownerB: TestUser;
  let clientA: SupabaseClient;
  let clientB: SupabaseClient;
  let setIdA: string;
  let shareToken: string;

  // Distinctive card content so a leak would be unmistakable in a serialized dump.
  const SECRET_FRONT = "SECRET_FRONT_2c1f";
  const SECRET_BACK = "SECRET_BACK_9a4d";

  beforeAll(async () => {
    ownerA = await createTestUser();
    ownerB = await createTestUser();
    users.push(ownerA, ownerB);
    clientA = await userClient(ownerA);
    clientB = await userClient(ownerB);

    setIdA = (
      await seedSet(clientA, ownerA.id, {
        name: "Shared Set A",
        cards: [{ front: SECRET_FRONT, back: SECRET_BACK }],
      })
    ).setId;

    // B owns an unrelated set; A's token must never surface it.
    await seedSet(clientB, ownerB.id, { name: "B private set" });

    // Owner A activates the capability link via the real handler.
    const res = await POST_SHARE(
      makeApiContext({ user: { id: ownerA.id }, supabase: clientA, params: { id: setIdA }, body: {} }),
    );
    expect(res.status).toBe(200);
    shareToken = ((await res.json()) as { share_token: string }).share_token;
    expect(shareToken).toBeTruthy();
  });

  afterAll(async () => {
    for (const u of users) await deleteTestUser(u.id);
  });

  it("anon RPC returns exactly one row with ONLY metadata keys — no share_token, no card content", async () => {
    const anon = anonClient();
    const { data, error } = await anon.rpc("get_shared_set_info", { p_token: shareToken });
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(1);

    const row = (data as Record<string, unknown>[])[0];
    // Exact column set — owner_id is expected (see file header). This assertion
    // fails the moment share_token (or any card column) is added to the output.
    expect(Object.keys(row).sort()).toEqual(["flashcard_count", "owner_id", "set_id", "set_name"]);
    expect(row.set_id).toBe(setIdA); // A's set only — never B's
    expect(row.owner_id).toBe(ownerA.id);
    expect(row.set_name).toBe("Shared Set A");
    expect(Number(row.flashcard_count)).toBe(1);

    // Negative checks over the whole serialized payload: neither the token nor
    // any card content ever round-trips to the anon caller.
    const serialized = JSON.stringify(data);
    expect(serialized).not.toContain("share_token");
    expect(serialized).not.toContain(shareToken);
    expect(serialized).not.toContain(SECRET_FRONT);
    expect(serialized).not.toContain(SECRET_BACK);
  });

  it("anon RPC with an unknown token returns zero rows (no enumeration)", async () => {
    const anon = anonClient();
    const { data, error } = await anon.rpc("get_shared_set_info", { p_token: randomUUID() });
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("anon cannot claim a shared set → 401 (no writes as an anon caller)", async () => {
    const res = await POST_CLAIM(
      makeApiContext({ user: null, supabase: anonClient(), body: { token: shareToken } }),
    );
    expect(res.status).toBe(401);
  });
});
