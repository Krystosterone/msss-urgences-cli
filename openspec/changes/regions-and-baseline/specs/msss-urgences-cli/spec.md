## ADDED Requirements

### Requirement: `--region` SHALL mean the same RSS region in every command

Every command's `--region` SHALL first resolve the input through the shared
registry (RSS code `6`/`06`/`RSS06`; name or slug, accent- and
case-insensitive; alias; unambiguous prefix of ≥ 3 characters of an official
name) and filter to that RSS region. When the input names no single region,
each command SHALL apply its previous matching unchanged.

#### Scenario: One spelling, four datasets

- **WHEN** `--region 6` is passed to `urgences`, `urgences-cumulatif`,
  `chirurgies` and `cliniques`
- **THEN** each returns only Montréal (RSS 06) rows; `cliniques` returns all
  five Montréal RTS

#### Scenario: Finer filters survive

- **WHEN** `cliniques --region "Montérégie-Est"` or `cliniques --region 061`
- **THEN** only that RTS is returned

### Requirement: The CLI SHALL list and resolve regions offline

`msss-urgences regions` SHALL list the 18 RSS regions with code, name, slug,
aliases and per-dataset code spellings, without network access.
`--region <input>` SHALL return the single region it resolves to, or exit 2.

#### Scenario: Ambiguous input

- **WHEN** `msss-urgences regions --region mont`
- **THEN** it exits 2 with a usage message

### Requirement: Clinic rows SHALL carry their RSS code

Each clinic SHALL carry a derived `rssCode` (first two digits of its RTS code,
null when unknown) matching the ER reports' `regionCode`.

### Requirement: Piped output SHALL never be truncated

The CLI SHALL let stdout drain before exiting; output larger than the pipe
buffer SHALL arrive complete.
