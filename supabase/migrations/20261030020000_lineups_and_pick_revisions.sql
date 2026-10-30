-- CALIBRALL: Official Lineups, Lineup Comparison, and Forward Pick Revisions Schema
-- Supports requirements 1, 2, 3, 4, 5:
-- 1. `lineups` table storing both 'predicted' (Expected XI) and 'confirmed' player states
-- 2. `pick_revisions` table preserving immutable pre-lineup picks (Revision 1) alongside post-lineup updates (Revision 2)

CREATE TABLE IF NOT EXISTS public.lineups (
  id TEXT PRIMARY KEY,
  fixture_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  position TEXT NOT NULL, -- 'GK', 'DF', 'MF', 'FW'
  is_starter BOOLEAN NOT NULL DEFAULT true, -- true = starting XI, false = bench
  formation TEXT, -- e.g. '4-3-3', '4-2-3-1'
  status TEXT NOT NULL CHECK (status IN ('predicted', 'confirmed')),
  is_key_player BOOLEAN DEFAULT false,
  is_captain BOOLEAN DEFAULT false,
  minutes_played_season INT DEFAULT 0,
  goals_season INT DEFAULT 0,
  assists_season INT DEFAULT 0,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lineups_fixture_status ON public.lineups(fixture_id, status);
CREATE INDEX IF NOT EXISTS idx_lineups_fixture_team ON public.lineups(fixture_id, team_id);
CREATE INDEX IF NOT EXISTS idx_lineups_player_id ON public.lineups(player_id);

-- Enable RLS
ALTER TABLE public.lineups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access for lineups"
  ON public.lineups FOR SELECT
  USING (true);

CREATE POLICY "Service role write access for lineups"
  ON public.lineups FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role' OR auth.jwt() ->> 'role' = 'admin');

-- Pick Revisions Table: Preserves Revision 1 (pre-lineup) and Revision 2 (post-lineup)
CREATE TABLE IF NOT EXISTS public.pick_revisions (
  id TEXT PRIMARY KEY,
  pick_id TEXT NOT NULL,
  fixture_id TEXT NOT NULL,
  revision_number INT NOT NULL DEFAULT 1,
  recorded_at TIMESTAMPTZ NOT NULL,
  kickoff_time TIMESTAMPTZ NOT NULL,
  market_code TEXT NOT NULL,
  market_name TEXT NOT NULL,
  selection TEXT NOT NULL,
  probability NUMERIC NOT NULL,
  odds NUMERIC,
  edge NUMERIC,
  lineup_status TEXT NOT NULL CHECK (lineup_status IN ('pre-lineup', 'confirmed')),
  change_summary TEXT,
  key_player_out_flag BOOLEAN DEFAULT false,
  key_player_out_name TEXT,
  record_hash TEXT NOT NULL,
  grading_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (grading_status IN ('PENDING', 'GRADED')),
  settlement_status TEXT CHECK (settlement_status IN ('WON', 'LOST', 'PUSH', 'VOID')),
  actual_score TEXT,
  brier_error NUMERIC,
  log_loss NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pick_revisions_fixture ON public.pick_revisions(fixture_id);
CREATE INDEX IF NOT EXISTS idx_pick_revisions_pick_id ON public.pick_revisions(pick_id);
CREATE INDEX IF NOT EXISTS idx_pick_revisions_recorded_at ON public.pick_revisions(recorded_at);

ALTER TABLE public.pick_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access for pick revisions"
  ON public.pick_revisions FOR SELECT
  USING (true);

CREATE POLICY "Service role write access for pick revisions"
  ON public.pick_revisions FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role' OR auth.jwt() ->> 'role' = 'admin');
