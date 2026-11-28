import fs from 'node:fs';
import path from 'node:path';
import { matchesStore, StoredMatch } from '../src/lib/data/matchesStore';
import { lookupCanonicalTeam, resolveFixtureTeamCanonical } from '../src/lib/data/canonicalTeams';
import { parseLondonCsvDateTime, parseBrazilCsvDate } from '../src/lib/data/backfillCatalog';
import { getCanonicalCompetition } from '../src/lib/data/canonicalCompetitions';
import { getFixtureStatistics, buildFixtureContextFromStats } from '../src/lib/data/seedData';
import { evaluateFixtureMarkets, selectDiversifiedSlatePicks, getMarketFamily } from '../src/lib/prediction/marketSelection';
import { checkMarketGating } from '../src/lib/prediction/marketGating';
import { DixonColesV25Evaluator, getConfidenceThresholdForOption } from '../src/lib/prediction/v25/v25Evaluator';
import { isDisabledRecommendationMarket } from '../src/lib/markets';
import type { Fixture, MarketPrediction, VerifiedMatchOdds } from '../src/types';

function americanToDecimalOdds(ml: any): number | undefined {
  const n = typeof ml === 'number' ? ml : parseFloat(String(ml ?? ''));
  if (!Number.isFinite(n) || n === 0) return undefined;
  if (n > 0) return Number((1 + n / 100).toFixed(3));
  return Number((1 + 100 / Math.abs(n)).toFixed(3));
}

function parseCsvLine(line: string): string[] {
  const res: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ',' && !inQ) { res.push(cur); cur = ''; continue; }
    cur += ch;
  }
  res.push(cur);
  return res;
}

function loadCsvCache() {
  const dir = '/tmp/fdco_cache';
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.csv')).sort();
  let count = 0;
  for (const file of files) {
    const txt = fs.readFileSync(path.join(dir, file), 'utf8').trim();
    if (!txt) continue;
    const lines = txt.split(/\r?\n/);
    if (lines.length < 2) continue;
    const hdr = parseCsvLine(lines[0]);
    const idx = (name: string) => hdr.indexOf(name);
    const isExtra = file.startsWith('extra_');
    const compGuess = isExtra ? file.replace('extra_', '').replace('.csv', '') : (file.replace('.csv', '').split('_')[1] || file.replace('.csv', ''));
    const seasonGuess = isExtra ? '202627' : (file.includes('_') ? file.split('_')[0] : '202627');
    const compCodeMap: Record<string, string> = { E0: 'PL', E1: 'ELC', D1: 'BL1', D2: 'D2', F1: 'FL1', F2: 'F2', I1: 'SA', I2: 'I2', SP1: 'PD', SP2: 'SP2', N1: 'DED', P1: 'PPL', T1: 'TSL', SC0: 'SC0', SC1: 'SC1', SC2: 'SC2', SC3: 'SC3', B1: 'B1', G1: 'G1', E2: 'E2', E3: 'E3', EC: 'EC' };
    const compCode = compCodeMap[compGuess] || compGuess;

    for (let i = 1; i < lines.length; i++) {
      const row = parseCsvLine(lines[i]);
      if (row.length < 5) continue;
      const rawHome = row[idx('HomeTeam')] || row[idx('Home')] || '';
      const rawAway = row[idx('AwayTeam')] || row[idx('Away')] || '';
      const rawDate = row[idx('Date')] || '';
      const rawTime = row[idx('Time')] || '';
      const rawFthg = row[idx('FTHG')] || row[idx('HG')] || '';
      const rawFtag = row[idx('FTAG')] || row[idx('AG')] || '';
      if (!rawHome || !rawAway || !rawDate || rawFthg === '' || rawFtag === '') continue;
      const hg = parseInt(rawFthg, 10);
      const ag = parseInt(rawFtag, 10);
      if (!Number.isFinite(hg) || !Number.isFinite(ag)) continue;

      let kickoffIso = '';
      if (isExtra) kickoffIso = parseBrazilCsvDate(rawDate, rawTime) || '';
      else kickoffIso = parseLondonCsvDateTime(rawDate, rawTime) || '';
      if (!kickoffIso) continue;

      const hCan = lookupCanonicalTeam(rawHome, compCode) || { canonicalId: `team_${rawHome.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`, canonicalName: rawHome };
      const aCan = lookupCanonicalTeam(rawAway, compCode) || { canonicalId: `team_${rawAway.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`, canonicalName: rawAway };
      const pid = `diag:${compCode}:${kickoffIso.slice(0, 10)}:${hCan.canonicalId}:${aCan.canonicalId}`;
      const numOrNull = (col: string) => { const j = idx(col); if (j < 0) return null; const n = parseFloat(row[j]); return Number.isFinite(n) ? n : null; };
      const sm: StoredMatch = {
        id: pid, provider_id: pid, competition_code: compCode,
        season: isExtra ? (row[idx('Season')] || seasonGuess) : seasonGuess,
        matchday: null,
        home_team_id: hCan.canonicalId, away_team_id: aCan.canonicalId,
        home_team_name: hCan.canonicalName, away_team_name: aCan.canonicalName,
        kickoff_time: kickoffIso, kickoff_date: kickoffIso.slice(0, 10), status: 'FINISHED',
        home_score: hg, away_score: ag,
        home_half_time_score: numOrNull('HTHG'), away_half_time_score: numOrNull('HTAG'),
        home_corners: numOrNull('HC'), away_corners: numOrNull('AC'),
        home_yellow_cards: numOrNull('HY'), away_yellow_cards: numOrNull('AY'),
        home_red_cards: numOrNull('HR'), away_red_cards: numOrNull('AR'),
        home_shots: numOrNull('HS'), away_shots: numOrNull('AS'),
        home_shots_on_target: numOrNull('HST'), away_shots_on_target: numOrNull('AST'),
        referee: (idx('Referee') >= 0 && row[idx('Referee')]) ? row[idx('Referee')].trim() : null,
        result: hg > ag ? 'H' : hg === ag ? 'D' : 'A',
        source: 'fdco_cache',
      };
      (matchesStore as any).inMemoryMatches.set(pid, sm);
      count++;
    }
  }
  (matchesStore as any).rebuildTeamCounts();
  return count;
}

function loadLiveEspnFixtures(): Fixture[] {
  const dir = '/tmp/fdco_cache';
  const files = fs.readdirSync(dir).filter(f => f.startsWith('espn_') && f.endsWith('.json')).sort();
  const out: Fixture[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    const parts = file.replace('.json', '').split('_');
    const compCode = parts[1];
    const comp = getCanonicalCompetition(compCode);
    if (!comp) continue;
    const j = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    for (const ev of (j.events || [])) {
      const id = `fix_espn_${ev.id}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const compData = ev.competitions?.[0];
      if (!compData) continue;
      const h = compData.competitors?.find((c: any) => c.homeAway === 'home');
      const a = compData.competitors?.find((c: any) => c.homeAway === 'away');
      if (!h || !a) continue;
      const st = ev.status?.type;
      if (st?.completed || st?.state === 'post' || st?.name === 'STATUS_FINAL' || st?.name === 'STATUS_POSTPONED' || st?.name === 'STATUS_CANCELED') continue;
      const hCan = resolveFixtureTeamCanonical({ provider: 'espn', providerTeamId: String(h.team?.id ?? ''), displayName: h.team?.displayName, name: h.team?.name, shortName: h.team?.shortDisplayName, competitionCode: comp.code });
      const aCan = resolveFixtureTeamCanonical({ provider: 'espn', providerTeamId: String(a.team?.id ?? ''), displayName: a.team?.displayName, name: a.team?.name, shortName: a.team?.shortDisplayName, competitionCode: comp.code });
      let verifiedOdds: VerifiedMatchOdds | undefined;
      const o = compData.odds?.[0];
      if (o) {
        const hw = americanToDecimalOdds(o.moneyline?.home?.close?.odds ?? o.moneyline?.home?.open?.odds ?? o.homeTeamOdds?.moneyLine);
        const aw = americanToDecimalOdds(o.moneyline?.away?.close?.odds ?? o.moneyline?.away?.open?.odds ?? o.awayTeamOdds?.moneyLine);
        const dr = americanToDecimalOdds(o.drawOdds?.moneyLine ?? o.moneyline?.draw?.close?.odds ?? o.moneyline?.draw?.open?.odds);
        let o25: number | undefined;
        let u25: number | undefined;
        const tl = parseFloat(String(o.overUnder ?? o.total?.displayName));
        if (tl === 2.5) {
          o25 = americanToDecimalOdds(o.total?.over?.close?.odds ?? o.total?.over?.open?.odds);
          u25 = americanToDecimalOdds(o.total?.under?.close?.odds ?? o.total?.under?.open?.odds);
        } else if (o.total?.over?.open?.line === 'o2.5') {
          o25 = americanToDecimalOdds(o.total?.over?.open?.odds);
          u25 = americanToDecimalOdds(o.total?.under?.open?.odds);
        }
        if (hw || aw || dr || o25 || u25) {
          verifiedOdds = { homeWin: hw, draw: dr, awayWin: aw, over25Goals: o25, under25Goals: u25 };
        }
      }
      out.push({
        id, providerId: String(ev.id), providerName: 'ESPN', fetchTime: '2026-11-28T00:00:00Z',
        source: 'provider:espn', competitionId: comp.id, competition: comp, seasonYear: '2026/2027',
        homeTeam: { id: hCan?.canonicalId || `team_${h.team?.id}`, name: h.team?.displayName || h.team?.name || 'Home', shortName: hCan?.shortName || h.team?.shortDisplayName || '', tla: hCan?.tla || 'HOM', crestUrl: '', providerTeamId: String(h.team?.id ?? '') },
        awayTeam: { id: aCan?.canonicalId || `team_${a.team?.id}`, name: a.team?.displayName || a.team?.name || 'Away', shortName: aCan?.shortName || a.team?.shortDisplayName || '', tla: aCan?.tla || 'AWY', crestUrl: '', providerTeamId: String(a.team?.id ?? '') },
        kickoffTime: ev.date, matchday: 1, status: 'TIMED', homeScore: null, awayScore: null, venue: '', dataFreshness: '2026-11-28T00:00:00Z', verifiedOdds,
      });
    }
  }
  return out;
}

function capStorePerTeam(limit: number) {
  const all = Array.from((matchesStore as any).inMemoryMatches.values()) as StoredMatch[];
  all.sort((a, b) => b.kickoff_time.localeCompare(a.kickoff_time));
  const byTeam = new Map<string, number>();
  const kept = new Map<string, StoredMatch>();
  // In RPC: lateral per-team limit 40 UNION DISTINCT
  const teamIds = new Set<string>();
  for (const m of all) {
    teamIds.add(m.home_team_id);
    teamIds.add(m.away_team_id);
  }
  const perTeamLists = new Map<string, number>();
  for (const m of all) {
    const hc = perTeamLists.get(m.home_team_id) || 0;
    const ac = perTeamLists.get(m.away_team_id) || 0;
    if (hc < limit || ac < limit) {
      kept.set(m.provider_id || m.id, m);
    }
    perTeamLists.set(m.home_team_id, hc + 1);
    perTeamLists.set(m.away_team_id, ac + 1);
  }
  (matchesStore as any).inMemoryMatches = kept;
  (matchesStore as any).rebuildTeamCounts();
}

function classifyGateDrop(p: MarketPrediction): string {
  if (isDisabledRecommendationMarket(p)) return 'disabled_market';
  if (p.isSpeculative) {
    return (p.optionType === 'goal_runs' || p.marketCategory === 'goal_runs') ? 'experimental_goal_runs' : 'speculative_league_tier';
  }
  if (!p.isValidated) return 'calibration_wf_gate';
  if (p.sanityTripwire) return 'sanity_tripwire';
  if (p.qualificationStatus === 'NO_RECOMMENDATION' || p.qualificationStatus === 'UNQUALIFIED_HIGH_UNCERTAINTY') return 'uncertainty_or_missing';
  if (p.optionType === 'asian_handicap' && (p.handicapLine ?? 0) >= 1.5) return 'ah_cushion_15';
  const prob = p.calibratedProbability ?? p.modelProbability;
  const thresh = getConfidenceThresholdForOption(p.optionType);
  if (prob < thresh) return 'probability_threshold';
  if (p.multiGoalsMeta) {
    if (p.multiGoalsMeta.span >= 5) return 'multi_goals_tightness';
    if (p.multiGoalsMeta.span === 4 && prob <= 0.80) return 'multi_goals_tightness';
  }
  if (p.marketOdds && p.marketOdds > 1.0) {
    if ((p.expectedValue ?? 0) <= 0 || (p.skillVsDeviggedMarket ?? 0) <= 0) return 'odds_ev_or_skill';
  }
  if (p.isGenericPick || (p.edgeOverBaseline ?? 0) <= 0.010) return 'lift_rule';
  return 'PASSED';
}

function stripRecentChanges(preds: MarketPrediction[]): MarketPrediction[] {
  return preds.filter(p =>
    p.optionType !== 'multi_goals' &&
    p.optionType !== 'team_multi_goals' &&
    p.optionType !== 'first_half_multi_goals' &&
    p.optionType !== 'goal_runs' &&
    p.marketCategory !== 'multi_goals' &&
    p.marketCategory !== 'goal_runs'
  );
}

async function main() {
  const loaded = loadCsvCache();
  console.log('Loaded CSV matches:', loaded);
  const fixturesAll = loadLiveEspnFixtures();
  const fixtures = fixturesAll.filter(f => f.kickoffTime.startsWith('2026-11-28') || f.kickoffTime.startsWith('2026-11-29'));
  console.log('Target 2026-11-28 + 2026-11-29 fixtures:', fixtures.length);

  // Also test 40-match cap!
  capStorePerTeam(40);
  console.log('After per_team_limit=40 kept matches:', (matchesStore as any).inMemoryMatches.size);

  const plTargetNames = ['Arsenal', 'Brighton', 'Sunderland', 'Crystal Palace', 'Atlético', 'Elche'];

  const evalsAfter: any[] = [];
  const evalsBeforePreDiv: any[] = [];

  for (const f of fixtures) {
    const stats = getFixtureStatistics(f);
    const ctx = buildFixtureContextFromStats(f, stats);
    const ev = evaluateFixtureMarkets(ctx);
    const oldPreds = stripRecentChanges(ev.predictions);
    const oldTop = oldPreds.find(p => (p.rankingScore ?? 0) > 0 && !isDisabledRecommendationMarket(p) && p.isValidated && !p.isSpeculative && !p.sanityTripwire) || null;
    evalsAfter.push({ fixtureId: f.id, fixture: f, stats, ctx, topPick: ev.topPick, predictions: ev.predictions, noRecommendationReason: ev.noRecommendationReason });
    evalsBeforePreDiv.push({ fixtureId: f.id, fixture: f, stats, ctx, topPick: oldTop, predictions: oldPreds, noRecommendationReason: ev.noRecommendationReason });
  }

  const divAfter = selectDiversifiedSlatePicks(evalsAfter.map(x => ({ ...x, predictions: x.predictions.map((p: any) => ({ ...p })), topPick: x.topPick ? { ...x.topPick } : null })), 0.40);

  console.log('\n=== CHECK PL + ELCHE FIXTURES (WITH 40-CAP & LIVE ODDS) ===');
  for (let i = 0; i < fixtures.length; i++) {
    const f = fixtures[i];
    const name = `${f.homeTeam.name} vs ${f.awayTeam.name}`;
    if (f.competition.code === 'PL' || /Elche|Atl/i.test(name)) {
      const a = divAfter[i];
      const orig = evalsAfter[i];
      const topCands = orig.predictions.slice(0, 8).map((p: MarketPrediction) => `${p.marketCode}:${((p.calibratedProbability ?? p.modelProbability)*100).toFixed(1)}%(base=${((p.baselineProbability ?? 0)*100).toFixed(1)}%,odds=${p.marketOdds ?? '-'},ev=${p.expectedValue ?? '-'},drop=${classifyGateDrop(p)})`);
      console.log(`[${f.competition.code}] ${name} | kickoff=${f.kickoffTime} | stored=${orig.stats.homeSampleMatches}H/${orig.stats.awaySampleMatches}A | insuff=${orig.stats.insufficientData} | topBefore=${orig.topPick?.marketCode || 'NONE'} | topAfter=${a.topPick?.marketCode || 'NONE'} | reason=${a.noRecommendationReason || '-'}`);
      console.log(`   top8: ${topCands.join(' | ')}`);
    }
  }

  // Gate summary across all 2026-11-28..29 fixtures
  const gateCountsByLeague: Record<string, Record<string, number>> = {};
  const abstainingFixtures: any[] = [];
  for (let i = 0; i < fixtures.length; i++) {
    const f = fixtures[i];
    const a = divAfter[i];
    const orig = evalsAfter[i];
    const before = evalsBeforePreDiv[i];
    const comp = f.competition.code;
    if (!gateCountsByLeague[comp]) gateCountsByLeague[comp] = { total: 0, absBefore: 0, absAfter: 0 };
    gateCountsByLeague[comp].total++;
    if (!before.topPick) gateCountsByLeague[comp].absBefore++;
    if (!a.topPick) {
      gateCountsByLeague[comp].absAfter++;
      let reasonCat = 'no_candidate_cleared';
      if (orig.stats.homeSampleMatches === 0 || orig.stats.awaySampleMatches === 0) reasonCat = 'zero_history';
      else if (orig.stats.insufficientData) reasonCat = 'stale_data_over_21d';
      else if (orig.topPick && !a.topPick) reasonCat = 'diversity_cap';
      const candDrops: Record<string, number> = {};
      for (const p of orig.predictions) {
        const d = classifyGateDrop(p);
        candDrops[d] = (candDrops[d] || 0) + 1;
      }
      gateCountsByLeague[comp][reasonCat] = (gateCountsByLeague[comp][reasonCat] || 0) + 1;
      abstainingFixtures.push({ comp, name: `${f.homeTeam.name} vs ${f.awayTeam.name}`, stored: `${orig.stats.homeSampleMatches}H/${orig.stats.awaySampleMatches}A`, reasonCat, reason: a.noRecommendationReason, candDrops });
    }
  }
  console.log('\n=== 2-DAY GATE COUNTS BY LEAGUE ===');
  for (const [c, v] of Object.entries(gateCountsByLeague).sort()) {
    console.log(c, JSON.stringify(v));
  }
  console.log('\nTotal abstaining on 2026-11-28..29:', abstainingFixtures.length);
  for (const x of abstainingFixtures.slice(0, 25)) {
    console.log(' ABS:', x.comp, x.name, x.stored, x.reasonCat, JSON.stringify(x.candDrops));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
