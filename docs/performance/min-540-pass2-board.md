# MIN-540 second pass: board, subscriptions, and retained-view safety

This supporting audit compares the second-pass production build with PR #271's
starting HEAD, `ec6a12e94235b8c589d86637195ae24dfad28cd6`. It does not reuse the
pre-first-pass timings as its baseline. The consolidated report remains
[`min-540.md`](./min-540.md).

## Demonstrated causes and changes

Opening or changing an issue panel recreated the global board's action object,
status array, and creation callback. That invalidated the board and rich card
memoization even when no issue changed. Actions and statuses now retain their
identity; changing issue data remains a separate input. Card-local update and
category callbacks are also stable. A regression mounts the real global board
with 600 memoized card probes: opening, switching, and closing a panel must not
render those unchanged probes again. This test establishes the React propagation
cause; it is not a measurement of 600 complete cards.

The agent-activity provider previously published aggregate maps to every card.
It now exposes stable per-issue snapshots through `useSyncExternalStore` while
retaining one query per scope and its existing realtime/polling behavior. A
working-state, conversation, or PR change notifies the affected issue only.
Replacing the project scope replaces its store, and removed activity clears the
old snapshot. PR comparison includes the displayed PR number. A 600-subscriber
React test observes exactly one extra render when one issue changes.

Keyboard chord state had additional event-only consumers in cards and bulk
selection. They now read a stable current-value ref in event handlers; visible
keyboard hints still subscribe to the rendered chord state. Bulk selection also
uses the stable assistant action context. Keyboard tests preserve chord
precedence while checking that unrelated consumers do not rerender.

The constrained follow-up also exposed a remaining route subscription path:
`CreateProvider` recreated all four creation actions when the pathname changed.
Every card's closed field menu still subscribed through its objective-create
option before returning `null`, so 600 hidden menus could receive each Page
navigation. Creation actions now resolve their target from the latest committed
route and project list through layout-synchronized refs. Only creation
availability is rendered context state. Two provider tests verify that 600
consumers do not rerender on route changes and that old action references still
honor the new route, explicit project overrides, objective presets, warming,
dictation, changed project access, unavailable storage, and an empty project
list. This additional fix was made after the `after-a` series below; its effect
must be assessed using the final candidate series.

The first pass's inactive-halo fix remains intact: the production board still
has seven stylesheets. No controls, descriptions, relations, halos, card actions,
or animations were removed to obtain the results below.

## Measurements and remaining work

The following values come from `pass2-before-a.json` and `pass2-after-a.json` in
`output/playwright/performance/`, Chromium 153, 1440 × 1000, unthrottled CPU,
the dedicated six-project/600-issue fixture, and already-built local production
servers. Each observation includes a 2.2-second tail. Values are milliseconds;
brackets show the 25th–75th percentile interval. These are automated readiness
measurements, not field INP or isolated server timings. The main report contains
the other series and constrained profiles.

| Interaction | Samples per build | Before median [IQR] | After median [IQR] |
| --- | ---: | ---: | ---: |
| Issue opening, all observations | 5 | 711.6 [711.5–727.0] | 426.5 [411.0–430.7] |
| Create dialog, all observations | 5 | 368.4 [368.1–373.6] | 379.7 [375.7–381.7] |
| Cross-column drag, complete scenario | 3 | 1480.4 [1448.4–1524.5] | 1131.8 [1131.1–1185.8] |
| Hide primary sidebar | 5 | 196.3 [194.9–196.8] | 205.4 [193.0–211.4] |
| Show primary sidebar | 5 | 178.7 [167.1–179.6] | 178.0 [177.8–178.1] |
| Return to global board | 5 | 955.3 [951.4–968.2] | 508.4 [502.5–534.0] |

Excluding each run's first issue opening, the four warm observations have
medians of 711.5 and 428.6 ms. The first observation is reported separately in
the raw results; it should not be presented as a reliable cold-load estimate
from one sample. Creation and sidebar results do not establish an improvement.

Issue opening's median script work falls from 336.6 to 52.5 ms, while style work
remains 298.3 to 287.8 ms. Drag script work falls from 798.4 to 469.3 ms, but style
work remains 480.2 to 482.5 ms. The median immediate long-task total falls from
643 to 346 ms for issue opening, and 1116 to 665 ms for drag. Their observed tails
contain no additional long tasks in these samples; this does not establish that
all longer sessions are free of delayed work. Board returns still include
approximately 102 ms of deferred long tasks, 202 ms of style work, and 38 ms of
layout in the candidate series.

The drag improvement is concentrated at the drop: phase medians fall from
551.4 to 321.5 ms, and phase long-task totals from 532 to 303 ms. Activation
instead rises from 206.5 to 261.1 ms, and pointer movement from 319.3 to 400.0 ms
in this small series. Gaps of roughly 100–167 ms still occur during the gesture.
The complete scenario includes deliberate pointer movement; its shorter total
must not be called smooth dragging or 60 fps. A separate renderer/drag project
should investigate activation, broad DnD state propagation, and style
invalidation before changing geometry or virtualizing variable-height cards.

The creation trace contained about 85,791 style-resolution events, approximately
three walks over the board's 28,000 connected nodes. Inert and dialog state
changes still incur broad style work. Replacing the remaining sidebar-related
`:has()` selectors in a live diagnostic did not materially improve issue or
dialog opening. A blanket `content-visibility: auto` diagnostic on whole cards
also increased layout/style work and sidebar latency. Neither diagnostic was
shipped. Native geometry, scroll targets, focus, keyboard search, and rich
controls require preservation before any narrower containment or virtualization
approach can be accepted.

## Safety required by bounded board retention

The navigation change retains up to two rich boards using React Activity. This
created concrete safety requirements beyond keeping DOM nodes mounted:

- Drag preview capture, card lookup, manual-sort geometry, drop markers, bundle
  height, and committed-target animation now use their actual board root. A
  hidden board can contain the same issue IDs and column statuses; document-wide
  lookup would otherwise select the wrong copy.
- Suspending a board cancels its unfinished drag and discards cached geometry.
  FLIP animation snapshots also clear on suspension, so a resumed board measures
  its current layout before animating subsequent writes.
- Aborting a marquee now cancels its animation-frame loop, hides its overlay,
  and restores text selection. Previously its listeners were removed while the
  autoscroll/apply loop could continue indefinitely.
- Issue-panel tab choice follows a new issue/opener request without resetting
  a user's Plan selection when Activity replays effects.
- Dialog guards use the shared visible-overlay helper. Retained hidden dialogs
  must not block active-view keyboard commands. Other overlay callers were
  migrated in the comments/data workstream.
- View-generation timeouts use the navigation workstream's retained deadline
  hook: hiding cancels active timers, and revealing resumes remaining deadlines
  or clears expired work. A suspended spinner cannot become permanent.
- The production-browser regression found a lost vertical offset on a direct
  global → project → global return, before opening any dialogs: the same column
  and card DOM nodes remained connected, but 180 px became zero. An instrumented
  native setter recorded no application write to zero. Each retained wrapper
  now records active column scroll events in a WeakMap and restores current
  columns after Activity reconnects. Hidden events cannot overwrite saved
  offsets, removed column nodes remain collectible, and ordinary active renders
  or focus changes never trigger restoration. Two tests cover the real Activity
  lifecycle with the browser-observed clamp simulated in jsdom, hidden events,
  active rerenders, and replacement-node isolation. This fix also postdates the
  `after-a` measurements; the final production regression now passes.

Source review also checked that hidden route snapshots and tab identities belong
to their retained view, that selected issue state does not cross into another
tab, and that pending issue edits are flushed through the existing departure
guard. The cache bound is two board views, not a claim that total application
memory is capped at two views. The query cache and editor-related state have
their own lifetimes, covered separately in the main report.

## Regression coverage

The focused tests include scoped activity notifications and project replacement,
global-board render counts, keyboard/chord precedence, bulk selection context
isolation, duplicate hidden/active card IDs, board drop geometry and animation,
marquee cancellation, and real React Activity hide/reveal behavior for issue
panel state and FLIP snapshots. The navigation and comments/data workstreams
add retained-view routing/LRU, generation deadline, and visible-overlay tests.
The complete repository suite, type check, lint, and owned-English checks were
also run after integration; final counts are recorded in the main report.

`scripts/performance/verify-retained.mjs` is a separate production-browser
correctness runner. It creates only three deterministic temporary tabs on the
marked performance account and preserves all pre-existing tab fields. Its
assertions cover global/project boards containing the same issue, working
filters, selection, scroll and node identity, issue-panel Plan selection and
dismissal, keyboard commands after dismissal, active-board drag and reversal, document titles,
rapid round trips, the two-view LRU bound, and eviction after close. It restores
the fixture issue's changed fields and removes its temporary tabs even on
failure. It records screenshots and exits unsuccessfully on a failed assertion;
its duration is not a performance benchmark. Browser execution results are
recorded after the final production measurement window. The first browser run
stopped when it attempted to switch tabs through an open issue modal: the modal
deliberately intercepts the tab strip and the app provides no global tab-switch
shortcut. The runner now follows the supported dismissal path. Open-modal
Activity suspension and Plan retention remain component-test coverage; the
browser report explicitly records that coverage limitation.

The completed runner, `pass2-retained-verified.json`, passes all seven checks on
production build `ILKDMXOf5RTFYcT4wOmlT`, with no browser page errors. The direct
return and the later return after normal dialog dismissal both preserve the
same column at 180 px, the same card DOM, the 480-card working filter, and the
selection. Actual pointer drag in the active project succeeds in both directions
despite the hidden global board containing the same issue. The original fixture
issue status and position are restored. Six further round trips, third-view LRU
eviction, recreated-view filter restoration, and closed-tab eviction pass.
Cleanup confirms that every pre-existing account tab is unchanged and all three
temporary tabs are absent.

After the six round trips, a forced-GC snapshot records 235,011,704 heap bytes
and 26,848 connected nodes with the filtered global board and the project board
retained. This is one correctness-run observation, not evidence of a lower heap
or absence of long-session leaks. The cache stays within two retained boards and
falls to one when the hidden tab closes. The final timed series separately
assesses memory and delayed work.

The `pass2-retained-verified-restored-global.png` and
`pass2-retained-verified-project-drag-restored.png` screenshots were inspected:
rich cards, inline controls, status/PR/plan indicators, edge fades, selection
actions, sidebars, and app tabs remain present. The issue Plan screenshot from
the initial modal-scenario diagnostic was also inspected; its overlay correctly
blocked the underlying tab strip. All images are in
`output/playwright/performance/`.
