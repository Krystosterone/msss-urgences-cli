# Design — `urgences-cumulatif` tool

## Verified source facts (checked live 2026-11-04)

- **URL:** `https://msss.gouv.qc.ca/professionnels/statistiques/documents/urgences/Donnees_cumulatives_Urgence.csv`
  (`www.msss.gouv.qc.ca` 301s here). `last-modified: 2026-10-30`, ~280 KB, 950 lines.
- **Encoding:** UTF-8 **with BOM**, CRLF line endings, no quoted fields.
- **Columns (27):** `annee, cumul_periode, rss, region, nom_etablissement,
  nom_installation, no_permis_installation, nb_visites_total,
  nb_usagers_75ans_et_plus_total, nb_usagers_sante_mentale_total, dms_total,
  nb_usagers_pec_total, delai_pec_total, nb_visites_ambulatoire,
  nb_usagers_75ans_et_plus_amb, nb_usagers_sante_mentale_amb, dms_ambulatoire,
  nb_usagers_pec_ambulatoire, delai_pec_ambulatoire, nb_visites_sur_civiere,
  nb_usagers_sur_civiere_plus_24h, nb_usagers_sur_civiere_plus_48h,
  dms_sur_civiere, nb_usagers_pec_sur_civiere, delai_pec_sur_civiere,
  nb_usagers_75ans_et_plus_civ, nb_usagers_sante_mentale_civ`
- **Grain:** one row per fiscal year (`annee` = `YYYY-YYYY`) × entity. Six
  fiscal years (2021-2022 → 2026-2027), all with `cumul_periode = 7`.
- **Mixed levels:** facility rows have a numeric permit; aggregate rows have
  permit `.` and `nom_installation` = `Total établissement` / `Total régional`
  / `Total provincial` (RSS `99`).
- **Units:** `dms_*` and `delai_pec_*` are decimal hours (same convention as
  the hourly file's DMS).
- **Quirks:** RSS 10 (Nord-du-Québec) is labelled `Error`; one blank cell pair
  (Radisson, 0 stretcher visits). 2026-2027 has no rows for RSS 04 (8
  facilities) or 4 Montréal hospitals that report in every earlier year, so
  their aggregates' 2026-2027 totals are not comparable to 2025-2026.

## Decisions

1. **Rows, not report, are cached.** Year/compare/level/filters vary per query;
   caching the parsed rows (`urgences-cumulatif-rows.json`) serves them all.
   A small generic `jsonCache.ts` holds this (existing caches untouched).
2. **TTL 24 h.** Publication is once per fiscal period (~4 weeks) at an unknown
   day; a daily TTL picks it up within a day at negligible cost.
3. **Like-for-like only.** A baseline is used only when cumulated through the
   same `period`; the default baseline is the *calendar* previous fiscal year
   (not "next in the list"), so gaps never silently compare across two years.
   An explicit mismatched `--compare` is a usage error (exit 2).
4. **Verbatim + labelled derived.** Indicators verbatim (blank → `null`).
   Derived: shares (1 dp, `null` on a 0 denominator), `change` (2 dp, strips
   float noise; counts stay exact), `facilityCount`, `regionName` (official RSS
   name only when the published label is a placeholder; `regionLabel` keeps
   the verbatim value).
5. **Coverage is first-class.** `facilityCount`/`change.facilityCount` and
   `missingFromFiscalYear` make coverage artifacts visible so the skill can
   refuse to call them trends.
6. **Default level = facility**, mirroring `urgences`; aggregates on request
   (`--level`). Stable cross-year `key` per entity.
7. **UsageError** (exit 2) for semantically bad input discovered after parsing
   (unknown fiscal year), distinct from `ParseError`'s "structure changed".

## Non-Goals

- No forecasting, ranking or scoring in the CLI (skill territory).
- No per-period (non-cumulative) series — the source does not publish one.
- No change to `urgences` / `cliniques` behavior or contracts.

## Risks

- **Schema drift** → header-validated parse + `RUN_LIVE=1` smoke test.
- **Period mismatch across years** in a future file → handled by decision 3.
- **Node fetch behind a proxy** ignores `HTTPS_PROXY`; documented
  `NODE_USE_ENV_PROXY=1` for live runs in such environments.
