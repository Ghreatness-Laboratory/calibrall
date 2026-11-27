import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/supabase/serverAuth';
import { getSlipBuilderTierPolicy, SLIP_BUILDER_GLOBAL_BOUNDS, SlipBuildStyle } from '@/lib/tiers';
import { loadAndBuildSlipCandidates } from '@/lib/slips/candidateBuilder';
import { searchSlipsWithStats } from '@/lib/slips/slipSearch';
import { getSlipBuildUsageToday, incrementSlipBuildUsageToday } from '@/lib/slips/storage';
import type {
  SlipBuildRequest,
  SlipBuildResponse,
  SlipDayFilter,
  SlipMarketGroupKey,
  SlipOddsBasis,
  SlipSportFilter,
} from '@/lib/slips/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function todayUtcDateIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if (!auth.authorized) {
    return auth.errorResponse;
  }

  const policy = getSlipBuilderTierPolicy(auth.session.effectiveTier, auth.session.isAdmin);
  const buildsUsedToday = await getSlipBuildUsageToday(auth.session.user.id, todayUtcDateIso());
  const buildsRemainingToday =
    policy.dailyBuildLimit === null ? null : Math.max(0, policy.dailyBuildLimit - buildsUsedToday);

  return NextResponse.json(
    {
      quota: {
        tier: policy.tier,
        isAdmin: policy.isAdmin,
        dailyBuildLimit: policy.dailyBuildLimit,
        buildsUsedToday,
        buildsRemainingToday,
        maxTargetOdds: policy.maxTargetOdds,
        allowedStyles: policy.allowedStyles,
        bestPriceComparison: policy.bestPriceComparison,
      },
      bounds: SLIP_BUILDER_GLOBAL_BOUNDS,
      generatedAt: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
}

export async function POST(request: Request) {
  const auth = await requireApiUser(request);
  if (!auth.authorized) {
    return auth.errorResponse;
  }

  const policy = getSlipBuilderTierPolicy(auth.session.effectiveTier, auth.session.isAdmin);
  const dateIso = todayUtcDateIso();
  const buildsUsedBefore = await getSlipBuildUsageToday(auth.session.user.id, dateIso);

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request payload.' }, { status: 400 });
  }

  const rawTarget = Number(body?.targetOdds);
  if (
    !Number.isFinite(rawTarget) ||
    rawTarget < SLIP_BUILDER_GLOBAL_BOUNDS.minTargetOdds ||
    rawTarget > SLIP_BUILDER_GLOBAL_BOUNDS.maxTargetOdds
  ) {
    return NextResponse.json(
      {
        error: `Target odds must be between ${SLIP_BUILDER_GLOBAL_BOUNDS.minTargetOdds.toFixed(
          1
        )} and ${SLIP_BUILDER_GLOBAL_BOUNDS.maxTargetOdds.toFixed(1)}.`,
      },
      { status: 400 }
    );
  }

  if (rawTarget > policy.maxTargetOdds + 1e-6) {
    return NextResponse.json(
      {
        error: `${
          policy.tier === 'free' ? 'Free trial' : policy.tier
        } plan supports target odds up to ${policy.maxTargetOdds.toFixed(
          1
        )}. Upgrade to Pro or Premium for targets up to ${SLIP_BUILDER_GLOBAL_BOUNDS.maxTargetOdds.toFixed(
          1
        )}.`,
        code: 'TIER_TARGET_LIMIT',
      },
      { status: 403 }
    );
  }

  const style: SlipBuildStyle = body?.style === 'balanced' ? 'balanced' : 'safest';
  if (!policy.allowedStyles.includes(style)) {
    return NextResponse.json(
      {
        error: 'Balanced slip style requires a Premium plan.',
        code: 'TIER_STYLE_LOCKED',
      },
      { status: 403 }
    );
  }

  if (policy.dailyBuildLimit !== null && buildsUsedBefore >= policy.dailyBuildLimit) {
    return NextResponse.json(
      {
        error: `Daily Slip Builder limit reached (${policy.dailyBuildLimit} ${
          policy.dailyBuildLimit === 1 ? 'build' : 'builds'
        } per day on your current plan).`,
        code: 'TIER_DAILY_LIMIT',
      },
      { status: 429 }
    );
  }

  const day: SlipDayFilter = body?.day === 'tomorrow' ? 'tomorrow' : 'today';
  const sport: SlipSportFilter =
    body?.sport === 'basketball' || body?.sport === 'all' ? body.sport : 'football';
  const oddsBasis: SlipOddsBasis = body?.oddsBasis === 'model_fair' ? 'model_fair' : 'real';
  const maxLegsRaw = Number(body?.maxLegs ?? SLIP_BUILDER_GLOBAL_BOUNDS.defaultMaxLegs);
  const maxLegs = Math.max(
    SLIP_BUILDER_GLOBAL_BOUNDS.minLegs,
    Math.min(SLIP_BUILDER_GLOBAL_BOUNDS.maxLegs, Math.round(Number.isFinite(maxLegsRaw) ? maxLegsRaw : 4))
  );
  const maxPriceAgeMinutesRaw = Number(
    body?.maxPriceAgeMinutes ?? SLIP_BUILDER_GLOBAL_BOUNDS.maxPriceAgeMinutes
  );
  const maxPriceAgeMinutes = Math.max(
    15,
    Math.min(720, Math.round(Number.isFinite(maxPriceAgeMinutesRaw) ? maxPriceAgeMinutesRaw : 180))
  );

  const competitionIds = Array.isArray(body?.competitionIds)
    ? body.competitionIds.map((v: unknown) => String(v).trim()).filter(Boolean)
    : [];
  const markets = Array.isArray(body?.markets)
    ? (body.markets.map((v: unknown) => String(v).trim()).filter(Boolean) as SlipMarketGroupKey[])
    : [];

  const normalizedRequest: SlipBuildRequest = {
    targetOdds: Math.round(rawTarget * 100) / 100,
    day,
    sport,
    competitionIds,
    markets,
    maxLegs,
    style,
    oddsBasis,
    maxPriceAgeMinutes,
  };

  const t0 = Date.now();
  const nowIso = new Date().toISOString();
  const buildOut = await loadAndBuildSlipCandidates({
    day: normalizedRequest.day,
    sport: normalizedRequest.sport,
    competitionIds: normalizedRequest.competitionIds,
    markets: normalizedRequest.markets,
    oddsBasis: normalizedRequest.oddsBasis,
    bestPriceComparison: policy.bestPriceComparison,
    maxPriceAgeMinutes,
  });

  const searchOut = searchSlipsWithStats(buildOut.candidates, {
    targetOdds: normalizedRequest.targetOdds,
    maxLegs: normalizedRequest.maxLegs,
    style: normalizedRequest.style,
    maxResults: 3,
    nowIso,
  });
  const slips = searchOut.slips;

  const buildsUsedToday =
    slips.length > 0
      ? await incrementSlipBuildUsageToday(auth.session.user.id, dateIso)
      : buildsUsedBefore;

  buildOut.diagnostics.searchDurationMs = Date.now() - t0;
  buildOut.diagnostics.combinationsInBand = searchOut.combinationsInBand;

  const dayLabel = normalizedRequest.day === 'tomorrow' ? 'tomorrow' : 'today';
  const upcomingCount = buildOut.diagnostics.upcomingFixtures;
  const realPricedMatches = buildOut.diagnostics.realPricedMatches ?? 0;
  const modelFairMatches = buildOut.diagnostics.modelFairAvailableMatches ?? 0;
  const qualifiedMatches = buildOut.diagnostics.qualifiedMatches;
  const canSuggestModelFair =
    slips.length === 0 &&
    normalizedRequest.oddsBasis === 'real' &&
    modelFairMatches >= 2;

  let emptyReasonCode: NonNullable<SlipBuildResponse['diagnostics']['emptyReasonCode']> | null = null;
  let emptyMessage: string | null = null;

  if (slips.length === 0) {
    if (upcomingCount === 0) {
      emptyReasonCode = 'NO_UPCOMING_GAMES';
      emptyMessage = `0 upcoming games matched your filters for ${dayLabel}. Try switching to ${
        normalizedRequest.day === 'today' ? 'Tomorrow' : 'Today'
      }, Both sports, or clearing league filters.`;
    } else if (normalizedRequest.oddsBasis === 'real' && realPricedMatches === 0) {
      emptyReasonCode = 'NO_REAL_PRICES';
      const staleNote =
        buildOut.diagnostics.rejectedStalePrices > 0
          ? ` (${buildOut.diagnostics.rejectedStalePrices} stale prices rejected)`
          : '';
      emptyMessage = `0 of ${upcomingCount} games have a stored real bookmaker price ${dayLabel}${staleNote}.${
        canSuggestModelFair
          ? ` ${modelFairMatches} qualified games are available with model fair odds.`
          : ''
      }`;
    } else if (qualifiedMatches === 0) {
      emptyReasonCode = 'NO_QUALIFIED_MATCHES';
      emptyMessage = `0 of ${upcomingCount} upcoming games passed pre match quality gates ${dayLabel} (${buildOut.diagnostics.rejectedAbstainedOrThin} abstained or had thin sample coverage).`;
    } else {
      emptyReasonCode = 'NO_COMBINATIONS_IN_BAND';
      const pricedCount =
        normalizedRequest.oddsBasis === 'real' ? realPricedMatches : qualifiedMatches;
      const pricedLabel =
        normalizedRequest.oddsBasis === 'real' ? 'Games priced' : 'Games qualified';
      emptyMessage = `${pricedLabel}: ${pricedCount}, combinations within ${normalizedRequest.targetOdds.toFixed(
        1
      )} \u00b1 8%: ${searchOut.combinationsInBand}. Try adjusting target odds, increasing max legs in Options, or switching to ${
        normalizedRequest.day === 'today' ? 'Tomorrow' : 'Today'
      }.`;
    }
  }

  buildOut.diagnostics.emptyReasonCode = emptyReasonCode;
  buildOut.diagnostics.canSuggestModelFair = canSuggestModelFair;

  const responsePayload: SlipBuildResponse = {
    slips,
    emptyMessage,
    request: normalizedRequest,
    diagnostics: buildOut.diagnostics,
    quota: {
      tier: policy.tier,
      isAdmin: policy.isAdmin,
      dailyBuildLimit: policy.dailyBuildLimit,
      buildsUsedToday,
      buildsRemainingToday:
        policy.dailyBuildLimit === null
          ? null
          : Math.max(0, policy.dailyBuildLimit - buildsUsedToday),
      maxTargetOdds: policy.maxTargetOdds,
      allowedStyles: policy.allowedStyles,
      bestPriceComparison: policy.bestPriceComparison,
    },
    generatedAt: nowIso,
  };

  return NextResponse.json(responsePayload, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
