## ADDED Requirements

### Requirement: `urgences --baseline` SHALL join live rows with fiscal-year-to-date rows

With `--baseline`, each returned facility SHALL carry `baseline` — the
cumulative file's row for the same permit number in the latest fiscal year
(verbatim `dmsStretcher`, `dmsAmbulatory`; context `pecDelayHours`,
`stretcherOver24hPct`, `stretcherOver48hPct`; `fiscalYear`, `period`), or
null when there is none — and `vsBaseline` (DERIVED live − baseline for the
two lengths of stay, in hours and as an integer %; null with `baseline`). The
report SHALL carry a top-level `baseline` with `status`, `source`,
`fiscalYear`, `period`, cache state, `matched` and `unmatched`.

#### Scenario: Facility without a validated row

- **WHEN** a returned facility has no cumulative row in the baseline year
- **THEN** its `baseline` and `vsBaseline` are null and its id is in
  `baseline.unmatched`

#### Scenario: Cumulative file unavailable

- **WHEN** the cumulative file cannot be fetched or parsed
- **THEN** the live report is still returned with exit 0, every facility's
  `baseline` is null, `baseline.status` is `unavailable` with `error`, and a
  one-line warning goes to stderr

#### Scenario: Without the flag

- **WHEN** `--baseline` is not passed
- **THEN** the output has no `baseline`/`vsBaseline` fields and no
  cumulative fetch happens
