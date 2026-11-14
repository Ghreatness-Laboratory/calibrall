// NBA Data Provider: Scheduled Server-Side Live API Ingestion & DB-Only Read Path
import { serverCache } from '../cache/serverCache';
import {
  NBATeamStats,
  Fixture,
  MatchStatus,
} from '@/types';
import {
  NBA_TEAMS_CATALOG,
  NBA_COMPETITION,
  NBASeason,
  computeNBASeason,
  getNBATeamStats,
  getAllNBATeamsList,
  createNBATeam,
} from './nbaSeedData';
import { calculateNBAScoreProjection } from '../prediction/nbaMath';
import { computeNBADateWindow } from '../utils/dateWindow';
import {
  getFixturesFromDatabase,
  syncNBAFixturesToDatabase,
} from './fixturesDatabase';
import {
  SyncMode,
  FIXTURE_STALE_LIMIT_MINUTES,
} from './providerBudget';
import {
  loggedProviderFetch,
  upsertProviderSyncState,
  getStoredSportFreshness,
  formatUtcTimeStamp,
} from './providerCallLogger';

export interface NBAProviderHealth {
  providerName: string;
  isConfigured: boolean;
  status: 'ONLINE' | 'STANDBY_DEV_MODE' | 'ERROR' | 'RATE_LIMITED';
  lastSyncTimestamp: string;
  message: string;
  missingEnvVars: string[];
}

export interface NBAStatsFetchResult {
  stats: Record<string, NBATeamStats>;
  source: string;
  season: string;
  lastUpdated: string;
  isLive: boolean;
  error?: string;
}

export interface NBAFixturesHealthResult {
  lastSyncTime: string;
  lastSyncFormatted: string;
  newestKickoff: string | null;
  rowCount: number;
  providerStatus: 'ONLINE' | 'STANDBY_DEV_MODE' | 'ERROR';
  provider: string;
  season: string;
  isDelayed: boolean;
}

// Abbreviation mapping from external APIs (ESPN / NBA / BallDontLie) to our 30-team catalog
const ESPN_ABBR_MAP: Record<string, string> = {
  GS: 'GSW',
  SA: 'SAS',
  NO: 'NOP',
  NY: 'NYK',
  UTAH: 'UTA',
  WSH: 'WAS',
  WAS: 'WAS',
  PHO: 'PHX',
  BK: 'BKN',
  BKN: 'BKN',
};

export class NBADataProvider {
  private static readonly STATS_CACHE_TTL_SEC = 6 * 60 * 60; // 6 hours cache
  private static readonly FIXTURES_CACHE_TTL_SEC = 15 * 60; // 15 min scheduled sync TTL

  private fixturesStore = new Map<string, Fixture>();
  private lastSyncTimestamp: string | null = null;
  private lastSyncStatus: 'ONLINE' | 'STANDBY_DEV_MODE' | 'ERROR' = 'ONLINE';
  private lastProviderUsed: string = 'ESPN NBA Live Scoreboard & DraftKings Lines';
  private activeSyncPromise: Promise<number> | null = null;

  constructor() {}

  async getHealth(): Promise<NBAProviderHealth> {
    const ballDontLieKey = process.env.BALLDONTLIE_API_KEY?.trim() || process.env.BALL_DONT_LIE_API_KEY?.trim();
    const nbaApiKey = process.env.NBA_API_KEY?.trim();
    const freshness = await getStoredSportFreshness('basketball');

    const isConfigured = Boolean(ballDontLieKey || nbaApiKey);
    const providerName = ballDontLieKey
      ? 'BallDontLie API + ESPN NBA Scoreboard'
      : nbaApiKey
      ? 'NBA Stats API + ESPN NBA Scoreboard'
      : 'ESPN NBA Live Scoreboard (Scheduled DB Sync)';

    return {
      providerName,
      isConfigured: true,
      status: freshness.syncState?.status === 'ERROR' && freshness.isStaleBeyondLimit ? 'ERROR' : this.lastSyncStatus,
      lastSyncTimestamp: freshness.newestUpdatedAt || this.lastSyncTimestamp || new Date().toISOString(),
      message: 'NBA scheduled cron pipeline active. Visitor reads served strictly from Supabase/DB.',
      missingEnvVars: isConfigured ? [] : ['BALLDONTLIE_API_KEY (optional)'],
    };
  }

  getFixturesHealth(): NBAFixturesHealthResult {
    const now = Date.now();
    const syncTimeMs = this.lastSyncTimestamp ? new Date(this.lastSyncTimestamp).getTime() : now;
    const diffMinutes = (now - syncTimeMs) / 60000;
    const isDelayed = diffMinutes >= FIXTURE_STALE_LIMIT_MINUTES;

    let newestKickoff: string | null = null;
    let maxKickoffMs = 0;
    this.fixturesStore.forEach(f => {
      const ms = new Date(f.kickoffTime).getTime();
      if (ms > maxKickoffMs) {
        maxKickoffMs = ms;
        newestKickoff = f.kickoffTime;
      }
    });

    const syncDate = this.lastSyncTimestamp ? new Date(this.lastSyncTimestamp) : new Date();
    const lastSyncFormatted = `${String(syncDate.getUTCHours()).padStart(2, '0')}:${String(syncDate.getUTCMinutes()).padStart(2, '0')} UTC`;

    return {
      lastSyncTime: this.lastSyncTimestamp || new Date().toISOString(),
      lastSyncFormatted,
      newestKickoff,
      rowCount: this.fixturesStore.size,
      providerStatus: this.lastSyncStatus,
      provider: this.lastProviderUsed,
      season: computeNBASeason(),
      isDelayed,
    };
  }

  /**
   * Scheduled server-side sync ONLY (called by /api/v1/sync cron or admin/test runner, NEVER on visitor reads).
   * - mode='live': polls today - 1 day and today (2 calls, every 15 mins)
   * - mode='schedule': polls +1 to +14 days (14 calls, every 6 hours)
   * - mode='full': polls entire [-1..+14] window (16 calls)
   */
  async syncLiveFixtures(force = false, mode: SyncMode = 'full'): Promise<number> {
    const now = Date.now();
    if (!force && this.lastSyncTimestamp && this.fixturesStore.size > 0) {
      const ageMs = now - new Date(this.lastSyncTimestamp).getTime();
      if (ageMs < NBADataProvider.FIXTURES_CACHE_TTL_SEC * 1000) {
        return this.fixturesStore.size;
      }
    }

    if (this.activeSyncPromise) {
      return this.activeSyncPromise;
    }

    this.activeSyncPromise = (async () => {
      const attemptIso = new Date().toISOString();
      let callsMade = 0;
      let lastError: string | null = null;
      let lastHttpStatus: number | null = null;
      let lastResponseBody: string | null = null;

      try {
        const windowInfo = computeNBADateWindow(1, 14);
        const allDates = windowInfo.datesList;
        const dates =
          mode === 'live'
            ? allDates.slice(0, 2) // yesterday + today (2 calls)
            : mode === 'schedule'
            ? allDates.slice(2) // +1..+14 future days (14 calls)
            : allDates; // full 16 days

        const allEventBatches: any[][] = new Array(dates.length).fill([]);
        let dateIdx = 0;
        const workerCount = Math.min(4, Math.max(1, dates.length));

        await Promise.all(
          Array.from({ length: workerCount }, async () => {
            while (dateIdx < dates.length) {
              const i = dateIdx++;
              const dateStr = dates[i];
              const urls = [
                `https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateStr}`,
                `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateStr}`,
              ];

              for (const url of urls) {
                callsMade++;
                const res = await loggedProviderFetch('espn_nba', url, {
                  headers: {
                    Accept: 'application/json',
                    'User-Agent': 'Mozilla/5.0 (compatible; Calibrall/1.0)',
                  },
                  leagueCode: 'NBA',
                  syncMode: mode,
                  timeoutMs: 10000,
                });
                lastHttpStatus = res.status;
                if (res.ok && res.json) {
                  allEventBatches[i] = (res.json.events || []) as any[];
                  break;
                } else {
                  lastError = res.error || `HTTP ${res.status}`;
                  lastResponseBody = res.bodyText.slice(0, 400);
                }
              }
            }
          })
        );

        const allEvents = allEventBatches.flat();
        const syncedFixtures: Fixture[] = [];

        for (const ev of allEvents) {
          const competitionData = ev.competitions?.[0];
          if (!competitionData) continue;

          const competitors = competitionData.competitors || [];
          const homeComp = competitors.find((c: any) => c.homeAway === 'home');
          const awayComp = competitors.find((c: any) => c.homeAway === 'away');
          if (!homeComp || !awayComp) continue;

          const rawHomeAbbr = homeComp.team?.abbreviation || 'BOS';
          const rawAwayAbbr = awayComp.team?.abbreviation || 'DET';
          const homeAbbr = ESPN_ABBR_MAP[rawHomeAbbr] || rawHomeAbbr;
          const awayAbbr = ESPN_ABBR_MAP[rawAwayAbbr] || rawAwayAbbr;

          const homeCatalog = NBA_TEAMS_CATALOG[homeAbbr] || NBA_TEAMS_CATALOG.BOS;
          const awayCatalog = NBA_TEAMS_CATALOG[awayAbbr] || NBA_TEAMS_CATALOG.DET;

          const gameDate = new Date(ev.date);
          const seasonYear = computeNBASeason(gameDate);

          const homeSeasonMap = homeCatalog.statsBySeason as Record<string, any>;
          const awaySeasonMap = awayCatalog.statsBySeason as Record<string, any>;

          const homeStats = homeSeasonMap[seasonYear] || homeSeasonMap['2024-25'] || Object.values(homeSeasonMap)[0];
          const awayStats = awaySeasonMap[seasonYear] || awaySeasonMap['2024-25'] || Object.values(awaySeasonMap)[0];

          const statusType = ev.status?.type;
          let status: MatchStatus = 'SCHEDULED';
          if (statusType?.completed || statusType?.state === 'post' || statusType?.name === 'STATUS_FINAL') {
            status = 'FINISHED';
          } else if (statusType?.state === 'in' || statusType?.name === 'STATUS_IN_PROGRESS') {
            status = 'IN_PLAY';
          } else if (statusType?.name === 'STATUS_HALFTIME') {
            status = 'PAUSED';
          } else if (statusType?.name === 'STATUS_POSTPONED') {
            status = 'POSTPONED';
          } else if (statusType?.name === 'STATUS_CANCELED') {
            status = 'CANCELED';
          }

          const rawHomeScore = parseInt(homeComp.score, 10);
          const rawAwayScore = parseInt(awayComp.score, 10);
          const homeScore = !isNaN(rawHomeScore) && (status === 'FINISHED' || status === 'IN_PLAY') ? rawHomeScore : null;
          const awayScore = !isNaN(rawAwayScore) && (status === 'FINISHED' || status === 'IN_PLAY') ? rawAwayScore : null;

          const oddsObj = competitionData.odds?.[0];
          const sportsbookTotal = oddsObj?.overUnder ? Number(oddsObj.overUnder) : 224.5;
          const sportsbookSpreadHome = oddsObj?.spread ? Number(oddsObj.spread) : -3.5;

          const proj = calculateNBAScoreProjection(
            {
              name: homeCatalog.name,
              offensiveEfficiency: homeStats.offensiveEfficiency,
              defensiveEfficiency: homeStats.defensiveEfficiency,
              possessions: homeStats.possessions,
            },
            {
              name: awayCatalog.name,
              offensiveEfficiency: awayStats.offensiveEfficiency,
              defensiveEfficiency: awayStats.defensiveEfficiency,
              possessions: awayStats.possessions,
            },
            {
              totalLine: sportsbookTotal,
              spreadLineTeamA: sportsbookSpreadHome,
            }
          );

          const fixtureId = `nba_${ev.id}`;
          const fixture: Fixture = {
            id: fixtureId,
            providerId: String(ev.id),
            providerName: 'ESPN NBA Live Scoreboard & DraftKings Lines',
            fetchTime: attemptIso,
            source: 'provider:espn_nba',
            competitionId: NBA_COMPETITION.id,
            competition: NBA_COMPETITION,
            seasonYear,
            sport: 'basketball',
            homeTeam: createNBATeam(homeAbbr),
            awayTeam: createNBATeam(awayAbbr),
            kickoffTime: ev.date,
            matchday: 1,
            status,
            homeScore,
            awayScore,
            venue: competitionData.venue?.fullName || `${homeCatalog.city} Arena`,
            dataFreshness: attemptIso,
            basketballStats: {
              homeOffEff: homeStats.offensiveEfficiency,
              homeDefEff: homeStats.defensiveEfficiency,
              homePoss: homeStats.possessions,
              awayOffEff: awayStats.offensiveEfficiency,
              awayDefEff: awayStats.defensiveEfficiency,
              awayPoss: awayStats.possessions,
              homeOff: proj.aOff,
              awayOff: proj.bOff,
              homeDef: proj.aDef,
              awayDef: proj.bDef,
              homeProjected: proj.aProjected,
              awayProjected: proj.bProjected,
              projectedTotal: proj.total,
              projectedMargin: proj.margin,
              projectedWinner: proj.projectedWinner,
              sportsbookTotal,
              sportsbookSpreadHome,
              totalLean: proj.totalLean?.lean,
              spreadLean: proj.spreadLean?.recommendation,
            },
          };

          this.fixturesStore.set(fixtureId, fixture);
          syncedFixtures.push(fixture);
        }

        if (syncedFixtures.length > 0) {
          await syncNBAFixturesToDatabase(syncedFixtures, mode === 'full' ? windowInfo.dateFrom : undefined);
          this.lastSyncTimestamp = new Date().toISOString();
          this.lastSyncStatus = 'ONLINE';
          this.lastProviderUsed = 'ESPN NBA Live Scoreboard & DraftKings Lines';

          await upsertProviderSyncState('basketball', {
            sport: 'basketball',
            providerName: 'ESPN NBA Live Scoreboard',
            status: 'ONLINE',
            lastAttemptAt: attemptIso,
            lastSuccessAt: this.lastSyncTimestamp,
            lastError: null,
            lastHttpStatus: lastHttpStatus ?? 200,
            callsUsedLastRun: callsMade,
            skippedLeagues: [],
          });
          await upsertProviderSyncState('provider:espn_nba', {
            sport: 'basketball',
            providerName: 'ESPN NBA Scoreboard',
            status: 'ONLINE',
            lastAttemptAt: attemptIso,
            lastSuccessAt: this.lastSyncTimestamp,
            lastError: null,
            lastHttpStatus: lastHttpStatus ?? 200,
            callsUsedLastRun: callsMade,
          });
        } else {
          this.lastSyncStatus = 'ERROR';
          await upsertProviderSyncState('basketball', {
            sport: 'basketball',
            providerName: 'ESPN NBA Live Scoreboard',
            status: 'ERROR',
            lastAttemptAt: attemptIso,
            lastError: lastError || 'ESPN NBA returned 0 events',
            lastHttpStatus,
            lastResponseBody,
            callsUsedLastRun: callsMade,
          });
          await upsertProviderSyncState('provider:espn_nba', {
            sport: 'basketball',
            providerName: 'ESPN NBA Scoreboard',
            status: 'ERROR',
            lastAttemptAt: attemptIso,
            lastError: lastError || 'ESPN NBA returned 0 events',
            lastHttpStatus,
            lastResponseBody,
            callsUsedLastRun: callsMade,
          });
        }

        await serverCache.set('nba:fixtures:all', Array.from(this.fixturesStore.values()), NBADataProvider.FIXTURES_CACHE_TTL_SEC);
        return syncedFixtures.length;
      } catch (err: any) {
        console.error('[NBA Provider Sync Error]:', err?.message || err);
        this.lastSyncStatus = 'ERROR';
        await upsertProviderSyncState('basketball', {
          sport: 'basketball',
          providerName: 'ESPN NBA Live Scoreboard',
          status: 'ERROR',
          lastAttemptAt: attemptIso,
          lastError: err?.message || 'NBA sync exception',
          callsUsedLastRun: callsMade,
        });
        return this.fixturesStore.size;
      } finally {
        this.activeSyncPromise = null;
      }
    })();

    return this.activeSyncPromise;
  }

  /**
   * Visitor Read Path: Reads ONLY from Supabase/DB (plus hydrated memory store).
   * NEVER calls external providers on page loads or API reads.
   */
  async getFixtures(status?: string): Promise<{
    fixtures: Fixture[];
    lastUpdated: string;
    lastSyncTimestamp: string | null;
    liveDataAvailable: boolean;
    isDelayed: boolean;
    staleLimitMinutes: number;
    error?: string;
    failedProvider?: string;
    season: string;
  }> {
    const dbFixtures = await getFixturesFromDatabase({ sport: 'basketball', status });
    const freshness = await getStoredSportFreshness('basketball');

    // Hydrate memory store from DB rows so health/telemetry reflects persisted count
    if (dbFixtures.length > 0) {
      for (const f of dbFixtures) {
        if (!this.fixturesStore.has(f.id)) {
          this.fixturesStore.set(f.id, f);
        }
      }
      if (!this.lastSyncTimestamp && freshness.newestUpdatedAt) {
        this.lastSyncTimestamp = freshness.newestUpdatedAt;
      }
    }

    let sourceList = dbFixtures.length > 0 ? dbFixtures : Array.from(this.fixturesStore.values());
    if (status && status !== 'ALL') {
      if (status === 'FINISHED') {
        sourceList = sourceList.filter(f => f.status === 'FINISHED');
      } else if (status === 'TIMED' || status === 'SCHEDULED') {
        sourceList = sourceList.filter(f => f.status !== 'FINISHED');
      } else {
        sourceList = sourceList.filter(f => f.status === status);
      }
    }

    const filtered = [...sourceList].sort((a, b) => {
      if (status === 'FINISHED') {
        return new Date(b.kickoffTime).getTime() - new Date(a.kickoffTime).getTime();
      }
      if (status === 'TIMED' || status === 'SCHEDULED') {
        return new Date(a.kickoffTime).getTime() - new Date(b.kickoffTime).getTime();
      }
      const aFin = a.status === 'FINISHED' ? 1 : 0;
      const bFin = b.status === 'FINISHED' ? 1 : 0;
      if (aFin !== bFin) return aFin - bFin;
      if (aFin === 1) {
        return new Date(b.kickoffTime).getTime() - new Date(a.kickoffTime).getTime();
      }
      return new Date(a.kickoffTime).getTime() - new Date(b.kickoffTime).getTime();
    });

    const effectiveTimestamp = freshness.newestUpdatedAt || this.lastSyncTimestamp;
    const lastUpdated = formatUtcTimeStamp(effectiveTimestamp);
    const isDelayed =
      filtered.length === 0 ||
      (freshness.newestUpdatedAt ? freshness.isStaleBeyondLimit : false);

    const lastFailed =
      freshness.syncState?.status === 'ERROR' ? freshness.syncState.providerName : undefined;

    return {
      fixtures: filtered,
      lastUpdated,
      lastSyncTimestamp: effectiveTimestamp,
      liveDataAvailable: filtered.length > 0,
      isDelayed,
      staleLimitMinutes: FIXTURE_STALE_LIMIT_MINUTES,
      error:
        isDelayed && (lastFailed || filtered.length === 0)
          ? `Basketball fixtures unavailable or stale beyond ${FIXTURE_STALE_LIMIT_MINUTES}m. Last updated ${lastUpdated}.`
          : undefined,
      failedProvider: isDelayed ? lastFailed : undefined,
      season: computeNBASeason(),
    };
  }

  /**
   * DB-only lookup for single NBA fixture (never calls external APIs per visitor).
   */
  async getFixtureById(id: string): Promise<Fixture | null> {
    const cleanId = id.startsWith('nba_') ? id : `nba_${id}`;
    const memHit =
      this.fixturesStore.get(cleanId) ||
      Array.from(this.fixturesStore.values()).find(f => f.providerId === id || f.id === id);
    if (memHit) return memHit;

    const dbFixtures = await getFixturesFromDatabase({ sport: 'basketball' });
    return dbFixtures.find(f => f.id === id || f.id === cleanId || f.providerId === id) || null;
  }

  async getTeamAdvancedStats(season?: NBASeason | string, forceRefresh = false): Promise<NBAStatsFetchResult> {
    const targetSeason = season || computeNBASeason();
    const cacheKey = `nba:stats:${targetSeason}`;

    if (!forceRefresh) {
      const cached = await serverCache.get<NBAStatsFetchResult>(cacheKey);
      if (cached && cached.stats && Object.keys(cached.stats).length > 0) {
        return cached;
      }
    }

    const allTeams = getAllNBATeamsList();
    const statsResult: Record<string, NBATeamStats> = {};

    allTeams.forEach(t => {
      const teamStats = getNBATeamStats(t.abbreviation, targetSeason);
      if (teamStats) {
        statsResult[t.abbreviation] = teamStats;
      }
    });

    const now = new Date();
    const lastUpdated = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')} UTC`;

    const result: NBAStatsFetchResult = {
      stats: statsResult,
      source: 'Official NBA Verified Advanced Stats & Live Efficiency Projections',
      season: targetSeason,
      lastUpdated,
      isLive: true,
    };

    await serverCache.set(cacheKey, result, NBADataProvider.STATS_CACHE_TTL_SEC);
    return result;
  }
}

declare global {
  var __nbaProviderInstance: NBADataProvider | undefined;
}

export function getNBADataProvider(): NBADataProvider {
  if (!globalThis.__nbaProviderInstance) {
    globalThis.__nbaProviderInstance = new NBADataProvider();
  }
  return globalThis.__nbaProviderInstance;
}
