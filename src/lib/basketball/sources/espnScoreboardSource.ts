// CALIBRALL: ESPN Scoreboard By-Date Source (NBA & NCAAB Men's Division I)
// Endpoints:
// - NBA:   https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=YYYYMMDD
// - NCAAB: https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=YYYYMMDD&groups=50&limit=500
// Rate-limited with retry & exponential backoff on HTTP 429/5xx.
// Never estimates missing half scores; enforces strict D1-vs-D1 for NCAAB.

import {
  BasketballLeague,
  CURRENT_BASKETBALL_SEASON,
} from '../markets';
import {
  CanonicalBasketballTeam,
  resolveBasketballTeam,
} from '../canonicalTeams';
import {
  BasketballGameStatus,
  BasketballUnresolvedEntry,
  StoredBbGame,
  StoredBbQuarterScores,
} from '../store';

export interface EspnFetchResult {
  league: 'NBA' | 'NCAAB';
  season: string;
  sourceUsed: string;
  datesQueried: number;
  eventsRead: number;
  rowsSkipped: number;
  teams: CanonicalBasketballTeam[];
  games: StoredBbGame[];
  unresolvedTeams: BasketballUnresolvedEntry[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonWithRetry(url: string, maxRetries = 4): Promise<any> {
  let attempt = 0;
  while (true) {
    try {
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
        },
        cache: 'no-store',
      });

      if (res.status === 429 || res.status >= 500) {
        if (attempt >= maxRetries) {
          throw new Error(`ESPN HTTP ${res.status} for ${url} after ${maxRetries} retries`);
        }
        const retryAfter = Number(res.headers.get('retry-after'));
        const baseDelay = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : Math.min(8000, 400 * Math.pow(2, attempt));
        const jitter = Math.floor(Math.random() * 200);
        attempt++;
        await sleep(baseDelay + jitter);
        continue;
      }

      if (!res.ok) {
        throw new Error(`ESPN HTTP ${res.status} for ${url}`);
      }

      return await res.json();
    } catch (err: any) {
      if (attempt >= maxRetries) {
        throw err;
      }
      const delay = Math.min(8000, 400 * Math.pow(2, attempt)) + Math.floor(Math.random() * 200);
      attempt++;
      await sleep(delay);
    }
  }
}

function mapEspnEventStatus(statusObj: any): BasketballGameStatus {
  const name = String(statusObj?.type?.name || '').toUpperCase();
  const completed = statusObj?.type?.completed === true;
  if (name === 'STATUS_FINAL' || completed) return 'FINISHED';
  if (name === 'STATUS_POSTPONED') return 'POSTPONED';
  if (name === 'STATUS_CANCELED' || name === 'STATUS_CANCELLED') return 'CANCELED';
  if (name === 'STATUS_HALFTIME' || name === 'STATUS_END_PERIOD') return 'PAUSED';
  if (name === 'STATUS_IN_PROGRESS') return 'IN_PLAY';
  return 'SCHEDULED';
}

function parseCompetitorLinescores(
  league: 'NBA' | 'NCAAB',
  homeComp: any,
  awayComp: any,
  regulationPeriods: number,
  isFinished: boolean
): {
  h1_home: number | null;
  h1_away: number | null;
  ot_periods: number;
  q_scores: StoredBbQuarterScores | null;
} {
  if (!isFinished) {
    return { h1_home: null, h1_away: null, ot_periods: 0, q_scores: null };
  }

  const hRaw: any[] = Array.isArray(homeComp?.linescores) ? homeComp.linescores : [];
  const aRaw: any[] = Array.isArray(awayComp?.linescores) ? awayComp.linescores : [];
  if (hRaw.length === 0 || aRaw.length === 0) {
    return { h1_home: null, h1_away: null, ot_periods: 0, q_scores: null };
  }

  const hMap = new Map<number, number>();
  const aMap = new Map<number, number>();

  hRaw.forEach((item, idx) => {
    const period = Number(item?.period) || idx + 1;
    const val = Number(item?.value ?? item?.displayValue);
    if (Number.isFinite(period) && period >= 1 && Number.isFinite(val)) {
      hMap.set(Math.round(period), Math.round(val));
    }
  });
  aRaw.forEach((item, idx) => {
    const period = Number(item?.period) || idx + 1;
    const val = Number(item?.value ?? item?.displayValue);
    if (Number.isFinite(period) && period >= 1 && Number.isFinite(val)) {
      aMap.set(Math.round(period), Math.round(val));
    }
  });

  if (hMap.size === 0 || aMap.size === 0) {
    return { h1_home: null, h1_away: null, ot_periods: 0, q_scores: null };
  }

  let h1_home: number | null = null;
  let h1_away: number | null = null;
  if (league === 'NBA' || regulationPeriods === 4) {
    const h1 = hMap.get(1);
    const h2 = hMap.get(2);
    const a1 = aMap.get(1);
    const a2 = aMap.get(2);
    if (h1 !== undefined && h2 !== undefined && a1 !== undefined && a2 !== undefined) {
      h1_home = h1 + h2;
      h1_away = a1 + a2;
    }
  } else {
    const h1 = hMap.get(1);
    const a1 = aMap.get(1);
    if (h1 !== undefined && a1 !== undefined) {
      h1_home = h1;
      h1_away = a1;
    }
  }

  const maxPeriod = Math.max(...Array.from(hMap.keys()), ...Array.from(aMap.keys()));
  const ot_periods = maxPeriod > regulationPeriods ? maxPeriod - regulationPeriods : 0;

  const hArr: number[] = [];
  const aArr: number[] = [];
  for (let p = 1; p <= maxPeriod; p++) {
    const hv = hMap.get(p);
    const av = aMap.get(p);
    if (hv === undefined || av === undefined) {
      return { h1_home, h1_away, ot_periods, q_scores: null };
    }
    hArr.push(hv);
    aArr.push(av);
  }

  return {
    h1_home,
    h1_away,
    ot_periods,
    q_scores: hArr.length > 0 ? { h: hArr, a: aArr } : null,
  };
}

/**
 * Generates UTC-adjusted YYYY-MM-DD dates between startDate and endDate inclusive.
 */
export function buildDateRange(startDateIso: string, endDateIso: string): string[] {
  const start = Date.parse(`${startDateIso}T00:00:00Z`);
  const end = Date.parse(`${endDateIso}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return [];
  const out: string[] = [];
  for (let t = start; t <= end; t += 86400000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/**
 * Default current-season rolling window (October 1 of season start year through today + 2 days).
 */
export function getCurrentSeasonDateWindow(season: string = CURRENT_BASKETBALL_SEASON): string[] {
  const m = season.match(/^(\d{4})-(\d{2})$/);
  const startYear = m ? parseInt(m[1], 10) : 2026;
  const startIso = `${startYear}-10-01`;
  const nowPlus2 = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const seasonEndCap = `${startYear + 1}-06-30`;
  const endIso = nowPlus2 < seasonEndCap ? nowPlus2 : seasonEndCap;
  return buildDateRange(startIso, endIso);
}

/**
 * Queries ESPN scoreboard for a given list of YYYY-MM-DD dates (rate-limited, retry & backoff).
 */
export async function fetchEspnScoreboardDates(options: {
  league: 'NBA' | 'NCAAB';
  season: string;
  dates: string[];
  delayMs?: number;
  concurrency?: number;
}): Promise<EspnFetchResult> {
  const { league, season, dates } = options;
  const delayMs = options.delayMs ?? 120;
  const concurrency = Math.max(1, Math.min(3, options.concurrency ?? 2));
  const sourceUsed = league === 'NBA' ? 'espn:nba:scoreboard' : 'espn:ncaab:scoreboard';
  const providerTag = league === 'NBA' ? 'bb:espn_nba' : 'bb:espn_ncaab';

  const uniqueDates = Array.from(new Set(dates.map((d) => d.slice(0, 10)))).sort();
  const teamsMap = new Map<string, CanonicalBasketballTeam>();
  const gamesMap = new Map<string, StoredBbGame>();
  const unresolvedMap = new Map<string, BasketballUnresolvedEntry>();
  let eventsRead = 0;
  let rowsSkipped = 0;

  const recordUnresolved = (name: string) => {
    const clean = name.trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    const prev = unresolvedMap.get(key);
    if (prev) prev.count++;
    else unresolvedMap.set(key, { sourceName: clean, sourceProvider: providerTag, count: 1 });
  };

  for (let i = 0; i < uniqueDates.length; i += concurrency) {
    const batch = uniqueDates.slice(i, i + concurrency);
    const payloads = await Promise.all(
      batch.map(async (isoDate) => {
        const yyyymmdd = isoDate.replace(/-/g, '');
        const url =
          league === 'NBA'
            ? `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${yyyymmdd}`
            : `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=${yyyymmdd}&groups=50&limit=500`;
        const json = await fetchJsonWithRetry(url);
        return { isoDate, json };
      })
    );

    for (const { isoDate, json } of payloads) {
      const events: any[] = Array.isArray(json?.events) ? json.events : [];
      for (const ev of events) {
        eventsRead++;
        const seasonType = Number(ev?.season?.type);
        const allowedTypes = league === 'NBA' ? [2, 3, 5] : [2, 3];
        if (!allowedTypes.includes(seasonType)) {
          rowsSkipped++;
          continue;
        }

        const comp = Array.isArray(ev?.competitions) ? ev.competitions[0] : null;
        const competitors: any[] = Array.isArray(comp?.competitors) ? comp.competitors : [];
        const homeComp = competitors.find((c) => c.homeAway === 'home');
        const awayComp = competitors.find((c) => c.homeAway === 'away');
        if (!homeComp || !awayComp) {
          rowsSkipped++;
          continue;
        }

        const homeEspnId = String(homeComp?.team?.id || '').trim();
        const awayEspnId = String(awayComp?.team?.id || '').trim();

        if (league === 'NBA') {
          const hNum = Number(homeEspnId);
          const aNum = Number(awayEspnId);
          if (!Number.isFinite(hNum) || !Number.isFinite(aNum) || hNum < 1 || hNum > 30 || aNum < 1 || aNum > 30) {
            rowsSkipped++;
            continue;
          }
        } else {
          const hConf = homeComp?.team?.conferenceId;
          const aConf = awayComp?.team?.conferenceId;
          if (!hConf || !aConf) {
            rowsSkipped++;
            continue;
          }
        }

        const homeNameRaw = String(homeComp?.team?.displayName || homeComp?.team?.shortDisplayName || '').trim();
        const awayNameRaw = String(awayComp?.team?.displayName || awayComp?.team?.shortDisplayName || '').trim();

        const homeTeam = resolveBasketballTeam(league as BasketballLeague, {
          provider: 'espn',
          providerId: homeEspnId,
          name: homeNameRaw,
        });
        const awayTeam = resolveBasketballTeam(league as BasketballLeague, {
          provider: 'espn',
          providerId: awayEspnId,
          name: awayNameRaw,
        });

        if (!homeTeam || !awayTeam) {
          if (!homeTeam && homeNameRaw) recordUnresolved(`${homeNameRaw} (id:${homeEspnId})`);
          if (!awayTeam && awayNameRaw) recordUnresolved(`${awayNameRaw} (id:${awayEspnId})`);
          rowsSkipped++;
          continue;
        }

        teamsMap.set(homeTeam.id, homeTeam);
        teamsMap.set(awayTeam.id, awayTeam);

        const status = mapEspnEventStatus(comp?.status || ev?.status);
        const isFinished = status === 'FINISHED';
        const hPts = Number(homeComp?.score);
        const aPts = Number(awayComp?.score);
        const validScores = isFinished && Number.isFinite(hPts) && Number.isFinite(aPts);
        const regPeriods = Number(comp?.format?.regulation?.periods) || (league === 'NBA' ? 4 : 2);

        const { h1_home, h1_away, ot_periods, q_scores } = parseCompetitorLinescores(
          league,
          homeComp,
          awayComp,
          regPeriods,
          validScores
        );

        const eventId = String(ev?.id || '').trim();
        if (!eventId) {
          rowsSkipped++;
          continue;
        }

        const kickoffParsed = ev?.date ? Date.parse(String(ev.date)) : NaN;
        const kickoffUtc = !Number.isNaN(kickoffParsed) ? new Date(kickoffParsed).toISOString() : null;
        const idPrefix = league === 'NBA' ? 'bbg_nba_' : 'bbg_ncaab_';

        gamesMap.set(`${idPrefix}${eventId}`, {
          id: `${idPrefix}${eventId}`,
          league,
          season,
          game_date: isoDate,
          kickoff_utc: kickoffUtc,
          home_id: homeTeam.id,
          away_id: awayTeam.id,
          neutral: Boolean(comp?.neutralSite),
          status,
          home_pts: validScores ? Math.round(hPts) : null,
          away_pts: validScores ? Math.round(aPts) : null,
          h1_home,
          h1_away,
          ot_periods,
          q_scores,
          source: sourceUsed,
        });
      }
    }

    if (i + concurrency < uniqueDates.length && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  return {
    league,
    season,
    sourceUsed,
    datesQueried: uniqueDates.length,
    eventsRead,
    rowsSkipped,
    teams: Array.from(teamsMap.values()),
    games: Array.from(gamesMap.values()),
    unresolvedTeams: Array.from(unresolvedMap.values()),
  };
}
