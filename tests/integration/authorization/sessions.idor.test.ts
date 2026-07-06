// Risk #1 — the live IDOR gap on POST /api/sessions.
//
// logSession originally inserted { user_id, set_id } straight from the request
// body with NO ownership check on set_id. RLS on session_log only checks
// auth.uid() = user_id, so user B could log a session against user A's set_id
// (a cross-user reference the row's own RLS never catches). This suite encodes
// the intended behavior: B → A's set yields 404 and writes no session_log row;
// B → B's own set still succeeds (positive control).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { hasSupabaseEnv } from "../helpers/env";
import { createTestUser, userClient, deleteTestUser, type TestUser } from "../helpers/supabase";
import { seedSet } from "../helpers/seed";
import { makeApiContext } from "../helpers/context";
import type { SupabaseClient } from "@supabase/supabase-js";
import { POST as POST_SESSION } from "@/pages/api/sessions";

describe.skipIf(!hasSupabaseEnv)("IDOR: POST /api/sessions ownership gap", () => {
  const users: TestUser[] = [];
  let owner: TestUser;
  let attacker: TestUser;
  let attackerClient: SupabaseClient;
  let ownerSetId: string;
  let attackerSetId: string;

  const startedAt = "2026-01-01T10:00:00.000Z";
  const endedAt = "2026-01-01T10:05:00.000Z";

  beforeAll(async () => {
    owner = await createTestUser();
    attacker = await createTestUser();
    users.push(owner, attacker);
    const ownerClient = await userClient(owner);
    attackerClient = await userClient(attacker);
    ownerSetId = (await seedSet(ownerClient, owner.id)).setId;
    attackerSetId = (await seedSet(attackerClient, attacker.id)).setId;
  });

  afterAll(async () => {
    for (const u of users) await deleteTestUser(u.id);
  });

  const asAttacker = (setId: string) =>
    makeApiContext({
      user: { id: attacker.id },
      supabase: attackerClient,
      body: { setId, startedAt, endedAt },
    });

  // Cross-check via B's own RLS-scoped client. session_log_select_own scopes
  // reads to auth.uid() = user_id, so this counts exactly B's rows for a set —
  // which is what we assert about (the service-role key has no table GRANT on
  // the app schema, so it cannot read session_log; see reviews.idor.test.ts).
  async function attackerSessionRowCount(setId: string): Promise<number> {
    const { count } = await attackerClient
      .from("session_log")
      .select("id", { count: "exact", head: true })
      .eq("set_id", setId);
    return count ?? -1;
  }

  it("B → 404 logging a session against A's set, and writes no row", async () => {
    const res = await POST_SESSION(asAttacker(ownerSetId));
    expect(res.status).toBe(404);
    expect(await attackerSessionRowCount(ownerSetId)).toBe(0);
  });

  it("B → 200 logging a session against B's own set [positive control]", async () => {
    const res = await POST_SESSION(asAttacker(attackerSetId));
    expect(res.status).toBe(200);
    expect(await attackerSessionRowCount(attackerSetId)).toBe(1);
  });
});
