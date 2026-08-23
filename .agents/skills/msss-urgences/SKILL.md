---
name: msss-urgences
description: Check live Québec emergency-room occupancy and wait times from the MSSS open-data CSV via the deterministic msss-urgences CLI, then summarize for a human. Use when asked how busy an ER is, which hospital to go to, or for ER occupancy/wait times in Québec (e.g. "how busy are the children's ERs in Montréal right now?").
version: 0.1.0
author: Krystian
license: MIT
---

# msss-urgences

Get live Québec ER data from the MSSS hourly open-data CSV and explain it in
plain language.

**The seam:** the `msss-urgences` CLI is a deterministic *facts machine* — it
returns the numbers exactly as MSSS publishes them, plus objective derived
metrics (regional average, delta-from-average). **This skill owns the
opinions**: which hospitals to rank first, what "good" means, and the
human-readable summary. Keep it that way — do not ask the CLI to rank or judge.

## 1. Get the data

The CLI must be built and, ideally, linked onto your PATH — see **Install &
link** in the repo README. Once linked you can call `msss-urgences` from
anywhere; if it isn't linked, run `node dist/cli.js` from the repo root instead.

Query it — **always use `--json`** so you parse structured data, not a table:

```bash
# Children's ERs in Montréal (the common case):
msss-urgences urgences --id 51222800,51223279 --json

# A whole region:
msss-urgences urgences --region montreal --json

# Everything currently reporting data:
msss-urgences urgences --available-only --json
```

Each facility in the JSON has: `id` (the stable MSSS permit number), `name`,
`occupancyPct`, `totalPresent`, `waitingForCare`, `over24h`, `over48h`,
`available`, and `deltaFromRegionAvgPct`; each region has
`averageOccupancyPct`. `null` metrics / `available: false` mean the hospital
isn't reporting right now.

Exit codes: `0` success · `1` network/HTTP error · `2` structure changed or bad usage.

The CLI caches locally for 30 minutes by default, so repeated calls within the
hour are cheap. Pass `--refresh` to force a fresh fetch. Check the report's
`dataDate` (the source's `Mise_a_jour`) and `cached` fields when freshness
matters.

## 2. Stable hospital ids

Target hospitals by their **stable MSSS permit number**, never by name:

| id | Hospital |
|----|----------|
| 51222800 | CHU Sainte-Justine (pediatric) |
| 51223279 | L'Hôpital de Montréal pour enfants / Montreal Children's (pediatric, Glen site) |

To discover others: `node dist/cli.js urgences --region <name> --json` and read
the ids.

## 3. Interpret (the opinions)

For the **children's-ER** question, apply these rules:

1. **Rank Sainte-Justine (51222800) first, Montreal Children's (51223279) second.**
2. **Lower `occupancyPct` = quieter = better.** Occupancy is the derived
   occupied/functional ratio (it routinely exceeds 100% at busy ERs — not an error).
3. **`over24h` / `over48h` of 0 is a good sign** (nobody stuck on a stretcher > 24h/48h).
4. **Compare each hospital's `occupancyPct` to its region's
   `averageOccupancyPct`** — a large negative `deltaFromRegionAvgPct` means it's
   much calmer than the regional norm.
5. If a hospital is `available: false`, say its data isn't being reported right now.

More generally: lower occupancy and lower long-stay counts are better; always
give the reader the regional average as context so a percentage means something.

## 4. Summarize for the human

Lead with the recommendation, then the numbers, then context. Example shape:

> **CHU Sainte-Justine is the quieter choice right now.**
> - Sainte-Justine: 106% occupancy, 26 waiting, 0 patients > 24h.
> - Montreal Children's: 175% occupancy, 3 waiting, 3 patients > 24h.
> Both are above the Montréal average (109%), but Sainte-Justine has far more
> headroom today.

Round nothing the CLI didn't round; quote occupancy as shown. Note the
`dataDate` (the ministry's own update timestamp) and whether the data was
`cached` if freshness matters.

## 5. Optional: share

If asked, forward the summary (and/or a screenshot) by email or message. That's
an action layer on top of this skill — this skill's job ends at the summary.
