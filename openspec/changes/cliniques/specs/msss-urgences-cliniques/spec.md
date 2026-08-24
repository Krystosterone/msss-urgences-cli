## Purpose

A deterministic `cliniques` CLI tool that surfaces daily per-clinic appointment
capacity from the MSSS daily open-data CSV, plus an agent skill that routes
people to primary care when clinic openings exist instead of defaulting to the
emergency room.

## ADDED Requirements

### Requirement: The CLI SHALL surface daily clinic appointment capacity deterministically

The `cliniques` subcommand SHALL fetch the MSSS daily clinic CSV
(`rdvoffert_DOuv.csv`) over HTTPS, parse it (UTF-8, BOM stripped), and report
per clinic the number of appointment slots offered in each time band.

#### Scenario: Querying clinic capacity for a day

- **WHEN** a human asks whether clinics have openings (e.g. "are there clinic
  appointments available today?")
- **THEN** the CLI runs `msss-urgences cliniques --json` (live or from cache),
  lists clinics with their offered slots per time band, and the agent summarizes
  which clinics have real capacity

#### Scenario: The latest available date is the default

- **WHEN** the query does not specify a `--date`
- **THEN** the tool uses the most recent `date` present in the source file and
  reports it as the `dataDate`

### Requirement: The CLI SHALL cache the parsed daily slice, not the raw file

Because the source is a large multi-year daily time-series that updates at most
daily, the tool SHALL cache the *parsed* slice for the requested date(s) under
`MSSS_URGENCES_CACHE_DIR`, keyed on the source `date`, rather than re-parsing
the raw file on every query.

#### Scenario: Repeated queries within the refresh window hit the cache

- **WHEN** the same date's clinic data is queried again within the TTL
- **THEN** the result comes from the local cache and the report marks
  `cached: true` with `cacheAgeMinutes`

### Requirement: The CLI SHALL filter clinics like the ER tool

The tool SHALL filter by region name (accent-insensitive), RLS name, clinic-name
search, and a specific `--date`, and derive a per-clinic daily total of offered
slots.

#### Scenario: Region and name filtering

- **WHEN** the query filters by a region or clinic-name fragment
- **THEN** only matching clinics are returned, with the same accent-insensitive
  matching behaviour as `urgences`

### Requirement: The routing opinions SHALL live in a dedicated skill

A `.agents/skills/msss-urgences-cliniques` skill SHALL instruct the agent to invoke
`cliniques --json`, interpret capacity ("when there are openings, recommend the
clinic over the ER"), and be referenced by the existing `msss-urgences` and
`msss-urgences-children` skills so the routing flow is ER → clinic.

#### Scenario: Recommend primary care over the ER when capacity exists

- **WHEN** a same-day clinic has offered slots in a band the human can use
- **THEN** the agent recommends that clinic, quoting the CLI's slot counts,
  and only falls back to the ER recommendation when no clinic capacity exists
