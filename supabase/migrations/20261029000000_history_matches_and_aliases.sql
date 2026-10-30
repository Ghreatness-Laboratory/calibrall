-- ====================================================================
-- CALIBRALL: Historical Matches, Canonical Teams, Aliases & Odds Snapshots
-- Migration: 20261029000000_history_matches_and_aliases.sql
-- ====================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. CANONICAL TEAMS TABLE
CREATE TABLE IF NOT EXISTS public.teams (
    id TEXT PRIMARY KEY, -- e.g. 'team_fiorentina', 'team_lecce', 'team_mineiro', 'team_cruzeiro'
    name TEXT NOT NULL,
    short_name TEXT NOT NULL,
    tla VARCHAR(4),
    crest_url TEXT,
    competition_code TEXT NOT NULL,
    attack_rating NUMERIC(5, 3) DEFAULT 1.000,
    defense_rating NUMERIC(5, 3) DEFAULT 1.000,
    corner_attack_rating NUMERIC(5, 3) DEFAULT 1.000,
    discipline_rating NUMERIC(5, 3) DEFAULT 1.000,
    sample_matches INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teams_competition ON public.teams(competition_code);
CREATE INDEX IF NOT EXISTS idx_teams_short_name ON public.teams(short_name);

-- 2. TEAM ALIASES TABLE
CREATE TABLE IF NOT EXISTS public.team_aliases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id TEXT NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    alias TEXT NOT NULL,
    source TEXT DEFAULT 'manual', -- 'football-data.co.uk', 'football-data.org', 'espn', 'manual'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(team_id, alias)
);

CREATE INDEX IF NOT EXISTS idx_team_aliases_team_id ON public.team_aliases(team_id);
CREATE INDEX IF NOT EXISTS idx_team_aliases_alias_lower ON public.team_aliases(LOWER(alias));

-- 3. HISTORICAL & LIVE MATCHES TABLE
CREATE TABLE IF NOT EXISTS public.matches (
    id TEXT PRIMARY KEY, -- provider id or unique slug, e.g. 'fd_123456' or 'fdco_sa_2425_170824_parma_fiorentina'
    provider_id TEXT UNIQUE NOT NULL,
    competition_code TEXT NOT NULL,
    season TEXT NOT NULL, -- e.g. '2425', '2324', '2024'
    matchday INTEGER,
    home_team_id TEXT NOT NULL REFERENCES public.teams(id),
    away_team_id TEXT NOT NULL REFERENCES public.teams(id),
    home_team_name TEXT NOT NULL,
    away_team_name TEXT NOT NULL,
    kickoff_time TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'FINISHED' CHECK (status IN ('SCHEDULED', 'TIMED', 'IN_PLAY', 'PAUSED', 'FINISHED', 'POSTPONED', 'CANCELED')),
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
    source TEXT NOT NULL DEFAULT 'football-data.co.uk', -- 'football-data.co.uk', 'football-data.org', 'provider:verified'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_matches_comp_season ON public.matches(competition_code, season);
CREATE INDEX IF NOT EXISTS idx_matches_home_team ON public.matches(home_team_id);
CREATE INDEX IF NOT EXISTS idx_matches_away_team ON public.matches(away_team_id);
CREATE INDEX IF NOT EXISTS idx_matches_kickoff ON public.matches(kickoff_time);
CREATE INDEX IF NOT EXISTS idx_matches_status ON public.matches(status);

-- 4. ODDS SNAPSHOTS TABLE
CREATE TABLE IF NOT EXISTS public.odds_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id TEXT NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
    bookmaker TEXT NOT NULL, -- e.g. 'Bet365', 'Pinnacle', 'MarketAvg'
    market_code TEXT NOT NULL, -- e.g. '1X2_HOME', '1X2_DRAW', '1X2_AWAY', 'TOTAL_GOALS_O25', 'TOTAL_GOALS_U25'
    selection TEXT NOT NULL,
    decimal_odds NUMERIC(8, 4) NOT NULL CHECK (decimal_odds >= 1.01),
    implied_probability NUMERIC(5, 4) GENERATED ALWAYS AS (ROUND((1.0 / decimal_odds), 4)) STORED,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source TEXT DEFAULT 'football-data.co.uk'
);

CREATE INDEX IF NOT EXISTS idx_odds_snapshots_match ON public.odds_snapshots(match_id);
CREATE INDEX IF NOT EXISTS idx_odds_snapshots_market ON public.odds_snapshots(market_code);

-- 5. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.odds_snapshots ENABLE ROW LEVEL SECURITY;

-- Public read access for client applications
CREATE POLICY "Public read teams" ON public.teams FOR SELECT USING (true);
CREATE POLICY "Public read aliases" ON public.team_aliases FOR SELECT USING (true);
CREATE POLICY "Public read matches" ON public.matches FOR SELECT USING (true);
CREATE POLICY "Public read odds snapshots" ON public.odds_snapshots FOR SELECT USING (true);

-- Service role write access for admin backfill and ingestion pipeline
CREATE POLICY "Service role write teams" ON public.teams FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role write aliases" ON public.team_aliases FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role write matches" ON public.matches FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role write odds snapshots" ON public.odds_snapshots FOR ALL TO service_role USING (true) WITH CHECK (true);
