import { matchesStore, StoredMatch } from '../src/lib/data/matchesStore';
import { lookupCanonicalTeam } from '../src/lib/data/canonicalTeams';
import { getCanonicalCompetition } from '../src/lib/data/canonicalCompetitions';
import { getFixtureStatistics, buildFixtureContextFromStats } from '../src/lib/data/seedData';
import { evaluateFixtureMarkets, selectDiversifiedSlatePicks } from '../src/lib/prediction/marketSelection';
import { evaluateCanonicalFootballSlate } from '../src/lib/prediction/canonicalHeadlinePick';
import { generateFootballExplanation } from '../src/lib/prediction/explanationGenerator';
import { DixonColesV25Engine } from '../src/lib/prediction/v25/dixonColesV25';
import { FeatureLayerEngine } from '../src/lib/prediction/v25/featureLayer';
import { checkMarketGating } from '../src/lib/prediction/marketGating';
import { getMarketBaseline } from '../src/lib/prediction/baselines';
import { getCalibratedParams, getLeagueCapabilities } from '../src/lib/prediction/calibratedParams';
import { displayName, formatMatchTime } from '../src/lib/utils/formatText';
import { compareFootballPicksByRank } from '../src/lib/prediction/explanationValidator';
import type { Fixture, MatchStatus, Team } from '../src/types';

const FD_LEAGUES: Array<{ div: string; comp: string }> = [
  { div: 'E0', comp: 'PL' },
  { div: 'E1', comp: 'ELC' },
  { div: 'E2', comp: 'E2' },
  { div: 'E3', comp: 'E3' },
  { div: 'EC', comp: 'EC' },
  { div: 'SP1', comp: 'PD' },
  { div: 'SP2', comp: 'SP2' },
  { div: 'D1', comp: 'BL1' },
  { div: 'D2', comp: 'D2' },
  { div: 'I1', comp: 'SA' },
  { div: 'I2', comp: 'I2' },
  { div: 'F1', comp: 'FL1' },
  { div: 'F2', comp: 'F2' },
  { div: 'N1', comp: 'DED' },
  { div: 'B1', comp: 'B1' },
  { div: 'P1', comp: 'PPL' },
  { div: 'T1', comp: 'TSL' },
  { div: 'G1', comp: 'G1' },
  { div: 'SC0', comp: 'SC0' },
];

const ESPN_SLUGS: Array<{ comp: string; slug: string }> = [
  { comp: 'PL', slug: 'eng.1' },
  { comp: 'ELC', slug: 'eng.2' },
  { comp: 'E2', slug: 'eng.3' },
  { comp: 'E3', slug: 'eng.4' },
  { comp: 'PD', slug: 'esp.1' },
  { comp: 'SP2', slug: 'esp.2' },
  { comp: 'BL1', slug: 'ger.1' },
  { comp: 'D2', slug: 'ger.2' },
  { comp: 'SA', slug: 'ita.1' },
  { comp: 'I2', comp: 'ita.2' },
  { comp: 'FL1', slug: 'fra.1' },
  { comp: 'F2', slug: 'fra.2' },
  { comp: 'DED', slug: 'ned.1' },
  { comp: 'B1', comp: 'bel.1' },
  { comp: 'PPL', slug: 'por.1' },
  { comp: 'TSL', slug: 'tur.1' },
  { comp: 'G1', slug: 'gre.1' },
  { comp: 'SC0', slug: 'sco.1' },
  { comp: 'CL', slug: 'uefa.champions' },
];

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (c === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  result.push(cur.trim());
  return result;
}

function parseFdDate(dStr: string): string | null {
  if (!dStr) return null;
  const parts = dStr.split(/[/.-]/);
  if (parts.length !== 3) return null;
  const day = parts[0].padStart(2, '0');
  const month = parts[1].padStart(2, '0');
  let year = parts[2];
  if (year.length === 2) year = parseInt(year, 10) > 50 ? `19${year}` : `20${year}`;
  return `${year}-${month}-${day}`;
}

async function fetchWithRetry(url: string, retries = 1): Promise<string | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) {
        if (res.status === 404) return null;
        continue;
      }
      return await res.text();
    } catch {
      if (attempt < retries) await new Promise(r => setTimeout(r, 400));
    }
  }
  return null;
}

async function fetchFdCsvMatches(): Promise<StoredMatch[]> {
  const seasons = ['2425', '2526', '2627'];
  const jobs: Array<{ div: string; comp: string; season: string }> = [];
  for (const { div, comp } of FD_LEAGUES) {
    for (const season of seasons) {
      jobs.push({ div, comp, season });
    }
  }
  const allOut: StoredMatch[] = [];
  const failed: string[] = [];
  const CONCURRENCY = 5;
  for (let start = 0; start < jobs.length; start += CONCURRENCY) {
    const slice = jobs.slice(start, start + CONCURRENCY);
    const batchResults = await Promise.all(
      slice.map(async ({ div, comp, season }) => {
        const url = `https://www.football-data.co.uk/mmz4281/${season}/${div}.csv`;
        const text = await fetchWithRetry(url, 1);
        if (!text) {
          if (season === '2526' || season === '2627') failed.push(`${comp}/${season}/${div}`);
          return [] as StoredMatch[];
        }
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (lines.length < 2) return [] as StoredMatch[];
        const hdr = parseCsvLine(lines[0]);
        const col = (n: string) => hdr.indexOf(n);
        const iD = col('Date'), iT = col('Time'), iH = col('HomeTeam'), iA = col('AwayTeam');
        const iFTHG = col('FTHG'), iFTAG = col('FTAG'), iHTHG = col('HTHG'), iHTAG = col('HTAG');
        const iRef = col('Referee'), iHC = col('HC'), iAC = col('AC');
        const iHY = col('HY'), iAY = col('AY'), iHR = col('HR'), iAR = col('AR');
        const iHS = col('HS'), iAS = col('AS'), iHST = col('HST'), iAST = col('AST');
        const iHF = col('HF'), iAF = col('AF');
        const out: StoredMatch[] = [];
        for (let i = 1; i < lines.length; i++) {
          const row = parseCsvLine(lines[i]);
          if (row.length < 6) continue;
          const dateYmd = parseFdDate(row[iD]);
          const homeRaw = row[iH];
          const awayRaw = row[iA];
          const hg = Number(row[iFTHG]);
          const ag = Number(row[iFTAG]);
          if (!dateYmd || !homeRaw || !awayRaw || !Number.isFinite(hg) || !Number.isFinite(ag)) continue;
          const tm = iT >= 0 && /^\d{1,2}:\d{2}$/.test(row[iT] || '') ? row[iT].padStart(5, '0') : '15:00';
          const homeCanon = lookupCanonicalTeam(homeRaw, comp);
          const awayCanon = lookupCanonicalTeam(awayRaw, comp);
          const hid = homeCanon?.canonicalId || `team_${homeRaw.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
          const aid = awayCanon?.canonicalId || `team_${awayRaw.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
          const pid = `fdcuk_${comp}_${dateYmd}_${hid}_${aid}`;
          out.push({
            id: pid,
            provider_id: pid,
            competition_code: comp,
            season: `20${season.slice(0, 2)}/20${season.slice(2, 4)}`,
            home_team_id: hid,
            away_team_id: aid,
            home_team_name: homeCanon?.canonicalName || homeRaw,
            away_team_name: awayCanon?.canonicalName || awayRaw,
            kickoff_time: `${dateYmd}T${tm}:00Z`,
            kickoff_date: dateYmd,
            status: 'FINISHED',
            home_score: hg,
            away_score: ag,
            home_half_time_score: iHTHG >= 0 && row[iHTHG] !== '' ? Number(row[iHTHG]) : null,
            away_half_time_score: iHTAG >= 0 && row[iHTAG] !== '' ? Number(row[iHTAG]) : null,
            home_corners: iHC >= 0 && row[iHC] !== '' ? Number(row[iHC]) : null,
            away_corners: iAC >= 0 && row[iAC] !== '' ? Number(row[iAC]) : null,
            home_yellow_cards: iHY >= 0 && row[iHY] !== '' ? Number(row[iHY]) : null,
            away_yellow_cards: iAY >= 0 && row[iAY] !== '' ? Number(row[iAY]) : null,
            home_red_cards: iHR >= 0 && row[iHR] !== '' ? Number(row[iHR]) : null,
            away_red_cards: iAR >= 0 && row[iAR] !== '' ? Number(row[iAR]) : null,
            home_shots: iHS >= 0 && row[iHS] !== '' ? Number(row[iHS]) : null,
            away_shots: iAS >= 0 && row[iAS] !== '' ? Number(row[iAS]) : null,
            home_shots_on_target: iHST >= 0 && row[iHST] !== '' ? Number(row[iHST]) : null,
            away_shots_on_target: iAST >= 0 && row[iAST] !== '' ? Number(row[iAST]) : null,
            home_fouls: iHF >= 0 && row[iHF] !== '' ? Number(row[iHF]) : null,
            away_fouls: iAF >= 0 && row[iAF] !== '' ? Number(row[iAF]) : null,
            referee: iRef >= 0 && row[iRef] ? row[iRef] : null,
            source: 'football-data.co.uk',
          });
        }
        return out;
      })
    );
    allOut.push(...batchResults.flat());
  }
  if (failed.length > 0) console.log('FD CSV fetch misses:', failed.join(', '));
  return allOut;
}

async function fetchEspnScoreboard(compCode: string, slug: string, datesParam?: string): Promise<Array<{ raw: any; fixture: Fixture }>> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard${datesParam ? `?dates=${datesParam}` : ''}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const data = await res.json();
    const comp = getCanonicalCompetition(compCode);
    if (!comp) return [];
    const out: Array<{ raw: any; fixture: Fixture }> = [];
    for (const ev of data.events || []) {
      const compData = ev.competitions?.[0];
      if (!compData) continue;
      const competitors = compData.competitors || [];
      const hComp = competitors.find((c: any) => c.homeAway === 'home');
      const aComp = competitors.find((c: any) => c.homeAway === 'away');
      if (!hComp || !aComp) continue;
      const rawHome = hComp.team?.displayName || hComp.team?.name;
      const rawAway = aComp.team?.displayName || aComp.team?.name;
      const hCanon = lookupCanonicalTeam(rawHome, compCode);
      const aCanon = lookupCanonicalTeam(rawAway, compCode);
      const st = ev.status?.type;
      let status: MatchStatus = 'TIMED';
      if (st?.completed || st?.state === 'post' || st?.name === 'STATUS_FINAL' || st?.name === 'STATUS_FULL_TIME') status = 'FINISHED';
      else if (st?.state === 'in') status = 'IN_PLAY';
      else if (st?.name === 'STATUS_POSTPONED') status = 'POSTPONED';
      else if (st?.name === 'STATUS_CANCELED') status = 'CANCELED';

      const homeTeam: Team = {
        id: hCanon?.canonicalId || `team_${hComp.team?.id || rawHome}`,
        name: hCanon?.canonicalName || rawHome,
        shortName: hCanon?.shortName || displayName(rawHome),
        tla: hCanon?.tla || hComp.team?.abbreviation || 'HOM',
        crestUrl: hComp.team?.logo || '',
      };
      const awayTeam: Team = {
        id: aCanon?.canonicalId || `team_${aComp.team?.id || rawAway}`,
        name: aCanon?.canonicalName || rawAway,
        shortName: aCanon?.shortName || displayName(rawAway),
        tla: aCanon?.tla || aComp.team?.abbreviation || 'AWY',
        crestUrl: aComp.team?.logo || '',
      };

      const hs = parseInt(hComp.score, 10);
      const as = parseInt(aComp.score, 10);
      const ko = new Date(ev.date).toISOString();

      out.push({
        raw: { id: ev.id, rawDate: ev.date, isoDate: ko, name: ev.name, shortName: ev.shortName, slug },
        fixture: {
          id: `fix_espn_${ev.id}`,
          providerId: String(ev.id),
          providerName: 'ESPN Live Scoreboard',
          fetchTime: new Date().toISOString(),
          source: 'provider:espn',
          competitionId: comp.id,
          competition: comp,
          seasonYear: '2026/2027',
          homeTeam,
          awayTeam,
          kickoffTime: ko,
          matchday: 13,
          status,
          homeScore: Number.isFinite(hs) && status === 'FINISHED' ? hs : null,
          awayScore: Number.isFinite(as) && status === 'FINISHED' ? as : null,
          venue: compData.venue?.fullName || 'Stadium',
        },
      });
    }
    return out;
  } catch {
    return [];
  }
}

async function fetchOpenFootballFixtures(): Promise<{ allMatches: StoredMatch[]; fixtures28_29: Fixture[] }> {
  const slugs = [
    { slug: 'en.1', comp: 'PL' },
    { slug: 'en.2', comp: 'ELC' },
    { slug: 'es.1', comp: 'PD' },
    { slug: 'de.1', comp: 'BL1' },
    { slug: 'it.1', comp: 'SA' },
    { slug: 'fr.1', comp: 'FL1' },
    { slug: 'cl', comp: 'CL' },
  ];
  const allMatches: StoredMatch[] = [];
  const fixtures28_29: Fixture[] = [];

  await Promise.all(
    slugs.map(async ({ slug, comp }) => {
      try {
        const url = `https://raw.githubusercontent.com/openfootball/football.json/master/2026-27/${slug}.json`;
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) return;
        const data = await res.json();
        const cObj = getCanonicalCompetition(comp);
        if (!cObj) return;
        for (const m of data.matches || []) {
          const d = String(m.date || '').slice(0, 10);
          if (!d || !m.team1 || !m.team2) continue;
          const hc = lookupCanonicalTeam(m.team1, comp);
          const ac = lookupCanonicalTeam(m.team2, comp);
          const hid = hc?.canonicalId || `team_${m.team1.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
          const aid = ac?.canonicalId || `team_${m.team2.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
          const ft = m.score?.ft;
          const ht = m.score?.ht;
          const ko = `${d}T${m.time || '15:00'}:00Z`;
          if (Array.isArray(ft) && typeof ft[0] === 'number' && typeof ft[1] === 'number') {
            allMatches.push({
              id: `of_${comp}_${d}_${hid}_${aid}`,
              provider_id: `of_${comp}_${d}_${hid}_${aid}`,
              competition_code: comp,
              season: '2026/2027',
              home_team_id: hid,
              away_team_id: aid,
              home_team_name: hc?.canonicalName || m.team1,
              away_team_name: ac?.canonicalName || m.team2,
              kickoff_time: ko,
              kickoff_date: d,
              status: 'FINISHED',
              home_score: ft[0],
              away_score: ft[1],
              home_half_time_score: Array.isArray(ht) ? ht[0] : null,
              away_half_time_score: Array.isArray(ht) ? ht[1] : null,
              source: 'openfootball',
            });
          }
          if (d === '2026-11-28' || d === '2026-11-29') {
            fixtures28_29.push({
              id: `fix_of_${comp}_${d}_${hid}_${aid}`,
              providerId: `of_${comp}_${d}_${hid}_${aid}`,
              providerName: 'OpenFootball CC0',
              fetchTime: new Date().toISOString(),
              source: 'provider:openfootball',
              competitionId: cObj.id,
              competition: cObj,
              seasonYear: '2026/2027',
              homeTeam: {
                id: hid,
                name: hc?.canonicalName || m.team1,
                shortName: hc?.shortName || displayName(m.team1),
                tla: hc?.tla || 'HOM',
                crestUrl: '',
              },
              awayTeam: {
                id: aid,
                name: ac?.canonicalName || m.team2,
                shortName: ac?.shortName || displayName(m.team2),
                tla: ac?.tla || 'AWY',
                crestUrl: '',
              },
              kickoffTime: ko,
              matchday: m.round ? parseInt(String(m.round).replace(/[^0-9]/g, ''), 10) || 1 : 1,
              status: Array.isArray(ft) ? 'FINISHED' : 'TIMED',
              homeScore: Array.isArray(ft) ? ft[0] : null,
              awayScore: Array.isArray(ft) ? ft[1] : null,
              venue: 'Stadium',
            });
          }
        }
      } catch {}
    })
  );
  return { allMatches, fixtures28_29 };
}

function enrichFixtureInMemory(f: Fixture): Fixture {
  const compCode = f.competition?.code;
  const hs = matchesStore.getTeamStatsSync(f.homeTeam, f.kickoffTime, compCode);
  const as = matchesStore.getTeamStatsSync(f.awayTeam, f.kickoffTime, compCode);
  const updated: Fixture = {
    ...f,
    homeTeam: {
      ...f.homeTeam,
      id: hs.teamId || f.homeTeam.id,
      name: displayName(f.homeTeam) || f.homeTeam.name,
      shortName: displayName(f.homeTeam) || f.homeTeam.shortName,
      storedMatchCount: hs.storedMatchCount,
      lastMatchDate: hs.lastMatchDate,
      daysSinceLastMatch: hs.daysSinceLastMatch,
      matchesInLast120Days: hs.matchesInLast120Days,
      isPromoted: hs.isPromoted,
      attackRating: hs.storedMatchCount > 0 ? hs.attackRating : undefined,
      defenseRating: hs.storedMatchCount > 0 ? hs.defenseRating : undefined,
      cornerAttackRating: hs.storedMatchCount > 0 ? hs.cornerAttackRating : undefined,
      disciplineRating: hs.storedMatchCount > 0 ? hs.disciplineRating : undefined,
      recentForm: hs.recentForm,
      hasRealTeamStrength: hs.storedMatchCount > 0,
    },
    awayTeam: {
      ...f.awayTeam,
      id: as.teamId || f.awayTeam.id,
      name: displayName(f.awayTeam) || f.awayTeam.name,
      shortName: displayName(f.awayTeam) || f.awayTeam.shortName,
      storedMatchCount: as.storedMatchCount,
      lastMatchDate: as.lastMatchDate,
      daysSinceLastMatch: as.daysSinceLastMatch,
      matchesInLast120Days: as.matchesInLast120Days,
      isPromoted: as.isPromoted,
      attackRating: as.storedMatchCount > 0 ? as.attackRating : undefined,
      defenseRating: as.storedMatchCount > 0 ? as.defenseRating : undefined,
      cornerAttackRating: as.storedMatchCount > 0 ? as.cornerAttackRating : undefined,
      disciplineRating: as.storedMatchCount > 0 ? as.disciplineRating : undefined,
      recentForm: as.recentForm,
      hasRealTeamStrength: as.storedMatchCount > 0,
    },
  };
  const stats = getFixtureStatistics(updated);
  updated.serverStats = stats;
  updated.insufficientData = Boolean(stats.insufficientData);
  updated.hasRealTeamStrength = Boolean(stats.hasRealTeamStrength);
  return updated;
}

function diagnoseCandidateGates(f: Fixture) {
  const stats = f.serverStats || getFixtureStatistics(f);
  const ctx = buildFixtureContextFromStats(f, stats);
  const ev = evaluateFixtureMarkets(ctx);
  const comp = f.competition.code;

  if (stats.insufficientData || !ctx.hasRealTeamStrength) {
    return {
      fixture: f,
      stats,
      ctx,
      ev,
      primaryDropGate:
        (f.homeTeam.storedMatchCount ?? 0) < 10 || (f.awayTeam.storedMatchCount ?? 0) < 10
          ? 'THIN_HISTORY'
          : stats.noRecommendationReason?.startsWith('Data out of date')
          ? 'STALE_DATA'
          : 'MISSING_DATA',
      candidates: [] as Array<{ code: string; calProb: number; base: number; edge: number; dropGate: string; detail: string }>,
    };
  }

  const features = FeatureLayerEngine.computeFixtureFeatures(ctx);
  const calParams = getCalibratedParams();
  const rho = calParams.leagues?.[comp]?.goals?.dixonColesRho ?? -0.10;
  const rates = DixonColesV25Engine.computeCovariateRates(ctx.homeXg, ctx.awayXg, features);
  const matrix = DixonColesV25Engine.generateScorelineMatrix(rates.lambda, rates.mu, features, rho);
  const caps = getLeagueCapabilities(comp);

  const candidates: Array<{ code: string; calProb: number; base: number; edge: number; dropGate: string; detail: string }> = [];

  const checkCand = (
    code: string,
    raw: number,
    fam: any,
    wfFam: any,
    line: number,
    threshold = 0.70,
    mgScope?: 'full_match' | 'home' | 'away' | 'first_half'
  ) => {
    const cal =
      fam === 'multi_goals'
        ? DixonColesV25Engine.calibrateMultiGoalsPrediction(raw, mgScope || 'full_match', features, 0).calibratedProb
        : DixonColesV25Engine.calibratePrediction(raw, fam, undefined, features, 0).calibratedProb;
    const base = getMarketBaseline(code, comp, line, stats).baseRate;
    const edge = cal - base;
    const wf = checkMarketGating(wfFam, comp, 30, mgScope);
    const inPreds = ev.predictions.find(p => p.marketCode === code);
    let dropGate = 'PASSED';
    let detail = `cal=${(cal * 100).toFixed(1)}% base=${(base * 100).toFixed(1)}% edge=${(edge * 100).toFixed(1)}pp`;

    if (wf.tierMode === 'DISABLED') {
      dropGate = 'DISABLED_MARKET';
      detail = wf.statusText;
    } else if (!wf.isAllowed || wf.cannotBeTopPick) {
      dropGate = wf.tierMode === 'SPECULATIVE_ONLY' ? 'SPECULATIVE_ONLY' : 'CALIBRATION_GATE';
      detail = wf.statusText;
    } else if (cal < threshold) {
      dropGate = 'PROB_THRESHOLD';
      detail = `${(cal * 100).toFixed(1)}% < ${(threshold * 100).toFixed(0)}%`;
    } else if (Math.abs(edge) <= 0.020) {
      dropGate = 'GENERIC_LIFT_RULE';
      detail = `|edge|=${(Math.abs(edge) * 100).toFixed(1)}pp <= 2.0pp vs base ${(base * 100).toFixed(1)}%`;
    } else if (edge <= 0.010) {
      dropGate = 'EDGE_RULE';
      detail = `edge=${(edge * 100).toFixed(1)}pp <= 1.0pp`;
    } else if (!inPreds) {
      dropGate = 'LADDER_OR_TIERING';
      detail = `Dropped by ladder/filter (${detail})`;
    }
    candidates.push({ code, calProb: cal, base, edge, dropGate, detail });
  };

  checkCand('1X2_HOME', matrix.homeWin, 'result', 'result', 0);
  checkCand('1X2_AWAY', matrix.awayWin, 'result', 'result', 0);
  checkCand('1X2_DRAW', matrix.draw, 'draw', 'draw', 0, 0.30);
  checkCand('DC_1X', matrix.doubleChance.homeOrDraw, 'double_chance', 'double_chance', 0);
  checkCand('DC_X2', matrix.doubleChance.awayOrDraw, 'double_chance', 'double_chance', 0);
  checkCand('DC_12', matrix.doubleChance.homeOrAway, 'double_chance', 'double_chance', 0);
  checkCand('TOTAL_GOALS_O15', matrix.overUnderGoals[1.5].over, 'goals', 'goals_over_under', 1.5);
  checkCand('TOTAL_GOALS_O25', matrix.overUnderGoals[2.5].over, 'goals', 'goals_over_under', 2.5);
  checkCand('TOTAL_GOALS_U25', matrix.overUnderGoals[2.5].under, 'goals', 'goals_over_under', 2.5);
  checkCand('TOTAL_GOALS_U35', matrix.overUnderGoals[3.5].under, 'goals', 'goals_over_under', 3.5);
  checkCand('BTTS_YES', matrix.bttsYes, 'btts', 'both_teams_to_score', 0);
  checkCand('BTTS_NO', matrix.bttsNo, 'btts', 'both_teams_to_score', 0);

  // Asian Handicap samples
  const ahHomeP05 = matrix.homeWin + matrix.draw;
  const ahAwayP05 = matrix.awayWin + matrix.draw;
  checkCand('AH_HOME_+0.5', ahHomeP05, 'handicap', 'handicap', 0.5);
  checkCand('AH_AWAY_+0.5', ahAwayP05, 'handicap', 'handicap', 0.5);
  checkCand('AH_HOME_-0.5', matrix.homeWin, 'handicap', 'handicap', -0.5);
  checkCand('AH_AWAY_-0.5', matrix.awayWin, 'handicap', 'handicap', -0.5);

  if (caps.hasCorners && stats.expectedCornersHome > 0) {
    const cDist = DixonColesV25Engine.calculateCorners(stats.expectedCornersHome, stats.expectedCornersAway, features);
    for (const l of [7.5, 8.5, 9.5, 10.5]) {
      checkCand(`CORNERS_O${String(l).replace('.', '')}`, cDist.overUnderLines[l].over, 'corners', 'corners', l);
      checkCand(`CORNERS_U${String(l).replace('.', '')}`, cDist.overUnderLines[l].under, 'corners', 'corners', l);
    }
  }
  if (caps.hasCards && features.discipline.expectedTotalBookings > 0) {
    const kDist = DixonColesV25Engine.calculateCards(features);
    for (const l of [2.5, 3.5, 4.5]) {
      checkCand(`CARDS_O${String(l).replace('.', '')}`, kDist.overUnderLines[l].over, 'bookings', 'bookings', l);
    }
  }
  for (const [k, prob] of Object.entries(matrix.multiGoals.fullMatch)) {
    const [a, b] = k.split('-').map(Number);
    const th = b - a + 1 >= 4 ? 0.80 : 0.60;
    checkCand(`MULTI_GOALS_${k.replace('-', '_')}`, prob, 'multi_goals', 'multi_goals', 0, th, 'full_match');
  }
  for (const [k, prob] of Object.entries(matrix.multiGoals.home)) {
    checkCand(`TEAM_MULTI_GOALS_HOME_${k.replace('-', '_')}`, prob, 'multi_goals', 'multi_goals', 0, 0.60, 'home');
  }
  for (const [k, prob] of Object.entries(matrix.multiGoals.away)) {
    checkCand(`TEAM_MULTI_GOALS_AWAY_${k.replace('-', '_')}`, prob, 'multi_goals', 'multi_goals', 0, 0.60, 'away');
  }

  return { fixture: f, stats, ctx, ev, primaryDropGate: ev.topPick ? 'RECOMMENDED' : 'NO_QUALIFIED_PICK', candidates };
}

function didPredictionHit(marketCode: string, hg: number, ag: number): boolean | null {
  const tot = hg + ag;
  if (marketCode === '1X2_HOME') return hg > ag;
  if (marketCode === '1X2_AWAY') return ag > hg;
  if (marketCode === '1X2_DRAW') return hg === ag;
  if (marketCode === 'DC_1X') return hg >= ag;
  if (marketCode === 'DC_X2') return ag >= hg;
  if (marketCode === 'DC_12') return hg !== ag;
  if (marketCode === 'BTTS_YES') return hg >= 1 && ag >= 1;
  if (marketCode === 'BTTS_NO') return hg === 0 || ag === 0;
  if (marketCode.startsWith('TOTAL_GOALS_O')) {
    const l = Number(marketCode.replace('TOTAL_GOALS_O', '')) / 10;
    return tot > l;
  }
  if (marketCode.startsWith('TOTAL_GOALS_U')) {
    const l = Number(marketCode.replace('TOTAL_GOALS_U', '')) / 10;
    return tot < l;
  }
  if (marketCode.startsWith('MULTI_GOALS_')) {
    const parts = marketCode.replace('MULTI_GOALS_', '').split('_').map(Number);
    if (parts.length === 2) return tot >= parts[0] && tot <= parts[1];
  }
  if (marketCode.startsWith('TEAM_MULTI_GOALS_HOME_')) {
    const parts = marketCode.replace('TEAM_MULTI_GOALS_HOME_', '').split('_').map(Number);
    if (parts.length === 2) return hg >= parts[0] && hg <= parts[1];
  }
  if (marketCode.startsWith('TEAM_MULTI_GOALS_AWAY_')) {
    const parts = marketCode.replace('TEAM_MULTI_GOALS_AWAY_', '').split('_').map(Number);
    if (parts.length === 2) return ag >= parts[0] && ag <= parts[1];
  }
  if (marketCode.startsWith('FH_MULTI_GOALS_')) {
    return null;
  }
  return null;
}

async function main() {
  console.log('1. Downloading football-data.co.uk (24/25, 25/26, 26/27) & OpenFootball 26/27...');
  const [fdMatches, ofData] = await Promise.all([fetchFdCsvMatches(), fetchOpenFootballFixtures()]);
  const allHist = [...fdMatches, ...ofData.allMatches];

  const memMap: Map<string, StoredMatch> = (matchesStore as any).inMemoryMatches;
  memMap.clear();
  for (const m of allHist) {
    memMap.set(m.provider_id, m);
  }
  (matchesStore as any).hydratedFromDb = true;
  (matchesStore as any).rebuildTeamCounts();

  console.log(`Loaded ${memMap.size} historical matches in memory (FD=${fdMatches.length}, OF=${ofData.allMatches.length}).`);

  console.log('\n2. Fetching ESPN Scoreboard & OpenFootball fixtures...');
  const espn28_29: Array<{ comp: string; raw: any; fixture: Fixture }> = [];
  await Promise.all(
    ESPN_SLUGS.map(async ({ comp, slug }) => {
      const [todayItems, tomItems, defItems] = await Promise.all([
        fetchEspnScoreboard(comp, slug, '20261128'),
        fetchEspnScoreboard(comp, slug, '20261129'),
        fetchEspnScoreboard(comp, slug),
      ]);
      for (const it of [...todayItems, ...tomItems, ...defItems]) {
        const ymd = it.fixture.kickoffTime.slice(0, 10);
        if (ymd === '2026-11-28' || ymd === '2026-11-29') {
          espn28_29.push({ comp, ...it });
        }
      }
    })
  );

  // Dedupe 28-29 fixtures by (comp, homeId, awayId) preferring ESPN over OpenFootball (since OF uses MD weekend placeholder date)
  const slateMap = new Map<string, Fixture>();
  for (const it of espn28_29) {
    const key = `${it.fixture.competition.code}:${it.fixture.homeTeam.id}:${it.fixture.awayTeam.id}`;
    slateMap.set(key, it.fixture);
  }
  for (const f of ofData.fixtures28_29) {
    const key = `${f.competition.code}:${f.homeTeam.id}:${f.awayTeam.id}`;
    if (!slateMap.has(key)) slateMap.set(key, f);
  }
  const slate28_29 = Array.from(slateMap.values()).sort((a, b) => a.kickoffTime.localeCompare(b.kickoffTime));

  console.log(`\n=== KICKOFF TIMES CHECK (ALL PL FIXTURES 2026-11-28..29) ===`);
  const seenEspnPl = new Set<string>();
  for (const it of espn28_29.filter(x => x.comp === 'PL')) {
    if (seenEspnPl.has(it.raw.id)) continue;
    seenEspnPl.add(it.raw.id);
    console.log({
      name: it.raw.name,
      rawEspnDate: it.raw.rawDate,
      isoUtc: it.fixture.kickoffTime,
      watAfricaLagos: formatMatchTime(it.fixture.kickoffTime, 'Africa/Lagos'),
    });
  }

  // Enrich with real up-to-date history
  const enrichedSlate = slate28_29.map(enrichFixtureInMemory);
  const canonicalInputs = enrichedSlate.map(fixture => {
    const stats = fixture.serverStats || getFixtureStatistics(fixture);
    const context = buildFixtureContextFromStats(fixture, stats);
    return { fixture, context, lockedWrittenExplanation: null };
  });
  const canonicalAfter = evaluateCanonicalFootballSlate(canonicalInputs, 0.40);
  const canonicalNoDiv = evaluateCanonicalFootballSlate(canonicalInputs, 1.00);

  console.log(`\n=== 2026-11-28 & 2026-11-29 SLATE SUMMARY (${enrichedSlate.length} unique fixtures) ===`);
  const leagueStats: Record<string, { total: number; abstainAfter: number; abstainBefore: number; gates: Record<string, number> }> = {};
  const gateCounts: Record<string, number> = {};

  for (let i = 0; i < enrichedSlate.length; i++) {
    const f = enrichedSlate[i];
    const canon = canonicalAfter[i];
    const preNoDiv = canonicalNoDiv[i];
    const stats = f.serverStats!;
    const diag = diagnoseCandidateGates(f);
    const comp = f.competition.code;
    if (!leagueStats[comp]) leagueStats[comp] = { total: 0, abstainAfter: 0, abstainBefore: 0, gates: {} };
    leagueStats[comp].total++;

    // Pre-recent-changes single-fixture eligibility (no multi_goals/goal_runs, no diversity cap, no generic 2pp drop -> only >=70% + validated + edge > 0 or unblocked)
    const oldPreTop = diag.ev.predictions.filter(
      p => p.marketCategory !== 'multi_goals' && p.marketCategory !== 'goal_runs' && p.isValidated && (p.calibratedProbability ?? p.modelProbability) >= 0.70 && !(p.optionType === 'asian_handicap' && (p.handicapLine ?? 0) >= 1.5)
    );
    if (oldPreTop.length === 0) leagueStats[comp].abstainBefore++;

    const expl = generateFootballExplanation({
      fixture: f,
      evaluation: canon.evaluation,
      context: canon.context,
      headlineSelectionReason: canon.evaluation.topPick?.headlineSelectionReason,
    });

    const isAbstained = !canon.evaluation.topPick;
    let effectiveReason = 'RECOMMENDED';
    if (isAbstained) {
      leagueStats[comp].abstainAfter++;
      if (diag.primaryDropGate !== 'NO_QUALIFIED_PICK' && diag.primaryDropGate !== 'RECOMMENDED') {
        effectiveReason = diag.primaryDropGate;
      } else if (canon.evaluation.noRecommendationReason?.toLowerCase().includes('diversity cap') || preNoDiv.evaluation.topPick) {
        effectiveReason = 'DIVERSITY_CAP';
      } else {
        // Check why all candidates in predictions failed (use v25 evaluated predictions directly too!)
        const preds = diag.ev.predictions;
        const clearingProb = preds.filter(p => (p.calibratedProbability ?? p.modelProbability) >= (p.multiGoalsMeta ? 0.60 : 0.70));
        const blockedByCal = clearingProb.filter(p => !p.isValidated);
        const blockedByLift = clearingProb.filter(p => p.isValidated && (p.isGenericPick || (p.edgeOverBaseline ?? 0) <= 0.010));
        const blockedBySpan = clearingProb.filter(p => p.multiGoalsMeta && (p.multiGoalsMeta.span >= 5 || (p.multiGoalsMeta.span === 4 && (p.calibratedProbability ?? p.modelProbability) <= 0.80)));
        if (blockedByLift.length > 0) effectiveReason = 'INSUFFICIENT_LIFT_OR_GENERIC';
        else if (blockedByCal.length > 0) effectiveReason = 'CALIBRATION_GATE';
        else if (blockedBySpan.length > 0) effectiveReason = 'TIGHTNESS_SPAN_FILTER';
        else effectiveReason = 'BELOW_CONFIDENCE_THRESHOLD';
      }
      gateCounts[effectiveReason] = (gateCounts[effectiveReason] || 0) + 1;
      leagueStats[comp].gates[effectiveReason] = (leagueStats[comp].gates[effectiveReason] || 0) + 1;

      console.log(
        `[ABSTAIN] ${f.kickoffTime.slice(0, 16)}Z (${formatMatchTime(f.kickoffTime, 'Africa/Lagos')} WAT) [${comp}] ${f.homeTeam.name} (${f.homeTeam.storedMatchCount}m, ${f.homeTeam.daysSinceLastMatch}d) vs ${f.awayTeam.name} (${f.awayTeam.storedMatchCount}m, ${f.awayTeam.daysSinceLastMatch}d) | gate=${effectiveReason} | preOld=${oldPreTop.length > 0 ? oldPreTop[0].marketCode : 'ABSTAIN'} | UI="${expl.oneLineSummary}"`
      );
    } else {
      console.log(
        `[PICK] ${f.kickoffTime.slice(0, 16)}Z [${comp}] ${f.homeTeam.name} (${f.homeTeam.storedMatchCount}m) vs ${f.awayTeam.name} (${f.awayTeam.storedMatchCount}m) => ${canon.evaluation.topPick?.marketCode} (${((canon.evaluation.topPick?.calibratedProbability ?? 0) * 100).toFixed(1)}%) | preOld=${oldPreTop.length > 0 ? oldPreTop[0].marketCode : 'ABSTAIN'}`
      );
    }

    if (/arsenal|brighton|sunderland|palace|hull|elche|fulham|everton/i.test(`${f.homeTeam.name} ${f.awayTeam.name}`)) {
      console.log(`  >>> DETAILED EVAL [${comp}] ${f.homeTeam.name} vs ${f.awayTeam.name}:`);
      console.log(`  >>> homeStored=${f.homeTeam.storedMatchCount} (${f.homeTeam.daysSinceLastMatch}d, 120d=${f.homeTeam.matchesInLast120Days}) | awayStored=${f.awayTeam.storedMatchCount} (${f.awayTeam.daysSinceLastMatch}d, 120d=${f.awayTeam.matchesInLast120Days})`);
      console.log(`  >>> homeXg=${stats.homeXg} awayXg=${stats.awayXg} insufficientData=${stats.insufficientData} evalTop=${canon.evaluation.topPick?.marketCode || 'NULL'} noDivTop=${preNoDiv.evaluation.topPick?.marketCode || 'NULL'}`);
      console.log(`  >>> evalReason=${canon.evaluation.noRecommendationReason}`);
      console.log(`  >>> TOP 12 EVALUATED V25 PREDICTIONS:`);
      for (const p of diag.ev.predictions.slice(0, 12)) {
        const prob = ((p.calibratedProbability ?? p.modelProbability) * 100).toFixed(1);
        const base = ((p.baselineProbability ?? 0) * 100).toFixed(1);
        const edge = ((p.edgeOverBaseline ?? 0) * 100).toFixed(1);
        console.log(`      - ${p.marketCode} (${p.selection}): cal=${prob}% base=${base}% edge=${edge}pp generic=${p.isGenericPick} valid=${p.isValidated} span=${p.multiGoalsMeta?.span ?? '-'} qual=${p.qualificationStatus}`);
      }
    }
  }

  console.log('\n=== COUNTS PER GATE (2026-11-28..29) ===', gateCounts);
  console.log('=== COUNTS PER LEAGUE (2026-11-28..29) ===', leagueStats);

  // Also simulate per_team_limit = 40 cap (matchesStore default) to verify exact 40 stored matches behavior
  console.log('\n=== CHECK PER_TEAM_LIMIT=40 SIMULATION ON PL FIXTURES ===');
  for (const f of slate28_29.filter(x => x.competition.code === 'PL')) {
    const teamMatchesHome = Array.from(memMap.values())
      .filter(m => m.kickoff_time < f.kickoffTime && (m.home_team_id === f.homeTeam.id || m.away_team_id === f.homeTeam.id))
      .sort((a, b) => b.kickoff_time.localeCompare(a.kickoff_time))
      .slice(0, 40);
    const teamMatchesAway = Array.from(memMap.values())
      .filter(m => m.kickoff_time < f.kickoffTime && (m.home_team_id === f.awayTeam.id || m.away_team_id === f.awayTeam.id))
      .sort((a, b) => b.kickoff_time.localeCompare(a.kickoff_time))
      .slice(0, 40);
    const hLast = teamMatchesHome[0]?.kickoff_date;
    const aLast = teamMatchesAway[0]?.kickoff_date;
    console.log(`PL 40-cap check: ${f.homeTeam.name} (${teamMatchesHome.length}m, last=${hLast}) vs ${f.awayTeam.name} (${teamMatchesAway.length}m, last=${aLast})`);
  }

  // Simulate 2026-11-07 sync cutoff + per_team_limit = 40
  console.log('\n=== REPRODUCTION OF 2026-11-07 SYNC CUTOFF + PER_TEAM_LIMIT=40 BOUNDARY ===');
  const origMatches = Array.from(memMap.values());
  memMap.clear();
  for (const m of origMatches) {
    if (m.kickoff_date <= '2026-11-07') {
      memMap.set(m.provider_id, m);
    }
  }
  (matchesStore as any).rebuildTeamCounts();
  const cutoffTargets = slate28_29.filter(f =>
    /arsenal.*manchester city|brighton.*newcastle|sunderland.*tottenham|crystal palace.*hull|elche.*atl/i.test(
      `${f.homeTeam.name} ${f.awayTeam.name}`
    )
  );
  for (const rawF of cutoffTargets) {
    const ef = enrichFixtureInMemory(rawF);
    const st = ef.serverStats!;
    const ctx = buildFixtureContextFromStats(ef, st);
    const ev = evaluateFixtureMarkets(ctx);
    const ex = generateFootballExplanation({ fixture: ef, evaluation: ev, context: ctx });
    console.log(
      `CUTOFF 2026-11-07: [${ef.competition.code}] ${ef.homeTeam.name} (${ef.homeTeam.storedMatchCount}m, last=${ef.homeTeam.lastMatchDate}, ${ef.homeTeam.daysSinceLastMatch}d) vs ${ef.awayTeam.name} (${ef.awayTeam.storedMatchCount}m, last=${ef.awayTeam.lastMatchDate}, ${ef.awayTeam.daysSinceLastMatch}d) | insufficient=${st.insufficientData} top=${ev.topPick?.marketCode || 'NULL'} | 1-liner="${ex.oneLineSummary}"`
    );
  }
  // Restore full memMap for 30-day sensitivity
  memMap.clear();
  for (const m of origMatches) memMap.set(m.provider_id, m);
  (matchesStore as any).rebuildTeamCounts();

  // Last 30 days (2026-10-29..2026-11-28) across finished matches
  console.log('\n=== LAST 30 DAYS (2026-10-29..2026-11-28) BEFORE vs AFTER & SENSITIVITY ===');
  const last30Matches = allHist
    .filter(m => m.kickoff_time >= '2026-10-29T00:00:00Z' && m.kickoff_time <= '2026-11-28T23:59:59Z')
    .sort((a, b) => a.kickoff_time.localeCompare(b.kickoff_time));

  const uniq30Map = new Map<string, StoredMatch>();
  for (const m of last30Matches) {
    const k = `${m.competition_code}:${m.kickoff_date}:${m.home_team_id}:${m.away_team_id}`;
    if (!uniq30Map.has(k) || m.source === 'football-data.co.uk') uniq30Map.set(k, m);
  }
  const uniq30 = Array.from(uniq30Map.values()).sort((a, b) => a.kickoff_time.localeCompare(b.kickoff_time));

  interface MatchEvalRecord {
    comp: string;
    date: string;
    hg: number;
    ag: number;
    fixture: Fixture;
    context: any;
    predictions: any[];
    insufficientData: boolean;
  }

  const evalRecords: MatchEvalRecord[] = [];
  for (const m of uniq30) {
    const cObj = getCanonicalCompetition(m.competition_code);
    if (!cObj) continue;
    const f: Fixture = {
      id: m.id,
      providerId: m.provider_id,
      providerName: 'Backtest',
      fetchTime: m.kickoff_time,
      source: m.source,
      competitionId: cObj.id,
      competition: cObj,
      seasonYear: m.season,
      homeTeam: { id: m.home_team_id, name: m.home_team_name, shortName: displayName(m.home_team_name), tla: 'HOM', crestUrl: '' },
      awayTeam: { id: m.away_team_id, name: m.away_team_name, shortName: displayName(m.away_team_name), tla: 'AWY', crestUrl: '' },
      kickoffTime: m.kickoff_time,
      matchday: 10,
      status: 'TIMED',
      homeScore: null,
      awayScore: null,
      referee: m.referee || undefined,
    };
    const ef = enrichFixtureInMemory(f);
    const st = ef.serverStats!;
    const ctx = buildFixtureContextFromStats(ef, st);
    const ev = evaluateFixtureMarkets(ctx);
    evalRecords.push({
      comp: m.competition_code,
      date: m.kickoff_date,
      hg: m.home_score ?? 0,
      ag: m.away_score ?? 0,
      fixture: ef,
      context: ctx,
      predictions: ev.predictions,
      insufficientData: Boolean(st.insufficientData),
    });
  }

  const byDay = new Map<string, MatchEvalRecord[]>();
  for (const rec of evalRecords) {
    if (!byDay.has(rec.date)) byDay.set(rec.date, []);
    byDay.get(rec.date)!.push(rec);
  }

  function simulatePolicy(opts: {
    stdThresh: number;
    mgThresh: number;
    minEdge: number;
    genericBlock: number;
    divCap: number;
    allowMg: boolean;
  }) {
    const perComp: Record<string, { n: number; picks: number; hits: number; evalHits: number; brierSum: number }> = {};
    for (const dayRecs of byDay.values()) {
      const slateItems: Array<{
        fixtureId: string;
        topPick: any;
        predictions: any[];
        rec: MatchEvalRecord;
      }> = [];

      for (const rec of dayRecs) {
        if (!perComp[rec.comp]) perComp[rec.comp] = { n: 0, picks: 0, hits: 0, evalHits: 0, brierSum: 0 };
        perComp[rec.comp].n++;
        if (rec.insufficientData) {
          slateItems.push({ fixtureId: rec.fixture.id, topPick: null, predictions: [], rec });
          continue;
        }
        const elig = rec.predictions
          .filter(p => {
            if (!p.isValidated || p.sanityTripwire || p.isSpeculative) return false;
            if (!opts.allowMg && (p.marketCategory === 'multi_goals' || p.marketCategory === 'goal_runs')) return false;
            if (p.optionType === 'asian_handicap' && (p.handicapLine ?? 0) >= 1.5) return false;
            if (p.optionType === 'bookings' && p.marketCode.includes('_U')) return false;
            const prob = p.calibratedProbability ?? p.modelProbability;
            const th = p.multiGoalsMeta ? opts.mgThresh : opts.stdThresh;
            if (prob < th) return false;
            if (p.multiGoalsMeta) {
              if (p.multiGoalsMeta.span >= 5) return false;
              if (p.multiGoalsMeta.span === 4 && prob <= 0.80) return false;
            }
            const edge = p.edgeOverBaseline ?? 0;
            if (Math.abs(edge) <= opts.genericBlock) return false;
            if (edge <= opts.minEdge) return false;
            return true;
          })
          .map(p => ({ ...p, rankingScore: p.rankingScore > 0 ? p.rankingScore : 100 }))
          .sort(compareFootballPicksByRank);

        slateItems.push({
          fixtureId: rec.fixture.id,
          topPick: elig[0] ? { ...elig[0], isTopPick: true } : null,
          predictions: elig,
          rec,
        });
      }

      // Apply diversity cap across active picks using iterative family swap/drop like selectDiversifiedSlatePicks
      if (opts.divCap < 1.0) {
        for (let iter = 0; iter < slateItems.length * 4 + 10; iter++) {
          const active = slateItems.filter(r => r.topPick !== null);
          if (active.length <= 1) break;
          const cap = Math.max(1, Math.floor(active.length * opts.divCap));
          const counts = new Map<string, number>();
          for (const r of active) {
            const fam = r.topPick.marketFamily || r.topPick.marketCategory || 'other';
            counts.set(fam, (counts.get(fam) || 0) + 1);
          }
          let overFam: string | null = null;
          let maxEx = 0;
          for (const [f, cnt] of counts.entries()) {
            if (cnt - cap > maxEx) {
              maxEx = cnt - cap;
              overFam = f;
            }
          }
          if (!overFam) break;
          const holders = active
            .filter(r => (r.topPick.marketFamily || r.topPick.marketCategory || 'other') === overFam)
            .sort((a, b) => (a.topPick.calibratedProbability ?? 0) - (b.topPick.calibratedProbability ?? 0));
          let swapped = false;
          for (const h of holders) {
            const alt = h.predictions.find(p => {
              if (p.marketCode === h.topPick.marketCode) return false;
              const f = p.marketFamily || p.marketCategory || 'other';
              return (counts.get(f) || 0) < cap;
            });
            if (alt) {
              h.topPick = { ...alt, isTopPick: true };
              swapped = true;
              break;
            }
          }
          if (!swapped) {
            holders[0].topPick = null;
          }
        }
      }

      for (const item of slateItems) {
        if (!item.topPick) continue;
        const c = perComp[item.rec.comp];
        c.picks++;
        const hit = didPredictionHit(item.topPick.marketCode, item.rec.hg, item.rec.ag);
        const prob = item.topPick.calibratedProbability ?? item.topPick.modelProbability;
        if (hit !== null) {
          c.evalHits++;
          if (hit) c.hits++;
          c.brierSum += (prob - (hit ? 1 : 0)) ** 2;
        }
      }
    }
    return perComp;
  }

  const resBefore = simulatePolicy({ stdThresh: 0.70, mgThresh: 0.60, minEdge: 0.0, genericBlock: 0.0, divCap: 1.0, allowMg: false });
  const resAfter = simulatePolicy({ stdThresh: 0.70, mgThresh: 0.60, minEdge: 0.010, genericBlock: 0.020, divCap: 0.40, allowMg: true });
  const resRelaxProb = simulatePolicy({ stdThresh: 0.66, mgThresh: 0.56, minEdge: 0.010, genericBlock: 0.020, divCap: 0.40, allowMg: true });
  const resRelaxLift = simulatePolicy({ stdThresh: 0.70, mgThresh: 0.60, minEdge: 0.005, genericBlock: 0.010, divCap: 0.40, allowMg: true });
  const resRelaxDiv55 = simulatePolicy({ stdThresh: 0.70, mgThresh: 0.60, minEdge: 0.010, genericBlock: 0.020, divCap: 0.55, allowMg: true });
  const resNoDivCap = simulatePolicy({ stdThresh: 0.70, mgThresh: 0.60, minEdge: 0.010, genericBlock: 0.020, divCap: 1.00, allowMg: true });
  const resCombo = simulatePolicy({ stdThresh: 0.66, mgThresh: 0.56, minEdge: 0.005, genericBlock: 0.010, divCap: 0.55, allowMg: true });

  const allComps = Object.keys(resAfter).sort();
  for (const comp of allComps) {
    const b = resBefore[comp];
    const a = resAfter[comp];
    const rp = resRelaxProb[comp];
    const rl = resRelaxLift[comp];
    const rd55 = resRelaxDiv55[comp];
    const nd = resNoDivCap[comp];
    const rc = resCombo[comp];
    const fmt = (r: { n: number; picks: number; hits: number; evalHits: number; brierSum: number }) => {
      const absPct = (((r.n - r.picks) / Math.max(1, r.n)) * 100).toFixed(1);
      const hitPct = r.evalHits > 0 ? ((r.hits / r.evalHits) * 100).toFixed(1) : '-';
      const brier = r.evalHits > 0 ? (r.brierSum / r.evalHits).toFixed(3) : '-';
      return `abs=${absPct}% (${r.n - r.picks}/${r.n}) hit=${hitPct}% (${r.hits}/${r.evalHits}) brier=${brier}`;
    };
    console.log(
      `[${comp}] n=${a.n}\n  BEFORE (no mg/div/2pp): ${fmt(b)}\n  AFTER  (prod rules)  : ${fmt(a)}\n  RELAX PROB (66%/56%) : ${fmt(rp)}\n  RELAX LIFT (1pp/0.5) : ${fmt(rl)}\n  RELAX DIV (55% cap)  : ${fmt(rd55)}\n  NO DIV CAP (100%)    : ${fmt(nd)}\n  COMBO TEST           : ${fmt(rc)}`
    );
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

