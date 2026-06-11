// Entity types mirroring the Supabase schema (supabase/migrations/20260610000000_initial_schema.sql).
// Supabase JS returns timestamp columns as ISO 8601 strings, hence `string` not `Date`.

import { State, Rating } from "ts-fsrs";

export { State, Rating };

// Named FlashcardSet (not Set) to avoid shadowing the global ES2015 Set.
export interface FlashcardSet {
  id: string;
  user_id: string;
  name: string;
  share_token: string | null;
  last_opened_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Flashcard {
  id: string;
  set_id: string;
  front: string;
  back: string;
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: State;
  last_review: string | null;
  created_at: string;
  updated_at: string;
}

export interface Review {
  id: string;
  flashcard_id: string;
  user_id: string;
  grade: Rating;
  state: State;
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  last_elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  review: string;
  created_at: string;
}
