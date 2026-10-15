# MIN-683: session checkpoint, 2026-10-14

## Latest global fluidity pass (2026-10-15)

Read [the fluidity pass](min-683-fluidity-pass.md) first. Measurements now use a
local HTTP/2 + brotli proxy and include the sealed relaunch path. Against the
original control in one ABBA comparison, restored All completes at 1720 ms
against 2186 ms (web cold), 1759 against 2391 ms (web reload) and 2031 against
2790 ms (native). It lists retained and rejected fixes, the iad1/eu-west-1
production finding and the open follow-ups.

## Latest startup query-cache pass (2026-10-15)

Read [the startup cache pass](min-683-startup-cache-pass.md) first. Forced-quit
draft loss is explained by Chromium's deferred storage commit and corrected by a
desktop flush (`ab8f2a319`, run4 passes). The startup tree no longer remounts
its QueryClient when auth first resolves (`6413d75f2`): restored All completes
at a web median of about 2530 ms against 2838 ms, and a native median of 2977 ms
against 3183 ms. That report lists the remaining startup gaps.

## Latest native/bootstrap pass and Claude handoff

Read [the current pass](min-683-native-bootstrap-pass.md) and
[the continuation handoff](min-683-claude-handoff.md) first. This resumes published
`242b7b77d` on the same branch/draft PR420. The retained application source is
`783cf10cad0c802c364ee963edfdfd3440ad964b`, actual whole product
`ZRKbS9ItC3LDVGfvC-J4R`; later source experiments are exactly reverted. Do not
relabel this binary as the later documentation/tooling HEAD.

The bounded project bootstrap reuses complete member/objective readers with
request-local live authorization, independent frames and exact per-key owners.
Two held physical preparation transports admit one pair plus one ordinary read.
The fixed startup reservation and selected-read adoption protection remain
unchanged; existing v8 write/focus/merge/departure evidence is reused. Both a
cold PR-list overlap and omitted default-Link prefetch gate are measured and
rejected. Gate web project607.8→328.0ms is not retained against native
335.3→599.9ms. No extra broad runs are spent on rejected products.

Independent diagnostic coverage now includes all nine inactive destinations,
full native Home and real paused Routines. Natural unpackaged native startup is
measured separately: process median1732.5ms/max1800.4ms, n3, with separate
renderer clocks. Fixed-three-second snapshots do not prove ten-tab readiness;
cold/detail outliers remain above300ms. The main report separates the current
ordinary web control, failed current native focus attempts and historical220
accepted observations. None is promoted into an invented final-source matrix.

Real-SIGKILL recovery is failed: stabilized canonical destination coherence
passes in run2, but run3 confirms872bytes of acknowledged encrypted draft before
kill and an absent key after restart at the same origin. Root adds no post-save
flush; the exact cause remains unresolved. This is Claude's first priority.
Final checks and exact publication/CI are recorded in the current pass and final
delivery. The user requests a20-minute stop for a Claude
handoff; no further Feedback/issue-bootstrap implementation is started. Their
selected qualitative path is project→Page→project with typing/scrolling, still
awaiting actual acceptance. MIN-683 stays in progress. Preserve current Page
versions16/2, ten tabs and all scaled collections; never reseed or reset.

## Previous targeted merge-readiness pass

Read [the targeted review](min-683-merge-readiness-pass.md) first. Both provisional
changes are now retained for specific guarantees. Task51's isolated removal
admits early web indexing and moves first-project cost from617→1068ms;
independent three-second activation confirms664→967ms. The removal is rejected
and its original source/tests restored. Task56 remains a cancellation correctness
fix backed by eight real QueryClient/provider cases, not a general speed claim.

Four matched v6 web/native runs complete220 observations and real sixteen-second
focus absence/return. Web uses newly identified actual-window minimization;
historical failed v5 runs remain failed. Six separate independent project/Page
activations preserve complete content, current versions, full source collections,
ten destinations and Git connection. The frozen ordinary collector is unchanged.
The retained application audit identifies no confirmed blocker. Existing v8
write/focus/merge/departure proof is reused because no write contract changes.

Actual retained control remains `f5abefe201` / `aByBbQwsVOkTw0_Zh99sx`; rejected
removal is `706f34a84` / `hcJuyHv9zWg6xw4WO7oia`. Both whole products are retained.
The evidence index is generated once after measurements. Check the targeted
report for final checks/publication; earlier green CI cannot certify a later head.
MIN-683 remains in progress, with 100/300ms, all-tab preparation and broader
acceptance still open. No merge, deploy or production migration is authorized.

## Latest bounded CI and admission pass

Read [the bounded pass outcome](min-683-bounded-pass.md) first. It resumes the
same branch/draft PR420 from `db15c6f8a`. The two React Query mock imports and
two autosave assertions are repaired without changing save behavior. Five
scanner matches are independently verified SQL-definition fingerprints; only
their exact values/path are excepted, with changed-value/wrong-path regressions.
Three additional CodeQL diagnostic-tooling alerts receive bounded identifier
and fixed-point normalization corrections; verify remote CI for the published
head rather than equating local tests with remote success.
On `e98ad7b11` both unit shards and CodeQL pass, but encrypted-access validation
rejects the shared invitation reader's missing exact-path registration. The local
log was initially misread. The narrow registration/decoder-projection guard fix
passes four negative guard cases and 27 complete-reader cases; verify the next
published head. No query/RLS/DTO changes are made.

One anchored first-Page admission candidate is measured and rejected. Control
`f5abefe20` / `aByBbQwsVOkTw0_Zh99sx` and candidate `df0df1acc` /
`42GBfxy2f9Sdm3r17tRLT` share current complete source, environment, collector
and workload hashes. Primary Page changes 472.9→300.5ms web /387.0→333.7ms
native, but first project changes 552.7→788.2ms /592.2→700.4ms. There is no
accepted scheduling improvement or causal attribution of every difference.
Signed rejection `9a51543cb` restores original order and the actual control
build. Both whole products remain retained under ignored build directories.

Four three-target independent runs pass exact content/version/complete-source/
ten-tab/Git preservation. The first native attempt remains a failed Electron
resolution attempt, diagnosed before a corrected `NODE_PATH=./desktop/node_modules`
launch. Their new matched reader-dependency hash is `0a0e66d6…`; earlier v5
hashes/focus-window failures remain historical. The index is generated once
after measurements. Existing v8 write proofs are reused, with no content write,
reseed, version reset, account permission or Git connection change in this pass.

The [bootstrap design](min-683-bootstrap-resume.md) remains uninstalled: plain
JSON and the existing buffered transport delay small results. Implement a
bounded independent-frame/account/cancellation/invalidation/read-start contract
before sharing authorization/transport; retain full ordinary readers and no TTL
cache. The issue stays in progress, including all-tab preparation, common latency,
native Home/draft recovery/daily feel and the inaccessible real PR420 incident.
Publish only through `npm run work:pr`, preserving existing title/body/draft and
matching DCO. No merge/deploy/production migration or `work:done` is authorized.

## Previous cold-data checkpoint

The dedicated cold-preparation/data-access session resumes on the same branch
from `46b747efb` with three distinct subagents and root-only UI ownership. Read
the [current session outcome](min-683-cold-session.md),
[database attribution](min-683-db-attribution.md),
[server/cache decision](min-683-server-attribution.md) and
[preview diagnosis limits](min-683-preview-sync.md) before the historical
checkpoint below. SQL/RLS/count/JSON and actual session/MFA measurements are
separate from transport/decryption/admission/rendering. No new index, TTL or
cross-request DTO cache is installed. MIN-683 remains in progress. No merge,
deployment, production migration or `work:done` is authorized.

## Repository and actual product

- Repository: `/Users/clementguerin/Projets/minddy-ticketing/minddy`.
- Existing branch: `codex/min-683-instant-navigation`; draft PR420.
- Minddy project: `07b14964-0def-4941-8ddf-686572d6345d`.
- Latest compiled application: `f5abefe201960ced3435eb3046d640602984f68e`,
  build `aByBbQwsVOkTw0_Zh99sx`: accepted-draft label and request-local
  readiness quota fixes on the retained navigation source.
  `.next/min683-product.json` records its actual source and unchanged four
  environment-file hashes. Later tooling/evidence commits do not relabel it.
  The historical latency/preparation control remains `3692e754` /
  `Qp1Rr4apU_XHLQh2IVfT6`, and the isolated badge control is `4d3b457b` /
  `m-eaUKb4_v56rZ4kOr4Po`.
- Compiled controls are retained under ignored
  `output/playwright/performance/min683-built-products/<build-id>/.next`:
  `Liw1Se4ZRwp__V1fmrDJD`, `MBwOTC-9Laqpi-vCTq3u1`,
  `E3ZnePxMEhwQ2_V-VuFUO`, `SuSa35kVIhHyV5Nor8RG2`,
  `Qp1Rr4apU_XHLQh2IVfT6` and `m-eaUKb4_v56rZ4kOr4Po`.
  Stop the server before swapping whole directories. Never label a binary with
  current HEAD merely because the runner advances.
- Every created commit has an author-matching DCO sign-off. Continue English
  Conventional Commits and use `npm run work:pr` for publication. Do not replace
  the existing PR title/body without an explicit request.

## Retained changes and rejected experiments

1. Complete ordinary project issue/member/objective/Page-tree readers and shared
   live-session/MFA authorization are retained. These preserve RLS, permissions,
   protected decoding, complete pagination and ordinary failure contracts.
2. Both restored-Page RSC bootstrap controls are rejected and removed. Their
   signed source, failures and measurements remain. The ten-record version
   improves Pages but worsens startup/first board; the two-body version does not
   establish the required preparation. Initial subscription catch-up invalidates
   those early records. Do not skip that catch-up or freshen timestamps.
3. Task51 startup-priority reservation is provisional: its exact account/session/
   QueryClient lifecycle is tested, but ordinary runtime costs are mixed. It is
   not a validated all-tab performance win.
4. Task53 All enrichment overlap is rejected and removed at `4231b2ff1`.
   Explicitly admitted default-off fixed server timing remains, with the
   original read order. The admitted trace explains the serialized tail, but
   ordinary first-destination regressions do not justify retaining the overlap.
5. Task54 consumer-only Feedback correction is retained at `90ad0a49e` /
   `SuSa35kVIhHyV5Nor8RG2`. It reuses the exact healthy normal query only when
   that query already contains the requested scoped post matching the actual
   controls. No96-row subset is stored under the full120-row key. Cold/resolved/
   invalidated/denied/out-of-scope targets keep the full reader. The wider
   cache-dependent preparator adaptation is deliberately not installed: its
   dependency index would need both candidate keys and further ordering proof.
   Existing explicit-link full-scope background work remains.
6. Task56 exact selected-read handoff is present at `3692e7549`, provisionally
   retained pending the remaining runtime matrix. Five meaningful red failures
   include an actual mounted AccountTabSync/session/worker case; eight new cases,
   160 existing lifecycle/preparation cases and eight Page authority cases pass.
   Full types/lint/English/documentation/knowledge checks pass. A visit installs
   exact active query hashes before navigation; later foreground work cannot
   cancel that selected read merely because its observer has not committed.
   Other reads yield; hidden/offline/disposed ownership and explicit invalidation
   remain cancellable. No new freshness, receipt or write authority is granted.
   Preactivation hover remains a separate possible cancellation path.

Retain earlier bounded whole-query persistence, Task47 latest-selection writer
and Task48 newer-Page ACK/rollback correction. The corrected Task47 held-seal/rapid-real-reload and settled-control diagnostics
pass on web and native with the same actual PR/full useful content and exact
source/version/ten-tab/Git bookends. Earlier collector failures remain retained;
no hard-unload delivery guarantee or general latency acceptance is established.

## Current measurements and their limits

The immutable one-cycle/55-observation control is `7ba0e3181` /
`MBwOTC-9Laqpi-vCTq3u1`, with labels
`min683-restored-before-scaled-all-overlap-{web,native}-1`.

The matched consumer-only Feedback pair uses
`min683-restored-after-scaled-feedback-scope-{web,native}-1`.
First warm Feedback improves1001.1→59.4ms web and937.7→69.6ms native;
loading frames113/105→0/0, with the same96 visible unresolved identities and
complete selected content/edit/reply controls. These are single first-warm
observations, not per-destination p95. Cold Feedback remains988/1236ms versus
1028/976ms in the control; several unvisited details remain above300ms. Existing
background full-list work still occurs. Web renderer launch/refresh are2453/
2048ms and native2327/2150ms; these are renderer clocks, not executable startup.

The final handoff web run is
`min683-restored-after-scaled-foreground-handoff-web-2`:55 observations complete,
no recorded errors, actual observed16s absence/return and complete fixture/Page-
version/ten-tab/Git preservation. Renderer launch/refresh2720/2371ms; first
project604ms, Pages364/469ms, PR3136ms, Routines671ms, Triage311ms, Feedback923ms,
objectives242ms. At the prior stop there was no matching native handoff run.
The resumed `min683-restored-after-scaled-foreground-handoff-native-1` now
completes 55 observations with the same v5 hash and full preservation; the
results index checks its exact pair. Renderer launch/refresh are 2,778/2,153 ms;
first project is 737 ms, Pages 389/461 ms, PR 3,143 ms and Feedback 1,025 ms.
These first destinations remain slow. No general
performance win is claimed. The first web attempt is retained as failed before
renderer creation: Git diff capture exceeded its process buffer while evidence
was uncommitted. Evidence was committed and the same frozen runner/build
relaunched with a new label; no ordinary runner change hid the failure.

The frozen eight-file v5 ordinary hash is
`cb58539afa5d8d11547a6105c6279f75a52110387534b3d443722b3271a89d07`.
Historical v4 hash95100e55… remains historical. New independent/excluded
collectors must not silently change or enter ordinary pairs.

The old failed web foreign-Page activation remains preserved and unexplained.
Three excluded full-sequence input diagnostics distinguish delivery, session
activation, route and complete content. Corrected v5 observations prove real
focus loss on both clients. They do not identify the old failure’s root cause
or explain that historical delivery failure. The resumed v8 verifier separately
passes actual75s absence and remote-mutation/write safety on both clients.

Independent first-access v2 probes use a fresh context/profile for each target,
with trusted input near refresh age3s and no earlier activation/hover. On30ee/
Liw1, project/primary/foreign reach full content in734/431/419ms web and622/421/
394ms native. These instrumented results are excluded from ordinary aggregates.
Those historical probes cover only three inactive destinations. The resumed
Qp1R all-nine diagnostic covers nine web and eight independently unvisited native
targets at3s; nativeHome retains natural-entry provenance and is not certified.
Native Home
may be a natural initial entry; prove its prior-activation status before claiming
an independent Home first click.

## Database attribution decision and remaining cold-admission work

The resumed reports now supply actual authenticated executor/JSON-wrapper and
live PostgreSQL session/MFA timings, complete PostgREST payload/transport and
request-local server phases. No new index/count removal or shared DTO cache is
justified. The historical clues below retain their original attribution limits;
use the current report before proposing the next exact project bootstrap.

- The real All endpoint returns1,206 complete issues/1,086 cards. Its two issue
  batches take roughly0.95–1.20s before overlap, with around29–31ms protected
  decoding. Aggregate `issues_db` timings are not a query plan and may include
  driver/transport work. Attribute exact SQL/PostgREST, RLS, joins, counts,
  projection size, pagination and transfer separately before proposing an index.
- `loadGlobalBoardIssues` uses UUID keyset pagination, exact remaining count on
  each batch, ordinary protected projection and final position/number sorting.
  Completeness also supports a database row cap below1000; retain those tests.
- Authorized projects finish around180–309ms from server admission, but members
  used to begin only after all issue/category/objective/relation reads. Their
  measured124–206ms tail justified a trial, not its retention. The rejected
  source/build and all four before/after admitted traces remain available.
- Global and project issue reads duplicate much data, but project issues add
  resource counts. Project members add permissions/invitations absent from the
  global array. Never promote aggregate slices into exact scoped keys without
  DTO, living/trashed/empty project, RLS, counts, optimistic overlay, accepted
  read-start and invalidation/owner parity. Categories/objectives also need their
  actual ordering and completeness contracts. No reuse implementation exists.
- Both Page bodies and trees are missing at fixed3s. No new static bundle starts
  at the measured first Page clicks: PageEditor/Tiptap are statically imported.
  Body/tree requests start at the click and finish shortly before full paint.
  A second editor-bundle preload does not address this measured wait.
- The two-slot finite owner drains seven project prerequisites before either
  Page. The separate renewal worker cannot acquire an unknown body. Initial
  PR-list transport can gate scoped work until around2.52–2.73s, leaving too
  little time for two body/tree waves. Request timestamps alone do not identify
  the precise scheduler unlock.
- Default Next Link viewport prefetch bypasses session.prefetch admission.
  Project RSC metadata can perform cookie/RLS name reads and decoding. Aborted
  RSC requests do not quantify wasted server work, prove every layout rerenders,
  or imply client effects/Git queries ran. A startup deferral is only a proposal;
  preserve real intent and measure any cold/unlisted route cost transfer.

Assign distinct subagents to database/read-path attribution, data-sharing/
bootstrap parity and renderer/preparation/sync attribution. Root owns the sole
UI benchmark. Agree on file ownership; no test/build/fixture job may overlap a
timed UI run. First record a measured diagnosis and bounded strategy in the plan.
Use actual authenticated/RLS query context for database evidence; service-role
plans do not establish user-path cost or permissions. Read-only query plans need
bounded execution, timeouts and no mutating functions. Do not apply production
schema/index migrations or deploy; keep any justified migration reviewable in PR.

Investigate server-side initial-load caching explicitly. Specify the account,
project and access scope, row/version identity, read-start ordering and cache
invalidation for remote changes, optimistic writes, revocation and multiple
server instances. Separate accepted display data from live authorization and
fresh write basis. Background reconciliation must deliver current data without
silently extending a trust timeout or claiming cached authority is fresh.

## Reported preview merge-state incident

The clarified incident is actual MinddyPR420. `preview.mindi.app` does not
resolve; verified `preview.minddy.app` maps to main `d5c2d862` /
`dpl_F4h9ikqqXWanM97Zhdthi8hMEsx6`, not this PR's local binary. Runtime DB origin
matches the read-only verified migration catalog. Performance Tester receives
404 on candidate detail `27f9154b-226f-437e-b2ba-fd7da35848e3`; no alternate
principal/session/membership is used. Historical403 lacks error bodies and
Retry-After, so quota, exact server failure and polling cause remain unconfirmed.
Public GitHub mergeable/draft/blocked does not prove installation quota.

Separate fixture proof corrects the loaded-draft checking label without granting
readiness/write authority, and behavioral red/green preserves actual quota pause
through batches/actor reads/account retries. Both fixes are local/PR changes;
no preview or production deployment occurs. Successful fixture journeys do not
resolve the inaccessible actual incident. Preserve the main connection/account,
inspect exact failed RPC/error and polling when accessible in the authorized
scope, respect Retry-After and never promote unknown into success.

Ignored, unexecuted proposals are available locally under
`output/playwright/performance/page-prefix-source`,
`foreground-handoff-source` and `route-prefetch-admission-source`.
The Page prefix and route-prefetch proposals are not installed, tested or measured.
Rebase every copy against actual source, especially the now-changed finite owner;
do not blindly copy a whole older file over retained changes.

## Immutable fixture and remaining checks

Only `captures-demo+min540@minddy.app`, user
`86df71f9-44a7-4cc1-8085-5baa6c744490`, marker
`min-540-performance-v1` may be changed. Verify identity before every mutation.
Ten stable tabs;120 triage,120 private/internal feedback (96 unresolved/24
resolved),30 active objectives with15 linked tasks each, and1440 comments across
720 entities. Complete global/project issue counts1206/670, kanban1086/550.
Preserve original660 issues/120 Pages, five real fixture PRs, existing data,
the main user’s tabs and primary GitHub connection. Respect actual Retry-After.
Frozen scaled journal SHA256:
`431c744f478b39c6824cadc49a8f9f3b3422a7234777b1f489d42b5cc7be48c7`.
Never reseed or replay `--apply` over it. Only the four already-normalized
benchmark documents0-10/0-11/1-0/1-1 are safe for UI editing; do not visit legacy
1-2/1-3 or0-0 through the editor and trigger automatic normalization writes.

The corrected held-seal rapid reload passes web/native, with same actual PR and
full content; failed premises/guards/cleanup cases remain retained. The excluded
v8 verifier now passes actual75s focus absence, remote Page/issue visibility,
immediate cached typing while an actual scoped GET is held, nonoverlapping
merge, versioned departure wait and server persistence on both clients. Both
private journals are clean and full original content is restored. Current
primary0-10 version/content_revision is16; focus1-1 is12; untouched foreign1-0
remains2. Other Pages and unrelated issue/Page metadata, ten tabs and Git are
preserved. Timestamp/version advancement is legitimate, so do not pool these
later cohorts with the prior frozen read-only results. Never publish journals
or original full documents.

The ordinary v5 runner remains frozen. Both quota web attempts and badge-only
web control fail after45 complete observations because Chromium creates the
focus distraction in another window; retain them as failures, not eligible
successful paired/focus comparisons. Native original/badge/quota runs each
complete55 observations and16s actual absence, but common first details remain
above300ms. The separate excluded minimization proof does not relabel the web
ordinary failures. NativeHome independence, wider primary/deep/forge runtime
matrix, forced-quit draft recovery and daily feel remain open. Routines still
cover only their empty fixture state; no paid/generated work is authorized.

The majority-below100ms/no-common-above300ms, all-listed-before-first-activation
and daily-feel criteria remain unmet. Keep MIN-683 in progress. The next session
should use the measured SQL/authorization/transport/admission split and cache
coherence contract to evaluate one exact project bootstrap. Preserve early small
results and fresh write bases, and reject any moved first-click cost. Publish measured results, rejected variants and limits
with matching-author DCO through `npm run work:pr`; never merge or deploy.
