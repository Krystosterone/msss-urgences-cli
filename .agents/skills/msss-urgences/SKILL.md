---
name: msss-urgences
description: Check live Québec emergency-room occupancy and wait times for any hospital or region via the deterministic msss-urgences CLI, then summarize for a human. Use when asked how busy an ER is, which hospital to go to, or for ER occupancy/wait times in Québec ("how busy is the ER at Verdun right now?", "which Montréal hospital has the shortest wait?").
version: 0.1.0
author: Krystian
license: MIT
---

# msss-urgences

Get live Québec ER data from the MSSS hourly open-data CSV and explain it in
plain language, for **any** hospital or region.

**The seam:** the `msss-urgences` CLI is a deterministic *facts machine* — it
returns the numbers exactly as MSSS publishes them, plus objective derived
metrics (regional average, delta-from-average). **This skill owns the
opinions**: what "good" means and the human-readable summary. Keep it that way —
do not ask the CLI to rank or judge.

> For the **children's-ER comparison specifically**, use the
> **`msss-urgences-children`** skill instead — it targets the two pediatric ERs
> with hardcoded ranking rules. For **clinic-availability** questions (whether
> clinics have appointments today), use **`msss-urgences-cliniques`** — it
> routes to primary care instead of the ER when capacity exists.
> For **trends** (this fiscal year vs previous years: average stay, delay to
> physician, 24h+ stretcher stays), use **`msss-urgences-cumulatif`**. For
> **surgical waitlists** (elective surgery, by region/specialty), use
> **`msss-urgences-chirurgies`**.
> This generic skill is for every other ER question.

## 1. Get the data

The CLI must be built and, ideally, linked onto your PATH — see **Install &
link** in the repo README. Once linked you can call `msss-urgences` from
anywhere; if it isn't linked, run `node dist/cli.js` from the repo root instead.

Query it — **always use `--json`** so you parse structured data, not a table:

```bash
# A specific hospital by its stable id (MSSS permit number):
msss-urgences urgences --id <permit> --json

# A whole region (accent-insensitive name or slug):
msss-urgences urgences --region montreal --json

# All facilities in your region matching a name:
msss-urgences urgences --region montreal --search "verdun" --json

# Everything currently reporting data:
msss-urgences urgences --available-only --json

# "Is it worse than usual?" — add each hospital's fiscal-year-to-date baseline:
msss-urgences urgences --region montreal --baseline --json

# "When is it usually least busy?" — occupancy history from the archived hourly snapshots:
msss-urgences urgences-historique --id <permit> --by weekday-hour --days 28 --json
```

`--region` takes a name, an alias or an RSS code (`montreal`, `mtl`, `06`) and
means the same region in every `msss-urgences` command; `msss-urgences regions
--json` lists them.

Each facility in the JSON has an `id` (the stable MSSS permit number), `name`,
`occupancyPct`, `totalPresent`, `waitingForCare`, `over24h`, `over48h`,
`available`, and `deltaFromRegionAvgPct`; each region has `averageOccupancyPct`.
`null` metrics / `available: false` mean the hospital isn't reporting right now.
For the exact field dictionary, all CLI flags, exit codes, and cache/freshness
semantics, see [`references/cli-reference.md`](references/cli-reference.md) — load
it when you need the full contract or a field's precise meaning.

## 2. Stable hospital ids

Target a specific hospital by its **stable MSSS permit number** (`id`), never
by name. To find one, query its region with `--json` and read the `id` field:

```bash
msss-urgences urgences --region <name> --json
```

Common ids (for convenience): CHU Sainte-Justine `51222800`,
L'Hôpital de Montréal pour enfants `51223279`, Hôpital de Verdun `51218097`,
Hôpital Maisonneuve-Rosemont `12934659`.

## 3. Interpret (the opinions)

For a general ER-occupancy question, apply these rules:

1. **Lower `occupancyPct` = quieter = better.** Occupancy is the derived
   occupied/functional ratio (it routinely exceeds 100% at busy ERs — not an error).
2. **`over24h` / `over48h` of 0 is a good sign** (nobody stuck on a stretcher > 24h/48h).
3. **Compare each hospital's `occupancyPct` to its region's
   `averageOccupancyPct`** — a large negative `deltaFromRegionAvgPct` means it's
   much calmer than the regional norm; a large positive one means busier.
4. **`waitingForCare`** is the queue to be seen — weigh it alongside occupancy.
5. If a hospital is `available: false`, say its data isn't being reported right now.

**With `--baseline`** ("is this normal for this hospital?"):

6. **`vsBaseline.dmsStretcherPct` answers "worse than usual?"** It compares
   yesterday's mean stretcher stay with the same hospital's fiscal-year-to-date
   mean. Treat roughly **±10% as normal day-to-day noise**; **+25% or more** is
   "noticeably longer than usual"; **−25% or less** is "unusually quick". Say
   it is *yesterday's* stay (the CLI's `dmsStretcher` is previous-day data), not
   the stay of someone arriving now.
7. **Occupancy and the baseline answer different questions.** A hospital can be
   at 200% and still in line with its own norm (chronically full), or at 90%
   and well above it. Report both: "busy, but normal for it" vs "busier than it
   usually is".
8. **`baseline: null`** means MSSS has not validated that hospital's data for
   the fiscal year yet (listed in the top-level `baseline.unmatched`). Say so;
   don't infer a norm. If `baseline.status` is `unavailable`, answer from the
   live data alone and mention the comparison couldn't be made.
9. `baseline.pecDelayHours` and `baseline.stretcherOver24hPct` are context only
   ("this ER usually takes ~2 h to see a physician"); they have no live
   counterpart to subtract.

**With `urgences-historique`** ("when is it usually calm?", "is now unusual?"):

10. **Best time to go = the slots with the lowest `occupancyPctMean`** in
    `profile` (`--by weekday-hour` for a weekday-specific answer, `--by hour`
    for a general one). Name two or three calm slots, not just one, and give
    their `occupancyPctMax` too: a slot that is calm on average but sometimes
    packed is a weaker recommendation.
11. **Check the sample size before trusting a slot.** Each profile row has
    `samples`; with fewer than ~3 per slot (a short `--days`, or an archive that
    started recently: `window.archiveStart`), say the history is still thin.
12. **"Is now unusual?" = `latest.deltaFromTypicalPct`.** Treat roughly ±10
    points as normal; +20 or more is "busier than usual for this hour"; −20 or
    less is "quieter than usual". `latest.dataDate` is the archive's latest
    snapshot, which can lag the live file by up to an hour; for "right now",
    pair it with a live `urgences` call.
13. Hours are **Québec local time** (MSSS's `Mise_a_jour`). Say "around 15h",
    not "at 15:00 exactly": a snapshot stands for that hour.

More generally: lower occupancy and lower long-stay counts are better; always
give the reader the regional average as context so a percentage means something.

## 4. Summarize for the human

Lead with the recommendation, then the numbers, then context. Example shape:

> **Hôpital de Verdun looks like the calmest choice in Montréal right now.**
> - Verdun: 58% occupancy, 12 waiting, 0 patients > 24h.
> - The Montréal average is 104%, so Verdun sits well below the norm (Δ −46).
> - It carries the shortest non-priority wait of the region right now.

With `--baseline`, add one line per hospital mentioned, e.g.:

> - Its stretcher stays yesterday (13.5 h) were 19% shorter than its usual
>   16.7 h this fiscal year — a good day for Verdun.

Round nothing the CLI didn't round; quote occupancy as shown. Note the
`dataDate` (the ministry's own update timestamp) and whether the data was
`cached` if freshness matters.

## 5. Optional: share

If asked, forward the summary (and/or a screenshot) by email or message. That's
an action layer on top of this skill — this skill's job ends at the summary.
