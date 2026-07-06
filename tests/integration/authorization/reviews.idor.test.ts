// Risk #1 — cross-user IDOR on the two RPC authorization paths.
//
// - POST /api/reviews → submit_card_review is SECURITY INVOKER: RLS runs under
//   the caller, so B reviewing A's card is hidden as 404.
// - POST /api/sets/[id]/reset-progress → reset_set_progress is SECURITY DEFINER
//   and BYPASSES RLS; ownership rides entirely on its internal
//   `where id = p_set_id and user_id = p_user_id` guard. To prove that guard
//   (not RLS) held, A first performs a real review (creating FSRS state + a
//   reviews row), B's reset is rejected, and a service-client cross-check proves
//   A's FSRS state and review history are untouched.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { hasSupabaseEnv } from "../helpers/env";
import { createTestUser, userClient, deleteTestUser, type TestUser } from "../helpers/supabase";
import { seedSet } from "../helpers/seed";
import { makeApiContext } from "../helpers/context";
import { Rating } from "@/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { POST as POST_REVIEW } from "@/pages/api/reviews";
import { POST as POST_RESET } from "@/pages/api/sets/[id]/reset-progress";

describe.skipIf(!hasSupabaseEnv)("IDOR: review + reset-progress RPC paths", () => {
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
    const seeded = await seedSet(ownerClient, owner.id, { cards: [{ front: "f", back: "b" }] });
    setId = seeded.setId;
    cardId = seeded.flashcardIds[0];

    // A performs a real review so there is FSRS state + a reviews row that a
    // successful (illegitimate) reset would destroy.
    const reviewRes = await POST_REVIEW(
      makeApiContext({
        user: { id: owner.id },
        supabase: ownerClient,
        body: { flashcardId: cardId, grade: Rating.Good },
      }),
    );
    expect(reviewRes.status).toBe(200);
  });

  afterAll(async () => {
    for (const u of users) await deleteTestUser(u.id);
  });

  const asAttacker = (extra: Record<string, unknown>) =>
    makeApiContext({ user: { id: attacker.id }, supabase: attackerClient, ...extra });

  // Cross-checks read via A's own RLS-scoped client: the service-role key has no
  // table GRANT on the app schema (see lessons.md), so it cannot read these
  // tables. The owner reading their own rows is an independent read path that
  // proves the DEFINER reset did not run.
  async function ownerCardReps(): Promise<number> {
    const { data } = await ownerClient.from("flashcards").select("reps").eq("id", cardId).maybeSingle();
    return (data?.reps as number) ?? -1;
  }

  async function ownerReviewCount(): Promise<number> {
    const { count } = await ownerClient
      .from("reviews")
      .select("id", { count: "exact", head: true })
      .eq("flashcard_id", cardId);
    return count ?? -1;
  }

  it("B → 404 on POST /api/reviews (A's flashcardId) [INVOKER path]", async () => {
    const res = await POST_REVIEW(asAttacker({ body: { flashcardId: cardId, grade: Rating.Good } }));
    expect(res.status).toBe(404);
  });

  it("B → 404 on POST /api/sets/[id]/reset-progress; A's FSRS state + reviews untouched [DEFINER path]", async () => {
    const repsBefore = await ownerCardReps();
    const reviewsBefore = await ownerReviewCount();
    // Sanity: A's review above actually produced progress to protect.
    expect(repsBefore).toBeGreaterThan(0);
    expect(reviewsBefore).toBeGreaterThan(0);

    const res = await POST_RESET(asAttacker({ params: { id: setId }, body: {} }));
    expect(res.status).toBe(404);

    // The DEFINER guard held: nothing was reset or deleted.
    expect(await ownerCardReps()).toBe(repsBefore);
    expect(await ownerReviewCount()).toBe(reviewsBefore);
  });
});
