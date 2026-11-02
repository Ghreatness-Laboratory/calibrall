import { CANONICAL_TEAMS } from '../src/lib/data/canonicalTeams';
import { matchesStore } from '../src/lib/data/matchesStore';
import { CanonicalMatchStore } from '../src/lib/data/canonicalMatches';

const allTeams = Object.values(CANONICAL_TEAMS);
const plTeams = allTeams.filter(t => t.competitionCode === 'PL');
const elcTeams = allTeams.filter(t => t.competitionCode === 'ELC');
const e2Teams = allTeams.filter(t => t.competitionCode === 'E2');
const e3Teams = allTeams.filter(t => t.competitionCode === 'E3').slice(0, 24);
const clubs92 = [...plTeams, ...elcTeams, ...e2Teams, ...e3Teams];

const refDate = '2026-10-31T15:00:00Z';
console.log('========================================================================================');
console.log(`STALENESS GATE AUDIT FOR ALL 92 CLUBS (REFERENCE DATE: ${refDate})`);
console.log('========================================================================================\n');

let passCount = 0;
let insufficientZeroRecordsCount = 0;
let staleOldDateCount = 0;

console.log('| # | Canonical ID | Club Name | Div | Last Match Date | Days | 120d Count | Gate Status | Gate Reason |');
console.log('|---|---|---|---|---|---|---|---|---|');

clubs92.forEach((club, idx) => {
  const matchInfo = matchesStore.getTeamDaysSinceLastMatch(club.canonicalId, refDate);
  let status = 'PASS';
  let reason = 'Data current (<=21d, >=5 matches)';

  if (matchInfo.days === null || matchInfo.lastMatchDate === null) {
    status = 'INSUFFICIENT DATA';
    reason = 'Insufficient data: zero match records stored in database';
    insufficientZeroRecordsCount++;
  } else if (matchInfo.days > 21) {
    status = 'INSUFFICIENT DATA (STALE)';
    reason = `Data out of date: last match ${matchInfo.days} days ago`;
    staleOldDateCount++;
  } else if (matchInfo.matchesInLast120Days < 5) {
    status = 'INSUFFICIENT DATA (SPARSE)';
    reason = `Data out of date: only ${matchInfo.matchesInLast120Days} matches in last 120 days`;
    staleOldDateCount++;
  } else {
    passCount++;
  }

  const lastDateStr = matchInfo.lastMatchDate ? matchInfo.lastMatchDate.slice(0, 10) : 'NONE';
  const daysStr = matchInfo.days !== null ? matchInfo.days.toString() : 'N/A';
  console.log(`| ${(idx + 1).toString().padStart(2, ' ')} | ${club.canonicalId.padEnd(25, ' ')} | ${club.canonicalName.padEnd(26, ' ')} | ${club.competitionCode.padEnd(3, ' ')} | ${lastDateStr.padEnd(10, ' ')} | ${daysStr.padStart(4, ' ')} | ${matchInfo.matchesInLast120Days.toString().padStart(10, ' ')} | ${status.padEnd(25, ' ')} | ${reason} |`);
});

console.log('\n========================================================================================');
console.log('GATE COUNT SUMMARY (PRE-INGESTION):');
console.log('========================================================================================');
console.log(`Total Clubs: ${clubs92.length}`);
console.log(`PASS: ${passCount}`);
console.log(`INSUFFICIENT DATA (Zero records stored): ${insufficientZeroRecordsCount}`);
console.log(`INSUFFICIENT DATA (Stale / Sparse): ${staleOldDateCount}`);
console.log(`Total Gated (Insufficient): ${insufficientZeroRecordsCount + staleOldDateCount}`);
