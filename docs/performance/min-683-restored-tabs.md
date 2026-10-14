# MIN-683: restored working-set investigation

## Current status

Work stopped at the user's request on 2026-10-14. The
[session checkpoint](min-683-session-checkpoint.md) records the exact retained
build, failed final web activation and outstanding checks. No more tests or
content writes are running. Final rapid-refresh, long-absence and journaled live
editing/focus verification have not run; acceptance remains open.

Acceptance remains open. The stable ten-tab fixture contains 120 triage issues,
120 private feedback posts and 30 active objectives with fifteen linked tasks
each. Its complete issue source contains 1,206 rows globally and 670 in the
expanded project; kanban excludes triage and contains 1,086/550 cards. Original
records, Page bodies, the Git connection and principal account are preserved.
The completed migration journal is frozen before comparisons.

The environment-matched reference is `4979abaf9` / `rL4XW8zaKJVNENj2pGdIO`:
the historical application plus both source-completeness corrections. Candidate
`8655f2a4c` / `V64G9fNPlmZ3KhKjdmZNG` includes prepared-view retention, Page
read/write separation, focus synchronization, autosave handoff and bounded
complete-query working-set persistence. Later uncompiled source edits are not
part of this measured candidate. The ordinary source hash is `95100e55…` and the
fixture journal hash is `431c744f…`; complete hashes and manifests remain in raw
and audited evidence.
The isolated one-slot control and the subsequent earlier-tab-read experiment
have now completed both runtimes. Two preparation slots are retained; the
earlier-tab-read change is rejected because these observations establish no net
benefit for the requested working-set deadline. The separately identified writer
experiment is now measured and provisionally retained for transport efficiency;
rapid-refresh safety and final correctness remain pending. None of these results
closes acceptance.

## Latest writer observations

Writer candidate `0eb4b938b` / `f9LzXYsBiQZXGZcWy518h` contains the retained
`8655` application plus Task 47, with Task 46 reverted. Native/web restored runs
pass all complete-content gates, exact source preservation, Page versions, ten
tabs and Git identity. The same frozen protocol/cohort/environment applies.
Across 100 alternations, recorded local-snapshot POST starts fall from 284 to 34
desktop and 286 to 35 web, approximately 88% in both. Recorded HTTP starts fall
359 → 153 and 513 → 298. Snapshot slots remain unknown. Sampled Task/Script work
is 9,873/6,104 → 10,278/6,486 ms desktop and
11,620/7,651 → 10,262/6,387 ms web. This is a transport improvement with mixed CPU
cost, not a latency acceptance claim.

| Complete alternation | Desktop p50 / p95 / max | Web p50 / p95 / max |
| --- | ---: | ---: |
| Global kanban | 106 / 204 / 204 | 111 / 120 / 120 |
| Project kanban | 120 / 134 / 134 | 117 / 126 / 126 |
| Primary Page | 70 / 82 / 82 | 71 / 77 / 77 |
| Foreign Page | 63 / 70 / 70 | 68 / 73 / 73 |
| Home | 47 / 50 / 50 | 47 / 51 / 51 |
| PR Activity | 62 / 70 / 70 | 54 / 67 / 67 |
| Routines empty state | 39 / 101 / 101 | 39 / 44 / 44 |
| Triage | 63 / 70 / 70 | 62 / 65 / 65 |
| Feedback | 60 / 897 / 897 | 57 / 800 / 800 |
| Objectives | 64 / 76 / 76 | 66 / 76 / 76 |

Each group has ten laboratory observations, so its p95 equals its maximum;
population p95 remains unknown. Feedback visibly loads once in each runtime,
with 93/80 observed loading frames. Sequential first visits remain slow:
project 489/429 ms, primary Page 328/320, foreign Page 477/437, PR 2,326/2,602,
Routines 590/571 and Feedback 956/881. At the fixed refresh observations of
3,002.4/3,003.9 ms neither Page body/version exists; project prerequisites are
3/7 and 1/7 accepted. Renderer launch is 2,580/2,457 ms and refresh 2,157/2,166 ms.
The one actual unpackaged executable restart reaches the natural full board in
2,961.7 ms with persisted auth and full preservation. No startup percentile is
inferred. Native focus absence is genuine; ordinary web absence remains invalid.

The writer five-PR headful web run completes all 272 observations, preserves
tabs/Git identity and receives no 403/429. It is a new actual-product observation,
not a completion or relabeling of the failed `8655` forge run. Provisional
retention depends on later rapid-refresh and correctness proof. Final Task 48
and any post-mutation evidence must remain separately identified.

## Retained 8655 paired results

Both runtimes pass every restored-tab complete-content gate and cleanup.
Initial activations remain too slow. Values below are individual observations
in milliseconds, not population percentiles. Each cell is desktop/web.
The destinations are visited in the displayed order after the refresh; each
has not been activated in that renderer session, but earlier views can warm
shared project data and give later views more elapsed preparation time. Raw
evidence records actual click ages. These are sequential first visits, not nine
independent first clicks at three seconds. The fixed-age snapshot below measures
preparation before any of those activations. The foreign Page opens before its
project board.

| First complete activation | Reference | Candidate |
| --- | ---: | ---: |
| Project | 2,457 / 2,666 | 400 / 488 |
| First-project Page | 419 / 399 | 353 / 358 |
| Direct foreign-project Page | 445 / 445 | 394 / 428 |
| Home | 224 / 230 | 50 / 104 |
| PR Activity | 2,093 / 2,151 | 2,510 / 2,527 |
| Routines | 612 / 570 | 602 / 625 |
| Triage | 280 / 276 | 292 / 339 |
| Feedback | 1,366 / 1,351 | 901 / 844 |
| Objectives | 375 / 378 | 166 / 190 |

At the candidate's fixed refresh observations, 3,026 ms on desktop and
3,001.8 ms on web, neither Page has a cached body or version. Project
prerequisites are only 3/7 and 2/7 accepted, PR dependencies 1/5 in both, and
Routines 0/2. Successful later clicks do not establish preparation by three
seconds. Metadata remains separate from visible content and fresh write
authority.

Repeated navigation improves substantially for retained documents and several
secondary views. Each cell below is desktop/web laboratory p95 from ten samples;
with ten observations this estimator also equals the observed maximum.

| Repeated complete activation | Reference | Candidate |
| --- | ---: | ---: |
| Global kanban | 147 / 131 | 158 / 162 |
| Project kanban | 117 / 125 | 125 / 154 |
| First-project Page | 1,124 / 998 | 73 / 101 |
| Foreign-project Page | 361 / 329 | 73 / 95 |
| Home | 61 / 60 | 50 / 95 |
| PR Activity | 62 / 64 | 57 / 97 |
| Routines | 2,270 / 855 | 47 / 96 |
| Triage | 75 / 73 | 76 / 89 |
| Feedback | 1,384 / 1,377 | 2,004 / 385 |
| Objectives | 719 / 562 | 64 / 94 |

The candidate's native Feedback outlier is retained: 2,003.7 ms and 226 visible
loading frames. It prevents any claim that common navigation never exceeds
300 ms. Native focus absence and return are genuinely observed. Web content
passes after the attempted absence, but the original document remains focused;
web focus recovery is unvalidated. These ordinary runs make no remote content
writes and do not validate daily feel.

Authenticated renderer launch is 2,754/2,339 ms for the reference and
2,386/2,384 ms for the candidate; refresh is 2,296/2,467 and 1,999/2,228 ms.
Separate real executable restarts reuse the same isolated fixture profile and
persisted auth cookies, with no measured navigation or cookie injection. They
use the actual unpackaged Electron executable and production Next renderer;
they do not measure launching an installed signed-release `.app`. These restarts
reach the natural complete global board in 3,873.9 ms and 3,001.9 ms respectively.
There is one measured restart per build, no p95. The candidate is approximately
three seconds, while the exact `<= 3000` check remains false by 1.9 ms. Both
executable runs preserve all issue content, selected Page bodies/versions, ten
tabs and Git connection identity.

The first reference executable attempt is retained separately: excluded setup
waits for an optional sealed cache and records no measured restart. Actual
compiled persistence-boundary probes establish why that prerequisite cannot
pass: the reference global board alone exceeds the 2 MiB byte ceiling. Its
complete ten-tab cache estimate is 5,076,249 bytes and 90,098 visited values;
removing only the byte limit passes. No query-cache sealing request occurs,
while the separate window-tab snapshot seals successfully. Candidate runtime
probes verify complete permitted working-set compaction, sealing and ordinary
server restoration under the original guards. The executable runner now records
optional cache presence after a normal flush opportunity; format/owner envelope
recognition is not write authority.

Recorded transport and main-thread costs are also retained per strict stage
pair. The current reference/candidate comparison is below; arrows mean
reference → candidate, and Task/Script durations are milliseconds.

| Phase and runtime | Observations | Recorded HTTP starts | Local-snapshot POST starts | Task / Script duration | Reported long tasks |
| --- | ---: | ---: | ---: | --- | ---: |
| First visits, desktop | 9 | 179 → 115 | 21 → 22 | 3,469 / 2,706 → 2,585 / 1,797 | 1 → 1 |
| First visits, web | 9 | 187 → 135 | 21 → 22 | 3,319 / 2,516 → 2,027 / 1,340 | 1 → 2 |
| Alternation, desktop | 100 | 497 → 359 | 268 → 284 | 16,999 / 12,133 → 9,873 / 6,104 | 25 → 21 |
| Alternation, web | 100 | 604 → 513 | 262 → 286 | 15,005 / 10,227 → 11,620 / 7,651 | 22 → 51 |

HTTP counts use the start timestamps of recorded finished/failed requests inside
each phase envelope, including intervals between clicks; they are not an
exhaustive request-dispatch trace. Snapshot POST payloads and slots are not
recorded: the 284 desktop alternation POSTs cannot all be called window-tab
seals. CDP Task/Script deltas span the before/after probes and include driver and
background work. Script time is part of task time; the two must not be added.
Reported long tasks are deduplicated by renderer origin/start/duration. Whole-run
HTTP counts are 1,405 → 1,240 desktop and 1,475 → 1,428 web; whole-run snapshot
POST counts are 342 → 345 and 338 → 361. Faster content does not establish lower
snapshot transport cost. Subsequent explicit stage comparisons reference their
original labels and expected actual products without relabeling existing runs;
eligibility alone does not prove the declared application delta.

The broader protocol distinguishes an issue title-shell `paintMs` from exact
complete body, every canonical confirmed comment and usable editing controls in
`completeMs`. An excluded native check observes 79 ms for the shell and 703 ms
for full usable content. This validates the gate, not comparative latency.
Canonical issue content also qualifies during `refreshing`; loading, paused,
error, wrong body, missing comments and unavailable controls still fail. Read
phases at usability and network reconciliation timings remain separate.

Deep-document readiness matches every source block, title and editable surface,
tracks authorized existing-tab activation and ignores hidden retained copies.
All four previously normalized documents remain unchanged. The separate
[broad report](min-683-broad-results.json) retains diagnostic failures and
preservation proofs. All six reference broad runs and five candidate runs pass
their complete gates and preservation checks. The sixth candidate, headful web
five-PR run, fails after 158 observations when GitHub returns a primary-rate-limit
403 for PR detail and review comments. Numeric Retry-After values are 471/472
seconds; its response-derived deadline is 2026-10-14 01:31:14.701 UTC. The partial
run is retained as failed, with tabs and Git connection preserved; it is not a
completed sixth comparison. No automatic retry or old-product relabeling occurs.
The candidate's first complete issue panel is 766 ms desktop and 494 ms web,
versus 75/95 ms for the title shell. Complete multi-click cross-project workflows
include driver work between clicks and remain separate from individual
click-to-content measurements. Boards provide kanban; there is no separate issue-table
layout to invent. Triage, feedback, objective and PR lists are distinct measured
surfaces. Routines contains zero rows: only its complete empty state and enabled
creation entry are measured, with no prompt, cadence, history or populated-detail
claim. No paid routine or generated fixture is created during this matrix.
Final journaled correctness verification and any subsequent increment
remain outstanding; MIN-683 stays in progress.

## Isolated controls and rejected earlier tab reads

The direct one-slot control is `d27feb89c` / `Jiski42ci5lVv2VlAa8dV`, differing
from `8655` only in the preparation concurrency constant. The earlier-tab-read
experiment is `0829375f3` / `g9Ee5-J9CBrV9Wq8eaIFx`, whose application delta is
the expected-owner canonical tabs GET running alongside snapshot opening. Both
use the same frozen protocol, cohort and four environment-file hashes as `8655`.
Every complete-content gate and preservation check passes. Web actual-focus
evidence remains invalid and is not promoted by these content results.

| Sequential first visit | Two slots | One slot | Earlier tab read |
| --- | ---: | ---: | ---: |
| Project, desktop/web | 400 / 488 | 949 / 752 | 509 / 435 |
| Primary Page, desktop/web | 353 / 358 | 384 / 295 | 311 / 321 |
| Foreign Page, desktop/web | 394 / 428 | 425 / 379 | 526 / 437 |
| PR Activity, desktop/web | 2,510 / 2,527 | 2,636 / 2,545 | 2,369 / 2,562 |

At the fixed approximately-three-second observations, the one-slot project has
0/7 accepted prerequisite queries and neither Page has a body/version. Earlier
tab reads have project 1/7 in both runtimes and neither Page body/version,
compared with the retained two-slot project's 3/7 desktop and 2/7 web. The
earlier-read renderer launch/refresh is 2,407/2,092 ms desktop and 2,344/2,216 ms
web, versus 2,386/1,999 and 2,384/2,228 for `8655`. Its actual unpackaged
executable observation is 2,886.3 ms versus 3,001.9 ms; one restart per variant
does not establish a causal 115.6 ms gain or a startup percentile.

The earlier-read change is rejected: mixed first-open timings and a single
executable improvement do not demonstrate preparation of the listed working
set, while the fixed-age coverage does not improve. Native first-visit recorded
HTTP/POST counts are 115/22 → 118/22 and sampled Task/Script work is
2,585/1,797 → 2,696/1,910 ms. Native alternation is nearly unchanged at
359/284 → 361/285 requests/POSTs and 9,873/6,104 → 9,816/6,037 ms. Web first
visits are 135/22 → 130/22 but Task/Script work increases from 2,027/1,340 to
2,645/1,833 ms; its alternation decreases from 513/286 to 453/249 and from
11,620/7,651 to 9,787/6,151 ms. These are observed mixed costs, not causal
confidence from one run. The explicit stage records retain original labels,
actual expected products and full phase transport/thread summaries. Rejected
source and results remain reviewable; the next writer experiment compares
directly with `8655`.

## Baseline and scope

This follow-up starts from `ca44a35e4`; its application source is equivalent to
`0abd1d6cb`. Earlier rejected experiments stay rejected. The historical production baseline
build is `IflZwyWntlTxQ6lF7WslG`. The issue remains in progress, with no merge or
deployment authorized. See the [primary-source architecture review](min-683-architecture-refresh.md)
and [complete experiment history](min-683.md).

Only `captures-demo+min540@minddy.app` was normalized. Authentication verified
its exact email, fixture user ID and performance marker before mutation. Its
66 accumulated tabs were archived with every original field, then replaced by
ten revision-guarded stable destinations: global board, first project board,
first-project document, direct second-project document, Home, genuine PR,
Routines, Triage, Feedback and Objectives. The existing GitHub installation
fingerprint is unchanged. Projects, categories, issues, documents and forge
records were not modified by normalization. The account owner's principal
profile and tabs were never used.

`scripts/performance/stable-restored-tabs.mjs --apply` establishes the selection;
without `--apply` it reports the verified identity and tab counts only. Its
manifest and original inventory live in the ignored performance evidence
directory. Both measurement runners reuse the ten identities, restore their
destinations and assert no accumulation. They do not reseed or add ordinary
temporary tabs. Read-only runs verify exact Page content/version, source board
fingerprints and GitHub connection identity.

The retained scaled fixture is established by
`node scripts/performance/enrich-secondary-workload.mjs --apply`; its default
mode is a read-only identity and preservation preflight. The add-only migration
requires the completed small-cohort journal and a byte-for-byte backup before
writing. It rechecks fixture identity, sole project ownership, invitations,
disabled automation and enabled routines before every mutation. Records and
comments have deterministic definitions and journaled transport outcomes;
ambiguous server-generated creations stop for reconciliation instead of
blindly retrying. Feedback is private/internal, with no mentions or forge
writes. The original review setting is restored after the created feedback's
ordinary completion markers are verified.

Every new measurement must declare the actual server URL and the directory
containing its production build manifest through `MINDDY_PERF_BASE_URL` and
`MINDDY_PERF_BUILD_ROOT`. The manifest's SHA and `.next/BUILD_ID` identify compiled
code independently of the runner checkout's current HEAD. The restored runner
uses `MINDDY_PERF_REPEATS=10` for repeated navigation and `--electron` for native
desktop; executable startup has its own runner and persistent isolated profile.
`verify-restored-navigation.mjs --verify` is a separate, journaled fixture-only
mutation diagnostic and runs after ordinary comparisons. It must not be pooled
with read-only latency observations.

Before the scaled comparisons, build-log review found that the detached
measurement checkout loaded `.env` while the canonical checkout also loaded
`.env.local`. No fresh scaled ordinary navigation run had started. The detached
checkout now links the same local override file and is rebuilt. New product
manifests record SHA-256 hashes, not values, for the four production environment
files; paired eligibility requires their equality. Earlier results did not
record these hashes and cannot establish controlled environment parity. Keep
their observations and failures, but do not silently certify a causal
comparison from build/protocol/runtime/workload identity alone. The earlier
source-count diagnostics remain count/completeness evidence, not latency
comparisons.

## Measured diagnostic and rejection rules

The first stable primary pair verifies full board startup at 2,378 ms web and
2,278 ms native. Those historical primary runs still allow ten seconds of idle
preparation. An issue shell paints at 79/approximately 79 ms, but its complete
activity takes 878/954 ms (web/native). Neither shell readiness nor these sparse
startup observations establish ticket acceptance or population startup p95.

The restored-tab runner measures the populated, editable document, complete
board source/header counts with visible rows, actual PR description/activity,
and usable secondary empty/list states. Trusted pointer input has no preceding
hover. First activations begin at three seconds after refresh; each records
its own actual dispatch time. A document in the second project is opened
directly, before that project's board. Network requests, static chunks, loading
frames, long tasks and main-thread task/script/style/layout work remain separate
from complete-content paint opportunity. Native process connection/first window
is recorded separately from authenticated renderer startup.

The v4 protocol also installs an independent renderer timer before navigation.
At three seconds it records actual scoped query status, invalidation, fetching,
accepted-data presence and collection counts before any destination activation.
The observation retains its actual renderer age when the main thread delays it.
Page identity, version, body-match booleans and mounted editor state are metadata;
they grant no fresh write authority. Executable startup separately records a
process-launch deadline, Page availability at that deadline, actual renderer age
and IPC send/receive ages. A late response cannot be called a three-second result.

An excluded smoke attributes the first project delay primarily to route/chunk
loading: approximately 2,857 ms click-to-complete, with a 1.16-second RSC request
and a lazy chunk ending 2.43 seconds after the click. Its main-thread task work
is about 670 ms, including a 57 ms long task. No destination prerequisite API
reads finish in the initial three-second preparation opportunity. First Page,
direct second-project Page, Home, PR, Routines and Objectives also exceed the
target. These diagnostic observations guide source changes; they are not
ordinary paired acceptance statistics.

An immediate-refresh smoke also exposes tab accumulation: the server already
stores `/all?view=…`, while the active-window encrypted snapshot is not yet
sealed and the address remains `/all`. Exact-only startup matching creates a
new tab. The runner's own successful create/PATCH requests identify this row;
cleanup removes only renderer-created rows and preserves the stable ten.
The regression must be fixed, not hidden by adding a wait to startup timing.
The ordinary matrix uses a settled three-second launch before its measured
refresh; `--immediate-refresh` retains the separate race regression.

Two early probes overlapped a deep-navigation run or source checks. They are
excluded from ordinary timing aggregates, with their failures and restoration
results retained. Bringing a second browser page to the foreground did not
expose an actual focus change in those probes. They cannot establish focus
recovery; the final protocol must verify real hidden/unfocused state and return.

Reject any increment that moves startup work into early clicks, suppresses
loading without complete controls, regresses other common destinations, loses
pending edits or weakens authorization/version handling. Majority below about
100 ms and no common navigation above about 300 ms remain the target. Daily
qualitative validation is still required.

## Increment boundaries

1. Complete a bounded ten-tab dependency manifest through ordinary account
   QueryClient factories. Deduplicate shared reads; independently warm public
   code; drain pending work rather than abandoning it after three destinations
   and twelve reads. Yield to foreground reads, retain cancellation recovery,
   avoid observer/cache churn, resume invalidated work after focus, and preserve
   GitHub Retry-After. Prepare listed tabs before optional neighboring data.
   Routines/Objectives code preparation alone does not bypass their router.
2. Separate accepted cached Page display/local typing from the fresh versioned
   write basis. Keep ordinary mount validation, scoped identity and error UI;
   merge the current local overlay with the fresh response before any write.
   Departure joins validation/save or is vetoed on failure. An unresolved draft
   remains queued and protects browser reload through the unsaved-change guard.
   There is no durable outbox guarantee for forced process termination.
3. Recover uniquely matching richer tab selections when selection-free refresh
   races snapshot sealing. Preserve explicit different selections, ambiguous
   duplicates and account-switch entry semantics.

Each product increment requires its own identified production build and matched
stable workload comparison. Detailed results and final retained/rejected source
decisions are appended after measurement; implementation alone is not acceptance.

## Finite preparation and PR ownership results

The preparation-only snapshot is `473de2e55` / `5EC5VoCCuuYX9NU98-4hI`.
The subsequent PR-ownership snapshot is `3e79f8b89` / `EC0O2GORKFuhVYj2zgGkw`:
it contains preparation and refresh recovery, followed by the isolated PR fix,
without the cached Page display change. The detached measurement checkout
does not create another branch for the issue. Build manifests identify the
actual compiled source even while the working branch advances.

These historical timing observations have unrecorded environment parity. They
remain useful measurements of the named builds, with no strict causal claim
about the individual increments.

The representative native baseline and both increments use the same complete
readiness protocol. First project activation is 3,736 ms in the baseline,
3,011 ms with finite preparation and 568 ms with PR serialization. The latter
still exceeds 300 ms. First Home improves from 331 to 58/70 ms across these
increments. First PR remains 2,210/2,570/2,785 ms: a visible list or frame does
not count as the selected PR's complete content. Cached Page display is still
absent from these isolated snapshots; repeated first-project documents remain
around one second and native focus-return documents remain above one second.

The PR defect is actual observer ownership: enabled observers independently
launch five detail reads around 2.9 seconds, despite the nominal serial owner.
Disabling autonomous observer fetches removes that burst while the real owner
keeps foreground joins, the minute attempt bound and GitHub Retry-After.
The remaining first-project gap is separately attributable to shell admission:
the search index runs around 1.8–3.8 seconds and `otherTransport` treats it as
foreground. No project prerequisite has started by three seconds. Clicking
starts the seven normal project factories together. Public bundles are already
prepared, so warming more chunks cannot resolve this data gap.

These increments establish coverage and ownership correctness, not full
performance acceptance. Five alternations per destination report p50/max;
their p95 is deliberately absent. First activations and sparse launch samples
are not pooled with warm clicks. The audited
[results index](min-683-restored-results.json) retains identified runs, comparison
eligibility, loading frames, failures, hashes and compressed request/CPU evidence.

The historical focus protocol disables Playwright's focus emulation before
native window minimization. Native absence and return are observed through DOM
focus state; browser minimization still reported focus in those earlier runs,
so those browser focus samples remain unvalidated. The populated protocol uses
a distinct actual browser window and verifies loss/return of focus. Playwright's
background-throttling overrides remain a stated limitation. Ordinary runs make
no remote content changes; remote-change recovery and typing/save departure
require the separate journaled correctness diagnostic.

## Documentation impact

The investigation and runner workflow are internal English documentation. The
public applications guide's `applications#desktop-renderer-recovery` section
(workflow A12) describes oversized
query-cache removal. Complete preferred-working-set fallback changes that
documented behavior, so its paragraph, revision and review record must be updated
in all six locales before completion. Those updates are committed at revision 10 under the
documentation owner's review. No new control, offline storage guarantee or
figure is introduced. Page autosave and conflict controls remain unchanged.
Documentation, knowledge and owned-English checks apply to the affected guides
and internal reports.

## Cached authority, retained secondary views and admission

The Page snapshot `67cd4b850` / `x-aTI4x__n5uOdH1OMgz0` separates accepted
cached display from the actual fresh versioned write basis. Known read denials
survive optimistic cache notifications. Subsequent safety snapshots require
accepted provenance from the actual scoped read or creation owner; an arbitrary
cache write, invalidated preparation marker or older response cannot establish
authority. A canonical accepted PATCH has separate version provenance and does
not clear a read denial. The production Page mount path explicitly supplies
this proof to the surface-ready hook.

The retained Routines/Objectives snapshot is `add545810` /
`d-aoZrNyswhgPE-jyfIc3`. It uses the existing weighted retained-view budget,
preserves selected entities and drafts, and limits route effects to the active
view. The following admission snapshot `cd3510727` /
`vWb6Ds4gSW9hF908kNPMC` defers automatic search indexing until listed
navigation prerequisites finish. Only explicitly identified healthy shell
maintenance reads can coexist with that preparation lane; unknown reads and
write-basis validation retain foreground priority.

The final single-lane authority snapshot `bbd6b7cce` /
`caRZXqF_quZ9d7d1MSpC0` was measured with ten alternations per destination.
In the historical empty-secondary cohort, native warm Page p95 is 74/71 ms,
Home 47 ms, PR 66 ms, Routines 47 ms, triage 37 ms, feedback 32 ms and goals
34 ms. Global/project boards remain at 134/123 ms. These are laboratory
samples, with a nearest-rank p95 of ten observations; they are not population
tail estimates. First native project/Page/foreign Page/PR activations remain
491/361/536/2,797 ms. First web equivalents are 631/477/420/2,579 ms.
The first Page and Routines openings still display loading. This build fails
the restored-tab exit criteria despite its warm improvements.

These snapshots preserve their failures and request/thread evidence in the
results index. They establish no populated secondary-detail result. A later
two-slot experiment must compare the same newly populated cohort and protocol
before acceptance; it cannot inherit the empty-state timings.

## Populated secondary workload

The first populated Performance Tester cohort retained twelve triage issues,
twelve additional objective-linked tasks, ten private internal feedback posts,
six active objectives and eighty comments in its owned synthetic project.
Feedback spans open, planned, in-progress, shipped and declined states. Goals
have linked tasks and progress. The idempotent enrichment replay performs zero
mutations. Original issues, Page content, the ten stable tabs, project settings
and Git connections remain preserved; the primary account is outside the
mutation scope.

The new readiness protocol validates exact list identities and complete
selected detail descriptions, activity, editable composers and enabled
controls. Its source hashes and workload manifest differ from the historical
empty cohort. The first populated native baseline failed on an ambiguous
feedback status menu and an unresolved PR readiness predicate. Its raw result
is retained and excluded from successful comparisons. Protocol repairs must
use the actual rendered control semantics and authoritative permissions before
a fresh baseline is recorded.

The excluded PR probe attributes its repeated timeout to a protocol error: the
commits trigger belongs to the Files view, while the runner demanded it on
Activity. The fixture's actual detail response grants viewer capability
`none`, so the intended read-only callout replaces the comment composer.
Activity must verify complete authorized content and enabled view controls;
Files and the two-commit popover have separate trusted input/readiness
measurements. Requiring an unavailable write control measures an impossible
state rather than latency. No product permission is changed.

The user subsequently requested a larger retained cohort: 120 triage issues,
120 feedback posts and 30 active objectives with 15 linked tasks each. The
target adds 108 triage issues, 110 posts, 24 goals and 438 linked tasks to the
existing fixture. Two comments per entity give 1,440 comments in total.
Verified source counts reach 1,206 globally and 670 in the owned project, with
1,086/550 kanban cards. These counts require explicit completeness checks:
the repository's Supabase configuration limits one read to 1,000 rows and the
initial global-board issue read did not page. A truncated response cannot be
certified as a complete board or used to claim performance acceptance. The
scaled manifest, migration and measurements must remain distinguishable from
both the empty and the first small populated cohort.

The growing-dataset diagnostic confirmed that cap on the unchanged
`ca44a35e4` / `IflZwyWntlTxQ6lF7WslG` build at 23:00 UTC on October 13.
Six complete synthetic-project reads established 1,001 issue identities before
the subsequent global read returned exactly 1,000 and omitted 37 of those
previously verified identities. This diagnostic contains no ordinary navigation
timing and cannot enter the paired performance comparison. The comparison's
baseline therefore requires the isolated completeness correction as well; a
faster truncated board is not an acceptable reference.

`dfa961b2b` corrects that issue read through the caller's authenticated
`issueStore` and canonical encrypted projection. Immutable UUID keyset batches
advance through the RLS-visible source, using filtered remainder counts to
handle a lower transport cap. If counts are unavailable, only an empty batch
proves exhaustion. Unique increasing IDs and valid ordering fields are required;
a later database or content-decode failure discards the complete result and
uses the route's existing error response. After all batches succeed, issues
return in position/number order with nulls last and UUID ties. Thirty scoped
tests cover caps, boundaries, ordering, protected content and route failures.

The first isolated comparison baseline is detached commit `bc2f210bf`: it contains
`ca44a35e4` plus only this completeness correction. Pagination does not create
an atomic multi-request database snapshot; concurrent inserts behind an
already-consumed cursor still depend on ordinary realtime/reconciliation. Other
global DTO collections retain their existing contracts and must not be called
unconditionally complete beyond the verified fixture.

A second excluded source diagnostic on its `Ip-ntMt4omP7iv4qJw3vO` build at
23:05 UTC verified 1,079 prior synthetic identities and received 1,115 global
issues, including every one of those identities and the shared project's
36 issues. This confirms live source recovery during fixture growth. It does
not substitute for the final quiescent 1,206/1,086 source/card verification or
establish latency improvements.

## Focus, disposal and canceled cached reads

A read-only lifecycle audit found that project resume catch-up covered the Page
tree but omitted Page bodies. A healthy mounted document could therefore miss a
remote update during socket absence and remain unchanged after focus return:
the body preparation owner skips mounted surfaces, and ordinary focus retry
targets errors. `dd34acf65` adds the existing account-local body prefix to
coalesced catch-up. A real QueryClient regression proves active refresh,
inactive invalidation and isolation from a different account's client. Cached
display remains separate from the ordinary fresh editing basis.

The two-slot audit also found that automatic cancellation can resolve previously
cached data instead of rejecting `fetchQuery`. Consuming that result as a
completed attempt could abandon an invalidated restored key. `7c4ed7210`
observes the exact underlying query operation's cancellation and lets the
existing settlement path retire its occupied slot and retry. A real cached,
invalidated Page with foreground observer takeover/removal retains its accepted
display but acquires no new preparation marker until a successful actual read.
Ninety-four focused scheduling/realtime tests pass for these corrections.

The same audit found a save lifecycle boundary: fresh acquisition was fenced,
but an already-ready write loop could send a later queued PATCH or conflict
replay after surface teardown. Generation fencing must also reach the ordinary
account-local write queue's actual HTTP dispatch, including its wait for Page
creation. An accepted already dispatched acknowledgement remains accepted;
unsent edits remain queued with the newest fields taking precedence.
`a57c67eaa` passes 41 mounted autosave/real queued-creation tests, including
StrictMode generation retirement, a replacement account client and ordinary
active departure. The HTTP producer receives only its ordinary project, ID and
input; the local generation callback never enters the wire payload. Live
fixture-only focus/edit/departure validation remains separate from those tests.

The next selected-detail snapshot adds shared consumer/preparation selectors
and ordinary query factories. Only the selected default or explicit ID is
prepared after its scoped list succeeds; 120 rows do not produce 120 detail
requests. Superseded unobserved work yields while real foreground joins remain
owned. The closed feedback setup dialog waits for explicit intent and remains
mounted after its first opening so closing it preserves the draft. Ninety-six
focused tests cover these contracts. This source has no scaled latency result
yet; private mobile filter state is not copied into a new global store.

The selected-detail implementation is identified by `58a17460b`. A successful
ordinary issue-list read can include a locally pending triage creation. The
preparation owner now keeps that intended selection but waits for its existing
insert register to settle before requesting its comments and activity. Targeted
acceptance or rollback notifications resume only the affected destination;
optimistic edits of an existing issue remain eligible. This avoids consuming a
404 attempt before POST acceptance without adding polling or selecting an older
issue. Real QueryClient tests cover acceptance, rollback, disposal and the
ordinary list reader's overlay.

The combined candidate source verification passes 319 tests in 25 suites,
including preparation, realtime catch-up, optimistic insert settlement, Page
display/write authority, queued autosave dispatch and retained surfaces. The
measurement and fixture tooling additionally passes 49 Node tests, including
bounded read ordering/error drainage and timeout-only source/DOM attribution.
These checks establish the tested contracts; they do not establish scaled
startup or navigation latency.

## Frozen scaled workload and comparison sources

The completed `min683-secondary-scaled-v2` journal has SHA-256
`431c744f478b39c6824cadc49a8f9f3b3422a7234777b1f489d42b5cc7be48c7`.
It retains 120 triage issues, 450 objective-linked tasks, 120 private internal
feedback posts, 30 active goals and 1,440 comments. Every goal has 15 tasks.
Feedback includes 96 unresolved and 24 resolved posts. The owned project
contains 670 source issues and 550 kanban cards; the complete global source
contains 1,206 issues and 1,086 cards. The original small cohort is included,
not replaced. All 660 previously retained issues, Page trees, ten tabs and
Git links match their original combined fingerprint
`556531c68da676b85a6aa517b896eccfdbed14b27f87d665c1a104d5c5361893`.

The original write job made 2,119 scoped mutations and ended with the expected
old-server truncation failure after restoring review settings. Its immutable
final journal and compact source-failure evidence are retained separately.
The complete-source recovery used only ordinary GETs, validated every canonical
entity and comment plus exact source identity sets, and made zero mutations.
Its five-worker read pool preserves order, stops new work on failure and drains
in-flight reads before failing. Recovery cannot create, repair or reclassify
records, repair settings, accept unknown operations or replace an original
fingerprint. The final source is frozen before ordinary measurements.

The first environment-matched baseline is `bc2f210bf` /
`XeVBoHN2qe9llNojU4F5e`, containing the original application and isolated
global-issue completeness fix. The current candidate is `dfa961b2b` /
`lPr0PJyW7A479v2PKoQjJ`; subsequent tooling-only commit `3d1ce45f1` does not
change that compiled application. Both manifests contain equal production
environment-file hashes. The first scaled ordinary protocol source hash was
`80dd43eeef59016ea42ecce514f0f653230d839a41fba2ef24f395e6f94bc993`.
Timeout-only split diagnostics were added without changing successful readiness
conditions; the current eight-file source hash is
`95100e55a60950772b2bbfe9cd1bff2588adb9f7738a80d84df78fe2874ba5f5`.
These builds are superseded for the next paired matrix because their separate
resume snapshot route remains capped. Both reference and candidate must include
the additional complete-source correction before new ordinary measurements.

The first scaled native baseline, `min683-restored-before-scaled-native-1`,
passed every initial restored-tab full-content gate but failed three later
checks: one project alternation, the final sampled objective selection and its
focus return. It is retained and excluded from successful paired conclusions.
Its cleanup verifies unchanged canonical content, Page versions, the stable
ten-tab selection and the Git connection, with unchanged runner sources.

Its complete global-board renderer launch/refresh takes 2,548/2,552 ms. These
are authenticated renderer measurements, not executable-launch measurements.
Its initial complete-content observations are project 2,489 ms, Pages 378/392 ms,
Home 257 ms, PR 1,995 ms, Routines 569 ms, triage 257 ms, feedback 1,099 ms and
objectives 335 ms. These sparse observations from a failed run are not an
accepted comparison or population percentile. At the fixed 3,002.6 ms refresh
snapshot, project data, Page bodies and secondary dependencies remain missing;
only the global board and invitations are complete.

The objective failure occurs after exact selected title, body, editable
composer, two comments and all thirty identities pass. A narrow read-only probe
verifies all four canonical sampled goals with progress 0/15, 4/15, 3/15 and 0/15
and a populated 550-card project board. The complete ten-alternation sequence
then reproduces both failures in the excluded
`min683-restored-before-scaled-protocol-diagnostic-full-native-1` run.

Its timeout-only evidence establishes actual source loss. The project query is
successful, idle and not invalidated, but contains only 464 issues/344 cards
instead of 670/550. Actual column headers sum to 344 and populated-row hit tests
pass. The last sampled objective's creation control and link are visible and
enabled, while its header reports 0/0 and its client query contains none of the
fifteen canonical linked tasks. The initial narrow probe and normal API both
verified those tasks. This is a coherence defect, not an impossible readiness
predicate; the full-content gate remains unchanged.

`GET /api/me/issues` is a separate authoritative resume/mount snapshot from
`GET /api/me/board`. Its unpaginated read still returns at most 1,000 global
issues. `reconcileGlobalIssueSnapshot` then replaces every loaded project's
issue query with that snapshot's project slice. The 206-row global truncation
therefore turns the owned project's 670 rows into 464 and removes the last
objective's fifteen tasks. Correcting only the aggregate board endpoint cannot
establish complete synchronized content. The next common baseline/candidate
source correction must cover this snapshot endpoint and its completeness
contract before timing resumes.

After the writer stage, the [audited index](min-683-restored-results.json) retains
60 runs and 25 reference source/protocol pairings. Twelve historical pairings have unknown
environment parity or failed content gates. Thirteen pairings satisfy the strict
source/protocol/workload/environment eligibility checks; the explicit controlled
stage records separately reference two-slot versus one-slot and `8655` versus
earlier tabs or the writer in both runtimes without relabeling measurements. This establishes matched
laboratory evidence, not acceptance, a population percentile or validated daily
feel. Web focus conclusions remain ineligible. Raw results, explicit exclusions,
failure diagnostics and cleanup proofs remain available.
Ordinary correctness failures and blocked repetitions never enter successful
timing statistics. Restoration journals contain original fixture documents and
are categorically excluded from the public evidence index.

The independent [broad index](min-683-broad-results.json) retains six
excluded predicate probes, six complete reference runs, five complete candidate
runs, the failed partial candidate forge run and the complete new writer forge
web run. It separates the first observed
issue, PR subview and deep-journey group from later observations per identity.
First observed does not establish an independently cold view; in particular a
foreign document can first appear inside the first deep loop. Ten-loop groups
therefore yield nine later observations; their p95 is omitted,
and p50/max/count remain available. No first network/import wait is silently
pooled into a warm percentile, and PR identities are not pooled together.

Large-list readiness verifies the entire authorized collection source and its
published count, including when the UI windows rows. Detail journeys declare
the deterministic first, second, middle and last identities, plus a bounded
resolved-feedback sample. They do not claim to visit all 120 details. PR
Activity, real file patches and commits remain separate complete-content
journeys; actual viewer permissions determine which writing controls exist.
The optional `--trace-request-initiators` flag requires `--diagnostic`. It records
same-origin paths, bounded source call frames and timing, omitting headers,
payloads and URL query values. It is off during ordinary comparisons.
