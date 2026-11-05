import { parse as parseCsv } from 'csv-parse/sync';
import type { CumulatifIndicators, CumulatifLevel, CumulatifRow } from './types';
import { ParseError } from './errors';

/** Column names as published by `Donnees_cumulatives_Urgence.csv`. */
const REQUIRED_HEADERS = [
  'annee',
  'cumul_periode',
  'rss',
  'region',
  'nom_etablissement',
  'nom_installation',
  'no_permis_installation',
  'nb_visites_total',
  'nb_usagers_75ans_et_plus_total',
  'nb_usagers_sante_mentale_total',
  'dms_total',
  'nb_usagers_pec_total',
  'delai_pec_total',
  'nb_visites_ambulatoire',
  'nb_usagers_75ans_et_plus_amb',
  'nb_usagers_sante_mentale_amb',
  'dms_ambulatoire',
  'nb_usagers_pec_ambulatoire',
  'delai_pec_ambulatoire',
  'nb_visites_sur_civiere',
  'nb_usagers_sur_civiere_plus_24h',
  'nb_usagers_sur_civiere_plus_48h',
  'dms_sur_civiere',
  'nb_usagers_pec_sur_civiere',
  'delai_pec_sur_civiere',
  'nb_usagers_75ans_et_plus_civ',
  'nb_usagers_sante_mentale_civ',
] as const;

type RawRow = Record<(typeof REQUIRED_HEADERS)[number], string>;

/** Aggregate-row labels as published in `nom_installation`. */
const TOTAL_ESTABLISHMENT = 'total établissement';
const TOTAL_REGION = 'total régional';
const TOTAL_PROVINCE = 'total provincial';

/**
 * Official RSS (région sociosanitaire) names, used only as a fallback when the
 * published `region` label is blank or a placeholder — the source currently
 * labels RSS 10 "Error".
 */
export const RSS_NAMES: Readonly<Record<string, string>> = {
  '01': 'Bas-Saint-Laurent',
  '02': 'Saguenay-Lac-Saint-Jean',
  '03': 'Capitale-Nationale',
  '04': 'Mauricie et Centre-du-Québec',
  '05': 'Estrie',
  '06': 'Montréal',
  '07': 'Outaouais',
  '08': 'Abitibi-Témiscamingue',
  '09': 'Côte-Nord',
  '10': 'Nord-du-Québec',
  '11': 'Gaspésie-Îles-de-la-Madeleine',
  '12': 'Chaudière-Appalaches',
  '13': 'Laval',
  '14': 'Lanaudière',
  '15': 'Laurentides',
  '16': 'Montérégie',
  '17': 'Nunavik',
  '18': 'Terres-Cries-de-la-Baie-James',
  '99': 'Total provincial',
};

const PLACEHOLDER_LABELS = new Set(['', 'error', 'erreur', '.', '--']);

/** Collapse whitespace, trim, and compose accents (NFC), as the other parsers do. */
function clean(text: string | undefined): string {
  return (text ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
}

/** Parse a numeric cell; blank / "--" / "." → null. */
function toNumber(text: string): number | null {
  const t = clean(text);
  if (t === '' || t === '--' || t === '.') return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function levelOf(r: RawRow): CumulatifLevel {
  const installation = clean(r.nom_installation).toLowerCase();
  if (clean(r.rss) === '99' || installation === TOTAL_PROVINCE) return 'province';
  if (installation === TOTAL_REGION) return 'region';
  if (installation === TOTAL_ESTABLISHMENT) return 'establishment';
  return 'facility';
}

function indicatorsOf(r: RawRow): CumulatifIndicators {
  return {
    total: {
      visits: toNumber(r.nb_visites_total),
      patients75Plus: toNumber(r.nb_usagers_75ans_et_plus_total),
      mentalHealth: toNumber(r.nb_usagers_sante_mentale_total),
      dmsHours: toNumber(r.dms_total),
      pecCount: toNumber(r.nb_usagers_pec_total),
      pecDelayHours: toNumber(r.delai_pec_total),
    },
    ambulatory: {
      visits: toNumber(r.nb_visites_ambulatoire),
      patients75Plus: toNumber(r.nb_usagers_75ans_et_plus_amb),
      mentalHealth: toNumber(r.nb_usagers_sante_mentale_amb),
      dmsHours: toNumber(r.dms_ambulatoire),
      pecCount: toNumber(r.nb_usagers_pec_ambulatoire),
      pecDelayHours: toNumber(r.delai_pec_ambulatoire),
    },
    stretcher: {
      visits: toNumber(r.nb_visites_sur_civiere),
      over24h: toNumber(r.nb_usagers_sur_civiere_plus_24h),
      over48h: toNumber(r.nb_usagers_sur_civiere_plus_48h),
      dmsHours: toNumber(r.dms_sur_civiere),
      pecCount: toNumber(r.nb_usagers_pec_sur_civiere),
      pecDelayHours: toNumber(r.delai_pec_sur_civiere),
      patients75Plus: toNumber(r.nb_usagers_75ans_et_plus_civ),
      mentalHealth: toNumber(r.nb_usagers_sante_mentale_civ),
    },
  };
}

/**
 * Parse the MSSS cumulative ER CSV (decoded, BOM stripped) into one row per
 * entity × fiscal year, plus the distinct fiscal years (newest first).
 *
 * Pure and deterministic for a given CSV. Throws ParseError (exit 2) when the
 * structure no longer matches.
 */
export function parseCumulatif(csv: string): { rows: CumulatifRow[]; fiscalYears: string[] } {
  let raw: RawRow[];
  try {
    raw = parseCsv(csv, {
      columns: (header: string[]) => header.map((h) => h.trim()),
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      bom: true,
    }) as RawRow[];
  } catch (err) {
    throw new ParseError(`could not parse CSV: ${(err as Error).message}`);
  }

  if (raw.length === 0) throw new ParseError('CSV parsed to zero rows');

  const headers = new Set(Object.keys(raw[0] ?? {}));
  const missing = REQUIRED_HEADERS.filter((h) => !headers.has(h));
  if (missing.length > 0) {
    throw new ParseError(`CSV structure changed: missing column(s): ${missing.join(', ')}`);
  }

  const rows: CumulatifRow[] = [];
  const years = new Set<string>();

  for (const r of raw) {
    const fiscalYear = clean(r.annee);
    if (fiscalYear === '') continue; // malformed / trailing row
    if (!/^\d{4}-\d{4}$/.test(fiscalYear)) {
      throw new ParseError(`CSV structure changed: unexpected annee "${fiscalYear}"`);
    }
    const period = Number(clean(r.cumul_periode));
    if (!Number.isInteger(period)) {
      throw new ParseError(`CSV structure changed: unexpected cumul_periode "${clean(r.cumul_periode)}"`);
    }

    const level = levelOf(r);
    const regionCode = clean(r.rss);
    const regionLabel = clean(r.region);
    const regionName = PLACEHOLDER_LABELS.has(regionLabel.toLowerCase())
      ? (RSS_NAMES[regionCode] ?? regionLabel)
      : regionLabel;
    const establishment = clean(r.nom_etablissement);
    const permit = clean(r.no_permis_installation);

    let id: string | null = null;
    let key: string;
    let name: string;
    switch (level) {
      case 'facility':
        if (permit === '' || permit === '.') {
          throw new ParseError(`CSV structure changed: facility row without a permit ("${clean(r.nom_installation)}")`);
        }
        id = permit;
        key = `facility:${permit}`;
        name = clean(r.nom_installation);
        break;
      case 'establishment':
        key = `establishment:${regionCode}:${establishment}`;
        name = establishment;
        break;
      case 'region':
        key = `region:${regionCode}`;
        name = regionName;
        break;
      case 'province':
        key = 'province';
        name = regionLabel || RSS_NAMES['99']!;
        break;
    }

    years.add(fiscalYear);
    rows.push({
      level,
      id,
      key,
      name,
      establishment: level === 'facility' || level === 'establishment' ? establishment : null,
      regionCode,
      regionLabel,
      regionName,
      fiscalYear,
      period,
      indicators: indicatorsOf(r),
    });
  }

  if (rows.length === 0) throw new ParseError('CSV parsed to zero data rows');

  // "YYYY-YYYY" sorts lexically in chronological order.
  const fiscalYears = [...years].sort().reverse();
  return { rows, fiscalYears };
}
