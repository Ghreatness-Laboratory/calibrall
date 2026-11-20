// CALIBRALL: Paginated Supabase PostgREST Query Helpers
// Eliminates PostgREST's default 1,000-row read cap across all table reads.

export const SUPABASE_PAGE_SIZE = 1000;

export interface PaginatedQueryResult<T> {
  data: T[] | null;
  error: { message: string; code?: string } | null;
}

/**
 * Fetches all rows matching a PostgREST query by paging in 1,000-row chunks via `.range(from, to)`.
 * Continues while a page returns `pageSize` rows; returns on first partial/empty page or error.
 */
export async function fetchAllRows<T = any>(
  buildPageQuery: (from: number, to: number) => PromiseLike<PaginatedQueryResult<T>>,
  options?: { pageSize?: number; maxPages?: number }
): Promise<{ data: T[]; error: { message: string; code?: string } | null }> {
  const pageSize = Math.max(1, options?.pageSize ?? SUPABASE_PAGE_SIZE);
  const maxPages = Math.max(1, options?.maxPages ?? 500);
  const allRows: T[] = [];

  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await buildPageQuery(from, to);

    if (error) {
      return { data: allRows, error };
    }

    if (!Array.isArray(data) || data.length === 0) {
      break;
    }

    allRows.push(...data);

    if (data.length < pageSize) {
      break;
    }
  }

  return { data: allRows, error: null };
}

export function chunkArray<T>(items: T[], size: number): T[][] {
  if (!items || items.length === 0) return [];
  const chunkSize = Math.max(1, size);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    out.push(items.slice(i, i + chunkSize));
  }
  return out;
}
