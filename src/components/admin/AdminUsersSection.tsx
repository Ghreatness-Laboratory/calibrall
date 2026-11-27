'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Search, Shield, Ban, ArrowUpRight, AlertCircle } from 'lucide-react';
import {
  AdminUserItem,
  PaginationControls,
  formatAdminDate,
} from './adminTypes';

export default function AdminUsersSection() {
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        page: String(page),
        pageSize: '25',
        tier: tierFilter,
        role: roleFilter,
        status: statusFilter,
      });
      if (search.trim()) qs.set('search', search.trim());

      const res = await fetch(`/api/admin/users?${qs.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to load users.');
      setUsers(Array.isArray(json.users) ? json.users : []);
      setTotal(Number(json.total) || 0);
      setTotalPages(Math.max(1, Number(json.totalPages) || 1));
    } catch (err: any) {
      setError(err?.message || 'Unable to load user directory.');
    } finally {
      setLoading(false);
    }
  }, [page, search, tierFilter, roleFilter, statusFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadUsers();
    }, 180);
    return () => clearTimeout(timer);
  }, [loadUsers]);

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-[12px] border border-[var(--border)] bg-[var(--surface)] space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-[15px] font-semibold text-[var(--text)]">User directory</h2>
            <p className="text-[12px] text-[var(--text-2)]">
              Search and manage roles, subscription tiers, expiry dates, and account status.
            </p>
          </div>
          <div className="text-[12px] text-[var(--text-2)] tabular-nums">
            {total} matching accounts
          </div>
        </div>

        {/* Search & Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div className="relative md:col-span-2 lg:col-span-1">
            <Search className="w-4 h-4 text-[var(--text-3)] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search email, name, or ID"
              className="w-full h-9 pl-9 pr-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] text-[13px] text-[var(--text)] placeholder:text-[var(--text-3)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          <select
            aria-label="Filter by tier"
            value={tierFilter}
            onChange={(e) => {
              setTierFilter(e.target.value);
              setPage(1);
            }}
            className="h-9 px-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] text-[13px] text-[var(--text)]"
          >
            <option value="all">All tiers</option>
            <option value="free">Free</option>
            <option value="pro">Pro</option>
            <option value="premium">Premium</option>
          </select>

          <select
            aria-label="Filter by role"
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setPage(1);
            }}
            className="h-9 px-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] text-[13px] text-[var(--text)]"
          >
            <option value="all">All roles</option>
            <option value="user">Standard user</option>
            <option value="admin">Admin</option>
          </select>

          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="h-9 px-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] text-[13px] text-[var(--text)]"
          >
            <option value="all">All statuses</option>
            <option value="active">Active only</option>
            <option value="suspended">Suspended only</option>
            <option value="expiring">Expiring in 7 days</option>
          </select>
        </div>

        {error && (
          <div className="p-3 rounded-[8px] border border-[var(--danger)]/30 bg-[var(--danger-soft)] text-[var(--danger)] text-[12.5px] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Mobile-first, Tablet 2-column grid */}
        {loading && users.length === 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] animate-pulse" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="p-6 text-center text-[13px] text-[var(--text-2)] border border-[var(--border)] rounded-[10px] bg-[var(--surface-2)]">
            No user accounts matched the selected filters.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {users.map((u) => (
              <div
                key={u.id}
                className="p-3.5 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] flex flex-col justify-between gap-3 min-w-0"
              >
                <div className="flex items-start justify-between gap-2 min-w-0">
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold text-[var(--text)] truncate">
                      {u.displayName || u.email || 'Unnamed member'}
                    </div>
                    <div className="text-[12px] text-[var(--text-2)] truncate">{u.email}</div>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-1 shrink-0">
                    <span className="px-2 py-0.5 rounded-[4px] border border-[var(--border)] bg-[var(--surface)] text-[11px] font-medium uppercase text-[var(--text)]">
                      {u.tier}
                    </span>
                    {u.role === 'admin' && (
                      <span className="px-2 py-0.5 rounded-[4px] border border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[11px] font-medium text-[var(--accent)] flex items-center gap-1">
                        <Shield className="w-3 h-3" />
                        <span>Admin</span>
                      </span>
                    )}
                    {u.suspended && (
                      <span className="px-2 py-0.5 rounded-[4px] border border-[var(--danger)]/40 bg-[var(--danger-soft)] text-[11px] font-medium text-[var(--danger)] flex items-center gap-1">
                        <Ban className="w-3 h-3" />
                        <span>Suspended</span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11.5px] text-[var(--text-2)]">
                  <div>
                    <span className="text-[var(--text-3)]">Expiry: </span>
                    <span className="text-[var(--text)]">
                      {u.role === 'admin'
                        ? 'Never'
                        : u.tierExpiresAt
                        ? formatAdminDate(u.tierExpiresAt)
                        : 'None'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[var(--text-3)]">Last sign in: </span>
                    <span className="text-[var(--text)]">{formatAdminDate(u.lastSignInAt)}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-[var(--text-3)]">Created: </span>
                    <span className="text-[var(--text)]">{formatAdminDate(u.createdAt)}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--border)]">
                  <span className="text-[11px] font-mono text-[var(--text-3)] truncate">{u.id}</span>
                  <Link
                    href={`/admin/users/${encodeURIComponent(u.id)}`}
                    className="h-8 px-3 rounded-[8px] bg-[var(--accent-fill)] text-[var(--accent-ink)] text-[12px] font-semibold flex items-center gap-1 shrink-0 hover:opacity-90 transition-opacity"
                  >
                    <span>Manage</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ))}
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
