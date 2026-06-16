import type { SupabaseClient } from "@supabase/supabase-js";
import type { PostgrestError, AuthError } from "@supabase/supabase-js";

interface UserPromptRow {
  id: string;
  user_id: string;
  prompt: string;
  flashcard_count: number | null;
  created_at: string;
  updated_at: string;
}

export interface UserPromptData {
  prompt: string;
  flashcard_count: number | null;
}

export async function getUserPrompt(supabase: SupabaseClient, userId: string) {
  const { data, error }: { data: UserPromptRow | null; error: PostgrestError | null } = await supabase
    .from("user_ai_prompts")
    .select("prompt, flashcard_count")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return { data: null, error };
  }

  if (!data) {
    return { data: null, error: null };
  }

  return {
    data: { prompt: data.prompt, flashcard_count: data.flashcard_count },
    error: null,
  };
}

export async function upsertUserPrompt(
  supabase: SupabaseClient,
  userId: string,
  prompt: string,
  flashcardCount: number | null,
) {
  const { data, error }: { data: UserPromptRow | null; error: PostgrestError | null } = await supabase
    .from("user_ai_prompts")
    .upsert(
      {
        user_id: userId,
        prompt,
        flashcard_count: flashcardCount,
      },
      { onConflict: "user_id" },
    )
    .select("prompt, flashcard_count")
    .single();

  if (error) {
    return { data: null, error };
  }

  return {
    data: { prompt: data.prompt, flashcard_count: data.flashcard_count },
    error: null,
  };
}

export async function deleteUserPrompt(supabase: SupabaseClient, userId: string) {
  const { error } = await supabase.from("user_ai_prompts").delete().eq("user_id", userId);

  return { error };
}

export async function changePassword(supabase: SupabaseClient, newPassword: string) {
  const { error }: { error: AuthError | null } = await supabase.auth.updateUser({ password: newPassword });

  return { error };
}

export async function deleteUserAccount(adminClient: SupabaseClient, userId: string) {
  const { error } = await adminClient.auth.admin.deleteUser(userId);

  return { error: error as Error | null };
}