## Why

The four tools read four MSSS files that each spell a region differently
(`06`, `RSS06`, RTS `061`–`065`, `Montréal`, `Error` for RSS 10), and each tool
parsed `--region` its own way: `urgences` wanted an exact name, `cliniques` a
substring of an RTS name, `urgences-cumulatif` an exact two-digit code,
`chirurgies` any code form. The same question ("Montréal") therefore needed
different spellings per command, and no output could be joined across
datasets.

Separately, `urgences` answers "how busy is it now?" but not "is that normal
for this hospital?". The cumulative ER file already holds each hospital's
fiscal-year-to-date length of stay, keyed by the same MSSS permit number as the
hourly file — the join was simply never made.

## What Changes

- **Region registry** (`src/core/regions.ts`): the 18 RSS regions with
  canonical code, official name, slug and aliases; `resolveRegion` (code in any
  form, name/slug, alias, unambiguous prefix) and `rssCodeOf` (any dataset's
  code → two-digit RSS). All four tools resolve `--region` through it first and
  fall back to their previous matching when the input names no single region.
- **`regions` command**: lists the registry (JSON/table) and resolves a single
  input (`--region`), exit 2 when it names no region or several. No network.
- **`cliniques`**: each clinic gains a derived `rssCode`.
- **`urgences --baseline`**: each facility gains `baseline` (verbatim FYTD
  lengths of stay + context) and derived `vsBaseline` (live − baseline, hours
  and %), joined by permit number against the latest fiscal year of the
  cumulative file; a report-level `baseline` records the join. A failed
  cumulative fetch/parse degrades to live-only data, exit 0.
  `--baseline-fixture` / `MSSS_URGENCES_BASELINE_FIXTURE` for offline runs.
- **Skill**: `msss-urgences` gains interpretation rules for the baseline.
- **Fix**: piped output over 64 KiB was truncated (`process.exit()` before
  stdout drained).

## Capabilities

### Modified Capabilities

- `msss-urgences-cli`: shared `--region` semantics; new `regions` subcommand;
  `cliniques` `rssCode`.
- `msss-urgences`: `urgences --baseline`.

## Impact

- **Repo:** `src/core/{regions,baseline}.ts` (new), `src/tools/*.ts`,
  `src/core/{types,parseCliniques}.ts`, `src/cli.ts`, tests, skills, README,
  AGENTS.md, CHANGELOG.
- **Contract:** additive fields only (`rssCode`, `baseline`, `vsBaseline`,
  report `baseline`), present only when asked for except `rssCode`. `--region`
  now matches more inputs; for `cliniques` an RSS name/code covers all of the
  region's RTS (notably `gaspesie` now includes the Îles RTS).
- **Network:** `--baseline` adds one fetch of the cumulative file, cached 24 h
  and shared with `urgences-cumulatif`.
