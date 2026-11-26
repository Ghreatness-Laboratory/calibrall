// CALIBRALL: Server-Side Subscription Tier Resolution & Redaction
// Enforces tier boundaries strictly from server-verified Supabase session + profiles table.
// NEVER trusts client headers (x-calibrall-tier) or client cookies (calibrall_tier).

import { WrittenMatchExplanation } from '@/types';
import { cleanDisplayText } from '@/lib/utils/formatText';
import {
  getServerAuthSession,
  type ServerAuthSession,
  type AccountTier,
} from '@/lib/supabase/serverAuth';

export type ResolvedUserTier = AccountTier;
export const FREE_DAILY_SUMMARY_LIMIT = 3;

export function resolveTierFromSession(
  session: ServerAuthSession | null | undefined
): ResolvedUserTier {
  if (!session) return 'free';
  return session.effectiveTier;
}

export async function resolveRequestTier(request: Request): Promise<ResolvedUserTier> {
  const session = await getServerAuthSession(request);
  return resolveTierFromSession(session);
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
