import { NextResponse } from 'next/server';
import { getMatchesStore } from '@/lib/data/matchesStore';
import { getUnmatchedNames, CANONICAL_TEAMS } from '@/lib/data/canonicalTeams';
import { getMissingBadges } from '@/lib/data/sources/theSportsDb';
import { isTeamNewsEnabled } from '@/lib/prediction/featureFlags';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const store = getMatchesStore();
  const allMatches = store.getAllMatches();
  const storeStats = store.getStats();

  // 1. Group newest match per league
  const leagueLatestMap = new Map<string, {
    league: string;
    latestDate: string;
    fixture: string;
    score: string;
    totalMatches: number;
  }>();

  for (const m of allMatches) {
    const existing = leagueLatestMap.get(m.competitionCode);
    if (!existing || m.date > existing.latestDate) {
      leagueLatestMap.set(m.competitionCode, {
        league: m.competitionCode,
        latestDate: m.date,
        fixture: `${m.homeTeamName} vs ${m.awayTeamName}`,
        score: `${m.homeScore}-${m.awayScore}`,
        totalMatches: (existing?.totalMatches || 0) + 1,
      });
    } else {
      existing.totalMatches += 1;
    }
  }

  const newestResultPerLeague = Array.from(leagueLatestMap.values()).sort((a, b) => b.latestDate.localeCompare(a.latestDate));

  // 2. Compute completeness distribution
  // Full stats (has shots, corners, cards, referee, closing odds)
  let fullStatsCount = 0;
  let partialStatsCount = 0;
  let scoreOnlyCount = 0;

  for (const m of allMatches) {
    const hasCorners = m.homeCorners !== undefined && m.homeCorners !== null;
    const hasCards = m.homeYellowCards !== undefined && m.homeYellowCards !== null;
    const hasShots = m.homeShots !== undefined && m.homeShots !== null;
    const hasReferee = Boolean(m.referee);
    const hasOdds = Boolean(m.oddsHomeWin);

    if (hasCorners && hasCards && hasShots && hasOdds) {
      fullStatsCount++;
    } else if (hasCorners || hasCards) {
      partialStatsCount++;
    } else {
      scoreOnlyCount++;
    }
  }

  const total = allMatches.length || 1;
  const completenessDistribution = {
    fullStats: {
      count: fullStatsCount,
      percentage: Number(((fullStatsCount / total) * 100).toFixed(1)),
      description: 'Scores, HT scores, shots, corners, cards, referee, and closing market odds',
    },
    partialStats: {
      count: partialStatsCount,
      percentage: Number(((partialStatsCount / total) * 100).toFixed(1)),
      description: 'Scores and corners/cards',
    },
    scoreOnly: {
      count: scoreOnlyCount,
      percentage: Number(((scoreOnlyCount / total) * 100).toFixed(1)),
      description: 'Historical FT/HT scores only (e.g. Elvidge / historical archives)',
    },
  };

  // 3. Unmatched teams tracking
  const unmatchedTeams = getUnmatchedNames();
  const missingBadges = getMissingBadges();

  // 4. Source synchronization metadata
  const sourceSync = {
    footballDataCoUk: {
      status: 'active',
      license: 'Free academic/research and personal use with attribution',
      coverage: 'E0 (Premier League), E1 (Championship), E2 (League One), E3 (League Two), D1, SP1, I1, F1',
      metrics: 'Scores, HT, shots, corners, cards, referee, closing market consensus odds',
      lastSyncTimestamp: new Date().toISOString(),
      recordCount: allMatches.filter((m: any) => m.provenance && m.provenance.includes('football-data.co.uk')).length,
    },
    footballDataOrg: {
      status: 'active_free_tier',
      license: 'Free tier token (10 calls/min, 10 active competitions)',
      coverage: 'PL, BL1, PD, SA, FL1, DED, PPL, CL',
      note: 'Free tier excludes Championship (ELC) and lower tiers',
      lastSyncTimestamp: new Date().toISOString(),
    },
    seanElvidgeResults: {
      status: 'active',
      license: 'Creative Commons Attribution 4.0 International (CC BY 4.0)',
      repo: 'seanelvidge/England-football-results',
      usage: 'Venue-specific H2H (last 8-10 meetings), long-run home advantage, derby history only',
      prohibitedFor: 'No corners, cards, fatigue, or odds',
      lastSyncTimestamp: new Date().toISOString(),
    },
    openFootball: {
      status: 'active_fallback',
      license: 'Public Domain Dedication (CC0-1.0)',
      usage: 'Fallback schedule and match validation',
      lastSyncTimestamp: new Date().toISOString(),
    },
    theSportsDb: {
      status: 'active_free_tier',
      license: 'Non-commercial / Free tier with cached assets',
      usage: 'Team crests and venue metadata only with local monogram fallback',
      missingBadgesCount: missingBadges.length,
      lastSyncTimestamp: new Date().toISOString(),
    },
  };

  return NextResponse.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    dataArchitecture: 'free_sources_only',
    teamNewsEnabled: isTeamNewsEnabled(),
    confidenceCapApplied: !isTeamNewsEnabled(),
    storeStats: {
      totalMatches: storeStats.totalMatches,
      earliestDate: storeStats.earliestDate,
      latestDate: storeStats.latestDate,
      uniqueLeagues: storeStats.uniqueLeagues,
      uniqueTeams: storeStats.uniqueTeams,
    },
    sourceSync,
    newestResultPerLeague,
    unmatchedTeams: {
      count: unmatchedTeams.length,
      teams: unmatchedTeams,
    },
    completenessDistribution,
  });
}
