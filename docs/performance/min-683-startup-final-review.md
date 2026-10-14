# MIN-683: startup reservation final review

## Decision

Retain the Task51 startup-only optional-work reservation. The
initial source-only recommendation was removal because its historical pair did
not exercise the indexing gap. The root agent's new matched runtime evidence
does exercise that gap and shows the removal moving cost into first project
activation on web. The matching independent control confirms the direction;
the exact retained application source is restored. This is an admission/fairness decision,
not certification of general latency or all-tab preparation.

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
Strict Mode replay and real retirement. At the initial source review, those
guarantees did not justify another optional-admission delay without the missing
runtime evidence. The newly exercised gap below changes that decision. No new
correctness defect is identified in the helper by this source review.

## Exact removal boundary

The following removal boundary records the reviewed experiment; it is no
longer the recommended final source if the new comparison remains valid.

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

## New bounded removal comparison

The root reports four complete v6 runs, baseline and no-token candidate on web
and native, with all 55 observations, actual focus and full content/version/tab/
Git bookends passing. The exact source/build labels belong to the root's final
measurement report; this review does not invent them or rerun the collector.

| Single observation | Retained reservation | Removed reservation |
| --- | ---: | ---: |
| Web first project, ms | 617 | 1068 |
| Native first project, ms | 629 | 592 |
| Web search-index request start, ms | 18368, after project click | 1338, before project click |
| Web project task work, ms | 354 | 552 |

The removed-reservation web case has seven cold scoped prerequisites; baseline
already has categories and members. This newly exercised admission gap makes
the historical absence of early indexing an insufficient reason to remove the
token. It supports retaining the existing startup deferral, together with its
ownership/failure-release tests and explicit palette bypass. It does not prove
that indexing alone caused every timing difference. Native results remain mixed
and do not establish a universal improvement.

The independent three-second web project is 664 ms retained versus 967 ms
removed; primary Page is 448 versus 507 ms, foreign Page 422 versus 412 ms.
Both three-context diagnostics complete with current bodies/versions, full
source collections, ten tab destinations and Git connection unchanged. They
use matching hashes and remain excluded from ordinary comparisons. This
confirms a removal risk without certifying global acceptance. Historical mixed
v5 evidence above retains its original interpretation.
