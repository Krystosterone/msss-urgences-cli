# Design — region registry + `urgences --baseline`

## Verified source facts (checked live 2026-11-04)

- Region codes per file: hourly `RSS` = `01`…`16`, `99` (province); cumulative
  `rss` = same, RSS 10 labelled `Error`; surgery `Region` = `RSS01`…`RSS16`;
  clinics `clinique_id_rts` = three digits whose first two are the RSS (`061`–
  `065` Montréal, `111`/`112` Gaspésie/Îles, `161`–`163` Montérégie, `100`).
- Permit numbers (`No_permis_installation` / `no_permis_installation`) are the
  same identifiers in the hourly and cumulative files. Live join on
  2026-11-04: 108 of 120 hourly facilities have a 2026-2027 cumulative row.
- MSSS methodology notes for the hourly file
  (`listevariables_notesmetho_relevehoraireurgence_20230202.pdf`): the
  hourly lengths of stay (`DMS_sur_civiere`, `DMS_ambulatoire`) are **the
  previous day's** ("données de la veille"), computed over patients who left
  the ER that day, arrival → departure. The cumulative file's `dms_*` are the
  same measure over April 1 → end of the period.

## Decisions

1. **Resolve, then fall back.** A registry hit means "this RSS region" in every
   tool; a miss keeps each tool's previous matching, so finer filters (a
   cliniques RTS name/code, a cumulatif name substring) keep working and no
   previously valid input stops matching.
2. **Prefixes only on official names; aliases exact.** `laurent` → Laurentides
   is helpful; `iles` or `quebec` silently picking a region is not. Minimum
   prefix length 3; ambiguous → no match.
3. **RSS 17–18 included.** They are real regions (cumulative file names them);
   the surgery tool's `missingRegions` keeps its own 01–16 reference table so
   its output is unchanged.
4. **Baseline = latest fiscal year, facilities only, no per-facility fallback.**
   Using an older year for facilities missing from the current one would mix
   windows; instead they get `baseline: null` and are listed in `unmatched`.
5. **Only like-measured indicators are subtracted.** `dmsStretcher` and
   `dmsAmbulatory` exist in both files; the FYTD delay to physician and 24h/48h
   shares are attached as context with no `vsBaseline` entry (the live file
   has head counts, not delays or shares). The previous-day vs FYTD window
   difference is documented in the types, README and skill.
6. **Baseline failures never cost the live answer.** The live report is built
   (and cached) first; the join is layered on top, and a cumulative fetch/parse
   error becomes `baseline.status: "unavailable"` + a stderr warning, exit 0.
7. **Separate baseline fixture.** `MSSS_URGENCES_FIXTURE` is one path for every
   tool, so the baseline reads `--baseline-fixture` /
   `MSSS_URGENCES_BASELINE_FIXTURE` instead, never the hourly fixture.
8. **One cumulative cache.** `loadCumulatifRows` is extracted from the
   cumulatif tool and reused, so `--baseline` and `urgences-cumulatif` share
   `urgences-cumulatif-rows.json` (24 h TTL). `--refresh` refreshes both files.
9. **Opinions stay in the skill.** The CLI reports `vsBaseline` numbers; what
   counts as "worse than usual" (±10% noise, ≥ +25% noticeably longer) is in
   `msss-urgences/SKILL.md`.
