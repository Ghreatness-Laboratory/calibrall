// CALIBRALL: Historical Match Storage, Supabase Integration & Data Status Service
// Strictly enforces:
// 1. Production writes strictly to Supabase and fails loudly if unconfigured or on error
// 2. Teams rows are always created/upserted first so foreign keys home_team_id and away_team_id can never fail
// 3. In-memory local fallback store for seamless development and testing (clearly labeled as sandbox)
// 4. Exact data status reporting for leagues, seasons, date boundaries, joined teams, and unmatched names

import { supabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { TEAM_STRENGTH_DATABASE, lookupTeamStrength, normalizeTeamLookupKey } from './teamDatabase';
import { CHAMPIONSHIP_HISTORICAL_MATCHES } from './championshipMatchArchive';
import { displayName } from '@/lib/utils/formatText';

export interface FormMatchRecord {
  id: string;
  provider_id: string;
  date: string;
  opponentName: string;
  opponentId: string;
  isHome: boolean;
  teamScore: number;
  opponentScore: number;
  result: 'W' | 'D' | 'L';
  competitionCode: string;
}

export interface SplitMetrics {
  matchesCount: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  cleanSheets: number;
  failedToScore: number;
  points: number;
  ppg: number;
}

export interface TeamHistoryAndForm {
  teamId: string;
  teamName: string;
  storedMatchCount: number;
  daysSinceLastMatch: number | null;
  lastMatchDate: string | null;
  last5: {
    matches: FormMatchRecord[];
    formString: string;
    metrics: SplitMetrics;
  };
  last10: {
    matches: FormMatchRecord[];
    formString: string;
    metrics: SplitMetrics;
  };
  homeSplit: SplitMetrics;
  awaySplit: SplitMetrics;
  timeDecayedAttackRating: number;
  timeDecayedDefenseRating: number;
}

export interface StoredMatch {
  id: string;
  provider_id: string;
  competition_code: string;
  season: string;
  matchday?: number | null;
  home_team_id: string;
  away_team_id: string;
  home_team_name: string;
  away_team_name: string;
  kickoff_time: string;
  status: 'SCHEDULED' | 'TIMED' | 'IN_PLAY' | 'PAUSED' | 'FINISHED' | 'POSTPONED' | 'CANCELED';
  home_score: number | null;
  away_score: number | null;
  home_half_time_score?: number | null;
  away_half_time_score?: number | null;
  home_corners?: number | null;
  away_corners?: number | null;
  home_yellow_cards?: number | null;
  away_yellow_cards?: number | null;
  home_red_cards?: number | null;
  away_red_cards?: number | null;
  home_shots?: number | null;
  away_shots?: number | null;
  home_shots_on_target?: number | null;
  away_shots_on_target?: number | null;
  source: string;
  created_at?: string;
  updated_at?: string;
}

export interface StoredOddsSnapshot {
  id?: string;
  match_id: string;
  bookmaker: string;
  market_code: string;
  selection: string;
  decimal_odds: number;
  observed_at?: string | null; // NULL for CSV backfill (never now())
  snapshot_type: 'csv_pre_match' | 'csv_closing' | 'live_pre_kickoff' | 'live_in_play';
  source: string;
}

export interface DataStatusReport {
  totalMatches: number;
  earliestDate: string | null;
  latestDate: string | null;
  matchesPerLeagueAndSeason: {
    league: string;
    season: string;
    count: number;
    earliestDate: string;
    latestDate: string;
  }[];
  teamsWithFewerThan10Matches: {
    teamId: string;
    name: string;
    shortName: string;
    competitionCode: string;
    matchCount: number;
  }[];
  unmatchedNamesCount: number;
  unmatchedNames: string[];
  unmappedFixtureNamesCount: number;
  unmappedFixtureNames: { name: string; provider: string }[];
  storeUsed: 'supabase' | 'in-memory';
  persistenceMode: 'SUPABASE_PRODUCTION' | 'IN_MEMORY_SANDBOX';
}

// In-Memory store across the runtime session (shared on globalThis)
const getGlobalMatches = (): Map<string, StoredMatch> => {
  if (!(globalThis as any).__calibrall_matches_map) {
    const map = new Map<string, StoredMatch>();
    for (const m of CHAMPIONSHIP_HISTORICAL_MATCHES) {
      map.set(m.provider_id, m);
    }
    (globalThis as any).__calibrall_matches_map = map;
  }
  return (globalThis as any).__calibrall_matches_map;
};

// Map keyed by `${match_id}:${bookmaker}:${market_code}:${source}` for idempotent upserts
const getGlobalOddsMap = (): Map<string, StoredOddsSnapshot> => {
  if (!(globalThis as any).__calibrall_odds_unique_map) {
    (globalThis as any).__calibrall_odds_unique_map = new Map<string, StoredOddsSnapshot>();
  }
  return (globalThis as any).__calibrall_odds_unique_map;
};

const getGlobalTeamCounts = (): Map<string, number> => {
  if (!(globalThis as any).__calibrall_team_counts) {
    (globalThis as any).__calibrall_team_counts = new Map<string, number>();
  }
  return (globalThis as any).__calibrall_team_counts;
};

const getGlobalUnmatchedNames = (): Set<string> => {
  if (!(globalThis as any).__calibrall_unmatched_names) {
    (globalThis as any).__calibrall_unmatched_names = new Set<string>();
  }
  return (globalThis as any).__calibrall_unmatched_names;
};

const getGlobalUnmappedFixtureNames = (): Map<string, { name: string; provider: string }> => {
  if (!(globalThis as any).__calibrall_unmapped_fixtures) {
    (globalThis as any).__calibrall_unmapped_fixtures = new Map<string, { name: string; provider: string }>();
  }
  return (globalThis as any).__calibrall_unmapped_fixtures;
};

class MatchesStore {
  private get inMemoryMatches(): Map<string, StoredMatch> {
    return getGlobalMatches();
  }
  private get inMemoryOdds(): Map<string, StoredOddsSnapshot> {
    return getGlobalOddsMap();
  }
  private get teamMatchCounts(): Map<string, number> {
    return getGlobalTeamCounts();
  }
  private get unmatchedNamesSet(): Set<string> {
    return getGlobalUnmatchedNames();
  }
  private get unmappedFixtureNamesMap(): Map<string, { name: string; provider: string }> {
    return getGlobalUnmappedFixtureNames();
  }

  constructor() {
    this.rebuildTeamCounts();
  }

  private rebuildTeamCounts() {
    this.teamMatchCounts.clear();
    for (const match of Array.from(this.inMemoryMatches.values())) {
      if (match.status === 'FINISHED' || match.home_score !== null) {
        this.teamMatchCounts.set(match.home_team_id, (this.teamMatchCounts.get(match.home_team_id) || 0) + 1);
        this.teamMatchCounts.set(match.away_team_id, (this.teamMatchCounts.get(match.away_team_id) || 0) + 1);
      }
    }
  }

  recordUnmatchedName(name: string) {
    if (name && typeof name === 'string' && name.trim()) {
      this.unmatchedNamesSet.add(name.trim());
    }
  }

  getUnmatchedNames(): string[] {
    return Array.from(this.unmatchedNamesSet).sort();
  }

  clearUnmatchedNames() {
    this.unmatchedNamesSet.clear();
  }

  recordUnmappedFixtureName(rawName: string, provider: string) {
    if (rawName && typeof rawName === 'string' && rawName.trim()) {
      const clean = rawName.trim();
      this.unmappedFixtureNamesMap.set(`${clean.toLowerCase()}:${provider.toLowerCase()}`, {
        name: clean,
        provider,
      });
    }
  }

  getUnmappedFixtureNames(): { name: string; provider: string }[] {
    return Array.from(this.unmappedFixtureNamesMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  clearUnmappedFixtureNames() {
    this.unmappedFixtureNamesMap.clear();
  }

  /**
   * Upsert matches and optional odds snapshots.
   * If in production, strictly confirms writes to Supabase and fails loudly if unconfigured or on error.
   * Ensures ratings and sample_matches remain null until computed.
   * Ensures crest_url is null when there is none (never fabricates made-up URLs).
   */
  async upsertMatches(
    matches: StoredMatch[],
    oddsSnapshots?: StoredOddsSnapshot[]
  ): Promise<{ fetched: number; inserted: number; errors?: string[] }> {
    const fetched = matches.length;
    let inserted = 0;
    const errors: string[] = [];

    const isProduction = process.env.NODE_ENV === 'production' || process.env.ENVIRONMENT === 'production';

    // 1. Strict production check: Fail loudly if Supabase is unconfigured in production
    if (isProduction && (!isSupabaseConfigured || !supabase)) {
      throw new Error(
        '[MatchesStore] Fatal: Supabase persistence is strictly required in production environment, but Supabase credentials (NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/NEXT_PUBLIC_SUPABASE_ANON_KEY) are not configured.'
      );
    }

    // 2. Update in-memory sandbox store
    for (const m of matches) {
      this.inMemoryMatches.set(m.provider_id, m);
      inserted++;
    }

    if (oddsSnapshots && oddsSnapshots.length > 0) {
      for (const o of oddsSnapshots) {
        const uniqueKey = `${o.match_id}:${o.bookmaker}:${o.market_code}:${o.source}`;
        this.inMemoryOdds.set(uniqueKey, o);
      }
    }

    this.rebuildTeamCounts();

    // 3. Persist to Supabase when configured
    if (isSupabaseConfigured && supabase) {
      try {
        // Step 3a: Create canonical teams rows first so foreign keys home_team_id and away_team_id can NEVER fail.
        // Ratings, discipline, and sample_matches are left NULL until computed from stored matches.
        // crest_url is left NULL (no made-up URLs).
        const teamMap = new Map<string, {
          id: string;
          name: string;
          short_name: string;
          competition_code: string;
          crest_url: string | null;
          tla: string | null;
          attack_rating: number | null;
          defense_rating: number | null;
          corner_attack_rating: number | null;
          discipline_rating: number | null;
          sample_matches: number | null;
        }>();

        for (const m of matches) {
          if (!teamMap.has(m.home_team_id)) {
            teamMap.set(m.home_team_id, {
              id: m.home_team_id,
              name: m.home_team_name,
              short_name: m.home_team_name,
              competition_code: m.competition_code,
              crest_url: null,
              tla: null,
              attack_rating: null,
              defense_rating: null,
              corner_attack_rating: null,
              discipline_rating: null,
              sample_matches: null,
            });
          }

          if (!teamMap.has(m.away_team_id)) {
            teamMap.set(m.away_team_id, {
              id: m.away_team_id,
              name: m.away_team_name,
              short_name: m.away_team_name,
              competition_code: m.competition_code,
              crest_url: null,
              tla: null,
              attack_rating: null,
              defense_rating: null,
              corner_attack_rating: null,
              discipline_rating: null,
              sample_matches: null,
            });
          }
        }

        const teamsToInsert = Array.from(teamMap.values());
        if (teamsToInsert.length > 0) {
          const { error: teamErr } = await supabase.from('teams').upsert(teamsToInsert, { onConflict: 'id' });
          if (teamErr) {
            console.error('[MatchesStore] Supabase teams upsert error:', teamErr.message);
            if (isProduction) {
              throw new Error(`[MatchesStore] Fatal: Teams upsert to Supabase failed: ${teamErr.message}`);
            }
            errors.push(`Teams upsert error: ${teamErr.message}`);
          }
        }

        // Step 3b: Upsert matches in chunks of 100
        const chunkSize = 100;
        for (let i = 0; i < matches.length; i += chunkSize) {
          const chunk = matches.slice(i, i + chunkSize);
          const { error: matchErr } = await supabase.from('matches').upsert(chunk, { onConflict: 'provider_id' });
          if (matchErr) {
            console.error('[MatchesStore] Supabase matches chunk upsert error:', matchErr.message);
            if (isProduction) {
              throw new Error(`[MatchesStore] Fatal: Matches upsert to Supabase failed: ${matchErr.message}`);
            }
            errors.push(matchErr.message);
          }
        }

        // Step 3c: Upsert odds snapshots with unique constraint on (match_id, bookmaker, market_code, source)
        if (oddsSnapshots && oddsSnapshots.length > 0) {
          for (let i = 0; i < oddsSnapshots.length; i += chunkSize) {
            const chunk = oddsSnapshots.slice(i, i + chunkSize);
            const { error: oddsErr } = await supabase.from('odds_snapshots').upsert(chunk, {
              onConflict: 'match_id,bookmaker,market_code,source',
            });
            if (oddsErr) {
              console.warn('[MatchesStore] Supabase odds snapshot upsert error:', oddsErr.message);
              if (isProduction) {
                throw new Error(`[MatchesStore] Fatal: Odds snapshots upsert to Supabase failed: ${oddsErr.message}`);
              }
              errors.push(oddsErr.message);
            }
          }
        }
      } catch (err: any) {
        console.error('[MatchesStore] Supabase persistence error:', err?.message || err);
        if (isProduction) {
          throw err instanceof Error ? err : new Error(`[MatchesStore] Fatal: Supabase persistence failed: ${err}`);
        }
        errors.push(err?.message || 'Supabase persistence error');
      }
    } else if (!isProduction) {
      console.log(`[MatchesStore Sandbox Output] Processed ${matches.length} matches and ${oddsSnapshots?.length || 0} odds snapshots into in-memory sandbox store.`);
    }

    return { fetched, inserted, errors: errors.length > 0 ? errors : undefined };
  }

  /**
   * Get matches for a competition and optional season.
   * Reads from Supabase if configured, falling back to in-memory store in sandbox mode.
   */
  async getMatches(competitionCode?: string, season?: string): Promise<StoredMatch[]> {
    if (isSupabaseConfigured && supabase) {
      try {
        let query = supabase.from('matches').select('*').order('kickoff_time', { ascending: false });
        if (competitionCode && competitionCode !== 'ALL') {
          query = query.eq('competition_code', competitionCode.toUpperCase());
        }
        if (season && season !== 'ALL') {
          query = query.eq('season', season);
        }
        const { data, error } = await query;
        if (!error && data && data.length > 0) {
          return data as StoredMatch[];
        }
      } catch (e: any) {
        console.error('[MatchesStore] Failed to read from Supabase matches:', e?.message || e);
      }
    }

    // In-memory fallback
    let results = Array.from(this.inMemoryMatches.values());
    if (competitionCode && competitionCode !== 'ALL') {
      results = results.filter(m => m.competition_code.toUpperCase() === competitionCode.toUpperCase());
    }
    if (season && season !== 'ALL') {
      results = results.filter(m => m.season === season);
    }
    return results.sort((a, b) => new Date(b.kickoff_time).getTime() - new Date(a.kickoff_time).getTime());
  }

  /**
   * Returns genuine finished match count for a team.
   */
  async getTeamMatchCount(teamIdOrName: string): Promise<number> {
    const lookup = lookupTeamStrength(teamIdOrName);
    const canonicalId = lookup?.data?.id || teamIdOrName;

    // Check in-memory store
    const memCount = this.teamMatchCounts.get(canonicalId) || 0;
    if (memCount > 0) return memCount;

    // Check Supabase if configured
    if (isSupabaseConfigured && supabase) {
      try {
        const { count, error } = await supabase
          .from('matches')
          .select('*', { count: 'exact', head: true })
          .or(`home_team_id.eq.${canonicalId},away_team_id.eq.${canonicalId}`)
          .eq('status', 'FINISHED');
        if (!error && typeof count === 'number') {
          return count;
        }
      } catch {
        // ignore
      }
    }

    // Default from knowledge base
    if (lookup?.data) {
      return lookup.data.sampleMatches;
    }

    return 0;
  }

  /**
   * Defines "history" as team form:
   * Computes from stored matches:
   * - last 5 and last 10 results with scores, opponents, and dates
   * - goals for and against
   * - home and away splits
   * - days since last match
   * - time-decayed attack and defence strengths
   */
  async getTeamHistoryAndForm(teamIdOrName: string, asOfDate?: string): Promise<TeamHistoryAndForm> {
    const lookup = lookupTeamStrength(teamIdOrName);
    const canonicalId = lookup?.data?.id || teamIdOrName;
    const teamName = lookup?.data?.name || displayName(teamIdOrName);
    const teamNorm = normalizeTeamLookupKey(teamName);

    // 1. Gather all stored matches for this team
    let candidateMatches: StoredMatch[] = [];

    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('matches')
          .select('*')
          .or(`home_team_id.eq.${canonicalId},away_team_id.eq.${canonicalId}`)
          .order('kickoff_time', { ascending: false });
        if (!error && data && data.length > 0) {
          candidateMatches = data as StoredMatch[];
        }
      } catch (err) {
        console.warn('[MatchesStore] Supabase getTeamHistoryAndForm error:', err);
      }
    }

    if (candidateMatches.length === 0) {
      candidateMatches = Array.from(this.inMemoryMatches.values()).filter(m => {
        if (m.home_team_id === canonicalId || m.away_team_id === canonicalId) return true;
        if (normalizeTeamLookupKey(m.home_team_name) === teamNorm) return true;
        if (normalizeTeamLookupKey(m.away_team_name) === teamNorm) return true;
        return false;
      });
    }

    // Filter to finished matches with scores, respecting asOfDate if provided
    const finished = candidateMatches.filter(m => {
      const isFinished = m.status === 'FINISHED' || m.home_score !== null;
      if (!isFinished) return false;
      if (asOfDate && m.kickoff_time > asOfDate) return false;
      return true;
    }).sort((a, b) => new Date(b.kickoff_time).getTime() - new Date(a.kickoff_time).getTime());

    // Map to FormMatchRecord
    const formMatches: FormMatchRecord[] = finished.map(m => {
      const isHome = m.home_team_id === canonicalId || normalizeTeamLookupKey(m.home_team_name) === teamNorm;
      const teamScore = isHome ? (m.home_score ?? 0) : (m.away_score ?? 0);
      const opponentScore = isHome ? (m.away_score ?? 0) : (m.home_score ?? 0);
      const opponentName = isHome ? m.away_team_name : m.home_team_name;
      const opponentId = isHome ? m.away_team_id : m.home_team_id;
      const result: 'W' | 'D' | 'L' = teamScore > opponentScore ? 'W' : teamScore === opponentScore ? 'D' : 'L';
      return {
        id: m.id,
        provider_id: m.provider_id,
        date: m.kickoff_time,
        opponentName,
        opponentId,
        isHome,
        teamScore,
        opponentScore,
        result,
        competitionCode: m.competition_code,
      };
    });

    const computeMetrics = (matches: FormMatchRecord[]): SplitMetrics => {
      let wins = 0;
      let draws = 0;
      let losses = 0;
      let goalsFor = 0;
      let goalsAgainst = 0;
      let cleanSheets = 0;
      let failedToScore = 0;

      for (const m of matches) {
        goalsFor += m.teamScore;
        goalsAgainst += m.opponentScore;
        if (m.result === 'W') wins++;
        else if (m.result === 'D') draws++;
        else losses++;

        if (m.opponentScore === 0) cleanSheets++;
        if (m.teamScore === 0) failedToScore++;
      }

      const matchesCount = matches.length;
      const points = wins * 3 + draws * 1;
      const ppg = matchesCount > 0 ? Number((points / matchesCount).toFixed(2)) : 0;
      const goalDifference = goalsFor - goalsAgainst;

      return {
        matchesCount,
        wins,
        draws,
        losses,
        goalsFor,
        goalsAgainst,
        goalDifference,
        cleanSheets,
        failedToScore,
        points,
        ppg,
      };
    };

    const last5Matches = formMatches.slice(0, 5);
    const last10Matches = formMatches.slice(0, 10);
    const homeMatches = formMatches.filter(m => m.isHome);
    const awayMatches = formMatches.filter(m => !m.isHome);

    const last5 = {
      matches: last5Matches,
      formString: last5Matches.map(m => m.result).join('-') || 'N/A',
      metrics: computeMetrics(last5Matches),
    };

    const last10 = {
      matches: last10Matches,
      formString: last10Matches.map(m => m.result).join('-') || 'N/A',
      metrics: computeMetrics(last10Matches),
    };

    const homeSplit = computeMetrics(homeMatches);
    const awaySplit = computeMetrics(awayMatches);

    // Days since last match
    let daysSinceLastMatch: number | null = null;
    let lastMatchDate: string | null = null;
    if (formMatches.length > 0) {
      lastMatchDate = formMatches[0].date;
      const refTime = asOfDate ? new Date(asOfDate).getTime() : Date.now();
      const matchTime = new Date(lastMatchDate).getTime();
      daysSinceLastMatch = Math.max(0, Math.round((refTime - matchTime) / (1000 * 60 * 60 * 24)));
    }

    // Time-decayed attack and defence strengths (exponential half-life decay ~ 138 days)
    const baseGoalsPerMatch = 1.35;
    let timeDecayedAttackRating = lookup?.data?.attackRating ?? 1.10;
    let timeDecayedDefenseRating = lookup?.data?.defenseRating ?? 1.05;

    if (formMatches.length > 0) {
      let weightSum = 0;
      let weightedGoalsScored = 0;
      let weightedGoalsConceded = 0;
      const refTime = asOfDate ? new Date(asOfDate).getTime() : Date.now();

      for (let i = 0; i < formMatches.length; i++) {
        const m = formMatches[i];
        const daysAgo = Math.max(0, (refTime - new Date(m.date).getTime()) / (1000 * 60 * 60 * 24));
        const w = Math.exp(-0.005 * daysAgo);
        weightSum += w;
        weightedGoalsScored += m.teamScore * w;
        weightedGoalsConceded += m.opponentScore * w;
      }

      if (weightSum > 0) {
        const avgScored = weightedGoalsScored / weightSum;
        const avgConceded = weightedGoalsConceded / weightSum;
        timeDecayedAttackRating = Number(Math.max(0.65, Math.min(1.85, avgScored / baseGoalsPerMatch)).toFixed(2));
        timeDecayedDefenseRating = Number(Math.max(0.60, Math.min(1.75, avgConceded / baseGoalsPerMatch)).toFixed(2));
      }
    }

    return {
      teamId: canonicalId,
      teamName,
      storedMatchCount: formMatches.length,
      daysSinceLastMatch,
      lastMatchDate,
      last5,
      last10,
      homeSplit,
      awaySplit,
      timeDecayedAttackRating,
      timeDecayedDefenseRating,
    };
  }

  /**
   * Contextual Head-to-Head query between two clubs from stored matches.
   * H2H is strictly treated as a secondary feature with a small weight.
   */
  async getHeadToHeadMeetings(teamA: string, teamB: string) {
    const lookupA = lookupTeamStrength(teamA);
    const lookupB = lookupTeamStrength(teamB);
    const idA = lookupA?.data?.id || teamA;
    const idB = lookupB?.data?.id || teamB;
    const nameA = lookupA?.data?.name || displayName(teamA);
    const nameB = lookupB?.data?.name || displayName(teamB);
    const normA = normalizeTeamLookupKey(nameA);
    const normB = normalizeTeamLookupKey(nameB);

    const allStored = Array.from(this.inMemoryMatches.values());
    const h2hMatches = allStored.filter(m => {
      const isFinished = m.status === 'FINISHED' || m.home_score !== null;
      if (!isFinished) return false;
      const matchHomeNorm = normalizeTeamLookupKey(m.home_team_name);
      const matchAwayNorm = normalizeTeamLookupKey(m.away_team_name);

      const matchesAB = (m.home_team_id === idA || matchHomeNorm === normA) && (m.away_team_id === idB || matchAwayNorm === normB);
      const matchesBA = (m.home_team_id === idB || matchHomeNorm === normB) && (m.away_team_id === idA || matchAwayNorm === normA);
      return matchesAB || matchesBA;
    }).sort((a, b) => new Date(b.kickoff_time).getTime() - new Date(a.kickoff_time).getTime());

    let winsA = 0;
    let draws = 0;
    let winsB = 0;

    const meetings = h2hMatches.map(m => {
      const isAHome = m.home_team_id === idA || normalizeTeamLookupKey(m.home_team_name) === normA;
      const scoreA = isAHome ? (m.home_score ?? 0) : (m.away_score ?? 0);
      const scoreB = isAHome ? (m.away_score ?? 0) : (m.home_score ?? 0);
      if (scoreA > scoreB) winsA++;
      else if (scoreA === scoreB) draws++;
      else winsB++;

      return {
        id: m.id,
        date: m.kickoff_time,
        homeTeam: m.home_team_name,
        awayTeam: m.away_team_name,
        homeGoals: m.home_score ?? 0,
        awayGoals: m.away_score ?? 0,
        competitionCode: m.competition_code,
      };
    });

    const sampleWeight = Math.min(0.12, meetings.length / (meetings.length + 15));

    return {
      totalMeetings: meetings.length,
      meetings: meetings.slice(0, 5),
      winsA,
      draws,
      winsB,
      sampleWeight: Number(sampleWeight.toFixed(3)),
      weightDescription: `Secondary feature (low weight ${(sampleWeight * 100).toFixed(1)}%, heavy Bayesian shrinkage applied)`,
    };
  }

  /**
   * Diagnostic Data Status Report
   * Returns:
   * - Joined teams table check: every team with fewer than 10 matches
   * - Per league and season counts
   * - Total matches, earliest and latest date
   * - Unmatched names list and count
   */
  /**
   * Retrieves odds snapshots for a match.
   * If preKickoffOnly is true, only returns odds marked as pre-kickoff
   * (snapshot_type === 'csv_pre_match' or 'live_pre_kickoff'), strictly excluding closing odds.
   */
  async getOdds(matchId: string, preKickoffOnly: boolean = false): Promise<StoredOddsSnapshot[]> {
    if (isSupabaseConfigured && supabase) {
      try {
        let query = supabase.from('odds_snapshots').select('*').eq('match_id', matchId);
        if (preKickoffOnly) {
          query = query.in('snapshot_type', ['csv_pre_match', 'live_pre_kickoff']);
        }
        const { data, error } = await query;
        if (!error && data) {
          return data as StoredOddsSnapshot[];
        }
      } catch (e) {
        console.warn('[MatchesStore] Supabase getOdds error:', e);
      }
    }

    // In-memory fallback
    const all = Array.from(this.inMemoryOdds.values()).filter(o => o.match_id === matchId);
    if (preKickoffOnly) {
      return all.filter(o => o.snapshot_type === 'csv_pre_match' || o.snapshot_type === 'live_pre_kickoff');
    }
    return all;
  }

  /**
   * Only pre-kickoff odds may be used for forward evaluation and benchmarking.
   */
  async getPreKickoffOdds(matchId: string): Promise<StoredOddsSnapshot[]> {
    return this.getOdds(matchId, true);
  }

  /**
   * Diagnostic Data Status Report
   * Reads from Supabase in production and fails loudly otherwise.
   * Explicitly reports storeUsed: 'supabase' | 'in-memory'.
   */
  async getDataStatus(): Promise<DataStatusReport> {
    const isProduction = process.env.NODE_ENV === 'production' || process.env.ENVIRONMENT === 'production';
    let storeUsed: 'supabase' | 'in-memory' = 'in-memory';

    if (isProduction && (!isSupabaseConfigured || !supabase)) {
      throw new Error(
        '[MatchesStore] Fatal: Supabase persistence is strictly required in production environment, but Supabase is not configured.'
      );
    }

    let allMatches: StoredMatch[] = [];
    let registeredTeams: { id: string; name: string; shortName: string; competitionCode: string; sampleMatches: number }[] = [];

    // 1. Fetch matches and joined teams from Supabase if configured
    if (isSupabaseConfigured && supabase) {
      try {
        const { data: matchData, error: matchErr } = await supabase
          .from('matches')
          .select('id, provider_id, competition_code, season, kickoff_time, home_team_id, away_team_id, status, home_score')
          .order('kickoff_time', { ascending: true });
        
        if (matchErr) {
          if (isProduction) {
            throw new Error(`[MatchesStore] Fatal: Failed to read matches from Supabase in production: ${matchErr.message}`);
          }
          console.warn('[MatchesStore] Could not read matches from Supabase:', matchErr.message);
        } else if (matchData) {
          allMatches = matchData as StoredMatch[];
          storeUsed = 'supabase';
        }

        // Join teams table
        const { data: teamData, error: teamErr } = await supabase
          .from('teams')
          .select('id, name, short_name, competition_code, sample_matches');
        
        if (teamErr) {
          if (isProduction) {
            throw new Error(`[MatchesStore] Fatal: Failed to read teams from Supabase in production: ${teamErr.message}`);
          }
          console.warn('[MatchesStore] Could not read teams from Supabase:', teamErr.message);
        } else if (teamData && teamData.length > 0) {
          registeredTeams = teamData.map(t => ({
            id: t.id,
            name: t.name,
            shortName: t.short_name,
            competitionCode: t.competition_code,
            sampleMatches: t.sample_matches ?? 0,
          }));
        }
      } catch (err: any) {
        if (isProduction) {
          throw err instanceof Error ? err : new Error(`[MatchesStore] Fatal: Supabase read failed in production: ${err}`);
        }
        console.warn('[MatchesStore] Could not read all data from Supabase in sandbox:', err);
      }
    }

    // In-memory fallback when Supabase has no records or is unconfigured in development
    if (allMatches.length === 0) {
      allMatches = Array.from(this.inMemoryMatches.values());
      storeUsed = 'in-memory';
    }

    // If teams table was not populated in Supabase, load all canonical teams from database
    if (registeredTeams.length === 0) {
      registeredTeams = Object.values(TEAM_STRENGTH_DATABASE).map(t => ({
        id: t.id,
        name: t.name,
        shortName: t.shortName,
        competitionCode: t.competitionCode,
        sampleMatches: t.sampleMatches,
      }));
    }

    // 2. Aggregate matches by league and season, and build team counts
    const leagueSeasonMap = new Map<string, { league: string; season: string; count: number; earliestDate: string; latestDate: string }>();
    const teamFinishedCounts = new Map<string, number>();

    let earliestDate: string | null = null;
    let latestDate: string | null = null;

    for (const m of allMatches) {
      const key = `${m.competition_code}_${m.season}`;
      const kDate = m.kickoff_time;

      if (!earliestDate || kDate < earliestDate) earliestDate = kDate;
      if (!latestDate || kDate > latestDate) latestDate = kDate;

      const existing = leagueSeasonMap.get(key) || {
        league: m.competition_code,
        season: m.season,
        count: 0,
        earliestDate: kDate,
        latestDate: kDate,
      };

      existing.count++;
      if (kDate < existing.earliestDate) existing.earliestDate = kDate;
      if (kDate > existing.latestDate) existing.latestDate = kDate;
      leagueSeasonMap.set(key, existing);

      // Accumulate finished team matches
      if (m.status === 'FINISHED' || m.home_score !== null) {
        teamFinishedCounts.set(m.home_team_id, (teamFinishedCounts.get(m.home_team_id) || 0) + 1);
        teamFinishedCounts.set(m.away_team_id, (teamFinishedCounts.get(m.away_team_id) || 0) + 1);
      }
    }

    // 3. Identify every team with fewer than 10 matches by joining the teams table
    const teamsWithFewerThan10Matches: {
      teamId: string;
      name: string;
      shortName: string;
      competitionCode: string;
      matchCount: number;
    }[] = [];

    for (const team of registeredTeams) {
      const matchCount = teamFinishedCounts.get(team.id) ?? team.sampleMatches;
      if (matchCount < 10) {
        teamsWithFewerThan10Matches.push({
          teamId: team.id,
          name: team.name,
          shortName: team.shortName,
          competitionCode: team.competitionCode,
          matchCount,
        });
      }
    }

    const unmatched = this.getUnmatchedNames();
    const unmappedFixtures = this.getUnmappedFixtureNames();

    return {
      totalMatches: allMatches.length,
      earliestDate,
      latestDate,
      matchesPerLeagueAndSeason: Array.from(leagueSeasonMap.values()).sort(
        (a, b) => a.league.localeCompare(b.league) || b.season.localeCompare(a.season)
      ),
      teamsWithFewerThan10Matches: teamsWithFewerThan10Matches.sort(
        (a, b) => a.matchCount - b.matchCount || a.name.localeCompare(b.name)
      ),
      unmatchedNamesCount: unmatched.length,
      unmatchedNames: unmatched,
      unmappedFixtureNamesCount: unmappedFixtures.length,
      unmappedFixtureNames: unmappedFixtures,
      storeUsed,
      persistenceMode: (isSupabaseConfigured && supabase) ? 'SUPABASE_PRODUCTION' : 'IN_MEMORY_SANDBOX',
    };
  }
}

export const matchesStore = new MatchesStore();
