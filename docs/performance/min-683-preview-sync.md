# MIN-683: preview incident and preparation boundaries

This is the dedicated October 14, 2026 preview/synchronization investigation.
MIN-683 remains in progress. No production migration, deployment, merge, main
account access, GitHub connection change, reseeding or forge write is included.
The root agent owns every UI diagnostic and timed run; the investigation agent
uses read-only provider metadata, logs and explicitly coordinated HTTP probes.

## Identified products

Vercel's deployment API resolves `preview.minddy.app` and
`minddy-git-main-mangue-dev.vercel.app` to
`minddy-nbdjdzpl2-mangue-dev.vercel.app`, deployment
`dpl_F4h9ikqqXWanM97Zhdthi8hMEsx6`, READY, created October 12 at
00:34:48 UTC. Its Git source is `main`, exact SHA
`d5c2d862e4b386e186faa5a43e7d350226360f5d` (PR412). This identifies the
shared main preview alias. The user subsequently identifies the affected PR as
`mangue-dev/minddy#420` and spells the host `preview.mindi.app`. The literal host
does not resolve in the investigation's DNS lookup and Vercel cannot find a
deployment for it. `preview.minddy.app` remains a verified candidate alias;
the spelling cannot be silently assumed. The initial fixture probes below do
not reproduce the clarified PR420 incident.

The MIN-683 draft PR420 head at investigation start is
`46b747efb67fd2a2cfd26e6145f43483b0f5aa1a`. Its check rollup has no Vercel
deployment. A Vercel deployment lookup filtered by
`githubCommitRef=codex/min-683-instant-navigation` returns no deployments.
Do not label the main preview with PR420's source or local build
`Qp1Rr4apU_XHLQh2IVfT6`.

PR420 CI run `38577445189` fails before unit tests because the frozen pnpm
lockfile lacks `@tanstack/react-virtual@3.14.17` declared in `package.json`.
This is an independently identified publication prerequisite, not evidence
that a running preview's PR read failed. Root owns the lockfile correction.

A direct read of GitHub PR420 reports `mergeable: true`,
`mergeable_state: blocked`, `draft: true`, open, with head `46b747efb…`.
The commit's combined legacy status is `pending` with zero status entries;
the check-run rollup separately records CI failures. This is not a GitHub
pending mergeability computation or quota response. The application may use
an installation credential with a different quota from the CLI credential;
the CLI read does not prove the installation's remaining allowance.

## Authenticated HTTP evidence

The separate probe at 14:18:21 UTC authenticates only
`captures-demo+min540@minddy.app`, user
`86df71f9-44a7-4cc1-8085-5baa6c744490`, marker
`min-540-performance-v1`, and verifies all ten stable account tabs. Private
cookies remain in memory; evidence contains structural metadata and request
identifiers, without protected PR content or credentials.

`/api/runtime-config` returns 200 and its database origin exactly matches the
local linked database. The DB agent's read-only migration catalog verifies all
current repository migration versions through `20270109200043` are present.
That is catalog compatibility evidence; it does not independently certify
every function body, grant or schema-cache state. No migration was applied.

| Coordinated sequential read | HTTP | End-to-end duration | Result |
| --- | ---: | ---: | --- |
| Runtime configuration | 200 | 232 ms | Database origin matches |
| Account tabs | 200 | 939 ms | Exact fixture ownership, ten tabs |
| Ordinary open PR list | 200 | 21,998 ms | 65 rows, ordinary response shape |
| Five selected list-detail reads | 200 | 2,563–4,297 ms | PR, two files, checks and readiness returned |

All five detail bodies report `mergeabilityReason: draft`, readiness `draft`,
a blocked draft condition, successful checks and no `checksError`. `viewer`
capability is `none`, preserving denied write authority. These are the first
five actual returned rows, not a guarantee that they equal the frozen five-PR
measurement cohort or the user's affected PR. A root UI diagnostic uses the
stable manifest's exact PR destination separately.

No probe returns 403/429 or `Retry-After`. The runner stops on the first such
response rather than retrying. These durations include transport, admission,
authorization, database/forge work and serialization. They are neither SQL
execution time nor ordinary UI navigation observations and are not pooled into
before/after latency aggregates.

The sanitized ignored record is
`output/playwright/performance/min683-preview-probe.json`; request IDs allow
Vercel correlation. For example, the slow list is
`cdg1::iad1::fv6rl-1791987503505-77c054549728`.

The reviewable, sanitized combined record is
[min-683-preview-results.json](min-683-preview-results.json). It retains
structural request/query states, the original preservation verdict and explicit
limits, without query read-session markers, cookies, credentials, original
documents, PR content or screenshots. It is excluded from ordinary measurement
aggregates and does not alter the frozen runner.

## Logs and causal limits

A bounded Vercel log lookup initially returns 50 matching PR requests, all
HTTP200, including detail, list, count, readiness and activity routes. Repeated
`[pr-actions] deployment_unreadable` messages accompany HTTP200 detail reads.
The deployed `prDetailResponse` catches that optional deployment lookup and
returns the rest of the detail; this log is not evidence that mergeability or
the entire response failed.

A later lookup finds one distinct server error at 14:19:09 UTC:
`[api-auth] live_authorization_check_failed`, HTTP503, request
`zjmtl-1791987549859-26205951c7fb`, detail
`f1e38d36-fed8-493c-9e25-b4c7ecb4f226`. The log provides no upstream database
code or error body. `getAuthedUser` emits this when its live session/MFA
authorization read throws. Attribution to a missing migration, timeout or
transport failure is not established. The isolated sequential probes all
succeed; simultaneous provider logs need their own correlation and cannot be
quietly assigned to those probes.

A separate three-day 5xx-filtered provider query fails with HTTP504. Its empty
output is not evidence that no older server errors exist. Only successfully
returned bounded records are used above.

The slow list awaits stale repository sweeps with concurrency three before its
final list read, then awaits review metadata when applicable. This is a real
blocking server path in the exact preview source. Without stage timings and
sync-state correlation, the 22-second observation cannot be apportioned to
SQL, forge quota, sync or authorization. Bypassing catch-up would change the
same-response discovery contract and is not an accepted performance fix.

| Incident hypothesis | Current evidence | Remaining discriminator |
| --- | --- | --- |
| Missing migration | Required catalog versions present; direct details succeed | Exact failed RPC/code and schema-cache/grants |
| Server failure | One live-auth 503 is recorded | Correlate affected UI request and upstream structural error |
| GitHub pending mergeability | Five bodies are terminal draft, not pending | Actual reported PR's response and bounded poll transitions |
| Polling/activation blocked | Not established by HTTP probes | Actual query/observer/activation state while label is visible |
| GitHub quota | No 403/429 or Retry-After in sequential probes | Affected request headers; preserve account pause if encountered |

Do not promote an unknown state to ready or hide a failed read behind a
successful merge badge. A root-owned, excluded 60-second browser diagnostic
captures the stable selected PR's visible gate, query status/fetch state,
invalidation/observer counts, structural HTTP readiness and errors. Its result
must distinguish a resolved body with a disabled/stale UI from a pending
server request. Main account and primary GitHub connection remain untouched.
Do not publish screenshots showing the real shared list's protected content.

A separate status-filtered, three-day log lookup also finds historical HTTP403
responses on detail IDs, including October 14 at 02:33:04 UTC. The initial
50-request lookup was a recent subset, not proof that no earlier 403 existed.
The DB agent subsequently identifies `27f9154b-226f-437e-b2ba-fd7da35848e3`
as the stored GitHub draft number420 through the supplied Minddy project link's
protected repository identity. That route appears among both earlier HTTP200
and historical HTTP403 records. The metadata join does not export or decrypt
repository names. These logs lack response bodies and `Retry-After`, and cannot
distinguish forge quota from authorization failure. No retry is initiated from
old logs.

One coordinated exact-route probe at 14:27:27 UTC again verifies the authorized
Tester ID/email/marker and requests only
`/api/pull-requests/27f9154b-226f-437e-b2ba-fd7da35848e3` on the identified
main preview. It returns HTTP404 after 2,685 ms, with an error-only response and
no `Retry-After`. Request ID is
`cdg1::iad1::f2zpj-1791988047912-243434d58900`; sanitized evidence is
`output/playwright/performance/min683-preview-actual420-probe.json`. The
ordinary access/not-found boundary does not provide this account with the
actual PR420 detail. Investigation stops there, without using a main session,
changing a connection, invoking an unprotected forge API through an
installation token, or claiming the target is globally absent. A main-user
response/body or an existing structural server error correlation is needed to
resolve the reported indefinite verification. Historical 403 metadata alone
does not establish quota, and the successful PingMeIf journey cannot close this
incident.

## Independently identified draft label defect

Static review of both the exact deployed `d5c2d862` source and the retained
MIN-683 source finds a separate deterministic display defect in `PrDetail`.
The mobile readiness menu receives `isDraft ? null : effectiveReadiness`;
the desktop detailed-control branch excludes drafts and its fallback badge
always receives `null`. Both readiness components map `null` to the existing
localized checking label. A successfully loaded draft therefore continues to
display checking even when its accepted response contains readiness `draft`.
PR420's public GitHub state is draft, making this defect relevant, but it does
not explain the reported absence of data or establish the incident's complete
cause. A failed detail read already renders the ordinary error/paused boundary;
its cached data is not promoted to fresh write authority.

The bounded correction passes the accepted readiness through the mobile menu
and desktop fallback badge while preserving disabled draft actions. A truly
missing readiness value retains its unknown/checking presentation, and existing
read/error, authorization, write and Retry-After gates remain unchanged. Root
records this diagnosis before implementation and owns the isolated UI proof.
The correction changes only the two readiness props in `PrDetail`; root chose
direct fixture UI regression proof instead of adding a presentation abstraction
or a large mocked component harness. The existing readiness reducer/action,
account Retry-After query and read-boundary suites pass all 40 cases across four
files. They verify unknown/authorization/action and error/freshness boundaries;
they do not themselves prove the corrected `PrDetail` caller's visible label.
Targeted source lint and `git diff --check` pass. The separately identified-build
fixture UI proof remains root-owned, and no startup/navigation gain is attributed
to this two-prop display correction.

Root's first UI diagnostic completes 30 samples/126 request records over its
bounded observation window without a page error or 403/429. It opens the stable
fixture PR `36fa0b77-aed5-4a6c-8926-eb7f1a5d1537`, not PR420. Its selected detail
returns draft readiness, complete PR/files and no check error; description is
first observed at the 11,612.5 ms diagnostic sample. The final selected query is
successful, idle, noninvalidated and has two observers. Diagnostic sampling and
network contention exclude this duration from ordinary latency comparison.
It disproves an indefinite stall for this one fixture journey only.

Ten tab identities and the Git-link fingerprint are preserved, but the initial
script's tab-metadata hash comparison is false. Two ordinary location PATCHes
are recorded on the stable PR tab. The hash already excludes `href`, `revision`
and `updated_at`, but root discovers that raw API rows also expose encryption
maintenance timestamps such as `href_encryption_checked_at`,
`custom_name_encryption_checked_at` and `encryption_attempted_at`. The spread
comparison accidentally includes those columns beyond the typed tab interface.
They can legitimately change on an ordinary PATCH. The private before snapshot
was not persisted, so the differing field is not recoverable from the first
record; its original false verdict remains unchanged. Root separately confirms
current user/name/pinned/position metadata is intact. The unexecuted runner
follow-up compares explicit immutable fields (`id`, `user_id`, `custom_name`,
`pinned`, `position`, `created_at`) and records changed field names without
exporting tab data. A separate rerun must establish which fields changed; no
automatic normalization is authorized by the first diagnostic discrepancy.

## Synchronization and cold preparation strategy

The retained source's finite owner (`createPrTabPreparation`) prepares at most
ten displayed destinations with two normal slots and serialized forge detail.
`otherTransport` blocks refills behind ordinary foreground work; a known
successful cached app-tab reconciliation and five exact shell summary producers
are admitted alongside it. The initial PR list remains an ordinary foreground
query and can therefore gate scoped preparation. Source-level dependency facts
do not quantify how much of a given startup delay belongs to that admission.

`AccountTabSync` releases its startup reservation through the canonical tab
session handoff. A visit computes the active destination's exact query hashes
before navigation; the retained Task56 fix preserves selected unobserved reads
until their observer commits. Other unobserved reads yield, and canceled
operations retain their slots until settlement. Preserve that ownership and
account lifecycle while investigating cold admission.

The finite manifest drains prerequisites in listed order; Pages behind project
collections can receive their first body/tree reads too late for a three-second
independent first activation. The separate Page renewal worker cannot renew an
unknown body. Initial Realtime catch-up must still invalidate reads started
before subscription; bypassing that reconciliation or replacing timestamps
would falsely declare stale data prepared. Accepted Page display remains
separate from the fresh version and authorization basis required for writes,
draft merging and departure saves.

The next bounded strategy is to attribute startup admission by recording exact
query identity, read start/end, pending manifest and slot ownership around the
root's independent three-second activations. Keep these diagnostic traversals
outside the frozen ordinary runner. First reduce the demonstrated shared
server/read cost, then compare any fair ordering or cache-sharing candidate on
identified products and the unchanged fixture. Do not apply the ignored Page
prefix or route-prefetch proposals wholesale, add more concurrency, lengthen
TTL or transfer deferred work into first clicks without an isolated measured
comparison. All-nine independent activation and the checkpoint's remote
mutation, optimistic typing, merge, focus and departure-write checks remain
necessary before acceptance.

## Documentation impact

This investigation changes internal evidence only. It introduces no public
control or documented runtime guarantee; no public article, figure or review
date changes are required. Root runs the applicable documentation, knowledge,
owned-English and diff checks before publication through `npm run work:pr`.
