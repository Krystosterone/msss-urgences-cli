import type {
  CumulatifChange,
  CumulatifDerived,
  CumulatifIndicators,
  CumulatifRow,
  CumulatifSnapshot,
} from './types';

function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/** a / b × 100 at 1 decimal; null when either is null or b is 0. */
function pct(a: number | null, b: number | null): number | null {
  if (a == null || b == null || b === 0) return null;
  return round((a / b) * 100, 1);
}

/** a − b; null when either side is null. Rounded to strip float noise. */
function diff(a: number | null, b: number | null, decimals: number): number | null {
  if (a == null || b == null) return null;
  return round(a - b, decimals);
}

function diffGroup<T extends object>(a: T, b: T, decimals: number): Record<keyof T, number | null> {
  const out = {} as Record<keyof T, number | null>;
  for (const k of Object.keys(a) as (keyof T)[]) {
    out[k] = diff(a[k] as number | null, b[k] as number | null, decimals);
  }
  return out;
}

/** DERIVED shares for one row. */
export function deriveShares(ind: CumulatifIndicators): CumulatifDerived {
  return {
    stretcherOver24hPct: pct(ind.stretcher.over24h, ind.stretcher.visits),
    stretcherOver48hPct: pct(ind.stretcher.over48h, ind.stretcher.visits),
    stretcherSharePct: pct(ind.stretcher.visits, ind.total.visits),
  };
}

/**
 * Count facility rows under each aggregate, per fiscal year. Keyed by
 * `<fiscalYear>|<aggregate key>`. Lets consumers spot coverage changes (a
 * region whose total jumps because facilities joined the data bank).
 */
export function facilityCounts(rows: CumulatifRow[]): Map<string, number> {
  const counts = new Map<string, number>();
  const bump = (k: string) => counts.set(k, (counts.get(k) ?? 0) + 1);
  for (const r of rows) {
    if (r.level !== 'facility') continue;
    bump(`${r.fiscalYear}|province`);
    bump(`${r.fiscalYear}|region:${r.regionCode}`);
    bump(`${r.fiscalYear}|establishment:${r.regionCode}:${r.establishment}`);
  }
  return counts;
}

/** Build the snapshot (indicators + derived shares + coverage) for a row. */
export function snapshotOf(row: CumulatifRow, counts: Map<string, number>): CumulatifSnapshot {
  return {
    fiscalYear: row.fiscalYear,
    period: row.period,
    facilityCount: row.level === 'facility' ? null : (counts.get(`${row.fiscalYear}|${row.key}`) ?? 0),
    indicators: row.indicators,
    derived: deriveShares(row.indicators),
  };
}

/**
 * DERIVED change = current − baseline for every indicator (2 decimals, so hour
 * deltas stay readable and counts stay exact) and every derived share
 * (percentage points, 1 decimal).
 */
export function changeBetween(current: CumulatifSnapshot, baseline: CumulatifSnapshot): CumulatifChange {
  return {
    total: diffGroup(current.indicators.total, baseline.indicators.total, 2),
    ambulatory: diffGroup(current.indicators.ambulatory, baseline.indicators.ambulatory, 2),
    stretcher: diffGroup(current.indicators.stretcher, baseline.indicators.stretcher, 2),
    derived: diffGroup(current.derived, baseline.derived, 1),
    facilityCount: diff(current.facilityCount, baseline.facilityCount, 0),
  };
}

/** The fiscal year before "YYYY-YYYY", e.g. "2026-2027" → "2025-2026". */
export function previousFiscalYear(fiscalYear: string): string {
  const start = Number(fiscalYear.slice(0, 4));
  return `${start - 1}-${start}`;
}
