# The code agent run

Landing location: `workflowAgent`, second of the three stages of “Du
ticket to pull request”. The text next to it says: *“The run begins in a
isolated environment. Each task changes to "in progress" then to "completed" for
that he is working: you follow the progress without rereading the entire thread. »*

## Ce que l'image doit montrer

- The `/agents` page: the list on the left with the run on **AUR-2**, its status
**Pending**, and the ticket header on the right.
- Camille's instruction, then the **unfolded execution thread**:
- the agent's reasoning, in plain language;
- its **three readings** (`glob` on `**/palette/**`, then
`lib/palette/actions.ts` and `components/palette/provider.tsx`);
- its **editing of the three files**;
- the block **3 modified files +58 −7**, open, with the count per file;
- the **test command** that he launched.
- The summary, which asks a question — the run is **at rest, waiting for
response**, not running.
- The bottom composer, showing the `Claude Sonnet 4.5` model. Branches are no
longer rendered in this view in production.

## Or

`/agents` on `https://www.minddy.app`, connected to Camille Roy. The run is
automatically selected: it's the only one.

## Two accordions to open, and why

The thread arrives **folded**: a completed run closes its unfolding
(`AgentEventFeed`, `useState(active)` puis fermeture au passage travail →
finished). Without opening them, the image does not show any tool calls — this is
yet the whole point.

1. **The work sequence**, behind “Worked for 8 minutes and
   40 secondes ».
2. **The reading group**, folded into “Reading of…”: several actions
of the same turn come down to the last one. Opened, it renders the three lines.

The “3 modified files” block opens by itself with the scrolling.

## A product bug found here, and fixed

The run displayed “**Editing 0 file(s)**” just above its own
“3 files modified”. This was not the demo data: `toolArgSummary`
(`lib/server/agent/agent-loop.ts`) persists `{ count, paths }` for
`apply_edits`, and that's what the seed wrote. It is the display which
counted `args.changes`, a key that only exists in the raw arguments of the
model and **never** in what the thread rereads. Any real run therefore showed zero.

Corrected in `components/assistant/tool-call-display.tsx`: fallback to `count`,
then on `paths.length`. The script checks the expected label and **fails both
that the correction is not in production** — this is intentional, a capture should not
pas photographier ce bug.

## Cadrage

1447 × 1085, the common window of slots 4/3.

## Variations

fr/light, fr/dark, en/light, en/dark, de/light, de/dark, pt-BR/light,
pt-BR/dark, it/light, it/dark, es/light, es/dark

## Known pitfalls

- **The process is designated by its DURATION, not by its wording.** “Worked
for 8 minutes and 40 seconds” / “Worked for 8 minutes and 40 seconds”:
only the duration is common to both languages, and it comes from the timestamps of the
run. Hence the `/8…40/` anchor.
- **Never aim for “the first closed accordion”.** One run taught us this: the
first `button[data-state="closed"]` of the page is the “New” menu, in
top of the list. It opened instead of the thread.
- **The run must never be `queued` nor `running`.** This is not a
rendering question: the cron would take it back and actually launch the agent
(microVM, calls billed). See `world.md`.
- **Numo's FAB is hidden on `/agents`** (`hiddenForRoute`), so nothing to
neutralize on this side.
- **Opening the run updates its date.** The date displayed on the run map
list is that of the last activity of the conversation, and the visit in
is one: in the run of 2026-08-04, the FIRST variant was released with “26
July” and the next three with “August 4”. Only one image out of four
said something different than the others. The remedy is to **replay the script once
second time**: the date is then stabilized for all four. To be checked at
each refresh, it's invisible without comparing the variants between
  elles.
- **The main sidebar reduces to a rail of icons** on this screen
from `fcb2a4d`: the list of conversations occupies the secondary column.
It's the product, not a capture defect.
