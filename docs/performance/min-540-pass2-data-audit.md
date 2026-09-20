# MIN-540 second pass: comments and data audit

The comparison reference for this pass is the PR's starting HEAD,
`ec6a12e94235b8c589d86637195ae24dfad28cd6`. Browser timings belong in the main
second-pass results; this note distinguishes implementation evidence, regression
coverage, and areas that were only inspected in source.

## Comment delivery

At the reference revision, Page and issue additions awaited POST before either
the comment or an empty composer appeared. Objective and feedback additions
then depended on another GET before appearing. A fast composer-clear measurement
therefore did not establish immediate visual publication.

Page and issue additions now publish the full draft synchronously, including
thread anchoring, author, markdown, and already-uploaded file/link/Page resources.
The composer relinquishes its copy only after that publication. Pending and
failed messages live in the shared query cache, so leaving their composer or
route does not discard their content. Pending messages show a small progress
indicator; failure keeps the content and attachments visible with an explicit
retry action and the existing delete confirmation to discard a failed submission.
Discard also deletes a possibly committed body by the same UUID; a 404 means it
was already absent. A pending root cannot accept a reply against a nonexistent parent.
Confirmed comments retain their normal edit, deletion, reply, and attachment
controls. Objective and feedback mutations now publish the authoritative write
response before background reconciliation; their POST remains acknowledged,
rather than optimistic.

The client supplies a UUID to Page/issue POST. The insert remains the idempotency
boundary: conflicts can return only a comment by the authenticated author in the
same entity, after a current project-access check. A replay does not repeat
notifications or start another assistant response. Realtime reads and POST
acknowledgements reconcile by UUID, preserving two intentionally identical
messages as two distinct submissions. Older reads are cancelled before writes,
server timestamps are authoritative even with browser clock skew, and a
response cannot repopulate a cleared query client.

A comment insert and resource registration are separate operations. The existing
server could commit the body, fail the attachment batch, and silently return an
attachment-free comment. For client-identified submissions, uploaded files now
remain recoverable after failure. Resource slots have deterministic UUIDs;
explicit retries use guarded, duplicate-ignoring insertion to finish missing
resource registration without recreating successful rows. A partial response
reports the error, and a body-only GET does not discard the retained attachments.
Resource scope and uploader checks run on retries as on the first attempt.
Resource UUID derivation also canonicalizes the comment UUID's letter case,
matching PostgreSQL UUID identity when concurrent retries use different casing.

Pending/failed drafts contain local recovery actions and are excluded from the
persisted **read** snapshot. They survive route/component changes in the current
browser document, but a full reload does not restore an outbox. This limitation
is explicit: adding durable, account-scoped offline delivery is separate work.
The reference composers used only component `useState` and local upload state,
so they did not provide reload persistence either. The new delivery cache adds
route-survival without weakening an existing durable-draft guarantee.
There is no automatic background retry or offline-success claim.

Regression coverage targets publication before a deferred POST resolves,
composer-independent failure recovery, duplicate manual clicks, simultaneous
identical submissions, ambiguous network failure followed by a confirming GET,
partial attachment recovery, author/entity collision isolation, cancellation of
older reads, logout/cache replacement, UUID validation, and replay side effects.
Browser observations must report initial appearance, composer clear, POST
acknowledgement, and reconciliation separately using `data-comment-state`.

## Search cache and abandoned work

The account-wide title index is already shared, warmed on idle, and refreshed
only when stale on palette activation. Body search is separate and debounced by
220 ms. Source inspection found that its fetch did not consume TanStack's abort
signal and every distinct query inherited the global 24-hour garbage-collection
window and disk persistence. A long editing/search session could therefore keep
many abandoned snippet queries.

Body searches now pass the abort signal, retain the previous useful snippets
while a replacement is loading, and release inactive results after one minute.
They keep their existing 30-second freshness window and are excluded from the
persisted query snapshot. Regression coverage exercises observer changes,
aborted fetches, recent-result reuse, and inactive-cache collection. This is a
bounded-lifetime correction; it is not a measured global-search speedup or a
field-INP result.

## Source-only coverage and retained behavior

- **Authentication:** `getAuthedUser` already verifies JWT claims, using cached
  JWKS/WebCrypto with asymmetric keys (or the SDK's network fallback for legacy
  signing). It then checks live session/MFA/revocation state with
  `auth_authorization_state`. That check must remain current; no authorization
  cache was added to improve a benchmark. Endpoint timing includes this RPC.
- **Stored PR list:** the route reads visible repositories, synchronization
  state/catch-up, the paginated PR list, an optional pinned PR, related runs, and
  the runs' PR-opening events. Most steps have data dependencies. The list is
  bounded and projected; full forge details are separate. No unsupported SQL
  index or speculative cache was added. `refetchOnMount: always` preserves the
  existing freshness/deep-link contract for a list that stops polling at rest.
- **Forge coverage:** the fixture has stored PR records and inert links, not
  credentials. Source inspection of detail, checks, review and synchronization
  hooks does not validate live diffs, remote rate limits, reviews, or writes.
  Existing detail polling follows pending checks; it was not disabled to reduce
  measurements.
- **Pages:** tree summaries already omit document bodies and share one cache per
  project. Document bodies are excluded from localStorage to protect the quota.
  Prepared-editor readiness, the serialized write queue, navigation flush,
  remote merge, and conflict recovery were retained. Source inspection is not a
  real multi-author collaboration, historical-restore, or large database test.
- **Persistence:** the first-pass subscriber coalesces the complete snapshot,
  including serialization/storage, and excludes nonpersistent polls. Its
  microbenchmark used no-op storage. Real localStorage cost, quota behavior and
  the interaction after a delayed flush must be taken from the browser's longer
  observation windows, not inferred from that microbenchmark.

The audit does not separate PostgreSQL execution from RLS with query plans, nor
claim an established backend improvement from a small number of network
samples. Auth/SQL round trips, serialization/payload size, network latency,
rendering and deferred work remain distinct measurements in the main report.

## First second-pass browser series

The initial `pass2-after-a` series (production build
`hUA5E0TrYRkBvuLEAL9Xi`, Chromium 153, normal desktop CPU/network) gives one
separately instrumented Page submission: visual appearance **27 ms**, composer
clear **16.8 ms**, POST acknowledgement **382.7 ms**, and the runner's useful
state including its presentation frames **72 ms**. Neither the submission nor
the following Page-menu interaction recorded a task over 50 ms in their 2.2-second
observation tails. The comment's deferred localStorage write took approximately
**2.7 ms** for a **1.595 MB** snapshot; the following menu's useful state was
**44.7 ms**. These are individual laboratory observations, not percentiles,
field INP, or an established backend speedup. Additional series belong in the
consolidated results.

The same run shows limitations rather than completed backend work. Its full
navigation to the PR list reached the measured useful state in approximately
**1,058 ms**. The list endpoint appeared twice, starting around 228 ms and
898 ms, with durations of 488 ms and 666 ms; projects, billing and several shell
reads were also repeated. This is evidence of remaining startup/restore
redundancy to investigate, not a measured SQL or RLS diagnosis. Ten HTTP 500s
came from the intentionally credential-free fixture's forge-dependent detail,
comments, review, commit and AI-review reads. No browser page error was reported,
which must not be misrepresented as successful live-forge coverage.

After the first tab round trips, connected nodes and listeners stayed stable
across the subsequent fifteen rounds (approximately 29,024 connected nodes and
8,191 listeners). The recorded heap increased from 255.1 MB to 260.9 MB. Stable
DOM and listener counts therefore do not establish zero memory growth or
validate a multi-hour session. The consolidated report must retain the sampling
and garbage-collection conditions when discussing memory.

`verify-comments.mjs` additionally defines controlled browser regressions for
held POST, failed submission across navigation, retry with an existing new
composer draft, explicit discard, and loss of a response after a real commit.
It checks both DOM identity/count and authoritative duplicate counts and cleans
up the known test UUIDs. Until its result file has completed successfully, these
scenarios are planned browser coverage; the focused unit/server regressions are
the completed evidence for those failure paths.

## Network decomposition of the normal A series

These observations compare `pass2-before-a.json` with `pass2-after-a.json`.
The per-interaction resource windows include the useful state and its
2.2-second observation tail. Sizes below are decoded response bodies, not a
claim about internet download cost; both application servers were local and
their Supabase upstream remained remote. Each cold-load comparison has one
sample. Request-count differences can include restore/realtime timing and do
not establish a backend speedup.

| Cold-board observation | Before | After A |
| --- | ---: | ---: |
| Useful state | 2,133 ms | 2,622 ms |
| API resource entries | 40 | 37 |
| Completed entries with a body | 40 | 35 |
| Decoded API response bytes | 5,580,853 | 4,230,217 |
| Full `/api/me/board` responses | 3 | 2 |
| Issue-only `/api/me/issues` responses | 1 | 1 |

Two after entries are cancelled app-tab reads with zero timing/body data; they
are not successful zero-byte responses. Every full board body is 1,327,614
bytes, and the issue-only snapshot is another 1,325,954 bytes. Thus most of
the observed 1.35 MB reduction is one fewer board response. The large initial
issue snapshot remains: its source closes missed-broadcast gaps on mount or
subscription catch-up. Combining it safely with an already-in-flight board
request requires reasoning about snapshot freshness and concurrent writes,
not simply suppressing realtime recovery.

Playwright's request timings separate browser request initiation from response
waiting for the first board read:

| First board request phase | Before | After A |
| --- | ---: | ---: |
| Start after document origin | 238 ms | 624 ms |
| Request initiation to `requestStart` | 0.1 ms | 450.4 ms |
| `requestStart` to response headers | 651.1 ms | 684.5 ms |
| Headers to response end | 0.9 ms | 0.8 ms |
| Complete request duration | 652.1 ms | 1,135.7 ms |

The first phase includes browser scheduling/queueing; it is not SQL time. The
headers wait includes transport to the local application, authentication,
upstream reads, aggregation and serialization. It is not an isolated database
measurement either. The later initiation and larger pre-request interval
explain much of this request's regression, while the headers wait changes far
less. Local response transfer was under 1 ms for both first board responses;
that does not predict constrained-network behavior for a 1.33 MB response.

The optional server observer was restricted to the first four seconds after
each cold document origin: **11:55:59.080–11:56:03.080 UTC** before and
**12:12:59.161–12:13:03.161 UTC** after, on 2026-09-20. It records upstream
fetch completion times and headers-ready duration, without request bodies or
query strings. The mixed-run files were not aggregated as whole sessions.
These windows contain 143 and 130 upstream completions respectively. The live
`auth_authorization_state` RPC accounts for 40 and 37 calls, with median
headers-ready durations **75.4 ms** and **76.0 ms** (ranges 61–141 ms and
58–306 ms). This is a stable median in two small cold-load windows, not evidence
for caching authorization or for improved authentication. The three and two
`issue_relations` REST reads take medians 356.6 ms and 421.9 ms; their query
parameters and parent requests are deliberately absent from this observer.
These combined transport/PostgREST/database timings identify an investigation
candidate, not an identified SQL/RLS bottleneck or justification for an index.
Parallel upstream durations must not be summed into a page latency.

The five warm board returns made **no board or issue data requests in either
revision**. After round four contains one unrelated billing-usage request.
Both revisions still show two `/all` route resource entries per return. The
board gains therefore come from client rendering/lifecycle changes; they are
not explained by removing a board fetch that previously blocked activation.

The five warm Page returns fetched the same 28,832-byte document four times
before and twice after (roughly 175–207 ms and 181–188 ms). The sequence is
shorter after the client changes, so it crosses fewer freshness boundaries;
this is not evidence that the document endpoint became faster. The older
sequence also crosses a search-index refresh and Page event/backlink refresh.
Neither sequence triggers full project Page/objective lists or forge detail
reads during these warm returns. Route resources and project realtime-topic
resolution remain. The new tab-metadata endpoint's narrow projection is
covered by source/regression tests; these specific restored board/Page tabs
do not exercise issue/PR metadata fetching and cannot prove its network gain.

## Assistant history restoration race

A mobile Chromium correctness run exposed a real, pre-existing focus race.
Opening Conversations while the initial active-conversation read is pending
can open the history and then immediately dismiss it when the restored empty
composer mounts and autofocuses. The exact reference build reproduces this
with `verify-surfaces.mjs --mobile --restore-race`: the harness holds the real
active-pointer GET response until history has opened, without replacing its
contents or sending an assistant prompt. In
`pass2-surfaces-mobile-baseline-race-open-state.json`, focus moves from the
history filter to the composer without another click; the trigger becomes
`aria-expanded=false` and the popover is removed. Fixture cleanup succeeded.
`ChatInput`'s existing `useEffect([noBorder])` autofocus is the source cause;
the affected assistant shell/input were not changed in this performance pass.

The initial harness could falsely pass by seeing the empty-history text during
the popover's exit animation. It now also requires `data-state="open"` after
the composer restores. Normal surface smoke explicitly waits for that restored
composer before opening history; `--restore-race` remains a separate failing
regression that documents the early-interaction defect. A successful settled
smoke must not be reported as a fix or successful coverage of this race.

## Mobile and WebKit surface verification

`pass2-final-surfaces-mobile.json` passes on the production candidate with a
390 × 844 Chromium touch viewport. It verifies the complete 80-block Page,
its last paragraph, menu, four stored comments, composer and versions list,
plus the assistant panel and settled empty history. The responsive layout
does not expose the desktop sidebar toggle; that control is recorded as
unavailable rather than counted as exercised. No assistant message was sent.
The history screenshot was visually inspected with the popover fully open.
This is emulation, not a physical phone test.

`pass2-final-surfaces-webkit.json` records WebKit 26.6 at 1440 × 1000. The same
Page checks, desktop sidebar restoration, settled assistant history and native
issue-title sizing pass. The title grows from 60 px to 870 px for the long
fixture draft and shrinks to 30 px when shortened; `field-sizing: content`
is supported. Expanded and shortened screenshots were inspected, and the
original title was restored before blur without a changed-title server write.
The actual Safari application was not launched.

The first broad WebKit route sequence is retained as a failed result: moving
immediately from Home to the legacy Inbox URL reports six errors on outstanding
project RSC prefetches (`access control checks`). It must not be described as
a successful rapid-navigation test. A baseline replay additionally exposed a
harness readiness error: `/home?inbox=1` is an intermediate URL; `InboxPopover`
opens the Inbox and replaces it with `/home`. Advancing before that replacement
could interrupt the next navigation. The runner now waits for the final URL
and open Inbox, and settled route smoke explicitly waits for network idle.
`--rapid-routes` keeps the separate interruption scenario available.

With those settled criteria, the reference build passes eight route checks
(Home, Inbox compatibility, routines, account/cycle settings, project objectives,
triage and agents compatibility) with no page errors. Its result remains
**failed overall** because the fixture guard detected that the old application
changed an existing test tab's href during the sequence. Only that known href
was restored with its current revision after confirming it still matched the
unexpected value. The deterministic temporary tab was removed; no personal
data was involved. The guard result is retained in
`pass2-baseline-surfaces-webkit-settled-routes.json`; it must not be promoted to
a fully passing run. Final-candidate settled routes remain for a separate run.
