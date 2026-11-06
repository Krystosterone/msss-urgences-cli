# M1: evaluations

Milestone 1 of the product direction ([issue #12](https://github.com/Krystosterone/quebec-sante-cli/issues/12)):
agent-native capabilities. Each change is checked against the M0 benchmark
([`docs/m0-benchmark.md`](m0-benchmark.md), [`eval/`](../eval/README.md)): fresh
agents, a pinned snapshot, `eval/grade.ts`.

## One entry skill instead of five

The five skills (`quebec-sante-urgences`, `-urgences-children`,
`-urgences-cumulatif`, `-cliniques`, `-chirurgies`) are now one skill,
[`quebec-sante`](../.agents/skills/quebec-sante/SKILL.md):

- **`SKILL.md`** has one description to trigger on, the rules every answer
  follows, a routing table from the question to the module, routing for
  questions that are about a decision more than a dataset ("which ER?",
  "no clinic, so the ER?"), and guidance for questions that span datasets.
- **The five skill bodies are now modules** in `references/`, one per dataset,
  each with its CLI reference. Their M0-audited rules are unchanged. Only the
  cross-references and the repeated install and share boilerplate changed.
- **One `answer-standard.md`**, not five identical copies.
  `test/skills.test.ts` now checks the single skill, that every module and CLI
  reference is linked and every local link resolves, that there's one answer
  standard, and the M0 bans across every skill file.
- **It packages as one folder,** for M3. A specialized skill installed alone
  no longer loses its answer standard.
- The skill text went from 1,827 lines to 1,234.

### Method

Three fresh agents (`skills-m1-run1` to `-run3`) answered the ten questions.
Each saw only the new skill and the 2026-11-05 08:45 snapshot, with a file
mapping each snapshot file to its command. It's the same snapshot and
questions as the M0 variation runs (`skills-var1` to `-var3`), so the two sets
compare directly. Each agent also reported which modules it loaded for each
question.

### Results

| | var1 | var2 | var3 | m1-run1 | m1-run2 | m1-run3 |
|--|--:|--:|--:|--:|--:|--:|
| Skill | five skills | five skills | five skills | one | one | one |
| Claims checked (all hold) | 280 | 369 | 340 | 315 | 336 | 365 |
| Critical failures | 0 | 0 | 0 | 0 | 0 | 0 |
| Manual score /120 | 118 | 118 | 118 | 118 | 118 | 118 |

- **Same verdict on all ten questions** as the four M0 runs on this snapshot
  (listed in `docs/m0-benchmark.md`, "Run-to-run variation").
- **Routing worked every time.** In all three runs, every question loaded the
  right module, and the decision questions went through the answer standard
  first:
  - Q03 and Q06: §1, §2 and §5 before any comparison.
  - Q05: §1, §2 and §5, then the clinic module.
  - Q01 and Q10 combined the live, `--baseline` and history views, and named
    which question each answers.
- **The same points are lost, for the same reasons:** Q04 (no clinic
  addresses in the data) and Q09 (the history is too thin).
- **One grader false failure, fixed:** run 1's Q05 wrote "doesn't by itself
  mean you need the ER", which the requirement didn't accept.
- **Self-grading caveat:** the same reviewer restructured the skill and scored
  the runs, so the claim checks are the stronger evidence. Three runs show
  consistency, not a bound on a rare failure.

### Agent feedback

Fixed after the runs:

- **Ordering in Q06.** Run 3 listed the general ERs sorted by occupancy,
  least full first. That isn't a pick, but for "where will I be seen fastest?"
  the top of a sorted list reads as one. `urgences.md` rule 6 now says to list
  them by name, and defines "general ERs".
- **The sample threshold** didn't say whether "about 3" counts the latest
  snapshot. The answer standard §4 now says it counts the snapshots behind the
  value: a slot's `samples`, or the *other* snapshots at that hour for
  `typicalOccupancyPct`.
- **History contract.** `cli-urgences.md` now says:
  - `--by` defaults to `hour`;
  - `window.from` can predate the archive start;
  - history occupancy keeps one decimal where live `urgences` rounds to a
    whole percent, so quote the live figure for "right now".
- **Coverage.** `urgences-cumulatif.md` rule 6 now says that when ERs join or
  drop out, means and shares aren't comparable either, not just totals.

Not fixed:

- **Unicode in clinic names.** The pinned snapshot predates the NFC change
  (#17), so its clinic names still mix forms. The CLI reference describes the
  current CLI, and the grader compares in NFC.
- **Warning signs for minor problems** still come from the agent's general
  knowledge, as in M0.
- **The snapshot lacks some views:** no `--by weekday-hour` history and no
  `--level facility` cumulative query, so the agents named the ERs behind
  Montréal's drop from `baseline.unmatched`, as "probably" the same set. A
  snapshot with weeks of history should add both.

### Decision

Keep the single skill. It scores the same as the five skills, on the same
snapshot. It's simpler to maintain and to package, and it routes
cross-dataset and decision questions in one place.

## Targeted retrieval: several dates or periods in one call

A clinic pattern needs several days, and a waitlist trend needs several
periods. `cliniques` returned one date per call and `chirurgies` one period,
so the benchmark's Ahuntsic week took seven calls and Q08 four.

- **`cliniques --days <n>`** (1–31) returns the `n` calendar days ending at
  `--date` (default: the latest date). The report adds `window` and `dates`
  (the days with data), and rows come newest date first.
- **`chirurgies --years <n>`** returns the same period in each of the last
  `n` fiscal years, the comparable window a seasonal waitlist needs.
  **`--periods <list>`** returns any list of periods. Both return
  `{ periods, notInSource, reports[] }`, and each report is identical to a
  `--period` call for that period, with its own `missingRegions`.
- The clinic and surgery modules now say to use `--days 7` and `--years 3`,
  and to state the window or periods covered.

### Method

Three fresh agents (`skills-retrieval-run1` to `-run3`) answered the ten
questions. Each saw only the updated skill and the 2026-11-05 08:45 snapshot,
with a file mapping each snapshot file to its command, as in the M1 runs.
Their copy of the snapshot held the new outputs **instead of** the per-date
and per-period files:

- `cliniques-ahuntsic-7days.json` (`--rls ahuntsic --days 7`);
- `chirurgies-ortho-years3.json` (`--specialty ortho --years 3`);
- `chirurgies-ortho-periods.json` (`--periods 2627-P04,2627-P03`).

These files were added to the pinned snapshot on 2026-11-06; none of its
existing files changed (`MANIFEST.txt`).

- **The surgery files were fetched on 2026-11-06.** Each of their reports
  equals the pinned per-period file, minus the shared top-level fields.
- **The clinic file was built from the seven pinned per-date files**, not
  refetched. MSSS's 2026-11-05 14h republication revised two 2026-10-26 rows
  (Clinique Familiale Pas-à-Pas and District Médical Junior), so a live fetch
  no longer reproduces the pinned week. Past clinic dates can change after
  they're published.

### Results

| | m1-run1 | m1-run2 | m1-run3 | retrieval-run1 | retrieval-run2 | retrieval-run3 |
|--|--:|--:|--:|--:|--:|--:|
| Calls for Q04/Q05 and Q08 | 7 and 4 | 7 and 4 | 7 and 4 | 1 and 2 | 1 and 2 | 1 and 2 |
| Claims checked (all hold) | 315 | 336 | 365 | 285 | 277 | 274 |
| Critical failures | 0 | 0 | 0 | 0 | 0 | 0 |
| Manual score /120 | 118 | 118 | 118 | 118 | 118 | 118 |

- **Same verdict on all ten questions** as the M1 runs.
- **The same two points are lost:** Q04 (no clinic addresses in the data) and
  Q09 (the history is too thin).
- **Q04 and Q05 read the whole week from one output.** Statements the grader
  can't check, because they're counts in words, were checked by hand against
  the file and hold:
  - five clinics offered physician appointments on all seven dates;
  - District Médical is the only clinic with 21h–6h offers, and has them every
    day;
  - run 3 also picked the same weekday as the question (Thursday 2026-10-22),
    as the module now asks.
- **Q08 used the three-year output for the trend** and the two-period output
  for the latest change. All three named Mauricie et Centre-du-Québec as
  missing from 2627-P04 and compared shares rather than counts.
- **One wording to watch:** run 3's Q06 opens with "For a sprain you may not
  need the ER at all". It's hedged, it's followed by the signs that mean the
  ER, and it's within answer standard §1 (take a problem the person calls minor
  at their word). No clinic data decides it, so it's not S3.
- **Fewer claims per run** (274–285, against 315–365) mostly reflects
  shorter Q04 and Q05 answers. Those runs named clinics rather than counting
  them, since a count over filtered rows can't be cited (below).
- **Self-grading caveat:** the same reviewer built the options and scored the
  runs, so the claim checks are the stronger evidence. Three runs show
  consistency, not a bound on a rare failure.

### Agent feedback

All three agents found the surgery outputs easy to read and cite
(`reports[dataDate=…]`, coverage per report). The clinic output was easy to
read, but harder to use:

- **No per-clinic summary over the window.** "Evening slots on 4 of 7 days",
  or "how many clinics offered evening slots", can't be cited: the claim ops
  work on a whole array, not on filtered rows, and the CLI doesn't output those
  counts. All three asked for a per clinic × profession group summary (days
  with offers, per-band totals and day counts).
- **No weekday on rows,** though the module asks for the person's weekday.
- **`availableDates` lists every date since 2024** (about 1,000), in JSON and
  at the foot of the table.

Not fixed, and worth doing next:

- a clinic summary over the `--days` window, plus a `weekday` field;
- trimming `availableDates`;
- a per-specialty `deltaFromPreviousPeriod`. A region's delta is its
  all-specialty total even with `--specialty`, and the agents flagged it as a
  trap next to specialty figures. The module already warns about it.
- comparable-coverage help across `--years` reports, such as a province sum
  over the regions present in every period;
- `period.endDate`;
- the region name next to `missingRegions` codes.

Already listed above, and raised again: no named facility drop in
`urgences-cumulatif`, the history `source` being a `file://` path in the
snapshot, and no citable count of the snapshots behind `typicalOccupancyPct`.

### Decision

Keep `--days`, `--years` and `--periods`. They score the same as the
one-call-per-date runs, cut the calls for these questions from 7 to 1 and
from 4 to 2, and make the comparable window the default way to ask for a
surgery trend.
