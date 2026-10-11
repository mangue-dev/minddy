# Delegated worker reliability and card controls

Date: 2026-10-11. Reviewer: agent:/root. This is an agent source, interface and
language review, not human acceptance or a provider rehearsal.

## Brief and scope

Members need to follow delegated code work, stop it, copy its branch and open its
PR without leaving Minddy. Affected article: `code-work` revision 8 in all six
locales, workflows `N03` and `N04`. Applicable version: 0.11.1 candidate on this
branch. Existing hosted native authentication restrictions remain in the guide.

## Evidence and behavior

PR #406 / MIN-678 showed a native implementation ending without its PR, followed
by a separate publishing run. Its `validate_changes` request failed after the
180-second bridge deadline while repository tests continued until their longer
timeout. The PR already contained its Numo footer on GitHub; Minddy's description
renderer deliberately removed that final line. The recorded final Numo turn
completed after the worker, so this example does not independently reproduce a
premature final parent response.

The shared card and panel now separate state/timer, harness/model, branch and
actions. Stop uses a destructive menu item. The PR button uses the former gray
outline style above the primary View work button; it routes to Minddy's PR view.
The branch copy icon has the localized existing tooltip. The timer accumulates
execution intervals, ignores subagent summaries and excludes input waits.
Incomplete native responses receive bounded repairs. Nonterminal or superseded
terminal snapshots cannot trigger a parent continuation. Authorized implementation
requires PR delivery; missing publication remains an explicit failure.

Explicit validation shares a 150-second shell budget, runs expensive checks in
sequence, limits Vitest/Jest to two workers and sets test environment explicitly.
The installed compatible TypeScript compiler can be used when the default
compiler cannot start under native isolation. Compiler heap is capped. Runtime
installation reuses verified pinned private CLI packages on resumed snapshots.
Startup heartbeat and visible preparation stages cover native bootstrap.

## Language and figures

Reviewed equivalent control and delivery wording in `en`, `fr`, `de`, `es`, `it`
and `pt-BR`. The updated `delegate-code-work-workflow` screenshots use the actual
card component with localized demonstration data and a fixed fixture clock.
Data hooks, navigation transport and the activity feed are isolated; screenshots
do not claim a real provider execution, publication or passing CI. Model logos,
menus, tooltips, buttons and responsive panel primitives are real components.
The existing PR Changes illustration remains accurate and retains its original
capture date. Capture details and checks are recorded below after inspection.

Inspected all six light-mode figures at 568 × 379 CSS pixels, captured at 2×
scale with 24-pixel outer padding. The Italian timer translation was corrected
after the visual review. Also inspected the real copy tooltip and activity panel
in Italian, and the destructive Stop menu at a 390-pixel French dark-mode viewport.
No horizontal overflow was observed. The browser console contained only a missing
fixture favicon; no component errors occurred. These checks used one static fixture
server and one browser session at a time, with the browser closed before compilation.

## Verification

- The targeted 12-file suite passed all 238 tests, including native startup
  heartbeat, incomplete completion repair, required PR delivery, timer intervals,
  destructive cancellation, clipboard copy and internal PR navigation.
- A subsequent 47-test delivery subset passed with the additional regression
  proving that the initial Git probe consumes the shared validation wall budget.
- Typecheck, focused source/test lint, both worker bundle builds and
  `git diff --check` passed.
- `check:documentation`, `check:documentation:release`, `check:knowledge` and
  `check:owned-english` passed. Updated article ID: `code-work`; workflows: `N03`
  and `N04`; updated figure ID: `delegate-code-work-workflow` in all six locales.

No production deployment or paid native provider run was performed. The exact
reported premature Numo wake-up and cold-start provider latency still require
operational confirmation; protective behavior is covered by regression tests.
