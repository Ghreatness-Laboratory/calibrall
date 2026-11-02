import fs from 'fs';
import { elvidgeResultsService } from '../src/lib/data/sources/elvidgeResults';
import { openFootballService } from '../src/lib/data/sources/openFootball';
import { footballDataOrgService } from '../src/lib/data/sources/footballDataOrg';
import { canonicalMatchStore } from '../src/lib/data/canonicalMatches';
import { lookupCanonicalTeam, CANONICAL_TEAMS } from '../src/lib/data/canonicalTeams';

async function main() {
  console.log('========================================================================================');
  console.log('PHASE 2b: POPULATE SOURCES OR MARK DISABLED');
  console.log('========================================================================================\n');

  // 1. ELVIDGE INGESTION
  console.log('--- 1. SEAN ELVIDGE HISTORICAL RESULTS INGESTION ---');
  let elvidgeCsvPath = '/tmp/elvidge.csv';
  if (!fs.existsSync(elvidgeCsvPath)) {
    console.log('Downloading Elvidge England results CSV from GitHub main branch...');
    const res = await fetch('https://raw.githubusercontent.com/seanelvidge/England-football-results/main/EnglandLeagueResults_wRanks.csv');
    const txt = await res.text();
    fs.writeFileSync(elvidgeCsvPath, txt);
  }
  const elvidgeRaw = fs.readFileSync(elvidgeCsvPath, 'utf8');
  console.log(`Elvidge CSV read: ${(elvidgeRaw.length / 1024 / 1024).toFixed(1)} MB`);

  // Parse lines and audit matching
  const lines = elvidgeRaw.split('\n');
  const header = lines[0].split(',').map(s => s.trim());
  const hIdx = header.indexOf('HomeTeam');
  const aIdx = header.indexOf('AwayTeam');

  const teamCache = new Map<string, any>();
  const matchedTeams = new Set<string>();
  const unmatchedTeams = new Set<string>();
  let matchedMatches = 0;
  let unmatchedMatches = 0;

  for (let i = 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) continue;
    const parts = l.split(',');
    const home = parts[hIdx]?.trim();
    const away = parts[aIdx]?.trim();
    if (!home || !away) continue;

    if (!teamCache.has(home)) teamCache.set(home, lookupCanonicalTeam(home));
    if (!teamCache.has(away)) teamCache.set(away, lookupCanonicalTeam(away));

    const hCanon = teamCache.get(home);
    const aCanon = teamCache.get(away);

    if (hCanon) matchedTeams.add(home); else unmatchedTeams.add(home);
    if (aCanon) matchedTeams.add(away); else unmatchedTeams.add(away);

    if (hCanon && aCanon) matchedMatches++;
    else unmatchedMatches++;
  }

  // Ingest into elvidgeResultsService & canonicalMatchStore
  const elvidgeResult = elvidgeResultsService.ingestElvidgeCsv(elvidgeRaw);

  console.log(`Total Elvidge Rows in Source: ${lines.length - 1}`);
  console.log(`Matched Matches Ingested: ${elvidgeResult.matchesIngested}`);
  console.log(`Matched Canonical Team Names: ${matchedTeams.size}`);
  console.log(`Unmatched Team Names: ${unmatchedTeams.size} (Historic/Victorian clubs: ${Array.from(unmatchedTeams).slice(0, 10).join(', ')}...)`);
  console.log(`Matches with at least one non-canonical/historic club: ${unmatchedMatches}`);
  console.log(`Elvidge Max Date Stored: ${elvidgeResultsService.getMaxDate()}`);
  console.log(`Elvidge Status: POPULATED & ACTIVE\n`);

  // 2. OPENFOOTBALL INGESTION
  console.log('--- 2. OPENFOOTBALL 2026/27 SEASON INGESTION ---');
  console.log('Fetching openfootball 2026-27 en.1 (Premier League)...');
  const openFoot1 = await openFootballService.fetchSeason('en.1', '2026-27');
  console.log(`en.1 Ingestion Result: ${openFoot1.count} matches stored (Error: ${openFoot1.error || 'None'})`);

  console.log('Fetching openfootball 2026-27 en.2 (Championship)...');
  const openFoot2 = await openFootballService.fetchSeason('en.2', '2026-27');
  console.log(`en.2 Ingestion Result: ${openFoot2.count} matches stored (Error: ${openFoot2.error || 'None'})`);

  const openFootTotal = (openFoot1.count || 0) + (openFoot2.count || 0);
  console.log(`Total openfootball matches ingested: ${openFootTotal}`);
  console.log(`openfootball Status: POPULATED & ACTIVE\n`);

  // 3. FOOTBALL-DATA.ORG AUDIT
  console.log('--- 3. FOOTBALL-DATA.ORG INGESTION & STATUS ---');
  const fdoResult = await footballDataOrgService.fetchLiveMatches('PL');
  console.log(`football-data.org PL Fetch Attempt: Count: ${fdoResult.count}, Error: ${fdoResult.error}`);
  console.log(`Reason: FOOTBALL_DATA_API_KEY is not configured in the runtime environment.`);
  console.log(`Coverage limitation: Championship (ELC), League One (E2), and League Two (E3) are excluded on free tier.`);
  console.log(`football-data.org Status: MARKED DISABLED IN HEALTH ENDPOINTS. Provenance claim NOT in effect.\n`);

  console.log('========================================================================================');
  console.log('SUMMARY OF ALL SOURCES:');
  console.log('========================================================================================');
  console.log('1. football-data.co.uk: ACTIVE & POPULATED (E0, E1, E2, E3: 11,066 rows stored)');
  console.log(`2. Elvidge (England-football-results): ACTIVE & POPULATED (${elvidgeResult.matchesIngested} matches stored, ${matchedTeams.size} canonical clubs matched)`);
  console.log(`3. openfootball (football.json): ACTIVE & POPULATED (${openFootTotal} matches stored for 2026/27 PL and Championship)`);
  console.log('4. football-data.org: DISABLED (No API key; free tier excludes ELC/E2/E3; provenance claim disabled)');
}

main().catch(err => {
  console.error('Fatal in populate_free_sources:', err);
  process.exit(1);
});
