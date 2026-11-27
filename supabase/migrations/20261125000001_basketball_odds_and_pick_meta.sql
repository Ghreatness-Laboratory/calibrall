-- ====================================================================
-- CALIBRALL: Basketball Odds Snapshots & Pick Metadata (Compact)
-- Migration: 20261125000001_basketball_odds_and_pick_meta.sql
--
-- Storage discipline:
--   - Text primary keys, compact numeric columns
--   - Secondary indexes intentionally omitted until DB size is confirmed
--   - RLS matches existing Calibrall tables (public read, service_role write)
-- ====================================================================

BEGIN;

-- 1. Extend bb_picks with calibration metadata, model-line flag, and evidence payload
ALTER TABLE public.bb_picks
    ADD COLUMN IF NOT EXISTS raw_probability NUMERIC(7, 6),
    ADD COLUMN IF NOT EXISTS projected_std NUMERIC(10, 4),
    ADD COLUMN IF NOT EXISTS confidence_tier TEXT CHECK (confidence_tier IN ('HIGH', 'MEDIUM', 'SPECULATIVE', 'ABSTAIN')),
    ADD COLUMN IF NOT EXISTS is_model_line BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS price_source TEXT,
    ADD COLUMN IF NOT EXISTS evidence_json JSONB NOT NULL DEFAULT '{}'::JSONB;

-- 2. Compact bookmaker totals/H1 odds snapshots (the-odds-api)
CREATE TABLE IF NOT EXISTS public.bb_odds_snapshots (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES public.bb_games(id) ON DELETE CASCADE,
    league TEXT NOT NULL CHECK (league IN ('NBA', 'NCAAB', 'EUROLEAGUE')),
    market_category TEXT NOT NULL CHECK (
        market_category IN ('game_total', 'home_total', 'away_total', 'h1_game_total', 'h1_team_total')
    ),
    side TEXT NOT NULL DEFAULT 'game' CHECK (side IN ('game', 'home', 'away')),
    line NUMERIC(10, 4) NOT NULL,
    over_odds NUMERIC(10, 3),
    under_odds NUMERIC(10, 3),
    bookmaker TEXT NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.bb_odds_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read bb_odds_snapshots" ON public.bb_odds_snapshots;
CREATE POLICY "Public read bb_odds_snapshots" ON public.bb_odds_snapshots FOR SELECT USING (true);

DROP POLICY IF EXISTS "Service role write bb_odds_snapshots" ON public.bb_odds_snapshots;
CREATE POLICY "Service role write bb_odds_snapshots" ON public.bb_odds_snapshots FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. Forward summary RPC for Basketball picks & settlements (strictly isolated from football)
CREATE OR REPLACE FUNCTION public.get_bb_forward_summary()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    total_picks INTEGER := 0;
    settled_picks INTEGER := 0;
    pending_picks INTEGER := 0;
    won_count INTEGER := 0;
    lost_count INTEGER := 0;
    push_count INTEGER := 0;
    void_count INTEGER := 0;
    avg_brier NUMERIC := NULL;
    avg_log_loss NUMERIC := NULL;
    priced_settled INTEGER := 0;
    priced_roi NUMERIC := NULL;
    by_league JSONB := '[]'::JSONB;
    by_market JSONB := '[]'::JSONB;
BEGIN
    SELECT
        COUNT(*)::INTEGER,
        SUM(CASE WHEN s.settlement_status IN ('WON', 'LOST', 'PUSH') THEN 1 ELSE 0 END)::INTEGER,
        SUM(CASE WHEN COALESCE(s.settlement_status, 'PENDING') = 'PENDING' THEN 1 ELSE 0 END)::INTEGER,
        SUM(CASE WHEN s.settlement_status = 'WON' THEN 1 ELSE 0 END)::INTEGER,
        SUM(CASE WHEN s.settlement_status = 'LOST' THEN 1 ELSE 0 END)::INTEGER,
        SUM(CASE WHEN s.settlement_status = 'PUSH' THEN 1 ELSE 0 END)::INTEGER,
        SUM(CASE WHEN s.settlement_status = 'VOID' THEN 1 ELSE 0 END)::INTEGER,
        AVG(CASE WHEN s.settlement_status IN ('WON', 'LOST') AND s.brier_error IS NOT NULL THEN s.brier_error END),
        AVG(CASE WHEN s.settlement_status IN ('WON', 'LOST') AND s.log_loss IS NOT NULL THEN s.log_loss END),
        SUM(CASE WHEN s.settlement_status IN ('WON', 'LOST', 'PUSH') AND p.market_odds IS NOT NULL THEN 1 ELSE 0 END)::INTEGER,
        CASE
            WHEN SUM(CASE WHEN s.settlement_status IN ('WON', 'LOST', 'PUSH') AND p.market_odds IS NOT NULL THEN 1 ELSE 0 END) > 0 THEN
                (SUM(
                    CASE
                        WHEN p.market_odds IS NOT NULL AND s.settlement_status = 'WON' THEN (p.market_odds - 1.0)
                        WHEN p.market_odds IS NOT NULL AND s.settlement_status = 'LOST' THEN -1.0
                        ELSE 0.0
                    END
                ) * 100.0) /
                SUM(CASE WHEN s.settlement_status IN ('WON', 'LOST', 'PUSH') AND p.market_odds IS NOT NULL THEN 1 ELSE 0 END)::NUMERIC
            ELSE NULL
        END
    INTO
        total_picks,
        settled_picks,
        pending_picks,
        won_count,
        lost_count,
        push_count,
        void_count,
        avg_brier,
        avg_log_loss,
        priced_settled,
        priced_roi
    FROM public.bb_picks p
    LEFT JOIN public.bb_settlements s ON s.pick_id = p.id;

    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::JSONB)
    INTO by_league
    FROM (
        SELECT
            p.league,
            COUNT(*)::INTEGER AS "totalPicks",
            SUM(CASE WHEN s.settlement_status IN ('WON', 'LOST') THEN 1 ELSE 0 END)::INTEGER AS "gradedCount",
            SUM(CASE WHEN s.settlement_status = 'WON' THEN 1 ELSE 0 END)::INTEGER AS won,
            SUM(CASE WHEN s.settlement_status = 'LOST' THEN 1 ELSE 0 END)::INTEGER AS lost,
            SUM(CASE WHEN s.settlement_status = 'PUSH' THEN 1 ELSE 0 END)::INTEGER AS pushed,
            AVG(CASE WHEN s.settlement_status IN ('WON', 'LOST') THEN s.brier_error END) AS "brierScore",
            AVG(CASE WHEN s.settlement_status IN ('WON', 'LOST') THEN s.log_loss END) AS "logLoss"
        FROM public.bb_picks p
        LEFT JOIN public.bb_settlements s ON s.pick_id = p.id
        GROUP BY p.league
        ORDER BY p.league ASC
    ) t;

    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::JSONB)
    INTO by_market
    FROM (
        SELECT
            p.market_category AS "marketCategory",
            COUNT(*)::INTEGER AS "totalPicks",
            SUM(CASE WHEN s.settlement_status IN ('WON', 'LOST') THEN 1 ELSE 0 END)::INTEGER AS "gradedCount",
            SUM(CASE WHEN s.settlement_status = 'WON' THEN 1 ELSE 0 END)::INTEGER AS won,
            SUM(CASE WHEN s.settlement_status = 'LOST' THEN 1 ELSE 0 END)::INTEGER AS lost,
            SUM(CASE WHEN s.settlement_status = 'PUSH' THEN 1 ELSE 0 END)::INTEGER AS pushed,
            AVG(CASE WHEN s.settlement_status IN ('WON', 'LOST') THEN s.brier_error END) AS "brierScore",
            AVG(CASE WHEN s.settlement_status IN ('WON', 'LOST') THEN s.log_loss END) AS "logLoss"
        FROM public.bb_picks p
        LEFT JOIN public.bb_settlements s ON s.pick_id = p.id
        GROUP BY p.market_category
        ORDER BY p.market_category ASC
    ) t;

    RETURN jsonb_build_object(
        'sport', 'basketball',
        'totalPicks', total_picks,
        'settledCount', settled_picks,
        'pendingCount', pending_picks,
        'wonCount', won_count,
        'lostCount', lost_count,
        'pushCount', push_count,
        'voidCount', void_count,
        'brierScore', avg_brier,
        'logLoss', avg_log_loss,
        'pricedSettledCount', priced_settled,
        'yieldRoi', priced_roi,
        'byLeague', by_league,
        'byMarketCategory', by_market
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_bb_forward_summary()
    TO anon, authenticated, service_role;

COMMIT;
