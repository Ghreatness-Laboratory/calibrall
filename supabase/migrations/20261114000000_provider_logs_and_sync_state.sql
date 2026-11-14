-- ====================================================================
-- CALIBRALL: Provider Call Telemetry, Quota State & Fixture Payload Migration
-- Migration: 20261114000000_provider_logs_and_sync_state.sql
-- ====================================================================

BEGIN;

ALTER TABLE public.fixtures ADD COLUMN IF NOT EXISTS payload_json TEXT;

CREATE TABLE IF NOT EXISTS public.provider_call_logs (
    id TEXT PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    provider TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    method TEXT NOT NULL DEFAULT 'GET',
    status_code INTEGER,
    ok INTEGER NOT NULL DEFAULT 0,
    latency_ms INTEGER,
    league_code TEXT,
    sync_mode TEXT,
    quota_headers_json TEXT,
    quota_remaining TEXT,
    response_body TEXT,
    error TEXT
);

CREATE INDEX IF NOT EXISTS idx_provider_call_logs_ts ON public.provider_call_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_provider_call_logs_provider ON public.provider_call_logs(provider, timestamp DESC);

CREATE TABLE IF NOT EXISTS public.provider_sync_state (
    id TEXT PRIMARY KEY,
    sport TEXT,
    provider_name TEXT,
    status TEXT,
    last_attempt_at TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ,
    last_error TEXT,
    last_http_status INTEGER,
    last_response_body TEXT,
    quota_remaining TEXT,
    quota_headers_json TEXT,
    skipped_leagues_json TEXT,
    calls_used_last_run INTEGER DEFAULT 0,
    calls_today INTEGER DEFAULT 0,
    budget_date TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.provider_call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_sync_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access provider_call_logs" ON public.provider_call_logs;
CREATE POLICY "Service role full access provider_call_logs" ON public.provider_call_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access provider_sync_state" ON public.provider_sync_state;
CREATE POLICY "Service role full access provider_sync_state" ON public.provider_sync_state FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public read provider_sync_state" ON public.provider_sync_state;
CREATE POLICY "Public read provider_sync_state" ON public.provider_sync_state FOR SELECT USING (true);

COMMIT;
