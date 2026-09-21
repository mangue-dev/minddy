# The current fortnight

Landing location: `featureCycle`. Must show what distinguishes the cycle
from minddy: it is **personal and cross-project**, not a team sprint.

## What the image must show

- The cycle header: “Current cycle” with its dates, and the **two
rings** — completion and capacity. This is “visible progression”.
- Tickets from **two projects** in the same list, each prefixed with its own
project (`Aurora AUR-1`, `Beacon BCN-8`) — the heart of the matter.
- Enough completed tickets for the completion ring to be believable.

## Where

`/all`, then the **Cycle tab clicked by its label** (read from the catalog),
connected to Camille Roy. The `?view=cycle` deep-link no longer survives a
fresh browser context: the app-tabs session rewrites the URL before the
effect sees the param.
Window **1792 × 1120** (16/10) — widened from 1736 × 1085 when the board
started rendering the empty "Canceled" column too (see framing).

## The framing, and why it is shifted

The cycle contains 12 tickets distributed as follows: Backlog 0, To do 2, In progress 4,
Review 1, Done 5 — plus an **empty "Canceled" column** the board now always
renders (six columns of 352 px + 12 px gutter). Framed at the left edge, the
image would open to an **empty** column and leave "Done" — the five finished
tickets, and therefore the entire proof of progress — outside the frame.

The script therefore scrolls the board by **exactly one column step** (364 px)
before photographing. The visible columns become To Do, In Progress,
In review, Done; the Canceled column survives only as a ~2 px sliver at the
right edge, below the tolerance of the framing check (a column cut by more
than 32 px is a framing error). The 1792 window is what makes the four
non-empty columns fit after the scroll — at 1736, Done was cut by 42 px.

## The rings, and where their numbers come from

Completion **47 %**, capacity **45 %** — both app-computed. The capacity
target is calibrated from the last 3 closed cycles of the account
(`calibrationFactor`): seed `017-cycle-recal.mjs` keeps them at 80 completed
points so the factor stays 1 and the fortnight target stays 80 (36 points
filled → 45 %). Without that correction the factor floors at 0.5, the target
collapses to 40 and the ring reads 93 % — committed-heavy, half-delivered:
not the story the landing section tells.

## Variations

fr/light, fr/dark, en/light, en/dark, de/light, de/dark, pt-BR/light,
pt-BR/dark, it/light, it/dark, es/light, es/dark

## Known pitfalls

- **Cycles are opt-in.** Without `cycles_enabled: true` in the metadata
of the account, the line exists in base but the application displays “Activate
cycles” and the screen remains blank. The first seed had set the pace without
the flag.
- **The cycle window expires.** It is calculated on the server side per hour
at the current time. Afterwards, restart
`003-projet-beacon.mjs`, `004-cycle.mjs` and `017-cycle-recal.mjs` before recapture.
- **The dates displayed in the header shift by one day** compared with the
database value (`14–27 sept.` for a `2026-09-14 → 2026-09-28` window,
exclusive). This has no effect on the capture, but it may indicate a real
rendering lag in the product.
- **Auto-capture pulls assigned issues back into the cycle.** An assigned,
uncycled issue of Camille's re-enters the current fortnight on the next
reconcile — that is how AUR-18 ended up making 13 tickets. It stays out
because `017-cycle-recal.mjs` reassigns it to Alice; if it shows up again,
check its assignee first.
- **AUR-2 carries a plan badge ("2/6") and a due date** — expected, it is the
same ticket the `palette` and `issue-plan` captures stage.
