-- ====================================================================
-- MATCHMIND / CALIBRALL: Migration for Dixon-Coles v2.5 Engine
-- Contextual Covariates, Platt Calibration, Immutable Pre-Kickoff Predictions & Feature Store
-- ====================================================================

-- 1. Table: Pre-kickoff Contextual Features Store (Immutable at T-75m / T-30m)
CREATE TABLE IF NOT EXISTS dixon_coles_v25_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id TEXT NOT NULL,
  competition_code TEXT NOT NULL,
  season TEXT NOT NULL,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  as_of_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lineup_status TEXT NOT NULL CHECK (lineup_status IN ('pre_lineup', 'confirmed')),
  
  -- Contextual Covariates
  h2h_matches_analyzed INT DEFAULT 0,
  h2h_venue_record_home_wins INT DEFAULT 0,
  h2h_venue_record_draws INT DEFAULT 0,
  h2h_venue_record_away_wins INT DEFAULT 0,
  h2h_shrunk_goal_diff NUMERIC(5,3) DEFAULT 0.0,
  
  home_specific_advantage NUMERIC(5,3) DEFAULT 1.24,
  away_specific_resistance NUMERIC(5,3) DEFAULT 1.00,
  
  home_form_xg_per90 NUMERIC(5,3) NOT NULL,
  away_form_xg_per90 NUMERIC(5,3) NOT NULL,
  home_form_goals_conceded_per90 NUMERIC(5,3) NOT NULL,
  away_form_goals_conceded_per90 NUMERIC(5,3) NOT NULL,
  home_form_momentum NUMERIC(5,3) DEFAULT 0.0,
  away_form_momentum NUMERIC(5,3) DEFAULT 0.0,
  
  home_rest_days INT DEFAULT 7,
  away_rest_days INT DEFAULT 7,
  home_midweek_european BOOLEAN DEFAULT FALSE,
  away_midweek_european BOOLEAN DEFAULT FALSE,
  home_fatigue_index NUMERIC(4,3) DEFAULT 0.20,
  away_fatigue_index NUMERIC(4,3) DEFAULT 0.20,
  
  home_missing_xg_share NUMERIC(4,3) DEFAULT 0.0,
  away_missing_xg_share NUMERIC(4,3) DEFAULT 0.0,
  home_key_cb_absent BOOLEAN DEFAULT FALSE,
  away_key_cb_absent BOOLEAN DEFAULT FALSE,
  home_key_gk_absent BOOLEAN DEFAULT FALSE,
  away_key_gk_absent BOOLEAN DEFAULT FALSE,
  
  home_finisher_conversion_rate NUMERIC(4,3) DEFAULT 1.00,
  away_finisher_conversion_rate NUMERIC(4,3) DEFAULT 1.00,
  
  home_coach_matches INT DEFAULT 20,
  away_coach_matches INT DEFAULT 20,
  is_new_manager_window_home BOOLEAN DEFAULT FALSE,
  is_new_manager_window_away BOOLEAN DEFAULT FALSE,
  
  is_derby BOOLEAN DEFAULT FALSE,
  derby_name TEXT,
  
  weather_temp_celsius NUMERIC(4,1),
  weather_precipitation_mm NUMERIC(4,1),
  weather_wind_kmh NUMERIC(4,1),
  weather_pitch_condition TEXT DEFAULT 'good',
  
  referee_name TEXT,
  referee_avg_yellows NUMERIC(4,2) DEFAULT 3.80,
  referee_avg_reds NUMERIC(4,2) DEFAULT 0.15,
  
  data_completeness_score NUMERIC(4,3) NOT NULL DEFAULT 1.0,
  raw_features_json JSONB,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for instant lookup by fixture
CREATE INDEX IF NOT EXISTS idx_dc_v25_features_fixture ON dixon_coles_v25_features(fixture_id, as_of_timestamp DESC);

-- 2. Table: Immutable Pre-Kickoff Predictions (Auditable on-chain/public log)
CREATE TABLE IF NOT EXISTS dixon_coles_v25_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id TEXT NOT NULL,
  market_code TEXT NOT NULL,
  option_type TEXT NOT NULL,
  market_category TEXT NOT NULL,
  selection TEXT NOT NULL,
  handicap_line NUMERIC(4,2),
  
  -- Model outputs
  raw_model_prob NUMERIC(5,4) NOT NULL,
  market_devigged_prob NUMERIC(5,4),
  blended_prob NUMERIC(5,4) NOT NULL,
  calibrated_prob NUMERIC(5,4) NOT NULL,
  uncertainty_spread NUMERIC(5,4) NOT NULL,
  ci_lower_90 NUMERIC(5,4) NOT NULL,
  ci_upper_90 NUMERIC(5,4) NOT NULL,
  
  -- Market odds & Value
  decimal_odds NUMERIC(6,3),
  expected_value NUMERIC(6,4),
  edge_over_market NUMERIC(6,4),
  
  -- Confidence & Gating (Honest tiering: HIGH / MEDIUM / LOW, never "SAFE")
  confidence_tier TEXT NOT NULL CHECK (confidence_tier IN ('HIGH', 'MEDIUM', 'LOW')),
  qualification_status TEXT NOT NULL,
  is_top_pick BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Risk & Why Panel
  risk_flags TEXT[] DEFAULT '{}',
  top_factors_for TEXT[] DEFAULT '{}',
  top_factors_against TEXT[] DEFAULT '{}',
  abstain_reason TEXT,
  
  -- Auditability
  engine_version TEXT NOT NULL DEFAULT 'v2.5.0',
  locked_before_kickoff BOOLEAN NOT NULL DEFAULT TRUE,
  kickoff_time TIMESTAMPTZ NOT NULL,
  settled_status TEXT DEFAULT 'PENDING' CHECK (settled_status IN ('PENDING', 'WON', 'HALF_WON', 'PUSH', 'HALF_LOST', 'LOST', 'VOID')),
  actual_outcome_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dc_v25_preds_fixture ON dixon_coles_v25_predictions(fixture_id);
CREATE INDEX IF NOT EXISTS idx_dc_v25_preds_tier ON dixon_coles_v25_predictions(confidence_tier, qualification_status);

-- 3. Table: Learned Model Weights & Platt Calibration Parameters
CREATE TABLE IF NOT EXISTS dixon_coles_v25_parameters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_category TEXT NOT NULL UNIQUE,
  platt_a NUMERIC(6,4) NOT NULL DEFAULT 1.0,
  platt_b NUMERIC(6,4) NOT NULL DEFAULT 0.0,
  market_blend_weight NUMERIC(4,3) NOT NULL DEFAULT 0.65,
  brier_score_val NUMERIC(6,4) NOT NULL,
  log_loss_val NUMERIC(6,4) NOT NULL,
  last_trained_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE dixon_coles_v25_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE dixon_coles_v25_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE dixon_coles_v25_parameters ENABLE ROW LEVEL SECURITY;

-- Allow public read of predictions (auditable record)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'dixon_coles_v25_predictions' AND policyname = 'Allow public read of v25 predictions'
  ) THEN
    CREATE POLICY "Allow public read of v25 predictions" ON dixon_coles_v25_predictions FOR SELECT USING (true);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'dixon_coles_v25_features' AND policyname = 'Allow public read of v25 features'
  ) THEN
    CREATE POLICY "Allow public read of v25 features" ON dixon_coles_v25_features FOR SELECT USING (true);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'dixon_coles_v25_parameters' AND policyname = 'Allow public read of v25 parameters'
  ) THEN
    CREATE POLICY "Allow public read of v25 parameters" ON dixon_coles_v25_parameters FOR SELECT USING (true);
  END IF;
END $$;
