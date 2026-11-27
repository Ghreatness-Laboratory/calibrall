import {
  getLocalDatabase,
  isProductionRuntime,
  persistenceBackendInfo,
} from '@/lib/supabase/client';
import { getSupabaseServiceClient } from '@/lib/supabase/serverAuth';
import { DailySlipLegRecord, DailySlipRecordRow } from './types';

function safeJsonParse<T>(raw: unknown, fallback: T): T {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }
  if (raw && typeof raw === 'object') {
    return raw as T;
  }
  return fallback;
}

/**
 * Returns fixture IDs that have an unresolved error-severity row in explanation_issues.
 */
export async function getFlaggedExplanationFixtureIds(): Promise<Set<string>> {
  const flagged = new Set<string>();
  try {
    const backend = persistenceBackendInfo();
    const serviceClient = getSupabaseServiceClient();

    if (backend.isRemoteSupabase && serviceClient) {
      const { data, error } = await serviceClient
        .from('explanation_issues')
        .select('fixture_id')
        .eq('severity', 'error');
      if (!error && Array.isArray(data)) {
        for (const r of data) {
          if (r?.fixture_id) flagged.add(String(r.fixture_id));
        }
      }
      return flagged;
    }

    if (!isProductionRuntime()) {
      const db = getLocalDatabase();
      if (db) {
        const rows = db
          .prepare(`SELECT DISTINCT fixture_id FROM explanation_issues WHERE severity = 'error'`)
          .all() as Array<{ fixture_id?: string }>;
        for (const r of rows) {
          if (r?.fixture_id) flagged.add(String(r.fixture_id));
        }
      }
    }
  } catch {
    // Non-fatal: empty set if table has no records yet
  }
  return flagged;
}

export async function getSlipBuildUsageToday(userId: string, dateIso: string): Promise<number> {
  if (!userId || !dateIso) return 0;
  const id = `${userId}:${dateIso}`;
  try {
    const backend = persistenceBackendInfo();
    const serviceClient = getSupabaseServiceClient();
    if (backend.isRemoteSupabase && serviceClient) {
      const { data, error } = await serviceClient
        .from('slip_build_usage')
        .select('build_count')
        .eq('id', id)
        .maybeSingle();
      if (!error && data && typeof data.build_count === 'number') {
        return data.build_count;
      }
      return 0;
    }

    if (!isProductionRuntime()) {
      const db = getLocalDatabase();
      if (db) {
        const row = db
          .prepare('SELECT build_count FROM slip_build_usage WHERE id = ?')
          .get(id) as { build_count?: number } | undefined;
        return Number(row?.build_count || 0);
      }
    }
  } catch {
    // ignore
  }
  return 0;
}

export async function incrementSlipBuildUsageToday(userId: string, dateIso: string): Promise<number> {
  if (!userId || !dateIso) return 0;
  const id = `${userId}:${dateIso}`;
  const nowIso = new Date().toISOString();
  const current = await getSlipBuildUsageToday(userId, dateIso);
  const nextCount = current + 1;

  try {
    const backend = persistenceBackendInfo();
    const serviceClient = getSupabaseServiceClient();
    if (backend.isRemoteSupabase && serviceClient) {
      const { error } = await serviceClient.from('slip_build_usage').upsert(
        {
          id,
          user_id: userId,
          usage_date: dateIso,
          build_count: nextCount,
          updated_at: nowIso,
        },
        { onConflict: 'id' }
      );
      if (!error) return nextCount;
    }

    if (!isProductionRuntime()) {
      const db = getLocalDatabase();
      if (db) {
        db.prepare(`
          INSERT INTO slip_build_usage (id, user_id, usage_date, build_count, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            build_count = slip_build_usage.build_count + 1,
            updated_at = excluded.updated_at
        `).run(id, userId, dateIso, 1, nowIso);
        const row = db
          .prepare('SELECT build_count FROM slip_build_usage WHERE id = ?')
          .get(id) as { build_count?: number } | undefined;
        return Number(row?.build_count || nextCount);
      }
    }
  } catch {
    // Non-fatal
  }
  return nextCount;
}

function mapDailySlipRow(raw: any): DailySlipRecordRow {
  const legs = safeJsonParse<DailySlipLegRecord[]>(raw.legs_json, []);
  return {
    id: String(raw.id),
    recordDate: String(raw.record_date),
    targetOdds: Number(raw.target_odds),
    style: raw.style === 'balanced' ? 'balanced' : 'safest',
    oddsBasis: raw.odds_basis === 'model_fair' ? 'model_fair' : 'real',
    combinedOdds: Number(raw.combined_odds),
    combinedProbability: Number(raw.combined_probability),
    settledOdds:
      raw.settled_odds !== null && raw.settled_odds !== undefined ? Number(raw.settled_odds) : null,
    status:
      raw.status === 'WON' || raw.status === 'LOST' || raw.status === 'VOID'
        ? raw.status
        : 'PENDING',
    legsCount: Number(raw.legs_count || legs.length),
    activeLegsCount: Number(raw.active_legs_count ?? legs.filter((l) => l.legStatus !== 'VOID' && l.legStatus !== 'PUSH').length),
    voidedLegsCount: Number(raw.voided_legs_count ?? legs.filter((l) => l.legStatus === 'VOID' || l.legStatus === 'PUSH').length),
    legs,
    createdAt: String(raw.created_at),
    firstKickoffUtc: String(raw.first_kickoff_utc),
    settledAt: raw.settled_at ? String(raw.settled_at) : null,
  };
}

export async function getDailySlipsForDate(dateIso: string): Promise<DailySlipRecordRow[]> {
  try {
    const backend = persistenceBackendInfo();
    const serviceClient = getSupabaseServiceClient();
    if (backend.isRemoteSupabase && serviceClient) {
      const { data, error } = await serviceClient
        .from('daily_slip_sets')
        .select('*')
        .eq('record_date', dateIso)
        .order('target_odds', { ascending: true });
      if (!error && Array.isArray(data)) {
        return data.map(mapDailySlipRow);
      }
      return [];
    }

    if (!isProductionRuntime()) {
      const db = getLocalDatabase();
      if (db) {
        const rows = db
          .prepare('SELECT * FROM daily_slip_sets WHERE record_date = ? ORDER BY target_odds ASC')
          .all(dateIso);
        return (rows || []).map(mapDailySlipRow);
      }
    }
  } catch {
    // ignore
  }
  return [];
}

export async function listDailySlipRecordRows(limit: number = 90): Promise<DailySlipRecordRow[]> {
  const safeLimit = Math.max(1, Math.min(250, limit));
  try {
    const backend = persistenceBackendInfo();
    const serviceClient = getSupabaseServiceClient();
    if (backend.isRemoteSupabase && serviceClient) {
      const { data, error } = await serviceClient
        .from('daily_slip_sets')
        .select('*')
        .order('record_date', { ascending: false })
        .order('target_odds', { ascending: true })
        .limit(safeLimit);
      if (!error && Array.isArray(data)) {
        return data.map(mapDailySlipRow);
      }
      return [];
    }

    if (!isProductionRuntime()) {
      const db = getLocalDatabase();
      if (db) {
        const rows = db
          .prepare(
            'SELECT * FROM daily_slip_sets ORDER BY record_date DESC, target_odds ASC LIMIT ?'
          )
          .all(safeLimit);
        return (rows || []).map(mapDailySlipRow);
      }
    }
  } catch {
    // ignore
  }
  return [];
}

export async function saveDailySlipRecordRows(rows: DailySlipRecordRow[]): Promise<number> {
  if (!rows || rows.length === 0) return 0;
  try {
    const payload = rows.map((r) => ({
      id: r.id,
      record_date: r.recordDate,
      target_odds: r.targetOdds,
      style: r.style,
      odds_basis: r.oddsBasis,
      combined_odds: r.combinedOdds,
      combined_probability: r.combinedProbability,
      settled_odds: r.settledOdds,
      status: r.status,
      legs_count: r.legsCount,
      active_legs_count: r.activeLegsCount,
      voided_legs_count: r.voidedLegsCount,
      legs_json: JSON.stringify(r.legs),
      created_at: r.createdAt,
      first_kickoff_utc: r.firstKickoffUtc,
      settled_at: r.settledAt,
    }));

    const backend = persistenceBackendInfo();
    const serviceClient = getSupabaseServiceClient();
    if (backend.isRemoteSupabase && serviceClient) {
      const { error } = await serviceClient
        .from('daily_slip_sets')
        .upsert(payload, { onConflict: 'id' });
      if (!error) return payload.length;
    }

    if (!isProductionRuntime()) {
      const db = getLocalDatabase();
      if (db) {
        const stmt = db.prepare(`
          INSERT OR IGNORE INTO daily_slip_sets (
            id, record_date, target_odds, style, odds_basis, combined_odds,
            combined_probability, settled_odds, status, legs_count, active_legs_count,
            voided_legs_count, legs_json, created_at, first_kickoff_utc, settled_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        db.exec('BEGIN');
        try {
          for (const p of payload) {
            stmt.run(
              p.id,
              p.record_date,
              p.target_odds,
              p.style,
              p.odds_basis,
              p.combined_odds,
              p.combined_probability,
              p.settled_odds,
              p.status,
              p.legs_count,
              p.active_legs_count,
              p.voided_legs_count,
              p.legs_json,
              p.created_at,
              p.first_kickoff_utc,
              p.settled_at
            );
          }
          db.exec('COMMIT');
        } catch (err) {
          db.exec('ROLLBACK');
          throw err;
        }
        return payload.length;
      }
    }
  } catch {
    // ignore
  }
  return 0;
}

export async function updateDailySlipSettlement(params: {
  id: string;
  status: 'PENDING' | 'WON' | 'LOST' | 'VOID';
  settledOdds: number | null;
  activeLegsCount: number;
  voidedLegsCount: number;
  legs: DailySlipLegRecord[];
  settledAt: string | null;
}): Promise<void> {
  try {
    const backend = persistenceBackendInfo();
    const serviceClient = getSupabaseServiceClient();
    const legsJson = JSON.stringify(params.legs);

    if (backend.isRemoteSupabase && serviceClient) {
      await serviceClient
        .from('daily_slip_sets')
        .update({
          status: params.status,
          settled_odds: params.settledOdds,
          active_legs_count: params.activeLegsCount,
          voided_legs_count: params.voidedLegsCount,
          legs_json: legsJson,
          settled_at: params.settledAt,
        })
        .eq('id', params.id);
      return;
    }

    if (!isProductionRuntime()) {
      const db = getLocalDatabase();
      if (db) {
        db.prepare(
          `UPDATE daily_slip_sets
           SET status = ?, settled_odds = ?, active_legs_count = ?, voided_legs_count = ?, legs_json = ?, settled_at = ?
           WHERE id = ?`
        ).run(
          params.status,
          params.settledOdds,
          params.activeLegsCount,
          params.voidedLegsCount,
          legsJson,
          params.settledAt,
          params.id
        );
      }
    }
  } catch {
    // Non-fatal
  }
}

export interface SettlementMatchScore {
  id: string;
  sport: 'football' | 'basketball';
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  homeHtScore?: number | null;
  awayHtScore?: number | null;
  homeH1Score?: number | null;
  awayH1Score?: number | null;
  homeCorners?: number | null;
  awayCorners?: number | null;
  homeYellowCards?: number | null;
  awayYellowCards?: number | null;
  homeRedCards?: number | null;
  awayRedCards?: number | null;
  goalEvents?: Array<{ minute: number; team: 'home' | 'away'; scorer?: string }>;
}

export async function loadSettlementScoresForMatchIds(
  footballIds: string[],
  basketballIds: string[]
): Promise<Map<string, SettlementMatchScore>> {
  const scores = new Map<string, SettlementMatchScore>();
  const cleanFootIds = Array.from(new Set(footballIds.filter(Boolean)));
  const cleanBbIds = Array.from(new Set(basketballIds.filter(Boolean)));

  const parseFootballPayload = (row: any): SettlementMatchScore | null => {
    const payload = safeJsonParse<Record<string, any>>(row.payload_json, {});
    const homeScore =
      row.home_score !== null && row.home_score !== undefined
        ? Number(row.home_score)
        : payload?.score?.home ?? null;
    const awayScore =
      row.away_score !== null && row.away_score !== undefined
        ? Number(row.away_score)
        : payload?.score?.away ?? null;
    return {
      id: String(row.id),
      sport: 'football',
      status: String(row.status || payload?.status || ''),
      homeScore: Number.isFinite(Number(homeScore)) ? Number(homeScore) : null,
      awayScore: Number.isFinite(Number(awayScore)) ? Number(awayScore) : null,
      homeHtScore:
        row.home_half_time_score !== null && row.home_half_time_score !== undefined
          ? Number(row.home_half_time_score)
          : payload?.score?.halfTimeHome ?? null,
      awayHtScore:
        row.away_half_time_score !== null && row.away_half_time_score !== undefined
          ? Number(row.away_half_time_score)
          : payload?.score?.halfTimeAway ?? null,
      homeCorners: row.home_corners ?? null,
      awayCorners: row.away_corners ?? null,
      homeYellowCards: row.home_yellow_cards ?? null,
      awayYellowCards: row.away_yellow_cards ?? null,
      homeRedCards: row.home_red_cards ?? null,
      awayRedCards: row.away_red_cards ?? null,
      goalEvents: Array.isArray(payload?.goalEvents) ? payload.goalEvents : undefined,
    };
  };

  try {
    const backend = persistenceBackendInfo();
    const serviceClient = getSupabaseServiceClient();

    if (backend.isRemoteSupabase && serviceClient) {
      if (cleanFootIds.length > 0) {
        const [{ data: fixRows }, { data: matchRows }] = await Promise.all([
          serviceClient.from('fixtures').select('id, status, payload_json').in('id', cleanFootIds),
          serviceClient
            .from('matches')
            .select(
              'id, status, home_score, away_score, home_half_time_score, away_half_time_score, home_corners, away_corners, home_yellow_cards, away_yellow_cards, home_red_cards, away_red_cards'
            )
            .in('id', cleanFootIds),
        ]);
        for (const r of fixRows || []) {
          const parsed = parseFootballPayload(r);
          if (parsed) scores.set(parsed.id, parsed);
        }
        for (const r of matchRows || []) {
          const parsed = parseFootballPayload(r);
          if (parsed && (!scores.has(parsed.id) || parsed.status === 'FINISHED')) {
            const prev = scores.get(parsed.id);
            scores.set(parsed.id, {
              ...parsed,
              goalEvents: parsed.goalEvents ?? prev?.goalEvents,
            });
          }
        }
      }

      if (cleanBbIds.length > 0) {
        const { data: bbRows } = await serviceClient
          .from('bb_games')
          .select('id, status, home_pts, away_pts, h1_home_pts, h1_away_pts')
          .in('id', cleanBbIds);
        for (const r of bbRows || []) {
          scores.set(String(r.id), {
            id: String(r.id),
            sport: 'basketball',
            status: String(r.status || ''),
            homeScore: r.home_pts !== null && r.home_pts !== undefined ? Number(r.home_pts) : null,
            awayScore: r.away_pts !== null && r.away_pts !== undefined ? Number(r.away_pts) : null,
            homeH1Score: r.h1_home_pts !== null && r.h1_home_pts !== undefined ? Number(r.h1_home_pts) : null,
            awayH1Score: r.h1_away_pts !== null && r.h1_away_pts !== undefined ? Number(r.h1_away_pts) : null,
          });
        }
      }
      return scores;
    }

    if (!isProductionRuntime()) {
      const db = getLocalDatabase();
      if (db) {
        if (cleanFootIds.length > 0) {
          const placeholders = cleanFootIds.map(() => '?').join(', ');
          const fixRows = db
            .prepare(`SELECT id, status, payload_json FROM fixtures WHERE id IN (${placeholders})`)
            .all(...cleanFootIds);
          for (const r of fixRows || []) {
            const parsed = parseFootballPayload(r);
            if (parsed) scores.set(parsed.id, parsed);
          }
          const matchRows = db
            .prepare(
              `SELECT id, status, home_score, away_score, home_half_time_score, away_half_time_score, home_corners, away_corners, home_yellow_cards, away_yellow_cards, home_red_cards, away_red_cards FROM matches WHERE id IN (${placeholders})`
            )
            .all(...cleanFootIds);
          for (const r of matchRows || []) {
            const parsed = parseFootballPayload(r);
            if (parsed && (!scores.has(parsed.id) || parsed.status === 'FINISHED')) {
              const prev = scores.get(parsed.id);
              scores.set(parsed.id, {
                ...parsed,
                goalEvents: parsed.goalEvents ?? prev?.goalEvents,
              });
            }
          }
        }

        if (cleanBbIds.length > 0) {
          const placeholders = cleanBbIds.map(() => '?').join(', ');
          const bbRows = db
            .prepare(
              `SELECT id, status, home_pts, away_pts, h1_home_pts, h1_away_pts FROM bb_games WHERE id IN (${placeholders})`
            )
            .all(...cleanBbIds) as any[];
          for (const r of bbRows || []) {
            scores.set(String(r.id), {
              id: String(r.id),
              sport: 'basketball',
              status: String(r.status || ''),
              homeScore: r.home_pts !== null && r.home_pts !== undefined ? Number(r.home_pts) : null,
              awayScore: r.away_pts !== null && r.away_pts !== undefined ? Number(r.away_pts) : null,
              homeH1Score:
                r.h1_home_pts !== null && r.h1_home_pts !== undefined ? Number(r.h1_home_pts) : null,
              awayH1Score:
                r.h1_away_pts !== null && r.h1_away_pts !== undefined ? Number(r.h1_away_pts) : null,
            });
          }
        }
      }
    }
  } catch {
    // Non-fatal
  }
  return scores;
}
