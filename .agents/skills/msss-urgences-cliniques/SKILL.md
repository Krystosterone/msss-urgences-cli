---
name: msss-urgences-cliniques
description: Check daily clinic appointment availability in Québec via the deterministic msss-urgences cliniques CLI and recommend primary care over the ER when openings exist. Use when asked whether clinics near a region have appointments today, or to route someone to a clinic instead of the emergency room.
version: 0.1.0
author: Krystian
license: MIT
---

# msss-urgences-cliniques

Find out whether primary-care clinics have same-day appointment capacity, using
the MSSS daily clinic CSV, and route someone to a clinic instead of the ER when
openings exist.

**The seam:** the `msss-urgences cliniques` CLI is a deterministic *facts
machine* — it returns offered-slot counts per clinic exactly as MSSS publishes
them. **This skill owns the opinions**: what "has capacity" means, when to
recommend a clinic over an ER, and the human-readable summary.

> Use this skill for **clinic-availability** questions. For ER occupancy, use
> **`msss-urgences`** (generic) or **`msss-urgences-children`** (pediatric).

## 1. Get the data

The CLI must be built and linked onto PATH — see **Install & link** in the repo
README. Query with **always `--json`**:

```bash
# Capacity in a region (defaults to the latest date in the source):
msss-urgences cliniques --region <name> --json

# A specific clinic by name:
msss-urgences cliniques --search <clinic> --json

# A specific day:
msss-urgences cliniques --date YYYY-MM-DD --region <name> --json
```

`--region` takes the same names and RSS codes as every other `msss-urgences`
command (`montreal`, `06`) and covers all of that region's RTS sub-regions; to
pair clinics with ERs in the same region, match a clinic's `rssCode` with the
ER report's `regionCode`.

The report has `clinics[]` (each: `name`, `regionName`, `rlsName`, `rssCode`,
`professionGroup`, `totalOffered`, and `slots` with six time bands
`6h_9h, 9h_12h, 12h_15h, 15h_18h, 18h_21h, 21h_6h`), `dataDate` (the day the
report is for), and `availableDates` (distinct dates present, newest first).
`null` slots = no appointments offered in that band. For the full command
contract, field dictionary, exit codes, and cache semantics, see
[`references/cli-reference.md`](references/cli-reference.md).

## 2. Interpret (the routing opinions)

1. **`totalOffered` > 0 means a clinic has capacity today** — that is the signal
   to prefer it over an ER visit.
2. **Larger `totalOffered` = more slots = better odds of being seen.** Prefer
   clinics with the most open slots in the bands the person can use.
3. **Consider the time band** a person can actually attend: someone free in the
   morning should look at `6h_9h` / `9h_12h`; an evening-only schedule at
   `18h_21h` / `21h_6h`. A clinic with capacity *in the usable band* beats one
   with a higher total all in an unusable band.
4. **`professionGroup` matters**: `Médecin` slots are physician appointments;
   `Infirmière` slots are nursing. Note which is available.
5. **Match the region/RLS to where the person is.** A clinic in a neighbouring
   RLS may be closer than a nominally-in-region one; name the region.

## 3. Summarize for the human

Lead with the recommendation, then the numbers, then context. Example shape:

> **There's clinic capacity in Montréal-Centre today — you can skip the ER.**
> - GMF La Cité Verte: 6 slots (12h–18h), Médecin.
> - Clinique médicale St-Laurent: 4 slots (9h–15h), Infirmière.
> - Both are in the Montréal region; GMF La Cité Verte has the most physician
>   openings this afternoon.

If **no** clinic has capacity for the region/day, say so plainly and note the
ER remains the option: "No clinic openings found for Montréal today — this is a
case where the ER is the right choice." Always state `dataDate` (clinic data is
**daily**, not real-time) so the reader knows the freshness.

## 4. Optional: share

If asked, forward the summary by email or message. This skill's job ends at the
summary.
