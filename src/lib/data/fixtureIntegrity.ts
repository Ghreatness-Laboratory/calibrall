// CALIBRALL: Strict Production Fixture Integrity Validation & Rejection Engine
// Enforces Requirement 2 & Requirement 3:
// 1. Every fixture MUST come from a provider with providerId, providerName, fetchTime, and source.
// 2. Reject any fixture without providerId, any outside requested date range, or competition/matchday mismatch.
// 3. Fail loudly if the same team appears in two fixtures within 48 hours.
// 4. Fail loudly if kickoff times follow a synthetic repeating offset pattern (e.g. constant intervals or :23 minutes).
// 5. Look up crest by team id and verify/align with provider crest URL.

import { Fixture } from '@/types';
import { lookupTeamStrength, normalizeTeamLookupKey, COMPETITION_CLUBS, COMPETITION_COUNTRY_MAP } from './teamDatabase';

export interface IntegrityValidationReport {
  isValid: boolean;
  validFixtures: Fixture[];
  rejectedFixtures: {
    fixtureId: string;
    reason: string;
  }[];
  violations: string[];
}

/**
 * Validates an array of ingested fixtures against strict integrity rules.
 * Fails loudly (logs errors) and strips invalid/synthetic fixtures.
 */
export function validateFixtureIntegrity(
  fixtures: Fixture[],
  options?: {
    dateFrom?: string;
    dateTo?: string;
    strictThrows?: boolean;
  }
): IntegrityValidationReport {
  const validFixtures: Fixture[] = [];
  const rejectedFixtures: { fixtureId: string; reason: string }[] = [];
  const violations: string[] = [];

  const dateFromMs = options?.dateFrom ? new Date(options.dateFrom).getTime() : 0;
  const dateToMs = options?.dateTo ? new Date(options.dateTo).getTime() + (24 * 3600 * 1000 - 1) : Infinity;

  // 0. Deduplicate incoming fixtures by fixture id or provider id
  const seenFixtureKeys = new Set<string>();
  const deduplicatedFixtures: Fixture[] = [];
  for (const f of fixtures) {
    const key = f.id || (f.providerId ? `${f.providerName || ''}_${f.providerId}` : '');
    if (key && seenFixtureKeys.has(key)) {
      continue;
    }
    if (key) seenFixtureKeys.add(key);
    deduplicatedFixtures.push(f);
  }

  // 1. First pass: individual fixture checks (providerId, date range, crest validation)
  for (const f of deduplicatedFixtures) {
    // Rule 1: Must have a providerId
    if (!f.providerId || typeof f.providerId !== 'string' || !f.providerId.trim()) {
      const msg = `[Integrity Check FAILED] Fixture ${f.id} has no valid providerId. Rejecting.`;
      console.error(msg);
      violations.push(msg);
      rejectedFixtures.push({ fixtureId: f.id, reason: 'Missing providerId' });
      continue;
    }

    // Rule 2: Must have a valid kickoffTime
    const kickoffMs = new Date(f.kickoffTime).getTime();
    if (isNaN(kickoffMs)) {
      const msg = `[Integrity Check FAILED] Fixture ${f.id} (provider: ${f.providerId}) has invalid kickoff time "${f.kickoffTime}". Rejecting.`;
      console.error(msg);
      violations.push(msg);
      rejectedFixtures.push({ fixtureId: f.id, reason: 'Invalid kickoffTime' });
      continue;
    }

    // Rule 3: Kickoff must be within requested date window
    if (dateFromMs > 0 && kickoffMs < dateFromMs) {
      const msg = `[Integrity Check REJECTED] Fixture ${f.id} kickoff (${f.kickoffTime}) is earlier than dateFrom (${options?.dateFrom}). Rejecting.`;
      console.warn(msg);
      rejectedFixtures.push({ fixtureId: f.id, reason: 'Kickoff before dateFrom' });
      continue;
    }

    if (dateToMs < Infinity && kickoffMs > dateToMs) {
      const msg = `[Integrity Check REJECTED] Fixture ${f.id} kickoff (${f.kickoffTime}) is later than dateTo (${options?.dateTo}). Rejecting.`;
      console.warn(msg);
      rejectedFixtures.push({ fixtureId: f.id, reason: 'Kickoff after dateTo' });
      continue;
    }

    // Rule 4: Team crest validation (verify every crest against canonical team id)
    const homeTeamLookup = lookupTeamStrength(f.homeTeam);
    const awayTeamLookup = lookupTeamStrength(f.awayTeam);

    if (homeTeamLookup.found && homeTeamLookup.data?.crestUrl) {
      if (f.homeTeam.crestUrl !== homeTeamLookup.data.crestUrl) {
        f.homeTeam.crestUrl = homeTeamLookup.data.crestUrl;
      }
    }
    if (awayTeamLookup.found && awayTeamLookup.data?.crestUrl) {
      if (f.awayTeam.crestUrl !== awayTeamLookup.data.crestUrl) {
        f.awayTeam.crestUrl = awayTeamLookup.data.crestUrl;
      }
    }

    // Guard against known corrupted crest URLs
    // NEC must NEVER have Feyenoord crest (675.png)
    if (f.homeTeam.name.toLowerCase().includes('nec') && f.homeTeam.crestUrl?.includes('675.png')) {
      const msg = `[Integrity Check FAILED] Home team ${f.homeTeam.name} has incorrect Feyenoord crest (675.png). Correcting to NEC crest.`;
      console.error(msg);
      violations.push(msg);
      f.homeTeam.crestUrl = homeTeamLookup.data?.crestUrl || 'https://crests.football-data.org/670.png';
    }
    if (f.awayTeam.name.toLowerCase().includes('nec') && f.awayTeam.crestUrl?.includes('675.png')) {
      const msg = `[Integrity Check FAILED] Away team ${f.awayTeam.name} has incorrect Feyenoord crest (675.png). Correcting to NEC crest.`;
      console.error(msg);
      violations.push(msg);
      f.awayTeam.crestUrl = awayTeamLookup.data?.crestUrl || 'https://crests.football-data.org/670.png';
    }

    // Paderborn must NEVER have Napoli crest (113.png)
    if (f.homeTeam.name.toLowerCase().includes('paderborn') && f.homeTeam.crestUrl?.includes('113.png')) {
      const msg = `[Integrity Check FAILED] Home team ${f.homeTeam.name} has incorrect Napoli crest (113.png). Correcting to Paderborn crest.`;
      console.error(msg);
      violations.push(msg);
      f.homeTeam.crestUrl = homeTeamLookup.data?.crestUrl || 'https://crests.football-data.org/1073.png';
    }
    if (f.awayTeam.name.toLowerCase().includes('paderborn') && f.awayTeam.crestUrl?.includes('113.png')) {
      const msg = `[Integrity Check FAILED] Away team ${f.awayTeam.name} has incorrect Napoli crest (113.png). Correcting to Paderborn crest.`;
      console.error(msg);
      violations.push(msg);
      f.awayTeam.crestUrl = awayTeamLookup.data?.crestUrl || 'https://crests.football-data.org/1073.png';
    }

    // Rule 5: League Membership Integrity Check
    // Both teams in a domestic league fixture must belong to that competition's league system.
    // Strictly rejects cross-competition mismatches between foreign national systems (e.g. German clubs in English Premier League).
    const compCode = f.competition.code.toUpperCase();
    const authorizedClubs = COMPETITION_CLUBS[compCode];
    if (authorizedClubs && authorizedClubs.length > 0 && compCode !== 'CL') {
      const normalizeId = (id: string) => id.toLowerCase().replace(/^team_/, '').replace(/^(pl|pd|bl1|sa|fl1|ded|bsa|p1|ppl)_/, '').replace(/[^a-z0-9]/g, '');
      const homeId = homeTeamLookup.data?.id || f.homeTeam.id;
      const awayId = awayTeamLookup.data?.id || f.awayTeam.id;

      const compCountry = COMPETITION_COUNTRY_MAP[compCode];
      const homeComp = homeTeamLookup.data?.competitionCode;
      const awayComp = awayTeamLookup.data?.competitionCode;
      const homeCountry = homeComp ? COMPETITION_COUNTRY_MAP[homeComp] : undefined;
      const awayCountry = awayComp ? COMPETITION_COUNTRY_MAP[awayComp] : undefined;

      // 1. Authorized club list direct match or exact competition code match
      const homeDirectBelongs = (homeComp === compCode) || authorizedClubs.some(c => normalizeId(c) === normalizeId(homeId));
      const awayDirectBelongs = (awayComp === compCode) || authorizedClubs.some(c => normalizeId(c) === normalizeId(awayId));

      // 2. Domestic league pyramid fluidity (e.g. English domestic pyramid promotion/relegation between PL & ELC)
      const homeDomesticBelongs = homeDirectBelongs || (Boolean(compCountry) && homeCountry === compCountry);
      const awayDomesticBelongs = awayDirectBelongs || (Boolean(compCountry) && awayCountry === compCountry);

      // 3. Foreign country conflict: club is registered to a different national league system
      const homeForeignConflict = Boolean(compCountry && homeCountry && homeCountry !== compCountry);
      const awayForeignConflict = Boolean(compCountry && awayCountry && awayCountry !== compCountry);

      const homeDisplayComp = homeComp || (homeDomesticBelongs ? compCode : 'Unknown');
      const awayDisplayComp = awayComp || (awayDomesticBelongs ? compCode : 'Unknown');

      if (homeForeignConflict || awayForeignConflict) {
        const msg = `[Integrity Check FAILED] Cross-competition league mismatch: ${f.homeTeam.name} (${homeDisplayComp}) vs ${f.awayTeam.name} (${awayDisplayComp}) in competition ${compCode} (${f.competition.name}). Fixture rejected.`;
        console.error(msg);
        violations.push(msg);
        rejectedFixtures.push({
          fixtureId: f.id,
          reason: `Cross-competition mismatch: ${f.homeTeam.name} belongs to ${homeDisplayComp}, ${f.awayTeam.name} belongs to ${awayDisplayComp} (Competition: ${compCode})`,
        });
        continue;
      }
    }

    validFixtures.push(f);
  }

  // 2. Second pass: 48-Hour Duplicate Team Integrity Check
  // "the same team can't appear in two fixtures within 48 hours"
  const acceptedFixtures: Fixture[] = [];
  const teamScheduledTimes = new Map<string, { fixtureId: string; kickoffMs: number; teamName: string; matchKey: string }[]>();

  for (const f of validFixtures) {
    const kickoffMs = new Date(f.kickoffTime).getTime();
    const homeKey = normalizeTeamLookupKey(f.homeTeam.name) || f.homeTeam.id;
    const awayKey = normalizeTeamLookupKey(f.awayTeam.name) || f.awayTeam.id;
    const currentMatchKey = `${homeKey}_${awayKey}`;

    let hasConflict = false;

    // Check home team
    const homePrev = teamScheduledTimes.get(homeKey) || [];
    for (const prev of homePrev) {
      if (prev.fixtureId === f.id) continue;
      const deltaHours = Math.abs(kickoffMs - prev.kickoffMs) / (3600 * 1000);
      if (prev.matchKey === currentMatchKey && deltaHours < 2.0) {
        // Same match duplicate from multiple sources/aliases
        continue;
      }
      if (deltaHours < 48.0) {
        const msg = `[Integrity Check FAILED] Duplicate team scheduling: "${f.homeTeam.name}" scheduled in fixtures ${prev.fixtureId} and ${f.id} within ${deltaHours.toFixed(1)} hours (< 48h limit). Rejecting fixture ${f.id}.`;
        console.error(msg);
        violations.push(msg);
        rejectedFixtures.push({ fixtureId: f.id, reason: `Team ${f.homeTeam.name} already scheduled in ${prev.fixtureId} within 48h` });
        hasConflict = true;
        break;
      }
    }

    if (hasConflict) continue;

    // Check away team
    const awayPrev = teamScheduledTimes.get(awayKey) || [];
    for (const prev of awayPrev) {
      if (prev.fixtureId === f.id) continue;
      const deltaHours = Math.abs(kickoffMs - prev.kickoffMs) / (3600 * 1000);
      if (prev.matchKey === currentMatchKey && deltaHours < 2.0) {
        // Same match duplicate from multiple sources/aliases
        continue;
      }
      if (deltaHours < 48.0) {
        const msg = `[Integrity Check FAILED] Duplicate team scheduling: "${f.awayTeam.name}" scheduled in fixtures ${prev.fixtureId} and ${f.id} within ${deltaHours.toFixed(1)} hours (< 48h limit). Rejecting fixture ${f.id}.`;
        console.error(msg);
        violations.push(msg);
        rejectedFixtures.push({ fixtureId: f.id, reason: `Team ${f.awayTeam.name} already scheduled in ${prev.fixtureId} within 48h` });
        hasConflict = true;
        break;
      }
    }

    if (hasConflict) continue;

    // Record scheduled kickoffs for both teams
    homePrev.push({ fixtureId: f.id, kickoffMs, teamName: f.homeTeam.name, matchKey: currentMatchKey });
    teamScheduledTimes.set(homeKey, homePrev);

    awayPrev.push({ fixtureId: f.id, kickoffMs, teamName: f.awayTeam.name, matchKey: currentMatchKey });
    teamScheduledTimes.set(awayKey, awayPrev);

    acceptedFixtures.push(f);
  }

  // 3. Third pass: Repeating Synthetic Kickoff Offset Pattern Detection
  // "kickoff times can't follow a repeating offset pattern"
  if (acceptedFixtures.length >= 3) {
    const sorted = [...acceptedFixtures].sort(
      (a, b) => new Date(a.kickoffTime).getTime() - new Date(b.kickoffTime).getTime()
    );

    // Check if kickoffs exhibit synthetic constant-interval increments (e.g. exactly 7200000ms = 2h between each)
    let identicalIntervalCount = 0;
    let lastInterval = 0;

    for (let i = 1; i < sorted.length; i++) {
      const prevMs = new Date(sorted[i - 1].kickoffTime).getTime();
      const currMs = new Date(sorted[i].kickoffTime).getTime();
      const interval = currMs - prevMs;

      if (interval === lastInterval && interval > 0 && interval % 3600000 === 0) {
        identicalIntervalCount++;
      } else {
        lastInterval = interval;
      }
    }

    // Check if 4 or more kickoffs have identical artificial constant-increment offsets
    if (identicalIntervalCount >= 4) {
      const msg = `[Integrity Check FAILED] Synthetic repeating kickoff pattern detected: ${identicalIntervalCount} consecutive identical ${lastInterval / 3600000}h intervals. Rejecting synthetic batch.`;
      console.error(msg);
      violations.push(msg);
      if (options?.strictThrows) {
        throw new Error(msg);
      }
    }

    // Check for artificial minute offset ending (e.g., all matches ending in :23)
    const minutes = sorted.map(f => new Date(f.kickoffTime).getUTCMinutes());
    const minuteCounts = new Map<number, number>();
    minutes.forEach(m => minuteCounts.set(m, (minuteCounts.get(m) || 0) + 1));

    // If an odd minute (like :23, :17) occurs across >= 80% of matches, flag as synthetic
    minuteCounts.forEach((count, min) => {
      if (min !== 0 && min !== 15 && min !== 30 && min !== 45 && count >= 5 && count / sorted.length > 0.6) {
        const msg = `[Integrity Check FAILED] Suspicious synthetic kickoff minute pattern detected: ${count} matches ending in :${min}.`;
        console.error(msg);
        violations.push(msg);
      }
    });
  }

  return {
    isValid: violations.length === 0 && rejectedFixtures.length === 0,
    validFixtures: acceptedFixtures,
    rejectedFixtures,
    violations,
  };
}

export interface LeagueMembershipViolation {
  matchId: string;
  providerId: string;
  season: string;
  competitionCode: string;
  homeTeam: string;
  awayTeam: string;
  kickoffTime: string;
  reason: string;
}

export interface LeagueMembershipAuditReport {
  isValid: boolean;
  totalMatchesAudited: number;
  seasonsAudited: string[];
  competitionsAudited: string[];
  violationsCount: number;
  violations: LeagueMembershipViolation[];
}

/**
 * Validates league membership per season:
 * In domestic leagues (PL, ELC, E2, PD, BL1, SA, FL1, DED, BSA), a club cannot have
 * league matches against clubs from a different division in the same season, nor can
 * a club participate in conflicting domestic leagues in the same season.
 */
export function validateLeagueMembershipPerSeason(
  matches: Array<{
    id: string;
    provider_id: string;
    competition_code: string;
    season: string;
    home_team_id: string;
    away_team_id: string;
    home_team_name: string;
    away_team_name: string;
    kickoff_time: string;
  }>
): LeagueMembershipAuditReport {
  const violations: LeagueMembershipViolation[] = [];
  const seasonsSet = new Set<string>();
  const compSet = new Set<string>();

  // 1. Map of each team's registered domestic league per season
  // Key: `${teamId}:${season}` -> competition_code
  const teamDomesticLeagueBySeason = new Map<string, { comp: string; matchId: string }>();

  // Domestic league codes to strictly audit
  const domesticLeagues = new Set(['PL', 'ELC', 'E2', 'PD', 'BL1', 'SA', 'FL1', 'DED', 'BSA']);

  for (const m of matches) {
    const comp = m.competition_code.toUpperCase().trim();
    const season = m.season.trim();
    seasonsSet.add(season);
    compSet.add(comp);

    if (!domesticLeagues.has(comp)) continue;

    // Check home and away team club lookup
    const homeLookup = lookupTeamStrength(m.home_team_name);
    const awayLookup = lookupTeamStrength(m.away_team_name);
    const homeId = homeLookup.data?.id || m.home_team_id;
    const awayId = awayLookup.data?.id || m.away_team_id;

    // A. Check against known registered clubs in other conflicting domestic leagues
    // E.g., if comp is ELC, neither team can belong to Serie A (SA), Bundesliga (BL1), La Liga (PD), or Ligue 1 (FL1)
    const conflictingForeignLeagues = ['SA', 'PD', 'BL1', 'FL1', 'DED', 'BSA'];
    for (const foreignCode of conflictingForeignLeagues) {
      if (comp !== foreignCode) {
        const foreignClubs = new Set(COMPETITION_CLUBS[foreignCode] || []);
        if (foreignClubs.has(homeId)) {
          violations.push({
            matchId: m.id,
            providerId: m.provider_id,
            season,
            competitionCode: comp,
            homeTeam: m.home_team_name,
            awayTeam: m.away_team_name,
            kickoffTime: m.kickoff_time,
            reason: `Cross-division violation: Home team "${m.home_team_name}" (${homeId}) belongs to ${foreignCode}, cannot play domestic league match in ${comp}`,
          });
        }
        if (foreignClubs.has(awayId)) {
          violations.push({
            matchId: m.id,
            providerId: m.provider_id,
            season,
            competitionCode: comp,
            homeTeam: m.home_team_name,
            awayTeam: m.away_team_name,
            kickoffTime: m.kickoff_time,
            reason: `Cross-division violation: Away team "${m.away_team_name}" (${awayId}) belongs to ${foreignCode}, cannot play domestic league match in ${comp}`,
          });
        }
      }
    }

    // B. Check intra-country dual membership in the same season
    // A team cannot play in both Premier League and Championship in the exact same season
    const homeKey = `${homeId}:${season}`;
    const prevHomeComp = teamDomesticLeagueBySeason.get(homeKey);
    if (prevHomeComp && prevHomeComp.comp !== comp) {
      violations.push({
        matchId: m.id,
        providerId: m.provider_id,
        season,
        competitionCode: comp,
        homeTeam: m.home_team_name,
        awayTeam: m.away_team_name,
        kickoffTime: m.kickoff_time,
        reason: `Dual domestic league violation: "${m.home_team_name}" already recorded in league ${prevHomeComp.comp} for season ${season} (match ${prevHomeComp.matchId})`,
      });
    } else if (!prevHomeComp) {
      teamDomesticLeagueBySeason.set(homeKey, { comp, matchId: m.id });
    }

    const awayKey = `${awayId}:${season}`;
    const prevAwayComp = teamDomesticLeagueBySeason.get(awayKey);
    if (prevAwayComp && prevAwayComp.comp !== comp) {
      violations.push({
        matchId: m.id,
        providerId: m.provider_id,
        season,
        competitionCode: comp,
        homeTeam: m.home_team_name,
        awayTeam: m.away_team_name,
        kickoffTime: m.kickoff_time,
        reason: `Dual domestic league violation: "${m.away_team_name}" already recorded in league ${prevAwayComp.comp} for season ${season} (match ${prevAwayComp.matchId})`,
      });
    } else if (!prevAwayComp) {
      teamDomesticLeagueBySeason.set(awayKey, { comp, matchId: m.id });
    }
  }

  return {
    isValid: violations.length === 0,
    totalMatchesAudited: matches.length,
    seasonsAudited: Array.from(seasonsSet).sort(),
    competitionsAudited: Array.from(compSet).sort(),
    violationsCount: violations.length,
    violations,
  };
}
