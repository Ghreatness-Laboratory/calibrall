// CALIBRALL: Canonical Team Registry & Provider Normalization Service
// Maps team names and IDs across Football-Data.co.uk, Football-Data.org, TheSportsDB, Elvidge, and ESPN.

export interface CanonicalTeam {
  canonicalId: string;
  canonicalName: string;
  shortName: string;
  tla: string;
  competitionCode: string;
  crestUrl: string;
  venueName?: string;
  aliases: string[];
  providerIds: {
    footballDataCoUk?: string;
    footballDataOrg?: string;
    theSportsDb?: string;
    espn?: string;
    elvidge?: string;
  };
}

export const CANONICAL_TEAMS: Record<string, CanonicalTeam> = {
  // ==========================================
  // PREMIER LEAGUE (PL)
  // ==========================================
  team_arsenal: {
    canonicalId: 'team_arsenal',
    canonicalName: 'Arsenal FC',
    shortName: 'Arsenal',
    tla: 'ARS',
    competitionCode: 'PL',
    crestUrl: 'https://crests.football-data.org/57.png',
    venueName: 'Emirates Stadium',
    aliases: ['arsenal', 'arsenal fc', 'the gunners', 'afc'],
    providerIds: { footballDataCoUk: 'Arsenal', footballDataOrg: '57', espn: '359', theSportsDb: '133604', elvidge: 'Arsenal' }
  },
  team_aston_villa: {
    canonicalId: 'team_aston_villa',
    canonicalName: 'Aston Villa FC',
    shortName: 'Aston Villa',
    tla: 'AVL',
    competitionCode: 'PL',
    crestUrl: 'https://crests.football-data.org/58.png',
    venueName: 'Villa Park',
    aliases: ['aston villa', 'aston villa fc', 'villa', 'avfc'],
    providerIds: { footballDataCoUk: 'Aston Villa', footballDataOrg: '58', espn: '362', theSportsDb: '133601', elvidge: 'Aston Villa' }
  },
  team_bournemouth: {
    canonicalId: 'team_bournemouth',
    canonicalName: 'AFC Bournemouth',
    shortName: 'Bournemouth',
    tla: 'BOU',
    competitionCode: 'PL',
    crestUrl: 'https://crests.football-data.org/1044.png',
    venueName: 'Vitality Stadium',
    aliases: ['bournemouth', 'afc bournemouth', 'the cherries'],
    providerIds: { footballDataCoUk: 'Bournemouth', footballDataOrg: '1044', espn: '349', theSportsDb: '134301', elvidge: 'Bournemouth' }
  },
  team_brentford: {
    canonicalId: 'team_brentford',
    canonicalName: 'Brentford FC',
    shortName: 'Brentford',
    tla: 'BRE',
    competitionCode: 'PL',
    crestUrl: 'https://crests.football-data.org/402.png',
    venueName: 'Gtech Community Stadium',
    aliases: ['brentford', 'brentford fc', 'the bees'],
    providerIds: { footballDataCoUk: 'Brentford', footballDataOrg: '402', espn: '337', theSportsDb: '133600', elvidge: 'Brentford' }
  },
  team_brighton: {
    canonicalId: 'team_brighton',
    canonicalName: 'Brighton & Hove Albion FC',
    shortName: 'Brighton',
    tla: 'BHA',
    competitionCode: 'PL',
    crestUrl: 'https://crests.football-data.org/397.png',
    venueName: 'Amex Stadium',
    aliases: ['brighton', 'brighton and hove albion', 'brighton & hove albion', 'brighton fc', 'bha'],
    providerIds: { footballDataCoUk: 'Brighton', footballDataOrg: '397', espn: '331', theSportsDb: '133619', elvidge: 'Brighton & Hove Albion' }
  },
  team_chelsea: {
    canonicalId: 'team_chelsea',
    canonicalName: 'Chelsea FC',
    shortName: 'Chelsea',
    tla: 'CHE',
    competitionCode: 'PL',
    crestUrl: 'https://crests.football-data.org/61.png',
    venueName: 'Stamford Bridge',
    aliases: ['chelsea', 'chelsea fc', 'the blues', 'cfc', 'team_chelsea'],
    providerIds: { footballDataCoUk: 'Chelsea', footballDataOrg: '61', espn: '363', theSportsDb: '133610', elvidge: 'Chelsea' }
  },
  team_crystal_palace: {
    canonicalId: 'team_crystal_palace',
    canonicalName: 'Crystal Palace FC',
    shortName: 'Crystal Palace',
    tla: 'CRY',
    competitionCode: 'PL',
    crestUrl: 'https://crests.football-data.org/354.png',
    venueName: 'Selhurst Park',
    aliases: ['crystal palace', 'crystal palace fc', 'palace', 'cpfc'],
    providerIds: { footballDataCoUk: 'Crystal Palace', footballDataOrg: '354', espn: '384', theSportsDb: '133605', elvidge: 'Crystal Palace' }
  },
  team_everton: {
    canonicalId: 'team_everton',
    canonicalName: 'Everton FC',
    shortName: 'Everton',
    tla: 'EVE',
    competitionCode: 'PL',
    crestUrl: 'https://crests.football-data.org/62.png',
    venueName: 'Goodison Park',
    aliases: ['everton', 'everton fc', 'the toffees', 'efc'],
    providerIds: { footballDataCoUk: 'Everton', footballDataOrg: '62', espn: '368', theSportsDb: '133615', elvidge: 'Everton' }
  },
  team_fulham: {
    canonicalId: 'team_fulham',
    canonicalName: 'Fulham FC',
    shortName: 'Fulham',
    tla: 'FUL',
    competitionCode: 'PL',
    crestUrl: 'https://crests.football-data.org/63.png',
    venueName: 'Craven Cottage',
    aliases: ['fulham', 'fulham fc', 'the cottagers', 'ffc'],
    providerIds: { footballDataCoUk: 'Fulham', footballDataOrg: '63', espn: '370', theSportsDb: '133602', elvidge: 'Fulham' }
  },
  team_ipswich: {
    canonicalId: 'team_ipswich',
    canonicalName: 'Ipswich Town FC',
    shortName: 'Ipswich',
    tla: 'IPS',
    competitionCode: 'PL',
    crestUrl: 'https://crests.football-data.org/349.png',
    venueName: 'Portman Road',
    aliases: ['ipswich', 'ipswich town', 'ipswich town fc', 'itfc'],
    providerIds: { footballDataCoUk: 'Ipswich', footballDataOrg: '349', espn: '373', theSportsDb: '133607', elvidge: 'Ipswich Town' }
  },
  team_leicester: {
    canonicalId: 'team_leicester',
    canonicalName: 'Leicester City FC',
    shortName: 'Leicester',
    tla: 'LEI',
    competitionCode: 'PL',
    crestUrl: 'https://crests.football-data.org/338.png',
    venueName: 'King Power Stadium',
    aliases: ['leicester', 'leicester city', 'leicester city fc', 'lcfc'],
    providerIds: { footballDataCoUk: 'Leicester', footballDataOrg: '338', espn: '375', theSportsDb: '133626', elvidge: 'Leicester City' }
  },
  team_liverpool: {
    canonicalId: 'team_liverpool',
    canonicalName: 'Liverpool FC',
    shortName: 'Liverpool',
    tla: 'LIV',
    competitionCode: 'PL',
    crestUrl: 'https://crests.football-data.org/64.png',
    venueName: 'Anfield',
    aliases: ['liverpool', 'liverpool fc', 'the reds', 'lfc'],
    providerIds: { footballDataCoUk: 'Liverpool', footballDataOrg: '64', espn: '364', theSportsDb: '133612', elvidge: 'Liverpool' }
  },
  team_man_city: {
    canonicalId: 'team_man_city',
    canonicalName: 'Manchester City FC',
    shortName: 'Man City',
    tla: 'MCI',
    competitionCode: 'PL',
    crestUrl: 'https://crests.football-data.org/65.png',
    venueName: 'Etihad Stadium',
    aliases: ['man city', 'manchester city', 'manchester city fc', 'man. city', 'mcfc'],
    providerIds: { footballDataCoUk: 'Man City', footballDataOrg: '65', espn: '382', theSportsDb: '133613', elvidge: 'Manchester City' }
  },
  team_man_united: {
    canonicalId: 'team_man_united',
    canonicalName: 'Manchester United FC',
    shortName: 'Man United',
    tla: 'MUN',
    competitionCode: 'PL',
    crestUrl: 'https://crests.football-data.org/66.png',
    venueName: 'Old Trafford',
    aliases: ['man united', 'man utd', 'manchester united', 'manchester utd', 'manchester united fc', 'mufc', 'team_manunited', 'team_man_united', 'the red devils'],
    providerIds: { footballDataCoUk: 'Man United', footballDataOrg: '66', espn: '360', theSportsDb: '133614', elvidge: 'Manchester United' }
  },
  team_newcastle: {
    canonicalId: 'team_newcastle',
    canonicalName: 'Newcastle United FC',
    shortName: 'Newcastle',
    tla: 'NEW',
    competitionCode: 'PL',
    crestUrl: 'https://crests.football-data.org/67.png',
    venueName: "St James' Park",
    aliases: ['newcastle', 'newcastle united', 'newcastle utd', 'newcastle united fc', 'nufc'],
    providerIds: { footballDataCoUk: 'Newcastle', footballDataOrg: '67', espn: '361', theSportsDb: '133616', elvidge: 'Newcastle United' }
  },
  team_nottingham_forest: {
    canonicalId: 'team_nottingham_forest',
    canonicalName: 'Nottingham Forest FC',
    shortName: 'Nott\'m Forest',
    tla: 'NFO',
    competitionCode: 'PL',
    crestUrl: 'https://crests.football-data.org/351.png',
    venueName: 'The City Ground',
    aliases: ["nott'm forest", 'nottingham forest', 'nottingham forest fc', 'forest', 'nffc'],
    providerIds: { footballDataCoUk: "Nott'm Forest", footballDataOrg: '351', espn: '393', theSportsDb: '133624', elvidge: 'Nottingham Forest' }
  },
  team_southampton: {
    canonicalId: 'team_southampton',
    canonicalName: 'Southampton FC',
    shortName: 'Southampton',
    tla: 'SOU',
    competitionCode: 'PL',
    crestUrl: 'https://crests.football-data.org/340.png',
    venueName: "St Mary's Stadium",
    aliases: ['southampton', 'southampton fc', 'the saints', 'saints'],
    providerIds: { footballDataCoUk: 'Southampton', footballDataOrg: '340', espn: '376', theSportsDb: '133623', elvidge: 'Southampton' }
  },
  team_tottenham: {
    canonicalId: 'team_tottenham',
    canonicalName: 'Tottenham Hotspur FC',
    shortName: 'Tottenham',
    tla: 'TOT',
    competitionCode: 'PL',
    crestUrl: 'https://crests.football-data.org/73.png',
    venueName: 'Tottenham Hotspur Stadium',
    aliases: ['tottenham', 'tottenham hotspur', 'tottenham hotspur fc', 'spurs', 'thfc'],
    providerIds: { footballDataCoUk: 'Tottenham', footballDataOrg: '73', espn: '367', theSportsDb: '133617', elvidge: 'Tottenham Hotspur' }
  },
  team_west_ham: {
    canonicalId: 'team_west_ham',
    canonicalName: 'West Ham United FC',
    shortName: 'West Ham',
    tla: 'WHU',
    competitionCode: 'PL',
    crestUrl: 'https://crests.football-data.org/563.png',
    venueName: 'London Stadium',
    aliases: ['west ham', 'west ham united', 'west ham utd', 'west ham united fc', 'whufc'],
    providerIds: { footballDataCoUk: 'West Ham', footballDataOrg: '563', espn: '371', theSportsDb: '133621', elvidge: 'West Ham United' }
  },
  team_wolves: {
    canonicalId: 'team_wolves',
    canonicalName: 'Wolverhampton Wanderers FC',
    shortName: 'Wolves',
    tla: 'WOL',
    competitionCode: 'PL',
    crestUrl: 'https://crests.football-data.org/76.png',
    venueName: 'Molineux Stadium',
    aliases: ['wolves', 'wolverhampton wanderers', 'wolverhampton', 'wolverhampton wanderers fc', 'wwfc'],
    providerIds: { footballDataCoUk: 'Wolves', footballDataOrg: '76', espn: '380', theSportsDb: '133620', elvidge: 'Wolverhampton Wanderers' }
  },

  // ==========================================
  // CHAMPIONSHIP (ELC)
  // ==========================================
  team_norwich: {
    canonicalId: 'team_norwich',
    canonicalName: 'Norwich City FC',
    shortName: 'Norwich',
    tla: 'NOR',
    competitionCode: 'ELC',
    crestUrl: 'https://crests.football-data.org/68.png',
    venueName: 'Carrow Road',
    aliases: ['norwich', 'norwich city', 'norwich city fc', 'the canaries', 'team_norwich', 'team_norwichcity', 'ncfc'],
    providerIds: { footballDataCoUk: 'Norwich', footballDataOrg: '68', espn: '381', theSportsDb: '133627', elvidge: 'Norwich City' }
  },
  team_watford: {
    canonicalId: 'team_watford',
    canonicalName: 'Watford FC',
    shortName: 'Watford',
    tla: 'WAT',
    competitionCode: 'ELC',
    crestUrl: 'https://crests.football-data.org/346.png',
    venueName: 'Vicarage Road',
    aliases: ['watford', 'watford fc', 'the hornets', 'team_watford'],
    providerIds: { footballDataCoUk: 'Watford', footballDataOrg: '346', espn: '395', theSportsDb: '133628', elvidge: 'Watford' }
  },
  team_leeds: {
    canonicalId: 'team_leeds',
    canonicalName: 'Leeds United FC',
    shortName: 'Leeds',
    tla: 'LEE',
    competitionCode: 'ELC',
    crestUrl: 'https://crests.football-data.org/341.png',
    venueName: 'Elland Road',
    aliases: ['leeds', 'leeds united', 'leeds utd', 'leeds united fc', 'lufc'],
    providerIds: { footballDataCoUk: 'Leeds', footballDataOrg: '341', espn: '357', theSportsDb: '133608', elvidge: 'Leeds United' }
  },
  team_burnley: {
    canonicalId: 'team_burnley',
    canonicalName: 'Burnley FC',
    shortName: 'Burnley',
    tla: 'BUR',
    competitionCode: 'ELC',
    crestUrl: 'https://crests.football-data.org/328.png',
    venueName: 'Turf Moor',
    aliases: ['burnley', 'burnley fc', 'the clarets'],
    providerIds: { footballDataCoUk: 'Burnley', footballDataOrg: '328', espn: '379', theSportsDb: '133622', elvidge: 'Burnley' }
  },
  team_luton: {
    canonicalId: 'team_luton',
    canonicalName: 'Luton Town FC',
    shortName: 'Luton',
    tla: 'LUT',
    competitionCode: 'ELC',
    crestUrl: 'https://crests.football-data.org/389.png',
    venueName: 'Kenilworth Road',
    aliases: ['luton', 'luton town', 'luton town fc', 'the hatters'],
    providerIds: { footballDataCoUk: 'Luton', footballDataOrg: '389', espn: '369', theSportsDb: '133609', elvidge: 'Luton Town' }
  },
  team_sheffield_utd: {
    canonicalId: 'team_sheffield_utd',
    canonicalName: 'Sheffield United FC',
    shortName: 'Sheffield Utd',
    tla: 'SHU',
    competitionCode: 'ELC',
    crestUrl: 'https://crests.football-data.org/356.png',
    venueName: 'Bramall Lane',
    aliases: ['sheffield utd', 'sheffield united', 'sheffield united fc', 'the blades'],
    providerIds: { footballDataCoUk: 'Sheffield United', footballDataOrg: '356', espn: '387', theSportsDb: '133625', elvidge: 'Sheffield United' }
  },
  team_sheffield_wed: {
    canonicalId: 'team_sheffield_wed',
    canonicalName: 'Sheffield Wednesday FC',
    shortName: 'Sheffield Weds',
    tla: 'SHW',
    competitionCode: 'ELC',
    crestUrl: 'https://crests.football-data.org/345.png',
    venueName: 'Hillsborough Stadium',
    aliases: ['sheffield weds', 'sheffield wednesday', 'sheffield wednesday fc', 'the owls'],
    providerIds: { footballDataCoUk: 'Sheffield Weds', footballDataOrg: '345', espn: '388', theSportsDb: '133629', elvidge: 'Sheffield Wednesday' }
  },
  team_sunderland: {
    canonicalId: 'team_sunderland',
    canonicalName: 'Sunderland AFC',
    shortName: 'Sunderland',
    tla: 'SUN',
    competitionCode: 'ELC',
    crestUrl: 'https://crests.football-data.org/71.png',
    venueName: 'Stadium of Light',
    aliases: ['sunderland', 'sunderland afc', 'the black cats', 'safc'],
    providerIds: { footballDataCoUk: 'Sunderland', footballDataOrg: '71', espn: '366', theSportsDb: '133618', elvidge: 'Sunderland' }
  },
  team_west_brom: {
    canonicalId: 'team_west_brom',
    canonicalName: 'West Bromwich Albion FC',
    shortName: 'West Brom',
    tla: 'WBA',
    competitionCode: 'ELC',
    crestUrl: 'https://crests.football-data.org/74.png',
    venueName: 'The Hawthorns',
    aliases: ['west brom', 'west bromwich', 'west bromwich albion', 'west bromwich albion fc', 'wba'],
    providerIds: { footballDataCoUk: 'West Brom', footballDataOrg: '74', espn: '383', theSportsDb: '133630', elvidge: 'West Bromwich Albion' }
  },
  team_middlesbrough: {
    canonicalId: 'team_middlesbrough',
    canonicalName: 'Middlesbrough FC',
    shortName: 'Middlesbrough',
    tla: 'MID',
    competitionCode: 'ELC',
    crestUrl: 'https://crests.football-data.org/343.png',
    venueName: 'Riverside Stadium',
    aliases: ['middlesbrough', 'middlesbrough fc', 'boro', 'mfc'],
    providerIds: { footballDataCoUk: 'Middlesbrough', footballDataOrg: '343', espn: '377', theSportsDb: '133631', elvidge: 'Middlesbrough' }
  },
  team_coventry: {
    canonicalId: 'team_coventry',
    canonicalName: 'Coventry City FC',
    shortName: 'Coventry',
    tla: 'COV',
    competitionCode: 'ELC',
    crestUrl: 'https://crests.football-data.org/1076.png',
    venueName: 'Coventry Building Society Arena',
    aliases: ['coventry', 'coventry city', 'coventry city fc', 'the sky blues'],
    providerIds: { footballDataCoUk: 'Coventry', footballDataOrg: '1076', espn: '385', theSportsDb: '133632', elvidge: 'Coventry City' }
  },
  team_bristol_city: {
    canonicalId: 'team_bristol_city',
    canonicalName: 'Bristol City FC',
    shortName: 'Bristol City',
    tla: 'BRC',
    competitionCode: 'ELC',
    crestUrl: 'https://crests.football-data.org/387.png',
    venueName: 'Ashton Gate',
    aliases: ['bristol city', 'bristol city fc', 'the robins'],
    providerIds: { footballDataCoUk: 'Bristol City', footballDataOrg: '387', espn: '389', theSportsDb: '133633', elvidge: 'Bristol City' }
  },
  team_millwall: {
    canonicalId: 'team_millwall',
    canonicalName: 'Millwall FC',
    shortName: 'Millwall',
    tla: 'MIL',
    competitionCode: 'ELC',
    crestUrl: 'https://crests.football-data.org/384.png',
    venueName: 'The Den',
    aliases: ['millwall', 'millwall fc', 'the lions'],
    providerIds: { footballDataCoUk: 'Millwall', footballDataOrg: '384', espn: '390', theSportsDb: '133634', elvidge: 'Millwall' }
  },
  team_blackburn: {
    canonicalId: 'team_blackburn',
    canonicalName: 'Blackburn Rovers FC',
    shortName: 'Blackburn',
    tla: 'BLA',
    competitionCode: 'ELC',
    crestUrl: 'https://crests.football-data.org/59.png',
    venueName: 'Ewood Park',
    aliases: ['blackburn', 'blackburn rovers', 'blackburn rovers fc', 'rovers'],
    providerIds: { footballDataCoUk: 'Blackburn', footballDataOrg: '59', espn: '365', theSportsDb: '133635', elvidge: 'Blackburn Rovers' }
  },
  team_swansea: {
    canonicalId: 'team_swansea',
    canonicalName: 'Swansea City AFC',
    shortName: 'Swansea',
    tla: 'SWA',
    competitionCode: 'ELC',
    crestUrl: 'https://crests.football-data.org/72.png',
    venueName: '.com Stadium',
    aliases: ['swansea', 'swansea city', 'swansea city afc', 'the swans'],
    providerIds: { footballDataCoUk: 'Swansea', footballDataOrg: '72', espn: '386', theSportsDb: '133636', elvidge: 'Swansea City' }
  },
  team_stoke: {
    canonicalId: 'team_stoke',
    canonicalName: 'Stoke City FC',
    shortName: 'Stoke',
    tla: 'STO',
    competitionCode: 'ELC',
    crestUrl: 'https://crests.football-data.org/70.png',
    venueName: 'bet365 Stadium',
    aliases: ['stoke', 'stoke city', 'stoke city fc', 'the potters', 'team_stokecity', 'team_stoke', 'scfc'],
    providerIds: { footballDataCoUk: 'Stoke', footballDataOrg: '70', espn: '378', theSportsDb: '133637', elvidge: 'Stoke City' }
  },
  team_hull: {
    canonicalId: 'team_hull',
    canonicalName: 'Hull City AFC',
    shortName: 'Hull',
    tla: 'HUL',
    competitionCode: 'ELC',
    crestUrl: 'https://crests.football-data.org/322.png',
    venueName: 'MKM Stadium',
    aliases: ['hull', 'hull city', 'hull city afc', 'the tigers'],
    providerIds: { footballDataCoUk: 'Hull', footballDataOrg: '322', espn: '391', theSportsDb: '133638', elvidge: 'Hull City' }
  },
  team_qpr: {
    canonicalId: 'team_qpr',
    canonicalName: 'Queens Park Rangers FC',
    shortName: 'QPR',
    tla: 'QPR',
    competitionCode: 'ELC',
    crestUrl: 'https://crests.football-data.org/69.png',
    venueName: 'Loftus Road',
    aliases: ['qpr', 'queens park rangers', 'queens park rangers fc'],
    providerIds: { footballDataCoUk: 'QPR', footballDataOrg: '69', espn: '392', theSportsDb: '133639', elvidge: 'Queens Park Rangers' }
  },
  team_preston: {
    canonicalId: 'team_preston',
    canonicalName: 'Preston North End FC',
    shortName: 'Preston',
    tla: 'PNE',
    competitionCode: 'ELC',
    crestUrl: 'https://crests.football-data.org/1081.png',
    venueName: 'Deepdale',
    aliases: ['preston', 'preston north end', 'preston north end fc', 'pne', 'team_preston', 'team_prestonnorthend'],
    providerIds: { footballDataCoUk: 'Preston', footballDataOrg: '1081', espn: '394', theSportsDb: '133640', elvidge: 'Preston North End' }
  },
  team_derby: {
    canonicalId: 'team_derby',
    canonicalName: 'Derby County FC',
    shortName: 'Derby',
    tla: 'DER',
    competitionCode: 'ELC',
    crestUrl: 'https://crests.football-data.org/342.png',
    venueName: 'Pride Park',
    aliases: ['derby', 'derby county', 'derby county fc', 'the rams'],
    providerIds: { footballDataCoUk: 'Derby', footballDataOrg: '342', espn: '372', theSportsDb: '133641', elvidge: 'Derby County' }
  },
  team_oxford_utd: {
    canonicalId: 'team_oxford_utd',
    canonicalName: 'Oxford United FC',
    shortName: 'Oxford',
    tla: 'OXF',
    competitionCode: 'ELC',
    crestUrl: 'https://crests.football-data.org/1084.png',
    venueName: 'Kassam Stadium',
    aliases: ['oxford', 'oxford united', 'oxford utd', 'oxford united fc'],
    providerIds: { footballDataCoUk: 'Oxford', footballDataOrg: '1084', espn: '396', theSportsDb: '133642', elvidge: 'Oxford United' }
  },
  team_portsmouth: {
    canonicalId: 'team_portsmouth',
    canonicalName: 'Portsmouth FC',
    shortName: 'Portsmouth',
    tla: 'POR',
    competitionCode: 'ELC',
    crestUrl: 'https://crests.football-data.org/325.png',
    venueName: 'Fratton Park',
    aliases: ['portsmouth', 'portsmouth fc', 'pompey'],
    providerIds: { footballDataCoUk: 'Portsmouth', footballDataOrg: '325', espn: '374', theSportsDb: '133643', elvidge: 'Portsmouth' }
  },
  team_cardiff: {
    canonicalId: 'team_cardiff',
    canonicalName: 'Cardiff City FC',
    shortName: 'Cardiff',
    tla: 'CAR',
    competitionCode: 'ELC',
    crestUrl: 'https://crests.football-data.org/385.png',
    venueName: 'Cardiff City Stadium',
    aliases: ['cardiff', 'cardiff city', 'cardiff city fc', 'the bluebirds'],
    providerIds: { footballDataCoUk: 'Cardiff', footballDataOrg: '385', espn: '383', theSportsDb: '133644', elvidge: 'Cardiff City' }
  },
  team_plymouth: {
    canonicalId: 'team_plymouth',
    canonicalName: 'Plymouth Argyle FC',
    shortName: 'Plymouth',
    tla: 'PLY',
    competitionCode: 'ELC',
    crestUrl: 'https://crests.football-data.org/1075.png',
    venueName: 'Home Park',
    aliases: ['plymouth', 'plymouth argyle', 'plymouth argyle fc', 'the pilgrims'],
    providerIds: { footballDataCoUk: 'Plymouth', footballDataOrg: '1075', espn: '397', theSportsDb: '133645', elvidge: 'Plymouth Argyle' }
  },
  // ==========================================
  // LEAGUE ONE & TWO CANONICAL CLUBS (E2, E3)
  // ==========================================
  team_lincoln: {
    canonicalId: 'team_lincoln',
    canonicalName: 'Lincoln City FC',
    shortName: 'Lincoln',
    tla: 'LCN',
    competitionCode: 'E2',
    crestUrl: 'https://crests.football-data.org/1083.png',
    venueName: 'LNER Stadium',
    aliases: ['lincoln', 'lincoln city', 'lincoln city fc', 'the imps', 'lcn', 'team_lincoln', 'team_lincolncity'],
    providerIds: { footballDataCoUk: 'Lincoln', footballDataOrg: '1083', theSportsDb: '133648', elvidge: 'Lincoln City' }
  },
  team_afc_wimbledon: {
    canonicalId: 'team_afc_wimbledon',
    canonicalName: 'AFC Wimbledon',
    shortName: 'Wimbledon',
    tla: 'WIM',
    competitionCode: 'E3',
    crestUrl: 'https://crests.football-data.org/1077.png',
    venueName: 'Plough Lane',
    aliases: ['afc wimbledon', 'wimbledon', 'the dons', 'team_afc_wimbledon'],
    providerIds: { footballDataCoUk: 'AFC Wimbledon', elvidge: 'AFC Wimbledon' }
  },
  team_accrington: {
    canonicalId: 'team_accrington',
    canonicalName: 'Accrington Stanley FC',
    shortName: 'Accrington',
    tla: 'ACC',
    competitionCode: 'E3',
    crestUrl: 'https://crests.football-data.org/1078.png',
    venueName: 'Crown Ground',
    aliases: ['accrington stanley', 'accrington stanley fc', 'accrington', 'stanley', 'team_accrington'],
    providerIds: { footballDataCoUk: 'Accrington', elvidge: 'Accrington Stanley' }
  },
  team_barnet: {
    canonicalId: 'team_barnet',
    canonicalName: 'Barnet FC',
    shortName: 'Barnet',
    tla: 'BAR',
    competitionCode: 'E3',
    crestUrl: '',
    venueName: 'The Hive Stadium',
    aliases: ['barnet', 'barnet fc', 'the bees', 'team_barnet'],
    providerIds: { footballDataCoUk: 'Barnet', elvidge: 'Barnet' }
  },
  team_barnsley: {
    canonicalId: 'team_barnsley',
    canonicalName: 'Barnsley FC',
    shortName: 'Barnsley',
    tla: 'BTY',
    competitionCode: 'E2',
    crestUrl: 'https://crests.football-data.org/388.png',
    venueName: 'Oakwell',
    aliases: ['barnsley', 'barnsley fc', 'the tykes', 'team_barnsley'],
    providerIds: { footballDataCoUk: 'Barnsley', elvidge: 'Barnsley' }
  },
  team_barrow: {
    canonicalId: 'team_barrow',
    canonicalName: 'Barrow AFC',
    shortName: 'Barrow',
    tla: 'BRW',
    competitionCode: 'E3',
    crestUrl: '',
    venueName: 'Holker Street',
    aliases: ['barrow', 'barrow afc', 'the bluebirds', 'team_barrow'],
    providerIds: { footballDataCoUk: 'Barrow', elvidge: 'Barrow' }
  },
  team_birmingham: {
    canonicalId: 'team_birmingham',
    canonicalName: 'Birmingham City FC',
    shortName: 'Birmingham',
    tla: 'BIR',
    competitionCode: 'E2',
    crestUrl: 'https://crests.football-data.org/386.png',
    venueName: "St Andrew's",
    aliases: ['birmingham', 'birmingham city', 'birmingham city fc', 'blues', 'team_birmingham'],
    providerIds: { footballDataCoUk: 'Birmingham', elvidge: 'Birmingham City' }
  },
  team_blackpool: {
    canonicalId: 'team_blackpool',
    canonicalName: 'Blackpool FC',
    shortName: 'Blackpool',
    tla: 'BLP',
    competitionCode: 'E2',
    crestUrl: 'https://crests.football-data.org/393.png',
    venueName: 'Bloomfield Road',
    aliases: ['blackpool', 'blackpool fc', 'the seasiders', 'team_blackpool'],
    providerIds: { footballDataCoUk: 'Blackpool', elvidge: 'Blackpool' }
  },
  team_bolton: {
    canonicalId: 'team_bolton',
    canonicalName: 'Bolton Wanderers FC',
    shortName: 'Bolton',
    tla: 'BOL',
    competitionCode: 'E2',
    crestUrl: 'https://crests.football-data.org/62.png',
    venueName: 'Toughsheet Community Stadium',
    aliases: ['bolton', 'bolton wanderers', 'bolton wanderers fc', 'the trotters', 'team_bolton'],
    providerIds: { footballDataCoUk: 'Bolton', elvidge: 'Bolton Wanderers' }
  },
  team_bradford: {
    canonicalId: 'team_bradford',
    canonicalName: 'Bradford City AFC',
    shortName: 'Bradford',
    tla: 'BRA',
    competitionCode: 'E3',
    crestUrl: 'https://crests.football-data.org/1079.png',
    venueName: 'Valley Parade',
    aliases: ['bradford', 'bradford city', 'bradford city afc', 'the bantams', 'team_bradford'],
    providerIds: { footballDataCoUk: 'Bradford', elvidge: 'Bradford City' }
  },
  team_bristol_rovers: {
    canonicalId: 'team_bristol_rovers',
    canonicalName: 'Bristol Rovers FC',
    shortName: 'Bristol Rvs',
    tla: 'BRR',
    competitionCode: 'E2',
    crestUrl: 'https://crests.football-data.org/1080.png',
    venueName: 'Memorial Stadium',
    aliases: ['bristol rovers', 'bristol rvs', 'bristol rovers fc', 'the pirates', 'team_bristol_rovers'],
    providerIds: { footballDataCoUk: 'Bristol Rvs', elvidge: 'Bristol Rovers' }
  },
  team_bromley: {
    canonicalId: 'team_bromley',
    canonicalName: 'Bromley FC',
    shortName: 'Bromley',
    tla: 'BRO',
    competitionCode: 'E3',
    crestUrl: '',
    venueName: 'Hayes Lane',
    aliases: ['bromley', 'bromley fc', 'the ravens', 'team_bromley'],
    providerIds: { footballDataCoUk: 'Bromley', elvidge: 'Bromley' }
  },
  team_burton: {
    canonicalId: 'team_burton',
    canonicalName: 'Burton Albion FC',
    shortName: 'Burton',
    tla: 'BUR',
    competitionCode: 'E2',
    crestUrl: 'https://crests.football-data.org/1082.png',
    venueName: 'Pirelli Stadium',
    aliases: ['burton', 'burton albion', 'burton albion fc', 'the brewers', 'team_burton'],
    providerIds: { footballDataCoUk: 'Burton', elvidge: 'Burton Albion' }
  },
  team_cambridge: {
    canonicalId: 'team_cambridge',
    canonicalName: 'Cambridge United FC',
    shortName: 'Cambridge',
    tla: 'CAM',
    competitionCode: 'E2',
    crestUrl: 'https://crests.football-data.org/1084.png',
    venueName: 'Abbey Stadium',
    aliases: ['cambridge', 'cambridge united', 'cambridge utd', "the u's", 'team_cambridge'],
    providerIds: { footballDataCoUk: 'Cambridge', elvidge: 'Cambridge United' }
  },
  team_carlisle: {
    canonicalId: 'team_carlisle',
    canonicalName: 'Carlisle United FC',
    shortName: 'Carlisle',
    tla: 'CRL',
    competitionCode: 'E3',
    crestUrl: 'https://crests.football-data.org/1086.png',
    venueName: 'Brunton Park',
    aliases: ['carlisle', 'carlisle united', 'carlisle utd', 'the cumbrians', 'team_carlisle'],
    providerIds: { footballDataCoUk: 'Carlisle', elvidge: 'Carlisle United' }
  },
  team_charlton: {
    canonicalId: 'team_charlton',
    canonicalName: 'Charlton Athletic FC',
    shortName: 'Charlton',
    tla: 'CHA',
    competitionCode: 'E2',
    crestUrl: 'https://crests.football-data.org/348.png',
    venueName: 'The Valley',
    aliases: ['charlton', 'charlton athletic', 'charlton athletic fc', 'the addicks', 'team_charlton'],
    providerIds: { footballDataCoUk: 'Charlton', elvidge: 'Charlton Athletic' }
  },
  team_cheltenham: {
    canonicalId: 'team_cheltenham',
    canonicalName: 'Cheltenham Town FC',
    shortName: 'Cheltenham',
    tla: 'CHL',
    competitionCode: 'E3',
    crestUrl: 'https://crests.football-data.org/1087.png',
    venueName: 'Whaddon Road',
    aliases: ['cheltenham', 'cheltenham town', 'cheltenham town fc', 'the robins', 'team_cheltenham'],
    providerIds: { footballDataCoUk: 'Cheltenham', elvidge: 'Cheltenham Town' }
  },
  team_chesterfield: {
    canonicalId: 'team_chesterfield',
    canonicalName: 'Chesterfield FC',
    shortName: 'Chesterfield',
    tla: 'CHF',
    competitionCode: 'E3',
    crestUrl: '',
    venueName: 'SMH Group Stadium',
    aliases: ['chesterfield', 'chesterfield fc', 'the spireites', 'team_chesterfield'],
    providerIds: { footballDataCoUk: 'Chesterfield', elvidge: 'Chesterfield' }
  },
  team_colchester: {
    canonicalId: 'team_colchester',
    canonicalName: 'Colchester United FC',
    shortName: 'Colchester',
    tla: 'COL',
    competitionCode: 'E3',
    crestUrl: 'https://crests.football-data.org/1088.png',
    venueName: 'Colchester Community Stadium',
    aliases: ['colchester', 'colchester united', "the u's", 'team_colchester'],
    providerIds: { footballDataCoUk: 'Colchester', elvidge: 'Colchester United' }
  },
  team_crawley: {
    canonicalId: 'team_crawley',
    canonicalName: 'Crawley Town FC',
    shortName: 'Crawley Town',
    tla: 'CRA',
    competitionCode: 'E2',
    crestUrl: 'https://crests.football-data.org/1089.png',
    venueName: 'Broadfield Stadium',
    aliases: ['crawley', 'crawley town', 'crawley town fc', 'team_crawley'],
    providerIds: { footballDataCoUk: 'Crawley Town', elvidge: 'Crawley Town' }
  },
  team_crewe: {
    canonicalId: 'team_crewe',
    canonicalName: 'Crewe Alexandra FC',
    shortName: 'Crewe',
    tla: 'CRE',
    competitionCode: 'E3',
    crestUrl: 'https://crests.football-data.org/1090.png',
    venueName: 'Gresty Road',
    aliases: ['crewe', 'crewe alexandra', 'crewe alexandra fc', 'the railwaymen', 'team_crewe'],
    providerIds: { footballDataCoUk: 'Crewe', elvidge: 'Crewe Alexandra' }
  },
  team_doncaster: {
    canonicalId: 'team_doncaster',
    canonicalName: 'Doncaster Rovers FC',
    shortName: 'Doncaster',
    tla: 'DON',
    competitionCode: 'E3',
    crestUrl: 'https://crests.football-data.org/1091.png',
    venueName: 'Eco-Power Stadium',
    aliases: ['doncaster', 'doncaster rovers', 'doncaster rovers fc', 'donny', 'team_doncaster'],
    providerIds: { footballDataCoUk: 'Doncaster', elvidge: 'Doncaster Rovers' }
  },
  team_exeter: {
    canonicalId: 'team_exeter',
    canonicalName: 'Exeter City FC',
    shortName: 'Exeter',
    tla: 'EXE',
    competitionCode: 'E2',
    crestUrl: 'https://crests.football-data.org/1092.png',
    venueName: 'St James Park',
    aliases: ['exeter', 'exeter city', 'exeter city fc', 'the grecians', 'team_exeter'],
    providerIds: { footballDataCoUk: 'Exeter', elvidge: 'Exeter City' }
  },
  team_fleetwood: {
    canonicalId: 'team_fleetwood',
    canonicalName: 'Fleetwood Town FC',
    shortName: 'Fleetwood Town',
    tla: 'FLE',
    competitionCode: 'E3',
    crestUrl: 'https://crests.football-data.org/1093.png',
    venueName: 'Highbury Stadium',
    aliases: ['fleetwood', 'fleetwood town', 'fleetwood town fc', 'the cod army', 'team_fleetwood'],
    providerIds: { footballDataCoUk: 'Fleetwood Town', elvidge: 'Fleetwood Town' }
  },
  team_forest_green: {
    canonicalId: 'team_forest_green',
    canonicalName: 'Forest Green Rovers FC',
    shortName: 'Forest Green',
    tla: 'FGR',
    competitionCode: 'E3',
    crestUrl: '',
    venueName: 'The New Lawn',
    aliases: ['forest green', 'forest green rovers', 'fgr', 'team_forest_green'],
    providerIds: { footballDataCoUk: 'Forest Green', elvidge: 'Forest Green Rovers' }
  },
  team_gillingham: {
    canonicalId: 'team_gillingham',
    canonicalName: 'Gillingham FC',
    shortName: 'Gillingham',
    tla: 'GIL',
    competitionCode: 'E3',
    crestUrl: 'https://crests.football-data.org/1094.png',
    venueName: 'Priestfield Stadium',
    aliases: ['gillingham', 'gillingham fc', 'the gills', 'team_gillingham'],
    providerIds: { footballDataCoUk: 'Gillingham', elvidge: 'Gillingham' }
  },
  team_grimsby: {
    canonicalId: 'team_grimsby',
    canonicalName: 'Grimsby Town FC',
    shortName: 'Grimsby',
    tla: 'GRI',
    competitionCode: 'E3',
    crestUrl: 'https://crests.football-data.org/1095.png',
    venueName: 'Blundell Park',
    aliases: ['grimsby', 'grimsby town', 'grimsby town fc', 'the mariners', 'team_grimsby'],
    providerIds: { footballDataCoUk: 'Grimsby', elvidge: 'Grimsby Town' }
  },
  team_harrogate: {
    canonicalId: 'team_harrogate',
    canonicalName: 'Harrogate Town AFC',
    shortName: 'Harrogate',
    tla: 'HAR',
    competitionCode: 'E3',
    crestUrl: '',
    venueName: 'Wetherby Road',
    aliases: ['harrogate', 'harrogate town', 'harrogate town afc', 'team_harrogate'],
    providerIds: { footballDataCoUk: 'Harrogate', elvidge: 'Harrogate Town' }
  },
  team_huddersfield: {
    canonicalId: 'team_huddersfield',
    canonicalName: 'Huddersfield Town FC',
    shortName: 'Huddersfield',
    tla: 'HUD',
    competitionCode: 'E2',
    crestUrl: 'https://crests.football-data.org/394.png',
    venueName: "John Smith's Stadium",
    aliases: ['huddersfield', 'huddersfield town', 'the terriers', 'team_huddersfield'],
    providerIds: { footballDataCoUk: 'Huddersfield', elvidge: 'Huddersfield Town' }
  },
  team_leyton_orient: {
    canonicalId: 'team_leyton_orient',
    canonicalName: 'Leyton Orient FC',
    shortName: 'Leyton Orient',
    tla: 'LEY',
    competitionCode: 'E2',
    crestUrl: 'https://crests.football-data.org/1096.png',
    venueName: 'Brisbane Road',
    aliases: ['leyton orient', 'leyton orient fc', "the o's", 'team_leyton_orient'],
    providerIds: { footballDataCoUk: 'Leyton Orient', elvidge: 'Leyton Orient' }
  },
  team_mansfield: {
    canonicalId: 'team_mansfield',
    canonicalName: 'Mansfield Town FC',
    shortName: 'Mansfield',
    tla: 'MAN',
    competitionCode: 'E2',
    crestUrl: 'https://crests.football-data.org/1097.png',
    venueName: 'Field Mill',
    aliases: ['mansfield', 'mansfield town', 'mansfield town fc', 'the stags', 'team_mansfield'],
    providerIds: { footballDataCoUk: 'Mansfield', elvidge: 'Mansfield Town' }
  },
  team_mk_dons: {
    canonicalId: 'team_mk_dons',
    canonicalName: 'Milton Keynes Dons FC',
    shortName: 'MK Dons',
    tla: 'MKD',
    competitionCode: 'E3',
    crestUrl: 'https://crests.football-data.org/1098.png',
    venueName: 'Stadium MK',
    aliases: ['mk dons', 'milton keynes dons', 'milton keynes dons fc', 'team_mk_dons'],
    providerIds: { footballDataCoUk: 'Milton Keynes Dons', elvidge: 'Milton Keynes Dons' }
  },
  team_morecambe: {
    canonicalId: 'team_morecambe',
    canonicalName: 'Morecambe FC',
    shortName: 'Morecambe',
    tla: 'MOR',
    competitionCode: 'E3',
    crestUrl: 'https://crests.football-data.org/1099.png',
    venueName: 'Mazuma Mobile Stadium',
    aliases: ['morecambe', 'morecambe fc', 'the shrimps', 'team_morecambe'],
    providerIds: { footballDataCoUk: 'Morecambe', elvidge: 'Morecambe' }
  },
  team_newport: {
    canonicalId: 'team_newport',
    canonicalName: 'Newport County AFC',
    shortName: 'Newport County',
    tla: 'NEW',
    competitionCode: 'E3',
    crestUrl: 'https://crests.football-data.org/1100.png',
    venueName: 'Rodney Parade',
    aliases: ['newport county', 'newport', 'the exiles', 'team_newport'],
    providerIds: { footballDataCoUk: 'Newport County', elvidge: 'Newport County' }
  },
  team_northampton: {
    canonicalId: 'team_northampton',
    canonicalName: 'Northampton Town FC',
    shortName: 'Northampton',
    tla: 'NOR',
    competitionCode: 'E2',
    crestUrl: 'https://crests.football-data.org/1101.png',
    venueName: 'Sixfields Stadium',
    aliases: ['northampton', 'northampton town', 'the cobblers', 'team_northampton'],
    providerIds: { footballDataCoUk: 'Northampton', elvidge: 'Northampton Town' }
  },
  team_notts_county: {
    canonicalId: 'team_notts_county',
    canonicalName: 'Notts County FC',
    shortName: 'Notts County',
    tla: 'NTC',
    competitionCode: 'E3',
    crestUrl: 'https://crests.football-data.org/1102.png',
    venueName: 'Meadow Lane',
    aliases: ['notts county', 'notts county fc', 'the maggies', 'team_notts_county'],
    providerIds: { footballDataCoUk: 'Notts County', elvidge: 'Notts County' }
  },
  team_oldham: {
    canonicalId: 'team_oldham',
    canonicalName: 'Oldham Athletic AFC',
    shortName: 'Oldham',
    tla: 'OLD',
    competitionCode: 'E3',
    crestUrl: '',
    venueName: 'Boundary Park',
    aliases: ['oldham', 'oldham athletic', 'the latics', 'team_oldham'],
    providerIds: { footballDataCoUk: 'Oldham', elvidge: 'Oldham Athletic' }
  },
  team_peterborough: {
    canonicalId: 'team_peterborough',
    canonicalName: 'Peterborough United FC',
    shortName: 'Peterborough',
    tla: 'PET',
    competitionCode: 'E2',
    crestUrl: 'https://crests.football-data.org/1103.png',
    venueName: 'London Road',
    aliases: ['peterboro', 'peterborough', 'peterborough united', 'the posh', 'team_peterborough'],
    providerIds: { footballDataCoUk: 'Peterboro', elvidge: 'Peterborough United' }
  },
  team_port_vale: {
    canonicalId: 'team_port_vale',
    canonicalName: 'Port Vale FC',
    shortName: 'Port Vale',
    tla: 'PVL',
    competitionCode: 'E3',
    crestUrl: 'https://crests.football-data.org/1104.png',
    venueName: 'Vale Park',
    aliases: ['port vale', 'port vale fc', 'the valiants', 'team_port_vale'],
    providerIds: { footballDataCoUk: 'Port Vale', elvidge: 'Port Vale' }
  },
  team_reading: {
    canonicalId: 'team_reading',
    canonicalName: 'Reading FC',
    shortName: 'Reading',
    tla: 'REA',
    competitionCode: 'E2',
    crestUrl: 'https://crests.football-data.org/355.png',
    venueName: 'Madejski Stadium',
    aliases: ['reading', 'reading fc', 'the royals', 'team_reading'],
    providerIds: { footballDataCoUk: 'Reading', elvidge: 'Reading' }
  },
  team_rochdale: {
    canonicalId: 'team_rochdale',
    canonicalName: 'Rochdale AFC',
    shortName: 'Rochdale',
    tla: 'ROC',
    competitionCode: 'E3',
    crestUrl: '',
    venueName: 'Spotland Stadium',
    aliases: ['rochdale', 'rochdale afc', 'dale', 'team_rochdale'],
    providerIds: { footballDataCoUk: 'Rochdale', elvidge: 'Rochdale' }
  },
  team_rotherham: {
    canonicalId: 'team_rotherham',
    canonicalName: 'Rotherham United FC',
    shortName: 'Rotherham',
    tla: 'ROT',
    competitionCode: 'E2',
    crestUrl: 'https://crests.football-data.org/1105.png',
    venueName: 'New York Stadium',
    aliases: ['rotherham', 'rotherham united', 'the millers', 'team_rotherham'],
    providerIds: { footballDataCoUk: 'Rotherham', elvidge: 'Rotherham United' }
  },
  team_salford: {
    canonicalId: 'team_salford',
    canonicalName: 'Salford City FC',
    shortName: 'Salford',
    tla: 'SAL',
    competitionCode: 'E3',
    crestUrl: '',
    venueName: 'Moor Lane',
    aliases: ['salford', 'salford city', 'salford city fc', 'the ammies', 'team_salford'],
    providerIds: { footballDataCoUk: 'Salford', elvidge: 'Salford City' }
  },
  team_shrewsbury: {
    canonicalId: 'team_shrewsbury',
    canonicalName: 'Shrewsbury Town FC',
    shortName: 'Shrewsbury',
    tla: 'SHR',
    competitionCode: 'E2',
    crestUrl: 'https://crests.football-data.org/1106.png',
    venueName: 'New Meadow',
    aliases: ['shrewsbury', 'shrewsbury town', 'salop', 'team_shrewsbury'],
    providerIds: { footballDataCoUk: 'Shrewsbury', elvidge: 'Shrewsbury Town' }
  },
  team_stevenage: {
    canonicalId: 'team_stevenage',
    canonicalName: 'Stevenage FC',
    shortName: 'Stevenage',
    tla: 'STE',
    competitionCode: 'E2',
    crestUrl: 'https://crests.football-data.org/1107.png',
    venueName: 'Broadhall Way',
    aliases: ['stevenage', 'stevenage fc', 'the boro', 'team_stevenage'],
    providerIds: { footballDataCoUk: 'Stevenage', elvidge: 'Stevenage' }
  },
  team_stockport: {
    canonicalId: 'team_stockport',
    canonicalName: 'Stockport County FC',
    shortName: 'Stockport',
    tla: 'STK',
    competitionCode: 'E2',
    crestUrl: 'https://crests.football-data.org/1108.png',
    venueName: 'Edgeley Park',
    aliases: ['stockport', 'stockport county', 'the hatters', 'team_stockport'],
    providerIds: { footballDataCoUk: 'Stockport', elvidge: 'Stockport County' }
  },
  team_sutton: {
    canonicalId: 'team_sutton',
    canonicalName: 'Sutton United FC',
    shortName: 'Sutton',
    tla: 'SUT',
    competitionCode: 'E3',
    crestUrl: '',
    venueName: 'Gander Green Lane',
    aliases: ['sutton', 'sutton united', 'the us', 'team_sutton'],
    providerIds: { footballDataCoUk: 'Sutton', elvidge: 'Sutton United' }
  },
  team_swindon: {
    canonicalId: 'team_swindon',
    canonicalName: 'Swindon Town FC',
    shortName: 'Swindon',
    tla: 'SWI',
    competitionCode: 'E3',
    crestUrl: 'https://crests.football-data.org/1109.png',
    venueName: 'County Ground',
    aliases: ['swindon', 'swindon town', 'the robins', 'team_swindon'],
    providerIds: { footballDataCoUk: 'Swindon', elvidge: 'Swindon Town' }
  },
  team_tranmere: {
    canonicalId: 'team_tranmere',
    canonicalName: 'Tranmere Rovers FC',
    shortName: 'Tranmere',
    tla: 'TRA',
    competitionCode: 'E3',
    crestUrl: 'https://crests.football-data.org/1110.png',
    venueName: 'Prenton Park',
    aliases: ['tranmere', 'tranmere rovers', 'the super white army', 'team_tranmere'],
    providerIds: { footballDataCoUk: 'Tranmere', elvidge: 'Tranmere Rovers' }
  },
  team_walsall: {
    canonicalId: 'team_walsall',
    canonicalName: 'Walsall FC',
    shortName: 'Walsall',
    tla: 'WAL',
    competitionCode: 'E3',
    crestUrl: 'https://crests.football-data.org/1111.png',
    venueName: 'Bescot Stadium',
    aliases: ['walsall', 'walsall fc', 'the saddlers', 'team_walsall'],
    providerIds: { footballDataCoUk: 'Walsall', elvidge: 'Walsall' }
  },
  team_wigan: {
    canonicalId: 'team_wigan',
    canonicalName: 'Wigan Athletic FC',
    shortName: 'Wigan',
    tla: 'WIG',
    competitionCode: 'E2',
    crestUrl: 'https://crests.football-data.org/335.png',
    venueName: 'DW Stadium',
    aliases: ['wigan', 'wigan athletic', 'the latics', 'team_wigan'],
    providerIds: { footballDataCoUk: 'Wigan', elvidge: 'Wigan Athletic' }
  },
  team_wrexham: {
    canonicalId: 'team_wrexham',
    canonicalName: 'Wrexham AFC',
    shortName: 'Wrexham',
    tla: 'WXM',
    competitionCode: 'E2',
    crestUrl: 'https://crests.football-data.org/1085.png',
    venueName: 'Racecourse Ground',
    aliases: ['wrexham', 'wrexham afc', 'the red dragons', 'team_wrexham'],
    providerIds: { footballDataCoUk: 'Wrexham', elvidge: 'Wrexham' }
  },
  team_wycombe: {
    canonicalId: 'team_wycombe',
    canonicalName: 'Wycombe Wanderers FC',
    shortName: 'Wycombe',
    tla: 'WYC',
    competitionCode: 'E2',
    crestUrl: 'https://crests.football-data.org/1112.png',
    venueName: 'Adams Park',
    aliases: ['wycombe', 'wycombe wanderers', 'the chairboys', 'team_wycombe'],
    providerIds: { footballDataCoUk: 'Wycombe', elvidge: 'Wycombe Wanderers' }
  },
  team_york: {
    canonicalId: 'team_york',
    canonicalName: 'York City FC',
    shortName: 'York',
    tla: 'YOR',
    competitionCode: 'E3',
    crestUrl: '',
    venueName: 'York Community Stadium',
    aliases: ['york', 'york city', 'the minstermen', 'team_york'],
    providerIds: { footballDataCoUk: 'York', elvidge: 'York City' }
  },


  // ==========================================
  // BUNDESLIGA (BL1)
  // ==========================================
  team_bayern: {
    canonicalId: 'team_bayern',
    canonicalName: 'FC Bayern München',
    shortName: 'Bayern',
    tla: 'FCB',
    competitionCode: 'BL1',
    crestUrl: 'https://crests.football-data.org/5.png',
    venueName: 'Allianz Arena',
    aliases: ['fc bayern munchen', 'fc bayern münchen', 'bayern munich', 'bayern munchen', 'bayern', 'fcb'],
    providerIds: { footballDataCoUk: 'Bayern Munich', footballDataOrg: '5', espn: '132', theSportsDb: '133739' }
  },
  team_leverkusen: {
    canonicalId: 'team_leverkusen',
    canonicalName: 'Bayer 04 Leverkusen',
    shortName: 'Leverkusen',
    tla: 'B04',
    competitionCode: 'BL1',
    crestUrl: 'https://crests.football-data.org/3.png',
    venueName: 'BayArena',
    aliases: ['bayer 04 leverkusen', 'bayer leverkusen', 'leverkusen', 'b04'],
    providerIds: { footballDataCoUk: 'Leverkusen', footballDataOrg: '3', espn: '131', theSportsDb: '133742' }
  },
  team_dortmund: {
    canonicalId: 'team_dortmund',
    canonicalName: 'Borussia Dortmund',
    shortName: 'Dortmund',
    tla: 'BVB',
    competitionCode: 'BL1',
    crestUrl: 'https://crests.football-data.org/4.png',
    venueName: 'Signal Iduna Park',
    aliases: ['borussia dortmund', 'dortmund', 'bvb'],
    providerIds: { footballDataCoUk: 'Dortmund', footballDataOrg: '4', espn: '124', theSportsDb: '133743' }
  },
  team_leipzig: {
    canonicalId: 'team_leipzig',
    canonicalName: 'RB Leipzig',
    shortName: 'RB Leipzig',
    tla: 'RBL',
    competitionCode: 'BL1',
    crestUrl: 'https://crests.football-data.org/721.png',
    venueName: 'Red Bull Arena',
    aliases: ['rb leipzig', 'leipzig', 'rbl'],
    providerIds: { footballDataCoUk: 'RB Leipzig', footballDataOrg: '721', espn: '11420', theSportsDb: '133744' }
  },
  team_frankfurt: {
    canonicalId: 'team_frankfurt',
    canonicalName: 'Eintracht Frankfurt',
    shortName: 'Frankfurt',
    tla: 'SGE',
    competitionCode: 'BL1',
    crestUrl: 'https://crests.football-data.org/19.png',
    venueName: 'Deutsche Bank Park',
    aliases: ['eintracht frankfurt', 'frankfurt', 'sge'],
    providerIds: { footballDataCoUk: 'Ein Frankfurt', footballDataOrg: '19', espn: '125', theSportsDb: '133745' }
  },
  team_stuttgart: {
    canonicalId: 'team_stuttgart',
    canonicalName: 'VfB Stuttgart',
    shortName: 'Stuttgart',
    tla: 'VFB',
    competitionCode: 'BL1',
    crestUrl: 'https://crests.football-data.org/10.png',
    venueName: 'MHPArena',
    aliases: ['vfb stuttgart', 'stuttgart', 'vfb'],
    providerIds: { footballDataCoUk: 'Stuttgart', footballDataOrg: '10', espn: '134', theSportsDb: '133746' }
  },

  // ==========================================
  // LA LIGA (PD)
  // ==========================================
  team_real_madrid: {
    canonicalId: 'team_real_madrid',
    canonicalName: 'Real Madrid CF',
    shortName: 'Real Madrid',
    tla: 'RMA',
    competitionCode: 'PD',
    crestUrl: 'https://crests.football-data.org/86.png',
    venueName: 'Santiago Bernabéu',
    aliases: ['real madrid', 'real madrid cf', 'los blancos', 'rma'],
    providerIds: { footballDataCoUk: 'Real Madrid', footballDataOrg: '86', espn: '86', theSportsDb: '133738' }
  },
  team_barcelona: {
    canonicalId: 'team_barcelona',
    canonicalName: 'FC Barcelona',
    shortName: 'Barcelona',
    tla: 'FCB',
    competitionCode: 'PD',
    crestUrl: 'https://crests.football-data.org/81.png',
    venueName: 'Spotify Camp Nou',
    aliases: ['barcelona', 'fc barcelona', 'barca', 'barça'],
    providerIds: { footballDataCoUk: 'Barcelona', footballDataOrg: '81', espn: '83', theSportsDb: '133739' }
  },
  team_atletico: {
    canonicalId: 'team_atletico',
    canonicalName: 'Club Atlético de Madrid',
    shortName: 'Atlético',
    tla: 'ATM',
    competitionCode: 'PD',
    crestUrl: 'https://crests.football-data.org/78.png',
    venueName: 'Cívitas Metropolitano',
    aliases: ['atletico madrid', 'atlético madrid', 'atletico de madrid', 'atlético de madrid', 'atletico', 'atlético', 'atm'],
    providerIds: { footballDataCoUk: 'Ath Madrid', footballDataOrg: '78', espn: '1068', theSportsDb: '133740' }
  },

  // ==========================================
  // SERIE A (SA)
  // ==========================================
  team_inter: {
    canonicalId: 'team_inter',
    canonicalName: 'FC Internazionale Milano',
    shortName: 'Inter',
    tla: 'INT',
    competitionCode: 'SA',
    crestUrl: 'https://crests.football-data.org/108.png',
    venueName: 'San Siro',
    aliases: ['inter', 'inter milan', 'internazionale', 'fc internazionale', 'inter milano'],
    providerIds: { footballDataCoUk: 'Inter', footballDataOrg: '108', espn: '110', theSportsDb: '133681' }
  },
  team_milan: {
    canonicalId: 'team_milan',
    canonicalName: 'AC Milan',
    shortName: 'Milan',
    tla: 'MIL',
    competitionCode: 'SA',
    crestUrl: 'https://crests.football-data.org/98.png',
    venueName: 'San Siro',
    aliases: ['ac milan', 'milan', 'rossoneri'],
    providerIds: { footballDataCoUk: 'Milan', footballDataOrg: '98', espn: '103', theSportsDb: '133682' }
  },
  team_juventus: {
    canonicalId: 'team_juventus',
    canonicalName: 'Juventus FC',
    shortName: 'Juventus',
    tla: 'JUV',
    competitionCode: 'SA',
    crestUrl: 'https://crests.football-data.org/109.png',
    venueName: 'Allianz Stadium',
    aliases: ['juventus', 'juventus fc', 'juve', 'bianconeri'],
    providerIds: { footballDataCoUk: 'Juventus', footballDataOrg: '109', espn: '111', theSportsDb: '133683' }
  },
  team_napoli: {
    canonicalId: 'team_napoli',
    canonicalName: 'SSC Napoli',
    shortName: 'Napoli',
    tla: 'NAP',
    competitionCode: 'SA',
    crestUrl: 'https://crests.football-data.org/113.png',
    venueName: 'Stadio Diego Armando Maradona',
    aliases: ['napoli', 'ssc napoli', 'partenopei'],
    providerIds: { footballDataCoUk: 'Napoli', footballDataOrg: '113', espn: '114', theSportsDb: '133684' }
  },

  // ==========================================
  // LIGUE 1 (FL1)
  // ==========================================
  team_psg: {
    canonicalId: 'team_psg',
    canonicalName: 'Paris Saint-Germain FC',
    shortName: 'PSG',
    tla: 'PSG',
    competitionCode: 'FL1',
    crestUrl: 'https://crests.football-data.org/524.png',
    venueName: 'Parc des Princes',
    aliases: ['psg', 'paris saint-germain', 'paris sg', 'paris saint germain'],
    providerIds: { footballDataCoUk: 'Paris SG', footballDataOrg: '524', espn: '160', theSportsDb: '133702' }
  },
  team_monaco: {
    canonicalId: 'team_monaco',
    canonicalName: 'AS Monaco FC',
    shortName: 'Monaco',
    tla: 'ASM',
    competitionCode: 'FL1',
    crestUrl: 'https://crests.football-data.org/548.png',
    venueName: 'Stade Louis II',
    aliases: ['monaco', 'as monaco', 'as monaco fc'],
    providerIds: { footballDataCoUk: 'Monaco', footballDataOrg: '548', espn: '174', theSportsDb: '133703' }
  },
};

import manualOverrides from './teamNameOverrides.json';

// Normalize team lookup string
export function normalizeLookupKey(name: string): string {
  if (!name || typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(fc|afc|cf|sc|ssc|vfb|tsg|ac|as|rb|cd)\b/gi, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}


// Registry lookup with alias & strict normalization
const UNMATCHED_NAMES_LOG = new Set<string>();

export function lookupCanonicalTeam(rawNameOrId: string | any): CanonicalTeam | null {
  if (!rawNameOrId) return null;
  const input = typeof rawNameOrId === 'string' ? rawNameOrId.trim() : (rawNameOrId.name || rawNameOrId.shortName || rawNameOrId.id || '').toString().trim();
  if (!input) return null;

  // 1. Direct manual override (exact and lowercase trimmed)
  const manualMap = manualOverrides as Record<string, string>;
  if (manualMap[input] && CANONICAL_TEAMS[manualMap[input]]) {
    return CANONICAL_TEAMS[manualMap[input]];
  }
  for (const [k, v] of Object.entries(manualMap)) {
    if (k.toLowerCase() === input.toLowerCase() && CANONICAL_TEAMS[v]) {
      return CANONICAL_TEAMS[v];
    }
  }

  // 2. Direct ID match
  if (CANONICAL_TEAMS[input]) return CANONICAL_TEAMS[input];

  // 3. Normalized input check
  const norm = normalizeLookupKey(input);

  // If input is formatted like 'team_man_united' or 'team_manunited'
  if (input.startsWith('team_')) {
    const stripped = input.replace(/^team_/, '').replace(/_/g, ' ');
    const strippedNorm = normalizeLookupKey(stripped);
    for (const team of Object.values(CANONICAL_TEAMS)) {
      if (team.canonicalId === input) return team;
      if (normalizeLookupKey(team.canonicalName) === strippedNorm) return team;
      for (const a of team.aliases) {
        if (a.toLowerCase() === input.toLowerCase() || normalizeLookupKey(a) === strippedNorm) {
          return team;
        }
      }
    }
  }

  // 4. Exact alias match across all registered clubs
  for (const team of Object.values(CANONICAL_TEAMS)) {
    if (team.canonicalId.toLowerCase() === input.toLowerCase()) {
      return team;
    }
    if (team.canonicalName.toLowerCase() === input.toLowerCase() || normalizeLookupKey(team.canonicalName) === norm) {
      return team;
    }
    if (team.shortName.toLowerCase() === input.toLowerCase() || normalizeLookupKey(team.shortName) === norm) {
      return team;
    }
    for (const a of team.aliases) {
      if (a.toLowerCase() === input.toLowerCase() || normalizeLookupKey(a) === norm) {
        return team;
      }
    }
    for (const provId of Object.values(team.providerIds)) {
      if (provId && (provId.toLowerCase() === input.toLowerCase() || normalizeLookupKey(provId) === norm)) {
        return team;
      }
    }
  }

  // 5. Strict word boundary / token match (only if unique)
  let foundMatch: CanonicalTeam | null = null;
  let matchesCount = 0;
  for (const team of Object.values(CANONICAL_TEAMS)) {
    const teamNorm = normalizeLookupKey(team.canonicalName);
    const shortNorm = normalizeLookupKey(team.shortName);
    if (norm === teamNorm || norm === shortNorm) {
      foundMatch = team;
      matchesCount++;
    }
  }
  if (matchesCount === 1 && foundMatch) {
    return foundMatch;
  }

  // Log unmatched name (never guess randomly)
  UNMATCHED_NAMES_LOG.add(input);
  return null;
}

export function getUnmatchedNames(): string[] {
  return Array.from(UNMATCHED_NAMES_LOG).sort();
}

export function clearUnmatchedNames(): void {
  UNMATCHED_NAMES_LOG.clear();
}
