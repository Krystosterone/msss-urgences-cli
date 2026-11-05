import { parse as parseCsv } from 'csv-parse/sync';
import type { Clinic, ClinicSlots } from './types';
import { CLINIQUE_BAND_KEYS } from './types';
import { rssCodeOf } from './regions';
import { ParseError } from './errors';

/** Column names as published by the daily clinic-appointments CSV. */
const REQUIRED_HEADERS = [
  'date',
  'clinique_id_rts',
  'clinique_nom_rts',
  'clinique_id_rls',
  'clinique_nom_rls',
  'clinique_nom_groupe',
  'grp_prof_med',
  '_6h_9h',
  '_9h_12h',
  '_12h_15h',
  '_15h_18h',
  '_18h_21h',
  '_21h_6h',
] as const;

type HeaderName = (typeof REQUIRED_HEADERS)[number];

interface RawRow {
  date: string;
  clinique_id_rts: string;
  clinique_nom_rts: string;
  clinique_id_rls: string;
  clinique_nom_rls: string;
  clinique_nom_groupe: string;
  grp_prof_med: string;
  _6h_9h: string;
  _9h_12h: string;
  _12h_15h: string;
  _15h_18h: string;
  _18h_21h: string;
  _21h_6h: string;
}

/**
 * Collapse whitespace, trim, and compose accents (NFC). The clinic file mixes
 * composed and decomposed accents, even within one name ("Clinique médicale
 * Désy" decomposes the first é, not the second), so without NFC a name doesn't
 * match the same text typed or quoted elsewhere, and one clinic published both
 * ways would count as two.
 */
function clean(text: string): string {
  return text.normalize('NFC').replace(/\s+/g, ' ').trim();
}

/** Parse a numeric cell; blank / "--" / "." -> null. */
function toNumber(text: string): number | null {
  const t = clean(text);
  if (t === '' || t === '--' || t === '.') return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse the MSSS daily clinic CSV (already decoded to a UTF-8-with-BOM-stripped
 * JS string) into a flat list of clinic/day rows plus the distinct dates.
 *
 * Pure, deterministic for a given CSV. Throws ParseError (exit 2) when the
 * structure no longer matches.
 */
export function parseCliniques(csv: string): {
  clinics: Clinic[];
  dates: string[];
} {
  let raw: RawRow[];
  try {
    raw = parseCsv(csv, {
      columns: (header: string[]) => header.map((h) => h.trim()),
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      // The BOM is stripped by fetchCliniquesCsv; here as a safety net too.
      bom: true,
    }) as unknown as RawRow[];
  } catch (err) {
    throw new ParseError(`could not parse CSV: ${(err as Error).message}`);
  }

  if (raw.length === 0) throw new ParseError('CSV parsed to zero rows');

  const headers = new Set(Object.keys(raw[0] ?? {}));
  const missing = REQUIRED_HEADERS.filter((h) => !headers.has(h));
  if (missing.length > 0) {
    throw new ParseError(`CSV structure changed: missing column(s): ${missing.join(', ')}`);
  }

  const clinics: Clinic[] = [];
  const dateSet = new Set<string>();
  const KEY_TO_COL: Record<(typeof CLINIQUE_BAND_KEYS)[number], string> = {
    '6h_9h': '_6h_9h',
    '9h_12h': '_9h_12h',
    '12h_15h': '_12h_15h',
    '15h_18h': '_15h_18h',
    '18h_21h': '_18h_21h',
    '21h_6h': '_21h_6h',
  };

  for (const r of raw) {
    const date = clean(r.date);
    // Skip rows with no date — malformed, not meaningful.
    if (date === '') continue;

    dateSet.add(date);

    const slots: ClinicSlots = {
      '6h_9h': toNumber(r._6h_9h),
      '9h_12h': toNumber(r._9h_12h),
      '12h_15h': toNumber(r._12h_15h),
      '15h_18h': toNumber(r._15h_18h),
      '18h_21h': toNumber(r._18h_21h),
      '21h_6h': toNumber(r._21h_6h),
    };

    const totalOffered = CLINIQUE_BAND_KEYS.reduce((sum, k) => {
      const v = slots[k];
      return v == null ? sum : sum + v;
    }, 0);

    clinics.push({
      date,
      regionCode: clean(r.clinique_id_rts) === '' ? null : clean(r.clinique_id_rts),
      regionName: clean(r.clinique_nom_rts),
      rssCode: rssCodeOf(clean(r.clinique_id_rts)),
      rlsCode: clean(r.clinique_id_rls) === '' ? null : clean(r.clinique_id_rls),
      rlsName: clean(r.clinique_nom_rls),
      name: clean(r.clinique_nom_groupe),
      professionGroup: clean(r.grp_prof_med),
      slots,
      totalOffered,
    });
  }

  if (clinics.length === 0) throw new ParseError('CSV parsed to zero clinic rows');

  const dates = [...dateSet].sort().reverse(); // newest first (ISO dates sort lexically)

  return { clinics, dates };
}
