import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://nqbaxfphnxqkhwgaxxed.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xYmF4ZnBobnhxa2h3Z2F4eGVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MDU4NDgsImV4cCI6MjA5MDM4MTg0OH0.YWE0oTSKg2dP7e3_H6i3-ElyAucEurw8EaEFfIfL05c";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export type LeaderboardEntry = {
  id: number;
  nickname: string;
  score: number;
  wave: number;
  difficulty: string;
  created_at: string;
};

export async function submitScore(
  nickname: string,
  score: number,
  wave: number,
  difficulty: string,
): Promise<void> {
  await supabase.from("leaderboard").insert({
    nickname,
    score,
    wave,
    difficulty,
  });
}

export async function fetchLeaderboard(
  difficulty?: string,
  limit = 100,
): Promise<LeaderboardEntry[]> {
  let query = supabase
    .from("leaderboard")
    .select("*")
    .order("score", { ascending: false })
    .limit(limit);
  if (difficulty) {
    query = query.eq("difficulty", difficulty);
  }
  const { data } = await query;
  return (data as LeaderboardEntry[]) ?? [];
}
