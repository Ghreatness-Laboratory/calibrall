// CALIBRALL: Immutable Pre-Kickoff Football Explanation Persistence (SQLite)
// Stores deterministic model summaries & reasoning in `football_picks` strictly pre-kickoff.
// Never overwrites existing rows after kickoff or final score.

import { Fixture, FixtureContext, WrittenMatchAlternate, WrittenMatchExplanation } from '@/types';
import { getLocalDatabase, isProductionRuntime } from '@/lib/supabase/client';
import { cleanDisplayText } from '@/lib/utils/formatText';
import { generateFootballExplanation } from './explanationGenerator';
import type { EvaluatedFixtureResult } from './marketSelection';

function firstSentence(text: string): string {
  const cleaned = cleanDisplayText(text).trim();
  if (!cleaned) return '';
  const match = cleaned.match(/^(.+?[.!?])(?:\s+|$)/);
  return match ? match[1].trim() : cleaned;
}

export interface PickModerationFlag {
  isHidden: boolean;
  voidedReason: string | null;
}

export async function loadFootballPickModerationMap(
  fixtureIds: string[]
): Promise<Map<string, PickModerationFlag>> {
  const result = new Map<string, PickModerationFlag>();
  if (typeof window !== 'undefined' || fixtureIds.length === 0) return result;

  try {
    const db = getLocalDatabase();
    if (!isProductionRuntime() && db) {
      const uniqueIds = Array.from(new Set(fixtureIds));
      for (let i = 0; i < uniqueIds.length; i += 200) {
        const chunk = uniqueIds.slice(i, i + 200);
        const placeholders = chunk.map(() => '?').join(', ');
        try {
          const rows = db
            .prepare(
              `SELECT fixture_id, is_hidden, voided_reason
               FROM football_picks
               WHERE fixture_id IN (${placeholders})`
            )
            .all(...chunk) as Array<{
              fixture_id: string;
              is_hidden?: number | boolean | null;
              voided_reason?: string | null;
            }>;
          for (const row of rows) {
            result.set(String(row.fixture_id), {
              isHidden: Boolean(row.is_hidden === 1 || row.is_hidden === true),
              voidedReason: row.voided_reason ? String(row.voided_reason) : null,
            });
          }
        } catch {
          // Graceful fallback if moderation columns do not exist yet
        }
      }
      return result;
    }

    const { getSupabaseServiceClient } = await import('@/lib/supabase/serverAuth');
    const serviceClient = getSupabaseServiceClient();
    if (serviceClient) {
      const uniqueIds = Array.from(new Set(fixtureIds));
      for (let i = 0; i < uniqueIds.length; i += 200) {
        const chunk = uniqueIds.slice(i, i + 200);
        const { data, error } = await serviceClient
          .from('football_picks')
          .select('fixture_id, is_hidden, voided_reason')
          .in('fixture_id', chunk);
        if (!error && Array.isArray(data)) {
          for (const row of data) {
            result.set(String(row.fixture_id), {
              isHidden: Boolean(row.is_hidden === true || row.is_hidden === 1),
              voidedReason: row.voided_reason ? String(row.voided_reason) : null,
            });
          }
        }
      }
    }
  } catch {
    // Non-fatal moderation lookup
  }

  return result;
}

export function loadStoredFootballExplanation(fixtureId: string): WrittenMatchExplanation | null {
  if (typeof window !== 'undefined') return null;
  try {
    if (isProductionRuntime()) return null;
    const db = getLocalDatabase();
    if (!db) return null;

    let row:
      | {
          summary?: string;
          reasoning_json?: string;
          alternates_json?: string;
          recorded_at?: string;
          is_hidden?: number | boolean | null;
          voided_reason?: string | null;
        }
      | undefined;

    try {
      row = db
        .prepare(
          `SELECT summary, reasoning_json, alternates_json, recorded_at, is_hidden, voided_reason
           FROM football_picks
           WHERE fixture_id = ?
           LIMIT 1`
        )
        .get(fixtureId) as typeof row;
    } catch {
      row = db
        .prepare(
          `SELECT summary, reasoning_json, alternates_json, recorded_at
           FROM football_picks
           WHERE fixture_id = ?
           LIMIT 1`
        )
        .get(fixtureId) as typeof row;
    }

    if (!row || !row.summary) return null;
    if (row.is_hidden === 1 || row.is_hidden === true || Boolean(row.voided_reason)) {
      return null;
    }

    let reasoning: Record<string, any> = {};
    let alternates: WrittenMatchAlternate[] = [];
    try {
      reasoning = row.reasoning_json ? JSON.parse(row.reasoning_json) : {};
    } catch {
      reasoning = {};
    }
    try {
      const parsedAlt = row.alternates_json ? JSON.parse(row.alternates_json) : [];
      if (Array.isArray(parsedAlt)) alternates = parsedAlt;
    } catch {
      alternates = [];
    }

    const fullSummary = cleanDisplayText(row.summary);
    return {
      oneLineSummary: firstSentence(fullSummary),
      fullSummary,
      reasoning,
      alternates,
      generatedAt: String(row.recorded_at || new Date().toISOString()),
    };
  } catch {
    return null;
  }
}

export function persistOrLoadImmutableFootballExplanation(
  fixture: Fixture,
  evaluation: Pick<EvaluatedFixtureResult, 'topPick' | 'predictions' | 'noRecommendationReason'>,
  context?: FixtureContext
): WrittenMatchExplanation {
  // 1. Existing stored row ALWAYS takes precedence (strictly immutable after kickoff/creation)
  const existing = loadStoredFootballExplanation(fixture.id);
  if (existing) {
    return existing;
  }

  // 2. Deterministic generation from model numbers
  const generated = generateFootballExplanation({ fixture, evaluation, context });

  // 3. Persist ONLY if strictly pre-kickoff (never backfill finished or in-play fixtures)
  if (typeof window === 'undefined') {
    try {
      const isUpcoming = fixture.status === 'TIMED' || fixture.status === 'SCHEDULED';
      const kickoffMs = Date.parse(fixture.kickoffTime);
      if (isUpcoming && Number.isFinite(kickoffMs) && kickoffMs > Date.now() && !isProductionRuntime()) {
        const db = getLocalDatabase();
        if (db) {
          const top = evaluation.topPick;
          db.prepare(
            `INSERT OR IGNORE INTO football_picks (
              fixture_id, competition_code, kickoff_time,
              market_code, market_name, selection,
              calibrated_probability, confidence_tier, price_source,
              summary, reasoning_json, alternates_json,
              model_version, recorded_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            fixture.id,
            fixture.competition?.code || null,
            fixture.kickoffTime || null,
            top?.marketCode || null,
            top ? cleanDisplayText(top.marketName) : null,
            top ? cleanDisplayText(top.selection) : null,
            top ? Number(top.modelProbability.toFixed(4)) : null,
            top?.confidenceTier || null,
            top ? cleanDisplayText(top.priceSource || (top.marketOdds ? 'Verified Odds' : 'Model line, no market price')) : null,
            generated.fullSummary,
            JSON.stringify(generated.reasoning || {}),
            JSON.stringify(generated.alternates || []),
            'v2.5.0',
            generated.generatedAt
          );
        }
      }
    } catch {
      // Non-fatal persistence error; still return deterministic generated explanation
    }
  }

  return generated;
}
