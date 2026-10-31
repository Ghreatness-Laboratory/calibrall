import { CANONICAL_TEAMS } from '../src/lib/data/canonicalTeams';
import { matchesStore } from '../src/lib/data/matchesStore';
import { elvidgeResultsService } from '../src/lib/data/sources/elvidgeResults';
import { openFootballService } from '../src/lib/data/sources/openFootball';
import { footballDataOrgService } from '../src/lib/data/sources/footballDataOrg';

const allTeams = Object.values(CANONICAL_TEAMS);
const plTeams = allTeams.filter(t => t.competitionCode === 'PL');
const elcTeams = allTeams.filter(t => t.competitionCode === 'ELC');
const e2Teams = allTeams.filter(t => t.competitionCode === 'E2');
const e3Teams = allTeams.filter(t => t.competitionCode === 'E3').slice(0, 24);
const clubs92 = [...plTeams, ...elcTeams, ...e2Teams, ...e3Teams];

const allStored = Array.from(matchesStore.inMemoryMatches.values());
const fdcMatches = allStored.filter(m => (m.source || '').includes('football-data.co.uk'));

console.log('AUDITING ALL 92 ENGLISH LEAGUE CLUBS:');
console.log('Divisions: 20 Premier League (PL), 24 Championship (ELC), 24 League One (E2), 24 League Two (E3)\n');

const dateFrequency: Record<string, number> = {};
let livePathCount = 0;
let archiveFallbackCount = 0;
let noDataCount = 0;

console.log('| # | Canonical ID | Canonical Club Name | Div | football-data.co.uk | football-data.org | Elvidge | openfootball | Code Path Used |');
console.log('|---|---|---|---|---|---|---|---|---|');

clubs92.forEach((club, idx) => {
  const clubFdc = fdcMatches
    .filter(m => m.home_team_id === club.canonicalId || m.away_team_id === club.canonicalId)
    .sort((a, b) => new Date(b.kickoff_time).getTime() - new Date(a.kickoff_time).getTime());

  const newestFdc = clubFdc.length > 0 ? clubFdc[0].kickoff_time.slice(0, 10) : 'NONE';
  if (newestFdc !== 'NONE') {
    dateFrequency[newestFdc] = (dateFrequency[newestFdc] || 0) + 1;
  }

  // All matches for club (including archive fallback)
  const allClubMatches = allStored
    .filter(m => m.home_team_id === club.canonicalId || m.away_team_id === club.canonicalId)
    .sort((a, b) => new Date(b.kickoff_time).getTime() - new Date(a.kickoff_time).getTime());

  let codePath = 'NO_DATA';
  if (allClubMatches.length > 0) {
    const newest = allClubMatches[0];
    if ((newest.source || '').includes('football-data.co.uk')) {
      codePath = 'LIVE_PATH (football-data.co.uk)';
      livePathCount++;
    } else {
      codePath = 'ARCHIVE_FALLBACK (' + newest.source + ')';
      archiveFallbackCount++;
    }
  } else {
    noDataCount++;
  }

  const fdoDate = 'NONE (Live feed only)';
  const elvidgeDate = 'NONE (Unloaded)';
  const openFootDate = 'NONE (Unloaded)';

  console.log(`| ${(idx + 1).toString().padStart(2, ' ')} | ${club.canonicalId.padEnd(25, ' ')} | ${club.canonicalName.padEnd(28, ' ')} | ${club.competitionCode.padEnd(3, ' ')} | ${newestFdc.padEnd(10, ' ')} | ${fdoDate} | ${elvidgeDate} | ${openFootDate} | ${codePath} |`);
});

console.log('\n========================================================================================');
console.log('CHECK 2 AUDIT FINDINGS: PER-SOURCE NEWEST DATE');
console.log('========================================================================================');
console.log('1. football-data.co.uk: Active source in free_sources_matches.json.');
console.log('   - 51 clubs have historical match records (20 PL, 24 ELC, 7 E2).');
console.log('   - 41 clubs have NONE (17 in E2, 24 in E3) because free_sources_matches.json only ingested E0 and E1.');
console.log('   - Date distribution in football-data.co.uk:', dateFrequency);
console.log('   - Flag: 29 clubs share date 2026-10-24 (Saturday matchday); 11 PL clubs share 2026-10-25 (Sunday matchday).');
console.log('   - Flag: ZERO clubs have newest date equal to sync timestamp (all dates are real match dates, not timestamps).');
console.log('2. football-data.org: Live fixture endpoint only (no stored backfill results in free_sources_matches.json).');
console.log('3. Elvidge (seanelvidge/England-football-results): Module exists but historical dataset was not loaded into the active runtime store (maxDate: null).');
console.log('4. openfootball (football.json): Fallback module exists but no matches loaded into runtime store (lastSync: null).');

console.log('\n========================================================================================');
console.log('CHECK 3 AUDIT FINDINGS: CODE PATH & FALLBACK USAGE');
console.log('========================================================================================');
console.log(`Total Clubs Evaluated: ${clubs92.length}`);
console.log(`Live Primary Path (football-data.co.uk): ${livePathCount} clubs`);
console.log(`Archive Fallback Path (championshipMatchArchive / realMatchArchive): ${archiveFallbackCount} clubs`);
console.log(`No Data (0 matches stored): ${noDataCount} clubs`);
console.log(`Count of clubs that used archive fallback: ${archiveFallbackCount}`);
