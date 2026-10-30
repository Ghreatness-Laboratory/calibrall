-- ====================================================================
-- CALIBRALL: Odds Unique Constraint, Snapshot Type & Null Ratings Migration
-- Migration: 20261030000000_odds_unique_and_snapshot_type.sql
-- ====================================================================

-- 1. Add snapshot_type to odds_snapshots and adjust observed_at
ALTER TABLE public.odds_snapshots 
    ADD COLUMN IF NOT EXISTS snapshot_type TEXT NOT NULL DEFAULT 'csv_pre_match' 
    CHECK (snapshot_type IN ('csv_pre_match', 'csv_closing', 'live_pre_kickoff', 'live_in_play'));

-- Make observed_at nullable and remove default now()
ALTER TABLE public.odds_snapshots ALTER COLUMN observed_at DROP NOT NULL;
ALTER TABLE public.odds_snapshots ALTER COLUMN observed_at DROP DEFAULT;

-- 2. Add Unique Constraint on (match_id, bookmaker, market_code, source) for idempotent upsert
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_odds_snapshots_match_bookmaker_market_source'
    ) THEN
        ALTER TABLE public.odds_snapshots
            ADD CONSTRAINT uq_odds_snapshots_match_bookmaker_market_source 
            UNIQUE (match_id, bookmaker, market_code, source);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_odds_snapshots_snapshot_type ON public.odds_snapshots(snapshot_type);

-- 3. Ensure teams columns allow NULLs for ratings and sample_matches until computed
ALTER TABLE public.teams ALTER COLUMN attack_rating DROP DEFAULT;
ALTER TABLE public.teams ALTER COLUMN defense_rating DROP DEFAULT;
ALTER TABLE public.teams ALTER COLUMN corner_attack_rating DROP DEFAULT;
ALTER TABLE public.teams ALTER COLUMN discipline_rating DROP DEFAULT;
ALTER TABLE public.teams ALTER COLUMN sample_matches DROP DEFAULT;
