# Module: clinic appointment offers (`cliniques`)

Which clinics in an area have been offering appointments, and when, from
MSSS's clinic file, and the ways of actually getting a non-urgent
consultation.

The CLI returns offered-appointment counts per clinic and date, exactly as
MSSS publishes them. This module owns the interpretation: what those counts can
and can't say, and the summary.

**[`answer-standard.md`](answer-standard.md) applies to every answer.** For
this dataset, its key rules are:

- **This is past data.** MSSS publishes the file **weekly** (Thursdays at 14h),
  up to the day before. The newest date is 1 to 8 days old. Never say a
  clinic "has appointments today" or "has capacity now".
- **Offered isn't free or bookable.** The counts are appointments clinics
  connected to the booking hub offered for a date. Some were booked, some are
  reserved for the clinic's own patients, and clinics outside the hub aren't
  counted at all.
- **This data never decides between a clinic and the ER.** No offers doesn't
  mean "go to the ER", and many offers don't mean the ER isn't needed. If symptoms
  could be serious, 911 or the nearest ER comes first (§1). If unsure, 811.

## 1. Get the data

Query with **always `--json`**:

```bash
# A region (defaults to the latest date in the source):
quebec-sante cliniques --region <name> --json

# One local service network (RLS), e.g. a neighbourhood:
quebec-sante cliniques --region montreal --rls ahuntsic --json

# A specific clinic by name:
quebec-sante cliniques --search <clinic> --json

# An earlier date, to see whether a pattern holds:
quebec-sante cliniques --date YYYY-MM-DD --rls ahuntsic --json
```

`--region` takes the same names and RSS codes as every other `quebec-sante`
command (`montreal`, `06`) and covers all of that region's RTS sub-regions.
To pair clinics with ERs in the same region, match a clinic's `rssCode` with
the ER report's `regionCode`.

The report has `clinics[]` (each: `name`, `regionName`, `rlsName`, `rssCode`,
`professionGroup`, `totalOffered`, and `slots` with six time bands
`6h_9h, 9h_12h, 12h_15h, 15h_18h, 18h_21h, 21h_6h`), `dataDate` (the date of
the appointments), and `availableDates` (distinct dates present, newest
first). `null` slots = no appointments offered in that band. For the full
command contract, field dictionary, exit codes, and cache semantics, see
[`cli-cliniques.md`](cli-cliniques.md).

## 2. Interpret

1. **The question this data answers:** "which clinics around here usually
   offer appointments, and at what times?". Not "is there a slot for me now?".
2. **Look at several dates before calling a pattern.** One day can be unusual,
   and weekdays differ from weekends. Query 3–7 of the `availableDates`, ideally
   including the same weekday as the person's need. Say how many dates you
   looked at.
3. **Time bands are the appointment's scheduled time.** A clinic that offered
   `18h_21h` slots on most recent days is one that does evening appointments.
   Don't call it open tonight.
4. **`professionGroup`:** `Médecin` covers physicians and residents;
   `Infirmière` covers nurses and specialized nurse practitioners. Say which.
   Each row is one clinic *and* group, so a clinic offering both appears
   twice: count distinct `name`s when you say how many clinics.
5. **More offers = a clinic that offers more appointments through the hub,**
   not better odds for this person. Don't rank clinics as if it were.
6. **Match the RLS to where the person is,** and name it. A clinic in a
   neighbouring RLS may be closer.
7. **Always add the routes to get care (answer standard §5):** 811 for advice,
   a pharmacist, their own clinic or GMF, the GAP if they have no family
   doctor, and the clinic's own booking system or Rendez-vous santé Québec to
   find an actual slot.

## 3. Summarize for the human

Lead with what the data shows, then the routes to care, then the limits.
Example shape:

> **Several Ahuntsic and Montréal-Nord clinics regularly offer appointments,
> including some in the evening.**
> - On 2026-10-28, the latest date MSSS has published, 15 clinics in the
>   Ahuntsic – Montréal-Nord RLS offered appointments.
>   District Médical offered 426 physician appointments, 25 between 18h and
>   21h. Clinique médicale Désy and District Médical Junior also offered evening
>   physician slots.
> - To get one: book through Rendez-vous santé Québec or the clinic. Call
>   Info-Santé 811 for advice, or ask a pharmacist. Without a family doctor,
>   the GAP (Québec.ca or 811) can direct you.
> - These are appointments offered a week ago, not openings now, and they
>   include only clinics on the provincial booking hub.
>
> _MSSS "Rendez-vous en clinique" file, published weekly; data for 2026-10-28._

Always state `dataDate` and that the file is weekly, so the reader knows it's
past data.
