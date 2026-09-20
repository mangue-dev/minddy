# MIN-540: second performance pass

## Reference and outcome

The reference is the fetched HEAD of existing PR #271 at the start of this pass:
`ec6a12e94235b8c589d86637195ae24dfad28cd6`. An archive of that exact source was
built independently with the normal production build and served on port 3112;
the candidate production build runs on port 3111. Both use the same marked test
account, deterministic target issue, and measurement runner. No new branch,
pull request, merge, production deployment, or personal-data seed is involved.

This pass materially reduces board/Page navigation, warm issue opening, drop
processing, and the delay before a submitted comment appears. It does **not**
establish instantaneous navigation or smooth dragging on all devices. The rich
600-card board still incurs substantial style and effect work. Creation-dialog,
sidebar, cold-load, and stored-PR-list results do not establish an improvement.

The original workload remains six projects, 600 issues, 120 Pages of 80 blocks,
1,200 issue comments, 480 Page comments, and 180 stored PR records. The seed was
revalidated with its ownership/inert-link guards. Temporary comments and tabs
used for browser verification are scoped to this account and cleaned up; drag
and filter changes are restored. No live forge or paid assistant run is seeded.

## Changes and evidence

- Preserve at most two rich global/project boards with React Activity. The
  actual card DOM, local filter/selection/scroll state, and issue-panel state
  survive a warm tab return; hidden effects are cleaned up. Tab-scoped route
  snapshots stop a hidden board from adopting another tab's route. LRU eviction,
  closed tabs, initial session adoption, and duplicate issue IDs are handled.
  Pages keep their existing editor lifecycle: blindly placing Tiptap below an
  Activity destroys its editor during effect cleanup. Removing board teardown
  already improves the Page return substantially.
- Replace tab-label full Page/objective lists and PR-detail reads with a bounded,
  authenticated metadata endpoint and narrow observers of existing caches.
  Hover/focus prepares the canonical router route and existing Page body cache.
  Warm route requests were only a few milliseconds in the baseline trace;
  bypassing the Next.js router would not fix the main cost.
- Stabilize board callbacks and isolate per-issue activity and keyboard-chord
  subscriptions. Tests count renders across 600 consumers. Hidden-board drag
  geometry, portals, shortcut guards, diff anchors, animation frames, and
  autoscroll are scoped or cleaned up rather than left active in hidden DOM.
  A final cross-domain review also found that creation actions changed identity
  with every route, notifying 600 closed card pickers. These now resolve the
  latest committed route/project at invocation without broadcasting navigation.
  Regression tests cover both render counts and correct creation destinations.
  A production-browser check also exposed native vertical-scroll clamping when
  Activity hides a board: the same column DOM survived but its offset became
  zero. Capture active scroll positions in a WeakMap and restore only current
  columns after reveal. Hidden events cannot overwrite them, removed columns
  remain collectable, and ordinary active renders do not reset user scrolling.
- Publish Page/issue comments and already-uploaded resources before POST.
  Preserve failed content in the session cache, offer retry/discard, reconcile
  by a client UUID, and make server/resource replay access-scoped and idempotent.
  Do not repeat notifications or assistant work on a replay. Objective/feedback
  comments now publish the acknowledged response before their follow-up GET.
- Cancel abandoned Page-body search requests; collect inactive search entries
  after 60 seconds and exclude them from persisted read snapshots. Keep previous
  snippets while a new query loads. Native textarea sizing avoids one identified
  forced geometry read where supported, with the existing fallback retained;
  this does not establish a faster creation dialog by itself.

Detailed implementation, regression coverage, and residual causes are recorded
in the [navigation review](min-540-pass2-navigation.md),
[board review](min-540-pass2-board.md), and
[comments/data review](min-540-pass2-data-audit.md).

## Measurement protocol

Runs use production builds, real authenticated local APIs backed by the test
database, Chromium 153 on an Apple M4 Pro, 1440 × 1000, dark appearance, and
normal animation. No build, test suite, or second browser workload runs during
the timed series. Separate browser contexts distinguish first visits from warm
returns. Multiple series report medians and dispersion, not only best samples.

`measure-pass2.mjs` resolves and scrolls a deterministic target **before** the
clock starts; actual mouse/key dispatch is recorded separately. A visible
condition plus two animation frames is the initial usable-view marker, not a
measurement of every remote dependency completing. In the `--interactive-ready`
series, an issue additionally requires its populated editable description and
title. The ordinary dialog marker alone can precede expensive editor work;
first-open results using that marker are explicitly limited.

Each gesture observes a further 2.2 seconds, including deferred long tasks,
frame gaps, real `localStorage.setItem` duration/size, resource timing, and CDP
script/style/layout counters. CPU profiles are separate diagnostic runs. A
selector trace with Blink's disabled debug category identifies whole-DOM style
passes but incurs substantial instrumentation overhead; its elapsed time is
never used as a normal latency sample. React evidence combines those call
stacks with actual render-count/effect-lifecycle regression tests; it is not a
claim of production React Profiler `actualDuration` instrumentation.

Comments use distinct DOM-observed appearance/composer milestones and a POST
response milestone. The latter is browser-observed acknowledgement, including
event-loop scheduling, not isolated database execution. Drag records activation,
scripted movement, and drop separately. Sidebar metrics include the intended
presentation transition; long tasks identify blocking work independently.

The constrained profile uses 4× CDP CPU slowdown, 100 ms network latency,
1.5 Mbit/s download and 0.75 Mbit/s upload. This is emulation, not mobile hardware.
All timings are lab observations, **not field INP** or guarantees for production.

## Additional gains against the starting PR HEAD

The primary paired series is `pass2-before-b` / `pass2-after-b`, three repetitions,
with cache restoration and the stronger editable-issue marker. Values below are
milliseconds; brackets are the interpolated 25th–75th percentiles. They describe
candidate build `ILKDMXOf5RTFYcT4wOmlT`, before the final cold-request scheduling
correction described separately below. The five-repeat `before-a` / `after-a`
series corroborates the warm-navigation direction, but is not pooled with it.

| Interaction | Starting PR HEAD | Second pass | Interpretation |
| --- | ---: | ---: | --- |
| Return to loaded board | 1,002 [968–1,011] | 499 [498–504] | About 50% faster; same rich card DOM |
| Return to Page | 1,104 [998–1,112] | 212 [212–268] | About 81% faster; editor follows normal lifecycle |
| Warm issue, editable content (two returns) | 726 | 402 | About 45% faster |
| First issue, editable content (one visit) | 825 | 305 | Another 301 ms long task follows the initial marker |
| Creation dialog | 379 [379–481] | 384 [379–517] | No demonstrated improvement |
| Drag gesture through visible destination | 1,398 [1,397–1,475] | 1,147 [1,123–1,191] | About 18% faster overall |
| Hide sidebar | 182 [171–190] | 183 [171–190] | Unchanged |
| Show sidebar | 177 [165–178] | 177 [164–186] | Unchanged |
| Issue menu | 68 [66–69] | 70 [70–71] | Stable control; no long task |
| First Pages list (one visit) | 837 | 224 | One sample per build |
| Prepared Page opening (one visit) | 91 | 119 | Modest regression; not a non-regression claim |
| Page menu (one visit) | 48 | 43 | No long task |
| Open Page comments (one visit) | 63 | 74 | No long task |
| Stored PR list (one visit) | 945 | 968 | Unchanged; no live forge validation |
| Full-document board cache restoration (one visit) | 1,635 | 1,681 | Ready marker unchanged; deferred blocking improves |

The complete three-repeat candidate, `lXEuJFSImyJPTtX_F4BfJ` at application commit
`22fd9aad4cd7197bca19cd903b1d52783e7b06f6`, repeats the complete protocol in
`pass2-after-c`. Board returns are **542 [527–563] ms**, Page returns
**245 [238–345] ms**, and the two warm editable-issue returns are **416 ms**
(410/423). These are about **46%, 78%, and 43% faster** than the same reference.
First issue opening is 674 ms in this run, demonstrating its greater dispersion
rather than validating the earlier 305 ms as a universal first-open result.
Creation is 371 [368–508] ms, drag 1,181 [1,173–1,235] ms, hide/show sidebar
183/179 ms, issue menu 69 ms, prepared Page 118 ms, Page menu 42 ms, comments
94 ms, and stored PR list 982 ms. The complete run and 15 rapid round trips
finish without browser errors. The earlier paired table remains visible so
later numbers do not silently replace an intermediate build's observations.

Final comment milestones are **36.5 ms appearance, 16.3 ms composer release,
493 ms POST acknowledgement, 492.7 ms confirmed DOM, and 640.5 ms reconciliation
GET response**. The tiny acknowledgement/DOM ordering difference is browser
callback scheduling. The GET milestone is its response, not an extra visual
change: UUID reconciliation preserves the displayed row. Its 2.2-second tail
and the next menu contain no long task.

The comment's DOM appearance falls from **431 to 38 ms**, composer release from
**431 to 18 ms**, while browser-observed POST acknowledgement is **431 vs 507 ms**.
The server did not become faster: optimistic publication removes that dependency
from the initial interaction. Confirmation and reconciliation are recorded by
separate markers in the final control run. A 1.5-second delayed POST, a 503/retry,
explicit discard, and a committed-but-lost response are also verified through
real browser/API tests. Pending/error comments survive navigation in the current
document; there is **no durable full-reload outbox**. Already-uploaded attachments
are retained and idempotently reconciled; upload failure/replay is unit-tested,
not claimed as an end-to-end browser upload test.

Drag total long-task time falls from 1,058 to 661 ms. Drop handling improves from
532 to 322 ms, but activation worsens from 206 to 260 ms and scripted movement
from 317 to 401 ms. Frame gaps inside the recorded gesture phases reach 83–167 ms. Across the
complete candidate gesture window, the maximum gaps are 183–200 ms (reference
417–433 ms).
This is an improved drop, **not smooth 60 fps dragging**. Geometry reads and
whole-board CSS remain important residual costs. Sidebar long tasks likewise
remain about 100–130 ms even though the deliberate transition looks continuous.

At 4× CPU slowdown with constrained networking, the three-repeat reference
returns to the board in a median 3,993 ms and to a Page in 3,766 ms. The final
pre-scheduling candidate's two tab-only samples are 2,809/2,014 ms for the board
and 926/929 ms for the Page. The earlier three-repeat candidate gives 2,017 and
895 ms respectively. Different warm-up sequences are kept separate. Prepared
Page opening, Page menus, and comments are slower in the constrained candidate
(428/142/252 ms in the final tab-only run, versus 230/77/148 ms in the reference).
The large retained DOM has a cost on slower CPUs; normal-speed controls alone
would have missed this limitation.

The reference's five-repeat and constrained runs completed their main timed
sequences but failed the first rapid-session Page return: the selected Page tab
kept `/all` content. Those failed phases are retained in the results and excluded
from later-session comparisons. Candidate runs complete 15 further rapid round
trips. The paired three-repeat reference run completed normally.

## Memory, deferred work, and failed experiments

In the primary three-repeat candidate, heap after GC is 227 MB on the board
and 254 MB on a Page retaining that board, versus 37 MB on the reference Page
after board teardown. The **~217 MB retained-view cost** is real. After another
15 round trips it reaches 260 MB (+6.6 MB); connected nodes remain 29,049. DOM
listeners remain 8,192 through ten loops and become 8,292 after the final loops
and another menu opening; that menu had already been used, and this timing
alone does not establish the cause of the additional listeners. The earlier five-repeat candidate kept 8,191
listeners throughout. Neither short run proves hours-long stability or absence
of leaks; instrumentation itself accumulates samples. A new document releases
the retained board (~24 MB on the stored-PR view). Browser checks separately
verify LRU eviction and removal when tabs close.

After the rapid session, the immediately following Page menu takes 83 ms and a
later menu 42 ms, with no long task in either window. Cache restoration reduces
deferred long-task time from 1,733 to 458 ms and total long-task time from 3,083
to 1,795 ms, although its initial ready marker remains about 1.6–1.7 seconds.
These are single extended-observation samples, not a general cold-load gain.

Board returns still produce roughly 100 ms of deferred long-task work in the
2.2-second observation tail. Total style work is about 200 ms per return, with
roughly 38 ms layout. Retention avoids reconstruction but still reconnects
effects and reveals a large DOM. It is not a zero-work cache hit.

Actual persisted snapshots in the ordinary series are roughly 1.3–1.6 MB and
take about 1–3 ms for `setItem`; serialization/dehydration are covered by CPU
counters and diagnostic profiles, not that storage-only number. There is no
evidence for a new persistent-cache architecture or a claim that hours-long
session storage is now free. Search-result exclusion prevents a demonstrated
unbounded class of transient entries from joining those snapshots.

The creation trace performs about three style passes over ~28,000 nodes.
Remaining sidebar relational selectors were not the dominant measured cost;
an equivalent diagnostic replacement did not materially improve the result.
Blanket card `content-visibility:auto` was also rejected: it disturbed drag/click
geometry and added style/layout work to subsequent menu/sidebar interactions.
No such diagnostic CSS is shipped. Proper board windowing remains separate
work requiring keyboard/search/multiselect/drag/autoscroll preservation.

## Cold request scheduling

The first retained-host candidates delayed the cold board query behind lazy
component mounting. In the paired B trace, query creation moved from 260 to
355 ms, and its connection queue grew from 6 to 387 ms. Body transfer remained
about 1 ms. The final host primes the existing board and saved-views queries
while the lazy screen loads, after persisted-cache restoration and only when
each query has no data. Query ownership, cancellation, deduplication and the
normal stale-data path are preserved; there is no extra cache or observer.

The first bootstrap, containing only the board query, restored its priority.
Three interleaved reference/candidate cold visits are 2,253/2,219/2,056 ms versus
1,905/1,849/2,053 ms (medians 2,219 vs 1,905). However, the 604-byte saved-views
response still gates the first render: in the complete C trace, board data is
ready at 1,260 ms but rendering waits for views at 1,404 ms. Its local connection
queue is 471–534 ms in the candidate versus 81–94 ms in the reference. The last
small correction starts that existing read beside the board query. Final cold
samples, in three further interleaved fresh-browser visits to already-running
production servers, are **1,886/2,122/2,082 ms** for the reference and
**1,932/1,827/1,852 ms** for final build `A1QEO9riFXgIapikzA7IG`: medians
**2,082 [1,984–2,102] vs 1,852 [1,840–1,892] ms**, about 11% lower. Both required
queries now start together (241–255 ms in these final visits); views complete
at 527–586 ms, before board data at 918–961 ms. The introduced late-views gate
is removed, with normal filters preserved. This is a modest cold-load gain,
not an immediate 600-card initial render.

The final build also passes the separate three-return tab/control run
`pass2-after-d`: board 736/482/483 ms, Page 196/347/196 ms, prepared Page 136 ms,
menu 59 ms, comments 94 ms. Comment appearance/composer/ACK/confirmed DOM/GET
are 25.5/15.1/496.8/496.7/648.1 ms. This tab-only warm-up differs from the complete
C series and is not pooled with it. Its first cold visit is 2,287 ms; that slower
sample remains recorded alongside the alternated measurements.

These are local HTTP/1 connection queues. They do not establish an identical
effect on a production HTTP/2 connection, nor a server/SQL speedup. Differences
in HTML arrival and authenticated server wait also remain visible; the single
2,386 ms cold C result must not be replaced by its faster interleaved samples.

## Coverage and remaining separable work

| Area | Evidence in this pass | Explicit limit |
| --- | --- | --- |
| Global/project Kanban board, filters/selection | Production 600-card global board and 100-card project board; hide-done filter, selection, scroll, shortcuts, duplicate-ID drag, two-view bound, close/eviction; render-count tests | List mode is inspected in source/tests only; exhaustive sort/group combinations, touch drag and every bulk action are not benchmarked |
| Search and command palette | Actual result-scoped queries, three distinct issue searches: 170/191/277 ms; ArrowDown selection 37–39 ms; cancellation/cache tests | No whole-workspace fuzzy-search quality or IME stress benchmark |
| Home, projects, statistics, inbox, routines, settings, objectives, triage | Authenticated production route and content screenshots; canonical inbox/agent redirects respected | Route-shell timing is not useful-content timing; objectives/routines/cycles lack large fixtures; notification delivery and integrations not exercised |
| Issue editing and dialogs | Populated rich description, title, Plan-tab lifecycle, creation shortcuts, menus and native/fallback autosizing; regression tests | Large plans/checklists, attachment upload, every nested picker, and unsaved edits across full reload not exhaustively exercised |
| Pages | 80 blocks, 8 headings, about 18,656 characters, menu, comments and actual stored version list | No sustained autosave/editing, large Page database, multiplayer collaboration, history restore or long-document typing benchmark |
| PRs and reviews | 180 stored records, current list renders about 60 open records; source audit of detail readers | No forge IDs: auto-selected detail requests fail as expected. Real diffs, review creation, synchronization and remote comments are unverified |
| Comments | Optimistic visual/composer/ACK timings, delayed response, retry, discard, lost response; access/idempotency/resource regression tests | No durable reload outbox; Page/issue paths optimistic, objective/feedback paths still wait for POST |
| Assistant | Panel and history-list access checks; subscription source review | No generated response, streaming load, nonempty history or paid tool execution |
| Realtime, caches, long session | Query ownership, invalidation and Activity cleanup tests; real 15-loop navigation, GC/DOM/listener samples, cache restoration and 2.2-second tails | No hours-long soak, large offline queue, server reconnect storm or production memory telemetry |
| Browser/device/native shell | Chromium production checks; WebKit, mobile emulation and unpackaged Electron results recorded below | WebKit is not the Safari app, mobile emulation is not a physical phone, unpackaged Electron is not the signed release |

The data review separates real endpoints from source inspection. The initial
aggregate payload is about 1.33 MB uncompressed. In one paired cold series the
board read occurs three times before and twice after; decoded API traffic falls
from about 5.58 to 4.23 MB. The separate global-issue snapshot read remains
intentional. Warm tab returns already had very few reads in the reference, so
removing server reads cannot explain their principal improvement. An upstream
sample reports essentially unchanged authentication medians (75 vs 76 ms).
Transport, authentication, PostgREST, SQL/RLS, aggregation and serialization
cannot be isolated into query plans with the available access. No index or
server cache is claimed to fix an unmeasured database bottleneck.

Prior-pass protections remain: seven board stylesheets, stable assistant/tab
actions, deferred cache persistence, Page preparation expiry behavior, stable
comment groups, response publication, sidebar content, cheaper selectors, menu
hydration and parallel independent board reads. Relevant existing regressions
run alongside the new tests. Blanket virtualization was not shipped because
measurement-driven geometry, keyboard and drag correctness work remains.

## Validation and source identification

Application changes are committed as
`22fd9aad4cd7197bca19cd903b1d52783e7b06f6` and
`bf65420560e8d080a4e466fccd6d6654d4d3ebd3`, each with an author-matching DCO
trailer. The latter also primes the existing saved-views read; its normal
production build is `A1QEO9riFXgIapikzA7IG`. The final complete local
suite passes **8,127 tests in 833 files**, with 27 tests in 9 files skipped.
Production build, TypeScript, full lint, owned-English and diff checks pass;
the seven seed-guard tests also pass. Translation catalogs, database migrations,
lockfiles and tracked desktop sources are unchanged. CI results for the final
pushed PR HEAD are checked separately from these local results.

Chromium mobile emulation (390 × 844) passes the 80-block Page, comments, menu,
version-list and restored assistant-history checks. WebKit 26.6 passes those
core desktop surfaces, sidebar and native title sizing (60 → 870 → 30 px with
the original title restored and no server write). On final build
`A1QEO9riFXgIapikzA7IG`, all eight settled WebKit routes pass with no browser
error and all pre-existing fixture tabs/content unchanged. This is WebKit engine
coverage, not a Safari application or physical-phone test.

The earlier rapid WebKit run remains failed: project RSC preloads report access
control errors while leaving Home. The runner also initially treated Inbox's
transient `/home?inbox=1` URL as ready, before its intended `/home` plus Inbox
popover state. The settled runner now waits for the actual destination and
pending navigation work; it does not erase the rapid-route failure. A baseline
settled run reached all eight routes but failed its cleanup guard because the
old application changed a benchmark tab's href; that dedicated fixture href was
restored using the current revision. It is not recorded as a clean baseline
pass. Some assistant skill reads return 502 with the inert forge-linked fixture;
no successful integration or response-stream claim is made.

The installed unpackaged Electron 43.4.1 shell (Chromium 150.0.7871.224,
application 0.10.30) passes four checks against the final production build:
native preload bridge plus 600 cards, sidebar retaining card identity, the
80-block Page and its menu, and return to the same board DOM with scroll 180 px.
No page errors or failed API requests occur. The runner verifies and removes a
fresh temporary user/session profile; existing profiles are never copied or
read, and fixture tabs/content are preserved. Two harness setup failures
(default Electron loader selection and temporary-profile consent initialization)
are retained in local diagnostic files; neither is reported as a product fix.

GPU compositing and rasterization are already enabled. No acceleration flag is
changed. Aggregate native working-set snapshots across four processes are about
1.04/1.30/1.62 million KB at board/Page/return. These snapshots have no forced GC,
settling protocol or baseline comparison and must not be interpreted as a heap
leak diagnosis, a memory improvement, or a graphics latency benchmark. The
signed release package and a native frame/CPU trace remain outside this pass.

A broader mobile check reproduced a pre-existing assistant focus race on the
starting PR HEAD: when conversation restoration finishes after the history
popover opens, the remounted composer takes focus and closes that popover.
A controlled read-only delayed-response replay verifies `data-state=open`,
rather than mistaking an exit animation for an open menu. This remains a
separable assistant lifecycle issue; waiting for restoration in the ordinary
smoke run must not hide the failed race scenario.

## Reproduction

```sh
node scripts/performance/seed.mjs --apply
npm run build
npm run start -- -p 3111
# Do not run a build or test workload while these browser series execute.
MINDDY_PERF_LABEL=pass2-normal MINDDY_PERF_REPEATS=5 node scripts/performance/measure-pass2.mjs --long-session
MINDDY_PERF_LABEL=pass2-interactive MINDDY_PERF_REPEATS=3 node scripts/performance/measure-pass2.mjs --interactive-ready --long-session
MINDDY_PERF_LABEL=pass2-constrained MINDDY_PERF_REPEATS=3 MINDDY_PERF_CPU_RATE=4 node scripts/performance/measure-pass2.mjs --network --long-session
node scripts/performance/summarize-pass2.mjs output/playwright/performance/pass2-normal.json
node scripts/performance/verify-retained.mjs
node scripts/performance/verify-comments.mjs
node scripts/performance/verify-surfaces.mjs --webkit
node scripts/performance/verify-surfaces.mjs --mobile
NODE_PATH=./desktop/node_modules node scripts/performance/verify-electron.mjs
```

Use `MINDDY_PERF_BASE_URL` and `MINDDY_PERF_BUILD_DIR` for the independent baseline.
The optional `server-timing.mjs` preload records upstream operation names,
headers-ready durations, and declared response lengths without credentials,
query strings, bodies, or returned account data. Remote transport, PostgREST,
SQL/RLS and serialization overlap in these timings. No query plan is available;
no database index or speculative server cache is added.

Primary references: [React Activity](https://react.dev/reference/react/Activity),
[Next.js navigation and prefetch](https://nextjs.org/docs/app/getting-started/linking-and-navigating),
[native field sizing](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/field-sizing),
and [selector-tracing overhead](https://microsoftedge.github.io/DevTools/explainers/StyleTracing/explainer.html).
