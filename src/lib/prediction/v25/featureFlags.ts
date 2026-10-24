// CALIBRALL: Feature Flag & Engine Version Controller
// Controls the rollout of "Dixon Coles v2.5" with contextual covariates, Platt calibration,
// quarter-line Asian handicaps, and honest confidence tiers.

export const FEATURE_FLAG_STORAGE_KEY = 'calibrall_feature_dixon_coles_v25';

export const ENGINE_VERSIONS = {
  V24: 'Dixon Coles v2.4 (Baseline Poisson)',
  V25: 'Dixon Coles v2.5 (Contextual Covariates & Platt Calibrated)',
} as const;

/**
 * Returns whether Dixon Coles v2.5 is currently active.
 * Checks environment variable or client localStorage override, defaulting to true.
 */
export function isDixonColesV25Active(): boolean {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(FEATURE_FLAG_STORAGE_KEY);
      if (stored !== null) {
        return stored === 'true';
      }
    } catch {
      // Safe fallback
    }
  }

  // Server-side / default fallback: enabled by default in v2.5 release
  const envVal = process.env.NEXT_PUBLIC_ENABLE_DIXON_COLES_V25 ?? process.env.ENABLE_DIXON_COLES_V25;
  if (envVal !== undefined) {
    return envVal === 'true' || envVal === '1';
  }

  return true;
}

/**
 * Toggles Dixon Coles v2.5 flag in client storage.
 */
export function setDixonColesV25Active(enabled: boolean): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(FEATURE_FLAG_STORAGE_KEY, enabled ? 'true' : 'false');
    } catch {
      // Safe fallback
    }
  }
}

/**
 * Returns clean display name of active engine version.
 */
export function getActiveEngineVersion(): string {
  return isDixonColesV25Active() ? ENGINE_VERSIONS.V25 : ENGINE_VERSIONS.V24;
}

/**
 * Short version code (e.g. "v2.5.0")
 */
export function getActiveEngineCode(): string {
  return isDixonColesV25Active() ? 'v2.5.0' : 'v2.4.1';
}
