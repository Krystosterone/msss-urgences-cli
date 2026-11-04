import { readFile } from 'node:fs/promises';
import { fetchUtf8Csv } from '../core/fetchUtf8';
import { parseChirurgies } from '../core/parseChirurgies';
import { readChirurgiesCache, writeChirurgiesCache, type CacheConfig } from '../core/chirurgiesCache';
import { slugify } from '../core/parse';
import { UsageError } from '../core/errors';
import { MSSS_CHIRURGIES_URL } from '../core/source';
import {
  CHIRURGIE_SPECIALTIES,
  RSS_REGIONS,
  type ChirurgieRegion,
  type ChirurgieRow,
  type ChirurgiePeriod,
  type ChirurgieSpecialtyKey,
  type ChirurgieWaitBands,
  type ChirurgieWaitlist,
  type ChirurgiesReport,
} from '../core/types';

export interface ChirurgiesFilters {
  /** Region by name/slug (accent-insensitive substring) or RSS code ("RSS06", "06", "6"). */
  region?: string;
  /** Specialty by label or key (accent-insensitive substring), e.g. "ortho". */
  specialty?: string;
  /** A fiscal period code, e.g. "2627-P04". Defaults to the latest present. */
  period?: string;
}

export const SOURCE_URL = MSSS_CHIRURGIES_URL;
const PROVINCE_NAME = 'Ensemble du Québec';

/** Normalize text for accent-insensitive matching. */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Decode "2627-P04" → { fiscalYear: "2026-2027", number: 4 }. */
export function decodePeriod(code: string): ChirurgiePeriod {
  const m = /^(\d{2})(\d{2})-P(\d{2})$/.exec(code);
  if (!m) return { code, fiscalYear: '', number: 0 };
  return { code, fiscalYear: `20${m[1]}-20${m[2]}`, number: Number(m[3]) };
}

/** Resolve a --specialty filter to the matching specialty keys (all when absent). */
export function resolveSpecialties(filter: string | undefined): ChirurgieSpecialtyKey[] {
  if (!filter) return CHIRURGIE_SPECIALTIES.map((s) => s.key);
  const want = normalize(filter).replace(/[^a-z0-9]+/g, ' ').trim();
  const hits = CHIRURGIE_SPECIALTIES.filter((s) => {
    const hay = `${normalize(s.label)} ${s.key.replace(/_/g, ' ')}`.replace(/[^a-z0-9]+/g, ' ');
    return hay.includes(want);
  }).map((s) => s.key);
  if (hits.length === 0) {
    throw new UsageError(
      `unknown specialty "${filter}". Known: ${CHIRURGIE_SPECIALTIES.map((s) => s.key).join(', ')}`,
    );
  }
  return hits;
}

function regionMatches(code: string, name: string, filter: string): boolean {
  const f = filter.trim();
  const asCode = /^(?:rss)?\s*(\d{1,2})$/i.exec(f);
  if (asCode) return code === `RSS${asCode[1]!.padStart(2, '0')}`;
  const want = slugify(f);
  return want !== '' && slugify(name).includes(want);
}

/** Build a waitlist (verbatim bands + derived totals/percentages). */
function waitlist(key: ChirurgieWaitlist['key'], label: string, waiting: ChirurgieWaitBands): ChirurgieWaitlist {
  const total = (waiting.under6m ?? 0) + (waiting.from6to12m ?? 0) + (waiting.over12m ?? 0);
  const over6m = (waiting.from6to12m ?? 0) + (waiting.over12m ?? 0);
  const pct = (n: number) => (total === 0 ? null : Math.round((100 * n) / total));
  return { key, label, waiting, total, over6m, pctOver6m: pct(over6m), pctOver12m: pct(waiting.over12m ?? 0) };
}

const emptyBands = (): ChirurgieWaitBands => ({ under6m: null, from6to12m: null, over12m: null });

/** Add `v` into a band cell; null + null stays null (nothing published anywhere). */
function addInto(bands: ChirurgieWaitBands, band: keyof ChirurgieWaitBands, v: number | null): void {
  if (v === null) return;
  bands[band] = (bands[band] ?? 0) + v;
}

/** Aggregate a set of rows (one region, or every region) into a ChirurgieRegion. */
function buildRegion(
  code: string | null,
  name: string,
  rows: ChirurgieRow[],
  specialties: ChirurgieSpecialtyKey[],
  previousPeriodTotal: number | null,
): ChirurgieRegion {
  const overallBands = emptyBands();
  const perSpecialty = new Map(specialties.map((k) => [k, emptyBands()]));
  for (const r of rows) {
    addInto(overallBands, r.band, r.total);
    for (const [k, bands] of perSpecialty) addInto(bands, r.band, r.counts[k]);
  }
  const overall = waitlist('total', 'Toutes spécialités', overallBands);
  return {
    code,
    name,
    slug: slugify(name),
    overall,
    specialties: CHIRURGIE_SPECIALTIES.filter((s) => perSpecialty.has(s.key)).map((s) =>
      waitlist(s.key, s.label, perSpecialty.get(s.key)!),
    ),
    previousPeriodTotal,
    deltaFromPreviousPeriod: previousPeriodTotal === null ? null : overall.total - previousPeriodTotal,
  };
}

/** Sum of the published `Total` column over rows (null when nothing published). */
function sumTotals(rows: ChirurgieRow[]): number | null {
  const vals = rows.map((r) => r.total).filter((v): v is number => v !== null);
  return vals.length === 0 ? null : vals.reduce((a, b) => a + b, 0);
}

function groupByRegion(rows: ChirurgieRow[]): Map<string, ChirurgieRow[]> {
  const out = new Map<string, ChirurgieRow[]>();
  for (const r of rows) {
    if (!out.has(r.regionCode)) out.set(r.regionCode, []);
    out.get(r.regionCode)!.push(r);
  }
  return new Map([...out.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

/** Assemble the report for one period from parsed rows. Pure (except timestamps). */
export function buildChirurgiesReport(
  rows: ChirurgieRow[],
  periods: string[],
  filters: ChirurgiesFilters,
  meta: { cached: boolean; cacheAgeMinutes: number },
): ChirurgiesReport {
  const period = filters.period ?? periods[0]!;
  const idx = periods.indexOf(period);
  if (idx === -1) {
    throw new UsageError(
      `period ${period} is not in the source. Latest: ${periods.slice(0, 6).join(', ')}` +
        ` (${periods.length} periods, oldest ${periods[periods.length - 1]})`,
    );
  }
  const previousPeriod = periods[idx + 1] ?? null;
  const specialties = resolveSpecialties(filters.specialty);

  const current = groupByRegion(rows.filter((r) => r.period === period));
  const previous = previousPeriod
    ? groupByRegion(rows.filter((r) => r.period === previousPeriod))
    : new Map<string, ChirurgieRow[]>();

  const regions: ChirurgieRegion[] = [];
  for (const [code, regionRows] of current) {
    const name = RSS_REGIONS[code] ?? code;
    const prevRows = previous.get(code);
    regions.push(buildRegion(code, name, regionRows, specialties, prevRows ? sumTotals(prevRows) : null));
  }

  // Province: like-for-like only — compare with the previous period when it
  // covers exactly the same set of regions, otherwise the delta is meaningless.
  const sameRegionSet =
    previous.size === current.size && [...current.keys()].every((c) => previous.has(c));
  const province = buildRegion(
    null,
    PROVINCE_NAME,
    [...current.values()].flat(),
    specialties,
    previousPeriod && sameRegionSet ? sumTotals([...previous.values()].flat()) : null,
  );

  return {
    source: SOURCE_URL,
    fetchedAt: new Date().toISOString(),
    dataDate: period,
    period: decodePeriod(period),
    previousPeriod,
    cached: meta.cached,
    cacheAgeMinutes: meta.cacheAgeMinutes,
    availablePeriods: periods,
    missingRegions: Object.keys(RSS_REGIONS).filter((c) => !current.has(c)),
    province,
    regions: filters.region ? regions.filter((r) => regionMatches(r.code!, r.name, filters.region!)) : regions,
  };
}

/**
 * Build the filtered surgical-waitlist report.
 *
 * Caching: the whole history (~4k rows) is parsed once and cached as JSON;
 * any --period query is then served from the cache until the TTL lapses.
 */
export async function fetchChirurgiesReport(opts: {
  filters?: ChirurgiesFilters;
  cache?: CacheConfig;
  fixture?: string;
}): Promise<ChirurgiesReport> {
  const cache = opts.cache ?? {};
  const cached = readChirurgiesCache(cache);
  const { rows, periods } = cached ?? (await loadFresh(opts.fixture, cache));
  return buildChirurgiesReport(rows, periods, opts.filters ?? {}, {
    cached: cached !== null,
    cacheAgeMinutes: cached ? Math.round((Date.now() - Date.parse(cached.storedAt)) / 60_000) : 0,
  });
}

async function loadFresh(
  fixture: string | undefined,
  cache: CacheConfig,
): Promise<{ rows: ChirurgieRow[]; periods: string[] }> {
  const fp = fixture ?? process.env.MSSS_URGENCES_FIXTURE;
  const text = fp ? await readFile(fp, 'utf8') : await fetchUtf8Csv(SOURCE_URL);
  const parsed = parseChirurgies(text);
  writeChirurgiesCache(parsed.rows, parsed.periods, cache);
  return parsed;
}
