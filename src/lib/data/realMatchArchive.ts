// MATCHMIND: Authentic European Match Archive Interface
// Production reads historical matches strictly from Supabase.
// Bundled static mock/archive arrays have been removed from the production path.

import { FixtureContext } from '@/types';
import { TeamHistoricalStats } from '../prediction/baselines';

export interface RealHistoricalMatch {
  id: string;
  date: string;
  competitionCode: 'PL' | 'PD' | 'BL1' | 'SA' | 'CL' | string;
  competitionName: string;
  homeTeam: string;
  awayTeam: string;
  context: FixtureContext;
  teamStats: TeamHistoricalStats;
  actual: {
    homeGoals: number;
    awayGoals: number;
    firstHalfHomeGoals: number;
    firstHalfAwayGoals: number;
    secondHalfHomeGoals: number;
    secondHalfAwayGoals: number;
    homeCorners: number;
    awayCorners: number;
    cards: number;
  };
}

// Emptied archive - production queries Supabase for history
export const REAL_250_MATCHES: RealHistoricalMatch[] = [];
