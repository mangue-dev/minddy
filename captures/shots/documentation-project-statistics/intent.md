# Project statistics (MIN-878)

## What the images must show

The statistics under a project's identity in Settings → General, on the demo
project Lumen (LUM, `captures/world/seed/022-projet-lumen.mjs`): about a
thousand issues and eight months of history.

- `project-statistics`: the Momentum section (completed in four weeks with its
  change, backlog change, median lead time, a filled twelve-week chart with
  both series) and Where things stand (a status bar with several statuses,
  non-zero overdue and stalled counts), then Contributors: one stacked status
  bar per person with the status legend. No loading skeleton, no empty state.
- `project-issue-graph`: the issue graph of the open issues, several readable
  clusters, no overlapping dots, the "linked issues left out" note and the
  "Include closed issues" switch in its legend.

Manual figures: light mode only, 2x, every locale (`en`, `fr`, `de`, `es`,
`it`, `pt-BR`). Pull request images (`output/`, never committed in the tree):
the whole statistics block, the graph with one issue hovered, and the side
panel opened from a graph dot.

## Where

`/projects/<Lumen>/settings?tab=general`, with the demo session.

## Known pitfalls

- The capture clock is frozen by default (`CAPTURE.frozenNow`), but the Lumen
  history is dated relative to the day it was seeded: the statistics compare
  against "today", so this shot freezes the clock at the real current time.
- Issue titles stay English in every locale (they only show on hover);
  contributor names are the demo people.
- An element screenshot that scrolls moves the pointer off a hovered dot:
  scroll the graph into view before hovering.
- Business writes are blocked; nothing is edited.
