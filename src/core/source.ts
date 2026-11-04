/**
 * MSSS files live on the bare `msss.gouv.qc.ca` host; `www.msss.gouv.qc.ca`
 * answers with a 301 to it, so every URL here points at the bare host directly.
 */

/** Canonical MSSS hourly ER open-data CSV URL (richest file: regions, wait, DMS). */
export const MSSS_URGENCES_URL =
  'https://msss.gouv.qc.ca/professionnels/statistiques/documents/urgences/Releve_horaire_urgences_7jours_nbpers.csv';

/** Fallback if the canonical path ever moves: the open-data catalogue mirrors it. */
export const MSSS_URGENCES_BACKUP_URL =
  'https://www.donneesquebec.ca/recherche/dataset/d4541afe-9391-44bf-a78f-dae3c9cf1217';

/** Canonical MSSS daily clinic-appointments CSV (rendez-vous offerts per clinic/band). */
export const MSSS_CLINIQUES_URL =
  'https://msss.gouv.qc.ca/professionnels/statistiques/documents/urgences/rdvoffert_DOuv.csv';

/** Fallback if the canonical path moves: the open-data catalogue dataset page. */
export const MSSS_CLINIQUES_BACKUP_URL =
  'https://www.donneesquebec.ca/recherche/dataset/portrait-quotidien-des-rendez-vous-en-clinique';

/**
 * Canonical MSSS cumulative ER CSV: per-facility indicators cumulated from
 * April 1 to the latest validated fiscal period, for the current and previous
 * fiscal years (UTF-8 with BOM). Updated once per fiscal period (~4 weeks).
 */
export const MSSS_URGENCES_CUMULATIF_URL =
  'https://msss.gouv.qc.ca/professionnels/statistiques/documents/urgences/Donnees_cumulatives_Urgence.csv';

/** Fallback if the canonical path moves: the open-data catalogue dataset page. */
export const MSSS_URGENCES_CUMULATIF_BACKUP_URL =
  'https://www.donneesquebec.ca/recherche/dataset/fichier-cumulatif-des-donnees-des-urgences';

/** Canonical MSSS surgical-waitlist CSV (updated each fiscal period, 13×/year). */
export const MSSS_CHIRURGIES_URL =
  'https://msss.gouv.qc.ca/professionnels/statistiques/documents/chirurgie/Chirurgie_ListeAttente.csv';

/** Fallback if the canonical path moves: the open-data catalogue dataset page. */
export const MSSS_CHIRURGIES_BACKUP_URL =
  'https://www.donneesquebec.ca/recherche/dataset/chirurgies-portrait-de-la-liste-d-attente';
