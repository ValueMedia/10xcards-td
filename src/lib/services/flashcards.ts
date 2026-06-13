import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Flashcard } from "@/types";

export const flashcardContentSchema = z.object({
  front: z.string().min(1, "Front is required").max(1000, "Front must be 1000 characters or less"),
  back: z.string().min(1, "Back is required").max(1000, "Back must be 1000 characters or less"),
});

export type FlashcardContent = z.infer<typeof flashcardContentSchema>;

export type ServiceError =
  | { kind: "notFound"; message: string }
  | { kind: "clientUnavailable"; message: string }
  | { kind: "dbError"; message: string };

export function errorMessage(error: ServiceError): string {
  return error.message;
}

export function isNotFound(error: ServiceError): boolean {
  return error.kind === "notFound";
}

export async function createFlashcard(
  client: SupabaseClient | null,
  userId: string,
  setId: string,
  content: FlashcardContent,
): Promise<{ data: Flashcard | null; error: ServiceError | null }> {
  if (!client) return { data: null, error: { kind: "clientUnavailable", message: "Supabase client not available" } };

  const setResult = await client.from("sets").select("id").eq("id", setId).eq("user_id", userId).maybeSingle();
  if (setResult.error) return { data: null, error: { kind: "dbError", message: setResult.error.message } };
  if (!setResult.data) return { data: null, error: { kind: "notFound", message: "Set not found" } };

  const result = await client
    .from("flashcards")
    .insert({ set_id: setId, front: content.front, back: content.back })
    .select()
    .single();

  if (result.error) return { data: null, error: { kind: "dbError", message: result.error.message } };
  return { data: result.data as Flashcard, error: null };
}

export async function createFlashcardsBulk(
  client: SupabaseClient | null,
  userId: string,
  setId: string,
  contents: FlashcardContent[],
): Promise<{ data: Flashcard[] | null; error: ServiceError | null }> {
  if (!client) return { data: null, error: { kind: "clientUnavailable", message: "Supabase client not available" } };

  const setResult = await client.from("sets").select("id").eq("id", setId).eq("user_id", userId).maybeSingle();
  if (setResult.error) return { data: null, error: { kind: "dbError", message: setResult.error.message } };
  if (!setResult.data) return { data: null, error: { kind: "notFound", message: "Set not found" } };

  if (contents.length === 0) {
    return { data: [], error: null };
  }

  const result = await client
    .from("flashcards")
    .insert(contents.map((content) => ({ set_id: setId, front: content.front, back: content.back })))
    .select();

  if (result.error) return { data: null, error: { kind: "dbError", message: result.error.message } };
  return { data: result.data as Flashcard[], error: null };
}

export async function updateFlashcard(
  client: SupabaseClient | null,
  userId: string,
  flashcardId: string,
  content: FlashcardContent,
): Promise<{ data: Flashcard | null; error: ServiceError | null }> {
  if (!client) return { data: null, error: { kind: "clientUnavailable", message: "Supabase client not available" } };

  const accessResult = await client
    .from("flashcards")
    .select("id, sets!inner(user_id)")
    .eq("id", flashcardId)
    .eq("sets.user_id", userId)
    .maybeSingle();

  if (accessResult.error) return { data: null, error: { kind: "dbError", message: accessResult.error.message } };
  if (!accessResult.data) return { data: null, error: { kind: "notFound", message: "Flashcard not found" } };

  const result = await client
    .from("flashcards")
    .update({ front: content.front, back: content.back })
    .eq("id", flashcardId)
    .select()
    .single();

  if (result.error) return { data: null, error: { kind: "dbError", message: result.error.message } };
  if (!result.data) return { data: null, error: { kind: "notFound", message: "Flashcard not found" } };
  return { data: result.data as Flashcard, error: null };
}

export async function deleteFlashcard(
  client: SupabaseClient | null,
  userId: string,
  flashcardId: string,
): Promise<{ error: ServiceError | null }> {
  if (!client) return { error: { kind: "clientUnavailable", message: "Supabase client not available" } };

  const accessResult = await client
    .from("flashcards")
    .select("id, sets!inner(user_id)")
    .eq("id", flashcardId)
    .eq("sets.user_id", userId)
    .maybeSingle();

  if (accessResult.error) return { error: { kind: "dbError", message: accessResult.error.message } };
  if (!accessResult.data) return { error: { kind: "notFound", message: "Flashcard not found" } };

  const result = await client.from("flashcards").delete().eq("id", flashcardId).select("id");

  if (result.error) return { error: { kind: "dbError", message: result.error.message } };
  if (result.data.length === 0) return { error: { kind: "notFound", message: "Flashcard not found" } };
  return { error: null };
}
