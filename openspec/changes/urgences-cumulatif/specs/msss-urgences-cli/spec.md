## MODIFIED Requirements

### Requirement: The CLI SHALL serve multiple deterministic tools from one binary

The CLI SHALL expose `tools/<name>.ts` plus a dispatch subcommand: `urgences`
(hourly ER CSV, Latin-1), `cliniques` (daily clinic CSV, UTF-8 with BOM) and
`urgences-cumulatif` (cumulative ER CSV, UTF-8 with BOM, per fiscal period).
Each keeps the exit-code contract: `0` success · `1` network/HTTP · `2`
structure/usage.

#### Scenario: Disambiguation by first argument

- **WHEN** the CLI is invoked as `msss-urgences urgences-cumulatif …`
- **THEN** it runs the cumulative pipeline; `urgences` and `cliniques` run
  their existing pipelines unchanged; an unknown subcommand exits 2
