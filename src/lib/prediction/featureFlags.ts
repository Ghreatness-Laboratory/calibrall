// CALIBRALL: Global Feature Flags
// Free sources architecture: team_news_enabled = false (zero lineup/injury dependencies)

export interface PlatformFeatureFlags {
  team_news_enabled: boolean;
  dixon_coles_v25: boolean;
}

export const FEATURE_FLAGS: PlatformFeatureFlags = {
  // FREE TIER DEFAULT: false.
  // When false:
  // - Lineups, injuries, suspensions, and rotation features are disabled.
  // - Neutral values are assigned without guessing or estimation.
  // - Data coverage indicator is displayed instead of lineup badges.
  // - Confidence tier is capped: NO HIGH TIER ALLOWED without team news.
  team_news_enabled: false,
  dixon_coles_v25: true,
};

export const isTeamNewsEnabled = (): boolean => FEATURE_FLAGS.team_news_enabled;
export const setTeamNewsEnabled = (enabled: boolean): void => {
  FEATURE_FLAGS.team_news_enabled = enabled;
};

export const isDixonColesV25Active = (): boolean => FEATURE_FLAGS.dixon_coles_v25;
export const setDixonColesV25Active = (active: boolean): void => {
  FEATURE_FLAGS.dixon_coles_v25 = active;
};
