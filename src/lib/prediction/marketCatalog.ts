// MATCHMIND / CALIBRALL: Supported Options Catalogue
// Strictly defines the 10 supported option types. Any market outside this catalogue stays disabled by configuration.

import { SupportedOptionType, MarketPeriod, MarketCategory, MarketDefinition } from '@/types';
import { cleanDisplayText } from '@/lib/utils/formatText';

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
    title: 'Draw (Draw Specific Threshold)',
    category: 'match_result',
    period: 'REGULAR_TIME',
    description: 'Level score at end of regular time. Enforces a strict draw specific threshold due to high outcome variance and empirical difficulty in forecasting parity.',
    defaultSelections: ['Draw'],
    settlementRule: 'Regular time 90 minutes plus injury time. Settle as Won if scores are level. Extra time excluded.',
    dataRequirements: {
      minSampleSizeMatches: 14,
      minDataCoverageScore: 0.88,
      maxUncertaintyScore: 0.14,
    },
    qualificationCriteria: {
      minProbability: 0.30, // Draw specific hurdle: requires >= 30% model probability (league average ~24-26%)
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
    description: 'Total combined goals scored in regular time across supported half integer lines (0.5, 1.5, 2.5, 3.5, 4.5). Derived from Dixon Coles bivariate scoreline matrix. Whole number lines push if exact.',
    defaultSelections: ['Over Line', 'Under Line'],
    supportedLines: [0.5, 1.5, 2.0, 2.5, 3.0, 3.5, 4.5],
    settlementRule: 'Regular time 90 mins plus stoppage time. Extra time excluded. If whole number line matches total match goals exactly, settlement is Push (stake refund).',
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
    defaultSelections: ['BTTS Yes', 'BTTS No'],
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
  draw_no_bet: {
    type: 'draw_no_bet',
    title: 'Draw No Bet (DNB - Substitute Only)',
    category: 'draw_no_bet',
    period: 'REGULAR_TIME',
    description: 'Home or away victory with full stake refund (push) if the match finishes level in regular time. Available strictly as a lower-variance substitute.',
    defaultSelections: ['Home DNB', 'Away DNB'],
    settlementRule: 'Regular time only. If regular time ends in a draw, the stake is pushed/refunded.',
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
  asian_handicap: {
    type: 'asian_handicap',
    title: 'Asian Handicap (Substitute Only)',
    category: 'handicap',
    period: 'REGULAR_TIME',
    description: 'Goal line handicap with half and whole goal margins (-1.5, -1, -0.5, 0, +0.5, +1, +1.5). Re-enabled strictly as a lower-variance substitute family.',
    defaultSelections: ['Home Handicap', 'Away Handicap'],
    supportedLines: [-1.5, -1.0, -0.5, 0.0, 0.5, 1.0, 1.5],
    settlementRule: 'Computed from 90-minute joint scoreline distribution. Full push refund on integer margins matching the line.',
    dataRequirements: {
      minSampleSizeMatches: 10,
      minDataCoverageScore: 0.82,
      maxUncertaintyScore: 0.20,
    },
    qualificationCriteria: {
      minProbability: 0.60,
      minEv: 0.035,
      minEdge: 0.025,
    },
    isEnabled: true,
  },
  european_handicap: {
    type: 'european_handicap',
    title: 'European Handicap (Substitute Only)',
    category: 'handicap',
    period: 'REGULAR_TIME',
    description: 'Traditional 3-way handicap (-1, +1) with home win, handicap draw, and away win outcomes. Re-enabled strictly as a lower-variance substitute family.',
    defaultSelections: ['Home Win (-1)', 'Draw (-1)', 'Away Win (+1)', 'Home Win (+1)'],
    supportedLines: [-1.0, 1.0],
    settlementRule: '3-way settlement on regular time score after applying integer goal adjustment. No push.',
    dataRequirements: {
      minSampleSizeMatches: 10,
      minDataCoverageScore: 0.82,
      maxUncertaintyScore: 0.20,
    },
    qualificationCriteria: {
      minProbability: 0.50,
      minEv: 0.04,
      minEdge: 0.03,
    },
    isEnabled: true,
  },
  goal_bounds: {
    type: 'goal_bounds',
    title: 'Goal Bounds (Total Match Ranges)',
    category: 'goal_bounds',
    period: 'REGULAR_TIME',
    description: 'Exact non-overlapping and bounded match goal ranges: 0-1, 0-2, 1-2, 1-3, 2-3, 2-4, 2+, 3+, 4+.',
    defaultSelections: ['1-3 Goals', '2-4 Goals', '2+ Goals', '0-2 Goals'],
    settlementRule: 'Regular time match total goals within specified numeric band. Probabilities sum to 100% across disjoint complete partitions.',
    dataRequirements: {
      minSampleSizeMatches: 10,
      minDataCoverageScore: 0.82,
      maxUncertaintyScore: 0.20,
    },
    qualificationCriteria: {
      minProbability: 0.65,
      minEv: 0.035,
      minEdge: 0.025,
    },
    isEnabled: false,
  },
  team_goal_bounds: {
    type: 'team_goal_bounds',
    title: 'Team Goal Bounds',
    category: 'goal_bounds',
    period: 'REGULAR_TIME',
    description: 'Team-specific goal bounds (0-1, 1-2, 2+) derived directly from marginal scoreline distributions.',
    defaultSelections: ['Home 1-2 Goals', 'Away 0-1 Goals', 'Home 2+ Goals'],
    settlementRule: 'Regular time goals scored by specific team.',
    dataRequirements: {
      minSampleSizeMatches: 10,
      minDataCoverageScore: 0.82,
      maxUncertaintyScore: 0.20,
    },
    qualificationCriteria: {
      minProbability: 0.65,
      minEv: 0.035,
      minEdge: 0.025,
    },
    isEnabled: false,
  },
  corner_handicap: {
    type: 'corner_handicap',
    title: 'Corner Handicap',
    category: 'team_corners',
    period: 'REGULAR_TIME',
    description: 'Differential corner winning lines (e.g. Home -1.5 corners, Away +1.5 corners).',
    defaultSelections: ['Home -1.5 Corners', 'Away +1.5 Corners'],
    supportedLines: [-1.5, 1.5],
    settlementRule: 'Regular time corners taken.',
    dataRequirements: {
      requiresCornerData: true,
      minSampleSizeMatches: 10,
      minDataCoverageScore: 0.85,
      maxUncertaintyScore: 0.20,
    },
    qualificationCriteria: {
      minProbability: 0.55,
      minEv: 0.04,
      minEdge: 0.03,
    },
    isEnabled: false,
  },
  team_bookings: {
    type: 'team_bookings',
    title: 'Team Bookings',
    category: 'bookings',
    period: 'REGULAR_TIME',
    description: 'Over/under disciplinary bookings on specific teams.',
    defaultSelections: ['Home Over 1.5 Cards', 'Away Over 1.5 Cards'],
    supportedLines: [1.5, 2.5],
    settlementRule: 'Regular time cards shown to active players on pitch.',
    dataRequirements: {
      requiresDisciplinaryData: true,
      minSampleSizeMatches: 10,
      minDataCoverageScore: 0.85,
      maxUncertaintyScore: 0.18,
    },
    qualificationCriteria: {
      minProbability: 0.55,
      minEv: 0.04,
      minEdge: 0.03,
    },
    isEnabled: false,
  },
  booking_points: {
    type: 'booking_points',
    title: 'Booking Points (10/25 rule)',
    category: 'bookings',
    period: 'REGULAR_TIME',
    description: 'Standard booking points: Yellow card = 10 pts, Red card = 25 pts. Over/Under 35.5, 45.5 pts.',
    defaultSelections: ['Over 35.5 Booking Pts', 'Over 45.5 Booking Pts'],
    supportedLines: [35.5, 45.5],
    settlementRule: 'Regular time yellow = 10, red = 25. Max 35 points per player.',
    dataRequirements: {
      requiresDisciplinaryData: true,
      minSampleSizeMatches: 10,
      minDataCoverageScore: 0.85,
      maxUncertaintyScore: 0.18,
    },
    qualificationCriteria: {
      minProbability: 0.55,
      minEv: 0.04,
      minEdge: 0.03,
    },
    isEnabled: false,
  },
  win_draw_combo: {
    type: 'win_draw_combo',
    title: 'Win & Goal Combos',
    category: 'combos',
    period: 'REGULAR_TIME',
    description: 'Combined outcomes (e.g. Home or Draw + Over 1.5 goals, Home Win + Over 1.5 goals, Home Win & BTTS).',
    defaultSelections: ['Home or Draw & Over 1.5', 'Away or Draw & Over 1.5', 'Home Win & Over 1.5', 'Home Win & BTTS'],
    settlementRule: 'Both legs must be satisfied at regular time whistle.',
    dataRequirements: {
      minSampleSizeMatches: 10,
      minDataCoverageScore: 0.82,
      maxUncertaintyScore: 0.20,
    },
    qualificationCriteria: {
      minProbability: 0.55,
      minEv: 0.04,
      minEdge: 0.03,
    },
    isEnabled: false,
  },
  moneyline: {
    type: 'moneyline',
    title: 'Moneyline (Winner)',
    category: 'moneyline',
    period: 'REGULAR_TIME',
    description: 'Straight-up match winner based on final score including overtime.',
    defaultSelections: ['Home Win', 'Away Win'],
    settlementRule: 'Official final score including overtime. Winner takes all.',
    dataRequirements: {
      minSampleSizeMatches: 10,
      minDataCoverageScore: 0.80,
      maxUncertaintyScore: 0.20,
    },
    qualificationCriteria: {
      minProbability: 0.52,
      minEv: 0.03,
      minEdge: 0.02,
    },
    isEnabled: true,
  },
  spread: {
    type: 'spread',
    title: 'Point Spread (Against the Spread)',
    category: 'spread',
    period: 'REGULAR_TIME',
    description: 'Point spread line comparison derived from possessions and net efficiency ratings.',
    defaultSelections: ['Home Cover', 'Away Cover'],
    settlementRule: 'Official final score with handicap applied. Push if exact margin.',
    dataRequirements: {
      minSampleSizeMatches: 10,
      minDataCoverageScore: 0.80,
      maxUncertaintyScore: 0.20,
    },
    qualificationCriteria: {
      minProbability: 0.52,
      minEv: 0.03,
      minEdge: 0.02,
    },
    isEnabled: true,
  },
  total_points: {
    type: 'total_points',
    title: 'Total Points (Over / Under)',
    category: 'total_points',
    period: 'REGULAR_TIME',
    description: 'Game total points over/under comparison against sportsbook lines.',
    defaultSelections: ['Over', 'Under'],
    settlementRule: 'Official combined final score including overtime.',
    dataRequirements: {
      minSampleSizeMatches: 10,
      minDataCoverageScore: 0.80,
      maxUncertaintyScore: 0.20,
    },
    qualificationCriteria: {
      minProbability: 0.52,
      minEv: 0.03,
      minEdge: 0.02,
    },
    isEnabled: true,
  },
  team_totals: {
    type: 'team_totals',
    title: 'Team Total Points',
    category: 'team_totals',
    period: 'REGULAR_TIME',
    description: 'Individual team points over/under comparison against projected score.',
    defaultSelections: ['Home Team Over', 'Away Team Over'],
    settlementRule: 'Official individual team final score including overtime.',
    dataRequirements: {
      minSampleSizeMatches: 10,
      minDataCoverageScore: 0.80,
      maxUncertaintyScore: 0.20,
    },
    qualificationCriteria: {
      minProbability: 0.52,
      minEv: 0.03,
      minEdge: 0.02,
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
 * Identifies families that are designated strictly as lower-variance substitute options
 * (e.g. Asian Handicap, European Handicap, Draw No Bet)
 */
export function isSubstituteOnly(type: string): boolean {
  return type === 'asian_handicap' || type === 'european_handicap' || type === 'draw_no_bet';
}

/**
 * Returns user-facing clean label for option types
 */
export function getOptionTypeLabel(type: SupportedOptionType | string): string {
  switch (type) {
    case 'win':
      return 'Win';
    case 'draw':
      return 'Draw';
    case 'double_chance':
      return 'Double chance';
    case 'over_under_goals':
      return 'Over / under goals';
    case 'both_teams_to_score':
      return 'Both teams to score';
    case 'corners':
      return 'Corners';
    case 'bookings':
      return 'Bookings';
    case 'highest_scoring_half':
      return 'Highest scoring half';
    case 'first_half_goals':
      return '1st half goals';
    case 'second_half_result':
      return '2nd half result';
    case 'draw_no_bet':
      return 'Draw no bet';
    case 'asian_handicap':
      return 'Asian handicap';
    case 'european_handicap':
      return 'European handicap';
    case 'goal_bounds':
      return 'Goal bounds';
    case 'team_goal_bounds':
      return 'Team goal bounds';
    case 'corner_handicap':
      return 'Corner handicap';
    case 'team_bookings':
      return 'Team bookings';
    case 'booking_points':
      return 'Booking points';
    case 'win_draw_combo':
      return 'Win & goal combos';
    default:
      return type ? type.replace(/_/g, ' ') : '';
  }
}

import { RiskTier } from '@/types';

export function getRiskTierBadge(tier?: RiskTier | string): { label: string; badgeClass: string } {
  const normalized = (tier || '').toUpperCase();
  switch (normalized) {
    case 'HIGH':
    case 'SAFE':
      return {
        label: 'HIGH',
        badgeClass: 'bg-[#b8e63a]/15 text-[#b8e63a] border border-[#b8e63a]/30',
      };
    case 'MEDIUM':
    case 'MODERATE':
      return {
        label: 'MEDIUM',
        badgeClass: 'bg-[#e3b341]/15 text-[#e3b341] border border-[#e3b341]/30',
      };
    case 'LOW':
    case 'RISKY':
    case 'LONGSHOT':
      return {
        label: 'LOW',
        badgeClass: 'bg-orange-500/15 text-orange-400 border border-orange-500/30',
      };
    default:
      return {
        label: 'ANALYSIS',
        badgeClass: 'bg-white/10 text-[#8fa69a] border border-white/15',
      };
  }
}

export function getConfidenceTierBadge(tier?: string): { label: string; badgeClass: string } {
  return getRiskTierBadge(tier);
}

/**
 * Returns human-readable period label
 */
export function getPeriodLabel(period?: MarketPeriod | string): string {
  switch (period) {
    case 'FIRST_HALF':
      return '1st half';
    case 'SECOND_HALF':
      return '2nd half';
    case 'FULL_TIME':
      return 'Full time';
    case 'REGULAR_TIME':
    default:
      return 'Regular time';
  }
}

/**
 * Clean selection name into readable sentence case with short team names, dropping "FC", "CF", etc.
 */
export function formatSelectionName(name: string): string {
  if (!name) return '';
  let cleaned = name
    .replace(/\bFootball Club\b/gi, '')
    .replace(/\bFC\b/gi, '')
    .replace(/\bCF\b/gi, '')
    .replace(/\bAFC\b/gi, '')
    .replace(/\bBSC\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Sentence case for Win outcomes
  if (/ to Win 2nd Half$/i.test(cleaned)) {
    cleaned = cleaned.replace(/ to Win 2nd Half$/i, ' win (2nd half)');
  } else if (/ to Win$/i.test(cleaned)) {
    cleaned = cleaned.replace(/ to Win$/i, ' win');
  } else if (/ Win$/i.test(cleaned)) {
    cleaned = cleaned.replace(/ Win$/i, ' win');
  } else if (/ or Draw$/i.test(cleaned)) {
    cleaned = cleaned.replace(/ or Draw$/i, ' or draw');
  } else if (/ or Away$/i.test(cleaned)) {
    cleaned = cleaned.replace(/ or Away$/i, ' or away');
  }

  // Draw
  if (/^Draw$/i.test(cleaned)) {
    cleaned = 'Draw';
  }

  // Both teams to score
  if (/^BTTS [- ]?Yes/i.test(cleaned)) {
    cleaned = 'BTTS: yes';
  } else if (/^BTTS [- ]?No/i.test(cleaned)) {
    cleaned = 'BTTS: no';
  }

  // Total lines: lowercase "goals", "corners", "bookings"
  cleaned = cleaned
    .replace(/Over ([0-9.]+) Goals/gi, 'Over $1 goals')
    .replace(/Under ([0-9.]+) Goals/gi, 'Under $1 goals')
    .replace(/Over ([0-9.]+) Corners/gi, 'Over $1 corners')
    .replace(/Under ([0-9.]+) Corners/gi, 'Under $1 corners')
    .replace(/Over ([0-9.]+) Bookings/gi, 'Over $1 bookings')
    .replace(/Under ([0-9.]+) Bookings/gi, 'Under $1 bookings')
    .replace(/Highest Scoring Half: 2nd Half/gi, 'Highest scoring half: 2nd half')
    .replace(/Highest Scoring Half: 1st Half/gi, 'Highest scoring half: 1st half')
    .replace(/1st Half Over ([0-9.]+) Goals/gi, '1st half over $1 goals')
    .replace(/1st Half Under ([0-9.]+) Goals/gi, '1st half under $1 goals');

  return cleanDisplayText(cleaned);
}

/**
 * Format signed Expected Value:
 * Positive: "+23.5%" in lime (#b8e63a)
 * Negative: "−27.5%" in soft red (#e06a5f) using true minus
 * Zero: "0.0%" in muted (#8fa69a)
 * Missing: "n/a" in muted (#8fa69a)
 */
export function formatExpectedValue(ev?: number | null): { text: string; colorClass: string } {
  if (ev === undefined || ev === null || isNaN(ev)) {
    return { text: 'n/a', colorClass: 'text-[#8fa69a]' };
  }
  const pct = ev * 100;
  if (pct > 0.05) {
    return { text: `+${pct.toFixed(1)}%`, colorClass: 'text-[#b8e63a]' };
  } else if (pct < -0.05) {
    return { text: `−${Math.abs(pct).toFixed(1)}%`, colorClass: 'text-[#e06a5f]' };
  } else {
    return { text: `${pct.toFixed(1)}%`, colorClass: 'text-[#8fa69a]' };
  }
}

/**
 * Format decimal odds, returning "n/a" if unavailable
 */
export function formatOdds(odds?: number | null): string {
  if (odds === undefined || odds === null || isNaN(odds)) {
    return 'n/a';
  }
  return odds.toFixed(2);
}
