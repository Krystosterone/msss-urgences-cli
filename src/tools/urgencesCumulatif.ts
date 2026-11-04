import { readFile } from 'node:fs/promises';
import { fetchUtf8Csv } from '../core/fetchUtf8';
import { parseCumulatif } from '../core/parseCumulatif';
import { slugify } from '../core/parse';
import { changeBetween, facilityCounts, previousFiscalYear, snapshotOf } from '../core/deriveCumulatif';
import { readJsonCache, writeJsonCache, type CacheConfig } from '../core/jsonCache';
import { UsageError } from '../core/errors';
import { MSSS_URGENCES_CUMULATIF_URL } from '../core/source';
import {
  CUMULATIF_LEVELS,
  type CumulatifEntry,
  type CumulatifLevel,
  type CumulatifMissing,
  type CumulatifRow,
  type UrgencesCumulatifReport,
} from '../core/types';

export interface UrgencesCumulatifFilters {
  /** Region by name or slug (accent-insensitive substring) or RSS code (e.g. "06"). */
  region?: string;
  /** Facility permit number(s). Matches facility rows only. */
  ids?: string[];
  /** Entity name (accent-insensitive substring). */
  search?: string;
  /** Fiscal year "YYYY-YYYY". Default: the latest present. */
  year?: string;
  /** Baseline fiscal year for `previous`/`change`. Default: the year before `year`. */
  compare?: string;
  /** Levels to include. Default: ['facility']. */
  levels?: CumulatifLevel[];
  /** Attach every fiscal year present for each entity (`history`). */
  history?: boolean;
}

export const SOURCE_URL = MSSS_URGENCES_CUMULATIF_URL;

/** The source updates once per fiscal period (~4 weeks); a daily TTL picks up a new period within a day. */
export const DEFAULT_TTL_MINUTES = 24 * 60;

const CACHE_FILE = 'urgences-cumulatif-rows.json';

interface CachedPayload {
  rows: CumulatifRow[];
  fiscalYears: string[];
}

function isCachedPayload(p: unknown): p is CachedPayload {
  const v = p as CachedPayload | null;
  return (
    !!v &&
    Array.isArray(v.rows) &&
    v.rows.length > 0 &&
    Array.isArray(v.fiscalYears) &&
    v.fiscalYears.length > 0
  );
}

function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function rowMatches(r: CumulatifRow, f: UrgencesCumulatifFilters, levels: Set<CumulatifLevel>): boolean {
  if (!levels.has(r.level)) return false;
  if (f.ids && f.ids.length > 0 && (r.id === null || !f.ids.includes(r.id))) return false;
  if (f.region) {
    const wantSlug = slugify(f.region);
    const byCode = f.region.trim() === r.regionCode;
    const byName =
      wantSlug !== '' && (slugify(r.regionName).includes(wantSlug) || slugify(r.regionLabel).includes(wantSlug));
    if (!byCode && !byName) return false;
  }
  if (f.search && !fold(r.name).includes(fold(f.search))) return false;
  return true;
}

const LEVEL_RANK: Record<CumulatifLevel, number> = { province: 0, region: 1, establishment: 2, facility: 3 };

/** Province first, then by RSS; within a region: region total, then each establishment total followed by its facilities. */
function compareRows(a: CumulatifRow, b: CumulatifRow): number {
  const ra = a.level === 'province' ? '' : a.regionCode;
  const rb = b.level === 'province' ? '' : b.regionCode;
  if (ra !== rb) return ra < rb ? -1 : 1;
  const ea = a.establishment ?? '';
  const eb = b.establishment ?? '';
  if (ea !== eb) return ea.localeCompare(eb, 'fr');
  if (a.level !== b.level) return LEVEL_RANK[a.level] - LEVEL_RANK[b.level];
  return a.name.localeCompare(b.name, 'fr') || (a.id ?? '').localeCompare(b.id ?? '');
}

function periodOf(rows: CumulatifRow[], year: string): number | null {
  let max: number | null = null;
  for (const r of rows) if (r.fiscalYear === year && (max === null || r.period > max)) max = r.period;
  return max;
}

/**
 * Build the filtered cumulative-ER report for one fiscal year, with each
 * entity lined up against the same entity in a baseline fiscal year cumulated
 * through the same period (like-for-like year-over-year).
 *
 * Caching: the parsed rows (all years) are cached under the shared cache dir;
 * serve from cache when fresh unless `refresh`. Cache failures degrade to a
 * live fetch.
 */
export async function fetchUrgencesCumulatifReport(opts: {
  filters?: UrgencesCumulatifFilters;
  cache?: CacheConfig;
  fixture?: string;
}): Promise<UrgencesCumulatifReport> {
  const filters = opts.filters ?? {};
  const cache = opts.cache ?? {};

  const hit = readJsonCache(CACHE_FILE, cache, DEFAULT_TTL_MINUTES, isCachedPayload);
  const { rows, fiscalYears } = hit ? hit.payload : await loadFresh(opts.fixture, cache);

  const fiscalYear = filters.year ?? fiscalYears[0]!;
  if (!fiscalYears.includes(fiscalYear)) {
    throw new UsageError(`fiscal year ${fiscalYear} is not in the source (available: ${fiscalYears.join(', ')})`);
  }
  const period = periodOf(rows, fiscalYear)!;

  let compareTo: string | null = null;
  if (filters.compare !== undefined) {
    if (filters.compare === fiscalYear) {
      throw new UsageError(`--compare must differ from the reported fiscal year (${fiscalYear})`);
    }
    if (!fiscalYears.includes(filters.compare)) {
      throw new UsageError(`fiscal year ${filters.compare} is not in the source (available: ${fiscalYears.join(', ')})`);
    }
    const basePeriod = periodOf(rows, filters.compare);
    if (basePeriod !== period) {
      throw new UsageError(
        `cannot compare ${fiscalYear} (through period ${period}) with ${filters.compare} (through period ${basePeriod}): not like-for-like`,
      );
    }
    compareTo = filters.compare;
  } else {
    const prev = previousFiscalYear(fiscalYear);
    if (fiscalYears.includes(prev) && periodOf(rows, prev) === period) compareTo = prev;
  }

  const levels = filters.levels && filters.levels.length > 0 ? filters.levels : (['facility'] as CumulatifLevel[]);
  const levelSet = new Set(levels);

  const counts = facilityCounts(rows);
  const byKey = new Map<string, Map<string, CumulatifRow>>();
  for (const r of rows) {
    let years = byKey.get(r.key);
    if (!years) byKey.set(r.key, (years = new Map()));
    years.set(r.fiscalYear, r);
  }

  const selected = rows
    .filter((r) => r.fiscalYear === fiscalYear && rowMatches(r, filters, levelSet))
    .sort(compareRows);

  const entries: CumulatifEntry[] = selected.map((row) => {
    const snapshot = snapshotOf(row, counts);
    const years = byKey.get(row.key)!;
    const baseRow = compareTo ? years.get(compareTo) : undefined;
    const previous = baseRow && baseRow.period === row.period ? snapshotOf(baseRow, counts) : null;
    const { indicators: _omit, ...identity } = row;
    const entry: CumulatifEntry = {
      ...identity,
      ...snapshot,
      previous,
      change: previous ? changeBetween(snapshot, previous) : null,
    };
    if (filters.history) {
      entry.history = [...years.values()]
        .sort((a, b) => (a.fiscalYear < b.fiscalYear ? -1 : 1))
        .map((r) => snapshotOf(r, counts));
    }
    return entry;
  });

  // Entities matching the filters elsewhere in the file but absent this year:
  // judged on their most recent row (names/regions can change across years).
  const missing: { row: CumulatifRow; years: string[] }[] = [];
  for (const years of byKey.values()) {
    if (years.has(fiscalYear)) continue;
    const yearList = [...years.keys()].sort().reverse();
    const latest = years.get(yearList[0]!)!;
    if (rowMatches(latest, filters, levelSet)) missing.push({ row: latest, years: yearList });
  }
  const missingFromFiscalYear: CumulatifMissing[] = missing
    .sort((a, b) => compareRows(a.row, b.row))
    .map(({ row, years }) => ({
      level: row.level,
      id: row.id,
      key: row.key,
      name: row.name,
      regionCode: row.regionCode,
      regionName: row.regionName,
      fiscalYears: years,
    }));

  return {
    source: SOURCE_URL,
    fetchedAt: new Date().toISOString(),
    cached: hit !== null,
    cacheAgeMinutes: hit ? Math.round((Date.now() - Date.parse(hit.storedAt)) / 60_000) : 0,
    fiscalYear,
    period,
    compareTo,
    availableFiscalYears: fiscalYears,
    levels: CUMULATIF_LEVELS.filter((l) => levelSet.has(l)),
    entries,
    missingFromFiscalYear,
  };
}

async function loadFresh(fixture: string | undefined, cache: CacheConfig): Promise<CachedPayload> {
  const fp = fixture ?? process.env.MSSS_URGENCES_FIXTURE;
  const text = fp ? (await readFile(fp, 'utf8')).replace(/^﻿/, '') : await fetchUtf8Csv(SOURCE_URL);
  const parsed = parseCumulatif(text);
  writeJsonCache(CACHE_FILE, parsed, cache);
  return parsed;
}
