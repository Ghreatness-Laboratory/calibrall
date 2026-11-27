-- ====================================================================
-- CALIBRALL: 7-Day Free Trial Lifecycle, Email Confirmation Gate & Admin RPC Updates
-- Migration: 20261129000000_seven_day_free_trial.sql
-- ====================================================================

BEGIN;

-- 1. ADD TRIAL & REMINDER COLUMNS TO PROFILES
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
    ADD COLUMN IF NOT EXISTS trial_reminder_5d_sent_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS trial_ended_email_sent_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_trial_ends_at ON public.profiles (trial_ends_at);

-- 2. GRANDFATHER EXISTING NON-ADMIN USERS WITH A FULL 7-DAY TRIAL FROM MIGRATION TIME
-- Ensures existing accounts are never locked out immediately on rollout.
UPDATE public.profiles
SET
    trial_started_at = COALESCE(trial_started_at, NOW()),
    trial_ends_at = NOW() + INTERVAL '7 days'
WHERE role <> 'admin';

-- 3. PREVENT CLIENT-SIDE TAMPERING WITH TRIAL COLUMNS
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

-- 4. SIGN-UP TRIGGER: START 7-DAY TRIAL ONLY ONCE EMAIL IS CONFIRMED
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    initial_name TEXT;
    confirmed_ts TIMESTAMPTZ;
    start_ts TIMESTAMPTZ;
    end_ts TIMESTAMPTZ;
BEGIN
    initial_name := COALESCE(
        NULLIF(TRIM(NEW.raw_user_meta_data ->> 'display_name'), ''),
        NULLIF(TRIM(NEW.raw_user_meta_data ->> 'full_name'), ''),
        NULLIF(TRIM(NEW.raw_user_meta_data ->> 'name'), ''),
        NULLIF(SPLIT_PART(COALESCE(NEW.email, ''), '@', 1), '')
    );

    confirmed_ts := NEW.email_confirmed_at;
    IF confirmed_ts IS NOT NULL THEN
        start_ts := confirmed_ts;
        end_ts := confirmed_ts + INTERVAL '7 days';
    ELSE
        start_ts := NULL;
        end_ts := NULL;
    END IF;

    INSERT INTO public.profiles (
        id,
        email,
        display_name,
        role,
        tier,
        tier_expires_at,
        trial_started_at,
        trial_ends_at,
        created_at
    )
    VALUES (
        NEW.id,
        NEW.email,
        initial_name,
        'user',
        'free',
        NULL,
        start_ts,
        end_ts,
        COALESCE(NEW.created_at, NOW())
    )
    ON CONFLICT (id) DO UPDATE
    SET email = COALESCE(public.profiles.email, EXCLUDED.email),
        display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name),
        trial_started_at = COALESCE(public.profiles.trial_started_at, EXCLUDED.trial_started_at),
        trial_ends_at = COALESCE(public.profiles.trial_ends_at, EXCLUDED.trial_ends_at);

    RETURN NEW;
END;
$$;

-- Activate trial strictly once when email_confirmed_at transitions from NULL to non-NULL
CREATE OR REPLACE FUNCTION public.handle_user_email_confirmed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL THEN
        UPDATE public.profiles
        SET
            trial_started_at = COALESCE(trial_started_at, NEW.email_confirmed_at, NOW()),
            trial_ends_at = COALESCE(trial_ends_at, COALESCE(NEW.email_confirmed_at, NOW()) + INTERVAL '7 days')
        WHERE id = NEW.id
          AND trial_started_at IS NULL;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_email_confirmed
    AFTER UPDATE OF email_confirmed_at ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_user_email_confirmed();

-- 5. UPDATE ADMIN USER RPCs TO EXPOSE TRIAL COLUMNS & STATUS FILTERS
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
