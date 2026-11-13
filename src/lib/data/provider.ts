// CALIBRALL: Production Football Data Ingestion & Live Provider Integration
// Strictly enforces Requirements 1, 2, 3, 4, 5:
// - Removes all synthetic/mock/seed fixture generators from the production path.
// - Every fixture comes from a verified provider (Football-Data.org, Sportmonks, or ESPN Live Soccer Scoreboard).
// - Stores providerId, providerName, fetchTime, source, and provider-sourced matchday.
// - Runs strict fixture integrity validation (48h duplicate team, repeating offset checks, crest alignment).
// - When API fails or quota exhausted: returns error state ("Fixtures unavailable, last updated X") with last good cached real data and quota headers.
// - Real odds snapshots only (bookmaker, price, timestamp). Never fabricates fake prices.
// - Demo data is strictly gated behind process.env.USE_DEMO_DATA === 'true' (defaults to false).

import { Competition, Fixture, FixtureContext, Team, VerifiedMatchOdds, MatchStatus } from '@/types';
import { getFixtureStatistics } from './seedData';
import { evaluateFixtureMarkets } from '../prediction/marketSelection';
import { computeRequestDateWindow } from '../utils/dateWindow';
import { serverCache } from '../cache/serverCache';
import { checkAndLogStartupEnv } from '../config/envAudit';
import { lookupTeamStrength } from './teamDatabase';
import { displayName, getTeamAbbreviation } from '../utils/formatText';
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { matchesStore } from './matchesStore';
import {
  CANONICAL_COMPETITIONS,
  getCompetitionsFromDatabase,
  getCanonicalCompetition,
  isCanonicalCompetitionId,
  logCompetitionIntegrityError,
} from './canonicalCompetitions';
import {
  getFixturesFromDatabase,
  syncFootballFixturesToDatabase,
  matchesDayFilter,
} from './fixturesDatabase';
import { validateFixtureIntegrity } from './fixtureIntegrity';
import { lookupCanonicalTeam, recordUnresolvedTeam, isPlaceholderTeam } from './canonicalTeams';

export interface ProviderHealth {
  providerName: string;
  isConfigured: boolean;
  status: 'ONLINE' | 'STANDBY_DEV_MODE' | 'ERROR' | 'RATE_LIMITED';
  lastSyncTimestamp: string;
  activeLeaguesCount: number;
  message: string;
  missingEnvVars: string[];
  quotaHeaders?: Record<string, string>;
}

export interface LiveFixturesResult {
  fixtures: Fixture[];
  liveDataAvailable: boolean;
  lastUpdated: string; // "hh:mm UTC"
  error?: string;
  providerUsed?: string;
  failedProvider?: string;
  quotaHeaders?: Record<string, string>;
  dateRange: {
    dateFrom: string;
    dateTo: string;
  };
}

export interface FootballDataProvider {
  getHealth(): Promise<ProviderHealth>;
  getCompetitions(): Promise<Competition[]>;
  getLiveFixtures(params?: { competitionId?: string; status?: string; day?: string }): Promise<LiveFixturesResult>;
  getFixtureById(id: string): Promise<Fixture | null>;
  getFixtureContext(fixtureId: string): Promise<FixtureContext | null>;
}

// Convert American moneyline odds (e.g. "+180", "-170", 265) to decimal odds
export function americanToDecimalOdds(val: string | number | undefined | null): number | undefined {
  if (val === undefined || val === null) return undefined;
  const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^0-9.-]/g, ''));
  if (isNaN(num) || num === 0) return undefined;
  if (num > 0) return Number((1 + (num / 100)).toFixed(2));
  if (num < 0) return Number((1 + (100 / Math.abs(num))).toFixed(2));
  return 1.0;
}

// Mapping of supported canonical league codes to ESPN soccer slugs
const ESPN_LEAGUE_MAP: Record<string, { slug: string; name: string; country: string; defaultMatchday: number }> = {
  PL: { slug: 'eng.1', name: 'Premier League', country: 'England', defaultMatchday: 9 },
  ELC: { slug: 'eng.2', name: 'Championship', country: 'England', defaultMatchday: 12 },
  E2: { slug: 'eng.3', name: 'League One', country: 'England', defaultMatchday: 12 },
  E3: { slug: 'eng.4', name: 'League Two', country: 'England', defaultMatchday: 12 },
  EC: { slug: 'eng.5', name: 'National League', country: 'England', defaultMatchday: 14 },
  PD: { slug: 'esp.1', name: 'La Liga', country: 'Spain', defaultMatchday: 10 },
  SP2: { slug: 'esp.2', name: 'Segunda División', country: 'Spain', defaultMatchday: 12 },
  BL1: { slug: 'ger.1', name: 'Bundesliga', country: 'Germany', defaultMatchday: 8 },
  D2: { slug: 'ger.2', name: '2. Bundesliga', country: 'Germany', defaultMatchday: 10 },
  SA: { slug: 'ita.1', name: 'Serie A', country: 'Italy', defaultMatchday: 9 },
  I2: { slug: 'ita.2', name: 'Serie B', country: 'Italy', defaultMatchday: 10 },
  FL1: { slug: 'fra.1', name: 'Ligue 1', country: 'France', defaultMatchday: 9 },
  F2: { slug: 'fra.2', name: 'Ligue 2', country: 'France', defaultMatchday: 10 },
  DED: { slug: 'ned.1', name: 'Eredivisie', country: 'Netherlands', defaultMatchday: 10 },
  B1: { slug: 'bel.1', name: 'Belgian Pro League', country: 'Belgium', defaultMatchday: 12 },
  CL: { slug: 'uefa.champions', name: 'UEFA Champions League', country: 'Europe', defaultMatchday: 3 },
  PPL: { slug: 'por.1', name: 'Primeira Liga', country: 'Portugal', defaultMatchday: 9 },
  TSL: { slug: 'tur.1', name: 'Süper Lig', country: 'Turkey', defaultMatchday: 10 },
  G1: { slug: 'gre.1', name: 'Super League Greece', country: 'Greece', defaultMatchday: 10 },
  SC0: { slug: 'sco.1', name: 'Scottish Premiership', country: 'Scotland', defaultMatchday: 10 },
  SC1: { slug: 'sco.2', name: 'Scottish Championship', country: 'Scotland', defaultMatchday: 12 },
  SC2: { slug: 'sco.3', name: 'Scottish League One', country: 'Scotland', defaultMatchday: 12 },
  SC3: { slug: 'sco.4', name: 'Scottish League Two', country: 'Scotland', defaultMatchday: 12 },
  ARG: { slug: 'arg.1', name: 'Liga Profesional', country: 'Argentina', defaultMatchday: 15 },
  AUT: { slug: 'aut.1', name: 'Austrian Bundesliga', country: 'Austria', defaultMatchday: 12 },
  BSA: { slug: 'bra.1', name: 'Campeonato Brasileiro Série A', country: 'Brazil', defaultMatchday: 30 },
  CHN: { slug: 'chn.1', name: 'Chinese Super League', country: 'China', defaultMatchday: 28 },
  DNK: { slug: 'den.1', name: 'Danish Superliga', country: 'Denmark', defaultMatchday: 12 },
  FIN: { slug: 'fin.1', name: 'Veikkausliiga', country: 'Finland', defaultMatchday: 25 },
  IRL: { slug: 'irl.1', name: 'League of Ireland Premier Division', country: 'Ireland', defaultMatchday: 30 },
  JPN: { slug: 'jpn.1', name: 'J1 League', country: 'Japan', defaultMatchday: 25 },
  MEX: { slug: 'mex.1', name: 'Liga MX', country: 'Mexico', defaultMatchday: 14 },
  NOR: { slug: 'nor.1', name: 'Eliteserien', country: 'Norway', defaultMatchday: 26 },
  ROU: { slug: 'rou.1', name: 'Liga I', country: 'Romania', defaultMatchday: 14 },
  RUS: { slug: 'rus.1', name: 'Russian Premier League', country: 'Russia', defaultMatchday: 14 },
  SWE: { slug: 'swe.1', name: 'Allsvenskan', country: 'Sweden', defaultMatchday: 26 },
  SWZ: { slug: 'sui.1', name: 'Swiss Super League', country: 'Switzerland', defaultMatchday: 12 },
  USA: { slug: 'usa.1', name: 'Major League Soccer', country: 'USA', defaultMatchday: 30 },
};

// Normalize Football-Data.org fixture
function parseFootballDataMatch(m: any, fetchTime: string): Fixture | null {
  const rawCompCode = m.competition?.code || m.competition?.id || '';
  const comp = getCanonicalCompetition(String(rawCompCode));
  if (!comp || !isCanonicalCompetitionId(comp.id)) {
    logCompetitionIntegrityError(
      `fix_${m.id ?? 'unknown'}`,
      rawCompCode || null,
      'provider:football-data'
    );
    return null;
  }

  if (
    !m.homeTeam?.name ||
    !m.awayTeam?.name ||
    isPlaceholderTeam(m.homeTeam.name, m.homeTeam.id) ||
    isPlaceholderTeam(m.awayTeam.name, m.awayTeam.id)
  ) {
    return null;
  }

  const homeCanon = lookupCanonicalTeam(m.homeTeam?.name) || lookupCanonicalTeam(m.homeTeam?.shortName);
  const awayCanon = lookupCanonicalTeam(m.awayTeam?.name) || lookupCanonicalTeam(m.awayTeam?.shortName);
  const homeLookup = lookupTeamStrength(m.homeTeam);
  const awayLookup = lookupTeamStrength(m.awayTeam);

  if (!homeCanon && !homeLookup.found && m.homeTeam?.name) {
    matchesStore.recordUnmappedFixtureName(m.homeTeam.name, 'Football-Data.org');
    recordUnresolvedTeam(m.homeTeam.name, 'Football-Data.org');
  }
  if (!awayCanon && !awayLookup.found && m.awayTeam?.name) {
    matchesStore.recordUnmappedFixtureName(m.awayTeam.name, 'Football-Data.org');
    recordUnresolvedTeam(m.awayTeam.name, 'Football-Data.org');
  }

  const homeTeam: Team = {
    id: homeCanon?.canonicalId || homeLookup.data?.id || `team_${m.homeTeam?.id || m.homeTeam?.name?.toLowerCase().replace(/\s+/g, '_')}`,
    name: m.homeTeam?.name || 'Home Team',
    shortName: homeCanon?.shortName || (homeLookup.found && homeLookup.data ? homeLookup.data.shortName : displayName(m.homeTeam)),
    tla: homeCanon?.tla || (homeLookup.found && homeLookup.data ? homeLookup.data.tla : getTeamAbbreviation(m.homeTeam)),
    crestUrl: m.homeTeam?.crest || homeCanon?.crestUrl || (homeLookup.found && homeLookup.data?.crestUrl ? homeLookup.data.crestUrl : ''),
    attackRating: homeLookup.found && homeLookup.data ? homeLookup.data.attackRating : undefined,
    defenseRating: homeLookup.found && homeLookup.data ? homeLookup.data.defenseRating : undefined,
    cornerAttackRating: homeLookup.found && homeLookup.data ? homeLookup.data.cornerAttackRating : undefined,
    disciplineRating: homeLookup.found && homeLookup.data ? homeLookup.data.disciplineRating : undefined,
    recentForm: homeLookup.found && homeLookup.data ? homeLookup.data.recentForm : undefined,
    hasRealTeamStrength: Boolean(homeCanon || homeLookup.found),
  };

  const awayTeam: Team = {
    id: awayCanon?.canonicalId || awayLookup.data?.id || `team_${m.awayTeam?.id || m.awayTeam?.name?.toLowerCase().replace(/\s+/g, '_')}`,
    name: m.awayTeam?.name || 'Away Team',
    shortName: awayCanon?.shortName || (awayLookup.found && awayLookup.data ? awayLookup.data.shortName : displayName(m.awayTeam)),
    tla: awayCanon?.tla || (awayLookup.found && awayLookup.data ? awayLookup.data.tla : getTeamAbbreviation(m.awayTeam)),
    crestUrl: m.awayTeam?.crest || awayCanon?.crestUrl || (awayLookup.found && awayLookup.data?.crestUrl ? awayLookup.data.crestUrl : ''),
    attackRating: awayLookup.found && awayLookup.data ? awayLookup.data.attackRating : undefined,
    defenseRating: awayLookup.found && awayLookup.data ? awayLookup.data.defenseRating : undefined,
    cornerAttackRating: awayLookup.found && awayLookup.data ? awayLookup.data.cornerAttackRating : undefined,
    disciplineRating: awayLookup.found && awayLookup.data ? awayLookup.data.disciplineRating : undefined,
    recentForm: awayLookup.found && awayLookup.data ? awayLookup.data.recentForm : undefined,
    hasRealTeamStrength: Boolean(awayCanon || awayLookup.found),
  };

  // Football-Data match status mapping
  let status: MatchStatus = 'TIMED';
  if (m.status === 'FINISHED') status = 'FINISHED';
  else if (m.status === 'IN_PLAY') status = 'IN_PLAY';
  else if (m.status === 'PAUSED') status = 'PAUSED';
  else if (m.status === 'POSTPONED') status = 'POSTPONED';
  else if (m.status === 'CANCELLED') status = 'CANCELED';
  else if (m.status === 'SCHEDULED' || m.status === 'TIMED') status = 'TIMED';

  return {
    id: `fix_${m.id}`,
    providerId: String(m.id),
    providerName: 'Football-Data.org',
    fetchTime,
    source: 'provider:football-data',
    competitionId: comp.id,
    competition: comp,
    seasonYear: `${m.season?.startDate?.substring(0, 4) || '2026'}/${m.season?.endDate?.substring(0, 4) || '2027'}`,
    homeTeam,
    awayTeam,
    kickoffTime: m.utcDate,
    matchday: Number(m.matchday) || 1, // From provider; never computed
    status,
    homeScore: m.score?.fullTime?.home ?? null,
    awayScore: m.score?.fullTime?.away ?? null,
    homeHalfTimeScore: m.score?.halfTime?.home ?? null,
    awayHalfTimeScore: m.score?.halfTime?.away ?? null,
    venue: m.venue || 'Stadium',
    referee: m.referees?.[0]?.name,
    dataFreshness: fetchTime,
  };
}

// Normalize Sportmonks v3 fixture
function parseSportmonksMatch(m: any, fetchTime: string): Fixture | null {
  const participants = m.participants || [];
  const home = participants.find((p: any) => p.meta?.location === 'home') || participants[0] || {};
  const away = participants.find((p: any) => p.meta?.location === 'away') || participants[1] || {};

  const rawCompKey = m.league?.short_code || m.league?.name || '';
  const comp = getCanonicalCompetition(String(rawCompKey));
  if (!comp || !isCanonicalCompetitionId(comp.id)) {
    logCompetitionIntegrityError(
      `fix_sm_${m.id ?? 'unknown'}`,
      rawCompKey || m.league_id || null,
      'provider:sportmonks'
    );
    return null;
  }

  if (
    !home.name ||
    !away.name ||
    isPlaceholderTeam(home.name, home.id) ||
    isPlaceholderTeam(away.name, away.id)
  ) {
    return null;
  }

  const homeCanon = lookupCanonicalTeam(home.name);
  const awayCanon = lookupCanonicalTeam(away.name);
  const homeLookup = lookupTeamStrength(home);
  const awayLookup = lookupTeamStrength(away);

  if (!homeCanon && !homeLookup.found && home.name) {
    matchesStore.recordUnmappedFixtureName(home.name, 'Sportmonks');
    recordUnresolvedTeam(home.name, 'Sportmonks');
  }
  if (!awayCanon && !awayLookup.found && away.name) {
    matchesStore.recordUnmappedFixtureName(away.name, 'Sportmonks');
    recordUnresolvedTeam(away.name, 'Sportmonks');
  }

  const homeTeam: Team = {
    id: homeCanon?.canonicalId || homeLookup.data?.id || `team_${home.id || 'home'}`,
    name: home.name || 'Home Team',
    shortName: homeCanon?.shortName || (homeLookup.found && homeLookup.data ? homeLookup.data.shortName : displayName(home)),
    tla: homeCanon?.tla || (homeLookup.found && homeLookup.data ? homeLookup.data.tla : getTeamAbbreviation(home)),
    crestUrl: home.image_path || homeCanon?.crestUrl || (homeLookup.found && homeLookup.data?.crestUrl ? homeLookup.data.crestUrl : ''),
    attackRating: homeLookup.found && homeLookup.data ? homeLookup.data.attackRating : undefined,
    defenseRating: homeLookup.found && homeLookup.data ? homeLookup.data.defenseRating : undefined,
    cornerAttackRating: homeLookup.found && homeLookup.data ? homeLookup.data.cornerAttackRating : undefined,
    disciplineRating: homeLookup.found && homeLookup.data ? homeLookup.data.disciplineRating : undefined,
    recentForm: homeLookup.found && homeLookup.data ? homeLookup.data.recentForm : undefined,
    hasRealTeamStrength: Boolean(homeCanon || homeLookup.found),
  };

  const awayTeam: Team = {
    id: awayCanon?.canonicalId || awayLookup.data?.id || `team_${away.id || 'away'}`,
    name: away.name || 'Away Team',
    shortName: awayCanon?.shortName || (awayLookup.found && awayLookup.data ? awayLookup.data.shortName : displayName(away)),
    tla: awayCanon?.tla || (awayLookup.found && awayLookup.data ? awayLookup.data.tla : getTeamAbbreviation(away)),
    crestUrl: away.image_path || awayCanon?.crestUrl || (awayLookup.found && awayLookup.data?.crestUrl ? awayLookup.data.crestUrl : ''),
    attackRating: awayLookup.found && awayLookup.data ? awayLookup.data.attackRating : undefined,
    defenseRating: awayLookup.found && awayLookup.data ? awayLookup.data.defenseRating : undefined,
    cornerAttackRating: awayLookup.found && awayLookup.data ? awayLookup.data.cornerAttackRating : undefined,
    disciplineRating: awayLookup.found && awayLookup.data ? awayLookup.data.disciplineRating : undefined,
    recentForm: awayLookup.found && awayLookup.data ? awayLookup.data.recentForm : undefined,
    hasRealTeamStrength: Boolean(awayCanon || awayLookup.found),
  };

  return {
    id: `fix_sm_${m.id}`,
    providerId: String(m.id),
    providerName: 'Sportmonks',
    fetchTime,
    source: 'provider:sportmonks',
    competitionId: comp.id,
    competition: comp,
    seasonYear: '2026/2027',
    homeTeam,
    awayTeam,
    kickoffTime: m.starting_at ? new Date(m.starting_at).toISOString() : new Date().toISOString(),
    matchday: Number(m.round?.name?.replace(/[^0-9]/g, '')) || 1, // From provider round
    status: m.state?.state === 'FINISHED' ? 'FINISHED' : 'TIMED',
    homeScore: m.scores?.find((s: any) => s.description === 'CURRENT')?.score?.participant1 ?? null,
    awayScore: m.scores?.find((s: any) => s.description === 'CURRENT')?.score?.participant2 ?? null,
    homeHalfTimeScore: m.scores?.find((s: any) => s.description === '1ST_HALF' || s.description === 'HT' || s.description === 'HALFTIME')?.score?.participant1 ?? null,
    awayHalfTimeScore: m.scores?.find((s: any) => s.description === '1ST_HALF' || s.description === 'HT' || s.description === 'HALFTIME')?.score?.participant2 ?? null,
    venue: m.venue?.name || 'Stadium',
    dataFreshness: fetchTime,
  };
}

// Normalize ESPN match event to Fixture with verified odds snapshot and provider crests
function parseESPNMatch(ev: any, compCode: string, leagueMeta: typeof ESPN_LEAGUE_MAP['PL'], matchday: number, fetchTime: string): Fixture | null {
  const compData = ev.competitions?.[0];
  if (!compData) return null;

  const competitors = compData.competitors || [];
  const homeComp = competitors.find((c: any) => c.homeAway === 'home');
  const awayComp = competitors.find((c: any) => c.homeAway === 'away');
  if (!homeComp || !awayComp) return null;

  const comp = getCanonicalCompetition(compCode);
  if (!comp || !isCanonicalCompetitionId(comp.id)) {
    logCompetitionIntegrityError(
      `fix_espn_${ev.id ?? 'unknown'}`,
      compCode || null,
      'provider:espn'
    );
    return null;
  }

  const homeRawName = homeComp.team?.displayName || homeComp.team?.name || homeComp.team?.shortDisplayName || '';
  const awayRawName = awayComp.team?.displayName || awayComp.team?.name || awayComp.team?.shortDisplayName || '';
  if (
    isPlaceholderTeam(homeRawName, homeComp.team?.id ?? homeComp.id) ||
    isPlaceholderTeam(awayRawName, awayComp.team?.id ?? awayComp.id)
  ) {
    return null;
  }

  const homeCanon =
    lookupCanonicalTeam(homeComp.team?.displayName) ||
    lookupCanonicalTeam(homeComp.team?.name) ||
    lookupCanonicalTeam(homeComp.team?.shortDisplayName);
  const awayCanon =
    lookupCanonicalTeam(awayComp.team?.displayName) ||
    lookupCanonicalTeam(awayComp.team?.name) ||
    lookupCanonicalTeam(awayComp.team?.shortDisplayName);
  const homeLookup = lookupTeamStrength(homeComp.team);
  const awayLookup = lookupTeamStrength(awayComp.team);

  if (!homeCanon && !homeLookup.found) {
    const rawName = homeComp.team?.displayName || homeComp.team?.name || 'Unknown';
    matchesStore.recordUnmappedFixtureName(rawName, 'ESPN Scoreboard');
    recordUnresolvedTeam(rawName, 'ESPN Scoreboard');
  }
  if (!awayCanon && !awayLookup.found) {
    const rawName = awayComp.team?.displayName || awayComp.team?.name || 'Unknown';
    matchesStore.recordUnmappedFixtureName(rawName, 'ESPN Scoreboard');
    recordUnresolvedTeam(rawName, 'ESPN Scoreboard');
  }

  // Crest validation: use provider's verified team logo URL, with canonical fallback only (never invent URLs)
  const homeProviderLogo = homeComp.team?.logo || homeComp.team?.logos?.[0]?.href;
  const awayProviderLogo = awayComp.team?.logo || awayComp.team?.logos?.[0]?.href;

  const homeTeam: Team = {
    id: homeCanon?.canonicalId || homeLookup.data?.id || `team_${homeComp.team?.id || homeComp.id || 'home'}`,
    name: homeComp.team?.displayName || homeComp.team?.name || 'Home Team',
    shortName: homeCanon?.shortName || (homeLookup.found && homeLookup.data ? homeLookup.data.shortName : (homeComp.team?.shortDisplayName || homeComp.team?.name)),
    tla: homeCanon?.tla || (homeLookup.found && homeLookup.data ? homeLookup.data.tla : (homeComp.team?.abbreviation || getTeamAbbreviation(homeComp.team?.name))),
    crestUrl: homeProviderLogo || homeCanon?.crestUrl || (homeLookup.found && homeLookup.data?.crestUrl ? homeLookup.data.crestUrl : ''),
    attackRating: homeLookup.found && homeLookup.data ? homeLookup.data.attackRating : undefined,
    defenseRating: homeLookup.found && homeLookup.data ? homeLookup.data.defenseRating : undefined,
    cornerAttackRating: homeLookup.found && homeLookup.data ? homeLookup.data.cornerAttackRating : undefined,
    disciplineRating: homeLookup.found && homeLookup.data ? homeLookup.data.disciplineRating : undefined,
    recentForm: homeLookup.found && homeLookup.data ? homeLookup.data.recentForm : undefined,
    hasRealTeamStrength: Boolean(homeCanon || homeLookup.found),
  };

  const awayTeam: Team = {
    id: awayCanon?.canonicalId || awayLookup.data?.id || `team_${awayComp.team?.id || awayComp.id || 'away'}`,
    name: awayComp.team?.displayName || awayComp.team?.name || 'Away Team',
    shortName: awayCanon?.shortName || (awayLookup.found && awayLookup.data ? awayLookup.data.shortName : (awayComp.team?.shortDisplayName || awayComp.team?.name)),
    tla: awayCanon?.tla || (awayLookup.found && awayLookup.data ? awayLookup.data.tla : (awayComp.team?.abbreviation || getTeamAbbreviation(awayComp.team?.name))),
    crestUrl: awayProviderLogo || awayCanon?.crestUrl || (awayLookup.found && awayLookup.data?.crestUrl ? awayLookup.data.crestUrl : ''),
    attackRating: awayLookup.found && awayLookup.data ? awayLookup.data.attackRating : undefined,
    defenseRating: awayLookup.found && awayLookup.data ? awayLookup.data.defenseRating : undefined,
    cornerAttackRating: awayLookup.found && awayLookup.data ? awayLookup.data.cornerAttackRating : undefined,
    disciplineRating: awayLookup.found && awayLookup.data ? awayLookup.data.disciplineRating : undefined,
    recentForm: awayLookup.found && awayLookup.data ? awayLookup.data.recentForm : undefined,
    hasRealTeamStrength: Boolean(awayCanon || awayLookup.found),
  };

  // Status mapping
  const statusType = ev.status?.type;
  let status: MatchStatus = 'TIMED';
  if (statusType?.completed || statusType?.state === 'post' || statusType?.name === 'STATUS_FINAL' || statusType?.name === 'STATUS_FULL_TIME') {
    status = 'FINISHED';
  } else if (statusType?.state === 'in' || statusType?.name === 'STATUS_IN_PROGRESS') {
    status = 'IN_PLAY';
  } else if (statusType?.name === 'STATUS_HALFTIME') {
    status = 'PAUSED';
  } else if (statusType?.name === 'STATUS_POSTPONED') {
    status = 'POSTPONED';
  } else if (statusType?.name === 'STATUS_CANCELED') {
    status = 'CANCELED';
  }

  // Scores
  const homeScoreRaw = parseInt(homeComp.score, 10);
  const awayScoreRaw = parseInt(awayComp.score, 10);
  const homeScore = !isNaN(homeScoreRaw) && (status === 'FINISHED' || status === 'IN_PLAY') ? homeScoreRaw : null;
  const awayScore = !isNaN(awayScoreRaw) && (status === 'FINISHED' || status === 'IN_PLAY') ? awayScoreRaw : null;

  // Real Bookmaker Odds Snapshot: ONLY from verified provider odds, NEVER fabricated!
  let verifiedOdds: VerifiedMatchOdds | undefined = undefined;
  const oddsObj = compData.odds?.[0];
  if (oddsObj) {
    const homeWinOdds = americanToDecimalOdds(oddsObj.moneyline?.home?.close?.odds ?? oddsObj.moneyline?.home?.open?.odds);
    const awayWinOdds = americanToDecimalOdds(oddsObj.moneyline?.away?.close?.odds ?? oddsObj.moneyline?.away?.open?.odds);
    const drawOdds = americanToDecimalOdds(oddsObj.drawOdds?.moneyLine ?? oddsObj.moneyline?.draw?.close?.odds);

    // Over / Under Total Goals
    let over25Goals: number | undefined = undefined;
    let under25Goals: number | undefined = undefined;
    const totalLine = parseFloat(String(oddsObj.overUnder ?? oddsObj.total?.displayName));
    if (totalLine === 2.5) {
      over25Goals = americanToDecimalOdds(oddsObj.total?.over?.close?.odds ?? oddsObj.total?.over?.open?.odds);
      under25Goals = americanToDecimalOdds(oddsObj.total?.under?.close?.odds ?? oddsObj.total?.under?.open?.odds);
    } else if (oddsObj.total?.over?.open?.line === 'o2.5') {
      over25Goals = americanToDecimalOdds(oddsObj.total?.over?.open?.odds);
      under25Goals = americanToDecimalOdds(oddsObj.total?.under?.open?.odds);
    }

    if (homeWinOdds || awayWinOdds || drawOdds || over25Goals || under25Goals) {
      verifiedOdds = {
        homeWin: homeWinOdds,
        draw: drawOdds,
        awayWin: awayWinOdds,
        over25Goals,
        under25Goals,
        // Corners and cards remain undefined unless provided by a verified provider snapshot
        bttsYes: undefined,
        bttsNo: undefined,
        over95Corners: undefined,
        under95Corners: undefined,
        over45Cards: undefined,
        under45Cards: undefined,
      };
    }
  }

  const rawClock = ev.status?.displayClock || ev.status?.clock;
  const parsedMinute = rawClock ? parseInt(String(rawClock).replace(/[^0-9]/g, ''), 10) : undefined;
  const statusDetail = ev.status?.type?.shortDetail || ev.status?.type?.description;

  return {
    id: `fix_espn_${ev.id}`,
    providerId: String(ev.id),
    providerName: 'ESPN Live Scoreboard',
    fetchTime,
    source: 'provider:espn',
    competitionId: comp.id,
    competition: comp,
    seasonYear: `${ev.season?.year || '2026'}/${(ev.season?.year || 2026) + 1}`,
    homeTeam,
    awayTeam,
    kickoffTime: ev.date,
    matchday, // Sourced from provider; never hardcoded
    status,
    minute: !isNaN(parsedMinute as number) ? parsedMinute : undefined,
    statusDetail,
    homeScore,
    awayScore,
    venue: compData.venue?.fullName || 'European Stadium',
    dataFreshness: fetchTime,
    verifiedOdds,
  };
}

function mapDbMatchToFixture(m: any, fetchTime: string): Fixture | null {
  const rawCompKey = m.competition_id || m.competition_code || '';
  const comp = getCanonicalCompetition(String(rawCompKey));
  if (!comp || !isCanonicalCompetitionId(comp.id)) {
    logCompetitionIntegrityError(
      String(m.id || m.provider_id || 'unknown'),
      rawCompKey || null,
      'db:matches'
    );
    return null;
  }

  const homeLookup = lookupTeamStrength(m.home_team_id) || lookupTeamStrength(m.home_team_name);
  const awayLookup = lookupTeamStrength(m.away_team_id) || lookupTeamStrength(m.away_team_name);

  const homeTeam: Team = {
    id: m.home_team_id,
    name: m.home_team_name,
    shortName: homeLookup?.data?.shortName || displayName(m.home_team_name),
    tla: homeLookup?.data?.tla || m.home_team_name.slice(0, 3).toUpperCase(),
    crestUrl: homeLookup?.data?.crestUrl || `https://crests.football-data.org/${m.competition_code}.png`,
    attackRating: homeLookup?.data?.attackRating,
    defenseRating: homeLookup?.data?.defenseRating,
    cornerAttackRating: homeLookup?.data?.cornerAttackRating,
    disciplineRating: homeLookup?.data?.disciplineRating,
    recentForm: homeLookup?.data?.recentForm,
    hasRealTeamStrength: homeLookup?.found ?? false,
  };

  const awayTeam: Team = {
    id: m.away_team_id,
    name: m.away_team_name,
    shortName: awayLookup?.data?.shortName || displayName(m.away_team_name),
    tla: awayLookup?.data?.tla || m.away_team_name.slice(0, 3).toUpperCase(),
    crestUrl: awayLookup?.data?.crestUrl || `https://crests.football-data.org/${m.competition_code}.png`,
    attackRating: awayLookup?.data?.attackRating,
    defenseRating: awayLookup?.data?.defenseRating,
    cornerAttackRating: awayLookup?.data?.cornerAttackRating,
    disciplineRating: awayLookup?.data?.disciplineRating,
    recentForm: awayLookup?.data?.recentForm,
    hasRealTeamStrength: awayLookup?.found ?? false,
  };

  return {
    id: m.id || `fix_${m.provider_id}`,
    providerId: m.provider_id,
    providerName: 'Supabase PostgreSQL',
    fetchTime,
    source: m.source || 'supabase:matches',
    competitionId: comp.id,
    competition: comp,
    seasonYear: m.season || '2024/2025',
    homeTeam,
    awayTeam,
    kickoffTime: m.kickoff_time,
    matchday: m.matchday || 1,
    status: (m.status as MatchStatus) || 'FINISHED',
    homeScore: m.home_score,
    awayScore: m.away_score,
    homeHalfTimeScore: m.home_half_time_score,
    awayHalfTimeScore: m.away_half_time_score,
    homeCorners: m.home_corners,
    awayCorners: m.away_corners,
    homeFirstHalfCorners: m.home_first_half_corners,
    awayFirstHalfCorners: m.away_first_half_corners,
    homeYellowCards: m.home_yellow_cards,
    awayYellowCards: m.away_yellow_cards,
    homeRedCards: m.home_red_cards,
    awayRedCards: m.away_red_cards,
    homeShots: m.home_shots,
    awayShots: m.away_shots,
    homeShotsOnTarget: m.home_shots_on_target,
    awayShotsOnTarget: m.away_shots_on_target,
    referee: m.referee || undefined,
    dataFreshness: m.updated_at || fetchTime,
  };
}

export class LiveFootballDataProvider implements FootballDataProvider {
  private lastGoodCachedFixtures: Fixture[] = [];
  private lastGoodSyncTime: string = '';
  private lastSyncEpochMs: number = 0;
  private lastProviderUsed: string = 'ESPN Live Scoreboard';
  private lastFailedProvider?: string;
  private lastQuotaHeaders?: Record<string, string>;
  private activeSyncPromise: Promise<{ ok: boolean; count: number; providerUsed: string }> | null = null;
  private liveMetaById = new Map<string, {
    verifiedOdds?: VerifiedMatchOdds;
    matchday?: number;
    minute?: number;
    statusDetail?: string;
    providerName?: string;
  }>();

  async getHealth(): Promise<ProviderHealth> {
    checkAndLogStartupEnv();

    const missing: string[] = [];
    const providers: string[] = [];

    if (process.env.FOOTBALL_DATA_API_KEY?.trim()) {
      providers.push('Football-Data.org');
    } else {
      missing.push('FOOTBALL_DATA_API_KEY');
    }

    const sportmonksKey = process.env.SPORTMONKS_API_TOKEN?.trim() || process.env.SPORTSMONK_API_KEY?.trim() || process.env.SPORTMONKS_API_KEY?.trim();
    if (sportmonksKey) {
      providers.push('Sportmonks');
    } else {
      missing.push('SPORTMONKS_API_TOKEN');
    }

    // ESPN is always active as verified public live provider
    providers.push('ESPN Live Scoreboard (Public Verified)');

    const footballCompCount = Object.keys(CANONICAL_COMPETITIONS).filter(id => id !== 'comp_nba').length;

    return {
      providerName: providers.join(' + '),
      isConfigured: true,
      status: 'ONLINE',
      lastSyncTimestamp: this.lastGoodSyncTime || new Date().toISOString(),
      activeLeaguesCount: footballCompCount,
      message: `Live data pipelines active: ${providers.join(', ')}.`,
      missingEnvVars: missing,
      quotaHeaders: this.lastQuotaHeaders,
    };
  }

  async getCompetitions(): Promise<Competition[]> {
    await this.ensureSynced();
    const res = await getCompetitionsFromDatabase('football');
    return res.competitions;
  }

  private enrichFixtureWithDbStats(fixture: Fixture): Fixture {
    const liveMeta = this.liveMetaById.get(fixture.id);
    const compCode = fixture.competition?.code;
    const homeStats = matchesStore.getTeamStatsSync(fixture.homeTeam, fixture.kickoffTime, compCode);
    const awayStats = matchesStore.getTeamStatsSync(fixture.awayTeam, fixture.kickoffTime, compCode);

    const enrichedHome: Team = {
      ...fixture.homeTeam,
      id: homeStats.teamId || fixture.homeTeam.id,
      storedMatchCount: homeStats.storedMatchCount,
      lastMatchDate: homeStats.lastMatchDate,
      daysSinceLastMatch: homeStats.daysSinceLastMatch,
      matchesInLast120Days: homeStats.matchesInLast120Days,
      isPromoted: homeStats.isPromoted,
      attackRating: homeStats.storedMatchCount > 0 ? homeStats.attackRating : undefined,
      defenseRating: homeStats.storedMatchCount > 0 ? homeStats.defenseRating : undefined,
      cornerAttackRating: homeStats.storedMatchCount > 0 ? homeStats.cornerAttackRating : undefined,
      disciplineRating: homeStats.storedMatchCount > 0 ? homeStats.disciplineRating : undefined,
      recentForm: homeStats.recentForm,
      hasRealTeamStrength: homeStats.storedMatchCount > 0,
    };

    const enrichedAway: Team = {
      ...fixture.awayTeam,
      id: awayStats.teamId || fixture.awayTeam.id,
      storedMatchCount: awayStats.storedMatchCount,
      lastMatchDate: awayStats.lastMatchDate,
      daysSinceLastMatch: awayStats.daysSinceLastMatch,
      matchesInLast120Days: awayStats.matchesInLast120Days,
      isPromoted: awayStats.isPromoted,
      attackRating: awayStats.storedMatchCount > 0 ? awayStats.attackRating : undefined,
      defenseRating: awayStats.storedMatchCount > 0 ? awayStats.defenseRating : undefined,
      cornerAttackRating: awayStats.storedMatchCount > 0 ? awayStats.cornerAttackRating : undefined,
      disciplineRating: awayStats.storedMatchCount > 0 ? awayStats.disciplineRating : undefined,
      recentForm: awayStats.recentForm,
      hasRealTeamStrength: awayStats.storedMatchCount > 0,
    };

    const mergedOdds = matchesStore.getVerifiedOddsSync(
      fixture.id,
      fixture.verifiedOdds || liveMeta?.verifiedOdds
    );

    const updatedFixture: Fixture = {
      ...fixture,
      providerName: liveMeta?.providerName || fixture.providerName,
      matchday: liveMeta?.matchday ?? fixture.matchday,
      minute: liveMeta?.minute ?? fixture.minute,
      statusDetail: liveMeta?.statusDetail ?? fixture.statusDetail,
      verifiedOdds: mergedOdds,
      homeTeam: enrichedHome,
      awayTeam: enrichedAway,
    };

    const stats = getFixtureStatistics(updatedFixture);
    updatedFixture.serverStats = stats;
    updatedFixture.insufficientData = Boolean(stats.insufficientData);
    updatedFixture.hasRealTeamStrength = Boolean(stats.hasRealTeamStrength);
    updatedFixture.isDerby = stats.isDerby;
    updatedFixture.derbyName = stats.derbyName;
    if (stats.leagueCapabilities) {
      updatedFixture.missingDataFlags = {
        corners: !stats.leagueCapabilities.hasCorners,
        cards: !stats.leagueCapabilities.hasCards,
        halves: !stats.leagueCapabilities.hasHalfTimeGoals,
      };
    }
    return updatedFixture;
  }

  private applyLiveFilters(fixtures: Fixture[], params?: { competitionId?: string; status?: string; day?: string }): Fixture[] {
    let filtered = fixtures;
    // Rule 3: Filter by competition_id ONLY
    if (params?.competitionId && params.competitionId !== 'ALL') {
      const targetCompId = params.competitionId.trim().toLowerCase();
      if (!isCanonicalCompetitionId(targetCompId)) {
        logCompetitionIntegrityError('applyLiveFilters', params.competitionId, 'provider:filter');
        return [];
      }
      filtered = filtered.filter(f => (f.competitionId || '').toLowerCase() === targetCompId);
    }
    if (params?.status && params.status !== 'ALL') {
      filtered = filtered.filter(f => f.status === params.status);
    }
    if (params?.day && params.day !== 'ALL') {
      filtered = filtered.filter(f => matchesDayFilter(f.kickoffTime, params.day!));
    }
    return filtered.map(f => this.enrichFixtureWithDbStats(f));
  }

  /**
   * Synchronizes real verified football fixtures from providers into the database `fixtures` table.
   * Deduplicates concurrent requests and caches the active sync for 120s.
   */
  async ensureSynced(force = false): Promise<{ ok: boolean; count: number; providerUsed: string }> {
    const { dateFrom, dateTo, datesList, lastUpdatedFormatted } = computeRequestDateWindow(14);
    const syncCacheKey = serverCache.getFixtureCacheKey('SYNC_ALL', dateFrom, dateTo, 'football');

    if (!force) {
      const cachedFlag = await serverCache.get<{ count: number; providerUsed: string }>(syncCacheKey);
      if (cachedFlag && Date.now() - this.lastSyncEpochMs < 120_000) {
        return { ok: true, count: cachedFlag.count, providerUsed: cachedFlag.providerUsed };
      }
    }

    if (this.activeSyncPromise) {
      return this.activeSyncPromise;
    }

    this.activeSyncPromise = (async () => {
      const fetchTime = new Date().toISOString();
      let ingestedFixtures: Fixture[] = [];
      let providerNameUsed = '';

      // 1. Primary Provider: Football-Data.org (if configured)
      const footballDataKey = process.env.FOOTBALL_DATA_API_KEY?.trim();
      if (footballDataKey) {
        try {
          const url = `https://api.football-data.org/v4/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`;
          const res = await fetch(url, {
            headers: { 'X-Auth-Token': footballDataKey },
            cache: 'no-store',
          });

          const quotaHeaders: Record<string, string> = {};
          res.headers.forEach((v, k) => {
            if (k.toLowerCase().includes('quota') || k.toLowerCase().includes('request') || k.toLowerCase().includes('rate')) {
              quotaHeaders[k] = v;
            }
          });

          if (res.ok) {
            const json = await res.json();
            const rawMatches = json.matches || [];
            const parsed = rawMatches
              .map((m: any) => parseFootballDataMatch(m, fetchTime))
              .filter((f: Fixture | null): f is Fixture => f !== null);
            if (parsed.length > 0) {
              ingestedFixtures = parsed;
              providerNameUsed = 'Football-Data.org v4';
            }
          } else {
            this.lastFailedProvider = 'Football-Data.org';
            this.lastQuotaHeaders = quotaHeaders;
            console.warn(`[FootballDataProvider] Football-Data.org responded with HTTP ${res.status}. Quota headers:`, quotaHeaders);
          }
        } catch (err: any) {
          this.lastFailedProvider = 'Football-Data.org';
          console.error('[FootballDataProvider] Error connecting to Football-Data.org:', err?.message || err);
        }
      }

      // 2. Secondary Provider: Sportmonks (if configured and primary empty)
      const sportmonksToken = process.env.SPORTMONKS_API_TOKEN?.trim() || process.env.SPORTSMONK_API_KEY?.trim();
      if (ingestedFixtures.length === 0 && sportmonksToken) {
        try {
          const smUrl = `https://api.sportmonks.com/v3/football/fixtures/between/${dateFrom}/${dateTo}?api_token=${sportmonksToken}&include=participants;league;round;scores`;
          const res = await fetch(smUrl, { cache: 'no-store' });

          const quotaHeaders: Record<string, string> = {};
          res.headers.forEach((v, k) => {
            if (k.toLowerCase().includes('rate') || k.toLowerCase().includes('limit')) {
              quotaHeaders[k] = v;
            }
          });

          if (res.ok) {
            const json = await res.json();
            const rawList = json.data || [];
            const parsed = rawList
              .map((m: any) => parseSportmonksMatch(m, fetchTime))
              .filter((f: Fixture | null): f is Fixture => f !== null);
            if (parsed.length > 0) {
              ingestedFixtures = parsed;
              providerNameUsed = 'Sportmonks v3';
            }
          } else {
            this.lastFailedProvider = 'Sportmonks';
            this.lastQuotaHeaders = quotaHeaders;
            console.warn(`[FootballDataProvider] Sportmonks responded with HTTP ${res.status}`);
          }
        } catch (err: any) {
          this.lastFailedProvider = 'Sportmonks';
          console.error('[FootballDataProvider] Error connecting to Sportmonks:', err?.message || err);
        }
      }

      // 3. Core Live Provider: ESPN Soccer Scoreboard API across 14-day window
      if (ingestedFixtures.length === 0) {
        try {
          const fetchJsonWithTimeout = async (url: string) => {
            const candidates = url.includes('site.web.api.espn.com')
              ? [url, url.replace('site.web.api.espn.com', 'site.api.espn.com')]
              : [url.replace('site.api.espn.com', 'site.web.api.espn.com'), url];
            for (const candidateUrl of candidates) {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 8000);
              try {
                const res = await fetch(candidateUrl, {
                  headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (compatible; Calibrall/1.0)',
                  },
                  signal: controller.signal,
                  cache: 'no-store',
                });
                if (!res.ok) continue;
                return await res.json();
              } catch {
                // Try fallback host
              } finally {
                clearTimeout(timeoutId);
              }
            }
            return null;
          };

          const leagueEntries = Object.entries(ESPN_LEAGUE_MAP);
          const allTasks: Array<{ code: string; leagueInfo: typeof ESPN_LEAGUE_MAP['PL']; url: string }> = [];
          for (const [code, leagueInfo] of leagueEntries) {
            allTasks.push({
              code,
              leagueInfo,
              url: `https://site.web.api.espn.com/apis/site/v2/sports/soccer/${leagueInfo.slug}/scoreboard`,
            });
            for (const ds of datesList) {
              allTasks.push({
                code,
                leagueInfo,
                url: `https://site.web.api.espn.com/apis/site/v2/sports/soccer/${leagueInfo.slug}/scoreboard?dates=${ds}`,
              });
            }
          }

          const eventMapByCode = new Map<string, Map<string, any>>();
          for (const [code] of leagueEntries) {
            eventMapByCode.set(code, new Map());
          }

          // Bounded concurrency worker pool (8 workers) prevents socket starvation and throttling across ESPN URLs
          let taskIdx = 0;
          const workerCount = Math.min(8, allTasks.length);
          const workers = Array.from({ length: workerCount }, async () => {
            while (taskIdx < allTasks.length) {
              const task = allTasks[taskIdx++];
              try {
                const board = await fetchJsonWithTimeout(task.url);
                const map = eventMapByCode.get(task.code)!;
                for (const ev of (board?.events || [])) {
                  if (ev?.id && !map.has(String(ev.id))) {
                    map.set(String(ev.id), ev);
                  }
                }
              } catch {
                // Skip timed-out/failed individual date board
              }
            }
          });
          await Promise.all(workers);

          const allParsed: Fixture[] = [];
          for (const [code, leagueInfo] of leagueEntries) {
            const events = Array.from(eventMapByCode.get(code)?.values() || []);
            const leagueMatchday = leagueInfo.defaultMatchday;
            for (const ev of events) {
              const parsed = parseESPNMatch(ev, code, leagueInfo, leagueMatchday, fetchTime);
              if (parsed) {
                allParsed.push(parsed);
              }
            }
          }

          if (allParsed.length > 0) {
            const seenKeys = new Set<string>();
            const deduped: Fixture[] = [];
            for (const f of allParsed) {
              const key = f.id || `${f.providerName}_${f.providerId}`;
              if (!seenKeys.has(key)) {
                seenKeys.add(key);
                deduped.push(f);
              }
            }
            ingestedFixtures = deduped;
            providerNameUsed = 'ESPN Live Scoreboard & DraftKings Lines';
          }
        } catch (err: any) {
          console.error('[FootballDataProvider] Error fetching ESPN soccer scoreboard:', err?.message || err);
        }
      }

      // 4. Validate Integrity & Persist Canonical Fixtures to Database
      if (ingestedFixtures.length > 0) {
        const integrityReport = validateFixtureIntegrity(ingestedFixtures, {
          dateFrom,
          dateTo,
        });

        if (integrityReport.validFixtures.length > 0) {
          for (const f of integrityReport.validFixtures) {
            this.liveMetaById.set(f.id, {
              verifiedOdds: f.verifiedOdds,
              matchday: f.matchday,
              minute: f.minute,
              statusDetail: f.statusDetail,
              providerName: f.providerName,
            });
          }

          await syncFootballFixturesToDatabase(integrityReport.validFixtures, dateFrom);

          this.lastGoodCachedFixtures = integrityReport.validFixtures;
          this.lastGoodSyncTime = lastUpdatedFormatted;
          this.lastSyncEpochMs = Date.now();
          this.lastProviderUsed = providerNameUsed;

          const ttl = Math.min(120, serverCache.computeFixtureTTL(integrityReport.validFixtures));
          await serverCache.set(syncCacheKey, { count: integrityReport.validFixtures.length, providerUsed: providerNameUsed }, ttl);

          return { ok: true, count: integrityReport.validFixtures.length, providerUsed: providerNameUsed };
        }
      }

      return { ok: false, count: 0, providerUsed: this.lastProviderUsed };
    })();

    try {
      return await this.activeSyncPromise;
    } finally {
      this.activeSyncPromise = null;
    }
  }

  async getLiveFixtures(params?: { competitionId?: string; status?: string; day?: string }): Promise<LiveFixturesResult> {
    checkAndLogStartupEnv();

    const { dateFrom, dateTo, lastUpdatedFormatted } = computeRequestDateWindow(14);

    // Rule 1 & 3: If filtering by competition_id, validate it is canonical; never fall back.
    if (params?.competitionId && params.competitionId !== 'ALL') {
      if (!isCanonicalCompetitionId(params.competitionId)) {
        logCompetitionIntegrityError('api_filter', params.competitionId, 'getLiveFixtures');
        return {
          fixtures: [],
          liveDataAvailable: true,
          lastUpdated: this.lastGoodSyncTime || lastUpdatedFormatted,
          providerUsed: this.lastProviderUsed,
          dateRange: { dateFrom, dateTo },
        };
      }
    }

    const syncRes = await this.ensureSynced();

    // Primary Single Source of Truth: Database `fixtures` table filtered by competition_id ONLY + day
    if (isSupabaseConfigured && supabase) {
      const dbFixtures = await getFixturesFromDatabase({
        competitionId: params?.competitionId,
        status: params?.status,
        day: params?.day,
        sport: 'football',
      });

      if (dbFixtures.length > 0) {
        return {
          fixtures: dbFixtures.map(f => this.enrichFixtureWithDbStats(f)),
          liveDataAvailable: true,
          lastUpdated: this.lastGoodSyncTime || lastUpdatedFormatted,
          providerUsed: syncRes.ok ? syncRes.providerUsed : 'Database Verified Fixtures',
          dateRange: { dateFrom, dateTo },
        };
      }

      // Check if DB has any football fixtures at all (meaning filter simply matched 0 fixtures)
      if (syncRes.ok || (await getFixturesFromDatabase({ sport: 'football' })).length > 0) {
        return {
          fixtures: [],
          liveDataAvailable: true,
          lastUpdated: this.lastGoodSyncTime || lastUpdatedFormatted,
          providerUsed: syncRes.ok ? syncRes.providerUsed : 'Database Verified Fixtures',
          dateRange: { dateFrom, dateTo },
        };
      }
    }

    // Fallback to lastGoodCachedFixtures only if DB was empty/offline
    if (this.lastGoodCachedFixtures.length > 0) {
      const filtered = this.applyLiveFilters(this.lastGoodCachedFixtures, params);
      return {
        fixtures: filtered,
        liveDataAvailable: true,
        lastUpdated: this.lastGoodSyncTime || lastUpdatedFormatted,
        providerUsed: `${this.lastGoodCachedFixtures[0]?.providerName || 'Provider'} (Cached snapshot)`,
        failedProvider: this.lastFailedProvider,
        quotaHeaders: this.lastQuotaHeaders,
        dateRange: { dateFrom, dateTo },
      };
    }

    // Required Error State: Never generate substitute data!
    const errorMsg = `Fixtures unavailable, last updated ${this.lastGoodSyncTime || 'never'}`;
    return {
      fixtures: [],
      liveDataAvailable: false,
      lastUpdated: this.lastGoodSyncTime || lastUpdatedFormatted,
      error: errorMsg,
      failedProvider: this.lastFailedProvider || 'Football-Data.org / Sportmonks / ESPN',
      quotaHeaders: this.lastQuotaHeaders,
      dateRange: { dateFrom, dateTo },
    };
  }

  async getFixtureById(id: string): Promise<Fixture | null> {
    await this.ensureSynced();

    if (isSupabaseConfigured && supabase) {
      try {
        const dbFixtures = await getFixturesFromDatabase({ sport: 'football' });
        const dbMatch = dbFixtures.find(f => f.id === id || f.providerId === id);
        if (dbMatch) return this.enrichFixtureWithDbStats(dbMatch);
      } catch (_) {}
    }

    const cachedHit = this.lastGoodCachedFixtures.find(f => f.id === id || f.providerId === id);
    if (cachedHit) return this.enrichFixtureWithDbStats(cachedHit);

    return null;
  }

  async getFixtureContext(fixtureId: string): Promise<FixtureContext | null> {
    const fixture = await this.getFixtureById(fixtureId);
    if (!fixture) return null;

    const stats = getFixtureStatistics(fixture);
    return {
      fixtureId: fixture.id,
      homeTeamName: fixture.homeTeam.name,
      awayTeamName: fixture.awayTeam.name,
      competitionCode: fixture.competition.code,
      competitionName: fixture.competition.name,
      kickoffTime: fixture.kickoffTime,
      homeAttackRating: fixture.homeTeam.attackRating ?? 1.0,
      homeDefenseRating: fixture.homeTeam.defenseRating ?? 1.0,
      awayAttackRating: fixture.awayTeam.attackRating ?? 1.0,
      awayDefenseRating: fixture.awayTeam.defenseRating ?? 1.0,
      home1HAttackRating: stats.home1HAttackRating,
      home1HDefenseRating: stats.home1HDefenseRating,
      away1HAttackRating: stats.away1HAttackRating,
      away1HDefenseRating: stats.away1HDefenseRating,
      home2HAttackRating: stats.home2HAttackRating,
      home2HDefenseRating: stats.home2HDefenseRating,
      away2HAttackRating: stats.away2HAttackRating,
      away2HDefenseRating: stats.away2HDefenseRating,
      homeCornerForRating: stats.homeCornerForRating,
      homeCornerAgainstRating: stats.homeCornerAgainstRating,
      awayCornerForRating: stats.awayCornerForRating,
      awayCornerAgainstRating: stats.awayCornerAgainstRating,
      homeCornerSampleCount: stats.homeCornerSampleCount,
      awayCornerSampleCount: stats.awayCornerSampleCount,
      homeCardForRating: stats.homeCardForRating,
      awayCardForRating: stats.awayCardForRating,
      homeCardSampleCount: stats.homeCardSampleCount,
      awayCardSampleCount: stats.awayCardSampleCount,
      homeXg: stats.homeXg,
      awayXg: stats.awayXg,
      expectedCornersHome: stats.expectedCornersHome,
      expectedCornersAway: stats.expectedCornersAway,
      expectedCards: stats.expectedCards,
      referee: fixture.referee || stats.referee,
      refereeAnnounced: stats.refereeAnnounced,
      refereeMatchCount: stats.refereeMatchCount,
      refereeShrunkRate: stats.refereeShrunkRate,
      refereeLeagueBaseline: stats.refereeLeagueBaseline,
      isDerby: stats.isDerby,
      derbyName: stats.derbyName,
      derbySource: stats.derbySource,
      leagueCapabilities: stats.leagueCapabilities,
      uncertaintyScore: stats.uncertaintyScore,
      dataCoverageScore: stats.dataCoverageScore,
      sampleSizeMatches: stats.sampleSizeMatches,
      stateTags: stats.stateTags,
      lineupConfirmed: stats.lineupConfirmed,
      verifiedOdds: fixture.verifiedOdds || stats.verifiedOdds,
      insufficientData: stats.insufficientData || fixture.insufficientData,
      hasRealTeamStrength: stats.hasRealTeamStrength,
      noRecommendationReason: stats.noRecommendationReason,
    };
  }

  async getFixtures(params?: { competitionId?: string; day?: string; status?: string }): Promise<Fixture[]> {
    const res = await this.getLiveFixtures(params);
    return res.fixtures;
  }
}

export const liveFootballDataProvider = new LiveFootballDataProvider();

export function getFootballDataProvider(): LiveFootballDataProvider {
  return liveFootballDataProvider;
}

export async function getEvaluatedFixture(fixtureId: string) {
  const provider = getFootballDataProvider();
  const fixture = await provider.getFixtureById(fixtureId);
  if (!fixture) return null;

  const context = await provider.getFixtureContext(fixtureId);
  if (!context) return null;

  const evaluated = evaluateFixtureMarkets(context);
  return {
    fixture,
    context,
    predictions: evaluated.predictions,
    topPick: evaluated.topPick,
    noRecommendationReason: evaluated.noRecommendationReason,
  };
}
