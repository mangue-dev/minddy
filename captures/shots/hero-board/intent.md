# Board project — capturing the hero

Landing location: `heroBoard` (`components/marketing/screenshot-slots.ts`).
This is the first image of the site, the one that should make Minddy understand in one
second: a simple ticket tracker, full of real teamwork.

## What the image must show

- The **Aurora** project board, in **kanban grouped by status**.
The catalog instruction says “list view”: this view **does not exist** in
minddy. `ViewDisplay` (lib/types.ts) only carries `hideDone` — the board of
project is a kanban, with no alternative. Intent follows the actual product.
- **Four entire columns**: Backlog (2), To do (3), In progress (4),
In review (2). `Terminé` and `Annulé` fall out of frame — see the framing section.
- Credible titles, in English, no lorem.
- **A description on each card** — the three-line preview below the
title, which gives its height to the card and proves that a minddy ticket
contains something other than a title.
- **A category on each card**: colored sticker + name, bottom right.
They have been named in English since July 26, 2026 (`013-categories-en.mjs`),
otherwise the English variant would display “Feature”. Two cards carry two
categories and therefore display a “+1”: AUR-1 and AUR-11.
- Various priorities, including **an urgent** (AUR-1) — this is the visual cue
which proves that priority can be read at a glance.
- Varied efforts (xs → xl).
- **Three people assigned** with their badge: Camille, Alice, Tom.
- The sidebar visible. Since `fcb2a4d` (`SecondarySidebar`), it is
**framed on the open project** — Tickets, Objectives, Triage, Feedback,
Settings, with a return to home — and no longer the list of both
projects. The intention follows the product: what the hero must show is the
navigation of a project, the name of the project remaining readable in the breadcrumbs.
- No modal, no side panel, no cookie banner.

## Where

`/projects/6cd36606-c297-4920-8ce3-31b5f3697be8` on `https://www.minddy.app`,
logged in as Camille Roy (demo account).

## Framing — and why this exact width

Landing frame: **16/10**. Capture window **1736 × 1085** in 2x.

The kanban columns are 352 px wide, with a fixed pitch of 364, and start
at 280: their right edges fall at 632, 996, 1360, 1724, 2088, 2452.
window width of 1736 therefore stops in the gutter which follows the 4ᵉ
column — four entire columns, the fifth entirely off-screen.

This is the only framing that avoids a cut right in the middle of a card. A board
cut off a third of a title does not read like "there are more on the right", it
reads like a broken image. The first run showed it, in 1440 × 900.

The script **checks this geometry at each take**: if a column overlaps
the straight edge it fails instead of producing a shaky image.

## Variations

fr/light, fr/dark, en/light, en/dark

## What won't be there, and why

The original instructions mentioned “an issue in_progress with a badge
of agent”. The “Numo working” badge only lights up for a `queued` or
`running` run (`lib/server/agent/activity.ts`), and the demo world contains none:
a run in this state would actually be executed by the cron. The seeded run
on AUR-2 is at rest. If a marker still appears for this run, that is a bonus;
otherwise, the image is judged without this criterion.

## Known pitfalls

- **The PNGs for `out/` are expired.** They date from July 25, before the
tickets carried descriptions and categories: the cards are shorter and their
bottom-right corner says “None”. The next capture will be taller; the columns
will scroll farther, which is expected.
- **The cut on the right.** The first run at 1440 × 900 sliced the “In Review”
column to a third of a card. It does not read like “there is more to the
right”; it reads like a broken image. Hence the width aligned with the gutter
and the automatic check in the script.
- **The name of the view is no longer fixed in the database (corrected).** The
“All” tab was a `views` row whose name, translated at creation
(`ensureBaselineViews`), remained French in the English variant. It now
relabels the default view by its `kind`, as it already does for “My tickets”:
the capture from 2026-08-04 correctly displays “All” in both French and English.
Nothing needs correcting here.
- **The tab bar arrives AFTER the tickets.** It comes from a separate request:
one run produced an image without “All” or “My tickets”, with no error to
indicate the problem. The script now explicitly waits for the default view tab.
This is the typical failure mode: green, but wrong.
- **The “100%” dot in the header** is the usage indicator of the plan
(`components/usage-indicator.tsx`), not a project gauge, and it counts the
budget **remaining** (`remainingPercent`), not the consumed. The demo account
has not spent anything, it therefore displays its maximum — this is the right message on a
window capture. It said "0%" before the indicator switched to
the rest.
- **The cookies banner** is neutralized upstream for all captures:
`browser.mjs` places `localStorage["cookie_consent"] = "declined"` before
loading. Nothing to do here.
