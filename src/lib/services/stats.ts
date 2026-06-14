import type { SupabaseClient } from "@supabase/supabase-js";

export async function logSession(
  client: SupabaseClient,
  userId: string,
  setId: string,
  startedAt: Date,
  endedAt: Date,
): Promise<{ error: string | null }> {
  const { error } = await client.from("session_log").insert({
    user_id: userId,
    set_id: setId,
    started_at: startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
  });
  if (error) return { error: error.message };
  return { error: null };
}
