-- ====================================================================
-- CALIBRALL: Auth Profiles, Sign-Up Trigger, Privilege Protection & Full RLS Audit
-- Migration: 20261126000000_auth_profiles_and_rls_hardening.sql
-- ====================================================================

-- 1. PROFILES TABLE (Exact schema + safe reconciliation if legacy columns exist)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    display_name TEXT,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'premium')),
    tier_expires_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS email TEXT,
    ADD COLUMN IF NOT EXISTS display_name TEXT,
    ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user',
    ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'free',
    ADD COLUMN IF NOT EXISTS tier_expires_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Reconcile legacy column values if migrating from 20261021000000_matchmind_schema.sql
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'full_name'
    ) THEN
        EXECUTE 'UPDATE public.profiles SET display_name = COALESCE(display_name, full_name) WHERE display_name IS NULL';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'subscription_tier'
    ) THEN
        EXECUTE 'UPDATE public.profiles SET tier = COALESCE(NULLIF(subscription_tier, ''''), ''free'') WHERE tier = ''free''';
    END IF;
END $$;

UPDATE public.profiles SET role = 'user' WHERE role IS NULL OR role NOT IN ('user', 'admin');
UPDATE public.profiles SET tier = 'free' WHERE tier IS NULL OR tier NOT IN ('free', 'pro', 'premium');

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('user', 'admin'));

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_tier_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_tier_check CHECK (tier IN ('free', 'pro', 'premium'));

CREATE INDEX IF NOT EXISTS idx_profiles_email_lower ON public.profiles (LOWER(email));

-- 2. AUTH SIGN-UP TRIGGER: auto-create profile with role='user', tier='free'
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    initial_name TEXT;
BEGIN
    initial_name := COALESCE(
        NULLIF(TRIM(NEW.raw_user_meta_data ->> 'display_name'), ''),
        NULLIF(TRIM(NEW.raw_user_meta_data ->> 'full_name'), ''),
        NULLIF(TRIM(NEW.raw_user_meta_data ->> 'name'), ''),
        NULLIF(SPLIT_PART(COALESCE(NEW.email, ''), '@', 1), '')
    );

    INSERT INTO public.profiles (id, email, display_name, role, tier, tier_expires_at, created_at)
    VALUES (NEW.id, NEW.email, initial_name, 'user', 'free', NULL, COALESCE(NEW.created_at, NOW()))
    ON CONFLICT (id) DO UPDATE
    SET email = COALESCE(public.profiles.email, EXCLUDED.email),
        display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name);

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- 3. PRIVILEGED COLUMN GUARD TRIGGER ON PROFILES
-- Only service_role (or superuser SQL) can change role, tier, tier_expires_at, id, or email.
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    jwt_role TEXT;
BEGIN
    jwt_role := COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), '');

    -- Allow direct SQL editor / postgres / supabase_admin / service_role updates
    IF current_user IN ('postgres', 'supabase_admin', 'service_role') OR jwt_role = 'service_role' THEN
        RETURN NEW;
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id THEN
        RAISE EXCEPTION 'Cannot modify profile id';
    END IF;
    IF NEW.email IS DISTINCT FROM OLD.email THEN
        RAISE EXCEPTION 'Cannot modify email directly';
    END IF;
    IF NEW.role IS DISTINCT FROM OLD.role THEN
        RAISE EXCEPTION 'Only service role can modify profile role';
    END IF;
    IF NEW.tier IS DISTINCT FROM OLD.tier THEN
        RAISE EXCEPTION 'Only service role can modify subscription tier';
    END IF;
    IF NEW.tier_expires_at IS DISTINCT FROM OLD.tier_expires_at THEN
        RAISE EXCEPTION 'Only service role can modify tier_expires_at';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profiles_privileged_cols ON public.profiles;
CREATE TRIGGER protect_profiles_privileged_cols
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_profile_privileged_columns();

-- 4. RLS & PRIVILEGES ON PUBLIC.PROFILES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile (excluding role & tier)" ON public.profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own display_name" ON public.profiles;
DROP POLICY IF EXISTS "Service role full access profiles" ON public.profiles;

REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT UPDATE (display_name) ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;

CREATE POLICY "Users can read own profile"
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

CREATE POLICY "Users can update own display_name"
    ON public.profiles
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Service role full access profiles"
    ON public.profiles
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 5. LOCK DOWN ALL USER-SCOPED TABLES FROM ANON ACCESS
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY['user_preferences', 'saved_fixtures', 'notifications']
    LOOP
        IF to_regclass('public.' || tbl) IS NOT NULL THEN
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
            EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon', tbl);
            EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', tbl);
            EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', tbl);
        END IF;
    END LOOP;
END $$;

-- 6. HARDENED RLS AUDIT: REVOKE ALL ANON & CLIENT READS ON PICKS, FIXTURES, MODELS & HISTORY
-- All application reads of these tables must happen server-side via Next.js API routes
-- authenticated by user session and backed by SUPABASE_SERVICE_ROLE_KEY.
DO $$
DECLARE
    tbl TEXT;
    pol RECORD;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'competitions',
        'seasons',
        'teams',
        'team_aliases',
        'fixtures',
        'matches',
        'market_definitions',
        'bookmaker_odds',
        'odds_snapshots',
        'prediction_models',
        'prediction_runs',
        'market_predictions',
        'prediction_explanations',
        'factor_definitions',
        'match_state_tags',
        'prediction_factor_contributions',
        'dixon_coles_v25_features',
        'dixon_coles_v25_predictions',
        'dixon_coles_v25_parameters',
        'lineups',
        'pick_revisions',
        'football_picks',
        'unresolved_teams',
        'provider_call_logs',
        'provider_sync_state',
        'provider_sync_jobs',
        'audit_logs',
        'bb_teams',
        'bb_games',
        'bb_picks',
        'bb_settlements',
        'bb_odds_snapshots'
    ]
    LOOP
        IF to_regclass('public.' || tbl) IS NOT NULL THEN
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

            -- Drop every existing policy on this table so no USING (true) policy survives
            FOR pol IN
                SELECT policyname
                FROM pg_policies
                WHERE schemaname = 'public' AND tablename = tbl
            LOOP
                EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, tbl);
            END LOOP;

            -- Revoke direct anon and authenticated table privileges
            EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', tbl);
            EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', tbl);

            -- Only service_role can read/write directly
            EXECUTE format(
                'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
                'Service role only ' || tbl,
                tbl
            );
        END IF;
    END LOOP;
END $$;

-- 7. REVOKE PUBLIC/ANON/AUTHENTICATED EXECUTE ON DATA RPC FUNCTIONS
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'get_fixture_teams_recent_matches'
    ) THEN
        REVOKE ALL ON FUNCTION public.get_fixture_teams_recent_matches(TEXT[], INTEGER, TEXT[], TEXT[]) FROM PUBLIC, anon, authenticated;
        GRANT EXECUTE ON FUNCTION public.get_fixture_teams_recent_matches(TEXT[], INTEGER, TEXT[], TEXT[]) TO service_role;
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'get_bb_data_status_aggregates'
    ) THEN
        REVOKE ALL ON FUNCTION public.get_bb_data_status_aggregates() FROM PUBLIC, anon, authenticated;
        GRANT EXECUTE ON FUNCTION public.get_bb_data_status_aggregates() TO service_role;
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'get_bb_forward_summary'
    ) THEN
        REVOKE ALL ON FUNCTION public.get_bb_forward_summary() FROM PUBLIC, anon, authenticated;
        GRANT EXECUTE ON FUNCTION public.get_bb_forward_summary() TO service_role;
    END IF;
END $$;
