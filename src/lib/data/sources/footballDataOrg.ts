// CALIBRALL: Football-Data.org Free Tier Ingestion & Token Bucket Rate Limiter
// Provides live fixtures and results for Tier 1 free competitions:
// Premier League (PL), Bundesliga (BL1), La Liga (PD), Serie A (SA), Ligue 1 (FL1), Eredivisie (DED), Primeira Liga (PPL), Champions League (CL).
// Note: Championship (ELC), League One, League Two are NOT covered on free tier.
// Rate limit: 10 requests / minute token bucket.

import { canonicalMatchStore, CanonicalMatch } from '../canonicalMatches';
import { lookupCanonicalTeam } from '../canonicalTeams';
import { MatchStatus } from '@/types';

export class FootballDataOrgService {
  private lastRequestTime = 0;
  private minIntervalMs = 6100; // 10 calls per 60s -> ~6.1s between calls
  private lastSyncTime: string | null = null;
  private coverage = ['PL', 'ELC', 'BL1', 'PD', 'SA', 'FL1', 'DED', 'PPL', 'CL'];

  public getCoveredCompetitions(): string[] {
    return this.coverage;
  }

  public getMissingCompetitions(): string[] {
    return ['E2 (League One)', 'E3 (League Two)', 'SC0 (Scottish Premiership)'];
  }

  private async waitForToken(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.minIntervalMs) {
      await new Promise(r => setTimeout(r, this.minIntervalMs - elapsed));
    }
    this.lastRequestTime = Date.now();
  }

  public async fetchLiveMatches(competitionCode = 'PL'): Promise<{ count: number; error?: string }> {
    const apiKey = process.env.FOOTBALL_DATA_API_KEY?.trim();
    if (!apiKey) {
      return { count: 0, error: 'FOOTBALL_DATA_API_KEY not configured' };
    }

    if (!this.coverage.includes(competitionCode.toUpperCase())) {
      return { count: 0, error: `Competition ${competitionCode} not covered in football-data.org free tier` };
    }

    await this.waitForToken();

    try {
      const url = `https://api.football-data.org/v4/competitions/${competitionCode}/matches`;
      const res = await fetch(url, {
        headers: {
          'X-Auth-Token': apiKey,
          'User-Agent': 'Calibrall/2.0 (open non-commercial statistical modeling; contact: teamalphaugh21@gmail.com)',
        },
      });

      if (!res.ok) {
        return { count: 0, error: `football-data.org HTTP ${res.status}` };
      }

      const json = await res.json();
      const matches = json.matches || [];
      let count = 0;

      for (const m of matches) {
        const homeCanon = lookupCanonicalTeam(m.homeTeam?.name);
        const awayCanon = lookupCanonicalTeam(m.awayTeam?.name);
        const homeId = homeCanon ? homeCanon.canonicalId : `team_${(m.homeTeam?.name || 'home').toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
        const awayId = awayCanon ? awayCanon.canonicalId : `team_${(m.awayTeam?.name || 'away').toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

        let status: MatchStatus = 'TIMED';
        if (m.status === 'FINISHED') status = 'FINISHED';
        else if (m.status === 'IN_PLAY') status = 'IN_PLAY';
        else if (m.status === 'PAUSED') status = 'PAUSED';
        else if (m.status === 'POSTPONED') status = 'POSTPONED';
        else if (m.status === 'CANCELLED') status = 'CANCELED';

        const rawDate = m.utcDate ? m.utcDate.slice(0, 10) : new Date().toISOString().slice(0, 10);
        const matchObj: Partial<CanonicalMatch> = {
          date: rawDate,
          kickoffTime: m.utcDate,
          competitionCode,
          season: `${m.season?.startDate?.substring(0, 4) || '2026'}/${m.season?.endDate?.substring(0, 4) || '2027'}`,
          matchday: m.matchday,
          homeTeamId: homeId,
          awayTeamId: awayId,
          homeTeamName: homeCanon?.canonicalName || m.homeTeam?.name,
          awayTeamName: awayCanon?.canonicalName || m.awayTeam?.name,
          status,
          homeScore: m.score?.fullTime?.home ?? null,
          awayScore: m.score?.fullTime?.away ?? null,
          homeHalfTimeScore: m.score?.halfTime?.home ?? null,
          awayHalfTimeScore: m.score?.halfTime?.away ?? null,
          referee: m.referees?.[0]?.name ?? null,
        };

        const result = canonicalMatchStore.upsertMatch(matchObj, 'football-data.org');
        if (result.success) count++;
      }

      this.lastSyncTime = new Date().toISOString();
      return { count };
    } catch (e: any) {
      return { count: 0, error: e?.message || 'Network error' };
    }
  }

  public getLastSync(): string | null {
    return this.lastSyncTime;
  }
}

export const footballDataOrgService = new FootballDataOrgService();
