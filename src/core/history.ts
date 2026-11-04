/**
 * The static history API (schema v1): types, and the pure builder that turns
 * archived snapshots of the hourly ER CSV into monthly documents.
 *
 * Layout, served from GitHub Pages under <base> (e.g.
 * https://krystosterone.github.io/msss-urgences-cli/api/v1):
 *
 *   <base>/index.json                  HistoryIndex: what exists
 *   <base>/urgences/<YYYY-MM>.json     UrgencesHistoryMonth: every snapshot of a month
 *
 * Months are keyed by the snapshot's own `Mise_a_jour` (Québec local time, as
 * MSSS publishes it). A month before the latest snapshot's month is
 * `complete` and never changes again, so clients may cache it indefinitely.
 */
import { parseUrgences } from './parse';
import { MSSS_URGENCES_URL } from './source';

export const HISTORY_SCHEMA = 1;

/** Default public API base (GitHub Pages of this repo). Override with MSSS_URGENCES_API_URL or --api. */
export const DEFAULT_HISTORY_API_URL = 'https://krystosterone.github.io/msss-urgences-cli/api/v1';

/** Per-snapshot values, in this order (verbatim from the CSV; null when blank). */
export const HISTORY_FIELDS = [
  'stretchersFunctional',
  'stretchersOccupied',
  'over24h',
  'over48h',
  'totalPresent',
  'waitingForCare',
  'dmsStretcher',
  'dmsAmbulatory',
] as const;
export type HistoryField = (typeof HISTORY_FIELDS)[number];

export interface HistoryFacility {
  /** MSSS permit number (stable id). */
  id: string;
  /** Latest name/establishment/region seen for this id in the month. */
  name: string;
  establishment: string;
  regionCode: string | null;
  region: string;
  /**
   * One entry per `snapshots[i]`: the HISTORY_FIELDS values, or null when the
   * facility was absent from that snapshot.
   */
  values: Array<Array<number | null> | null>;
}

export interface UrgencesHistoryMonth {
  schema: number;
  dataset: 'urgences';
  source: string;
  month: string; // YYYY-MM
  /** True once a later month has data: this document will not change again. */
  complete: boolean;
  fields: readonly HistoryField[];
  /** Each snapshot's `Mise_a_jour` (YYYY-MM-DDTHH:MM, Québec local time), ascending, unique. */
  snapshots: string[];
  facilities: HistoryFacility[];
}

export interface HistoryMonthEntry {
  month: string;
  path: string; // relative to the API base
  snapshots: number;
  first: string;
  last: string;
  complete: boolean;
}

export interface HistoryIndex {
  schema: number;
  generatedAt: string;
  /** Commit of the archive the API was built from, when known. */
  archiveCommit: string | null;
  datasets: {
    urgences: {
      source: string;
      snapshots: number;
      first: string | null;
      last: string | null;
      /** Archived versions that could not be parsed (skipped). */
      skippedVersions: number;
      months: HistoryMonthEntry[];
    };
  };
}

/** One archived version of the hourly CSV, already decoded to text. */
export interface ArchivedVersion {
  /** Commit (or any label) the version came from; used in warnings only. */
  ref: string;
  csv: string;
}

const DATA_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/**
 * Build the monthly documents + index from archived versions, oldest first.
 * When two versions carry the same `Mise_a_jour`, the later one wins (a
 * republished correction). Versions that fail to parse are skipped and counted.
 * Pure: the caller supplies `generatedAt`.
 */
export function buildHistory(
  versions: Iterable<ArchivedVersion>,
  opts: { generatedAt: string; archiveCommit?: string | null; warn?: (msg: string) => void },
): { index: HistoryIndex; months: UrgencesHistoryMonth[] } {
  const bySnapshot = new Map<string, Map<string, { meta: Omit<HistoryFacility, 'values'>; values: Array<number | null> }>>();
  let skipped = 0;

  for (const v of versions) {
    let parsed: ReturnType<typeof parseUrgences>;
    try {
      parsed = parseUrgences(v.csv);
    } catch (err) {
      skipped++;
      opts.warn?.(`skipping ${v.ref}: ${(err as Error).message}`);
      continue;
    }
    if (!DATA_DATE_RE.test(parsed.dataDate)) {
      skipped++;
      opts.warn?.(`skipping ${v.ref}: unexpected Mise_a_jour "${parsed.dataDate}"`);
      continue;
    }
    const rows = new Map<string, { meta: Omit<HistoryFacility, 'values'>; values: Array<number | null> }>();
    for (const region of parsed.regions) {
      for (const f of region.facilities) {
        if (!f.id) continue;
        rows.set(f.id, {
          meta: {
            id: f.id,
            name: f.name,
            establishment: f.establishment,
            regionCode: f.regionCode,
            region: region.name,
          },
          values: HISTORY_FIELDS.map((k) => f[k]),
        });
      }
    }
    bySnapshot.set(parsed.dataDate, rows);
  }

  const snapshots = [...bySnapshot.keys()].sort();
  const latestMonth = snapshots.length ? snapshots[snapshots.length - 1]!.slice(0, 7) : null;
  const monthKeys = [...new Set(snapshots.map((s) => s.slice(0, 7)))];

  const months: UrgencesHistoryMonth[] = monthKeys.map((month) => {
    const snaps = snapshots.filter((s) => s.startsWith(month));
    const facilities = new Map<string, HistoryFacility>();
    snaps.forEach((snap, i) => {
      for (const [id, row] of bySnapshot.get(snap)!) {
        let f = facilities.get(id);
        if (!f) {
          f = { ...row.meta, values: new Array(snaps.length).fill(null) };
          facilities.set(id, f);
        }
        Object.assign(f, row.meta); // keep the latest naming
        f.values[i] = row.values;
      }
    });
    return {
      schema: HISTORY_SCHEMA,
      dataset: 'urgences',
      source: MSSS_URGENCES_URL,
      month,
      complete: month !== latestMonth,
      fields: HISTORY_FIELDS,
      snapshots: snaps,
      facilities: [...facilities.values()].sort((a, b) => a.id.localeCompare(b.id)),
    };
  });

  const index: HistoryIndex = {
    schema: HISTORY_SCHEMA,
    generatedAt: opts.generatedAt,
    archiveCommit: opts.archiveCommit ?? null,
    datasets: {
      urgences: {
        source: MSSS_URGENCES_URL,
        snapshots: snapshots.length,
        first: snapshots[0] ?? null,
        last: snapshots[snapshots.length - 1] ?? null,
        skippedVersions: skipped,
        months: months.map((m) => ({
          month: m.month,
          path: `urgences/${m.month}.json`,
          snapshots: m.snapshots.length,
          first: m.snapshots[0]!,
          last: m.snapshots[m.snapshots.length - 1]!,
          complete: m.complete,
        })),
      },
    },
  };
  return { index, months };
}

export function isHistoryIndex(x: unknown): x is HistoryIndex {
  const i = x as HistoryIndex | null;
  return !!i && i.schema === HISTORY_SCHEMA && Array.isArray(i.datasets?.urgences?.months);
}

export function isHistoryMonth(x: unknown): x is UrgencesHistoryMonth {
  const m = x as UrgencesHistoryMonth | null;
  return (
    !!m &&
    m.schema === HISTORY_SCHEMA &&
    m.dataset === 'urgences' &&
    Array.isArray(m.snapshots) &&
    Array.isArray(m.facilities) &&
    Array.isArray(m.fields)
  );
}
