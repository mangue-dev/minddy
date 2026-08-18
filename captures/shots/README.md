# One capture = one folder here.

`intent.md` (what the image should show), `shot.mjs` (the script), `out/` (the
PNG), `history.jsonl` (one record per run). Instructions for use are in the
skill `capture-shot`; this file only holds state.

Target: `CAPTURE_BASE_URL=https://preview.minddy.app`. The eleven captures in
come — including `feedbackInbox`, whose local parenthesis of August 4 is
closed.

## Where are the eleven locations

The first ten refreshed on **2026-08-12** (commit `bce6bbc`, which
`preview.minddy.app` was then used — `/api/version` says so), after 223 commits
without recovery. `pagesEditor` is from the same day, taken separately.

| Location | File | Frame | Window | State |
|---|---|---|---|---|
| `heroBoard` | `hero-board/` | 16/10 | 1736 × 1085 | published |
| `featureCycle` | `cycle/` | 16/10 | 1736 × 1085 | published, weak composition (staggered fortnight) — **rendered by no section** |
| `featurePalette` | `palette/` | 16/10 | 1736 × 1085 | published |
| `feedbackBoard` | `feedback-board/` | 16/10 | 1736 × 1085 | published |
| `feedbackInbox` | `feedback-inbox/` | 16/10 | 1736 × 1085 | published, relative dates wrong (see its `intent.md`) |
| `pagesEditor` | `pages-editor/` | 16/10 | 1736 × 1085 | published |
| `workflowIssue` | `issue-create/` | 4/3 | 1447 × 1085 | published |
| `numoPanel` | `numo/` | 4/3 | **1200 × 900** | published |
| `workflowPr` | `pull-request/` | 4/3 | 1447 × 1085 | published |
| `scratchpad` | `carnet/` | 4/3 | 1024 × 768 | published |
| `workflowAgent` | `agent/` | 4/3 | 1447 × 1085 | published |

### Three scripts had to be corrected on August 12

Each is a case where the screen has moved under a selector, and the failure mode
deserves to be known:

- **`issue-create`** — Smart-fill (MIN-260) is armed by default, and it *removes*
of the DOM the four properties that it will fulfill. Frank failure, in timeout.
- **`agent`** — `/agents` now opens with a new conversation, the run
lives in the left column. Without the added click, the image came out on a
home screen.
- **`pull-request`** — the worst of the three, because it was **green and false**:
the diff is passed to `@pierre/diffs`, which renders in a **Shadow DOM**. THE
Playwright locators cross it (so the wait passes), but
`main.querySelectorAll` no — and the colors are calculated in `oklab()`, that
reading `rgb()` no longer recognized. The count said 0 lines
colorful on a fully colored diff. **A control that reads the DOM must
go down into the `shadowRoot`, and let the browser convert them
  couleurs.**

Two exceptions, each justified in the `intent.md` of its file:

- **`numoPanel` frame in 1200 × 900.** The compact panel has fixed metrics,
it is therefore the window which regulates its presence. 1200 is a floor:
`--breakpoint-desktop` is 1200 px, and below that the shell switches to setting
  page mobile.
- **`feedbackInbox` was taken from `http://localhost:3000`** (with
`VERCEL_ENV=preview`, which makes the preview logo blue): the team view of the
Feedback fell on its error boundary in preview, and the fix
was not yet deployed at the time of capture.

**All eleven catalog locations are published.** The twelfth, `voiceDictate`,
has been removed: the dictation is illustrated by a figure
(`components/marketing/voice-dictation-figure.tsx`) and not by a capture — the
popover only exists after a successful `getUserMedia`, and it would not show any
way that the act of recording, not what the spoken phrase becomes.

## The window depends on the FRAME, not on the desire

`<ScreenshotSlot>` renders the image as `object-cover`. A capture that does not have the
ratio of its frame is **cropped in the center**, in silence: a 16/10 image in
a 4/3 frame loses 17% of its width, equally on both sides. On the
side panel screens, that cuts the point.

- **16/10 frame → 1736 × 1085.** This width falls right into the gutter which
follows the 4th column of the board (columns of 352, not 364).
- **Frame 4/3 → 1447 × 1085.** Same height, therefore same vertical composition as
the others; it is the width that gives way. Extending the height to 1302 would have held
scaled identically but left a third of the image empty in gray.
- **`scratchpad` derogates**: its modal does `90vw × 90vh` when its content has
fixed metrics, so the window decides the amount of white around the
  note. Voir `carnet/intent.md`.

## The catalog is not reliable, the product is authentic

Of the nine locations treated, **five instructions for
`components/marketing/screenshot-slots.ts` described a UI that does not exist
pas**: a detailed exit route, a “description AND plan” view that
tabs make exclusive, “unfolded” tool calls that don’t unfold
not, an unattainable “Ticket in context” badge, an absent team response
from the public board list. Each `intent.md` tells which one and why.

Read the code of the targeted screen before writing the script, and correct the intention
rather than forcing the product.

## What scripts check before shooting

Each `shot.mjs` fails with a message that says what to fix, rather than
produce a shaky image — a green capture may be empty, this is the mode
most costly failure. Control anchors are **data** (`AUR-2`,
`lib/palette/actions.ts`, “Before the release”), never translated wording:
a wait on a translated word breaks one variant out of two.
