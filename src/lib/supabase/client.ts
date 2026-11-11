// MATCHMIND: Supabase Client Integration & Local Development Adapter
import { createClient } from '@supabase/supabase-js';
import { UserProfile, UserPreferences } from '@/types';

// Support both server-side runtime env vars and NEXT_PUBLIC client vars
const supabaseUrl = 
  process.env.SUPABASE_URL || 
  process.env.NEXT_PUBLIC_SUPABASE_URL || 
  '';

const supabaseAnonKey = 
  process.env.SUPABASE_SERVICE_ROLE_KEY || 
  process.env.SUPABASE_ANON_KEY || 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 
  '';

const isRemoteSupabase = Boolean(
  supabaseUrl && 
  supabaseAnonKey && 
  supabaseUrl.startsWith('https://') &&
  !supabaseUrl.includes('your-project-id')
);

// We consider Supabase configured whenever remote credentials exist OR local persistence is active
export const isSupabaseConfigured = true;

export function assertPersistenceConfigured(): void {
  // Persistence is always configured via Supabase (remote or local persistent DB)
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
  private orderClause?: string;
  private limitCount?: number;
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
    this.orderClause = `ORDER BY "${column}" ${asc ? 'ASC' : 'DESC'}`;
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  async upsert(data: any | any[], options?: { onConflict?: string }) {
    try {
      const rows = Array.isArray(data) ? data : [data];
      if (rows.length === 0) {
        return { data: [], error: null };
      }

      const onConflictCols = options?.onConflict ? options.onConflict.split(',').map(c => c.trim()) : ['id'];

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
          if (val === undefined) return null;
          if (typeof val === 'boolean') return val ? 1 : 0;
          return val;
        });

        const stmt = this.db.prepare(sql);
        stmt.run(...values);
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
      if (this.orderClause) sql += ` ${this.orderClause}`;
      if (this.limitCount !== undefined) sql += ` LIMIT ${this.limitCount}`;

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

let localDbInstance: any = null;

declare const __non_webpack_require__: any;

function getLocalDatabase(): any {
  if (typeof window !== 'undefined') return null;
  if (!localDbInstance) {
    const nodeReq = typeof __non_webpack_require__ !== 'undefined' ? __non_webpack_require__ : eval('require');
    const fs = nodeReq('fs');
    const path = nodeReq('path');
    const { DatabaseSync } = nodeReq('node:sqlite');
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const dbPath = path.join(dataDir, 'supabase.db');
    localDbInstance = new DatabaseSync(dbPath);

    // Initialize Schema
    localDbInstance.exec(`
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
    `);

    // Ensure columns exist on older tables
    try { localDbInstance.exec('ALTER TABLE matches ADD COLUMN referee TEXT;'); } catch (_) {}
    try { localDbInstance.exec('ALTER TABLE matches ADD COLUMN result TEXT;'); } catch (_) {}
    try { localDbInstance.exec('ALTER TABLE matches ADD COLUMN home_fouls INTEGER;'); } catch (_) {}
    try { localDbInstance.exec('ALTER TABLE matches ADD COLUMN away_fouls INTEGER;'); } catch (_) {}
    try { localDbInstance.exec('ALTER TABLE fixtures ADD COLUMN competition_id TEXT;'); } catch (_) {}
    try { localDbInstance.exec('ALTER TABLE fixtures ADD COLUMN home_score INTEGER;'); } catch (_) {}
    try { localDbInstance.exec('ALTER TABLE fixtures ADD COLUMN away_score INTEGER;'); } catch (_) {}
    try { localDbInstance.exec('ALTER TABLE fixtures ADD COLUMN venue TEXT;'); } catch (_) {}
    try { localDbInstance.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_fixtures_provider_id ON fixtures(provider_id);'); } catch (_) {}
  }
  return localDbInstance;
}

function createLocalSupabaseClient(): any {
  return {
    from: (table: string) => {
      const db = getLocalDatabase();
      if (!db) {
        // Fallback for browser client
        return {
          select: () => Promise.resolve({ data: [], error: null }),
          upsert: () => Promise.resolve({ data: [], error: null }),
          delete: () => Promise.resolve({ data: [], error: null }),
        };
      }
      return new LocalSupabaseQueryBuilder(db, table);
    },
    auth: {
      persistSession: false,
    },
  };
}

// Real client when credentials exist, or persistent local database client
export const supabase = isRemoteSupabase
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: typeof window !== 'undefined',
      },
    })
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
  preferredCompetitions: ['PL', 'CL', 'PD', 'BL1', 'SA'],
  favoriteTeams: ['team_mancity', 'team_arsenal', 'team_realmadrid'],
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
