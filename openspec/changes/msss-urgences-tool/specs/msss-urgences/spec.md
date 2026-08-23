## Purpose

Agent skill that turns the deterministic numbers from the `msss-urgences` CLI
into a plain-language, human-first recommendation about which Québec emergency
room is quieter or where to go.

## ADDED Requirements

### Requirement: Surface the deterministic CLI's numbers through the skill

The skill instructs the agent to invoke the built `msss-urgences` CLI with
`--json` and to parse the structured output, never to re-derive or rank on its
own.

#### Scenario: Querying for ER occupancy

- **WHEN** a human asks how busy a Québec ER is or which hospital to go to
- **THEN** the agent runs `msss-urgences urgences --json`, reads the structured
  report, and summarizes it for the human

### Requirement: Own the opinions, not the computation

Rankings, "quieter is better" judgements, and the prose summary live in the
skill, mirroring the seam between index-sante-cli and its `indexsante-urgences`
skill.

#### Scenario: Recommendation follows the skill's rules

- **WHEN** the agent recommends between facilities
- **THEN** it applies the skill's ranking rules (e.g. stable permit-id targeting
  for pediatric ERs, lower occupancy is better, long-stay counts as signals) and
  quotes the CLI's published numbers

### Requirement: Cite the stable facility ids

The skill maintains the stable MSSS permit-number ids for the paediatric ERs it
commonly targets, and instructs searching by id rather than by name.

#### Scenario: Known pediatric ERs are targeted by id

- **WHEN** the question is about the Québec children's hospitals
- **THEN** the agent targets them by their stable permit ids (CHU
  Sainte-Justine `51222800`, L'Hôpital de Montréal pour enfants `51223279`)
  and notes the `fetchedAt`/freshness when it matters
