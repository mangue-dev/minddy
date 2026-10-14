# MIN-683: preparation and recovery integration review

This source review resumes the existing MIN-683 branch. It reuses the session
checkpoint, bounded bootstrap review, architecture report and retained v8 and
rapid-selection evidence. The preparation agent ran no browser, benchmark,
test, build, database probe or fixture mutation. The root agent owns integration,
checks and all timed UI observations.

## Narrow bootstrap integration

`lib/use-prefetch-project.ts` builds the ordinary seven-key project preparation
sequence: issues, categories, members, objectives, relations, integrations and
views. `lib/pr-tab-preparation.ts` registers each exact read before calling
`fetchQuery`, retains two scoped slots until operations actually settle and
protects selected reads before their observers commit. Keep this admission,
the restored startup reservation and selected-read handoff unchanged unless an
identified control/candidate comparison justifies a distinct change.

The narrow objective/member transport should live behind those exact query
functions. Its result must resolve the ordinary TanStack query operation;
publishing with blanket `setQueryData` would bypass operation ownership,
cancellation and acceptance. Foreground observers may join the same query.
There must be no completed DTO cache, TTL extension, All-list promotion, Page
receipt or additional write authority.

The two candidate readers are not adjacent to startup admission: issues and
categories occupy the first two slots. Members and objectives may start on
different turns as those operations settle. Sharing only already admitted
reads can consequently produce one-reader streams with no authorization
saving. Evidence must record actual requested reader sets and request counts.
Fetching a sibling before it owns a query and a scoped slot is a separate
admission change, not harmless transport deduplication.

The initial candidate was narrower: only a listed normal member read whose
next pending prerequisite is objectives in the same project can form a pair.
Both slots must be free, neither key may already be fetching or paused, and
both keys must lack data or be explicitly invalidated so `fetchQuery` actually
runs their query functions. Optional neighbors stay on ordinary APIs. An
intervening eligible read, occupied slot or mismatched project keeps the
original sequence. The pair has preparation lifetime ownership and is disposed
after both exact operations settle or when that lifetime retires. It introduces
no intentional waiting window to manufacture a shared request. The focused
integration suite checks admission, independent settlement, original order,
project isolation and disposal; root runs it outside timed measurements.
Each one-shot wrapper restores its ordinary cached query function synchronously
after its first actual join, while the stream may still be pending. Restoration
also runs if that join throws; it compares function identity and keeps
newer foreground observer options. Four additional real QueryClient cases
cover inactive refetch after completion, old-client refetch after retirement
of invalidated cached entries, foreground options takeover and a synchronous
success-listener refetch. A repeated invalidation cannot reuse the temporary
wrapper even when TanStack emits no new event. Without this restoration, later invalidation
could reuse a disposed one-shot function stored in TanStack query options.

Root's identified corrected `98e236` candidate emits no bootstrap request in
any of the nine independent web cases. That admission is rejected as a
performance increment: code correctness without actual shared transport does
not establish an authorization saving.

The next hypothesis, recorded in issue plan task58 before code changes, bounds
two physical HTTP transports rather than two TanStack owners. One existing
ordinary normal read can coexist with the exact member/objective pair, yielding
three registered query owners and two client transports. The server pair still
has at most two readers; only one pair may exist. Queued ordering remains
unchanged, and no unrelated work waits to manufacture a pair.
Optional neighbors and forge companions cannot trigger pair admission.

The retained admission is further limited to data-absent, currently
noninvalidated idle keys. Cached keys and already invalidated keys, including
invalidated empty keys, stay on their complete ordinary readers. TanStack's
`Query.invalidate()` emits no new event while `isInvalidated` is already true;
the preparator cannot infer every generation from that event stream. Tests
cover this exclusion and an actual cold pair that acquires cached data before
inactive `invalidateQueries` with `refetchType: "all"`. It replaces the
unprovable claim that seeded, already invalidated cache entries can safely
join the one-shot cohort.

The preparator atomically registers both pair owners and their priority before
the first fetch. A dispatch marker prevents the second preadmitted owner from
being blocked by the physical-slot cap. The pair owns one physical unit until
both exact operations settle, including cancellation settlement; completion of
its first frame cannot release that unit early. Selected foreground ownership
continues to protect each exact query separately.

Declared owners alone do not prove query-function joins: a synchronous listener
can navigate, hide, invalidate, remove or warm a sibling before its dispatch.
The coordinator's synchronous `finishAdmission` verifies actual joins. An
incomplete cohort is disposed, its joined operation is canceled with ordinary
reversion, its never-dispatched ownership is removed, and temporary query
functions are restored. A newly accepted cached sibling remains accepted. An
interruption before either dispatch removes the pair's physical membership
without waiting for nonexistent completion callbacks. No automatic ordinary
fallback hides a real transport, authentication or reader error.

A bounded parser size refusal is a separate legitimate-input case. Only the
coordinator's exact `ProjectBootstrapLimitError` may restore and invoke the
original complete ordinary reader while its owner is still live and its signal
is not aborted. If both resources exceed the stream bound, their ordinary
fallbacks serialize within the pair's reserved single physical unit, preserving
the two-transport cap alongside an existing issue read. The original query
functions capture their own actual request starts. Denial, account changes,
cancellation, malformed or truncated streams and ordinary reader errors remain
explicit failures with no fallback.

The pair's exact cache-generation fence remains subscribed through ordinary
size fallback, even after the stream coordinator has unsubscribed. It checks
the resource generation before queued dispatch and before accepting the full
ordinary response; a later inactive invalidation cannot disappear under that
late result. Invalidation also synchronously restores only that resource's
temporary query function before `refetchType: "all"` can reuse it. A subsequent
fetch on a new generation is foreground replacement work, not the old
preparation owner. Old bookkeeping retires without canceling the replacement
operation, and observed healthy sibling ownership remains protected.

Every new non-preadmitted read rechecks visible/online/foreground admission
within the same pass. A first-read listener that starts unrelated foreground
work cannot cause the remaining loop to admit a new speculative pair. Already
declared sibling owners retain the explicit join/retirement path. The two-slot
bound concerns scoped preparation; legitimate foreground reads retain their
ordinary authority and trigger yielding of unrelated speculation.

Focused integration cases cover three-owner saturation, independent-frame slot
retention, prevention of a second pair, original ordering and project scope,
exact selected-owner protection, first-fetch and pre-dispatch priority
interruption, freshly cached unjoined siblings, invalidation epochs, disposal,
ordinary refetch restoration and foreground options takeover. Root must run
these and measure actual pair admission before retaining this increment.
Additional cases distinguish bounded-size complete-reader fallback from denial
and malformed-stream errors and verify fallback transport serialization.

## Exact default shell PR-list overlap increment

The root agent's corrected evidence reading identifies three bootstrap attempts
in the `783cf10` independent web cases, one per case. The primary Page case has
all four scoped prerequisites successful at three seconds, including members
and objectives; those two reads are still fetching in the other two cases.
Every HTTP request ends with `ERR_ABORTED`, which does not establish resource
failure: after both resource owners succeed, pair disposal can abort the
remaining response body. Native evidence contains two attempts in three cases;
the primary Page case has successful objectives and pending members at three
seconds. The earlier `98e236` nine-case web cohort contains no bootstrap request.
These observations establish neither a causal performance gain nor a general
accepted bootstrap saving. Request termination, accepted resource metadata and
first-activation timing must be evaluated separately.

The next bounded admission hypothesis is recorded in issue plan task58 before
the change. `AppTabsProvider` mounts `PrBackgroundSync`, which unconditionally
observes `useAllPullRequestsQuery()` under the exact default key
`["pull-requests", "all", "open", 100, null, null]`. This full authorized list
discovers five recent PR background owners; it is not the badge query. Sidebar
and tab-strip badges use the separate `["pull-requests", "open-count"]` key.

The candidate leaves the full list request, DTO, permissions, errors, polling
and Retry-After behavior unchanged. Only the preparator's `otherTransport`
classification changes: that exact default list may overlap scoped preparation
when the current active tab is a valid known destination outside Pull Requests.
An unknown or uninitialized active route keeps the ordinary gate. Visible PR
routes, pinned lists, expanded lists, completed lists and unknown query shapes
retain foreground priority. A route selection restores that priority before a
new foreground observer mounts. Active query hashes alone cannot distinguish
the pinned/expanded foreground list from the shell's default observer.

The exact exception also applies to a cold list with no cached data; adding its
key to the existing healthy-only shell summary set would not address the
observed cold gate. All's board/view reads and other foreground work still block
preparation. Existing startup reservation, selected-read protection, two scoped
physical slots and one member/objective pair remain unchanged. This permits
one ongoing shell request plus two scoped HTTP transports, not a universal
two-request limit. Other background PR owners keep their existing admission and
account read budgets.

Regression cases hold the actual default reader alongside two scoped reads,
preserve its complete response and signal, retain All's transport gate, reject
nondefault keys and unknown/visible-PR destinations, restore foreground priority
before observer adoption, and retain an explicit Retry-After failure. Root
must compare identified products on unchanged data, measuring startup and first
project/Page/PR activation before accepting any speed or completeness claim.

`lib/client-read.ts` buffers the complete body before checking the account and
returning a reconstructed response. It cannot deliver independent frames.
A streaming helper must bound the entire read, consume the query signal,
validate the current account before accepting each frame, limit frame and
response sizes, reject malformed/duplicate/unknown/truncated frames explicitly,
and remove timeout and abort listeners. One slow or failed reader must not
hold an independently completed small reader.

Use a coordinator scoped to the exact QueryClient and project. Only registered
in-flight resource owners may join. Capture per-resource invalidation/removal
generations; checking only the current `isInvalidated` Boolean cannot identify
which request preceded an invalidation. A later generation must not join an
older stream or accept its delayed frame. Canceling one owner rejects or
discards that owner's result while preserving another retained owner's read;
abort the underlying request when the final owner retires. Clear every resource
when the stream settles, including explicit errors and parser failures.

`objectivesQueryFn` captures `Date.now()` before its ordinary request and passes
it to `applyPendingObjectives`. Preserve the original admitted read start when
using shared delivery; a frame arrival timestamp would incorrectly change the
optimistic overlay boundary. Members preserve the full `MembersResponse`,
owner/member permissions and invitations. Initial realtime catch-up and exact
invalidation stay active; no successful bootstrap frame overrides them.

`AccountQueryProvider` replaces `AppQueryProvider` by account key. Normal
`AppQueryProvider` effect cleanup stops persistence but does not clear its
QueryClient; explicit logout retirement does clear it. A coordinator attached
only to cache-removal events therefore lacks a complete unmount/account fence.
Its disposal must be explicitly owned by the client/provider or by every joined
consumer lifetime, with effect replay handled without reviving a retired owner.
Old-client frames cannot enter a replacement client's queries.

## Complete destination coverage

The existing manifest prepares project boards with all seven exact reads;
Page destinations add body/tree and project issue/member/objective dependencies.
Triage, objectives and feedback discover selected detail readers only after
their healthy ordinary scoped source succeeds. They rebuild dependencies after
ordinary source settlement and pending insertion settlement. Preserve complete
source lists, exact selected identities and those source-owned transitions.
Forge reads retain account Retry-After and serial detail ownership.

The readiness predicate is not sufficient evidence for all ten complete tabs.
`isPreparedAppTabDestination` accepts Home once public code is ready without
checking even its listed invitation query. Home also renders authorized
projects, triage counts and smart-assignment warnings, usually supplied by the
shell. Their actual availability and full visible content must be observed
before claiming complete Home preparation. Home's composer loads mentionables
on typing intent; this is distinct from its initial complete surface.

Routines preparation includes its list, agent capabilities/models and an
explicit URL-selected routine's runs. `/routines` does not automatically select
the first routine. Its detail and creation wizard are separate dynamic chunks;
the panel's idle preload runs only after panel mount. A populated list therefore
needs a content check, and a realistic first routine interaction separately
needs the detail chunk and exact runs read. Neither check requires paid or
generated execution. Empty-fixture evidence cannot certify populated routines.

Independent activation still requires a fresh context/profile per destination
and proof that the native Home surface was not the natural initial entry.
Retained warm returns and hover-prefetched activations cannot fill that gap.

### Collector-only native Home entry

The desktop launcher uses `DESKTOP_ENTRY_PATH = "/home"`; `createWindow` starts
that load before the collector later calls `page.goto("/all")`. A saved profile
does not change this initial path. On macOS argv deep links are not consumed,
and queued deep links flush only after initial window creation. Neither approach
proves that Home was independently inactive.

A bounded excluded collector can launch an ignored temporary Electron wrapper
that registers a `ready` listener before requiring the unchanged actual desktop
main module. That listener installs a one-shot main-frame `onBeforeRequest`
interceptor for the exact selected origin's `/home`; it waits for verified
fixture cookies and redirects that first request to `/all` before Home can
commit. A `web-contents-created` listener installed before the main module
records initial requests, the redirect and every committed main-frame path.
Acceptance requires a fresh isolated profile and zero Home commits before the
trusted measured Home activation. Preserve actual desktop package name/version,
app path, preload and window settings and record wrapper/source hashes.

This intentionally controlled initial route can establish an independent native
Home activation. It does not measure natural native executable launch, and its
results must stay separate from that launch clock and ordinary cohorts. No
product launcher change or new public environment setting is needed.

### Populated disabled Routines constraints

The ordinary authenticated `POST /api/routines` accepts `enabled: false` and
requires fixture project ownership; a repository is not required. However,
`createRoutine` still calls `titleFor` and `generateShortTitle` before inserting
the disabled row. Disabled scheduling alone therefore does not establish that
creation avoids generated work or expense. Do not invoke that route under the
current no-paid/generated-work constraint merely to populate a benchmark.

Reuse an existing authorized disabled fixture routine if one exists. Otherwise
root must choose a bounded deterministic fixture-tooling insertion or record
the missing non-generating creation path. Such tooling must verify fixture
identity and project ownership, validate the schedule, use the ordinary
`encodeRoutine` encrypted-content contract, journal only its own new identity,
set `enabled: false` and `next_run_at: null`, and verify unchanged original
entities and exact cleanup. Never enable it or invoke run-now. Scheduled and
event admission both filter enabled rows, but a disabled row alone grants no
permission to call manual execution. Compare control/candidate on the same
populated state; do not combine it with historical empty-Routines observations.

## Forced termination and acknowledgement boundaries

Existing v8 observations prove real 75-second focus absence, remote catch-up,
typing before a fresh GET, nonoverlapping merge and acknowledged departure
saves on web and native. The rapid-selection observations prove coherent real
reload under an older held seal and a settled control. They remain reusable
because this review changes no write contract. Neither protocol is a process
kill test or a durable unacknowledged-write guarantee.

| State | Actual retained recovery boundary |
| --- | --- |
| Canonical tab destination | Server-backed after the destination PATCH is accepted; an unacknowledged in-memory target is not durable proof. |
| Active window selection | `window-selection-persistence.ts` installs ciphertext in sessionStorage only after the current seal response and owner/revision fences; failures are optional and `pagehide` cannot guarantee its final response. SessionStorage recovery across a new process also needs actual runtime evidence. |
| Issue/objective creation draft | `drafts.ts` awaits the authenticated server seal before `localStorage.setItem`; only a completed save yields a stored envelope. Typing or an in-flight seal does not establish durability. Restore requires current authorization and preserves explicit failure reporting. |
| Page content being edited | `use-page-autosave.ts` retains pending/screen content in React refs, obtains a fresh authorized basis and awaits versioned saves before normal navigation. A forced kill can bypass `beforeunload` and `pagehide`; unsent or unacknowledged content has no durable local outbox. |
| Newly created unwritten Page marker | `pages-draft.ts` uses a module-level set intentionally lost on reload. The accepted created server row is distinct from this temporary discard marker. |
| Query snapshot | Bounded sealed display cache; Page bodies and write receipts are excluded. It grants no durable write queue or fresh editing basis. |

For a kill/relaunch observation, classify the state before termination: visible
typing, dispatch, server acceptance, received acknowledgement and ciphertext
storage are different facts. A missing response after dispatch is ambiguous;
verify the server value rather than fabricating acknowledgement. A successful
acknowledged-draft recovery can close only that explicitly bounded claim.
Preserving arbitrary unacknowledged Page edits requires a separately designed
authorized durable draft/outbox contract, with errors and account isolation;
the narrow bootstrap does not provide it.

## Decision and documentation impact

Proceed with the bounded objective/member transport only after recording its
owner, generation and admission strategy in the issue plan. Compare identified
products on unchanged data before writes. Measure startup, first project and
objective activation, and listed Page first clicks that could pay moved cost.
Reject the increment if it moves costs or lacks actual shared authorization
benefit; retain complete ordinary readers in every outcome.

This review adds internal evidence and implementation constraints without
changing public controls, configuration, contributor workflow or reader-facing
guarantees. No public manual translation or article review date is needed for
the review itself. Root runs documentation, knowledge, owned-English and diff
checks before publication. MIN-683 remains in progress until the actual latency,
complete preparation, independent native Home/populated Routines, bounded
forced-termination and qualitative daily-use criteria are validated.
