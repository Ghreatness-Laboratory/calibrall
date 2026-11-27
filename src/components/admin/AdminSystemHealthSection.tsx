'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Activity, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { PaginationControls, formatAdminDate } from './adminTypes';
import { cleanDisplayText } from '@/lib/utils/formatText';

interface SystemHealthResponse {
  timestamp: string;
  errorCount24h: number;
  callLogs: {
    items: Array<{
      id: string;
      timestamp: string;
      provider: string;
      endpoint: string;
      method: string;
      statusCode: number | null;
      ok: boolean;
      latencyMs: number;
      leagueCode: string | null;
      syncMode: string | null;
      quotaRemaining: string | null;
      responseBody: string;
      error: string | null;
    }>;
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  providerSyncStates: Array<{
    sport: string;
    providerName: string;
    status: string;
    lastAttemptAt: string | null;
    lastSuccessAt: string | null;
    lastError: string | null;
    recordsCount: number;
  }>;
  recentJobs: Array<{
    id: string;
    provider: string;
    jobType: string;
    status: string;
    recordsProcessed: number;
    errorMessage: string | null;
    startedAt: string;
    completedAt: string | null;
  }>;
}

export default function AdminSystemHealthSection() {
  const [data, setData] = useState<SystemHealthResponse | null>(null);
  const [page, setPage] = useState(1);
  const [providerFilter, setProviderFilter] = useState('all');
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        page: String(page),
        pageSize: '25',
        provider: providerFilter,
        onlyErrors: String(onlyErrors),
      });
      const res = await fetch(`/api/admin/system-health?${qs.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to load system health.');
      setData(json);
    } catch (err: any) {
      setError(err?.message || 'Unable to load system health.');
    } finally {
      setLoading(false);
    }
  }, [page, providerFilter, onlyErrors]);

  useEffect(() => {
    loadHealth();
  }, [loadHealth]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-[var(--text)] flex items-center gap-2">
          <Activity className="w-4 h-4 text-[var(--accent)]" />
          <span>System health and provider logs</span>
        </h2>
        <button
          type="button"
          onClick={loadHealth}
          disabled={loading}
          className="h-8 px-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] text-[12px] text-[var(--text)] flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-[8px] border border-[var(--danger)]/30 bg-[var(--danger-soft)] text-[var(--danger)] text-[12.5px]">
          {error}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Provider Sync States */}
            <div className="p-4 rounded-[12px] border border-[var(--border)] bg-[var(--surface)] space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-[13.5px] font-semibold text-[var(--text)]">Provider sync states</h3>
                <span
                  className={`px-2 py-0.5 rounded-[4px] text-[11px] font-medium ${
                    data.errorCount24h > 0
                      ? 'bg-[var(--danger-soft)] text-[var(--danger)]'
                      : 'bg-[var(--accent-soft)] text-[var(--accent)]'
                  }`}
                >
                  {data.errorCount24h} errors in 24h
                </span>
              </div>

              {data.providerSyncStates.length === 0 ? (
                <div className="p-3 rounded-[8px] bg-[var(--surface-2)] text-[12px] text-[var(--text-2)]">
                  No sync state entries recorded yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {data.providerSyncStates.map((st, idx) => (
                    <div
                      key={`${st.sport}:${idx}`}
                      className="p-2.5 rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] space-y-1 text-[12px]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[var(--text)] uppercase">
                          {cleanDisplayText(st.sport)} · {cleanDisplayText(st.providerName)}
                        </span>
                        <span
                          className={`text-[11px] font-medium ${
                            st.status === 'ERROR' ? 'text-[var(--danger)]' : 'text-[var(--accent)]'
                          }`}
                        >
                          {cleanDisplayText(st.status)}
                        </span>
                      </div>
                      <div className="text-[11px] text-[var(--text-2)]">
                        Last success: {formatAdminDate(st.lastSuccessAt)} ({st.recordsCount} records)
                      </div>
                      {st.lastError && (
                        <div className="text-[11px] text-[var(--danger)]">
                          Error: {cleanDisplayText(st.lastError)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Cron / Sync Runs */}
            <div className="p-4 rounded-[12px] border border-[var(--border)] bg-[var(--surface)] space-y-3">
              <h3 className="text-[13.5px] font-semibold text-[var(--text)]">Recent cron and sync runs</h3>
              {data.recentJobs.length === 0 ? (
                <div className="p-3 rounded-[8px] bg-[var(--surface-2)] text-[12px] text-[var(--text-2)]">
                  No sync job runs recorded yet.
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {data.recentJobs.map((job) => (
                    <div
                      key={job.id}
                      className="p-2.5 rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] space-y-1 text-[12px]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-[var(--text)] truncate">
                          {cleanDisplayText(job.provider)} ({cleanDisplayText(job.jobType)})
                        </span>
                        <span
                          className={`text-[11px] font-medium shrink-0 ${
                            job.status === 'FAILED' ? 'text-[var(--danger)]' : 'text-[var(--accent)]'
                          }`}
                        >
                          {cleanDisplayText(job.status)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-[var(--text-2)]">
                        <span>{formatAdminDate(job.startedAt)}</span>
                        <span className="tabular-nums">{job.recordsProcessed} records</span>
                      </div>
                      {job.errorMessage && (
                        <div className="text-[11px] text-[var(--danger)]">{job.errorMessage}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Paginated Provider Call Logs */}
          <div className="p-4 rounded-[12px] border border-[var(--border)] bg-[var(--surface)] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="text-[14px] font-semibold text-[var(--text)]">Provider call logs</h3>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Filter by provider"
                  value={providerFilter}
                  onChange={(e) => {
                    setProviderFilter(e.target.value);
                    setPage(1);
                  }}
                  className="h-8 px-2.5 rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] text-[12px] text-[var(--text)]"
                >
                  <option value="all">All providers</option>
                  <option value="football-data">Football Data</option>
                  <option value="the-odds-api">The Odds API</option>
                  <option value="api-football">API Football</option>
                  <option value="balldontlie">Balldontlie</option>
                  <option value="espn">ESPN</option>
                </select>

                <label className="h-8 px-2.5 rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] text-[12px] text-[var(--text)] flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={onlyErrors}
                    onChange={(e) => {
                      setOnlyErrors(e.target.checked);
                      setPage(1);
                    }}
                  />
                  <span>Errors only</span>
                </label>
              </div>
            </div>

            {data.callLogs.items.length === 0 ? (
              <div className="p-6 text-center text-[13px] text-[var(--text-2)] border border-[var(--border)] rounded-[10px] bg-[var(--surface-2)]">
                No provider call logs found for this filter.
              </div>
            ) : (
              <div className="space-y-2">
                {data.callLogs.items.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] space-y-1 text-[12px]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {log.ok ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5 text-[var(--danger)] shrink-0" />
                        )}
                        <span className="font-semibold text-[var(--text)]">
                          {cleanDisplayText(log.provider)}
                        </span>
                        <span className="font-mono text-[11px] text-[var(--text-2)] truncate">
                          {log.method} {log.endpoint}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] font-mono text-[var(--text-2)] shrink-0">
                        <span>HTTP {log.statusCode ?? 'ERR'}</span>
                        <span>{log.latencyMs}ms</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--text-3)]">
                      <span>{formatAdminDate(log.timestamp)}</span>
                      <span>
                        {log.syncMode ? `Mode: ${cleanDisplayText(log.syncMode)}` : ''}
                        {log.quotaRemaining ? ` · Quota left: ${log.quotaRemaining}` : ''}
                      </span>
                    </div>

                    {log.error && (
                      <div className="p-2 rounded-[6px] bg-[var(--danger-soft)] text-[var(--danger)] text-[11.5px] font-mono break-all">
                        {log.error}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <PaginationControls
              page={data.callLogs.page}
              totalPages={data.callLogs.totalPages}
              total={data.callLogs.total}
              onPageChange={setPage}
            />
          </div>
        </>
      )}
    </div>
  );
}
