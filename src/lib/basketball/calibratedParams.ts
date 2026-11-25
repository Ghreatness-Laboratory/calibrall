// CALIBRALL: Loaded Walk-Forward Basketball Calibration Parameters & Runtime Calibrator
import calibratedData from './calibratedParams.json';
import { BasketballLeague, BasketballMarketCategory } from './markets';
import {
  CalibratedBasketballParamsFile,
  FamilyBacktestReport,
  applyPlattCalibrator,
  applyIsotonicCalibrator,
} from './calibration';

export const CALIBRATED_BASKETBALL_PARAMS = calibratedData as CalibratedBasketballParamsFile;

export function getFamilyBacktestReport(
  league: BasketballLeague,
  category: BasketballMarketCategory
): FamilyBacktestReport | null {
  const leagueSummary = CALIBRATED_BASKETBALL_PARAMS.leagues?.[league];
  if (!leagueSummary) return null;
  return leagueSummary.families.find((f) => f.marketCategory === category) || null;
}

export function calibrateBasketballProbability(
  league: BasketballLeague,
  category: BasketballMarketCategory,
  rawProbability: number
): {
  calibratedProbability: number;
  calibratorType: 'platt' | 'isotonic' | 'raw';
  passedBaseline: boolean;
  familyReport: FamilyBacktestReport | null;
} {
  const report = getFamilyBacktestReport(league, category);
  if (!report || report.sampleSize < 100) {
    return {
      calibratedProbability: Math.max(0.01, Math.min(0.99, rawProbability)),
      calibratorType: 'raw',
      passedBaseline: false,
      familyReport: report,
    };
  }

  let cal = rawProbability;
  if (report.calibratorType === 'platt') {
    cal = applyPlattCalibrator(rawProbability, report.platt);
  } else if (report.calibratorType === 'isotonic' && report.isotonicCurve.length >= 2) {
    cal = applyIsotonicCalibrator(rawProbability, report.isotonicCurve);
  }

  return {
    calibratedProbability: Math.round(Math.max(0.01, Math.min(0.99, cal)) * 10000) / 10000,
    calibratorType: report.calibratorType,
    passedBaseline: report.passedBaseline,
    familyReport: report,
  };
}
