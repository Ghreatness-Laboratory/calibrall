/**
 * MATCHMIND / CALIBRALL Display Text Formatter
 *
 * GLOBAL TEXT RULE: No hyphens (-) and no underscores (_) anywhere the user can see or read.
 * This formatter processes all user-facing strings, labels, badges, tables, and copy.
 */

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Convert a snake_case or SCREAMING_SNAKE_CASE string into clean Sentence case or Title case
 */
export function formatSnakeCase(text: string): string {
  if (!text) return '';
  const parts = text.split('_').filter(Boolean);
  if (parts.length === 0) return '';
  
  // Specific mappings for common codes
  const upper = text.toUpperCase();
  if (upper === '1X2_HOME') return '1X2 Home';
  if (upper === '1X2_DRAW') return '1X2 Draw';
  if (upper === '1X2_AWAY') return '1X2 Away';
  if (upper === 'DC_1X') return 'DC 1X';
  if (upper === 'DC_12') return 'DC 12';
  if (upper === 'DC_X2') return 'DC X2';
  if (upper === 'BTTS_YES') return 'BTTS Yes';
  if (upper === 'BTTS_NO') return 'BTTS No';
  if (upper === 'TOTAL_GOALS_O25') return 'Total goals Over 2.5';
  if (upper === 'TOTAL_GOALS_U25') return 'Total goals Under 2.5';
  if (upper === 'TOTAL_GOALS_O20_PUSH') return 'Total goals Over 2.0 push';
  if (upper === 'TOTAL_CORNERS_O95') return 'Total corners Over 9.5';
  if (upper === 'TEAM_CORNERS_HOME_O45') return 'Home corners Over 4.5';
  if (upper === 'CARDS_O45') return 'Cards Over 4.5';
  if (upper === 'HSH_2ND') return 'Highest scoring half 2nd half';
  if (upper === 'FH_GOALS_O05') return '1st half goals Over 0.5';
  if (upper === '2H_RESULT_HOME') return '2nd half result Home';
  if (upper === 'BASKETBALL_MONEYLINE') return 'Basketball Moneyline';
  if (upper === 'BASKETBALL_SPREAD') return 'Basketball Spread';
  if (upper === 'BASKETBALL_TOTAL_POINTS') return 'Basketball Total points';

  // General sentence case: first word capitalized, subsequent words lowercased
  return parts.map((part, index) => {
    // Preserve known acronyms like NBA, EV, ROI, CLV, DC, BTTS, xG
    if (/^(NBA|EV|ROI|CLV|DC|BTTS|XG|1X2|PPDA|API|ECE|BSS)$/i.test(part)) {
      return part.toUpperCase();
    }
    const lower = part.toLowerCase();
    if (index === 0) {
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    }
    return lower;
  }).join(' ');
}

/**
 * Primary display text formatter running all rules strictly in sequence:
 * 1. Underscores -> single space + sentence/title case
 * 2. Hyphen between words -> space / naturally merged words
 * 3. Hyphen between numbers in range -> "to"
 * 4. Hyphen as minus sign -> true unicode minus (\u2212)
 * 5. Hyphen as empty/missing placeholder -> "N/A" or "None"
 * 6. ISO dates -> "22 Oct 2024", times -> 24h format with colon
 * 7. Never use en-dash or em-dash lookalikes
 */
export function cleanDisplayText(input: unknown): string {
  if (input === null || input === undefined) return '';
  let text = String(input);
  if (!text) return '';

  const trimmed = text.trim();
  // Rule 2e: Empty / missing placeholder
  if (trimmed === '-' || trimmed === '--' || trimmed === '---' || trimmed === '–' || trimmed === '—') {
    return 'N/A';
  }

  // Rule 2g: Replace look-alike em-dash (—) and en-dash (–)
  // When used between numbers, replace with "to"
  text = text.replace(/(\d+(?:\.\d+)?%?)\s*[–—]\s*(\d+(?:\.\d+)?%?)/g, '$1 to $2');
  // When used as parenthetical or clause separator, replace with middle dot
  text = text.replace(/\s*[—–]\s*/g, ' · ');
  text = text.replace(/[—–]/g, ' ');

  // Rule 3: Fix repeated phrase
  text = text.replace(/Out[- ]of[- ]sample sample/gi, 'Out of sample');

  // Rule 2f: ISO dates such as 2024-10-22 become readable dates such as "22 Oct 2024"
  text = text.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_match, y, m, d) => {
    const monthIndex = parseInt(m, 10) - 1;
    const monthName = MONTHS_SHORT[monthIndex] || m;
    const day = parseInt(d, 10);
    return `${day} ${monthName} ${y}`;
  });

  // Rule 2c: Seasons written like 2024-25 or 2024-2025 -> "2024 to 2025 season" or "2024 to 2025"
  text = text.replace(/\b(\d{4})-(2\d)\b(?:\s+season)?/gi, '$1 to 20$2 season');
  text = text.replace(/\b(\d{4})-(\d{4})\b(?:\s+season)?/gi, '$1 to $2 season');

  // Rule 2c: Range between two numbers becomes "to"
  // e.g. "0.10 - 0.20", "0.10-0.20", "12-18%", "10-20"
  text = text.replace(/(\d+(?:\.\d+)?%?)\s*-\s*(\d+(?:\.\d+)?%?)/g, '$1 to $2');

  // Number range without spaces if both sides are numbers, e.g. 0.10-0.20
  text = text.replace(/(\b\d+\.?\d*)-(\d+\.?\d*\b)/g, '$1 to $2');

  // Rule 2d: Hyphen used as a minus sign on a number becomes true minus (\u2212)
  // e.g. "-0.8%", "-3.1%", "-12.1", "[-0.05"
  text = text.replace(/(^|[\s(\[:])-(?=\d)/g, '$1\u2212');

  // Rule 2b: Specific phrase replacements (Dixon-Coles, Walk-forward, etc.)
  const phraseMap: Record<string, string> = {
    'Dixon-Coles': 'Dixon Coles',
    'dixon-coles': 'dixon coles',
    'Walk-forward': 'Walk forward',
    'walk-forward': 'walk forward',
    'Out-of-sample': 'Out of sample',
    'out-of-sample': 'out of sample',
    'Multi-market': 'Multi market',
    'multi-market': 'multi market',
    'Full-market': 'Full market',
    'full-market': 'full market',
    'Pre-match': 'Pre match',
    'pre-match': 'pre match',
    'Post-match': 'Post match',
    'post-match': 'post match',
    'Level-stake': 'Level stake',
    'level-stake': 'level stake',
    'Flat 1-unit': 'Flat 1 unit',
    '1-unit': '1 unit',
    'Both-teams-to-score': 'Both teams to score',
    'both-teams-to-score': 'both teams to score',
    'De-vigged': 'Devigged',
    'de-vigged': 'devigged',
    'Dual-Benchmark': 'Dual Benchmark',
    'dual-benchmark': 'dual benchmark',
    'Sub-Category': 'Sub Category',
    'sub-category': 'sub category',
    'Two-way': 'Two way',
    'two-way': 'two way',
    'Three-way': 'Three way',
    'three-way': 'three way',
    'Head-to-head': 'Head to head',
    'head-to-head': 'head to head',
    'Time-decayed': 'Time decayed',
    'Time-Decayed': 'Time Decayed',
    'time-decayed': 'time decayed',
    'Cross-field': 'Cross field',
    'cross-field': 'cross field',
    'Set-piece': 'Set piece',
    'set-piece': 'set piece',
    'Cross-match': 'Cross match',
    'Cross-Match': 'Cross Match',
    'cross-match': 'cross match',
    'Cross-validated': 'Cross validated',
    'cross-validated': 'cross validated',
    'State-based': 'State based',
    'state-based': 'state based',
    'Half-time': 'Half time',
    'half-time': 'half time',
    'Full-time': 'Full time',
    'full-time': 'full time',
    'Real-time': 'Real time',
    'real-time': 'real time',
    'Non-negotiable': 'Non negotiable',
    'non-negotiable': 'non negotiable',
    'Over-under': 'Over under',
    'over-under': 'over under',
    'Draw-specific': 'Draw specific',
    'draw-specific': 'draw specific',
    'Half-integer': 'Half integer',
    'half-integer': 'half integer',
    'Whole-number': 'Whole number',
    'whole-number': 'whole number',
    'All-round': 'All round',
    'all-round': 'all round',
    'Off-platform': 'Off platform',
    'off-platform': 'off platform',
    'Anti-wagering': 'Anti wagering',
    'anti-wagering': 'anti wagering',
    'First-half': 'First half',
    'first-half': 'first half',
    'Second-half': 'Second half',
    'second-half': 'second half',
    '24-hour': '24 hour',
    'In-sample': 'In sample',
    'in-sample': 'in sample',
    'In-play': 'In play',
    'in-play': 'in play',
    'T-60': 'T 60',
    'v0.9-canary': 'v0.9 canary',
    'v3.0.0-PROMOTED': 'v3.0.0 PROMOTED',
    'football-data.org': 'Football Data org',
    'the-odds-api': 'The Odds API',
    '12-match': '12 match',
    '10-match': '10 match',
    '3-match': '3 match',
    '5-match': '5 match',
    '20-match': '20 match',
    '30-team': '30 team',
  };

  for (const [target, replacement] of Object.entries(phraseMap)) {
    if (text.includes(target)) {
      text = text.split(target).join(replacement);
    }
  }

  // Any hyphen between letters and/or numbers becomes a space
  text = text.replace(/([a-zA-Z0-9]+)-([a-zA-Z0-9]+)/g, '$1 $2');

  // Rule 2a: Underscores become single space and formatted
  if (text.includes('_')) {
    // If the whole string is a single identifier like "total_points" or "MATCH_RESULT"
    if (!text.includes(' ') && text.includes('_')) {
      text = formatSnakeCase(text);
    } else {
      text = text.replace(/_+/g, ' ');
    }
  }

  // Final sweep: guarantee absolutely NO hyphens and NO underscores remain in display string
  // Hyphen right before a number: true minus
  text = text.replace(/-(\d)/g, '\u2212$1');
  // Any remaining hyphens or underscores become a space
  text = text.replace(/[-_]/g, ' ');
  // Collapse duplicate spaces
  text = text.replace(/ {2,}/g, ' ');

  return text;
}

/**
 * Format signed percentage or delta value:
 * Positive: +X.X%
 * Negative: −X.X% (true unicode minus \u2212)
 * Zero: 0.0%
 */
export function formatSignedValue(num?: number | null, suffix = '%'): string {
  if (num === undefined || num === null || isNaN(num)) {
    return 'N/A';
  }
  if (num > 0.0001) {
    return `+${num.toFixed(1)}${suffix}`;
  } else if (num < -0.0001) {
    return `\u2212${Math.abs(num).toFixed(1)}${suffix}`;
  }
  return `0.0${suffix}`;
}

/**
 * Format probability as percentage with tabular figures
 */
export function formatProbability(prob?: number | null): string {
  if (prob === undefined || prob === null || isNaN(prob)) {
    return 'N/A';
  }
  return `${(prob * 100).toFixed(1)}%`;
}

/**
 * Format decimal odds
 */
export function formatCleanOdds(odds?: number | null): string {
  if (odds === undefined || odds === null || isNaN(odds)) {
    return 'N/A';
  }
  return odds.toFixed(2);
}

/**
 * Format calibration bin range: e.g. (0.1, 0.2) -> "Bin 0.10 to 0.20"
 */
export function formatBinRange(min: number, max: number): string {
  return `Bin ${min.toFixed(2)} to ${max.toFixed(2)}`;
}

/**
 * Known canonical short display names for European clubs (Bug 4)
 */
const CANONICAL_SHORT_NAMES: Record<string, string> = {
  'fortuna sittard': 'Sittard',
  'sittard': 'Sittard',
  'internazionale milano': 'Inter',
  'fc internazionale milano': 'Inter',
  'internazionale': 'Inter',
  'inter milano': 'Inter',
  'inter': 'Inter',
  'genoa cfc': 'Genoa',
  'genoa': 'Genoa',
  'as monaco': 'Monaco',
  'as monaco fc': 'Monaco',
  'monaco': 'Monaco',
  'venezia fc': 'Venezia',
  'venezia': 'Venezia',
  'bayer 04 leverkusen': 'Leverkusen',
  'bayer leverkusen': 'Leverkusen',
  'leverkusen': 'Leverkusen',
  'borussia monchengladbach': "M'gladbach",
  'borussia mönchengladbach': "M'gladbach",
  'monchengladbach': "M'gladbach",
  "m'gladbach": "M'gladbach",
  '1. fsv mainz 05': 'Mainz',
  'fsv mainz 05': 'Mainz',
  'mainz 05': 'Mainz',
  'mainz': 'Mainz',
  'sc paderborn 07': 'Paderborn',
  'sc paderborn': 'Paderborn',
  'paderborn 07': 'Paderborn',
  'paderborn': 'Paderborn',
  'sc freiburg': 'Freiburg',
  'freiburg': 'Freiburg',
  'fc bayern munchen': 'Bayern',
  'fc bayern münchen': 'Bayern',
  'bayern munchen': 'Bayern',
  'bayern münchen': 'Bayern',
  'bayern munich': 'Bayern',
  'bayern': 'Bayern',
  'ec bahia': 'Bahia',
  'esporte clube bahia': 'Bahia',
  'bahia': 'Bahia',
  'sv elversberg': 'Elversberg',
  'elversberg': 'Elversberg',
  'crystal palace fc': 'Crystal Palace',
  'crystal palace': 'Crystal Palace',
  'newcastle united fc': 'Newcastle',
  'newcastle united': 'Newcastle',
  'newcastle': 'Newcastle',
  'hull city': 'Hull',
  'hull': 'Hull',
  'brentford fc': 'Brentford',
  'brentford': 'Brentford',
  'nec nijmegen': 'NEC',
  'n.e.c.': 'NEC',
  'nec': 'NEC',
  'fc groningen': 'Groningen',
  'groningen': 'Groningen',
  'sbv excelsior': 'Excelsior',
  'excelsior': 'Excelsior',
  'excelsior rotterdam': 'Excelsior',
  'lille osc': 'Lille',
  'lille': 'Lille',
  'tsg 1899 hoffenheim': 'Hoffenheim',
  'tsg hoffenheim': 'Hoffenheim',
  'hoffenheim': 'Hoffenheim',
  'santos fc': 'Santos',
  'santos': 'Santos',
  'psv eindhoven': 'PSV',
  'psv': 'PSV',
  'feyenoord rotterdam': 'Feyenoord',
  'feyenoord': 'Feyenoord',
  'afc ajax': 'Ajax',
  'ajax': 'Ajax',
  'manchester city': 'Man City',
  'manchester city fc': 'Man City',
  'man city': 'Man City',
  'manchester united': 'Man United',
  'manchester united fc': 'Man United',
  'man united': 'Man United',
  'arsenal fc': 'Arsenal',
  'arsenal': 'Arsenal',
  'chelsea fc': 'Chelsea',
  'chelsea': 'Chelsea',
  'liverpool fc': 'Liverpool',
  'liverpool': 'Liverpool',
  'tottenham hotspur': 'Tottenham',
  'tottenham': 'Tottenham',
  'real madrid cf': 'Real Madrid',
  'real madrid': 'Real Madrid',
  'fc barcelona': 'Barcelona',
  'barcelona': 'Barcelona',
  'atletico de madrid': 'Atlético',
  'atlético de madrid': 'Atlético',
  'atletico madrid': 'Atlético',
  'juventus fc': 'Juventus',
  'juventus': 'Juventus',
  'ac milan': 'Milan',
  'milan': 'Milan',
  'paris saint-germain': 'PSG',
  'paris saint germain': 'PSG',
  'psg': 'PSG',
  'borussia dortmund': 'Dortmund',
  'dortmund': 'Dortmund',
  'rb leipzig': 'RB Leipzig',
  'vfb stuttgart': 'Stuttgart',
  'eintracht frankfurt': 'Frankfurt',
};

/**
 * Returns the clean, consistent short display name for any team (Bug 4).
 * Always use this helper inside pick labels (`${displayName(team)} win`), cards, and tables.
 * Never insert the raw team.name into a pick label.
 */
export function displayName(team: any): string {
  if (!team) return '';
  const raw = typeof team === 'string' ? team : (team.shortName || team.name || '');
  if (!raw) return '';

  const lower = raw.toLowerCase().trim();
  if (CANONICAL_SHORT_NAMES[lower]) {
    return CANONICAL_SHORT_NAMES[lower];
  }

  // Also check normalized without punctuation/accents
  const norm = lower.replace(/[\.\-_']/g, ' ').replace(/\s+/g, ' ').trim();
  if (CANONICAL_SHORT_NAMES[norm]) {
    return CANONICAL_SHORT_NAMES[norm];
  }

  // Generic heuristic cleanup
  let cleaned = raw
    .replace(/^(1\.\s*FSV\s+|1\.\s*FC\s+|1\.\s*|FC\s+|CF\s+|SC\s+|SV\s+|AFC\s+|AS\s+|US\s+|EC\s+|SBV\s+|TSG\s+1899\s+|TSG\s+|AC\s+|SS\s+)/i, '')
    .replace(/\s+(FC|CF|CFC|OSC|04|05|07|1899)$/i, '')
    .trim();

  return cleaned || raw;
}

/**
 * Known TLAs / Abbreviations for European and international teams (Bug 3)
 */
const KNOWN_TEAM_TLAS: Record<string, string> = {
  'leverkusen': 'B04',
  'bayer 04 leverkusen': 'B04',
  'bayer leverkusen': 'B04',
  'm_gladbach': 'BMG',
  "m'gladbach": 'BMG',
  'borussia monchengladbach': 'BMG',
  'borussia mönchengladbach': 'BMG',
  'monchengladbach': 'BMG',
  'mainz': 'M05',
  '1. fsv mainz 05': 'M05',
  'fsv mainz 05': 'M05',
  'bahia': 'BAH',
  'ec bahia': 'BAH',
  'paderborn': 'SCP',
  'sc paderborn 07': 'SCP',
  'sc paderborn': 'SCP',
  'freiburg': 'SCF',
  'sc freiburg': 'SCF',
  'bayern': 'FCB',
  'fc bayern munchen': 'FCB',
  'fc bayern münchen': 'FCB',
  'bayern munich': 'FCB',
  'elversberg': 'SVE',
  'sv elversberg': 'SVE',
  'sv 07 elversberg': 'SVE',
  'sittard': 'SIT',
  'fortuna sittard': 'SIT',
  'excelsior': 'EXC',
  'sbv excelsior': 'EXC',
  'inter': 'INT',
  'internazionale milano': 'INT',
  'fc internazionale milano': 'INT',
  'monaco': 'ASM',
  'as monaco': 'ASM',
  'lille': 'LIL',
  'lille osc': 'LIL',
  'crystal palace': 'CRY',
  'crystal palace fc': 'CRY',
  'newcastle': 'NEW',
  'newcastle united fc': 'NEW',
  'hull': 'HUL',
  'hull city': 'HUL',
  'brentford': 'BRE',
  'brentford fc': 'BRE',
  'genoa': 'GEN',
  'genoa cfc': 'GEN',
  'venezia': 'VEN',
  'venezia fc': 'VEN',
  'nec': 'NEC',
  'nec nijmegen': 'NEC',
  'groningen': 'GRO',
  'fc groningen': 'GRO',
  'santos': 'SAN',
  'santos fc': 'SAN',
  'psv': 'PSV',
  'feyenoord': 'FEY',
  'ajax': 'AJA',
  'dortmund': 'BVB',
  'leipzig': 'RBL',
  'stuttgart': 'VFB',
  'frankfurt': 'SGE',
  'hoffenheim': 'TSG',
  'tsg 1899 hoffenheim': 'TSG',
};

/**
 * Resolves verified 3-letter team abbreviation (Bug 3).
 * Prioritizes provider TLA if valid, then lookup table keyed by team name/id,
 * then first 3 letters of short name after stripping noise prefixes.
 */
export function getTeamAbbreviation(team: any): string {
  if (!team) return 'TBD';

  // 1. Check known lookup dictionary first to guarantee verified accuracy
  const rawName = (team.name || '').toLowerCase().trim();
  const rawShort = (team.shortName || '').toLowerCase().trim();
  const rawId = (team.id || '').replace(/^team_/, '').toLowerCase().trim();

  if (KNOWN_TEAM_TLAS[rawId]) return KNOWN_TEAM_TLAS[rawId];
  if (KNOWN_TEAM_TLAS[rawShort]) return KNOWN_TEAM_TLAS[rawShort];
  if (KNOWN_TEAM_TLAS[rawName]) return KNOWN_TEAM_TLAS[rawName];

  // 2. Use provider's TLA if stored and clean (3-4 alphanumeric characters, not generic HOM/AWY)
  if (team.tla && typeof team.tla === 'string') {
    const tla = team.tla.trim().toUpperCase();
    if (tla.length >= 3 && tla.length <= 4 && tla !== 'HOM' && tla !== 'AWY' && !/^[0-9\.]/.test(tla)) {
      return tla;
    }
  }

  // 3. Fallback: Strip prefixes "1.", "FC", "SC", "SV", "AFC", "CF", "AS", "US", "EC" from short name
  const stripped = displayName(team)
    .replace(/^(1\.\s*FSV|1\.\s*FC|1\.\s*|FC|CF|SC|SV|AFC|AS|US|EC|SBV|TSG)\s+/i, '')
    .trim();

  const code = stripped.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase();
  return code.length >= 3 ? code : (stripped.slice(0, 3).toUpperCase() || 'TBD');
}

/**
 * Formats match kickoff time to user's timezone (default: Africa/Lagos / WAT) (Bug 5).
 * e.g. "13:30 UTC" -> "14:30"
 */
export function formatMatchTime(kickoffUtc: string, timeZone: string = 'Africa/Lagos'): string {
  if (!kickoffUtc) return '--:--';
  try {
    const d = new Date(kickoffUtc);
    if (isNaN(d.getTime())) return '--:--';
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: timeZone || 'Africa/Lagos',
    }).format(d);
  } catch {
    return '--:--';
  }
}

