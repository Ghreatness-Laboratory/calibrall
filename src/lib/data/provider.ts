// MATCHMIND: Live Football Data Ingestion, Request-Time Date Windows, and Server Cache
import { Competition, Fixture, FixtureContext, Team } from '@/types';
import { COMPETITIONS, getFixtureStatistics } from './seedData';
import { evaluateFixtureMarkets } from '../prediction/marketSelection';
import { computeRequestDateWindow } from '../utils/dateWindow';
import { serverCache } from '../cache/serverCache';

export interface ProviderHealth {
  providerName: string;
  isConfigured: boolean;
  status: 'ONLINE' | 'STANDBY_DEV_MODE' | 'ERROR' | 'RATE_LIMITED';
  lastSyncTimestamp: string;
  activeLeaguesCount: number;
  message: string;
}

export interface LiveFixturesResult {
  fixtures: Fixture[];
  liveDataAvailable: boolean;
  lastUpdated: string; // "hh:mm UTC"
  error?: string;
  dateRange: {
    dateFrom: string;
    dateTo: string;
  };
}

export interface FootballDataProvider {
  getHealth(): Promise<ProviderHealth>;
  getCompetitions(): Promise<Competition[]>;
  getLiveFixtures(params?: { competitionCode?: string; status?: string }): Promise<LiveFixturesResult>;
  getFixtureById(id: string): Promise<Fixture | null>;
  getFixtureContext(fixtureId: string): Promise<FixtureContext | null>;
}

function parseFootballDataMatch(m: any): Fixture {
  const compCode = m.competition?.code || 'PL';
  const comp = COMPETITIONS.find(c => c.code === compCode) || {
    id: `comp_${compCode.toLowerCase()}`,
    code: compCode,
    name: m.competition?.name || 'Football League',
    country: m.area?.name || 'Europe',
    emblemUrl: m.competition?.emblem || 'https://crests.football-data.org/PL.png',
    tier: 1,
    avgGoalsPerGame: 2.80,
    avgCornersPerGame: 10.0,
    avgCardsPerGame: 4.1,
    isActive: true,
  };

  const homeTeam: Team = {
    id: `team_${m.homeTeam?.id || m.homeTeam?.name?.toLowerCase().replace(/\s+/g, '_')}`,
    name: m.homeTeam?.name || 'Home Team',
    shortName: m.homeTeam?.shortName || m.homeTeam?.name || 'Home',
    tla: m.homeTeam?.tla || 'HOM',
    crestUrl: m.homeTeam?.crest || 'https://crests.football-data.org/65.png',
    attackRating: 1.30,
    defenseRating: 0.75,
    cornerAttackRating: 1.25,
    disciplineRating: 0.90,
  };

  const awayTeam: Team = {
    id: `team_${m.awayTeam?.id || m.awayTeam?.name?.toLowerCase().replace(/\s+/g, '_')}`,
    name: m.awayTeam?.name || 'Away Team',
    shortName: m.awayTeam?.shortName || m.awayTeam?.name || 'Away',
    tla: m.awayTeam?.tla || 'AWY',
    crestUrl: m.awayTeam?.crest || 'https://crests.football-data.org/57.png',
    attackRating: 1.20,
    defenseRating: 0.85,
    cornerAttackRating: 1.15,
    disciplineRating: 0.95,
  };

  return {
    id: `fix_${m.id}`,
    providerId: String(m.id),
    competitionId: comp.id,
    competition: comp,
    seasonYear: `${m.season?.startDate?.substring(0, 4) || '2025'}/${m.season?.endDate?.substring(0, 4) || '2026'}`,
    homeTeam,
    awayTeam,
    kickoffTime: m.utcDate,
    matchday: m.matchday || 1,
    status: (m.status as any) || 'TIMED',
    homeScore: m.score?.fullTime?.home ?? null,
    awayScore: m.score?.fullTime?.away ?? null,
    venue: m.venue || 'Stadium',
    referee: m.referees?.[0]?.name,
    dataFreshness: new Date().toISOString(),
  };
}

export class LiveFootballDataProvider implements FootballDataProvider {
  async getHealth(): Promise<ProviderHealth> {
    const providers = [];
    if (process.env.FOOTBALL_DATA_API_KEY) providers.push('Football-Data.org');
    if (process.env.SPORTMONKS_API_TOKEN) providers.push('Sportmonks');
    if (process.env.ODDS_API_KEY) providers.push('The Odds API');

    return {
      providerName: providers.length > 0 ? providers.join(' + ') : 'Calibrall Live Engine',
      isConfigured: providers.length > 0,
      status: providers.length > 0 ? 'ONLINE' : 'STANDBY_DEV_MODE',
      lastSyncTimestamp: new Date().toISOString(),
      activeLeaguesCount: COMPETITIONS.length,
      message: providers.length > 0
        ? `Live pipeline active with ${providers.join(', ')}.`
        : 'Live provider keys not configured in environment.',
    };
  }

  async getCompetitions(): Promise<Competition[]> {
    return COMPETITIONS;
  }

  async getLiveFixtures(params?: { competitionCode?: string; status?: string }): Promise<LiveFixturesResult> {
    // 1. Dynamic date window computed at REQUEST TIME in UTC
    const { dateFrom, dateTo, lastUpdatedFormatted } = computeRequestDateWindow();

    // 2. Check server cache with key containing league and date window
    const cacheKey = serverCache.getFixtureCacheKey(params?.competitionCode, dateFrom, dateTo);
    const cached = await serverCache.get<Fixture[]>(cacheKey);

    if (cached) {
      let filtered = cached;
      if (params?.status && params.status !== 'ALL') {
        filtered = filtered.filter(f => f.status === params.status);
      }
      return {
        fixtures: filtered,
        liveDataAvailable: true,
        lastUpdated: lastUpdatedFormatted,
        dateRange: { dateFrom, dateTo },
      };
    }

    // 3. Query live football APIs if configured
    const footballDataKey = process.env.FOOTBALL_DATA_API_KEY;
    if (footballDataKey) {
      try {
        const compFilter = params?.competitionCode && params.competitionCode !== 'ALL'
          ? `&competitions=${params.competitionCode}`
          : '';
        const url = `https://api.football-data.org/v4/matches?dateFrom=${dateFrom}&dateTo=${dateTo}${compFilter}`;
        
        const res = await fetch(url, {
          headers: { 'X-Auth-Token': footballDataKey },
          next: { revalidate: 120 },
        });

        if (res.ok) {
          const json = await res.json();
          const rawMatches = json.matches || [];
          const parsedFixtures = rawMatches.map(parseFootballDataMatch);

          if (parsedFixtures.length > 0) {
            // Compute dynamic TTL: 1 min within 2h of kickoff, 5 min otherwise
            const ttl = serverCache.computeFixtureTTL(parsedFixtures);
            await serverCache.set(cacheKey, parsedFixtures, ttl);

            let filtered = parsedFixtures;
            if (params?.status && params.status !== 'ALL') {
              filtered = filtered.filter((f: Fixture) => f.status === params.status);
            }

            return {
              fixtures: filtered,
              liveDataAvailable: true,
              lastUpdated: lastUpdatedFormatted,
              dateRange: { dateFrom, dateTo },
            };
          }
        }
      } catch (err: any) {
        console.warn('[LiveFootballDataProvider] Football-Data fetch failed:', err?.message);
      }
    }

    // 4. Live data unavailable: No hardcoded mock/seed fallback!
    // Per specification: When live data fails, report unavailable with last updated time.
    return {
      fixtures: [],
      liveDataAvailable: false,
      lastUpdated: lastUpdatedFormatted,
      error: `Live data unavailable. Last updated ${lastUpdatedFormatted}`,
      dateRange: { dateFrom, dateTo },
    };
  }

  async getFixtureById(id: string): Promise<Fixture | null> {
    const result = await this.getLiveFixtures();
    return result.fixtures.find(f => f.id === id) || null;
  }

  async getFixtureContext(fixtureId: string): Promise<FixtureContext | null> {
    const fixture = await this.getFixtureById(fixtureId);
    if (!fixture) return null;

    const stats = getFixtureStatistics(fixture);
    return {
      fixtureId: fixture.id,
      homeTeamName: fixture.homeTeam.name,
      awayTeamName: fixture.awayTeam.name,
      competitionCode: fixture.competition.code,
      competitionName: fixture.competition.name,
      homeAttackRating: fixture.homeTeam.attackRating,
      homeDefenseRating: fixture.homeTeam.defenseRating,
      awayAttackRating: fixture.awayTeam.attackRating,
      awayDefenseRating: fixture.awayTeam.defenseRating,
      homeXg: stats.homeXg,
      awayXg: stats.awayXg,
      expectedCornersHome: stats.expectedCornersHome,
      expectedCornersAway: stats.expectedCornersAway,
      expectedCards: stats.expectedCards,
      uncertaintyScore: stats.uncertaintyScore,
      dataCoverageScore: stats.dataCoverageScore,
      sampleSizeMatches: stats.sampleSizeMatches,
      stateTags: stats.stateTags,
      lineupConfirmed: stats.lineupConfirmed,
      verifiedOdds: stats.verifiedOdds,
    };
  }

  // Backwards-compatible getFixtures
  async getFixtures(params?: { competitionCode?: string; date?: string; status?: string }): Promise<Fixture[]> {
    const res = await this.getLiveFixtures(params);
    return res.fixtures;
  }
}

export function getFootballDataProvider(): LiveFootballDataProvider {
  return new LiveFootballDataProvider();
}

/**
 * High level helper to get evaluated fixture with predictions
 */
export async function getEvaluatedFixture(fixtureId: string) {
  const provider = getFootballDataProvider();
  const fixture = await provider.getFixtureById(fixtureId);
  if (!fixture) return null;

  const context = await provider.getFixtureContext(fixtureId);
  if (!context) return null;

  const evaluated = evaluateFixtureMarkets(context);
  return {
    fixture,
    context,
    predictions: evaluated.predictions,
    topPick: evaluated.topPick,
    noRecommendationReason: evaluated.noRecommendationReason,
  };
}
