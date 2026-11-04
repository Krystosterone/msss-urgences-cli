## Purpose

A deterministic `urgences-cumulatif` CLI tool that surfaces fiscal-year-to-date
Québec ER indicators and like-for-like year-over-year changes from the MSSS
cumulative open-data CSV, plus an agent skill that interprets those trends.

## ADDED Requirements

### Requirement: The CLI SHALL report fiscal-year-to-date ER indicators deterministically

The `urgences-cumulatif` subcommand SHALL fetch `Donnees_cumulatives_Urgence.csv`
over HTTPS, parse it (UTF-8, BOM stripped), and report per entity the published
indicators verbatim for one fiscal year, labelling every derived value.

#### Scenario: The latest fiscal year is the default

- **WHEN** no `--year` is given
- **THEN** the report's `fiscalYear` is the most recent `annee` in the source
  and `period` is the `cumul_periode` it is cumulated through

#### Scenario: Unexpected CSV structure fails loudly

- **WHEN** a required column is missing or `annee` is not `YYYY-YYYY`
- **THEN** the CLI prints a parse error and exits 2

### Requirement: Year-over-year comparisons SHALL be like-for-like

Each entry SHALL carry `previous` (the same entity in the baseline year) and
`change` (current − previous) only when both years are cumulated through the
same fiscal period.

#### Scenario: Default baseline

- **WHEN** no `--compare` is given and the previous fiscal year is present
  through the same period
- **THEN** `compareTo` is that year; otherwise `compareTo` is `null` and no
  entry has a `change`

#### Scenario: Invalid baseline

- **WHEN** `--compare` names a year absent from the source, equal to `--year`,
  or cumulated through a different period
- **THEN** the CLI prints a usage error and exits 2

### Requirement: Coverage changes SHALL be visible

Aggregate entries SHALL carry `facilityCount` for their year and baseline, and
the report SHALL list in `missingFromFiscalYear` the matching entities present
in other years but absent from the reported year.

#### Scenario: A region loses facilities from the data

- **WHEN** a region total's facility count differs from its baseline
- **THEN** `change.facilityCount` is non-zero and the table marks the level `*`

### Requirement: The skill SHALL own trend interpretation

`.agents/skills/msss-urgences-cumulatif` SHALL call the CLI with `--json`, state
the fiscal year, period and baseline, treat lower stay/delay/24h+ shares as
better, and decline to call a trend when coverage changed.
