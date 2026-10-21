// MATCHMIND: Live Football Data Ingestion, Multi-Provider Architecture, and Production Logging
import { Competition, Fixture, FixtureContext, Team } from '@/types';
import { COMPETITIONS, getFixtureStatistics } from './seedData';
import { evaluateFixtureMarkets } from '../prediction/marketSelection';
import { computeRequestDateWindow } from '../utils/dateWindow';
import { serverCache } from '../cache/serverCache';
import { checkAndLogStartupEnv } from '../config/envAudit';

export interface ProviderHealth {
  providerName: string;
  isConfigured: boolean;
  status: 'ONLINE' | 'STANDBY_DEV_MODE' | 'ERROR' | 'RATE_LIMITED';
  lastSyncTimestamp: string;
  activeLeaguesCount: number;
  message: string;
  missingEnvVars: string[];
}

export interface LiveFixturesResult {
  fixtures: Fixture[];
  liveDataAvailable: boolean;
  lastUpdated: string; // "hh:mm UTC"
  error?: string;
  providerUsed?: string;
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

// Normalize Football-Data.org fixture
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

// Normalize Sportmonks v3 fixture
function parseSportmonksMatch(m: any): Fixture {
  const participants = m.participants || [];
  const home = participants.find((p: any) => p.meta?.location === 'home') || participants[0] || {};
  const away = participants.find((p: any) => p.meta?.location === 'away') || participants[1] || {};

  const comp: Competition = {
    id: `comp_sm_${m.league_id || 'league'}`,
    code: m.league?.short_code || 'SM',
    name: m.league?.name || 'European League',
    country: 'Europe',
    emblemUrl: m.league?.image_path || 'https://crests.football-data.org/CL.png',
    tier: 1,
    avgGoalsPerGame: 2.75,
    avgCornersPerGame: 9.8,
    avgCardsPerGame: 4.0,
    isActive: true,
  };

  const homeTeam: Team = {
    id: `team_${home.id || 'home'}`,
    name: home.name || 'Home Team',
    shortName: home.short_code || home.name || 'Home',
    tla: home.short_code || 'HOM',
    crestUrl: home.image_path || 'https://crests.football-data.org/65.png',
    attackRating: 1.25,
    defenseRating: 0.80,
    cornerAttackRating: 1.20,
    disciplineRating: 0.90,
  };

  const awayTeam: Team = {
    id: `team_${away.id || 'away'}`,
    name: away.name || 'Away Team',
    shortName: away.short_code || away.name || 'Away',
    tla: away.short_code || 'AWY',
    crestUrl: away.image_path || 'https://crests.football-data.org/57.png',
    attackRating: 1.15,
    defenseRating: 0.85,
    cornerAttackRating: 1.10,
    disciplineRating: 0.95,
  };

  return {
    id: `fix_sm_${m.id}`,
    providerId: String(m.id),
    competitionId: comp.id,
    competition: comp,
    seasonYear: '2025/2026',
    homeTeam,
    awayTeam,
    kickoffTime: m.starting_at ? new Date(m.starting_at).toISOString() : new Date().toISOString(),
    matchday: 1,
    status: m.state?.state === 'FINISHED' ? 'FINISHED' : 'TIMED',
    homeScore: null,
    awayScore: null,
    venue: m.venue?.name || 'Stadium',
    dataFreshness: new Date().toISOString(),
  };
}

export class LiveFootballDataProvider implements FootballDataProvider {
  async getHealth(): Promise<ProviderHealth> {
    // Audit environment at call time
    checkAndLogStartupEnv();

    const missing: string[] = [];
    const providers: string[] = [];

    if (process.env.FOOTBALL_DATA_API_KEY?.trim()) {
      providers.push('Football-Data.org');
    } else {
      missing.push('FOOTBALL_DATA_API_KEY');
    }

    if (process.env.SPORTMONKS_API_TOKEN?.trim()) {
      providers.push('Sportmonks');
    } else {
      missing.push('SPORTMONKS_API_TOKEN');
    }

    if (process.env.API_FOOTBALL_KEY?.trim()) {
      providers.push('API-Football');
    } else {
      missing.push('API-Football');
    }

    if (process.env.ODDS_API_KEY?.trim()) {
      providers.push('The Odds API');
    } else {
      missing.push('ODDS_API_KEY');
    }

    const isConfigured = providers.length > 0;

    return {
      providerName: providers.length > 0 ? providers.join(' + ') : 'None Configured',
      isConfigured,
      status: isConfigured ? 'ONLINE' : 'STANDBY_DEV_MODE',
      lastSyncTimestamp: new Date().toISOString(),
      activeLeaguesCount: COMPETITIONS.length,
      message: isConfigured
        ? `Live pipeline active with ${providers.join(', ')}.`
        : `Live provider keys not configured in environment. Missing: ${missing.join(', ')}`,
      missingEnvVars: missing,
    };
  }

  async getCompetitions(): Promise<Competition[]> {
    return COMPETITIONS;
  }

  async getLiveFixtures(params?: { competitionCode?: string; status?: string }): Promise<LiveFixturesResult> {
    // Run startup check (logs once)
    checkAndLogStartupEnv();

    // 1. Dynamic date window computed at REQUEST TIME in UTC
    const { dateFrom, dateTo, lastUpdatedFormatted } = computeRequestDateWindow();

    // 2. Check server cache with key containing league and date window
    const cacheKey = serverCache.getFixtureCacheKey(params?.competitionCode, dateFrom, dateTo);
    const cached = await serverCache.get<Fixture[]>(cacheKey);

    if (cached && Array.isArray(cached) && cached.length > 0) {
      let filtered = cached;
      if (params?.status && params.status !== 'ALL') {
        filtered = filtered.filter(f => f.status === params.status);
      }
      return {
        fixtures: filtered,
        liveDataAvailable: true,
        lastUpdated: lastUpdatedFormatted,
        providerUsed: 'ServerCache (TTL active)',
        dateRange: { dateFrom, dateTo },
      };
    }

    // 3. Primary Provider: Football-Data.org
    const footballDataKey = process.env.FOOTBALL_DATA_API_KEY?.trim();
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
            // Cache ONLY successful fixtures
            await serverCache.set(cacheKey, parsedFixtures, ttl);

            let filtered = parsedFixtures;
            if (params?.status && params.status !== 'ALL') {
              filtered = filtered.filter((f: Fixture) => f.status === params.status);
            }

            return {
              fixtures: filtered,
              liveDataAvailable: true,
              lastUpdated: lastUpdatedFormatted,
              providerUsed: 'Football-Data.org v4',
              dateRange: { dateFrom, dateTo },
            };
          } else {
            console.warn(`[FootballDataProvider] Football-Data.org returned 0 matches for window ${dateFrom} to ${dateTo}.`);
          }
        } else {
          const errText = await res.text().catch(() => 'No response body');
          console.error(
            `[FootballDataProvider] Football-Data.org failed with HTTP ${res.status} (${res.statusText}). Error: ${errText.slice(0, 200)}. Env var: FOOTBALL_DATA_API_KEY`
          );
        }
      } catch (err: any) {
        console.error('[FootballDataProvider] Network exception connecting to Football-Data.org:', err?.message || err);
      }
    } else {
      console.warn('[FootballDataProvider] FOOTBALL_DATA_API_KEY is not configured in process.env.');
    }

    // 4. Secondary Provider Fallback: Sportmonks
    const sportmonksToken = process.env.SPORTMONKS_API_TOKEN?.trim();
    if (sportmonksToken) {
      try {
        const smUrl = `https://api.sportmonks.com/v3/football/fixtures/between/${dateFrom}/${dateTo}?api_token=${sportmonksToken}&include=participants;league`;
        const res = await fetch(smUrl, { next: { revalidate: 120 } });
        if (res.ok) {
          const json = await res.json();
          const rawList = json.data || [];
          const parsedFixtures = rawList.map(parseSportmonksMatch);

          if (parsedFixtures.length > 0) {
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
              providerUsed: 'Sportmonks v3',
              dateRange: { dateFrom, dateTo },
            };
          }
        } else {
          const errText = await res.text().catch(() => 'No response body');
          console.error(
            `[FootballDataProvider] Sportmonks failed with HTTP ${res.status} (${res.statusText}). Error: ${errText.slice(0, 200)}. Env var: SPORTMONKS_API_TOKEN`
          );
        }
      } catch (err: any) {
        console.error('[FootballDataProvider] Network exception connecting to Sportmonks:', err?.message || err);
      }
    }

    // 5. Provider Failure: Do NOT cache failure!
    // Requirement 4: Stop caching failures. Never write "Live data unavailable" into serverCache.
    console.error(
      `[FootballDataProvider] Live data unavailable for date window ${dateFrom} to ${dateTo}. Check that FOOTBALL_DATA_API_KEY (or SPORTMONKS_API_TOKEN) is valid in Vercel project environment variables.`
    );

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
