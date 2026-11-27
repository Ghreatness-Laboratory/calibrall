'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  RefreshCw,
  Database,
  EyeOff,
  Eye,
  Ban,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { AdminPickItem, PaginationControls, formatAdminDate } from './adminTypes';
import { cleanDisplayText } from '@/lib/utils/formatText';

interface BackfillSummary {
  footballMatches: number;
  footballEarliestDate: string | null;
  footballLatestDate: string | null;
  basketballGames: number;
  basketballEarliestDate: string | null;
  basketballLatestDate: string | null;
  unresolvedTeamsCount: number;
}

export default function AdminContentModelSection() {
  const [picks, setPicks] = useState<AdminPickItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [sportFilter, setSportFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [backfillStatus, setBackfillStatus] = useState<BackfillSummary | null>(null);
  const [syncSport, setSyncSport] = useState<'all' | 'football' | 'basketball'>('all');
  const [syncMode, setSyncMode] = useState<'schedule' | 'odds' | 'results'>('schedule');
  const [syncing, setSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Pick moderation prompt state
  const [activeMod, setActiveMod] = useState<{
    pick: AdminPickItem;
    action: 'hide' | 'unhide' | 'void' | 'restore';
  } | null>(null);
  const [modReason, setModReason] = useState('');
  const [modSubmitting, setModSubmitting] = useState(false);
  const [modNotice, setModNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const loadPicks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        page: String(page),
        pageSize: '25',
        sport: sportFilter,
        status: statusFilter,
      });
      if (search.trim()) qs.set('search', search.trim());

      const res = await fetch(`/api/admin/picks?${qs.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to load picks.');
      setPicks(Array.isArray(json.picks) ? json.picks : []);
      setTotal(Number(json.total) || 0);
      setTotalPages(Math.max(1, Number(json.totalPages) || 1));
    } catch (err: any) {
      setError(err?.message || 'Unable to load picks.');
    } finally {
      setLoading(false);
    }
  }, [page, sportFilter, statusFilter, search]);

  const loadBackfillStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/system-health?page=1&pageSize=1', { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        if (json?.backfillStatus) {
          setBackfillStatus(json.backfillStatus);
        }
      }
    } catch {
      // Non-fatal
    }
  }, []);

  useEffect(() => {
    loadBackfillStatus();
  }, [loadBackfillStatus]);

  useEffect(() => {
    const timer = setTimeout(() => loadPicks(), 150);
    return () => clearTimeout(timer);
  }, [loadPicks]);

  const handleTriggerSync = async () => {
    setSyncing(true);
    setSyncNotice(null);
    try {
      const res = await fetch('/api/admin/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sport: syncSport, mode: syncMode }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Sync run failed.');
      setSyncNotice({
        type: 'ok',
        text: `Sync completed (${json.recordsProcessed || 0} records processed).`,
      });
      await Promise.all([loadPicks(), loadBackfillStatus()]);
    } catch (err: any) {
      setSyncNotice({ type: 'err', text: err?.message || 'Sync run failed.' });
    } finally {
      setSyncing(false);
    }
  };

  const handleSubmitModeration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeMod) return;
    setModSubmitting(true);
    setModNotice(null);
    try {
      const res = await fetch(`/api/admin/picks/${encodeURIComponent(activeMod.pick.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sport: activeMod.pick.sport,
          action: activeMod.action,
          reason: modReason.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Pick update failed.');
      setModNotice({
        type: 'ok',
        text: `Pick ${activeMod.pick.id} updated (${activeMod.action}).`,
      });
      setActiveMod(null);
      setModReason('');
      await loadPicks();
    } catch (err: any) {
      setModNotice({ type: 'err', text: err?.message || 'Pick update failed.' });
    } finally {
      setModSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Sync Controls & Backfill Tool Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-[12px] border border-[var(--border)] bg-[var(--surface)] space-y-3">
          <div>
            <h2 className="text-[14px] font-semibold text-[var(--text)] flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-[var(--accent)]" />
              <span>Trigger pipeline sync</span>
            </h2>
            <p className="text-[12px] text-[var(--text-2)] mt-0.5">
              Runs server side provider sync under admin audit tracking.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <select
              aria-label="Sync sport"
              value={syncSport}
              onChange={(e) => setSyncSport(e.target.value as any)}
              className="h-9 px-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] text-[13px] text-[var(--text)]"
            >
              <option value="all">All sports</option>
              <option value="football">Football</option>
              <option value="basketball">Basketball</option>
            </select>
            <select
              aria-label="Sync mode"
              value={syncMode}
              onChange={(e) => setSyncMode(e.target.value as any)}
              className="h-9 px-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] text-[13px] text-[var(--text)]"
            >
              <option value="schedule">Schedule</option>
              <option value="odds">Odds</option>
              <option value="results">Results</option>
            </select>
          </div>

          <button
            type="button"
            onClick={handleTriggerSync}
            disabled={syncing}
            className="w-full h-9 rounded-[8px] bg-[var(--accent-fill)] text-[var(--accent-ink)] text-[12.5px] font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Synchronizing...' : 'Trigger sync now'}</span>
          </button>

          {syncNotice && (
            <div
              className={`p-2.5 rounded-[8px] text-[12px] flex items-center gap-2 ${
                syncNotice.type === 'ok'
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/30'
                  : 'bg-[var(--danger-soft)] text-[var(--danger)] border border-[var(--danger)]/30'
              }`}
            >
              {syncNotice.type === 'ok' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{syncNotice.text}</span>
            </div>
          )}
        </div>

        <div className="p-4 rounded-[12px] border border-[var(--border)] bg-[var(--surface)] flex flex-col justify-between gap-3">
          <div className="space-y-2">
            <h2 className="text-[14px] font-semibold text-[var(--text)] flex items-center gap-2">
              <Database className="w-4 h-4 text-[var(--accent)]" />
              <span>Historical backfill status</span>
            </h2>
            {backfillStatus ? (
              <div className="grid grid-cols-2 gap-2 text-[12px]">
                <div className="p-2.5 rounded-[8px] bg-[var(--surface-2)] border border-[var(--border)]">
                  <div className="text-[11px] text-[var(--text-3)]">Football archive</div>
                  <div className="text-[15px] font-semibold text-[var(--text)] tabular-nums">
                    {backfillStatus.footballMatches.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-[var(--text-2)]">
                    Latest: {backfillStatus.footballLatestDate || 'None'}
                  </div>
                </div>
                <div className="p-2.5 rounded-[8px] bg-[var(--surface-2)] border border-[var(--border)]">
                  <div className="text-[11px] text-[var(--text-3)]">Basketball archive</div>
                  <div className="text-[15px] font-semibold text-[var(--text)] tabular-nums">
                    {backfillStatus.basketballGames.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-[var(--text-2)]">
                    Latest: {backfillStatus.basketballLatestDate || 'None'}
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-16 rounded-[8px] bg-[var(--surface-2)] animate-pulse" />
            )}
          </div>

          <Link
            href="/admin/backfill"
            className="h-9 px-3.5 rounded-[8px] border border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--text)] text-[12.5px] font-medium flex items-center justify-center gap-1.5 hover:border-[var(--accent)] transition-colors"
          >
            <span>Open historical backfill console</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Moderation Modal / Inline Form */}
      {activeMod && (
        <form
          onSubmit={handleSubmitModeration}
          className="p-4 rounded-[12px] border border-[var(--accent)]/40 bg-[var(--surface)] space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="text-[13.5px] font-semibold text-[var(--text)]">
              Confirm pick action: {activeMod.action} ({activeMod.pick.selection || activeMod.pick.id})
            </div>
            <button
              type="button"
              onClick={() => {
                setActiveMod(null);
                setModReason('');
              }}
              className="text-[12px] text-[var(--text-2)] hover:text-[var(--text)]"
            >
              Cancel
            </button>
          </div>
          <div>
            <label className="block text-[11.5px] text-[var(--text-2)] mb-1">
              Moderation reason{' '}
              {activeMod.action === 'hide' || activeMod.action === 'void'
                ? '(required)'
                : '(optional)'}
            </label>
            <input
              type="text"
              required={activeMod.action === 'hide' || activeMod.action === 'void'}
              value={modReason}
              onChange={(e) => setModReason(e.target.value)}
              placeholder="Stale lineup data or voided fixture"
              className="w-full h-9 px-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] text-[13px] text-[var(--text)]"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="submit"
              disabled={modSubmitting}
              className="h-9 px-4 rounded-[8px] bg-[var(--accent-fill)] text-[var(--accent-ink)] text-[12.5px] font-semibold disabled:opacity-50"
            >
              {modSubmitting ? 'Applying...' : 'Confirm'}
            </button>
          </div>
        </form>
      )}

      {modNotice && (
        <div
          className={`p-3 rounded-[8px] text-[12.5px] flex items-center gap-2 ${
            modNotice.type === 'ok'
              ? 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/30'
              : 'bg-[var(--danger-soft)] text-[var(--danger)] border border-[var(--danger)]/30'
          }`}
        >
          <span>{modNotice.text}</span>
        </div>
      )}

      {/* Full Picks Registry (including locked picks) */}
      <div className="p-4 rounded-[12px] border border-[var(--border)] bg-[var(--surface)] space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-[15px] font-semibold text-[var(--text)]">
              All model picks (unlocked admin view)
            </h3>
            <p className="text-[12px] text-[var(--text-2)]">
              Inspect stored summaries, full reasoning, alternates, and hide or void picks.
            </p>
          </div>
          <span className="text-[12px] text-[var(--text-2)] tabular-nums">{total} stored picks</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search fixture, team, market, or league"
            className="h-9 px-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] text-[13px] text-[var(--text)] placeholder:text-[var(--text-3)]"
          />
          <select
            aria-label="Filter picks by sport"
            value={sportFilter}
            onChange={(e) => {
              setSportFilter(e.target.value);
              setPage(1);
            }}
            className="h-9 px-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] text-[13px] text-[var(--text)]"
          >
            <option value="all">All sports</option>
            <option value="football">Football</option>
            <option value="basketball">Basketball</option>
          </select>
          <select
            aria-label="Filter picks by moderation status"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="h-9 px-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] text-[13px] text-[var(--text)]"
          >
            <option value="all">All statuses</option>
            <option value="active">Active picks</option>
            <option value="hidden">Hidden picks</option>
            <option value="voided">Voided picks</option>
          </select>
        </div>

        {error && (
          <div className="p-3 rounded-[8px] border border-[var(--danger)]/30 bg-[var(--danger-soft)] text-[var(--danger)] text-[12.5px]">
            {error}
          </div>
        )}

        {loading && picks.length === 0 ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] animate-pulse" />
            ))}
          </div>
        ) : picks.length === 0 ? (
          <div className="p-6 text-center text-[13px] text-[var(--text-2)] border border-[var(--border)] rounded-[10px] bg-[var(--surface-2)]">
            No stored picks matched the current filters.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {picks.map((p) => {
              const isVoided = p.qualificationStatus === 'VOID' || Boolean(p.voidedReason);
              return (
                <div
                  key={`${p.sport}:${p.id}`}
                  className="p-3.5 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] flex flex-col justify-between gap-2.5 min-w-0"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[13.5px] font-semibold text-[var(--text)] truncate">
                          {cleanDisplayText(p.selection || p.marketName)}
                        </div>
                        <div className="text-[11.5px] text-[var(--text-2)] truncate">
                          {cleanDisplayText(p.competitionCode)} · {cleanDisplayText(p.marketName)}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="px-1.5 py-0.5 rounded-[4px] border border-[var(--border)] bg-[var(--surface)] text-[10.5px] uppercase text-[var(--text-2)]">
                          {p.sport}
                        </span>
                        {p.isHidden && (
                          <span className="px-1.5 py-0.5 rounded-[4px] bg-[var(--warn-soft)] text-[var(--warn)] text-[10.5px] font-medium">
                            Hidden
                          </span>
                        )}
                        {isVoided && (
                          <span className="px-1.5 py-0.5 rounded-[4px] bg-[var(--danger-soft)] text-[var(--danger)] text-[10.5px] font-medium">
                            Voided
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-[var(--text-2)] tabular-nums">
                      <span>
                        Prob: {p.probability !== null ? `${(p.probability * 100).toFixed(1)}%` : 'N/A'}
                      </span>
                      <span>Confidence: {p.confidenceTier || 'N/A'}</span>
                      <span>Model: {cleanDisplayText(p.modelVersion)}</span>
                    </div>

                    <p className="text-[12px] text-[var(--text)] leading-relaxed">
                      {cleanDisplayText(p.summary)}
                    </p>

                    {p.alternates && p.alternates.length > 0 && (
                      <div className="p-2 rounded-[6px] bg-[var(--surface)] border border-[var(--border)] space-y-1">
                        <div className="text-[10.5px] uppercase text-[var(--text-3)]">
                          Alternates ({p.alternates.length})
                        </div>
                        {p.alternates.slice(0, 2).map((alt, i) => (
                          <div key={i} className="text-[11.5px] text-[var(--text-2)]">
                            {cleanDisplayText(String(alt.label || alt.market || 'Alternate'))}
                            {alt.note ? `: ${cleanDisplayText(String(alt.note))}` : ''}
                          </div>
                        ))}
                      </div>
                    )}

                    {p.voidedReason && (
                      <div className="p-2 rounded-[6px] bg-[var(--danger-soft)] text-[var(--danger)] text-[11.5px]">
                        Moderation reason: {cleanDisplayText(p.voidedReason)}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--border)]">
                    <span className="text-[11px] text-[var(--text-3)]">
                      {formatAdminDate(p.recordedAt)}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {!p.isHidden ? (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveMod({ pick: p, action: 'hide' });
                            setModReason('');
                          }}
                          className="h-7 px-2.5 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] text-[11.5px] text-[var(--text)] flex items-center gap-1 hover:border-[var(--warn)]"
                        >
                          <EyeOff className="w-3 h-3" />
                          <span>Hide</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveMod({ pick: p, action: 'unhide' });
                            setModReason('');
                          }}
                          className="h-7 px-2.5 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] text-[11.5px] text-[var(--accent)] flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Unhide</span>
                        </button>
                      )}

                      {!isVoided ? (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveMod({ pick: p, action: 'void' });
                            setModReason('');
                          }}
                          className="h-7 px-2.5 rounded-[6px] border border-[var(--danger)]/40 bg-[var(--danger-soft)] text-[11.5px] text-[var(--danger)] flex items-center gap-1"
                        >
                          <Ban className="w-3 h-3" />
                          <span>Void</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveMod({ pick: p, action: 'restore' });
                            setModReason('');
                          }}
                          className="h-7 px-2.5 rounded-[6px] border border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[11.5px] text-[var(--accent)] flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Restore</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <PaginationControls
          page={page}
          totalPages={totalPages}
          total={total}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
