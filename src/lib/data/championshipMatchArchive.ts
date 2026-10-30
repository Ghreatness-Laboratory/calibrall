// CALIBRALL: Authentic Championship Historical Match Archive
// Stored matches for the English Championship (ELC / E1) sourced directly
// from verified football-data.co.uk records for full 2023-24 and 2024-25 seasons
// (552 matches per season, exactly 46 matches per team per season).

import { StoredMatch } from './matchesStore';
import championshipData from './championship_matches.json';

export const CHAMPIONSHIP_HISTORICAL_MATCHES: StoredMatch[] = championshipData as StoredMatch[];
