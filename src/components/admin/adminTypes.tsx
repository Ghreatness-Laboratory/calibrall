'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cleanDisplayText } from '@/lib/utils/formatText';

export interface AdminUserItem {
  id: string;
  email: string;
  displayName: string | null;
  role: 'user' | 'admin';
  tier: 'free' | 'pro' | 'premium';
  tierExpiresAt: string | null;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  trialDaysRemaining: number;
  accessStatus: 'admin' | 'paid' | 'trial' | 'expired';
  suspended: boolean;
  suspendedAt: string | null;
  suspendedReason: string | null;
  createdAt: string;
  lastSignInAt: string | null;
}

export interface AdminAuditItem {
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

export interface AdminPaymentItem {
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
}

export interface AdminPickItem {
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
  alternates: Array<{ label?: string; market?: string; probability?: number; note?: string }>;
  modelVersion: string;
  isHidden: boolean;
  voidedReason: string | null;
  moderatedBy: string | null;
  moderatedAt: string | null;
  recordedAt: string | null;
}

export function formatAdminDate(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return 'Unknown';
  return new Date(ms).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }) + ' UTC';
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return 'Unavailable';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(2)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export function formatCurrencyAmount(amountKobo: number, currency: string): string {
  if (!amountKobo) return `${currency} 0`;
  const major = amountKobo / 100;
  try {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: currency || 'NGN',
      maximumFractionDigits: 2,
    }).format(major);
  } catch {
    return `${currency || 'NGN'} ${major.toFixed(2)}`;
  }
}

export function formatActionLabel(action: string): string {
  return cleanDisplayText(action.toLowerCase());
}

export function PaginationControls({
  page,
  totalPages,
  total,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (nextPage: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[var(--border)] text-[12px] text-[var(--text-2)]">
      <span className="tabular-nums">
        Page {page} of {totalPages} ({total} total)
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="h-8 px-2.5 rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] disabled:opacity-40 flex items-center gap-1 hover:border-[var(--border-strong)] transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span>Previous</span>
        </button>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="h-8 px-2.5 rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] disabled:opacity-40 flex items-center gap-1 hover:border-[var(--border-strong)] transition-colors"
        >
          <span>Next</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
