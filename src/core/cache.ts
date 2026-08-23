import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { UrgencesReport } from './types';

export interface CacheConfig {
  /** Cache directory. Defaults to $MSSS_URGENCES_CACHE_DIR or ~/.cache/msss-urgences. */
  dir?: string;
  /** Max age of a cached report in minutes before it's treated as stale. Default 30. */
  ttlMinutes?: number;
  /** Force a refresh, ignoring the TTL. */
  refresh?: boolean;
}

const DEFAULT_TTL_MINUTES = 30;

/** Resolve the cache directory from env or config, falling back to ~/.cache/msss-urgences. */
export function cacheDir(cfg: CacheConfig = {}): string {
  return (
    cfg.dir ??
    process.env.MSSS_URGENCES_CACHE_DIR ??
    join(homedir(), '.cache', 'msss-urgences')
  );
}

function cacheFilePath(dir: string): string {
  return join(dir, 'urgences-report.json');
}

/** The cached entry on disk: the report plus wall-clock fetchedAt of the cache write. */
export interface CacheEntry {
  report: UrgencesReport;
  storedAt: string; // ISO-8601 when this cache file was written
}

/**
 * Read a fresh enough report from the cache if present and not stale, else null.
 * Corrupt or unreadable cache files never throw — they degrade to a miss.
 */
export function readCache(cfg: CacheConfig = {}): CacheEntry | null {
  const dir = cacheDir(cfg);
  const file = cacheFilePath(dir);
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  try {
    const entry = JSON.parse(raw) as CacheEntry;
    if (!entry?.report || typeof entry.storedAt !== 'string') return null;
    const ageMinutes = (Date.now() - Date.parse(entry.storedAt)) / 60_000;
    if (cfg.refresh) return null; // caller wants fresh data
    const ttl = cfg.ttlMinutes ?? DEFAULT_TTL_MINUTES;
    if (Number.isFinite(ageMinutes) && ageMinutes > ttl) return null;
    return entry;
  } catch {
    return null;
  }
}

/**
 * Atomically write a report to the cache. Never throws for a cache failure —
 * caching is best-effort. Creates the directory if needed.
 */
export function writeCache(report: UrgencesReport, cfg: CacheConfig = {}): void {
  try {
    const dir = cacheDir(cfg);
    mkdirSync(dir, { recursive: true });
    const entry: CacheEntry = { report, storedAt: new Date().toISOString() };
    const tmp = cacheFilePath(dir) + `.tmp-${process.pid}`;
    writeFileSync(tmp, JSON.stringify(entry));
    try {
      renameSync(tmp, cacheFilePath(dir)); // atomic replace
    } catch {
      // Cross-device or other rename failure: fall back to a direct overwrite.
      writeFileSync(cacheFilePath(dir), JSON.stringify(entry));
    }
  } catch {
    /* best-effort: never fail the CLI because caching broke */
  }
}
