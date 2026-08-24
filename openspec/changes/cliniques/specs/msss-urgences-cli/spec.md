## Purpose

Deterministic, cache-aware CLI that reads Québec health-services open data
directly from canonical MSSS CSVs, so agents and humans get canonical numbers
without hitting the ministry server on every query. Ships multiple tools: the
`urgences` subcommand (hourly ER data) and the `cliniques` subcommand (daily
clinic capacity).

## MODIFIED Requirements

### Requirement: The CLI SHALL serve multiple deterministic tools from one binary

The CLI SHALL expose `tools/<name>.ts` plus a dispatch subcommand. `urgences`
(canonical hourly ER CSV, Latin-1) and `cliniques` (canonical daily clinic CSV,
UTF-8 with BOM) share fetch/cache/output plumbing where the encoding and
cadence genuinely match, and diverge where they do not. Each tool keeps the
established exit-code contract: `0` success · `1` network/HTTP · `2`
structure/usage.

#### Scenario: Disambiguation by first argument

- **WHEN** the CLI is invoked as `msss-urgences cliniques …`
- **THEN** it runs the `cliniques` data pipeline; when invoked as
  `msss-urgences urgences …` it runs the existing ER pipeline; an unknown
  subcommand exits 2

---
*The `urgences`-specific requirements (hourly CSV, Latin-1, 30-minute TTL)
remain in Force exactly as published in this capability's existing spec; this
change only adds the `cliniques` tools and the multi-tool dispatch. Any wording
in this section that would weaken an unchanged `urgences` requirement is
void.*
