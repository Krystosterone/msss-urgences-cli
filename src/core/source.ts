/** Canonical MSSS hourly ER open-data CSV URL (richest file: regions, wait, DMS). */
export const MSSS_URGENCES_URL =
  'https://www.msss.gouv.qc.ca/professionnels/statistiques/documents/urgences/Releve_horaire_urgences_7jours_nbpers.csv';

/** Fallback if the canonical path ever moves: the open-data catalogue mirrors it. */
export const MSSS_URGENCES_BACKUP_URL =
  'https://www.donneesquebec.ca/recherche/dataset/d4541afe-9391-44bf-a78f-dae3c9cf1217';

/** Canonical MSSS daily clinic-appointments CSV (rendez-vous offerts per clinic/band). */
export const MSSS_CLINIQUES_URL =
  'https://www.msss.gouv.qc.ca/professionnels/statistiques/documents/urgences/rdvoffert_DOuv.csv';

/** Fallback if the canonical path moves: the open-data catalogue dataset page. */
export const MSSS_CLINIQUES_BACKUP_URL =
  'https://www.donneesquebec.ca/recherche/dataset/portrait-quotidien-des-rendez-vous-en-clinique';
