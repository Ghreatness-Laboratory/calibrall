'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Shield,
  Ban,
  CheckCircle2,
  Mail,
  AlertCircle,
  KeyRound,
  History,
  CreditCard,
} from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext';
import {
  AdminUserItem,
  AdminAuditItem,
  AdminPaymentItem,
  formatActionLabel,
  formatAdminDate,
  formatCurrencyAmount,
} from './adminTypes';

export default function AdminUserDetailClient({ userId }: { userId: string }) {
  const { user: currentAdmin } = useAuth();
  const [targetUser, setTargetUser] = useState<AdminUserItem | null>(null);
  const [auditLogs, setAuditLogs] = useState<AdminAuditItem[]>([]);
  const [payments, setPayments] = useState<AdminPaymentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Mutation Controls
  const [selectedTier, setSelectedTier] = useState<'free' | 'pro' | 'premium'>('free');
  const [expiryPreset, setExpiryPreset] = useState<string>('30');
  const [customExpiryDate, setCustomExpiryDate] = useState('');
  const [extendFromCurrent, setExtendFromCurrent] = useState(true);
  const [noteInput, setNoteInput] = useState('');

  // Role confirmation dialog
  const [pendingRoleChange, setPendingRoleChange] = useState<'user' | 'admin' | null>(null);
  const [roleConfirmed, setRoleConfirmed] = useState(false);

  // Suspend reason
  const [suspendReason, setSuspendReason] = useState('');

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to load user details.');
      setTargetUser(json.user);
      setSelectedTier(json.user.tier);
      setAuditLogs(Array.isArray(json.auditLogs) ? json.auditLogs : []);
      setPayments(Array.isArray(json.payments) ? json.payments : []);
    } catch (err: any) {
      setError(err?.message || 'Unable to load user profile.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const isSelf = Boolean(currentAdmin?.id && currentAdmin.id === userId);

  const runMutation = async (payload: Record<string, any>, successMessage: string) => {
    setSubmitting(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Update failed.');
      setNotice({ type: 'ok', text: successMessage });
      setPendingRoleChange(null);
      setRoleConfirmed(false);
      await loadDetail();
    } catch (err: any) {
      setNotice({ type: 'err', text: err?.message || 'Update failed.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveTier = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Record<string, any> = {
      action: 'change_tier',
      tier: selectedTier,
      extendFromCurrent,
      note: noteInput.trim() || undefined,
    };
    if (selectedTier !== 'free') {
      if (customExpiryDate) {
        payload.customDate = customExpiryDate;
      } else if (expiryPreset === 'clear') {
        payload.clearExpiry = true;
      } else if (expiryPreset !== 'keep') {
        payload.expiryDays = Number(expiryPreset);
      }
    }
    runMutation(payload, `Tier updated to ${selectedTier}.`);
  };

  const handleApplyExpiry = (days?: number, clearExpiry?: boolean) => {
    runMutation(
      {
        action: 'set_expiry',
        expiryDays: days,
        customDate: !days && !clearExpiry ? customExpiryDate : undefined,
        clearExpiry,
        extendFromCurrent,
        note: noteInput.trim() || undefined,
      },
      clearExpiry ? 'Subscription expiry cleared.' : 'Subscription expiry updated.'
    );
  };

  const handleSendPasswordReset = async () => {
    setSubmitting(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/password-reset`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to dispatch password reset.');
      setNotice({ type: 'ok', text: json.message || 'Password reset logged.' });
      await loadDetail();
    } catch (err: any) {
      setNotice({ type: 'err', text: err?.message || 'Unable to send password reset.' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !targetUser) {
    return (
      <div className="space-y-4">
        <div className="h-24 rounded-[12px] border border-[var(--border)] bg-[var(--surface)] animate-pulse" />
        <div className="h-64 rounded-[12px] border border-[var(--border)] bg-[var(--surface)] animate-pulse" />
      </div>
    );
  }

  if (error || !targetUser) {
    return (
      <div className="space-y-3">
        <Link
          href="/admin?tab=users"
          className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--text-2)] hover:text-[var(--text)]"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to users</span>
        </Link>
        <div className="p-4 rounded-[12px] border border-[var(--danger)]/30 bg-[var(--danger-soft)] text-[var(--danger)] text-[13px]">
          {error || 'User account not found.'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/admin?tab=users"
          className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--text-2)] hover:text-[var(--text)]"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to user directory</span>
        </Link>
        <span className="text-[11px] font-mono text-[var(--text-3)]">{targetUser.id}</span>
      </div>

      {/* Profile Header Summary */}
      <div className="p-4 rounded-[12px] border border-[var(--border)] bg-[var(--surface)] space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-[18px] font-bold text-[var(--text)]">
              {targetUser.displayName || targetUser.email}
            </h1>
            <p className="text-[13px] text-[var(--text-2)]">{targetUser.email}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="px-2.5 py-1 rounded-[6px] border border-[var(--border)] bg-[var(--surface-2)] text-[11.5px] uppercase font-semibold text-[var(--text)]">
              {targetUser.tier}
            </span>
            <span
              className={`px-2.5 py-1 rounded-[6px] text-[11.5px] font-semibold ${
                targetUser.role === 'admin'
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/30'
                  : 'bg-[var(--surface-2)] text-[var(--text-2)] border border-[var(--border)]'
              }`}
            >
              {targetUser.role === 'admin' ? 'Admin' : 'Standard user'}
            </span>
            {targetUser.suspended && (
              <span className="px-2.5 py-1 rounded-[6px] bg-[var(--danger-soft)] border border-[var(--danger)]/30 text-[var(--danger)] text-[11.5px] font-semibold">
                Suspended
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-[12px] pt-2 border-t border-[var(--border)]">
          <div className="p-2.5 rounded-[8px] bg-[var(--surface-2)]">
            <div className="text-[var(--text-3)]">Subscription expiry</div>
            <div className="text-[var(--text)] font-medium mt-0.5">
              {targetUser.role === 'admin'
                ? 'Never (admin override)'
                : targetUser.tierExpiresAt
                ? formatAdminDate(targetUser.tierExpiresAt)
                : 'No expiry set'}
            </div>
          </div>
          <div className="p-2.5 rounded-[8px] bg-[var(--surface-2)]">
            <div className="text-[var(--text-3)]">Created</div>
            <div className="text-[var(--text)] font-medium mt-0.5">
              {formatAdminDate(targetUser.createdAt)}
            </div>
          </div>
          <div className="p-2.5 rounded-[8px] bg-[var(--surface-2)]">
            <div className="text-[var(--text-3)]">Last sign in</div>
            <div className="text-[var(--text)] font-medium mt-0.5">
              {formatAdminDate(targetUser.lastSignInAt)}
            </div>
          </div>
        </div>

        {targetUser.suspended && targetUser.suspendedReason && (
          <div className="p-2.5 rounded-[8px] bg-[var(--danger-soft)] border border-[var(--danger)]/30 text-[12px] text-[var(--danger)]">
            Suspension reason: {targetUser.suspendedReason}
          </div>
        )}
      </div>

      {notice && (
        <div
          className={`p-3 rounded-[10px] text-[12.5px] flex items-center gap-2 ${
            notice.type === 'ok'
              ? 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/30'
              : 'bg-[var(--danger-soft)] text-[var(--danger)] border border-[var(--danger)]/30'
          }`}
        >
          {notice.type === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{notice.text}</span>
        </div>
      )}

      {/* Two-column Control Grid on Tablet */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Tier & Expiry Management */}
        <form
          onSubmit={handleSaveTier}
          className="p-4 rounded-[12px] border border-[var(--border)] bg-[var(--surface)] space-y-3"
        >
          <h2 className="text-[14px] font-semibold text-[var(--text)]">
            Tier and subscription expiry
          </h2>

          <div className="grid grid-cols-3 gap-2">
            {(['free', 'pro', 'premium'] as const).map((tierOption) => (
              <button
                key={tierOption}
                type="button"
                onClick={() => setSelectedTier(tierOption)}
                className={`h-9 rounded-[8px] border text-[12.5px] font-semibold uppercase transition-colors ${
                  selectedTier === tierOption
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                    : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-2)]'
                }`}
              >
                {tierOption}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <label className="block text-[11.5px] text-[var(--text-2)]">
              Expiry adjustment
            </label>
            <select
              aria-label="Expiry preset"
              value={expiryPreset}
              onChange={(e) => {
                setExpiryPreset(e.target.value);
                if (e.target.value !== 'custom') setCustomExpiryDate('');
              }}
              disabled={selectedTier === 'free'}
              className="w-full h-9 px-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] text-[13px] text-[var(--text)] disabled:opacity-50"
            >
              <option value="30">Set or extend 30 days</option>
              <option value="90">Set or extend 90 days</option>
              <option value="365">Set or extend 365 days</option>
              <option value="clear">No expiry (permanent)</option>
              <option value="keep">Keep existing expiry</option>
              <option value="custom">Custom UTC date</option>
            </select>

            {(expiryPreset === 'custom' || customExpiryDate) && selectedTier !== 'free' && (
              <input
                type="datetime-local"
                value={customExpiryDate}
                onChange={(e) => setCustomExpiryDate(e.target.value)}
                className="w-full h-9 px-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] text-[13px] text-[var(--text)]"
              />
            )}

            <label className="flex items-center gap-2 text-[12px] text-[var(--text-2)]">
              <input
                type="checkbox"
                checked={extendFromCurrent}
                onChange={(e) => setExtendFromCurrent(e.target.checked)}
              />
              <span>Extend from current expiry if still active</span>
            </label>
          </div>

          <div>
            <label className="block text-[11.5px] text-[var(--text-2)] mb-1">
              Audit note (optional)
            </label>
            <input
              type="text"
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder="Support adjustment or manual plan change"
              className="w-full h-9 px-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] text-[13px] text-[var(--text)]"
            />
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="h-9 px-4 rounded-[8px] bg-[var(--accent-fill)] text-[var(--accent-ink)] text-[12.5px] font-semibold disabled:opacity-50"
            >
              Save tier
            </button>
            <button
              type="button"
              disabled={submitting || targetUser.tier === 'free'}
              onClick={() => handleApplyExpiry(30)}
              className="h-9 px-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] text-[12px] text-[var(--text)] disabled:opacity-40"
            >
              +30d
            </button>
            <button
              type="button"
              disabled={submitting || targetUser.tier === 'free'}
              onClick={() => handleApplyExpiry(90)}
              className="h-9 px-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] text-[12px] text-[var(--text)] disabled:opacity-40"
            >
              +90d
            </button>
            <button
              type="button"
              disabled={submitting || targetUser.tier === 'free'}
              onClick={() => handleApplyExpiry(365)}
              className="h-9 px-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] text-[12px] text-[var(--text)] disabled:opacity-40"
            >
              +365d
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() =>
                runMutation(
                  { action: 'revoke_free', note: noteInput.trim() || 'Revoked to Free tier' },
                  'Account revoked to Free tier.'
                )
              }
              className="h-9 px-3 rounded-[8px] border border-[var(--danger)]/40 bg-[var(--danger-soft)] text-[12px] text-[var(--danger)]"
            >
              Revoke to free
            </button>
          </div>
        </form>

        {/* Role, Suspension & Security Controls */}
        <div className="p-4 rounded-[12px] border border-[var(--border)] bg-[var(--surface)] space-y-4">
          {/* Role Control */}
          <div className="space-y-2.5">
            <h2 className="text-[14px] font-semibold text-[var(--text)] flex items-center gap-2">
              <Shield className="w-4 h-4 text-[var(--accent)]" />
              <span>Role and admin permissions</span>
            </h2>

            {targetUser.role === 'user' ? (
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  setPendingRoleChange('admin');
                  setRoleConfirmed(false);
                }}
                className="h-9 px-3.5 rounded-[8px] border border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--accent)] text-[12.5px] font-semibold"
              >
                Promote to admin
              </button>
            ) : (
              <div className="space-y-1.5">
                <button
                  type="button"
                  disabled={submitting || isSelf}
                  onClick={() => {
                    setPendingRoleChange('user');
                    setRoleConfirmed(false);
                  }}
                  className="h-9 px-3.5 rounded-[8px] border border-[var(--danger)]/40 bg-[var(--danger-soft)] text-[var(--danger)] text-[12.5px] font-semibold disabled:opacity-40"
                >
                  Demote admin to standard user
                </button>
                {isSelf && (
                  <p className="text-[11.5px] text-[var(--text-3)]">
                    Self demotion is blocked. Another admin must change your role.
                  </p>
                )}
              </div>
            )}

            {pendingRoleChange && (
              <div className="p-3 rounded-[8px] border border-[var(--warn)]/40 bg-[var(--warn-soft)] space-y-2.5">
                <div className="text-[12.5px] font-semibold text-[var(--text)]">
                  Confirm role change to {pendingRoleChange === 'admin' ? 'admin' : 'standard user'}
                </div>
                <label className="flex items-start gap-2 text-[12px] text-[var(--text)]">
                  <input
                    type="checkbox"
                    checked={roleConfirmed}
                    onChange={(e) => setRoleConfirmed(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    I confirm granting or revoking full administrative access for {targetUser.email}.
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!roleConfirmed || submitting}
                    onClick={() =>
                      runMutation(
                        {
                          action: 'set_role',
                          role: pendingRoleChange,
                          confirm: true,
                          note: noteInput.trim() || undefined,
                        },
                        `Role updated to ${pendingRoleChange}.`
                      )
                    }
                    className="h-8 px-3 rounded-[6px] bg-[var(--accent-fill)] text-[var(--accent-ink)] text-[12px] font-semibold disabled:opacity-40"
                  >
                    Confirm role change
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingRoleChange(null)}
                    className="h-8 px-3 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] text-[12px] text-[var(--text-2)]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Suspend / Reactivate */}
          <div className="pt-3 border-t border-[var(--border)] space-y-2.5">
            <h3 className="text-[13.5px] font-semibold text-[var(--text)] flex items-center gap-2">
              <Ban className="w-4 h-4 text-[var(--danger)]" />
              <span>Account status</span>
            </h3>

            {!targetUser.suspended ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  disabled={isSelf}
                  placeholder="Reason required to suspend account"
                  className="w-full h-9 px-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] text-[12.5px] text-[var(--text)] disabled:opacity-40"
                />
                <button
                  type="button"
                  disabled={submitting || isSelf || !suspendReason.trim()}
                  onClick={() =>
                    runMutation(
                      { action: 'suspend', reason: suspendReason.trim() },
                      'Account suspended immediately.'
                    )
                  }
                  className="h-9 px-3.5 rounded-[8px] border border-[var(--danger)]/40 bg-[var(--danger-soft)] text-[var(--danger)] text-[12.5px] font-semibold disabled:opacity-40"
                >
                  Suspend account
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={submitting}
                onClick={() =>
                  runMutation(
                    { action: 'reactivate', note: noteInput.trim() || 'Account reactivated' },
                    'Account reactivated.'
                  )
                }
                className="h-9 px-3.5 rounded-[8px] border border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--accent)] text-[12.5px] font-semibold"
              >
                Reactivate account
              </button>
            )}
          </div>

          {/* Password Reset Email */}
          <div className="pt-3 border-t border-[var(--border)] space-y-2">
            <h3 className="text-[13.5px] font-semibold text-[var(--text)] flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-[var(--accent)]" />
              <span>Security recovery</span>
            </h3>
            <button
              type="button"
              disabled={submitting}
              onClick={handleSendPasswordReset}
              className="h-9 px-3.5 rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] text-[12.5px] font-medium text-[var(--text)] flex items-center gap-2 hover:border-[var(--accent)] transition-colors"
            >
              <Mail className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>Send password reset email</span>
            </button>
          </div>
        </div>
      </div>

      {/* User Payments & Audit History */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-[12px] border border-[var(--border)] bg-[var(--surface)] space-y-3">
          <h3 className="text-[14px] font-semibold text-[var(--text)] flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-[var(--accent)]" />
            <span>Payment and grant history</span>
          </h3>
          {payments.length === 0 ? (
            <div className="p-3 rounded-[8px] bg-[var(--surface-2)] text-[12px] text-[var(--text-2)]">
              No payments or manual grants recorded for this user.
            </div>
          ) : (
            <div className="space-y-2">
              {payments.map((p) => (
                <div
                  key={p.id}
                  className="p-2.5 rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] text-[12px] space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[var(--text)] truncate">{p.reference}</span>
                    <span className="uppercase font-semibold text-[var(--accent)]">{p.plan}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11.5px] text-[var(--text-2)]">
                    <span>{formatCurrencyAmount(p.amountKobo, p.currency)}</span>
                    <span>{formatAdminDate(p.paidAt || p.createdAt)}</span>
                  </div>
                  {p.grantNote && (
                    <div className="text-[11px] text-[var(--text-2)]">Note: {p.grantNote}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 rounded-[12px] border border-[var(--border)] bg-[var(--surface)] space-y-3">
          <h3 className="text-[14px] font-semibold text-[var(--text)] flex items-center gap-2">
            <History className="w-4 h-4 text-[var(--accent)]" />
            <span>User audit trail</span>
          </h3>
          {auditLogs.length === 0 ? (
            <div className="p-3 rounded-[8px] bg-[var(--surface-2)] text-[12px] text-[var(--text-2)]">
              No administrative actions logged for this account yet.
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-2.5 rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] text-[12px] space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[var(--accent)]">
                      {formatActionLabel(log.action)}
                    </span>
                    <span className="text-[11px] text-[var(--text-3)]">
                      {formatAdminDate(log.createdAt)}
                    </span>
                  </div>
                  <div className="text-[11.5px] text-[var(--text-2)]">
                    By {log.adminEmail || log.adminId || 'System'}
                  </div>
                  {log.note && <div className="text-[11.5px] text-[var(--text)]">Note: {log.note}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
