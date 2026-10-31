// CALIBRALL: Football-Data.co.uk Ingestion Module
// Sourced from Joseph Buchdahl's free historical CSV archive (https://www.football-data.co.uk)
// Columns: Div, Date, Time, HomeTeam, AwayTeam, FTHG, FTAG, HTHG, HTAG, Referee, HS, AS, HST, AST, HC, AC, HY, AY, HR, AR, HF, AF, closing odds.
// Licence: Free for academic, research, personal and statistical analysis with attribution.

import { canonicalMatchStore, CanonicalMatch } from '../canonicalMatches';
import { lookupCanonicalTeam } from '../canonicalTeams';

export interface IngestionResult {
  division: string;
  season: string;
  rowsProcessed: number;
  rowsIngested: number;
  unmatchedTeams: string[];
  newestMatchDate: string | null;
  error?: string;
}

export const DIVISION_MAP: Record<string, string> = {
  E0: 'PL',   // English Premier League
  E1: 'ELC',  // English Championship
  E2: 'E2',   // League One
  E3: 'E3',   // League Two
  D1: 'BL1',  // German Bundesliga
  SP1: 'PD',  // Spanish La Liga
  I1: 'SA',   // Italian Serie A
  F1: 'FL1',  // French Ligue 1
  N1: 'DED',  // Dutch Eredivisie
  SC0: 'SC0', // Scottish Premiership
};

export class FootballDataCoUkService {
  private lastSyncTimestamps: Map<string, string> = new Map();
  private newestResultsPerLeague: Map<string, string> = new Map();

  /**
   * Parse CSV line respecting quotes
   */
  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += char;
      }
    }
    result.push(cur.trim());
    return result;
  }

  /**
   * Parse football-data.co.uk date string (e.g. "16/08/2024" or "25/10/26") into YYYY-MM-DD
   */
  public parseDate(dStr: string): string | null {
    if (!dStr) return null;
    const parts = dStr.split(/[/.-]/);
    if (parts.length !== 3) return null;
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    let year = parts[2];
    if (year.length === 2) {
      const yrNum = parseInt(year, 10);
      year = yrNum > 50 ? `19${year}` : `20${year}`;
    }
    return `${year}-${month}-${day}`;
  }

  /**
   * Ingest CSV content string
   */
  public ingestCsvContent(csvContent: string, division: string, seasonCode: string): IngestionResult {
    const lines = csvContent.trim().split('\n').filter(l => l.trim().length > 0);
    if (lines.length < 2) {
      return { division, season: seasonCode, rowsProcessed: 0, rowsIngested: 0, unmatchedTeams: [], newestMatchDate: null, error: 'Empty CSV' };
    }

    const header = this.parseCsvLine(lines[0]);
    const colIndex = (col: string) => header.indexOf(col);

    const idxDate = colIndex('Date');
    const idxTime = colIndex('Time');
    const idxHome = colIndex('HomeTeam');
    const idxAway = colIndex('AwayTeam');
    const idxFTHG = colIndex('FTHG');
    const idxFTAG = colIndex('FTAG');
    const idxHTHG = colIndex('HTHG');
    const idxHTAG = colIndex('HTAG');
    const idxReferee = colIndex('Referee');
    const idxHS = colIndex('HS');
    const idxAS = colIndex('AS');
    const idxHST = colIndex('HST');
    const idxAST = colIndex('AST');
    const idxHC = colIndex('HC');
    const idxAC = colIndex('AC');
    const idxHY = colIndex('HY');
    const idxAY = colIndex('AY');
    const idxHR = colIndex('HR');
    const idxAR = colIndex('AR');
    const idxHF = colIndex('HF');
    const idxAF = colIndex('AF');

    // Closing odds indexes
    const idxAvgCH = colIndex('AvgCH') !== -1 ? colIndex('AvgCH') : colIndex('AvgH');
    const idxAvgCD = colIndex('AvgCD') !== -1 ? colIndex('AvgCD') : colIndex('AvgD');
    const idxAvgCA = colIndex('AvgCA') !== -1 ? colIndex('AvgCA') : colIndex('AvgA');
    const idxAvgCO25 = colIndex('AvgC>2.5') !== -1 ? colIndex('AvgC>2.5') : colIndex('Avg>2.5');
    const idxAvgCU25 = colIndex('AvgC<2.5') !== -1 ? colIndex('AvgC<2.5') : colIndex('Avg<2.5');
    const idxAHCh = colIndex('AHCh') !== -1 ? colIndex('AHCh') : colIndex('AHh');
    const idxAvgCAHH = colIndex('AvgCAHH') !== -1 ? colIndex('AvgCAHH') : colIndex('AvgAHH');
    const idxAvgCAHA = colIndex('AvgCAHA') !== -1 ? colIndex('AvgCAHA') : colIndex('AvgAHA');

    const compCode = DIVISION_MAP[division] || division;
    let ingestedCount = 0;
    const unmatched = new Set<string>();
    let newestDate: string | null = null;

    for (let i = 1; i < lines.length; i++) {
      const row = this.parseCsvLine(lines[i]);
      if (row.length < 5) continue;

      const rawDate = row[idxDate];
      const parsedDate = this.parseDate(rawDate);
      if (!parsedDate) continue;

      const rawHome = row[idxHome];
      const rawAway = row[idxAway];
      if (!rawHome || !rawAway) continue;

      const homeCanon = lookupCanonicalTeam(rawHome);
      const awayCanon = lookupCanonicalTeam(rawAway);

      if (!homeCanon) unmatched.add(rawHome);
      if (!awayCanon) unmatched.add(rawAway);

      const homeId = homeCanon ? homeCanon.canonicalId : `team_${rawHome.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      const awayId = awayCanon ? awayCanon.canonicalId : `team_${rawAway.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

      const fthg = parseInt(row[idxFTHG], 10);
      const ftag = parseInt(row[idxFTAG], 10);
      if (isNaN(fthg) || isNaN(ftag)) continue;

      const hthg = idxHTHG !== -1 ? parseInt(row[idxHTHG], 10) : null;
      const htag = idxHTAG !== -1 ? parseInt(row[idxHTAG], 10) : null;
      const hs = idxHS !== -1 ? parseInt(row[idxHS], 10) : null;
      const as_ = idxAS !== -1 ? parseInt(row[idxAS], 10) : null;
      const hst = idxHST !== -1 ? parseInt(row[idxHST], 10) : null;
      const ast = idxAST !== -1 ? parseInt(row[idxAST], 10) : null;
      const hc = idxHC !== -1 ? parseInt(row[idxHC], 10) : null;
      const ac = idxAC !== -1 ? parseInt(row[idxAC], 10) : null;
      const hy = idxHY !== -1 ? parseInt(row[idxHY], 10) : null;
      const ay = idxAY !== -1 ? parseInt(row[idxAY], 10) : null;
      const hr = idxHR !== -1 ? parseInt(row[idxHR], 10) : null;
      const ar = idxAR !== -1 ? parseInt(row[idxAR], 10) : null;
      const hf = idxHF !== -1 ? parseInt(row[idxHF], 10) : null;
      const af = idxAF !== -1 ? parseInt(row[idxAF], 10) : null;
      const referee = idxReferee !== -1 && row[idxReferee] ? row[idxReferee].trim() : null;

      // Odds
      const avgH = idxAvgCH !== -1 ? parseFloat(row[idxAvgCH]) : undefined;
      const avgD = idxAvgCD !== -1 ? parseFloat(row[idxAvgCD]) : undefined;
      const avgA = idxAvgCA !== -1 ? parseFloat(row[idxAvgCA]) : undefined;
      const avgO25 = idxAvgCO25 !== -1 ? parseFloat(row[idxAvgCO25]) : undefined;
      const avgU25 = idxAvgCU25 !== -1 ? parseFloat(row[idxAvgCU25]) : undefined;
      const ahLine = idxAHCh !== -1 ? parseFloat(row[idxAHCh]) : undefined;
      const ahHome = idxAvgCAHH !== -1 ? parseFloat(row[idxAvgCAHH]) : undefined;
      const ahAway = idxAvgCAHA !== -1 ? parseFloat(row[idxAvgCAHA]) : undefined;

      const rawTime = idxTime !== -1 && row[idxTime] ? row[idxTime] : '15:00';
      const kickoffTime = `${parsedDate}T${rawTime.length === 5 ? rawTime : '15:00'}:00Z`;

      const matchObj: Partial<CanonicalMatch> = {
        date: parsedDate,
        kickoffTime,
        competitionCode: compCode,
        season: seasonCode.length === 4 ? `20${seasonCode.slice(0, 2)}/20${seasonCode.slice(2, 4)}` : seasonCode,
        homeTeamId: homeId,
        awayTeamId: awayId,
        homeTeamName: homeCanon?.canonicalName || rawHome,
        awayTeamName: awayCanon?.canonicalName || rawAway,
        status: 'FINISHED',
        homeScore: fthg,
        awayScore: ftag,
        homeHalfTimeScore: !isNaN(hthg as number) ? hthg : null,
        awayHalfTimeScore: !isNaN(htag as number) ? htag : null,
        homeShots: !isNaN(hs as number) ? hs : null,
        awayShots: !isNaN(as_ as number) ? as_ : null,
        homeShotsOnTarget: !isNaN(hst as number) ? hst : null,
        awayShotsOnTarget: !isNaN(ast as number) ? ast : null,
        homeCorners: !isNaN(hc as number) ? hc : null,
        awayCorners: !isNaN(ac as number) ? ac : null,
        homeYellowCards: !isNaN(hy as number) ? hy : null,
        awayYellowCards: !isNaN(ay as number) ? ay : null,
        homeRedCards: !isNaN(hr as number) ? hr : null,
        awayRedCards: !isNaN(ar as number) ? ar : null,
        homeFouls: !isNaN(hf as number) ? hf : null,
        awayFouls: !isNaN(af as number) ? af : null,
        referee,
        closingOdds: (avgH && avgD && avgA) ? {
          homeWin: avgH,
          draw: avgD,
          awayWin: avgA,
          over25: avgO25,
          under25: avgU25,
          asianHandicapLine: ahLine,
          asianHandicapHome: ahHome,
          asianHandicapAway: ahAway,
        } : undefined,
      };

      const res = canonicalMatchStore.upsertMatch(matchObj, 'football-data.co.uk');
      if (res.success) {
        ingestedCount++;
        if (!newestDate || parsedDate > newestDate) {
          newestDate = parsedDate;
        }
      }
    }

    if (newestDate) {
      const prev = this.newestResultsPerLeague.get(compCode);
      if (!prev || newestDate > prev) {
        this.newestResultsPerLeague.set(compCode, newestDate);
      }
    }
    this.lastSyncTimestamps.set(division, new Date().toISOString());

    return {
      division,
      season: seasonCode,
      rowsProcessed: lines.length - 1,
      rowsIngested: ingestedCount,
      unmatchedTeams: Array.from(unmatched),
      newestMatchDate: newestDate,
    };
  }

  /**
   * Fetch and ingest a live season CSV from football-data.co.uk
   */
  public async fetchAndIngest(division: string, seasonCode: string): Promise<IngestionResult> {
    const url = `https://www.football-data.co.uk/mmz4281/${seasonCode}/${division}.csv`;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'CalibrallFootballResearch/2.0 (open non-commercial statistical modeling)' },
      });
      if (!res.ok) {
        return { division, season: seasonCode, rowsProcessed: 0, rowsIngested: 0, unmatchedTeams: [], newestMatchDate: null, error: `HTTP ${res.status}` };
      }
      const text = await res.text();
      return this.ingestCsvContent(text, division, seasonCode);
    } catch (e: any) {
      return { division, season: seasonCode, rowsProcessed: 0, rowsIngested: 0, unmatchedTeams: [], newestMatchDate: null, error: e?.message || 'Network error' };
    }
  }

  /**
   * Backfill standard seasons across priority leagues
   */
  public async backfillPriorityLeagues(seasons = ['2425', '2526', '2627'], divisions = ['E0', 'E1', 'D1', 'SP1', 'I1']): Promise<IngestionResult[]> {
    const results: IngestionResult[] = [];
    for (const div of divisions) {
      for (const season of seasons) {
        const res = await this.fetchAndIngest(div, season);
        results.push(res);
      }
    }
    return results;
  }

  public getNewestResultForLeague(leagueCode: string): string | null {
    return this.newestResultsPerLeague.get(leagueCode) || null;
  }

  public getLastSync(division: string): string | null {
    return this.lastSyncTimestamps.get(division) || null;
  }
}

export const footballDataCoUkService = new FootballDataCoUkService();
