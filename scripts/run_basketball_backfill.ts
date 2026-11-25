/**
 * CLI runner for Basketball historical backfill (NBA, NCAAB D1, EuroLeague).
 * Usage:
 *   npx tsx scripts/run_basketball_backfill.ts [--dry-run] [--league=NBA|NCAAB|EUROLEAGUE] [--fill-half-scores]
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  BasketballLeague,
  BASKETBALL_LEAGUE_SEASONS,
  CURRENT_BASKETBALL_SEASON,
} from '../src/lib/basketball/markets';
import {
  upsertBasketballData,
  getBasketballDataStatus,
  getGameDatesMissingHalfScores,
} from '../src/lib/basketball/store';
import { fetchHoopRSeason } from '../src/lib/basketball/sources/hoopRSource';
import {
  fetchEspnScoreboardDates,
  getCurrentSeasonDateWindow,
} from '../src/lib/basketball/sources/espnScoreboardSource';
import { fetchEuroLeagueSeason } from '../src/lib/basketball/sources/euroleagueSource';

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const fillHalfScores = args.includes('--fill-half-scores');
  const leagueArg = args.find((a) => a.startsWith('--league='))?.split('=')[1]?.toUpperCase() as
    | BasketballLeague
    | undefined;

  const targetLeagues: BasketballLeague[] = leagueArg
    ? [leagueArg]
    : ['NBA', 'NCAAB', 'EUROLEAGUE'];

  console.log('=== CALIBRALL BASKETBALL BACKFILL RUNNER ===');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no DB writes)' : 'LIVE WRITE'}`);
  console.log(`Leagues: ${targetLeagues.join(', ')}`);
  console.log(`ESPN historical half-score gap-fill: ${fillHalfScores ? 'ENABLED' : 'OFF'}\n`);

  for (const league of targetLeagues) {
    const seasons = BASKETBALL_LEAGUE_SEASONS[league];
    console.log(`\n--- ${league} (${seasons.length} seasons) ---`);

    if (league === 'EUROLEAGUE') {
      for (const season of seasons) {
        const res = await fetchEuroLeagueSeason(season);
        const withHalf = res.games.filter((g) => g.h1_home !== null && g.h1_away !== null).length;
        const pct = res.games.length > 0 ? Math.round((withHalf * 1000) / res.games.length) / 10 : 0;
        const upsert = await upsertBasketballData(res.teams, res.games, res.unresolvedTeams, dryRun);
        if (upsert.errors.length > 0) {
          throw new Error(`EuroLeague ${season} failed: ${upsert.errors.join(' | ')}`);
        }
        console.log(
          `  [EUROLEAGUE ${season}] read=${res.rowsRead} valid=${res.games.length} skipped=${res.rowsSkipped} half=${pct}% unresolved=${res.unresolvedTeams.length} written=${dryRun ? 0 : upsert.inserted}`
        );
      }
      continue;
    }

    // NBA / NCAAB: 1) hoopR parquet per season
    for (const season of seasons) {
      const res = await fetchHoopRSeason(league, season);
      const withHalf = res.games.filter((g) => g.h1_home !== null && g.h1_away !== null).length;
      const pct = res.games.length > 0 ? Math.round((withHalf * 1000) / res.games.length) / 10 : 0;
      const upsert = await upsertBasketballData(res.teams, res.games, res.unresolvedTeams, dryRun);
      if (upsert.errors.length > 0) {
        throw new Error(`${league} ${season} hoopR failed: ${upsert.errors.join(' | ')}`);
      }
      console.log(
        `  [${league} ${season} hoopR] read=${res.rowsRead} valid=${res.games.length} skipped=${res.rowsSkipped} (type=${res.skippedReasons.nonTargetSeasonType}, nonD1/AllStar=${res.skippedReasons.exhibitionOrNonD1}, unres=${res.skippedReasons.unresolvedTeam}) half=${pct}% written=${dryRun ? 0 : upsert.inserted}`
      );
    }

    // 2) Current season ESPN gap-fill
    const currentDates = getCurrentSeasonDateWindow(CURRENT_BASKETBALL_SEASON);
    const espnCurr = await fetchEspnScoreboardDates({
      league,
      season: CURRENT_BASKETBALL_SEASON,
      dates: currentDates,
      delayMs: 100,
      concurrency: 2,
    });
    const upsertCurr = await upsertBasketballData(
      espnCurr.teams,
      espnCurr.games,
      espnCurr.unresolvedTeams,
      dryRun
    );
    if (upsertCurr.errors.length > 0) {
      throw new Error(`${league} current ESPN gap-fill failed: ${upsertCurr.errors.join(' | ')}`);
    }
    console.log(
      `  [${league} ${CURRENT_BASKETBALL_SEASON} ESPN gap-fill] dates=${espnCurr.datesQueried} games=${espnCurr.games.length} skipped=${espnCurr.rowsSkipped} unres=${espnCurr.unresolvedTeams.length} written=${dryRun ? 0 : upsertCurr.inserted}`
    );

    // 3) Optional historical half-score gap-fill via ESPN for finished games lacking h1
    if (fillHalfScores && !dryRun) {
      for (const season of seasons) {
        const missing = await getGameDatesMissingHalfScores(league, season);
        if (missing.dates.length === 0) continue;
        console.log(
          `  [${league} ${season} ESPN half-fill] querying ${missing.dates.length} dates (${missing.totalGamesMissing} games missing h1)...`
        );
        const espnHist = await fetchEspnScoreboardDates({
          league,
          season,
          dates: missing.dates,
          delayMs: 80,
          concurrency: 3,
        });
        const upsertHist = await upsertBasketballData(
          espnHist.teams,
          espnHist.games,
          espnHist.unresolvedTeams,
          false
        );
        if (upsertHist.errors.length > 0) {
          throw new Error(`${league} ${season} ESPN half-fill failed: ${upsertHist.errors.join(' | ')}`);
        }
        const filledHalf = espnHist.games.filter((g) => g.h1_home !== null && g.h1_away !== null).length;
        console.log(
          `    -> fetched=${espnHist.games.length} withHalf=${filledHalf} unresolved=${espnHist.unresolvedTeams.length} updated=${upsertHist.inserted}`
        );
      }
    }
  }

  console.log('\n=== DATA STATUS REPORT ===');
  const status = await getBasketballDataStatus();
  console.log(
    `Total games: ${status.totalGames} | Canonical teams: ${status.totalTeams} | Earliest: ${status.earliestDate} | Latest: ${status.latestDate} | Unresolved: ${status.unresolvedTeamsCount} | Method: ${status.aggregationMethod}`
  );
  console.log('\nLeague Summary:');
  for (const l of status.leagueSummary) {
    console.log(
      `  ${l.league.padEnd(11)} | games=${String(l.count).padStart(6)} | finished=${String(l.finishedCount).padStart(6)} | half=${String(l.withHalfScoresCount).padStart(6)} (${l.halfScoresPct}%) | latest=${l.latestDate}`
    );
  }
  console.log('\nPer League & Season:');
  for (const row of status.gamesPerLeagueAndSeason) {
    console.log(
      `  ${row.league.padEnd(11)} ${row.season} | games=${String(row.count).padStart(5)} | finished=${String(row.finishedCount).padStart(5)} | half=${String(row.withHalfScoresCount).padStart(5)} (${String(row.halfScoresPct).padStart(5)}%) | ${row.earliestDate}..${row.latestDate}`
    );
  }

  if (status.unresolvedTeams.length > 0) {
    console.log('\nUnresolved Team Names:');
    for (const u of status.unresolvedTeams) {
      console.log(`  [${u.sourceProvider}] ${u.sourceName} (${u.count}x)`);
    }
  }

  const dbPath = path.join(process.cwd(), 'data', 'supabase.db');
  if (fs.existsSync(dbPath)) {
    const sizeMb = (fs.statSync(dbPath).size / (1024 * 1024)).toFixed(2);
    console.log(`\nLocal SQLite DB size (data/supabase.db): ${sizeMb} MB`);
  }
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
