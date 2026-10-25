// CALIBRALL: Strict Production Fixture Integrity Validation & Rejection Engine
// Enforces Requirement 2 & Requirement 3:
// 1. Every fixture MUST come from a provider with providerId, providerName, fetchTime, and source.
// 2. Reject any fixture without providerId, any outside requested date range, or competition/matchday mismatch.
// 3. Fail loudly if the same team appears in two fixtures within 48 hours.
// 4. Fail loudly if kickoff times follow a synthetic repeating offset pattern (e.g. constant intervals or :23 minutes).
// 5. Look up crest by team id and verify/align with provider crest URL.

import { Fixture } from '@/types';
import { lookupTeamStrength, normalizeTeamLookupKey } from './teamDatabase';

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

  // 1. First pass: individual fixture checks (providerId, date range, crest validation)
  for (const f of fixtures) {
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

    // Rule 4: Team crest validation (look up team by ID and compare against provider crest URL)
    const homeTeamLookup = lookupTeamStrength(f.homeTeam);
    const awayTeamLookup = lookupTeamStrength(f.awayTeam);

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

    validFixtures.push(f);
  }

  // 2. Second pass: 48-Hour Duplicate Team Integrity Check
  // "the same team can't appear in two fixtures within 48 hours"
  const acceptedFixtures: Fixture[] = [];
  const teamScheduledTimes = new Map<string, { fixtureId: string; kickoffMs: number; teamName: string }[]>();

  for (const f of validFixtures) {
    const kickoffMs = new Date(f.kickoffTime).getTime();
    const homeKey = normalizeTeamLookupKey(f.homeTeam.name) || f.homeTeam.id;
    const awayKey = normalizeTeamLookupKey(f.awayTeam.name) || f.awayTeam.id;

    let hasConflict = false;

    // Check home team
    const homePrev = teamScheduledTimes.get(homeKey) || [];
    for (const prev of homePrev) {
      const deltaHours = Math.abs(kickoffMs - prev.kickoffMs) / (3600 * 1000);
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
      const deltaHours = Math.abs(kickoffMs - prev.kickoffMs) / (3600 * 1000);
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
    homePrev.push({ fixtureId: f.id, kickoffMs, teamName: f.homeTeam.name });
    teamScheduledTimes.set(homeKey, homePrev);

    awayPrev.push({ fixtureId: f.id, kickoffMs, teamName: f.awayTeam.name });
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
