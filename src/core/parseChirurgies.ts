import { parse as parseCsv } from 'csv-parse/sync';
import type { ChirurgieRow, ChirurgieSpecialtyKey, ChirurgieWaitBandKey } from './types';
import { CHIRURGIE_SPECIALTIES, CHIRURGIE_WAIT_BANDS } from './types';
import { ParseError } from './errors';

/**
 * Columns as published in `Chirurgie_ListeAttente.csv` (verified live
 * 2026-11-04). The 2021 methodology PDF names some of them differently
 * (`Periode`, `Delais_d_attente`, `Total_general`); those spellings are
 * accepted as aliases so the parse survives a rename back to the documented names.
 */
const COLUMN_ALIASES = {
  period: ['PeriodeAttente', 'Periode'],
  band: ["Delais_d'attente", 'Delais_d_attente'],
  region: ['Region'],
  total: ['Total', 'Total_general'],
} as const;

const PERIOD_RE = /^\d{4}-P\d{2}$/;
const REGION_RE = /^RSS\d{2}$/;

/** Collapse whitespace, trim, and compose accents (NFC), so "0 à 6 mois" matches either way. */
function clean(text: string | undefined): string {
  return (text ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
}

/** Parse a count cell; blank -> null (not published). Non-numeric -> ParseError. */
function toCount(text: string | undefined, where: string): number | null {
  const t = clean(text).replace(/\s/g, '');
  if (t === '') return null;
  if (!/^\d+$/.test(t)) throw new ParseError(`CSV structure changed: non-numeric count "${t}" at ${where}`);
  return Number(t);
}

/** Match a published wait-band label to its key (whitespace/apostrophe tolerant). */
function bandKey(label: string): ChirurgieWaitBandKey | null {
  const norm = (s: string) => s.replace(/[’']/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
  const want = norm(label);
  return CHIRURGIE_WAIT_BANDS.find((b) => norm(b.label) === want)?.key ?? null;
}

function pickColumn(headers: Set<string>, names: readonly string[]): string | null {
  return names.find((n) => headers.has(n)) ?? null;
}

/**
 * Parse the MSSS surgical-waitlist CSV (UTF-8, BOM already stripped or not)
 * into verbatim rows plus the distinct periods (newest first).
 *
 * Pure, deterministic for a given CSV. Throws ParseError (exit 2) when the
 * structure no longer matches: missing columns, an unknown wait band, a
 * malformed period/region code, or a non-numeric count.
 */
export function parseChirurgies(csv: string): { rows: ChirurgieRow[]; periods: string[] } {
  let raw: Record<string, string>[];
  try {
    raw = parseCsv(csv, {
      columns: (header: string[]) => header.map((h) => h.trim()),
      skip_empty_lines: true,
      trim: true,
      bom: true,
    }) as Record<string, string>[];
  } catch (err) {
    throw new ParseError(`could not parse CSV: ${(err as Error).message}`);
  }
  if (raw.length === 0) throw new ParseError('CSV parsed to zero rows');

  const headers = new Set(Object.keys(raw[0] ?? {}));
  const col = {
    period: pickColumn(headers, COLUMN_ALIASES.period),
    band: pickColumn(headers, COLUMN_ALIASES.band),
    region: pickColumn(headers, COLUMN_ALIASES.region),
    total: pickColumn(headers, COLUMN_ALIASES.total),
  };
  const missing = [
    ...Object.entries(col)
      .filter(([, v]) => v === null)
      .map(([k]) => COLUMN_ALIASES[k as keyof typeof COLUMN_ALIASES][0]),
    ...CHIRURGIE_SPECIALTIES.filter((s) => !headers.has(s.column)).map((s) => s.column),
  ];
  if (missing.length > 0) {
    throw new ParseError(`CSV structure changed: missing column(s): ${missing.join(', ')}`);
  }

  const rows: ChirurgieRow[] = [];
  const periodSet = new Set<string>();
  raw.forEach((r, i) => {
    const line = i + 2; // 1-based, after the header
    const period = clean(r[col.period!]);
    const regionCode = clean(r[col.region!]).toUpperCase();
    const bandLabel = clean(r[col.band!]);
    if (period === '' && regionCode === '' && bandLabel === '') return; // blank trailing row
    if (!PERIOD_RE.test(period)) throw new ParseError(`CSV structure changed: bad period "${period}" on line ${line}`);
    if (!REGION_RE.test(regionCode)) throw new ParseError(`CSV structure changed: bad region "${regionCode}" on line ${line}`);
    const band = bandKey(bandLabel);
    if (band === null) throw new ParseError(`CSV structure changed: unknown wait band "${bandLabel}" on line ${line}`);

    const counts = {} as Record<ChirurgieSpecialtyKey, number | null>;
    for (const s of CHIRURGIE_SPECIALTIES) counts[s.key] = toCount(r[s.column], `line ${line} ${s.column}`);

    periodSet.add(period);
    rows.push({ period, band, regionCode, counts, total: toCount(r[col.total!], `line ${line} Total`) });
  });

  if (rows.length === 0) throw new ParseError('CSV parsed to zero waitlist rows');
  // "YYZZ-Pnn" sorts chronologically as a string (fiscal years only increase).
  const periods = [...periodSet].sort().reverse();
  return { rows, periods };
}
