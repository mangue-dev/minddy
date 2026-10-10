# MIN-671 objective momentum review

Reviewed on 2026-10-10 by `agent:/root` for the 0.11.1 development change
MIN-671. This is a targeted source, rendering and language review, not a
production release acceptance or a new operational review of all objectives
features.

## Reader outcome and affected content

Members need to understand why the Momentum panel is absent and how to make it
available. Updated article `objectives`, section `momentum`, in `en`, `fr`, `de`,
`es`, `it` and `pt-BR` from revision 6 to revision 7. Workflows W10 and W11,
section IDs, the legacy article alias and unrelated objective procedures remain
applicable. Updated the retained `core-tracker` knowledge source as well.

## Factual evidence

- `components/objective-momentum.tsx::ObjectiveMomentum` returns no content
  without `target_date`; its child mounts statistics and clock hooks only when
  a date is present. This covers every objective status.
- `components/objective-detail.tsx` still renders overall linked-work progress
  separately from the Momentum panel. Target editing updates the objective
  supplied to the panel.
- `lib/objective-momentum-render.test.ts` verifies empty output without a date,
  adding/removing/restoring the date, and existing dated rendering, translations,
  time-zone behavior and canceled forecasts. The focused render and calculation
  suites passed all 43 tests.
- `lib/objective-momentum.ts` retains its calculations. A populated target
  defines a period only when it is valid and later than creation; the rolling
  fallback remains for a populated date that cannot define that period.

## Language and illustration review

Compared each changed passage with English revision 7. All six variants state
the date requirement, the hidden history/statistics/forecast, the recovery
action of adding a date, and the independent overall progress indicator. Each
retains the fallback condition for a populated date without a valid period.
Checked localized panel names against the `Objectives.momentumTitle` key in
all six `messages/{locale}.json` files. This agent review covers the changed
passages; prior reviews remain the evidence for unchanged prose and procedures.

Visually inspected all six `reader-objective-momentum.png` variants. Every
image showed momentum with an absent target date, so all contradicted MIN-671.
Removed figure `objective-dependencies-and-momentum-steps`, its image reference,
metadata and public asset in every locale. The new visibility condition and
recovery action are explained in text. Figure `objectives-steps` depicts the
unchanged creation dialog and retains its prior capture date and review
evidence at the new article revision; no recapture is claimed.

## Verification

- Focused momentum render/calculation suites: 43 tests passed.
- Oxlint on the changed component and render test: passed.
- `npm run typecheck`: passed.
- `npm run check:documentation` and `npm run check:documentation:release`:
  passed, with 252 locale articles and all 92 workflows published in six
  languages.
- `npm run check:knowledge` and `npm run check:owned-english`: passed.
- `git diff --check`: passed.

The PR includes a light-mode component preview under
`docs/audits/images/min-671/momentum-target-date.png`. It renders the actual
Momentum and progress components with demonstration fixtures and local app CSS;
layout-class merging and hidden tooltip primitives use the same SSR stubs as
the render test. Playwright inspection confirms that the undated fixture keeps
progress and activity without a Momentum region, while the dated fixture shows
its history, pace and estimate. The surrounding property layout is a preview,
not an authenticated application screenshot or an end-to-end test.

No migrations, locale message files, release versions, deployment settings or
unrelated application components are changed.
