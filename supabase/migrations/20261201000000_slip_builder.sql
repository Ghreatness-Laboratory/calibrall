-- Slip Builder daily accountability ledger and tier usage tracking

CREATE TABLE IF NOT EXISTS public.daily_slip_sets (
  id TEXT PRIMARY KEY,
  slip_date TEXT NOT NULL,
  sport_scope TEXT NOT NULL DEFAULT 'all',
  target_odds DOUBLE PRECISION NOT NULL,
  rank_index INTEGER NOT NULL DEFAULT 1,
  style TEXT NOT NULL DEFAULT 'safest',
  status TEXT NOT NULL DEFAULT 'PENDING',
  combined_odds DOUBLE PRECISION NOT NULL,
  settled_odds DOUBLE PRECISION,
  combined_probability DOUBLE PRECISION NOT NULL,
  legs_count INTEGER NOT NULL,
  includes_model_fair BOOLEAN NOT NULL DEFAULT FALSE,
  first_kickoff_utc TEXT,
  legs_json TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at TIMESTAMPTZ,
  UNIQUE (slip_date, target_odds, rank_index)
);

CREATE INDEX IF NOT EXISTS idx_daily_slip_sets_date ON public.daily_slip_sets (slip_date DESC, target_odds ASC);
CREATE INDEX IF NOT EXISTS idx_daily_slip_sets_status ON public.daily_slip_sets (status);

CREATE TABLE IF NOT EXISTS public.slip_build_usage (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  usage_date TEXT NOT NULL,
  build_count INTEGER NOT NULL DEFAULT 0,
  last_build_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, usage_date)
);

CREATE INDEX IF NOT EXISTS idx_slip_build_usage_user_date ON public.slip_build_usage (user_id, usage_date);
