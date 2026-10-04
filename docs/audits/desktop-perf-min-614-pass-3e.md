# MIN-614 — desktop performance, phase 3e

This pass measures authenticated GitHub reads in native Electron production builds,
using the owner's personal account with read-only forge access. It removes shared
in-flight transport and independent waterfalls, adds bounded preparation through the
existing account QueryClient, and explicitly distinguishes previously displayed
content from a completed post-activation authority read. It does **not** establish
instant exact PR navigation or complete MIN-614. The issue remains in progress.

The branch remains `codex/min-614-encryption-performance`, cumulative
[PR #342](https://github.com/mangue-dev/minddy/pull/342). Prior phases and matrices
are untouched. No merge, `work:done`, production deployment, live GitHub comment,
review, push, force-push, close/reopen or other test mutation was performed.

## Provenance and workload

The original clean local, fetched origin and actual PR HEAD were
`4469bb6bda46d16062c0c8274da363d18f646428`. The baseline production artifact
BUILD_ID `sii2TG6an7DIIeXDU7nBR` is the previously verified 3d product
`05c69168e39aa8369cf4fcbc83dd5e3a41abf3f2`, rather than a claim that it was rebuilt
at the audit-only checkout HEAD. Candidate product is
`061615eaea1e815c4b29d4cb842816a4c7a64ee2`, BUILD_ID `rPgiALpOXXHtBUJ0_uuPj`.
The baseline server was reused after exploration; the candidate server was restarted
for its new build. Installation tokens and managed-key process caches are not cold
on every native launch. Each launch starts a fresh desktop profile/account query
cache, while normal forge ingestion/list sweeps can update stored metadata. This
background variance limits causal attribution of database and latency changes.
Both use the same local production server port, desktop runtime, sealed window
navigation, GitHub installation and authenticated account. Cookies remain in
process memory and temporary native profiles; none are published in evidence.

The migrated MIN-540 fixture was preserved. Its synthetic PR rows are never used
as evidence of GitHub detail performance. A fixture-account discovery failed RLS;
the supported connection owner confirmed no usable GitHub installation for it.
The personal account is the only available authenticated workload. The temporary
login's initial black window required direct native CDP navigation to the login
route; login and MFA remained under the user's control.

Representative real authorized repository: `mangue-dev/minddy`.

- #339: small merged PR, five files, +237/−1, comments and a review.
- #342: large open cumulative PR, 441 files, +892,360/−259, eight checks,
  conversation/review surfaces and a failing dependency audit.
- #344: medium PR, 71 files, +9,131/−2,198, eight checks and two threads;
  exploratory and read-state diagnostics only, not the matched ordinary cohort.

The large workload includes audit data rather than a representative 441-file code
change. Deployments were queried through the real authorized adapter, including
its stable Vercel preference; availability in the measurement is recorded rather
than manufactured. Paginated diff reads are real. No claim is made about every
repository, deployment provider, review topology or fork size.

## Clocks and acceptance predicates

Existing timers are preserved. New API clocks run in the native renderer:
`performance.timeOrigin + performance.now()` starts the concurrent detail,
readiness and review-comments GET cluster, then waits for parsed successful
responses, live head and surface metadata. Commits is a separate sequentially
measured GET after that cluster. These are authenticated API path measurements,
not DOM-navigation or merge eligibility measurements. Response UTF-8 body bytes
are recorded; GitHub header content-length is often absent and is not treated as
actual body transfer volume.

Each ordinary cohort has three fresh native profiles and ten warm repetitions per
PR per launch: 30 observations for each path, 60 clusters and 60 commits reads per
cohort. The same PRs, order and predicates apply before and after, and #342 was not
pushed during the paired measurements. Browser document counters, tasks, frames,
heap, style/layout/script/thread/process counters and 15-second idle windows are
retained. Profiles and injected diagnostics are separate from ordinary samples.
A previously failed launch with 20 completed baseline samples is retained in the
all-observed results, without replacing the matched complete baseline cohort.

Definitions:

1. First visible response: prior cached content or newly fetched content appears.
2. Previous data: prepared or retained data whose fetch began before activation.
3. Current actionable detail: a successful live read started after activation and
   finished, with its existing head-dependent policy/check/readiness dependencies.
   The client calls this `fresh`; it is an observation, not an atomic GitHub snapshot
   or proof that the remote cannot change immediately afterward.
4. Reconciliation: a joined pre-click preparation can finish for display, then a
   second authoritative read must finish before `fresh`/merge controls qualify.
5. Secondary surfaces: comments, commits and review comments independently refresh
   on mount; their completion is separate from detail and readiness. Their older
   values are not evidence that all PR surfaces are exact.

Sensitive actions still redo server-side authorization, actor, live head, policy
and readiness checks. Mutation scopes bypass display-flight sharing and writes
fence shared reads before and after transport. A fast cached value never counts
as an exact navigation success. Baseline warm sidebar observations around 74–143
ms lacked an activation detail read and therefore do not satisfy exact freshness.

## Profile findings and selected paths

The short real reads showed multi-second detail/readiness clusters and concurrent
installation-token mints. Actual headers-ready request telemetry exposed duplicate
PR, repository/policy and checks reads. Authorization, key registry and database
operations also remain significant, with list/sweep work overlapping page reads.
The observer counts real registry operations and existing decrypt audit records;
it does not mislabel network wait as AES time. It cannot attribute every global
background operation to an individual HTTP consumer without request correlation.

Selected paths are the concurrent PR detail/readiness/review cluster, commits, and
account-owned preparation/activation. No repeated full campaign on boards or icons
was run: no change affects their data transport, icons or rendering directly.
The shared app-tabs integration is covered by affected navigation/encryption tests
and the mixed-tab diagnostic; the old 3d regressions remain open guardrails.

## Matched ordinary results

Nearest-rank p95 includes every matched sample and extreme (n=30 per row per
cohort). Small and large PR heads and returned body-byte totals are identical.

| Native API path | Median before → after | Change | p95 before → after |
| --- | --- | --- | --- |
| #339 detail/readiness/review cluster | 2,886 → 2,629 ms | −8.9% | 4,193 → 3,546 ms |
| #342 detail/readiness/review cluster | 3,872 → 3,906 ms | +0.9% | 6,233 → 4,763 ms |
| #339 commits | 1,352 → 937 ms | −30.7% | 1,980 → 1,200 ms |
| #342 commits | 1,800 → 1,492 ms | −17.1% | 2,842 → 1,934 ms |

The 30% median objective is reached only for small-PR commits. Large detail still
pays for head-first paginated files before returning the actionable detail. The
readiness median improves 2,399→2,123 ms (small) and 2,881→2,599 ms (large), but
review-comment medians stay about 1.3 seconds. A faster old value is not counted.

In the matched cluster windows, server-observed GitHub starts fall 1,839→1,302
(−29.2%); identical overlapping starts fall 491→0. These global windows include
foreground and background work, and stop overlap counting at response headers.
Endpoint-level observations and exact hashes are archived; they demonstrate
elimination of observed concurrent transport duplicates, not removal of every
sequential reread. Database/key operations vary sharply with list/sweep work:
registry operations 8,895→1,028 and repository-name reads 4,338→966 are observations,
**not a proven causal reduction in decryptions**. Per-record AES duration and
whole-process GC remain uninstrumented. Native cluster renderer script duration
is about 24→23 ms median, with negligible layout duration. This covers API JSON
parsing and concurrent renderer activity; it is not an initial React-detail render
time. The separate baseline Files diagnostic adds 151 ms script, 58 ms style,
24 ms layout, about 16,423 DOM nodes and 45 MB heap over a 2,074 ms observed window
(including an intentional 1,800 ms settle). Ten CPU-profile GC sample hits are
retained; they are not a whole-process GC duration. No paired heavy renderer gain
is claimed because product diff parsing/layout was not changed.

Median native heap is 34.6→34.1 MB (−1.4%), but p95 is 48.7→62.8 MB (+29.0%) and
maximum 53.6→66.1 MB. This tail regression remains visible. Cold first timeline
appears at 7,634/6,524/8,534 ms before versus 14,746/6,020/6,014 ms after: the
candidate first-launch extreme is retained, and three samples do not establish a
startup improvement. Native idle API counts over 15 seconds are 7/2/1 versus
1/0/0; these short windows do not establish sustained CPU/traffic pressure bounds.
Idle counters and per-endpoint body bytes remain in the evidence.

## Quota stop and native diagnostics

The ordinary cohorts all returned 200 and completed before quota exhaustion.
Minimum observed core quota in their cluster intervals was 2,310 before and 650
after; this is shared installation usage over time, not a per-build quota gain.
Subsequent virtual-tab diagnostics exhausted the remaining primary REST quota
(403, remaining=0, reset header present, no Retry-After). Measurements and the
owned server were stopped. No launch or remote test write was replayed afterward.
This is a material quota failure of the diagnostic workload and a limitation of
this campaign; it must not be presented as green background acceptance.

Twelve mixed virtual tabs used in-memory intercepted navigation transport with
real authorized PR reads. Ten nonuniform activations succeeded, including repeated
late #342/#344 choices, before the eleventh activation failed at quota exhaustion.
Three earlier harness failures confused the six visible rail controls with all
12 tabs, or raced the overflow menu's exit animation; all are retained. The final
follow-up cold read also failed on 403. The held-read, injected 429 recovery and
idle suffix of this native diagnostic therefore **did not complete**. Unit tests
cover these logic boundaries; they are not substituted for a successful native
hidden-change or live-write freshness campaign. Every diagnostic independently
restored the original six persistent personal tab rows before the server stopped.

A follow-up product correction derives Retry-After from an exhausted quota's reset
header and shares the pause through errors already owned by the account QueryClient
across detail, readiness, list, comments, commits and review comments. This stops
immediate error retries, hover preparation and foreground reads during that pause.
It introduces no private settled response cache. This correction has focused tests,
types/lint and a separate production build; the matched cohort above measures
`061615eae`, before this error-only correction. No new authenticated campaign was
started after the quota stop. Account replacement removes the old client's pause.
Final error-handling product `d9d576c0245812ee0b433a3809a1c14f756e60df`
has production BUILD_ID `dlXYoN5YqnWMLEbN1h2PW`.

## Ownership, changes and boundaries

| Owner / files | Final behavior |
| --- | --- |
| `lib/server/agent/pr-actions.ts`: `resolvePrScope`, GET authorization facades, readiness batch | Every consumer authorizes its accessible repository before joining. Account/provider/project link/connection/stable repository identity owns sharing. POST and other mutation scopes retain the original forge. |
| `lib/server/agent/github-read-flight.ts`, `pr.ts`: `ghJson`, `ghGraphql` | SHA-256 operation keys include owner, exact credential, normalized URL parameters, method, headers/API version and body/GraphQL variables. At most 256 distinct operations; overflow performs a fresh read. Settled values and failures are removed. Each consumer parses its own response, and writes never join. |
| `lib/server/git/github-app.ts`: `getInstallationToken` | Equal existing structural installation/repository/permission scopes share token minting. Existing expiry/security window stays unchanged; failed or retired mints cannot populate current cache state. |
| `pr.ts`: `getRepositoryMergePolicy`, `getPullRequestDeployment`; `pr-actions.ts`: `prCommitsResponse` | Repository/protection/rules, Vercel/deployment walks, and commits/extras overlap. Checks still await policy. Files and head-dependent decisions still follow the live PR head. Fork and stable deployment preference remain tested. |
| `lib/pull-request-query.ts`, `use-agent-runs.ts`, `agent-api.ts` | The normal PR query records read start, validates on activation, follows a pre-click flight with authority, consumes AbortSignal and disables HTTP caching. Retry-After survives errors and gates account PR reads, focus and speculation; 403/429 without a header get a bounded one-minute pause. |
| `lib/prefetch-tab-destination.ts`, `pr-tab-preparation.ts`, `app-tabs-context.tsx` | Existing QueryClient/prefetch owns preparation; 32 recent visits, frequency/recency ranking, one operation per navigation and one speculative detail per account. No independent idle polling. Foreground activity cancels only unobserved speculation; joined observers stay alive. Existing fresh data is reused for display but never avoids activation authority. |
| `components/pull-requests/pr-detail.tsx`, runtime catalogs | Previous, checking, failed and offline detail states are explicit. Merge and auto-merge controls require completed activation authority. Comment capability remains stable to avoid unmounting drafts during refresh. |
| `scripts/performance/server-timing.mjs`, `min614-pr-reads.mjs` | Opt-in observation, exact operation overlap identities, page/limit/version inputs, quota/error/conditional headers, native samples and strict personal-navigation restoration. No runtime credential or decrypted-content cache is added by instrumentation. |

Authorization, revocation, rotation, encrypted access, project isolation and token
scope are never skipped to improve a timer. Database reads/decryptions are not newly
shared across HTTP requests; redundant decrypt elimination is **not demonstrated**
by this pass. The existing key cache and encrypted local snapshot owner remain
unchanged. PR DOM retention is unchanged; query data preparation is a separate
mechanism from retained board DOM and from authoritatively established freshness.

Conditional GitHub reads were evaluated but no settled ETag/body cache was added.
An ETag for PR metadata alone cannot certify checks, reviews, threads, policy or
head-dependent readiness, and an authenticated 304 still requires a compatible
owned response body. Adding a new private plaintext persistent cache would violate
scope. All observed conditional flags and 304 counts are retained (zero is a valid
observation). Guidance: [GitHub REST best practices](https://docs.github.com/en/enterprise-cloud%40latest/rest/using-the-rest-api/best-practices-for-using-the-rest-api),
[rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api).

## Final request-start barrier

A final unit scenario exposed a boundary that client read timestamps alone cannot
certify: a post-click HTTP request could join a server flight started before the
request, whose old response arrives afterward. GET authorization now records a
monotonic request-start barrier before auth/database work. Its authorized forge
scope joins only transport started at or after that barrier. Request consumers
that both arrived before a shared GitHub operation still coalesce; a later
activation performs a new read. Old operation settlement cannot remove a newer
replacement flight. Mutations remain unshared and fenced.

Barrier product `2734cb7b5c64941ad0fa0882b60a6bfc90a40273`, BUILD_ID `h4X35D3t8pBK6qr4oS4wA`,
was production-built without starting an authenticated measurement server.
The focused test holds old/new head responses and independently proves concurrent
sharing and rejection of an older operation, including replacement settlement.
Readiness controls also keep stable permission-based mounting during refresh and
receive a separate authority flag that disables sensitive gestures. This avoids
removing the auto-merge checkbox solely because a detail read is running; it is not
a claim that every browser focus case was revalidated natively.

**The final barrier changes successful read sharing and was not remeasured in a
native authenticated cohort.** The tables describe measured product `061615eae`;
final product guarantees have focused tests and a separate production build, not a
new measured speed claim. No launch resumed after the quota stop. Cancellation
aborts the client query/HTTP transport; propagation through all upstream GitHub
operations is not established, and some server work may finish afterward. Server
RSS, sustained background traffic and live mutation-race acceptance remain open.

The final source product is `06b873619c067886afef21041ae708f39b044e49`,
BUILD_ID `_PaI3dfDDX_Wd17Z_MV6Z`. Its error-recovery correction materializes a
headerless 403/429 fallback deadline once on the existing account query error.
Reusing that error across detail/readiness/comment surfaces cannot extend the pause
indefinitely. Explicit Retry-After and quota-reset advice remain authoritative,
including malformed REST responses and GraphQL error/no-data envelopes. Focused
tests prove the propagated fallback expires and quota advice survives transport
errors; 47 tests in six affected files, types/lint, encryption/schema/English checks
and the production build pass. This product was also built without reopening the
authenticated runtime and has no new native timing or live recovery claim.

## Safeguards, remaining acceptance and cumulative matrix

Targeted tests cover shared-flight identity/error isolation, independent parsed
values, write fences, credential/head/page/version changes, structural mint scope,
retired mints, authoritative activation after preparation, twelve mixed late PR
choices, background cancellation/observer joining and Retry-After. Affected tests
recheck policy-before-checks, fork/deployment preference, merge authority, encrypted
snapshots/local access, app-tabs restoration, optimistic relations (MIN-630), PR
state/diff/live behavior and encrypted remote echoes. Types/lint and the required
English/encrypted-access/schema/public-repository/diff checks are retained.

| Cumulative area | Result / remaining boundary |
| --- | --- |
| 3b / 3c authorization, keys, encrypted snapshots, cancellation | Affected unit safeguards pass; no widening of caching, revocation or key-rotation rules. No fresh full live write campaign. |
| MIN-630 relations | Optimistic relation and encrypted echo tests pass; relation implementation is unchanged. |
| 3d board return / snapshot opens / imported icons | Earlier measured gains and traces preserved. No claim of a new board/icon gain. |
| 3d cold exact +5.7%, near-click exact +18%, heap +24% | Still open. PR-only observations use different clocks/workload and cannot cancel these regressions. |
| 3e real GitHub reads | Matched native cohorts and all extremes retained. Results below and in the distinct result manifest. |
| 3e warm exact 50/100 ms | Not achieved: post-activation remote authority and paginated diff still block current actionable detail. A completed read cannot prove universal exactness against concurrent remote writes. |
| 3e redundant decrypt elimination | Not proven; measured authorization/key/decrypt work is retained rather than bypassed. |
| 3e late PR preparation | Bounded normal-query preparation is tested independently from DOM retention and detail authority. No hidden-view polling owner is created. |
| Live mutation freshness | No controlled test PR was authorized for writes. Real force-push, review/comment/check writes, close/reopen, revocation and reconnect races remain unverified. Injected reads and unit head/scope/error tests are explicitly separate evidence. |
| Universal exact activation / startup / sustained pressure | Still remaining from the cumulative plan; compact plan line preserves this scope through this audit reference. |
| Dependencies audit / publication | Root audit clean; inherited desktop GHSA-ch52-4w7c-c8xp still blocks. No blind forced audit fix or Gitleaks exception change. |

Failures are kept: rejected fixture discovery/bundle diagnostics, initial black
native login, first baseline profile cleanup race, an invalid candidate SHA rejected
before launching, the first heavy diagnostic's wrong control role, initial unit/
type/lint failures and mixed-tab diagnostics. Failed profile cleanup stopped all
launches until port closure, exact profile removal and unchanged personal tabs were
verified. The runner now waits for Chromium profile writers to exit; each successful
cohort verifies the original six tab IDs, locations, pins, order and names.

## Evidence publication

The distinct [result manifest](desktop-perf-min-614-pass-3e-results.json) includes
matched statistics, all-observed samples/failed runs, workload/build/runtime,
endpoint counts/overlap, quota/error/conditional observations and an archive index
with original and published SHA-256 checksums. Compressed evidence retains all
ordinary sample values and extremes. Local originals under ignored
`output/playwright/performance/` are preserved.

Published copies replace personal account/project/tab/PR UUIDs, local profile paths,
private deployment/installation identifiers and CPU-source URLs with stable labels.
Private connection discovery, personal initial lists/tab labels and login pixels
remain local, with checksums and an explicit omission reason. Server log redactions
preserve decrypt table/column/scope-kind observations and equality of row identities.
No secrets, cookies, credentials, decrypted private content or personal drafts are
copied into the public audit. Scanners and their configuration remain unchanged.
