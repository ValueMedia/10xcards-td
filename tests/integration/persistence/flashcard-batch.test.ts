// Risk #4 — flashcard batch-save persistence (test-plan Phase 2).
//
// Proves the batch endpoint is all-or-nothing on validation, respects the 1–50
// cap, and that its intentional duplicate-skip / all-duplicate behaviors are
// SURFACED to the caller (skippedCount/skippedFronts) rather than lost silently.
// Every card is created through the real POST /api/sets/[id]/flashcards/batch
// path and cross-checked with an independent owner-client card count, so the
// assertions prove persistence, not just HTTP status.
//
// NOTE ON WITHIN-BATCH DUPLICATES: the duplicate filter only compares against
// fronts already in the DB (createFlashcardsBulk → checkDuplicateFronts), not
// within the submitted batch, and there is no UNIQUE constraint on
// (set_id, front). Two identical fronts in one batch therefore BOTH persist —
// documented below as current behavior.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { hasSupabaseEnv } from "../helpers/env";
import { createTestUser, userClient, deleteTestUser, type TestUser } from "../helpers/supabase";
import { seedSet } from "../helpers/seed";
import { makeApiContext } from "../helpers/context";
import type { SupabaseClient } from "@supabase/supabase-js";
import { POST as POST_BATCH } from "@/pages/api/sets/[id]/flashcards/batch";

describe.skipIf(!hasSupabaseEnv)("Flashcard batch-save persistence (Risk #4)", () => {
  const users: TestUser[] = [];
  let owner: TestUser;
  let other: TestUser;
  let ownerClient: SupabaseClient;
  let otherClient: SupabaseClient;

  beforeAll(async () => {
    owner = await createTestUser();
    other = await createTestUser();
    users.push(owner, other);
    ownerClient = await userClient(owner);
    otherClient = await userClient(other);
  });

  afterAll(async () => {
    for (const u of users) await deleteTestUser(u.id);
  });

  // A fresh empty set owned by `owner`, so the batch endpoint creates every card
  // and card counts are unambiguous.
  async function emptySet(): Promise<string> {
    const { data, error } = await ownerClient
      .from("sets")
      .insert({ user_id: owner.id, name: "Batch Test Set" })
      .select("id")
      .single();
    if (error) throw new Error(`emptySet failed: ${error.message}`);
    return data.id as string;
  }

  // Count of flashcards in a set, read as the owner — an independent read path
  // from the endpoint under test (the service-role key has no table GRANT).
  async function cardCount(setId: string): Promise<number> {
    const { count } = await ownerClient
      .from("flashcards")
      .select("id", { count: "exact", head: true })
      .eq("set_id", setId);
    return count ?? 0;
  }

  const batch = (client: SupabaseClient, userId: string, setId: string, flashcards: unknown[]) =>
    POST_BATCH(makeApiContext({ user: { id: userId }, supabase: client, params: { id: setId }, body: { flashcards } }));

  // N distinct cards with unique fronts.
  const cards = (n: number, prefix = "front") =>
    Array.from({ length: n }, (_, i) => ({ front: `${prefix}-${i}`, back: `back-${i}` }));

  it("persists a full batch of distinct cards", async () => {
    const setId = await emptySet();

    const res = await batch(ownerClient, owner.id, setId, cards(5));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.count).toBe(5);

    expect(await cardCount(setId)).toBe(5);
  });

  it("rejects the whole batch when one element is invalid — nothing persists", async () => {
    // Empty front fails flashcardContentSchema.min(1) at the endpoint's zod parse,
    // before the service runs — so no partial write.
    const emptyFrontSet = await emptySet();
    const resEmpty = await batch(ownerClient, owner.id, emptyFrontSet, [...cards(3), { front: "", back: "b" }]);
    expect(resEmpty.status).toBe(400);
    expect(await cardCount(emptyFrontSet)).toBe(0);

    // Over-length front (>1000 chars) fails .max(1000) the same way.
    const longFrontSet = await emptySet();
    const resLong = await batch(ownerClient, owner.id, longFrontSet, [
      ...cards(3),
      { front: "x".repeat(1001), back: "b" },
    ]);
    expect(resLong.status).toBe(400);
    expect(await cardCount(longFrontSet)).toBe(0);
  });

  it("accepts 50 cards but rejects 51 (1–50 cap)", async () => {
    const set50 = await emptySet();
    const res50 = await batch(ownerClient, owner.id, set50, cards(50));
    expect(res50.status).toBe(201);
    expect((await res50.json()).count).toBe(50);
    expect(await cardCount(set50)).toBe(50);

    const set51 = await emptySet();
    const res51 = await batch(ownerClient, owner.id, set51, cards(51));
    expect(res51.status).toBe(400);
    expect(await cardCount(set51)).toBe(0);
  });

  it("skips a duplicate front silently but surfaces skippedCount/skippedFronts", async () => {
    const { setId } = await seedSet(ownerClient, owner.id, { cards: [{ front: "X", back: "b" }] });

    // Re-submit the existing "X" alongside two genuinely new cards.
    const res = await batch(ownerClient, owner.id, setId, [
      { front: "X", back: "b2" },
      { front: "new-1", back: "b" },
      { front: "new-2", back: "b" },
    ]);
    expect(res.status).toBe(201);
    const body = await res.json();
    // Only the two new cards were written; the duplicate was skipped — but the
    // caller is TOLD, not silently short-changed.
    expect(body.count).toBe(2);
    expect(body.skippedCount).toBe(1);
    expect(body.skippedFronts).toEqual(["X"]);

    // 1 pre-seeded + 2 new = 3.
    expect(await cardCount(setId)).toBe(3);
  });

  it("returns count 0 when every front already exists — no new rows", async () => {
    const { setId } = await seedSet(ownerClient, owner.id, {
      cards: [
        { front: "A", back: "1" },
        { front: "B", back: "2" },
      ],
    });

    const res = await batch(ownerClient, owner.id, setId, [
      { front: "A", back: "x" },
      { front: "B", back: "y" },
    ]);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.count).toBe(0);
    expect(body.skippedCount).toBe(2);

    // Unchanged: the two originals, no new rows.
    expect(await cardCount(setId)).toBe(2);
  });

  it("persists both when two identical fronts appear within one batch (no UNIQUE constraint)", async () => {
    const setId = await emptySet();

    // The dedup filter only compares against existing DB fronts, so within-batch
    // duplicates are not caught — both land.
    const res = await batch(ownerClient, owner.id, setId, [
      { front: "dup", back: "1" },
      { front: "dup", back: "2" },
    ]);
    expect(res.status).toBe(201);
    expect((await res.json()).count).toBe(2);
    expect(await cardCount(setId)).toBe(2);
  });

  it("non-owner batch to another user's set → 404, nothing written", async () => {
    const setId = await emptySet(); // owned by `owner`

    // `other` drives the endpoint with their own RLS client against owner's set.
    // createFlashcardsBulk's ownership guard (eq user_id) yields notFound → 404.
    const res = await batch(otherClient, other.id, setId, cards(3));
    expect(res.status).toBe(404);

    expect(await cardCount(setId)).toBe(0);
  });
});
