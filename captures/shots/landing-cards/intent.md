# Landing feature cards

Screenshots for the feature cards of the landing (`components/marketing/feature-chapter.tsx`),
read by `CardShot` from `public/captures/cards/<name>-<locale>-<theme>.webp`. A card shows
its picture in its lower right corner, fading out to the right and at the bottom, so each
shot isolates one element on a transparent background: the card's color shows around it.

## What each image must show

- **`pull-request`** — the top of PR #128: title, author, base and head branches, diff
  size, then directly the start of its description. The insights, status rows, tabs and
  activity between them are hidden. Served by the PR fixture (`../pull-request/`), no
  call to GitHub.
- **`share-view`** — the "Share view" dialog of the board's default view.
- **`inbox`** — the inbox popover, All tab, with the manual's six demonstration
  notifications (`../documentation-work/<locale>/fixture.json`), translated titles,
  three unread. Nothing is written.

- **`objective`** — the objective composer filled in: title (`Landing.cardMentions_objective`),
  two lines of description (`Landing.cardObjective_description`), lead (first member),
  target date (the 20th), color (blue). Nothing is created: the dialog is shot open.
- **`relations`** — the relation picker of AUR-2 after "Blocked by": its question as
  placeholder and the issues to pick, without the issue panel under it.

## Where

`http://localhost:3000` against the preview database, signed in as Camille Roy
(`node captures/lib/session.mjs`). Window 1440 × 900 at 2×.

## Variants

Six locales × light and dark: real dark captures, never inverted colors.

## Known pitfalls

- An app page's document carries the shell's reads (MIN-880, `lib/server-seed.ts`):
  on `/home` the notifications arrive with the HTML and the inbox route is never asked.
  The project page reads them from the browser; the script checks that AUR-2 is listed.
- The inbox popover closes when the pointer leaves it: it is shot by clip, pointer kept.
- The popover focuses its first control on opening: blurred before the shot.
