---
name: msss-urgences
description: Report live Québec emergency-room crowding (stretcher occupancy, people waiting to see a physician, 24h/48h stretcher stays) for any hospital or region via the deterministic msss-urgences CLI, compare it with the hospital's own norm and history, and explain what the numbers do and do not mean. Use when asked how busy an ER is, how ERs compare, whether it is worse than usual, or when it is usually calmer ("how busy is the ER at Verdun right now?", "which Montréal ERs are most crowded?"). It never predicts a personal wait time.
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
interpretation**: what the numbers say about crowding, what they can't say, and
the human-readable summary. Keep it that way — do not ask the CLI to rank or
judge.

**Read [`references/answer-standard.md`](references/answer-standard.md) before
answering.** It holds the safety, provenance, freshness and uncertainty rules
every answer follows. In short: possible emergency → 911 / nearest ER first;
occupancy is not a wait time; always give the data's time and source.

> For the **two pediatric ERs** (Sainte-Justine, Montreal Children's), use
> **`msss-urgences-children`**. For **which clinics usually offer
> appointments**, use **`msss-urgences-cliniques`** (its data is past offers,
> not openings today).
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
`available`, and `deltaFromRegionAvgPct`; each region has `averageOccupancyPct`
(the plain mean of its ERs) and `total` (MSSS's own "Total régional" row, with
its `occupancyPct`), and the report has `province` (MSSS's "Ensemble du
Québec" row).
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
Hôpital Maisonneuve-Rosemont `12934659`. The answer standard lists the ERs that
serve a specific population (pediatric, psychiatric, cardiology).

## 3. Interpret (the opinions)

For a general ER-occupancy question, apply these rules:

1. **`occupancyPct` measures how full the stretcher area is.** It is the derived
   occupied/functional ratio and routinely exceeds 100% at busy ERs (MSSS counts
   overflow stretchers as occupied, not as functional). Higher means more
   crowded. It doesn't measure the waiting room or say how fast anyone is seen.
2. **`over24h` / `over48h`** count patients on a stretcher for 24 h / 48 h or
   more right now, mostly people waiting for a hospital bed. They're a strain
   signal for the hospital, not a measure of the wait to be seen.
3. **For the region as a whole, quote `region.total.occupancyPct`:** MSSS's
   own regional rate, the one Québec.ca and Index Santé show, and `province`
   for Québec. To place one hospital, compare its `occupancyPct` with the
   region's `averageOccupancyPct`: `deltaFromRegionAvgPct` says how much more or
   less crowded it is than the mean of its ERs. Name which one you quote ("the
   Montréal rate", "the mean of Montréal's ERs"). Set specialized ERs apart.
4. **`waitingForCare`** counts people present who haven't seen a physician yet,
   at every triage priority. Report it as a count. It's not a queue position.
5. If a hospital is `available: false`, say its data isn't being reported right
   now. Never treat it as calm or closed.
6. **"Which hospital should I go to?" / "Where will I be seen fastest?"**
   Don't pick one from the numbers. First apply §1 of the answer standard. For
   a non-urgent problem, offer the §5 routes (811, pharmacist, clinic) as well.
   If they still want the comparison, give the indicators of the general ERs
   near them and say plainly that the data can't predict who is seen sooner.
   For "how long?", point to Québec.ca's official estimate (answer standard
   §2); never compute one.

**With `--baseline`** ("is this normal for this hospital?"):

7. **`vsBaseline.dmsStretcherPct` answers "worse than usual?"** It compares
   yesterday's mean stretcher stay with the same hospital's fiscal-year-to-date
   mean. Treat roughly **±10% as normal day-to-day noise**; +10% to +25% is
   "somewhat longer than usual"; **+25% or more** is "noticeably longer than
   usual"; **−25% or less** is "unusually quick" (−10% to −25%: "somewhat
   quicker"). Say
   it is *yesterday's* stay (the CLI's `dmsStretcher` is previous-day data), not
   the stay of someone arriving now. Read `vsBaseline.dmsAmbulatoryPct` (walk-in
   patients, the waiting room) with the same thresholds, and report it
   separately: the two can disagree.
8. **Occupancy and the baseline answer different questions.** A hospital can be
   at 200% and still in line with its own norm (chronically full), or at 90%
   and well above it. Report both: "busy, but normal for it" vs "busier than it
   usually is".
9. **`baseline: null`** means MSSS has not validated that hospital's data for
   the fiscal year yet (listed in the top-level `baseline.unmatched`). Say so;
   don't infer a norm. If `baseline.status` is `unavailable`, answer from the
   live data alone and mention the comparison couldn't be made.
10. `baseline.pecDelayHours` and `baseline.stretcherOver24hPct` are context only
    ("this ER usually takes ~2 h to see a physician"); they have no live
    counterpart to subtract. Don't present the delay as anyone's expected wait.

**With `urgences-historique`** ("when is it usually calm?", "is now unusual?"):

11. **Calmest times = the slots with the lowest `occupancyPctMean`** in
    `profile` (`--by weekday-hour` for a weekday-specific answer, `--by hour`
    for a general one). Name two or three calm slots, not just one, and give
    their `occupancyPctMax` too: a slot that is calm on average but sometimes
    packed is a weaker pattern. It describes past crowding, not a promise of a
    shorter wait, and it's never a reason to delay care for a possible
    emergency.
12. **Check the sample size before trusting a slot.** Each profile row has
    `samples`; with fewer than ~3 per slot (a short `--days`, or an archive that
    started recently: `window.archiveStart`), say the history is still thin.
13. **"Is now unusual?" = `latest.deltaFromTypicalPct`.** Treat roughly ±10
    points as normal; +10 to +20 is "somewhat busier"; +20 or more is "busier
    than usual for this hour"; −20 or less is "quieter than usual". Only once
    enough other snapshots back the typical value (rule 12). `latest.dataDate` is the archive's latest
    snapshot, which can lag the live file by up to an hour; for "right now",
    pair it with a live `urgences` call.
14. Hours are **Québec local time** (MSSS's `Mise_a_jour`). Say "around 15h",
    not "at 15:00 exactly": a snapshot stands for that hour.

More generally: lower occupancy and fewer long stays mean a less strained ER,
not a faster visit. Always give the regional rate as context so a
percentage means something.

## 4. Summarize for the human

Lead with the answer to the question asked, then the numbers, then what they
can't tell. Example shape:

> **Hôpital de Verdun's ER is less crowded than most of Montréal's right now.**
> - Verdun: 104% stretcher occupancy, 6 people waiting to see a physician,
>   2 on a stretcher for over 24 h.
> - Montréal's rate is 154% (MSSS's regional total); the mean of its ERs is
>   144%, so Verdun sits well below it (Δ −40).
> - These are counts, not wait times: patients are seen by triage priority,
>   and MSSS warns a low count doesn't mean being seen sooner.
>
> _MSSS hourly ER file, snapshot of 21:00, published 2026-11-04 21:45._

With `--baseline`, add one line per hospital mentioned, e.g.:

> - Patients who left yesterday stayed 14.9 h on a stretcher on average, 11%
>   less than its 16.7 h so far this fiscal year (April 1 → period 7): close to
>   its usual, slightly shorter.

Round nothing the CLI didn't round; quote occupancy as shown. Always give the
`dataDate` (and `extractedAt`), say if it's `cached`, and flag it when it's
more than about 2 hours old.

## 5. Optional: share

If asked, forward the summary (and/or a screenshot) by email or message. That's
an action layer on top of this skill — this skill's job ends at the summary.
