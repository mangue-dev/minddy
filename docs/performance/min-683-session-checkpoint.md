# MIN-683: session checkpoint, 2026-10-14

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
- Latest compiled application: `3692e7549060f8b682ec99865757a65c5e92a4e2`,
  build `Qp1Rr4apU_XHLQh2IVfT6`. `.next/min683-product.json` records its
  actual source and four environment-file hashes. Later documentation/evidence
  commits do not change this compiled application.
- Compiled controls are retained under ignored
  `output/playwright/performance/min683-built-products/<build-id>/.next`:
  `Liw1Se4ZRwp__V1fmrDJD`, `MBwOTC-9Laqpi-vCTq3u1`,
  `E3ZnePxMEhwQ2_V-VuFUO` and `SuSa35kVIhHyV5Nor8RG2`.
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
and Task48 newer-Page ACK/rollback correction. Task47 real rapid-refresh safety
is still pending; no hard-unload delivery guarantee is established.

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
or replace the pending remote-mutation/long-absence verification.

Independent first-access v2 probes use a fresh context/profile for each target,
with trusted input near refresh age3s and no earlier activation/hover. On30ee/
Liw1, project/primary/foreign reach full content in734/431/419ms web and622/421/
394ms native. These instrumented results are excluded from ordinary aggregates.
Only those three inactive destinations are covered, not all nine. Native Home
may be a natural initial entry; prove its prior-activation status before claiming
an independent Home first click.

## Database and cold-admission evidence to investigate next

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

The user reports that the preview PR page remains indefinitely at merge-state
verification and does not load its data. This incident has not been reproduced
or diagnosed. A pending migration, server error, GitHub pending computation,
polling/synchronization failure or403/429 quota response remain hypotheses.
Successful local fixture PR journeys do not establish preview correctness.

Identify the exact preview/build, inspect its actual response status/body shape
and server logs without exposing credentials, and compare deployed migration
state read-only. Trace the mergeability/sync state to completion, including
errors, retry scheduling and GitHub Retry-After. Preserve the main GitHub
connection/account; do not automatically apply a migration, bypass a limit or
promote an unknown merge state into a successful ready state.

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

No live mutating verifier ran in this resumed session; selected Page versions
remain2 in the last preservation checks. Final broad primary/deep/forge pairs,
all-nine independent first access, real rapid-refresh checks on both clients,
long native absence, and actual75s remote Page/issue mutation plus immediate
optimistic typing/merge/departure-save verification remain pending. Run all
read-only comparisons before the journaled mutating verifier; its restoration
preserves content but legitimately advances versions/timestamps. Do not pool
those later cohorts with pre-mutation results. Never publish private restoration
journals or full original documents. Routines are tested only in their empty
state; no paid/generated work is authorized by the fixture setup.

The majority-below100ms/no-common-above300ms, all-listed-before-first-activation
and daily-feel criteria remain unmet. Keep MIN-683 in progress. The next session
should start with database/data-access attribution rather than another blind
client scheduling tweak. Publish measured results, rejected variants and limits
with matching-author DCO through `npm run work:pr`; never merge or deploy.
