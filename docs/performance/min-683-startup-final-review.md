# MIN-683: startup reservation final review

## Decision

Remove the Task51 startup-only optional-work reservation before presenting
PR420 as an increment ready for review. This is a bounded risk-reduction
decision, not a finding that the helper is incorrect or that removing it
necessarily improves latency. The root agent verifies the resulting web/native
product and records the actual measured outcome separately.

The reviewed source is `1f4156520`. The isolated implementation commit is
`30ee7c5ee` (`perf: reserve navigation priority during tab restoration`). Its
only application changes remain the startup admission helper and its wiring in
`lib/app-tabs-context.tsx`; there are no later changes to that wiring to unwind.
This review reads current checkpoint/session summaries, the relevant startup
section of the architectural report, the exact source commit and its retained
consumer contracts. It does not rerun historical probes or read raw archives.

## Evidence and limitation

The identified historical pair is control `17df83a86` /
`O_eiQyt6nCiGv-7JKKrHK` and candidate `30ee7c5ee` /
`Liw1Se4ZRwp__V1fmrDJD`. Both v5 clients complete 145 observations, genuine
sixteen-second absence and source/Page-version/ten-tab/Git preservation. The
architectural report records mixed single observations:

| Metric, ms | Control web / native | Candidate web / native |
| --- | ---: | ---: |
| Renderer launch | 2552 / 2302 | 2600 / 2387 |
| Complete board refresh | 2462 / 2261 | 2274 / 2515 |
| First project | 679 / 698 | 531 / 605 |
| Alternation task / script work, web | 9627 / 5861 | 9944 / 6156 |
| Alternation task / script work, native | 9992 / 6213 | 10438 / 6612 |

Neither exact reference begins automatic search indexing during the first
three seconds. Search starts at roughly refresh age 33 s / 34 s in the control
and 32 s / 13 s in the candidate. The removed earlier RSC experiment exercised the
startup indexing gap, but that experiment is not the current product. Thus the
retained pair does not isolate the advertised mechanism, establish an overall
speedup, certify all-tab preparation or supply destination percentiles.

Ownership/lifecycle regressions establish the helper's exact account, session
and QueryClient token isolation, synchronous handoff, settled-failure release,
Strict Mode replay and real retirement. Those guarantees are valuable but do
not justify another optional-admission delay in the merge increment without
the missing runtime evidence. No new correctness defect is identified in the
helper by this source review.

## Exact removal boundary

Remove the helper import/memo/layout effect and settled-query-error effect
from `AccountTabSync`. Change its wrapped visit back to the direct existing
`preparation.visit(active.href, state.tabs.map((tab) => tab.href))`. Remove only
startup-helper dependency entries, the empty-scope release and the release-only
`finally` surrounding ordinary initialization. Delete the orphan
`restored-tab-startup-admission.ts` and its two dedicated tests.

Preserve canonical tab initialization, sealed window selection, writer disposal,
account retirement, explicit intent, all query options and their normal errors.
The finite worker still owns general preparation priority; automatic optional
search/auxiliary admission still respects that worker. Explicit palette
`armNow()` continues to bypass the automatic delay. Existing priority, search,
preparation, restoration, writer and selected-read regressions remain necessary.
This removal grants no freshness, write authority or permissions, changes no
reader/RLS/DTO contract and installs no TTL or cross-request cache.

## Documentation and acceptance

The public controls, reader workflows and contributor configuration do not
change. Internal performance reports/checkpoint must record the rejection and
the identified resulting product. Historical mixed evidence remains retained
with its original labels. The root agent owns checks, runtime comparisons, final
status and publication; no test/build/browser/benchmark ran from this reviewer.
MIN-683 remains in progress because all-tab preparation, common latency and
broader acceptance criteria remain open. No merge or deployment is authorized.
