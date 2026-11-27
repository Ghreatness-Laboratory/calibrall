-- ====================================================================
-- CALIBRALL: Admin Panel, Audit Log, Suspended Profiles,
--            Paystack Payments & Pick Moderation
-- Migration: 20261128000000_admin_panel_audit_payments.sql
-- ====================================================================

BEGIN;

-- 1. PROFILES: SUSPENSION COLUMNS + PRIVILEGED COLUMN GUARD UPDATE
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS suspended BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS suspended_reason TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles (role);
CREATE INDEX IF NOT EXISTS idx_profiles_tier_expiry ON public.profiles (tier, tier_expires_at);
CREATE INDEX IF NOT EXISTS idx_profiles_created_at ON public.profiles (created_at DESC);

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
    IF NEW.suspended IS DISTINCT FROM OLD.suspended THEN
        RAISE EXCEPTION 'Only service role can modify suspended status';
    END IF;
    IF NEW.suspended_at IS DISTINCT FROM OLD.suspended_at THEN
        RAISE EXCEPTION 'Only service role can modify suspended_at';
    END IF;
    IF NEW.suspended_reason IS DISTINCT FROM OLD.suspended_reason THEN
        RAISE EXCEPTION 'Only service role can modify suspended_reason';
    END IF;

    RETURN NEW;
END;
$$;

-- Helper used by RLS policies and security-definer functions
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = auth.uid()
          AND role = 'admin'
          AND COALESCE(suspended, false) = false
    );
$$;

REVOKE ALL ON FUNCTION public.is_current_user_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated, service_role;

-- 2. ADMIN AUDIT LOG TABLE (Admin & service_role only)
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
    admin_email TEXT,
    target_user_id UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL DEFAULT 'user',
    entity_id TEXT NULL,
    before_state JSONB NULL,
    after_state JSONB NULL,
    note TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON public.admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target_user ON public.admin_audit_log (target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin_id ON public.admin_audit_log (admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action ON public.admin_audit_log (action);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read admin_audit_log" ON public.admin_audit_log;
DROP POLICY IF EXISTS "Service role full access admin_audit_log" ON public.admin_audit_log;

REVOKE ALL ON TABLE public.admin_audit_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.admin_audit_log TO authenticated;
GRANT ALL ON TABLE public.admin_audit_log TO service_role;

CREATE POLICY "Admins read admin_audit_log"
    ON public.admin_audit_log
    FOR SELECT
    TO authenticated
    USING (public.is_current_user_admin());

CREATE POLICY "Service role full access admin_audit_log"
    ON public.admin_audit_log
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 3. PAYSTACK PAYMENTS & MANUAL GRANTS TABLE (Admin & service_role only)
CREATE TABLE IF NOT EXISTS public.paystack_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
    email TEXT,
    reference TEXT UNIQUE NOT NULL,
    plan TEXT NOT NULL,
    amount_kobo BIGINT NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'NGN',
    status TEXT NOT NULL DEFAULT 'success',
    channel TEXT NULL,
    is_manual_grant BOOLEAN NOT NULL DEFAULT false,
    granted_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
    grant_note TEXT NULL,
    paid_at TIMESTAMPTZ NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_paystack_payments_created_at ON public.paystack_payments (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_paystack_payments_user_id ON public.paystack_payments (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_paystack_payments_status ON public.paystack_payments (status);

ALTER TABLE public.paystack_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read paystack_payments" ON public.paystack_payments;
DROP POLICY IF EXISTS "Service role full access paystack_payments" ON public.paystack_payments;

REVOKE ALL ON TABLE public.paystack_payments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.paystack_payments TO authenticated;
GRANT ALL ON TABLE public.paystack_payments TO service_role;

CREATE POLICY "Admins read paystack_payments"
    ON public.paystack_payments
    FOR SELECT
    TO authenticated
    USING (public.is_current_user_admin());

CREATE POLICY "Service role full access paystack_payments"
    ON public.paystack_payments
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 4. PICK MODERATION COLUMNS ON football_picks & bb_picks
CREATE TABLE IF NOT EXISTS public.football_picks (
    fixture_id TEXT PRIMARY KEY,
    competition_code TEXT,
    kickoff_time TEXT,
    market_code TEXT,
    market_name TEXT,
    selection TEXT,
    calibrated_probability NUMERIC(6, 4),
    confidence_tier TEXT,
    price_source TEXT,
    summary TEXT NOT NULL DEFAULT '',
    reasoning_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    alternates_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    model_version TEXT NOT NULL DEFAULT 'v2.5.0',
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.football_picks
    ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS voided_reason TEXT NULL,
    ADD COLUMN IF NOT EXISTS moderated_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ NULL;

ALTER TABLE public.football_picks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.football_picks FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.football_picks TO service_role;
DROP POLICY IF EXISTS "Service role only football_picks" ON public.football_picks;
CREATE POLICY "Service role only football_picks"
    ON public.football_picks
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

ALTER TABLE public.bb_picks
    ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS voided_reason TEXT NULL,
    ADD COLUMN IF NOT EXISTS moderated_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ NULL;

-- 5. SECURITY DEFINER FUNCTIONS FOR auth.users.last_sign_in_at & DB SIZE (ADMIN ONLY)
CREATE OR REPLACE FUNCTION public.get_admin_users_page(
    p_search TEXT DEFAULT '',
    p_tier TEXT DEFAULT 'all',
    p_role TEXT DEFAULT 'all',
    p_status TEXT DEFAULT 'all',
    p_limit INTEGER DEFAULT 25,
    p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    jwt_role TEXT := COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), '');
    safe_limit INTEGER := GREATEST(1, LEAST(100, COALESCE(p_limit, 25)));
    safe_offset INTEGER := GREATEST(0, COALESCE(p_offset, 0));
    search_pat TEXT := '%' || LOWER(TRIM(COALESCE(p_search, ''))) || '%';
    total_count INTEGER := 0;
    user_rows JSONB := '[]'::JSONB;
BEGIN
    IF NOT (
        current_user IN ('postgres', 'supabase_admin', 'service_role')
        OR jwt_role = 'service_role'
        OR public.is_current_user_admin()
    ) THEN
        RAISE EXCEPTION 'Forbidden: Admin access required';
    END IF;

    SELECT COUNT(*)::INTEGER
    INTO total_count
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    WHERE (
        TRIM(COALESCE(p_search, '')) = ''
        OR LOWER(COALESCE(p.email, u.email, '')) LIKE search_pat
        OR LOWER(COALESCE(p.display_name, '')) LIKE search_pat
        OR p.id::TEXT ILIKE search_pat
    )
    AND (LOWER(COALESCE(p_tier, 'all')) = 'all' OR p.tier = LOWER(p_tier))
    AND (LOWER(COALESCE(p_role, 'all')) = 'all' OR p.role = LOWER(p_role))
    AND (
        LOWER(COALESCE(p_status, 'all')) = 'all'
        OR (LOWER(p_status) = 'suspended' AND COALESCE(p.suspended, false) = true)
        OR (LOWER(p_status) = 'active' AND COALESCE(p.suspended, false) = false)
        OR (
            LOWER(p_status) = 'expiring'
            AND p.role = 'user'
            AND p.tier IN ('pro', 'premium')
            AND COALESCE(p.suspended, false) = false
            AND p.tier_expires_at IS NOT NULL
            AND p.tier_expires_at > NOW()
            AND p.tier_expires_at <= NOW() + INTERVAL '7 days'
        )
    );

    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::JSONB)
    INTO user_rows
    FROM (
        SELECT
            p.id,
            COALESCE(p.email, u.email) AS email,
            p.display_name AS "displayName",
            p.role,
            p.tier,
            p.tier_expires_at AS "tierExpiresAt",
            COALESCE(p.suspended, false) AS suspended,
            p.suspended_at AS "suspendedAt",
            p.suspended_reason AS "suspendedReason",
            p.created_at AS "createdAt",
            u.last_sign_in_at AS "lastSignInAt",
            u.email_confirmed_at AS "emailConfirmedAt"
        FROM public.profiles p
        LEFT JOIN auth.users u ON u.id = p.id
        WHERE (
            TRIM(COALESCE(p_search, '')) = ''
            OR LOWER(COALESCE(p.email, u.email, '')) LIKE search_pat
            OR LOWER(COALESCE(p.display_name, '')) LIKE search_pat
            OR p.id::TEXT ILIKE search_pat
        )
        AND (LOWER(COALESCE(p_tier, 'all')) = 'all' OR p.tier = LOWER(p_tier))
        AND (LOWER(COALESCE(p_role, 'all')) = 'all' OR p.role = LOWER(p_role))
        AND (
            LOWER(COALESCE(p_status, 'all')) = 'all'
            OR (LOWER(p_status) = 'suspended' AND COALESCE(p.suspended, false) = true)
            OR (LOWER(p_status) = 'active' AND COALESCE(p.suspended, false) = false)
            OR (
                LOWER(p_status) = 'expiring'
                AND p.role = 'user'
                AND p.tier IN ('pro', 'premium')
                AND COALESCE(p.suspended, false) = false
                AND p.tier_expires_at IS NOT NULL
                AND p.tier_expires_at > NOW()
                AND p.tier_expires_at <= NOW() + INTERVAL '7 days'
            )
        )
        ORDER BY p.created_at DESC, p.id ASC
        LIMIT safe_limit
        OFFSET safe_offset
    ) t;

    RETURN jsonb_build_object(
        'users', user_rows,
        'total', total_count
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_users_page(TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_users_page(TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.get_admin_user_detail(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    jwt_role TEXT := COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), '');
    result JSONB;
BEGIN
    IF NOT (
        current_user IN ('postgres', 'supabase_admin', 'service_role')
        OR jwt_role = 'service_role'
        OR public.is_current_user_admin()
    ) THEN
        RAISE EXCEPTION 'Forbidden: Admin access required';
    END IF;

    SELECT jsonb_build_object(
        'id', p.id,
        'email', COALESCE(p.email, u.email),
        'displayName', p.display_name,
        'role', p.role,
        'tier', p.tier,
        'tierExpiresAt', p.tier_expires_at,
        'suspended', COALESCE(p.suspended, false),
        'suspendedAt', p.suspended_at,
        'suspendedReason', p.suspended_reason,
        'createdAt', p.created_at,
        'lastSignInAt', u.last_sign_in_at,
        'emailConfirmedAt', u.email_confirmed_at
    )
    INTO result
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    WHERE p.id = p_user_id
    LIMIT 1;

    RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_user_detail(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_user_detail(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.get_calibrall_database_size()
RETURNS BIGINT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    jwt_role TEXT := COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), '');
BEGIN
    IF NOT (
        current_user IN ('postgres', 'supabase_admin', 'service_role')
        OR jwt_role = 'service_role'
        OR public.is_current_user_admin()
    ) THEN
        RAISE EXCEPTION 'Forbidden: Admin access required';
    END IF;

    RETURN pg_database_size(current_database())::BIGINT;
END;
$$;

REVOKE ALL ON FUNCTION public.get_calibrall_database_size() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_calibrall_database_size() TO service_role;

COMMIT;
