-- ====================================================================
-- MATCHMIND / CALIBRALL: Database Cleanup & Provenance Migration
-- Migration: 20261025000000_clean_fake_fixtures_add_source.sql
-- 
-- Requirement 6:
-- 1. Add `source` column to fixtures, picks (market_predictions), and odds (bookmaker_odds).
-- 2. Back up existing tables before executing deletion.
-- 3. Delete rows with no provider_id (or where is_demo = TRUE) from fixtures.
-- 4. Delete predictions, odds, and runs generated from those deleted fixtures.
-- ====================================================================

-- 1. ADD SOURCE COLUMNS (Idempotent)
DO $$
BEGIN
    -- fixtures.source
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'fixtures' AND column_name = 'source'
    ) THEN
        ALTER TABLE public.fixtures ADD COLUMN source TEXT DEFAULT 'provider:verified';
    END IF;

    -- bookmaker_odds.source
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'bookmaker_odds' AND column_name = 'source'
    ) THEN
        ALTER TABLE public.bookmaker_odds ADD COLUMN source TEXT DEFAULT 'provider:snapshot';
    END IF;

    -- market_predictions.source
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'market_predictions' AND column_name = 'source'
    ) THEN
        ALTER TABLE public.market_predictions ADD COLUMN source TEXT DEFAULT 'engine:dixon_coles_v25';
    END IF;

    -- dixon_coles_v25_predictions.source
    IF EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'dixon_coles_v25_predictions'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'dixon_coles_v25_predictions' AND column_name = 'source'
    ) THEN
        ALTER TABLE public.dixon_coles_v25_predictions ADD COLUMN source TEXT DEFAULT 'engine:dixon_coles_v25';
    END IF;
END $$;

-- 2. CREATE BACKUP TABLES BEFORE DELETION
CREATE TABLE IF NOT EXISTS public.fixtures_backup_20261025 AS
SELECT * FROM public.fixtures;

CREATE TABLE IF NOT EXISTS public.bookmaker_odds_backup_20261025 AS
SELECT * FROM public.bookmaker_odds;

CREATE TABLE IF NOT EXISTS public.market_predictions_backup_20261025 AS
SELECT * FROM public.market_predictions;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'dixon_coles_v25_predictions') THEN
        CREATE TABLE IF NOT EXISTS public.dixon_coles_v25_predictions_backup_20261025 AS
        SELECT * FROM public.dixon_coles_v25_predictions;
    END IF;
END $$;

-- 3. AUDIT & LOG ROWS TO BE DELETED
DO $$
DECLARE
    fake_fixtures_count INT;
BEGIN
    SELECT COUNT(*) INTO fake_fixtures_count
    FROM public.fixtures
    WHERE provider_id IS NULL OR provider_id = '' OR is_demo = TRUE;
    
    RAISE NOTICE '[CALIBRALL DB CLEANUP] Found % fake/mock/demo fixtures without provider_id to be purged.', fake_fixtures_count;
END $$;

-- 4. DELETE PREDICTIONS GENERATED FROM SYNTHETIC/MISSING-PROVIDER FIXTURES
DELETE FROM public.prediction_explanations
WHERE prediction_id IN (
    SELECT mp.id FROM public.market_predictions mp
    JOIN public.fixtures f ON mp.fixture_id = f.id
    WHERE f.provider_id IS NULL OR f.provider_id = '' OR f.is_demo = TRUE
);

DELETE FROM public.prediction_factor_contributions
WHERE prediction_id IN (
    SELECT mp.id FROM public.market_predictions mp
    JOIN public.fixtures f ON mp.fixture_id = f.id
    WHERE f.provider_id IS NULL OR f.provider_id = '' OR f.is_demo = TRUE
);

DELETE FROM public.market_predictions
WHERE fixture_id IN (
    SELECT id FROM public.fixtures
    WHERE provider_id IS NULL OR provider_id = '' OR is_demo = TRUE
);

DELETE FROM public.prediction_runs
WHERE fixture_id IN (
    SELECT id FROM public.fixtures
    WHERE provider_id IS NULL OR provider_id = '' OR is_demo = TRUE
);

-- Delete from Dixon Coles v2.5 tables if present
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'dixon_coles_v25_predictions') THEN
        DELETE FROM public.dixon_coles_v25_predictions
        WHERE fixture_id IN (
            SELECT id::text FROM public.fixtures WHERE provider_id IS NULL OR provider_id = '' OR is_demo = TRUE
        ) OR fixture_id LIKE 'demo_%' OR fixture_id LIKE 'mock_%';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'dixon_coles_v25_features') THEN
        DELETE FROM public.dixon_coles_v25_features
        WHERE fixture_id IN (
            SELECT id::text FROM public.fixtures WHERE provider_id IS NULL OR provider_id = '' OR is_demo = TRUE
        ) OR fixture_id LIKE 'demo_%' OR fixture_id LIKE 'mock_%';
    END IF;
END $$;

-- 5. DELETE ODDS FROM SYNTHETIC/MISSING-PROVIDER FIXTURES
DELETE FROM public.bookmaker_odds
WHERE fixture_id IN (
    SELECT id FROM public.fixtures
    WHERE provider_id IS NULL OR provider_id = '' OR is_demo = TRUE
);

-- 6. DELETE SAVED FIXTURES REFERENCES
DELETE FROM public.saved_fixtures
WHERE fixture_id IN (
    SELECT id FROM public.fixtures
    WHERE provider_id IS NULL OR provider_id = '' OR is_demo = TRUE
);

-- 7. PURGE THE SYNTHETIC FIXTURES THEMSELVES
DELETE FROM public.fixtures
WHERE provider_id IS NULL OR provider_id = '' OR is_demo = TRUE;

-- 8. ADD CONSTRAINT: Reject future fixtures with NULL or blank provider_id in production
ALTER TABLE public.fixtures
    ALTER COLUMN provider_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fixtures_provider_id ON public.fixtures(provider_id);
CREATE INDEX IF NOT EXISTS idx_fixtures_source ON public.fixtures(source);
CREATE INDEX IF NOT EXISTS idx_odds_source ON public.bookmaker_odds(source);
CREATE INDEX IF NOT EXISTS idx_predictions_source ON public.market_predictions(source);
