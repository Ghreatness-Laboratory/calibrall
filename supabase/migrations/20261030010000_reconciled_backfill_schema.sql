-- ====================================================================
-- CALIBRALL: Reconciled Database Migration (Idempotent & Single-Transaction)
-- Migration: 20261030010000_reconciled_backfill_schema.sql
--
-- Reconciles the initial 20261021 matchmind schema with historical backfill,
-- canonical teams, aliases, nullable dates, and pre-kickoff odds constraints.
-- Safe to run on empty databases or existing populated production databases.
-- ====================================================================

BEGIN;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ====================================================================
-- SECTION 1: SAFELY ALIGN TEAMS & TYPE CONVERSIONS (UUID -> TEXT)
-- ====================================================================

-- 1. Create teams table if it does not exist
CREATE TABLE IF NOT EXISTS public.teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    short_name TEXT,
    tla VARCHAR(4),
    crest_url TEXT,
    competition_code TEXT,
    attack_rating NUMERIC(5, 3),
    defense_rating NUMERIC(5, 3),
    corner_attack_rating NUMERIC(5, 3),
    discipline_rating NUMERIC(5, 3),
    sample_matches INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Add missing columns if teams was created by the earlier 20261021 schema
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS competition_code TEXT;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS sample_matches INTEGER;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS short_name TEXT;

-- 3. If teams already had rows from 20261021 with competition_id, populate competition_code
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'teams' AND column_name = 'competition_id'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'competitions'
    ) THEN
        UPDATE public.teams t
        SET competition_code = c.code
        FROM public.competitions c
        WHERE t.competition_id = c.id AND (t.competition_code IS NULL OR t.competition_code = '');
    END IF;
END $$;

-- 4. Safely convert teams.id and foreign keys from UUID to TEXT if needed (preserves all data)
DO $$
DECLARE
    team_id_type TEXT;
BEGIN
    SELECT data_type INTO team_id_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'teams' AND column_name = 'id';

    IF team_id_type = 'uuid' THEN
        -- Temporarily drop FK constraints from fixtures referencing teams(id)
        ALTER TABLE public.fixtures DROP CONSTRAINT IF EXISTS fixtures_home_team_id_fkey;
        ALTER TABLE public.fixtures DROP CONSTRAINT IF EXISTS fixtures_away_team_id_fkey;
        
        -- Convert fixtures foreign key columns to TEXT
        ALTER TABLE public.fixtures ALTER COLUMN home_team_id TYPE TEXT USING home_team_id::TEXT;
        ALTER TABLE public.fixtures ALTER COLUMN away_team_id TYPE TEXT USING away_team_id::TEXT;

        -- Convert teams.id to TEXT and drop UUID default generator
        ALTER TABLE public.teams ALTER COLUMN id DROP DEFAULT;
        ALTER TABLE public.teams ALTER COLUMN id TYPE TEXT USING id::TEXT;

        -- Restore FK constraints on fixtures referencing teams(id)
        ALTER TABLE public.fixtures ADD CONSTRAINT fixtures_home_team_id_fkey 
            FOREIGN KEY (home_team_id) REFERENCES public.teams(id) ON DELETE CASCADE;
        ALTER TABLE public.fixtures ADD CONSTRAINT fixtures_away_team_id_fkey 
            FOREIGN KEY (away_team_id) REFERENCES public.teams(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 5. Drop default ratings and sample_matches (leave null until computed from stored matches)
ALTER TABLE public.teams ALTER COLUMN attack_rating DROP DEFAULT;
ALTER TABLE public.teams ALTER COLUMN defense_rating DROP DEFAULT;
ALTER TABLE public.teams ALTER COLUMN corner_attack_rating DROP DEFAULT;
ALTER TABLE public.teams ALTER COLUMN discipline_rating DROP DEFAULT;
ALTER TABLE public.teams ALTER COLUMN sample_matches DROP DEFAULT;

-- 6. Indexes on teams
CREATE INDEX IF NOT EXISTS idx_teams_competition ON public.teams(competition_code);
CREATE INDEX IF NOT EXISTS idx_teams_short_name ON public.teams(short_name);


-- ====================================================================
-- SECTION 2: TEAM ALIASES TABLE (MAPPING PROVIDER NAMES TO CANONICAL TEAMS)
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.team_aliases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id TEXT NOT NULL,
    alias TEXT NOT NULL,
    source TEXT DEFAULT 'manual',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Guarded Foreign Key to teams(id)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_team_aliases_team'
    ) THEN
        ALTER TABLE public.team_aliases
            ADD CONSTRAINT fk_team_aliases_team
            FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Guarded Unique Constraint on (team_id, alias)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_team_aliases_team_id_alias'
    ) THEN
        ALTER TABLE public.team_aliases
            ADD CONSTRAINT uq_team_aliases_team_id_alias
            UNIQUE (team_id, alias);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_team_aliases_team_id ON public.team_aliases(team_id);
CREATE INDEX IF NOT EXISTS idx_team_aliases_alias_lower ON public.team_aliases(LOWER(alias));


-- ====================================================================
-- SECTION 3: RECONCILED MATCHES TABLE
-- ====================================================================

-- 1. Create matches table if it does not exist
CREATE TABLE IF NOT EXISTS public.matches (
    id TEXT PRIMARY KEY,
    provider_id TEXT UNIQUE NOT NULL,
    competition_code TEXT NOT NULL,
    season TEXT NOT NULL,
    matchday INTEGER,
    home_team_id TEXT NOT NULL,
    away_team_id TEXT NOT NULL,
    home_team_name TEXT NOT NULL,
    away_team_name TEXT NOT NULL,
    kickoff_time TIMESTAMPTZ,
    kickoff_date DATE,
    status TEXT NOT NULL DEFAULT 'FINISHED',
    home_score INTEGER,
    away_score INTEGER,
    home_half_time_score INTEGER,
    away_half_time_score INTEGER,
    home_corners INTEGER,
    away_corners INTEGER,
    home_yellow_cards INTEGER,
    away_yellow_cards INTEGER,
    home_red_cards INTEGER,
    away_red_cards INTEGER,
    home_shots INTEGER,
    away_shots INTEGER,
    home_shots_on_target INTEGER,
    away_shots_on_target INTEGER,
    source TEXT NOT NULL DEFAULT 'football-data.co.uk',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Add all potentially missing columns to matches
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS provider_id TEXT;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS competition_code TEXT;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS season TEXT;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS matchday INTEGER;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS home_team_id TEXT;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS away_team_id TEXT;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS home_team_name TEXT;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS away_team_name TEXT;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS kickoff_time TIMESTAMPTZ;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS kickoff_date DATE;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'FINISHED';
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS home_score INTEGER;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS away_score INTEGER;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS home_half_time_score INTEGER;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS away_half_time_score INTEGER;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS home_corners INTEGER;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS away_corners INTEGER;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS home_yellow_cards INTEGER;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS away_yellow_cards INTEGER;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS home_red_cards INTEGER;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS away_red_cards INTEGER;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS home_shots INTEGER;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS away_shots INTEGER;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS home_shots_on_target INTEGER;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS away_shots_on_target INTEGER;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'football-data.co.uk';
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 3. Ensure kickoff_time is nullable (for Brazil / missing time rows)
ALTER TABLE public.matches ALTER COLUMN kickoff_time DROP NOT NULL;

-- 4. Safely convert matches ID columns to TEXT if UUID
DO $$
DECLARE
    match_id_type TEXT;
BEGIN
    SELECT data_type INTO match_id_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'matches' AND column_name = 'id';

    IF match_id_type = 'uuid' THEN
        ALTER TABLE public.matches ALTER COLUMN id DROP DEFAULT;
        ALTER TABLE public.matches ALTER COLUMN id TYPE TEXT USING id::TEXT;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'matches' AND column_name = 'home_team_id') THEN
        ALTER TABLE public.matches ALTER COLUMN home_team_id TYPE TEXT USING home_team_id::TEXT;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'matches' AND column_name = 'away_team_id') THEN
        ALTER TABLE public.matches ALTER COLUMN away_team_id TYPE TEXT USING away_team_id::TEXT;
    END IF;
END $$;

-- 5. Backfill kickoff_date from kickoff_time if null
UPDATE public.matches
SET kickoff_date = (kickoff_time AT TIME ZONE 'UTC')::DATE
WHERE kickoff_date IS NULL AND kickoff_time IS NOT NULL;

-- 6. Guarded foreign keys for matches
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_matches_home_team') THEN
        ALTER TABLE public.matches
            ADD CONSTRAINT fk_matches_home_team
            FOREIGN KEY (home_team_id) REFERENCES public.teams(id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_matches_away_team') THEN
        ALTER TABLE public.matches
            ADD CONSTRAINT fk_matches_away_team
            FOREIGN KEY (away_team_id) REFERENCES public.teams(id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_matches_status') THEN
        ALTER TABLE public.matches
            ADD CONSTRAINT chk_matches_status
            CHECK (status IN ('SCHEDULED', 'TIMED', 'IN_PLAY', 'PAUSED', 'FINISHED', 'POSTPONED', 'CANCELED'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_matches_provider_id') THEN
        ALTER TABLE public.matches
            ADD CONSTRAINT uq_matches_provider_id
            UNIQUE (provider_id);
    END IF;
END $$;

-- 7. Indexes on matches
CREATE INDEX IF NOT EXISTS idx_matches_comp_season ON public.matches(competition_code, season);
CREATE INDEX IF NOT EXISTS idx_matches_home_team ON public.matches(home_team_id);
CREATE INDEX IF NOT EXISTS idx_matches_away_team ON public.matches(away_team_id);
CREATE INDEX IF NOT EXISTS idx_matches_kickoff ON public.matches(kickoff_time);
CREATE INDEX IF NOT EXISTS idx_matches_kickoff_date ON public.matches(kickoff_date);
CREATE INDEX IF NOT EXISTS idx_matches_status ON public.matches(status);


-- ====================================================================
-- SECTION 4: ODDS SNAPSHOTS TABLE & UNIQUE UPSERT CONSTRAINTS
-- ====================================================================

-- 1. Create odds_snapshots table if it does not exist
CREATE TABLE IF NOT EXISTS public.odds_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id TEXT NOT NULL,
    bookmaker TEXT NOT NULL,
    market_code TEXT NOT NULL,
    selection TEXT NOT NULL,
    decimal_odds NUMERIC(8, 4) NOT NULL,
    implied_probability NUMERIC(5, 4) GENERATED ALWAYS AS (ROUND((1.0 / decimal_odds), 4)) STORED,
    observed_at TIMESTAMPTZ,
    snapshot_type TEXT NOT NULL DEFAULT 'csv_pre_match',
    source TEXT DEFAULT 'football-data.co.uk'
);

-- 2. Add missing columns to odds_snapshots
ALTER TABLE public.odds_snapshots ADD COLUMN IF NOT EXISTS snapshot_type TEXT NOT NULL DEFAULT 'csv_pre_match';
ALTER TABLE public.odds_snapshots ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'football-data.co.uk';

-- 3. If match_id is UUID, convert to TEXT to match matches(id)
DO $$
DECLARE
    match_id_col_type TEXT;
BEGIN
    SELECT data_type INTO match_id_col_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'odds_snapshots' AND column_name = 'match_id';

    IF match_id_col_type = 'uuid' THEN
        ALTER TABLE public.odds_snapshots ALTER COLUMN match_id TYPE TEXT USING match_id::TEXT;
    END IF;
END $$;

-- 4. observed_at is nullable and has NO default (avoids invented now() timestamps)
ALTER TABLE public.odds_snapshots ALTER COLUMN observed_at DROP NOT NULL;
ALTER TABLE public.odds_snapshots ALTER COLUMN observed_at DROP DEFAULT;

-- 5. Guarded constraints on odds_snapshots
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_odds_snapshots_match') THEN
        ALTER TABLE public.odds_snapshots
            ADD CONSTRAINT fk_odds_snapshots_match
            FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_odds_snapshots_decimal_odds') THEN
        ALTER TABLE public.odds_snapshots
            ADD CONSTRAINT chk_odds_snapshots_decimal_odds
            CHECK (decimal_odds >= 1.01);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_odds_snapshots_snapshot_type') THEN
        ALTER TABLE public.odds_snapshots
            ADD CONSTRAINT chk_odds_snapshots_snapshot_type
            CHECK (snapshot_type IN ('csv_pre_match', 'csv_closing', 'live_pre_kickoff', 'live_in_play'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_odds_snapshots_match_bookmaker_market_source') THEN
        ALTER TABLE public.odds_snapshots
            ADD CONSTRAINT uq_odds_snapshots_match_bookmaker_market_source 
            UNIQUE (match_id, bookmaker, market_code, source);
    END IF;
END $$;

-- 6. Indexes on odds_snapshots
CREATE INDEX IF NOT EXISTS idx_odds_snapshots_match ON public.odds_snapshots(match_id);
CREATE INDEX IF NOT EXISTS idx_odds_snapshots_market ON public.odds_snapshots(market_code);
CREATE INDEX IF NOT EXISTS idx_odds_snapshots_snapshot_type ON public.odds_snapshots(snapshot_type);


-- ====================================================================
-- SECTION 5: IDEMPOTENT ROW LEVEL SECURITY (RLS) POLICIES
-- ====================================================================

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.odds_snapshots ENABLE ROW LEVEL SECURITY;

-- 1. Public Read Policies (Drop before create for rerunnable idempotency)
DROP POLICY IF EXISTS "Public read teams" ON public.teams;
CREATE POLICY "Public read teams" ON public.teams FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read aliases" ON public.team_aliases;
CREATE POLICY "Public read aliases" ON public.team_aliases FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read matches" ON public.matches;
CREATE POLICY "Public read matches" ON public.matches FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read odds snapshots" ON public.odds_snapshots;
CREATE POLICY "Public read odds snapshots" ON public.odds_snapshots FOR SELECT USING (true);

-- 2. Service Role Write Policies (For Admin Backfill & Ingestion Pipelines)
DROP POLICY IF EXISTS "Service role write teams" ON public.teams;
CREATE POLICY "Service role write teams" ON public.teams FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role write aliases" ON public.team_aliases;
CREATE POLICY "Service role write aliases" ON public.team_aliases FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role write matches" ON public.matches;
CREATE POLICY "Service role write matches" ON public.matches FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role write odds snapshots" ON public.odds_snapshots;
CREATE POLICY "Service role write odds snapshots" ON public.odds_snapshots FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
