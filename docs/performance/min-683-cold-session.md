# MIN-683: cold-data session, 2026-10-14

The subsequent [bounded CI/admission pass](min-683-bounded-pass.md) repairs the
published CI failures, records the bootstrap transport boundary and rejects one
matched scheduling candidate. The measurements and versions below belong to
this earlier session; they are not relabeled or pooled with that later cohort.

This session reuses `codex/min-683-instant-navigation` and draft PR420 from
`46b747efb`. The worktree was clean after refreshing origin. Three agents own
database attribution, server/cache contracts and preview/preparation diagnosis;
root owns every UI run. No test, build or competing application probe runs
during a timed UI window. No merge, deployment or production migration occurs.
MIN-683 remains in progress.

## Identified application and cohort

The original latency and attribution observations use the retained application source
`3692e7549060f8b682ec99865757a65c5e92a4e2`, build
`Qp1Rr4apU_XHLQh2IVfT6`, with the checkpoint's four environment-file hashes.
New documentation and tooling commits do not relabel this binary. The ordinary
eight-file v5 dependency hash stays
`cb58539afa5d8d11547a6105c6279f75a52110387534b3d443722b3271a89d07`.

Only Performance Tester, `captures-demo+min540@minddy.app`, user
`86df71f9-44a7-4cc1-8085-5baa6c744490`, marker
`min-540-performance-v1`, is authenticated. The scaled journal stays frozen:
ten stable tabs, 120 triage, 120 Feedback, 30 objectives with 15 tasks each,
1,440 comments, 1,206 global issues and 670 primary-project issues. No reseeding
or primary-account session/connection change is performed. Bookend comparisons
verify actual complete source content rather than counts alone.

## Database, authorization, transport and server decision

Read the [DB report and bounded plan evidence](min-683-db-attribution.md),
[server report](min-683-server-attribution.md) and their reviewed JSON exports.
The probes use authenticated RLS, a read-only transaction, a five-second SQL
timeout, a 500 ms lock timeout and rollback. Actual deployed helper definitions
are audited before execution. Administrative round trips are separate from
SQL executor clocks; live JWT authorization is exercised by ordinary reads.

| Identified isolated observation | Result | Attribution boundary |
| --- | ---: | --- |
| Global/project exact count | 1.781 / 1.220 ms | Warm authenticated SQL |
| Global/project full projection and category links | 12.736 / 13.014 ms | Excludes outer PostgREST JSON wrapper |
| Actual global first-page JSON/count wrapper | 62.069 ms execution, 5.812 ms planning | Includes SQL JSON generation; excludes gateway and pre-request authorization |
| Actual PostgreSQL live session/MFA pre-request hook | 14.370 ms execution, 0.053 ms planning | Actual fixture JWT claims, audited read-only transitives; excludes gateway JWT validation and Next auth |
| Complete 1,206-issue PostgREST source | 3,428,471 bytes; 552–768 ms | Two sequential requests, two isolated repetitions |
| Complete 670-issue PostgREST source | 1,700,890 bytes; 284–589 ms | One request, two isolated repetitions |
| Current-build admitted All server response | 2,514.7 ms | One excluded API observation |
| Same response: issue PostgREST / decode / live auth / JSON | 2,037.7 / 37.9 / 64.1 / 18.4 ms | Request-local phases; parallel phases cannot be summed |
| Decoded All / scoped issue HTTP response | 2,441,996 / 1,197,717 bytes | Uncompressed decoded bytes, not wire bytes |

These independent experiments cannot be subtracted to produce missing causal
phase timings. The executor has warm buffers; the local machine and Vercel use
different transport paths. Current evidence does not justify a new index,
removing exact counts, caching decryption output or expanding a freshness TTL.
The existing RLS batching migration is already deployed. Full cursor
exhaustion, cap-lowered completeness and late failure contracts remain intact.

All and project DTOs are not interchangeable: project issues add actual
resource counts, and project members add permissions/owner-only invitations.
There is no aggregate-to-scoped key promotion. The next bounded server
candidate is an exact project bootstrap through unchanged complete readers
and one live authorization boundary, with measured duplicate transport and
admission evidence first. It must preserve per-query read-start and errors,
initial realtime catch-up, the two-slot transport owner, optimistic overlays,
Page versions, fresh write receipts, drafts, merge and departure saves. A
bundle cannot hold small useful results behind a slow large collection.

Server initial-load caching is explicitly investigated and rejected as an
unversioned shortcut. The server report defines canonical account/project/
permission keys, transactionally advanced data/access epochs, snapshot fences,
remote-write invalidation, live revocation checks and cross-instance validation.
Pub/sub accelerates eviction but cannot replace durable epoch checks after
missed events or restarts. Canonical cached display data never supplies fresh
write authority, and optimistic layers stay outside the shared canonical
cache. No cross-request protected DTO cache is implemented this session.

## Missing native selected-read comparison

`min683-restored-after-scaled-foreground-handoff-native-1` completes all 55
ordinary v5 observations without recorded errors, with genuine 16,007 ms
absence, unchanged complete source/Page versions, ten tabs and Git connection.
Its exact pair is the existing consumer-only Feedback source
`90ad0a49e` / `SuSa35kVIhHyV5Nor8RG2`. The results index verifies identical
protocol, runner, cohort, runtime, viewport and environment hashes.

| Single native observation, ms | Feedback control | Selected-read handoff |
| --- | ---: | ---: |
| Authenticated renderer launch | 2,327 | 2,778 |
| Complete board refresh | 2,150 | 2,153 |
| First project | 456 | 737 |
| First primary / foreign Page | 310 / 451 | 389 / 461 |
| First complete PR | 2,616 | 3,143 |
| First Routines | 619 | 795 |
| First Triage / Feedback / Objectives | 272 / 1,236 / 167 | 308 / 1,025 / 290 |

This fills the missing client observation, not a performance acceptance gate.
One observation per first destination cannot attribute every difference or
establish a percentile. The handoff remains provisional; its independent
selected-read correctness regressions do not establish a general speedup.
Neither renderer launch nor refresh is native executable startup.

## Independent first activation at three seconds

The excluded `min683-restored-after-scaled-independent-all-nine-{web,native}-1`
records each complete nine separately isolated contexts/profiles, with no
preceding target click or hover. Trusted clicks occur at actual refresh ages
3,018–3,067 ms web and 3,030–3,049 ms native; each literal deadline and actual
input target is retained. Both runs preserve the entire issue/secondary cohort,
Page bodies/versions, ten stable destinations and Git connection, without an
observed rate limit. Their ordinary dependency hash and scaled source
fingerprint match. These passive probes are separate from ordinary v5 pairs.

| Target, one observation per runtime | Web paint / loading frames | Native paint / loading frames |
| --- | ---: | ---: |
| Project | 594 ms / 0 | 673 ms / 0 |
| Primary Page | 440 ms / 43 | 466 ms / 45 |
| Foreign Page | 420 ms / 40 | 411 ms / 38 |
| Home | 74 ms / 0 | 66 ms / 0 |
| Complete PR | 3,202 ms / 0 | 2,702 ms / 0 |
| Routines | 754 ms / 85 | 647 ms / 72 |
| Triage | 848 ms / 62 | 1,018 ms / 81 |
| Feedback | 1,073 ms / 116 | 1,086 ms / 118 |
| Objectives | 487 ms / 30 | 643 ms / 28 |

Zero observed loading frames do not certify a usable sub-100 ms interface:
project and PR still require their complete content gate. No per-destination
p95 or causal before/after conclusion follows from these single observations.
Routines only cover its empty fixture state.

Native Home is explicitly **not certified as an independent first opening**:
the real desktop entry is `/home`, and the collector's Home-case transport
records contain earlier `/home` responses. Absence of a preceding driver click
does not prove absence of a natural initial activation. Its 66 ms observation
is retained with that provenance limit, rather than claiming all nine native
destinations were unvisited. The other eight native targets and all nine web
targets use isolated All launch/refresh preludes. A natural native Home-entry
readiness experiment is separate acceptance work.

All complete paint opportunities before the target click occur at
2,056–2,605 ms web and 2,080–2,273 ms native. The three-second query metadata
usually finds only All and Home healthy; the complete listed project/Page/PR
and secondary manifests remain incomplete. This metadata is not itself the
full-content gate or a fresh write receipt.

Main-thread task deltas span passive setup through readiness, including driver
and background work. They are 194/242 ms for primary Page, 258/228 ms for
foreign Page and 949/849 ms for PR (web/native). They cannot be added to or
subtracted from paint or transport clocks. Exact request starts/statuses and
all thread metrics remain in the audited raw archives. The diagnosis therefore
keeps admission, transport and renderer work distinct; a scheduler prefix alone
cannot promise readiness when the required reads are admitted too late.

## Preview incident

The [preview investigation](min-683-preview-sync.md) identifies
`preview.minddy.app` as deployment
`dpl_F4h9ikqqXWanM97Zhdthi8hMEsx6`, source `main` / `d5c2d862`, created
October 12. It is not the MIN-683 binary. The literal reported
`preview.mindi.app` does not resolve. The clarified affected PR is Minddy420,
stored candidate `27f9154b-226f-437e-b2ba-fd7da35848e3`.

Performance Tester receives 404 on that ordinary detail route. Investigation
stops at its access boundary; no principal session, new membership or alternate
credential is used. Historical 403 logs lack error codes and Retry-After,
so GitHub quota remains unconfirmed. Public GitHub reports mergeable, draft
and blocked, which does not establish the application's installation quota.
The same preview returns a 22-second fixture list, successful 2.6–4.3-second
fixture details and one distinct live-authorization 503 in logs. These findings
do not reproduce or resolve the reported indefinite merge-state label.

A root-only fixture UI diagnostic reaches a successful idle detail query.
Its original metadata hash fails because it also includes untyped encryption
maintenance timestamps; the differing field cannot be recovered from its
unsaved before snapshot. The false result is preserved. A separate current
read confirms stable identities, names, pin state and positions, but does not
retroactively certify every field in that diagnostic. No screenshot of the
real shared PR list is published. Task59 stays open.

## Accepted draft readiness

The preview and retained source also contain a separate reproducible display
bug: a successful accepted draft detail supplies draft readiness, but both
header variants replace it with null. The header then says “Checking merge
status…” although that query has finished. The two props now preserve the
accepted readiness. Draft controls stay disabled; unknown/error states and
fresh authorization/write gates remain unchanged.

The isolated fixture diagnostic compares the retained `3692e754` /
`Qp1Rr4apU_XHLQh2IVfT6` with source `4d3b457b` /
`m-eaUKb4_v56rZ4kOr4Po`, under matching environment and complete cohort.
Scoped desktop headers change from one checking label to none, with draft
readiness present. The mobile menu changes from a disabled checking label to
a disabled Draft item. Both bookends preserve complete issue content, Page
versions, ten stable tab identities/names/pins/positions and the Git link.
These are correctness observations, never startup performance evidence, and
do not establish the inaccessible PR420 incident's cause.

Only the fixture readiness label/menu is cropped into the following evidence;
the real shared PR list and sidebar are excluded.

| Retained desktop | Corrected desktop | Corrected disabled mobile item |
| --- | --- | --- |
| ![Checking merge status on an accepted fixture draft](min-683-ui-evidence/draft-readiness-before.png) | ![Draft readiness on the accepted fixture draft](min-683-ui-evidence/draft-readiness-after.png) | ![Disabled Draft item in the fixture mobile menu](min-683-ui-evidence/draft-readiness-mobile-after.png) |

## Request-local quota correctness

The source audit finds a separate readiness-batch bug: swallowed forge errors
return partial HTTP200 without a pause, allowing ordinary polling and later
worker starts to ignore `Retry-After`. The [server report](min-683-server-attribution.md)
records behavioral red/green tests and the actor follow-up. Signed source
`f24090c9a` preserves four existing workers, drains admitted work, stops later
starts and marks every unaccepted row unavailable. The longest observed quota
deadline reaches the account QueryClient as anchored numeric metadata. Cached
query payloads contain no generated error object. Focus, invalidation, mount and
preparation obey the same maximum deadline; a new account client inherits none.

Ordinary forbidden/unknown outcomes do not become ready. Ordinary actor/write
fallbacks and the strict failed-read display boundary stay intact: the cached
body/drafts remain mounted but hidden/inert during a failed paused detail read.
The fix grants neither freshness nor permission nor write authority. The final
focused run passes 89 cases across nine suites, including 32 new cases, with
full TypeScript and scoped lint. These mocked quotas prove the correction's
contract, not that actual preview PR420 hit a quota. Runtime comparisons and
remaining live safety observations are recorded separately below when complete.

## Rapid-selection collector limits

The excluded collector's original automatic URL-consumption premise is false:
open draft links stay until a real filter choice or a terminal transition. Its
first two timeout failures remain. The corrected protocol toggles the real
completed-section filter twice, consuming the address and restoring its lens.
A subsequent guard exception and cleanup hang are retained, with separate
read-only operator bookends verifying unchanged three Page fingerprints/versions,
ten tabs and the Git connection. They do not establish a selection defect.
The driver now persists phase metadata and closes the isolated browser before
draining passive response bodies. Navigation-lost passive bodies retain an
unverified-acknowledgement classification rather than fabricating an ACK.
Ordinary viewer heartbeats are scoped and recorded separately from forbidden
content writes. The first complete protocol attempt recovered the same real PR
and full useful body under the held older seal and in a settled control, but
failed its overly broad mutation guard on blocked Page-viewer heartbeats. Its
failed result remains; no overall acceptance follows from those partial checks.
The corrected web6 run passes both real reloads, with no latest selection ACK
before the held-seal reload, complete PR content and strict source/Page-version/
ten-tab/Git preservation. The native1 counterpart also passes both real reloads and its strict bookends.
Neither client received the latest selection ACK before the held-seal reload.

## Identified healthy runtime controls

All comparisons precede journaled content writes and reuse the complete frozen
scaled source. The eight-file ordinary v5 hash is unchanged. Exact products are
original `3692e754` / `Qp1Rr4apU_XHLQh2IVfT6`, badge-only `4d3b457b` /
`m-eaUKb4_v56rZ4kOr4Po`, and badge/quota `f5abefe20` /
`aByBbQwsVOkTw0_Zh99sx`. Whole build directories and manifests are retained;
no binary is relabeled after a later documentation commit. Sources are compared
in the index as two explicit increments, never as an attributed aggregate gain.

Both badge/quota web attempts and the badge-only web control complete the
first45 useful-content observations, then fail the unchanged ordinary guard:
CDP creates a distraction in another browser window. Their results are **failed**
and ineligible for ordinary successful paired/focus conclusions. Exact cleanup
passes. There is no fabricated55-observation web run. The second quota web pass
is a guard reproduction; the first PR observation of5,977.5ms remains retained.

| Native ordinary single observation, ms | Original | Badge-only | Badge/quota |
| --- | ---: | ---: | ---: |
| Renderer launch / full board refresh | 2,778 / 2,153 | 2,410 / 2,064 | 2,374 / 2,140 |
| First project | 737 | 401 | 449 |
| First primary / foreign Page | 389 / 461 | 311 / 478 | 361 / 394 |
| First Home / complete PR | 60 / 3,143 | 53 / 3,504 | 54 / 2,711 |
| First Routines / Triage | 795 / 308 | 661 / 277 | 613 / 282 |
| First Feedback / Objectives | 1,025 / 290 | 943 / 241 | 916 / 258 |
| Warm listed destinations under100ms / maximum | 8 of10 / 132 | 8 of10 / 125 | 8 of10 / 119 |
| Finished/failed HTTP records / snapshot POSTs | 763 / 36 | 802 / 37 | 782 / 39 |

All three native runs complete55 observations and genuine16s absence/return,
with no recorded application errors and exact content/version/ten-tab/Git
bookends. Whole-run requests include passive/polling work over different
elapsed durations; they are not fixed-window admission counts. Failed web
runs contain a shorter sequence and cannot be pooled with those native totals.
The final native first-Page task/script deltas are219/164ms (primary) and
263/218ms (foreign), and PR1,004/684ms. Script is part of task time; neither
is added to the full-content paint clock. The complete raw records preserve
loading frames, request starts, statuses and phase-envelope thread evidence.

The failed web control and latest quota attempt observe launch/refresh2,750/
2,389ms versus2,485/2,270ms; first project672→428ms, primaryPage344→345ms,
foreignPage494→394ms, PR2,472→2,744ms, Feedback1,003→1,038ms. These are
individual completed subjourney observations inside failed runs, not eligible
successful-run comparisons or percentiles. The first quota attempt's PR5,978ms
prevents selecting only a favorable sample. No rate limit is diagnosed by these
healthy reads. Mixed isolated timings do not establish a moved-cost mechanism
or a general speedup; no cold-load optimization is accepted from them. Both
correctness fixes retain unchanged complete read/write contracts and add no
healthy-path transport request. Common details still exceed300ms and all-tab
preparation remains incomplete, so MIN-683 stays in progress.

## Long absence, typing, merge and departure verification

All ordinary comparisons above finish before the first journaled content write.
The excluded write verifier runs only on the final identified binary, with a
new isolated profile and verified Performance Tester identity for every attempt.
Its private restoration journals contain original bodies and never enter the
public evidence selector. Content is restored through normal versioned PATCH;
versions, content revisions and timestamps legitimately advance. These later
cohorts cannot be pooled with the frozen latency cohort.

Four failed web collectors remain explicit: an origin-storage launcher error
before mutation; an observer-commit race and conservative content-revision
refusal; an asynchronous route-removal exception; and a departure caret that
split the earlier marker. The first refusal is independently reconciled only
after exact version/body/revision/updater/remaining-metadata proof, restoring
focusPage2→4 while the other two Pages stay exact. The route exception retains
its failed outcome and operator cleanup, restoring primary2→4 and focus4→6.
The later caret attribution proves one exact insertion inside the local marker:
removing only the known inserted departure text recovers the entire preceding
canonical document text. It demonstrates no lost text. That failed driver itself
restores primary4→8 and focus6→8. No failed attempt is retroactively called
passed, and no unknown concurrent body is overwritten.

The final collector uses origin-scoped initialization, actual isolated-window
minimization, one lifetime intercepted Page route, gates registered before
admission, tracked route/response/PATCH completion and a bounded ambiguous-write
refusal. Actual observer/editor readiness is awaited while the fresh GET stays
held. A trusted keyboard append places departure typing at the document end,
with marker integrity checked before departure. Cleanup sends only its own
content and body version; it never copies stale title/icon metadata. Exact
journaled content revision/body/version and unchanged other metadata remain
required, with ordinary version conflict behavior. This does not claim an
atomic metadata snapshot or automatic recovery from an ambiguous ACK.

`min683-verification-scaled-cold-session-web-5`, protocol
`min683-restored-correctness-v8-trusted-departure-append`, passes:

- Actual observed blur lasts75,005.5ms on the renderer and75,006ms on the wall
  clock before any remote mutation; visibility stays visible and is recorded
  separately. Returned focus is actual, not inferred from a CDP command.
- The mounted focus body advances8→9 and appears with its exact accepted content
  after return. The remote issue title appears in both All and its project.
- The accepted cached editor accepts immediate local typing while its actual
  scoped fresh GET is held. Nonoverlapping remote/local edits merge; no fake
  cache response or write receipt is injected.
- Departure remains on the active Page while a versioned PATCH is held. After
  release, the server's persisted version11 contains all three exact markers.
- Normal cleanup restores primary8→12 and focus8→10, preserves the untouched
  foreign Page exactly, restores the issue title, preserves all unrelated issue/
  Page metadata, the ten stable tabs and Git connection, and leaves no dirty
  journal entries.

`min683-verification-scaled-cold-session-native-1` passes the same protocol and
literal verifier hash `b47a709d0a17c956309e75c6ed7b02cd751c4ae7fbd01ef0a4680249a600e36d`.
Actual blur before mutation lasts75,006.3ms renderer /75,007ms wall clock.
The mounted focus body advances10→11; immediate typing, nonoverlapping merge,
held-PATCH departure and all three persisted markers pass at primary version15.
Cleanup restores primary12→16 and focus10→12, the untouched foreign Page stays
exact at version2, the issue title is restored, all unrelated source metadata /
ten tabs / Git remain preserved and both final journals have no dirty entries.
These are two different version cohorts and correctness observations, never
paired latency results.
Read-failure/permission-denial contracts remain covered by existing real hook
regressions; no live membership or primary-account permission is changed.
Forced-quit draft recovery and population/daily-feel acceptance remain open.

## Review and publication

The independent correction is the missing pnpm lock entries for the already
declared and measured `@tanstack/react-virtual@3.14.17` and
`@tanstack/virtual-core@3.19.2`. Their versions/integrities match package-lock
and installed measurement dependencies. Unrelated resolver churn is removed.
`pnpm install --lockfile-only --frozen-lockfile --ignore-scripts` passes.
This clears an installation prerequisite, not a runtime preview diagnosis.
The encryption consumer inventory is refreshed after reviewing the quota file
line shifts and existing branch reader extraction; no new DB operation is added.

Internal performance reports and tooling are the documentation impact. Public
controls, configuration, reader workflows and release versions do not change;
no public article/figure translation delta or invented review date is needed.
Validation passes: the final production build (including TypeScript), 89 focused
quota/actor tests with32 new cases, 40 draft/read-boundary regressions, 38 final
evidence/readiness tests, scoped application/tooling oxlint, documentation,
knowledge, owned English, release documentation, encrypted-access and encryption
schema inventory checks. The frozen pnpm lock installation check passes.
The final evidence index contains114 retained runs and27 valid paired navigation
comparisons; overall failed web runs remain ineligible. Diff and DCO/public
repository review are required before pushing; journals and private operator
snapshots stay ignored.

Publication uses matching-author DCO and `npm run work:pr`, retaining PR420's
existing title/body and draft state. Full cold preparation, common navigation
limits, broad regression coverage and daily feel remain required before MIN-683
can be complete.
