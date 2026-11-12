// CALIBRALL: Canonical Competition Registry & Database-Driven Competition Discovery
// Enforces:
// 1. Every fixture has a canonical competition_id (e.g. comp_pl, comp_fl1, comp_pd, comp_bl1, comp_sa, comp_elc, comp_ded, comp_cl, comp_nba)
// 2. Competition discovery directly from active database fixtures (never a static hard-coded list)
// 3. Country grouping, search capability, and exact fixture counts per competition
// 4. Strict validation: fixtures with missing or non-canonical competition_id are logged as errors and rejected with 0 fallback

import { Competition, Sport } from '@/types';
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { cleanDisplayText } from '@/lib/utils/formatText';

export interface CompetitionWithCount extends Competition {
  fixtureCount: number;
}

export interface CountryCompetitionGroup {
  country: string;
  competitions: CompetitionWithCount[];
}

export const CANONICAL_COMPETITIONS: Record<string, Competition> = {
  comp_pl: {
    id: 'comp_pl',
    code: 'PL',
    name: 'Premier League',
    country: 'England',
    emblemUrl: 'https://crests.football-data.org/PL.png',
    tier: 1,
    avgGoalsPerGame: 2.88,
    avgCornersPerGame: 10.45,
    avgCardsPerGame: 4.12,
    isActive: true,
  },
  comp_elc: {
    id: 'comp_elc',
    code: 'ELC',
    name: 'Championship',
    country: 'England',
    emblemUrl: 'https://crests.football-data.org/ELC.png',
    tier: 2,
    avgGoalsPerGame: 2.65,
    avgCornersPerGame: 10.20,
    avgCardsPerGame: 4.25,
    isActive: true,
  },
  comp_e2: {
    id: 'comp_e2',
    code: 'E2',
    name: 'League One',
    country: 'England',
    emblemUrl: 'https://crests.football-data.org/ED.png',
    tier: 3,
    avgGoalsPerGame: 2.60,
    avgCornersPerGame: 10.10,
    avgCardsPerGame: 4.15,
    isActive: true,
  },
  comp_e3: {
    id: 'comp_e3',
    code: 'E3',
    name: 'League Two',
    country: 'England',
    emblemUrl: 'https://crests.football-data.org/ED.png',
    tier: 4,
    avgGoalsPerGame: 2.58,
    avgCornersPerGame: 10.05,
    avgCardsPerGame: 4.20,
    isActive: true,
  },
  comp_fl1: {
    id: 'comp_fl1',
    code: 'FL1',
    name: 'Ligue 1',
    country: 'France',
    emblemUrl: 'https://crests.football-data.org/FL1.png',
    tier: 1,
    avgGoalsPerGame: 2.70,
    avgCornersPerGame: 9.75,
    avgCardsPerGame: 3.85,
    isActive: true,
  },
  comp_pd: {
    id: 'comp_pd',
    code: 'PD',
    name: 'La Liga',
    country: 'Spain',
    emblemUrl: 'https://crests.football-data.org/PD.png',
    tier: 1,
    avgGoalsPerGame: 2.54,
    avgCornersPerGame: 9.30,
    avgCardsPerGame: 4.88,
    isActive: true,
  },
  comp_bl1: {
    id: 'comp_bl1',
    code: 'BL1',
    name: 'Bundesliga',
    country: 'Germany',
    emblemUrl: 'https://crests.football-data.org/BL1.png',
    tier: 1,
    avgGoalsPerGame: 3.18,
    avgCornersPerGame: 10.15,
    avgCardsPerGame: 3.75,
    isActive: true,
  },
  comp_sa: {
    id: 'comp_sa',
    code: 'SA',
    name: 'Serie A',
    country: 'Italy',
    emblemUrl: 'https://crests.football-data.org/SA.png',
    tier: 1,
    avgGoalsPerGame: 2.62,
    avgCornersPerGame: 9.60,
    avgCardsPerGame: 4.50,
    isActive: true,
  },
  comp_ded: {
    id: 'comp_ded',
    code: 'DED',
    name: 'Eredivisie',
    country: 'Netherlands',
    emblemUrl: 'https://crests.football-data.org/DED.png',
    tier: 1,
    avgGoalsPerGame: 3.05,
    avgCornersPerGame: 10.35,
    avgCardsPerGame: 3.65,
    isActive: true,
  },
  comp_bsa: {
    id: 'comp_bsa',
    code: 'BSA',
    name: 'Campeonato Brasileiro Série A',
    country: 'Brazil',
    emblemUrl: '',
    tier: 1,
    avgGoalsPerGame: 2.48,
    avgCornersPerGame: 9.80,
    avgCardsPerGame: 4.90,
    isActive: true,
  },
  comp_cl: {
    id: 'comp_cl',
    code: 'CL',
    name: 'UEFA Champions League',
    country: 'Europe',
    emblemUrl: 'https://crests.football-data.org/CL.png',
    tier: 1,
    avgGoalsPerGame: 3.02,
    avgCornersPerGame: 9.85,
    avgCardsPerGame: 3.95,
    isActive: true,
  },
  comp_nba: {
    id: 'comp_nba',
    code: 'NBA',
    name: 'National Basketball Association',
    country: 'USA',
    emblemUrl: 'https://a.espncdn.com/i/teamlogos/leagues/500/nba.png',
    tier: 1,
    avgGoalsPerGame: 0,
    avgCornersPerGame: 0,
    avgCardsPerGame: 0,
    isActive: true,
  },
};

/**
 * Checks if a string is a valid canonical competition_id.
 * Must start with "comp_", have legitimate length, and cannot be generic fallbacks.
 */
export function isCanonicalCompetitionId(id: unknown): id is string {
  if (typeof id !== 'string') return false;
  const clean = id.trim().toLowerCase();
  if (!clean.startsWith('comp_')) return false;
  if (clean === 'comp_league' || clean === 'comp_sm_league' || clean === 'fallback') return false;
  return clean.length >= 6;
}

/**
 * Resolves canonical Competition definition from competition_id or code.
 */
export function getCanonicalCompetition(idOrCode: string): Competition | null {
  if (!idOrCode || typeof idOrCode !== 'string') return null;
  const normalized = idOrCode.trim().toLowerCase();
  
  // 1. Direct key match (e.g. comp_fl1, comp_pl)
  if (CANONICAL_COMPETITIONS[normalized]) {
    return CANONICAL_COMPETITIONS[normalized];
  }

  // 2. Prefix match (e.g. fl1 -> comp_fl1)
  const prefixed = `comp_${normalized}`;
  if (CANONICAL_COMPETITIONS[prefixed]) {
    return CANONICAL_COMPETITIONS[prefixed];
  }

  // 3. Match by code uppercase (e.g. FL1, PL, PD)
  const codeUpper = idOrCode.trim().toUpperCase();
  if (codeUpper === 'BRA') return CANONICAL_COMPETITIONS.comp_bsa;
  if (codeUpper === 'E0') return CANONICAL_COMPETITIONS.comp_pl;
  if (codeUpper === 'E1') return CANONICAL_COMPETITIONS.comp_elc;
  if (codeUpper === 'SP1') return CANONICAL_COMPETITIONS.comp_pd;
  if (codeUpper === 'I1') return CANONICAL_COMPETITIONS.comp_sa;
  if (codeUpper === 'D1') return CANONICAL_COMPETITIONS.comp_bl1;
  if (codeUpper === 'F1') return CANONICAL_COMPETITIONS.comp_fl1;
  const byCode = Object.values(CANONICAL_COMPETITIONS).find(c => c.code.toUpperCase() === codeUpper);
  if (byCode) {
    return byCode;
  }

  return null;
}

/**
 * Queries database fixtures and builds active competitions dynamically.
 * Rule 1: Every fixture must have a canonical competition_id. Those without are logged as errors and rejected.
 * Rule 2: Built from database, not hard-coded list. Shows every competition that has fixtures, grouped by country, with counts.
 */
export async function getCompetitionsFromDatabase(sport: Sport | 'all' = 'football'): Promise<{
  competitions: CompetitionWithCount[];
  groupedByCountry: CountryCompetitionGroup[];
  total: number;
}> {
  const countsByCompId = new Map<string, number>();

  if (isSupabaseConfigured && supabase) {
    try {
      const { data: dbFixtures, error } = await supabase.from('fixtures').select('id, provider_id, competition_id, competition_code');
      if (error) {
        console.error('[Competitions Database Query Error]:', error.message);
      } else if (dbFixtures && Array.isArray(dbFixtures)) {
        for (const row of dbFixtures) {
          const rawId = row.competition_id;
          
          // Rule 1 Enforcement: Every fixture has a canonical competition_id.
          // A fixture with none is logged as an error and never shown under a fallback.
          if (!isCanonicalCompetitionId(rawId)) {
            console.error(`[Integrity Error] Fixture "${row.id || row.provider_id}" has no canonical competition_id (received: "${rawId}"). Rejecting; never shown under fallback.`);
            continue;
          }

          const compId = rawId.toLowerCase();

          // Sport filter check
          if (sport === 'football' && compId === 'comp_nba') continue;
          if (sport === 'basketball' && compId !== 'comp_nba') continue;

          countsByCompId.set(compId, (countsByCompId.get(compId) || 0) + 1);
        }
      }
    } catch (err: any) {
      console.error('[Competitions Service Error]:', err?.message || err);
    }
  }

  // Construct active competitions list with counts
  const activeCompetitions: CompetitionWithCount[] = [];

  for (const [compId, count] of countsByCompId.entries()) {
    if (count <= 0) continue;
    const canonical = getCanonicalCompetition(compId);
    if (!canonical) {
      console.error(`[Integrity Error] Competition ID "${compId}" is not in canonical registry. Discarding.`);
      continue;
    }
    activeCompetitions.push({
      ...canonical,
      name: cleanDisplayText(canonical.name),
      fixtureCount: count,
    });
  }

  // Sort competitions: tier ascending, then name ascending
  activeCompetitions.sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));

  // Group by country
  const countryMap = new Map<string, CompetitionWithCount[]>();
  for (const comp of activeCompetitions) {
    const list = countryMap.get(comp.country) || [];
    list.push(comp);
    countryMap.set(comp.country, list);
  }

  const groupedByCountry: CountryCompetitionGroup[] = Array.from(countryMap.entries())
    .map(([country, competitions]) => ({
      country,
      competitions,
    }))
    .sort((a, b) => a.country.localeCompare(b.country));

  return {
    competitions: activeCompetitions,
    groupedByCountry,
    total: activeCompetitions.length,
  };
}
