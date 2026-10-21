-- MATCHMIND: Complete Relational Schema & Row Level Security (RLS)
-- Migration: 20261021000000_matchmind_schema.sql

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ====================================================================
-- 1. USERS, PROFILES & PREFERENCES
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'analyst', 'admin')),
    subscription_tier TEXT NOT NULL DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro', 'premium')),
    subscription_status TEXT NOT NULL DEFAULT 'active' CHECK (subscription_status IN ('active', 'past_due', 'canceled', 'trialing')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_preferences (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    preferred_competitions TEXT[] DEFAULT ARRAY['PL', 'CL', 'PD', 'SA', 'BL1'],
    favorite_teams UUID[] DEFAULT ARRAY[]::UUID[],
    preferred_markets TEXT[] DEFAULT ARRAY['total_goals', 'btts', 'match_result', 'corners'],
    min_probability_threshold NUMERIC(5, 4) NOT NULL DEFAULT 0.5500,
    min_edge_threshold NUMERIC(5, 4) NOT NULL DEFAULT 0.0300,
    email_notifications_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ====================================================================
-- 2. FOOTBALL DATA ENTITIES (COMPETITIONS, TEAMS, FIXTURES)
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.competitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    country TEXT NOT NULL,
    emblem_url TEXT,
    tier INTEGER NOT NULL DEFAULT 1,
    avg_goals_per_game NUMERIC(4, 2) DEFAULT 2.75,
    avg_corners_per_game NUMERIC(4, 2) DEFAULT 10.20,
    avg_cards_per_game NUMERIC(4, 2) DEFAULT 4.10,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.seasons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
    year TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_current BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE(competition_id, year)
);

CREATE TABLE IF NOT EXISTS public.teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    short_name TEXT,
    tla VARCHAR(4),
    crest_url TEXT,
    venue TEXT,
    competition_id UUID REFERENCES public.competitions(id) ON DELETE SET NULL,
    attack_rating NUMERIC(5, 3) DEFAULT 1.000,
    defense_rating NUMERIC(5, 3) DEFAULT 1.000,
    corner_attack_rating NUMERIC(5, 3) DEFAULT 1.000,
    discipline_rating NUMERIC(5, 3) DEFAULT 1.000,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.fixtures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id TEXT UNIQUE,
    competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
    season_id UUID REFERENCES public.seasons(id) ON DELETE SET NULL,
    home_team_id UUID NOT NULL REFERENCES public.teams(id),
    away_team_id UUID NOT NULL REFERENCES public.teams(id),
    kickoff_time TIMESTAMPTZ NOT NULL,
    matchday INTEGER,
    status TEXT NOT NULL DEFAULT 'TIMED' CHECK (status IN ('TIMED', 'SCHEDULED', 'IN_PLAY', 'PAUSED', 'FINISHED', 'POSTPONED', 'CANCELED')),
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
    venue TEXT,
    referee TEXT,
    data_freshness TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fixtures_kickoff ON public.fixtures(kickoff_time);
CREATE INDEX IF NOT EXISTS idx_fixtures_competition ON public.fixtures(competition_id);
CREATE INDEX IF NOT EXISTS idx_fixtures_status ON public.fixtures(status);

-- ====================================================================
-- 3. MARKET DEFINITIONS & BOOKMAKER ODDS
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.market_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('match_result', 'total_goals', 'team_goals', 'btts', 'total_corners', 'team_corners', 'bookings', 'half_time')),
    name TEXT NOT NULL,
    line NUMERIC(4, 1),
    period TEXT NOT NULL DEFAULT 'regular_90',
    settlement_rule TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.bookmaker_odds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fixture_id UUID NOT NULL REFERENCES public.fixtures(id) ON DELETE CASCADE,
    bookmaker TEXT NOT NULL,
    market_code TEXT NOT NULL REFERENCES public.market_definitions(code),
    selection TEXT NOT NULL,
    decimal_odds NUMERIC(8, 4) NOT NULL CHECK (decimal_odds >= 1.01),
    implied_probability NUMERIC(5, 4) GENERATED ALWAYS AS (ROUND((1.0 / decimal_odds), 4)) STORED,
    is_live BOOLEAN NOT NULL DEFAULT FALSE,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_odds_fixture ON public.bookmaker_odds(fixture_id);

-- ====================================================================
-- 4. STATISTICAL MODELS & IMMUTABLE PREDICTIONS
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.prediction_models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    version TEXT UNIQUE NOT NULL,
    model_type TEXT NOT NULL CHECK (model_type IN ('dixon_coles_poisson', 'bivariate_poisson', 'negative_binomial_corners', 'ordinal_logistic_bookings')),
    description TEXT,
    brier_score NUMERIC(6, 4),
    log_loss NUMERIC(6, 4),
    hit_rate NUMERIC(5, 4),
    calibration_slope NUMERIC(5, 4),
    trained_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS public.prediction_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fixture_id UUID NOT NULL REFERENCES public.fixtures(id) ON DELETE CASCADE,
    model_id UUID NOT NULL REFERENCES public.prediction_models(id),
    run_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    home_xg NUMERIC(4, 2) NOT NULL,
    away_xg NUMERIC(4, 2) NOT NULL,
    expected_corners_home NUMERIC(4, 2) NOT NULL,
    expected_corners_away NUMERIC(4, 2) NOT NULL,
    expected_cards_total NUMERIC(4, 2) NOT NULL,
    model_uncertainty_score NUMERIC(4, 3) NOT NULL DEFAULT 0.050,
    data_coverage_score NUMERIC(4, 3) NOT NULL DEFAULT 0.950,
    status TEXT NOT NULL DEFAULT 'completed'
);

-- Immutable Prediction Table
CREATE TABLE IF NOT EXISTS public.market_predictions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    prediction_run_id UUID NOT NULL REFERENCES public.prediction_runs(id) ON DELETE CASCADE,
    fixture_id UUID NOT NULL REFERENCES public.fixtures(id) ON DELETE CASCADE,
    market_code TEXT NOT NULL REFERENCES public.market_definitions(code),
    market_category TEXT NOT NULL,
    selection TEXT NOT NULL,
    line NUMERIC(4, 1),
    model_probability NUMERIC(5, 4) NOT NULL CHECK (model_probability >= 0 AND model_probability <= 1),
    market_odds NUMERIC(8, 4),
    implied_probability NUMERIC(5, 4),
    expected_value NUMERIC(6, 4),
    model_confidence TEXT NOT NULL CHECK (model_confidence IN ('VERY_HIGH', 'HIGH', 'MODERATE', 'LOW')),
    qualification_status TEXT NOT NULL CHECK (qualification_status IN ('QUALIFIED_VALUE', 'QUALIFIED_PROBABILITY', 'UNQUALIFIED_MARGINAL', 'UNQUALIFIED_HIGH_UNCERTAINTY', 'NO_RECOMMENDATION')),
    ranking_score NUMERIC(6, 4),
    is_top_pick BOOLEAN NOT NULL DEFAULT FALSE,
    settlement_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (settlement_status IN ('PENDING', 'WON', 'LOST', 'PUSH', 'VOID')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_predictions_fixture ON public.market_predictions(fixture_id);
CREATE INDEX IF NOT EXISTS idx_predictions_qualification ON public.market_predictions(qualification_status);

CREATE TABLE IF NOT EXISTS public.prediction_explanations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    prediction_id UUID NOT NULL REFERENCES public.market_predictions(id) ON DELETE CASCADE,
    headline TEXT NOT NULL,
    key_supporting_factors JSONB NOT NULL DEFAULT '[]'::JSONB,
    counterarguments JSONB NOT NULL DEFAULT '[]'::JSONB,
    data_limitations JSONB NOT NULL DEFAULT '[]'::JSONB,
    alternative_comparisons JSONB NOT NULL DEFAULT '[]'::JSONB,
    why_ranked_above_alternatives TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ====================================================================
-- 5. SAVED FIXTURES, SUBSCRIPTIONS, NOTIFICATIONS, AUDIT
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.saved_fixtures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    fixture_id UUID NOT NULL REFERENCES public.fixtures(id) ON DELETE CASCADE,
    notes TEXT,
    alert_on_line_movement BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, fixture_id)
);

CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    link TEXT,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.provider_sync_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider TEXT NOT NULL,
    job_type TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('RUNNING', 'COMPLETED', 'FAILED')),
    records_processed INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details JSONB,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ====================================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ====================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fixtures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookmaker_odds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prediction_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prediction_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prediction_explanations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_fixtures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 1. Profiles: Users can view and edit only their own profile
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile (excluding role & tier)" ON public.profiles
    FOR UPDATE USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id AND role = (SELECT role FROM public.profiles WHERE id = auth.uid()));

-- 2. User Preferences: Users can manage only their own preferences
CREATE POLICY "Users manage own preferences" ON public.user_preferences
    FOR ALL USING (auth.uid() = user_id);

-- 3. Public Football Data: Authenticated and anonymous users can read football records
CREATE POLICY "Public read-only competitions" ON public.competitions FOR SELECT USING (true);
CREATE POLICY "Public read-only seasons" ON public.seasons FOR SELECT USING (true);
CREATE POLICY "Public read-only teams" ON public.teams FOR SELECT USING (true);
CREATE POLICY "Public read-only fixtures" ON public.fixtures FOR SELECT USING (true);
CREATE POLICY "Public read-only market definitions" ON public.market_definitions FOR SELECT USING (true);
CREATE POLICY "Public read-only bookmaker odds" ON public.bookmaker_odds FOR SELECT USING (true);

-- 4. Predictions: Read-only for authenticated and public according to tier
CREATE POLICY "Public read-only prediction models" ON public.prediction_models FOR SELECT USING (true);
CREATE POLICY "Public read-only prediction runs" ON public.prediction_runs FOR SELECT USING (true);
CREATE POLICY "Public read-only market predictions" ON public.market_predictions FOR SELECT USING (true);
CREATE POLICY "Public read-only explanations" ON public.prediction_explanations FOR SELECT USING (true);

-- 5. Saved Fixtures: Users can only see and edit their own saved fixtures
CREATE POLICY "Users can manage own saved fixtures" ON public.saved_fixtures
    FOR ALL USING (auth.uid() = user_id);

-- 6. Notifications: Users can only view their own notifications
CREATE POLICY "Users can read own notifications" ON public.notifications
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON public.notifications
    FOR UPDATE USING (auth.uid() = user_id);

-- 7. Audit & Sync logs: Only admins can view
CREATE POLICY "Admins view sync jobs" ON public.provider_sync_jobs
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    );

CREATE POLICY "Admins view audit logs" ON public.audit_logs
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    );
