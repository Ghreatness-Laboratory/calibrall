// CALIBRALL: Sean Elvidge Historical League Results Ingestion Module
// Repository: https://github.com/seanelvidge/England-football-results
// Licence: Creative Commons Attribution 4.0 International (CC BY 4.0)
// Scope: Long-run home advantage, venue-specific H2H (last 8-10 meetings), and historical derby history ONLY.
// EXCLUDES: corners, disciplinary cards, fatigue, and odds (source contains none).

import { lookupCanonicalTeam } from '../canonicalTeams';
import { canonicalMatchStore, CanonicalMatch } from '../canonicalMatches';

export interface ElvidgeH2HRecord {
  homeTeam: string;
  awayTeam: string;
  venueMeetingsCount: number;
  homeWins: number;
  draws: number;
  awayWins: number;
  homeGoalsTotal: number;
  awayGoalsTotal: number;
  longRunHomeAdvantageRatio: number;
}

export class ElvidgeResultsService {
  private lastSyncTime: string | null = null;
  private maxDate: string | null = null;
  private h2hCache: Map<string, ElvidgeH2HRecord> = new Map();

  /**
   * Parse Elvidge CSV line
   * Format: Season,Tier,Date,HomeTeam,AwayTeam,HomeGoals,AwayGoals
   */
  public ingestElvidgeCsv(csvContent: string): { matchesIngested: number; error?: string } {
    const lines = csvContent.trim().split('\n');
    if (lines.length < 2) return { matchesIngested: 0, error: 'Empty Elvidge CSV' };

    const header = lines[0].split(',').map(s => s.trim());
    const idxDate = header.indexOf('Date');
    const idxHome = header.indexOf('HomeTeam');
    const idxAway = header.indexOf('AwayTeam');
    const idxHomeGoals = header.indexOf('HomeGoals') !== -1 ? header.indexOf('HomeGoals') : header.indexOf('hGoal');
    const idxAwayGoals = header.indexOf('AwayGoals') !== -1 ? header.indexOf('AwayGoals') : header.indexOf('aGoal');
    const idxTier = header.indexOf('Tier');
    const idxSeason = header.indexOf('Season');

    let count = 0;
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',').map(s => s.trim());
      if (parts.length < 5) continue;

      const dateStr = parts[idxDate];
      const rawHome = parts[idxHome];
      const rawAway = parts[idxAway];
      const hg = parseInt(parts[idxHomeGoals], 10);
      const ag = parseInt(parts[idxAwayGoals], 10);

      // Pre-check rule: Exclude all Elvidge rows dated 2026-10-31
      if (!dateStr || dateStr === '2026-10-31' || dateStr >= '2026-10-31' || !rawHome || !rawAway || isNaN(hg) || isNaN(ag)) continue;

      const homeCanon = lookupCanonicalTeam(rawHome);
      const awayCanon = lookupCanonicalTeam(rawAway);
      const homeId = homeCanon ? homeCanon.canonicalId : `team_${rawHome.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      const awayId = awayCanon ? awayCanon.canonicalId : `team_${rawAway.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

      const tierStr = idxTier !== -1 ? parts[idxTier] : '1';
      const compCode = tierStr === '1' ? 'PL' : tierStr === '2' ? 'ELC' : tierStr === '3' ? 'E2' : 'E3';

      const match: Partial<CanonicalMatch> = {
        date: dateStr,
        kickoffTime: `${dateStr}T15:00:00Z`,
        competitionCode: compCode,
        season: idxSeason !== -1 ? parts[idxSeason] : 'Historical',
        homeTeamId: homeId,
        awayTeamId: awayId,
        homeTeamName: homeCanon?.canonicalName || rawHome,
        awayTeamName: awayCanon?.canonicalName || rawAway,
        status: 'FINISHED',
        homeScore: hg,
        awayScore: ag,
        // Explicitly null for fields Elvidge does not have:
        homeCorners: null,
        awayCorners: null,
        homeYellowCards: null,
        awayYellowCards: null,
        closingOdds: undefined,
      };

      const res = canonicalMatchStore.upsertMatch(match, 'elvidge');
      if (res.success) {
        count++;
        if (!this.maxDate || dateStr > this.maxDate) {
          this.maxDate = dateStr;
        }
      }
    }

    this.lastSyncTime = new Date().toISOString();
    return { matchesIngested: count };
  }

  public ingestFromFile(filePath: string = '/tmp/EnglandLeagueResults.csv', maxRows?: number): {
    matchesIngested: number;
    matchedTeamsCount: number;
    unmatchedTeamsCount: number;
    maxDate: string | null;
    error?: string;
  } {
    const fs = require('fs');
    if (!fs.existsSync(filePath)) {
      return { matchesIngested: 0, matchedTeamsCount: 0, unmatchedTeamsCount: 0, maxDate: null, error: `File not found: ${filePath}` };
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.trim().split('\n');
    if (lines.length < 2) return { matchesIngested: 0, matchedTeamsCount: 0, unmatchedTeamsCount: 0, maxDate: null, error: 'Empty file' };

    const header = lines[0].split(',').map((s: string) => s.trim());
    const idxDate = header.indexOf('Date');
    const idxHome = header.indexOf('HomeTeam');
    const idxAway = header.indexOf('AwayTeam');
    const idxHomeGoals = header.indexOf('HomeGoals') !== -1 ? header.indexOf('HomeGoals') : header.indexOf('hGoal');
    const idxAwayGoals = header.indexOf('AwayGoals') !== -1 ? header.indexOf('AwayGoals') : header.indexOf('aGoal');
    const idxTier = header.indexOf('Tier');
    const idxSeason = header.indexOf('Season');

    const matchedTeams = new Set<string>();
    const unmatchedTeams = new Set<string>();
    let count = 0;

    const limit = maxRows ? Math.min(lines.length, maxRows + 1) : lines.length;
    for (let i = 1; i < limit; i++) {
      const parts = lines[i].split(',').map((s: string) => s.trim());
      if (parts.length < 5) continue;

      const dateStr = parts[idxDate];
      const rawHome = parts[idxHome];
      const rawAway = parts[idxAway];
      const hg = parseInt(parts[idxHomeGoals], 10);
      const ag = parseInt(parts[idxAwayGoals], 10);

      // Pre-check rule: Exclude all Elvidge rows dated 2026-10-31
      if (!dateStr || dateStr === '2026-10-31' || dateStr >= '2026-10-31' || !rawHome || !rawAway || isNaN(hg) || isNaN(ag)) continue;

      const homeCanon = lookupCanonicalTeam(rawHome);
      const awayCanon = lookupCanonicalTeam(rawAway);
      if (homeCanon) matchedTeams.add(rawHome); else unmatchedTeams.add(rawHome);
      if (awayCanon) matchedTeams.add(rawAway); else unmatchedTeams.add(rawAway);

      const homeId = homeCanon ? homeCanon.canonicalId : `team_${rawHome.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      const awayId = awayCanon ? awayCanon.canonicalId : `team_${rawAway.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

      const tierStr = idxTier !== -1 ? parts[idxTier] : '1';
      const compCode = tierStr === '1' ? 'PL' : tierStr === '2' ? 'ELC' : tierStr === '3' ? 'E2' : 'E3';

      const match: Partial<CanonicalMatch> = {
        date: dateStr,
        kickoffTime: `${dateStr}T15:00:00Z`,
        competitionCode: compCode,
        season: idxSeason !== -1 ? parts[idxSeason] : 'Historical',
        homeTeamId: homeId,
        awayTeamId: awayId,
        homeTeamName: homeCanon?.canonicalName || rawHome,
        awayTeamName: awayCanon?.canonicalName || rawAway,
        status: 'FINISHED',
        homeScore: hg,
        awayScore: ag,
        homeCorners: null,
        awayCorners: null,
        homeYellowCards: null,
        awayYellowCards: null,
      };

      const res = canonicalMatchStore.upsertMatch(match, 'elvidge');
      if (res.success) {
        count++;
        if (!this.maxDate || dateStr > this.maxDate) {
          this.maxDate = dateStr;
        }
      }
    }

    this.lastSyncTime = new Date().toISOString();
    return {
      matchesIngested: count,
      matchedTeamsCount: matchedTeams.size,
      unmatchedTeamsCount: unmatchedTeams.size,
      maxDate: this.maxDate,
    };
  }

  public getLastSync(): string | null {
    return this.lastSyncTime;
  }

  public getMaxDate(): string | null {
    return this.maxDate;
  }
}

export const elvidgeResultsService = new ElvidgeResultsService();
