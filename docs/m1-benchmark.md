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
