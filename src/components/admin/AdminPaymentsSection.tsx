'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { CreditCard, Plus, CheckCircle2, AlertCircle } from 'lucide-react';
import {
  AdminPaymentItem,
  PaginationControls,
  formatAdminDate,
  formatCurrencyAmount,
} from './adminTypes';
import { cleanDisplayText } from '@/lib/utils/formatText';

export default function AdminPaymentsSection() {
  const [payments, setPayments] = useState<AdminPaymentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');
  const [manualFilter, setManualFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Manual Grant Form State
  const [showGrantForm, setShowGrantForm] = useState(false);
  const [grantUserInput, setGrantUserInput] = useState('');
  const [grantPlan, setGrantPlan] = useState<'pro' | 'premium'>('pro');
  const [grantDays, setGrantDays] = useState<string>('30');
  const [grantCustomDate, setGrantCustomDate] = useState('');
  const [grantNote, setGrantNote] = useState('');
  const [grantSubmitting, setGrantSubmitting] = useState(false);
  const [grantFeedback, setGrantFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const loadPayments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        page: String(page),
        pageSize: '25',
        status: statusFilter,
        manualOnly: manualFilter,
      });
      if (search.trim()) qs.set('search', search.trim());

      const res = await fetch(`/api/admin/payments?${qs.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to load payments.');
      setPayments(Array.isArray(json.payments) ? json.payments : []);
      setTotal(Number(json.total) || 0);
      setTotalPages(Math.max(1, Number(json.totalPages) || 1));
    } catch (err: any) {
      setError(err?.message || 'Unable to load payment records.');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, manualFilter, search]);

  useEffect(() => {
    const timer = setTimeout(() => loadPayments(), 150);
    return () => clearTimeout(timer);
  }, [loadPayments]);

  const handleRecordGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    setGrantSubmitting(true);
    setGrantFeedback(null);
    try {
      const res = await fetch('/api/admin/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIdOrEmail: grantUserInput.trim(),
          plan: grantPlan,
          expiryDays: grantCustomDate ? undefined : Number(grantDays) || 30,
          customDate: grantCustomDate || undefined,
          grantNote: grantNote.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to record manual grant.');

      setGrantFeedback({
        type: 'ok',
        text: `Manual ${grantPlan} grant recorded (${json.payment?.reference || 'saved'}).`,
      });
      setGrantUserInput('');
      setGrantNote('');
      setGrantCustomDate('');
      await loadPayments();
    } catch (err: any) {
      setGrantFeedback({ type: 'err', text: err?.message || 'Unable to record manual grant.' });
    } finally {
      setGrantSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-[12px] border border-[var(--border)] bg-[var(--surface)] space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div>
            <h2 className="text-[15px] font-semibold text-[var(--text)] flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-[var(--accent)]" />
              <span>Subscriptions and payments</span>
            </h2>
            <p className="text-[12px] text-[var(--text-2)]">
              Paystack webhook transactions and admin manual tier grants.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowGrantForm((prev) => !prev)}
            className="h-9 px-3.5 rounded-[8px] bg-[var(--accent-fill)] text-[var(--accent-ink)] text-[12.5px] font-semibold flex items-center justify-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>{showGrantForm ? 'Hide grant form' : 'Record manual grant'}</span>
          </button>
        </div>

        {showGrantForm && (
          <form
            onSubmit={handleRecordGrant}
            className="p-3.5 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] space-y-3"
          >
            <div className="text-[13px] font-semibold text-[var(--text)]">
              Grant manual subscription access
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11.5px] text-[var(--text-2)] mb-1">
                  User email or user ID
                </label>
                <input
                  type="text"
                  required
                  value={grantUserInput}
                  onChange={(e) => setGrantUserInput(e.target.value)}
                  placeholder="member@example.com"
                  className="w-full h-9 px-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] text-[13px] text-[var(--text)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11.5px] text-[var(--text-2)] mb-1">Plan</label>
                  <select
                    value={grantPlan}
                    onChange={(e) => setGrantPlan(e.target.value === 'premium' ? 'premium' : 'pro')}
                    className="w-full h-9 px-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] text-[13px] text-[var(--text)]"
                  >
                    <option value="pro">Pro</option>
                    <option value="premium">Premium</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11.5px] text-[var(--text-2)] mb-1">Duration</label>
                  <select
                    value={grantDays}
                    onChange={(e) => setGrantDays(e.target.value)}
                    disabled={Boolean(grantCustomDate)}
                    className="w-full h-9 px-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] text-[13px] text-[var(--text)] disabled:opacity-50"
                  >
                    <option value="30">30 days</option>
                    <option value="90">90 days</option>
                    <option value="365">365 days</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11.5px] text-[var(--text-2)] mb-1">
                  Or custom expiry date (UTC)
                </label>
                <input
                  type="datetime-local"
                  value={grantCustomDate}
                  onChange={(e) => setGrantCustomDate(e.target.value)}
                  className="w-full h-9 px-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] text-[13px] text-[var(--text)]"
                />
              </div>

              <div>
                <label className="block text-[11.5px] text-[var(--text-2)] mb-1">
                  Manual grant note (required)
                </label>
                <input
                  type="text"
                  required
                  value={grantNote}
                  onChange={(e) => setGrantNote(e.target.value)}
                  placeholder="Invoice settled or partner comp approval"
                  className="w-full h-9 px-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] text-[13px] text-[var(--text)]"
                />
              </div>
            </div>

            {grantFeedback && (
              <div
                className={`p-2.5 rounded-[8px] text-[12px] flex items-center gap-2 ${
                  grantFeedback.type === 'ok'
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/30'
                    : 'bg-[var(--danger-soft)] text-[var(--danger)] border border-[var(--danger)]/30'
                }`}
              >
                {grantFeedback.type === 'ok' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{grantFeedback.text}</span>
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={grantSubmitting}
                className="h-9 px-4 rounded-[8px] bg-[var(--accent-fill)] text-[var(--accent-ink)] text-[12.5px] font-semibold disabled:opacity-50"
              >
                {grantSubmitting ? 'Recording...' : 'Apply manual grant'}
              </button>
            </div>
          </form>
        )}

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search email, reference, or note"
            className="h-9 px-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] text-[13px] text-[var(--text)] placeholder:text-[var(--text-3)]"
          />
          <select
            aria-label="Filter payment status"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="h-9 px-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] text-[13px] text-[var(--text)]"
          >
            <option value="all">All payment statuses</option>
            <option value="success">Success</option>
            <option value="manual_grant">Manual grant</option>
            <option value="failed">Failed</option>
            <option value="pending">Pending</option>
          </select>
          <select
            aria-label="Filter payment source"
            value={manualFilter}
            onChange={(e) => {
              setManualFilter(e.target.value);
              setPage(1);
            }}
            className="h-9 px-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] text-[13px] text-[var(--text)]"
          >
            <option value="all">Paystack and manual grants</option>
            <option value="true">Manual grants only</option>
            <option value="false">Paystack webhooks only</option>
          </select>
        </div>

        {error && (
          <div className="p-3 rounded-[8px] border border-[var(--danger)]/30 bg-[var(--danger-soft)] text-[var(--danger)] text-[12.5px]">
            {error}
          </div>
        )}

        {loading && payments.length === 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-24 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] animate-pulse" />
            ))}
          </div>
        ) : payments.length === 0 ? (
          <div className="p-6 text-center text-[13px] text-[var(--text-2)] border border-[var(--border)] rounded-[10px] bg-[var(--surface-2)]">
            No Paystack payments or manual grants recorded yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {payments.map((p) => (
              <div
                key={p.id}
                className="p-3.5 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] space-y-2 min-w-0"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-semibold text-[var(--text)] truncate">
                      {p.email || p.userId || 'Unknown account'}
                    </div>
                    <div className="text-[11px] font-mono text-[var(--text-3)] truncate">
                      {p.reference}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="px-2 py-0.5 rounded-[4px] bg-[var(--surface)] border border-[var(--border)] text-[11px] uppercase font-medium text-[var(--text)]">
                      {cleanDisplayText(p.plan)}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-[4px] text-[11px] font-medium ${
                        p.status === 'success' || p.isManualGrant
                          ? 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/30'
                          : 'bg-[var(--danger-soft)] text-[var(--danger)] border border-[var(--danger)]/30'
                      }`}
                    >
                      {p.isManualGrant ? 'Manual grant' : cleanDisplayText(p.status)}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-[var(--text-2)]">
                  <span className="font-semibold text-[var(--text)] tabular-nums">
                    {formatCurrencyAmount(p.amountKobo, p.currency)}
                  </span>
                  <span>{formatAdminDate(p.paidAt || p.createdAt)}</span>
                </div>

                {p.grantNote && (
                  <div className="p-2 rounded-[6px] bg-[var(--surface)] border border-[var(--border)] text-[11.5px] text-[var(--text-2)]">
                    Note: {p.grantNote}
                  </div>
                )}

                {p.userId && (
                  <div className="pt-1 flex justify-end">
                    <Link
                      href={`/admin/users/${encodeURIComponent(p.userId)}`}
                      className="text-[11.5px] text-[var(--accent)] hover:underline"
                    >
                      Open user account
                    </Link>
                  </div>
                )}
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
