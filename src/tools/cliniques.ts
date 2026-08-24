import { readFile } from 'node:fs/promises';
import { fetchCliniquesCsv } from '../core/fetchCliniques';
import { parseCliniques } from '../core/parseCliniques';
import { readCliniquesCache, writeCliniquesCache, type CacheConfig } from '../core/cliniquesCache';
import type { Clinic, CliniquesReport } from '../core/types';
import { MSSS_CLINIQUES_URL } from '../core/source';

export interface CliniquesFilters {
  /** Filter to a region by name (accent-insensitive). */
  region?: string;
  /** Filter to an RLS (local service network) by name (accent-insensitive). */
  rls?: string;
  /** Filter to a clinic by name (accent-insensitive substring). */
  search?: string;
  /** A specific date (YYYY-MM-DD). Defaults to the latest date present in the source. */
  date?: string;
}

export const SOURCE_URL = MSSS_CLINIQUES_URL;

/** Normalize text for accent-insensitive matching. */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function clinicMatches(c: Clinic, filters: CliniquesFilters, wantedDate: string): boolean {
  if (c.date !== wantedDate) return false;
  if (
    filters.region &&
    !normalize(c.regionName).toLowerCase().includes(normalize(filters.region).toLowerCase())
  )
    return false;
  if (
    filters.rls &&
    !normalize(c.rlsName).toLowerCase().includes(normalize(filters.rls).toLowerCase())
  )
    return false;
  if (
    filters.search &&
    !normalize(c.name).toLowerCase().includes(normalize(filters.search).toLowerCase())
  )
    return false;
  return true;
}

/**
 * Build the filtered clinic report.
 *
 * Caching: the source is a large multi-year daily time-series. We cache the
 * *parsed* clinic list (not the raw file) so repeated `--date` queries hit the
 * cache instead of re-parsing the megabyte CSV. Serve from cache when fresh
 * unless `refresh`; on a miss, fetch + parse + cache, then return.
 */
export async function fetchCliniquesReport(opts: {
  filters?: CliniquesFilters;
  cache?: CacheConfig;
  fixture?: string;
}): Promise<CliniquesReport> {
  const filters = opts.filters ?? {};
  const cache = opts.cache ?? {};

  const cached = readCliniquesCache(cache);
  const { clinics, dates } =
    cached && cached.clinics.length > 0 && cached.dates.length > 0
      ? { clinics: cached.clinics, dates: cached.dates }
      : await loadFresh(opts.fixture, cache);

  const wantedDate = filters.date ?? dates[0]!;
  const matched = clinics.filter((c) => clinicMatches(c, filters, wantedDate));

  const report: CliniquesReport = {
    source: SOURCE_URL,
    fetchedAt: new Date().toISOString(),
    dataDate: wantedDate,
    cached: cached !== null,
    cacheAgeMinutes:
      cached !== null
        ? Math.round((Date.now() - Date.parse(cached.storedAt)) / 60_000)
        : 0,
    availableDates: dates,
    clinics: matched,
  };
  return report;
}

async function loadFresh(
  fixture: string | undefined,
  cache: CacheConfig,
): Promise<{ clinics: Clinic[]; dates: string[] }> {
  const fp = fixture ?? process.env.MSSS_URGENCES_FIXTURE;
  const text = fp ? await readFile(fp, 'utf8') : await fetchCliniquesCsv();
  const { clinics, dates } = parseCliniques(text);
  writeCliniquesCache(clinics, dates, cache);
  return { clinics, dates };
}
