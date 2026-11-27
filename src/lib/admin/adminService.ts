import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  getLocalDatabase,
  isProductionRuntime,
  persistenceBackendInfo,
} from '@/lib/supabase/client';
import {
  evaluateDuePendingTierTransition,
  getEntitlements,
  getServerSupabaseConfig,
  getSupabaseServiceClient,
  normalizePendingTier,
  normalizeRole,
  normalizeTier,
  type AccountRole,
  type AccountTier,
  type EntitlementStatus,
  type ServerAuthSession,
} from '@/lib/supabase/serverAuth';
import { sanitizePaystackPayload } from '@/lib/payments/paystackService';
import { matchesStore } from '@/lib/data/matchesStore';
import { getBasketballDataStatus } from '@/lib/basketball/store';
import {
  getAllProviderSyncStates,
  getStoredSportFreshness,
} from '@/lib/data/providerCallLogger';
import { getBudgetSummary, PROVIDER_BUDGETS, type SyncMode } from '@/lib/data/providerBudget';
import { serverCache } from '@/lib/cache/serverCache';
import { bustBasketballSlateCache } from '@/lib/basketball/readService';
import { getFootballDataProvider } from '@/lib/data/provider';
import { syncBasketballLivePipeline } from '@/lib/basketball/liveSync';
import { fetchAllRows } from '@/lib/supabase/pagination';

export interface AdminUserRecord {
  id: string;
  email: string;
  displayName: string | null;
  role: AccountRole;
  tier: AccountTier;
  tierExpiresAt: string | null;
  pendingTier: 'pro' | 'premium' | null;
  pendingTierEffectiveAt: string | null;
  cancelAtPeriodEnd: boolean;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  trialDaysRemaining: number;
  accessStatus: EntitlementStatus;
  suspended: boolean;
  suspendedAt: string | null;
  suspendedReason: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  emailConfirmedAt?: string | null;
}

export interface AdminAuditLogRecord {
  id: string;
  adminId: string | null;
  adminEmail: string | null;
  targetUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  beforeState: Record<string, any> | null;
  afterState: Record<string, any> | null;
  note: string | null;
  createdAt: string;
}

export interface AdminPaymentRecord {
  id: string;
  userId: string | null;
  email: string | null;
  reference: string;
  plan: string;
  amountKobo: number;
  currency: string;
  status: string;
  channel: string | null;
  isManualGrant: boolean;
  grantedBy: string | null;
  grantNote: string | null;
  paidAt: string | null;
  createdAt: string;
  rawWebhook: Record<string, any> | null;
}

export interface AdminPickRecord {
  id: string;
  sport: 'football' | 'basketball';
  fixtureOrGameId: string;
  competitionCode: string;
  kickoffTime: string | null;
  marketCode: string;
  marketName: string;
  selection: string;
  line: number | null;
  probability: number | null;
  confidenceTier: string | null;
  qualificationStatus: string;
  summary: string;
  reasoning: Record<string, any>;
  alternates: Array<Record<string, any>>;
  modelVersion: string;
  isHidden: boolean;
  voidedReason: string | null;
  moderatedBy: string | null;
  moderatedAt: string | null;
  recordedAt: string | null;
}

export class AdminServiceError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function clampPagination(pageRaw: unknown, pageSizeRaw: unknown, defaultSize = 25) {
  const page = Math.max(1, Math.floor(Number(pageRaw) || 1));
  const pageSize = Math.max(1, Math.min(100, Math.floor(Number(pageSizeRaw) || defaultSize)));
  const offset = (page - 1) * pageSize;
  return { page, pageSize, offset };
}

function parseJsonSafe<T>(raw: unknown, fallback: T): T {
  if (raw === null || raw === undefined) return fallback;
  if (typeof raw === 'object') return raw as T;
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function getRemoteServiceClient() {
  const backend = persistenceBackendInfo();
  const serviceClient = getSupabaseServiceClient();
  if (backend.isRemoteSupabase) {
    if (!serviceClient) {
      throw new AdminServiceError('Supabase service role client is not configured.', 503);
    }
    return serviceClient;
  }
  if (isProductionRuntime()) {
    throw new AdminServiceError(backend.message, 503);
  }
  return serviceClient; // may be null in local SQLite mode
}

function requireLocalDb() {
  const db = getLocalDatabase();
  if (!db) {
    throw new AdminServiceError('Local database is unavailable.', 503);
  }
  return db;
}

function mapSqliteUserRow(r: any): AdminUserRecord {
  const role = normalizeRole(r.role);
  const tier = normalizeTier(r.tier);
  const tierExpiresAt = r.tier_expires_at ? String(r.tier_expires_at) : null;
  const pendingTier = normalizePendingTier(r.pending_tier);
  const pendingTierEffectiveAt = r.pending_tier_effective_at ? String(r.pending_tier_effective_at) : null;
  const cancelAtPeriodEnd = Boolean(r.cancel_at_period_end === 1 || r.cancel_at_period_end === true);
  const trialStartedAt = r.trial_started_at ? String(r.trial_started_at) : null;
  const trialEndsAt = r.trial_ends_at ? String(r.trial_ends_at) : null;
  const ent = getEntitlements({
    role,
    tier,
    tierExpiresAt,
    trialStartedAt,
    trialEndsAt,
    emailConfirmed: true,
  });

  return {
    id: String(r.id),
    email: String(r.email || ''),
    displayName: r.display_name ? String(r.display_name) : null,
    role,
    tier,
    tierExpiresAt,
    pendingTier,
    pendingTierEffectiveAt,
    cancelAtPeriodEnd,
    trialStartedAt,
    trialEndsAt,
    trialDaysRemaining: ent.trialDaysRemaining,
    accessStatus: ent.status,
    suspended: Boolean(r.suspended === 1 || r.suspended === true),
    suspendedAt: r.suspended_at ? String(r.suspended_at) : null,
    suspendedReason: r.suspended_reason ? String(r.suspended_reason) : null,
    createdAt: String(r.created_at || ''),
    lastSignInAt: r.last_sign_in_at ? String(r.last_sign_in_at) : null,
    emailConfirmedAt: null,
  };
}

function mapSupabaseProfileRow(r: any): AdminUserRecord {
  const role = normalizeRole(r.role);
  const tier = normalizeTier(r.tier);
  const tierExpiresAt =
    r.tierExpiresAt !== undefined
      ? r.tierExpiresAt
        ? String(r.tierExpiresAt)
        : null
      : r.tier_expires_at
      ? String(r.tier_expires_at)
      : null;
  const rawPending = r.pendingTier !== undefined ? r.pendingTier : r.pending_tier;
  const pendingTier = normalizePendingTier(rawPending);
  const pendingTierEffectiveAt =
    r.pendingTierEffectiveAt !== undefined
      ? r.pendingTierEffectiveAt
        ? String(r.pendingTierEffectiveAt)
        : null
      : r.pending_tier_effective_at
      ? String(r.pending_tier_effective_at)
      : null;
  const rawCancel = r.cancelAtPeriodEnd !== undefined ? r.cancelAtPeriodEnd : r.cancel_at_period_end;
  const cancelAtPeriodEnd = Boolean(rawCancel === true || rawCancel === 1);
  const trialStartedAt =
    r.trialStartedAt !== undefined
      ? r.trialStartedAt
        ? String(r.trialStartedAt)
        : null
      : r.trial_started_at
      ? String(r.trial_started_at)
      : null;
  const trialEndsAt =
    r.trialEndsAt !== undefined
      ? r.trialEndsAt
        ? String(r.trialEndsAt)
        : null
      : r.trial_ends_at
      ? String(r.trial_ends_at)
      : null;
  const emailConfirmedAt = r.emailConfirmedAt ? String(r.emailConfirmedAt) : null;
  const emailConfirmed = r.emailConfirmedAt !== undefined ? Boolean(emailConfirmedAt) : true;
  const ent = getEntitlements({
    role,
    tier,
    tierExpiresAt,
    trialStartedAt,
    trialEndsAt,
    emailConfirmed,
  });

  return {
    id: String(r.id),
    email: String(r.email || ''),
    displayName: r.displayName !== undefined ? (r.displayName ? String(r.displayName) : null) : r.display_name ? String(r.display_name) : null,
    role,
    tier,
    tierExpiresAt,
    pendingTier,
    pendingTierEffectiveAt,
    cancelAtPeriodEnd,
    trialStartedAt,
    trialEndsAt,
    trialDaysRemaining: ent.trialDaysRemaining,
    accessStatus: ent.status,
    suspended: Boolean(r.suspended === true || r.suspended === 1),
    suspendedAt:
      r.suspendedAt !== undefined
        ? r.suspendedAt
          ? String(r.suspendedAt)
          : null
        : r.suspended_at
        ? String(r.suspended_at)
        : null,
    suspendedReason:
      r.suspendedReason !== undefined
        ? r.suspendedReason
          ? String(r.suspendedReason)
          : null
        : r.suspended_reason
        ? String(r.suspended_reason)
        : null,
    createdAt: String(r.createdAt || r.created_at || ''),
    lastSignInAt:
      r.lastSignInAt !== undefined
        ? r.lastSignInAt
          ? String(r.lastSignInAt)
          : null
        : r.last_sign_in_at
        ? String(r.last_sign_in_at)
        : null,
    emailConfirmedAt,
  };
}

export async function writeAdminAuditLog(entry: {
  adminSession: ServerAuthSession;
  targetUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  beforeState?: Record<string, any> | null;
  afterState?: Record<string, any> | null;
  note?: string | null;
}): Promise<AdminAuditLogRecord> {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const serviceClient = getRemoteServiceClient();

  if (serviceClient) {
    const { data, error } = await serviceClient
      .from('admin_audit_log')
      .insert({
        id,
        admin_id: entry.adminSession.user.id,
        admin_email: entry.adminSession.user.email,
        target_user_id: entry.targetUserId ?? null,
        action: entry.action,
        entity_type: entry.entityType,
        entity_id: entry.entityId ?? null,
        before_state: entry.beforeState ?? null,
        after_state: entry.afterState ?? null,
        note: entry.note ?? null,
        created_at: createdAt,
      })
      .select('*')
      .single();

    if (error) {
      throw new AdminServiceError(`Failed to write audit log: ${error.message}`, 500);
    }

    return {
      id: String(data.id),
      adminId: data.admin_id ? String(data.admin_id) : null,
      adminEmail: data.admin_email ? String(data.admin_email) : null,
      targetUserId: data.target_user_id ? String(data.target_user_id) : null,
      action: String(data.action),
      entityType: String(data.entity_type || 'user'),
      entityId: data.entity_id ? String(data.entity_id) : null,
      beforeState: parseJsonSafe(data.before_state, null),
      afterState: parseJsonSafe(data.after_state, null),
      note: data.note ? String(data.note) : null,
      createdAt: String(data.created_at || createdAt),
    };
  }

  const db = requireLocalDb();
  db.prepare(
    `INSERT INTO admin_audit_log (
      id, admin_id, admin_email, target_user_id, action, entity_type, entity_id,
      before_state, after_state, note, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    entry.adminSession.user.id,
    entry.adminSession.user.email,
    entry.targetUserId ?? null,
    entry.action,
    entry.entityType,
    entry.entityId ?? null,
    entry.beforeState ? JSON.stringify(entry.beforeState) : null,
    entry.afterState ? JSON.stringify(entry.afterState) : null,
    entry.note ?? null,
    createdAt
  );

  return {
    id,
    adminId: entry.adminSession.user.id,
    adminEmail: entry.adminSession.user.email,
    targetUserId: entry.targetUserId ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    beforeState: entry.beforeState ?? null,
    afterState: entry.afterState ?? null,
    note: entry.note ?? null,
    createdAt,
  };
}

export async function getAdminOverview() {
  const serviceClient = getRemoteServiceClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const ago7dIso = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const ago30dIso = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const plus3dIso = new Date(now.getTime() + 3 * 86_400_000).toISOString();
  const plus7dIso = new Date(now.getTime() + 7 * 86_400_000).toISOString();
  const todayUtcPrefix = nowIso.slice(0, 10);

  let userMetrics = {
    totalUsers: 0,
    newUsers7d: 0,
    newUsers30d: 0,
    usersByTier: { free: 0, pro: 0, premium: 0 },
    activeSubscriptions: 0,
    expiringIn7d: 0,
    suspendedCount: 0,
    adminCount: 0,
    usersInTrial: 0,
    usersPaid: 0,
    usersExpired: 0,
    trialsEndingIn3d: 0,
  };

  let databaseSizeBytes: number | null = null;
  let callsTodayTotal = 0;
  const callsTodayByProvider: Record<string, number> = {};
  let paymentsSummary = {
    totalPaymentsCount: 0,
    manualGrantsCount: 0,
    successfulPaymentsCount: 0,
  };

  if (serviceClient) {
    const [
      totalRes,
      new7Res,
      new30Res,
      freeRes,
      proRes,
      premRes,
      adminRes,
      suspRes,
      nonAdminActiveRes,
      paidUsersRes,
      trialUsersRes,
      trials3dRes,
      expiringRes,
      dbSizeRes,
      callsTodayRes,
      payTotalRes,
      payManualRes,
      paySuccessRes,
    ] = await Promise.all([
      serviceClient.from('profiles').select('id', { count: 'exact', head: true }),
      serviceClient.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', ago7dIso),
      serviceClient.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', ago30dIso),
      serviceClient.from('profiles').select('id', { count: 'exact', head: true }).eq('tier', 'free'),
      serviceClient.from('profiles').select('id', { count: 'exact', head: true }).eq('tier', 'pro'),
      serviceClient.from('profiles').select('id', { count: 'exact', head: true }).eq('tier', 'premium'),
      serviceClient.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin'),
      serviceClient.from('profiles').select('id', { count: 'exact', head: true }).eq('suspended', true),
      serviceClient
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'user')
        .eq('suspended', false),
      serviceClient
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'user')
        .in('tier', ['pro', 'premium'])
        .eq('suspended', false)
        .or(`tier_expires_at.is.null,tier_expires_at.gt.${nowIso}`),
      serviceClient
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'user')
        .eq('tier', 'free')
        .eq('suspended', false)
        .gt('trial_ends_at', nowIso),
      serviceClient
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'user')
        .eq('tier', 'free')
        .eq('suspended', false)
        .gt('trial_ends_at', nowIso)
        .lte('trial_ends_at', plus3dIso),
      serviceClient
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .in('tier', ['pro', 'premium'])
        .eq('role', 'user')
        .eq('suspended', false)
        .gt('tier_expires_at', nowIso)
        .lte('tier_expires_at', plus7dIso),
      serviceClient.rpc('get_calibrall_database_size'),
      fetchAllRows<{ provider: string | null }>((from, to) =>
        serviceClient
          .from('provider_call_logs')
          .select('provider')
          .gte('timestamp', `${todayUtcPrefix}T00:00:00.000Z`)
          .order('timestamp', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to)
      ),
      serviceClient.from('paystack_payments').select('id', { count: 'exact', head: true }),
      serviceClient
        .from('paystack_payments')
        .select('id', { count: 'exact', head: true })
        .eq('is_manual_grant', true),
      serviceClient
        .from('paystack_payments')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'success'),
    ]);

    const activeSubs = Number(paidUsersRes.count) || 0;
    const usersInTrial = Number(trialUsersRes.count) || 0;
    const nonAdminActive = Number(nonAdminActiveRes.count) || 0;
    const usersExpired = Math.max(0, nonAdminActive - activeSubs - usersInTrial);

    userMetrics = {
      totalUsers: Number(totalRes.count) || 0,
      newUsers7d: Number(new7Res.count) || 0,
      newUsers30d: Number(new30Res.count) || 0,
      usersByTier: {
        free: Number(freeRes.count) || 0,
        pro: Number(proRes.count) || 0,
        premium: Number(premRes.count) || 0,
      },
      activeSubscriptions: activeSubs,
      expiringIn7d: Number(expiringRes.count) || 0,
      suspendedCount: Number(suspRes.count) || 0,
      adminCount: Number(adminRes.count) || 0,
      usersInTrial,
      usersPaid: activeSubs,
      usersExpired,
      trialsEndingIn3d: Number(trials3dRes.count) || 0,
    };

    if (!dbSizeRes.error && typeof dbSizeRes.data === 'number') {
      databaseSizeBytes = dbSizeRes.data;
    }

    if (!callsTodayRes.error && Array.isArray(callsTodayRes.data)) {
      callsTodayTotal = callsTodayRes.data.length;
      for (const row of callsTodayRes.data) {
        const prov = String((row as any).provider || 'unknown');
        callsTodayByProvider[prov] = (callsTodayByProvider[prov] || 0) + 1;
      }
    }

    if (!payTotalRes.error) {
      paymentsSummary = {
        totalPaymentsCount: Number(payTotalRes.count) || 0,
        manualGrantsCount: Number(payManualRes.count) || 0,
        successfulPaymentsCount: Number(paySuccessRes.count) || 0,
      };
    }
  } else {
    const db = requireLocalDb();
    const row = db
      .prepare(
        `SELECT
          COUNT(*) AS totalUsers,
          SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS newUsers7d,
          SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS newUsers30d,
          SUM(CASE WHEN LOWER(tier) = 'free' THEN 1 ELSE 0 END) AS freeCount,
          SUM(CASE WHEN LOWER(tier) = 'pro' THEN 1 ELSE 0 END) AS proCount,
          SUM(CASE WHEN LOWER(tier) = 'premium' THEN 1 ELSE 0 END) AS premiumCount,
          SUM(CASE WHEN LOWER(role) = 'admin' THEN 1 ELSE 0 END) AS adminCount,
          SUM(CASE WHEN COALESCE(suspended, 0) = 1 THEN 1 ELSE 0 END) AS suspendedCount,
          SUM(CASE
            WHEN LOWER(role) = 'user'
              AND LOWER(tier) IN ('pro', 'premium')
              AND COALESCE(suspended, 0) = 0
              AND (tier_expires_at IS NULL OR tier_expires_at > ?)
            THEN 1 ELSE 0 END) AS activeSubscriptions,
          SUM(CASE
            WHEN LOWER(role) = 'user'
              AND LOWER(tier) = 'free'
              AND COALESCE(suspended, 0) = 0
              AND trial_ends_at IS NOT NULL
              AND trial_ends_at > ?
            THEN 1 ELSE 0 END) AS usersInTrial,
          SUM(CASE
            WHEN LOWER(role) = 'user'
              AND COALESCE(suspended, 0) = 0
              AND (
                (LOWER(tier) IN ('pro', 'premium') AND tier_expires_at IS NOT NULL AND tier_expires_at <= ?)
                OR
                (LOWER(tier) = 'free' AND (trial_ends_at IS NULL OR trial_ends_at <= ?))
              )
            THEN 1 ELSE 0 END) AS usersExpired,
          SUM(CASE
            WHEN LOWER(role) = 'user'
              AND LOWER(tier) = 'free'
              AND COALESCE(suspended, 0) = 0
              AND trial_ends_at IS NOT NULL
              AND trial_ends_at > ?
              AND trial_ends_at <= ?
            THEN 1 ELSE 0 END) AS trialsEndingIn3d,
          SUM(CASE
            WHEN LOWER(role) = 'user'
              AND LOWER(tier) IN ('pro', 'premium')
              AND COALESCE(suspended, 0) = 0
              AND tier_expires_at IS NOT NULL
              AND tier_expires_at > ?
              AND tier_expires_at <= ?
            THEN 1 ELSE 0 END) AS expiringIn7d
        FROM profiles`
      )
      .get(
        ago7dIso,
        ago30dIso,
        nowIso,
        nowIso,
        nowIso,
        nowIso,
        nowIso,
        plus3dIso,
        nowIso,
        plus7dIso
      ) as Record<string, any>;

    const activeSubs = Number(row?.activeSubscriptions) || 0;
    userMetrics = {
      totalUsers: Number(row?.totalUsers) || 0,
      newUsers7d: Number(row?.newUsers7d) || 0,
      newUsers30d: Number(row?.newUsers30d) || 0,
      usersByTier: {
        free: Number(row?.freeCount) || 0,
        pro: Number(row?.proCount) || 0,
        premium: Number(row?.premiumCount) || 0,
      },
      activeSubscriptions: activeSubs,
      expiringIn7d: Number(row?.expiringIn7d) || 0,
      suspendedCount: Number(row?.suspendedCount) || 0,
      adminCount: Number(row?.adminCount) || 0,
      usersInTrial: Number(row?.usersInTrial) || 0,
      usersPaid: activeSubs,
      usersExpired: Number(row?.usersExpired) || 0,
      trialsEndingIn3d: Number(row?.trialsEndingIn3d) || 0,
    };

    try {
      const dbPath = path.join(process.cwd(), 'data', 'supabase.db');
      if (fs.existsSync(dbPath)) {
        databaseSizeBytes = fs.statSync(dbPath).size;
      }
    } catch {
      databaseSizeBytes = null;
    }

    const callRows = db
      .prepare(
        `SELECT provider, COUNT(*) AS c FROM provider_call_logs WHERE timestamp >= ? GROUP BY provider`
      )
      .all(`${todayUtcPrefix}T00:00:00.000Z`) as Array<{ provider: string; c: number }>;
    for (const r of callRows) {
      const c = Number(r.c) || 0;
      callsTodayByProvider[r.provider] = c;
      callsTodayTotal += c;
    }

    const payRow = db
      .prepare(
        `SELECT
          COUNT(*) AS totalCount,
          SUM(CASE WHEN COALESCE(is_manual_grant, 0) = 1 THEN 1 ELSE 0 END) AS manualCount,
          SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS successCount
        FROM paystack_payments`
      )
      .get() as Record<string, any>;
    paymentsSummary = {
      totalPaymentsCount: Number(payRow?.totalCount) || 0,
      manualGrantsCount: Number(payRow?.manualCount) || 0,
      successfulPaymentsCount: Number(payRow?.successCount) || 0,
    };
  }

  const [footballStatus, basketballStatus, syncStates, footballFreshness, basketballFreshness] =
    await Promise.all([
      matchesStore.getDataStatus(),
      getBasketballDataStatus(),
      getAllProviderSyncStates(),
      getStoredSportFreshness('football'),
      getStoredSportFreshness('basketball'),
    ]);

  let latestSyncTime: string | null = null;
  for (const st of syncStates) {
    const candidate = st.lastSuccessAt || st.lastAttemptAt;
    if (candidate && (!latestSyncTime || candidate > latestSyncTime)) {
      latestSyncTime = candidate;
    }
  }

  const budgetSummary = getBudgetSummary();
  const providerBudgets = Object.values(PROVIDER_BUDGETS).map((spec) => ({
    id: spec.id,
    name: spec.name,
    sport: spec.sport,
    callsToday: callsTodayByProvider[spec.id] || 0,
    dailyQuotaLimit: spec.dailyQuotaLimit,
    budgetedCallsPerDay: spec.budgetedCallsPerDay,
  }));

  const matchesPerLeague = [
    ...footballStatus.leagueLatestDates
      .filter((l) => l.count > 0)
      .map((l) => ({
        sport: 'football' as const,
        league: l.league,
        leagueName: l.leagueName,
        count: l.count,
        earliestDate: l.earliestDate,
        latestDate: l.latestDate,
        daysAgo: l.daysAgo,
        isStale: l.isStale,
      })),
    ...basketballStatus.leagueSummary
      .filter((l) => l.count > 0)
      .map((l) => ({
        sport: 'basketball' as const,
        league: l.league,
        leagueName: l.league,
        count: l.count,
        earliestDate: l.earliestDate,
        latestDate: l.latestDate,
        daysAgo: l.daysAgo,
        isStale: typeof l.daysAgo === 'number' ? l.daysAgo > 7 : true,
      })),
  ].sort((a, b) => b.count - a.count || a.league.localeCompare(b.league));

  return {
    timestamp: nowIso,
    users: userMetrics,
    sync: {
      latestSyncTime,
      footballFreshness: {
        fixtureCount: footballFreshness.fixtureCount,
        newestUpdatedAt: footballFreshness.newestUpdatedAt,
        ageMinutes: footballFreshness.ageMinutes,
      },
      basketballFreshness: {
        fixtureCount: basketballFreshness.fixtureCount,
        newestUpdatedAt: basketballFreshness.newestUpdatedAt,
        ageMinutes: basketballFreshness.ageMinutes,
      },
      syncStates,
    },
    dataStatus: {
      totalFootballMatches: footballStatus.totalMatches,
      totalBasketballGames: basketballStatus.totalGames,
      totalMatchesCombined: footballStatus.totalMatches + basketballStatus.totalGames,
      databaseSizeBytes,
      aggregationMethod: footballStatus.aggregationMethod || 'sqlite_sql_aggregates',
      storeUsed: footballStatus.storeUsed,
      unresolvedTeamsCount:
        footballStatus.unresolvedTeamsCount + basketballStatus.unresolvedTeamsCount,
      matchesPerLeague,
    },
    providerBudget: {
      callsTodayTotal,
      callsTodayByProvider,
      totalBudgetedCallsPerDay: budgetSummary.totalBudgetedCallsPerDay,
      providers: providerBudgets,
    },
    payments: paymentsSummary,
  };
}

export async function listAdminUsers(options: {
  search?: string;
  tier?: string;
  role?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  const { page, pageSize, offset } = clampPagination(options.page, options.pageSize, 25);
  const search = (options.search || '').trim();
  const tier = (options.tier || 'all').toLowerCase();
  const role = (options.role || 'all').toLowerCase();
  const status = (options.status || 'all').toLowerCase();
  const serviceClient = getRemoteServiceClient();

  if (serviceClient) {
    const rpcRes = await serviceClient.rpc('get_admin_users_page', {
      p_search: search,
      p_tier: tier,
      p_role: role,
      p_status: status,
      p_limit: pageSize,
      p_offset: offset,
    });

    if (!rpcRes.error && rpcRes.data && typeof rpcRes.data === 'object') {
      const payload = rpcRes.data as { users?: any[]; total?: number };
      const users = Array.isArray(payload.users)
        ? payload.users.map(mapSupabaseProfileRow)
        : [];
      const total = Number(payload.total) || 0;
      return {
        users,
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      };
    }

    // Fallback direct paginated table query if RPC is not yet applied
    let query = serviceClient
      .from('profiles')
      .select(
        'id, email, display_name, role, tier, tier_expires_at, pending_tier, pending_tier_effective_at, cancel_at_period_end, trial_started_at, trial_ends_at, suspended, suspended_at, suspended_reason, created_at',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .order('id', { ascending: true });

    const nowIso = new Date().toISOString();
    const plus3dIso = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const plus7dIso = new Date(Date.now() + 7 * 86_400_000).toISOString();

    if (tier !== 'all') query = query.eq('tier', tier);
    if (role !== 'all') query = query.eq('role', role);
    if (status === 'suspended') query = query.eq('suspended', true);
    if (status === 'active') query = query.eq('suspended', false);
    if (status === 'trial') {
      query = query
        .eq('role', 'user')
        .eq('tier', 'free')
        .eq('suspended', false)
        .gt('trial_ends_at', nowIso);
    }
    if (status === 'paid') {
      query = query
        .eq('role', 'user')
        .in('tier', ['pro', 'premium'])
        .eq('suspended', false)
        .or(`tier_expires_at.is.null,tier_expires_at.gt.${nowIso}`);
    }
    if (status === 'expired') {
      query = query
        .eq('role', 'user')
        .eq('suspended', false)
        .or(
          `and(tier.in.(pro,premium),tier_expires_at.not.is.null,tier_expires_at.lte.${nowIso}),and(tier.eq.free,or(trial_ends_at.is.null,trial_ends_at.lte.${nowIso}))`
        );
    }
    if (status === 'trial_ending_3d') {
      query = query
        .eq('role', 'user')
        .eq('tier', 'free')
        .eq('suspended', false)
        .gt('trial_ends_at', nowIso)
        .lte('trial_ends_at', plus3dIso);
    }
    if (status === 'expiring') {
      query = query
        .in('tier', ['pro', 'premium'])
        .eq('role', 'user')
        .eq('suspended', false)
        .gt('tier_expires_at', nowIso)
        .lte('tier_expires_at', plus7dIso);
    }
    if (search) {
      const cleanQ = search.replace(/[%_,()]/g, '');
      query = query.or(`email.ilike.%${cleanQ}%,display_name.ilike.%${cleanQ}%`);
    }

    const { data, count, error } = await query.range(offset, offset + pageSize - 1);
    if (error) {
      throw new AdminServiceError(`Failed to query users: ${error.message}`, 500);
    }

    const users = (data || []).map(mapSupabaseProfileRow);
    const total = Number(count) || 0;
    return {
      users,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  const db = requireLocalDb();
  const where: string[] = [];
  const params: any[] = [];
  const nowIso = new Date().toISOString();
  const plus3dIso = new Date(Date.now() + 3 * 86_400_000).toISOString();
  const plus7dIso = new Date(Date.now() + 7 * 86_400_000).toISOString();

  if (search) {
    const pat = `%${search.toLowerCase()}%`;
    where.push(
      `(LOWER(COALESCE(email, '')) LIKE ? OR LOWER(COALESCE(display_name, '')) LIKE ? OR LOWER(id) LIKE ?)`
    );
    params.push(pat, pat, pat);
  }
  if (tier !== 'all' && ['free', 'pro', 'premium'].includes(tier)) {
    where.push(`LOWER(tier) = ?`);
    params.push(tier);
  }
  if (role !== 'all' && ['user', 'admin'].includes(role)) {
    where.push(`LOWER(role) = ?`);
    params.push(role);
  }
  if (status === 'suspended') {
    where.push(`COALESCE(suspended, 0) = 1`);
  } else if (status === 'active') {
    where.push(`COALESCE(suspended, 0) = 0`);
  } else if (status === 'trial') {
    where.push(
      `LOWER(role) = 'user' AND LOWER(tier) = 'free' AND COALESCE(suspended, 0) = 0 AND trial_ends_at IS NOT NULL AND trial_ends_at > ?`
    );
    params.push(nowIso);
  } else if (status === 'paid') {
    where.push(
      `LOWER(role) = 'user' AND LOWER(tier) IN ('pro', 'premium') AND COALESCE(suspended, 0) = 0 AND (tier_expires_at IS NULL OR tier_expires_at > ?)`
    );
    params.push(nowIso);
  } else if (status === 'expired') {
    where.push(
      `LOWER(role) = 'user' AND COALESCE(suspended, 0) = 0 AND ((LOWER(tier) IN ('pro', 'premium') AND tier_expires_at IS NOT NULL AND tier_expires_at <= ?) OR (LOWER(tier) = 'free' AND (trial_ends_at IS NULL OR trial_ends_at <= ?)))`
    );
    params.push(nowIso, nowIso);
  } else if (status === 'trial_ending_3d') {
    where.push(
      `LOWER(role) = 'user' AND LOWER(tier) = 'free' AND COALESCE(suspended, 0) = 0 AND trial_ends_at IS NOT NULL AND trial_ends_at > ? AND trial_ends_at <= ?`
    );
    params.push(nowIso, plus3dIso);
  } else if (status === 'expiring') {
    where.push(
      `LOWER(role) = 'user' AND LOWER(tier) IN ('pro', 'premium') AND COALESCE(suspended, 0) = 0 AND tier_expires_at IS NOT NULL AND tier_expires_at > ? AND tier_expires_at <= ?`
    );
    params.push(nowIso, plus7dIso);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS c FROM profiles ${whereSql}`)
    .get(...params) as { c: number };
  const total = Number(totalRow?.c) || 0;

  const rows = db
    .prepare(
      `SELECT * FROM profiles ${whereSql} ORDER BY created_at DESC, id ASC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset) as any[];

  return {
    users: rows.map(mapSqliteUserRow),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getAdminUserDetail(userId: string) {
  const serviceClient = getRemoteServiceClient();
  let user: AdminUserRecord | null = null;
  let auditLogs: AdminAuditLogRecord[] = [];
  let payments: AdminPaymentRecord[] = [];

  if (serviceClient) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
    if (!isUuid) {
      throw new AdminServiceError('User not found', 404);
    }

    const rpcRes = await serviceClient.rpc('get_admin_user_detail', { p_user_id: userId });
    if (!rpcRes.error && rpcRes.data) {
      user = mapSupabaseProfileRow(rpcRes.data);
    } else {
      const { data: prof } = await serviceClient
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      if (prof) user = mapSupabaseProfileRow(prof);
    }

    if (!user) {
      throw new AdminServiceError('User not found', 404);
    }

    const transition = evaluateDuePendingTierTransition(user);
    if (transition.due && transition.nextTier) {
      await serviceClient
        .from('profiles')
        .update({
          tier: transition.nextTier,
          pending_tier: null,
          pending_tier_effective_at: null,
        })
        .eq('id', userId);
      user = {
        ...user,
        tier: transition.nextTier,
        pendingTier: null,
        pendingTierEffectiveAt: null,
      };
    }

    const [auditRes, payRes] = await Promise.all([
      serviceClient
        .from('admin_audit_log')
        .select('*')
        .or(`target_user_id.eq.${userId},entity_id.eq.${userId}`)
        .order('created_at', { ascending: false })
        .range(0, 49),
      serviceClient
        .from('paystack_payments')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(0, 49),
    ]);

    auditLogs = (auditRes.data || []).map((r: any) => ({
      id: String(r.id),
      adminId: r.admin_id ? String(r.admin_id) : null,
      adminEmail: r.admin_email ? String(r.admin_email) : null,
      targetUserId: r.target_user_id ? String(r.target_user_id) : null,
      action: String(r.action),
      entityType: String(r.entity_type || 'user'),
      entityId: r.entity_id ? String(r.entity_id) : null,
      beforeState: parseJsonSafe(r.before_state, null),
      afterState: parseJsonSafe(r.after_state, null),
      note: r.note ? String(r.note) : null,
      createdAt: String(r.created_at || ''),
    }));

    payments = (payRes.data || []).map((p: any) => ({
      id: String(p.id),
      userId: p.user_id ? String(p.user_id) : null,
      email: p.email ? String(p.email) : null,
      reference: String(p.reference),
      plan: String(p.plan),
      amountKobo: Number(p.amount_kobo) || 0,
      currency: String(p.currency || 'NGN'),
      status: String(p.status),
      channel: p.channel ? String(p.channel) : null,
      isManualGrant: Boolean(p.is_manual_grant === true || p.is_manual_grant === 1),
      grantedBy: p.granted_by ? String(p.granted_by) : null,
      grantNote: p.grant_note ? String(p.grant_note) : null,
      paidAt: p.paid_at ? String(p.paid_at) : null,
      createdAt: String(p.created_at || ''),
      rawWebhook: sanitizePaystackPayload(parseJsonSafe(p.raw_webhook, null)),
    }));

    return { user, auditLogs, payments };
  }

  const db = requireLocalDb();
  const row = db.prepare(`SELECT * FROM profiles WHERE id = ? LIMIT 1`).get(userId) as any;
  if (!row) {
    throw new AdminServiceError('User not found', 404);
  }

  const transition = evaluateDuePendingTierTransition({
    role: row.role,
    tier: row.tier,
    tierExpiresAt: row.tier_expires_at,
    pendingTier: row.pending_tier,
    pendingTierEffectiveAt: row.pending_tier_effective_at,
  });
  if (transition.due && transition.nextTier) {
    db.prepare(
      `UPDATE profiles SET tier = ?, pending_tier = NULL, pending_tier_effective_at = NULL WHERE id = ?`
    ).run(transition.nextTier, userId);
    row.tier = transition.nextTier;
    row.pending_tier = null;
    row.pending_tier_effective_at = null;
  }

  user = mapSqliteUserRow(row);

  const auditRows = db
    .prepare(
      `SELECT * FROM admin_audit_log WHERE target_user_id = ? OR entity_id = ? ORDER BY created_at DESC LIMIT 25`
    )
    .all(userId, userId) as any[];
  auditLogs = auditRows.map((r) => ({
    id: String(r.id),
    adminId: r.admin_id ? String(r.admin_id) : null,
    adminEmail: r.admin_email ? String(r.admin_email) : null,
    targetUserId: r.target_user_id ? String(r.target_user_id) : null,
    action: String(r.action),
    entityType: String(r.entity_type || 'user'),
    entityId: r.entity_id ? String(r.entity_id) : null,
    beforeState: parseJsonSafe(r.before_state, null),
    afterState: parseJsonSafe(r.after_state, null),
    note: r.note ? String(r.note) : null,
    createdAt: String(r.created_at || ''),
  }));

  const payRows = db
    .prepare(`SELECT * FROM paystack_payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 25`)
    .all(userId) as any[];
  payments = payRows.map((p) => ({
    id: String(p.id),
    userId: p.user_id ? String(p.user_id) : null,
    email: p.email ? String(p.email) : null,
    reference: String(p.reference),
    plan: String(p.plan),
    amountKobo: Number(p.amount_kobo) || 0,
    currency: String(p.currency || 'NGN'),
    status: String(p.status),
    channel: p.channel ? String(p.channel) : null,
    isManualGrant: Boolean(p.is_manual_grant === 1 || p.is_manual_grant === true),
    grantedBy: p.granted_by ? String(p.granted_by) : null,
    grantNote: p.grant_note ? String(p.grant_note) : null,
    paidAt: p.paid_at ? String(p.paid_at) : null,
    createdAt: String(p.created_at || ''),
    rawWebhook: sanitizePaystackPayload(parseJsonSafe(p.raw_webhook, null)),
  }));

  return { user, auditLogs, payments };
}

function computeTargetExpiryIso(options: {
  expiryDays?: number;
  customDate?: string | null;
  extendFrom?: string | null;
  clearExpiry?: boolean;
}): string | null {
  if (options.clearExpiry) return null;
  if (options.customDate) {
    const parsed = Date.parse(options.customDate);
    if (!Number.isFinite(parsed)) {
      throw new AdminServiceError('Invalid custom expiry date.', 400);
    }
    return new Date(parsed).toISOString();
  }
  if (options.expiryDays !== undefined && options.expiryDays !== null) {
    const days = Number(options.expiryDays);
    if (!Number.isFinite(days) || days <= 0 || days > 3650) {
      throw new AdminServiceError('expiryDays must be between 1 and 3650.', 400);
    }
    const baseMs =
      options.extendFrom && Number.isFinite(Date.parse(options.extendFrom))
        ? Math.max(Date.now(), Date.parse(options.extendFrom))
        : Date.now();
    return new Date(baseMs + days * 86_400_000).toISOString();
  }
  return options.extendFrom ?? null;
}

export async function updateAdminUser(
  adminSession: ServerAuthSession,
  targetUserId: string,
  payload: {
    action:
      | 'change_tier'
      | 'set_expiry'
      | 'set_subscription_flags'
      | 'revoke_free'
      | 'extend_trial'
      | 'end_trial'
      | 'set_role'
      | 'suspend'
      | 'reactivate';
    tier?: string;
    expiryDays?: number;
    trialDays?: number;
    customDate?: string | null;
    extendFromCurrent?: boolean;
    clearExpiry?: boolean;
    pendingTier?: string | null;
    pendingTierEffectiveAt?: string | null;
    cancelAtPeriodEnd?: boolean;
    role?: string;
    confirm?: boolean;
    reason?: string;
    note?: string;
  }
) {
  const { user: current } = await getAdminUserDetail(targetUserId);
  const serviceClient = getRemoteServiceClient();
  const nowIso = new Date().toISOString();

  const updateFields: Record<string, any> = {};
  let auditAction = '';
  let note = (payload.note || payload.reason || '').trim() || null;

  if (payload.action === 'change_tier') {
    const nextTier = normalizeTier(payload.tier);
    if (!payload.tier || !['free', 'pro', 'premium'].includes(String(payload.tier).toLowerCase())) {
      throw new AdminServiceError('Tier must be free, pro, or premium.', 400);
    }
    updateFields.tier = nextTier;
    if (nextTier === 'free') {
      updateFields.tier_expires_at = null;
      updateFields.pending_tier = null;
      updateFields.pending_tier_effective_at = null;
      updateFields.cancel_at_period_end = false;
    } else if (
      payload.expiryDays !== undefined ||
      payload.customDate !== undefined ||
      payload.clearExpiry
    ) {
      updateFields.tier_expires_at = computeTargetExpiryIso({
        expiryDays: payload.expiryDays,
        customDate: payload.customDate,
        extendFrom: payload.extendFromCurrent ? current.tierExpiresAt : null,
        clearExpiry: payload.clearExpiry,
      });
    }
    auditAction = 'USER_TIER_UPDATED';
  } else if (payload.action === 'set_expiry') {
    if (current.tier === 'free') {
      throw new AdminServiceError('Upgrade the user to Pro or Premium before setting an expiry.', 400);
    }
    const nextExpiry = computeTargetExpiryIso({
      expiryDays: payload.expiryDays,
      customDate: payload.customDate,
      extendFrom: payload.extendFromCurrent ? current.tierExpiresAt : null,
      clearExpiry: payload.clearExpiry,
    });
    updateFields.tier_expires_at = nextExpiry;
    if (current.pendingTier) {
      updateFields.pending_tier_effective_at = nextExpiry;
    }
    auditAction = 'USER_EXPIRY_UPDATED';
  } else if (payload.action === 'set_subscription_flags') {
    if (payload.pendingTier !== undefined) {
      const normalizedPending = payload.pendingTier
        ? normalizePendingTier(payload.pendingTier)
        : null;
      if (payload.pendingTier && !normalizedPending) {
        throw new AdminServiceError('pendingTier must be pro, premium, or null.', 400);
      }
      updateFields.pending_tier = normalizedPending;
      if (!normalizedPending) {
        updateFields.pending_tier_effective_at = null;
      }
    }
    if (payload.pendingTierEffectiveAt !== undefined) {
      if (!payload.pendingTierEffectiveAt) {
        updateFields.pending_tier_effective_at = null;
      } else {
        const parsedMs = Date.parse(payload.pendingTierEffectiveAt);
        if (!Number.isFinite(parsedMs)) {
          throw new AdminServiceError('Invalid pendingTierEffectiveAt date.', 400);
        }
        updateFields.pending_tier_effective_at = new Date(parsedMs).toISOString();
      }
    } else if (updateFields.pending_tier && !current.pendingTierEffectiveAt && current.tierExpiresAt) {
      updateFields.pending_tier_effective_at = current.tierExpiresAt;
    }
    if (payload.cancelAtPeriodEnd !== undefined) {
      updateFields.cancel_at_period_end = Boolean(payload.cancelAtPeriodEnd);
    }
    if (Object.keys(updateFields).length === 0) {
      throw new AdminServiceError('No subscription lifecycle fields provided.', 400);
    }
    auditAction = 'USER_SUBSCRIPTION_UPDATED';
  } else if (payload.action === 'revoke_free') {
    updateFields.tier = 'free';
    updateFields.tier_expires_at = null;
    updateFields.pending_tier = null;
    updateFields.pending_tier_effective_at = null;
    updateFields.cancel_at_period_end = false;
    auditAction = 'USER_TIER_REVOKED';
  } else if (payload.action === 'extend_trial') {
    const days = Number(payload.trialDays ?? payload.expiryDays);
    if (!Number.isFinite(days) || days <= 0 || days > 365) {
      throw new AdminServiceError('trialDays must be between 1 and 365.', 400);
    }
    const baseMs =
      current.trialEndsAt && Number.isFinite(Date.parse(current.trialEndsAt))
        ? Math.max(Date.now(), Date.parse(current.trialEndsAt))
        : Date.now();
    const nextEndIso = new Date(baseMs + days * 86_400_000).toISOString();
    updateFields.tier = 'free';
    updateFields.tier_expires_at = null;
    updateFields.pending_tier = null;
    updateFields.pending_tier_effective_at = null;
    updateFields.cancel_at_period_end = false;
    updateFields.trial_started_at = current.trialStartedAt || nowIso;
    updateFields.trial_ends_at = nextEndIso;
    note = note || `Extended trial by ${days} day(s)`;
    auditAction = 'USER_TRIAL_EXTENDED';
  } else if (payload.action === 'end_trial') {
    const pastIso = new Date(Date.now() - 1000).toISOString();
    updateFields.tier = 'free';
    updateFields.tier_expires_at = null;
    updateFields.pending_tier = null;
    updateFields.pending_tier_effective_at = null;
    updateFields.cancel_at_period_end = false;
    updateFields.trial_started_at = current.trialStartedAt || pastIso;
    updateFields.trial_ends_at = pastIso;
    note = note || 'Trial ended immediately by admin';
    auditAction = 'USER_TRIAL_ENDED';
  } else if (payload.action === 'set_role') {
    if (!payload.confirm) {
      throw new AdminServiceError('Explicit confirmation is required to change admin role.', 400);
    }
    const nextRole = normalizeRole(payload.role);
    if (!payload.role || !['user', 'admin'].includes(String(payload.role).toLowerCase())) {
      throw new AdminServiceError('Role must be user or admin.', 400);
    }
    if (targetUserId === adminSession.user.id && nextRole !== 'admin') {
      throw new AdminServiceError('Admins cannot remove their own admin role.', 400);
    }
    updateFields.role = nextRole;
    auditAction = nextRole === 'admin' ? 'USER_ROLE_PROMOTED' : 'USER_ROLE_DEMOTED';
  } else if (payload.action === 'suspend') {
    if (targetUserId === adminSession.user.id) {
      throw new AdminServiceError('Admins cannot suspend their own account.', 400);
    }
    const reason = (payload.reason || payload.note || '').trim();
    if (!reason) {
      throw new AdminServiceError('A reason is required to suspend an account.', 400);
    }
    updateFields.suspended = true;
    updateFields.suspended_at = nowIso;
    updateFields.suspended_reason = reason;
    note = reason;
    auditAction = 'USER_SUSPENDED';
  } else if (payload.action === 'reactivate') {
    updateFields.suspended = false;
    updateFields.suspended_at = null;
    updateFields.suspended_reason = null;
    auditAction = 'USER_REACTIVATED';
  } else {
    throw new AdminServiceError('Unsupported user update action.', 400);
  }

  const beforeState = {
    role: current.role,
    tier: current.tier,
    tierExpiresAt: current.tierExpiresAt,
    pendingTier: current.pendingTier,
    pendingTierEffectiveAt: current.pendingTierEffectiveAt,
    cancelAtPeriodEnd: current.cancelAtPeriodEnd,
    trialStartedAt: current.trialStartedAt,
    trialEndsAt: current.trialEndsAt,
    accessStatus: current.accessStatus,
    suspended: current.suspended,
    suspendedAt: current.suspendedAt,
    suspendedReason: current.suspendedReason,
  };

  if (serviceClient) {
    const { error } = await serviceClient
      .from('profiles')
      .update(updateFields)
      .eq('id', targetUserId);
    if (error) {
      throw new AdminServiceError(`Failed to update profile: ${error.message}`, 500);
    }
  } else {
    const db = requireLocalDb();
    const sets: string[] = [];
    const vals: any[] = [];
    for (const [col, val] of Object.entries(updateFields)) {
      sets.push(`"${col}" = ?`);
      if (typeof val === 'boolean') vals.push(val ? 1 : 0);
      else vals.push(val);
    }
    vals.push(targetUserId);
    db.prepare(`UPDATE profiles SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }

  const updatedDetail = await getAdminUserDetail(targetUserId);
  const afterState = {
    role: updatedDetail.user.role,
    tier: updatedDetail.user.tier,
    tierExpiresAt: updatedDetail.user.tierExpiresAt,
    pendingTier: updatedDetail.user.pendingTier,
    pendingTierEffectiveAt: updatedDetail.user.pendingTierEffectiveAt,
    cancelAtPeriodEnd: updatedDetail.user.cancelAtPeriodEnd,
    trialStartedAt: updatedDetail.user.trialStartedAt,
    trialEndsAt: updatedDetail.user.trialEndsAt,
    accessStatus: updatedDetail.user.accessStatus,
    suspended: updatedDetail.user.suspended,
    suspendedAt: updatedDetail.user.suspendedAt,
    suspendedReason: updatedDetail.user.suspendedReason,
  };

  const auditEntry = await writeAdminAuditLog({
    adminSession,
    targetUserId,
    action: auditAction,
    entityType: 'user',
    entityId: targetUserId,
    beforeState,
    afterState,
    note,
  });

  return {
    user: updatedDetail.user,
    auditLog: auditEntry,
  };
}

export async function sendAdminUserPasswordReset(
  adminSession: ServerAuthSession,
  targetUserId: string,
  originUrl: string
) {
  const { user } = await getAdminUserDetail(targetUserId);
  if (!user.email) {
    throw new AdminServiceError('Target user has no email address.', 400);
  }

  const { url, anonKey, isAuthConfigured } = getServerSupabaseConfig();
  let dispatched = false;
  let deliveryDetail = 'Logged in local development mode (remote Supabase Auth not active).';

  if (isAuthConfigured) {
    const authClient = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const redirectTo = `${originUrl.replace(/\/+$/, '')}/reset-password`;
    const { error } = await authClient.auth.resetPasswordForEmail(user.email, { redirectTo });
    if (error) {
      throw new AdminServiceError(`Failed to trigger password reset email: ${error.message}`, 500);
    }
    dispatched = true;
    deliveryDetail = `Password reset email queued via Supabase Auth for ${user.email}.`;
  }

  const auditLog = await writeAdminAuditLog({
    adminSession,
    targetUserId,
    action: 'USER_PASSWORD_RESET_SENT',
    entityType: 'user',
    entityId: targetUserId,
    beforeState: { email: user.email },
    afterState: { dispatched },
    note: deliveryDetail,
  });

  return {
    success: true,
    dispatched,
    email: user.email,
    message: deliveryDetail,
    auditLog,
  };
}

export async function listAuditLogs(options: {
  page?: number;
  pageSize?: number;
  action?: string;
  targetUserId?: string;
  search?: string;
}) {
  const { page, pageSize, offset } = clampPagination(options.page, options.pageSize, 25);
  const action = (options.action || 'all').trim();
  const targetUserId = (options.targetUserId || '').trim();
  const search = (options.search || '').trim();
  const serviceClient = getRemoteServiceClient();

  if (serviceClient) {
    let query = serviceClient
      .from('admin_audit_log')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .order('id', { ascending: true });

    if (action && action !== 'all') query = query.eq('action', action);
    if (targetUserId) query = query.eq('target_user_id', targetUserId);
    if (search) {
      const cleanQ = search.replace(/[%_,()]/g, '');
      query = query.or(
        `admin_email.ilike.%${cleanQ}%,action.ilike.%${cleanQ}%,entity_id.ilike.%${cleanQ}%,note.ilike.%${cleanQ}%`
      );
    }

    const { data, count, error } = await query.range(offset, offset + pageSize - 1);
    if (error) {
      throw new AdminServiceError(`Failed to load audit log: ${error.message}`, 500);
    }

    const logs: AdminAuditLogRecord[] = (data || []).map((r: any) => ({
      id: String(r.id),
      adminId: r.admin_id ? String(r.admin_id) : null,
      adminEmail: r.admin_email ? String(r.admin_email) : null,
      targetUserId: r.target_user_id ? String(r.target_user_id) : null,
      action: String(r.action),
      entityType: String(r.entity_type || 'user'),
      entityId: r.entity_id ? String(r.entity_id) : null,
      beforeState: parseJsonSafe(r.before_state, null),
      afterState: parseJsonSafe(r.after_state, null),
      note: r.note ? String(r.note) : null,
      createdAt: String(r.created_at || ''),
    }));
    const total = Number(count) || 0;
    return { logs, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  const db = requireLocalDb();
  const where: string[] = [];
  const params: any[] = [];
  if (action && action !== 'all') {
    where.push('action = ?');
    params.push(action);
  }
  if (targetUserId) {
    where.push('target_user_id = ?');
    params.push(targetUserId);
  }
  if (search) {
    const pat = `%${search.toLowerCase()}%`;
    where.push(
      `(LOWER(COALESCE(admin_email, '')) LIKE ? OR LOWER(action) LIKE ? OR LOWER(COALESCE(entity_id, '')) LIKE ? OR LOWER(COALESCE(note, '')) LIKE ?)`
    );
    params.push(pat, pat, pat, pat);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS c FROM admin_audit_log ${whereSql}`)
    .get(...params) as { c: number };
  const total = Number(totalRow?.c) || 0;
  const rows = db
    .prepare(
      `SELECT * FROM admin_audit_log ${whereSql} ORDER BY created_at DESC, id ASC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset) as any[];

  const logs: AdminAuditLogRecord[] = rows.map((r) => ({
    id: String(r.id),
    adminId: r.admin_id ? String(r.admin_id) : null,
    adminEmail: r.admin_email ? String(r.admin_email) : null,
    targetUserId: r.target_user_id ? String(r.target_user_id) : null,
    action: String(r.action),
    entityType: String(r.entity_type || 'user'),
    entityId: r.entity_id ? String(r.entity_id) : null,
    beforeState: parseJsonSafe(r.before_state, null),
    afterState: parseJsonSafe(r.after_state, null),
    note: r.note ? String(r.note) : null,
    createdAt: String(r.created_at || ''),
  }));

  return { logs, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function listAdminPayments(options: {
  page?: number;
  pageSize?: number;
  status?: string;
  manualOnly?: string;
  search?: string;
}) {
  const { page, pageSize, offset } = clampPagination(options.page, options.pageSize, 25);
  const status = (options.status || 'all').toLowerCase();
  const manualOnly = (options.manualOnly || 'all').toLowerCase();
  const search = (options.search || '').trim();
  const serviceClient = getRemoteServiceClient();

  if (serviceClient) {
    let query = serviceClient
      .from('paystack_payments')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .order('id', { ascending: true });

    if (status !== 'all') query = query.eq('status', status);
    if (manualOnly === 'true') query = query.eq('is_manual_grant', true);
    if (manualOnly === 'false') query = query.eq('is_manual_grant', false);
    if (search) {
      const cleanQ = search.replace(/[%_,()]/g, '');
      query = query.or(
        `email.ilike.%${cleanQ}%,reference.ilike.%${cleanQ}%,plan.ilike.%${cleanQ}%,grant_note.ilike.%${cleanQ}%`
      );
    }

    const { data, count, error } = await query.range(offset, offset + pageSize - 1);
    if (error) {
      throw new AdminServiceError(`Failed to load payments: ${error.message}`, 500);
    }

    const payments: AdminPaymentRecord[] = (data || []).map((p: any) => ({
      id: String(p.id),
      userId: p.user_id ? String(p.user_id) : null,
      email: p.email ? String(p.email) : null,
      reference: String(p.reference),
      plan: String(p.plan),
      amountKobo: Number(p.amount_kobo) || 0,
      currency: String(p.currency || 'NGN'),
      status: String(p.status),
      channel: p.channel ? String(p.channel) : null,
      isManualGrant: Boolean(p.is_manual_grant === true || p.is_manual_grant === 1),
      grantedBy: p.granted_by ? String(p.granted_by) : null,
      grantNote: p.grant_note ? String(p.grant_note) : null,
      paidAt: p.paid_at ? String(p.paid_at) : null,
      createdAt: String(p.created_at || ''),
      rawWebhook: sanitizePaystackPayload(parseJsonSafe(p.raw_webhook, null)),
    }));
    const total = Number(count) || 0;
    return { payments, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  const db = requireLocalDb();
  const where: string[] = [];
  const params: any[] = [];
  if (status !== 'all') {
    where.push('LOWER(status) = ?');
    params.push(status);
  }
  if (manualOnly === 'true') {
    where.push('COALESCE(is_manual_grant, 0) = 1');
  } else if (manualOnly === 'false') {
    where.push('COALESCE(is_manual_grant, 0) = 0');
  }
  if (search) {
    const pat = `%${search.toLowerCase()}%`;
    where.push(
      `(LOWER(COALESCE(email, '')) LIKE ? OR LOWER(reference) LIKE ? OR LOWER(plan) LIKE ? OR LOWER(COALESCE(grant_note, '')) LIKE ?)`
    );
    params.push(pat, pat, pat, pat);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS c FROM paystack_payments ${whereSql}`)
    .get(...params) as { c: number };
  const total = Number(totalRow?.c) || 0;
  const rows = db
    .prepare(
      `SELECT * FROM paystack_payments ${whereSql} ORDER BY created_at DESC, id ASC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset) as any[];

  const payments: AdminPaymentRecord[] = rows.map((p) => ({
    id: String(p.id),
    userId: p.user_id ? String(p.user_id) : null,
    email: p.email ? String(p.email) : null,
    reference: String(p.reference),
    plan: String(p.plan),
    amountKobo: Number(p.amount_kobo) || 0,
    currency: String(p.currency || 'NGN'),
    status: String(p.status),
    channel: p.channel ? String(p.channel) : null,
    isManualGrant: Boolean(p.is_manual_grant === 1 || p.is_manual_grant === true),
    grantedBy: p.granted_by ? String(p.granted_by) : null,
    grantNote: p.grant_note ? String(p.grant_note) : null,
    paidAt: p.paid_at ? String(p.paid_at) : null,
    createdAt: String(p.created_at || ''),
    rawWebhook: sanitizePaystackPayload(parseJsonSafe(p.raw_webhook, null)),
  }));

  return { payments, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function recordManualGrant(
  adminSession: ServerAuthSession,
  payload: {
    userIdOrEmail: string;
    plan: 'pro' | 'premium';
    expiryDays?: number;
    customDate?: string | null;
    grantNote: string;
    reference?: string;
  }
) {
  const targetInput = (payload.userIdOrEmail || '').trim();
  const grantNote = (payload.grantNote || '').trim();
  const plan = normalizeTier(payload.plan);

  if (!targetInput) {
    throw new AdminServiceError('Target user email or user ID is required.', 400);
  }
  if (plan !== 'pro' && plan !== 'premium') {
    throw new AdminServiceError('Manual grant plan must be pro or premium.', 400);
  }
  if (!grantNote) {
    throw new AdminServiceError('A note is required when recording a manual grant.', 400);
  }

  const serviceClient = getRemoteServiceClient();
  let targetUser: AdminUserRecord | null = null;

  if (serviceClient) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetInput);
    const { data } = await serviceClient
      .from('profiles')
      .select('*')
      .eq(isUuid ? 'id' : 'email', isUuid ? targetInput : targetInput.toLowerCase())
      .maybeSingle();
    if (data) targetUser = mapSupabaseProfileRow(data);
  } else {
    const db = requireLocalDb();
    const row = db
      .prepare(`SELECT * FROM profiles WHERE id = ? OR LOWER(email) = LOWER(?) LIMIT 1`)
      .get(targetInput, targetInput) as any;
    if (row) targetUser = mapSqliteUserRow(row);
  }

  if (!targetUser) {
    throw new AdminServiceError(`User "${targetInput}" not found.`, 404);
  }

  const nextExpiry = computeTargetExpiryIso({
    expiryDays: payload.expiryDays ?? 30,
    customDate: payload.customDate,
    extendFrom: targetUser.tierExpiresAt,
  });

  const beforeState = {
    tier: targetUser.tier,
    tierExpiresAt: targetUser.tierExpiresAt,
  };

  const nowIso = new Date().toISOString();
  const paymentId = crypto.randomUUID();
  const reference =
    (payload.reference || '').trim() ||
    `MANUAL_${Date.now()}_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

  if (serviceClient) {
    const { error: profErr } = await serviceClient
      .from('profiles')
      .update({ tier: plan, tier_expires_at: nextExpiry })
      .eq('id', targetUser.id);
    if (profErr) {
      throw new AdminServiceError(`Failed to apply tier grant: ${profErr.message}`, 500);
    }

    const { error: payErr } = await serviceClient.from('paystack_payments').insert({
      id: paymentId,
      user_id: targetUser.id,
      email: targetUser.email,
      reference,
      plan,
      amount_kobo: 0,
      currency: 'NGN',
      status: 'manual_grant',
      channel: 'manual_admin',
      is_manual_grant: true,
      granted_by: adminSession.user.id,
      grant_note: grantNote,
      paid_at: nowIso,
      metadata: { grantedByEmail: adminSession.user.email, expiryDays: payload.expiryDays ?? 30 },
      created_at: nowIso,
    });
    if (payErr) {
      throw new AdminServiceError(`Failed to insert manual grant record: ${payErr.message}`, 500);
    }
  } else {
    const db = requireLocalDb();
    db.prepare(`UPDATE profiles SET tier = ?, tier_expires_at = ? WHERE id = ?`).run(
      plan,
      nextExpiry,
      targetUser.id
    );
    db.prepare(
      `INSERT INTO paystack_payments (
        id, user_id, email, reference, plan, amount_kobo, currency, status, channel,
        is_manual_grant, granted_by, grant_note, paid_at, metadata, created_at
      ) VALUES (?, ?, ?, ?, ?, 0, 'NGN', 'manual_grant', 'manual_admin', 1, ?, ?, ?, ?, ?)`
    ).run(
      paymentId,
      targetUser.id,
      targetUser.email,
      reference,
      plan,
      adminSession.user.id,
      grantNote,
      nowIso,
      JSON.stringify({ grantedByEmail: adminSession.user.email }),
      nowIso
    );
  }

  const auditLog = await writeAdminAuditLog({
    adminSession,
    targetUserId: targetUser.id,
    action: 'MANUAL_PAYMENT_GRANTED',
    entityType: 'payment',
    entityId: reference,
    beforeState,
    afterState: { tier: plan, tierExpiresAt: nextExpiry, reference },
    note: grantNote,
  });

  return {
    payment: {
      id: paymentId,
      userId: targetUser.id,
      email: targetUser.email,
      reference,
      plan,
      amountKobo: 0,
      currency: 'NGN',
      status: 'manual_grant',
      channel: 'manual_admin',
      isManualGrant: true,
      grantedBy: adminSession.user.id,
      grantNote,
      paidAt: nowIso,
      createdAt: nowIso,
      rawWebhook: null,
    } satisfies AdminPaymentRecord,
    auditLog,
  };
}

export async function listAdminPicks(options: {
  page?: number;
  pageSize?: number;
  sport?: string;
  status?: string;
  search?: string;
}) {
  const { page, pageSize, offset } = clampPagination(options.page, options.pageSize, 25);
  const sport = (options.sport || 'all').toLowerCase();
  const status = (options.status || 'all').toLowerCase();
  const search = (options.search || '').trim().toLowerCase();
  const serviceClient = getRemoteServiceClient();

  const items: AdminPickRecord[] = [];

  if (serviceClient) {
    const [fbRes, bbRes] = await Promise.all([
      sport === 'basketball'
        ? Promise.resolve({ data: [] as any[], error: null })
        : fetchAllRows<any>((from, to) =>
            serviceClient
              .from('football_picks')
              .select('*')
              .order('recorded_at', { ascending: false })
              .order('fixture_id', { ascending: true })
              .range(from, to)
          ),
      sport === 'football'
        ? Promise.resolve({ data: [] as any[], error: null })
        : fetchAllRows<any>((from, to) =>
            serviceClient
              .from('bb_picks')
              .select('*')
              .order('recorded_at', { ascending: false })
              .order('id', { ascending: true })
              .range(from, to)
          ),
    ]);

    for (const r of fbRes.data || []) {
      const isHidden = Boolean(r.is_hidden === true || r.is_hidden === 1);
      const voidReason = r.voided_reason ? String(r.voided_reason) : null;
      items.push({
        id: String(r.fixture_id),
        sport: 'football',
        fixtureOrGameId: String(r.fixture_id),
        competitionCode: String(r.competition_code || 'FOOTBALL'),
        kickoffTime: r.kickoff_time ? String(r.kickoff_time) : null,
        marketCode: String(r.market_code || 'NONE'),
        marketName: String(r.market_name || 'Match pick'),
        selection: String(r.selection || 'Pending'),
        line: null,
        probability:
          r.calibrated_probability !== null && r.calibrated_probability !== undefined
            ? Number(r.calibrated_probability)
            : null,
        confidenceTier: r.confidence_tier ? String(r.confidence_tier) : null,
        qualificationStatus: voidReason ? 'VOID' : 'QUALIFIED',
        summary: String(r.summary || ''),
        reasoning: parseJsonSafe(r.reasoning_json, {}),
        alternates: parseJsonSafe(r.alternates_json, []),
        modelVersion: String(r.model_version || 'v2.5.0'),
        isHidden,
        voidedReason: voidReason,
        moderatedBy: r.moderated_by ? String(r.moderated_by) : null,
        moderatedAt: r.moderated_at ? String(r.moderated_at) : null,
        recordedAt: r.recorded_at ? String(r.recorded_at) : null,
      });
    }

    for (const r of bbRes.data || []) {
      const isHidden = Boolean(r.is_hidden === true || r.is_hidden === 1);
      const voidReason = r.voided_reason ? String(r.voided_reason) : null;
      items.push({
        id: String(r.id),
        sport: 'basketball',
        fixtureOrGameId: String(r.game_id),
        competitionCode: String(r.league || 'NBA'),
        kickoffTime: r.kickoff_utc ? String(r.kickoff_utc) : null,
        marketCode: String(r.market_code || ''),
        marketName: String(r.market_category || 'Basketball total'),
        selection: String(r.selection || ''),
        line: r.line !== null && r.line !== undefined ? Number(r.line) : null,
        probability:
          r.model_probability !== null && r.model_probability !== undefined
            ? Number(r.model_probability)
            : null,
        confidenceTier: r.confidence_tier ? String(r.confidence_tier) : r.model_confidence ? String(r.model_confidence) : null,
        qualificationStatus: String(r.qualification_status || 'QUALIFIED'),
        summary: String(r.summary || ''),
        reasoning: parseJsonSafe(r.reasoning_json, {}),
        alternates: parseJsonSafe(r.alternates_json, []),
        modelVersion: String(r.model_version || 'bb-v1'),
        isHidden,
        voidedReason: voidReason,
        moderatedBy: r.moderated_by ? String(r.moderated_by) : null,
        moderatedAt: r.moderated_at ? String(r.moderated_at) : null,
        recordedAt: r.recorded_at ? String(r.recorded_at) : null,
      });
    }
  } else {
    const db = requireLocalDb();
    if (sport !== 'basketball') {
      const fbRows = db
        .prepare(`SELECT * FROM football_picks ORDER BY recorded_at DESC`)
        .all() as any[];
      for (const r of fbRows) {
        const isHidden = Boolean(r.is_hidden === 1 || r.is_hidden === true);
        const voidReason = r.voided_reason ? String(r.voided_reason) : null;
        items.push({
          id: String(r.fixture_id),
          sport: 'football',
          fixtureOrGameId: String(r.fixture_id),
          competitionCode: String(r.competition_code || 'FOOTBALL'),
          kickoffTime: r.kickoff_time ? String(r.kickoff_time) : null,
          marketCode: String(r.market_code || 'NONE'),
          marketName: String(r.market_name || 'Match pick'),
          selection: String(r.selection || 'Pending'),
          line: null,
          probability:
            r.calibrated_probability !== null && r.calibrated_probability !== undefined
              ? Number(r.calibrated_probability)
              : null,
          confidenceTier: r.confidence_tier ? String(r.confidence_tier) : null,
          qualificationStatus: voidReason ? 'VOID' : 'QUALIFIED',
          summary: String(r.summary || ''),
          reasoning: parseJsonSafe(r.reasoning_json, {}),
          alternates: parseJsonSafe(r.alternates_json, []),
          modelVersion: String(r.model_version || 'v2.5.0'),
          isHidden,
          voidedReason: voidReason,
          moderatedBy: r.moderated_by ? String(r.moderated_by) : null,
          moderatedAt: r.moderated_at ? String(r.moderated_at) : null,
          recordedAt: r.recorded_at ? String(r.recorded_at) : null,
        });
      }
    }
    if (sport !== 'football') {
      const bbRows = db
        .prepare(`SELECT * FROM bb_picks ORDER BY recorded_at DESC`)
        .all() as any[];
      for (const r of bbRows) {
        const isHidden = Boolean(r.is_hidden === 1 || r.is_hidden === true);
        const voidReason = r.voided_reason ? String(r.voided_reason) : null;
        items.push({
          id: String(r.id),
          sport: 'basketball',
          fixtureOrGameId: String(r.game_id),
          competitionCode: String(r.league || 'NBA'),
          kickoffTime: r.kickoff_utc ? String(r.kickoff_utc) : null,
          marketCode: String(r.market_code || ''),
          marketName: String(r.market_category || 'Basketball total'),
          selection: String(r.selection || ''),
          line: r.line !== null && r.line !== undefined ? Number(r.line) : null,
          probability:
            r.model_probability !== null && r.model_probability !== undefined
              ? Number(r.model_probability)
              : null,
          confidenceTier: r.confidence_tier ? String(r.confidence_tier) : r.model_confidence ? String(r.model_confidence) : null,
          qualificationStatus: String(r.qualification_status || 'QUALIFIED'),
          summary: String(r.summary || ''),
          reasoning: parseJsonSafe(r.reasoning_json, {}),
          alternates: parseJsonSafe(r.alternates_json, []),
          modelVersion: String(r.model_version || 'bb-v1'),
          isHidden,
          voidedReason: voidReason,
          moderatedBy: r.moderated_by ? String(r.moderated_by) : null,
          moderatedAt: r.moderated_at ? String(r.moderated_at) : null,
          recordedAt: r.recorded_at ? String(r.recorded_at) : null,
        });
      }
    }
  }

  let filtered = items;
  if (status === 'hidden') {
    filtered = filtered.filter((p) => p.isHidden);
  } else if (status === 'voided') {
    filtered = filtered.filter((p) => p.qualificationStatus === 'VOID' || Boolean(p.voidedReason));
  } else if (status === 'active') {
    filtered = filtered.filter(
      (p) => !p.isHidden && p.qualificationStatus !== 'VOID' && !p.voidedReason
    );
  }
  if (search) {
    filtered = filtered.filter((p) =>
      [p.id, p.fixtureOrGameId, p.competitionCode, p.marketCode, p.selection, p.summary]
        .join(' ')
        .toLowerCase()
        .includes(search)
    );
  }

  filtered.sort((a, b) => String(b.recordedAt || '').localeCompare(String(a.recordedAt || '')));
  const total = filtered.length;
  const paged = filtered.slice(offset, offset + pageSize);

  return {
    picks: paged,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function moderateAdminPick(
  adminSession: ServerAuthSession,
  pickId: string,
  payload: {
    sport: 'football' | 'basketball';
    action: 'hide' | 'unhide' | 'void' | 'restore';
    reason?: string;
  }
) {
  const { sport, action } = payload;
  const reason = (payload.reason || '').trim();
  if ((action === 'hide' || action === 'void') && !reason) {
    throw new AdminServiceError('A moderation reason is required to hide or void a pick.', 400);
  }

  const serviceClient = getRemoteServiceClient();
  const nowIso = new Date().toISOString();
  const table = sport === 'basketball' ? 'bb_picks' : 'football_picks';
  const idCol = sport === 'basketball' ? 'id' : 'fixture_id';

  let existing: any = null;
  if (serviceClient) {
    const { data } = await serviceClient.from(table).select('*').eq(idCol, pickId).maybeSingle();
    existing = data;
  } else {
    const db = requireLocalDb();
    existing = db.prepare(`SELECT * FROM ${table} WHERE ${idCol} = ? LIMIT 1`).get(pickId);
  }

  if (!existing) {
    throw new AdminServiceError(`Pick "${pickId}" not found in ${table}.`, 404);
  }

  const beforeState = {
    isHidden: Boolean(existing.is_hidden === true || existing.is_hidden === 1),
    voidedReason: existing.voided_reason ?? null,
    qualificationStatus: existing.qualification_status ?? null,
  };

  const updates: Record<string, any> = {
    moderated_by: adminSession.user.id,
    moderated_at: nowIso,
  };
  let auditAction = 'PICK_UPDATED';

  if (action === 'hide') {
    updates.is_hidden = true;
    updates.voided_reason = reason;
    auditAction = 'PICK_HIDDEN';
  } else if (action === 'unhide') {
    updates.is_hidden = false;
    auditAction = 'PICK_UNHIDDEN';
  } else if (action === 'void') {
    updates.is_hidden = true;
    updates.voided_reason = reason;
    if (sport === 'basketball') updates.qualification_status = 'VOID';
    auditAction = 'PICK_VOIDED';
  } else if (action === 'restore') {
    updates.is_hidden = false;
    updates.voided_reason = null;
    if (sport === 'basketball' && existing.qualification_status === 'VOID') {
      updates.qualification_status = 'QUALIFIED_PROBABILITY';
    }
    auditAction = 'PICK_RESTORED';
  } else {
    throw new AdminServiceError('Unsupported pick moderation action.', 400);
  }

  if (serviceClient) {
    const { error } = await serviceClient.from(table).update(updates).eq(idCol, pickId);
    if (error) {
      throw new AdminServiceError(`Failed updating pick: ${error.message}`, 500);
    }
  } else {
    const db = requireLocalDb();
    const sets: string[] = [];
    const vals: any[] = [];
    for (const [k, v] of Object.entries(updates)) {
      sets.push(`"${k}" = ?`);
      if (typeof v === 'boolean') vals.push(v ? 1 : 0);
      else vals.push(v);
    }
    vals.push(pickId);
    db.prepare(`UPDATE ${table} SET ${sets.join(', ')} WHERE ${idCol} = ?`).run(...vals);
  }

  await Promise.all([
    serverCache.bust('live_fixtures:'),
    bustBasketballSlateCache(),
  ]).catch(() => {});

  const auditLog = await writeAdminAuditLog({
    adminSession,
    targetUserId: null,
    action: auditAction,
    entityType: sport === 'basketball' ? 'bb_pick' : 'football_pick',
    entityId: pickId,
    beforeState,
    afterState: updates,
    note: reason || null,
  });

  return { success: true, pickId, sport, action, updates, auditLog };
}

export async function triggerAdminSync(
  adminSession: ServerAuthSession,
  options: { sport?: 'all' | 'football' | 'basketball'; mode?: SyncMode }
) {
  const sport = options.sport || 'all';
  const mode: SyncMode = options.mode || 'schedule';
  const startedAt = new Date().toISOString();
  const jobId = crypto.randomUUID();
  const results: Record<string, any> = {};

  let recordsProcessed = 0;
  let errorMessage: string | null = null;

  try {
    if (sport === 'all' || sport === 'football') {
      const fb = await getFootballDataProvider().ensureSynced({ force: true, mode });
      results.football = {
        ok: fb.ok,
        provider: fb.providerUsed,
        records: fb.count,
        rowsWrittenToFixtures: fb.rowsWrittenToFixtures,
        callsMade: fb.callsMade,
      };
      recordsProcessed += Number(fb.rowsWrittenToFixtures || fb.count || 0);
    }
    if (sport === 'all' || sport === 'basketball') {
      const bb = await syncBasketballLivePipeline(mode);
      results.basketball = {
        status: bb.status,
        records: bb.totalGamesUpserted,
        callsMade: bb.callsMade,
        picksRecorded: bb.picksRecorded,
      };
      recordsProcessed += Number(bb.totalGamesUpserted || 0);
    }
  } catch (err: any) {
    errorMessage = err?.message || 'Sync run failed';
  }

  const completedAt = new Date().toISOString();
  const jobStatus = errorMessage ? 'FAILED' : 'COMPLETED';
  const serviceClient = getRemoteServiceClient();

  try {
    if (serviceClient) {
      await serviceClient.from('provider_sync_jobs').insert({
        id: jobId,
        provider: `manual_admin:${sport}`,
        job_type: mode,
        status: jobStatus,
        records_processed: recordsProcessed,
        error_message: errorMessage,
        started_at: startedAt,
        completed_at: completedAt,
      });
    } else {
      const db = getLocalDatabase();
      if (db) {
        db.prepare(
          `INSERT INTO provider_sync_jobs (
            id, provider, job_type, status, records_processed, error_message, started_at, completed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          jobId,
          `manual_admin:${sport}`,
          mode,
          jobStatus,
          recordsProcessed,
          errorMessage,
          startedAt,
          completedAt
        );
      }
    }
  } catch {
    // Non-fatal job log write
  }

  const auditLog = await writeAdminAuditLog({
    adminSession,
    targetUserId: null,
    action: 'SYNC_TRIGGERED',
    entityType: 'sync',
    entityId: jobId,
    beforeState: null,
    afterState: { sport, mode, status: jobStatus, recordsProcessed, results },
    note: errorMessage || `Admin sync completed (${sport}, ${mode})`,
  });

  if (errorMessage) {
    throw new AdminServiceError(errorMessage, 500);
  }

  return {
    success: true,
    jobId,
    sport,
    mode,
    recordsProcessed,
    results,
    auditLog,
  };
}

export async function getAdminSystemHealth(options: {
  page?: number;
  pageSize?: number;
  provider?: string;
  onlyErrors?: boolean;
}) {
  const { page, pageSize, offset } = clampPagination(options.page, options.pageSize, 25);
  const provider = (options.provider || 'all').trim();
  const onlyErrors = Boolean(options.onlyErrors);
  const serviceClient = getRemoteServiceClient();
  const ago24hIso = new Date(Date.now() - 86_400_000).toISOString();

  let callLogs: any[] = [];
  let totalCallLogs = 0;
  let errorCount24h = 0;
  let recentJobs: any[] = [];

  if (serviceClient) {
    let logsQuery = serviceClient
      .from('provider_call_logs')
      .select('*', { count: 'exact' })
      .order('timestamp', { ascending: false });

    if (provider !== 'all') logsQuery = logsQuery.eq('provider', provider);
    if (onlyErrors) logsQuery = logsQuery.eq('ok', 0);

    const [logsRes, errRes, jobsRes] = await Promise.all([
      logsQuery.range(offset, offset + pageSize - 1),
      serviceClient
        .from('provider_call_logs')
        .select('id', { count: 'exact', head: true })
        .eq('ok', 0)
        .gte('timestamp', ago24hIso),
      serviceClient
        .from('provider_sync_jobs')
        .select('*')
        .order('started_at', { ascending: false })
        .range(0, 19),
    ]);

    callLogs = (logsRes.data || []).map((row: any) => ({
      id: String(row.id),
      timestamp: String(row.timestamp),
      provider: String(row.provider),
      endpoint: String(row.endpoint),
      method: String(row.method || 'GET'),
      statusCode: row.status_code ?? null,
      ok: Boolean(row.ok === 1 || row.ok === true),
      latencyMs: Number(row.latency_ms) || 0,
      leagueCode: row.league_code || null,
      syncMode: row.sync_mode || null,
      quotaRemaining: row.quota_remaining || null,
      responseBody: String(row.response_body || ''),
      error: row.error || null,
    }));
    totalCallLogs = Number(logsRes.count) || 0;
    errorCount24h = Number(errRes.count) || 0;
    recentJobs = (jobsRes.data || []).map((j: any) => ({
      id: String(j.id),
      provider: String(j.provider),
      jobType: String(j.job_type),
      status: String(j.status),
      recordsProcessed: Number(j.records_processed) || 0,
      errorMessage: j.error_message ? String(j.error_message) : null,
      startedAt: String(j.started_at),
      completedAt: j.completed_at ? String(j.completed_at) : null,
    }));
  } else {
    const db = requireLocalDb();
    const where: string[] = [];
    const params: any[] = [];
    if (provider !== 'all') {
      where.push('provider = ?');
      params.push(provider);
    }
    if (onlyErrors) {
      where.push('ok = 0');
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const countRow = db
      .prepare(`SELECT COUNT(*) AS c FROM provider_call_logs ${whereSql}`)
      .get(...params) as { c: number };
    totalCallLogs = Number(countRow?.c) || 0;

    const logRows = db
      .prepare(
        `SELECT * FROM provider_call_logs ${whereSql} ORDER BY timestamp DESC LIMIT ? OFFSET ?`
      )
      .all(...params, pageSize, offset) as any[];

    callLogs = logRows.map((row) => ({
      id: String(row.id),
      timestamp: String(row.timestamp),
      provider: String(row.provider),
      endpoint: String(row.endpoint),
      method: String(row.method || 'GET'),
      statusCode: row.status_code ?? null,
      ok: Boolean(row.ok === 1 || row.ok === true),
      latencyMs: Number(row.latency_ms) || 0,
      leagueCode: row.league_code || null,
      syncMode: row.sync_mode || null,
      quotaRemaining: row.quota_remaining || null,
      responseBody: String(row.response_body || ''),
      error: row.error || null,
    }));

    const errRow = db
      .prepare(`SELECT COUNT(*) AS c FROM provider_call_logs WHERE ok = 0 AND timestamp >= ?`)
      .get(ago24hIso) as { c: number };
    errorCount24h = Number(errRow?.c) || 0;

    const jobRows = db
      .prepare(`SELECT * FROM provider_sync_jobs ORDER BY started_at DESC LIMIT 20`)
      .all() as any[];
    recentJobs = jobRows.map((j) => ({
      id: String(j.id),
      provider: String(j.provider),
      jobType: String(j.job_type),
      status: String(j.status),
      recordsProcessed: Number(j.records_processed) || 0,
      errorMessage: j.error_message ? String(j.error_message) : null,
      startedAt: String(j.started_at),
      completedAt: j.completed_at ? String(j.completed_at) : null,
    }));
  }

  const [syncStates, footballStatus, basketballStatus] = await Promise.all([
    getAllProviderSyncStates(),
    matchesStore.getDataStatus(),
    getBasketballDataStatus(),
  ]);

  return {
    timestamp: new Date().toISOString(),
    errorCount24h,
    callLogs: {
      items: callLogs,
      total: totalCallLogs,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(totalCallLogs / pageSize)),
    },
    providerSyncStates: syncStates,
    recentJobs,
    backfillStatus: {
      footballMatches: footballStatus.totalMatches,
      footballEarliestDate: footballStatus.earliestDate,
      footballLatestDate: footballStatus.latestDate,
      basketballGames: basketballStatus.totalGames,
      basketballEarliestDate: basketballStatus.earliestDate,
      basketballLatestDate: basketballStatus.latestDate,
      unresolvedTeamsCount:
        footballStatus.unresolvedTeamsCount + basketballStatus.unresolvedTeamsCount,
    },
  };
}
