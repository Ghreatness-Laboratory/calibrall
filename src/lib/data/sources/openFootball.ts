// CALIBRALL: OpenFootball Fallback Fixtures Service
// Sourced from https://github.com/openfootball/football.json (Public Domain / CC0-1.0)
// Fallback fixtures and schedules when primary feeds are unavailable.

import { canonicalMatchStore, CanonicalMatch } from '../canonicalMatches';
import { lookupCanonicalTeam, resolveFixtureTeamCanonical } from '../canonicalTeams';
import { getCanonicalCompetition, isCanonicalCompetitionId } from '../canonicalCompetitions';
import { lookupTeamStrength } from '../teamDatabase';
import { displayName, getTeamAbbreviation } from '../../utils/formatText';
import type { Fixture, MatchStatus, Team } from '@/types';

const OPENFOOTBALL_UPCOMING_SLUGS: Array<{ slug: string; compCode: string }> = [
  { slug: 'en.1', compCode: 'PL' },
  { slug: 'en.2', compCode: 'ELC' },
  { slug: 'es.1', compCode: 'PD' },
  { slug: 'de.1', compCode: 'BL1' },
  { slug: 'it.1', compCode: 'SA' },
  { slug: 'fr.1', compCode: 'FL1' },
];

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

  public async fetchUpcomingFixturesFallback(params: {
    dateFrom: string;
    dateTo: string;
    fetchTime: string;
    season?: string;
  }): Promise<Fixture[]> {
    const season = params.season || '2026-27';
    const results: Fixture[] = [];

    const fetched = await Promise.all(
      OPENFOOTBALL_UPCOMING_SLUGS.map(async ({ slug, compCode }) => {
        try {
          const comp = getCanonicalCompetition(compCode);
          if (!comp || !isCanonicalCompetitionId(comp.id)) return [];
          const url = `https://raw.githubusercontent.com/openfootball/football.json/master/${season}/${slug}.json`;
          const res = await fetch(url, {
            headers: { 'User-Agent': 'Calibrall/2.0 (open non-commercial statistical modeling)' },
            signal: AbortSignal.timeout(8000),
          });
          if (!res.ok) return [];
          const data = await res.json();
          const rawMatches = Array.isArray(data?.matches) ? data.matches : [];
          const out: Fixture[] = [];

          for (const m of rawMatches) {
            const matchDate = String(m.date || '').slice(0, 10);
            if (!matchDate || matchDate < params.dateFrom || matchDate > params.dateTo) continue;
            const rawHome = String(m.team1 || '').trim();
            const rawAway = String(m.team2 || '').trim();
            if (!rawHome || !rawAway) continue;

            const homeCanon = resolveFixtureTeamCanonical({
              provider: 'openfootball',
              name: rawHome,
              competitionCode: comp.code,
            });
            const awayCanon = resolveFixtureTeamCanonical({
              provider: 'openfootball',
              name: rawAway,
              competitionCode: comp.code,
            });
            const homeLookup = lookupTeamStrength(rawHome);
            const awayLookup = lookupTeamStrength(rawAway);

            const homeTeam: Team = {
              id: homeCanon?.canonicalId || homeLookup.data?.id || `team_${rawHome.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
              name: homeCanon?.canonicalName || homeLookup.data?.name || rawHome,
              shortName: displayName({ name: homeCanon?.shortName || homeLookup.data?.shortName || rawHome }),
              tla: homeCanon?.tla || homeLookup.data?.tla || getTeamAbbreviation({ name: rawHome }),
              crestUrl: homeCanon?.crestUrl || homeLookup.data?.crestUrl || '',
              attackRating: homeLookup.found && homeLookup.data ? homeLookup.data.attackRating : undefined,
              defenseRating: homeLookup.found && homeLookup.data ? homeLookup.data.defenseRating : undefined,
              cornerAttackRating: homeLookup.found && homeLookup.data ? homeLookup.data.cornerAttackRating : undefined,
              disciplineRating: homeLookup.found && homeLookup.data ? homeLookup.data.disciplineRating : undefined,
              recentForm: homeLookup.found && homeLookup.data ? homeLookup.data.recentForm : undefined,
              hasRealTeamStrength: Boolean(homeCanon || homeLookup.found),
            };
            const awayTeam: Team = {
              id: awayCanon?.canonicalId || awayLookup.data?.id || `team_${rawAway.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
              name: awayCanon?.canonicalName || awayLookup.data?.name || rawAway,
              shortName: displayName({ name: awayCanon?.shortName || awayLookup.data?.shortName || rawAway }),
              tla: awayCanon?.tla || awayLookup.data?.tla || getTeamAbbreviation({ name: rawAway }),
              crestUrl: awayCanon?.crestUrl || awayLookup.data?.crestUrl || '',
              attackRating: awayLookup.found && awayLookup.data ? awayLookup.data.attackRating : undefined,
              defenseRating: awayLookup.found && awayLookup.data ? awayLookup.data.defenseRating : undefined,
              cornerAttackRating: awayLookup.found && awayLookup.data ? awayLookup.data.cornerAttackRating : undefined,
              disciplineRating: awayLookup.found && awayLookup.data ? awayLookup.data.disciplineRating : undefined,
              recentForm: awayLookup.found && awayLookup.data ? awayLookup.data.recentForm : undefined,
              hasRealTeamStrength: Boolean(awayCanon || awayLookup.found),
            };

            const score1 = typeof m.score?.ft?.[0] === 'number' ? m.score.ft[0] : null;
            const score2 = typeof m.score?.ft?.[1] === 'number' ? m.score.ft[1] : null;
            const ht1 = typeof m.score?.ht?.[0] === 'number' ? m.score.ht[0] : null;
            const ht2 = typeof m.score?.ht?.[1] === 'number' ? m.score.ht[1] : null;
            const kickoffTime = `${matchDate}T${m.time || '15:00'}:00Z`;
            const status: MatchStatus = score1 !== null && score2 !== null ? 'FINISHED' : 'TIMED';
            const matchday = m.round ? parseInt(String(m.round).replace(/[^0-9]/g, ''), 10) || 1 : 1;
            const pid = `of_${comp.code.toLowerCase()}_${matchDate}_${homeTeam.id}_${awayTeam.id}`;

            out.push({
              id: `fix_${pid}`,
              providerId: pid,
              providerName: 'OpenFootball CC0',
              fetchTime: params.fetchTime,
              source: 'provider:openfootball',
              competitionId: comp.id,
              competition: comp,
              seasonYear: season.replace('-', '/'),
              homeTeam,
              awayTeam,
              kickoffTime,
              matchday,
              status,
              homeScore: score1,
              awayScore: score2,
              homeHalfTimeScore: ht1,
              awayHalfTimeScore: ht2,
              venue: 'Stadium',
              dataFreshness: params.fetchTime,
            });
          }
          return out;
        } catch {
          return [];
        }
      })
    );

    for (const batch of fetched) {
      results.push(...batch);
    }
    if (results.length > 0) {
      this.lastSyncTime = params.fetchTime;
    }
    return results;
  }

  public getLastSync(): string | null {
    return this.lastSyncTime;
  }
}

export const openFootballService = new OpenFootballService();
