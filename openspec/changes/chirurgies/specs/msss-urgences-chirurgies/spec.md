## Purpose

A deterministic `chirurgies` CLI tool that surfaces the MSSS elective-surgery
waitlist by region, specialty and wait band for each fiscal period, plus an
agent skill that interprets it without overstating what it measures.

## ADDED Requirements

### Requirement: The CLI SHALL surface the surgical waitlist deterministically

The `chirurgies` subcommand SHALL fetch `Chirurgie_ListeAttente.csv` over HTTPS,
parse it (UTF-8, BOM stripped), and report per region and specialty the
patients waiting in each published wait band, verbatim. A blank cell SHALL be
`null`, never `0`.

#### Scenario: The latest period is the default

- **WHEN** the query does not specify `--period`
- **THEN** the tool reports the most recent period in the source as `dataDate`,
  with its decoded fiscal year and the `previousPeriod`

#### Scenario: Unknown period or specialty

- **WHEN** `--period` is malformed or absent from the source, or `--specialty`
  matches no specialty
- **THEN** the CLI exits 2 with a message listing valid values

### Requirement: Derived figures SHALL be objective and labelled

The tool SHALL derive per-waitlist `total`, `over6m`, `pctOver6m`, `pctOver12m`,
a per-region `deltaFromPreviousPeriod`, and a province-wide sum.

#### Scenario: A region is missing from the period

- **WHEN** an RSS region from the reference table has no rows in the period
- **THEN** it is listed in `missingRegions`, the province sum excludes it, and
  the province delta is `null` unless the previous period covers the same regions

### Requirement: Interpretation SHALL live in a dedicated skill

`.agents/skills/msss-urgences-chirurgies` SHALL invoke `chirurgies --json`, lead
with the long-wait share, and state that counts are end-of-period snapshots
measured from the decision to operate, at regional (not per-hospital) level.
