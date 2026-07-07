// SR-state assertion helpers for persistence integration tests.
//
// All reads go through an owner RLS-scoped client (the service-role key has no
// table GRANT on the app schema — see lessons.md), mirroring the ad-hoc readers
// in tests/integration/authorization/reviews.idor.test.ts. These exist so the
// SR and batch suites stay terse and assert on the persisted columns directly.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Flashcard } from "@/types";

const FSRS_COLUMNS =
  "reps, lapses, state, due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, last_review";

export type CardState = Pick<
  Flashcard,
  | "reps"
  | "lapses"
  | "state"
  | "due"
  | "stability"
  | "difficulty"
  | "elapsed_days"
  | "scheduled_days"
  | "learning_steps"
  | "last_review"
>;

// The FSRS columns of a single flashcard, read as the owner.
export async function readCardState(client: SupabaseClient, cardId: string): Promise<CardState | null> {
  const { data } = await client.from("flashcards").select(FSRS_COLUMNS).eq("id", cardId).maybeSingle();
  return data ?? null;
}

// Number of immutable review-log rows for a flashcard (history double-count guard).
export async function countReviews(client: SupabaseClient, cardId: string): Promise<number> {
  const { count } = await client
    .from("reviews")
    .select("id", { count: "exact", head: true })
    .eq("flashcard_id", cardId);
  return count ?? 0;
}

// The learning_steps written to the latest review-log row — used to assert the
// flashcard row and review log stay consistent (the F1 regression from
// sr-review-session, where learning_steps was dropped from the flashcard UPDATE).
export async function latestReviewLearningSteps(client: SupabaseClient, cardId: string): Promise<number | null> {
  const { data } = await client
    .from("reviews")
    .select("learning_steps, review")
    .eq("flashcard_id", cardId)
    .order("review", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? (data.learning_steps as number) : null;
}

// Count of "learned" cards in a set — state == 2 (ts-fsrs State.Review), the
// same metric used by stats.ts and the teacher RPC.
export async function countLearned(client: SupabaseClient, setId: string): Promise<number> {
  const { count } = await client
    .from("flashcards")
    .select("id", { count: "exact", head: true })
    .eq("set_id", setId)
    .eq("state", 2);
  return count ?? 0;
}
