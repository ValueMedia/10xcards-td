import { describe, it, expect, afterAll } from "vitest";
import { hasSupabaseEnv } from "./helpers/env";
import { createTestUser, userClient, deleteTestUser, type TestUser } from "./helpers/supabase";
import { seedSet } from "./helpers/seed";
import { makeApiContext } from "./helpers/context";
import { GET } from "@/pages/api/sets/[id]/flashcards";

// Proves the harness end-to-end: an authenticated owner creates a set and reads
// it back through a real route handler. Auto-skips when no local Supabase env.
describe.skipIf(!hasSupabaseEnv)("integration harness smoke", () => {
  const users: TestUser[] = [];

  afterAll(async () => {
    for (const u of users) await deleteTestUser(u.id);
  });

  it("owner can read their own set's flashcards (200)", async () => {
    const owner = await createTestUser();
    users.push(owner);
    const client = await userClient(owner);

    const { setId } = await seedSet(client, owner.id, {
      name: "Smoke Set",
      cards: [{ front: "hello", back: "world" }],
    });

    const res = await GET(makeApiContext({ user: { id: owner.id }, supabase: client, params: { id: setId } }));

    expect(res.status).toBe(200);
    const body = await (
      res as unknown as { json: () => Promise<{ set: { id: string }; flashcards: unknown[] }> }
    ).json();
    expect(body.set.id).toBe(setId);
    expect(body.flashcards).toHaveLength(1);
  });
});
