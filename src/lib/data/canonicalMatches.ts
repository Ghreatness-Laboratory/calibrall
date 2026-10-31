// CALIBRALL: Canonical Match Schema & Provenance-Aware Storage
// Enforces:
// 1. Unique composite key: (date_yyyymmdd, home_team_id, away_team_id)
// 2. Strict validation: rejects impossible scores (<0 or >25), duplicate rows, future-dated completed results
// 3. Provenance per field: tracks source of statistics, live scores, and historical data
// 4. Staleness audit: detects if newest match > 21 days in-season, or < 5 matches in last 120 days

import { lookupCanonicalTeam, CanonicalTeam } from './canonicalTeams';

export type MatchDataSource = 'football-data.co.uk' | 'football-data.org' | 'elvidge' | 'openfootball' | 'thesportsdb' | 'espn' | 'verified_archive';

export interface CanonicalMatch {
  id: string; // `${dateKey}_${homeTeamId}_${awayTeamId}`
  date: string; // ISO date string YYYY-MM-DD
  kickoffTime: string; // ISO timestamp
  competitionCode: string;
  season: string; // e.g. "2024/2025", "2026/2027"
  matchday?: number | null;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  status: 'SCHEDULED' | 'TIMED' | 'IN_PLAY' | 'PAUSED' | 'FINISHED' | 'POSTPONED' | 'CANCELED';
  
  // Results
  homeScore: number | null;
  awayScore: number | null;
  homeHalfTimeScore: number | null;
  awayHalfTimeScore: number | null;
  
  // In-depth statistics (football-data.co.uk)
  homeShots?: number | null;
  awayShots?: number | null;
  homeShotsOnTarget?: number | null;
  awayShotsOnTarget?: number | null;
  homeCorners?: number | null;
  awayCorners?: number | null;
  homeYellowCards?: number | null;
  awayYellowCards?: number | null;
  homeRedCards?: number | null;
  awayRedCards?: number | null;
  homeFouls?: number | null;
  awayFouls?: number | null;
  referee?: string | null;
  
  // De-vigged closing odds snapshots
  closingOdds?: {
    homeWin?: number;
    draw?: number;
    awayWin?: number;
    over25?: number;
    under25?: number;
    asianHandicapLine?: number;
    asianHandicapHome?: number;
    asianHandicapAway?: number;
    observedAt?: string;
  };

  // Field-level provenance tracking
  provenance: {
    statsSource?: MatchDataSource;
    statusSource?: MatchDataSource;
    historySource?: MatchDataSource;
    ingestedAt: string;
  };
}

export interface StalenessStatus {
  teamId: string;
  teamName: string;
  newestMatchDate: string | null;
  daysSinceLastMatch: number | null;
  matchesInLast120Days: number;
  isStale: boolean;
  staleReason?: string;
}

export class CanonicalMatchStore {
  private matchesMap: Map<string, CanonicalMatch> = new Map();
  private teamsMatchDates: Map<string, string[]> = new Map();

  constructor() {
    this.initGlobal();
  }

  private initGlobal() {
    if (!(globalThis as any).__calibrall_canonical_matches) {
      (globalThis as any).__calibrall_canonical_matches = new Map<string, CanonicalMatch>();
      (globalThis as any).__calibrall_team_match_dates = new Map<string, string[]>();
    }
    this.matchesMap = (globalThis as any).__calibrall_canonical_matches;
    this.teamsMatchDates = (globalThis as any).__calibrall_team_match_dates;
  }

  public generateKey(date: string, homeTeamId: string, awayTeamId: string): string {
    const d = date.slice(0, 10);
    return `${d}_${homeTeamId}_${awayTeamId}`;
  }

  public upsertMatch(raw: Partial<CanonicalMatch>, source: MatchDataSource): { success: boolean; error?: string } {
    if (!raw.date || !raw.homeTeamId || !raw.awayTeamId) {
      return { success: false, error: 'Missing key fields (date, homeTeamId, awayTeamId)' };
    }

    // 1. Score sanity check
    if (raw.homeScore !== undefined && raw.homeScore !== null) {
      if (raw.homeScore < 0 || raw.homeScore > 25) {
        return { success: false, error: `Invalid homeScore: ${raw.homeScore}` };
      }
    }
    if (raw.awayScore !== undefined && raw.awayScore !== null) {
      if (raw.awayScore < 0 || raw.awayScore > 25) {
        return { success: false, error: `Invalid awayScore: ${raw.awayScore}` };
      }
    }

    // 2. Future-dated finished check
    const matchTime = new Date(raw.kickoffTime || raw.date).getTime();
    const now = Date.now();
    if (matchTime > now && (raw.status === 'FINISHED' || (raw.homeScore !== null && raw.homeScore !== undefined))) {
      return { success: false, error: 'Rejected future-dated finished match' };
    }

    const key = this.generateKey(raw.date, raw.homeTeamId, raw.awayTeamId);
    const existing = this.matchesMap.get(key);

    const merged: CanonicalMatch = {
      id: key,
      date: raw.date.slice(0, 10),
      kickoffTime: raw.kickoffTime || `${raw.date.slice(0, 10)}T15:00:00Z`,
      competitionCode: raw.competitionCode || existing?.competitionCode || 'PL',
      season: raw.season || existing?.season || '2026/2027',
      matchday: raw.matchday ?? existing?.matchday,
      homeTeamId: raw.homeTeamId,
      awayTeamId: raw.awayTeamId,
      homeTeamName: raw.homeTeamName || existing?.homeTeamName || raw.homeTeamId,
      awayTeamName: raw.awayTeamName || existing?.awayTeamName || raw.awayTeamId,
      status: raw.status || existing?.status || 'FINISHED',
      homeScore: raw.homeScore ?? existing?.homeScore ?? null,
      awayScore: raw.awayScore ?? existing?.awayScore ?? null,
      homeHalfTimeScore: raw.homeHalfTimeScore ?? existing?.homeHalfTimeScore ?? null,
      awayHalfTimeScore: raw.awayHalfTimeScore ?? existing?.awayHalfTimeScore ?? null,
      homeShots: raw.homeShots ?? existing?.homeShots ?? null,
      awayShots: raw.awayShots ?? existing?.awayShots ?? null,
      homeShotsOnTarget: raw.homeShotsOnTarget ?? existing?.homeShotsOnTarget ?? null,
      awayShotsOnTarget: raw.awayShotsOnTarget ?? existing?.awayShotsOnTarget ?? null,
      homeCorners: raw.homeCorners ?? existing?.homeCorners ?? null,
      awayCorners: raw.awayCorners ?? existing?.awayCorners ?? null,
      homeYellowCards: raw.homeYellowCards ?? existing?.homeYellowCards ?? null,
      awayYellowCards: raw.awayYellowCards ?? existing?.awayYellowCards ?? null,
      homeRedCards: raw.homeRedCards ?? existing?.homeRedCards ?? null,
      awayRedCards: raw.awayRedCards ?? existing?.awayRedCards ?? null,
      homeFouls: raw.homeFouls ?? existing?.homeFouls ?? null,
      awayFouls: raw.awayFouls ?? existing?.awayFouls ?? null,
      referee: raw.referee ?? existing?.referee ?? null,
      closingOdds: raw.closingOdds || existing?.closingOdds,
      provenance: {
        statsSource: (source === 'football-data.co.uk' ? source : existing?.provenance?.statsSource) || source,
        statusSource: (source === 'football-data.org' || source === 'espn' ? source : existing?.provenance?.statusSource) || source,
        historySource: (source === 'elvidge' ? source : existing?.provenance?.historySource) || source,
        ingestedAt: new Date().toISOString(),
      },
    };

    this.matchesMap.set(key, merged);

    // Track dates for home and away
    this.addTeamDate(raw.homeTeamId, merged.date);
    this.addTeamDate(raw.awayTeamId, merged.date);

    return { success: true };
  }

  private addTeamDate(teamId: string, dateStr: string) {
    if (!this.teamsMatchDates.has(teamId)) {
      this.teamsMatchDates.set(teamId, []);
    }
    const list = this.teamsMatchDates.get(teamId)!;
    if (!list.includes(dateStr)) {
      list.push(dateStr);
      list.sort((a, b) => b.localeCompare(a)); // newest first
    }
  }

  public getMatches(filter?: { competitionCode?: string; season?: string; teamId?: string }): CanonicalMatch[] {
    let list = Array.from(this.matchesMap.values());
    if (filter?.competitionCode && filter.competitionCode !== 'ALL') {
      list = list.filter(m => m.competitionCode === filter.competitionCode);
    }
    if (filter?.season && filter.season !== 'ALL') {
      list = list.filter(m => m.season === filter.season);
    }
    if (filter?.teamId) {
      list = list.filter(m => m.homeTeamId === filter.teamId || m.awayTeamId === filter.teamId);
    }
    return list.sort((a, b) => b.kickoffTime.localeCompare(a.kickoffTime));
  }

  public getTotalMatchesCount(): number {
    return this.matchesMap.size;
  }

  public getStalenessStatus(teamIdOrName: string, refDate?: string): StalenessStatus {
    const canon = lookupCanonicalTeam(teamIdOrName);
    const teamId = canon ? canon.canonicalId : (teamIdOrName.startsWith('team_') ? teamIdOrName : `team_${teamIdOrName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`);
    const teamName = canon ? canon.canonicalName : teamIdOrName;

    const dates = this.teamsMatchDates.get(teamId) || [];
    const refTimestamp = refDate ? new Date(refDate).getTime() : Date.now();

    if (dates.length === 0) {
      return {
        teamId,
        teamName,
        newestMatchDate: null,
        daysSinceLastMatch: null,
        matchesInLast120Days: 0,
        isStale: true,
        staleReason: 'Data out of date: no recent matches stored in database',
      };
    }

    const newestDate = dates[0];
    const newestDateStr = newestDate.slice(0, 10);
    const refDateStr = refDate ? refDate.slice(0, 10) : new Date(refTimestamp).toISOString().slice(0, 10);
    const newestDayTimestamp = new Date(`${newestDateStr}T00:00:00Z`).getTime();
    const refDayTimestamp = new Date(`${refDateStr}T00:00:00Z`).getTime();
    const daysSince = Math.max(0, Math.round((refDayTimestamp - newestDayTimestamp) / (1000 * 60 * 60 * 24)));

    // Count matches in last 120 days
    const window120Start = refTimestamp - 120 * 24 * 60 * 60 * 1000;
    const matchesIn120 = dates.filter(d => {
      const t = new Date(d).getTime();
      return t >= window120Start && t <= refTimestamp;
    }).length;

    let isStale = false;
    let staleReason: string | undefined = undefined;

    // RULE 1: More than 21 days in season
    if (daysSince > 21) {
      isStale = true;
      staleReason = `Data out of date: last match ${daysSince} days ago`;
    } 
    // RULE 2: Fewer than 5 matches in the last 120 days
    else if (matchesIn120 < 5) {
      isStale = true;
      staleReason = `Data out of date: only ${matchesIn120} matches in last 120 days (min 5 required)`;
    }

    return {
      teamId,
      teamName,
      newestMatchDate: newestDate,
      daysSinceLastMatch: daysSince,
      matchesInLast120Days: matchesIn120,
      isStale,
      staleReason,
    };
  }

  public getHeadToHeadMeetings(homeTeamId: string, awayTeamId: string, maxMeetings = 10): CanonicalMatch[] {
    return Array.from(this.matchesMap.values())
      .filter(m => 
        (m.homeTeamId === homeTeamId && m.awayTeamId === awayTeamId) ||
        (m.homeTeamId === awayTeamId && m.awayTeamId === homeTeamId)
      )
      .filter(m => m.status === 'FINISHED' && m.homeScore !== null)
      .sort((a, b) => b.kickoffTime.localeCompare(a.kickoffTime))
      .slice(0, maxMeetings);
  }
}

export const canonicalMatchStore = new CanonicalMatchStore();
