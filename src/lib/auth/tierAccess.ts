// CALIBRALL: Server-Side Subscription Tier Resolution & Redaction
// Enforces tier boundaries on API routes before payloads leave the server.
// Unauthenticated requests with no tier header/cookie strictly default to 'free'.

import { WrittenMatchExplanation } from '@/types';
import { cleanDisplayText } from '@/lib/utils/formatText';

export type ResolvedUserTier = 'free' | 'pro' | 'premium';
export const FREE_DAILY_SUMMARY_LIMIT = 3;

function normalizeTier(raw: string | null | undefined): ResolvedUserTier | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (v === 'premium') return 'premium';
  if (v === 'pro') return 'pro';
  if (v === 'free') return 'free';
  return null;
}

function readCookieValue(cookieHeader: string | null, key: string): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    if (k === key) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return part.slice(eq + 1).trim();
      }
    }
  }
  return null;
}

export function resolveRequestTier(request: Request): ResolvedUserTier {
  const headerTier = normalizeTier(request.headers.get('x-calibrall-tier'));
  if (headerTier) return headerTier;

  const cookieTier = normalizeTier(readCookieValue(request.headers.get('cookie'), 'calibrall_tier'));
  if (cookieTier) return cookieTier;

  return 'free';
}

export function redactExplanationForTier(
  explanation: WrittenMatchExplanation | undefined,
  tier: ResolvedUserTier,
  summaryIndex: number
): WrittenMatchExplanation | undefined {
  if (!explanation) return undefined;

  if (tier === 'pro' || tier === 'premium') {
    return {
      ...explanation,
      tierLocked: false,
      dailySummaryLimitReached: false,
    };
  }

  const withinDailyCap = summaryIndex < FREE_DAILY_SUMMARY_LIMIT;
  return {
    oneLineSummary: withinDailyCap
      ? cleanDisplayText(explanation.oneLineSummary)
      : 'Daily free summary limit reached (3 per day). Upgrade for full match analysis.',
    fullSummary: '',
    reasoning: {},
    alternates: [],
    generatedAt: explanation.generatedAt,
    tierLocked: true,
    dailySummaryLimitReached: !withinDailyCap,
  };
}
