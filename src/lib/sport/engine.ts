// Sport Engine: Polymorphic architecture abstraction for Multi-Sport Intelligence
import { Sport, Competition, Fixture, PerformanceReport, MarketPrediction } from '@/types';
import { COMPETITIONS, VERIFIED_PERFORMANCE_REPORT } from '../data/seedData';
import { NBA_COMPETITION, VERIFIED_NBA_PERFORMANCE_REPORT, getNBASeedFixtures, generateNBAPredictions } from '../data/nbaSeedData';
import { getFootballDataProvider } from '../data/provider';
import { getNBADataProvider } from '../data/nbaProvider';

export interface SportEngine {
  sport: Sport;
  name: string;
  defaultLeague: string;
  getCompetitions(): Promise<Competition[]>;
  getFixtures(params?: { competitionCode?: string; status?: string }): Promise<{
    fixtures: Fixture[];
    liveDataAvailable: boolean;
    lastUpdated: string;
    error?: string;
  }>;
  getPerformanceReport(): PerformanceReport;
  generatePredictions(fixture: Fixture): MarketPrediction[];
}

export class FootballSportEngine implements SportEngine {
  sport: Sport = 'football';
  name = 'Football';
  defaultLeague = 'ALL';

  async getCompetitions(): Promise<Competition[]> {
    return COMPETITIONS;
  }

  async getFixtures(params?: { competitionCode?: string; status?: string }) {
    const provider = getFootballDataProvider();
    const result = await provider.getLiveFixtures(params);
    return {
      fixtures: result.fixtures,
      liveDataAvailable: result.liveDataAvailable,
      lastUpdated: result.lastUpdated,
      error: result.error,
    };
  }

  getPerformanceReport(): PerformanceReport {
    return VERIFIED_PERFORMANCE_REPORT;
  }

  generatePredictions(fixture: Fixture): MarketPrediction[] {
    // Handled by evaluateFixtureMarkets in football pipeline
    return [];
  }
}

export class BasketballSportEngine implements SportEngine {
  sport: Sport = 'basketball';
  name = 'Basketball';
  defaultLeague = 'NBA';

  async getCompetitions(): Promise<Competition[]> {
    return [NBA_COMPETITION];
  }

  async getFixtures(params?: { competitionCode?: string; status?: string }) {
    const provider = getNBADataProvider();
    const result = await provider.getFixtures(params?.status);
    return {
      fixtures: result.fixtures,
      liveDataAvailable: result.liveDataAvailable,
      lastUpdated: result.lastUpdated,
    };
  }

  getPerformanceReport(): PerformanceReport {
    return VERIFIED_NBA_PERFORMANCE_REPORT;
  }

  generatePredictions(fixture: Fixture): MarketPrediction[] {
    return generateNBAPredictions(fixture);
  }
}

const footballEngine = new FootballSportEngine();
const basketballEngine = new BasketballSportEngine();

export function getSportEngine(sport: Sport): SportEngine {
  if (sport === 'basketball') {
    return basketballEngine;
  }
  return footballEngine;
}
