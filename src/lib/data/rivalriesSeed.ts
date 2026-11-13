// Authoritative rivalries & derby database seeder
// Every pair uses canonical SQLite team IDs (`team_a_id < team_b_id`) and cites its reference source.

export interface RivalrySeedRecord {
  teamAId: string;
  teamBId: string;
  competitionCode: string;
  rivalryName: string;
  intensity: number;
  source: string;
}

export const CURATED_RIVALRIES: RivalrySeedRecord[] = [
  // England (Group 1)
  {
    teamAId: 'team_arsenal',
    teamBId: 'team_tottenham',
    competitionCode: 'E0',
    rivalryName: 'North London Derby',
    intensity: 1.0,
    source: 'RSSSF English Derby Records / Wikipedia: North London derby',
  },
  {
    teamAId: 'team_liverpool',
    teamBId: 'team_man_united',
    competitionCode: 'E0',
    rivalryName: 'North West Derby',
    intensity: 1.0,
    source: 'Wikipedia: Liverpool F.C. and Manchester United F.C. rivalry',
  },
  {
    teamAId: 'team_man_city',
    teamBId: 'team_man_united',
    competitionCode: 'E0',
    rivalryName: 'Manchester Derby',
    intensity: 1.0,
    source: 'RSSSF English Derby Records / Wikipedia: Manchester derby',
  },
  {
    teamAId: 'team_everton',
    teamBId: 'team_liverpool',
    competitionCode: 'E0',
    rivalryName: 'Merseyside Derby',
    intensity: 1.0,
    source: 'RSSSF English Derby Records / Wikipedia: Merseyside derby',
  },
  {
    teamAId: 'team_arsenal',
    teamBId: 'team_chelsea',
    competitionCode: 'E0',
    rivalryName: 'London Derby Arsenal Chelsea',
    intensity: 0.85,
    source: 'Wikipedia: Arsenal F.C. and Chelsea F.C. rivalry',
  },
  {
    teamAId: 'team_chelsea',
    teamBId: 'team_tottenham',
    competitionCode: 'E0',
    rivalryName: 'London Derby Chelsea Tottenham',
    intensity: 0.9,
    source: 'Wikipedia: Chelsea F.C. and Tottenham Hotspur F.C. rivalry',
  },
  {
    teamAId: 'team_chelsea',
    teamBId: 'team_fulham',
    competitionCode: 'E0',
    rivalryName: 'West London Derby',
    intensity: 0.85,
    source: 'Wikipedia: West London derby',
  },
  {
    teamAId: 'team_brentford',
    teamBId: 'team_fulham',
    competitionCode: 'E0',
    rivalryName: 'West London Derby Brentford Fulham',
    intensity: 0.8,
    source: 'Wikipedia: West London derby',
  },
  {
    teamAId: 'team_brentford',
    teamBId: 'team_qpr',
    competitionCode: 'E1',
    rivalryName: 'West London Derby Brentford QPR',
    intensity: 0.8,
    source: 'Wikipedia: West London derby',
  },
  {
    teamAId: 'team_fulham',
    teamBId: 'team_qpr',
    competitionCode: 'E1',
    rivalryName: 'West London Derby Fulham QPR',
    intensity: 0.85,
    source: 'Wikipedia: West London derby',
  },
  {
    teamAId: 'team_newcastle',
    teamBId: 'team_sunderland',
    competitionCode: 'E0',
    rivalryName: 'Tyne Wear Derby',
    intensity: 1.0,
    source: 'RSSSF English Derby Records / Wikipedia: Tyne Wear derby',
  },
  {
    teamAId: 'team_aston_villa',
    teamBId: 'team_birmingham',
    competitionCode: 'E0',
    rivalryName: 'Second City Derby',
    intensity: 1.0,
    source: 'RSSSF English Derby Records / Wikipedia: Second City derby',
  },
  {
    teamAId: 'team_west_brom',
    teamBId: 'team_wolves',
    competitionCode: 'E1',
    rivalryName: 'Black Country Derby',
    intensity: 0.95,
    source: 'Wikipedia: Black Country derby',
  },
  {
    teamAId: 'team_portsmouth',
    teamBId: 'team_southampton',
    competitionCode: 'E1',
    rivalryName: 'South Coast Derby',
    intensity: 1.0,
    source: 'Wikipedia: South Coast derby',
  },
  {
    teamAId: 'team_brighton',
    teamBId: 'team_crystal_palace',
    competitionCode: 'E0',
    rivalryName: 'M23 Derby',
    intensity: 0.9,
    source: 'Wikipedia: Brighton and Crystal Palace rivalry',
  },
  {
    teamAId: 'team_millwall',
    teamBId: 'team_west_ham',
    competitionCode: 'E1',
    rivalryName: 'Dockers Derby',
    intensity: 1.0,
    source: 'Wikipedia: Millwall F.C. and West Ham United F.C. rivalry',
  },
  {
    teamAId: 'team_tottenham',
    teamBId: 'team_west_ham',
    competitionCode: 'E0',
    rivalryName: 'East North London Rivalry',
    intensity: 0.8,
    source: 'Wikipedia: London derbies',
  },
  {
    teamAId: 'team_sheffield_utd',
    teamBId: 'team_sheffield_wed',
    competitionCode: 'E1',
    rivalryName: 'Steel City Derby',
    intensity: 1.0,
    source: 'RSSSF English Derby Records / Wikipedia: Steel City derby',
  },
  {
    teamAId: 'team_derby',
    teamBId: 'team_nottingham_forest',
    competitionCode: 'E1',
    rivalryName: 'East Midlands Derby',
    intensity: 0.95,
    source: 'Wikipedia: East Midlands derby',
  },
  {
    teamAId: 'team_coventry',
    teamBId: 'team_leicester',
    competitionCode: 'E1',
    rivalryName: 'M69 Derby',
    intensity: 0.85,
    source: 'Wikipedia: M69 derby',
  },
  {
    teamAId: 'team_ipswich',
    teamBId: 'team_norwich',
    competitionCode: 'E1',
    rivalryName: 'East Anglian Derby',
    intensity: 0.95,
    source: 'Wikipedia: East Anglian derby',
  },
  {
    teamAId: 'team_cardiff',
    teamBId: 'team_swansea',
    competitionCode: 'E1',
    rivalryName: 'South Wales Derby',
    intensity: 1.0,
    source: 'Wikipedia: South Wales derby',
  },
  {
    teamAId: 'team_blackburn',
    teamBId: 'team_burnley',
    competitionCode: 'E1',
    rivalryName: 'East Lancashire Derby',
    intensity: 0.95,
    source: 'Wikipedia: East Lancashire derby',
  },
  {
    teamAId: 'team_blackpool',
    teamBId: 'team_preston',
    competitionCode: 'E2',
    rivalryName: 'West Lancashire Derby',
    intensity: 0.9,
    source: 'Wikipedia: West Lancashire derby',
  },
  {
    teamAId: 'team_luton',
    teamBId: 'team_watford',
    competitionCode: 'E1',
    rivalryName: 'Beds Herts Derby',
    intensity: 0.9,
    source: 'Wikipedia: Luton Town and Watford rivalry',
  },
  {
    teamAId: 'team_leeds',
    teamBId: 'team_man_united',
    competitionCode: 'E0',
    rivalryName: 'Roses Rivalry',
    intensity: 0.9,
    source: 'Wikipedia: Leeds United F.C. and Manchester United F.C. rivalry',
  },

  // Scotland (Group 1)
  {
    teamAId: 'team_celtic',
    teamBId: 'team_rangers',
    competitionCode: 'SC0',
    rivalryName: 'Old Firm Derby',
    intensity: 1.0,
    source: 'RSSSF Scottish Derby Records / Wikipedia: Old Firm',
  },
  {
    teamAId: 'team_hearts',
    teamBId: 'team_hibernian',
    competitionCode: 'SC0',
    rivalryName: 'Edinburgh Derby',
    intensity: 1.0,
    source: 'RSSSF Scottish Derby Records / Wikipedia: Edinburgh derby',
  },
  {
    teamAId: 'team_dundee',
    teamBId: 'team_dundee_united',
    competitionCode: 'SC0',
    rivalryName: 'Dundee Derby',
    intensity: 0.95,
    source: 'RSSSF Scottish Derby Records / Wikipedia: Dundee derby',
  },
  {
    teamAId: 'team_aberdeen',
    teamBId: 'team_rangers',
    competitionCode: 'SC0',
    rivalryName: 'New Firm Scottish Rivalry',
    intensity: 0.85,
    source: 'Wikipedia: Aberdeen F.C. and Rangers F.C. rivalry',
  },

  // Spain (Group 2)
  {
    teamAId: 'team_barcelona',
    teamBId: 'team_real_madrid',
    competitionCode: 'SP1',
    rivalryName: 'El Clasico',
    intensity: 1.0,
    source: 'RSSSF Spanish Derbies / Wikipedia: El Clasico',
  },
  {
    teamAId: 'team_atletico',
    teamBId: 'team_real_madrid',
    competitionCode: 'SP1',
    rivalryName: 'Madrid Derby',
    intensity: 1.0,
    source: 'RSSSF Spanish Derbies / Wikipedia: Madrid Derby',
  },
  {
    teamAId: 'team_barcelona',
    teamBId: 'team_espanyol',
    competitionCode: 'SP1',
    rivalryName: 'Derbi Barceloni',
    intensity: 0.95,
    source: 'Wikipedia: Derbi barceloni',
  },
  {
    teamAId: 'team_athletic',
    teamBId: 'team_realsociedad',
    competitionCode: 'SP1',
    rivalryName: 'Basque Derby',
    intensity: 0.95,
    source: 'Wikipedia: Basque derby',
  },
  {
    teamAId: 'team_betis',
    teamBId: 'team_sevilla',
    competitionCode: 'SP1',
    rivalryName: 'Seville Derby',
    intensity: 1.0,
    source: 'RSSSF Spanish Derbies / Wikipedia: Seville derby',
  },
  {
    teamAId: 'team_valencia',
    teamBId: 'team_villarreal',
    competitionCode: 'SP1',
    rivalryName: 'Derbi de la Comunitat',
    intensity: 0.8,
    source: 'Wikipedia: Derbi de la Comunitat',
  },

  // Germany (Group 2)
  {
    teamAId: 'team_bayern',
    teamBId: 'team_dortmund',
    competitionCode: 'D1',
    rivalryName: 'Der Klassiker',
    intensity: 0.9,
    source: 'Bundesliga Official Rivalry Records / Wikipedia: Der Klassiker',
  },
  {
    teamAId: 'team_dortmund',
    teamBId: 'team_schalke',
    competitionCode: 'D1',
    rivalryName: 'Revierderby',
    intensity: 1.0,
    source: 'RSSSF German Derbies / Wikipedia: Revierderby',
  },
  {
    teamAId: 'team_hamburg',
    teamBId: 'team_st_pauli',
    competitionCode: 'D2',
    rivalryName: 'Hamburg Derby',
    intensity: 1.0,
    source: 'Wikipedia: Hamburger Stadtderby',
  },
  {
    teamAId: 'team_bremen',
    teamBId: 'team_hamburg',
    competitionCode: 'D1',
    rivalryName: 'Nordderby',
    intensity: 0.95,
    source: 'Wikipedia: Nordderby',
  },
  {
    teamAId: 'team_koln',
    teamBId: 'team_m_gladbach',
    competitionCode: 'D1',
    rivalryName: 'Rhine Derby',
    intensity: 0.95,
    source: 'Wikipedia: Rhineland derby',
  },
  {
    teamAId: 'team_hertha',
    teamBId: 'team_union_berlin',
    competitionCode: 'D1',
    rivalryName: 'Berlin Derby',
    intensity: 0.9,
    source: 'Wikipedia: Berlin derby',
  },
  {
    teamAId: 'team_koln',
    teamBId: 'team_leverkusen',
    competitionCode: 'D1',
    rivalryName: 'Rhineland Neighbor Derby',
    intensity: 0.8,
    source: 'Wikipedia: Rhineland derby',
  },

  // Italy (Group 2)
  {
    teamAId: 'team_inter',
    teamBId: 'team_milan',
    competitionCode: 'I1',
    rivalryName: 'Derby della Madonnina',
    intensity: 1.0,
    source: 'RSSSF Italian Derbies / Wikipedia: Derby della Madonnina',
  },
  {
    teamAId: 'team_inter',
    teamBId: 'team_juventus',
    competitionCode: 'I1',
    rivalryName: 'Derby dItalia',
    intensity: 0.95,
    source: 'RSSSF Italian Derbies / Wikipedia: Derby dItalia',
  },
  {
    teamAId: 'team_lazio',
    teamBId: 'team_roma',
    competitionCode: 'I1',
    rivalryName: 'Derby della Capitale',
    intensity: 1.0,
    source: 'RSSSF Italian Derbies / Wikipedia: Derby della Capitale',
  },
  {
    teamAId: 'team_juventus',
    teamBId: 'team_torino',
    competitionCode: 'I1',
    rivalryName: 'Derby della Mole',
    intensity: 0.95,
    source: 'Wikipedia: Derby della Mole',
  },
  {
    teamAId: 'team_genoa',
    teamBId: 'team_sampdoria',
    competitionCode: 'I1',
    rivalryName: 'Derby della Lanterna',
    intensity: 1.0,
    source: 'Wikipedia: Derby della Lanterna',
  },
  {
    teamAId: 'team_napoli',
    teamBId: 'team_roma',
    competitionCode: 'I1',
    rivalryName: 'Derby del Sole',
    intensity: 0.85,
    source: 'Wikipedia: Derby del Sole',
  },
  {
    teamAId: 'team_bologna',
    teamBId: 'team_fiorentina',
    competitionCode: 'I1',
    rivalryName: 'Derby dellAppennino',
    intensity: 0.85,
    source: 'Wikipedia: Derby dellAppennino',
  },

  // France (Group 2)
  {
    teamAId: 'team_marseille',
    teamBId: 'team_psg',
    competitionCode: 'F1',
    rivalryName: 'Le Classique',
    intensity: 1.0,
    source: 'RSSSF French Derbies / Wikipedia: Le Classique',
  },
  {
    teamAId: 'team_lyon',
    teamBId: 'team_saintetienne',
    competitionCode: 'F1',
    rivalryName: 'Derby Rhone Alpes',
    intensity: 1.0,
    source: 'Wikipedia: Derby Rhone Alpes',
  },
  {
    teamAId: 'team_lyon',
    teamBId: 'team_marseille',
    competitionCode: 'F1',
    rivalryName: 'Choc des Olympiques',
    intensity: 0.9,
    source: 'Wikipedia: Choc des Olympiques',
  },
  {
    teamAId: 'team_lens',
    teamBId: 'team_lille',
    competitionCode: 'F1',
    rivalryName: 'Derby du Nord',
    intensity: 0.95,
    source: 'Wikipedia: Derby du Nord',
  },
  {
    teamAId: 'team_monaco',
    teamBId: 'team_nice',
    competitionCode: 'F1',
    rivalryName: 'Derby de la Cote dAzur',
    intensity: 0.9,
    source: 'Wikipedia: Derby de la Cote dAzur',
  },

  // Netherlands, Belgium, Portugal, Turkey, Greece (Group 2)
  {
    teamAId: 'team_ajax',
    teamBId: 'team_feyenoord',
    competitionCode: 'N1',
    rivalryName: 'De Klassieker',
    intensity: 1.0,
    source: 'RSSSF Dutch Derbies / Wikipedia: De Klassieker',
  },
  {
    teamAId: 'team_ajax',
    teamBId: 'team_psv',
    competitionCode: 'N1',
    rivalryName: 'De Topper',
    intensity: 0.9,
    source: 'Wikipedia: De Topper',
  },
  {
    teamAId: 'team_anderlecht',
    teamBId: 'team_club_brugge',
    competitionCode: 'B1',
    rivalryName: 'Belgian Topper',
    intensity: 0.95,
    source: 'Wikipedia: Belgian football rivalries',
  },
  {
    teamAId: 'team_anderlecht',
    teamBId: 'team_standard',
    competitionCode: 'B1',
    rivalryName: 'Belgian Clasico',
    intensity: 0.95,
    source: 'Wikipedia: Belgian Clasico',
  },
  {
    teamAId: 'team_cercle_brugge',
    teamBId: 'team_club_brugge',
    competitionCode: 'B1',
    rivalryName: 'Bruges Derby',
    intensity: 0.9,
    source: 'Wikipedia: Bruges derby',
  },
  {
    teamAId: 'team_benfica',
    teamBId: 'team_porto',
    competitionCode: 'P1',
    rivalryName: 'O Classico',
    intensity: 1.0,
    source: 'RSSSF Portuguese Derbies / Wikipedia: O Classico',
  },
  {
    teamAId: 'team_benfica',
    teamBId: 'team_sportingcp',
    competitionCode: 'P1',
    rivalryName: 'Derby de Lisboa',
    intensity: 1.0,
    source: 'RSSSF Portuguese Derbies / Wikipedia: Derby de Lisboa',
  },
  {
    teamAId: 'team_fenerbahce',
    teamBId: 'team_galatasaray',
    competitionCode: 'T1',
    rivalryName: 'Intercontinental Derby',
    intensity: 1.0,
    source: 'RSSSF Turkish Derbies / Wikipedia: Intercontinental Derby',
  },
  {
    teamAId: 'team_besiktas',
    teamBId: 'team_galatasaray',
    competitionCode: 'T1',
    rivalryName: 'Besiktas Galatasaray Derby',
    intensity: 0.95,
    source: 'Wikipedia: Besiktas Galatasaray rivalry',
  },
  {
    teamAId: 'team_besiktas',
    teamBId: 'team_fenerbahce',
    competitionCode: 'T1',
    rivalryName: 'Besiktas Fenerbahce Derby',
    intensity: 0.95,
    source: 'Wikipedia: Besiktas Fenerbahce rivalry',
  },
  {
    teamAId: 'team_olympiakos',
    teamBId: 'team_panathinaikos',
    competitionCode: 'G1',
    rivalryName: 'Derby of the Eternal Enemies',
    intensity: 1.0,
    source: 'RSSSF Greek Derbies / Wikipedia: Derby of the eternal enemies',
  },
  {
    teamAId: 'team_aek',
    teamBId: 'team_paok',
    competitionCode: 'G1',
    rivalryName: 'Double Headed Eagles Derby',
    intensity: 0.9,
    source: 'Wikipedia: AEK PAOK rivalry',
  },
  {
    teamAId: 'team_aek',
    teamBId: 'team_olympiakos',
    competitionCode: 'G1',
    rivalryName: 'Athens Piraeus Derby',
    intensity: 0.9,
    source: 'Wikipedia: Greek football rivalries',
  },

  // Extra Leagues (Group 3)
  {
    teamAId: 'team_boca_juniors',
    teamBId: 'team_river_plate',
    competitionCode: 'ARG',
    rivalryName: 'Superclasico',
    intensity: 1.0,
    source: 'RSSSF Argentine Derbies / Wikipedia: Superclasico',
  },
  {
    teamAId: 'team_independiente',
    teamBId: 'team_racing_club',
    competitionCode: 'ARG',
    rivalryName: 'Clasico de Avellaneda',
    intensity: 1.0,
    source: 'RSSSF Argentine Derbies / Wikipedia: Avellaneda derby',
  },
  {
    teamAId: 'team_huracan',
    teamBId: 'team_san_lorenzo',
    competitionCode: 'ARG',
    rivalryName: 'Clasico Porteno',
    intensity: 0.95,
    source: 'Wikipedia: Huracan San Lorenzo rivalry',
  },
  {
    teamAId: 'team_estudiantes_l_p',
    teamBId: 'team_gimnasia_l_p',
    competitionCode: 'ARG',
    rivalryName: 'Clasico Platense',
    intensity: 0.95,
    source: 'Wikipedia: Clasico Platense',
  },
  {
    teamAId: 'team_newells_old_boys',
    teamBId: 'team_rosario_central',
    competitionCode: 'ARG',
    rivalryName: 'Clasico Rosarino',
    intensity: 1.0,
    source: 'Wikipedia: Rosario derby',
  },
  {
    teamAId: 'team_flamengo',
    teamBId: 'team_fluminense',
    competitionCode: 'BSA',
    rivalryName: 'Fla Flu',
    intensity: 1.0,
    source: 'RSSSF Brazilian Derbies / Wikipedia: Fla Flu',
  },
  {
    teamAId: 'team_flamengo',
    teamBId: 'team_vasco',
    competitionCode: 'BSA',
    rivalryName: 'Clasico dos Milhoes',
    intensity: 0.95,
    source: 'Wikipedia: Clasico dos Milhoes',
  },
  {
    teamAId: 'team_corinthians',
    teamBId: 'team_palmeiras',
    competitionCode: 'BSA',
    rivalryName: 'Derby Paulista',
    intensity: 1.0,
    source: 'RSSSF Brazilian Derbies / Wikipedia: Paulista Derby',
  },
  {
    teamAId: 'team_corinthians',
    teamBId: 'team_saopaulo',
    competitionCode: 'BSA',
    rivalryName: 'Majestoso',
    intensity: 0.95,
    source: 'Wikipedia: Majestoso',
  },
  {
    teamAId: 'team_gremio',
    teamBId: 'team_internacional',
    competitionCode: 'BSA',
    rivalryName: 'Gre Nal',
    intensity: 1.0,
    source: 'RSSSF Brazilian Derbies / Wikipedia: Grenal',
  },
  {
    teamAId: 'team_cruzeiro',
    teamBId: 'team_mineiro',
    competitionCode: 'BSA',
    rivalryName: 'Clasico Mineiro',
    intensity: 1.0,
    source: 'Wikipedia: Clasico Mineiro',
  },
  {
    teamAId: 'team_austria_vienna',
    teamBId: 'team_sk_rapid',
    competitionCode: 'AUT',
    rivalryName: 'Vienna Derby',
    intensity: 1.0,
    source: 'Wikipedia: Vienna derby',
  },
  {
    teamAId: 'team_brondby',
    teamBId: 'team_fc_copenhagen',
    competitionCode: 'DNK',
    rivalryName: 'New Firm Copenhagen Derby',
    intensity: 1.0,
    source: 'Wikipedia: New Firm Copenhagen',
  },
  {
    teamAId: 'team_dinamo_bucuresti',
    teamBId: 'team_fcsb',
    competitionCode: 'ROU',
    rivalryName: 'Eternal Derby Romania',
    intensity: 1.0,
    source: 'Wikipedia: Eternal derby Romania',
  },
  {
    teamAId: 'team_cska_moscow',
    teamBId: 'team_spartak_moscow',
    competitionCode: 'RUS',
    rivalryName: 'Main Moscow Derby',
    intensity: 1.0,
    source: 'Wikipedia: Main Moscow derby',
  },
  {
    teamAId: 'team_aik',
    teamBId: 'team_djurgarden',
    competitionCode: 'SWE',
    rivalryName: 'Tvillingderbyt',
    intensity: 0.95,
    source: 'Wikipedia: Tvillingderbyt',
  },
  {
    teamAId: 'team_club_america',
    teamBId: 'team_guadalajara_chivas',
    competitionCode: 'MEX',
    rivalryName: 'El Super Clasico Mexico',
    intensity: 1.0,
    source: 'Wikipedia: El Super Clasico Mexico',
  },
  {
    teamAId: 'team_club_america',
    teamBId: 'team_cruz_azul',
    competitionCode: 'MEX',
    rivalryName: 'Clasico Joven',
    intensity: 0.95,
    source: 'Wikipedia: Clasico Joven',
  },
  {
    teamAId: 'team_monterrey',
    teamBId: 'team_tigres_uanl',
    competitionCode: 'MEX',
    rivalryName: 'Clasico Regiomontano',
    intensity: 1.0,
    source: 'Wikipedia: Clasico Regiomontano',
  },
  {
    teamAId: 'team_los_angeles_fc',
    teamBId: 'team_los_angeles_galaxy',
    competitionCode: 'USA',
    rivalryName: 'El Trafico',
    intensity: 0.95,
    source: 'MLS Rivalry Records / Wikipedia: El Trafico',
  },
  {
    teamAId: 'team_new_york_city',
    teamBId: 'team_new_york_red_bulls',
    competitionCode: 'USA',
    rivalryName: 'Hudson River Derby',
    intensity: 0.9,
    source: 'MLS Rivalry Records / Wikipedia: Hudson River Derby',
  },
  {
    teamAId: 'team_portland_timbers',
    teamBId: 'team_seattle_sounders',
    competitionCode: 'USA',
    rivalryName: 'Cascadia Cup',
    intensity: 0.95,
    source: 'MLS Rivalry Records / Wikipedia: Cascadia Cup',
  },
];

export function canonicalPairIds(id1: string, id2: string): [string, string] {
  return id1 <= id2 ? [id1, id2] : [id2, id1];
}

export function seedRivalriesIntoDb(db: any): {
  seeded: number;
  skippedMissingTeam: string[];
} {
  if (!db) return { seeded: 0, skippedMissingTeam: [] };

  const existingTeams = new Set<string>(
    (db.prepare('SELECT id FROM teams').all() as Array<{ id: string }>).map(r => r.id)
  );

  const stmt = db.prepare(`
    INSERT INTO rivalries (id, team_a_id, team_b_id, competition_code, rivalry_name, intensity, source)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (team_a_id, team_b_id) DO UPDATE SET
      competition_code = excluded.competition_code,
      rivalry_name = excluded.rivalry_name,
      intensity = excluded.intensity,
      source = excluded.source
  `);

  let seeded = 0;
  const skippedMissingTeam: string[] = [];

  db.exec('BEGIN');
  try {
    for (const r of CURATED_RIVALRIES) {
      if (!existingTeams.has(r.teamAId) || !existingTeams.has(r.teamBId)) {
        skippedMissingTeam.push(`${r.teamAId} vs ${r.teamBId} (${r.rivalryName})`);
        continue;
      }
      const [teamA, teamB] = canonicalPairIds(r.teamAId, r.teamBId);
      const id = `riv_${teamA}__${teamB}`;
      stmt.run(id, teamA, teamB, r.competitionCode, r.rivalryName, r.intensity, r.source);
      seeded++;
    }
    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    throw err;
  }

  return { seeded, skippedMissingTeam };
}
