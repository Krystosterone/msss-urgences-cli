## Purpose

Agent skills that turn the deterministic numbers from the `msss-urgences` CLI
into a plain-language, human-first recommendation about Québec emergency rooms.
Two skills share this capability with distinct intents: `msss-urgences` (generic,
any ER/region) and `msss-urgences-children` (the specific pediatric comparison).

## Requirements

### Requirement: Surface the deterministic CLI's numbers through the skill

The skills instruct the agent to invoke the built `msss-urgences` CLI with
`--json` and to parse the structured output, never to re-derive or rank on its
own.

#### Scenario: Querying for ER occupancy

- **WHEN** a human asks how busy a Québec ER is or which hospital to go to
- **THEN** the agent runs `msss-urgences urgences --json`, reads the structured
  report, and summarizes it for the human

### Requirement: Own the opinions, not the computation

Rankings, "quieter is better" judgements, and the prose summary live in the
skills, mirroring the seam between index-sante-cli and its `indexsante-urgences`
skill. Each skill's ranking rules are specific to its intent.

#### Scenario: Recommendation follows the skill's rules

- **WHEN** the agent recommends between facilities
- **THEN** it applies the matching skill's ranking rules (stable permit-id
  targeting, lower occupancy is better, long-stay counts as signals) and quotes
  the CLI's published numbers

### Requirement: The two skills have distinct, non-overlapping intents

`msss-urgences` handles generic ER/region questions for any hospital;
`msss-urgences-children` handles **only** the two-pediatric-ER comparison. Each
cross-references the other so an agent routes to the right one.

#### Scenario: Generic ER questions route to the generic skill

- **WHEN** the question is about any non-children's ER or a whole region
- **THEN** the agent uses `msss-urgences`, which covers filtering, region
  averages, and generic ranking rules

#### Scenario: Children's questions route to the pediatric skill

- **WHEN** the question is specifically about the Québec children's hospital ERs
- **THEN** the agent uses `msss-urgences-children`, which targets the two
  pediatric permit ids (CHU Sainte-Justine `51222800`, L'Hôpital de Montréal
  pour enfants `51223279`) and applies the pediatric ranking rules
