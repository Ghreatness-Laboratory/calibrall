// MATCHMIND / CALIBRALL: Supported Options Catalogue
// Strictly defines the 10 supported option types. Any market outside this catalogue stays disabled by configuration.

import { SupportedOptionType, MarketPeriod, MarketCategory, MarketDefinition } from '@/types';

export interface OptionTypeMetadata {
  type: SupportedOptionType;
  title: string;
  category: MarketCategory;
  period: MarketPeriod;
  description: string;
  defaultSelections: string[];
  supportedLines?: number[];
  settlementRule: string;
  dataRequirements: {
    requiresCornerData?: boolean;
    requiresDisciplinaryData?: boolean;
    requiresHalfLevelData?: boolean;
    minSampleSizeMatches: number;
    minDataCoverageScore: number;
    maxUncertaintyScore: number;
  };
  qualificationCriteria: {
    minProbability: number;
    drawSpecificThreshold?: boolean;
    minEv?: number;
    minEdge?: number;
  };
  isEnabled: boolean;
}

export const SUPPORTED_OPTIONS_CATALOGUE: Record<SupportedOptionType, OptionTypeMetadata> = {
  win: {
    type: 'win',
    title: 'Win (Regular Time)',
    category: 'match_result',
    period: 'REGULAR_TIME',
    description: 'Home win or away win determined strictly by regular time (90 minutes plus stoppage time). Extra time and penalty shootouts are excluded.',
    defaultSelections: ['Home Win', 'Away Win'],
    settlementRule: 'Regular time only. Extra time and penalties excluded. Settle won if selected team leads at the conclusion of regular time.',
    dataRequirements: {
      minSampleSizeMatches: 10,
      minDataCoverageScore: 0.80,
      maxUncertaintyScore: 0.22,
    },
    qualificationCriteria: {
      minProbability: 0.50,
      minEv: 0.04,
      minEdge: 0.03,
    },
    isEnabled: true,
  },
  draw: {
    type: 'draw',
    title: 'Draw (Draw-Specific Threshold)',
    category: 'match_result',
    period: 'REGULAR_TIME',
    description: 'Level score at end of regular time. Enforces a strict draw-specific threshold due to high outcome variance and empirical difficulty in forecasting parity.',
    defaultSelections: ['Draw'],
    settlementRule: 'Regular time 90 minutes plus injury time. Settle as Won if scores are level. Extra time excluded.',
    dataRequirements: {
      minSampleSizeMatches: 14,
      minDataCoverageScore: 0.88,
      maxUncertaintyScore: 0.14,
    },
    qualificationCriteria: {
      minProbability: 0.30, // Draw-specific hurdle: requires >= 30% model probability (league average ~24-26%)
      drawSpecificThreshold: true,
      minEv: 0.06,
      minEdge: 0.04,
    },
    isEnabled: true,
  },
  double_chance: {
    type: 'double_chance',
    title: 'Double Chance ("Or" Options)',
    category: 'double_chance',
    period: 'REGULAR_TIME',
    description: 'Compound outcome covering two of the three 1X2 outcomes: Home or Draw (1X), Away or Draw (X2), Home or Away (12, meaning no draw). Derived strictly from the joint 1X2 distribution.',
    defaultSelections: ['Home or Draw', 'Away or Draw', 'Home or Away'],
    settlementRule: 'Regular time only. 1X settles won on home victory or draw; X2 settles won on away victory or draw; 12 settles won on any decisive win (loss if draw).',
    dataRequirements: {
      minSampleSizeMatches: 10,
      minDataCoverageScore: 0.80,
      maxUncertaintyScore: 0.22,
    },
    qualificationCriteria: {
      minProbability: 0.65,
      minEv: 0.035,
      minEdge: 0.025,
    },
    isEnabled: true,
  },
  over_under_goals: {
    type: 'over_under_goals',
    title: 'Over / Under Goals',
    category: 'total_goals',
    period: 'REGULAR_TIME',
    description: 'Total combined goals scored in regular time across supported half-integer lines (0.5, 1.5, 2.5, 3.5, 4.5). Derived from Dixon-Coles bivariate scoreline matrix. Whole-number lines push if exact.',
    defaultSelections: ['Over Line', 'Under Line'],
    supportedLines: [0.5, 1.5, 2.0, 2.5, 3.0, 3.5, 4.5],
    settlementRule: 'Regular time 90 mins plus stoppage time. Extra time excluded. If whole-number line matches total match goals exactly, settlement is Push (stake refund).',
    dataRequirements: {
      minSampleSizeMatches: 10,
      minDataCoverageScore: 0.82,
      maxUncertaintyScore: 0.20,
    },
    qualificationCriteria: {
      minProbability: 0.52,
      minEv: 0.04,
      minEdge: 0.03,
    },
    isEnabled: true,
  },
  both_teams_to_score: {
    type: 'both_teams_to_score',
    title: 'Both Teams to Score (BTTS)',
    category: 'btts',
    period: 'REGULAR_TIME',
    description: 'Whether both teams score at least one goal in regular time. Derived directly from the joint scoreline distribution (P(BTTS Yes) = sum of matrix where h >= 1 and a >= 1; P(No) = 1 - P(Yes)).',
    defaultSelections: ['BTTS - Yes', 'BTTS - No'],
    settlementRule: 'Regular time only. Yes requires home goals >= 1 AND away goals >= 1. No requires either home goals == 0 OR away goals == 0.',
    dataRequirements: {
      minSampleSizeMatches: 10,
      minDataCoverageScore: 0.82,
      maxUncertaintyScore: 0.20,
    },
    qualificationCriteria: {
      minProbability: 0.52,
      minEv: 0.04,
      minEdge: 0.03,
    },
    isEnabled: true,
  },
  corners: {
    type: 'corners',
    title: 'Corners (Total & Team)',
    category: 'total_corners',
    period: 'REGULAR_TIME',
    description: 'Total corners over/under on supported lines (8.5, 9.5, 10.5), plus team corners where data supports it. Requires verified corner statistics; engine abstains if corner data is sparse.',
    defaultSelections: ['Total Corners Over', 'Total Corners Under', 'Home Team Corners Over', 'Away Team Corners Over'],
    supportedLines: [8.5, 9.5, 10.5, 4.5, 5.5],
    settlementRule: 'Corners taken in regular time only. Awarded but unexecuted corners do not count toward settlement.',
    dataRequirements: {
      requiresCornerData: true,
      minSampleSizeMatches: 10,
      minDataCoverageScore: 0.85,
      maxUncertaintyScore: 0.20,
    },
    qualificationCriteria: {
      minProbability: 0.53,
      minEv: 0.045,
      minEdge: 0.03,
    },
    isEnabled: true,
  },
  bookings: {
    type: 'bookings',
    title: 'Bookings & Cards (Total & Team)',
    category: 'bookings',
    period: 'REGULAR_TIME',
    description: 'Total bookings over/under and team bookings. Uses dedicated disciplinary model incorporating referee card averages, derby tension factor, and team historical cards. Requires verified card data, else abstains.',
    defaultSelections: ['Total Bookings Over', 'Total Bookings Under', 'Team Cards Over'],
    supportedLines: [3.5, 4.5, 5.5, 2.5],
    settlementRule: 'Regular time only. Yellow card = 1 card; direct red = 2 cards; yellow-to-red = 2 cards (max 3 cards per player). Cards to coaching staff or bench do not count.',
    dataRequirements: {
      requiresDisciplinaryData: true,
      minSampleSizeMatches: 10,
      minDataCoverageScore: 0.85,
      maxUncertaintyScore: 0.18,
    },
    qualificationCriteria: {
      minProbability: 0.53,
      minEv: 0.045,
      minEdge: 0.03,
    },
    isEnabled: true,
  },
  highest_scoring_half: {
    type: 'highest_scoring_half',
    title: 'Highest Scoring Half',
    category: 'half_time',
    period: 'FULL_TIME',
    description: 'Compares goals in 1st half vs 2nd half (First Half, Second Half, or Equal). Derived from a calibrated half-by-half goals model. Requires sufficient half-level historical data or abstains.',
    defaultSelections: ['1st Half', '2nd Half', 'Equal'],
    settlementRule: 'Compares regular time goals scored in first half vs second half. First half goals include first half stoppage; second half goals include second half stoppage. Extra time excluded.',
    dataRequirements: {
      requiresHalfLevelData: true,
      minSampleSizeMatches: 12,
      minDataCoverageScore: 0.88,
      maxUncertaintyScore: 0.18,
    },
    qualificationCriteria: {
      minProbability: 0.45,
      minEv: 0.05,
      minEdge: 0.035,
    },
    isEnabled: true,
  },
  first_half_goals: {
    type: 'first_half_goals',
    title: 'First-Half Goals (Over / Under)',
    category: 'half_time',
    period: 'FIRST_HALF',
    description: 'Total goals scored in the first half over/under supported lines (0.5, 1.5). Utilizes first-half goals model with empirical tempo weighting. Requires half-level data, or abstains.',
    defaultSelections: ['Over 0.5 Goals (1H)', 'Under 0.5 Goals (1H)', 'Over 1.5 Goals (1H)', 'Under 1.5 Goals (1H)'],
    supportedLines: [0.5, 1.5],
    settlementRule: 'Goals scored from kickoff until half-time whistle (including 1st half stoppage time). Goals scored after half-time do not count.',
    dataRequirements: {
      requiresHalfLevelData: true,
      minSampleSizeMatches: 12,
      minDataCoverageScore: 0.88,
      maxUncertaintyScore: 0.18,
    },
    qualificationCriteria: {
      minProbability: 0.55,
      minEv: 0.04,
      minEdge: 0.03,
    },
    isEnabled: true,
  },
  second_half_result: {
    type: 'second_half_result',
    title: 'Second-Half Result',
    category: 'half_time',
    period: 'SECOND_HALF',
    description: 'Result of the second half treated as a separate match (score 0-0 at restart): Home, Away, or Draw. Utilizes a half-split model. Settle on second-half score only.',
    defaultSelections: ['Home Win (2H)', 'Away Win (2H)', 'Draw (2H)'],
    settlementRule: 'Settles solely on goals scored in the second half (including 2nd half stoppage time). The score at half-time is disregarded for settlement.',
    dataRequirements: {
      requiresHalfLevelData: true,
      minSampleSizeMatches: 12,
      minDataCoverageScore: 0.88,
      maxUncertaintyScore: 0.18,
    },
    qualificationCriteria: {
      minProbability: 0.40,
      minEv: 0.05,
      minEdge: 0.035,
    },
    isEnabled: true,
  },
};

// Configuration guard: list of all authorized option types
export const AUTHORIZED_OPTION_TYPES: SupportedOptionType[] = Object.keys(
  SUPPORTED_OPTIONS_CATALOGUE
) as SupportedOptionType[];

/**
 * Checks if an option type is enabled in the configuration
 */
export function isOptionTypeEnabled(type: string): boolean {
  const metadata = SUPPORTED_OPTIONS_CATALOGUE[type as SupportedOptionType];
  return !!metadata && metadata.isEnabled;
}

/**
 * Returns user-facing label and styling badge for option types
 */
export function getOptionTypeLabel(type: SupportedOptionType): string {
  return SUPPORTED_OPTIONS_CATALOGUE[type]?.title || type;
}

/**
 * Returns human-readable period label
 */
export function getPeriodLabel(period: MarketPeriod): string {
  switch (period) {
    case 'FIRST_HALF':
      return '1st Half (45m)';
    case 'SECOND_HALF':
      return '2nd Half Only (45m)';
    case 'FULL_TIME':
      return 'Full Time (90m)';
    case 'REGULAR_TIME':
    default:
      return 'Regular Time (90m)';
  }
}
