import { deriveShares } from './deriveCumulatif';
import type { CumulatifRow, Facility, FacilityBaseline, FacilityVsBaseline, Region } from './types';

/** The baseline rows for one fiscal year, keyed by permit number. */
export interface BaselineIndex {
  fiscalYear: string;
  period: number;
  byId: Map<string, FacilityBaseline>;
}

/**
 * Index the cumulative file's facility rows for `fiscalYear` by permit number.
 * Pure. Returns null when the year has no facility rows.
 */
export function buildBaselineIndex(rows: CumulatifRow[], fiscalYear: string): BaselineIndex | null {
  const byId = new Map<string, FacilityBaseline>();
  let period: number | null = null;
  for (const r of rows) {
    if (r.level !== 'facility' || r.fiscalYear !== fiscalYear || r.id === null) continue;
    const derived = deriveShares(r.indicators);
    byId.set(r.id, {
      fiscalYear: r.fiscalYear,
      period: r.period,
      dmsStretcher: r.indicators.stretcher.dmsHours,
      dmsAmbulatory: r.indicators.ambulatory.dmsHours,
      pecDelayHours: r.indicators.total.pecDelayHours,
      stretcherOver24hPct: derived.stretcherOver24hPct,
      stretcherOver48hPct: derived.stretcherOver48hPct,
    });
    if (period === null || r.period > period) period = r.period;
  }
  return period === null ? null : { fiscalYear, period, byId };
}

function hoursDiff(live: number | null, base: number | null): number | null {
  if (live == null || base == null) return null;
  return Math.round((live - base) * 100) / 100;
}

function pctDiff(live: number | null, base: number | null): number | null {
  if (live == null || base == null || base === 0) return null;
  return Math.round(((live - base) / base) * 100);
}

/** DERIVED live − baseline for the two length-of-stay indicators both files publish. */
export function vsBaseline(f: Facility, b: FacilityBaseline): FacilityVsBaseline {
  return {
    dmsStretcherHours: hoursDiff(f.dmsStretcher, b.dmsStretcher),
    dmsStretcherPct: pctDiff(f.dmsStretcher, b.dmsStretcher),
    dmsAmbulatoryHours: hoursDiff(f.dmsAmbulatory, b.dmsAmbulatory),
    dmsAmbulatoryPct: pctDiff(f.dmsAmbulatory, b.dmsAmbulatory),
  };
}

/**
 * Attach `baseline` / `vsBaseline` to every facility (null when the index is
 * null or has no row for its permit). Pure: returns new objects.
 */
export function attachBaseline(
  regions: Region[],
  index: BaselineIndex | null,
): { regions: Region[]; matched: number; unmatched: string[] } {
  let matched = 0;
  const unmatched: string[] = [];
  const out = regions.map((region) => ({
    ...region,
    facilities: region.facilities.map((f) => {
      const b = (f.id !== null && index?.byId.get(f.id)) || null;
      if (b) matched += 1;
      else if (f.id !== null) unmatched.push(f.id);
      return { ...f, baseline: b, vsBaseline: b ? vsBaseline(f, b) : null };
    }),
  }));
  return { regions: out, matched, unmatched };
}
