// CALIBRALL: Dynamic Database-Driven Competitions API Route
// Supports football, basketball, and unified all-sports competition discovery with day-range fixture counts & unmapped reporting.

import { NextRequest, NextResponse } from 'next/server';
import { getCompetitionsFromDatabase } from '@/lib/data/canonicalCompetitions';
import { getBasketballCompetitionsSummary } from '@/lib/basketball/readService';
import { requireApiUser } from '@/lib/supabase/serverAuth';
import { Sport } from '@/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (!auth.authorized) {
    return auth.errorResponse;
  }

  const { searchParams } = new URL(request.url);
  const rawSport = (searchParams.get('sport') || 'football').toLowerCase();
  const sport: Sport | 'all' =
    rawSport === 'basketball' ? 'basketball' : rawSport === 'all' ? 'all' : 'football';
  const day = searchParams.get('day') || undefined;
  const includeEmptyParam = searchParams.get('include_empty');
  const includeEmpty = includeEmptyParam === null ? true : includeEmptyParam === 'true';

  if (sport === 'basketball') {
    const bb = await getBasketballCompetitionsSummary(day, { includeEmpty });
    return NextResponse.json(
      {
        data: bb.competitions,
        groupedByCountry: bb.groupedByCountry,
        total: bb.total,
        totalFixtures: bb.totalFixtures,
        unmappedFixtures: bb.unmappedFixtures,
        sport: 'basketball',
        day: day || 'ALL',
        source: 'database:bb_games',
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  }

  const { competitions, groupedByCountry, total, totalFixtures, unmappedFixtures } =
    await getCompetitionsFromDatabase(sport, {
      day,
      includeEmpty,
    });

  // In 'all' mode, also merge evaluated basketball window fallback counts if bb_games sparse offseason fallback activated
  if (sport === 'all') {
    const bb = await getBasketballCompetitionsSummary(day, { includeEmpty: true });
    const bbCountById = new Map(bb.competitions.map((c) => [c.id, c]));
    let adjustedTotalFixtures = totalFixtures;

    const mergedById = new Map(competitions.map((c) => [c.id, { ...c }]));
    for (const [id, bbComp] of bbCountById.entries()) {
      const existing = mergedById.get(id);
      if (existing) {
        const diff = Math.max(0, bbComp.fixtureCount - existing.fixtureCount);
        if (diff > 0) {
          existing.fixtureCount = bbComp.fixtureCount;
          adjustedTotalFixtures += diff;
        }
        if ((bbComp.storedMatchCount ?? 0) > (existing.storedMatchCount ?? 0)) {
          existing.storedMatchCount = bbComp.storedMatchCount;
        }
      } else if (includeEmpty || bbComp.fixtureCount > 0) {
        mergedById.set(id, bbComp);
        adjustedTotalFixtures += bbComp.fixtureCount;
      }
    }

    const mergedList = Array.from(mergedById.values())
      .filter((c) => includeEmpty || c.fixtureCount > 0)
      .sort((a, b) => {
        if ((a.fixtureCount > 0) !== (b.fixtureCount > 0)) {
          return a.fixtureCount > 0 ? -1 : 1;
        }
        return (a.sortOrder ?? 100) - (b.sortOrder ?? 100) || a.tier - b.tier || a.name.localeCompare(b.name);
      });

    const countryMap = new Map<string, typeof mergedList>();
    for (const comp of mergedList) {
      const arr = countryMap.get(comp.country) || [];
      arr.push(comp);
      countryMap.set(comp.country, arr);
    }
    const mergedGrouped = Array.from(countryMap.entries())
      .map(([country, list]) => ({
        country,
        competitions: list.sort(
          (a, b) =>
            ((b.fixtureCount > 0 ? 1 : 0) - (a.fixtureCount > 0 ? 1 : 0)) ||
            (a.sortOrder ?? 100) - (b.sortOrder ?? 100) ||
            a.name.localeCompare(b.name)
        ),
      }))
      .sort((a, b) => {
        const aActive = a.competitions.some((c) => c.fixtureCount > 0) ? 0 : 1;
        const bActive = b.competitions.some((c) => c.fixtureCount > 0) ? 0 : 1;
        if (aActive !== bActive) return aActive - bActive;
        const minA = Math.min(...a.competitions.map((c) => c.sortOrder ?? 100));
        const minB = Math.min(...b.competitions.map((c) => c.sortOrder ?? 100));
        if (minA !== minB) return minA - minB;
        return a.country.localeCompare(b.country);
      });

    const mergedUnmapped = [...unmappedFixtures];
    const seenUnmapped = new Set(mergedUnmapped.map((u) => u.id));
    for (const u of bb.unmappedFixtures) {
      if (!seenUnmapped.has(u.id)) {
        mergedUnmapped.push(u);
      }
    }

    return NextResponse.json(
      {
        data: mergedList,
        groupedByCountry: mergedGrouped,
        total: mergedList.length,
        totalFixtures: adjustedTotalFixtures,
        unmappedFixtures: mergedUnmapped,
        sport,
        day: day || 'ALL',
        source: 'database:fixtures+bb_games',
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  }

  return NextResponse.json(
    {
      data: competitions,
      groupedByCountry,
      total,
      totalFixtures,
      unmappedFixtures,
      sport,
      day: day || 'ALL',
      source: 'database:fixtures',
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
}
