import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface CacheConfig {
  /** Cache directory. Defaults to $MSSS_URGENCES_CACHE_DIR or ~/.cache/msss-urgences. */
  dir?: string;
  /** Max age in minutes before a cached entry is treated as stale. */
  ttlMinutes?: number;
  /** Force a refresh, ignoring the TTL. */
  refresh?: boolean;
}

/** A cached payload plus the wall-clock time the cache file was written. */
export interface JsonCacheEntry<T> {
  payload: T;
  storedAt: string; // ISO-8601
}

/** Resolve the cache directory from env or config (shared by every tool). */
export function cacheDir(cfg: CacheConfig = {}): string {
  return cfg.dir ?? process.env.MSSS_URGENCES_CACHE_DIR ?? join(homedir(), '.cache', 'msss-urgences');
}

/**
 * Read a fresh-enough payload from `<cacheDir>/<file>`, else null.
 *
 * `isValid` checks the payload's shape; a payload that fails it, an
 * unparseable file, or an unreadable `storedAt` degrades to a miss with a
 * one-line stderr warning. A missing file is a clean miss. Never throws.
 */
export function readJsonCache<T>(
  file: string,
  cfg: CacheConfig,
  defaultTtlMinutes: number,
  isValid: (payload: unknown) => payload is T,
): JsonCacheEntry<T> | null {
  let raw: string;
  try {
    raw = readFileSync(join(cacheDir(cfg), file), 'utf8');
  } catch {
    return null; // no cache file yet
  }
  try {
    const entry = JSON.parse(raw) as Partial<JsonCacheEntry<unknown>> | null;
    if (!entry || typeof entry.storedAt !== 'string' || !isValid(entry.payload)) {
      warnCache('corrupt cache entry');
      return null;
    }
    const ageMinutes = (Date.now() - Date.parse(entry.storedAt)) / 60_000;
    if (!Number.isFinite(ageMinutes)) {
      warnCache('unreadable cache entry (invalid storedAt)');
      return null;
    }
    if (cfg.refresh) return null;
    if (ageMinutes > (cfg.ttlMinutes ?? defaultTtlMinutes)) return null;
    return { payload: entry.payload, storedAt: entry.storedAt };
  } catch {
    warnCache('unreadable cache file');
    return null;
  }
}

/**
 * Atomically write a payload to `<cacheDir>/<file>`. Best-effort: never throws.
 * Creates the directory if needed.
 */
export function writeJsonCache<T>(file: string, payload: T, cfg: CacheConfig = {}): void {
  try {
    const dir = cacheDir(cfg);
    mkdirSync(dir, { recursive: true });
    const target = join(dir, file);
    const body = JSON.stringify({ payload, storedAt: new Date().toISOString() } satisfies JsonCacheEntry<T>);
    const tmp = `${target}.tmp-${process.pid}`;
    writeFileSync(tmp, body);
    try {
      renameSync(tmp, target); // atomic replace
    } catch {
      writeFileSync(target, body);
    }
  } catch {
    /* best-effort */
  }
}

function warnCache(reason: string): void {
  try {
    process.stderr.write(`msss-urgences: warning — ${reason}; using a live fetch instead\n`);
  } catch {
    /* never let logging break the CLI */
  }
}
