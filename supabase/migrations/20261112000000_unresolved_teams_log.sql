-- ====================================================================
-- CALIBRALL: Persistent Unresolved Teams Log Table
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

CREATE INDEX IF NOT EXISTS idx_unresolved_teams_resolved ON public.unresolved_teams(resolved);

ALTER TABLE public.unresolved_teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read unresolved teams" ON public.unresolved_teams;
CREATE POLICY "Public read unresolved teams" ON public.unresolved_teams FOR SELECT USING (true);

DROP POLICY IF EXISTS "Service role write unresolved teams" ON public.unresolved_teams;
CREATE POLICY "Service role write unresolved teams" ON public.unresolved_teams FOR ALL TO service_role USING (true) WITH CHECK (true);
