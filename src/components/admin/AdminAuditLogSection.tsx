'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { History, ChevronDown, ChevronUp } from 'lucide-react';
import {
  AdminAuditItem,
  PaginationControls,
  formatActionLabel,
  formatAdminDate,
} from './adminTypes';

export default function AdminAuditLogSection() {
  const [logs, setLogs] = useState<AdminAuditItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        page: String(page),
        pageSize: '25',
        action: actionFilter,
      });
      if (search.trim()) qs.set('search', search.trim());

      const res = await fetch(`/api/admin/audit-log?${qs.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to load audit log.');
      setLogs(Array.isArray(json.logs) ? json.logs : []);
      setTotal(Number(json.total) || 0);
      setTotalPages(Math.max(1, Number(json.totalPages) || 1));
    } catch (err: any) {
      setError(err?.message || 'Unable to load audit log.');
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter, search]);

  useEffect(() => {
    const timer = setTimeout(() => loadLogs(), 150);
    return () => clearTimeout(timer);
  }, [loadLogs]);

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-[12px] border border-[var(--border)] bg-[var(--surface)] space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-[15px] font-semibold text-[var(--text)] flex items-center gap-2">
              <History className="w-4 h-4 text-[var(--accent)]" />
              <span>Admin audit log</span>
            </h2>
            <p className="text-[12px] text-[var(--text-2)]">
              Immutable record of user edits, role promotions, suspensions, manual grants, and pick moderation.
            </p>
          </div>
          <span className="text-[12px] text-[var(--text-2)] tabular-nums">{total} events</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search admin email, entity ID, or note"
            className="h-9 px-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] text-[13px] text-[var(--text)] placeholder:text-[var(--text-3)]"
          />
          <select
            aria-label="Filter by audit action"
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(1);
            }}
            className="h-9 px-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] text-[13px] text-[var(--text)]"
          >
            <option value="all">All actions</option>
            <option value="USER_TIER_UPDATED">Tier updated</option>
            <option value="USER_EXPIRY_UPDATED">Expiry updated</option>
            <option value="USER_TIER_REVOKED">Tier revoked</option>
            <option value="USER_ROLE_PROMOTED">Promoted to admin</option>
            <option value="USER_ROLE_DEMOTED">Demoted from admin</option>
            <option value="USER_SUSPENDED">Account suspended</option>
            <option value="USER_REACTIVATED">Account reactivated</option>
            <option value="USER_PASSWORD_RESET_SENT">Password reset sent</option>
            <option value="MANUAL_PAYMENT_GRANTED">Manual grant recorded</option>
            <option value="PICK_HIDDEN">Pick hidden</option>
            <option value="PICK_VOIDED">Pick voided</option>
            <option value="PICK_RESTORED">Pick restored</option>
            <option value="SYNC_TRIGGERED">Sync triggered</option>
          </select>
        </div>

        {error && (
          <div className="p-3 rounded-[8px] border border-[var(--danger)]/30 bg-[var(--danger-soft)] text-[var(--danger)] text-[12.5px]">
            {error}
          </div>
        )}

        {loading && logs.length === 0 ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] animate-pulse" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="p-6 text-center text-[13px] text-[var(--text-2)] border border-[var(--border)] rounded-[10px] bg-[var(--surface-2)]">
            No audit events recorded yet.
          </div>
        ) : (
          <div className="space-y-2.5">
            {logs.map((log) => {
              const isExpanded = expandedId === log.id;
              return (
                <div
                  key={log.id}
                  className="p-3.5 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded-[4px] bg-[var(--accent-soft)] border border-[var(--accent)]/30 text-[11px] font-semibold uppercase text-[var(--accent)]">
                        {formatActionLabel(log.action)}
                      </span>
                      <span className="text-[12px] text-[var(--text)] font-medium">
                        {log.adminEmail || log.adminId || 'System'}
                      </span>
                    </div>
                    <span className="text-[11px] text-[var(--text-3)]">
                      {formatAdminDate(log.createdAt)}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-[var(--text-2)]">
                    <div className="truncate">
                      Entity: {formatActionLabel(log.entityType)} ·{' '}
                      <span className="font-mono text-[var(--text)]">{log.entityId || 'N/A'}</span>
                    </div>
                    {log.targetUserId && (
                      <Link
                        href={`/admin/users/${encodeURIComponent(log.targetUserId)}`}
                        className="text-[11.5px] text-[var(--accent)] hover:underline shrink-0"
                      >
                        Inspect user
                      </Link>
                    )}
                  </div>

                  {log.note && (
                    <div className="text-[12px] text-[var(--text)]">Note: {log.note}</div>
                  )}

                  {(log.beforeState || log.afterState) && (
                    <div>
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : log.id)}
                        className="text-[11.5px] text-[var(--text-2)] hover:text-[var(--text)] flex items-center gap-1"
                      >
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        <span>{isExpanded ? 'Hide before and after state' : 'View before and after state'}</span>
                      </button>

                      {isExpanded && (
                        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] font-mono">
                          <div className="p-2 rounded-[6px] bg-[var(--surface)] border border-[var(--border)] overflow-x-auto">
                            <div className="text-[var(--text-3)] mb-1">Before</div>
                            <pre className="whitespace-pre-wrap text-[var(--text-2)]">
                              {JSON.stringify(log.beforeState, null, 2)}
                            </pre>
                          </div>
                          <div className="p-2 rounded-[6px] bg-[var(--surface)] border border-[var(--border)] overflow-x-auto">
                            <div className="text-[var(--text-3)] mb-1">After</div>
                            <pre className="whitespace-pre-wrap text-[var(--accent)]">
                              {JSON.stringify(log.afterState, null, 2)}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
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
