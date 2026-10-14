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

The implemented candidate is narrower: only a listed normal member read whose
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
Each settled read restores its ordinary cached query function before the
one-shot transport retires. Restoration compares function identity and keeps
newer foreground observer options. Four additional real QueryClient cases
cover inactive refetch after completion, old-client refetch after retirement
of invalidated cached entries, foreground options takeover and a synchronous
success-listener refetch. Restoration runs before query-function settlement
reaches TanStack's cache notifications. Without this restoration, later invalidation
could reuse a disposed one-shot function stored in TanStack query options.

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
