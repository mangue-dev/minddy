# The public feedback board

Landing location: `feedbackBoard`, to the left of the team view in the
“Feedback” section. This image shows what **users** see
of a product; his neighbor shows what the team does with it.

## Ce que l'image doit montrer

- The board **sorted by votes**: eight visible returns, from 24 to 2 votes, each
with its clickable counter.
- Various **status badges** — Open, Planned, In Progress — which prove that
the board is maintained, not just an ideas box. Each line also carries
the **avatar of its author**, and its comment counter if it has one.
- The **search field** at the top, the state filter folded into a trigger
(“Open”), and the “Popular” sort.
- The **Share Feedback** button, and the “Aurora · Feedback” header with the
mention “Created with minddy”.
- No trace of session: it is a public page, seen by someone who has not
no account. The only connection button is on the board itself.

## Or

`/f/CTxGSyqeTTB85z8crWBwyw` on `https://www.minddy.app`, **disconnected**
(`openPage({ authed: false })`).

## Two things that the screen no longer shows (August 12, 2026)

- **The category column has disappeared.** The `aside` on the right now only carries
the “Share Feedback” button; category chips have also left the
lines. It's a product decision, not a botched capture — the column
therefore remains wide and calm on the image, and this is what a visitor sees.
- **“Delivered” is no longer in the frame.** The six status dots are folded
in a single trigger whose default, “Open”, groups the live states
and leaves the archive aside: eight returns instead of nine. `?status=all` them
brings everyone back, but the “Delivered” is ninth there, below the waterline —
we would only gain a wording “All” which would make us believe in a filtered view.
  On garde l'URL nue du board.

## A catalog instruction that does not survive the product

The catalog asks for “a team response unfolded on one of them.” The list
of the board does not return any: `teamResponse` is only read by the return page
(`app/f/[token]/feedback-post-client.tsx`), un clic plus loin. Il faudrait
choose between the list and the answer; we keep the list, which is the subject of
the location — and the team response is already visible, on the editorial side, in
`feedbackInbox`.

## Cadrage

1736 × 1085 — 16/10 frame, the common window.

## Variations

fr/light, fr/dark, en/light, en/dark, de/light, de/dark, pt-BR/light,
pt-BR/dark, it/light, it/dark, es/light, es/dark

## Known pitfalls

- **Disconnecting is not cosmetic.** Connected, header replaces
“Authenticate” with the identity of the visitor, and the board no longer appears
audience. `authed: false` is the first line of the script.
- **The titles of the returns are English data**, therefore anchors
valid for both languages. The statuses and sorting are translated.
- **The categories moved to English on July 26, 2026**, like the rest
from the demo world (`013-categories-en.mjs`). The older `out/` PNGs
still display “Functionality” and “Improvement”: they need to be redone.
The subject produced remains intact — a real project created in English is always born
with French categories, it is the `projects_seed_categories` trigger.
- **The number of votes comes from a trigger.** The 95 votes correspond to
real lines; a handwritten counter would drift at the first vote.
