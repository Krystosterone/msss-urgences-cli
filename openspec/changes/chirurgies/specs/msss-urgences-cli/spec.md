## Purpose

Deterministic, cache-aware CLI that reads Québec health-services open data
directly from canonical MSSS CSVs. Ships `urgences` (hourly ER), `cliniques`
(daily clinic capacity) and `chirurgies` (surgical waitlist per fiscal period).

## MODIFIED Requirements

### Requirement: The CLI SHALL serve multiple deterministic tools from one binary

The CLI SHALL expose `tools/<name>.ts` plus a dispatch subcommand for each of
`urgences`, `cliniques` and `chirurgies`, keeping the exit-code contract: `0`
success · `1` network/HTTP · `2` structure/usage.

#### Scenario: Disambiguation by first argument

- **WHEN** the CLI is invoked as `msss-urgences chirurgies …`
- **THEN** it runs the `chirurgies` pipeline; `urgences` and `cliniques` run
  their existing pipelines unchanged; an unknown subcommand exits 2
