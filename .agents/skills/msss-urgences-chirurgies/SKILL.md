---
name: msss-urgences-chirurgies
description: Report Québec surgical waitlists (patients waiting for an operating-room intervention) by region, specialty and wait time via the deterministic msss-urgences chirurgies CLI, and explain what the numbers do and do not mean. Use when asked how long the surgery waitlist is, how many people wait over 6 months or a year, how a region or specialty compares, or whether the list is growing.
version: 0.1.0
author: Krystian
license: MIT
---

# msss-urgences-chirurgies

Describe the province's elective-surgery waitlist using the MSSS
`Chirurgie_ListeAttente.csv` dataset: how many people are waiting, for which
specialty, in which region, and for how long since the surgeon decided to
operate.

**The seam:** the `msss-urgences chirurgies` CLI is a deterministic *facts
machine*. It returns waitlist counts exactly as MSSS publishes them, plus a few
objective derived figures: totals, % waiting over 6 and 12 months, the delta
from the previous period, and a province-wide sum. **This skill owns the
opinions**: which figure leads, how to compare, and how to state the limits.

**Read [`references/answer-standard.md`](references/answer-standard.md) before
answering.** It holds the safety, provenance, freshness and uncertainty rules
every answer follows.

> This is a **planning / context** tool, not a triage tool. For ER crowding,
> use **`msss-urgences`**; for which clinics usually offer appointments,
> **`msss-urgences-cliniques`**. Someone worried about their health while
> waiting for surgery should contact their surgeon's office, or 811.

## 1. Get the data

The CLI must be built and linked onto PATH (see **Install & link** in the repo
README). Query with **always `--json`**:

```bash
# Latest period, every region (+ derived province total):
msss-urgences chirurgies --json

# One region (name, slug or RSS code) and/or a specialty:
msss-urgences chirurgies --region montreal --specialty ortho --json

# A past fiscal period, for a trend:
msss-urgences chirurgies --region RSS03 --period 2627-P01 --json
```

Key fields: `dataDate` / `period` (fiscal period), `previousPeriod`,
`missingRegions`, `province` (derived), `regions[]`. Each region has
`overall` (all specialties) and `specialties[]`. Each of those has
`waiting.{under6m, from6to12m, over12m}`, `total`, `over6m`, `pctOver6m`,
`pctOver12m`. Regions also carry `deltaFromPreviousPeriod`. For the full contract, exit codes and
cache semantics, see [`references/cli-reference.md`](references/cli-reference.md).

## 2. Interpret (the opinions)

1. **Lead with the people waiting over 6 months** (`over6m`, `pctOver6m`), then
   over a year (`over12m`). The raw `total` mostly reflects population size and
   surgical volume. The long-wait share is what tells you whether access is
   strained.
2. **Compare regions by percentage, not by count.** Montréal will always have the
   largest count. A small region with a high `pctOver6m` is the more telling
   signal.
3. **Trend = `deltaFromPreviousPeriod`**, which is one fiscal period (~4 weeks).
   One period is noise. Before calling a trend, query 3–4 earlier `--period`
   values and say so. A region's `deltaFromPreviousPeriod` is its
   all-specialty total, even with `--specialty`: for one specialty, compare
   that specialty's `total` across `--period` queries.
4. **Read `missingRegions` before quoting the province.** `province` sums only
   the regions present. When a region is missing, say the provincial figure
   excludes it. `province.deltaFromPreviousPeriod` is `null` when the two
   periods cover different regions. Never compute your own delta across that gap.
   The same goes across years: when one period lists a region in
   `missingRegions` and the other doesn't, say the provincial change partly
   reflects the missing region, or compare percentages or regions instead.
5. **`null` means not published**, not zero. Say "not reported" instead of
   treating it as 0 people.
6. **`autres`** = non-surgical interventions needing general anesthesia. Do not
   present it as a surgical specialty.

## 3. State the limits

Always say, briefly:

- Counts come from a **snapshot at the end of the fiscal period** (`dataDate`),
  not from today. The data is published 13 times a year.
- Wait time starts at **the surgeon's decision to operate**. Time spent getting a
  family doctor or a specialist appointment is not measured.
- These are **regional aggregates**. They are not per-hospital and they do not
  predict any one person's wait. Their surgeon's office is the authority on that.
- Cardiac and cardio-thoracic surgery are only **partially** covered by the
  source system (SIMASS).

## 4. Summarize for the human

Lead with the answer, then the numbers, then the caveats. Example shape:

> **Orthopedic surgery in Montréal: 6,265 people waiting, 30% for over 6 months
> (period 2627-P04, fiscal 2026-2027).**
> - 4,374 under 6 months · 1,665 between 6 and 12 months · 226 over a year.
> - Province-wide, 27% of orthopedic patients wait over 6 months, so Montréal
>   runs a bit above the provincial share.
> - Excludes Mauricie et Centre-du-Québec, which is not reported this period.
>   These are end-of-period snapshots from the decision to operate. Individual
>   waits vary.
