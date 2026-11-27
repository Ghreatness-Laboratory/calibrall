-- ====================================================================
-- CALIBRALL: Basketball Sport Schema (Compact Free-Tier Edition)
-- Migration: 20261125000000_basketball_schema.sql
--
-- Scope: NBA, NCAA Men's Division I (NCAAB), EuroLeague.
-- Storage discipline:
--   - All TEXT primary/foreign keys
--   - Game-level and team-level totals only (no play-by-play, no player box)
--   - Compact JSONB for q_scores and provider_ids
--   - Secondary indexes intentionally omitted until DB size is confirmed
--   - RLS matches existing Calibrall tables (public read, service_role write)
-- ====================================================================

BEGIN;

-- ====================================================================
-- 1. BASKETBALL CANONICAL TEAMS (bb_teams)
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.bb_teams (
    id TEXT PRIMARY KEY,
    league TEXT NOT NULL CHECK (league IN ('NBA', 'NCAAB', 'EUROLEAGUE')),
    name TEXT NOT NULL,
    aliases TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    provider_ids JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ====================================================================
-- 2. BASKETBALL GAMES (bb_games)
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.bb_games (
    id TEXT PRIMARY KEY,
    league TEXT NOT NULL CHECK (league IN ('NBA', 'NCAAB', 'EUROLEAGUE')),
    season TEXT NOT NULL,
    game_date DATE NOT NULL,
    kickoff_utc TIMESTAMPTZ,
    home_id TEXT NOT NULL REFERENCES public.bb_teams(id),
    away_id TEXT NOT NULL REFERENCES public.bb_teams(id),
    neutral BOOLEAN NOT NULL DEFAULT FALSE,
    status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'IN_PLAY', 'PAUSED', 'FINISHED', 'POSTPONED', 'CANCELED')),
    home_pts INTEGER,
    away_pts INTEGER,
    h1_home INTEGER,
    h1_away INTEGER,
    ot_periods INTEGER NOT NULL DEFAULT 0,
    q_scores JSONB,
    source TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ====================================================================
-- 3. BASKETBALL PICKS & SETTLEMENTS (bb_picks / bb_settlements)
-- Mirrors football market_predictions / pick_revisions with sport = 'basketball'.
-- Markets ONLY: game_total, home_total, away_total, h1_game_total, h1_team_total.
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.bb_picks (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES public.bb_games(id) ON DELETE CASCADE,
    sport TEXT NOT NULL DEFAULT 'basketball' CHECK (sport = 'basketball'),
    league TEXT NOT NULL CHECK (league IN ('NBA', 'NCAAB', 'EUROLEAGUE')),
    season TEXT NOT NULL,
    market_code TEXT NOT NULL CHECK (
        market_code IN (
            'GAME_TOTAL_OVER',
            'GAME_TOTAL_UNDER',
            'HOME_TOTAL_OVER',
            'HOME_TOTAL_UNDER',
            'AWAY_TOTAL_OVER',
            'AWAY_TOTAL_UNDER',
            'H1_TOTAL_OVER',
            'H1_TOTAL_UNDER',
            'H1_HOME_TOTAL_OVER',
            'H1_HOME_TOTAL_UNDER',
            'H1_AWAY_TOTAL_OVER',
            'H1_AWAY_TOTAL_UNDER'
        )
    ),
    market_category TEXT NOT NULL CHECK (
        market_category IN ('game_total', 'home_total', 'away_total', 'h1_game_total', 'h1_team_total')
    ),
    selection TEXT NOT NULL,
    line NUMERIC(10, 4) NOT NULL,
    projected_mean NUMERIC(10, 4),
    model_probability NUMERIC(7, 6) NOT NULL CHECK (model_probability >= 0 AND model_probability <= 1),
    market_odds NUMERIC(10, 3),
    implied_probability NUMERIC(7, 6),
    expected_value NUMERIC(10, 4),
    model_version TEXT NOT NULL,
    model_confidence TEXT NOT NULL CHECK (model_confidence IN ('VERY_HIGH', 'HIGH', 'MODERATE', 'LOW')),
    qualification_status TEXT NOT NULL CHECK (
        qualification_status IN ('QUALIFIED_VALUE', 'QUALIFIED_PROBABILITY', 'UNQUALIFIED_MARGINAL', 'UNQUALIFIED_HIGH_UNCERTAINTY', 'NO_RECOMMENDATION')
    ),
    is_top_pick BOOLEAN NOT NULL DEFAULT FALSE,
    record_hash TEXT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    kickoff_utc TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.bb_settlements (
    id TEXT PRIMARY KEY,
    pick_id TEXT NOT NULL UNIQUE REFERENCES public.bb_picks(id) ON DELETE CASCADE,
    game_id TEXT NOT NULL REFERENCES public.bb_games(id) ON DELETE CASCADE,
    sport TEXT NOT NULL DEFAULT 'basketball' CHECK (sport = 'basketball'),
    settlement_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (settlement_status IN ('PENDING', 'WON', 'LOST', 'PUSH', 'VOID')),
    actual_value NUMERIC(10, 4),
    actual_score TEXT,
    brier_error NUMERIC(8, 6),
    log_loss NUMERIC(8, 6),
    settled_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ====================================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES (Matches football tables)
-- ====================================================================

ALTER TABLE public.bb_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bb_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bb_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bb_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read bb_teams" ON public.bb_teams;
CREATE POLICY "Public read bb_teams" ON public.bb_teams FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read bb_games" ON public.bb_games;
CREATE POLICY "Public read bb_games" ON public.bb_games FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read bb_picks" ON public.bb_picks;
CREATE POLICY "Public read bb_picks" ON public.bb_picks FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read bb_settlements" ON public.bb_settlements;
CREATE POLICY "Public read bb_settlements" ON public.bb_settlements FOR SELECT USING (true);

DROP POLICY IF EXISTS "Service role write bb_teams" ON public.bb_teams;
CREATE POLICY "Service role write bb_teams" ON public.bb_teams FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role write bb_games" ON public.bb_games;
CREATE POLICY "Service role write bb_games" ON public.bb_games FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role write bb_picks" ON public.bb_picks;
CREATE POLICY "Service role write bb_picks" ON public.bb_picks FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role write bb_settlements" ON public.bb_settlements;
CREATE POLICY "Service role write bb_settlements" ON public.bb_settlements FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ====================================================================
-- 5. AGGREGATE RPC FOR DATA-STATUS COUNTS (Avoids 1,000-row cap)
-- ====================================================================

CREATE OR REPLACE FUNCTION public.get_bb_data_status_aggregates()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    total_games_count INTEGER := 0;
    total_teams_count INTEGER := 0;
    min_date TEXT := NULL;
    max_date TEXT := NULL;
    by_league_season JSONB := '[]'::JSONB;
    by_league JSONB := '[]'::JSONB;
BEGIN
    SELECT
        COUNT(*)::INTEGER,
        MIN(game_date)::TEXT,
        COALESCE(MAX(CASE WHEN status = 'FINISHED' THEN game_date END), MAX(game_date))::TEXT
    INTO total_games_count, min_date, max_date
    FROM public.bb_games;

    SELECT COUNT(*)::INTEGER
    INTO total_teams_count
    FROM public.bb_teams;

    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::JSONB)
    INTO by_league_season
    FROM (
        SELECT
            league,
            season,
            COUNT(*)::INTEGER AS count,
            SUM(CASE WHEN status = 'FINISHED' THEN 1 ELSE 0 END)::INTEGER AS "finishedCount",
            SUM(CASE WHEN h1_home IS NOT NULL AND h1_away IS NOT NULL THEN 1 ELSE 0 END)::INTEGER AS "withHalfScoresCount",
            CASE
                WHEN COUNT(*) > 0 THEN ROUND(
                    (SUM(CASE WHEN h1_home IS NOT NULL AND h1_away IS NOT NULL THEN 1 ELSE 0 END)::NUMERIC * 100.0) / COUNT(*)::NUMERIC,
                    1
                )
                ELSE 0
            END AS "halfScoresPct",
            MIN(game_date)::TEXT AS "earliestDate",
            COALESCE(MAX(CASE WHEN status = 'FINISHED' THEN game_date END), MAX(game_date))::TEXT AS "latestDate"
        FROM public.bb_games
        GROUP BY league, season
        ORDER BY league ASC, season DESC
    ) t;

    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::JSONB)
    INTO by_league
    FROM (
        SELECT
            league,
            COUNT(*)::INTEGER AS count,
            SUM(CASE WHEN status = 'FINISHED' THEN 1 ELSE 0 END)::INTEGER AS "finishedCount",
            SUM(CASE WHEN h1_home IS NOT NULL AND h1_away IS NOT NULL THEN 1 ELSE 0 END)::INTEGER AS "withHalfScoresCount",
            CASE
                WHEN COUNT(*) > 0 THEN ROUND(
                    (SUM(CASE WHEN h1_home IS NOT NULL AND h1_away IS NOT NULL THEN 1 ELSE 0 END)::NUMERIC * 100.0) / COUNT(*)::NUMERIC,
                    1
                )
                ELSE 0
            END AS "halfScoresPct",
            MIN(game_date)::TEXT AS "earliestDate",
            COALESCE(MAX(CASE WHEN status = 'FINISHED' THEN game_date END), MAX(game_date))::TEXT AS "latestDate"
        FROM public.bb_games
        GROUP BY league
        ORDER BY league ASC
    ) t;

    RETURN jsonb_build_object(
        'totalGames', total_games_count,
        'totalTeams', total_teams_count,
        'earliestDate', min_date,
        'latestDate', max_date,
        'gamesPerLeagueAndSeason', by_league_season,
        'leagueSummary', by_league
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_bb_data_status_aggregates()
    TO anon, authenticated, service_role;

COMMIT;
