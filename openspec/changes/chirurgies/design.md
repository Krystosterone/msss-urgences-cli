# Design — `chirurgies` tool

## Verified source facts (checked live 2026-11-04)

- **URL:** `https://www.msss.gouv.qc.ca/professionnels/statistiques/documents/chirurgie/Chirurgie_ListeAttente.csv`.
  `www.` currently 301s to the bare `msss.gouv.qc.ca` host, and `fetch` follows it.
- **Catalogue:** donneesquebec dataset `c41ca40b-ff3a-4d95-9613-b2571dcdeaba`,
  resource `7c83f4be-…` (DataStore active, mirrors the same columns), with
  `update_frequency: monthly`. In practice it updates each fiscal period, 13 per year.
- **Encoding:** UTF-8 **with BOM**, comma-separated, CRLF. 3,962 rows, 84 periods
  (`1920-P12` … `2627-P04`), 257 KB.
- **Header:** `PeriodeAttente, Delais_d'attente, Region, Chirurgie_generale,
  Chirurgie_orthopedique, Chirurgie_plastique, Chirurgie_vasculaire,
  Neurochirurgie, Obstetrique_et_gynecologie, Ophtalmologie,
  ORL_chirurgie_cervico_faciale, Urologie, Autres, Total`.
  The 2021 methodology PDF documents `Periode`, `Delais_d_attente` and
  `Total_general` instead.
- **Values:** wait bands are exactly `0 à 6 mois`, `6 à 12 mois`,
  `Plus d'1 an`. Regions are `RSS01`–`RSS16`, with names only in the PDF's
  reference table. There is no province row. Blank cells occur (871 in the full
  file) and differ from `0`. `Total` equals the sum of the specialty columns
  on every row.
- **Gaps:** RSS04 (Mauricie et Centre-du-Québec) has no rows in `2627-P02` to
  `P04`. Some (region, band) rows are absent, e.g. RSS09 has no `Plus d'1 an`
  row in `2627-P02`.

## Decisions

1. **Wide → nested contract.** Per region: `overall` (from the published
   `Total`) plus one waitlist per specialty, each with verbatim `waiting` bands
   and derived `total` / `over6m` / `pctOver6m` / `pctOver12m`.
2. **Blank or absent = `null`.** This matches the `cliniques` convention. Derived
   sums treat `null` as 0, and percentages are `null` when the total is 0.
3. **Province is derived and honest about gaps.** The province figure is a sum
   of the regions present. `missingRegions` lists the absent ones. The province
   delta is `null` unless the previous period covers the same set of regions.
4. **Region names come from the reference table** (methodology PDF) and are
   hardcoded in `RSS_REGIONS`, because the CSV carries only codes.
5. **Cache the whole parsed history**, which is small. One cache file serves
   every `--period`. TTL is 24h: the publication day is irregular and refetches
   are cheap.
6. **Unknown period/specialty → `UsageError` (exit 2)**, because both sets are
   known and finite. An unmatched `--region` returns an empty list, as in the
   other tools.
7. **Tolerant header, strict body.** Column aliases are accepted. An unknown wait
   band, a malformed period or region code, or a non-numeric count throws
   `ParseError`, so drift fails loudly instead of skewing the numbers.

## Risks

- **Schema drift:** mitigated by the header validation above and the opt-in
  live smoke test.
- **Snapshot semantics:** the counts are end-of-period snapshots measured from
  the decision to operate. The skill must state this so agents don't present
  them as a person's expected wait.
