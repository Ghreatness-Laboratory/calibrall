// MATCHMIND: Complete TypeScript Type Definitions

export type MatchStatus = 'TIMED' | 'SCHEDULED' | 'IN_PLAY' | 'PAUSED' | 'FINISHED' | 'POSTPONED' | 'CANCELED';

export type MarketCategory = 
  | 'match_result' 
  | 'total_goals' 
  | 'team_goals' 
  | 'btts' 
  | 'total_corners' 
  | 'team_corners' 
  | 'bookings' 
  | 'half_time'
  | 'double_chance'
  | 'draw_no_bet';

export type ModelConfidence = 'VERY_HIGH' | 'HIGH' | 'MODERATE' | 'LOW';

export type QualificationStatus = 
  | 'QUALIFIED_VALUE' 
  | 'QUALIFIED_PROBABILITY' 
  | 'UNQUALIFIED_MARGINAL' 
  | 'UNQUALIFIED_HIGH_UNCERTAINTY' 
  | 'NO_RECOMMENDATION';

export type SettlementStatus = 'PENDING' | 'WON' | 'LOST' | 'PUSH' | 'VOID';

export interface FixtureContext {
  fixtureId: string;
  homeTeamName: string;
  awayTeamName: string;
  competitionCode: string;
  competitionName: string;
  homeAttackRating: number;
  homeDefenseRating: number;
  awayAttackRating: number;
  awayDefenseRating: number;
  homeXg: number;
  awayXg: number;
  expectedCornersHome: number;
  expectedCornersAway: number;
  expectedCards: number;
  uncertaintyScore: number;
  dataCoverageScore: number;
  sampleSizeMatches: number;
  verifiedOdds?: {
    homeWin?: number;
    draw?: number;
    awayWin?: number;
    over25Goals?: number;
    under25Goals?: number;
    bttsYes?: number;
    bttsNo?: number;
    over95Corners?: number;
    under95Corners?: number;
    over45Cards?: number;
    under45Cards?: number;
  };
}

export interface Competition {
  id: string;
  code: string;
  name: string;
  country: string;
  emblemUrl: string;
  tier: number;
  avgGoalsPerGame: number;
  avgCornersPerGame: number;
  avgCardsPerGame: number;
  isActive: boolean;
}

export interface Team {
  id: string;
  name: string;
  shortName: string;
  tla: string;
  crestUrl: string;
  venue?: string;
  competitionId?: string;
  attackRating: number;
  defenseRating: number;
  cornerAttackRating: number;
  disciplineRating: number;
  recentForm?: ('W' | 'D' | 'L')[];
}

export interface Fixture {
  id: string;
  providerId?: string;
  competitionId: string;
  competition: Competition;
  seasonYear: string;
  homeTeam: Team;
  awayTeam: Team;
  kickoffTime: string; // ISO string
  matchday: number;
  status: MatchStatus;
  homeScore?: number | null;
  awayScore?: number | null;
  homeHalfTimeScore?: number | null;
  awayHalfTimeScore?: number | null;
  homeCorners?: number | null;
  awayCorners?: number | null;
  homeYellowCards?: number | null;
  awayYellowCards?: number | null;
  homeRedCards?: number | null;
  awayRedCards?: number | null;
  homeShots?: number | null;
  awayShots?: number | null;
  homeShotsOnTarget?: number | null;
  awayShotsOnTarget?: number | null;
  venue?: string;
  referee?: string;
  dataFreshness: string;
  isDemo?: boolean;
}

export interface BookmakerOdds {
  id: string;
  fixtureId: string;
  bookmaker: string;
  marketCode: string;
  selection: string;
  decimalOdds: number;
  impliedProbability: number;
  observedAt: string;
  isLive?: boolean;
}

export interface MarketPrediction {
  id: string;
  fixtureId: string;
  marketCode: string;
  marketCategory: MarketCategory;
  marketName: string;
  selection: string;
  line?: number;
  modelProbability: number;
  marketOdds?: number;
  impliedProbability?: number;
  expectedValue?: number; // (p * O) - 1
  edge?: number; // p - implied
  modelConfidence: ModelConfidence;
  qualificationStatus: QualificationStatus;
  rankingScore: number;
  isTopPick: boolean;
  settlementStatus: SettlementStatus;
  explanation?: PredictionExplanation;
}

export interface PredictionExplanation {
  id: string;
  predictionId: string;
  headline: string;
  summary: string;
  keySupportingFactors: string[];
  counterarguments: string[];
  dataLimitations: string[];
  alternativeComparisons: {
    alternative: string;
    modelProbability: number;
    reasonRejected: string;
  }[];
  whyRankedAboveAlternatives: string;
  modelType: string;
  sampleSize: number;
  generatedAt: string;
}

export interface PredictionRun {
  id: string;
  fixtureId: string;
  modelName: string;
  modelVersion: string;
  runTimestamp: string;
  homeXg: number;
  awayXg: number;
  totalXg: number;
  expectedCornersHome: number;
  expectedCornersAway: number;
  totalExpectedCorners: number;
  expectedCardsTotal: number;
  modelUncertaintyScore: number;
  dataCoverageScore: number;
  scorelineProbabilities: { home: number; away: number; probability: number }[];
  predictions: MarketPrediction[];
  topQualifiedRecommendation?: MarketPrediction | null;
}

export interface CalibrationBucket {
  binRange: string;
  binCenter: number;
  predictedProbMean: number;
  observedFrequency: number;
  sampleCount: number;
}

export interface PerformanceReport {
  totalPredictions: number;
  settledPredictions: number;
  wins: number;
  losses: number;
  pushes: number;
  hitRate: number; // e.g. 0.642 (64.2%)
  brierScore: number; // e.g. 0.184
  logLoss: number; // e.g. 0.528
  averageYieldRoi: number; // e.g. +7.8%
  outOfSampleValidationWindow: string;
  calibrationSlope: number;
  calibrationBuckets: CalibrationBucket[];
  byMarketCategory: {
    category: MarketCategory;
    name: string;
    sampleSize: number;
    hitRate: number;
    brierScore: number;
    avgEdge: number;
    roi: number;
  }[];
  byCompetition: {
    competitionCode: string;
    competitionName: string;
    sampleSize: number;
    hitRate: number;
    brierScore: number;
  }[];
}

export interface UserPreferences {
  timezone: string;
  preferredCompetitions: string[];
  favoriteTeams: string[];
  preferredMarkets: MarketCategory[];
  minProbabilityThreshold: number;
  minEdgeThreshold: number;
  emailNotificationsEnabled: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  role: 'user' | 'analyst' | 'admin';
  subscriptionTier: 'free' | 'pro' | 'premium';
  subscriptionStatus: 'active' | 'past_due' | 'canceled' | 'trialing';
  createdAt: string;
}

export interface SavedFixture {
  id: string;
  userId: string;
  fixtureId: string;
  fixture: Fixture;
  notes?: string;
  savedAt: string;
}
