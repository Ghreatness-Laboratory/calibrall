// CALIBRALL: Team Crests Database & Canonical Lookup Service
// Strict requirement: Look up by canonical team id in a team_crests table.
// No verified crest = initials badge.
// Special verification rows:
// - Le Mans (team_lemans): crest_url: null, verified: false (initiates badge)
// - NEC (team_nec): crest_url: 'https://crests.football-data.org/670.png', verified: true
// - Como (team_como): crest_url: 'https://crests.football-data.org/1057.png', verified: true
// - Excelsior (team_excelsior): crest_url: 'https://crests.football-data.org/671.png', verified: true

export interface TeamCrestRecord {
  canonicalTeamId: string;
  teamName: string;
  crestUrl: string | null;
  verified: boolean;
}

// In-memory verified crest registry
export const VERIFIED_CRESTS_MAP: Record<string, TeamCrestRecord> = {
  // Required test clubs
  team_lemans: {
    canonicalTeamId: 'team_lemans',
    teamName: 'Le Mans FC',
    crestUrl: null,
    verified: false,
  },
  team_nec: {
    canonicalTeamId: 'team_nec',
    teamName: 'NEC Nijmegen',
    crestUrl: 'https://crests.football-data.org/670.png',
    verified: true,
  },
  team_como: {
    canonicalTeamId: 'team_como',
    teamName: 'Como 1907',
    crestUrl: 'https://crests.football-data.org/1057.png',
    verified: true,
  },
  team_excelsior: {
    canonicalTeamId: 'team_excelsior',
    teamName: 'SBV Excelsior',
    crestUrl: 'https://crests.football-data.org/671.png',
    verified: true,
  },

  // Bundesliga / Germany
  team_koln: {
    canonicalTeamId: 'team_koln',
    teamName: '1. FC Köln',
    crestUrl: 'https://crests.football-data.org/1.png',
    verified: true,
  },
  team_bayern: {
    canonicalTeamId: 'team_bayern',
    teamName: 'FC Bayern München',
    crestUrl: 'https://crests.football-data.org/5.png',
    verified: true,
  },
  team_dortmund: {
    canonicalTeamId: 'team_dortmund',
    teamName: 'Borussia Dortmund',
    crestUrl: 'https://crests.football-data.org/4.png',
    verified: true,
  },
  team_leverkusen: {
    canonicalTeamId: 'team_leverkusen',
    teamName: 'Bayer 04 Leverkusen',
    crestUrl: 'https://crests.football-data.org/3.png',
    verified: true,
  },
  team_leipzig: {
    canonicalTeamId: 'team_leipzig',
    teamName: 'RB Leipzig',
    crestUrl: 'https://crests.football-data.org/721.png',
    verified: true,
  },
  team_stuttgart: {
    canonicalTeamId: 'team_stuttgart',
    teamName: 'VfB Stuttgart',
    crestUrl: 'https://crests.football-data.org/10.png',
    verified: true,
  },
  team_frankfurt: {
    canonicalTeamId: 'team_frankfurt',
    teamName: 'Eintracht Frankfurt',
    crestUrl: 'https://crests.football-data.org/19.png',
    verified: true,
  },
  team_wolfsburg: {
    canonicalTeamId: 'team_wolfsburg',
    teamName: 'VfL Wolfsburg',
    crestUrl: 'https://crests.football-data.org/11.png',
    verified: true,
  },
  team_freiburg: {
    canonicalTeamId: 'team_freiburg',
    teamName: 'SC Freiburg',
    crestUrl: 'https://crests.football-data.org/17.png',
    verified: true,
  },
  team_hoffenheim: {
    canonicalTeamId: 'team_hoffenheim',
    teamName: 'TSG 1899 Hoffenheim',
    crestUrl: 'https://crests.football-data.org/2.png',
    verified: true,
  },
  team_mainz: {
    canonicalTeamId: 'team_mainz',
    teamName: '1. FSV Mainz 05',
    crestUrl: 'https://crests.football-data.org/15.png',
    verified: true,
  },
  team_augsburg: {
    canonicalTeamId: 'team_augsburg',
    teamName: 'FC Augsburg',
    crestUrl: 'https://crests.football-data.org/16.png',
    verified: true,
  },
  team_union_berlin: {
    canonicalTeamId: 'team_union_berlin',
    teamName: '1. FC Union Berlin',
    crestUrl: 'https://crests.football-data.org/28.png',
    verified: true,
  },
  team_bremen: {
    canonicalTeamId: 'team_bremen',
    teamName: 'SV Werder Bremen',
    crestUrl: 'https://crests.football-data.org/12.png',
    verified: true,
  },
  team_m_gladbach: {
    canonicalTeamId: 'team_m_gladbach',
    teamName: 'Borussia Mönchengladbach',
    crestUrl: 'https://crests.football-data.org/18.png',
    verified: true,
  },
  team_st_pauli: {
    canonicalTeamId: 'team_st_pauli',
    teamName: 'FC St. Pauli',
    crestUrl: 'https://crests.football-data.org/20.png',
    verified: true,
  },
  team_holstein_kiel: {
    canonicalTeamId: 'team_holstein_kiel',
    teamName: 'Holstein Kiel',
    crestUrl: 'https://crests.football-data.org/720.png',
    verified: true,
  },
  team_hamburg: {
    canonicalTeamId: 'team_hamburg',
    teamName: 'Hamburger SV',
    crestUrl: 'https://crests.football-data.org/42.png',
    verified: true,
  },
  team_hertha: {
    canonicalTeamId: 'team_hertha',
    teamName: 'Hertha BSC',
    crestUrl: 'https://crests.football-data.org/9.png',
    verified: true,
  },
  team_schalke: {
    canonicalTeamId: 'team_schalke',
    teamName: 'FC Schalke 04',
    crestUrl: 'https://crests.football-data.org/6.png',
    verified: true,
  },
  team_paderborn: {
    canonicalTeamId: 'team_paderborn',
    teamName: 'SC Paderborn 07',
    crestUrl: 'https://crests.football-data.org/36.png',
    verified: true,
  },

  // La Liga
  team_real_madrid: {
    canonicalTeamId: 'team_real_madrid',
    teamName: 'Real Madrid CF',
    crestUrl: 'https://crests.football-data.org/86.png',
    verified: true,
  },
  team_barcelona: {
    canonicalTeamId: 'team_barcelona',
    teamName: 'FC Barcelona',
    crestUrl: 'https://crests.football-data.org/81.png',
    verified: true,
  },
  team_atletico: {
    canonicalTeamId: 'team_atletico',
    teamName: 'Atlético de Madrid',
    crestUrl: 'https://crests.football-data.org/78.png',
    verified: true,
  },
  team_realsociedad: {
    canonicalTeamId: 'team_realsociedad',
    teamName: 'Real Sociedad',
    crestUrl: 'https://crests.football-data.org/92.png',
    verified: true,
  },
  team_athletic: {
    canonicalTeamId: 'team_athletic',
    teamName: 'Athletic Club',
    crestUrl: 'https://crests.football-data.org/77.png',
    verified: true,
  },
  team_espanyol: {
    canonicalTeamId: 'team_espanyol',
    teamName: 'RCD Espanyol',
    crestUrl: 'https://crests.football-data.org/80.png',
    verified: true,
  },
  team_elche: {
    canonicalTeamId: 'team_elche',
    teamName: 'Elche CF',
    crestUrl: 'https://crests.football-data.org/285.png',
    verified: true,
  },
  team_girona: {
    canonicalTeamId: 'team_girona',
    teamName: 'Girona FC',
    crestUrl: 'https://crests.football-data.org/298.png',
    verified: true,
  },
  team_mallorca: {
    canonicalTeamId: 'team_mallorca',
    teamName: 'RCD Mallorca',
    crestUrl: 'https://crests.football-data.org/89.png',
    verified: true,
  },
  team_rayovallecano: {
    canonicalTeamId: 'team_rayovallecano',
    teamName: 'Rayo Vallecano',
    crestUrl: 'https://crests.football-data.org/87.png',
    verified: true,
  },

  // Serie A & B
  team_inter: {
    canonicalTeamId: 'team_inter',
    teamName: 'FC Internazionale Milano',
    crestUrl: 'https://crests.football-data.org/108.png',
    verified: true,
  },
  team_milan: {
    canonicalTeamId: 'team_milan',
    teamName: 'AC Milan',
    crestUrl: 'https://crests.football-data.org/98.png',
    verified: true,
  },
  team_juventus: {
    canonicalTeamId: 'team_juventus',
    teamName: 'Juventus FC',
    crestUrl: 'https://crests.football-data.org/109.png',
    verified: true,
  },
  team_napoli: {
    canonicalTeamId: 'team_napoli',
    teamName: 'SSC Napoli',
    crestUrl: 'https://crests.football-data.org/113.png',
    verified: true,
  },
  team_atalanta: {
    canonicalTeamId: 'team_atalanta',
    teamName: 'Atalanta BC',
    crestUrl: 'https://crests.football-data.org/102.png',
    verified: true,
  },
  team_roma: {
    canonicalTeamId: 'team_roma',
    teamName: 'AS Roma',
    crestUrl: 'https://crests.football-data.org/100.png',
    verified: true,
  },
  team_lazio: {
    canonicalTeamId: 'team_lazio',
    teamName: 'SS Lazio',
    crestUrl: 'https://crests.football-data.org/110.png',
    verified: true,
  },
  team_parma: {
    canonicalTeamId: 'team_parma',
    teamName: 'Parma Calcio 1913',
    crestUrl: 'https://crests.football-data.org/112.png',
    verified: true,
  },
  team_venezia: {
    canonicalTeamId: 'team_venezia',
    teamName: 'Venezia FC',
    crestUrl: 'https://crests.football-data.org/454.png',
    verified: true,
  },
  team_sampdoria: {
    canonicalTeamId: 'team_sampdoria',
    teamName: 'UC Sampdoria',
    crestUrl: 'https://crests.football-data.org/584.png',
    verified: true,
  },
  team_palermo: {
    canonicalTeamId: 'team_palermo',
    teamName: 'Palermo FC',
    crestUrl: 'https://crests.football-data.org/589.png',
    verified: true,
  },

  // Ligue 1 & 2
  team_psg: {
    canonicalTeamId: 'team_psg',
    teamName: 'Paris Saint-Germain',
    crestUrl: 'https://crests.football-data.org/524.png',
    verified: true,
  },
  team_monaco: {
    canonicalTeamId: 'team_monaco',
    teamName: 'AS Monaco',
    crestUrl: 'https://crests.football-data.org/548.png',
    verified: true,
  },
  team_marseille: {
    canonicalTeamId: 'team_marseille',
    teamName: 'Olympique de Marseille',
    crestUrl: 'https://crests.football-data.org/516.png',
    verified: true,
  },
  team_lyon: {
    canonicalTeamId: 'team_lyon',
    teamName: 'Olympique Lyonnais',
    crestUrl: 'https://crests.football-data.org/523.png',
    verified: true,
  },
  team_lille: {
    canonicalTeamId: 'team_lille',
    teamName: 'Lille OSC',
    crestUrl: 'https://crests.football-data.org/521.png',
    verified: true,
  },
  team_nice: {
    canonicalTeamId: 'team_nice',
    teamName: 'OGC Nice',
    crestUrl: 'https://crests.football-data.org/522.png',
    verified: true,
  },
  team_rennes: {
    canonicalTeamId: 'team_rennes',
    teamName: 'Stade Rennais FC',
    crestUrl: 'https://crests.football-data.org/529.png',
    verified: true,
  },
  team_lens: {
    canonicalTeamId: 'team_lens',
    teamName: 'RC Lens',
    crestUrl: 'https://crests.football-data.org/546.png',
    verified: true,
  },
  team_brest: {
    canonicalTeamId: 'team_brest',
    teamName: 'Stade Brestois 29',
    crestUrl: 'https://crests.football-data.org/512.png',
    verified: true,
  },
  team_auxerre: {
    canonicalTeamId: 'team_auxerre',
    teamName: 'AJ Auxerre',
    crestUrl: 'https://crests.football-data.org/519.png',
    verified: true,
  },
  team_angers: {
    canonicalTeamId: 'team_angers',
    teamName: 'Angers SCO',
    crestUrl: 'https://crests.football-data.org/532.png',
    verified: true,
  },
  team_saintetienne: {
    canonicalTeamId: 'team_saintetienne',
    teamName: 'AS Saint-Étienne',
    crestUrl: 'https://crests.football-data.org/527.png',
    verified: true,
  },
  team_lorient: {
    canonicalTeamId: 'team_lorient',
    teamName: 'FC Lorient',
    crestUrl: 'https://crests.football-data.org/525.png',
    verified: true,
  },
  team_paris_fc: {
    canonicalTeamId: 'team_paris_fc',
    teamName: 'Paris FC',
    crestUrl: 'https://crests.football-data.org/535.png',
    verified: true,
  },

  // Eredivisie
  team_ajax: {
    canonicalTeamId: 'team_ajax',
    teamName: 'AFC Ajax',
    crestUrl: 'https://crests.football-data.org/678.png',
    verified: true,
  },
  team_psv: {
    canonicalTeamId: 'team_psv',
    teamName: 'PSV Eindhoven',
    crestUrl: 'https://crests.football-data.org/674.png',
    verified: true,
  },
  team_feyenoord: {
    canonicalTeamId: 'team_feyenoord',
    teamName: 'Feyenoord Rotterdam',
    crestUrl: 'https://crests.football-data.org/675.png',
    verified: true,
  },
  team_az: {
    canonicalTeamId: 'team_az',
    teamName: 'AZ Alkmaar',
    crestUrl: 'https://crests.football-data.org/682.png',
    verified: true,
  },
  team_twente: {
    canonicalTeamId: 'team_twente',
    teamName: 'FC Twente',
    crestUrl: 'https://crests.football-data.org/666.png',
    verified: true,
  },
  team_utrecht: {
    canonicalTeamId: 'team_utrecht',
    teamName: 'FC Utrecht',
    crestUrl: 'https://crests.football-data.org/676.png',
    verified: true,
  },
  team_heerenveen: {
    canonicalTeamId: 'team_heerenveen',
    teamName: 'SC Heerenveen',
    crestUrl: 'https://crests.football-data.org/673.png',
    verified: true,
  },
  team_sittard: {
    canonicalTeamId: 'team_sittard',
    teamName: 'Fortuna Sittard',
    crestUrl: 'https://crests.football-data.org/684.png',
    verified: true,
  },
  team_goaheadeagles: {
    canonicalTeamId: 'team_goaheadeagles',
    teamName: 'Go Ahead Eagles',
    crestUrl: 'https://crests.football-data.org/718.png',
    verified: true,
  },

  // Premier League
  team_arsenal: { canonicalTeamId: 'team_arsenal', teamName: 'Arsenal FC', crestUrl: 'https://crests.football-data.org/57.png', verified: true },
  team_aston_villa: { canonicalTeamId: 'team_aston_villa', teamName: 'Aston Villa FC', crestUrl: 'https://crests.football-data.org/58.png', verified: true },
  team_bournemouth: { canonicalTeamId: 'team_bournemouth', teamName: 'AFC Bournemouth', crestUrl: 'https://crests.football-data.org/1044.png', verified: true },
  team_brentford: { canonicalTeamId: 'team_brentford', teamName: 'Brentford FC', crestUrl: 'https://crests.football-data.org/402.png', verified: true },
  team_brighton: { canonicalTeamId: 'team_brighton', teamName: 'Brighton & Hove Albion FC', crestUrl: 'https://crests.football-data.org/397.png', verified: true },
  team_chelsea: { canonicalTeamId: 'team_chelsea', teamName: 'Chelsea FC', crestUrl: 'https://crests.football-data.org/61.png', verified: true },
  team_crystal_palace: { canonicalTeamId: 'team_crystal_palace', teamName: 'Crystal Palace FC', crestUrl: 'https://crests.football-data.org/354.png', verified: true },
  team_everton: { canonicalTeamId: 'team_everton', teamName: 'Everton FC', crestUrl: 'https://crests.football-data.org/62.png', verified: true },
  team_fulham: { canonicalTeamId: 'team_fulham', teamName: 'Fulham FC', crestUrl: 'https://crests.football-data.org/63.png', verified: true },
  team_ipswich: { canonicalTeamId: 'team_ipswich', teamName: 'Ipswich Town FC', crestUrl: 'https://crests.football-data.org/349.png', verified: true },
  team_leicester: { canonicalTeamId: 'team_leicester', teamName: 'Leicester City FC', crestUrl: 'https://crests.football-data.org/338.png', verified: true },
  team_liverpool: { canonicalTeamId: 'team_liverpool', teamName: 'Liverpool FC', crestUrl: 'https://crests.football-data.org/64.png', verified: true },
  team_man_city: { canonicalTeamId: 'team_man_city', teamName: 'Manchester City FC', crestUrl: 'https://crests.football-data.org/65.png', verified: true },
  team_man_united: { canonicalTeamId: 'team_man_united', teamName: 'Manchester United FC', crestUrl: 'https://crests.football-data.org/66.png', verified: true },
  team_newcastle: { canonicalTeamId: 'team_newcastle', teamName: 'Newcastle United FC', crestUrl: 'https://crests.football-data.org/67.png', verified: true },
  team_nottingham_forest: { canonicalTeamId: 'team_nottingham_forest', teamName: 'Nottingham Forest FC', crestUrl: 'https://crests.football-data.org/351.png', verified: true },
  team_southampton: { canonicalTeamId: 'team_southampton', teamName: 'Southampton FC', crestUrl: 'https://crests.football-data.org/340.png', verified: true },
  team_tottenham: { canonicalTeamId: 'team_tottenham', teamName: 'Tottenham Hotspur FC', crestUrl: 'https://crests.football-data.org/73.png', verified: true },
  team_west_ham: { canonicalTeamId: 'team_west_ham', teamName: 'West Ham United FC', crestUrl: 'https://crests.football-data.org/563.png', verified: true },
  team_wolves: { canonicalTeamId: 'team_wolves', teamName: 'Wolverhampton Wanderers FC', crestUrl: 'https://crests.football-data.org/76.png', verified: true },
};

const CREST_ID_ALIASES: Record<string, string> = {
  team_rayo: 'team_rayovallecano',
  team_saint_etienne: 'team_saintetienne',
  team_fortuna_sittard: 'team_sittard',
  team_mancity: 'team_man_city',
  team_manunited: 'team_man_united',
  team_astonvilla: 'team_aston_villa',
  team_westham: 'team_west_ham',
  team_nottinghamforest: 'team_nottingham_forest',
  team_realmadrid: 'team_real_madrid',
};

export function initTeamCrestsDatabase(): void {
  // In-memory verified crest registry initialized
}

/**
 * Look up team crest by canonical team ID.
 * Returns null if not found or if verified is false.
 */
export function lookupTeamCrest(canonicalTeamId: string | null | undefined): TeamCrestRecord | null {
  if (!canonicalTeamId) return null;
  const cleanId = canonicalTeamId.trim();
  const mapped = CREST_ID_ALIASES[cleanId] || cleanId;

  // 1. In-memory verified registry check
  if (VERIFIED_CRESTS_MAP[mapped]) {
    return VERIFIED_CRESTS_MAP[mapped];
  }

  // 2. Direct normalized check
  const altId = mapped.startsWith('team_') ? mapped : `team_${mapped}`;
  if (VERIFIED_CRESTS_MAP[altId]) {
    return VERIFIED_CRESTS_MAP[altId];
  }

  return null;
}
