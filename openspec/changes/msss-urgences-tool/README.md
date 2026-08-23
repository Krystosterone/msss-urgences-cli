# msss-urgences-tool

Deterministic CLI + skill for live Québec ER occupancy/wait data from the MSSS hourly open-data CSV.

**Status:** Planning complete (proposal + 2 capabilities + design + tasks). Awaiting explicit apply request.

**Key research findings (verified live, 2026-08-23):**

- MSSS publishes the canonical CPU data as hourly open-data **CSV** — no HTML scraping needed.
- Primary source: `Releve_horaire_urgences_7jours_nbpers.csv` (138 rows, `Latin-1` encoded).
- Stable facility id = MSSS permit number (CHU Sainte-Justine `51222800`, Hôpital de Montréal pour enfants `51223279`).
- Source updates hourly → local cache keyed on `Mise_a_jour` (default TTL 30 min).

See `proposal.md`, `specs/`, `design.md`, `tasks.md`.
