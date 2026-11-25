// Walk-Forward Backtest & Causal Calibration Runner for Basketball (NBA, NCAAB, EuroLeague)
// Usage: npx tsx scripts/run_basketball_backtest.ts

import fs from 'node:fs';
import path from 'node:path';
import { supabase } from '../src/lib/supabase/client';
import { fetchAllRows } from '../src/lib/supabase/pagination';
import { BasketballLeague } from '../src/lib/basketball/markets';
import { StoredBbGame } from '../src/lib/basketball/store';
import {
  runLeagueWalkForwardBacktest,
  CalibratedBasketballParamsFile,
} from '../src/lib/basketball/calibration';

function parseQuarterScores(raw: any) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw;
}

async function main() {
  console.log('=== CALIBRALL: BASKETBALL WALK-FORWARD BACKTEST ===');

  const leagues: BasketballLeague[] = ['NBA', 'NCAAB', 'EUROLEAGUE'];
  const summaryByLeague = {} as CalibratedBasketballParamsFile['leagues'];

  for (const league of leagues) {
    const t0 = Date.now();
    const { data, error } = await fetchAllRows<any>((from, to) =>
      supabase
        .from('bb_games')
        .select('id, league, season, game_date, kickoff_utc, home_id, away_id, neutral, status, home_pts, away_pts, h1_home, h1_away, ot_periods, q_scores, source')
        .eq('league', league)
        .eq('status', 'FINISHED')
        .order('game_date', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
    );

    if (error) {
      throw new Error(`Failed reading ${league} bb_games: ${error.message}`);
    }

    const games: StoredBbGame[] = (data || []).map((r) => ({
      id: r.id,
      league: r.league as BasketballLeague,
      season: r.season,
      game_date: String(r.game_date).slice(0, 10),
      kickoff_utc: r.kickoff_utc || null,
      home_id: r.home_id,
      away_id: r.away_id,
      neutral: Boolean(r.neutral),
      status: r.status,
      home_pts: r.home_pts !== null && r.home_pts !== undefined ? Number(r.home_pts) : null,
      away_pts: r.away_pts !== null && r.away_pts !== undefined ? Number(r.away_pts) : null,
      h1_home: r.h1_home !== null && r.h1_home !== undefined ? Number(r.h1_home) : null,
      h1_away: r.h1_away !== null && r.h1_away !== undefined ? Number(r.h1_away) : null,
      ot_periods: Number(r.ot_periods) || 0,
      q_scores: parseQuarterScores(r.q_scores),
      source: r.source,
    }));

    const summary = runLeagueWalkForwardBacktest(league, games);
    summaryByLeague[league] = summary;

    console.log(
      `\n[${league}] Finished games=${summary.totalGamesAnalyzed}, Evaluated=${summary.evaluatedGames}, Abstained(NeedsHistory)=${summary.abstainedNeedsHistoryGames}, H1Eval=${summary.h1EvaluatedGames} (${Date.now() - t0}ms)`
    );
    console.log(
      `  Empirical stats: regTeamMean=${summary.empiricalLeagueStats.regTeamMean}, homeAdv=${summary.empiricalLeagueStats.homeAdv}, regVarH=${summary.empiricalLeagueStats.regVarH}, regCovHA=${summary.empiricalLeagueStats.regCovHA}, otMeanTotal=${summary.empiricalLeagueStats.otMeanTotal}, h1Share=${summary.empiricalLeagueStats.h1Share}, h1CovHA=${summary.empiricalLeagueStats.h1CovHA}`
    );
    console.table(
      summary.families.map((f) => ({
        family: f.marketCategory,
        N: f.sampleSize,
        calType: f.calibratorType,
        calBrier: f.calibratedBrier,
        baseBrier: f.baselineBrier,
        dBrier: f.brierDiffVsBaseline,
        calLL: f.calibratedLogLoss,
        baseLL: f.baselineLogLoss,
        dLL: f.logLossDiffVsBaseline,
        ECE: f.ece,
        hitAt60: f.hitRateAt60 !== null ? `${(f.hitRateAt60 * 100).toFixed(1)}% (${f.sampleAt60})` : 'n/a',
        status: f.passedBaseline ? 'PASS' : 'FAIL (Speculative)',
      }))
    );
  }

  const outFile: CalibratedBasketballParamsFile = {
    generatedAt: new Date().toISOString(),
    modelVersion: 'bb_totals_v1.0',
    totalsOnly: true,
    leagues: summaryByLeague,
  };

  const outPath = path.join(process.cwd(), 'src', 'lib', 'basketball', 'calibratedParams.json');
  fs.writeFileSync(outPath, JSON.stringify(outFile, null, 2), 'utf8');
  console.log(`\nSaved calibrated parameters & walk-forward tables to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
