import type { SupabaseClient } from "@supabase/supabase-js";
import { fsrs } from "ts-fsrs";
import type { Rating } from "ts-fsrs";
import type { Flashcard } from "@/types";
import type { ServiceError } from "./flashcards";

export async function getDueCardsForSession(
  client: SupabaseClient | null,
  setId: string,
): Promise<{ data: { cards: Flashcard[]; nextDue: string | null } | null; error: ServiceError | null }> {
  if (!client) return { data: null, error: { kind: "clientUnavailable", message: "Supabase client not available" } };

  const now = new Date().toISOString();

  const result = await client
    .from("flashcards")
    .select("*")
    .eq("set_id", setId)
    .lte("due", now)
    .order("due", { ascending: true });

  if (result.error) return { data: null, error: { kind: "dbError", message: result.error.message } };

  const cards = result.data as Flashcard[];

  if (cards.length > 0) {
    return { data: { cards, nextDue: null }, error: null };
  }

  const nextResult = await client
    .from("flashcards")
    .select("due")
    .eq("set_id", setId)
    .order("due", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (nextResult.error) return { data: null, error: { kind: "dbError", message: nextResult.error.message } };

  const nextDue: string | null = nextResult.data ? String(nextResult.data.due) : null;
  return { data: { cards: [], nextDue }, error: null };
}

export async function submitCardReview(
  client: SupabaseClient | null,
  userId: string,
  flashcardId: string,
  grade: Rating,
): Promise<{ error: ServiceError | null }> {
  if (!client) return { error: { kind: "clientUnavailable", message: "Supabase client not available" } };

  const cardResult = await client.from("flashcards").select("*").eq("id", flashcardId).maybeSingle();

  if (cardResult.error) return { error: { kind: "dbError", message: cardResult.error.message } };
  if (!cardResult.data) return { error: { kind: "notFound", message: "Flashcard not found" } };

  const flashcard = cardResult.data as Flashcard;

  const f = fsrs();
  const card = {
    due: new Date(flashcard.due),
    stability: flashcard.stability,
    difficulty: flashcard.difficulty,
    elapsed_days: flashcard.elapsed_days,
    scheduled_days: flashcard.scheduled_days,
    learning_steps: flashcard.learning_steps,
    reps: flashcard.reps,
    lapses: flashcard.lapses,
    state: flashcard.state,
    last_review: flashcard.last_review ? new Date(flashcard.last_review) : undefined,
  };

  const now = new Date();
  const result = f.next(card, now, grade);

  const updateResult = await client
    .from("flashcards")
    .update({
      due: result.card.due.toISOString(),
      stability: result.card.stability,
      difficulty: result.card.difficulty,
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      elapsed_days: result.card.elapsed_days,
      scheduled_days: result.card.scheduled_days,
      reps: result.card.reps,
      lapses: result.card.lapses,
      state: result.card.state,
      last_review: result.card.last_review ? result.card.last_review.toISOString() : now.toISOString(),
    })
    .eq("id", flashcardId);

  if (updateResult.error) return { error: { kind: "dbError", message: updateResult.error.message } };

  const insertResult = await client.from("reviews").insert({
    flashcard_id: flashcardId,
    user_id: userId,
    grade: result.log.rating,
    state: result.log.state,
    due: result.log.due.toISOString(),
    stability: result.log.stability,
    difficulty: result.log.difficulty,
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    elapsed_days: result.log.elapsed_days,
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    last_elapsed_days: result.log.last_elapsed_days,
    scheduled_days: result.log.scheduled_days,
    learning_steps: result.card.learning_steps,
    review: result.log.review.toISOString(),
  });

  if (insertResult.error) return { error: { kind: "dbError", message: insertResult.error.message } };

  return { error: null };
}
