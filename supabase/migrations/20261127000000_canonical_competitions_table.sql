-- ====================================================================
-- CALIBRALL: Canonical Competitions Table, Aliases, Sort Order & Fixture Integrity
-- Migration: 20261127000000_canonical_competitions_table.sql
-- ====================================================================

BEGIN;

-- 1. Reconcile legacy UUID PK / FK types so canonical TEXT IDs (comp_pl, comp_nba, ...) persist
DO $$
DECLARE
    comp_id_type TEXT;
    seasons_comp_type TEXT;
    teams_comp_type TEXT;
BEGIN
    SELECT data_type INTO comp_id_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'competitions' AND column_name = 'id';

    SELECT data_type INTO seasons_comp_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'seasons' AND column_name = 'competition_id';

    SELECT data_type INTO teams_comp_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'teams' AND column_name = 'competition_id';

    IF to_regclass('public.seasons') IS NOT NULL THEN
        ALTER TABLE public.seasons DROP CONSTRAINT IF EXISTS seasons_competition_id_fkey;
    END IF;
    IF to_regclass('public.teams') IS NOT NULL THEN
        ALTER TABLE public.teams DROP CONSTRAINT IF EXISTS teams_competition_id_fkey;
    END IF;
    IF to_regclass('public.fixtures') IS NOT NULL THEN
        ALTER TABLE public.fixtures DROP CONSTRAINT IF EXISTS fixtures_competition_id_fkey;
    END IF;

    IF comp_id_type = 'uuid' THEN
        IF seasons_comp_type = 'uuid' THEN
            ALTER TABLE public.seasons ALTER COLUMN competition_id TYPE TEXT USING competition_id::TEXT;
        END IF;
        IF teams_comp_type = 'uuid' THEN
            ALTER TABLE public.teams ALTER COLUMN competition_id TYPE TEXT USING competition_id::TEXT;
        END IF;
        ALTER TABLE public.competitions ALTER COLUMN id DROP DEFAULT;
        ALTER TABLE public.competitions ALTER COLUMN id TYPE TEXT USING id::TEXT;
    END IF;
END $$;

-- 2. Add canonical schema columns: competitions(id, code, name, country, sport, aliases, sort_order)
ALTER TABLE public.competitions
    ADD COLUMN IF NOT EXISTS sport TEXT NOT NULL DEFAULT 'football',
    ADD COLUMN IF NOT EXISTS aliases TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 100;

UPDATE public.competitions
SET sport = 'football'
WHERE sport IS NULL OR sport NOT IN ('football', 'basketball');

ALTER TABLE public.competitions DROP CONSTRAINT IF EXISTS competitions_sport_check;
ALTER TABLE public.competitions ADD CONSTRAINT competitions_sport_check CHECK (sport IN ('football', 'basketball'));

-- Remove stale non-canonical duplicate rows whose code collides with canonical entries
DELETE FROM public.competitions
WHERE id NOT LIKE 'comp_%'
  AND UPPER(code) IN (
    'PL', 'CL', 'PD', 'BL1', 'SA', 'FL1', 'ELC', 'DED', 'PPL', 'BSA', 'CLI',
    'SC0', 'DNK', 'TSL', 'B1', 'AUT', 'D2', 'SP2', 'I2', 'F2', 'E2', 'E3', 'EC',
    'G1', 'NOR', 'SWE', 'SWZ', 'POL', 'ROU', 'RUS', 'SC1', 'SC2', 'SC3', 'IRL',
    'FIN', 'USA', 'MEX', 'ARG', 'JPN', 'CHN', 'EURO', 'WC', 'NBA', 'NCAAB', 'EUROLEAGUE'
  );

-- 3. Upsert full canonical Football + Basketball competition registry
INSERT INTO public.competitions (
    id, code, name, country, sport, aliases, sort_order, emblem_url, tier, avg_goals_per_game, avg_corners_per_game, avg_cards_per_game, is_active
)
VALUES
    ('comp_pl', 'PL', 'Premier League', 'England', 'football', ARRAY['epl', 'england', 'english premier league', 'premiership', 'barclays premier league', 'e0', 'eng.1'], 10, 'https://crests.football-data.org/PL.png', 1, 2.88, 10.45, 4.12, TRUE),
    ('comp_cl', 'CL', 'UEFA Champions League', 'Europe', 'football', ARRAY['ucl', 'champions league', 'uefa cl', 'european cup', 'uefa.champions'], 12, 'https://crests.football-data.org/CL.png', 1, 3.02, 9.85, 3.95, TRUE),
    ('comp_pd', 'PD', 'La Liga', 'Spain', 'football', ARRAY['laliga', 'spain', 'spanish la liga', 'primera division', 'laliga ea sports', 'sp1', 'esp.1'], 15, 'https://crests.football-data.org/PD.png', 1, 2.54, 9.30, 4.88, TRUE),
    ('comp_bl1', 'BL1', 'Bundesliga', 'Germany', 'football', ARRAY['bundes', 'germany', 'german bundesliga', '1. bundesliga', 'd1', 'ger.1', 'ger bi', 'ger b1'], 20, 'https://crests.football-data.org/BL1.png', 1, 3.18, 10.15, 3.75, TRUE),
    ('comp_sa', 'SA', 'Serie A', 'Italy', 'football', ARRAY['italy', 'italian serie a', 'calcio', 'serie a enilive', 'i1', 'ita.1'], 25, 'https://crests.football-data.org/SA.png', 1, 2.62, 9.60, 4.50, TRUE),
    ('comp_fl1', 'FL1', 'Ligue 1', 'France', 'football', ARRAY['france', 'french ligue 1', 'ligue 1 mcdonalds', 'f1', 'fra.1'], 30, 'https://crests.football-data.org/FL1.png', 1, 2.70, 9.75, 3.85, TRUE),
    ('comp_elc', 'ELC', 'Championship', 'England', 'football', ARRAY['efl championship', 'england', 'english championship', 'e1', 'eng.2'], 35, 'https://crests.football-data.org/ELC.png', 2, 2.65, 10.20, 4.25, TRUE),
    ('comp_ded', 'DED', 'Eredivisie', 'Netherlands', 'football', ARRAY['netherlands', 'holland', 'dutch eredivisie', 'n1', 'ned.1'], 40, 'https://crests.football-data.org/DED.png', 1, 3.05, 10.35, 3.65, TRUE),
    ('comp_ppl', 'PPL', 'Primeira Liga', 'Portugal', 'football', ARRAY['portugal', 'liga portugal', 'p1', 'por.1'], 45, 'https://crests.football-data.org/PPL.png', 1, 2.62, 9.90, 4.80, TRUE),
    ('comp_bsa', 'BSA', 'Campeonato Brasileiro Série A', 'Brazil', 'football', ARRAY['brasileirao', 'brasileirao serie a', 'brazil', 'brasil', 'serie a brazil', 'sao', 'sao paulo', 'rio', 'bra', 'bra.1'], 50, 'https://crests.football-data.org/BSA.png', 1, 2.48, 9.80, 4.90, TRUE),
    ('comp_cli', 'CLI', 'Copa Libertadores', 'South America', 'football', ARRAY['libertadores', 'conmebol libertadores', 'south america'], 55, 'https://crests.football-data.org/CLI.svg', 2, 2.45, 9.60, 5.10, TRUE),
    ('comp_sc0', 'SC0', 'Scottish Premiership', 'Scotland', 'football', ARRAY['scotland', 'spfl', 'scottish prem', 'sco.1', 'sco p', 'sp'], 60, '', 1, 2.74, 10.10, 4.05, TRUE),
    ('comp_dnk', 'DNK', 'Danish Superliga', 'Denmark', 'football', ARRAY['denmark', 'superligaen', '3f superliga', 'den.1', 'dnk sl'], 65, '', 1, 2.82, 9.70, 3.85, TRUE),
    ('comp_tsl', 'TSL', 'Süper Lig', 'Turkey', 'football', ARRAY['turkey', 'turkiye', 'super lig', 'trendyol super lig', 't1', 'tur.1'], 70, '', 1, 2.78, 9.60, 4.70, TRUE),
    ('comp_b1', 'B1', 'Belgian Pro League', 'Belgium', 'football', ARRAY['belgium', 'jupiler pro league', 'bel.1'], 75, '', 1, 2.85, 10.10, 4.00, TRUE),
    ('comp_aut', 'AUT', 'Austrian Bundesliga', 'Austria', 'football', ARRAY['austria', 'admiral bundesliga', 'aut.1'], 80, '', 1, 2.95, 9.80, 4.20, TRUE),
    ('comp_d2', 'D2', '2. Bundesliga', 'Germany', 'football', ARRAY['germany', 'zweite bundesliga', '2 bundesliga', 'ger.2'], 85, '', 2, 3.00, 10.00, 4.10, TRUE),
    ('comp_sp2', 'SP2', 'Segunda División', 'Spain', 'football', ARRAY['spain', 'laliga 2', 'segunda division', 'esp.2'], 90, '', 2, 2.28, 9.20, 5.10, TRUE),
    ('comp_i2', 'I2', 'Serie B', 'Italy', 'football', ARRAY['italy', 'ita.2'], 95, '', 2, 2.45, 9.50, 4.75, TRUE),
    ('comp_f2', 'F2', 'Ligue 2', 'France', 'football', ARRAY['france', 'fra.2'], 100, '', 2, 2.38, 9.30, 3.95, TRUE),
    ('comp_e2', 'E2', 'League One', 'England', 'football', ARRAY['england', 'efl league one', 'eng.3'], 105, 'https://crests.football-data.org/ED.png', 3, 2.60, 10.10, 4.15, TRUE),
    ('comp_e3', 'E3', 'League Two', 'England', 'football', ARRAY['england', 'efl league two', 'eng.4'], 110, 'https://crests.football-data.org/ED.png', 4, 2.58, 10.05, 4.20, TRUE),
    ('comp_eng_national_league', 'EC', 'National League', 'England', 'football', ARRAY['england', 'vanarama national league', 'eng.5', 'ec'], 115, '', 5, 2.65, 9.90, 3.90, TRUE),
    ('comp_g1', 'G1', 'Super League Greece', 'Greece', 'football', ARRAY['greece', 'gre.1'], 120, '', 1, 2.42, 9.10, 4.85, TRUE),
    ('comp_nor', 'NOR', 'Eliteserien', 'Norway', 'football', ARRAY['norway', 'nor.1'], 125, '', 1, 2.95, 10.10, 3.60, TRUE),
    ('comp_swe', 'SWE', 'Allsvenskan', 'Sweden', 'football', ARRAY['sweden', 'swe.1'], 130, '', 1, 2.80, 10.00, 3.70, TRUE),
    ('comp_swz', 'SWZ', 'Swiss Super League', 'Switzerland', 'football', ARRAY['switzerland', 'sui', 'sui.1'], 135, '', 1, 2.92, 9.90, 4.25, TRUE),
    ('comp_pol', 'POL', 'Ekstraklasa', 'Poland', 'football', ARRAY['poland', 'pol.1'], 140, '', 1, 2.58, 9.70, 4.30, TRUE),
    ('comp_rou', 'ROU', 'Liga I', 'Romania', 'football', ARRAY['romania', 'superliga romania', 'rom', 'rou.1'], 145, '', 1, 2.40, 9.30, 4.60, TRUE),
    ('comp_rus', 'RUS', 'Russian Premier League', 'Russia', 'football', ARRAY['russia', 'rpl', 'rus.1'], 150, '', 1, 2.55, 9.50, 4.40, TRUE),
    ('comp_sc1', 'SC1', 'Scottish Championship', 'Scotland', 'football', ARRAY['scotland', 'sco.2'], 155, '', 2, 2.68, 10.00, 4.10, TRUE),
    ('comp_sc2', 'SC2', 'Scottish League One', 'Scotland', 'football', ARRAY['scotland', 'sco.3'], 160, '', 3, 2.72, 9.85, 4.05, TRUE),
    ('comp_sc3', 'SC3', 'Scottish League Two', 'Scotland', 'football', ARRAY['scotland', 'sco.4'], 165, '', 4, 2.75, 9.75, 4.00, TRUE),
    ('comp_irl', 'IRL', 'League of Ireland Premier Division', 'Ireland', 'football', ARRAY['ireland', 'loi', 'irl.1'], 170, '', 1, 2.45, 9.60, 4.10, TRUE),
    ('comp_fin', 'FIN', 'Veikkausliiga', 'Finland', 'football', ARRAY['finland', 'fin.1'], 175, '', 1, 2.75, 9.40, 3.70, TRUE),
    ('comp_usa', 'USA', 'Major League Soccer', 'USA', 'football', ARRAY['mls', 'united states', 'america', 'usa.1'], 180, '', 1, 2.95, 9.80, 4.00, TRUE),
    ('comp_mex', 'MEX', 'Liga MX', 'Mexico', 'football', ARRAY['mexico', 'mex.1'], 185, '', 1, 2.70, 9.50, 4.50, TRUE),
    ('comp_arg', 'ARG', 'Liga Profesional', 'Argentina', 'football', ARRAY['argentina', 'primera division argentina', 'arg.1'], 190, '', 1, 2.25, 9.40, 5.10, TRUE),
    ('comp_jpn', 'JPN', 'J1 League', 'Japan', 'football', ARRAY['japan', 'j league', 'j1 league', 'jpn.1'], 195, '', 1, 2.60, 9.30, 3.10, TRUE),
    ('comp_chn', 'CHN', 'Chinese Super League', 'China', 'football', ARRAY['china', 'csl', 'chn.1'], 200, '', 1, 2.80, 9.50, 3.90, TRUE),
    ('comp_euro', 'EURO', 'UEFA European Championship', 'Europe', 'football', ARRAY['euro', 'euros', 'uefa euro', 'euro championship'], 205, 'https://crests.football-data.org/ec.png', 1, 2.55, 9.80, 3.90, TRUE),
    ('comp_wc', 'WC', 'FIFA World Cup', 'World', 'football', ARRAY['world cup', 'fifa wc', 'mundial'], 210, 'https://crests.football-data.org/qatar.png', 1, 2.65, 9.70, 3.80, TRUE),
    ('comp_nba', 'NBA', 'National Basketball Association', 'USA', 'basketball', ARRAY['nba', 'usa basketball', 'pro basketball', 'us'], 10, 'https://a.espncdn.com/i/teamlogos/leagues/500/nba.png', 1, 226.40, 0.00, 0.00, TRUE),
    ('comp_ncaab', 'NCAAB', 'NCAA Men Division I', 'USA', 'basketball', ARRAY['ncaab', 'ncaa', 'march madness', 'college basketball', 'ncaa men'], 20, '', 1, 149.80, 0.00, 0.00, TRUE),
    ('comp_euroleague', 'EUROLEAGUE', 'EuroLeague', 'Europe', 'basketball', ARRAY['euroleague', 'euro league', 'european basketball', 'el'], 30, '', 1, 172.80, 0.00, 0.00, TRUE)
ON CONFLICT (id) DO UPDATE
SET code = EXCLUDED.code,
    name = EXCLUDED.name,
    country = EXCLUDED.country,
    sport = EXCLUDED.sport,
    aliases = EXCLUDED.aliases,
    sort_order = EXCLUDED.sort_order,
    emblem_url = EXCLUDED.emblem_url,
    tier = EXCLUDED.tier,
    avg_goals_per_game = EXCLUDED.avg_goals_per_game,
    avg_corners_per_game = EXCLUDED.avg_corners_per_game,
    avg_cards_per_game = EXCLUDED.avg_cards_per_game,
    is_active = EXCLUDED.is_active;

-- 4. Indexes for fast competition catalog & fixture filtering
CREATE INDEX IF NOT EXISTS idx_competitions_sport_sort ON public.competitions (sport, sort_order, name);
CREATE INDEX IF NOT EXISTS idx_fixtures_comp_kickoff ON public.fixtures (competition_id, kickoff_time);

-- 5. Backfill unambiguous fixtures.competition_id from canonical competition_code only where missing/non-canonical
UPDATE public.fixtures f
SET competition_id = c.id
FROM public.competitions c
WHERE (f.competition_id IS NULL OR f.competition_id NOT LIKE 'comp_%')
  AND f.competition_code IS NOT NULL
  AND UPPER(TRIM(f.competition_code)) = UPPER(c.code)
  AND UPPER(TRIM(f.competition_code)) <> 'EC';

-- Disambiguate 'EC' safely based on source provider when missing canonical competition_id
UPDATE public.fixtures
SET competition_id = 'comp_euro'
WHERE (competition_id IS NULL OR competition_id NOT LIKE 'comp_%')
  AND UPPER(TRIM(COALESCE(competition_code, ''))) = 'EC'
  AND LOWER(COALESCE(source, '')) LIKE '%football-data.org%';

UPDATE public.fixtures
SET competition_id = 'comp_eng_national_league'
WHERE (competition_id IS NULL OR competition_id NOT LIKE 'comp_%')
  AND UPPER(TRIM(COALESCE(competition_code, ''))) = 'EC'
  AND LOWER(COALESCE(source, '')) LIKE '%co.uk%';

-- 6. Hardened RLS & Privileges: only service_role reads/writes server-side competition catalog
ALTER TABLE public.competitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read access for competitions" ON public.competitions;
DROP POLICY IF EXISTS "Service role full access competitions" ON public.competitions;

REVOKE ALL ON TABLE public.competitions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.competitions TO service_role;

CREATE POLICY "Service role full access competitions"
    ON public.competitions
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

COMMIT;
