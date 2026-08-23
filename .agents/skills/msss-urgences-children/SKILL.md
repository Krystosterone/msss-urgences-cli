---
name: msss-urgences-children
description: Compare the two Montréal pediatric emergency rooms (CHU Sainte-Justine vs L'Hôpital de Montréal pour enfants) via the deterministic msss-urgences CLI and recommend the quieter one for a child. Use ONLY when the question is specifically about children's hospital ERs in Québec ("how busy are the children's ERs right now?", "which pediatric ER should we go to?").
version: 0.1.0
author: Krystian
license: MIT
---

# msss-urgences-children

Decide which of the two Québec children's emergency rooms to take a child to,
using live MSSS data and the hardcoded pediatric ranking this skill owns.

**The seam:** the `msss-urgences` CLI returns the numbers exactly as MSSS
publishes them (no rankings). **This skill owns the pediatric opinions** — which
ER to rank first, what "good" means for a child — and turns the numbers into a
recommendation.

> This skill is **specifically** for the children's-ER comparison. For any other
> ER/region question, use the generic **`msss-urgences`** skill.

## 1. Get the data

The CLI must be built and, ideally, linked onto your PATH — see **Install &
link** in the repo README. Query the two pediatric ERs, **always `--json`**:

```bash
msss-urgences urgences --id 51222800,51223279 --json
```

Each facility has: `id`, `name`, `occupancyPct`, `waitingForCare`, `over24h`,
`over48h`, `available`, and `deltaFromRegionAvgPct`; the `regions[0]` entry has
`averageOccupancyPct` (Montréal's average). `null` / `available: false` means
not reporting right now. Exit codes: `0` success · `1` network/HTTP · `2` structure/bad usage.

The CLI caches for 30 min by default; pass `--refresh` for the freshest data and
note the report's `dataDate`/`cached` if freshness matters.

## 2. The two pediatric ERs (stable ids)

| id | Hospital |
|----|----------|
| 51222800 | CHU Sainte-Justine (pediatric) |
| 51223279 | L'Hôpital de Montréal pour enfants / Montreal Children's (pediatric, Glen site) |

These are the only two dedicated pediatric ERs to compare. Always target them by
permit id, never by name.

## 3. Interpret (the pediatric opinions)

Apply these rules in order:

1. **Rank Sainte-Justine (51222800) first, Montreal Children's (51223279) second.**
2. **Lower `occupancyPct` = quieter = better for a child.** Occupancy is the
   derived occupied/functional ratio (it routinely exceeds 100% at busy ERs — not an error).
3. **`over24h` / `over48h` of 0 is a good sign** (nobody stuck on a stretcher > 24h/48h).
4. **Compare each to the Montréal `averageOccupancyPct`** — a large negative
   `deltaFromRegionAvgPct` means much calmer than the regional norm.
5. **`waitingForCare`** is the queue to be seen; weight it alongside occupancy.
6. If a hospital is `available: false`, say its data isn't being reported.

## 4. Summarize for the human

Lead with the recommendation, then the numbers, then context. Example shape:

> **CHU Sainte-Justine is the quieter choice for a child right now.**
> - Sainte-Justine: 94% occupancy, 19 waiting, 0 patients > 24h.
> - Montreal Children's: 158% occupancy, 2 waiting, 4 patients > 24h.
> - Montréal average is 104%. Sainte-Justine sits below it (Δ −10); Montreal
>   Children's is far above (Δ +54). Over 100% at a busy ER is normal.
> - Sainte-Justine has more headroom and no one stuck on a stretcher > 24h.

Round nothing the CLI didn't round; quote occupancy as shown. Note the
`dataDate` and whether the data was `cached` if freshness matters.

## 5. Optional: share

If asked, forward the summary (and/or a screenshot) by email or message. That's
an action layer on top of this skill — this skill's job ends at the summary.
