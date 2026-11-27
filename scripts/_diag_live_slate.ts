import { getFootballDataProvider } from '../src/lib/data/provider';
import { getFixtureStatistics, buildFixtureContextFromStats } from '../src/lib/data/seedData';
import { DixonColesV25Engine } from '../src/lib/prediction/v25/dixonColesV25';
import { FeatureLayerEngine } from '../src/lib/prediction/v25/featureLayer';
import { evaluateFixtureMarkets, selectDiversifiedSlatePicks } from '../src/lib/prediction/marketSelection';
import { checkMarketGating } from '../src/lib/prediction/marketGating';
import { getMarketBaseline } from '../src/lib/prediction/baselines';
import { getCalibratedParams, getLeagueCalibratedConfig, getLeagueCapabilities } from '../src/lib/prediction/calibratedParams';

async function main() {
  const provider = getFootballDataProvider();
  const res = await provider.getLiveFixtures();
  const active = res.fixtures.filter(f => f.status !== 'FINISHED' && f.status !== 'POSTPONED' && f.status !== 'CANCELED');
  const todayStr = '2026-11-27';
  const todayFixtures = active.filter(f => (f.kickoffTime || '').startsWith(todayStr));

  console.log(`=== LIVE SLATE SUMMARY ===`);
  console.log(`Active window fixtures: ${active.length} | Strictly today (${todayStr}): ${todayFixtures.length}`);

  const compsToday: Record<string, number> = {};
  todayFixtures.forEach(f => { compsToday[f.competition.code] = (compsToday[f.competition.code] || 0) + 1; });
  console.log(`Today leagues:`, compsToday);

  const compsActive: Record<string, number> = {};
  active.forEach(f => { compsActive[f.competition.code] = (compsActive[f.competition.code] || 0) + 1; });
  console.log(`Active window leagues:`, compsActive);

  // Counters across ACTIVE slate (143) and TODAY (3)
  interface MarketDiag {
    generated: number;
    blockedMissingData: number;
    blockedWalkForward: number;
    belowProbThreshold: number;
    blockedTightness: number;
    blockedGenericOrEdge: number;
    droppedByLadder: number;
    eligibleInPredictions: number;
    becameTopPickBeforeDiversity: number;
    droppedByDiversityCap: number;
    becameTopPickAfterDiversity: number;
    tierBreakdown: Record<string, number>;
    examples: Array<{
      date: string;
      match: string;
      comp: string;
      marketCode: string;
      rawProb: number;
      calProb: number;
      naiveBase: number;
      edge: number;
      tier: string;
      dropStage: string;
      dropDetail: string;
    }>;
  }

  const initDiag = (): MarketDiag => ({
    generated: 0,
    blockedMissingData: 0,
    blockedWalkForward: 0,
    belowProbThreshold: 0,
    blockedTightness: 0,
    blockedGenericOrEdge: 0,
    droppedByLadder: 0,
    eligibleInPredictions: 0,
    becameTopPickBeforeDiversity: 0,
    droppedByDiversityCap: 0,
    becameTopPickAfterDiversity: 0,
    tierBreakdown: {},
    examples: [],
  });

  const diag: Record<string, MarketDiag> = {
    dc12_today: initDiag(),
    dc12_all: initDiag(),
    btts_today: initDiag(),
    btts_all: initDiag(),
    tmg_today: initDiag(),
    tmg_all: initDiag(),
    corners_over_all: initDiag(),
    corners_over_today: initDiag(),
    corners_75_85_all: initDiag(),
    bookings_over_all: initDiag(),
    bookings_over_today: initDiag(),
  };

  const preDiversityEvals: Array<{
    fixtureId: string;
    fixture: typeof active[number];
    topPick: any;
    predictions: any[];
    noRecommendationReason?: string;
    evalResult: any;
  }> = [];

  const cornerTopDistAll: Record<string, number> = {};
  const cornerRankedDistAll: Record<string, number> = {};
  const corner7585Examples: any[] = [];

  for (const fixture of active) {
    const isToday = (fixture.kickoffTime || '').startsWith(todayStr);
    const stats = getFixtureStatistics(fixture);
    const context = buildFixtureContextFromStats(fixture, stats);
    const evalResult = evaluateFixtureMarkets(context);
    const matchName = `${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`;
    const comp = fixture.competition.code;
    const date = (fixture.kickoffTime || '').slice(0, 10);

    preDiversityEvals.push({
      fixtureId: fixture.id,
      fixture,
      topPick: evalResult.topPick,
      predictions: evalResult.predictions,
      noRecommendationReason: evalResult.noRecommendationReason,
      evalResult,
    });

    if (stats.insufficientData || !evalResult.contextEvaluation) {
      for (const k of ['dc12_all', 'btts_all', 'tmg_all', 'corners_over_all', 'bookings_over_all']) {
        diag[k].blockedMissingData++;
        if (isToday) diag[k.replace('_all', '_today')].blockedMissingData++;
      }
      continue;
    }

    const features = FeatureLayerEngine.computeFixtureFeatures(context);
    const calParams = getCalibratedParams();
    const rho = calParams.leagues?.[comp]?.goals?.dixonColesRho ?? -0.10;
    const rates = DixonColesV25Engine.computeCovariateRates(context.homeXg, context.awayXg, features);
    const matrix = DixonColesV25Engine.generateScorelineMatrix(rates.lambda, rates.mu, features, rho);
    const caps = getLeagueCapabilities(comp);

    // 1. Trace DC_12
    {
      const raw = matrix.doubleChance.homeOrAway;
      const cal = DixonColesV25Engine.calibratePrediction(raw, 'double_chance', undefined, features, 0);
      const base = getMarketBaseline('DC_12', comp, 0, stats).baseRate;
      const edge = cal.calibratedProb - base;
      const wf = checkMarketGating('double_chance', comp);
      const inRanked = evalResult.rankedOptions.find(p => p.marketCode === 'DC_12');
      const inPreds = evalResult.predictions.find(p => p.marketCode === 'DC_12');
      const isTop = evalResult.topPick?.marketCode === 'DC_12';

      let dropStage = 'PASSED';
      let dropDetail = inPreds ? `Eligible (${(cal.calibratedProb * 100).toFixed(1)}%)` : 'Not selected';
      if (!wf.isAllowed) {
        dropStage = 'walk_forward_gate';
        dropDetail = wf.statusText || 'Blocked by walk-forward CI gate';
      } else if (cal.calibratedProb < 0.70) {
        dropStage = 'prob_threshold';
        dropDetail = `Calibrated prob ${(cal.calibratedProb * 100).toFixed(1)}% < 70.0% minimum`;
      } else if (Math.abs(edge) <= 0.020) {
        dropStage = 'generic_pick_rule';
        dropDetail = `Too close to league baseline ${(base * 100).toFixed(1)}% (|edge|=${(Math.abs(edge) * 100).toFixed(1)}pp <= 2.0pp)`;
      } else if (edge <= 0.010) {
        dropStage = 'edge_rule';
        dropDetail = `Unpriced edge ${(edge * 100).toFixed(1)}pp <= +1.0pp`;
      } else if (!inPreds) {
        dropStage = 'not_in_predictions';
        dropDetail = 'Dropped in ranking';
      }

      const targets = isToday ? [diag.dc12_all, diag.dc12_today] : [diag.dc12_all];
      for (const d of targets) {
        d.generated++;
        if (dropStage === 'walk_forward_gate') d.blockedWalkForward++;
        else if (dropStage === 'prob_threshold') d.belowProbThreshold++;
        else if (dropStage === 'generic_pick_rule' || dropStage === 'edge_rule') d.blockedGenericOrEdge++;
        if (inPreds) d.eligibleInPredictions++;
        if (isTop) d.becameTopPickBeforeDiversity++;
        if (inRanked) d.tierBreakdown[inRanked.confidenceTier] = (d.tierBreakdown[inRanked.confidenceTier] || 0) + 1;
        d.examples.push({
          date, match: matchName, comp, marketCode: 'DC_12',
          rawProb: raw, calProb: cal.calibratedProb, naiveBase: base, edge,
          tier: inRanked?.confidenceTier || 'N/A', dropStage, dropDetail,
        });
      }
    }

    // 2. Trace BTTS_YES / BTTS_NO (take stronger side)
    {
      const calYes = DixonColesV25Engine.calibratePrediction(matrix.bttsYes, 'btts', undefined, features, 0);
      const calNo = DixonColesV25Engine.calibratePrediction(matrix.bttsNo, 'btts', undefined, features, 0);
      const pickYes = calYes.calibratedProb >= calNo.calibratedProb;
      const mc = pickYes ? 'BTTS_YES' : 'BTTS_NO';
      const raw = pickYes ? matrix.bttsYes : matrix.bttsNo;
      const calProb = pickYes ? calYes.calibratedProb : calNo.calibratedProb;
      const base = getMarketBaseline(mc, comp, 0, stats).baseRate;
      const edge = calProb - base;
      const wf = checkMarketGating('both_teams_to_score', comp);
      const inPreds = evalResult.predictions.find(p => p.marketCode === 'BTTS_YES' || p.marketCode === 'BTTS_NO');
      const isTop = evalResult.topPick?.marketCode === 'BTTS_YES' || evalResult.topPick?.marketCode === 'BTTS_NO';

      let dropStage = 'PASSED';
      let dropDetail = '';
      if (!wf.isAllowed) {
        dropStage = 'walk_forward_gate';
        dropDetail = wf.statusText || 'BTTS walk-forward BSS 95% CI includes <= 0';
      } else if (calProb < 0.70) {
        dropStage = 'prob_threshold';
        dropDetail = `${(calProb * 100).toFixed(1)}% < 70.0%`;
      } else if (Math.abs(edge) <= 0.020 || edge <= 0.010) {
        dropStage = 'generic_or_edge_rule';
        dropDetail = `edge ${(edge * 100).toFixed(1)}pp`;
      }
      if (wf.isAllowed && !inPreds && dropStage === 'PASSED') dropStage = 'other_gate';

      const targets = isToday ? [diag.btts_all, diag.btts_today] : [diag.btts_all];
      for (const d of targets) {
        d.generated++;
        if (dropStage === 'walk_forward_gate') d.blockedWalkForward++;
        else if (dropStage === 'prob_threshold') d.belowProbThreshold++;
        else if (dropStage === 'generic_or_edge_rule') d.blockedGenericOrEdge++;
        if (inPreds) d.eligibleInPredictions++;
        if (isTop) d.becameTopPickBeforeDiversity++;
        d.examples.push({
          date, match: matchName, comp, marketCode: mc,
          rawProb: raw, calProb, naiveBase: base, edge,
          tier: inPreds?.confidenceTier || 'BLOCKED', dropStage, dropDetail,
        });
      }
    }

    // 3. Trace Team Multi Goals (best of 8 HOME/AWAY ranges)
    {
      const elig = checkMarketGating('multi_goals', comp, 30, 'home');
      const homeKeys = ['0-1', '1-2', '1-3', '2-3'] as const;
      const awayKeys = ['0-1', '1-2', '1-3', '2-3'] as const;
      const allTmg: Array<{ mc: string; scope: 'home' | 'away'; raw: number; cal: number; base: number; span: number }> = [];
      for (const rk of homeKeys) {
        const mc = `TEAM_MULTI_GOALS_HOME_${rk.replace('-', '_')}`;
        const raw = matrix.multiGoals.home[rk];
        const cal = DixonColesV25Engine.calibrateMultiGoalsPrediction(raw, 'home', features, 0).calibratedProb;
        const base = getMarketBaseline(mc, comp, 0, stats).baseRate;
        const [a, b] = rk.split('-').map(Number);
        allTmg.push({ mc, scope: 'home', raw, cal, base, span: b - a + 1 });
      }
      for (const rk of awayKeys) {
        const mc = `TEAM_MULTI_GOALS_AWAY_${rk.replace('-', '_')}`;
        const raw = matrix.multiGoals.away[rk];
        const cal = DixonColesV25Engine.calibrateMultiGoalsPrediction(raw, 'away', features, 0).calibratedProb;
        const base = getMarketBaseline(mc, comp, 0, stats).baseRate;
        const [a, b] = rk.split('-').map(Number);
        allTmg.push({ mc, scope: 'away', raw, cal, base, span: b - a + 1 });
      }
      allTmg.sort((a, b) => (b.cal - b.base) - (a.cal - a.base));
      const best = allTmg[0];
      const passingPreLadder = allTmg.filter(x => {
        const e = x.cal - x.base;
        if (x.cal < 0.60) return false;
        if (x.span >= 4 && x.cal < 0.80) return false;
        if (Math.abs(e) <= 0.020 || e <= 0.010) return false;
        return true;
      });
      const allTmgPreds = evalResult.predictions.filter(p => p.marketCode.startsWith('TEAM_MULTI_GOALS_'));
      const eligibleTmgPreds = allTmgPreds.filter(p => p.rankingScore > 0);
      const fullMgEligible = evalResult.predictions.find(p => p.marketCode.startsWith('MULTI_GOALS_') && p.rankingScore > 0);
      const topRankedTmg = eligibleTmgPreds[0];
      const isTop = evalResult.topPick?.marketCode.startsWith('TEAM_MULTI_GOALS_');

      let dropStage = 'PASSED';
      let dropDetail = eligibleTmgPreds.length > 0
        ? `Eligible: ${eligibleTmgPreds.map(x => `${x.marketCode}(${((x.calibratedProbability ?? x.modelProbability)*100).toFixed(1)}%)`).join(', ')}`
        : '';
      if (!elig.isAllowed || elig.tierMode === 'SPECULATIVE_ONLY' || elig.tierMode === 'DISABLED') {
        dropStage = 'walk_forward_gate';
        dropDetail = elig.statusText;
      } else if (passingPreLadder.length === 0) {
        const maxCal = Math.max(...allTmg.map(x => x.cal));
        if (maxCal < 0.60) {
          dropStage = 'prob_threshold';
          dropDetail = `Best TMG ${best.mc} calProb ${(best.cal * 100).toFixed(1)}% < 60.0%`;
        } else {
          const bestHigh = allTmg.filter(x => x.cal >= 0.60).sort((a, b) => (b.cal - b.base) - (a.cal - a.base))[0];
          dropStage = 'generic_or_edge_rule';
          dropDetail = `${bestHigh.mc} (${(bestHigh.cal * 100).toFixed(1)}%) vs base ${(bestHigh.base * 100).toFixed(1)}% (edge ${((bestHigh.cal - bestHigh.base) * 100).toFixed(1)}pp)`;
        }
      } else if (eligibleTmgPreds.length === 0) {
        dropStage = 'ladder_collision';
        dropDetail = `Passing ${passingPreLadder[0].mc} (${(passingPreLadder[0].cal * 100).toFixed(1)}%) suppressed by ${fullMgEligible?.marketCode || 'other MG ladder winner'}`;
      }

      const targets = isToday ? [diag.tmg_all, diag.tmg_today] : [diag.tmg_all];
      for (const d of targets) {
        d.generated++;
        if (dropStage === 'walk_forward_gate') d.blockedWalkForward++;
        else if (dropStage === 'prob_threshold') d.belowProbThreshold++;
        else if (dropStage === 'generic_or_edge_rule') d.blockedGenericOrEdge++;
        else if (dropStage === 'ladder_collision') d.droppedByLadder++;
        if (eligibleTmgPreds.length > 0) d.eligibleInPredictions++;
        if (isTop) d.becameTopPickBeforeDiversity++;
        if (topRankedTmg) d.tierBreakdown[topRankedTmg.confidenceTier] = (d.tierBreakdown[topRankedTmg.confidenceTier] || 0) + 1;
        d.examples.push({
          date, match: matchName, comp,
          marketCode: topRankedTmg?.marketCode || passingPreLadder[0]?.mc || best.mc,
          rawProb: topRankedTmg?.rawModelProbability ?? (passingPreLadder[0] || best).raw,
          calProb: topRankedTmg ? (topRankedTmg.calibratedProbability ?? topRankedTmg.modelProbability) : (passingPreLadder[0] || best).cal,
          naiveBase: topRankedTmg?.baselineProbability ?? (passingPreLadder[0] || best).base,
          edge: topRankedTmg?.edgeOverBaseline ?? ((passingPreLadder[0] || best).cal - (passingPreLadder[0] || best).base),
          tier: topRankedTmg?.confidenceTier || elig.tierMode || 'UNKNOWN',
          dropStage, dropDetail,
        });
      }
    }

    // 4. Trace Corners Over [7.5, 8.5, 9.5, 10.5, 11.5]
    {
      if (!caps.hasCorners || !stats.leagueCapabilities?.hasCorners || stats.expectedCornersHome <= 0) {
        diag.corners_over_all.blockedMissingData++;
        if (isToday) diag.corners_over_today.blockedMissingData++;
      } else {
        const wf = checkMarketGating('corners', comp);
        const totalExpected = Math.max(0, (stats.expectedCornersHome + stats.expectedCornersAway) * features.weather.cornerMultiplier);
        const alpha = getLeagueCalibratedConfig(comp)?.corners?.overdispersionAlpha ?? 0.085;
        const cornerDist = DixonColesV25Engine.calculateCorners(stats.expectedCornersHome, stats.expectedCornersAway, features, alpha);
        const lines = [7.5, 8.5, 9.5, 10.5, 11.5];
        const perLine: Record<number, { rawOver: number; calOver: number; baseOver: number; edge: number }> = {};

        for (const l of lines) {
          const mc = `CORNERS_O${String(l).replace('.', '')}`;
          const pred = evalResult.predictions.find(p => p.marketCode === mc);
          const rawOver = pred?.rawModelProbability ?? cornerDist.overUnderLines[l]?.over ?? 0;
          const calOver = pred ? (pred.calibratedProbability ?? pred.modelProbability) : DixonColesV25Engine.calibratePrediction(rawOver, 'corners', undefined, features, 0).calibratedProb;
          const baseOver = pred?.baselineProbability ?? getMarketBaseline(mc, comp, l, stats).baseRate;
          perLine[l] = { rawOver, calOver, baseOver, edge: calOver - baseOver };
        }

        const cornerPreds = evalResult.predictions.filter(p => p.marketCode.startsWith('CORNERS_'));
        const rankedCorners = cornerPreds.filter(p => p.rankingScore > 0);
        const rankedCornersOver = cornerPreds.filter(p => p.marketCode.startsWith('CORNERS_O') && p.rankingScore > 0);
        for (const cp of rankedCorners) {
          cornerRankedDistAll[cp.marketCode] = (cornerRankedDistAll[cp.marketCode] || 0) + 1;
        }
        if (evalResult.topPick?.marketCode.startsWith('CORNERS_')) {
          cornerTopDistAll[evalResult.topPick.marketCode] = (cornerTopDistAll[evalResult.topPick.marketCode] || 0) + 1;
        }

        const o75 = perLine[7.5];
        const o85 = perLine[8.5];
        const o95 = perLine[9.5];
        const explainLineDrop = (l: number, label: string) => {
          const p = perLine[l];
          if (p.calOver < 0.70) return `${label}=${(p.calOver*100).toFixed(1)}% (<70%)`;
          if (Math.abs(p.edge) <= 0.020) return `${label}=${(p.calOver*100).toFixed(1)}% vs ${(p.baseOver*100).toFixed(1)}% (generic <=2pp)`;
          if (p.edge <= 0.010) return `${label}=${(p.calOver*100).toFixed(1)}% vs ${(p.baseOver*100).toFixed(1)}% (edge <=+1pp)`;
          return `${label}=${(p.calOver*100).toFixed(1)}% vs ${(p.baseOver*100).toFixed(1)}% (+${(p.edge*100).toFixed(1)}pp ELG)`;
        };

        let drop7585 = '';
        if (!wf.isAllowed) {
          drop7585 = `Walk-forward gate (${wf.statusText})`;
        } else {
          drop7585 = `${explainLineDrop(7.5, 'O7.5')} | ${explainLineDrop(8.5, 'O8.5')} | winner=${rankedCornersOver[0]?.marketCode || 'NONE'}`;
        }

        const highestOverCal70 = lines.slice().reverse().find(l => perLine[l].calOver >= 0.70) ?? 7.5;
        const bestInfo = perLine[highestOverCal70];
        const targets = isToday ? [diag.corners_over_all, diag.corners_over_today] : [diag.corners_over_all];
        for (const d of targets) {
          d.generated++;
          if (!wf.isAllowed) d.blockedWalkForward++;
          else if (rankedCornersOver.length > 0) d.eligibleInPredictions++;
          else if (o75.calOver < 0.70) d.belowProbThreshold++;
          else d.blockedGenericOrEdge++;
          if (evalResult.topPick?.marketCode.startsWith('CORNERS_O')) d.becameTopPickBeforeDiversity++;
          d.examples.push({
            date, match: matchName, comp,
            marketCode: `exp=${totalExpected.toFixed(2)} | ${rankedCornersOver[0]?.marketCode || `O${highestOverCal70}`}`,
            rawProb: bestInfo.rawOver, calProb: bestInfo.calOver, naiveBase: bestInfo.baseOver, edge: bestInfo.edge,
            tier: rankedCornersOver[0]?.confidenceTier || (wf.isAllowed ? 'DROPPED' : 'WF_BLOCKED'),
            dropStage: !wf.isAllowed ? 'walk_forward_gate' : (rankedCornersOver.length > 0 ? 'PASSED' : (o75.calOver < 0.70 ? 'prob_threshold' : 'generic_or_edge_rule')),
            dropDetail: drop7585,
          });
        }

        if (o75.calOver >= 0.70 || o85.calOver >= 0.70) {
          corner7585Examples.push({
            date, match: matchName, comp,
            expCorners: totalExpected,
            o75: (o75.calOver * 100).toFixed(1),
            base75: (o75.baseOver * 100).toFixed(1),
            o85: (o85.calOver * 100).toFixed(1),
            base85: (o85.baseOver * 100).toFixed(1),
            o95: (o95.calOver * 100).toFixed(1),
            wfAllowed: wf.isAllowed,
            emitted: rankedCorners.map(c => `${c.marketCode}(${((c.calibratedProbability ?? c.modelProbability)*100).toFixed(1)}%)`).join(',') || 'NONE',
            drop7585,
          });
        }
      }
    }

    // 5. Trace Bookings Over [2.5, 3.5, 4.5, 5.5]
    {
      if (!caps.hasCards || !stats.leagueCapabilities?.hasCards || features.discipline.expectedTotalBookings <= 0) {
        diag.bookings_over_all.blockedMissingData++;
        if (isToday) diag.bookings_over_today.blockedMissingData++;
      } else {
        const wf = checkMarketGating('bookings', comp);
        const cardDist = DixonColesV25Engine.calculateCards(features);
        const lines = [2.5, 3.5, 4.5, 5.5];
        const perLine: Record<number, { rawOver: number; calOver: number; baseOver: number; edge: number }> = {};
        for (const l of lines) {
          const rawOver = cardDist.overUnderLines[l]?.over ?? 0;
          const calOver = DixonColesV25Engine.calibratePrediction(rawOver, 'bookings', undefined, features, 0).calibratedProb;
          const mc = `CARDS_O${String(l).replace('.', '')}`;
          const baseOver = getMarketBaseline(mc, comp, l, stats).baseRate;
          perLine[l] = { rawOver, calOver, baseOver, edge: calOver - baseOver };
        }
        const cardPreds = evalResult.predictions.filter(p => p.marketCode.startsWith('CARDS_O'));
        const eligibleCards = cardPreds.filter(p => p.rankingScore > 0);
        const topIsCards = evalResult.topPick?.marketCode.startsWith('CARDS_O');
        const bestLine = lines.slice().reverse().find(l => perLine[l].calOver >= 0.70) ?? 2.5;
        const bestInfo = perLine[bestLine];

        let dropStage = 'PASSED';
        let dropDetail = '';
        if (!wf.isAllowed) {
          dropStage = 'walk_forward_gate';
          dropDetail = wf.statusText;
        } else if (perLine[2.5].calOver < 0.70) {
          dropStage = 'prob_threshold';
          dropDetail = `exp=${cardDist.expectedCards.toFixed(2)} | max line O2.5 cal=${(perLine[2.5].calOver*100).toFixed(1)}% < 70.0%`;
        } else if (eligibleCards.length === 0) {
          dropStage = 'generic_or_edge_rule';
          dropDetail = `exp=${cardDist.expectedCards.toFixed(2)} | O${bestLine} cal=${(bestInfo.calOver*100).toFixed(1)}% vs base ${(bestInfo.baseOver*100).toFixed(1)}% (edge ${(bestInfo.edge*100).toFixed(1)}pp)`;
        } else {
          dropDetail = `Eligible ${eligibleCards.map(c => `${c.marketCode}(${((c.calibratedProbability ?? c.modelProbability)*100).toFixed(1)}%)`).join(',')}`;
        }

        const targets = isToday ? [diag.bookings_over_all, diag.bookings_over_today] : [diag.bookings_over_all];
        for (const d of targets) {
          d.generated++;
          if (dropStage === 'walk_forward_gate') d.blockedWalkForward++;
          else if (dropStage === 'prob_threshold') d.belowProbThreshold++;
          else if (dropStage === 'generic_or_edge_rule') d.blockedGenericOrEdge++;
          if (eligibleCards.length > 0) d.eligibleInPredictions++;
          if (topIsCards) d.becameTopPickBeforeDiversity++;
          d.examples.push({
            date, match: matchName, comp,
            marketCode: `exp=${cardDist.expectedCards.toFixed(2)} | CARDS_O${String(bestLine).replace('.', '')}`,
            rawProb: bestInfo.rawOver, calProb: bestInfo.calOver, naiveBase: bestInfo.baseOver, edge: bestInfo.edge,
            tier: eligibleCards[0]?.confidenceTier || 'DROPPED',
            dropStage, dropDetail,
          });
        }
      }
    }
  }

  // Run post-diversity slate check
  const preCopy = preDiversityEvals.map(e => ({
    ...e,
    predictions: e.predictions.map(p => ({ ...p })),
    topPick: e.topPick ? { ...e.topPick } : null,
  }));
  const diversifiedAll = selectDiversifiedSlatePicks(preCopy, 0.40);
  const topPickFamilyDist: Record<string, number> = {};
  const topPickCodeDist: Record<string, number> = {};
  const diversitySwaps: Array<{ match: string; comp: string; before: string; after: string }> = [];
  for (let idx = 0; idx < diversifiedAll.length; idx++) {
    const beforeTop = preDiversityEvals[idx].topPick;
    const afterItem = diversifiedAll[idx];
    if (beforeTop?.marketCode !== afterItem.topPick?.marketCode) {
      diversitySwaps.push({
        match: `${afterItem.fixture.homeTeam.name} vs ${afterItem.fixture.awayTeam.name}`,
        comp: afterItem.fixture.competition.code,
        before: beforeTop ? `${beforeTop.marketCode}(${((beforeTop.calibratedProbability ?? beforeTop.modelProbability)*100).toFixed(1)}%)` : 'NONE',
        after: afterItem.topPick ? `${afterItem.topPick.marketCode}(${((afterItem.topPick.calibratedProbability ?? afterItem.topPick.modelProbability)*100).toFixed(1)}%)` : `NONE(${afterItem.noRecommendationReason || ''})`,
      });
    }
    if (!afterItem.topPick) continue;
    topPickFamilyDist[afterItem.topPick.optionType] = (topPickFamilyDist[afterItem.topPick.optionType] || 0) + 1;
    topPickCodeDist[afterItem.topPick.marketCode] = (topPickCodeDist[afterItem.topPick.marketCode] || 0) + 1;
    if (afterItem.topPick.marketCode === 'DC_12') diag.dc12_all.becameTopPickAfterDiversity++;
    if (afterItem.topPick.marketCode.startsWith('CORNERS_O')) diag.corners_over_all.becameTopPickAfterDiversity++;
    if (afterItem.topPick.marketCode.startsWith('TEAM_MULTI_GOALS_')) diag.tmg_all.becameTopPickAfterDiversity++;
    if (afterItem.topPick.marketCode.startsWith('CARDS_O')) diag.bookings_over_all.becameTopPickAfterDiversity++;
  }
  diag.dc12_all.droppedByDiversityCap = Math.max(0, diag.dc12_all.becameTopPickBeforeDiversity - diag.dc12_all.becameTopPickAfterDiversity);
  diag.corners_over_all.droppedByDiversityCap = Math.max(0, diag.corners_over_all.becameTopPickBeforeDiversity - diag.corners_over_all.becameTopPickAfterDiversity);
  diag.tmg_all.droppedByDiversityCap = Math.max(0, diag.tmg_all.becameTopPickBeforeDiversity - diag.tmg_all.becameTopPickAfterDiversity);
  diag.bookings_over_all.droppedByDiversityCap = Math.max(0, diag.bookings_over_all.becameTopPickBeforeDiversity - diag.bookings_over_all.becameTopPickAfterDiversity);

  console.log('\n=== TOP PICK DISTRIBUTION (ACTIVE SLATE 143 GAMES) ===');
  console.log('By optionType:', topPickFamilyDist);
  console.log('By marketCode:', topPickCodeDist);
  console.log('Corner predictions ranked anywhere:', cornerRankedDistAll);
  console.log('Corner topPicks (pre-div):', cornerTopDistAll);
  console.log(`Diversity swaps (${diversitySwaps.length}):`, diversitySwaps.slice(0, 15));

  for (const [k, d] of Object.entries(diag)) {
    if (k === 'corners_75_85_all') continue;
    console.log(`\n--- ${k} ---`);
    console.log({
      generated: d.generated,
      blockedMissingData: d.blockedMissingData,
      blockedWalkForward: d.blockedWalkForward,
      belowProbThreshold: d.belowProbThreshold,
      blockedGenericOrEdge: d.blockedGenericOrEdge,
      droppedByLadder: d.droppedByLadder,
      eligibleInPredictions: d.eligibleInPredictions,
      becameTopPickBeforeDiversity: d.becameTopPickBeforeDiversity,
      droppedByDiversityCap: d.droppedByDiversityCap,
      becameTopPickAfterDiversity: d.becameTopPickAfterDiversity,
      tierBreakdown: d.tierBreakdown,
    });
    console.log('Sample examples (up to 6):');
    const droppedFirst = [...d.examples.filter(e => e.dropStage !== 'PASSED'), ...d.examples.filter(e => e.dropStage === 'PASSED')];
    for (const ex of droppedFirst.slice(0, 6)) {
      console.log(`  [${ex.date} ${ex.comp}] ${ex.match} | ${ex.marketCode} | raw=${(ex.rawProb*100).toFixed(1)}% cal=${(ex.calProb*100).toFixed(1)}% base=${(ex.naiveBase*100).toFixed(1)}% edge=${(ex.edge*100).toFixed(1)}pp | ${ex.dropStage}: ${ex.dropDetail}`);
    }
  }

  console.log(`\n=== CORNERS O7.5 / O8.5 >= 70% CANDIDATES (${corner7585Examples.length} games) ===`);
  for (const ex of corner7585Examples.slice(0, 18)) {
    console.log(`  [${ex.date} ${ex.comp}] ${ex.match} exp=${ex.expCorners.toFixed(2)} | O7.5=${ex.o75}%(base ${ex.base75}%) O8.5=${ex.o85}%(base ${ex.base85}%) O9.5=${ex.o95}% | wf=${ex.wfAllowed} | ranked=${ex.emitted} | ${ex.drop7585}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
