// CALIBRALL: Credit-Safe Basketball Odds API Service
// Sport keys: basketball_nba, basketball_ncaab, basketball_euroleague
// Strictly authorized markets ONLY: totals (game_total), team_totals (home_total/away_total), totals_h1 (h1_game_total)
// Enforces:
//   - Basketball daily credit budget <= 8 credits/day (tracked via provider_call_logs)
//   - Shared monthly cap <= 500 credits/month (never exceeds shared quota)
//   - Batched 'totals' first (1 credit/sport/day)
//   - Per-event 'team_totals,totals_h1' ONLY for NBA & EuroLeague games with HIGH-tier picks
//   - NCAAB receives batched game totals at most (NEVER per-event calls)
//   - Cleanly returns 0 calls when ODDS_API_KEY is unset (no invented odds/EV)

import { supabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { fetchAllRows, chunkArray } from '@/lib/supabase/pagination';
import {
  loggedProviderFetch,
  getProviderSyncState,
  upsertProviderSyncState,
} from '@/lib/data/providerCallLogger';
import { BasketballLeague, BasketballMarketCategory } from './markets';
import { resolveBasketballTeam, normalizeBasketballAlias } from './canonicalTeams';
import { StoredBbGame } from './store';
import { BbOddsQuote, BasketballGameEvaluation } from './picker';

export const BB_DAILY_ODDS_CREDIT_CAP = 8;
export const SHARED_MONTHLY_ODDS_CAP = 500;

export const BASKETBALL_ODDS_SPORT_KEYS: Record<BasketballLeague, string> = {
  NBA: 'basketball_nba',
  NCAAB: 'basketball_ncaab',
  EUROLEAGUE: 'basketball_euroleague',
};

const BASKETBALL_LEAGUE_LOG_CODES = new Set(['BB_NBA', 'BB_NCAAB', 'BB_EUROLEAGUE']);

export interface BasketballOddsSyncResult {
  status: 'ONLINE' | 'SKIPPED_NO_KEY' | 'SKIPPED_BUDGET_CAP' | 'ERROR';
  callsMade: number;
  creditsSpentThisRun: number;
  creditsUsedTodayBeforeRun: number;
  dailyBudgetCap: number;
  monthlyQuotaRemaining: number | null;
  quotesUpserted: number;
  leaguesQueried: BasketballLeague[];
  perEventGamesQueried: number;
  notes: string[];
  error?: string;
}

function estimateCallCreditCost(
  quotaHeaders: Record<string, string>,
  fallbackCost: number
): number {
  const rawLast = quotaHeaders['x-requests-last'];
  if (rawLast !== undefined) {
    const parsed = Number(rawLast);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return fallbackCost;
}

export async function getBasketballOddsCreditsUsedToday(): Promise<number> {
  const todayPrefix = new Date().toISOString().slice(0, 10);
  if (!isSupabaseConfigured || !supabase) return 0;

  try {
    const { data, error } = await fetchAllRows<any>((from, to) =>
      supabase
        .from('provider_call_logs')
        .select('id, provider, league_code, endpoint, quota_headers_json')
        .eq('provider', 'the-odds-api')
        .gte('timestamp', `${todayPrefix}T00:00:00.000Z`)
        .order('timestamp', { ascending: false })
        .range(from, to)
    );

    if (error || !Array.isArray(data)) return 0;

    let sum = 0;
    for (const row of data) {
      const code = String(row.league_code || '').toUpperCase();
      if (!BASKETBALL_LEAGUE_LOG_CODES.has(code)) continue;
      let headers: Record<string, string> = {};
      try {
        headers = row.quota_headers_json ? JSON.parse(row.quota_headers_json) : {};
      } catch {
        headers = {};
      }
      const isPerEvent = String(row.endpoint || '').includes('/events/');
      sum += estimateCallCreditCost(headers, isPerEvent ? 2 : 1);
    }
    return sum;
  } catch {
    return 0;
  }
}

export async function getSharedMonthlyQuotaRemaining(): Promise<number | null> {
  try {
    const state = await getProviderSyncState('provider:the-odds-api');
    if (state?.quotaRemaining) {
      const rem = Number(state.quotaRemaining);
      if (Number.isFinite(rem) && rem >= 0) {
        return rem;
      }
    }
    const usedHeader = state?.quotaHeaders?.['x-requests-used'];
    if (usedHeader) {
      const used = Number(usedHeader);
      if (Number.isFinite(used) && used >= 0) {
        return Math.max(0, SHARED_MONTHLY_ODDS_CAP - used);
      }
    }
  } catch {
    // Non-fatal
  }
  return null;
}

function teamNamesMatch(
  league: BasketballLeague,
  apiName: string,
  canonicalId: string,
  canonicalName: string,
  aliases: string[] = []
): boolean {
  const resolved = resolveBasketballTeam(league, { name: apiName });
  if (resolved && resolved.id === canonicalId) return true;

  const normApi = normalizeBasketballAlias(apiName);
  if (!normApi) return false;
  for (const cand of [canonicalName, ...aliases]) {
    const normCand = normalizeBasketballAlias(cand);
    if (!normCand) continue;
    if (normApi === normCand || normApi.includes(normCand) || normCand.includes(normApi)) {
      return true;
    }
  }
  return false;
}

function extractConsensusTotalsQuote(
  bookmakers: any[],
  marketKey: 'totals' | 'totals_h1',
  gameId: string,
  league: BasketballLeague,
  marketCategory: 'game_total' | 'h1_game_total',
  observedAt: string
): BbOddsQuote | null {
  const byLine = new Map<number, { overPrices: number[]; underPrices: number[]; bookmakers: string[] }>();

  for (const bk of bookmakers) {
    const market = Array.isArray(bk?.markets)
      ? bk.markets.find((m: any) => m?.key === marketKey)
      : null;
    if (!market || !Array.isArray(market.outcomes)) continue;

    for (const outcome of market.outcomes) {
      const line = Number(outcome?.point);
      const price = Number(outcome?.price);
      const sideLabel = String(outcome?.name || '').toLowerCase();
      if (!Number.isFinite(line) || line <= 5 || !Number.isFinite(price) || price <= 1.01) continue;
      const roundedLine = Math.round(line * 2) / 2;
      const bucket = byLine.get(roundedLine) || { overPrices: [], underPrices: [], bookmakers: [] };
      if (sideLabel === 'over') bucket.overPrices.push(price);
      else if (sideLabel === 'under') bucket.underPrices.push(price);
      if (bk?.title && !bucket.bookmakers.includes(String(bk.title))) {
        bucket.bookmakers.push(String(bk.title));
      }
      byLine.set(roundedLine, bucket);
    }
  }

  let bestLine: number | null = null;
  let bestCount = 0;
  for (const [line, bucket] of byLine.entries()) {
    const count = bucket.overPrices.length + bucket.underPrices.length;
    if (bucket.overPrices.length > 0 && bucket.underPrices.length > 0 && count > bestCount) {
      bestCount = count;
      bestLine = line;
    }
  }

  if (bestLine === null) {
    for (const [line, bucket] of byLine.entries()) {
      const count = bucket.overPrices.length + bucket.underPrices.length;
      if (count > bestCount) {
        bestCount = count;
        bestLine = line;
      }
    }
  }

  if (bestLine === null) return null;
  const chosen = byLine.get(bestLine)!;
  const avg = (arr: number[]) =>
    arr.length > 0 ? Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 1000) / 1000 : null;

  const overOdds = avg(chosen.overPrices);
  const underOdds = avg(chosen.underPrices);
  if (overOdds === null && underOdds === null) return null;

  return {
    id: `bbo_${gameId}_${marketCategory}_game`,
    game_id: gameId,
    league,
    market_category: marketCategory,
    side: 'game',
    line: bestLine,
    over_odds: overOdds,
    under_odds: underOdds,
    bookmaker: chosen.bookmakers[0] || 'Bookmaker Consensus',
    observed_at: observedAt,
  };
}

function extractTeamTotalsQuotes(
  bookmakers: any[],
  gameId: string,
  league: BasketballLeague,
  homeTeam: { id: string; name: string; aliases: string[] },
  awayTeam: { id: string; name: string; aliases: string[] },
  observedAt: string
): BbOddsQuote[] {
  const out: BbOddsQuote[] = [];

  for (const side of ['home', 'away'] as const) {
    const team = side === 'home' ? homeTeam : awayTeam;
    const category: BasketballMarketCategory = side === 'home' ? 'home_total' : 'away_total';
    const byLine = new Map<number, { overPrices: number[]; underPrices: number[]; bookmakers: string[] }>();

    for (const bk of bookmakers) {
      const market = Array.isArray(bk?.markets)
        ? bk.markets.find((m: any) => m?.key === 'team_totals')
        : null;
      if (!market || !Array.isArray(market.outcomes)) continue;

      for (const outcome of market.outcomes) {
        const desc = String(outcome?.description || '').trim();
        if (!desc || !teamNamesMatch(league, desc, team.id, team.name, team.aliases)) continue;

        const line = Number(outcome?.point);
        const price = Number(outcome?.price);
        const nameLabel = String(outcome?.name || '').toLowerCase();
        if (!Number.isFinite(line) || line <= 5 || !Number.isFinite(price) || price <= 1.01) continue;

        const roundedLine = Math.round(line * 2) / 2;
        const bucket = byLine.get(roundedLine) || { overPrices: [], underPrices: [], bookmakers: [] };
        if (nameLabel === 'over') bucket.overPrices.push(price);
        else if (nameLabel === 'under') bucket.underPrices.push(price);
        if (bk?.title && !bucket.bookmakers.includes(String(bk.title))) {
          bucket.bookmakers.push(String(bk.title));
        }
        byLine.set(roundedLine, bucket);
      }
    }

    let bestLine: number | null = null;
    let bestCount = 0;
    for (const [line, bucket] of byLine.entries()) {
      const count = bucket.overPrices.length + bucket.underPrices.length;
      if (count > bestCount) {
        bestCount = count;
        bestLine = line;
      }
    }

    if (bestLine !== null) {
      const chosen = byLine.get(bestLine)!;
      const avg = (arr: number[]) =>
        arr.length > 0 ? Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 1000) / 1000 : null;
      const overOdds = avg(chosen.overPrices);
      const underOdds = avg(chosen.underPrices);
      if (overOdds !== null || underOdds !== null) {
        out.push({
          id: `bbo_${gameId}_${category}_${side}`,
          game_id: gameId,
          league,
          market_category: category,
          side,
          line: bestLine,
          over_odds: overOdds,
          under_odds: underOdds,
          bookmaker: chosen.bookmakers[0] || 'Bookmaker Consensus',
          observed_at: observedAt,
        });
      }
    }
  }

  return out;
}

export async function upsertBasketballOddsSnapshots(quotes: BbOddsQuote[]): Promise<number> {
  if (!isSupabaseConfigured || !supabase || quotes.length === 0) return 0;
  const nowIso = new Date().toISOString();
  let saved = 0;

  const payloads = quotes.map((q) => ({
    id: q.id,
    game_id: q.game_id,
    league: q.league,
    market_category: q.market_category,
    side: q.side,
    line: q.line,
    over_odds: q.over_odds,
    under_odds: q.under_odds,
    bookmaker: q.bookmaker,
    observed_at: q.observed_at,
    updated_at: nowIso,
  }));

  for (const chunk of chunkArray(payloads, 200)) {
    const { error } = await supabase
      .from('bb_odds_snapshots')
      .upsert(chunk, { onConflict: 'id' });
    if (!error) {
      saved += chunk.length;
    }
  }
  return saved;
}

/**
 * Fetches basketball odds within strict daily (<=8) and monthly (<=500) caps.
 * 1) Batched 'totals' (1 credit each) for NBA & EuroLeague scheduled games.
 * 2) Per-event 'team_totals,totals_h1' ONLY for NBA & EuroLeague games with HIGH-tier picks.
 * 3) Batched 'totals' (1 credit) for NCAAB scheduled games if remaining daily budget allows.
 */
export async function syncBasketballOdds(params: {
  upcomingGames: StoredBbGame[];
  teamLookup: Map<string, { id: string; name: string; aliases: string[] }>;
  highTierGameIds: Set<string>;
  syncMode?: string;
}): Promise<BasketballOddsSyncResult> {
  const apiKey = process.env.ODDS_API_KEY?.trim();
  if (!apiKey) {
    return {
      status: 'SKIPPED_NO_KEY',
      callsMade: 0,
      creditsSpentThisRun: 0,
      creditsUsedTodayBeforeRun: 0,
      dailyBudgetCap: BB_DAILY_ODDS_CREDIT_CAP,
      monthlyQuotaRemaining: null,
      quotesUpserted: 0,
      leaguesQueried: [],
      perEventGamesQueried: 0,
      notes: ['ODDS_API_KEY not configured; keeping model lines without market prices (no EV computed).'],
    };
  }

  const creditsUsedBefore = await getBasketballOddsCreditsUsedToday();
  let dailyRemaining = Math.max(0, BB_DAILY_ODDS_CREDIT_CAP - creditsUsedBefore);
  let monthlyRemaining = await getSharedMonthlyQuotaRemaining();

  if (dailyRemaining < 1) {
    return {
      status: 'SKIPPED_BUDGET_CAP',
      callsMade: 0,
      creditsSpentThisRun: 0,
      creditsUsedTodayBeforeRun: creditsUsedBefore,
      dailyBudgetCap: BB_DAILY_ODDS_CREDIT_CAP,
      monthlyQuotaRemaining: monthlyRemaining,
      quotesUpserted: 0,
      leaguesQueried: [],
      perEventGamesQueried: 0,
      notes: [`Basketball daily Odds API credit cap reached (${creditsUsedBefore}/${BB_DAILY_ODDS_CREDIT_CAP}).`],
    };
  }

  if (monthlyRemaining !== null && monthlyRemaining <= 5) {
    return {
      status: 'SKIPPED_BUDGET_CAP',
      callsMade: 0,
      creditsSpentThisRun: 0,
      creditsUsedTodayBeforeRun: creditsUsedBefore,
      dailyBudgetCap: BB_DAILY_ODDS_CREDIT_CAP,
      monthlyQuotaRemaining: monthlyRemaining,
      quotesUpserted: 0,
      leaguesQueried: [],
      perEventGamesQueried: 0,
      notes: [`Shared 500-credit monthly Odds API cap safety floor reached (remaining=${monthlyRemaining}).`],
    };
  }

  const syncMode = params.syncMode || 'schedule';
  const nowIso = new Date().toISOString();
  let callsMade = 0;
  let creditsSpent = 0;
  let perEventGamesQueried = 0;
  const leaguesQueried: BasketballLeague[] = [];
  const collectedQuotes: BbOddsQuote[] = [];
  const notes: string[] = [];
  let lastError: string | undefined;

  const canSpend = (minCredits: number) =>
    dailyRemaining >= minCredits && (monthlyRemaining === null || monthlyRemaining - minCredits >= 5);

  const recordSpend = (spent: number, quotaHeaders: Record<string, string>, quotaRemStr: string | null) => {
    creditsSpent += spent;
    dailyRemaining = Math.max(0, dailyRemaining - spent);
    if (quotaRemStr !== null) {
      const rem = Number(quotaRemStr);
      if (Number.isFinite(rem)) monthlyRemaining = rem;
    } else if (monthlyRemaining !== null) {
      monthlyRemaining = Math.max(0, monthlyRemaining - spent);
    }
    if (quotaHeaders['x-requests-remaining'] || quotaRemStr) {
      void upsertProviderSyncState('provider:the-odds-api', {
        sport: 'odds',
        providerName: 'The Odds API v4',
        status: 'ONLINE',
        lastAttemptAt: nowIso,
        lastSuccessAt: nowIso,
        quotaRemaining: quotaRemStr || quotaHeaders['x-requests-remaining'] || null,
        quotaHeaders,
      });
    }
  };

  // Track matched Odds API event IDs for NBA & EuroLeague per-event HIGH-tier upgrades
  const matchedEventsForPerEvent: Array<{
    game: StoredBbGame;
    sportKey: string;
    eventId: string;
    homeTeam: { id: string; name: string; aliases: string[] };
    awayTeam: { id: string; name: string; aliases: string[] };
  }> = [];

  const matchUpcomingGame = (
    league: BasketballLeague,
    evHomeName: string,
    evAwayName: string,
    commenceIso: string
  ): StoredBbGame | null => {
    const evDateMs = Date.parse(commenceIso);
    const leagueGames = params.upcomingGames.filter((g) => g.league === league && g.status === 'SCHEDULED');

    for (const g of leagueGames) {
      const homeTeam = params.teamLookup.get(g.home_id) || { id: g.home_id, name: g.home_id, aliases: [] };
      const awayTeam = params.teamLookup.get(g.away_id) || { id: g.away_id, name: g.away_id, aliases: [] };
      const gMs = Date.parse(g.kickoff_utc || `${g.game_date}T18:00:00Z`);
      if (Number.isFinite(evDateMs) && Number.isFinite(gMs) && Math.abs(evDateMs - gMs) > 36 * 3600_000) {
        continue;
      }
      if (
        teamNamesMatch(league, evHomeName, homeTeam.id, homeTeam.name, homeTeam.aliases) &&
        teamNamesMatch(league, evAwayName, awayTeam.id, awayTeam.name, awayTeam.aliases)
      ) {
        return g;
      }
    }
    return null;
  };

  // Step 1: Batched 'totals' (1 credit each) for NBA & EuroLeague
  for (const league of ['NBA', 'EUROLEAGUE'] as BasketballLeague[]) {
    const hasUpcoming = params.upcomingGames.some((g) => g.league === league && g.status === 'SCHEDULED');
    if (!hasUpcoming) {
      notes.push(`${league}: no upcoming scheduled games.`);
      continue;
    }
    if (!canSpend(1)) {
      notes.push(`${league}: skipped totals due to credit budget.`);
      continue;
    }

    const sportKey = BASKETBALL_ODDS_SPORT_KEYS[league];
    const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?apiKey=${encodeURIComponent(
      apiKey
    )}&regions=us,eu&markets=totals&oddsFormat=decimal`;

    callsMade++;
    const res = await loggedProviderFetch('the-odds-api', url, {
      leagueCode: `BB_${league}`,
      syncMode,
      timeoutMs: 8000,
    });
    const cost = estimateCallCreditCost(res.quotaHeaders, 1);
    recordSpend(cost, res.quotaHeaders, res.quotaRemaining);
    leaguesQueried.push(league);

    if (!res.ok || !Array.isArray(res.json)) {
      lastError = res.error || `HTTP ${res.status}`;
      notes.push(`${league} totals error: ${lastError}`);
      continue;
    }

    let matchedCount = 0;
    for (const ev of res.json) {
      const matched = matchUpcomingGame(
        league,
        String(ev?.home_team || ''),
        String(ev?.away_team || ''),
        String(ev?.commence_time || '')
      );
      if (!matched) continue;
      matchedCount++;

      const bookmakers = Array.isArray(ev?.bookmakers) ? ev.bookmakers : [];
      const q = extractConsensusTotalsQuote(bookmakers, 'totals', matched.id, league, 'game_total', nowIso);
      if (q) collectedQuotes.push(q);

      if (ev?.id && params.highTierGameIds.has(matched.id)) {
        const homeTeam = params.teamLookup.get(matched.home_id) || { id: matched.home_id, name: matched.home_id, aliases: [] };
        const awayTeam = params.teamLookup.get(matched.away_id) || { id: matched.away_id, name: matched.away_id, aliases: [] };
        matchedEventsForPerEvent.push({
          game: matched,
          sportKey,
          eventId: String(ev.id),
          homeTeam,
          awayTeam,
        });
      }
    }
    notes.push(`${league} totals: matched ${matchedCount} scheduled games.`);
  }

  // Step 2: Reserve 1 credit if NCAAB also needs batched totals and budget permits, else spend up to remaining on HIGH-tier NBA/EuroLeague per-event markets
  const hasUpcomingNcaab = params.upcomingGames.some((g) => g.league === 'NCAAB' && g.status === 'SCHEDULED');
  const reserveForNcaab = hasUpcomingNcaab ? 1 : 0;

  for (const target of matchedEventsForPerEvent) {
    // Per-event team_totals + totals_h1 typically costs ~2 credits (1 per market)
    if (dailyRemaining - 2 < reserveForNcaab || !canSpend(2)) {
      notes.push(`Per-event cap reached before ${target.game.id}; skipping remaining per-event queries.`);
      break;
    }

    const url = `https://api.the-odds-api.com/v4/sports/${target.sportKey}/events/${encodeURIComponent(
      target.eventId
    )}/odds?apiKey=${encodeURIComponent(apiKey)}&regions=us,eu&markets=team_totals,totals_h1&oddsFormat=decimal`;

    callsMade++;
    perEventGamesQueried++;
    const res = await loggedProviderFetch('the-odds-api', url, {
      leagueCode: `BB_${target.game.league}`,
      syncMode,
      timeoutMs: 8000,
    });
    const cost = estimateCallCreditCost(res.quotaHeaders, 2);
    recordSpend(cost, res.quotaHeaders, res.quotaRemaining);

    if (!res.ok || !res.json) {
      notes.push(`Per-event ${target.game.id} error: ${res.error || res.status}`);
      continue;
    }

    const bookmakers = Array.isArray(res.json?.bookmakers) ? res.json.bookmakers : [];
    const h1Quote = extractConsensusTotalsQuote(
      bookmakers,
      'totals_h1',
      target.game.id,
      target.game.league,
      'h1_game_total',
      nowIso
    );
    if (h1Quote) collectedQuotes.push(h1Quote);

    const teamQuotes = extractTeamTotalsQuotes(
      bookmakers,
      target.game.id,
      target.game.league,
      target.homeTeam,
      target.awayTeam,
      nowIso
    );
    collectedQuotes.push(...teamQuotes);
  }

  // Step 3: Batched 'totals' ONLY for NCAAB when credits allow (never per-event)
  if (hasUpcomingNcaab) {
    if (canSpend(1)) {
      callsMade++;
      const url = `https://api.the-odds-api.com/v4/sports/${BASKETBALL_ODDS_SPORT_KEYS.NCAAB}/odds/?apiKey=${encodeURIComponent(
        apiKey
      )}&regions=us,eu&markets=totals&oddsFormat=decimal`;
      const res = await loggedProviderFetch('the-odds-api', url, {
        leagueCode: 'BB_NCAAB',
        syncMode,
        timeoutMs: 8000,
      });
      const cost = estimateCallCreditCost(res.quotaHeaders, 1);
      recordSpend(cost, res.quotaHeaders, res.quotaRemaining);
      leaguesQueried.push('NCAAB');

      if (res.ok && Array.isArray(res.json)) {
        let matchedCount = 0;
        for (const ev of res.json) {
          const matched = matchUpcomingGame(
            'NCAAB',
            String(ev?.home_team || ''),
            String(ev?.away_team || ''),
            String(ev?.commence_time || '')
          );
          if (!matched) continue;
          matchedCount++;
          const bookmakers = Array.isArray(ev?.bookmakers) ? ev.bookmakers : [];
          const q = extractConsensusTotalsQuote(bookmakers, 'totals', matched.id, 'NCAAB', 'game_total', nowIso);
          if (q) collectedQuotes.push(q);
        }
        notes.push(`NCAAB totals: matched ${matchedCount} scheduled games.`);
      } else {
        lastError = res.error || `HTTP ${res.status}`;
        notes.push(`NCAAB totals error: ${lastError}`);
      }
    } else {
      notes.push('NCAAB totals skipped: daily or monthly basketball odds credit cap reached.');
    }
  }

  const quotesUpserted = await upsertBasketballOddsSnapshots(collectedQuotes);

  return {
    status: lastError && quotesUpserted === 0 && callsMade > 0 ? 'ERROR' : 'ONLINE',
    callsMade,
    creditsSpentThisRun: creditsSpent,
    creditsUsedTodayBeforeRun: creditsUsedBefore,
    dailyBudgetCap: BB_DAILY_ODDS_CREDIT_CAP,
    monthlyQuotaRemaining: monthlyRemaining,
    quotesUpserted,
    leaguesQueried,
    perEventGamesQueried,
    notes,
    error: lastError,
  };
}
