export type Sport = 'football' | 'basketball';

export type MatchStatus = 'TIMED' | 'SCHEDULED' | 'IN_PLAY' | 'PAUSED' | 'FINISHED' | 'POSTPONED' | 'CANCELED';

export type ConfidenceTier = 'HIGH' | 'MEDIUM' | 'LOW';
export type RiskTier = ConfidenceTier | 'SAFE' | 'MODERATE' | 'RISKY' | 'LONGSHOT';

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
  | 'draw_no_bet'
  | 'handicap'
  | 'goal_bounds'
  | 'combos'
  | 'moneyline'
  | 'spread'
  | 'total_points'
  | 'team_totals';

export type SupportedOptionType = 
  | 'win'
  | 'draw'
  | 'double_chance'
  | 'over_under_goals'
  | 'both_teams_to_score'
  | 'corners'
  | 'bookings'
  | 'highest_scoring_half'
  | 'first_half_goals'
  | 'second_half_result'
  | 'draw_no_bet'
  | 'asian_handicap'
  | 'european_handicap'
  | 'goal_bounds'
  | 'team_goal_bounds'
  | 'corner_handicap'
  | 'team_bookings'
  | 'booking_points'
  | 'win_draw_combo'
  | 'moneyline'
  | 'spread'
  | 'total_points'
  | 'team_totals';

export type MarketPeriod = 'REGULAR_TIME' | 'FIRST_HALF' | 'SECOND_HALF' | 'FULL_TIME';

export interface MarketDefinition {
  id: string;
  marketCode: string;
  optionType: SupportedOptionType;
  marketCategory: MarketCategory;
  name: string;
  selection: string;
  line?: number;
  period: MarketPeriod;
  settlementRule: string;
  isEnabled: boolean;
  minProbabilityThreshold: number;
  maxUncertaintyThreshold: number;
  minDataCoverage: number;
  minSampleSize: number;
  isPushPossible?: boolean;
}

export type ModelConfidence = 'VERY_HIGH' | 'HIGH' | 'MODERATE' | 'LOW';

export type QualificationStatus = 
  | 'QUALIFIED_VALUE' 
  | 'QUALIFIED_PROBABILITY' 
  | 'PROBABILITY_ANALYSIS_ONLY'
  | 'UNQUALIFIED_MARGINAL' 
  | 'UNQUALIFIED_HIGH_UNCERTAINTY' 
  | 'NO_RECOMMENDATION';

export type SettlementStatus = 'PENDING' | 'WON' | 'LOST' | 'PUSH' | 'VOID';

export type StateTag = 
  | 'high-stakes' 
  | 'derby' 
  | 'dead-rubber' 
  | 'fixture-congested' 
  | 'key-absences' 
  | 'new-manager' 
  | 'low-sample' 
  | 'lineup-unconfirmed'
  | 'wing-heavy'
  | 'slow-starter'
  | 'high-fatigue';

export type FactorCode = 
  | 'team_form' 
  | 'squad_state' 
  | 'match_stakes' 
  | 'schedule_fatigue' 
  | 'tactical_matchup' 
  | 'referee_rules' 
  | 'environment' 
  | 'head_to_head' 
  | 'managerial_changes' 
  | 'market_signals';

export interface FactorContribution {
  factorCode: FactorCode;
  factorName: string;
  weight: number;
  direction: 'positive' | 'negative' | 'neutral';
  impactDescription: string;
  magnitude: number;
}

export interface MissingFactorFlag {
  factorCode: FactorCode;
  factorName: string;
  reason: string;
  uncertaintyPenalty: number;
}

export interface ContextFactorMeasurement {
  factorCode: FactorCode;
  factorName: string;
  category: 'form' | 'squad' | 'stakes' | 'fatigue' | 'tactics' | 'referee' | 'environment' | 'h2h' | 'management' | 'market';
  homeValue: string | number;
  awayValue: string | number;
  description: string;
  marketWeights: Partial<Record<MarketCategory, number>>;
  isMeasured: boolean;
  isMissing: boolean;
  shrinkageApplied: number;
}

export interface FixtureStateTagInfo {
  tag: StateTag;
  label: string;
  description: string;
  uncertaintyMultiplier: number;
  affectedMarkets: MarketCategory[];
  hypothesis: string;
}

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
  uncertaintyScore: number | null;
  dataCoverageScore: number | null;
  sampleSizeMatches: number;
  hasRealTeamStrength?: boolean;
  insufficientData?: boolean;
  stateTags?: StateTag[];
  lineupConfirmed?: boolean;
  factors?: Record<FactorCode, ContextFactorMeasurement>;
  missingFactors?: MissingFactorFlag[];
  verifiedOdds?: VerifiedMatchOdds;
  noRecommendationReason?: string;
}

export interface VerifiedMatchOdds {
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
  attackRating?: number;
  defenseRating?: number;
  cornerAttackRating?: number;
  disciplineRating?: number;
  recentForm?: ('W' | 'D' | 'L')[];
  hasRealTeamStrength?: boolean;
}

export interface Fixture {
  id: string;
  providerId: string;
  providerName?: string;
  fetchTime?: string;
  source?: string;
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
  sport?: Sport;
  isDerby?: boolean;
  derbyName?: string;
  insufficientData?: boolean;
  hasRealTeamStrength?: boolean;
  verifiedOdds?: VerifiedMatchOdds;
  hasCoachChange?: boolean;
  coachChangeNote?: string;
  h2hSummary?: string;
  h2hMatchCount?: number;
  missingDataFlags?: {
    corners?: boolean;
    cards?: boolean;
    halves?: boolean;
  };
  // Basketball specific fields
  basketballStats?: {
    homeOffEff: number;
    homeDefEff: number;
    homePoss: number;
    awayOffEff: number;
    awayDefEff: number;
    awayPoss: number;
    homeOff: number;
    awayOff: number;
    homeDef: number;
    awayDef: number;
    homeProjected: number;
    awayProjected: number;
    projectedTotal: number;
    projectedMargin: number;
    projectedWinner: string;
    sportsbookTotal?: number;
    sportsbookSpreadHome?: number;
    totalLean?: 'OVER' | 'UNDER' | 'PUSH';
    spreadLean?: string;
  };
}

export interface NBATeamStats {
  teamId: string;
  teamName: string;
  abbreviation: string;
  conference: 'East' | 'West';
  division: string;
  offensiveEfficiency: number; // ORtg / 100
  defensiveEfficiency: number; // DRtg / 100
  possessions: number;          // PACE
  season: string;
  lastUpdated: string;
  source: string;
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
  optionType: SupportedOptionType;
  marketCategory: MarketCategory;
  marketName: string;
  selection: string;
  line?: number;
  period: MarketPeriod;
  settlementRule: string;
  modelProbability: number;
  marketOdds?: number;
  impliedProbability?: number;
  expectedValue?: number | null; // (p * O) - 1 or null if odds unavailable
  edge?: number; // p - implied
  riskTier?: RiskTier;
  confidenceScore?: number; // 0.0 - 1.0 (or percentage)
  plainEnglishReason?: string;
  handicapType?: 'asian' | 'european';
  handicapLine?: number;
  goalBand?: string;
  winProb?: number;
  pushProb?: number;
  lossProb?: number;
  modelConfidence: ModelConfidence;
  qualificationStatus: QualificationStatus;
  rankingScore: number;
  isTopPick: boolean;
  settlementStatus: SettlementStatus;
  evidenceTier: string; // Plain-text tier e.g. "Tier 1: Qualified Value", "Tier 2: High Probability", "Unqualified: High Uncertainty"
  dataQualityScore: number; // Combined verified data completeness score 0.0 - 1.0
  isProbabilityBasedAnalysis: boolean; // Flagged when no verified odds exist (probability-based analysis, not value opportunity)
  pushProbability?: number; // Push probability for whole-number lines that land exactly on the line
  stateTags: StateTag[]; // Verified state tags that affected this prediction
  lineupStatus: 'confirmed' | 'pre-lineup';
  topFactorContributions: FactorContribution[]; // Top 3 measured factors contributing to this line
  correlationWarnings?: string[]; // Warnings regarding intra-fixture line correlations
  marketFamily?: string;
  baselineProbability?: number;
  edgeOverBaseline?: number;
  isFamilyWinner?: boolean;
  isValidated?: boolean;
  validationStatus?: 'validated' | 'unvalidated' | 'insufficient_sample';
  brierSkillScore?: number;
  alternativesRejected?: {
    alternative: string;
    modelProbability: number;
    reasonRejected: string;
  }[];
  explanation?: PredictionExplanation;
  // Context, Fragility & Substitutes
  fragilityScore?: number; // 0.0 - 1.0 composite fragility index
  fragilityFlags?: string[];
  substituteOption?: SubstituteOption | null;
  situationalPatterns?: SituationalPatternInsight[];
  // Official Lineup Review & Revisions
  lineupReviewFlag?: boolean; // Set true when a key player is missing and pick depended on them
  keyPlayerOutWarning?: string; // e.g. "Key striker Erling Haaland not in the XI"
  preLineupProbability?: number; // Pre-lineup probability before lineup release
  postLineupProbability?: number; // Post-lineup probability preview (highlight-only)
  lineupRevision?: number; // 1 = pre-lineup, 2 = post-lineup revision
  similarFixturesComparison?: SimilarFixturesComparison;
  attackingDefendingMatchup?: AttackingDefendingMatchup;
  isSubstituteOnly?: boolean;
  isGenericPick?: boolean;
  liveStateStatus?: LiveStateStatus;
  // Dixon Coles v2.5 Upgrades
  confidenceTier?: ConfidenceTier;
  calibratedProbability?: number;
  rawModelProbability?: number;
  uncertaintySpread?: number;
  ci90?: [number, number];
  riskFlags?: string[];
  whyPanel?: {
    headline?: string;
    factorsFor: string[];
    factorsAgainst: string[];
    riskFlags: string[];
    uncertaintySummary?: string;
    dataCompletenessPct?: number;
  };
  engineVersion?: string;
  dataCompletenessScore?: number;
  abstainReason?: string;
  actualStatValue?: string | number;
  lineComparisonText?: string;
  bookmakerName?: string;
  oddsTimestamp?: string;
  sanityTripwire?: boolean;
  tripwireReason?: string;
  skillVsDeviggedMarket?: number | null;
  deviggedMarketProb?: number;
  equivalentCanonicalKey?: string;
}

export type FixtureProfile = 
  | 'strong_favourite' 
  | 'tight_low_scoring' 
  | 'open_high_scoring' 
  | 'one_man_dependent' 
  | 'discipline_heavy' 
  | 'wing_set_piece' 
  | 'congested_rotation'
  | 'balanced_competitive';

export interface GoalMarginDistribution {
  favWinsBy1Prob: number;
  favWinsBy2Prob: number;
  favWinsBy3PlusProb: number;
  drawProb: number;
  underdogWinProb: number;
  totalGoalsDist: {
    under15Prob: number;
    exact2Prob: number;
    exact3Prob: number;
    over35Prob: number;
  };
}

export interface SubstituteOption {
  id: string;
  originalPredictionId: string;
  marketCode: string;
  marketName: string;
  selection: string;
  optionType: SupportedOptionType;
  modelProbability: number;
  baselineProbability?: number;
  edgeOverBaseline?: number;
  odds?: number;
  impliedProbability?: number;
  expectedValue?: number | null;
  varianceReductionPct: number; // e.g. 35% lower variance
  fragilityScore: number;
  reasonForSwap: string;
  isValidated: boolean;
  brierSkillScore?: number;
  marginDetails?: GoalMarginDistribution;
}

export interface SituationalPatternInsight {
  name: string;
  category: 'schedule' | 'team_market' | 'league_environment' | 'style_cluster' | 'gameweek';
  description: string;
  sampleSize: number;
  observedHitRate: number;
  leagueBaseline: number;
  shrunkHitRate: number;
  confidenceInterval95: [number, number];
  isAblationValidated: boolean;
  ablationGainBrier: number;
  effectDirection: 'positive' | 'negative' | 'neutral';
}

export interface SimilarFixturesComparison {
  similarMatchesCount: number;
  similarMatches: {
    fixtureName: string;
    date: string;
    score: string;
    similarityScore: number; // 0.0 - 1.0
  }[];
  marketHitRate: number;
  marketSampleSize: number;
  ci95: [number, number];
  divergenceFromModel: number; // |p_model - p_similar|
  divergenceWarning: boolean;
}

export interface AttackingDefendingMatchup {
  homeScoringReliability: number; // 0.0 - 1.0 based on shots on target, failed to score rate, 2+ goals
  awayScoringReliability: number;
  homeXgOverperformanceShrunk: number; // Shrunk G - xG differential
  awayXgOverperformanceShrunk: number;
  homeScorerDependence: number; // Max share of goals by single player (e.g. 0.42)
  awayScorerDependence: number;
  homeKeyAttackerStatus: 'available' | 'absent' | 'unconfirmed';
  awayKeyAttackerStatus: 'available' | 'absent' | 'unconfirmed';
  homeDefensiveAbsences: boolean;
  awayDefensiveAbsences: boolean;
  matchupAdvantageScore: number; // -1.0 to +1.0
  summary: string;
}

export interface LiveStateStatus {
  isLive: boolean;
  minute?: number;
  homeScore?: number;
  awayScore?: number;
  homeRedCards?: number;
  awayRedCards?: number;
  isSupersededByRedCard?: boolean;
  statusNotice: string;
}

export interface PlayerContribution {
  playerId: string;
  playerName: string;
  team: string;
  position: 'FW' | 'MF' | 'DF' | 'GK';
  minutesPlayed: number;
  goals: number;
  assists: number;
  xG: number;
  goalShare: number; // Fraction of team total goals (0.0 - 1.0)
  isPenaltyTaker: boolean;
  isCornerTaker: boolean;
  status: 'confirmed_starter' | 'bench' | 'absent' | 'unconfirmed';
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
  stateTags: StateTag[];
  lineupStatus: 'confirmed' | 'pre-lineup';
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
  byStateTag: {
    tag: StateTag;
    label: string;
    sampleSize: number;
    hitRate: number;
    brierScore: number;
    avgEdge: number;
    roi: number;
    calibrationSlope: number;
  }[];
}

export interface UserPreferences {
  timezone: string;
  preferredCompetitions: string[];
  favoriteTeams: string[];
  preferredMarkets: MarketCategory[];
  preferredOptionTypes?: SupportedOptionType[];
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

// Official Lineups & Lineup Comparison Types
export interface LineupPlayer {
  playerId: string;
  playerName: string;
  position: 'GK' | 'DF' | 'MF' | 'FW' | string;
  isStarter: boolean;
  isKeyPlayer?: boolean;
  isCaptain?: boolean;
  jerseyNumber?: number;
  minutesPlayed?: number;
  goals?: number;
  assists?: number;
  status?: string; // 'confirmed_starter' | 'benched' | 'sidelined'
}

export interface TeamLineup {
  teamId: string;
  teamName: string;
  formation: string; // e.g. '4-3-3'
  status: 'predicted' | 'confirmed';
  starters: LineupPlayer[];
  bench: LineupPlayer[];
  fetchedAt: string;
}

export interface LineupComparison {
  teamId: string;
  teamName: string;
  expectedFormation: string;
  confirmedFormation?: string;
  formationChanged: boolean;
  rotationCount: number; // starters changed from last match
  missingKeyPlayers: LineupPlayer[];
  surpriseStarters: LineupPlayer[];
  addedPlayers: LineupPlayer[];
  missingPlayers: LineupPlayer[];
  impactSummary: string[];
  hasKeyPlayerOut: boolean;
  keyPlayerOutNames: string[];
}

export interface FixtureLineupState {
  fixtureId: string;
  status: 'pending' | 'confirmed' | 'unreleased_late';
  expectedReleaseTimeFormatted: string; // e.g. "13:00 WAT"
  isWithin30MinsOfKickoff: boolean;
  home: {
    expected: TeamLineup;
    confirmed?: TeamLineup;
    comparison?: LineupComparison;
  };
  away: {
    expected: TeamLineup;
    confirmed?: TeamLineup;
    comparison?: LineupComparison;
  };
  anyKeyPlayerOut: boolean;
  firstKeyPlayerOutName?: string;
  pickReviewRequired: boolean;
  impactSummaries: string[];
}

export interface PickRevisionRecord {
  id: string;
  pickId: string;
  fixtureId: string;
  revisionNumber: number; // 1 = pre-lineup, 2 = post-lineup
  label: string; // e.g. "Revision 1 (Pre-lineup)" or "Revision 2 (Post-lineup)"
  recordedAt: string;
  kickoffTime: string;
  marketCode: string;
  marketName: string;
  selection: string;
  probability: number;
  odds?: number;
  lineupStatus: 'pre-lineup' | 'confirmed';
  changeSummary: string;
  keyPlayerOutFlag: boolean;
  keyPlayerOutName?: string;
  recordHash: string;
  gradingStatus: 'PENDING' | 'GRADED';
  settlementStatus?: 'WON' | 'LOST' | 'PUSH' | 'VOID';
  actualScore?: string;
  brierError?: number;
  logLoss?: number;
}
