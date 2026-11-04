import { fetchUrgencesCsv } from '../core/fetch';
import { readFile } from 'node:fs/promises';
import { parseUrgences, slugify } from '../core/parse';
import { withDerivedMetrics } from '../core/derive';
import { readCache, writeCache, type CacheConfig } from '../core/cache';
import type { Facility, Region, UrgencesBaselineMeta, UrgencesReport } from '../core/types';
import { MSSS_URGENCES_CUMULATIF_URL, MSSS_URGENCES_URL } from '../core/source';
import { attachBaseline, buildBaselineIndex } from '../core/baseline';
import { loadCumulatifRows } from './urgencesCumulatif';
import { resolveRegion } from '../core/regions';

export interface UrgencesFilters {
  /**
   * Filter to a region: any spelling `resolveRegion` accepts (name, slug, alias,
   * unique prefix, RSS code); otherwise an exact name/slug match.
   */
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
  // Explicit ids always win: they override --available-only so that a caller
  // targeting a specific facility sees it even when it's not reporting right now.
  if (filters.ids && filters.ids.length > 0) {
    return filters.ids.includes(String(f.id ?? ''));
  }
  if (filters.availableOnly && !f.available) return false;
  if (
    filters.search &&
    !normalize(f.name).toLowerCase().includes(normalize(filters.search).toLowerCase())
  )
    return false;
  return true;
}

/** Filter regions per filters; drop regions left without facilities. */
function applyFilters(regions: Region[], filters: UrgencesFilters): Region[] {
  let out = regions;
  if (filters.region) {
    const resolved = resolveRegion(filters.region);
    const want = normalize(filters.region).toLowerCase();
    const wantSlug = slugify(filters.region);
    out = out.filter((r) => {
      if (resolved) return r.regionCode === resolved.code;
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
  /**
   * Join each facility with its fiscal-year-to-date values from the cumulative
   * ER file. `fixture` reads that file locally (default:
   * $MSSS_URGENCES_BASELINE_FIXTURE, else the network). The cumulative file
   * keeps its own 24 h cache; `cache.refresh` refreshes it too.
   */
  baseline?: boolean | { fixture?: string };
}): Promise<UrgencesReport> {
  const report = await fetchLiveReport(opts);
  if (!opts.baseline) return report;
  const fixture = typeof opts.baseline === 'object' ? opts.baseline.fixture : undefined;
  return withBaseline(report, { dir: opts.cache?.dir, refresh: opts.cache?.refresh }, fixture);
}

/**
 * Join the (already filtered) report with the cumulative file. A baseline
 * failure never loses the live data: facilities get `baseline: null` and the
 * report says why (status "unavailable"), with a one-line stderr warning.
 */
async function withBaseline(
  report: UrgencesReport,
  cache: CacheConfig,
  fixture: string | undefined,
): Promise<UrgencesReport> {
  const meta: UrgencesBaselineMeta = {
    status: 'ok',
    source: MSSS_URGENCES_CUMULATIF_URL,
    fiscalYear: null,
    period: null,
    cached: false,
    cacheAgeMinutes: null,
    matched: 0,
    unmatched: [],
  };
  try {
    const data = await loadCumulatifRows({
      cache,
      fixture: fixture ?? process.env.MSSS_URGENCES_BASELINE_FIXTURE ?? null,
    });
    const fiscalYear = data.fiscalYears[0]!;
    const index = buildBaselineIndex(data.rows, fiscalYear);
    const joined = attachBaseline(report.regions, index);
    Object.assign(meta, {
      fiscalYear,
      period: index?.period ?? null,
      cached: data.cached,
      cacheAgeMinutes: data.cacheAgeMinutes,
      matched: joined.matched,
      unmatched: joined.unmatched,
    });
    return { ...report, regions: joined.regions, baseline: meta };
  } catch (err) {
    const joined = attachBaseline(report.regions, null);
    try {
      process.stderr.write(`msss-urgences: warning — baseline unavailable (${(err as Error).message}); live data only\n`);
    } catch {
      /* never let logging break the CLI */
    }
    return {
      ...report,
      regions: joined.regions,
      baseline: { ...meta, status: 'unavailable', unmatched: joined.unmatched, error: (err as Error).message },
    };
  }
}

async function fetchLiveReport(opts: {
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
