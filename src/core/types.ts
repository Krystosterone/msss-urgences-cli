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
