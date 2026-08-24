import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { Clinic } from './types';

export interface CacheConfig {
  /** Cache directory. Defaults to $MSSS_URGENCES_CACHE_DIR or ~/.cache/msss-urgences. */
  dir?: string;
  /** Max age in minutes before a cached slice is treated as stale. Default 24h (daily data). */
  ttlMinutes?: number;
  /** Force a refresh, ignoring the TTL. */
  refresh?: boolean;
}

const DEFAULT_TTL_MINUTES = 24 * 60;

/** Resolve the cache directory from env or config (shared with the urgences tool). */
export function cacheDir(cfg: CacheConfig = {}): string {
  return (
    cfg.dir ??
    process.env.MSSS_URGENCES_CACHE_DIR ??
    join(homedir(), '.cache', 'msss-urgences')
  );
}

function cacheFilePath(dir: string): string {
  return join(dir, 'cliniques-slice.json');
}

/** The cached entry: the parsed clinic slice plus when the cache was written. */
export interface CliniquesCacheEntry {
  clinics: Clinic[];
  dates: string[];
  storedAt: string; // ISO-8601 when this cache file was written
}

/**
 * Read a fresh-enough parsed clinic slice from the cache if present and not
 * stale, else null. Corrupt or unreadable cache files never throw — they
 * degrade to a fresh fetch.
 */
export function readCliniquesCache(cfg: CacheConfig = {}): CliniquesCacheEntry | null {
  const dir = cacheDir(cfg);
  const file = cacheFilePath(dir);
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return null; // no cache file yet — a clean miss
  }
  try {
    const entry = JSON.parse(raw) as CliniquesCacheEntry;
    if (!entry?.clinics || typeof entry.storedAt !== 'string') {
      warnCache('corrupt cache entry');
      return null;
    }
    const ageMinutes = (Date.now() - Date.parse(entry.storedAt)) / 60_000;
    if (cfg.refresh) return null;
    const ttl = cfg.ttlMinutes ?? DEFAULT_TTL_MINUTES;
    if (Number.isFinite(ageMinutes) && ageMinutes > ttl) return null;
    return entry;
  } catch {
    warnCache('unreadable cache file');
    return null;
  }
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
 * Atomically write the parsed clinic slice to the cache. Never throws for a
 * cache failure — caching is best-effort. Creates the directory if needed.
 */
export function writeCliniquesCache(
  clinics: Clinic[],
  dates: string[],
  cfg: CacheConfig = {},
): void {
  try {
    const dir = cacheDir(cfg);
    mkdirSync(dir, { recursive: true });
    const entry: CliniquesCacheEntry = { clinics, dates, storedAt: new Date().toISOString() };
    const tmp = cacheFilePath(dir) + `.tmp-${process.pid}`;
    writeFileSync(tmp, JSON.stringify(entry));
    try {
      renameSync(tmp, cacheFilePath(dir)); // atomic replace
    } catch {
      writeFileSync(cacheFilePath(dir), JSON.stringify(entry));
    }
  } catch {
    /* best-effort */
  }
}
