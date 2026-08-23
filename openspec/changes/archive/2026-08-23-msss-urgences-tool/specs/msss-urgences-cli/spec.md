## Purpose

Deterministic, cache-aware CLI that reads Québec emergency-room occupancy and
wait-time data directly from the MSSS hourly open-data CSV, so agents and humans
get canonical numbers without hitting the ministry server on every query.

## ADDED Requirements

### Requirement: Fetch from the canonical MSSS hourly CSV

The CLI fetches its data by HTTPS GET from the MSSS open-data hourly file
`Releve_horaire_urgences_7jours_nbpers.csv`, decoded as Latin-1, with no browser
and no HTML parsing.

#### Scenario: Successful fetch returns the parsed report

- **WHEN** the CLI runs `urgences` and the MSSS server returns a 200 CSV
- **THEN** the CLI parses the CSV into regions and facilities and prints a
  report with exit code 0

#### Scenario: Network or HTTP failure is reported distinctly

- **WHEN** the MSSS server is unreachable, times out, or returns a non-200 status
- **THEN** the CLI prints a fetch error to stderr and exits 1 without emitting a
  partial report

#### Scenario: Unexpected CSV structure fails loudly

- **WHEN** the downloaded CSV's columns no longer match the expected header
  names
- **THEN** the CLI prints a parse/structure error to stderr and exits 2

### Requirement: Serve exact numbers as published with a stable data contract

Facility occupancy, stretcher, and patient counts are taken verbatim from the
CSV; region-to-facility grouping uses the CSV's region fields. The report shape
mirrors the previous tool's contract so consumers are not surprised.

#### Scenario: Occupancy is derived, never recomputed from the published values independently

- **WHEN** a facility row is parsed
- **THEN** occupancy percentage on stretchers is the ministry's own value (or
  derived deterministically from published occupied/functional counts) and is
  labelled as such; published counts are never silently altered

#### Scenario: Report includes provenance and freshness

- **WHEN** a report is emitted
- **THEN** it includes the source URL, the CSV's `Mise_a_jour` data timestamp,
  the local fetched-at time, and cache-freshness metadata

### Requirement: Cache locally so the source is not hit on every query

Repeated invocations within a configurable TTL (MUST default to 30 minutes,
below the source's 1-hour refresh) SHALL reuse a local file cache instead of
re-fetching. The cache SHALL be keyed on the source's `Mise_a_jour` data
timestamp so a fresh hourly publication invalidates it.

#### Scenario: Stale cache triggers a fresh fetch

- **WHEN** the local cache is older than the TTL or the source data timestamp is
  newer than the cached one
- **THEN** the CLI fetches a fresh CSV, updates the cache, and reports the data

#### Scenario: Fresh cache is reused without network

- **WHEN** the cache is younger than the TTL and its data timestamp matches
- **THEN** the CLI returns the cached report and marks it as cached without
  contacting the server

#### Scenario: Cache failure degrades gracefully to live fetch

- **WHEN** the cache directory is unwritable or the cache file is corrupt
- **THEN** the CLI logs a warning and falls back to a fresh fetch instead of
  failing

### Requirement: Filter facilities by region, id, search, and availability

The CLI SHALL support filters for region (slug or name, accent-insensitive),
stable facility id (the MSSS permit number, repeatable or comma-separated), name
substring search (accent-insensitive), and available-only.

#### Scenario: Region filter narrows the report

- **WHEN** the user passes `--region montreal`
- **THEN** the report contains only Montréal facilities

#### Scenario: Id filter overrides availability filtering

- **WHEN** the user passes explicit facility ids together with `--available-only`
- **THEN** the explicit ids are always included even if a facility is not
  currently reporting

### Requirement: Emit JSON or a human table and map exit codes

The CLI MUST emit JSON when piped or with `--json`, and SHALL render a
human-readable table on a TTY or with `--table`. Exit codes SHALL be `0`
success, `1` network/HTTP error, and `2` structure or usage error.

#### Scenario: Deterministic output formats

- **WHEN** the CLI is invoked with the same inputs and cached data
- **THEN** it produces byte-identical JSON/text for the same underlying data
