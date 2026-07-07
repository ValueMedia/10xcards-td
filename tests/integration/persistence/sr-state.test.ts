// Risk #3 — SR review-state persistence (test-plan Phase 2).
//
// Proves that submitting a review persists coherent FSRS state, that "due"
// selection and the learned count follow that state, and that reset_set_progress
// cleans state atomically. All SR state is produced by driving the real
// POST /api/reviews path (no DB-column manipulation), and assertions check
// invariants/relations rather than values recomputed by fsrs() — avoiding the
// oracle problem called out in test-plan §2 Risk #3.
//
// NOTE ON IDEMPOTENCY: there is no server-side guard against a repeated submit
// (reviews has no unique constraint; the read-compute in submitCardReview runs
// outside the RPC transaction). The tests below DOCUMENT the current behavior
// (a repeated submit inserts a second review row and advances FSRS again) as a
// known, unfixed gap — per the Phase 2 planning decision to not change product
// code here.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { hasSupabaseEnv } from "../helpers/env";
import { createTestUser, userClient, deleteTestUser, type TestUser } from "../helpers/supabase";
import { seedSet } from "../helpers/seed";
import { makeApiContext } from "../helpers/context";
import { readCardState, countReviews, countLearned, latestReviewLearningSteps } from "../helpers/sr";
import { Rating, State, type Flashcard } from "@/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { POST as POST_REVIEW } from "@/pages/api/reviews";
import { GET as GET_DUE } from "@/pages/api/sets/[id]/due-cards";
import { POST as POST_RESET } from "@/pages/api/sets/[id]/reset-progress";

describe.skipIf(!hasSupabaseEnv)("SR review-state persistence (Risk #3)", () => {
  const users: TestUser[] = [];
  let owner: TestUser;
  let ownerClient: SupabaseClient;

  beforeAll(async () => {
    owner = await createTestUser();
    users.push(owner);
    ownerClient = await userClient(owner);
  });

  afterAll(async () => {
    for (const u of users) await deleteTestUser(u.id);
  });

  const asOwner = (extra: Record<string, unknown>) =>
    makeApiContext({ user: { id: owner.id }, supabase: ownerClient, ...extra });

  const review = (flashcardId: string, grade: Rating) => POST_REVIEW(asOwner({ body: { flashcardId, grade } }));

  async function dueCards(setId: string): Promise<{ cards: Flashcard[]; nextDue: string | null }> {
    const res = await GET_DUE(asOwner({ params: { id: setId } }));
    expect(res.status).toBe(200);
    const body: { cards: Flashcard[]; nextDue: string | null } = await res.json();
    return body;
  }

  async function seedOneCard(): Promise<{ setId: string; cardId: string }> {
    const seeded = await seedSet(ownerClient, owner.id, { cards: [{ front: "f", back: "b" }] });
    return { setId: seeded.setId, cardId: seeded.flashcardIds[0] };
  }

  it("submitting Good persists coherent FSRS state (invariants, no oracle)", async () => {
    const { cardId } = await seedOneCard();

    const before = await readCardState(ownerClient, cardId);
    expect(before?.reps).toBe(0);
    expect(before?.state).toBe(State.New);
    expect(before?.last_review).toBeNull();

    const t0 = Date.now();
    const res = await review(cardId, Rating.Good);
    expect(res.status).toBe(200);

    const after = await readCardState(ownerClient, cardId);
    expect(after).not.toBeNull();
    // reps incremented by exactly one.
    expect(after?.reps).toBe(1);
    // last_review was stamped at review time (within a generous skew window).
    expect(after?.last_review).not.toBeNull();
    expect(new Date(after?.last_review ?? 0).getTime()).toBeGreaterThanOrEqual(t0 - 5000);
    // due moved into the future (card is no longer immediately due).
    expect(new Date(after?.due ?? 0).getTime()).toBeGreaterThan(Date.now());
    // state advanced past New.
    expect(after?.state).not.toBe(State.New);
    // learning_steps guard (F1 regression): the flashcard row and the review log
    // must agree — a dropped learning_steps in the UPDATE would make them differ.
    const logSteps = await latestReviewLearningSteps(ownerClient, cardId);
    expect(logSteps).not.toBeNull();
    expect(after?.learning_steps).toBe(logSteps);
  });

  it("repeated identical submit is NOT idempotent — documents current behavior (known gap)", async () => {
    const { cardId } = await seedOneCard();

    expect((await review(cardId, Rating.Good)).status).toBe(200);
    expect((await review(cardId, Rating.Good)).status).toBe(200);

    // No dedup: two review rows persist and FSRS advanced twice. If a server-side
    // idempotency guard is ever added, this assertion is the intended failure.
    expect(await countReviews(ownerClient, cardId)).toBe(2);
    const after = await readCardState(ownerClient, cardId);
    expect(after?.reps).toBe(2);
  });

  it("concurrent submits both persist — no dedup (documents current behavior)", async () => {
    const { cardId } = await seedOneCard();

    const [r1, r2] = await Promise.all([review(cardId, Rating.Good), review(cardId, Rating.Good)]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    // Both INSERTs land (reviews has no unique constraint), so the history is
    // double-counted under a race just as it is sequentially.
    expect(await countReviews(ownerClient, cardId)).toBe(2);
  });

  it("a reviewed card drops out of due-cards on the next fetch", async () => {
    const { setId, cardId } = await seedOneCard();

    // Freshly seeded card defaults to due = now(), so it is due immediately.
    const beforeDue = await dueCards(setId);
    expect(beforeDue.cards.some((c) => c.id === cardId)).toBe(true);

    expect((await review(cardId, Rating.Good)).status).toBe(200);

    // Its due moved into the future, so it no longer appears in the due set.
    const afterDue = await dueCards(setId);
    expect(afterDue.cards.some((c) => c.id === cardId)).toBe(false);
  });

  it("driving a card to Review increments the learned count (state == 2)", async () => {
    const { setId, cardId } = await seedOneCard();

    // Submit repeatedly until the card graduates to Review. submitCardReview reads
    // the card by id and applies fsrs().next() regardless of due-ness, so we can
    // advance it without waiting. Bounded loop; assert the state was reached
    // rather than the exact interval math (oracle avoidance).
    let state: State = State.New;
    for (let i = 0; i < 12 && state !== State.Review; i++) {
      expect((await review(cardId, Rating.Good)).status).toBe(200);
      state = (await readCardState(ownerClient, cardId))?.state ?? State.New;
    }
    expect(state).toBe(State.Review);
    expect(await countLearned(ownerClient, setId)).toBe(1);
  });

  it("reset_set_progress restores FSRS defaults, deletes reviews, and re-dues all cards", async () => {
    const seeded = await seedSet(ownerClient, owner.id, {
      cards: [
        { front: "a", back: "1" },
        { front: "b", back: "2" },
      ],
    });
    const setId = seeded.setId;
    const cardId = seeded.flashcardIds[0];

    expect((await review(cardId, Rating.Good)).status).toBe(200);
    expect(await countReviews(ownerClient, cardId)).toBeGreaterThan(0);

    const res = await POST_RESET(asOwner({ params: { id: setId }, body: {} }));
    expect(res.status).toBe(200);

    const after = await readCardState(ownerClient, cardId);
    expect(after?.reps).toBe(0);
    expect(after?.state).toBe(State.New);
    expect(after?.last_review).toBeNull();
    expect(await countReviews(ownerClient, cardId)).toBe(0);

    // Both cards are due again after the reset.
    const due = await dueCards(setId);
    expect(due.cards.length).toBe(2);
  });
});
