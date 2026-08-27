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

`/all?view=cycle` on `https://www.minddy.app`, connected to Camille Roy.
Window 1736 × 1085 (16/10), the same as the other captures.

## The framing, and why it is shifted

The cycle contains 12 tickets distributed as follows: Backlog 0, To do 2, In progress 4,
Review 1, Done 5. Framed at the left edge, the image would open to an
**empty** column and leave “Finished” — the five finished tickets, and therefore the entire
proof of progress — outside the frame.

The script therefore scrolls the board by **exactly one column step** (364 px)
before photographing. The visible columns become To Do, In Progress,
In review, Done, and the right edge falls right on the next gutter.
It's a gesture that a user makes, not a trick.

## Variations

fr/light, fr/dark, en/light, en/dark, de/light, de/dark, pt-BR/light,
pt-BR/dark, it/light, it/dark, es/light, es/dark

## Known pitfalls

- **Cycles are opt-in.** Without `cycles_enabled: true` in the metadata
of the account, the line exists in base but the application displays “Activate
cycles” and the screen remains blank. The first seed had set the pace without
the flag.
- **The cycle window expires.** It is calculated on the server side per hour
at the current time: the current fortnight runs until **August 3, 2026**. Afterwards, restart
`003-projet-beacon.mjs` then `004-cycle.mjs` before recapture.
- **The dates displayed in the header shift by one day** compared with the
database value (`19 juil. – 1 août` for a `2026-07-20 → 2026-08-03` window,
exclusive). This has no effect on the capture, but it may indicate a real
rendering lag in the product.
