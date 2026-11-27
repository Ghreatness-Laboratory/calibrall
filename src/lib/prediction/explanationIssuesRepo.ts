// CALIBRALL: Server-Only Explanation Issues Repository & Consistency Sweep
// Persists runtime consistency mismatches to `explanation_issues` (SQLite & Supabase)
// so admins can inspect any discrepancy in the Admin System Health dashboard.

import crypto from 'node:crypto';
import {
  getLocalDatabase,
  isProductionRuntime,
  persistenceBackendInfo,
} from '@/lib/supabase/client';
import { getSupabaseServiceClient } from '@/lib/supabase/serverAuth';
import { cleanDisplayText, displayName } from '@/lib/utils/formatText';
import {
  validateExplanationConsistency,
  type ExplanationIssueItem,
} from './explanationValidator';

export interface ExplanationIssueRecord {
  id: string;
  sport: 'football' | 'basketball';
  fixtureId: string;
  matchTitle: string;
  marketCode: string | null;
  selection: string | null;
  issueCode: string;
  issueDetail: string;
  severity: 'error' | 'warning';
  fallbackApplied: boolean;
  detectedAt: string;
}

export async function recordExplanationIssues(
  items: Array<{
    sport: 'football' | 'basketball';
    fixtureId: string;
    matchTitle: string;
    marketCode?: string | null;
    selection?: string | null;
    issues: ExplanationIssueItem[];
    fallbackApplied?: boolean;
  }>
): Promise<number> {
  const flatRows: ExplanationIssueRecord[] = [];
  const nowIso = new Date().toISOString();

  for (const entry of items) {
    for (const iss of entry.issues) {
      flatRows.push({
        id: crypto.randomUUID(),
        sport: entry.sport,
        fixtureId: entry.fixtureId,
        matchTitle: cleanDisplayText(entry.matchTitle),
        marketCode: entry.marketCode || null,
        selection: entry.selection ? cleanDisplayText(entry.selection) : null,
        issueCode: iss.code,
        issueDetail: iss.detail,
        severity: iss.severity,
        fallbackApplied: Boolean(entry.fallbackApplied),
        detectedAt: nowIso,
      });
    }
  }

  if (flatRows.length === 0) return 0;

  try {
    const backend = persistenceBackendInfo();
    const serviceClient = getSupabaseServiceClient();
    if (backend.isRemoteSupabase && serviceClient) {
      const payload = flatRows.map((r) => ({
        id: r.id,
        sport: r.sport,
        fixture_id: r.fixtureId,
        match_title: r.matchTitle,
        market_code: r.marketCode,
        selection: r.selection,
        issue_code: r.issueCode,
        issue_detail: r.issueDetail,
        severity: r.severity,
        fallback_applied: r.fallbackApplied,
        detected_at: r.detectedAt,
      }));
      await serviceClient.from('explanation_issues').insert(payload);
      return flatRows.length;
    }

    if (!isProductionRuntime()) {
      const db = getLocalDatabase();
      if (db) {
        const stmt = db.prepare(`
          INSERT INTO explanation_issues (
            id, sport, fixture_id, match_title, market_code, selection,
            issue_code, issue_detail, severity, fallback_applied, detected_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        db.exec('BEGIN');
        try {
          for (const r of flatRows) {
            stmt.run(
              r.id,
              r.sport,
              r.fixtureId,
              r.matchTitle,
              r.marketCode,
              r.selection,
              r.issueCode,
              r.issueDetail,
              r.severity,
              r.fallbackApplied ? 1 : 0,
              r.detectedAt
            );
          }
          db.exec('COMMIT');
        } catch (err) {
          db.exec('ROLLBACK');
          throw err;
        }
        return flatRows.length;
      }
    }
  } catch {
    // Non-fatal audit logging
  }
  return 0;
}

export async function clearExplanationIssuesForFixtures(fixtureIds: string[]): Promise<void> {
  if (fixtureIds.length === 0) return;
  try {
    const backend = persistenceBackendInfo();
    const serviceClient = getSupabaseServiceClient();
    if (backend.isRemoteSupabase && serviceClient) {
      await serviceClient.from('explanation_issues').delete().in('fixture_id', fixtureIds);
      return;
    }
    if (!isProductionRuntime()) {
      const db = getLocalDatabase();
      if (db) {
        for (let i = 0; i < fixtureIds.length; i += 200) {
          const chunk = fixtureIds.slice(i, i + 200);
          const placeholders = chunk.map(() => '?').join(', ');
          db.prepare(`DELETE FROM explanation_issues WHERE fixture_id IN (${placeholders})`).run(...chunk);
        }
      }
    }
  } catch {
    // Non-fatal
  }
}

export async function getRecentExplanationIssues(limit = 50): Promise<{
  totalCount: number;
  count24h: number;
  items: ExplanationIssueRecord[];
}> {
  const safeLimit = Math.max(1, Math.min(200, limit));
  const ago24h = new Date(Date.now() - 86_400_000).toISOString();
  try {
    const backend = persistenceBackendInfo();
    const serviceClient = getSupabaseServiceClient();
    if (backend.isRemoteSupabase && serviceClient) {
      const [rowsRes, totalRes, recentRes] = await Promise.all([
        serviceClient
          .from('explanation_issues')
          .select('*')
          .order('detected_at', { ascending: false })
          .range(0, safeLimit - 1),
        serviceClient.from('explanation_issues').select('id', { count: 'exact', head: true }),
        serviceClient
          .from('explanation_issues')
          .select('id', { count: 'exact', head: true })
          .gte('detected_at', ago24h),
      ]);
      const items = (rowsRes.data || []).map((r: any) => ({
        id: String(r.id),
        sport: (r.sport === 'basketball' ? 'basketball' : 'football') as 'football' | 'basketball',
        fixtureId: String(r.fixture_id),
        matchTitle: String(r.match_title || ''),
        marketCode: r.market_code ? String(r.market_code) : null,
        selection: r.selection ? String(r.selection) : null,
        issueCode: String(r.issue_code),
        issueDetail: String(r.issue_detail),
        severity: (r.severity === 'warning' ? 'warning' : 'error') as 'error' | 'warning',
        fallbackApplied: Boolean(r.fallback_applied === true || r.fallback_applied === 1),
        detectedAt: String(r.detected_at || ''),
      }));
      return {
        totalCount: Number(totalRes.count) || items.length,
        count24h: Number(recentRes.count) || 0,
        items,
      };
    }

    if (!isProductionRuntime()) {
      const db = getLocalDatabase();
      if (db) {
        const totalRow = db.prepare(`SELECT COUNT(*) AS c FROM explanation_issues`).get() as { c: number } | undefined;
        const recentRow = db
          .prepare(`SELECT COUNT(*) AS c FROM explanation_issues WHERE detected_at >= ?`)
          .get(ago24h) as { c: number } | undefined;
        const rows = db
          .prepare(`SELECT * FROM explanation_issues ORDER BY detected_at DESC LIMIT ?`)
          .all(safeLimit) as any[];
        const items: ExplanationIssueRecord[] = rows.map((r) => ({
          id: String(r.id),
          sport: r.sport === 'basketball' ? 'basketball' : 'football',
          fixtureId: String(r.fixture_id),
          matchTitle: String(r.match_title || ''),
          marketCode: r.market_code ? String(r.market_code) : null,
          selection: r.selection ? String(r.selection) : null,
          issueCode: String(r.issue_code),
          issueDetail: String(r.issue_detail),
          severity: r.severity === 'warning' ? 'warning' : 'error',
          fallbackApplied: Boolean(r.fallback_applied === 1 || r.fallback_applied === true),
          detectedAt: String(r.detected_at || ''),
        }));
        return {
          totalCount: Number(totalRow?.c) || 0,
          count24h: Number(recentRow?.c) || 0,
          items,
        };
      }
    }
  } catch {
    // Graceful empty return
  }
  return { totalCount: 0, count24h: 0, items: [] };
}

/**
 * Sweeps all currently stored football fixtures and basketball slate games,
 * evaluates explanations via single-source-of-truth generation, and persists any detected issues.
 */
export async function sweepAndRecordExplanationIssues(
  sport: 'all' | 'football' | 'basketball' = 'all'
): Promise<{ checkedFootball: number; checkedBasketball: number; issuesLogged: number }> {
  let checkedFootball = 0;
  let checkedBasketball = 0;
  const issueBatch: Array<{
    sport: 'football' | 'basketball';
    fixtureId: string;
    matchTitle: string;
    marketCode?: string | null;
    selection?: string | null;
    issues: ExplanationIssueItem[];
    fallbackApplied?: boolean;
  }> = [];
  const checkedFixtureIds: string[] = [];

  if (sport === 'all' || sport === 'football') {
    try {
      const { getFootballDataProvider } = await import('@/lib/data/provider');
      const { getFixtureStatistics, buildFixtureContextFromStats } = await import('@/lib/data/seedData');
      const { evaluateFixtureMarkets, selectDiversifiedSlatePicks } = await import('./marketSelection');
      const { syncSlateExplanations } = await import('./explanationGenerator');

      const { fixtures } = await getFootballDataProvider().getLiveFixtures({ status: 'ALL' });
      const evalItems = fixtures.map((f) => {
        const stats = f.serverStats || getFixtureStatistics(f);
        const ctx = buildFixtureContextFromStats(f, stats);
        const ev = evaluateFixtureMarkets(ctx);
        return {
          fixtureId: f.id,
          fixture: f,
          context: ctx,
          topPick: ev.topPick,
          predictions: ev.predictions,
          noRecommendationReason: ev.noRecommendationReason,
        };
      });

      const diversified = selectDiversifiedSlatePicks(evalItems, 0.40);
      const synced = syncSlateExplanations(diversified);

      for (const item of synced) {
        checkedFootball++;
        checkedFixtureIds.push(item.fixtureId);
        const home = cleanDisplayText(displayName(item.fixture.homeTeam) || item.fixture.homeTeam.name);
        const away = cleanDisplayText(displayName(item.fixture.awayTeam) || item.fixture.awayTeam.name);
        const exp = item.writtenExplanation;
        if (!exp) continue;

        const val = validateExplanationConsistency({
          sport: 'football',
          homeTeam: home,
          awayTeam: away,
          activePick: item.topPick
            ? {
                marketCode: item.topPick.marketCode,
                selection: item.topPick.selection,
                probability: item.topPick.calibratedProbability ?? item.topPick.modelProbability,
                confidenceTier: item.topPick.confidenceTier,
                optionType: item.topPick.optionType,
                marketCategory: item.topPick.marketCategory,
                marketFamily: item.topPick.marketFamily,
              }
            : null,
          explanation: exp,
          isThinHistory: Boolean(item.fixture.insufficientData || item.context?.insufficientData),
        });
        if (!val.valid) {
          issueBatch.push({
            sport: 'football',
            fixtureId: item.fixtureId,
            matchTitle: `${home} vs ${away}`,
            marketCode: item.topPick?.marketCode || null,
            selection: item.topPick?.selection || null,
            issues: val.issues,
            fallbackApplied: Boolean(exp.fallbackApplied),
          });
        }
      }
    } catch {
      // Non-fatal football sweep
    }
  }

  if (sport === 'all' || sport === 'basketball') {
    try {
      const { buildEvaluatedBasketballSlate } = await import('@/lib/basketball/readService');
      const slate = await buildEvaluatedBasketballSlate(false);
      for (const fix of slate.fixtures) {
        checkedBasketball++;
        checkedFixtureIds.push(fix.id);
        const ev = slate.evaluationsById[fix.id];
        if (!ev || !fix.writtenExplanation) continue;
        const home = cleanDisplayText(displayName(fix.homeTeam) || fix.homeTeam.name);
        const away = cleanDisplayText(displayName(fix.awayTeam) || fix.awayTeam.name);
        const val = validateExplanationConsistency({
          sport: 'basketball',
          homeTeam: home,
          awayTeam: away,
          activePick: ev.topPick
            ? {
                marketCode: ev.topPick.marketCode,
                selection: ev.topPick.selection,
                probability: ev.topPick.calibratedProbability,
                confidenceTier: ev.topPick.tier === 'SPECULATIVE' ? 'LOW' : ev.topPick.tier === 'HIGH' ? 'HIGH' : 'MEDIUM',
                marketCategory: ev.topPick.marketCategory,
              }
            : null,
          explanation: fix.writtenExplanation,
          isThinHistory: ev.needsHistory,
        });
        if (!val.valid) {
          issueBatch.push({
            sport: 'basketball',
            fixtureId: fix.id,
            matchTitle: `${home} vs ${away}`,
            marketCode: ev.topPick?.marketCode || null,
            selection: ev.topPick?.selection || null,
            issues: val.issues,
            fallbackApplied: Boolean(fix.writtenExplanation.fallbackApplied),
          });
        }
      }
    } catch {
      // Non-fatal basketball sweep
    }
  }

  await clearExplanationIssuesForFixtures(checkedFixtureIds);
  const issuesLogged = await recordExplanationIssues(issueBatch);
  return { checkedFootball, checkedBasketball, issuesLogged };
}
