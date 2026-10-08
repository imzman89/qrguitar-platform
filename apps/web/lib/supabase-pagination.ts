import { supabaseHttpsJson } from "./supabase-http";

type ReadOptions = Pick<NonNullable<Parameters<typeof supabaseHttpsJson>[1]>, "serviceRole" | "timeoutMs">;

const PAGE_SIZE = 250;
const FILTER_BATCH_SIZE = 75;

/** Read the complete ordered result, even when PostgREST caps pages below our limit. */
export async function supabasePagedRows<T>(path: string, options: ReadOptions = {}): Promise<T[]> {
  const url = new URL(path, "https://supabase.invalid");
  if (!url.searchParams.has("order")) {
    throw new Error("Paginated Supabase reads require a stable order.");
  }
  const rows: T[] = [];
  for (;;) {
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("offset", String(rows.length));
    const page = await supabaseHttpsJson<T[]>(url.pathname + url.search, options);
    if (!Array.isArray(page)) throw new Error("Supabase returned an invalid row collection.");
    // A short page can be a server-side cap, so only an empty page means completion.
    if (!page.length) return rows;
    rows.push(...page);
  }
}

/** Bound IN filters so large catalogs do not exceed proxy URL limits. */
export async function supabaseRowsByValues<T>(path: string, column: string, values: string[], options: ReadOptions = {}): Promise<T[]> {
  const uniqueValues = [...new Set(values)];
  const rows: T[] = [];
  for (let offset = 0; offset < uniqueValues.length; offset += FILTER_BATCH_SIZE) {
    const url = new URL(path, "https://supabase.invalid");
    const batch = uniqueValues.slice(offset, offset + FILTER_BATCH_SIZE);
    const quoted = batch.map((value) => '"' + value.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"');
    url.searchParams.set(column, "in.(" + quoted.join(",") + ")");
    rows.push(...await supabasePagedRows<T>(url.pathname + url.search, options));
  }
  return rows;
}
