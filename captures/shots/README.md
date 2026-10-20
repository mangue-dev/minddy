# Product captures

Each folder contains `intent.md`, its Playwright `shot.mjs`, lossless PNGs in
`out/`, and a run history in `history.jsonl`.

## October 20, 2026 refresh (0.20.0)

The landing shots were recaptured on `https://preview.minddy.app` serving
`775275a0` (`c60721f0` for `routines`, after the MIN-747 copy update), in six
locales and both themes, then published with `publish.mjs --shots` and
`focus-marketing.mjs`. Before the run, the demo account's accumulated synced
tabs were deleted and its Getting started checklist dismissed (approved demo
cleanup); clear the tabs again before each shot so earlier routes do not appear
in the tab strip. Seeds `015` and `017` were reapplied for the Oct 12-25 cycle.
`CAPTURE_THEMES=light|dark` runs one theme when a shot needs synced state reset
between variants (`routines`).

## September 6, 2026 refresh

All captures target `https://preview.minddy.app`, serving commit `07b1599c`.
The ten active shots each cover French, English, German, Brazilian
Portuguese, Italian, and Spanish in light and dark themes. The retired
`issue-plan` shot keeps its four French/English variants and is not published
into the `workflowIssue` slot. The retired `agent` shot (MIN-747) keeps its
masters but has no landing slot since Numo stopped delegating code work.

| Slot | Folder | Viewport |
|---|---|---|
| `heroBoard` | `hero-board` | 1736 × 1085 |
| `featureCycle` | `cycle` | 1736 × 1085 |
| `featurePalette` | `palette` | 1736 × 1085 |
| `feedbackBoard` | `feedback-board` | 1736 × 1085 |
| `feedbackInbox` | `feedback-inbox` | 1736 × 1085 |
| `pagesEditor` | `pages-editor` | 1736 × 1085 |
| `workflowIssue` | `issue-create` | 1447 × 1085 |
| `numoPanel` | `numo` | 1200 × 900 |
| `workflowPr` | `pull-request` | 1447 × 1085 |
| `scratchpad` | `carnet` | 1024 × 768 |

The shared browser clock is September 6, 2026. This keeps the July feedback
creation dates in the past. Numo retains its separate August 23 listing clock
so the seeded conversation remains within the rolling history window.

The current cycle now includes the five already completed Beacon issues,
moved with user approval through `015-current-cycle-completed.mjs`. Their
titles, statuses, assignees, and completion dates were preserved. The cycle
shows both projects, five completed issues, and populated progress rings.

The capture helpers tolerate an in-flight view-name refetch being disposed
when the browser closes.

## Refresh and publish

```sh
CAPTURE_BASE_URL=https://preview.minddy.app node captures/lib/session.mjs
CAPTURE_BASE_URL=https://preview.minddy.app node captures/shots/hero-board/shot.mjs
CAPTURE_BASE_URL=https://preview.minddy.app node captures/shots/pull-request/shot.mjs --capture-only
node captures/lib/publish.mjs --shots
node captures/focus-marketing.mjs
```

Run each shot script, inspect every variant against its intent, and only then
publish the existing PNGs. Publishing regenerates 120 full-size WebP assets
and the screenshot manifest. The focus script produces 60 additional WebPs;
review their crops after any product layout change.

The PR shot serves its existing synthetic forge fixture through browser route
handlers. Its `--capture-only` mode opens the ready review fixture directly,
retaining layout, language, theme, and colored-diff checks. The default mode
also replays the existing mutation UI checks. Both modes dismiss test toasts
and collapse CI details before shooting. The issue creation shot never submits its form. All other subjects
come from the existing demo world.

## Capture checks

- Shared helpers verify the requested HTML language and theme after hydration.
- Board shots check column geometry; source images must match the slot ratio.
- The page editor checks its seeded content, not translated titles.
- The palette checks visible issue and action results, including clipping.
- PR checks traverse shadow roots to verify the rendered colored diff.
- Session state stays in ignored `captures/.auth/` and is never committed.

The refreshed landing was also reviewed at 390, 820, and 1440 pixels wide,
using the preview page with browser routes serving the regenerated local
capture assets, including Next image URLs. All capture images loaded and no
horizontal page overflow was detected. Feedback and PR focus rectangles were
adjusted to preserve complete rows and panel borders.
