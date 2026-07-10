// Risk #1 — cross-user IDOR at the set level.
//
// User B must never read or mutate user A's set. Every cross-user attempt must
// return 404 ("resource hidden"), never 403 and never 500. A positive control
// proves the owner (A) still succeeds, and a service-client cross-check proves
// A's set survives B's rejected DELETE.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { hasSupabaseEnv } from "../helpers/env";
import { createTestUser, userClient, deleteTestUser, type TestUser } from "../helpers/supabase";
import { seedSet } from "../helpers/seed";
import { makeApiContext } from "../helpers/context";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GET as GET_FLASHCARDS } from "@/pages/api/sets/[id]/flashcards";
import { GET as GET_DUE_CARDS } from "@/pages/api/sets/[id]/due-cards";
import { GET as GET_SHARE } from "@/pages/api/sets/[id]/share";
import { PATCH as PATCH_SET, DELETE as DELETE_SET } from "@/pages/api/sets/[id]";

describe.skipIf(!hasSupabaseEnv)("IDOR: set-level cross-user access", () => {
  const users: TestUser[] = [];
  let owner: TestUser;
  let attacker: TestUser;
  let ownerClient: SupabaseClient;
  let attackerClient: SupabaseClient;
  let setId: string;

  beforeAll(async () => {
    owner = await createTestUser();
    attacker = await createTestUser();
    users.push(owner, attacker);
    ownerClient = await userClient(owner);
    attackerClient = await userClient(attacker);
    ({ setId } = await seedSet(ownerClient, owner.id, {
      name: "Owner's Set",
      cards: [{ front: "front", back: "back" }],
    }));
  });

  afterAll(async () => {
    for (const u of users) await deleteTestUser(u.id);
  });

  const asAttacker = (extra: Record<string, unknown>) =>
    makeApiContext({ user: { id: attacker.id }, supabase: attackerClient, ...extra });

  it("B → 404 on GET /api/sets/[id]/flashcards", async () => {
    const res = await GET_FLASHCARDS(asAttacker({ params: { id: setId } }));
    expect(res.status).toBe(404);
  });

  it("B → 404 on GET /api/sets/[id]/due-cards", async () => {
    const res = await GET_DUE_CARDS(asAttacker({ params: { id: setId } }));
    expect(res.status).toBe(404);
  });

  it("B → 404 on GET /api/sets/[id]/share and body never leaks share_token", async () => {
    const res = await GET_SHARE(asAttacker({ params: { id: setId } }));
    expect(res.status).toBe(404);
    const text = await res.text();
    expect(text).not.toContain("share_token");
  });

  it("B → 404 on PATCH /api/sets/[id] (rename)", async () => {
    const res = await PATCH_SET(asAttacker({ params: { id: setId }, body: { name: "Hacked" } }));
    expect(res.status).toBe(404);
  });

  it("B → 404 on DELETE /api/sets/[id], and A's set survives", async () => {
    const res = await DELETE_SET(asAttacker({ params: { id: setId } }));
    expect(res.status).toBe(404);

    // Cross-check via A's own RLS-scoped client (the service-role key has no
    // table GRANT on the app schema — see lessons.md — so it cannot read here;
    // the owner reading their own row is an independent read path that proves
    // the set survived B's rejected delete).
    const { data } = await ownerClient.from("sets").select("id, name").eq("id", setId).maybeSingle();
    expect(data).not.toBeNull();
    expect(data?.name).toBe("Owner's Set");
  });

  it("positive control: A can read their own set (200)", async () => {
    const res = await GET_FLASHCARDS(
      makeApiContext({ user: { id: owner.id }, supabase: ownerClient, params: { id: setId } }),
    );
    expect(res.status).toBe(200);
    const body = await (res as unknown as { json: () => Promise<{ set: { id: string } }> }).json();
    expect(body.set.id).toBe(setId);
  });
});
