import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { FlashcardSet, Flashcard } from "@/types";

export const setNameSchema = z
  .string()
  .min(1, "Set name is required")
  .max(200, "Set name must be 200 characters or less");

export type SetName = z.infer<typeof setNameSchema>;

export async function listSets(
  client: SupabaseClient | null,
  userId: string,
): Promise<{ data: FlashcardSet[] | null; error: string | null }> {
  if (!client) return { data: null, error: "Supabase client not available" };

  const result = await client.from("sets").select("*").eq("user_id", userId).order("updated_at", { ascending: false });

  if (result.error) return { data: null, error: result.error.message };
  return { data: result.data as FlashcardSet[], error: null };
}

export async function listSetsWithFlashcardCounts(
  client: SupabaseClient | null,
  userId: string,
): Promise<{ data: (FlashcardSet & { flashcard_count: number })[] | null; error: string | null }> {
  if (!client) return { data: null, error: "Supabase client not available" };

  const result = await client
    .from("sets")
    .select("*, flashcard_count:flashcards(count)")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (result.error) return { data: null, error: result.error.message };

  const mapped = (result.data as (FlashcardSet & { flashcard_count?: { count: number }[] | number })[]).map((set) => ({
    ...set,
    flashcard_count: Array.isArray(set.flashcard_count)
      ? (set.flashcard_count[0]?.count ?? 0)
      : (set.flashcard_count ?? 0),
  })) as (FlashcardSet & { flashcard_count: number })[];

  return { data: mapped, error: null };
}

export async function createSet(
  client: SupabaseClient | null,
  userId: string,
  name: string,
): Promise<{ data: FlashcardSet | null; error: string | null }> {
  if (!client) return { data: null, error: "Supabase client not available" };

  const result = await client.from("sets").insert({ user_id: userId, name }).select().single();

  if (result.error) return { data: null, error: result.error.message };
  return { data: result.data as FlashcardSet, error: null };
}

export async function renameSet(
  client: SupabaseClient | null,
  userId: string,
  setId: string,
  name: string,
): Promise<{ data: FlashcardSet | null; error: string | null }> {
  if (!client) return { data: null, error: "Supabase client not available" };

  const result = await client
    .from("sets")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", setId)
    .eq("user_id", userId)
    .select()
    .single();

  if (result.error) return { data: null, error: result.error.message };
  return { data: result.data as FlashcardSet, error: null };
}

export async function deleteSet(
  client: SupabaseClient | null,
  userId: string,
  setId: string,
): Promise<{ error: string | null }> {
  if (!client) return { error: "Supabase client not available" };

  const result = await client.from("sets").delete().eq("id", setId).eq("user_id", userId).select("id");

  if (result.error) return { error: result.error.message };
  if (result.data.length === 0) return { error: "Set not found" };
  return { error: null };
}

export async function getSetWithFlashcards(
  client: SupabaseClient | null,
  setId: string,
): Promise<{
  data: { set: FlashcardSet; flashcards: Flashcard[] } | null;
  error: string | null;
}> {
  if (!client) return { data: null, error: "Supabase client not available" };

  const setResult = await client.from("sets").select("*").eq("id", setId).maybeSingle();

  if (setResult.error) return { data: null, error: setResult.error.message };
  if (!setResult.data) return { data: null, error: "Set not found" };

  const fcResult = await client
    .from("flashcards")
    .select("*")
    .eq("set_id", setId)
    .order("created_at", { ascending: true });

  if (fcResult.error) return { data: null, error: fcResult.error.message };

  return {
    data: {
      set: setResult.data as FlashcardSet,
      flashcards: fcResult.data as Flashcard[],
    },
    error: null,
  };
}
