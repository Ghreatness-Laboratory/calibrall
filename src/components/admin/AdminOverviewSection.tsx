'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Users,
  CreditCard,
  Clock,
  Database,
  Activity,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { formatAdminDate, formatBytes } from './adminTypes';
import { cleanDisplayText } from '@/lib/utils/formatText';

interface OverviewResponse {
  timestamp: string;
  users: {
    totalUsers: number;
    newUsers7d: number;
    newUsers30d: number;
    usersByTier: { free: number; pro: number; premium: number };
    activeSubscriptions: number;
    expiringIn7d: number;
    suspendedCount: number;
    adminCount: number;
  };
  sync: {
    latestSyncTime: string | null;
    footballFreshness: { fixtureCount: number; newestUpdatedAt: string | null; ageMinutes: number | null };
    basketballFreshness: { fixtureCount: number; newestUpdatedAt: string | null; ageMinutes: number | null };
  };
  dataStatus: {
    totalFootballMatches: number;
    totalBasketballGames: number;
    totalMatchesCombined: number;
    databaseSizeBytes: number | null;
    aggregationMethod: string;
    unresolvedTeamsCount: number;
    matchesPerLeague: Array<{
      sport: 'football' | 'basketball';
      league: string;
      leagueName: string;
      count: number;
      earliestDate: string | null;
      latestDate: string | null;
      daysAgo: number | null;
      isStale: boolean;
    }>;
  };
  providerBudget: {
    callsTodayTotal: number;
    totalBudgetedCallsPerDay: number;
    providers: Array<{
      id: string;
      name: string;
      sport: string;
      callsToday: number;
      dailyQuotaLimit: number;
      budgetedCallsPerDay: number;
    }>;
  };
  payments: {
    totalPaymentsCount: number;
    manualGrantsCount: number;
    successfulPaymentsCount: number;
  };
}

export default function AdminOverviewSection() {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/overview', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to load overview metrics.');
      setData(json);
    } catch (err: any) {
      setError(err?.message || 'Unable to load admin overview.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 rounded-[12px] border border-[var(--border)] bg-[var(--surface)] animate-pulse" />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 rounded-[12px] border border-[var(--danger)]/30 bg-[var(--danger-soft)] text-[var(--danger)] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[13px]">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error || 'Overview metrics unavailable.'}</span>
        </div>
        <button
          type="button"
          onClick={load}
          className="px-3 py-1.5 rounded-[8px] border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)] text-[12px]"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-[var(--text)]">System overview</h2>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="h-8 px-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-2)] hover:text-[var(--text)] text-[12px] flex items-center gap-1.5 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-[12px] border border-[var(--border)] bg-[var(--surface)]">
          <div className="text-[11px] uppercase tracking-wide text-[var(--text-3)] flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>Total users</span>
          </div>
          <div className="text-[22px] font-bold text-[var(--text)] mt-1 tabular-nums">
            {data.users.totalUsers}
          </div>
          <div className="text-[11.5px] text-[var(--text-2)] mt-0.5 tabular-nums">
            {data.users.newUsers7d} in 7d / {data.users.newUsers30d} in 30d
          </div>
        </div>

        <div className="p-3.5 rounded-[12px] border border-[var(--border)] bg-[var(--surface)]">
          <div className="text-[11px] uppercase tracking-wide text-[var(--text-3)] flex items-center gap-1.5">
            <CreditCard className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>Active subscriptions</span>
          </div>
          <div className="text-[22px] font-bold text-[var(--text)] mt-1 tabular-nums">
            {data.users.activeSubscriptions}
          </div>
          <div className="text-[11.5px] text-[var(--text-2)] mt-0.5 tabular-nums">
            {data.users.expiringIn7d} expiring in 7 days
          </div>
        </div>

        <div className="p-3.5 rounded-[12px] border border-[var(--border)] bg-[var(--surface)]">
          <div className="text-[11px] uppercase tracking-wide text-[var(--text-3)] flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>Database size</span>
          </div>
          <div className="text-[22px] font-bold text-[var(--text)] mt-1 tabular-nums">
            {formatBytes(data.dataStatus.databaseSizeBytes)}
          </div>
          <div className="text-[11.5px] text-[var(--text-2)] mt-0.5 tabular-nums">
            {data.dataStatus.totalMatchesCombined.toLocaleString()} stored matches
          </div>
        </div>

        <div className="p-3.5 rounded-[12px] border border-[var(--border)] bg-[var(--surface)]">
          <div className="text-[11px] uppercase tracking-wide text-[var(--text-3)] flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>API budget today</span>
          </div>
          <div className="text-[22px] font-bold text-[var(--text)] mt-1 tabular-nums">
            {data.providerBudget.callsTodayTotal}
          </div>
          <div className="text-[11.5px] text-[var(--text-2)] mt-0.5 tabular-nums">
            of {data.providerBudget.totalBudgetedCallsPerDay} daily budget
          </div>
        </div>
      </div>

      {/* Tablet Two-Column Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Users per Tier & Subscriptions */}
        <div className="p-4 rounded-[12px] border border-[var(--border)] bg-[var(--surface)] space-y-3">
          <h3 className="text-[13.5px] font-semibold text-[var(--text)]">
            Users by tier and account status
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {(['free', 'pro', 'premium'] as const).map((tierKey) => (
              <div
                key={tierKey}
                className="p-2.5 rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)]"
              >
                <div className="text-[11px] uppercase text-[var(--text-3)]">{tierKey}</div>
                <div className="text-[18px] font-semibold text-[var(--text)] tabular-nums mt-0.5">
                  {data.users.usersByTier[tierKey]}
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1 text-[12px] text-[var(--text-2)]">
            <div className="flex items-center justify-between p-2 rounded-[8px] bg-[var(--surface-2)]">
              <span>Admin accounts</span>
              <span className="font-semibold text-[var(--text)] tabular-nums">{data.users.adminCount}</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-[8px] bg-[var(--surface-2)]">
              <span>Suspended</span>
              <span className="font-semibold text-[var(--text)] tabular-nums">{data.users.suspendedCount}</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-[8px] bg-[var(--surface-2)]">
              <span>Payments logged</span>
              <span className="font-semibold text-[var(--text)] tabular-nums">{data.payments.totalPaymentsCount}</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-[8px] bg-[var(--surface-2)]">
              <span>Manual grants</span>
              <span className="font-semibold text-[var(--text)] tabular-nums">{data.payments.manualGrantsCount}</span>
            </div>
          </div>
        </div>

        {/* Sync Freshness & Provider Budgets */}
        <div className="p-4 rounded-[12px] border border-[var(--border)] bg-[var(--surface)] space-y-3">
          <h3 className="text-[13.5px] font-semibold text-[var(--text)] flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-[var(--accent)]" />
            <span>Sync freshness and provider quota</span>
          </h3>
          <div className="p-2.5 rounded-[8px] bg-[var(--surface-2)] border border-[var(--border)] space-y-1 text-[12px]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[var(--text-2)]">Latest sync time</span>
              <span className="font-mono text-[var(--text)]">{formatAdminDate(data.sync.latestSyncTime)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[var(--text-2)]">Football active slate</span>
              <span className="tabular-nums text-[var(--text)]">{data.sync.footballFreshness.fixtureCount} fixtures</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[var(--text-2)]">Basketball active slate</span>
              <span className="tabular-nums text-[var(--text)]">{data.sync.basketballFreshness.fixtureCount} games</span>
            </div>
          </div>
          <div className="space-y-1.5">
            {data.providerBudget.providers.map((p) => {
              const pct = p.budgetedCallsPerDay > 0 ? Math.min(100, (p.callsToday / p.budgetedCallsPerDay) * 100) : 0;
              return (
                <div key={p.id} className="space-y-1">
                  <div className="flex items-center justify-between text-[11.5px]">
                    <span className="text-[var(--text)] font-medium">{cleanDisplayText(p.name)}</span>
                    <span className="font-mono text-[var(--text-2)] tabular-nums">
                      {p.callsToday} / {p.budgetedCallsPerDay} (limit {p.dailyQuotaLimit})
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-[var(--surface-2)] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[var(--accent)]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Matches per League Data Status */}
      <div className="p-4 rounded-[12px] border border-[var(--border)] bg-[var(--surface)] space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-[13.5px] font-semibold text-[var(--text)]">
              Stored matches per league
            </h3>
            <p className="text-[12px] text-[var(--text-2)]">
              Football: {data.dataStatus.totalFootballMatches.toLocaleString()} matches. Basketball: {data.dataStatus.totalBasketballGames.toLocaleString()} games. Unresolved teams: {data.dataStatus.unresolvedTeamsCount}.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {data.dataStatus.matchesPerLeague.map((item) => (
            <div
              key={`${item.sport}:${item.league}`}
              className="p-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-[var(--text)] truncate">
                    {cleanDisplayText(item.leagueName)}
                  </span>
                  <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-[var(--surface)] border border-[var(--border)] text-[var(--text-2)] uppercase">
                    {item.sport}
                  </span>
                </div>
                <div className="text-[11px] text-[var(--text-3)] mt-0.5">
                  Latest match: {item.latestDate || 'None'}
                  {typeof item.daysAgo === 'number' ? ` (${item.daysAgo}d ago)` : ''}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[15px] font-semibold text-[var(--text)] tabular-nums">
                  {item.count.toLocaleString()}
                </div>
                <div
                  className={`text-[10.5px] font-medium ${
                    item.isStale ? 'text-[var(--warn)]' : 'text-[var(--accent)]'
                  }`}
                >
                  {item.isStale ? 'Needs sync' : 'Current'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
