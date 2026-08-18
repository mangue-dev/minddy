# The Numo panel

Landing location: `numoPanel`. The section is called “Numo already knows
your tickets” and poses as the first argument: *“The assistant is in the app,
not in a tab next to it. He reads your projects, acts on them and returns the
main. »*

## Ce que l'image doit montrer

- The conversation **“Sweep the unassigned backlog”**: the instruction to
Camille, the **folded work summary** (“Worked for 1 minute and
3 seconds"), then the final answer.
- That Numo **worked**: it is the duration summary which says so, and the answer
which proves it by naming the modified tickets.
- The **context badge** in the composer: Numo knows what we have under the
  yeux.
- The app **behind**, set back: the assistant lives there, but it's him who we
  parle.
- That Numo **acts** and does not just respond: the last response quotes
tickets modified by their identifier (AUR-11, AUR-7).
- The **context badge** in the composer: Numo knows what we have under the
  yeux.
- The app around, so we can see that the assistant lives there.

## Or

`/projects/<aurora>`, connected to Camille Roy. Panel opened by **G then A**,
conversation loaded from the list, and left in **normal size**.

## We photograph the FOLDED wire, and the COMPACT panel

**Folded.** Numo's work tour is stored behind a duration summary,
like in the code agent thread. This is the default state of the product, and
this is the one shown: the summary says that Numo worked, the final answer
names the tickets he modified. Expand spread his reasoning over the entire
the height of the panel to demonstrate what the concluding sentence already says.

**Compact — and it's a throwback, dated 2026-08-04.** The panel
was extended since July 26, for a reason that ceased to be true:
the spread put Numo in the center and returned the board to the setting.
`panel-geometry.ts` has since reconnected its size to the dialogue tokens of
mango-ui — `--spacing-dialog-w/h`, i.e. **90vw × 90vh**, the size of the notebook and
of project creation. Expanded, the panel now covers the entire screen:
the board disappears from the image, and the wire folded — six messages including a turn of
closed work — floats in the bottom two-thirds of white. The capture does not
showed more of an assistant in an application, but a chat page.

Compact, the panel keeps FIXED metrics (450 × 600, anchored at the bottom
RIGHT). It is therefore no longer him that we regulate, **it is the window**: see
« Cadrage ».

The summary is designated by its **duration**: the only part of the wording which comes
timestamps and not a translation, therefore the only one that is valid in both
LANGUAGES. Same process as `shots/agent`.

> Previous state, kept because it explains the instructions in the catalog: the
> tool calls went **online**, non-interactive, and the instructions
> “two or three unfolded tool calls” described a non-existent UI. THE
> unfolding exists now, but it carries the entire trick, not a call.

## 1 min 3 s is a given, not a coincidence

The duration displayed is the subtraction of the first timestamp from the last. The thread
lasted for **twelve minutes**: incredible for two searches and one
grouped update, and the “and 0 seconds” of a duration exactly sounded wrong.

`captures/world/seed/006-numo.mjs` now dates all six messages on
**0 s, 4 s, 9 s, 31 s, 38 s, 63 s** — unequal intervals, because the time
reading a result is not like writing a sentence. The capture script
checks this duration: changing the sequence of the seed breaks the capture, and it is
voulu.

## A catalog instruction that does not survive the product

**“The Ticket badge in context. »** You would have to open Numo from a ticket
open — that's what `world.md` announced, and it's **impossible**: the panel
side of the ticket places a veil over the entire page, and the FAB of Numo (`z-40`)
goes under. Verified: `elementFromPoint` in the center of the FAB returns the foot of the
ticket sign. The `G A` shortcut doesn't save anything either — in a ticket
open, `A` is the “assign” shortcut, and it opens the assigned selector.

The badge is therefore there, but it names the **view of the board** (“All” / “All”).
This is one of the three contexts that the landing itself claims — *“the ticket,
the board or cycle that you have before your eyes »* — and the only one that can be
photograph without writing in base.

## Framing — 1200 × 900, not the common window

Landing frame: **4/3**. Window **1200 × 900**, instead of 1447 × 1085
of other locations 4/3. `carnet` derogates in the same way, and for a
related reason: when the subject has fixed metrics, it is the window which
decides how much of the image it occupies.

- at 1447, the panel weighs 31% of the width: the board, denser and more
colorful, go ahead. Now the section talks about the assistant;
- at 1200, it weighs 37% over 67% of the height. The board remains readable
behind, without taking the look.

**1200 is a floor, not a setting.** `--breakpoint-desktop` is 1200 px:
below, the shell switches to a mobile layout — sidebar retracted,
centered breadcrumbs, tab bar at the bottom, one-column board. A take into account
1024 × 768 came out exactly that, and the image told about an application of
phone.

The definition does not suffer from the smaller window: the shot is 2×
(2400 px) and `publishShot` serves 1600 px for a location displayed around
530 — three times the display density, like the others.

## Variations

fr/light, fr/dark, en/light, en/dark

## Known pitfalls

- **`G A` in an open ticket opens the assigned selector.** The panel must
open from the bare board.
- **Tooltips remain displayed after a click.** Radix keeps them open
as long as the button has focus: after “Conversations” and “Enlarge”, it
you have to remove the focus, otherwise a black bubble crosses the capture. One run got it
  produite deux fois.
- **The conversation is not restored**: the panel reads again
`localStorage`, empty in a new capture context. You have to go through
list. Its title is an English given, therefore a valid anchor for both
  langues.
- **The action labels are ICU plurals.** The script reconstructs them
from `messages/<langue>.json` rather than copying them: if the product
changes “tickets found” to something else, the capture says it instead of it
  photographier en silence.
