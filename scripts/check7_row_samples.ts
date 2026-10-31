import fs from 'fs';
import { canonicalMatchStore } from '../src/lib/data/canonicalMatches';

console.log('========================================================================================');
console.log('CHECK 7: CANONICAL MATCH TABLE ROW SAMPLES WITH PER-FIELD PROVENANCE');
console.log('========================================================================================\n');

const freeSourcesMatches = JSON.parse(fs.readFileSync('src/lib/data/free_sources_matches.json', 'utf8'));

// Take 5 diverse sample matches across Premier League, Championship and European leagues
const samplesToLoad = [
  freeSourcesMatches.find((m: any) => m.competition_code === 'PL' && m.season === '2026/2027'),
  freeSourcesMatches.find((m: any) => m.competition_code === 'ELC' && m.season === '2026/2027'),
  freeSourcesMatches.find((m: any) => m.home_team_name === 'Lincoln' || m.away_team_name === 'Lincoln'),
  freeSourcesMatches.find((m: any) => m.competition_code === 'PL' && m.season === '2025/2026'),
  freeSourcesMatches.find((m: any) => m.competition_code === 'ELC' && m.season === '2024/2025'),
];

const loadedRows: any[] = [];

for (const raw of samplesToLoad) {
  if (!raw) continue;
  const matchObj = {
    date: raw.kickoff_time.slice(0, 10),
    kickoffTime: raw.kickoff_time,
    competitionCode: raw.competition_code,
    season: raw.season,
    matchday: raw.matchday ?? null,
    homeTeamId: raw.home_team_id,
    awayTeamId: raw.away_team_id,
    homeTeamName: raw.home_team_name,
    awayTeamName: raw.away_team_name,
    status: raw.status,
    homeScore: raw.home_score,
    awayScore: raw.away_score,
    homeHalfTimeScore: raw.home_half_time_score,
    awayHalfTimeScore: raw.away_half_time_score,
    homeCorners: raw.home_corners,
    awayCorners: raw.away_corners,
    homeYellowCards: raw.home_yellow_cards,
    awayYellowCards: raw.away_yellow_cards,
    homeRedCards: raw.home_red_cards,
    awayRedCards: raw.away_red_cards,
    homeShots: raw.home_shots,
    awayShots: raw.away_shots,
    homeShotsOnTarget: raw.home_shots_on_target,
    awayShotsOnTarget: raw.away_shots_on_target,
    homeFouls: raw.home_fouls,
    awayFouls: raw.away_fouls,
    referee: raw.referee,
    closingOdds: raw.closing_odds ? {
      homeWin: raw.closing_odds.homeWin,
      draw: raw.closing_odds.draw,
      awayWin: raw.closing_odds.awayWin,
      over25: raw.closing_odds.over25,
      under25: raw.closing_odds.under25,
      asianHandicapLine: raw.closing_odds.asianHandicapLine,
      asianHandicapHome: raw.closing_odds.asianHandicapHome,
      asianHandicapAway: raw.closing_odds.asianHandicapAway,
    } : undefined,
  };

  canonicalMatchStore.upsertMatch(matchObj, 'football-data.co.uk');
}

const retrieved = canonicalMatchStore.getMatches();

retrieved.slice(0, 5).forEach((m, idx) => {
  console.log(`--- [SAMPLE ROW ${idx + 1}] ID: ${m.id} ---`);
  console.log(JSON.stringify(m, null, 2));
  console.log('');
});
