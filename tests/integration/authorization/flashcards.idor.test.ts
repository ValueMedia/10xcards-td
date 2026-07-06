// Risk #1 — cross-user IDOR at the flashcard level.
//
// These are the highest-value targets: updateFlashcard/deleteFlashcard do a
// check-then-act (access-check by join, then a write filtered by id only), so
// their correctness leans on both the explicit ownership gate and RLS. Every
// cross-user write must return 404, and a service-client cross-check must prove
// A's card is untouched after each rejected mutation.
//
// NOTE on what this proves: RLS is the PRIMARY enforcer for these writes — it
// alone blocks the cross-user mutation, so these assertions would still hold even
// if the service-layer ownership gate were removed. They are behavioral/regression
// guards for the 404 contract, not proof of the service check in isolation. The
// genuinely RLS-uncatchable gap is covered by sessions.idor.test.ts.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { hasSupabaseEnv } from "../helpers/env";
import { createTestUser, userClient, deleteTestUser, type TestUser } from "../helpers/supabase";
import { seedSet } from "../helpers/seed";
import { makeApiContext } from "../helpers/context";
import type { SupabaseClient } from "@supabase/supabase-js";
import { POST as POST_FLASHCARD } from "@/pages/api/flashcards";
import { POST as POST_BATCH } from "@/pages/api/sets/[id]/flashcards/batch";
import { PATCH as PATCH_FLASHCARD, DELETE as DELETE_FLASHCARD } from "@/pages/api/flashcards/[id]";

describe.skipIf(!hasSupabaseEnv)("IDOR: flashcard-level cross-user writes", () => {
  const users: TestUser[] = [];
  let owner: TestUser;
  let attacker: TestUser;
  let ownerClient: SupabaseClient;
  let attackerClient: SupabaseClient;
  let setId: string;
  let cardId: string;

  beforeAll(async () => {
    owner = await createTestUser();
    attacker = await createTestUser();
    users.push(owner, attacker);
    ownerClient = await userClient(owner);
    attackerClient = await userClient(attacker);
    const seeded = await seedSet(ownerClient, owner.id, {
      name: "Owner's Set",
      cards: [{ front: "original-front", back: "original-back" }],
    });
    setId = seeded.setId;
    cardId = seeded.flashcardIds[0];
  });

  afterAll(async () => {
    for (const u of users) await deleteTestUser(u.id);
  });

  const asAttacker = (extra: Record<string, unknown>) =>
    makeApiContext({ user: { id: attacker.id }, supabase: attackerClient, ...extra });

  // Cross-checks read via A's own RLS-scoped client: the service-role key has no
  // table GRANT on the app schema (see lessons.md), so it cannot read these
  // tables. The owner reading their own rows is an independent read path (direct
  // SELECT, not the handler under test) that proves A's data is untouched.
  async function ownerCardCount(): Promise<number> {
    const { count } = await ownerClient
      .from("flashcards")
      .select("id", { count: "exact", head: true })
      .eq("set_id", setId);
    return count ?? -1;
  }

  it("B → 404 on POST /api/flashcards (set_id = A's set); no card added", async () => {
    const before = await ownerCardCount();
    const res = await POST_FLASHCARD(asAttacker({ body: { set_id: setId, front: "evil", back: "evil" } }));
    expect(res.status).toBe(404);
    expect(await ownerCardCount()).toBe(before);
  });

  it("B → 404 on POST /api/sets/[id]/flashcards/batch; no cards added", async () => {
    const before = await ownerCardCount();
    const res = await POST_BATCH(
      asAttacker({ params: { id: setId }, body: { flashcards: [{ front: "evil2", back: "evil2" }] } }),
    );
    expect(res.status).toBe(404);
    expect(await ownerCardCount()).toBe(before);
  });

  it("B → 404 on PATCH /api/flashcards/[id]; A's card content unchanged", async () => {
    const res = await PATCH_FLASHCARD(
      asAttacker({ params: { id: cardId }, body: { front: "hacked", back: "hacked" } }),
    );
    expect(res.status).toBe(404);

    const { data } = await ownerClient
      .from("flashcards")
      .select("front, back")
      .eq("id", cardId)
      .maybeSingle();
    expect(data?.front).toBe("original-front");
    expect(data?.back).toBe("original-back");
  });

  it("B → 404 on DELETE /api/flashcards/[id]; A's card still present", async () => {
    const res = await DELETE_FLASHCARD(asAttacker({ params: { id: cardId } }));
    expect(res.status).toBe(404);

    const { data } = await ownerClient.from("flashcards").select("id").eq("id", cardId).maybeSingle();
    expect(data?.id).toBe(cardId);
  });
});
