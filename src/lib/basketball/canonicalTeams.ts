// CALIBRALL: Canonical Basketball Team Registry & Strict Alias Resolution
// IDs strictly follow 'bbt_{league}_{slug}' format.
// Never guesses unknown team names: unresolved names are returned as null and logged.

import { BasketballLeague } from './markets';
import catalogData from './canonicalCatalogData.json';

export interface CanonicalBasketballTeam {
  id: string; // 'bbt_{league}_{slug}'
  league: BasketballLeague;
  name: string;
  aliases: string[];
  provider_ids: {
    espn?: string;
    hoopr?: string;
    euroleague?: string;
    abbr?: string;
  };
}

export function normalizeBasketballAlias(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function buildNbaCanonicalTeams(): CanonicalBasketballTeam[] {
  const defs: Array<{
    slug: string;
    espnId: string;
    abbr: string;
    name: string;
    aliases: string[];
  }> = [
    { slug: 'atl', espnId: '1', abbr: 'ATL', name: 'Atlanta Hawks', aliases: ['Atlanta', 'Hawks'] },
    { slug: 'bos', espnId: '2', abbr: 'BOS', name: 'Boston Celtics', aliases: ['Boston', 'Celtics'] },
    { slug: 'bkn', espnId: '17', abbr: 'BKN', name: 'Brooklyn Nets', aliases: ['Brooklyn', 'Nets', 'BK'] },
    { slug: 'cha', espnId: '30', abbr: 'CHA', name: 'Charlotte Hornets', aliases: ['Charlotte', 'Hornets'] },
    { slug: 'chi', espnId: '4', abbr: 'CHI', name: 'Chicago Bulls', aliases: ['Chicago', 'Bulls'] },
    { slug: 'cle', espnId: '5', abbr: 'CLE', name: 'Cleveland Cavaliers', aliases: ['Cleveland', 'Cavaliers', 'Cavs'] },
    { slug: 'dal', espnId: '6', abbr: 'DAL', name: 'Dallas Mavericks', aliases: ['Dallas', 'Mavericks', 'Mavs'] },
    { slug: 'den', espnId: '7', abbr: 'DEN', name: 'Denver Nuggets', aliases: ['Denver', 'Nuggets'] },
    { slug: 'det', espnId: '8', abbr: 'DET', name: 'Detroit Pistons', aliases: ['Detroit', 'Pistons'] },
    { slug: 'gsw', espnId: '9', abbr: 'GSW', name: 'Golden State Warriors', aliases: ['Golden State', 'Warriors', 'GS'] },
    { slug: 'hou', espnId: '10', abbr: 'HOU', name: 'Houston Rockets', aliases: ['Houston', 'Rockets'] },
    { slug: 'ind', espnId: '11', abbr: 'IND', name: 'Indiana Pacers', aliases: ['Indiana', 'Pacers'] },
    { slug: 'lac', espnId: '12', abbr: 'LAC', name: 'LA Clippers', aliases: ['Los Angeles Clippers', 'Clippers'] },
    { slug: 'lal', espnId: '13', abbr: 'LAL', name: 'Los Angeles Lakers', aliases: ['LA Lakers', 'Lakers'] },
    { slug: 'mem', espnId: '29', abbr: 'MEM', name: 'Memphis Grizzlies', aliases: ['Memphis', 'Grizzlies'] },
    { slug: 'mia', espnId: '14', abbr: 'MIA', name: 'Miami Heat', aliases: ['Miami', 'Heat'] },
    { slug: 'mil', espnId: '15', abbr: 'MIL', name: 'Milwaukee Bucks', aliases: ['Milwaukee', 'Bucks'] },
    { slug: 'min', espnId: '16', abbr: 'MIN', name: 'Minnesota Timberwolves', aliases: ['Minnesota', 'Timberwolves', 'Wolves'] },
    { slug: 'nop', espnId: '3', abbr: 'NOP', name: 'New Orleans Pelicans', aliases: ['New Orleans', 'Pelicans', 'NO'] },
    { slug: 'nyk', espnId: '18', abbr: 'NYK', name: 'New York Knicks', aliases: ['New York', 'Knicks', 'NY'] },
    { slug: 'okc', espnId: '25', abbr: 'OKC', name: 'Oklahoma City Thunder', aliases: ['Oklahoma City', 'Thunder'] },
    { slug: 'orl', espnId: '19', abbr: 'ORL', name: 'Orlando Magic', aliases: ['Orlando', 'Magic'] },
    { slug: 'phi', espnId: '20', abbr: 'PHI', name: 'Philadelphia 76ers', aliases: ['Philadelphia', '76ers', 'Sixers'] },
    { slug: 'phx', espnId: '21', abbr: 'PHX', name: 'Phoenix Suns', aliases: ['Phoenix', 'Suns', 'PHO'] },
    { slug: 'por', espnId: '22', abbr: 'POR', name: 'Portland Trail Blazers', aliases: ['Portland', 'Trail Blazers', 'Blazers'] },
    { slug: 'sac', espnId: '23', abbr: 'SAC', name: 'Sacramento Kings', aliases: ['Sacramento', 'Kings'] },
    { slug: 'sas', espnId: '24', abbr: 'SAS', name: 'San Antonio Spurs', aliases: ['San Antonio', 'Spurs', 'SA'] },
    { slug: 'tor', espnId: '28', abbr: 'TOR', name: 'Toronto Raptors', aliases: ['Toronto', 'Raptors'] },
    { slug: 'uta', espnId: '26', abbr: 'UTA', name: 'Utah Jazz', aliases: ['Utah', 'Jazz', 'UTAH'] },
    { slug: 'was', espnId: '27', abbr: 'WAS', name: 'Washington Wizards', aliases: ['Washington', 'Wizards', 'WSH'] },
  ];

  return defs.map((d) => ({
    id: `bbt_nba_${d.slug}`,
    league: 'NBA',
    name: d.name,
    aliases: Array.from(new Set([d.name, d.abbr, ...d.aliases])),
    provider_ids: {
      espn: d.espnId,
      hoopr: d.espnId,
      abbr: d.abbr,
    },
  }));
}

function buildEuroLeagueCanonicalTeams(): CanonicalBasketballTeam[] {
  const list = (catalogData as any).euroleague as Array<{
    code: string;
    name: string;
    aliases: string[];
  }>;
  return list.map((c) => ({
    id: `bbt_euroleague_${c.code.toLowerCase()}`,
    league: 'EUROLEAGUE',
    name: c.name,
    aliases: Array.from(new Set([c.name, c.code, ...c.aliases])),
    provider_ids: {
      euroleague: c.code,
      abbr: c.code,
    },
  }));
}

function buildNcaabCanonicalTeams(): CanonicalBasketballTeam[] {
  const list = (catalogData as any).ncaab as Array<{
    espnId: string;
    slug: string;
    name: string;
    abbr: string;
    aliases: string[];
  }>;
  return list.map((t) => ({
    id: `bbt_ncaab_${t.slug}`,
    league: 'NCAAB',
    name: t.name,
    aliases: Array.from(new Set([t.name, ...t.aliases].filter(Boolean))),
    provider_ids: {
      espn: t.espnId,
      hoopr: t.espnId,
      ...(t.abbr ? { abbr: t.abbr } : {}),
    },
  }));
}

export const NBA_CANONICAL_TEAMS: CanonicalBasketballTeam[] = buildNbaCanonicalTeams();
export const EUROLEAGUE_CANONICAL_TEAMS: CanonicalBasketballTeam[] = buildEuroLeagueCanonicalTeams();
export const NCAAB_CANONICAL_TEAMS: CanonicalBasketballTeam[] = buildNcaabCanonicalTeams();

export const ALL_BASKETBALL_CANONICAL_TEAMS: CanonicalBasketballTeam[] = [
  ...NBA_CANONICAL_TEAMS,
  ...EUROLEAGUE_CANONICAL_TEAMS,
  ...NCAAB_CANONICAL_TEAMS,
];

interface LeagueLookupIndex {
  byProviderId: Map<string, CanonicalBasketballTeam>;
  byNormalizedAlias: Map<string, CanonicalBasketballTeam>;
  ambiguousAliases: Set<string>;
}

const LOOKUP_CACHE = new Map<BasketballLeague, LeagueLookupIndex>();

function getLeagueIndex(league: BasketballLeague): LeagueLookupIndex {
  const cached = LOOKUP_CACHE.get(league);
  if (cached) return cached;

  const teams =
    league === 'NBA'
      ? NBA_CANONICAL_TEAMS
      : league === 'EUROLEAGUE'
      ? EUROLEAGUE_CANONICAL_TEAMS
      : NCAAB_CANONICAL_TEAMS;

  const byProviderId = new Map<string, CanonicalBasketballTeam>();
  const byNormalizedAlias = new Map<string, CanonicalBasketballTeam>();
  const ambiguousAliases = new Set<string>();

  for (const team of teams) {
    if (team.provider_ids.espn) byProviderId.set(`espn:${team.provider_ids.espn}`, team);
    if (team.provider_ids.hoopr) byProviderId.set(`hoopr:${team.provider_ids.hoopr}`, team);
    if (team.provider_ids.euroleague) byProviderId.set(`euroleague:${team.provider_ids.euroleague.toUpperCase()}`, team);

    for (const rawAlias of [team.name, ...team.aliases]) {
      const norm = normalizeBasketballAlias(rawAlias);
      if (!norm) continue;
      const existing = byNormalizedAlias.get(norm);
      if (existing && existing.id !== team.id) {
        // Ambiguous short alias (e.g. shared abbreviation across two schools) — never guess by alias alone
        ambiguousAliases.add(norm);
        byNormalizedAlias.delete(norm);
      } else if (!ambiguousAliases.has(norm)) {
        byNormalizedAlias.set(norm, team);
      }
    }
  }

  const idx = { byProviderId, byNormalizedAlias, ambiguousAliases };
  LOOKUP_CACHE.set(league, idx);
  return idx;
}

export function resolveBasketballTeam(
  league: BasketballLeague,
  input: {
    provider?: 'espn' | 'hoopr' | 'euroleague';
    providerId?: string | number | null;
    name?: string | null;
  }
): CanonicalBasketballTeam | null {
  const idx = getLeagueIndex(league);

  if (input.provider && input.providerId !== undefined && input.providerId !== null) {
    const pid = String(input.providerId).trim();
    if (pid) {
      const key =
        input.provider === 'euroleague'
          ? `euroleague:${pid.toUpperCase()}`
          : `${input.provider}:${pid}`;
      const hit = idx.byProviderId.get(key);
      if (hit) return hit;
    }
  }

  if (input.name) {
    const norm = normalizeBasketballAlias(input.name);
    if (norm && !idx.ambiguousAliases.has(norm)) {
      const hit = idx.byNormalizedAlias.get(norm);
      if (hit) return hit;
    }
  }

  return null;
}
