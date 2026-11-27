export const DISABLED_RECOMMENDATIONS = ['cards_under'] as const;

export type DisabledRecommendationKey = (typeof DISABLED_RECOMMENDATIONS)[number];

export const UNDER_BOOKINGS_BOARD_MESSAGE =
  'Not recommended: one early card or a heated match breaks it';

export interface MarketDisabilityCheckInput {
  marketCode?: string | null;
  optionType?: string | null;
  marketCategory?: string | null;
  marketFamily?: string | null;
  marketGroup?: string | null;
  marketName?: string | null;
  selection?: string | null;
}

const BOOKINGS_CODE_RE = /(CARDS|CARD_POINTS|BOOKING_POINTS|BOOKINGS|BOOKING)/i;
const UNDER_CODE_SUFFIX_RE = /(?:_U\d+|_UNDER\b|^UNDER_)/i;
const BOOKINGS_TEXT_RE = /\b(cards?|bookings?|booking points?)\b/i;
const UNDER_TEXT_RE = /\bunder\b/i;

function isCardsUnderMarket(input: MarketDisabilityCheckInput | string | null | undefined): boolean {
  if (!input) return false;
  if (typeof input === 'string') {
    const code = input.trim();
    if (!code) return false;
    if (code.toLowerCase() === 'cards_under' || code.toLowerCase() === 'bookings_under') {
      return true;
    }
    return BOOKINGS_CODE_RE.test(code) && UNDER_CODE_SUFFIX_RE.test(code);
  }

  const code = String(input.marketCode ?? '').trim();
  if (code) {
    if (code.toLowerCase() === 'cards_under' || code.toLowerCase() === 'bookings_under') {
      return true;
    }
    if (BOOKINGS_CODE_RE.test(code) && UNDER_CODE_SUFFIX_RE.test(code)) {
      return true;
    }
  }

  const optionType = String(input.optionType ?? '').toLowerCase();
  const marketCategory = String(input.marketCategory ?? '').toLowerCase();
  const marketFamily = String(input.marketFamily ?? '').toLowerCase();
  const marketGroup = String(input.marketGroup ?? '').toLowerCase();
  const selection = String(input.selection ?? '').trim();
  const marketName = String(input.marketName ?? '').trim();

  const isBookingsContext =
    optionType === 'bookings' ||
    optionType === 'team_bookings' ||
    optionType === 'booking_points' ||
    marketCategory === 'bookings' ||
    marketFamily === 'bookings' ||
    marketGroup === 'bookings' ||
    BOOKINGS_CODE_RE.test(code) ||
    BOOKINGS_TEXT_RE.test(selection) ||
    BOOKINGS_TEXT_RE.test(marketName);

  if (!isBookingsContext) return false;

  if (selection) {
    return UNDER_TEXT_RE.test(selection);
  }

  if (marketName && !/over\s*\/\s*under/i.test(marketName)) {
    return UNDER_TEXT_RE.test(marketName);
  }

  return false;
}

export function isDisabledRecommendationMarket(
  input: MarketDisabilityCheckInput | string | null | undefined
): boolean {
  if (!input) return false;
  const disabledSet = new Set<string>(DISABLED_RECOMMENDATIONS);
  if (disabledSet.has('cards_under') && isCardsUnderMarket(input)) {
    return true;
  }
  return false;
}
