import { NextResponse } from 'next/server';
import { marketMonitor } from '@/lib/prediction/marketMonitor';
import { FAMILY_VALIDATION_REGISTRY } from '@/lib/prediction/marketGating';
import { generateMissAnalysisReport, SettledPredictionRecord } from '@/lib/prediction/missAnalysis';
import { getTeamStyle } from '@/lib/prediction/situationalContext';
import { REAL_250_MATCHES } from '@/lib/data/realMatchArchive';

export async function GET() {
  const report = marketMonitor.getReport(100, 0.40);

  // Generate real match settled records for miss clustering
  const settledRecords: SettledPredictionRecord[] = REAL_250_MATCHES.slice(0, 100).map(m => {
    const isOver25Hit = (m.actual.homeGoals + m.actual.awayGoals) > 2.5;
    const isHomeWinHit = m.actual.homeGoals > m.actual.awayGoals;
    const outcome = isOver25Hit ? 'WON' : 'LOST';

    return {
      prediction: {
        id: `pred_${m.id}_O25`,
        fixtureId: m.id,
        marketCode: 'TOTAL_GOALS_O25',
        optionType: 'over_under_goals',
        marketCategory: 'total_goals',
        marketName: 'Total Goals Over 2.5',
        selection: 'Over 2.5 goals',
        period: 'REGULAR_TIME',
        settlementRule: '90 mins',
        modelProbability: 0.58,
        modelConfidence: 'HIGH',
        qualificationStatus: 'QUALIFIED_PROBABILITY',
        rankingScore: 82,
        isTopPick: true,
        settlementStatus: outcome,
        evidenceTier: 'Tier 1',
        dataQualityScore: 0.95,
        isProbabilityBasedAnalysis: false,
        stateTags: m.context.stateTags || [],
        lineupStatus: 'confirmed',
        topFactorContributions: []
      },
      competitionCode: m.competitionCode,
      matchweek: m.context.sampleSizeMatches,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      homeStyle: getTeamStyle(m.homeTeam),
      awayStyle: getTeamStyle(m.awayTeam),
      actualOutcome: outcome,
      stateTags: m.context.stateTags || [],
      modelProbability: 0.58,
      marketFamily: 'goals_over_under',
      marketCode: 'TOTAL_GOALS_O25'
    };
  });

  const missReport = generateMissAnalysisReport(settledRecords);

  return NextResponse.json({
    report,
    familyRegistry: FAMILY_VALIDATION_REGISTRY,
    missReport,
    timestamp: new Date().toISOString(),
  });
}
