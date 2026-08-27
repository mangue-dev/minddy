# A wiki page

Landing location: `pagesEditor`. The catalog instructions
(`components/marketing/screenshot-slots.ts`): *“an open wiki page: to
left the project page tree with a page unfolded on its subpages, at
right the content — a title, a paragraph, a list of check boxes including
two checked, and a mention pill towards a ticket in the text. No menu
open: this is the page as we read it, not the editor currently being
manipulated. »*

## Ce que l'image doit montrer

- **The tree, on the left**: the four root pages of Aurora, and “📘 Product
handbook » **unfolded on its three subpages**, including the one which is open —
highlighted in the tree.
- **Parents' thread**, above the title: “📘 Product handbook”, which says
that a page is a page, not a fragment of its parent.
- **The content**, on the right: the 🚀 icon and the title “Release process”, a
paragraph, the subtitle “Before you ship”, **five check boxes including two
checked** (both checked and crossed out), then a final paragraph bearing the
  **pilule `AUR-2`**.
- **Nothing open**: no “/” menu, no ⋯ menu, no block handle
on hover, no cursor in the text. It’s a page that we read.

## Or

`/projects/6cd36606…/pages/cd3ee91e…` — the Aurora “Release process” page,
connected in Camille Roy. The data comes from
`captures/world/seed/014-pages-aurora.mjs`.

## Variations

fr/light, fr/dark, en/light, en/dark, de/light, de/dark, pt-BR/light,
pt-BR/dark, it/light, it/dark, es/light, es/dark

The content of the pages is in **English** in all four: it is data,
like board tickets. What changes from one language to another is the
chrome — “New page”, “Filter 7 pages…”, “Modified by…”.

## Cadrage

1736 × 1085, slots window in 16/10 (`heroBoard`, `featureCycle`,
the two return boards). You need the width: the shaft and the body of the
page must fit side by side, and that is precisely what the section is about.

## Known pitfalls

- **The target is the preview environment**, not the production: the pages are not there
Again. `CAPTURE_BASE_URL=https://preview.minddy.app`, and a session taken
on the same host (`CAPTURE_BASE_URL=… node captures/lib/session.mjs`) — the
Authentication cookies are domain-related.
- **Hover places a block handle** in the left margin of the text
(`components/pages/block-gutter.tsx`). The mouse is therefore removed from the body
before taking; otherwise, the image shows the editor being manipulated,
  ce que l'intention interdit explicitement.
- **The two checked tasks can be recognized by the crossed out text**, not by the attribute:
this is what the control measures, because this is what the eye reads.
- **The pill is a stored node, not re-scanned text.** Unlike a
ticket description, the page editor does not hydrate the “@…” written in
text — see seed script header. If the pill comes out in plain text,
It is the seed that must be taken, not the capture.
- **The header displays “Modified by Camille Roy · 2 days ago”**: the dates
of the seed are before the frozen clock (July 15, 2026). A “now”
to the image means that the pages were rewritten after the fact, with the date of
day — restart `014-pages-aurora.mjs`, which resets them backdated.
