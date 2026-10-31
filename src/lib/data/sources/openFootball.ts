// CALIBRALL: OpenFootball Fallback Fixtures Service
// Sourced from https://github.com/openfootball/football.json (Public Domain / CC0-1.0)
// Fallback fixtures and schedules when primary feeds are unavailable.

import { canonicalMatchStore, CanonicalMatch } from '../canonicalMatches';
import { lookupCanonicalTeam } from '../canonicalTeams';

export class OpenFootballService {
  private lastSyncTime: string | null = null;

  public async fetchSeason(leagueSlug = 'en.1', season = '2024-25'): Promise<{ count: number; error?: string }> {
    try {
      const url = `https://raw.githubusercontent.com/openfootball/football.json/master/${season}/${leagueSlug}.json`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Calibrall/2.0 (open non-commercial statistical modeling)' },
      });
      if (!res.ok) {
        return { count: 0, error: `openfootball HTTP ${res.status}` };
      }
      const data = await res.json();
      const matches = data.matches || [];
      let count = 0;

      const compCode = leagueSlug.startsWith('en.1') ? 'PL' : leagueSlug.startsWith('en.2') ? 'ELC' : 'PL';

      for (const m of matches) {
        const rawHome = m.team1;
        const rawAway = m.team2;
        if (!rawHome || !rawAway) continue;

        const homeCanon = lookupCanonicalTeam(rawHome);
        const awayCanon = lookupCanonicalTeam(rawAway);
        const homeId = homeCanon ? homeCanon.canonicalId : `team_${rawHome.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
        const awayId = awayCanon ? awayCanon.canonicalId : `team_${rawAway.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

        const score1 = m.score?.ft?.[0] ?? null;
        const score2 = m.score?.ft?.[1] ?? null;

        const matchObj: Partial<CanonicalMatch> = {
          date: m.date,
          kickoffTime: `${m.date}T${m.time || '15:00'}:00Z`,
          competitionCode: compCode,
          season,
          matchday: m.round ? parseInt(m.round.replace(/[^0-9]/g, ''), 10) || null : null,
          homeTeamId: homeId,
          awayTeamId: awayId,
          homeTeamName: homeCanon?.canonicalName || rawHome,
          awayTeamName: awayCanon?.canonicalName || rawAway,
          status: score1 !== null ? 'FINISHED' : 'TIMED',
          homeScore: score1,
          awayScore: score2,
        };

        const r = canonicalMatchStore.upsertMatch(matchObj, 'openfootball');
        if (r.success) count++;
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

export const openFootballService = new OpenFootballService();
