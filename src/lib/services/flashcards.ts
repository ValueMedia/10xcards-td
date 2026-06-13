import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Flashcard } from "@/types";

export const flashcardContentSchema = z.object({
  front: z.string().min(1, "Front is required").max(1000, "Front must be 1000 characters or less"),
  back: z.string().min(1, "Back is required").max(1000, "Back must be 1000 characters or less"),
});

export type FlashcardContent = z.infer<typeof flashcardContentSchema>;

export async function createFlashcard(
  client: SupabaseClient | null,
  setId: string,
  content: FlashcardContent,
): Promise<{ data: Flashcard | null; error: string | null }> {
  if (!client) return { data: null, error: "Supabase client not available" };

  const result = await client
    .from("flashcards")
    .insert({ set_id: setId, front: content.front, back: content.back })
    .select()
    .single();

  if (result.error) return { data: null, error: result.error.message };
  return { data: result.data as Flashcard, error: null };
}

export async function updateFlashcard(
  client: SupabaseClient | null,
  flashcardId: string,
  content: FlashcardContent,
): Promise<{ data: Flashcard | null; error: string | null }> {
  if (!client) return { data: null, error: "Supabase client not available" };

  const result = await client
    .from("flashcards")
    .update({ front: content.front, back: content.back })
    .eq("id", flashcardId)
    .filter("set_id", "in", "(select id from sets where user_id = auth.uid())")
    .select()
    .single();

  if (result.error) return { data: null, error: result.error.message };
  if (!result.data) return { data: null, error: "Flashcard not found" };
  return { data: result.data as Flashcard, error: null };
}

export async function deleteFlashcard(
  client: SupabaseClient | null,
  flashcardId: string,
): Promise<{ error: string | null }> {
  if (!client) return { error: "Supabase client not available" };

  const result = await client
    .from("flashcards")
    .delete()
    .eq("id", flashcardId)
    .filter("set_id", "in", "(select id from sets where user_id = auth.uid())")
    .select("id");

  if (result.error) return { error: result.error.message };
  if (result.data.length === 0) return { error: "Flashcard not found" };
  return { error: null };
}
