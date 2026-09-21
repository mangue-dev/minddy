# The code agent run, as delegated work

Landing location: `workflowAgent`, second of the three stages of “Du
ticket to pull request”. The text next to it says: *“Numo gathers the
project context and delegates repository work to a code worker in a server
sandbox when needed. Follow the work in the conversation.”*

## The surface changed with the product (2026-09)

The dedicated `/agents` page is RETIRED: a run now lives inside a Numo
conversation as delegated work. A `launch_code_agent` tool call in the parent
thread renders the **delegated-work card**, and the worker's own thread opens
in a **detail side panel** — one "View work" click on the card. That detail
panel is what this image photographs: it is the successor of the old `/agents`
thread view, over the board instead of on its own page.

The seed builds both halves (`captures/world/seed/008-agent.mjs`): the run
itself, and the parent conversation whose `launch_code_agent` tool row binds
it (the `numo_work_origins` view matches `run_id`, `launched` and
`metadata.success` on the tool result — without that link the card never
appears and the run keeps a standalone conversation in the list).

## What the image must show

- The **detail side panel** over the Aurora board (which stays readable
behind, on the left): the work is followed *in the tracker*.
- The header: the title **Add keyboard shortcuts to the command palette**
(`agent_runs.title`, stamped by the seed like the real titler), the state
**Waiting for your input** — the run is at rest, not running — the model line
**Claude Sonnet 4.5, No reasoning**, and **3 files changed**.
- Camille's brief (the run prompt) in the dark bubble.
- The **unfolded execution thread**:
- the agent's reasoning, in plain language;
- its **read group**: the glob on `**/palette/**` and the two file reads
(“2 files read, 1 search”);
- its second reasoning, then the **edit group** (“3 files edited, 1 command
run”);
- the block **3 files edited +58 −7**, with the count per file;
- the **test command** that he launched.
- The summary, which asks a question — the run is **at rest, waiting for
response**, not running.
- The muted note pinned at the bottom: you cannot send messages directly to
a code agent — replies go through Numo in the parent conversation.

## Where

The Aurora board (`/projects/6cd36606-…`) on the capture target, connected
as Camille Roy, Numo panel opened with `g` then `a`, the conversation
“Add keyboard shortcuts to the command palette” selected in the list, then
“View work” on the card.

## Two accordions to open, and why

The thread arrives **folded**: a completed run closes its unfolding.
Without opening them, the image shows no tool call — yet that is the whole
point.

1. **The work sequence**, behind “Worked for 8 minutes and 40 secondes”.
2. **The two action groups**: reads (“2 files read, 1 search”) and
edits (“3 files edited, 1 command run”). Opened, they render the searches,
the reads, the per-file counts and the test command.

## Why the parent conversation exists in the demo world

The card is the conversation's only door to the run. The seed binds them
with a tool row whose content carries `run_id` — the exact shape the loop
writes (`lib/server/assistant/execute-tool.ts`). Deleting the conversation
removes the card; the capture then has no way to open the sheet.

## Cadrage

1447 × 1085, the common window of slots 4/3. The board behind shows the
Backlog and To do columns — enough to say “this happened inside the
tracker”, without competing with the thread.

## Variations

fr/light, fr/dark, en/light, en/dark, de/light, de/dark, pt-BR/light,
pt-BR/dark, it/light, it/dark, es/light, es/dark

## Known pitfalls

- **The process is designated by its DURATION, not by its wording.** “Worked
for 8 minutes and 40 seconds” / “A travaillé pendant 8 minutes et 40
secondes”: only the duration is common to both languages, and it comes from
the timestamps of the events. Hence the `/8…40/` anchor.
- **The action groups are labeled from the app catalog**, not copied:
`summaryRead`(2) + `summarySearch`(1) and `summaryEdit`(3) +
`summaryCommand`(1), joined and capitalized exactly like
`summarizeToolCalls` does. The counts are decided by the seeded events; a
change there must be replayed here.
- **The run must never be `queued` nor `running`.** This is not a
rendering question: the cron would take it back and actually launch the agent
(microVM, calls billed). See `world.md`.
- **The card title lands late.** The card first renders the raw launch
objective, then swaps to `agent_runs.title` when the run query resolves. The
script waits for the stamped title BEFORE opening the sheet, otherwise the
shot races the fetch.
- **The detail sheet is not the only dialog** containing the topic: the
parent conversation's card carries the same title. The final check reads the
dialog whose `h2` matches, not the first one.
- **Opening the run updates its date.** The visit itself is activity: dates
in the conversation list move forward on every run. Harmless here — the list
is not photographed — but it explains a shifting “today” bucket between
runs.
- **The cookies banner** is neutralized upstream for all captures:
`browser.mjs` places `localStorage["cookie_consent"] = "declined"` before
loading. Nothing to do here.
