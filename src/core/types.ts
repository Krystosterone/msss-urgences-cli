/**
 * Shared data contract for the MSSS hourly ER CSV.
 *
 * Design principle (mirrors index-sante-cli): fields hold the values the CSV
 * *publishes*, verbatim. Objective derived metrics (occupancy %, region
 * average, delta) are added by `core/derive` and are labelled derived. Value
 * judgements ("lower is better") live in the agent skill, not here.
 */

/** A single emergency-room facility row (CSV row with a permit number). */
export interface Facility {
  /** Stable id = MSSS permit number (`No_permis_installation`), or null for aggregate rows. */
  id: string | null;
  /** Facility name as printed in `Nom_installation` (e.g. "CHU SAINTE-JUSTINE"). */
  name: string;
  /** Establishment as printed in `Nom_etablissement` (e.g. "SANTÉ QUÉBEC - …"). */
  establishment: string;
  /** RSS (regional system) code, e.g. "06". Null only for the province-wide total. */
  regionCode: string | null;
  /** "Nombre de civières fonctionnelles". Null for aggregate rows. */
  stretchersFunctional: number | null;
  /** "Nombre de civières occupées". Null for aggregate rows. */
  stretchersOccupied: number | null;
  /** DERIVED: occupied/functional as a percentage (integer), else null when functional is 0. */
  occupancyPct: number | null;
  /** "Patients sur civière depuis plus de 24 heures". */
  over24h: number | null;
  /** "Patients sur civière depuis plus de 48 heures". */
  over48h: number | null;
  /** "Nombre total de patients présents à l'urgence". */
  totalPresent: number | null;
  /** "Nombre total de patients en attente de PEC" (prise en charge). */
  waitingForCare: number | null;
  /** DMS "durée moyenne de séjour" sur civière, decimal hours (e.g. 7.07). */
  dmsStretcher: number | null;
  /** DMS ambulatoire, decimal hours. */
  dmsAmbulatory: number | null;
  /** DMS sur civière as HH:MM display (e.g. "7:04"). */
  dmsStretcherDisplay: string | null;
  /** DMS ambulatoire as HH:MM display (e.g. "4:03"). */
  dmsAmbulatoryDisplay: string | null;
  /** True when live counts are published for this facility. */
  available: boolean;
  /** DERIVED (by core/derive): occupancyPct minus the region average. */
  deltaFromRegionAvgPct: number | null;
}

/** A Québec administrative region and its facilities. */
export interface Region {
  /** Display name from the CSV `Region` column (e.g. "Montréal"). */
  name: string;
  /** ASCII slug derived from the name (e.g. "montreal") for `--region` matching. */
  slug: string;
  /** RSS code, or null for the province-wide aggregate. */
  regionCode: string | null;
  facilities: Facility[];
  /** DERIVED (by core/derive): mean occupancyPct across available facilities. */
  averageOccupancyPct: number | null;
}

/** Top-level report emitted by the `urgences` tool. */
export interface UrgencesReport {
  /** Source URL the data was fetched from. */
  source: string;
  /** ISO-8601 timestamp stamped when the data was fetched (not cached). */
  fetchedAt: string;
  /** The CSV's own `Mise_a_jour` data timestamp (e.g. "2026-08-23T15:45"). */
  dataDate: string;
  /** True when this report was served from the local cache, false on a live fetch. */
  cached: boolean;
  /** Cache-freshness: age of the served data in minutes. */
  cacheAgeMinutes: number;
  regions: Region[];
}

/** Appointment slots offered per time band for a clinic/day. */
export interface ClinicSlots {
  /** 06h00–09h00 slots offered (may be 0 = band listed but no offers). */
  '6h_9h': number | null;
  /** 09h00–12h00 slots offered. */
  '9h_12h': number | null;
  /** 12h00–15h00 slots offered. */
  '12h_15h': number | null;
  /** 15h00–18h00 slots offered. */
  '15h_18h': number | null;
  /** 18h00–21h00 slots offered. */
  '18h_21h': number | null;
  /** 21h00–06h00 slots offered. */
  '21h_6h': number | null;
}

/** Ordered band keys for stable output. */
export const CLINIQUE_BAND_KEYS = [
  '6h_9h',
  '9h_12h',
  '12h_15h',
  '15h_18h',
  '18h_21h',
  '21h_6h',
] as const;

/** A single clinic/day row from the daily clinic-appointments CSV. */
export interface Clinic {
  /** The `date` column (YYYY-MM-DD). */
  date: string;
  /** `clinique_id_rts` — region (RTS) code. */
  regionCode: string | null;
  /** `clinique_nom_rts` — region display name, e.g. "RTS du Bas-Saint-Laurent". */
  regionName: string;
  /** `clinique_id_rls` — local service network (RLS) code. */
  rlsCode: string | null;
  /** `clinique_nom_rls` — RLS display name. */
  rlsName: string;
  /** `clinique_nom_groupe` — clinic name. */
  name: string;
  /** `grp_prof_med` — professional group, e.g. "Médecin" / "Infirmière". */
  professionGroup: string;
  /** Appointment slots offered per time band (blank cell = no offers). */
  slots: ClinicSlots;
  /** DERIVED: total slots offered across all bands for this clinic/day. */
  totalOffered: number;
}

/** Top-level report emitted by the `cliniques` tool. */
export interface CliniquesReport {
  /** Source URL the data was fetched from. */
  source: string;
  /** ISO-8601 timestamp stamped when the data was fetched (not cached). */
  fetchedAt: string;
  /** The `date` the report is for (the requested date, or the latest present). */
  dataDate: string;
  /** True when this report was served from the local cache, false on a live fetch. */
  cached: boolean;
  /** Cache-freshness: age of the served data in minutes. */
  cacheAgeMinutes: number;
  /** Distinct dates present in the source (newest first). */
  availableDates: string[];
  clinics: Clinic[];
}

/**
 * Surgical-waitlist specialties, in source column order. `column` is the CSV
 * header as published in `Chirurgie_ListeAttente.csv`; `key` is the stable
 * contract key; `label` is the human (French) name.
 */
export const CHIRURGIE_SPECIALTIES = [
  { key: 'chirurgie_generale', column: 'Chirurgie_generale', label: 'Chirurgie générale' },
  { key: 'chirurgie_orthopedique', column: 'Chirurgie_orthopedique', label: 'Chirurgie orthopédique' },
  { key: 'chirurgie_plastique', column: 'Chirurgie_plastique', label: 'Chirurgie plastique' },
  { key: 'chirurgie_vasculaire', column: 'Chirurgie_vasculaire', label: 'Chirurgie vasculaire' },
  { key: 'neurochirurgie', column: 'Neurochirurgie', label: 'Neurochirurgie' },
  { key: 'obstetrique_gynecologie', column: 'Obstetrique_et_gynecologie', label: 'Obstétrique et gynécologie' },
  { key: 'ophtalmologie', column: 'Ophtalmologie', label: 'Ophtalmologie' },
  { key: 'orl', column: 'ORL_chirurgie_cervico_faciale', label: 'ORL / chirurgie cervico-faciale' },
  { key: 'urologie', column: 'Urologie', label: 'Urologie' },
  { key: 'autres', column: 'Autres', label: 'Autres (non chirurgical, anesthésie générale)' },
] as const;

export type ChirurgieSpecialtyKey = (typeof CHIRURGIE_SPECIALTIES)[number]['key'];

/**
 * Wait-time bands (time since the surgeon's decision to operate), in order.
 * `label` is the `Delais_d'attente` value exactly as published.
 */
export const CHIRURGIE_WAIT_BANDS = [
  { key: 'under6m', label: '0 à 6 mois' },
  { key: 'from6to12m', label: '6 à 12 mois' },
  { key: 'over12m', label: "Plus d'1 an" },
] as const;

export type ChirurgieWaitBandKey = (typeof CHIRURGIE_WAIT_BANDS)[number]['key'];

/**
 * Socio-sanitary regions (RSS), from the reference table in the dataset's
 * methodology notes (listevariables_notesmetho_chirurgie_listeattente.pdf).
 */
export const RSS_REGIONS: Readonly<Record<string, string>> = {
  RSS01: 'Bas-Saint-Laurent',
  RSS02: 'Saguenay - Lac-Saint-Jean',
  RSS03: 'Capitale-Nationale',
  RSS04: 'Mauricie et Centre-du-Québec',
  RSS05: 'Estrie',
  RSS06: 'Montréal',
  RSS07: 'Outaouais',
  RSS08: 'Abitibi-Témiscamingue',
  RSS09: 'Côte-Nord',
  RSS10: 'Nord-du-Québec',
  RSS11: 'Gaspésie - Îles-de-la-Madeleine',
  RSS12: 'Chaudière-Appalaches',
  RSS13: 'Laval',
  RSS14: 'Lanaudière',
  RSS15: 'Laurentides',
  RSS16: 'Montérégie',
};

/** One parsed CSV row: a (period, wait band, region) cell group, verbatim. */
export interface ChirurgieRow {
  /** `PeriodeAttente`, e.g. "2627-P04" (fiscal 2026-2027, period 4). */
  period: string;
  band: ChirurgieWaitBandKey;
  /** `Region`, e.g. "RSS06". */
  regionCode: string;
  /** Per-specialty counts; null = blank cell (not published). */
  counts: Record<ChirurgieSpecialtyKey, number | null>;
  /** The published `Total` column for this row; null when blank. */
  total: number | null;
}

/** Patients waiting per wait band. null = not published (blank cell or no row). */
export interface ChirurgieWaitBands {
  under6m: number | null;
  from6to12m: number | null;
  over12m: number | null;
}

/** Waitlist for one specialty (or the all-specialty total) in one region. */
export interface ChirurgieWaitlist {
  /** Specialty key, or "total" for the published all-specialty `Total` column. */
  key: ChirurgieSpecialtyKey | 'total';
  label: string;
  /** Patients waiting per band, verbatim from the CSV. */
  waiting: ChirurgieWaitBands;
  /** DERIVED: sum of non-null bands. */
  total: number;
  /** DERIVED: from6to12m + over12m (null bands count as 0). */
  over6m: number;
  /** DERIVED: over6m / total as an integer %, null when total is 0. */
  pctOver6m: number | null;
  /** DERIVED: over12m / total as an integer %, null when total is 0. */
  pctOver12m: number | null;
}

/** One region's surgical waitlist for the reported period. */
export interface ChirurgieRegion {
  /** RSS code, e.g. "RSS06"; null for the DERIVED province-wide aggregate. */
  code: string | null;
  name: string;
  /** ASCII slug, e.g. "montreal". */
  slug: string;
  /** All specialties combined (from the published `Total` column). */
  overall: ChirurgieWaitlist;
  specialties: ChirurgieWaitlist[];
  /** DERIVED: overall.total in the previous period; null when absent. */
  previousPeriodTotal: number | null;
  /** DERIVED: overall.total − previousPeriodTotal; null when not comparable. */
  deltaFromPreviousPeriod: number | null;
}

/** Fiscal period decoded from a "YYZZ-Pnn" code. */
export interface ChirurgiePeriod {
  /** As published, e.g. "2627-P04". */
  code: string;
  /** e.g. "2026-2027" (April → March). */
  fiscalYear: string;
  /** 1..13 (13 four-week periods per fiscal year). */
  number: number;
}

/** Top-level report emitted by the `chirurgies` tool. */
export interface ChirurgiesReport {
  /** Source URL the data was fetched from. */
  source: string;
  /** ISO-8601 timestamp stamped when the report was produced. */
  fetchedAt: string;
  /** The period code the report is for (the requested one, or the latest present). */
  dataDate: string;
  period: ChirurgiePeriod;
  /** The period immediately before `dataDate` in the source; null for the oldest. */
  previousPeriod: string | null;
  /** True when this report was served from the local cache, false on a live fetch. */
  cached: boolean;
  /** Cache-freshness: age of the served data in minutes. */
  cacheAgeMinutes: number;
  /** Distinct periods present in the source (newest first). */
  availablePeriods: string[];
  /** RSS regions from the reference table with no rows at all in this period. */
  missingRegions: string[];
  /**
   * DERIVED: sum over every region present in this period (ignores --region,
   * honours --specialty). Excludes `missingRegions`.
   */
  province: ChirurgieRegion;
  regions: ChirurgieRegion[];
}
