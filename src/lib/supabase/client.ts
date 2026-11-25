// MATCHMIND: Supabase Client Integration & Local Development Adapter
import { createClient } from '@supabase/supabase-js';
import { UserProfile, UserPreferences } from '@/types';

// Support both server-side runtime env vars and NEXT_PUBLIC client vars
const supabaseUrl = 
  process.env.SUPABASE_URL?.trim() || 
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || 
  '';

const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
const supabaseAnonKey = 
  supabaseServiceKey || 
  process.env.SUPABASE_ANON_KEY?.trim() || 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || 
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || 
  '';

export function isProductionRuntime(): boolean {
  if (!isRemoteSupabase && process.env.VERCEL !== '1' && process.env.VERCEL_ENV !== 'production') {
    return false;
  }
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.ENVIRONMENT === 'production' ||
    process.env.VERCEL_ENV === 'production' ||
    process.env.VERCEL === '1'
  );
}

const hasValidSupabaseUrl = Boolean(
  supabaseUrl &&
  supabaseUrl.startsWith('https://') &&
  !supabaseUrl.includes('your-project-id')
);

const isRemoteSupabase = Boolean(
  hasValidSupabaseUrl &&
  supabaseAnonKey &&
  (typeof window !== 'undefined' || Boolean(supabaseServiceKey))
);

export interface PersistenceBackendInfo {
  backend: 'supabase_postgres' | 'local_sqlite' | 'misconfigured';
  isRemoteSupabase: boolean;
  isProduction: boolean;
  hasSupabaseUrl: boolean;
  hasAnonOrPublishableKey: boolean;
  hasServiceRoleKey: boolean;
  localSqliteAllowed: boolean;
  message: string;
}

export function persistenceBackendInfo(): PersistenceBackendInfo {
  const isProd = isProductionRuntime();
  const hasAnon = Boolean(
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()
  );
  const hasService = Boolean(supabaseServiceKey);

  if (isRemoteSupabase) {
    return {
      backend: 'supabase_postgres',
      isRemoteSupabase: true,
      isProduction: isProd,
      hasSupabaseUrl: hasValidSupabaseUrl,
      hasAnonOrPublishableKey: hasAnon,
      hasServiceRoleKey: hasService,
      localSqliteAllowed: false,
      message: 'Remote Supabase Postgres active via service-role client.',
    };
  }

  if (isProd) {
    const missing: string[] = [];
    if (!hasValidSupabaseUrl) missing.push('NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)');
    if (!hasService) missing.push('SUPABASE_SERVICE_ROLE_KEY');
    return {
      backend: 'misconfigured',
      isRemoteSupabase: false,
      isProduction: true,
      hasSupabaseUrl: hasValidSupabaseUrl,
      hasAnonOrPublishableKey: hasAnon,
      hasServiceRoleKey: hasService,
      localSqliteAllowed: false,
      message: `Production persistence misconfigured: missing ${missing.join(' and ')}. Local SQLite fallback (data/supabase.db) is disabled in production.`,
    };
  }

  return {
    backend: 'local_sqlite',
    isRemoteSupabase: false,
    isProduction: false,
    hasSupabaseUrl: hasValidSupabaseUrl,
    hasAnonOrPublishableKey: hasAnon,
    hasServiceRoleKey: hasService,
    localSqliteAllowed: true,
    message: hasValidSupabaseUrl && !hasService
      ? 'Local SQLite fallback (data/supabase.db) active in non-production because SUPABASE_SERVICE_ROLE_KEY is unset.'
      : 'Local SQLite persistent store (data/supabase.db) active in development/test.',
  };
}

// Production strictly requires remote Supabase Postgres (never silent SQLite fallback)
export const isSupabaseConfigured = isProductionRuntime() ? isRemoteSupabase : true;

export function assertPersistenceConfigured(): void {
  if (isProductionRuntime() && !isRemoteSupabase) {
    throw new Error(persistenceBackendInfo().message);
  }
}

// ---------------------------------------------------------------------------
// LOCAL SQLITE PERSISTENT SUPABASE CLIENT (Server-Side)
// ---------------------------------------------------------------------------
class LocalSupabaseQueryBuilder {
  private table: string;
  private db: any;
  private selectedCols: string = '*';
  private countMode?: string;
  private isHead: boolean = false;
  private whereClauses: { sql: string; params: any[] }[] = [];
  private orderClauses: string[] = [];
  private limitCount?: number;
  private offsetCount?: number;
  private operation: 'select' | 'delete' = 'select';

  constructor(db: any, table: string) {
    this.db = db;
    this.table = table;
  }

  select(columns: string = '*', options?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }) {
    this.operation = 'select';
    this.selectedCols = columns;
    if (options?.count) this.countMode = options.count;
    if (options?.head) this.isHead = true;
    return this;
  }

  delete() {
    this.operation = 'delete';
    return this;
  }

  eq(column: string, value: any) {
    if (value === null || value === undefined) {
      this.whereClauses.push({ sql: `"${column}" IS NULL`, params: [] });
    } else {
      this.whereClauses.push({ sql: `"${column}" = ?`, params: [value] });
    }
    return this;
  }

  neq(column: string, value: any) {
    if (value === null || value === undefined) {
      this.whereClauses.push({ sql: `"${column}" IS NOT NULL`, params: [] });
    } else {
      this.whereClauses.push({ sql: `"${column}" != ?`, params: [value] });
    }
    return this;
  }

  in(column: string, values: any[]) {
    if (!values || values.length === 0) {
      this.whereClauses.push({ sql: '1 = 0', params: [] });
      return this;
    }
    const placeholders = values.map(() => '?').join(', ');
    this.whereClauses.push({ sql: `"${column}" IN (${placeholders})`, params: values });
    return this;
  }

  gte(column: string, value: any) {
    this.whereClauses.push({ sql: `"${column}" >= ?`, params: [value] });
    return this;
  }

  lte(column: string, value: any) {
    this.whereClauses.push({ sql: `"${column}" <= ?`, params: [value] });
    return this;
  }

  gt(column: string, value: any) {
    this.whereClauses.push({ sql: `"${column}" > ?`, params: [value] });
    return this;
  }

  lt(column: string, value: any) {
    this.whereClauses.push({ sql: `"${column}" < ?`, params: [value] });
    return this;
  }

  or(filterString: string) {
    // e.g. "home_team_id.eq.team_1,away_team_id.eq.team_1"
    // e.g. "provider_id.is.null,provider_id.eq.,is_demo.eq.true"
    const subParts = filterString.split(',');
    const orClauses: string[] = [];
    const params: any[] = [];

    for (const part of subParts) {
      const matchEq = part.match(/^([a-zA-Z0-9_]+)\.eq\.(.*)$/);
      if (matchEq) {
        const col = matchEq[1];
        const val = matchEq[2];
        orClauses.push(`"${col}" = ?`);
        params.push(val);
        continue;
      }
      const matchNull = part.match(/^([a-zA-Z0-9_]+)\.is\.null$/i);
      if (matchNull) {
        orClauses.push(`"${matchNull[1]}" IS NULL`);
        continue;
      }
    }

    if (orClauses.length > 0) {
      this.whereClauses.push({
        sql: `(${orClauses.join(' OR ')})`,
        params,
      });
    }
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    const asc = options?.ascending !== false;
    this.orderClauses.push(`"${column}" ${asc ? 'ASC' : 'DESC'}`);
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  range(from: number, to: number) {
    const safeFrom = Math.max(0, Math.floor(from));
    const safeTo = Math.max(safeFrom - 1, Math.floor(to));
    this.offsetCount = safeFrom;
    this.limitCount = Math.max(0, safeTo - safeFrom + 1);
    return this;
  }

  async upsert(data: any | any[], options?: { onConflict?: string }) {
    try {
      const rows = Array.isArray(data) ? data : [data];
      if (rows.length === 0) {
        return { data: [], error: null };
      }

      const onConflictCols = options?.onConflict ? options.onConflict.split(',').map(c => c.trim()) : ['id'];

      const useTx = rows.length > 1;
      const stmtCache = new Map<string, any>();
      if (useTx) this.db.exec('BEGIN');
      try {
        for (const row of rows) {
          const keys = Object.keys(row);
          if (keys.length === 0) continue;

          const quotedKeys = keys.map(k => `"${k}"`).join(', ');
          const placeholders = keys.map(() => '?').join(', ');
          const updateClauses = keys
            .filter(k => !onConflictCols.includes(k))
            .map(k => `"${k}" = excluded."${k}"`)
            .join(', ');

          const conflictClause = onConflictCols.map(c => `"${c}"`).join(', ');
          const doUpdate = updateClauses.length > 0 ? `DO UPDATE SET ${updateClauses}` : 'DO NOTHING';

          const sql = `INSERT INTO "${this.table}" (${quotedKeys}) VALUES (${placeholders}) ON CONFLICT (${conflictClause}) ${doUpdate}`;
          const values = keys.map(k => {
            const val = row[k];
            if (val === undefined || val === null) return null;
            if (typeof val === 'boolean') return val ? 1 : 0;
            if (Array.isArray(val) || typeof val === 'object') return JSON.stringify(val);
            return val;
          });

          let stmt = stmtCache.get(sql);
          if (!stmt) {
            stmt = this.db.prepare(sql);
            stmtCache.set(sql, stmt);
          }
          stmt.run(...values);
        }
        if (useTx) this.db.exec('COMMIT');
      } catch (txErr) {
        if (useTx) {
          try { this.db.exec('ROLLBACK'); } catch (_) {}
        }
        throw txErr;
      }

      return { data: rows, error: null };
    } catch (err: any) {
      console.error(`[LocalSupabase upsert error on ${this.table}]:`, err.message);
      return { data: null, error: err };
    }
  }

  then(resolve: (res: any) => void, reject?: (err: any) => void) {
    try {
      const whereSql = this.whereClauses.length > 0
        ? `WHERE ${this.whereClauses.map(w => w.sql).join(' AND ')}`
        : '';
      const params = this.whereClauses.flatMap(w => w.params);

      if (this.operation === 'delete') {
        const sql = `DELETE FROM "${this.table}" ${whereSql}`;
        const stmt = this.db.prepare(sql);
        const result = stmt.run(...params);
        return Promise.resolve({ data: result, error: null }).then(resolve, reject);
      }

      // SELECT
      let exactCount: number | null = null;
      if (this.countMode === 'exact') {
        const countSql = `SELECT COUNT(*) as c FROM "${this.table}" ${whereSql}`;
        const countStmt = this.db.prepare(countSql);
        const countRes = countStmt.get(...params) as { c: number } | undefined;
        exactCount = countRes?.c ?? 0;
      }

      if (this.isHead) {
        return Promise.resolve({ data: null, count: exactCount ?? 0, error: null }).then(resolve, reject);
      }

      // Format column selection
      let colsSql = '*';
      if (this.selectedCols && this.selectedCols !== '*') {
        const cols = this.selectedCols.split(',').map(c => `"${c.trim()}"`);
        colsSql = cols.join(', ');
      }

      let sql = `SELECT ${colsSql} FROM "${this.table}" ${whereSql}`;
      if (this.orderClauses.length > 0) sql += ` ORDER BY ${this.orderClauses.join(', ')}`;
      if (this.limitCount !== undefined) {
        sql += ` LIMIT ${this.limitCount}`;
        if (this.offsetCount !== undefined) {
          sql += ` OFFSET ${this.offsetCount}`;
        }
      } else if (this.offsetCount !== undefined) {
        sql += ` LIMIT -1 OFFSET ${this.offsetCount}`;
      }

      const stmt = this.db.prepare(sql);
      const rows = stmt.all(...params) as any[];

      const finalCount = exactCount !== null ? exactCount : rows.length;
      return Promise.resolve({ data: rows, count: finalCount, error: null }).then(resolve, reject);
    } catch (err: any) {
      console.error(`[LocalSupabase query error on ${this.table}]:`, err.message);
      return Promise.resolve({ data: null, count: 0, error: err }).then(resolve, reject);
    }
  }
}

const getGlobalDbState = (): { db: any; schemaInitialized: boolean } => {
  const g = globalThis as any;
  if (!g.__calibrall_sqlite_state) {
    g.__calibrall_sqlite_state = { db: null, schemaInitialized: false };
  }
  return g.__calibrall_sqlite_state;
};

declare const __non_webpack_require__: any;

export function getLocalDatabase(): any {
  if (typeof window !== 'undefined') return null;
  if (isProductionRuntime()) {
    if (!isRemoteSupabase) {
      throw new Error(persistenceBackendInfo().message);
    }
    return null;
  }
  const state = getGlobalDbState();
  if (state.db) return state.db;

  try {
    const nodeReq = typeof __non_webpack_require__ !== 'undefined' ? __non_webpack_require__ : eval('require');
    const fs = nodeReq('fs');
    const path = nodeReq('path');
    const { DatabaseSync } = nodeReq('node:sqlite');
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const dbPath = path.join(dataDir, 'supabase.db');
    const db = new DatabaseSync(dbPath);
    try {
      db.exec('PRAGMA journal_mode = WAL;');
    } catch (_) {}
    try {
      db.exec('PRAGMA busy_timeout = 5000;');
    } catch (_) {}

    if (!state.schemaInitialized) {
      // Initialize Schema
      db.exec(`
        CREATE TABLE IF NOT EXISTS teams (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          short_name TEXT,
          competition_code TEXT,
          crest_url TEXT,
          tla TEXT,
          attack_rating REAL,
          defense_rating REAL,
          corner_attack_rating REAL,
          discipline_rating REAL,
          sample_matches INTEGER,
          is_promoted INTEGER DEFAULT 0,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS matches (
          id TEXT PRIMARY KEY,
          provider_id TEXT UNIQUE NOT NULL,
          competition_code TEXT NOT NULL,
          season TEXT NOT NULL,
          matchday INTEGER,
          home_team_id TEXT NOT NULL,
          away_team_id TEXT NOT NULL,
          home_team_name TEXT NOT NULL,
          away_team_name TEXT NOT NULL,
          kickoff_time TEXT,
          kickoff_date TEXT,
          status TEXT NOT NULL DEFAULT 'FINISHED',
          home_score INTEGER,
          away_score INTEGER,
          home_half_time_score INTEGER,
          away_half_time_score INTEGER,
          home_corners INTEGER,
          away_corners INTEGER,
          home_first_half_corners INTEGER,
          away_first_half_corners INTEGER,
          home_yellow_cards INTEGER,
          away_yellow_cards INTEGER,
          home_red_cards INTEGER,
          away_red_cards INTEGER,
          home_shots INTEGER,
          away_shots INTEGER,
          home_shots_on_target INTEGER,
          away_shots_on_target INTEGER,
          home_fouls INTEGER,
          away_fouls INTEGER,
          referee TEXT,
          result TEXT,
          tournament TEXT,
          is_playoff INTEGER DEFAULT 0,
          source TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS odds_snapshots (
          id TEXT PRIMARY KEY,
          match_id TEXT NOT NULL,
          bookmaker TEXT NOT NULL,
          market_code TEXT NOT NULL,
          selection TEXT NOT NULL,
          decimal_odds REAL NOT NULL,
          observed_at TEXT,
          snapshot_type TEXT NOT NULL,
          source TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(match_id, bookmaker, market_code, source)
        );
        CREATE TABLE IF NOT EXISTS fixtures (
          id TEXT PRIMARY KEY,
          provider_id TEXT,
          home_team_id TEXT,
          away_team_id TEXT,
          home_team_name TEXT,
          away_team_name TEXT,
          kickoff_time TEXT,
          status TEXT,
          competition_code TEXT,
          competition_id TEXT,
          home_score INTEGER,
          away_score INTEGER,
          venue TEXT,
          referee TEXT,
          source TEXT,
          is_demo BOOLEAN,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS lineups (
          id TEXT PRIMARY KEY,
          fixture_id TEXT,
          home_formation TEXT,
          away_formation TEXT,
          home_lineup TEXT,
          away_lineup TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS unresolved_teams (
          id TEXT PRIMARY KEY,
          source_name TEXT NOT NULL,
          source_provider TEXT NOT NULL,
          count INTEGER NOT NULL DEFAULT 1,
          first_seen TEXT NOT NULL,
          last_seen TEXT NOT NULL,
          resolved INTEGER DEFAULT 0,
          UNIQUE(source_name, source_provider)
        );
        CREATE TABLE IF NOT EXISTS rivalries (
          id TEXT PRIMARY KEY,
          team_a_id TEXT NOT NULL,
          team_b_id TEXT NOT NULL,
          competition_code TEXT,
          rivalry_name TEXT NOT NULL,
          intensity REAL NOT NULL DEFAULT 1.0,
          source TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(team_a_id, team_b_id)
        );
        CREATE TABLE IF NOT EXISTS provider_call_logs (
          id TEXT PRIMARY KEY,
          timestamp TEXT NOT NULL,
          provider TEXT NOT NULL,
          endpoint TEXT NOT NULL,
          method TEXT NOT NULL DEFAULT 'GET',
          status_code INTEGER,
          ok INTEGER NOT NULL DEFAULT 0,
          latency_ms INTEGER,
          league_code TEXT,
          sync_mode TEXT,
          quota_headers_json TEXT,
          quota_remaining TEXT,
          response_body TEXT,
          error TEXT
        );
        CREATE TABLE IF NOT EXISTS provider_sync_state (
          id TEXT PRIMARY KEY,
          sport TEXT,
          provider_name TEXT,
          status TEXT,
          last_attempt_at TEXT,
          last_success_at TEXT,
          last_error TEXT,
          last_http_status INTEGER,
          last_response_body TEXT,
          quota_remaining TEXT,
          quota_headers_json TEXT,
          skipped_leagues_json TEXT,
          calls_used_last_run INTEGER DEFAULT 0,
          calls_today INTEGER DEFAULT 0,
          budget_date TEXT,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS bb_teams (
          id TEXT PRIMARY KEY,
          league TEXT NOT NULL,
          name TEXT NOT NULL,
          aliases TEXT NOT NULL DEFAULT '[]',
          provider_ids TEXT NOT NULL DEFAULT '{}',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS bb_games (
          id TEXT PRIMARY KEY,
          league TEXT NOT NULL,
          season TEXT NOT NULL,
          game_date TEXT NOT NULL,
          kickoff_utc TEXT,
          home_id TEXT NOT NULL,
          away_id TEXT NOT NULL,
          neutral INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'SCHEDULED',
          home_pts INTEGER,
          away_pts INTEGER,
          h1_home INTEGER,
          h1_away INTEGER,
          ot_periods INTEGER NOT NULL DEFAULT 0,
          q_scores TEXT,
          source TEXT NOT NULL,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS bb_picks (
          id TEXT PRIMARY KEY,
          game_id TEXT NOT NULL,
          sport TEXT NOT NULL DEFAULT 'basketball',
          league TEXT NOT NULL,
          season TEXT NOT NULL,
          market_code TEXT NOT NULL,
          market_category TEXT NOT NULL,
          selection TEXT NOT NULL,
          line REAL NOT NULL,
          projected_mean REAL,
          model_probability REAL NOT NULL,
          market_odds REAL,
          implied_probability REAL,
          expected_value REAL,
          model_version TEXT NOT NULL,
          model_confidence TEXT NOT NULL,
          qualification_status TEXT NOT NULL,
          is_top_pick INTEGER NOT NULL DEFAULT 0,
          record_hash TEXT,
          recorded_at TEXT DEFAULT CURRENT_TIMESTAMP,
          kickoff_utc TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS bb_settlements (
          id TEXT PRIMARY KEY,
          pick_id TEXT UNIQUE NOT NULL,
          game_id TEXT NOT NULL,
          sport TEXT NOT NULL DEFAULT 'basketball',
          settlement_status TEXT NOT NULL DEFAULT 'PENDING',
          actual_value REAL,
          actual_score TEXT,
          brier_error REAL,
          log_loss REAL,
          settled_at TEXT,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS bb_odds_snapshots (
          id TEXT PRIMARY KEY,
          game_id TEXT NOT NULL,
          league TEXT NOT NULL,
          market_category TEXT NOT NULL,
          side TEXT NOT NULL DEFAULT 'game',
          line REAL NOT NULL,
          over_odds REAL,
          under_odds REAL,
          bookmaker TEXT NOT NULL,
          observed_at TEXT NOT NULL,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Ensure columns exist on older tables
      try { db.exec('ALTER TABLE bb_picks ADD COLUMN raw_probability REAL;'); } catch (_) {}
      try { db.exec('ALTER TABLE bb_picks ADD COLUMN projected_std REAL;'); } catch (_) {}
      try { db.exec('ALTER TABLE bb_picks ADD COLUMN confidence_tier TEXT;'); } catch (_) {}
      try { db.exec('ALTER TABLE bb_picks ADD COLUMN is_model_line INTEGER NOT NULL DEFAULT 1;'); } catch (_) {}
      try { db.exec('ALTER TABLE bb_picks ADD COLUMN price_source TEXT;'); } catch (_) {}
      try { db.exec("ALTER TABLE bb_picks ADD COLUMN evidence_json TEXT DEFAULT '{}';"); } catch (_) {}
      try { db.exec('ALTER TABLE teams ADD COLUMN is_promoted INTEGER DEFAULT 0;'); } catch (_) {}
      try { db.exec('ALTER TABLE matches ADD COLUMN referee TEXT;'); } catch (_) {}
      try { db.exec('ALTER TABLE matches ADD COLUMN result TEXT;'); } catch (_) {}
      try { db.exec('ALTER TABLE matches ADD COLUMN home_fouls INTEGER;'); } catch (_) {}
      try { db.exec('ALTER TABLE matches ADD COLUMN away_fouls INTEGER;'); } catch (_) {}
      try { db.exec('ALTER TABLE matches ADD COLUMN tournament TEXT;'); } catch (_) {}
      try { db.exec('ALTER TABLE matches ADD COLUMN is_playoff INTEGER DEFAULT 0;'); } catch (_) {}
      try { db.exec('ALTER TABLE fixtures ADD COLUMN competition_id TEXT;'); } catch (_) {}
      try { db.exec('ALTER TABLE fixtures ADD COLUMN home_score INTEGER;'); } catch (_) {}
      try { db.exec('ALTER TABLE fixtures ADD COLUMN away_score INTEGER;'); } catch (_) {}
      try { db.exec('ALTER TABLE fixtures ADD COLUMN venue TEXT;'); } catch (_) {}
      try { db.exec('ALTER TABLE fixtures ADD COLUMN referee TEXT;'); } catch (_) {}
      try { db.exec('ALTER TABLE fixtures ADD COLUMN payload_json TEXT;'); } catch (_) {}
      try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_fixtures_provider_id ON fixtures(provider_id);'); } catch (_) {}
      try { db.exec('CREATE INDEX IF NOT EXISTS idx_rivalries_pair ON rivalries(team_a_id, team_b_id);'); } catch (_) {}
      try { db.exec('CREATE INDEX IF NOT EXISTS idx_provider_call_logs_ts ON provider_call_logs(timestamp DESC);'); } catch (_) {}
      try { db.exec('CREATE INDEX IF NOT EXISTS idx_matches_home_kickoff ON matches(home_team_id, kickoff_time DESC);'); } catch (_) {}
      try { db.exec('CREATE INDEX IF NOT EXISTS idx_matches_away_kickoff ON matches(away_team_id, kickoff_time DESC);'); } catch (_) {}
      state.schemaInitialized = true;
    }

    state.db = db;
    return state.db;
  } catch (err: any) {
    console.warn('[LocalSupabase] Failed to initialize local SQLite database:', err?.message || err);
    return null;
  }
}

function createNoopQueryBuilder() {
  const builder: any = {
    select: () => builder,
    delete: () => builder,
    upsert: () => Promise.resolve({ data: [], error: null }),
    eq: () => builder,
    neq: () => builder,
    in: () => builder,
    gte: () => builder,
    lte: () => builder,
    gt: () => builder,
    lt: () => builder,
    or: () => builder,
    order: () => builder,
    limit: () => builder,
    range: () => builder,
    then: (resolve: (res: any) => void, reject?: (err: any) => void) =>
      Promise.resolve({ data: [], count: 0, error: null }).then(resolve, reject),
  };
  return builder;
}

function createMisconfiguredProdQueryBuilder(errMessage: string) {
  const errObj = { message: errMessage, code: 'PERSISTENCE_MISCONFIGURED' };
  const builder: any = {
    select: () => builder,
    delete: () => builder,
    upsert: () => Promise.resolve({ data: null, error: errObj }),
    eq: () => builder,
    neq: () => builder,
    in: () => builder,
    gte: () => builder,
    lte: () => builder,
    gt: () => builder,
    lt: () => builder,
    or: () => builder,
    order: () => builder,
    limit: () => builder,
    range: () => builder,
    then: (resolve: (res: any) => void, reject?: (err: any) => void) =>
      Promise.resolve({ data: null, count: 0, error: errObj }).then(resolve, reject),
  };
  return builder;
}

function createMisconfiguredProdClient(errMessage: string): any {
  const errObj = { message: errMessage, code: 'PERSISTENCE_MISCONFIGURED' };
  return {
    from: () => createMisconfiguredProdQueryBuilder(errMessage),
    rpc: () => Promise.resolve({ data: null, error: errObj }),
    auth: {
      persistSession: false,
    },
  };
}

function createLocalSupabaseClient(): any {
  return {
    from: (table: string) => {
      const db = getLocalDatabase();
      if (!db) {
        return createNoopQueryBuilder();
      }
      return new LocalSupabaseQueryBuilder(db, table);
    },
    rpc: async (fnName: string, params?: Record<string, any>) => {
      if (fnName === 'get_fixture_teams_recent_matches') {
        try {
          const db = getLocalDatabase();
          if (!db) {
            return { data: { matches: [], odds: [], promoted_team_ids: [] }, error: null };
          }
          const teamIds: string[] = Array.isArray(params?.team_ids)
            ? Array.from(new Set(params.team_ids.filter((x: any) => typeof x === 'string' && x.trim() !== '')))
            : [];
          const perTeamLimit = Math.max(1, Math.min(200, Number(params?.per_team_limit) || 40));
          const fixtureIds: string[] = Array.isArray(params?.fixture_ids)
            ? Array.from(new Set(params.fixture_ids.filter((x: any) => typeof x === 'string' && x.trim() !== '')))
            : [];
          const refereeNames: string[] = Array.isArray(params?.referee_names)
            ? Array.from(new Set(params.referee_names.filter((x: any) => typeof x === 'string' && x.trim() !== '').map((x: string) => x.trim().toLowerCase())))
            : [];

          let matches: any[] = [];
          if (teamIds.length > 0 || refereeNames.length > 0) {
            const teamPlaceholders = teamIds.map(() => '?').join(', ');
            const refPlaceholders = refereeNames.map(() => '?').join(', ');
            const ctes: string[] = [];
            const unionSelects: string[] = [];
            const sqlParams: any[] = [];

            if (teamIds.length > 0) {
              ctes.push(`
                team_matches AS (
                  SELECT m.*, m.home_team_id AS _tid
                  FROM matches m
                  WHERE m.home_team_id IN (${teamPlaceholders})
                  UNION ALL
                  SELECT m.*, m.away_team_id AS _tid
                  FROM matches m
                  WHERE m.away_team_id IN (${teamPlaceholders})
                ),
                ranked_team AS (
                  SELECT *, ROW_NUMBER() OVER (PARTITION BY _tid ORDER BY kickoff_time DESC, id ASC) AS rn
                  FROM team_matches
                )
              `);
              sqlParams.push(...teamIds, ...teamIds);
              unionSelects.push(`SELECT id FROM ranked_team WHERE rn <= ${perTeamLimit}`);
            }

            if (refereeNames.length > 0) {
              ctes.push(`
                ranked_ref AS (
                  SELECT id, ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(referee)) ORDER BY kickoff_time DESC, id ASC) AS rn
                  FROM matches
                  WHERE referee IS NOT NULL AND LOWER(TRIM(referee)) IN (${refPlaceholders})
                )
              `);
              sqlParams.push(...refereeNames);
              unionSelects.push(`SELECT id FROM ranked_ref WHERE rn <= ${perTeamLimit}`);
            }

            const sql = `
              WITH ${ctes.join(', ')}
              SELECT * FROM matches
              WHERE id IN (${unionSelects.join(' UNION ')})
              ORDER BY kickoff_time DESC, id ASC
            `;
            matches = db.prepare(sql).all(...sqlParams) as any[];
          }

          let odds: any[] = [];
          if (fixtureIds.length > 0) {
            const oddsPlaceholders = fixtureIds.map(() => '?').join(', ');
            odds = db
              .prepare(`SELECT * FROM odds_snapshots WHERE match_id IN (${oddsPlaceholders}) ORDER BY id ASC`)
              .all(...fixtureIds) as any[];
          }

          const promotedRows = db.prepare('SELECT id FROM teams WHERE is_promoted = 1').all() as Array<{ id: string }>;
          const promotedTeamIds = promotedRows.map(r => r.id).filter(Boolean);

          return {
            data: {
              matches,
              odds,
              promoted_team_ids: promotedTeamIds,
            },
            error: null,
          };
        } catch (err: any) {
          return { data: null, error: { message: err?.message || 'Local RPC error', code: 'LOCAL_RPC_ERROR' } };
        }
      }
      if (fnName === 'get_bb_data_status_aggregates') {
        try {
          const db = getLocalDatabase();
          if (!db) {
            return {
              data: {
                totalGames: 0,
                totalTeams: 0,
                earliestDate: null,
                latestDate: null,
                gamesPerLeagueAndSeason: [],
                leagueSummary: [],
              },
              error: null,
            };
          }

          const totals = db.prepare(`
            SELECT
              COUNT(*) AS totalGames,
              MIN(game_date) AS earliestDate,
              COALESCE(MAX(CASE WHEN status = 'FINISHED' THEN game_date END), MAX(game_date)) AS latestDate
            FROM bb_games
          `).get() as { totalGames: number; earliestDate: string | null; latestDate: string | null } | undefined;

          const teamRow = db.prepare('SELECT COUNT(*) AS c FROM bb_teams').get() as { c: number } | undefined;

          const byLeagueSeason = db.prepare(`
            SELECT
              league,
              season,
              COUNT(*) AS count,
              SUM(CASE WHEN status = 'FINISHED' THEN 1 ELSE 0 END) AS finishedCount,
              SUM(CASE WHEN h1_home IS NOT NULL AND h1_away IS NOT NULL THEN 1 ELSE 0 END) AS withHalfScoresCount,
              MIN(game_date) AS earliestDate,
              COALESCE(MAX(CASE WHEN status = 'FINISHED' THEN game_date END), MAX(game_date)) AS latestDate
            FROM bb_games
            GROUP BY league, season
            ORDER BY league ASC, season DESC
          `).all() as Array<any>;

          const byLeague = db.prepare(`
            SELECT
              league,
              COUNT(*) AS count,
              SUM(CASE WHEN status = 'FINISHED' THEN 1 ELSE 0 END) AS finishedCount,
              SUM(CASE WHEN h1_home IS NOT NULL AND h1_away IS NOT NULL THEN 1 ELSE 0 END) AS withHalfScoresCount,
              MIN(game_date) AS earliestDate,
              COALESCE(MAX(CASE WHEN status = 'FINISHED' THEN game_date END), MAX(game_date)) AS latestDate
            FROM bb_games
            GROUP BY league
            ORDER BY league ASC
          `).all() as Array<any>;

          return {
            data: {
              totalGames: Number(totals?.totalGames) || 0,
              totalTeams: Number(teamRow?.c) || 0,
              earliestDate: totals?.earliestDate || null,
              latestDate: totals?.latestDate || null,
              gamesPerLeagueAndSeason: byLeagueSeason.map((r) => {
                const count = Number(r.count) || 0;
                const withHalf = Number(r.withHalfScoresCount) || 0;
                return {
                  league: r.league,
                  season: r.season,
                  count,
                  finishedCount: Number(r.finishedCount) || 0,
                  withHalfScoresCount: withHalf,
                  halfScoresPct: count > 0 ? Math.round((withHalf * 1000) / count) / 10 : 0,
                  earliestDate: r.earliestDate || null,
                  latestDate: r.latestDate || null,
                };
              }),
              leagueSummary: byLeague.map((r) => {
                const count = Number(r.count) || 0;
                const withHalf = Number(r.withHalfScoresCount) || 0;
                return {
                  league: r.league,
                  count,
                  finishedCount: Number(r.finishedCount) || 0,
                  withHalfScoresCount: withHalf,
                  halfScoresPct: count > 0 ? Math.round((withHalf * 1000) / count) / 10 : 0,
                  earliestDate: r.earliestDate || null,
                  latestDate: r.latestDate || null,
                };
              }),
            },
            error: null,
          };
        } catch (err: any) {
          return { data: null, error: { message: err?.message || 'Local BB RPC error', code: 'LOCAL_RPC_ERROR' } };
        }
      }
      if (fnName === 'get_bb_forward_summary') {
        try {
          const db = getLocalDatabase();
          if (!db) {
            return {
              data: {
                sport: 'basketball',
                totalPicks: 0,
                settledCount: 0,
                pendingCount: 0,
                wonCount: 0,
                lostCount: 0,
                pushCount: 0,
                voidCount: 0,
                brierScore: null,
                logLoss: null,
                pricedSettledCount: 0,
                yieldRoi: null,
                byLeague: [],
                byMarketCategory: [],
              },
              error: null,
            };
          }

          const totals = db.prepare(`
            SELECT
              COUNT(*) AS totalPicks,
              SUM(CASE WHEN s.settlement_status IN ('WON', 'LOST', 'PUSH') THEN 1 ELSE 0 END) AS settledCount,
              SUM(CASE WHEN COALESCE(s.settlement_status, 'PENDING') = 'PENDING' THEN 1 ELSE 0 END) AS pendingCount,
              SUM(CASE WHEN s.settlement_status = 'WON' THEN 1 ELSE 0 END) AS wonCount,
              SUM(CASE WHEN s.settlement_status = 'LOST' THEN 1 ELSE 0 END) AS lostCount,
              SUM(CASE WHEN s.settlement_status = 'PUSH' THEN 1 ELSE 0 END) AS pushCount,
              SUM(CASE WHEN s.settlement_status = 'VOID' THEN 1 ELSE 0 END) AS voidCount,
              AVG(CASE WHEN s.settlement_status IN ('WON', 'LOST') AND s.brier_error IS NOT NULL THEN s.brier_error END) AS brierScore,
              AVG(CASE WHEN s.settlement_status IN ('WON', 'LOST') AND s.log_loss IS NOT NULL THEN s.log_loss END) AS logLoss,
              SUM(CASE WHEN s.settlement_status IN ('WON', 'LOST', 'PUSH') AND p.market_odds IS NOT NULL THEN 1 ELSE 0 END) AS pricedSettledCount,
              SUM(CASE
                WHEN p.market_odds IS NOT NULL AND s.settlement_status = 'WON' THEN (p.market_odds - 1.0)
                WHEN p.market_odds IS NOT NULL AND s.settlement_status = 'LOST' THEN -1.0
                ELSE 0.0
              END) AS pricedProfitUnits
            FROM bb_picks p
            LEFT JOIN bb_settlements s ON s.pick_id = p.id
          `).get() as any;

          const pricedCount = Number(totals?.pricedSettledCount) || 0;
          const pricedRoi =
            pricedCount > 0 && totals?.pricedProfitUnits !== null && totals?.pricedProfitUnits !== undefined
              ? Math.round(((Number(totals.pricedProfitUnits) * 100) / pricedCount) * 100) / 100
              : null;

          const byLeague = db.prepare(`
            SELECT
              p.league AS league,
              COUNT(*) AS totalPicks,
              SUM(CASE WHEN s.settlement_status IN ('WON', 'LOST') THEN 1 ELSE 0 END) AS gradedCount,
              SUM(CASE WHEN s.settlement_status = 'WON' THEN 1 ELSE 0 END) AS won,
              SUM(CASE WHEN s.settlement_status = 'LOST' THEN 1 ELSE 0 END) AS lost,
              SUM(CASE WHEN s.settlement_status = 'PUSH' THEN 1 ELSE 0 END) AS pushed,
              AVG(CASE WHEN s.settlement_status IN ('WON', 'LOST') THEN s.brier_error END) AS brierScore,
              AVG(CASE WHEN s.settlement_status IN ('WON', 'LOST') THEN s.log_loss END) AS logLoss
            FROM bb_picks p
            LEFT JOIN bb_settlements s ON s.pick_id = p.id
            GROUP BY p.league
            ORDER BY p.league ASC
          `).all() as Array<any>;

          const byMarketCategory = db.prepare(`
            SELECT
              p.market_category AS marketCategory,
              COUNT(*) AS totalPicks,
              SUM(CASE WHEN s.settlement_status IN ('WON', 'LOST') THEN 1 ELSE 0 END) AS gradedCount,
              SUM(CASE WHEN s.settlement_status = 'WON' THEN 1 ELSE 0 END) AS won,
              SUM(CASE WHEN s.settlement_status = 'LOST' THEN 1 ELSE 0 END) AS lost,
              SUM(CASE WHEN s.settlement_status = 'PUSH' THEN 1 ELSE 0 END) AS pushed,
              AVG(CASE WHEN s.settlement_status IN ('WON', 'LOST') THEN s.brier_error END) AS brierScore,
              AVG(CASE WHEN s.settlement_status IN ('WON', 'LOST') THEN s.log_loss END) AS logLoss
            FROM bb_picks p
            LEFT JOIN bb_settlements s ON s.pick_id = p.id
            GROUP BY p.market_category
            ORDER BY p.market_category ASC
          `).all() as Array<any>;

          return {
            data: {
              sport: 'basketball',
              totalPicks: Number(totals?.totalPicks) || 0,
              settledCount: Number(totals?.settledCount) || 0,
              pendingCount: Number(totals?.pendingCount) || 0,
              wonCount: Number(totals?.wonCount) || 0,
              lostCount: Number(totals?.lostCount) || 0,
              pushCount: Number(totals?.pushCount) || 0,
              voidCount: Number(totals?.voidCount) || 0,
              brierScore: totals?.brierScore !== null && totals?.brierScore !== undefined ? Number(totals.brierScore) : null,
              logLoss: totals?.logLoss !== null && totals?.logLoss !== undefined ? Number(totals.logLoss) : null,
              pricedSettledCount: pricedCount,
              yieldRoi: pricedRoi,
              byLeague,
              byMarketCategory,
            },
            error: null,
          };
        } catch (err: any) {
          return { data: null, error: { message: err?.message || 'Local BB forward RPC error', code: 'LOCAL_RPC_ERROR' } };
        }
      }
      return {
        data: null,
        error: { message: `RPC function ${fnName} is not registered on local SQLite adapter`, code: 'LOCAL_RPC_UNSUPPORTED' },
      };
    },
    auth: {
      persistSession: false,
    },
  };
}

// Real Supabase Postgres client when credentials exist.
// Production refuses local SQLite fallback so fixtures/sync_state are never written to ephemeral files.
export const supabase = isRemoteSupabase
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: typeof window !== 'undefined',
      },
    })
  : isProductionRuntime()
  ? createMisconfiguredProdClient(persistenceBackendInfo().message)
  : createLocalSupabaseClient();

// Local persistent state keys for demonstration mode
const DEMO_USER_KEY = 'matchmind_demo_user';
const DEMO_PREFS_KEY = 'matchmind_demo_prefs';
const DEMO_SAVED_KEY = 'matchmind_demo_saved_fixtures';

export const DEFAULT_DEMO_USER: UserProfile = {
  id: 'usr_demo_7890',
  email: 'analyst@calibrall.app',
  fullName: 'Marcus Vance (Senior Quant)',
  role: 'admin',
  subscriptionTier: 'pro',
  subscriptionStatus: 'active',
  createdAt: '2025-01-10T10:00:00Z',
};

export const DEFAULT_DEMO_PREFERENCES: UserPreferences = {
  timezone: 'UTC',
  preferredCompetitions: ['BSA', 'PL', 'PD', 'SA', 'BL1', 'FL1'],
  favoriteTeams: ['team_man_city', 'team_arsenal', 'team_real_madrid'],
  preferredMarkets: ['total_goals', 'btts', 'total_corners', 'match_result'],
  preferredOptionTypes: [
    'win',
    'draw',
    'double_chance',
    'over_under_goals',
    'both_teams_to_score',
    'corners',
    'bookings',
    'highest_scoring_half',
    'first_half_goals',
    'second_half_result'
  ],
  minProbabilityThreshold: 0.58,
  minEdgeThreshold: 0.035,
  emailNotificationsEnabled: true,
};

// Client-side authentication helpers with demo state synchronization
export function getStoredUser(): UserProfile {
  if (typeof window === 'undefined') return DEFAULT_DEMO_USER;
  try {
    const raw = localStorage.getItem(DEMO_USER_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_DEMO_USER;
  } catch {
    return DEFAULT_DEMO_USER;
  }
}

export function setStoredUser(user: UserProfile) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(DEMO_USER_KEY, JSON.stringify(user));
  } catch (e) {
    console.error('Failed to store user profile', e);
  }
}

export function getStoredPreferences(): UserPreferences {
  if (typeof window === 'undefined') return DEFAULT_DEMO_PREFERENCES;
  try {
    const raw = localStorage.getItem(DEMO_PREFS_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_DEMO_PREFERENCES;
  } catch {
    return DEFAULT_DEMO_PREFERENCES;
  }
}

export function setStoredPreferences(prefs: UserPreferences) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(DEMO_PREFS_KEY, JSON.stringify(prefs));
  } catch (e) {
    console.error('Failed to store preferences', e);
  }
}

export function getStoredSavedFixtures(): string[] {
  if (typeof window === 'undefined') return ['fix_ars_liv', 'fix_bar_rma'];
  try {
    const raw = localStorage.getItem(DEMO_SAVED_KEY);
    return raw ? JSON.parse(raw) : ['fix_ars_liv', 'fix_bar_rma'];
  } catch {
    return ['fix_ars_liv', 'fix_bar_rma'];
  }
}

export function toggleStoredSavedFixture(fixtureId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const existing = getStoredSavedFixtures();
    let updated: string[];
    let isSaved = false;
    if (existing.includes(fixtureId)) {
      updated = existing.filter(id => id !== fixtureId);
      isSaved = false;
    } else {
      updated = [...existing, fixtureId];
      isSaved = true;
    }
    localStorage.setItem(DEMO_SAVED_KEY, JSON.stringify(updated));
    return isSaved;
  } catch (e) {
    console.error('Failed to toggle saved fixture', e);
    return false;
  }
}
