export class OwnerReadError extends Error {
  readonly status = 503;
  readonly retryable = true;

  constructor(message = "Profiles are temporarily unavailable. Please try again.") {
    super(message);
    this.name = "OwnerReadError";
  }
}

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

/** Keep reading after a short page: the server's configured cap may be lower than ours. */
export async function readAllOwnerPages<T>(
  loadPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  key: (row: T) => string,
  { pageSize = 200, maxPages = 10000 }: { pageSize?: number; maxPages?: number } = {}
): Promise<T[]> {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || !Number.isSafeInteger(maxPages) || maxPages < 1) {
    throw new OwnerReadError("Invalid record pagination settings.");
  }
  const rows: T[] = [];
  const seen = new Set<string>();
  for (let page = 0; page < maxPages; page += 1) {
    const result = await loadPage(rows.length, rows.length + pageSize - 1);
    if (result.error || !Array.isArray(result.data)) {
      throw new OwnerReadError(result.error?.message || "Incomplete record response.");
    }
    if (!result.data.length) return rows;
    for (const row of result.data) {
      const identity = key(row);
      // A moving collection or an ignored range must not silently repeat/drop rows.
      if (!identity || seen.has(identity)) throw new OwnerReadError("Records changed while loading. Please try again.");
      seen.add(identity);
      rows.push(row);
    }
  }
  throw new OwnerReadError("The complete collection could not be loaded. Please try again.");
}

/** Bound IN filters and keep each table's deterministic database order within each guitar. */
export async function readOwnerBatches<T>(
  ids: string[],
  loadPage: (batch: string[], from: number, to: number) => PromiseLike<PageResult<T>>,
  key: (row: T) => string,
  batchSize = 100
): Promise<T[]> {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1) throw new OwnerReadError("Invalid record batch settings.");
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  const rows: T[] = [];
  for (let offset = 0; offset < uniqueIds.length; offset += batchSize) {
    const batch = uniqueIds.slice(offset, offset + batchSize);
    const batchRows = await readAllOwnerPages((from, to) => loadPage(batch, from, to), key);
    for (const row of batchRows) rows.push(row);
  }
  return rows;
}

export function groupOwnerRows<T extends { guitar_id: string }>(rows: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const group = groups.get(row.guitar_id) || [];
    group.push(row);
    groups.set(row.guitar_id, group);
  }
  return groups;
}

/** Private buckets have no usable public fallback. Sign once per path with bounded work. */
export async function signOwnerSources(
  paths: string[],
  sign: (path: string) => Promise<string>,
  concurrency = 6
): Promise<Map<string, string>> {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) throw new OwnerReadError("Invalid signing settings.");
  const unique = Array.from(new Set(paths.filter(Boolean)));
  const urls = new Map<string, string>();
  let next = 0;
  let failed = false;
  await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, async () => {
    while (!failed && next < unique.length) {
      const source = unique[next++];
      try {
        const url = /^(https?:|data:|blob:|\/)/i.test(source) ? source : await sign(source);
        if (!url || !/^(https?:|data:|blob:|\/)/i.test(url)) throw new OwnerReadError();
        urls.set(source, url);
      } catch {
        failed = true;
        throw new OwnerReadError("Profile files are temporarily unavailable. Please try again.");
      }
    }
  }));
  return urls;
}
