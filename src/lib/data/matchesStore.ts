// CALIBRALL: Historical Match Storage, Supabase Integration & Data Status Service
// Strictly enforces:
// 1. Production reads matches ONLY from Supabase
// 2. In-memory local fallback store for seamless development and testing
// 3. Exact data status reporting for leagues, seasons, date boundaries, and under-sampled teams (<10 matches)

import { supabase, isSupabaseConfigured, assertPersistenceConfigured } from '@/lib/supabase/client';
import { TEAM_STRENGTH_DATABASE, lookupTeamStrength, TeamStrengthRecord } from './teamDatabase';
import { displayName } from '@/lib/utils/formatText';

export interface StoredMatch {
  id: string;
  provider_id: string;
  competition_code: string;
  season: string;
  matchday?: number;
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
  observed_at?: string;
  source?: string;
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
}

// In-Memory store across the runtime session (shared on globalThis)
const getGlobalMatches = (): Map<string, StoredMatch> => {
  if (!(globalThis as any).__calibrall_matches_map) {
    (globalThis as any).__calibrall_matches_map = new Map<string, StoredMatch>();
  }
  return (globalThis as any).__calibrall_matches_map;
};

const getGlobalOdds = (): Map<string, StoredOddsSnapshot[]> => {
  if (!(globalThis as any).__calibrall_odds_map) {
    (globalThis as any).__calibrall_odds_map = new Map<string, StoredOddsSnapshot[]>();
  }
  return (globalThis as any).__calibrall_odds_map;
};

const getGlobalTeamCounts = (): Map<string, number> => {
  if (!(globalThis as any).__calibrall_team_counts) {
    (globalThis as any).__calibrall_team_counts = new Map<string, number>();
  }
  return (globalThis as any).__calibrall_team_counts;
};

class MatchesStore {
  private get inMemoryMatches(): Map<string, StoredMatch> {
    return getGlobalMatches();
  }
  private get inMemoryOdds(): Map<string, StoredOddsSnapshot[]> {
    return getGlobalOdds();
  }
  private get teamMatchCounts(): Map<string, number> {
    return getGlobalTeamCounts();
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

  /**
   * Upsert matches and optional odds snapshots.
   * If Supabase is configured, persists to Supabase tables.
   */
  async upsertMatches(
    matches: StoredMatch[],
    oddsSnapshots?: StoredOddsSnapshot[]
  ): Promise<{ fetched: number; inserted: number; errors?: string[] }> {
    const fetched = matches.length;
    let inserted = 0;
    const errors: string[] = [];

    // 1. Update in-memory store
    for (const m of matches) {
      this.inMemoryMatches.set(m.provider_id, m);
      inserted++;
    }

    if (oddsSnapshots && oddsSnapshots.length > 0) {
      for (const o of oddsSnapshots) {
        const list = this.inMemoryOdds.get(o.match_id) || [];
        list.push(o);
        this.inMemoryOdds.set(o.match_id, list);
      }
    }

    this.rebuildTeamCounts();

    // 2. Persist to Supabase if configured
    if (isSupabaseConfigured && supabase) {
      try {
        // Upsert teams first to satisfy foreign key constraints
        const teamMap = new Map<string, { id: string; name: string; short_name: string; competition_code: string; crest_url: string; tla?: string }>();
        for (const m of matches) {
          const homeLookup = lookupTeamStrength(m.home_team_id) || lookupTeamStrength(m.home_team_name);
          const awayLookup = lookupTeamStrength(m.away_team_id) || lookupTeamStrength(m.away_team_name);

          teamMap.set(m.home_team_id, {
            id: m.home_team_id,
            name: m.home_team_name,
            short_name: homeLookup?.data?.shortName || displayName(m.home_team_name),
            competition_code: m.competition_code,
            crest_url: homeLookup?.data?.crestUrl || `https://crests.football-data.org/${m.competition_code}.png`,
            tla: homeLookup?.data?.tla,
          });

          teamMap.set(m.away_team_id, {
            id: m.away_team_id,
            name: m.away_team_name,
            short_name: awayLookup?.data?.shortName || displayName(m.away_team_name),
            competition_code: m.competition_code,
            crest_url: awayLookup?.data?.crestUrl || `https://crests.football-data.org/${m.competition_code}.png`,
            tla: awayLookup?.data?.tla,
          });
        }

        const teamsToInsert = Array.from(teamMap.values());
        if (teamsToInsert.length > 0) {
          const { error: teamErr } = await supabase.from('teams').upsert(teamsToInsert, { onConflict: 'id' });
          if (teamErr) {
            console.warn('[MatchesStore] Supabase teams upsert warning:', teamErr.message);
          }
        }

        // Upsert matches in chunks of 100
        const chunkSize = 100;
        for (let i = 0; i < matches.length; i += chunkSize) {
          const chunk = matches.slice(i, i + chunkSize);
          const { error: matchErr } = await supabase.from('matches').upsert(chunk, { onConflict: 'provider_id' });
          if (matchErr) {
            console.error('[MatchesStore] Supabase matches chunk upsert error:', matchErr.message);
            errors.push(matchErr.message);
          }
        }

        // Upsert odds snapshots if provided
        if (oddsSnapshots && oddsSnapshots.length > 0) {
          for (let i = 0; i < oddsSnapshots.length; i += chunkSize) {
            const chunk = oddsSnapshots.slice(i, i + chunkSize);
            const { error: oddsErr } = await supabase.from('odds_snapshots').insert(chunk);
            if (oddsErr) {
              console.warn('[MatchesStore] Supabase odds snapshot insert error:', oddsErr.message);
            }
          }
        }
      } catch (err: any) {
        console.error('[MatchesStore] Supabase persistence error:', err?.message || err);
        errors.push(err?.message || 'Supabase persistence error');
      }
    } else if (process.env.NODE_ENV === 'production') {
      console.warn('[MatchesStore] Production warning: Supabase credentials unconfigured, using in-memory store.');
    }

    return { fetched, inserted, errors: errors.length > 0 ? errors : undefined };
  }

  /**
   * Get matches for a competition and optional season.
   * In production, reads from Supabase if configured.
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

    // In Supabase
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
   * Diagnostic Data Status Report
   * Returns matches per league and season, earliest and latest date,
   * and teams with fewer than 10 matches.
   */
  async getDataStatus(): Promise<DataStatusReport> {
    let allMatches: StoredMatch[] = [];

    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('matches')
          .select('id, provider_id, competition_code, season, kickoff_time, home_team_id, away_team_id, status, home_score')
          .order('kickoff_time', { ascending: true });
        if (!error && data) {
          allMatches = data as StoredMatch[];
        }
      } catch (err) {
        console.warn('[MatchesStore] Could not read all matches from Supabase:', err);
      }
    }

    if (allMatches.length === 0) {
      allMatches = Array.from(this.inMemoryMatches.values());
    }

    // Aggregate by league and season
    const leagueSeasonMap = new Map<string, { league: string; season: string; count: number; earliestDate: string; latestDate: string }>();
    const teamCounts = new Map<string, number>();

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
        teamCounts.set(m.home_team_id, (teamCounts.get(m.home_team_id) || 0) + 1);
        teamCounts.set(m.away_team_id, (teamCounts.get(m.away_team_id) || 0) + 1);
      }
    }

    // Identify teams with fewer than 10 matches across all active teams in database
    const underSampledTeams: {
      teamId: string;
      name: string;
      shortName: string;
      competitionCode: string;
      matchCount: number;
    }[] = [];

    // Check all teams in knowledge base
    for (const team of Object.values(TEAM_STRENGTH_DATABASE)) {
      const matchCount = teamCounts.get(team.id) ?? team.sampleMatches;
      if (matchCount < 10) {
        underSampledTeams.push({
          teamId: team.id,
          name: team.name,
          shortName: team.shortName,
          competitionCode: team.competitionCode,
          matchCount,
        });
      }
    }

    return {
      totalMatches: allMatches.length,
      earliestDate,
      latestDate,
      matchesPerLeagueAndSeason: Array.from(leagueSeasonMap.values()).sort((a, b) => a.league.localeCompare(b.league) || b.season.localeCompare(a.season)),
      teamsWithFewerThan10Matches: underSampledTeams.sort((a, b) => a.matchCount - b.matchCount || a.name.localeCompare(b.name)),
    };
  }
}

export const matchesStore = new MatchesStore();
