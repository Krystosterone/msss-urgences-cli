# Module: Montréal's two pediatric ERs

Compare current crowding at CHU Sainte-Justine and the Montreal Children's
from live MSSS data, for a parent who wants to understand the situation. Use
it when the question is specifically about these two ERs.

The CLI returns the numbers exactly as MSSS publishes them (no rankings). This
module owns the interpretation for the pediatric case: what each number says,
what it can't say, and the summary. It has no preferred hospital: any ranking
comes from the data, and the data can't say which ER will see a child sooner.

**[`answer-standard.md`](answer-standard.md) applies to every answer.** Its
§1 comes first whenever a child's symptoms are described: if
they could be serious (very drowsy or hard to wake, trouble breathing, a
seizure, a fever in a baby under 3 months, signs of dehydration), the answer
starts with **911 or the nearest ER now**. Info-Santé **811** is there when
the parent is unsure. Crowding is never a reason to drive farther or wait.

> - Adding `--baseline` to the query below also gives each ER's
>   fiscal-year-to-date stay (`baseline`, `vsBaseline`); read it per rules 7–10
>   of [`urgences.md`](urgences.md).
> - For "is it unusual right now?" or "when is it usually calmer?", also query
>   `quebec-sante urgences-historique --id 51222800,51223279 --json` and read it
>   per rules 11–14 of [`urgences.md`](urgences.md).
> - For how the two ERs have **trended** over fiscal years, use
>   [`urgences-cumulatif.md`](urgences-cumulatif.md) with
>   `--id 51222800,51223279 --history`.

## 1. Get the data

Query the two pediatric ERs, **always `--json`**:

```bash
quebec-sante urgences --id 51222800,51223279 --json
```

Each facility has: `id`, `name`, `occupancyPct`, `waitingForCare`,
`totalPresent`, `over24h`, `over48h`, `available`, and `deltaFromRegionAvgPct`;
the `regions[0]` entry has `total.occupancyPct` (MSSS's Montréal rate) and
`averageOccupancyPct` (the plain mean of Montréal's ERs), both over every
reporting Montréal ER, adult ones included. `null` /
`available: false` means not reporting right now. Top level: `dataDate`
(published) and `extractedAt` (snapshot time). For the exact command contract,
full field dictionary, exit codes, and cache/freshness semantics, see
[`cli-urgences.md`](cli-urgences.md).

## 2. The two pediatric ERs (stable ids)

| id | Hospital |
|----|----------|
| 51222800 | CHU Sainte-Justine (pediatric) |
| 51223279 | L'Hôpital de Montréal pour enfants / Montreal Children's (pediatric, Glen site) |

These are Montréal's two dedicated pediatric ERs. Always target them by permit
id, never by name. Other ERs also treat children: in an emergency, the nearest
ER is the right one.

## 3. Interpret

1. **No default order.** Present both side by side. Neither is "first". Leading
   with what the data shows ("X is more crowded than Y right now") is fine;
   preferring one hospital is not.
2. **`occupancyPct`** is how full the stretcher area is (occupied/functional;
   over 100% at busy ERs is normal). Higher means more crowded. It says nothing
   about how fast a child will be seen.
3. **`waitingForCare`** counts children present who haven't seen a physician
   yet, at every triage priority. It's not a place in line: the sickest
   children are seen first. MSSS warns that a low count doesn't mean being seen
   sooner.
4. **`over24h` / `over48h`** count children on a stretcher for 24 h / 48 h or
   more, mostly waiting for a bed upstairs. It's a sign of hospital strain.
5. **`deltaFromRegionAvgPct`** compares each with the Montréal mean, which
   mixes adult and pediatric ERs. Comparing the two pediatric ERs directly is
   more meaningful.
6. If a hospital is `available: false`, say its data isn't being reported.
7. **"Which one should we go to?"** Apply §1 of the answer standard first. If
   it isn't an emergency, mention 811 and the other §5 routes. Then give the
   comparison as context, with the plain caveat that it can't predict who is
   seen sooner. Don't choose for them.

## 4. Summarize for the human

Lead with the comparison asked for, then the numbers, then what they can't
tell. Example shape (no symptoms described):

> **Right now the Montreal Children's ER is more crowded than Sainte-Justine's.**
> - Sainte-Justine: 125% stretcher occupancy, 39 children waiting to see a
>   physician, none on a stretcher for over 24 h.
> - Montreal Children's: 175% occupancy, 27 waiting, 4 on a stretcher over 24 h.
> - Children are seen by how urgent their condition is, not in arrival order,
>   so these counts don't predict how long your child would wait.
> - For advice on whether to come in at all, Info-Santé 811 answers 24/7.
>
> _MSSS hourly ER file, snapshot of 21:00, published 2026-11-04 21:45._

Round nothing the CLI didn't round; quote occupancy as shown. Always give the
`dataDate` / `extractedAt`, and say whether the data was `cached`.
