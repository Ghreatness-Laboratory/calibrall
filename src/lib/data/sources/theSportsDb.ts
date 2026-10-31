// CALIBRALL: TheSportsDB Metadata & Crest Client
// Sourced from TheSportsDB (https://www.thesportsdb.com)
// Used for team crests and stadium metadata ONLY.
// Respects free-tier rate limits, caches responses, and logs clubs missing crests.

import { CANONICAL_TEAMS, CanonicalTeam } from '../canonicalTeams';

export interface ClubMetadata {
  teamId: string;
  teamName: string;
  badgeUrl: string | null;
  stadiumName: string | null;
  stadiumCapacity?: number | null;
  yearFormed?: string | null;
}

export class TheSportsDbService {
  private cache: Map<string, ClubMetadata> = new Map();
  private lastCallTime = 0;
  private minIntervalMs = 1000; // 1 request per second
  private clubsWithoutCrest: Set<string> = new Set();

  constructor() {
    this.seedDefaultMetadata();
  }

  private seedDefaultMetadata() {
    for (const team of Object.values(CANONICAL_TEAMS)) {
      this.cache.set(team.canonicalId, {
        teamId: team.canonicalId,
        teamName: team.canonicalName,
        badgeUrl: team.crestUrl || null,
        stadiumName: team.venueName || null,
      });
      if (!team.crestUrl) {
        this.clubsWithoutCrest.add(team.canonicalName);
      }
    }
  }

  public async fetchClubMetadata(teamNameOrId: string): Promise<ClubMetadata | null> {
    const cached = this.cache.get(teamNameOrId);
    if (cached) return cached;

    const apiKey = process.env.THESPORTSDB_API_KEY?.trim() || '123';

    const now = Date.now();
    const elapsed = now - this.lastCallTime;
    if (elapsed < this.minIntervalMs) {
      await new Promise(r => setTimeout(r, this.minIntervalMs - elapsed));
    }
    this.lastCallTime = Date.now();

    try {
      const url = `https://www.thesportsdb.com/api/v1/json/${apiKey}/searchteams.php?t=${encodeURIComponent(teamNameOrId)}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Calibrall/2.0 (open non-commercial statistical modeling)' },
      });
      if (!res.ok) return null;

      const data = await res.json();
      const club = data.teams?.[0];
      if (!club) {
        this.clubsWithoutCrest.add(teamNameOrId);
        return null;
      }

      const meta: ClubMetadata = {
        teamId: `thesportsdb_${club.idTeam}`,
        teamName: club.strTeam,
        badgeUrl: club.strBadge || null,
        stadiumName: club.strStadium || null,
        stadiumCapacity: club.intStadiumCapacity ? parseInt(club.intStadiumCapacity, 10) : null,
        yearFormed: club.intFormedYear || null,
      };

      this.cache.set(teamNameOrId, meta);
      if (!meta.badgeUrl) {
        this.clubsWithoutCrest.add(meta.teamName);
      }

      return meta;
    } catch {
      return null;
    }
  }

  public getClubsWithoutCrest(): string[] {
    return Array.from(this.clubsWithoutCrest).sort();
  }
}

export const theSportsDbService = new TheSportsDbService();

export function getMissingBadges(): string[] {
  return theSportsDbService.getClubsWithoutCrest();
}
