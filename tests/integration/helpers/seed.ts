// Seed helpers: create a set (and optional flashcards) owned by a test user,
// using the SAME insert shapes the services use. The passed client must be
// authenticated as the owning user (RLS `with check` requires auth.uid() = user_id).
import type { SupabaseClient } from "@supabase/supabase-js";

export interface SeededSet {
  setId: string;
  flashcardIds: string[];
}

interface SeedOpts {
  name?: string;
  cards?: { front: string; back: string }[];
}

export async function seedSet(
  client: SupabaseClient,
  userId: string,
  opts: SeedOpts = {},
): Promise<SeededSet> {
  const { data: setRow, error: setError } = await client
    .from("sets")
    .insert({ user_id: userId, name: opts.name ?? "Test Set" })
    .select("id")
    .single();
  if (setError || !setRow) {
    throw new Error(`seedSet failed: ${setError?.message ?? "no set returned"}`);
  }
  const setId = setRow.id as string;

  const cards = opts.cards ?? [{ front: "front", back: "back" }];
  const { data: cardRows, error: cardError } = await client
    .from("flashcards")
    .insert(cards.map((c) => ({ set_id: setId, front: c.front, back: c.back })))
    .select("id");
  if (cardError) {
    throw new Error(`seedSet flashcards failed: ${cardError.message}`);
  }

  return { setId, flashcardIds: (cardRows ?? []).map((r) => r.id as string) };
}
