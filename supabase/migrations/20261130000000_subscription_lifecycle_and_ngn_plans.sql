-- ====================================================================
-- CALIBRALL: Subscription Lifecycle (Pending Downgrade, Cancel/Resume,
--            Renewal Reminders & Sanitized Raw Webhook Storage)
-- Migration: 20261130000000_subscription_lifecycle_and_ngn_plans.sql
-- ====================================================================

BEGIN;

-- 1. ADD SUBSCRIPTION LIFECYCLE COLUMNS TO PROFILES
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS pending_tier TEXT NULL,
    ADD COLUMN IF NOT EXISTS pending_tier_effective_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS renewal_reminder_sent_at TIMESTAMPTZ NULL;

DO $$
BEGIN
    ALTER TABLE public.profiles
        ADD CONSTRAINT profiles_pending_tier_check
        CHECK (pending_tier IS NULL OR pending_tier IN ('pro', 'premium'));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_pending_tier
    ON public.profiles (pending_tier, pending_tier_effective_at)
    WHERE pending_tier IS NOT NULL;

-- 2. ADD SANITIZED RAW WEBHOOK COLUMN TO PAYSTACK PAYMENTS
ALTER TABLE public.paystack_payments
    ADD COLUMN IF NOT EXISTS raw_webhook JSONB NULL;

-- 3. PREVENT CLIENT-SIDE TAMPERING WITH SUBSCRIPTION LIFECYCLE COLUMNS
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
    IF NEW.pending_tier IS DISTINCT FROM OLD.pending_tier THEN
        RAISE EXCEPTION 'Only service role can modify pending_tier';
    END IF;
    IF NEW.pending_tier_effective_at IS DISTINCT FROM OLD.pending_tier_effective_at THEN
        RAISE EXCEPTION 'Only service role can modify pending_tier_effective_at';
    END IF;
    IF NEW.cancel_at_period_end IS DISTINCT FROM OLD.cancel_at_period_end THEN
        RAISE EXCEPTION 'Only service role can modify cancel_at_period_end';
    END IF;
    IF NEW.renewal_reminder_sent_at IS DISTINCT FROM OLD.renewal_reminder_sent_at THEN
        RAISE EXCEPTION 'Only service role can modify renewal_reminder_sent_at';
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
    IF NEW.trial_started_at IS DISTINCT FROM OLD.trial_started_at THEN
        RAISE EXCEPTION 'Only service role can modify trial_started_at';
    END IF;
    IF NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at THEN
        RAISE EXCEPTION 'Only service role can modify trial_ends_at';
    END IF;
    IF NEW.trial_reminder_5d_sent_at IS DISTINCT FROM OLD.trial_reminder_5d_sent_at THEN
        RAISE EXCEPTION 'Only service role can modify trial reminder flags';
    END IF;
    IF NEW.trial_ended_email_sent_at IS DISTINCT FROM OLD.trial_ended_email_sent_at THEN
        RAISE EXCEPTION 'Only service role can modify trial reminder flags';
    END IF;

    RETURN NEW;
END;
$$;

-- 4. UPDATE ADMIN USER RPCs TO EXPOSE PENDING TIER & CANCEL FLAGS
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
            LOWER(p_status) = 'paid'
            AND p.role = 'user'
            AND p.tier IN ('pro', 'premium')
            AND COALESCE(p.suspended, false) = false
            AND (p.tier_expires_at IS NULL OR p.tier_expires_at > NOW())
        )
        OR (
            LOWER(p_status) = 'trial'
            AND p.role = 'user'
            AND p.tier = 'free'
            AND COALESCE(p.suspended, false) = false
            AND p.trial_ends_at IS NOT NULL
            AND p.trial_ends_at > NOW()
        )
        OR (
            LOWER(p_status) = 'expired'
            AND p.role = 'user'
            AND COALESCE(p.suspended, false) = false
            AND (
                (p.tier IN ('pro', 'premium') AND p.tier_expires_at IS NOT NULL AND p.tier_expires_at <= NOW())
                OR (p.tier = 'free' AND (p.trial_ends_at IS NULL OR p.trial_ends_at <= NOW()))
            )
        )
        OR (
            LOWER(p_status) = 'expiring'
            AND p.role = 'user'
            AND p.tier IN ('pro', 'premium')
            AND COALESCE(p.suspended, false) = false
            AND p.tier_expires_at IS NOT NULL
            AND p.tier_expires_at > NOW()
            AND p.tier_expires_at <= NOW() + INTERVAL '7 days'
        )
        OR (
            LOWER(p_status) = 'trial_ending_3d'
            AND p.role = 'user'
            AND p.tier = 'free'
            AND COALESCE(p.suspended, false) = false
            AND p.trial_ends_at IS NOT NULL
            AND p.trial_ends_at > NOW()
            AND p.trial_ends_at <= NOW() + INTERVAL '3 days'
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
            p.pending_tier AS "pendingTier",
            p.pending_tier_effective_at AS "pendingTierEffectiveAt",
            COALESCE(p.cancel_at_period_end, false) AS "cancelAtPeriodEnd",
            p.trial_started_at AS "trialStartedAt",
            p.trial_ends_at AS "trialEndsAt",
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
                LOWER(p_status) = 'paid'
                AND p.role = 'user'
                AND p.tier IN ('pro', 'premium')
                AND COALESCE(p.suspended, false) = false
                AND (p.tier_expires_at IS NULL OR p.tier_expires_at > NOW())
            )
            OR (
                LOWER(p_status) = 'trial'
                AND p.role = 'user'
                AND p.tier = 'free'
                AND COALESCE(p.suspended, false) = false
                AND p.trial_ends_at IS NOT NULL
                AND p.trial_ends_at > NOW()
            )
            OR (
                LOWER(p_status) = 'expired'
                AND p.role = 'user'
                AND COALESCE(p.suspended, false) = false
                AND (
                    (p.tier IN ('pro', 'premium') AND p.tier_expires_at IS NOT NULL AND p.tier_expires_at <= NOW())
                    OR (p.tier = 'free' AND (p.trial_ends_at IS NULL OR p.trial_ends_at <= NOW()))
                )
            )
            OR (
                LOWER(p_status) = 'expiring'
                AND p.role = 'user'
                AND p.tier IN ('pro', 'premium')
                AND COALESCE(p.suspended, false) = false
                AND p.tier_expires_at IS NOT NULL
                AND p.tier_expires_at > NOW()
                AND p.tier_expires_at <= NOW() + INTERVAL '7 days'
            )
            OR (
                LOWER(p_status) = 'trial_ending_3d'
                AND p.role = 'user'
                AND p.tier = 'free'
                AND COALESCE(p.suspended, false) = false
                AND p.trial_ends_at IS NOT NULL
                AND p.trial_ends_at > NOW()
                AND p.trial_ends_at <= NOW() + INTERVAL '3 days'
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
        'pendingTier', p.pending_tier,
        'pendingTierEffectiveAt', p.pending_tier_effective_at,
        'cancelAtPeriodEnd', COALESCE(p.cancel_at_period_end, false),
        'trialStartedAt', p.trial_started_at,
        'trialEndsAt', p.trial_ends_at,
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

COMMIT;
