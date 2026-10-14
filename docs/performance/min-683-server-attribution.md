# MIN-683: server attribution and initial-load cache decision

This resumed-session review reads MIN-683, its ordered plan, MIN-614, the session
checkpoint and the architecture report before proposing a server change. It
does not implement a server cache, alter the fixture, apply a migration or claim
that database execution is the dominant delay. Root owns all timed UI work;
source inspection and analysis of already retained evidence do not compete with
that work. MIN-683 remains in progress.

## Identified evidence and attribution boundaries

The four admitted control observations below come from the retained excluded
`min683-restored-after-all-startup-before-protocol-diagnostic-{web,native}-1.json`
records under `output/playwright/performance`. Both records identify source
`7ba0e3181e17ef71c2fcd187c8efd328d610e05f`, build
`MBwOTC-9Laqpi-vCTq3u1`, the same environment-file fingerprints and the marked
Performance Tester cohort. Every board response proves 1,206 unique complete
issues / 1,086 cards, HTTP 200 and fixture preservation. These are historical
measurements, not new measurements of current `Qp1Rr4apU_XHLQh2IVfT6`.

| Phase, ms | Web launch | Web refresh | Native launch | Native refresh |
| --- | ---: | ---: | ---: | ---: |
| Auth/live session and MFA | 61.2 | 60.5 | 66.7 | 66.1 |
| Two issue PostgREST calls, accumulated | 1,067.9 | 1,173.4 | 991.7 | 917.5 |
| Protected issue decoding/projection, accumulated | 31.4 | 29.1 | 28.9 | 29.4 |
| Members, following collection barrier | 135.3 | 124.1 | 206.0 | 139.2 |
| JSON serialization | 8.3 | 8.5 | 10.6 | 11.0 |
| Complete route total | 1,310.1 | 1,401.9 | 1,309.4 | 1,168.6 |

`issues_db` wraps the Supabase/PostgREST promise through response parsing. It
includes database authorization, actual SQL, PostgREST processing, server-to-DB
transport and JSON parsing. It does **not** isolate PostgreSQL execution.
`issues_decode` includes repository validation, envelope parsing, key lookup or
cache reuse, AES/HKDF work and protected projection. Neither phase proves that
cryptography or SQL is the cause of a particular UI delay. Parallel phase
durations cannot be summed to reproduce the route total.

The collector's CDP request timing also separates admission from the server:

| Request interval, ms | Web launch | Web refresh | Native launch | Native refresh |
| --- | ---: | ---: | ---: | ---: |
| Request start to wire admission | 1,014.9 | 740.5 | 737.8 | 618.5 |
| Wire request to response headers | 1,311.9 | 1,403.6 | 1,310.7 | 1,169.8 |
| Header-to-body completion | 6.3 | 6.1 | 16.8 | 9.6 |

The admitted interception protocol affects scheduling; its pre-wire interval is
not ordinary UI latency and cannot be assigned to TCP, preload ownership or a
particular browser queue from these records. The approximately 1.2–1.8 ms
difference between local wire-to-header and route-total clocks is not the
server-to-PostgREST transport cost, which is already inside `issues_db`.
Response bytes were not recorded by that historical collector; neither
cached-object budget estimates nor small body-transfer intervals are
payload-byte evidence. The coordinated resumed-session measurements below
supply current-build payload evidence separately.

The measured member tail justified the earlier overlap experiment, whose source
and admitted `E3ZnePxMEhwQ2_V-VuFUO` traces remain retained. Ordinary first-click
regressions caused its rejection. This review does not reinstall it or present
its excluded route saving as an accepted performance improvement.

### Resumed current-build API and DB attribution

After root released the UI clock and the DB agent released its isolated network
window, `scripts/performance/min683-server-payload.mjs --run-diagnostic` ran
sequential authenticated local API reads on port 3111, actual source
`3692e7549060f8b682ec99865757a65c5e92a4e2`, build
`Qp1Rr4apU_XHLQh2IVfT6`. It verifies the exact Performance Tester identity and
marker, disables any cycle-mutating board path by requiring cycles to be off,
compares the complete issue source against the new ordinary native handoff
record, and exports only metadata/digests. No forge request or product mutation
is requested. The successful excluded record is
`min683-server-payload-2.json`, SHA-256
`5f923c88c9f2247e6179659ab6d9614c91a985665c4ee3918c408d9ea6727362`.
Both raw metadata records, their source/file hashes and the discarded attempt's
reason are reviewable in [server results](min-683-server-results.json).

| Exact ordinary response | Decoded JSON bytes | Headers/body complete, ms |
| --- | ---: | ---: |
| All: 1,206 issues and full board enrichment | 2,441,996 | 2,518.0 / 2,522.0 |
| Primary project: 670 complete issues | 1,197,717 | 607.4 / 609.1 |
| Primary categories: 6 | 1,458 | 189.3 / 189.9 |
| Primary objectives: 30 | 30,842 | 197.1 / 197.5 |
| Primary members and invitations/owner state | 255 | 213.0 / 213.7 |
| Primary integrations/owner state | 34 | 243.5 / 244.3 |
| Primary issue relations: empty | 2 | 149.6 / 150.0 |
| Primary complete Page tree: 20 | 14,152 | 376.9 / 377.1 |
| Primary listed Page: 80 blocks | 28,948 | 333.7 / 333.9 |
| Foreign listed Page: 80 blocks | 28,945 | 316.9 / 317.2 |

These are exact decoded response bytes (`Accept-Encoding: identity`, no content
encoding returned), not an estimate of query-cache occupancy or encrypted DB
response bytes. The successful run verifies unchanged ten-tab payload, Page
bodies/versions, complete issue content and compiled product at the end. Its
first attempt remains failed: the collector used the nonexistent `/relations`
path instead of ordinary `/issue-relations`. That read failure is a collector
mistake, not an app regression. It is retained and excluded; the successful
second record does not rewrite the failed first.

The admitted All response reports auth 64.1 ms, two issue PostgREST calls
2,037.7 ms, protected issue decoding/projection 37.9 ms, member tail 348.5 ms,
JSON 18.4 ms and route total 2,514.7 ms. The issue field alone is 2,395,669 bytes,
98.1% of the decoded board body. All 670 primary project issue IDs also occur in
All, yet only the ordinary project response has `resource_count`; the probe
directly confirms that missing DTO parity.

The [DB attribution report](min-683-db-attribution.md) records separate bounded
authenticated/RLS, read-only warm-buffer plans. These measure global/project
exact count execution at 1.78/1.22 ms and complete
protected projection/category-link execution at 12.74 ms for the first 1,000
global rows / 13.01 ms for 670 project rows. Actual authenticated PostgREST
global collection reads take 767.7/552.0 ms over two runs and return 3,428,471
encrypted bytes; project reads take 284.1/588.8 ms and return 1,700,890 encrypted
bytes. These boundaries establish a substantial gap between warm SQL execution
and API delivery without assigning the full gap to any one cause. The exact
PostgREST outer JSON aggregation/count wrapper is materially different from
that row-returning SELECT; its captured historical mixed-cohort execution is
not a fixture measurement. A subsequent bounded plan of the actual wrapper
under fixture-authenticated RLS measures 62.069 ms execution / 5.812 ms planning
for the global first page, including outer encrypted JSON/count production.
It observes 11,274 shared hits and zero reads. Project/cursor outer wrappers
remain unmeasured. The separate deployed live session/MFA pre-request SQL hook
executes in 14.370 ms / 0.053 ms planning under the actual fixture JWT, with
2,032 shared hits and zero reads/writes. It excludes gateway JWT verification,
Next authorization and transport. The row-returning 13 ms result alone is not
the complete database-side JSON cost; these independent executor observations
are not interchangeable with an admitted route phase.

The All route starts categories/objectives/relations concurrently and uses its
server client's transport while the isolated PostgREST probe has a different
admission/load context. The equivalent SQL plans also do not include the
PostgREST pre-request authorization/MFA boundary. Subtracting either independent
13 ms row plan or 62 ms wrapper plan from the 2,037.7 ms route phase would
manufacture an exact transport cost.
The evidence supports investigating actual server-to-PostgREST admission,
authorization and response serialization/transfer together, then a bounded
single-authorized-request bootstrap. It does not support a new index or a
decode cache as the first remedy. Neither sequential sum of seven API calls nor
`60 ms × 7` estimates the saving from a batch: ordinary preparation uses two
slots, and sharing admission changes the concurrent workload.

## Current bootstrap and duplicate-read contracts

`app/(app)/layout.tsx` carries metadata/catalog and client providers; it supplies
no authorized initial view bundle. `app/api/me/board/route.ts` authorizes once,
performs cycle reconciliation first when enabled, then starts issue, authorized
project, category, objective and relation reads together. Members and
integrations start after that collection barrier. `ensureCycles` can mutate
product state; a read-only SQL diagnostic must not call it. A cache hit cannot
silently skip reconciliation and pretend its old cycle assignment is current.

Every ordinary protected API request calls `getAuthedUser`, verifying claims
and then the live refresh-backed session/MFA RPC. The roughly 60–67 ms control
auth span is a per-request observation, not a predicted saving from removing
checks. Cross-request authorization reuse would reopen logout/MFA revocation.
`projectName` already uses React request-local cache for duplicate metadata
reads within one render; that cache is not an authenticated view bootstrap and
does not persist across route-handler requests.

| Source and possible consumer | Missing parity before reuse |
| --- | --- |
| All issue rows → project issues | The complete project DTO adds actual issue-level `resource_count` from an independent, RLS-scoped attachment read. All contains no such count. Exact living/trashed/project scope, final order and concurrent-read provenance still need proof. |
| All members → project member query | The project response adds invitations and `isOwner`; invitations are owner-only, unexpired and independently decrypted. The living-project authorization/error contract also differs. |
| All categories/objectives → project lists | Query ordering, whole-collection completeness, deletion/empty/denied scopes, accepted read-start and optimistic overlays differ. A visible bucket alone cannot certify the ordinary scoped query. |
| Existing key cache → decoded DTO cache | DEK identity is immutable scope + key version. A DTO includes mutable rows, permission scope and collection completeness; the key cache is not evidence that those can be cached under the same policy. |

`loadProjectIssues` and `loadProjectObjectives` use complete UUID keyset readers
with exact remaining counts; project member/invitation readers also preserve
completeness under lower row caps. Whole-read failures cannot publish truncated
success. The global category/objective/relation and member/integration readers
still have their own limit/error contracts. Expanding their completeness is a
separate correctness task, not a safe opportunity to manufacture parity.

`ManagedDataKeys` already single-flights missing versioned keys, caps resident
keys and zeroes discarded buffers. Every write still checks the current key
registry to observe rotation from other processes. This review retains those
guarantees. The identity cache in `auth-users.ts` is a process-local 60-second
best-effort display-name cache; avatars read the database. Neither provides a
durable cross-instance invalidation protocol for protected view data.

## Decision: no cross-request protected DTO cache in this increment

A longer TTL or a process-local invalidation map cannot satisfy the requested
initial-load coherence. Current browser realtime invalidation and subscription
catch-up do not prove that a server instance observed every remote mutation;
another server, worker, webhook, import or database write can bypass a local
map. An instance can also miss events while restarting or disconnected.
Account/project keys without permission generations would keep revoked rows
available. The concrete decision is to preserve normal reads and document the
protocol prerequisites before implementing cross-request view caching.

A reviewable future cache contract is:

1. **Canonical scope and identity.** Key each entry by deployment/database
   identity, reader schema/DTO version, authenticated account, exact project or
   authorized project-set identity, collection filters/order, permission epoch,
   data epoch, timezone/cycle preferences where relevant, and encryption-policy
   version. Store complete accepted collections only. Row identities retain
   real versions/revisions and full PostgreSQL timestamp precision. A collection
   epoch, not its largest row timestamp, covers insertions, deletions and joins.
2. **Durable changes and snapshots.** In the same transaction as every relevant
   committed write, advance durable project/account/permission epochs and append
   an authorized invalidation record. Cover links, attachments, memberships,
   ownership, trash, invitations, user identities and affected aggregate scopes,
   including direct database, worker, forge and import paths. Do not add this
   protocol only to browser mutations. Read a coherent snapshot under the real
   user's authorization and pair the collection with those epochs. Independent
   PostgREST calls are separate snapshots; a before/after token check needs a
   bounded retry and publication fencing, or a single snapshot reader. It must
   not silently bless mixed generations.
3. **Live authorization remains first.** Check the live session/MFA and current
   membership/permission epoch for every delivery. Scope rows to current RLS or
   audited explicit authorization before opening any cached protected content.
   On revoked/unknown access, suppress cached content, stop preparation and
   purge that account's client display data through the existing denial path.
   Cache residence is never an authorization grace period.
4. **Between instances.** All instances validate the same durable epochs before
   serving; pub/sub only accelerates eviction. A missed event, stale local
   watermark or unavailable epoch store falls back to the ordinary protected
   read or explicit unavailable response. A compare-and-publish fence prevents
   an old in-flight loader from reinstalling a generation already invalidated
   by a later commit. Process-local single-flight is an efficiency aid only.
5. **Read-start and client acceptance.** Retain the actual snapshot/read-start
   generation and each exact query's DTO identity. Do not replace timestamps on
   cache delivery or mint a current authoritative Page receipt. Preserve initial
   subscription catch-up and reconnect invalidation. A new client still needs
   a consistent baseline/watermark handshake; receiving a fast cache response
   before that handshake does not make all listed tabs prepared.
6. **Optimistic writes and drafts.** Cache canonical committed data only. Client
   optimistic overlays remain separately ordered per account/query and survive
   a baseline refresh; failed writes roll back to the newest accepted canonical
   baseline. Mutation acknowledgements advance/invalidate the durable generation
   before publishing success. Older reads/ACKs cannot overwrite newer accepted
   versions. Page/editor writes continue to obtain a current authorized base,
   retain version checks, three-way merge/conflict behavior, autosave departure
   and pending drafts. Cached display is never a fresh write basis. Partial
   encrypted writes still merge against a fresh complete revision-checked row.
7. **Encryption and budgets.** Persistent or shared cache values retain the
   current encrypted storage protections; no plaintext Redis/disk snapshot or
   browser decryption key is introduced. Admission remains byte/row bounded and
   complete-collection eviction is explicit. In-memory decoded residence needs
   a reviewed lifetime/cleanup policy and cannot extend DEK or authority trust.
   TTL may bound memory use, but never replace epochs, revocation or invalidation.

No such durable cache baseline/access-epoch infrastructure was established by
this source review. This is a strategy and rejection of an unsafe shortcut,
not a claim that all prerequisites are implemented or that cache latency has
been measured.

## Bounded next server increment and acceptance

The first server candidate worth isolating is an exact project bootstrap bundle
through one live authorization boundary and the existing ordinary complete
readers. It can remove redundant session round trips without inferring project
counts/permissions from All. Bundle admission must respect the existing finite
client transport owner, per-reader errors, exact query receipts, cancellation,
initial invalidation and current Page write gates. Bound server fan-out and
payload rather than starting every read at once. A bundle that holds useful
small results behind a long issue/forge read can worsen preparation and must
not be retained from source reasoning alone.

Only after measured duplicate transport/payload cost establishes a benefit
should an authorized **request-local** issue-row single-flight be considered.
It must augment actual attachment counts and preserve exact scopes; it cannot
cross request/session boundaries or relabel an aggregate slice as an accepted
scoped query. Reducing protected projections requires codec-safe schema/field
parity and write-base review, not simply deleting descriptions or plans from a
DTO whose consumers require them.

Record the selected exact functions and measured diagnosis in plan task 58
before implementation. Compare immutable identified control/candidate products,
same marked fixture and independent first activations at three seconds. Collect
complete usable content, first clicks, visible loading, admitted request counts,
wire/body bytes, server phases and main-thread work separately. Run no API probe,
test or build during root's UI clock. Reject reduced initial cost that worsens
listed first clicks. Authenticated RLS execution plans and exact payload probes
remain distinct from this historical attribution; service-role SQL does not
certify the user path.

## Documentation impact and remaining limits

This report changes internal investigation documentation only. It adds no
runtime behavior, control or public storage guarantee; no public article or
figure change is required. The parent change runs documentation, knowledge,
owned-English and diff checks before publication. Current-build exact bytes and
an admitted All phase trace are established; a coherent server bootstrap/cache
implementation, cold DB/instance attribution and ordinary before/after benefit
remain unvalidated. MIN-683's all-tab/first-click/focus/write acceptance remains
open.

## Independent readiness-batch quota correction

The preview investigation identifies a separate reproducible source contract:
`prReadinessBatchResponse` previously caught real forge errors, recorded only
`unavailablePrIds`, and returned HTTP 200 without the upstream `Retry-After`.
Its policy/check/review/thread branches also swallowed quota failures into
best-effort readiness. The mounted batch hook consequently polled on its normal
15/60-second cadence. A 125-second deadline produced five actual mocked fetches
before 124.999 seconds. An HTTP-error batch had the same early-fetch gap:
TanStack clears the query's own error before invoking its next query function,
so the old account scan could no longer find that pause during a refetch.

Root recorded this measured behavioral diagnosis and strategy in MIN-683's
plan before production changes. The clean unchanged-source red record is
`min683-readiness-quota-red-2.log`: 11 failures and one ordinary unavailable
control pass. The earlier red record remains retained; its first two worker
tests timed out because the test had not yet drained unstarted deferred mocks.
The corrected red harness asserts the sixth unauthorized start directly and
drains all mocks in `finally`; neither attempt changes product or fixture data.

The narrow correction preserves the existing four-worker bound. After a known
429, or 403 carrying `Retry-After`, the batch admits no further PR or dependent
check operation and drains every already-started worker. Complete accepted rows
remain in the HTTP 200 partial response, while affected and unstarted rows are
explicitly unavailable. The response carries the longest observed anchored
deadline as `Retry-After` plus typed `retryStatus`; a propagated error cannot
restart its original deadline. Ordinary forbidden-without-deadline, 404 and
unknown failures retain their existing unavailable contract and do not become
ready. The optional batch error/gate callbacks leave ordinary detail reads'
best-effort behavior unchanged.

The client anchors the successful partial response's deadline once and retains
plain numeric metadata in query data. Generated quota errors stay in WeakMaps,
outside the persistable cache payload. The account QueryClient retains its
observed maximum pause until the absolute deadline, so focus, invalidation,
activation and remount cannot bypass it when a query clears its transient error.
A replacement account client inherits no pause. Batch polling wakes at that
deadline before resuming its ordinary cadence. This changes transport admission
only; it grants no cached content freshness, permission or write authority.

Owned production changes are limited to `lib/server/agent/pr-actions.ts`,
`lib/server/git/forge-actor.ts`, `lib/agent-api.ts`, `lib/pull-request-query.ts`
and `lib/use-agent-runs.ts`.
Meaningful new tests are `lib/server/agent/pr-readiness-batch.test.ts` and
`lib/pr-readiness-batch-quota.test.tsx`. They exercise deferred worker draining,
partial success, all four swallowed quota branches, longest deadlines, HTTP
dates, missing/invalid fallback deadlines, focus/invalidation/remount,
plain restored metadata, account isolation and non-sliding error propagation.
Existing detail/deployment, readiness, installation authorization and GitHub
single-flight suites are included: the initial correction passes 71 cases across
seven suites, including 19 new cases before the actor follow-up below. Full
TypeScript passes; the repository's
scoped `npm run lint` passes. The initial ESLint command was the wrong linter
for this repository and failed before checking source; the corrected oxlint
result is retained separately.

This independently validated correctness bug is not a diagnosis of the user's
actual preview incident or a latency result. Mocked quota responses do not prove
that preview PR420 exhausted GitHub quota; the tester's actual inaccessible
repository response cannot establish it either. Root must identify/build the
quota candidate and complete its separate runtime/ordinary comparison before
claiming any runtime benefit. The public manual specifies no batch interval or
quota behavior changed here, and existing unavailable behavior remains accurate;
no public article, illustration or invented review date is needed.

### Actor lookup follow-up and strict cached-display boundary

A root source review identifies an additional actual batch path: the scoped
actor catches errors, and `fetchCapability` normally degrades a 403/429 to
uncached read capability without notifying the batch. A capability request can
also start after waiting for identity while another worker has already observed
quota. The actor follow-up's unchanged-source red log is
`min683-readiness-actor-quota-red.log`: eight behavioral failures / fourteen
passing cases. It distinguishes real GitHub/GitLab post-identity probe starts,
actual quota headers and primary-rate reset, swallowed actor failures and the
scope-to-actor admission wiring.

The optional, request-local `ForgeActorReadControl` is supplied only by the
authorized readiness batch. It gates actor operations after identity lookup and
before capability probes/forced rotation, reports actual quota status and
`Retry-After` (including GitHub's primary reset), and lets the scoped batch retain
those failures as explicit unavailable rows. Already-admitted identity work is
drained; the control does not cancel or roll back an in-flight token refresh.
Ordinary actor reads and human write paths receive no control and preserve
their previous fallback, token rotation, capability-cache and authorization
contracts. New `lib/server/git/forge-actor-read-quota.test.ts` plus the existing
batch test verify both providers, error propagation, the actual notification
wiring and a forbidden token's second capability probe after rotation. The
final focused actor run passes 89 cases across nine suites, including 32 new
cases; full TypeScript, scoped oxlint and owned diff checks pass.

The synthetic account pause retains the existing strict PR read boundary.
Read-state helpers treat all failed reads as errors regardless of HTTP status
or code; they do not infer permission revocation or purge cached data from the
synthetic 403. `QueryReadBoundary` hides/inerts the existing contents while
keeping its DOM, query data and drafts mounted. A same-session cached detail is
therefore not visible/interactive during that failed paused read. This is an
explicit UX limitation, not a new display or write authority: actual permission
denials remain blocking, and no synthetic-error display override is installed.
