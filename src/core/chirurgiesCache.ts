import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { cacheDir, type CacheConfig } from './cache';
import type { ChirurgieRow } from './types';

export type { CacheConfig };

/**
 * Default TTL: 24h. The source changes once per fiscal period (~every 4 weeks)
 * but the publication day isn't fixed, so a daily re-check keeps the lag short
 * while the file (~250 KB) stays cheap to refetch.
 */
export const CHIRURGIES_DEFAULT_TTL_MINUTES = 24 * 60;

function cacheFilePath(dir: string): string {
  return join(dir, 'chirurgies-waitlist.json');
}

/** The cached entry: every parsed row (the whole history is small) plus write time. */
export interface ChirurgiesCacheEntry {
  rows: ChirurgieRow[];
  periods: string[];
  storedAt: string; // ISO-8601 when this cache file was written
}

/** Emit a one-line warning to stderr when the cache is present-but-unusable. */
function warnCache(reason: string): void {
  try {
    process.stderr.write(`msss-urgences: warning — ${reason}; using a live fetch instead\n`);
  } catch {
    /* never let logging break the CLI */
  }
}

/**
 * Read a fresh-enough parsed waitlist from the cache, else null. Corrupt or
 * unreadable cache files never throw — they degrade to a fresh fetch.
 */
export function readChirurgiesCache(cfg: CacheConfig = {}): ChirurgiesCacheEntry | null {
  let raw: string;
  try {
    raw = readFileSync(cacheFilePath(cacheDir(cfg)), 'utf8');
  } catch {
    return null; // no cache file yet — a clean miss
  }
  try {
    const entry = JSON.parse(raw) as ChirurgiesCacheEntry;
    if (
      !Array.isArray(entry?.rows) ||
      !Array.isArray(entry.periods) ||
      entry.rows.length === 0 ||
      entry.periods.length === 0 ||
      typeof entry.storedAt !== 'string'
    ) {
      warnCache('corrupt cache entry');
      return null;
    }
    const ageMinutes = (Date.now() - Date.parse(entry.storedAt)) / 60_000;
    if (!Number.isFinite(ageMinutes)) {
      warnCache('unreadable cache entry (invalid storedAt)');
      return null;
    }
    if (cfg.refresh) return null;
    if (ageMinutes > (cfg.ttlMinutes ?? CHIRURGIES_DEFAULT_TTL_MINUTES)) return null;
    return entry;
  } catch {
    warnCache('unreadable cache file');
    return null;
  }
}

/** Atomically write the parsed waitlist to the cache. Best-effort: never throws. */
export function writeChirurgiesCache(rows: ChirurgieRow[], periods: string[], cfg: CacheConfig = {}): void {
  try {
    const dir = cacheDir(cfg);
    mkdirSync(dir, { recursive: true });
    const entry: ChirurgiesCacheEntry = { rows, periods, storedAt: new Date().toISOString() };
    const file = cacheFilePath(dir);
    const tmp = `${file}.tmp-${process.pid}`;
    writeFileSync(tmp, JSON.stringify(entry));
    try {
      renameSync(tmp, file); // atomic replace
    } catch {
      writeFileSync(file, JSON.stringify(entry));
    }
  } catch {
    /* best-effort */
  }
}
