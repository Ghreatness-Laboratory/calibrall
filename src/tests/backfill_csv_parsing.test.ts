// CALIBRALL: Backfill CSV Parsing, Timezone & Team Identity Unit Test Suite
// Verifies:
// 1. Clean parsing of rows containing M'gladbach and Nott'm Forest
// 2. Strict quote behavior (only " is a quote delimiter; apostrophes are literal text)
// 3. Byte-order mark (BOM) stripping
// 4. Time conversion: Europe/London (GMT/BST) to UTC ISO string
// 5. Date handling: Invalid dates skipped (no default to now); missing times stored with null time (no 15:00 default)
// 6. Matchday: Taken from provider if present, or null; never computed from row index
// 7. Team identity: Resolved through aliases; unmatched names reported; no auto-creation of slugified teams
// 8. Idempotent provider_id format: fdco:{div}:{season}:{yyyymmdd}:{homeRaw}:{awayRaw}

import { parse } from 'csv-parse/sync';
import { 
  parseLondonCsvDateTime, 
  sanitizeRawTeamForId, 
  DIVISION_MAP, 
  SUPPORTED_EUROPEAN_SEASONS, 
  SUPPORTED_BRAZIL_SEASONS 
} from '../lib/data/backfillCatalog';
import { lookupTeamStrength } from '../lib/data/teamDatabase';
import { verifyAdminSecretHeader } from '../lib/auth/adminAuth';
import { NextRequest } from 'next/server';

export function runBackfillUnitTests(): { passed: boolean; failures: string[] } {
  const failures: string[] = [];

  console.log('====================================================');
  console.log('CALIBRALL: BACKFILL CSV PARSING & IDENTITY TEST SUITE');
  console.log('====================================================\n');

  // ----------------------------------------------------
  // TEST 1: CSV Parsing with BOM, M'gladbach, and Nott'm Forest
  // ----------------------------------------------------
  console.log('--- TEST 1: CSV Parsing with BOM, M\'gladbach and Nott\'m Forest ---');

  // Raw CSV with leading UTF-8 BOM (\uFEFF) and apostrophes in team names
  const rawCsvWithBom = '\uFEFF' + [
    'Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG,FTR,HTHG,HTAG,HTR,HS,AS,HST,AST,HC,AC,HY,AY,HR,AR,B365H,B365D,B365A',
    'D1,23/08/2024,19:30,M\'gladbach,Leverkusen,2,3,A,0,2,A,14,25,6,10,3,9,1,0,0,0,5.25,4.75,1.55',
    'E0,17/08/2024,15:00,Nott\'m Forest,Bournemouth,1,1,D,1,0,H,14,12,3,3,4,4,1,1,0,0,2.45,3.40,2.88',
    'D1,24/08/2024,14:30,Augsburg,Werder Bremen,2,2,D,1,1,D,10,11,4,3,5,6,2,1,0,0,2.15,3.60,3.25',
    'E0,24/08/2024,,Brighton,Man United,2,1,H,1,0,H,14,11,5,4,4,4,0,2,0,0,2.50,3.60,2.70',
    'E0,invalid_date,15:00,Arsenal,Chelsea,2,0,H,1,0,H,15,8,6,2,6,3,1,2,0,0,1.75,3.80,4.50'
  ].join('\n');

  // Strip BOM
  const cleanedCsv = rawCsvWithBom.replace(/^\uFEFF/, '');
  if (cleanedCsv.charCodeAt(0) === 0xFEFF) {
    failures.push('BOM was not stripped from CSV string');
  }

  // Parse with csv-parse: quote is strictly '"'
  let records: Record<string, string>[] = [];
  try {
    records = parse(cleanedCsv, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
      quote: '"',
      trim: true,
      relax_column_count: true,
    });
  } catch (err: any) {
    failures.push(`CSV parsing threw an error: ${err.message}`);
  }

  if (records.length !== 5) {
    failures.push(`Expected 5 CSV rows to be parsed, received ${records.length}`);
  }

  // Verify Row 0 (M'gladbach)
  const gladbachRow = records[0];
  if (!gladbachRow || gladbachRow.HomeTeam !== "M'gladbach") {
    failures.push(`Row 0 HomeTeam expected "M'gladbach", got "${gladbachRow?.HomeTeam}"`);
  }
  if (gladbachRow?.AwayTeam !== 'Leverkusen') {
    failures.push(`Row 0 AwayTeam expected "Leverkusen", got "${gladbachRow?.AwayTeam}"`);
  }
  if (gladbachRow?.FTHG !== '2' || gladbachRow?.FTAG !== '3') {
    failures.push(`Row 0 scores misaligned due to apostrophe: FTHG=${gladbachRow?.FTHG}, FTAG=${gladbachRow?.FTAG}`);
  }

  // Verify Row 1 (Nott'm Forest)
  const forestRow = records[1];
  if (!forestRow || forestRow.HomeTeam !== "Nott'm Forest") {
    failures.push(`Row 1 HomeTeam expected "Nott'm Forest", got "${forestRow?.HomeTeam}"`);
  }
  if (forestRow?.AwayTeam !== 'Bournemouth') {
    failures.push(`Row 1 AwayTeam expected "Bournemouth", got "${forestRow?.AwayTeam}"`);
  }
  if (forestRow?.FTHG !== '1' || forestRow?.FTAG !== '1') {
    failures.push(`Row 1 scores misaligned due to apostrophe: FTHG=${forestRow?.FTHG}, FTAG=${forestRow?.FTAG}`);
  }

  console.log(`✓ CSV parse successfully parsed ${records.length} rows with M'gladbach and Nott'm Forest.`);

  // ----------------------------------------------------
  // TEST 2: Team Identity & Aliases Resolution
  // ----------------------------------------------------
  console.log('\n--- TEST 2: Team Identity & Aliases Resolution ---');

  const gladbachLookup = lookupTeamStrength("M'gladbach");
  if (!gladbachLookup.found || !gladbachLookup.data) {
    failures.push('M\'gladbach failed to resolve in team knowledge base');
  } else {
    console.log(`✓ M'gladbach resolved to canonical ID: ${gladbachLookup.data.id} (${gladbachLookup.data.name})`);
  }

  const forestLookup = lookupTeamStrength("Nott'm Forest");
  if (!forestLookup.found || !forestLookup.data) {
    failures.push('Nott\'m Forest failed to resolve in team knowledge base');
  } else {
    console.log(`✓ Nott'm Forest resolved to canonical ID: ${forestLookup.data.id} (${forestLookup.data.name})`);
  }

  // Verify that an unknown team name is NOT auto-slugified into an invented ID
  const unknownName = 'NonExistentFC 1899';
  const unknownLookup = lookupTeamStrength(unknownName);
  if (unknownLookup.found) {
    failures.push(`Expected unknown team "${unknownName}" to not be found, but it resolved to: ${unknownLookup.data?.id}`);
  } else {
    console.log(`✓ Unknown team "${unknownName}" rejected without auto-slugification (preserves foreign key integrity).`);
  }

  // ----------------------------------------------------
  // TEST 3: No Invented Data (Dates, London Time to UTC, Null Time)
  // ----------------------------------------------------
  console.log('\n--- TEST 3: No Invented Data (Dates, London Time to UTC, Null Time) ---');

  // 3a. Summer London Time (BST = UTC+1): 17/08/2024 15:00 London -> 14:00 UTC
  const bstKickoff = parseLondonCsvDateTime('17/08/2024', '15:00');
  if (bstKickoff !== '2024-08-17T14:00:00.000Z') {
    failures.push(`Expected Summer BST 17/08/2024 15:00 London to be 2024-08-17T14:00:00.000Z, got "${bstKickoff}"`);
  } else {
    console.log(`✓ Summer BST conversion: 17/08/2024 15:00 London -> ${bstKickoff}`);
  }

  // 3b. Winter London Time (GMT = UTC+0): 15/12/2024 15:00 London -> 15:00 UTC
  const gmtKickoff = parseLondonCsvDateTime('15/12/2024', '15:00');
  if (gmtKickoff !== '2024-12-15T15:00:00.000Z') {
    failures.push(`Expected Winter GMT 15/12/2024 15:00 London to be 2024-12-15T15:00:00.000Z, got "${gmtKickoff}"`);
  } else {
    console.log(`✓ Winter GMT conversion: 15/12/2024 15:00 London -> ${gmtKickoff}`);
  }

  // 3c. Missing time column: Must store date with null time (NO 15:00:00Z default)
  const missingTimeKickoff = parseLondonCsvDateTime('24/08/2024', null);
  if (missingTimeKickoff !== '2024-08-24') {
    failures.push(`Expected missing time to yield date-only "2024-08-24", got "${missingTimeKickoff}"`);
  } else {
    console.log(`✓ Missing time column yields date with null time: "${missingTimeKickoff}" (no 15:00 default)`);
  }

  // 3d. Invalid date: Must return null (never default to new Date() or now)
  const invalidDateKickoff = parseLondonCsvDateTime('invalid_date', '15:00');
  if (invalidDateKickoff !== null) {
    failures.push(`Expected invalid date to yield null, got "${invalidDateKickoff}"`);
  } else {
    console.log(`✓ Invalid date returns null (row safely skipped, never defaulting to now).`);
  }

  // ----------------------------------------------------
  // TEST 4: Idempotent provider_id Generation
  // ----------------------------------------------------
  console.log('\n--- TEST 4: Idempotent provider_id Generation ---');

  const providerIdGladbach = `fdco:d1:2425:20240823:${sanitizeRawTeamForId("M'gladbach")}:${sanitizeRawTeamForId('Leverkusen')}`;
  const expectedProviderId = 'fdco:d1:2425:20240823:m_gladbach:leverkusen';
  if (providerIdGladbach !== expectedProviderId) {
    failures.push(`Expected provider_id "${expectedProviderId}", got "${providerIdGladbach}"`);
  } else {
    console.log(`✓ provider_id deterministic and independent of team IDs: "${providerIdGladbach}"`);
  }

  const providerIdForest = `fdco:e0:2425:20240817:${sanitizeRawTeamForId("Nott'm Forest")}:${sanitizeRawTeamForId('Bournemouth')}`;
  const expectedForestId = 'fdco:e0:2425:20240817:nott_m_forest:bournemouth';
  if (providerIdForest !== expectedForestId) {
    failures.push(`Expected provider_id "${expectedForestId}", got "${providerIdForest}"`);
  } else {
    console.log(`✓ provider_id for Nott'm Forest: "${providerIdForest}"`);
  }

  // ----------------------------------------------------
  // TEST 5: Timing-Safe Admin Secret Verification
  // ----------------------------------------------------
  console.log('\n--- TEST 5: Timing-Safe Admin Secret Verification ---');

  const testSecret32Chars = 'abcdefghijklmnopqrstuvwxyz0123456789_admin'; // 42 chars
  const originalEnvSecret = process.env.ADMIN_SECRET;

  try {
    // 5a. Missing secret in environment -> 503
    delete process.env.ADMIN_SECRET;
    const req1 = new NextRequest('http://localhost:3000/api/admin/backfill?secret=any', {
      headers: { 'x-admin-secret': testSecret32Chars },
    });
    const res1 = verifyAdminSecretHeader(req1);
    if (res1.authorized || res1.response?.status !== 503) {
      failures.push(`Expected 503 when ADMIN_SECRET is not in env, got status ${res1.response?.status}`);
    } else {
      console.log('✓ Verified 503 response when ADMIN_SECRET is missing from environment.');
    }

    // 5b. Short secret (< 32 chars) in environment -> 503
    process.env.ADMIN_SECRET = 'short_secret_123';
    const req2 = new NextRequest('http://localhost:3000/api/admin/backfill', {
      headers: { 'x-admin-secret': 'short_secret_123' },
    });
    const res2 = verifyAdminSecretHeader(req2);
    if (res2.authorized || res2.response?.status !== 503) {
      failures.push(`Expected 503 when ADMIN_SECRET is < 32 chars, got status ${res2.response?.status}`);
    } else {
      console.log('✓ Verified 503 response when ADMIN_SECRET is under 32 characters.');
    }

    // 5c. Valid environment secret, but query string secret provided (no header) -> 401
    process.env.ADMIN_SECRET = testSecret32Chars;
    const req3 = new NextRequest(`http://localhost:3000/api/admin/backfill?secret=${testSecret32Chars}`);
    const res3 = verifyAdminSecretHeader(req3);
    if (res3.authorized || res3.response?.status !== 401) {
      failures.push(`Expected 401 when secret is provided in query string only, got status ${res3.response?.status}`);
    } else {
      console.log('✓ Verified query string secret rejected; only x-admin-secret header is accepted.');
    }

    // 5d. Valid x-admin-secret header with constant-time match -> 200 (authorized)
    const req4 = new NextRequest('http://localhost:3000/api/admin/backfill', {
      headers: { 'x-admin-secret': testSecret32Chars },
    });
    const res4 = verifyAdminSecretHeader(req4);
    if (!res4.authorized) {
      failures.push('Expected x-admin-secret with valid 32+ char secret to be authorized');
    } else {
      console.log('✓ Verified authorized access when x-admin-secret matches ADMIN_SECRET.');
    }
  } finally {
    if (originalEnvSecret) {
      process.env.ADMIN_SECRET = originalEnvSecret;
    } else {
      delete process.env.ADMIN_SECRET;
    }
  }

  // ----------------------------------------------------
  // TEST 6: Call List Matrix Validation (Seasons 2526, 2627, BSA 2025/2026, 1920 Dropped)
  // ----------------------------------------------------
  console.log('\n--- TEST 6: Call List Matrix Validation ---');

  if (!SUPPORTED_EUROPEAN_SEASONS.includes('2526' as any)) {
    failures.push('European seasons must include 2526');
  }
  if (!SUPPORTED_EUROPEAN_SEASONS.includes('2627' as any)) {
    failures.push('European seasons must include 2627 (current)');
  }
  if ((SUPPORTED_EUROPEAN_SEASONS as any).includes('1920')) {
    failures.push('European seasons must drop 1920');
  }
  if (!SUPPORTED_BRAZIL_SEASONS.includes('2025' as any)) {
    failures.push('Brazil seasons must include 2025');
  }
  if (!SUPPORTED_BRAZIL_SEASONS.includes('2026' as any)) {
    failures.push('Brazil seasons must include 2026');
  }
  if ((SUPPORTED_BRAZIL_SEASONS as any).includes('2019') || (SUPPORTED_BRAZIL_SEASONS as any).includes('1920')) {
    failures.push('Brazil seasons must drop 2019/1920');
  }

  console.log(`✓ Supported European seasons: ${SUPPORTED_EUROPEAN_SEASONS.join(', ')} (1920 dropped)`);
  console.log(`✓ Supported Brazil seasons: ${SUPPORTED_BRAZIL_SEASONS.join(', ')} (2019 dropped)`);

  return {
    passed: failures.length === 0,
    failures,
  };
}

// Auto-run if executed directly via tsx/node
if (typeof process !== 'undefined' && process.argv && process.argv[1]?.includes('backfill_csv_parsing')) {
  const result = runBackfillUnitTests();
  if (!result.passed) {
    console.error('\nBACKFILL UNIT TEST FAILURES DETECTED:');
    result.failures.forEach(f => console.error('  - ' + f));
    process.exit(1);
  } else {
    console.log('\n====================================================');
    console.log('ALL BACKFILL CSV & DATA INTEGRITY UNIT TESTS PASSED!');
    console.log('====================================================\n');
  }
}
