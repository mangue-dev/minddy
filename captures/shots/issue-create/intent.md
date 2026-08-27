# How to create a ticket

Landing location: `workflowIssue`, first of three stages of the section
“From ticket to pull request”. The text next to the image says: *“A title,
two sentences, one priority. The agent doesn't need more.”* This is the
claim the image must prove.

## Why this capture replaced the Plan tab

The first part is called **“You describe”** and showed the plan written by
the agent (`captures/shots/issue-plan/`). The step was wrong: the legend announced
what the user does, the image showed what the machine does, and the plan
came back to the second phase anyway (“he writes his plan, then codes”).

The image now shows the user's gesture, and nothing else: the
completed form, just before clicking on “Create”.

## What the image must show

- The modal **“New ticket”** placed on the Aurora board, which remains
visible behind the veil — we create the ticket *in* the tracker.
- A **title** and a **description of two sentences**, entered: the form is
filled, not empty. There is no third text field to fill out.
- Three properties placed in the compact row — **high priority**,
**M effort**, **Feature category** — and nothing else. The row shows seven
possible properties; leaving six empty makes the point that we ask for very
little.
- The **“Create in Aurora” button active**: the ticket leaves on the next click.

## The ticket is AUR-2, word for word

Title and description are those of AUR-2 in the demo world
(`captures/world/seed/002-projet-aurora.mjs`):

> **Add keyboard shortcuts to the command palette**
> Power users live in the palette but still reach for the mouse to run an
> action. Show the shortcut next to each row, and make it work from anywhere in
> the app.

This is not a staging detail. The next two beats of the section
photograph **the same ticket**: the agent's run (`shots/agent`) and his pull
request (`shots/pull-request`) both carry AUR-2. The three images
therefore tell a single story, from the form to the PR — change the ticket
from here would break the continuity without anything signaling it.

The description is exactly **two sentences** long, as the caption promises.

## Where

`/projects/6cd36606-c297-4920-8ce3-31b5f3697be8` on `https://www.minddy.app`,
connected as Camille Roy, with the modal opened from the keyboard using `c`.

Nothing is ever submitted: the form is photographed before clicking. The
ticket is not created in the production database, and the browser context dies
with the run, taking the local draft with it.

## Framing — 1447 × 1085

**This is the rule of five slots in 4/3 frame** (`workflowIssue`,
`workflowAgent`, `workflowPr`, `numoPanel`, `scratchpad`): all share a height of
1085 px, with the width reduced to 1447 (= 1085 × 4/3). `<ScreenshotSlot>` returns
the image with `object-cover`; a 16/10 capture would lose 145 px on each side,
including a substantial part of the centered modal. See `shots/issue-plan/intent.md`
for the complete reasoning.

## Variations

fr/light, fr/dark, en/light, en/dark, de/light, de/dark, pt-BR/light,
pt-BR/dark, it/light, it/dark, es/light, es/dark

## Known pitfalls

- **The title and description are DATA, identical in FR and EN.**
As everywhere in the demo world, the content is English and only the interface
is translated. They are therefore the verification anchors: changing them would
break one of the two variants.
- **The property row is controlled by `aria-label`, not by keyboard
shortcuts.** The S/P/E/A/L/D/O keys are ignored while the focus is in
the title or description (`create-issue-dialog.tsx` filters them on
`INPUT` / `TEXTAREA` / `contentEditable`), and it is necessarily there at this
that moment. We click the triggers, whose accessible labels are translated —
hence the `ARIA` table in the script.
- **The category selector is a multi-select: it does not close by itself.**
Press `Escape`, then check that the popover closed rather than the modal. Simple
selectors (priority, effort) close on selection.
- **The board tab bar arrives after the tickets** (separate request):
it is blurred behind the modal, but its absence would be visible. We wait
the default view tab before opening the modal.
- **The create button is a disabled `SplitButton` as long as the title is
empty.** Its active state is proof that the form is actually completed:
it's a control, not a decoration.
