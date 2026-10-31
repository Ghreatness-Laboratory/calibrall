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
    const idxHomeGoals = header.indexOf('HomeGoals');
    const idxAwayGoals = header.indexOf('AwayGoals');
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

      if (!dateStr || !rawHome || !rawAway || isNaN(hg) || isNaN(ag)) continue;

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

  public getLastSync(): string | null {
    return this.lastSyncTime;
  }

  public getMaxDate(): string | null {
    return this.maxDate;
  }
}

export const elvidgeResultsService = new ElvidgeResultsService();
