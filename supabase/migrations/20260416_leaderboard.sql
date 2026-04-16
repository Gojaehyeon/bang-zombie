CREATE TABLE IF NOT EXISTS leaderboard (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nickname text NOT NULL DEFAULT 'Player',
  score int NOT NULL DEFAULT 0,
  wave int NOT NULL DEFAULT 0,
  difficulty text NOT NULL DEFAULT 'easy',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE leaderboard ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read leaderboard"
  ON leaderboard FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert scores"
  ON leaderboard FOR INSERT
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_leaderboard_score ON leaderboard (score DESC);
