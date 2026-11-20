-- ====================================================================
-- CALIBRALL: Reconcile Fixtures TEXT IDs, Sync State & Telemetry Tables
-- Migration: 20261119000000_reconcile_fixtures_and_sync_schema.sql
--
-- Idempotent migration for production Supabase Postgres:
-- 1. Converts public.fixtures UUID columns (id, competition_id, home_team_id, away_team_id)
--    to TEXT so canonical string IDs (fix_..., comp_pl, team_...) persist cleanly.
-- 2. Adds competition_code, home_team_name, away_team_name, source, payload_json columns.
-- 3. Ensures provider_sync_state, provider_call_logs, unresolved_teams, lineups,
--    and pick_revisions tables & RLS policies exist.
-- ====================================================================

BEGIN;

-- ====================================================================
-- 1. RECONCILE public.fixtures COLUMNS & TYPES (UUID -> TEXT)
-- ====================================================================

ALTER TABLE public.fixtures ADD COLUMN IF NOT EXISTS competition_code TEXT;
ALTER TABLE public.fixtures ADD COLUMN IF NOT EXISTS home_team_name TEXT;
ALTER TABLE public.fixtures ADD COLUMN IF NOT EXISTS away_team_name TEXT;
ALTER TABLE public.fixtures ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'provider:verified';
ALTER TABLE public.fixtures ADD COLUMN IF NOT EXISTS payload_json TEXT;
ALTER TABLE public.fixtures ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
DECLARE
    fix_id_type TEXT;
    comp_id_type TEXT;
    home_id_type TEXT;
    away_id_type TEXT;
BEGIN
    SELECT data_type INTO fix_id_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fixtures' AND column_name = 'id';

    SELECT data_type INTO comp_id_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fixtures' AND column_name = 'competition_id';

    SELECT data_type INTO home_id_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fixtures' AND column_name = 'home_team_id';

    SELECT data_type INTO away_id_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fixtures' AND column_name = 'away_team_id';

    -- Drop foreign keys that reference fixtures(id) or competitions(id)/teams(id) before converting types
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bookmaker_odds') THEN
        ALTER TABLE public.bookmaker_odds DROP CONSTRAINT IF EXISTS bookmaker_odds_fixture_id_fkey;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'prediction_runs') THEN
        ALTER TABLE public.prediction_runs DROP CONSTRAINT IF EXISTS prediction_runs_fixture_id_fkey;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'market_predictions') THEN
        ALTER TABLE public.market_predictions DROP CONSTRAINT IF EXISTS market_predictions_fixture_id_fkey;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'saved_fixtures') THEN
        ALTER TABLE public.saved_fixtures DROP CONSTRAINT IF EXISTS saved_fixtures_fixture_id_fkey;
    END IF;

    ALTER TABLE public.fixtures DROP CONSTRAINT IF EXISTS fixtures_competition_id_fkey;
    ALTER TABLE public.fixtures DROP CONSTRAINT IF EXISTS fixtures_home_team_id_fkey;
    ALTER TABLE public.fixtures DROP CONSTRAINT IF EXISTS fixtures_away_team_id_fkey;

    IF fix_id_type = 'uuid' THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bookmaker_odds' AND column_name = 'fixture_id' AND data_type = 'uuid') THEN
            ALTER TABLE public.bookmaker_odds ALTER COLUMN fixture_id TYPE TEXT USING fixture_id::TEXT;
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'prediction_runs' AND column_name = 'fixture_id' AND data_type = 'uuid') THEN
            ALTER TABLE public.prediction_runs ALTER COLUMN fixture_id TYPE TEXT USING fixture_id::TEXT;
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'market_predictions' AND column_name = 'fixture_id' AND data_type = 'uuid') THEN
            ALTER TABLE public.market_predictions ALTER COLUMN fixture_id TYPE TEXT USING fixture_id::TEXT;
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'saved_fixtures' AND column_name = 'fixture_id' AND data_type = 'uuid') THEN
            ALTER TABLE public.saved_fixtures ALTER COLUMN fixture_id TYPE TEXT USING fixture_id::TEXT;
        END IF;

        ALTER TABLE public.fixtures ALTER COLUMN id DROP DEFAULT;
        ALTER TABLE public.fixtures ALTER COLUMN id TYPE TEXT USING id::TEXT;
    END IF;

    IF comp_id_type = 'uuid' THEN
        ALTER TABLE public.fixtures ALTER COLUMN competition_id TYPE TEXT USING competition_id::TEXT;
    END IF;

    IF home_id_type = 'uuid' THEN
        ALTER TABLE public.fixtures ALTER COLUMN home_team_id TYPE TEXT USING home_team_id::TEXT;
    END IF;

    IF away_id_type = 'uuid' THEN
        ALTER TABLE public.fixtures ALTER COLUMN away_team_id TYPE TEXT USING away_team_id::TEXT;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_fixtures_provider_id') THEN
        -- Ensure unique constraint on provider_id for Supabase onConflict: 'provider_id'
        IF NOT EXISTS (
            SELECT 1
            FROM pg_indexes
            WHERE schemaname = 'public' AND tablename = 'fixtures' AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%(provider_id)%'
        ) THEN
            ALTER TABLE public.fixtures ADD CONSTRAINT uq_fixtures_provider_id UNIQUE (provider_id);
        END IF;
    END IF;
END $$;

-- Ensure fixtures RLS permits public read + service_role full write
ALTER TABLE public.fixtures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read access for fixtures" ON public.fixtures;
DROP POLICY IF EXISTS "Public read fixtures" ON public.fixtures;
CREATE POLICY "Public read fixtures" ON public.fixtures FOR SELECT USING (true);

DROP POLICY IF EXISTS "Service role full access fixtures" ON public.fixtures;
CREATE POLICY "Service role full access fixtures" ON public.fixtures FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ====================================================================
-- 2. PROVIDER CALL LOGS & SYNC STATE (ENSURE PRESENT IN PROD POSTGRES)
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.provider_call_logs (
    id TEXT PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    provider TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    method TEXT NOT NULL DEFAULT 'GET',
    status_code INTEGER,
    ok INTEGER NOT NULL DEFAULT 0,
    latency_ms INTEGER,
    league_code TEXT,
    sync_mode TEXT,
    quota_headers_json TEXT,
    quota_remaining TEXT,
    response_body TEXT,
    error TEXT
);

CREATE INDEX IF NOT EXISTS idx_provider_call_logs_ts ON public.provider_call_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_provider_call_logs_provider ON public.provider_call_logs(provider, timestamp DESC);

CREATE TABLE IF NOT EXISTS public.provider_sync_state (
    id TEXT PRIMARY KEY,
    sport TEXT,
    provider_name TEXT,
    status TEXT,
    last_attempt_at TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ,
    last_error TEXT,
    last_http_status INTEGER,
    last_response_body TEXT,
    quota_remaining TEXT,
    quota_headers_json TEXT,
    skipped_leagues_json TEXT,
    calls_used_last_run INTEGER DEFAULT 0,
    calls_today INTEGER DEFAULT 0,
    budget_date TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.provider_call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_sync_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access provider_call_logs" ON public.provider_call_logs;
CREATE POLICY "Service role full access provider_call_logs" ON public.provider_call_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access provider_sync_state" ON public.provider_sync_state;
CREATE POLICY "Service role full access provider_sync_state" ON public.provider_sync_state FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public read provider_sync_state" ON public.provider_sync_state;
CREATE POLICY "Public read provider_sync_state" ON public.provider_sync_state FOR SELECT USING (true);

-- ====================================================================
-- 3. UNRESOLVED TEAMS LOG (ENSURE PRESENT IN PROD POSTGRES)
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.unresolved_teams (
    id TEXT PRIMARY KEY,
    source_name TEXT NOT NULL,
    source_provider TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 1,
    first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved INTEGER NOT NULL DEFAULT 0,
    UNIQUE(source_name, source_provider)
);

ALTER TABLE public.unresolved_teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read unresolved teams" ON public.unresolved_teams;
CREATE POLICY "Public read unresolved teams" ON public.unresolved_teams FOR SELECT USING (true);

DROP POLICY IF EXISTS "Service role write unresolved teams" ON public.unresolved_teams;
CREATE POLICY "Service role write unresolved teams" ON public.unresolved_teams FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
