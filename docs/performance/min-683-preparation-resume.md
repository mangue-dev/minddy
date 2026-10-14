# MIN-683: bounded preparation and preview audit

This October 14, 2026 resume audit reuses the current checkpoint, cold-session
report, MIN-683 and its plan, the relevant MIN-614 measured-read/render findings,
and the architecture report's finite-working-set and bootstrap contract. It
introduces no new UI, SQL or forge measurement. Root owns CI, integration and
all timed UI work. The sole file owned by the preparation subagent is this
report. MIN-683 remains in progress.

## Existing measured reason to consider a project bootstrap

The [cold-session report](min-683-cold-session.md) retains independent first
activations at actual refresh age approximately three seconds. Complete project
content takes 594 ms web / 673 ms native; primary Page 440 / 466 ms and foreign
Page 420 / 411 ms. These single observations are neither percentiles nor a
current-session control. The queries needed for listed project/Page/secondary
destinations are incomplete at three seconds even when All is usable. The
ordinary latest healthy native run still records first project 449 ms, primary
Page 361 ms and foreign Page 394 ms; these also remain individual observations.

The [architectural admission diagnosis](min-683-architecture-refresh.md#remaining-page-admission-barrier)
records the initial PR list finishing around refresh age 2,522–2,732 ms, while
the first scoped category reads start around 2,592–2,734 ms. Request boundaries
do not identify the exact scheduler unlock. The two normal slots then have only
266–408 ms left before the independent-click deadline. Reducing transport and
repeated live authorization for complete project prerequisites is therefore a
bounded candidate; changing Page editor imports or increasing a TTL is not an
answer to this observed missing-read path.

## Current source ownership and integration limits

Source review confirms these contracts rather than inferring success from code:

- `lib/pr-tab-preparation.ts` owns at most ten displayed destinations, two
  normal slots and serialized forge detail. Its `otherTransport` gate admits
  only established successful shell maintenance, cached app-tab reconciliation,
  its own unobserved reads and exact inactive recent-PR activity. A cold PR list
  remains foreground work and may block refills.
- `lib/use-prefetch-project.ts` lists seven complete ordinary board keys in
  order: issues, categories, members, objectives, issue relations, integrations
  and views. `appTabPreparationQueries` in
  `lib/prefetch-tab-destination.ts` uses those exact keys; triage/objective/
  feedback selected-detail prerequisites are discovered only after their
  ordinary successful scoped list, with unsettled insert guards preserved.
- The finite owner scans displayed destinations and their keys in order. A
  listed project can occupy both slots before the next Page body/tree. Those
  bodies do not require the project's issue collection first. The separate Page
  renewal owner deliberately cannot fetch an unknown body.
- `AccountTabSync` hands off startup admission through the canonical session
  visit. Selected exact query hashes preserve an unobserved in-flight operation
  until its observer commits; other unobserved work yields. A canceled slot
  stays occupied until settlement. Hidden/offline/disposed ownership still
  cancels. A project bundle must not bypass this account-owned lifecycle.

The proposed first increment is limited to one project's complete ordinary
readers under shared request-local live authorization. Install results through
the same query functions and overlays with a captured client request-start
boundary. Do not copy global-board rows under project keys: project issues need
their resource counts and members need permissions and owner-only invitations.
Account/project identity, QueryClient retirement, cancellation, initial realtime
catch-up, exact invalidation and ordinary errors remain mandatory.

Small useful complete collections must become available independently of the
large issue collection. An atomic bundle that waits for all issues can move the
delay into objectives, permissions or Page preparation; reject that design or
keep those small readers on their ordinary path. A server-only unconsumed route
does not count as delivered performance. Adding Page write receipts, expanding
forge admission, reordering all destinations or creating cross-request cache
epochs is outside this first bounded increment.

### Smaller fallback if bootstrap ingestion exceeds the pass

An alternative experiment changes only the scan order in
`lib/pr-tab-preparation.ts` and its existing real-QueryClient test file. Keep
the canonical listed destinations, manifests and selected dependency indexes
unchanged. Construct an execution-only prefix from the exact body/tree options
of an already listed explicit Page, then scan the ordinary entries afterward.
The existing pending and in-flight query identities deduplicate those entries;
no new transport owner, receipt, cache, TTL or concurrency is introduced.

Prefer retaining the first normal project's issue read as an initial anchor,
so that one long complete issue read can overlap an explicit Page body/tree
instead of waiting behind all Page reads. A full two-Page four-read prefix has
a greater risk of delaying the first project. General round-robin scheduling
would alter every secondary destination's fairness and is a broader experiment.
Either variant still leaves Page issues/members/objectives as complete useful
content prerequisites; early body availability alone is insufficient evidence.

Meaningful focused cases hold the issue transport while asserting the exact
listed Page read starts, prove body/tree deduplication and at-most-two real
in-flight operations, preserve foreground joins/selected-read handoff and
settlement before slot reuse, and retain denial/no-retry behavior. The existing
full working-set test must continue asserting every original endpoint rather
than replacing completeness with an ordering-only assertion. Existing
`pr-tab-foreground-handoff.test.ts` and mounted
`app-tabs-foreground-handoff.test.ts` cover the critical activation lifecycle.
The root must record the selected bounded strategy before changing source and
reject it if independent first-project or initial usability pays a regression.

Root subsequently records this smaller candidate in plan task 66 after the
local CI gate passes. The candidate adds only an execution view in
`createPrTabPreparation`: the first listed board's exact complete issue read,
the first listed explicit Page's exact body/tree, then the original listed
order and optional neighbor. Canonical manifests, selected-detail indexes,
readers, receipts, two-slot limit and forge gates remain unchanged. If no listed
board is present, the Page prefix has no synthetic issue anchor.

Three new behavioral regressions first fail against the unchanged scheduler:
the second slot admits categories rather than the explicit Page; the Page tree
is behind the project list; the hidden/cancellation case starts the same wrong
second read. They pass with the candidate. The existing complete nine-endpoint
assertion retains exact DTO readers and maximum concurrency while reflecting
the intended issue/body/tree prefix. The focused run passes 63 cases across
`pr-tab-preparation.test.ts`, `pr-tab-foreground-handoff.test.ts` and the mounted
`app-tabs-foreground-handoff.test.ts`. No runtime improvement follows from these
tests; root must compare the identified controls before accepting the candidate.

The [root comparison](min-683-bounded-pass.md) subsequently rejects this
candidate: the primary Page improves, but first project observations worsen
on both clients and no general non-regression acceptance follows. Commit
`9a51543cb` restores the original source/test order. The 63-case red/green
evidence belongs to the explicitly rejected candidate, not retained code.

## Minimum root measurement before expanding scope

Identify an actual compiled control and candidate against the same current
fixture state and environment, after CI corrections and before any test write.
Verify Performance Tester identity through the ordinary authenticated account
read; preserve ten tabs, 120 triage, 120 feedback and 30 objectives of 15 tasks.
Read current Page versions; do not reuse the prior report's version numbers.

First measure initial All usability and refresh, independent first project,
primary/foreign Page and objectives clicks. Each first destination needs its own
fresh context/profile and no prior activation or hover. Record complete content,
loading frames, request starts/counts/bytes and phase-scoped thread work; separate
manifest metadata from actual useful paint and fresh write authority. Expand to
secondary navigation only if those results justify retaining the increment.

Keep the frozen ordinary v5 focus failures failed. Any corrected short collector
needs a named protocol and matched control; its outcomes do not retroactively
repair historical runs. Reuse the existing validated v8 write verifier only if
the new change touches Page write/read authority, versions, merge or departure,
or a new regression requires it. The existing long-absence web/native proof need
not be repeated for an unchanged independent project reader contract. No agent
test, build, API probe or benchmark may overlap root's timed UI observations.

## PR420 incident: authorized evidence and exact missing trace

The [preview investigation](min-683-preview-sync.md) identifies the historical
main preview source as `d5c2d862`, not the MIN-683 compiled product. The reported
literal `preview.mindi.app` failed DNS resolution; the verified
`preview.minddy.app` alias is a distinct recorded candidate. Do not relabel those
historical deployment findings as the current PR build.

The ordinary detail for stored PR420 returned HTTP404 to Performance Tester.
This is its expected access boundary for the user's personal project. Existing
HTTP200/403 request metadata lacks structured response error codes and
Retry-After, so it cannot establish an installation quota, missing migration or
the indefinite-checking incident's complete cause. A CLI GitHub draft/blocked/
mergeable state also does not report the application's installation allowance.

The exact missing evidence is an already authorized affected-principal detail
response for PR420 with status, typed error/code and Retry-After/rate-limit
headers, correlated by request ID and time with the server's structured
authorization/database/forge failure. Reuse such existing traces if available;
do not obtain a primary session, change memberships or the GitHub connection,
export protected content or retry based on old HTTP403 logs. Preserve quota as
unknown and respect any observed Retry-After.

Accepted-draft readiness propagation and request-local quota draining are
already independently corrected and documented. Repeating Tester HTTP404 or
healthy fixture draft reads provides no further evidence about the inaccessible
PR420 incident and should not consume this pass's measurement budget.

## Documentation impact and checks

This audit adds internal investigation guidance only. It changes no public
control, reader procedure, configuration or release version; public article/
workflow/figure translations need no edit. Root runs the applicable documentation,
knowledge, owned-English and diff checks after integration. No new evidence
index is generated by this subagent; root generates it once after final measures.
