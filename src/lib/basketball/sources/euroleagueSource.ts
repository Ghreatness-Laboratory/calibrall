// CALIBRALL: EuroLeague Official Public API v2 Source
// Probed live endpoint:
//   https://api-live.euroleague.net/v2/competitions/E/seasons/E{startYear}/games
// Returns regular season (RS), play-in (PI), playoffs (PO), and final four (FF) with full quarter & OT partials.
// Never estimates missing half scores (stores null when absent or unplayed).

import { seasonLabelToEuroLeagueCode } from '../markets';
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

export interface EuroLeagueFetchResult {
  league: 'EUROLEAGUE';
  season: string;
  seasonCode: string;
  sourceUrl: string;
  sourceUsed: string;
  rowsRead: number;
  rowsSkipped: number;
  teams: CanonicalBasketballTeam[];
  games: StoredBbGame[];
  unresolvedTeams: BasketballUnresolvedEntry[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchEuroLeagueJsonWithRetry(url: string, maxRetries = 4): Promise<any> {
  let attempt = 0;
  while (true) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Calibrall/1.0 (+https://calibrall.app)',
          Accept: 'application/json',
        },
        cache: 'no-store',
      });

      if (res.status === 429 || res.status >= 500) {
        if (attempt >= maxRetries) {
          throw new Error(`EuroLeague API HTTP ${res.status} after ${maxRetries} retries`);
        }
        const delay = Math.min(8000, 500 * Math.pow(2, attempt)) + Math.floor(Math.random() * 200);
        attempt++;
        await sleep(delay);
        continue;
      }

      if (!res.ok) {
        throw new Error(`EuroLeague API HTTP ${res.status} for ${url}`);
      }

      return await res.json();
    } catch (err: any) {
      if (attempt >= maxRetries) throw err;
      const delay = Math.min(8000, 500 * Math.pow(2, attempt)) + Math.floor(Math.random() * 200);
      attempt++;
      await sleep(delay);
    }
  }
}

function parsePartials(
  localPartials: any,
  roadPartials: any,
  isPlayed: boolean
): {
  h1_home: number | null;
  h1_away: number | null;
  ot_periods: number;
  q_scores: StoredBbQuarterScores | null;
} {
  if (!isPlayed || !localPartials || !roadPartials) {
    return { h1_home: null, h1_away: null, ot_periods: 0, q_scores: null };
  }

  const h1 = Number(localPartials.partials1);
  const h2 = Number(localPartials.partials2);
  const h3 = Number(localPartials.partials3);
  const h4 = Number(localPartials.partials4);

  const a1 = Number(roadPartials.partials1);
  const a2 = Number(roadPartials.partials2);
  const a3 = Number(roadPartials.partials3);
  const a4 = Number(roadPartials.partials4);

  const hasH1 =
    Number.isFinite(h1) &&
    Number.isFinite(h2) &&
    Number.isFinite(a1) &&
    Number.isFinite(a2);

  const h1_home = hasH1 ? Math.round(h1 + h2) : null;
  const h1_away = hasH1 ? Math.round(a1 + a2) : null;

  const extraLocal = localPartials.extraPeriods && typeof localPartials.extraPeriods === 'object'
    ? localPartials.extraPeriods
    : {};
  const extraRoad = roadPartials.extraPeriods && typeof roadPartials.extraPeriods === 'object'
    ? roadPartials.extraPeriods
    : {};
  const otKeys = Array.from(new Set([...Object.keys(extraLocal), ...Object.keys(extraRoad)])).sort();
  const ot_periods = otKeys.length;

  const hasAll4 =
    hasH1 &&
    Number.isFinite(h3) &&
    Number.isFinite(h4) &&
    Number.isFinite(a3) &&
    Number.isFinite(a4);

  if (!hasAll4) {
    return { h1_home, h1_away, ot_periods, q_scores: null };
  }

  const hArr = [Math.round(h1), Math.round(h2), Math.round(h3), Math.round(h4)];
  const aArr = [Math.round(a1), Math.round(a2), Math.round(a3), Math.round(a4)];

  for (const k of otKeys) {
    const hv = Number(extraLocal[k]);
    const av = Number(extraRoad[k]);
    if (Number.isFinite(hv) && Number.isFinite(av)) {
      hArr.push(Math.round(hv));
      aArr.push(Math.round(av));
    }
  }

  return {
    h1_home,
    h1_away,
    ot_periods,
    q_scores: { h: hArr, a: aArr },
  };
}

const ALLOWED_PHASES = new Set(['RS', 'PI', 'PO', 'FF']);

export async function fetchEuroLeagueSeason(season: string): Promise<EuroLeagueFetchResult> {
  const seasonCode = seasonLabelToEuroLeagueCode(season);
  if (!seasonCode) {
    throw new Error(`Invalid EuroLeague season '${season}'. Expected YYYY-YY (e.g. 2024-25).`);
  }

  const sourceUrl = `https://api-live.euroleague.net/v2/competitions/E/seasons/${seasonCode}/games`;
  const sourceUsed = `euroleague:v2:${seasonCode}`;

  const payload = await fetchEuroLeagueJsonWithRetry(sourceUrl);
  const rawGames: any[] = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];

  const teamsMap = new Map<string, CanonicalBasketballTeam>();
  const games: StoredBbGame[] = [];
  const unresolvedMap = new Map<string, BasketballUnresolvedEntry>();
  let rowsSkipped = 0;

  const recordUnresolved = (name: string) => {
    const clean = name.trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    const prev = unresolvedMap.get(key);
    if (prev) prev.count++;
    else unresolvedMap.set(key, { sourceName: clean, sourceProvider: 'bb:euroleague', count: 1 });
  };

  for (const g of rawGames) {
    const phaseCode = String(g?.phaseType?.code || '').toUpperCase();
    if (phaseCode && !ALLOWED_PHASES.has(phaseCode)) {
      rowsSkipped++;
      continue;
    }

    const gameCode = g?.gameCode ?? g?.code ?? g?.id;
    const utcRaw = g?.utcDate || g?.date;
    if (!gameCode || !utcRaw) {
      rowsSkipped++;
      continue;
    }

    const parsedMs = Date.parse(String(utcRaw));
    const kickoffUtc = !Number.isNaN(parsedMs) ? new Date(parsedMs).toISOString() : null;
    const gameDate = kickoffUtc ? kickoffUtc.slice(0, 10) : String(utcRaw).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(gameDate)) {
      rowsSkipped++;
      continue;
    }

    const localClub = g?.local?.club;
    const roadClub = g?.road?.club;
    const localCode = String(localClub?.code || '').trim();
    const roadCode = String(roadClub?.code || '').trim();
    const localName = String(localClub?.name || '').trim();
    const roadName = String(roadClub?.name || '').trim();

    const homeTeam = resolveBasketballTeam('EUROLEAGUE', {
      provider: 'euroleague',
      providerId: localCode,
      name: localName,
    });
    const awayTeam = resolveBasketballTeam('EUROLEAGUE', {
      provider: 'euroleague',
      providerId: roadCode,
      name: roadName,
    });

    if (!homeTeam || !awayTeam) {
      if (!homeTeam && (localName || localCode)) recordUnresolved(`${localName || localCode} (code:${localCode})`);
      if (!awayTeam && (roadName || roadCode)) recordUnresolved(`${roadName || roadCode} (code:${roadCode})`);
      rowsSkipped++;
      continue;
    }

    teamsMap.set(homeTeam.id, homeTeam);
    teamsMap.set(awayTeam.id, awayTeam);

    const isPlayed = g?.played === true;
    const rawHomePts = Number(g?.local?.score);
    const rawAwayPts = Number(g?.road?.score);
    const validScores = isPlayed && Number.isFinite(rawHomePts) && Number.isFinite(rawAwayPts);

    const status: BasketballGameStatus = isPlayed
      ? 'FINISHED'
      : g?.winner
      ? 'FINISHED'
      : 'SCHEDULED';

    const { h1_home, h1_away, ot_periods, q_scores } = parsePartials(
      g?.local?.partials,
      g?.road?.partials,
      validScores
    );

    games.push({
      id: `bbg_el_${seasonCode}_${String(gameCode).trim()}`,
      league: 'EUROLEAGUE',
      season,
      game_date: gameDate,
      kickoff_utc: kickoffUtc,
      home_id: homeTeam.id,
      away_id: awayTeam.id,
      neutral: Boolean(g?.isNeutralVenue),
      status,
      home_pts: validScores ? Math.round(rawHomePts) : null,
      away_pts: validScores ? Math.round(rawAwayPts) : null,
      h1_home,
      h1_away,
      ot_periods,
      q_scores,
      source: sourceUsed,
    });
  }

  return {
    league: 'EUROLEAGUE',
    season,
    seasonCode,
    sourceUrl,
    sourceUsed,
    rowsRead: rawGames.length,
    rowsSkipped,
    teams: Array.from(teamsMap.values()),
    games,
    unresolvedTeams: Array.from(unresolvedMap.values()),
  };
}
