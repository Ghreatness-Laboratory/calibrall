-- ====================================================================
-- CALIBRALL: Runtime Explanation Consistency Issues Table
-- Migration: 20261127000001_explanation_issues.sql
-- ====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.explanation_issues (
    id TEXT PRIMARY KEY,
    sport TEXT NOT NULL DEFAULT 'football',
    fixture_id TEXT NOT NULL,
    match_title TEXT NOT NULL,
    market_code TEXT NULL,
    selection TEXT NULL,
    issue_code TEXT NOT NULL,
    issue_detail TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'error',
    fallback_applied BOOLEAN NOT NULL DEFAULT false,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_explanation_issues_detected ON public.explanation_issues (detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_explanation_issues_fixture ON public.explanation_issues (fixture_id);

ALTER TABLE public.explanation_issues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read explanation_issues" ON public.explanation_issues;
CREATE POLICY "Admins read explanation_issues"
    ON public.explanation_issues
    FOR SELECT
    TO authenticated
    USING (public.is_current_user_admin());

DROP POLICY IF EXISTS "Service role manages explanation_issues" ON public.explanation_issues;
CREATE POLICY "Service role manages explanation_issues"
    ON public.explanation_issues
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

COMMIT;
