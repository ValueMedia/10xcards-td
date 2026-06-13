import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { getSetWithFlashcards } from "@/lib/services/sets";

export const GET: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { id } = context.params;
  if (!id) {
    return new Response(JSON.stringify({ error: "Set ID is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  const { data, error } = await getSetWithFlashcards(supabase, id);

  if (error) {
    const status = error === "Set not found" ? 404 : 500;
    return new Response(JSON.stringify({ error }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
