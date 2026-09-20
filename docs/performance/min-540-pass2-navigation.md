# MIN-540 second pass: navigation and retained boards

## Reference and interpretation

This chapter describes the navigation changes and the first complete second-pass
comparison. The baseline is the existing PR HEAD at the start of this pass,
`ec6a12e94235b8c589d86637195ae24dfad28cd6`, which already includes the first-pass
fixes. The measurements below therefore represent additional gains.

The source samples are `output/playwright/performance/pass2-before-a.json` and
`output/playwright/performance/pass2-after-a.json`. Their build IDs are
`tAigiwkLbt1ZGVxGvp4kf` and `hUA5E0TrYRkBvuLEAL9Xi`, respectively. The latter is
an intermediate production candidate: subsequent focused fixes and later series
must be reported separately rather than silently replacing this build's numbers.
Both series use Chromium 153.0.8010.12, a 1440 × 1000 viewport, normal CPU/network
conditions, five tab round trips, and a 2,200 ms observation tail. Both use the
same marked account with six projects, 600 issues, 120 Pages, 1,680 comments,
and 180 stored PR records.

`usefulMs` measures the scripted action through the deterministic visible target
and the runner's readiness frames. It includes automation and scheduling costs;
it is not field INP. Script, style, and layout counters cover the observation
window and must not be added as independent, non-overlapping durations. In
particular, work can continue after the readiness condition succeeds.

## Why retaining boards was justified

Before this pass, switching away from the global board removed approximately
28,480 connected elements and left approximately 1,020 on the Page screen.
Returning recreated the cards and their effects. Browser identity checks confirm
that every sampled board return produced a different card element.

The baseline's five board returns took 949–1,003 ms. Their median script counter
was 908 ms, with 259 ms of style recalculation and 41 ms of layout. The reverse
direction also paid for the outgoing board: Page returns took 824–1,075 ms, with
a median script counter of 647 ms and style recalculation of 176 ms. These
observations support treating board destruction and restoration as a shared
cause of latency in both directions, rather than assuming that a slow Page
return was entirely a Page or network problem.

Separate diagnostic traces found a roughly 5 ms RSC request for the warm board
return and no board API request on that activation. An apparent 71–118 ms Page
RSC resource duration included download completion blocked behind JavaScript;
its response started in roughly 5 ms. These isolated local observations are not
server-latency benchmarks and do not justify a server index or response cache.

## Architecture and behavior

`AppTabViewHost` lives in the stable application shell. It renders global boards
(`/all`) and project boards (`/projects/:id`) through the existing complete screen
components, and retains at most **two board views**: the most recently visited
board and one previous board. The key combines the application tab and board
route, so separate tabs can retain independent filters and selections even when
they display the same project. Visiting a third board evicts the least recently
used board. Closing a tab removes its retained views; changing accounts remounts
the account tab provider and the host beneath it.

This is a bounded DOM/state cache, not a new data cache. Existing TanStack query
caches, pending-write overlays, realtime invalidation, and refetch policies still
own freshness. A resumed board can adopt data changed while it was hidden, and a
stale query still reconciles. Tab departure guards continue to flush pending
ticket/Page edits and can refuse departure when saving fails or an operation
cannot safely leave.

The host uses the public React `Activity` API. Hidden boards retain DOM and React
state while React cleans up effects; revealing them reconnects those effects.
The outer wrapper becomes `display:none`, inert, and hidden from accessibility
APIs synchronously. Its `data-app-view-active` marker also gives DOM consumers
an explicit active-view boundary. React hides portaled host content as part of
the Activity tree, so a retained issue panel does not remain visible on another
screen. Retention preserves real controls and card contents; it does not replace
a loaded board with a screenshot, reduced rendering, or a loading placeholder.

Native browser verification exposed an additional lifecycle issue that DOM
identity tests alone missed: a retained column's offset changed from 180 to 0
across hiding, even though both the column and card remained connected and no
application scroll setter wrote zero. `useRetainedBoardScroll` now records
active column offsets in a WeakMap outside Activity and restores them after the
children reconnect. Hidden scroll events cannot overwrite the saved position;
ordinary active renders and focus changes do not restore it. This preserves
the user's position without retaining detached column elements. The scroll-corrected
production build `ILKDMXOf5RTFYcT4wOmlT` passed all seven checks in the retained
board browser runner, including this real-scroll case, according to its
functional verification. This later fix is not retroactively included in the
intermediate five-run performance comparison below.

The route snapshot and tab-navigation contexts are scoped to each retained view.
A hidden board does not subscribe to the window's changing pathname/search
hooks. Its saved-view state continues to belong to its original tab. A separate
live boundary supplies normal Next navigation hooks when the screen is rendered
outside the retained host. During a cold activation, the host waits for the full
normalized destination, including selection query parameters, before assigning
the incoming tab to the route. Startup restoration adopts the initially rendered
board instead of creating a second instance. Closing the outgoing tab similarly
keeps its DOM until the replacement route commits.

Navigation still uses the canonical Next router. The measured RSC cost did not
justify bypassing it with a separate history/router implementation. This keeps
document metadata, browser history, route errors, and unsupported destinations
under the existing router. Hover or keyboard focus on a tab prefetches its route;
overflow-menu tabs receive the same treatment. Prefetch is driven by explicit
intent, not a request for every restored tab.

### Cold-load scheduling regression and correction

The retained host introduced a reproducible cold-board regression in the first
two production comparisons: 2,133 to 2,622 ms in series A, and 1,796 to 2,273 ms
in series B. Series A also started its initial resource requests later, so it
must not be used to attribute the whole difference to the retained host.

Series B's chunk manifest and request timings isolate a more specific cause.
The canonical `/all` route already loaded the GlobalBoard implementation among
its initial chunks. The host's dynamic import nevertheless requested an extra
20 KB decoded facade at 241–246 ms. The board's data read then began at 355 ms,
compared with 260 ms in the baseline. That 95 ms delay placed the essential
request behind the shell's API reads: its connection wait increased from 6 to
387 ms. The request's server wait changed from 619 to 672 ms, while response
body transfer remained approximately 1 ms in both builds. The aggregate response
therefore completed at 1,414 ms rather than 886 ms. The initial large render
task itself decreased from 660 to 627 ms. This is a client request-order
regression amplified by the local connection queue, not evidence of a new
slow SQL query or a 400 ms response-body download.

`useColdBoardPrefetch` starts the existing aggregate query from the active
authenticated `/all` host while the lazy component resolves. It waits until
persisted-cache restoration finishes, skips an outgoing route whose incoming
tab has not committed, and skips a query when its data already exists.
The existing `GLOBAL_BOARD_KEY` and `globalBoardQueryFn` retain normal query
deduplication, cancellation, and pending-write reconciliation. No new query
observer or cache is introduced; stale existing data keeps the board's normal
refresh behavior. Focused tests verify effect ordering before parent shell
reads, the restoration/route/data guards, joining the mounted board's in-flight
request, cancellation on cache clearing, and recovery from a failed prefetch.

The first bootstrap revision, measured in series C, restored the aggregate
request's original position among the shell reads. Its creation followed the
first resource request by 218 ms, matching series B's baseline, and its connection
wait fell from 387 to 45 ms. However, the saved-views request still started only
when the lazy screen mounted. In series C the board data completed at 1,260 ms
but saved views completed at 1,404 ms, precisely when the large board render
started. The initial HTML/resources also arrived later and server time varied;
the useful-content result of 2,386 ms does not establish a cold-load gain.

The follow-up revision starts the existing `["views", "global"]` query beside
the aggregate read, restoring the baseline order of both render prerequisites.
It uses the same `fetchViewsApi` as `useViewsQuery`, now with the query's optional
abort signal. Each query independently skips existing data, including stale
restored data, so this does not bypass normal invalidation or change selected
filters. Tests cover both reads' ordering, separate cached-data guards, joining
both mounted hooks without duplicate requests, cancellation of both reads on
explicit query-cache clearing, and mounted-query recovery. Neither prefetch adds
an observer. Series C and the first three interleaved cold samples include only
the aggregate bootstrap; the final saved-views correction requires its own
production comparison and is not retroactively included in those numbers.

Three interleaved fresh-browser cold pairs with the aggregate-only bootstrap
gave 2,253 / 2,219 / 2,056 ms before and 1,905 / 1,849 / 2,053 ms after (medians
2,219 and 1,905 ms). This narrower series does not reproduce the regression
seen in earlier isolated cold samples. It still shows saved views starting
117–127 ms after the aggregate query, versus effectively together in the
baseline. Views completed after board data in two of the three candidate
samples, so scheduling both prerequisites together addresses a remaining
measured gate even where total cold latency had already improved.

### Why Pages are not retained

Pages continue to use their existing shell, editor, autosave, preparation, and
reconciliation lifecycle. Tiptap's editor ownership and Page draft-discard/flush
cleanup require a separate retention design; hiding them inside Activity without
that work could destroy an editor instance or discard a blank draft while its
React state remained. The second-pass board host deliberately excludes them.

Tab intent now also calls the same Page-body preparation helper as the Page tree,
with the same ten-second freshness window and existing Page query key. Route
prefetch alone does not warm the document body. A fresh, explicitly prepared
document can render immediately; an expired document still follows its existing
validation rules. Fetch cancellation now propagates through that preparation
request. No longer-lived trust window or cross-account document cache was added.

Retaining the outgoing board nevertheless helps a Page return by removing the
board teardown cost. The browser checks correctly report `retained:false` for
the Page editor across these cross-route returns and `retained:true` for the
board cards. These are distinct claims.

## Hidden-view correctness work

Preserving DOM changes assumptions beyond mounting speed. The accompanying
changes address the concrete problems found in review:

- Board drag previews, target columns, bundle measurements, and landing
  animations query their owning board root. A hidden global board can contain
  the same issue IDs as the visible project board; a document-wide first match
  would otherwise target the wrong element.
- Suspended drags clear gesture/geometry state, and card animation snapshots
  are reset before the resumed board measures its current viewport. A sidebar
  or scroll change while hidden must not reuse stale coordinates.
- Marquee cancellation stops its animation-frame loop as well as its event
  listeners, and restores selection/overlay state.
- Global keyboard and dismissal guards consider only visible overlays.
  Portaled dialogs can retain `data-state="open"` while Activity hides them;
  their presence alone must not disable another screen's shortcuts.
- Issue-panel tab selection is based on a new opener request, rather than an
  effect replay. Returning to a retained panel preserves a user's selection of
  Description or Plan.
- View-generation spinners store their original expiry deadline. Hiding a
  board cancels its timers; revealing it schedules only the remaining time or
  clears an expired/remote-completed generation. The previous cleanup would
  cancel the timer permanently while retaining the spinning state.
- Event-only keyboard consumers and targeted activity subscriptions avoid
  waking all card consumers for unrelated global state changes. These changes
  complement retention; Activity alone does not eliminate activation work.

## Lightweight tab labels

The old tab strip could fetch complete Page/objective/routine lists and a live PR
detail only to display a title. The new authenticated metadata endpoint accepts
at most 100 normalized destinations per read and selects only the requested
stored identifiers and display fields. Independent table reads run concurrently
through the authenticated RLS client. Page/objective rows must also match the
project named by the destination. Resolving a label never contacts a forge.

The client batches large tab sessions, scopes metadata keys by account, and uses
short metadata freshness/garbage-collection intervals. Existing full caches are
observed with fetching disabled and narrow metadata projections, so an already
available optimistic rename still updates its label immediately without causing
a full-list/detail read. Remote broadcasts and reconnect catch-up invalidate the
narrow metadata cache. An invalidated old full cache yields only after a newer
successful metadata response; an outage retains its last useful label. Deletions
remain authoritative, rather than reviving a removed row from old metadata.

The stored PR fixture validates this label path and the ordinary PR list. It
still does not validate live diffs, reviews, comments, or forge synchronization:
opening the real detail surface can request a forge and fail for these deliberately
inert fixture repositories. Avoid attributing those detail requests to tab-label
resolution, or treating their failures as successful integration coverage.

## Measured additional gains and remaining work

Values are milliseconds. Repeated rows show the median and full observed range
of five samples; controls below are single observations.

| Interaction | Starting HEAD | Candidate | Additional change |
| --- | ---: | ---: | --- |
| Return to board | 955 (949–1,003) | 508 (500–544) | 47% shorter |
| Return to Page | 1,008 (824–1,075) | 229 (226–262) | 77% shorter |
| First switch to Pages | 777 | 243 | Single observation |
| Prefetched Page opening | 92 | 132 | Slower single control; no non-regression claim |
| Page options menu | 31 | 44 | Slower single control; no long task |
| Page comments panel | 64 | 91 | Slower single control; no long task |

The board's median script counter fell from 908 to 412 ms. Its median style
recalculation fell from 259 to 202 ms, and layout remained approximately 38–41 ms.
This candidate does **not** establish immediate board activation: a median
354 ms of long tasks still occurred before readiness, followed by 102 ms during
the observation tail. The baseline's deferred median was 97 ms, so this tail
does not support a claim that deferred work disappeared. The largest sampled
frame gap on a board return remained 383 ms.

Page returns reduced median immediate long-task time from 792 to 160 ms, with
no recorded deferred long task in either series. Their median largest frame gap
fell from approximately 683 to 100 ms. The Page options menu after 15 additional
round trips took 45 ms with no recorded long task, close to the earlier candidate
control of 44 ms. That next-interaction check argues against a large accumulated
stall on this specific path; it does not establish the same result for every
later interaction.

These results are for the combined candidate, including subscription and other
second-pass fixes. They are not a factorial experiment attributing every
millisecond to the navigation host. Subsequent CSS/layout changes and constrained
profiles belong in the final comparison when their own samples are available.

## Memory tradeoff and bounds

Memory samples release the runner's saved DOM identity references before asking
CDP to collect garbage. Heap values below use decimal MB; they are JavaScript
heap readings, not total browser/Electron resident memory or a GPU-memory budget.

| Settled state | Starting HEAD | Candidate |
| --- | ---: | ---: |
| Initial global board | 248.6 MB | 226.8 MB |
| Page after five board/Page round trips | 36.9 MB | 255.1 MB |
| After five additional round trips | — | 257.1 MB |
| After ten additional round trips | — | 259.0 MB |
| After fifteen additional round trips | — | 260.9 MB |

Retaining the board has a substantial and deliberate memory cost while viewing
a Page. The candidate keeps approximately 29,024 connected elements instead of
the baseline's 1,020. Through the additional 15 round trips, connected elements
and reported event listeners remained flat at 29,024 and 8,191, while measured
heap rose by about 5.8 MB. That is bounded DOM/listener evidence for this run,
not proof of zero heap growth or absence of leaks over hours. Listener counts
include listeners attached to retained DOM; they do not mean that every listener
corresponds to an active hidden polling loop.

A subsequent full-document navigation released the retained application tree
and measured approximately 24.3 MB. This checks document teardown, not tab LRU
eviction. Two-board eviction and closed-tab release are covered by component
tests; a larger, realistic multi-project browser session remains a separate
memory workload.

The two-entry cap bounds retained board instances, **not bytes**. Two unusually
large boards can still consume substantial memory, and query caches retain their
existing independent lifetime. Mobile emulation does not establish acceptable
memory use on mobile hardware. A byte/row-aware retention budget or board
windowing remains a separable investigation if larger workloads justify it.

## Verification and review limits

Relevant component tests use the real React Activity implementation and assert:
exact card/input DOM identity and draft/scroll survival; hidden portal display;
effect and keyboard-listener suspension/resumption; two-entry LRU eviction;
closed-tab removal; startup adoption; cold route transitions; same-path tabs
with different selection queries; and preserving the outgoing DOM until an
active-tab close commits its replacement route.

Additional tests cover tab metadata projection and invalid input, absence of
full surface requests, immediate cached renames/deletions, outage recovery,
realtime/reconnect freshness, and generation deadline restoration. The related
board tests cover duplicate issue IDs in hidden/visible roots, drag cleanup,
animation geometry, visible overlay guards, issue-panel selection, and selected
board keyboard ownership. Existing account-provider tests verify session
replacement on account changes and clearing optional contexts on sign-out.

The navigation-focused test batches passed, as did the cumulative TypeScript,
owned-English, and diff checks at the source freeze. Repository-wide final
checks and browser verification should be recorded by the final audit report
with their exact later build and CI status. No navigation code commits, new
branch, PR, merge, or deployment were created independently for this chapter.

The baseline's separate rapid-session loop failed on the first Page return in
both the normal and constrained runs: the Page tab was selected, but the address
and visible content remained on `/all`. The five normal tab round trips, which
included their 2,200 ms observation tails, had completed. The candidate then
completed 15 rapid round trips. This is an observed baseline failure and a
passing candidate scenario, not an isolated proof of the race's cause. The new
host scopes outgoing publications and route identity, and reduces teardown
scheduling pressure, but the existing session's target-acknowledgement logic was
not rewritten. Later comparable timing series must use the same readiness rule
on both builds and preserve these unsuccessful raw runs as negative results.

The reviewed implementation uses public React and Next APIs. It does not enable
Next's application-wide Cache Components mode or depend on private router
contexts. The React [Activity reference](https://react.dev/reference/react/Activity)
documents retained state and effect cleanup/reconnection. That lifecycle is why
the hidden-view correctness changes and the explicit Page exclusion are part of
the architecture, rather than optional follow-up work.

## Native shell and engine smoke runners

`scripts/performance/verify-surfaces.mjs` supplies explicit Chromium desktop,
Chromium mobile-emulation, and Playwright WebKit modes. Its screenshots and
coverage JSON distinguish Page content, menus, comments/history, sidebar
visibility, native/fallback textarea sizing, and read-only assistant history.
Additional route smoke uses `--routes`; route and shell presence does not imply
that every control or network workflow on that route was exercised. Playwright
WebKit is not a claim that the Safari application or a physical iPhone was tested.

`scripts/performance/verify-electron.mjs` targets the locally installed,
unpackaged macOS Electron executable under `desktop/node_modules` and the
existing `desktop/dist` build. The installed engine identified for this audit
was Electron 43.4.1; the runner records the actual Electron/Chromium/application
versions at execution. It checks the real preload bridge without invoking
permission-bearing bridge methods, all 600 board cards, sidebar preservation,
the complete 80-block Page and its menu, and a retained-board return. Renderer
screenshots are distinct from native title-bar captures. Process CPU/memory
aggregates and GPU feature flags are diagnostic snapshots, not a compositor
profile or a latency benchmark.

The runner passes a fresh temporary profile through Chromium's `--user-data-dir`
switch and the application's test-only override, then verifies both Electron's
`userData` and `sessionData` paths before installing fixture cookies. Electron
43.4.1 applies the switch in
[PreSandboxStartup](https://github.com/electron/electron/blob/v43.4.1/shell/app/electron_main_delegate.cc#L233),
before application code runs; its default
[session path resolves through userData](https://github.com/electron/electron/blob/v43.4.1/shell/common/electron_paths.cc#L44).
The runner never
copies a personal profile, inherits dotenv secrets into Electron, claims the
protocol, or requests microphone, repository, or local-runtime permissions.
Only deterministic temporary fixture tabs are created and removed; existing
tabs and content are checked after closing the application. This validates an
installed development shell against the local production web build, not a
signed or packaged release. The runner uses the documented experimental
[Playwright Electron API](https://playwright.dev/docs/api/class-electron) and
the public [Electron application diagnostics](https://www.electronjs.org/docs/latest/api/app).
Run it with `NODE_PATH=./desktop/node_modules` so the default unpackaged launcher
resolves the existing Electron dependency and installs its startup synchronization;
the runner asserts the resolved executable before authenticating. The first
attempt passed the raw executable explicitly, which skipped that startup loader
in Playwright 1.63 and timed out before any application check. That failed
attempt is preserved separately as `pass2-electron-launch-failed.json`.
The next attempt reached the native board but encountered the fresh-profile
analytics dialog: the native window's initial load could start before the context
initializer was installed. The runner now initializes the local consent key in
its temporary profile and reloads before checking the app; no account preference
is changed. That setup failure is preserved as
`pass2-electron-consent-setup-failed.json`.

The final native run passed all four checks with Electron 43.4.1, Chromium
150.0.7871.224 and the existing unpackaged 0.10.30 shell against the production
web build. It recorded zero page errors or failed API responses, retained the
same 600-card board after sidebar toggles and a complete 80-block Page visit,
and restored the original column scroll of 180 px. Temporary tabs/profile were
removed and fixture content was unchanged. GPU compositing and rasterization
were enabled. Aggregate working-set snapshots across four native processes
increased from 1,037,312 to 1,299,424 to 1,617,152 KB; these short-run snapshots
include browser/GPU/utility/renderer allocation without forced GC and establish
neither a bounded long-session working set nor a memory leak. Native memory
profiling remains separate work; correctness coverage does not establish native
interaction latency or release-package performance.
