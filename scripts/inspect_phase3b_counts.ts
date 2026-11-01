// Phase 3b Audit Execution Script
import fs from 'fs';
import path from 'path';

interface RawMatch {
  id: string;
  kickoff_time: string;
  season: string;
  competition_code: string;
  home_team_id: string;
  home_team_name: string;
  away_team_id: string;
  away_team_name: string;
  home_score: number;
  away_score: number;
  home_half_time_score?: number | null;
  away_half_time_score?: number | null;
  home_shots?: number | null;
  away_shots?: number | null;
  home_corners?: number | null;
  away_corners?: number | null;
  home_yellow_cards?: number | null;
  away_yellow_cards?: number | null;
  home_red_cards?: number | null;
  away_red_cards?: number | null;
  referee?: string | null;
  closing_odds?: {
    homeWin?: number;
    draw?: number;
    awayWin?: number;
    over25?: number;
    under25?: number;
    asianHandicapLine?: number;
    asianHandicapHome?: number;
    asianHandicapAway?: number;
  } | null;
}

const matchesPath = path.join(process.cwd(), 'src/lib/data/free_sources_matches.json');
const rawMatches: RawMatch[] = JSON.parse(fs.readFileSync(matchesPath, 'utf8'));

const matches = rawMatches
  .filter(m => Boolean(m.kickoff_time && m.home_score != null && m.away_score != null))
  .map(m => ({
    id: m.id,
    date: (m.kickoff_time || '').slice(0, 10),
    kickoffTime: m.kickoff_time,
    season: m.season,
    competitionCode: m.competition_code,
    homeTeamId: m.home_team_id,
    homeTeamName: m.home_team_name,
    awayTeamId: m.away_team_id,
    awayTeamName: m.away_team_name,
    homeScore: m.home_score,
    awayScore: m.away_score,
    homeHalfTimeScore: m.home_half_time_score,
    awayHalfTimeScore: m.away_half_time_score,
    homeShots: m.home_shots,
    awayShots: m.away_shots,
    homeCorners: m.home_corners,
    awayCorners: m.away_corners,
    homeYellowCards: m.home_yellow_cards,
    awayYellowCards: m.away_yellow_cards,
    homeRedCards: m.home_red_cards,
    awayRedCards: m.away_red_cards,
    referee: m.referee,
    closingOdds: m.closing_odds,
  }))
  .sort((a, b) => a.kickoffTime.localeCompare(b.kickoffTime));

const warmupMatches = matches.filter(m => m.date < '2024-08-01');
const testMatches = matches.filter(m => m.date >= '2024-08-01' && m.date <= '2026-06-01');

console.log('Total matches:', matches.length);
console.log('Warmup matches (< 2024-08-01):', warmupMatches.length);
console.log('Test matches (2024-08-01 to 2026-06-01):', testMatches.length);

// Breakdown by competition and season
const compSeasonCounts: Record<string, Record<string, number>> = {};
for (const m of testMatches) {
  if (!compSeasonCounts[m.competitionCode]) compSeasonCounts[m.competitionCode] = {};
  compSeasonCounts[m.competitionCode][m.season] = (compSeasonCounts[m.competitionCode][m.season] || 0) + 1;
}
console.log('\nTest Matches Breakdown by Competition & Season:');
console.table(compSeasonCounts);
