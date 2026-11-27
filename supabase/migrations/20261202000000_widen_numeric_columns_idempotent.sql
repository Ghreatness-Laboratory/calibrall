-- ====================================================================
-- CALIBRALL: Idempotent Schema-Wide Numeric Precision Hardening
-- Migration: 20261202000000_widen_numeric_columns_idempotent.sql
--
-- Replaces all overflow-prone NUMERIC(4,2) and narrow NUMERIC columns
-- across the live schema with safe types:
--   - Odds (decimal_odds, market_odds, over_odds, under_odds): NUMERIC(10,3)
--   - Probabilities (model_probability, implied_probability, calibrated_prob, etc.): NUMERIC(7,6)
--   - Averages, ratings, lines, multipliers, metrics: NUMERIC(10,4)
--
-- Safely handles generated STORED columns (`implied_probability` on
-- `bookmaker_odds` and `odds_snapshots`) and guards every table/column
-- with catalog checks so re-running after a partial failure succeeds.
-- ====================================================================

BEGIN;

-- 1. Generated column tables: drop STORED `implied_probability`, widen `decimal_odds` -> NUMERIC(10,3),
--    and recreate `implied_probability` -> NUMERIC(7,6)
DO $$
BEGIN
    IF to_regclass('public.bookmaker_odds') IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'bookmaker_odds' AND column_name = 'implied_probability'
        ) THEN
            ALTER TABLE public.bookmaker_odds DROP COLUMN implied_probability;
        END IF;

        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'bookmaker_odds' AND column_name = 'decimal_odds'
        ) THEN
            ALTER TABLE public.bookmaker_odds ALTER COLUMN decimal_odds TYPE NUMERIC(10, 3);
        END IF;

        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'bookmaker_odds' AND column_name = 'decimal_odds'
        ) AND NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'bookmaker_odds' AND column_name = 'implied_probability'
        ) THEN
            ALTER TABLE public.bookmaker_odds
                ADD COLUMN implied_probability NUMERIC(7, 6)
                GENERATED ALWAYS AS (ROUND((1.0 / decimal_odds), 6)) STORED;
        END IF;
    END IF;

    IF to_regclass('public.odds_snapshots') IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'odds_snapshots' AND column_name = 'implied_probability'
        ) THEN
            ALTER TABLE public.odds_snapshots DROP COLUMN implied_probability;
        END IF;

        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'odds_snapshots' AND column_name = 'decimal_odds'
        ) THEN
            ALTER TABLE public.odds_snapshots ALTER COLUMN decimal_odds TYPE NUMERIC(10, 3);
        END IF;

        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'odds_snapshots' AND column_name = 'decimal_odds'
        ) AND NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'odds_snapshots' AND column_name = 'implied_probability'
        ) THEN
            ALTER TABLE public.odds_snapshots
                ADD COLUMN implied_probability NUMERIC(7, 6)
                GENERATED ALWAYS AS (ROUND((1.0 / decimal_odds), 6)) STORED;
        END IF;
    END IF;
END $$;

-- 2. Widen all remaining odds, probability, average, rating, line, and metric columns idempotently
DO $$
DECLARE
    col_spec RECORD;
    target_tbl REGCLASS;
    is_gen TEXT;
BEGIN
    FOR col_spec IN
        SELECT * FROM (VALUES
            -- public.user_preferences (probabilities/thresholds)
            ('public.user_preferences', 'min_probability_threshold', 'NUMERIC(7, 6)'),
            ('public.user_preferences', 'min_edge_threshold', 'NUMERIC(7, 6)'),

            -- public.competitions (per-game averages — previously NUMERIC(4,2))
            ('public.competitions', 'avg_goals_per_game', 'NUMERIC(10, 4)'),
            ('public.competitions', 'avg_corners_per_game', 'NUMERIC(10, 4)'),
            ('public.competitions', 'avg_cards_per_game', 'NUMERIC(10, 4)'),

            -- public.teams (team strength & discipline ratings)
            ('public.teams', 'attack_rating', 'NUMERIC(10, 4)'),
            ('public.teams', 'defense_rating', 'NUMERIC(10, 4)'),
            ('public.teams', 'corner_attack_rating', 'NUMERIC(10, 4)'),
            ('public.teams', 'discipline_rating', 'NUMERIC(10, 4)'),

            -- public.market_definitions
            ('public.market_definitions', 'line', 'NUMERIC(10, 4)'),
            ('public.market_definitions', 'min_probability', 'NUMERIC(7, 6)'),
            ('public.market_definitions', 'max_uncertainty', 'NUMERIC(7, 6)'),

            -- public.prediction_models
            ('public.prediction_models', 'brier_score', 'NUMERIC(10, 4)'),
            ('public.prediction_models', 'log_loss', 'NUMERIC(10, 4)'),
            ('public.prediction_models', 'hit_rate', 'NUMERIC(7, 6)'),
            ('public.prediction_models', 'calibration_slope', 'NUMERIC(10, 4)'),

            -- public.prediction_runs (expected goals/corners/cards — previously NUMERIC(4,2))
            ('public.prediction_runs', 'home_xg', 'NUMERIC(10, 4)'),
            ('public.prediction_runs', 'away_xg', 'NUMERIC(10, 4)'),
            ('public.prediction_runs', 'expected_corners_home', 'NUMERIC(10, 4)'),
            ('public.prediction_runs', 'expected_corners_away', 'NUMERIC(10, 4)'),
            ('public.prediction_runs', 'expected_cards_total', 'NUMERIC(10, 4)'),
            ('public.prediction_runs', 'model_uncertainty_score', 'NUMERIC(7, 6)'),
            ('public.prediction_runs', 'data_coverage_score', 'NUMERIC(7, 6)'),

            -- public.market_predictions
            ('public.market_predictions', 'line', 'NUMERIC(10, 4)'),
            ('public.market_predictions', 'model_probability', 'NUMERIC(7, 6)'),
            ('public.market_predictions', 'market_odds', 'NUMERIC(10, 3)'),
            ('public.market_predictions', 'implied_probability', 'NUMERIC(7, 6)'),
            ('public.market_predictions', 'expected_value', 'NUMERIC(10, 4)'),
            ('public.market_predictions', 'ranking_score', 'NUMERIC(10, 4)'),

            -- public.factor_definitions
            ('public.factor_definitions', 'default_shrinkage', 'NUMERIC(7, 6)'),
            ('public.factor_definitions', 'ablation_gain_brier', 'NUMERIC(10, 4)'),

            -- public.match_state_tags (uncertainty_multiplier previously NUMERIC(4,2))
            ('public.match_state_tags', 'uncertainty_multiplier', 'NUMERIC(10, 4)'),
            ('public.match_state_tags', 'confidence', 'NUMERIC(7, 6)'),

            -- public.prediction_factor_contributions
            ('public.prediction_factor_contributions', 'weight', 'NUMERIC(10, 4)'),
            ('public.prediction_factor_contributions', 'magnitude', 'NUMERIC(10, 4)'),

            -- public.dixon_coles_v25_features (referee averages previously NUMERIC(4,2))
            ('public.dixon_coles_v25_features', 'h2h_shrunk_goal_diff', 'NUMERIC(10, 4)'),
            ('public.dixon_coles_v25_features', 'home_specific_advantage', 'NUMERIC(10, 4)'),
            ('public.dixon_coles_v25_features', 'away_specific_resistance', 'NUMERIC(10, 4)'),
            ('public.dixon_coles_v25_features', 'home_form_xg_per90', 'NUMERIC(10, 4)'),
            ('public.dixon_coles_v25_features', 'away_form_xg_per90', 'NUMERIC(10, 4)'),
            ('public.dixon_coles_v25_features', 'home_form_goals_conceded_per90', 'NUMERIC(10, 4)'),
            ('public.dixon_coles_v25_features', 'away_form_goals_conceded_per90', 'NUMERIC(10, 4)'),
            ('public.dixon_coles_v25_features', 'home_form_momentum', 'NUMERIC(10, 4)'),
            ('public.dixon_coles_v25_features', 'away_form_momentum', 'NUMERIC(10, 4)'),
            ('public.dixon_coles_v25_features', 'home_fatigue_index', 'NUMERIC(7, 6)'),
            ('public.dixon_coles_v25_features', 'away_fatigue_index', 'NUMERIC(7, 6)'),
            ('public.dixon_coles_v25_features', 'home_missing_xg_share', 'NUMERIC(7, 6)'),
            ('public.dixon_coles_v25_features', 'away_missing_xg_share', 'NUMERIC(7, 6)'),
            ('public.dixon_coles_v25_features', 'home_finisher_conversion_rate', 'NUMERIC(10, 4)'),
            ('public.dixon_coles_v25_features', 'away_finisher_conversion_rate', 'NUMERIC(10, 4)'),
            ('public.dixon_coles_v25_features', 'weather_temp_celsius', 'NUMERIC(10, 4)'),
            ('public.dixon_coles_v25_features', 'weather_precipitation_mm', 'NUMERIC(10, 4)'),
            ('public.dixon_coles_v25_features', 'weather_wind_kmh', 'NUMERIC(10, 4)'),
            ('public.dixon_coles_v25_features', 'referee_avg_yellows', 'NUMERIC(10, 4)'),
            ('public.dixon_coles_v25_features', 'referee_avg_reds', 'NUMERIC(10, 4)'),
            ('public.dixon_coles_v25_features', 'data_completeness_score', 'NUMERIC(7, 6)'),

            -- public.dixon_coles_v25_predictions (handicap_line previously NUMERIC(4,2))
            ('public.dixon_coles_v25_predictions', 'handicap_line', 'NUMERIC(10, 4)'),
            ('public.dixon_coles_v25_predictions', 'raw_model_prob', 'NUMERIC(7, 6)'),
            ('public.dixon_coles_v25_predictions', 'market_devigged_prob', 'NUMERIC(7, 6)'),
            ('public.dixon_coles_v25_predictions', 'blended_prob', 'NUMERIC(7, 6)'),
            ('public.dixon_coles_v25_predictions', 'calibrated_prob', 'NUMERIC(7, 6)'),
            ('public.dixon_coles_v25_predictions', 'uncertainty_spread', 'NUMERIC(7, 6)'),
            ('public.dixon_coles_v25_predictions', 'ci_lower_90', 'NUMERIC(7, 6)'),
            ('public.dixon_coles_v25_predictions', 'ci_upper_90', 'NUMERIC(7, 6)'),
            ('public.dixon_coles_v25_predictions', 'decimal_odds', 'NUMERIC(10, 3)'),
            ('public.dixon_coles_v25_predictions', 'expected_value', 'NUMERIC(10, 4)'),
            ('public.dixon_coles_v25_predictions', 'edge_over_market', 'NUMERIC(10, 4)'),

            -- public.dixon_coles_v25_parameters
            ('public.dixon_coles_v25_parameters', 'platt_a', 'NUMERIC(10, 4)'),
            ('public.dixon_coles_v25_parameters', 'platt_b', 'NUMERIC(10, 4)'),
            ('public.dixon_coles_v25_parameters', 'market_blend_weight', 'NUMERIC(7, 6)'),
            ('public.dixon_coles_v25_parameters', 'brier_score_val', 'NUMERIC(10, 4)'),
            ('public.dixon_coles_v25_parameters', 'log_loss_val', 'NUMERIC(10, 4)'),

            -- public.bb_picks
            ('public.bb_picks', 'line', 'NUMERIC(10, 4)'),
            ('public.bb_picks', 'projected_mean', 'NUMERIC(10, 4)'),
            ('public.bb_picks', 'projected_std', 'NUMERIC(10, 4)'),
            ('public.bb_picks', 'raw_probability', 'NUMERIC(7, 6)'),
            ('public.bb_picks', 'model_probability', 'NUMERIC(7, 6)'),
            ('public.bb_picks', 'market_odds', 'NUMERIC(10, 3)'),
            ('public.bb_picks', 'implied_probability', 'NUMERIC(7, 6)'),
            ('public.bb_picks', 'expected_value', 'NUMERIC(10, 4)'),

            -- public.bb_odds_snapshots
            ('public.bb_odds_snapshots', 'line', 'NUMERIC(10, 4)'),
            ('public.bb_odds_snapshots', 'over_odds', 'NUMERIC(10, 3)'),
            ('public.bb_odds_snapshots', 'under_odds', 'NUMERIC(10, 3)'),

            -- public.bb_settlements
            ('public.bb_settlements', 'actual_value', 'NUMERIC(10, 4)'),

            -- public.football_picks
            ('public.football_picks', 'calibrated_probability', 'NUMERIC(7, 6)')
        ) AS t(tbl_name, col_name, target_type)
    LOOP
        target_tbl := to_regclass(col_spec.tbl_name);
        IF target_tbl IS NOT NULL THEN
            SELECT is_generated INTO is_gen
            FROM information_schema.columns
            WHERE table_schema = split_part(col_spec.tbl_name, '.', 1)
              AND table_name = split_part(col_spec.tbl_name, '.', 2)
              AND column_name = col_spec.col_name;

            IF FOUND AND COALESCE(is_gen, 'NEVER') = 'NEVER' THEN
                EXECUTE format(
                    'ALTER TABLE %s ALTER COLUMN %I TYPE %s',
                    col_spec.tbl_name,
                    col_spec.col_name,
                    col_spec.target_type
                );
            END IF;
        END IF;
    END LOOP;
END $$;

COMMIT;
