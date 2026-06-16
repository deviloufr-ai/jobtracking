-- Durable per-IP quota for the shared Claude API key (free trial).
--
-- When a user has NOT configured their own Claude API key, AI calls fall back to
-- the project owner's shared ANTHROPIC_API_KEY. To cap that cost, the serverless
-- functions record per-IP usage here and refuse further shared-key calls once the
-- trial budget is spent (the user is then prompted to add their own key).
--
-- Accessed only by serverless functions via the service-role key, so RLS stays
-- disabled (the service role bypasses RLS anyway).

CREATE TABLE IF NOT EXISTS shared_key_usage (
  ip            TEXT PRIMARY KEY,
  count         INTEGER NOT NULL DEFAULT 0,
  window_start  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE shared_key_usage IS
  'Per-IP usage counter for the shared Claude API key free trial. Written by /api/* serverless functions via the service role.';
