import { parse as parseCsv } from 'csv-parse/sync';
import type { Facility, Region } from './types';
import { ParseError } from './errors';

/** Column names, as published (before whitespace trimming — the file pads some). */
const REQUIRED_HEADERS = [
  'RSS',
  'Region',
  'Nom_etablissement',
  'Nom_installation',
  'No_permis_installation',
  'Nombre_de_civieres_fonctionnelles',
  'Nombre_de_civieres_occupees',
  'Nombre_de_patients_sur_civiere_plus_de_24_heures',
  'Nombre_de_patients_sur_civiere_plus_de_48_heures',
  'Nombre_total_de_patients_presents_a_lurgence',
  'Nombre_total_de_patients_en_attente_de_PEC',
  'DMS_sur_civiere',
  'DMS_ambulatoire',
  'DMS_sur_civiere_horaire',
  'DMS_ambulatoire_horaire',
  'Heure_de_l\'extraction_(image)',
  '_Mise_a_jour', // published with a leading space in the header
] as const;

type HeaderName = (typeof REQUIRED_HEADERS)[number];

/** The published header uses "_Mise_a_jour" (a leading space). Expose the tidy name. */
const MISE_A_JOUR_HEADER = '_Mise_a_jour' as const;

/** Collapse whitespace and trim (Latin-1 CSV sometimes pads cells). */
function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Parse a numeric cell; blank / "--" / non-numeric -> null. */
function toNumber(text: string): number | null {
  const t = clean(text);
  if (t === '' || t === '--' || t === '.') return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** ASCII slug from a display name: "Gaspésie-Îles-de-la-Madeleine" -> "gaspesie-iles-de-la-madeleine". */
export function slugify(name: string): string {
  return clean(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

interface RawRow {
  RSS: string;
  Region: string;
  Nom_etablissement: string;
  Nom_installation: string;
  No_permis_installation: string;
  Nombre_de_civieres_fonctionnelles: string;
  Nombre_de_civieres_occupees: string;
  Nombre_de_patients_sur_civiere_plus_de_24_heures: string;
  Nombre_de_patients_sur_civiere_plus_de_48_heures: string;
  Nombre_total_de_patients_presents_a_lurgence: string;
  Nombre_total_de_patients_en_attente_de_PEC: string;
  DMS_sur_civiere: string;
  DMS_ambulatoire: string;
  DMS_sur_civiere_horaire: string;
  DMS_ambulatoire_horaire: string;
  [MISE_A_JOUR_HEADER]: string;
}

/**
 * Parse the MSSS hourly ER CSV (already decoded to a JS string) into
 * regions/facilities. Pure: no network, no clock. Deterministic for a given
 * CSV. Throws ParseError (exit 2) when the structure no longer matches.
 */
export function parseUrgences(csv: string): {
  regions: Region[];
  dataDate: string;
} {
  let raw: RawRow[];
  try {
    raw = parseCsv(csv, {
      columns: (header: string[]) =>
        header.map((h) => (h.trim() === 'Mise_a_jour' ? MISE_A_JOUR_HEADER : h.trim())),
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      bom: true,
    }) as RawRow[];
  } catch (err) {
    throw new ParseError(`could not parse CSV: ${(err as Error).message}`);
  }

  if (raw.length === 0) throw new ParseError('CSV parsed to zero rows');

  // Validate the expected header names are present (after trimming each header cell).
  const headers = new Set(Object.keys(raw[0] ?? {}));
  const missing = REQUIRED_HEADERS.filter((h) => !headers.has(h));
  if (missing.length > 0) {
    throw new ParseError(`CSV structure changed: missing column(s): ${missing.join(', ')}`);
  }

  // dataDate = the file's own Mise_a_jour (taken from the last row for resilience).
  const lastRow = raw[raw.length - 1]!;
  const dataDate = clean(lastRow[MISE_A_JOUR_HEADER]);

  const facilityRows = raw.filter((r) => clean(r.No_permis_installation) !== '');
  // Aggregate rows: the CSV carries a "Total régional" row per RSS and a final
  // province-wide "Ensemble du Québec" row (RSS=99, blank permit). Both are
  // filtered via the blank-permit check above.

  const regions = new Map<string, Region>();
  for (const r of facilityRows) {
    const name = clean(r.Region);
    let region = regions.get(name);
    if (!region) {
      region = {
        name,
        slug: slugify(name),
        regionCode: clean(r.RSS) === '' ? null : clean(r.RSS),
        facilities: [],
        averageOccupancyPct: null,
      };
      regions.set(name, region);
    }

    const functional = toNumber(r.Nombre_de_civieres_fonctionnelles);
    const occupied = toNumber(r.Nombre_de_civieres_occupees);

    region.facilities.push({
      id: clean(r.No_permis_installation),
      name: clean(r.Nom_installation),
      establishment: clean(r.Nom_etablissement),
      regionCode: clean(r.RSS),
      stretchersFunctional: functional,
      stretchersOccupied: occupied,
      occupancyPct: null, // derived in derive.ts
      over24h: toNumber(r.Nombre_de_patients_sur_civiere_plus_de_24_heures),
      over48h: toNumber(r.Nombre_de_patients_sur_civiere_plus_de_48_heures),
      totalPresent: toNumber(r.Nombre_total_de_patients_presents_a_lurgence),
      waitingForCare: toNumber(r.Nombre_total_de_patients_en_attente_de_PEC),
      dmsStretcher: toNumber(r.DMS_sur_civiere),
      dmsAmbulatory: toNumber(r.DMS_ambulatoire),
      dmsStretcherDisplay: clean(r.DMS_sur_civiere_horaire) === '' ? null : clean(r.DMS_sur_civiere_horaire),
      dmsAmbulatoryDisplay: clean(r.DMS_ambulatoire_horaire) === '' ? null : clean(r.DMS_ambulatoire_horaire),
      available:
        functional !== null ||
        occupied !== null ||
        toNumber(r.Nombre_de_patients_sur_civiere_plus_de_24_heures) !== null ||
        toNumber(r.Nombre_de_patients_sur_civiere_plus_de_48_heures) !== null,
      deltaFromRegionAvgPct: null,
    });
  }

  return { regions: [...regions.values()], dataDate };
}
