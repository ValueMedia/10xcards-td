// Supabase test-client helpers for API integration tests.
//
// - serviceClient(): a service-role client for setup/teardown/cross-checks
//   (bypasses RLS — use ONLY in test scaffolding, never as the client under test).
// - createTestUser(): a throwaway confirmed user via the Admin API.
// - userClient(): an RLS-scoped client authenticated AS a test user (JWT in the
//   Authorization header) — this is the client the handlers under test consume,
//   so RLS/RPC run under that user's identity.
// - anonClient(): an unauthenticated (Postgres `anon` role) client.
// - deleteTestUser(): teardown via Admin API (cascades to sets/flashcards/reviews
//   via FK `on delete cascade`). NEVER use `supabase db reset` for teardown.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { supabaseUrl, anonKey, serviceRoleKey } from "./env";

const noPersist = { auth: { persistSession: false, autoRefreshToken: false } } as const;

let cachedServiceClient: SupabaseClient | null = null;

export function serviceClient(): SupabaseClient {
  cachedServiceClient ??= createClient(supabaseUrl, serviceRoleKey, { ...noPersist });
  return cachedServiceClient;
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
}

export async function createTestUser(): Promise<TestUser> {
  const email = `itest-${randomUUID()}@example.com`;
  const password = `pw-${randomUUID()}`;
  const { data, error } = await serviceClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) {
    throw new Error(`createTestUser failed: ${error.message}`);
  }
  return { id: data.user.id, email, password };
}

export async function userClient(user: TestUser): Promise<SupabaseClient> {
  const signInClient = createClient(supabaseUrl, anonKey, { ...noPersist });
  const { data, error } = await signInClient.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (error) {
    throw new Error(`userClient signIn failed: ${error.message}`);
  }
  return createClient(supabaseUrl, anonKey, {
    ...noPersist,
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  });
}

export function anonClient(): SupabaseClient {
  // supabase-js infers a narrower schema generic than the bare `SupabaseClient`
  // alias, a known upstream typing quirk; the runtime value is a plain client.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return createClient(supabaseUrl, anonKey, { ...noPersist });
}

export async function deleteTestUser(id: string): Promise<void> {
  await serviceClient().auth.admin.deleteUser(id);
}
