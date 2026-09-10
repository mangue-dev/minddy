# The Routines tab — scheduled agent work

Landing location: `routines`, the full-width card closing the agents bento.
The card copy says the agent can be given a recurring task: instructions plus
a schedule, autonomous runs, a report. This capture shows the screen where
that lives.

## Ce que l'image doit montrer

- The `/routines` page, logged in as Camille Roy, NOTHING selected initially
  replaced by the **weekly security review selected**:
- the list in the secondary sidebar: **3 routines**, each with its cadence
  line and its **“En pause” badge** (demo routines are seeded disabled —
  this badge is the visible proof, and it must stay);
- the detail on the right:
  - the title **Weekly security review** with its **paused state** and the
    enable switch OFF;
  - the cadence line with the schedule: **every Monday at 09:00, Europe/Paris**;
  - the model line **Claude Sonnet 4.5**;
  - the instruction paragraph, rendered as plain text;
  - the runs table with **4 rows**: 3 completed with
    durations of 7–11 min and usage around 3–4 %, 1 **failed** with
    no duration. Dates all fall on Mondays at ~09:00, matching the cadence.
- no pull request anywhere: the demo runs are at rest without PRs.

## Where

`/routines`, weekly routine selected by clicking its row in the list.

## Variants

fr/light, fr/dark, en/light, en/dark, de/light, de/dark, pt-BR/light,
pt-BR/dark, it/light, it/dark, es/light, es/dark

## Known pitfalls

- **La routine se choisit par son TITRE**, pas par sa position: the list is
  data, the title is identical in every locale.
- **The “paused” badge is data, not a defect.** The routines are
  seeded disabled on purpose (see `captures/world/seed/016-routines.mjs`):
  the scheduler must never claim them, and the switch must stay OFF in the
  capture.
- **Les horodatages sont absolus** (`created_at` seeded, displayed as is):
  they are stable across variants, unlike relative dates — but they only
  agree with the cadence if the seed ran with the fixed formula (07:00 UTC →
  09:00 displayed under Paris summer time).
- **The table only appears once a routine is selected.** Without the click,
  the main pane shows the “pick a routine” hint — that is the failure mode
  of a green run with an empty main.
