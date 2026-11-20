-- ====================================================================
-- CALIBRALL: Single-RPC Team History Preload + Composite Indexes
-- Migration: 20261120000000_get_fixture_teams_recent_matches_rpc.sql
--
-- Replaces 30-90+ sequential per-batch queries in preloadForFixtures()
-- with a single indexed RPC returning each fixture team's last 40 matches,
-- announced-referee history, fixture odds snapshots, and promoted team IDs.
-- ====================================================================

BEGIN;

-- 1. Ensure optional columns referenced by the RPC exist
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS is_promoted INTEGER DEFAULT 0;

-- 2. Composite indexes for fast top-N per-team & per-referee lateral scans
CREATE INDEX IF NOT EXISTS idx_matches_home_kickoff
  ON public.matches (home_team_id, kickoff_time DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_matches_away_kickoff
  ON public.matches (away_team_id, kickoff_time DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_matches_referee_lower_kickoff
  ON public.matches (LOWER(TRIM(referee)), kickoff_time DESC NULLS LAST)
  WHERE referee IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_odds_snapshots_match_id
  ON public.odds_snapshots (match_id);

-- 3. Single-RPC loader: last N (default 40) matches per team + odds + promoted flags
CREATE OR REPLACE FUNCTION public.get_fixture_teams_recent_matches(
  team_ids TEXT[],
  per_team_limit INTEGER DEFAULT 40,
  fixture_ids TEXT[] DEFAULT NULL,
  referee_names TEXT[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  safe_limit INTEGER := GREATEST(1, LEAST(COALESCE(per_team_limit, 40), 200));
  matches_json JSONB := '[]'::JSONB;
  odds_json JSONB := '[]'::JSONB;
  promoted_json JSONB := '[]'::JSONB;
BEGIN
  WITH input_teams AS (
    SELECT DISTINCT tid
    FROM UNNEST(COALESCE(team_ids, ARRAY[]::TEXT[])) AS tid
    WHERE tid IS NOT NULL AND tid <> ''
  ),
  per_team_recent AS (
    SELECT m.*
    FROM input_teams t
    CROSS JOIN LATERAL (
      SELECT combined.*
      FROM (
        (
          SELECT hm.*
          FROM public.matches hm
          WHERE hm.home_team_id = t.tid
          ORDER BY hm.kickoff_time DESC NULLS LAST, hm.id ASC
          LIMIT safe_limit
        )
        UNION ALL
        (
          SELECT am.*
          FROM public.matches am
          WHERE am.away_team_id = t.tid
          ORDER BY am.kickoff_time DESC NULLS LAST, am.id ASC
          LIMIT safe_limit
        )
      ) combined
      ORDER BY combined.kickoff_time DESC NULLS LAST, combined.id ASC
      LIMIT safe_limit
    ) m
  ),
  ref_recent AS (
    SELECT r.*
    FROM (
      SELECT DISTINCT LOWER(TRIM(rname)) AS rnorm
      FROM UNNEST(COALESCE(referee_names, ARRAY[]::TEXT[])) AS rname
      WHERE rname IS NOT NULL AND TRIM(rname) <> ''
    ) refs
    CROSS JOIN LATERAL (
      SELECT rm.*
      FROM public.matches rm
      WHERE rm.referee IS NOT NULL
        AND LOWER(TRIM(rm.referee)) = refs.rnorm
      ORDER BY rm.kickoff_time DESC NULLS LAST, rm.id ASC
      LIMIT safe_limit
    ) r
  ),
  deduped AS (
    SELECT DISTINCT ON (id) *
    FROM (
      SELECT * FROM per_team_recent
      UNION ALL
      SELECT * FROM ref_recent
    ) all_rows
    ORDER BY id, kickoff_time DESC NULLS LAST
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(d)), '[]'::JSONB)
  INTO matches_json
  FROM deduped d;

  IF fixture_ids IS NOT NULL AND ARRAY_LENGTH(fixture_ids, 1) > 0 THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(o)), '[]'::JSONB)
    INTO odds_json
    FROM public.odds_snapshots o
    WHERE o.match_id = ANY(fixture_ids);
  END IF;

  SELECT COALESCE(jsonb_agg(t.id), '[]'::JSONB)
  INTO promoted_json
  FROM public.teams t
  WHERE t.is_promoted = 1;

  RETURN jsonb_build_object(
    'matches', matches_json,
    'odds', odds_json,
    'promoted_team_ids', promoted_json
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_fixture_teams_recent_matches(TEXT[], INTEGER, TEXT[], TEXT[])
  TO anon, authenticated, service_role;

COMMIT;
