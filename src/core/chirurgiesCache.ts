import { readJsonCache, writeJsonCache, type CacheConfig } from './jsonCache';
import type { ChirurgieRow } from './types';

export type { CacheConfig };

/**
 * Default TTL: 24h. The source changes once per fiscal period (~every 4 weeks)
 * but the publication day isn't fixed, so a daily re-check keeps the lag short
 * while the file (~250 KB) stays cheap to refetch.
 */
export const CHIRURGIES_DEFAULT_TTL_MINUTES = 24 * 60;

const CACHE_FILE = 'chirurgies-waitlist.json';

/** The cached payload: every parsed row (the whole history is small) + periods. */
export interface ChirurgiesPayload {
  rows: ChirurgieRow[];
  periods: string[];
}

function isPayload(p: unknown): p is ChirurgiesPayload {
  const v = p as Partial<ChirurgiesPayload> | null;
  return (
    !!v && Array.isArray(v.rows) && Array.isArray(v.periods) && v.rows.length > 0 && v.periods.length > 0
  );
}

/** Read a fresh-enough parsed waitlist, else null (corrupt cache → warning + miss). */
export function readChirurgiesCache(cfg: CacheConfig = {}): (ChirurgiesPayload & { storedAt: string }) | null {
  const entry = readJsonCache(CACHE_FILE, cfg, CHIRURGIES_DEFAULT_TTL_MINUTES, isPayload);
  return entry ? { ...entry.payload, storedAt: entry.storedAt } : null;
}

/** Atomically write the parsed waitlist to the cache. Best-effort: never throws. */
export function writeChirurgiesCache(rows: ChirurgieRow[], periods: string[], cfg: CacheConfig = {}): void {
  writeJsonCache<ChirurgiesPayload>(CACHE_FILE, { rows, periods }, cfg);
}
