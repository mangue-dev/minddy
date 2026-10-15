# MIN-683: tab switching pass, 2026-10-15/16

This pass follows the [global fluidity pass](min-683-fluidity-pass.md). Its goal is
an instant switch between already loaded tabs and the fastest possible first
visit of each restored tab. MIN-683 stays in progress.

## Method

`scripts/performance/measure-tab-switching.mjs` opens the app in an isolated
headless Chromium context or an unpackaged Electron profile, waits for restored
All, then visits every restored tab once ("first visits") and cycles through all
of them for three hot rounds. Each switch records click-to-complete-content
time, the click's Event Timing duration, long tasks and the API requests it
triggered. `--settle-ms=5000` starts the first visits after startup preparation
has settled; `--settle-ms=1000` measures clicks made right after launch.

Comparisons are ABBA (control, candidate, candidate, control) under the local
HTTP/2 proxy, web and native, two contexts per arm: 108–120 hot switches per arm
and client. Electron runs with `MINDDY_DESKTOP_TEST_BACKGROUND=1`, so test
windows no longer take focus. The PR tab is excluded from the late runs
(`--skip=pr`): after a day of measurements the fixture's GitHub quota was backing
off and PR reads stayed blocked in both arms.

One comparison ran while other applications loaded the machine (load average
about 9, a game and a VPN): the same control product moved from 63 to 345 ms
web p50. Those results are kept as failed evidence (`min683-tabs-k1`,
`min683-tabs-k2`) and every decision below uses the quiet re-runs.

## Attribution

Read-only analysis plus an adversarial critic mapped the hot path: the
activation emits several session updates, `history.pushState` makes Next
re-render every `usePathname` consumer in a transition, the reveal re-attaches
refs and layout effects of the hidden React Activity tree, and `refetchOnMount:
"always"` queries refetch on every reveal. Retention allowed only five non-Home
views for ten restored tabs, so a full cycle was never hot. Cold visits in the
first seconds waited because the preparation lane stayed closed while the
GitHub PR list and the realtime catch-up refetches ran, and hovering a tab
cancelled its own preparation read.

A Chromium trace of hot switches on the final candidate shows where the
remaining time goes, per switch window: script about 50–75 ms (also for a Page,
so mostly the shell re-render after the URL change), style recalculation
17–19 ms and layerization about 20 ms for boards, layout 3–7 ms, paint 3–10 ms.

## Results

Medians and tails in milliseconds, hot switches (`ready` = click to complete
content).

| Increment | Web p50 / p95 / max | Native p50 / p95 / max | Decision |
| --- | --- | --- | --- |
| Baseline `9d8203630` (settled) | 60 / 87 / 90 | 67 / 92 / 114 | |
| Tab host: urgent retained reveal, retention cost memoized, stable retained observers, fewer activation renders, preparation after paint (5 commits) | 57 / 86 / 89 | 60 / 90 / 94 | Kept: small native gain (Routines, PR, Triage −7 to −9 ms) |
| View internals: live Page editors across hide, stable SearchMenu refs, narrow drag context (3 commits) | 57 / 84 / 90 against 56 / 85 / 102 | 61 / 89 / 126 against 62 / 90 / 92 | Rejected: neutral (Page −2 ms) |
| Cold preparation: gate beside background refreshes, hover keeps its own reads, issues and Page reads overlap their checks (4 commits) | first visit at 1 s: project board 529–616 → 112–122 web, 522–593 → 97–107 native; Feedback 268–304 → 61–76 web | | Kept (startup below) |
| Freshness and retention: no reveal refetch of realtime-covered routines and runs, ten retained views (2 commits) | 59 / 86 / 92 → 53 / 71 / 83 | 64 / 88 / 91 → 58 / 80 / 86 | Kept: All 85 → 58, board 82 → 68, requests per switch 3.8 → 3.3 |

Cold preparation startup (restored All, two ABBA runs): web cold +67 then −70,
web sealed reload +24 then +94, native −109 then +13 ms. The overall effect is
within the ±80 ms a single run can move, but the web reload signal points the
same way twice and is flagged for follow-up.

## End-to-end result

One ABBA comparison of the evening baseline `9d8203630` (build
`6EZ4mRhbArEObmW5oQFFD`) against the final source `fab2e3ff8` (build
`A4UlCsv_SQwRv64lhr9WT`), first visits one second after restored All, PR tab
excluded, same Electron shell on both sides.

| Measure | Baseline | Final |
| --- | --- | --- |
| Web hot switch p50 / p95 / max | 60 / 87 / 98 | 54 / 74 / 80 |
| Native hot switch p50 / p95 / max | 65 / 89 / 93 | 60 / 78 / 81 |
| Web hot switch to All / project board | 85 / 81 | 60 / 68 |
| Native hot switch to All / project board | 84 / 88 | 61 / 74 |
| Requests per hot switch (web / native) | 4.0 / 3.9 | 3.2 / 3.2 |
| First visit of the project board at 1 s (web / native median) | 572 / 214 | 113 / 100 |

Every hot switch now completes under 81 ms on both clients (108 switches per
side and client). The board reveal remains the slowest, which the trace
attributes to the shell re-render and board style and layer work above.
Evidence: `min683-tabs-final-*.json` under ignored `output/playwright/performance/`.

## Deferred

- **Delegated tooltips.** Each card mounts several Radix Tooltip roots that
  re-render on reveal. Radix has no virtual anchor and driving one root through
  `open` bypasses its delay, grace-area and close coordination, so a bounded
  replacement was not possible.
- **Departure saves.** Leaving a Page right after typing awaits the autosave
  round trip. Write authority is tied to the autosave effect's lifetime, which
  ends on every Activity hide, so a ledger that keeps drafts, conflict replay and
  unload protection intact needs a larger change.
- **Shell re-render on URL change and board layerization**, the two largest
  remaining costs in the trace.

## Also in this pass

A separate session re-measured the five global issue cache commits rejected in
the fluidity pass with a write-capable collector (one disposable project per run,
fully purged) and retained all five, including the corrected issue-counter fix;
see [its re-evaluation](min-683-fluidity-pass.md#global-issue-cache-re-evaluation). Another session
removed the second framer-motion copy in PR mangue-dev/minddy#421.

## Limits

Local only: one machine, one fixture, headless web and unpackaged Electron, a
VPN active during all of the day's measurements. Hot-switch figures include the
collector's readiness polling (up to one frame). No production result.
