import { fetchUrgencesCsv } from '../core/fetch';
import { readFile } from 'node:fs/promises';
import { parseUrgences, slugify } from '../core/parse';
import { withDerivedMetrics } from '../core/derive';
import { readCache, writeCache, type CacheConfig } from '../core/cache';
import type { Facility, Region, UrgencesReport } from '../core/types';
import { MSSS_URGENCES_URL } from '../core/source';

export interface UrgencesFilters {
  /** Filter to a region by slug or name (accent-insensitive). */
  region?: string;
  /** Filter to facility id(s) by MSSS permit number. Explicit ids override --available-only. */
  ids?: string[];
  /** Filter facilities by name (accent-insensitive substring). */
  search?: string;
  /** Only facilities currently reporting live data. */
  availableOnly?: boolean;
}

export const SOURCE_URL = MSSS_URGENCES_URL;

/** Normalize text for accent-insensitive matching. */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function facilityMatches(f: Facility, filters: UrgencesFilters): boolean {
  if (filters.availableOnly && !f.available) return false;
  if (
    filters.search &&
    !normalize(f.name).toLowerCase().includes(normalize(filters.search).toLowerCase())
  )
    return false;
  if (filters.ids && filters.ids.length > 0) {
    return filters.ids.includes(String(f.id ?? ''));
  }
  return true;
}

/** Filter regions per filters; drop regions left without facilities. */
function applyFilters(regions: Region[], filters: UrgencesFilters): Region[] {
  let out = regions;
  if (filters.region) {
    const want = normalize(filters.region).toLowerCase();
    const wantSlug = slugify(filters.region);
    out = out.filter((r) => {
      const n = normalize(r.name).toLowerCase();
      return n === want || slugify(r.name) === wantSlug;
    });
  }
  return out
    .map((r) => ({ ...r, facilities: r.facilities.filter((f) => facilityMatches(f, filters)) }))
    .filter((r) => r.facilities.length > 0);
}

/**
 * Build the full, filtered ER report.
 *
 * Caching: serve from cache when fresh unless `refresh`; else fetch (or read a
 * local fixture when `fixture` is provided, for deterministic offline runs),
 * parse, derive, cache, return. Cache failures degrade to a live fetch.
 */
export async function fetchUrgencesReport(opts: {
  filters?: UrgencesFilters;
  cache?: CacheConfig;
  fixture?: string;
}): Promise<UrgencesReport> {
  const filters = opts.filters ?? {};
  const cache = opts.cache ?? {};

  const cached = readCache(cache);
  if (cached) {
    const derived = withDerivedMetrics(cached.report.regions);
    const fresh: UrgencesReport = {
      ...cached.report,
      regions: derived,
      cached: true,
      fetchedAt: new Date().toISOString(),
      cacheAgeMinutes: Math.round((Date.now() - Date.parse(cached.storedAt)) / 60_000),
    };
    return {
      ...fresh,
      regions: applyFilters(fresh.regions, filters),
    };
  }

  // Live fetch, or a deterministic fixture when provided / env-forced.
  const fixture = opts.fixture ?? process.env.MSSS_URGENCES_FIXTURE;
  const text = fixture ? await readFile(fixture, 'utf8') : await fetchUrgencesCsv();

  const { regions, dataDate } = parseUrgences(text);
  const derived = withDerivedMetrics(regions);
  const report: UrgencesReport = {
    source: SOURCE_URL,
    fetchedAt: new Date().toISOString(),
    dataDate,
    cached: false,
    cacheAgeMinutes: 0,
    regions: derived,
  };

  writeCache(report, cache);

  return {
    ...report,
    regions: applyFilters(report.regions, filters),
  };
}
