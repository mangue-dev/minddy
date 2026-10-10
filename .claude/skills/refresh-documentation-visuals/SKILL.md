---
name: refresh-documentation-visuals
description: Refresh Minddy documentation illustrations and screenshots to match the current UI, with localized assets, responsive code diagrams and visually reviewed captures. Use when documentation figures are stale, poorly framed, empty or inconsistent with the landing's style. Article accuracy audits belong to maintain-documentation; landing-page captures belong to capture-shot.
---

# Refresh documentation visuals

Make each requested figure explain its article and reflect the identified
product version. Audit the public corpus when no narrower scope is given.
Produce and inspect the assets, update their article metadata and complete the
reviewed PR; a capture plan alone is not the result.

## Inventory and choose the visual

Follow `AGENTS.md`, including Git workflow and local resource limits. Read the
[editorial guide](../../../docs/documentation-editorial-guide.md) illustration
rules and the [article contract](../../../content/documentation/README.md).
Inspect the relevant `figures`, `requiredFigures`, captions and preceding
instructions in `content/documentation/{en,fr,de,es,it,pt-BR}/`. Trace each
asset to its capture intent/script and review record. Identify the current
release or candidate commit and the runtime that will actually be photographed.

For each figure, record its reader purpose and choose:

- A real screenshot for recognizing a control, menu, dialog or meaningful UI
  state, such as issue creation. Capture the current application, not a
  documentation preview or a reconstructed component.
- A responsive code illustration for relationships, responsibilities,
  authorization boundaries or workflow steps, such as connecting a Git
  account and linking its repository. Use `DocumentationDiagram` in
  `components/documentation/documentation-diagram.tsx` and the shared landing
  palette in `components/marketing/card-tones.ts`.
- Text or a native table when it already conveys the information. Remove
  redundant empty figures and reconcile `requiredFigures` and body references.

Keep code illustration labels selectable and wrapping on phones. Use numbered
markers and arrows for ordered sequences, not decorative dots in collections.
Update structured `diagram` data and the SVG Markdown fallback together,
preserving localized meaning, reading order and technical inline code. Do not
rasterize a diagram or draw a substitute for a real UI screenshot.

## Prepare a bounded capture

Reuse an existing suitable server. Under the current incident restriction, do
not automatically restart Docker or the capture environment; continue file
edits and arrange a separate bounded capture run when needed. Never expand
`turbopack.root` or a scanner/watch root above the repository. Take lightweight
process and memory snapshots before capture and between batches, for example
`ps -axo pid,ppid,%cpu,%mem,command` and `vm_stat` on macOS.

Use one browser, one context and one page at a time, one locale per batch,
with at most three screens. Run no build, type check, image pull or second
server alongside it. Stop on the first failure. If workers stay CPU-bound or
the machine slows unexpectedly, stop task-owned heavy work and inspect child
processes; clean up only those workers before considering another backend.

Reuse `captures/shots/documentation-*/intent.md` and `shot.mjs` when suitable;
read the chosen script before running it. Some older scripts default to every
locale/screen, open a browser per screen or catch failures and continue. Set
explicit filters and run one screen per invocation in those cases, then inspect
the review record before continuing. For example, on an already running local
candidate compatible with `documentation-product`:

```bash
CAPTURE_BASE_URL=http://localhost:3000 CAPTURE_LOCALES=en DOC_CAPTURE_SCREENS=new-issue node captures/shots/documentation-product/shot.mjs
```

Substitute the verified server URL and a screen supported by that script.
Check resume behavior against the target commit: an existing image does not
prove it reflects the current UI. A zero exit code does not prove capture
success; inspect recorded errors and open the PNG.

Inspect live controls before choosing semantic locators. Use the existing
demo account/session and guarded fixtures from `captures/lib/`. A hosted demo
can supply visible-control evidence if its deployed version matches the target;
do not bypass a script's local-candidate guard. Keep business writes blocked
and log any permitted navigation writes. Never submit an issue, sharing,
account, import, notification, AI or publication action just to take its picture.
If additional persistent demo data is necessary, read
[capture-world](../capture-world/SKILL.md) and use its guards and authorization
workflow. Never print credentials or include private account data in assets.

Use realistic, populated and localized demonstration content unless the
article explains an empty state. Response-only fixture adaptations must be
recorded as examples and must not imply a completed real operation.

## Capture, frame and inspect

For new captures use `settleDocumentationPage` and
`captureDocumentationControl` from `captures/lib/documentation-frame.mjs`.
Capture in light mode at a native integer `deviceScaleFactor` of at least two,
with loaded fonts, PNG output, sRGB and grayscale text antialiasing. Set theme
before the first paint using the existing browser helper. Wait for meaningful
UI readiness rather than `networkidle`, which does not settle with Realtime.

Capture the full control, including its footer and rounded corners. Ensure
the browser is tall enough to avoid clipping. Isolate unrelated content while
preserving the control's actual background. Bake equal transparent margins of
24 CSS pixels into all four asset edges. Retain the helper's `viewport`,
`padding` and `deviceScaleFactor`: the viewport is the cropped display size
including margins, not the browser size or device-pixel dimensions. Small
popovers stay at their natural display size; do not stretch them across the
article. Never upscale a low-resolution image to simulate native density.

Open every produced image with an image-viewing tool. Check the intended
control/state, localized labels and data, loaded fonts, contrast, all four
margins, footer, unwanted overlays and clipping. Correct failures before
accepting the asset. Close the browser in `finally`, including on failure.

`captures/frame-documentation.mjs` only adds margins to existing pixels. It
does not refresh UI evidence; retain the original capture date for framing-only
changes and never count those images as newly captured.

## Reconcile and verify

Save approved assets under `public/documentation/<locale>/` and update every
affected locale's figure metadata: source, meaningful alt text, caption,
revision, actual `capturedAt`, display viewport, theme, padding, device scale
and review result. Follow article `revision`/`sourceRevision` and review rules
when changing metadata. Keep unchanged captures' dates and provenance intact.

Save sanitized evidence in `content/documentation/reviews/`: source commit and
working-tree state, runtime/version, route, control, locale, capture date,
dimensions, density, demo adaptations, blocked/permitted writes, inspection
result, reviewer and limitations. Set `reviewed` only after inspecting the
image. Record failed or interrupted captures as such, not as approved assets.

After capture workers close, review representative article layouts on desktop
and phone, in light and dark mode; the screenshot assets themselves stay
light. Confirm natural popover size, no horizontal overflow, accessible
captions, consistent code/SVG meaning and a working image viewer. Cover longer
locale labels when shared renderers change, using the same bounded browser
rules. Arrange deferred runtime verification separately if the environment is
unavailable and report it explicitly.

Run `npm run check:documentation`, `npm run check:knowledge`,
`npm run check:owned-english` and `git diff --check` sequentially. If capture
helpers change, run `node --test captures/lib/documentation-frame.test.mjs`;
choose relevant renderer tests only when those components change. Use
`npm run check:documentation:release` before claiming the full publication
set is ready. Verify images visually as well as checking metadata.

Finish with DCO-signed commits and `npm run work:pr`, including representative
screenshots in the PR when feasible. Preserve an existing PR's title/body
unless the user requested a rewrite; link new visual evidence in the final
report when needed. Report refreshed and removed figures, verified runtime,
checks and pending captures. Do not deploy without an explicit request.
