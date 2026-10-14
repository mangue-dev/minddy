# MIN-683: bounded project bootstrap review

This review resumes from published `db15c6f8a` on the existing MIN-683 branch.
It uses the checkpoint, cold-session outcome, server attribution, relevant
architecture sections and the database/preparation agents' source audits. No
new API probe, SQL execution, browser run, build or test is performed by this
agent. The root agent owns CI, implementation admission and all UI measurements.

## Existing evidence supports a hypothesis, not an accepted saving

The retained server attribution measures seven ordinary project prerequisites.
The complete primary issue response contains 670 issues and 1,197,717 decoded
bytes, arriving in 609.1 ms. Objectives are 30,842 bytes / 197.5 ms; members and
owner/invitation state are 255 bytes / 213.7 ms. The other measured category,
integration and relation responses are small. Live session/MFA authorization
was around 60–67 ms per admitted historical ordinary request. These separate
observations establish duplicate admission and payload work worth investigating;
their sums do not predict a bootstrap saving under the two-slot preparator.

Current independent first activations still have missing project prerequisites
at three seconds. The preparator drains seven project keys before the listed
Page body/tree waves, and a cold PR-list transport can delay initial admission.
A server bundle alone does not remove that scheduler gate. Earlier RSC Page
bootstraps moved cost into startup and first project activation and were rejected.
Those rejected controls remain rejected.

## Exact retained reader contracts

- `loadProjectIssues(auth, id)` returns the ordinary complete issue DTO, UUID
  cursor pagination, exact remaining counts, deterministic position/number
  ordering and issue-level resource counts. Attachment-count failure remains
  intentionally best effort. Empty RLS results are not proof of project access.
- `loadProjectObjectives(auth, id)` preserves protected decoding, complete UUID
  cursor pagination and creation order. Client acceptance uses the original
  request start with `applyPendingObjectives`.
- `loadProjectMembers(auth, id)` retains the living-project check, current
  owner/member ACL, complete memberships and invitations, owner-only invitation
  decoding, avatar/name enrichment and explicit 404/500 outcomes. Its service
  client must never be replaced by an assumed All-list access grant.
- Categories retain their ordinary single ordered query. Extracting that query
  would preserve its current contract; it would not establish generalized
  complete-pagination guarantees absent from that ordinary reader.
- Integrations, relations and views retain their own current ACL/error/ordering
  contracts. Relations also require `applyPendingRelations` with the actual
  client read start. No aggregate slice may populate these scoped keys.

Every delivery must run `getAuthedUser` once within its actual request and use
the resulting authenticated RLS client. Sharing this authorization within one
bounded request is distinct from reusing it across requests. There is no
cross-request DTO cache, extended TTL, index or migration proposal.

## Bootstrap implementation boundary

A future exact project bootstrap should accept an explicit bounded set of
reader names and publish each reader's result independently. The first narrow
server prototype could reuse only the already extracted objective/member
readers in a new `lib/server/project-bootstrap.ts` and
`app/api/projects/[id]/bootstrap/route.ts`. Issues, Page bodies and forge work
stay outside that prototype. Per-reader success/failure frames retain ordinary
errors rather than returning partial data as an apparently complete collection.
Server fan-out stays bounded. One slow member lookup must not hold objectives.

The existing transport helper is a material implementation constraint:
`fetchClientRead` consumes the **entire** response body, checks account identity
after that consumption and only then returns a reconstructed `Response`.
Passing an NDJSON stream through this helper would still delay every small
result until the slowest reader and therefore defeat independent delivery.
A simple whole-response JSON bundle has the same barrier.

A real streaming implementation consequently needs a separate reviewed
transport path, with a deadline covering the entire read, initial and per-frame
account identity checks, parser size limits, explicit truncated-stream errors,
request abort on final owner disposal and correct listener cleanup. A client
coordinator such as `lib/project-bootstrap-api.ts` must have no settled-data
residence: it may share only the same admitted in-flight request. Query owners
register before dispatch; later observers may join the exact same TanStack
query, while a new invalidation generation cannot join an older bootstrap.
Each query resolves through its own `fetchQuery` operation, not blanket
`setQueryData` publication. Canceling one query cannot cancel another retained
foreground owner or publish a canceled frame. Account/QueryClient replacement
must abort every old owner before accepting another frame.

For any issue/objective/relation extension, capture the client start before
the shared request starts and pass that same start to the existing optimistic
overlay. Do not assign the later frame-delivery time as read provenance. Retain
initial subscription catch-up, explicit invalidation and newer accepted-version
protection. Page bodies require their existing fresh editing-base and versioned
write authority; this prototype grants no Page receipt or write permission.

These stream, query-lifecycle and account-isolation changes are appreciably
larger than the server route itself. A whole JSON auxiliary bundle is smaller
but still holds one small reader behind another; no existing measurement proves
that barrier acceptable. If CI remediation leaves insufficient time for those
contracts and a targeted matched comparison, retain this strategy and choose a
smaller preparation-admission increment. Do not install an unmeasured bootstrap
as a performance claim at the end of the time budget.

## Acceptance and documentation impact

Before implementation, record the exact hypothesis and reader set in MIN-683's
plan. Root compares immutable control/candidate products on the same current
fixture, before content writes, measuring initial usable board, independent
first project/objective clicks and the first listed Pages that could pay moved
cost. Preserve complete content, loading frames, request starts/bytes and main
thread work. Broaden only after the targeted comparison supports retention.
No test, build or probe overlaps that measurement window.

This is internal investigation documentation. It adds no public control,
configuration, workflow, release version or reader-facing guarantee; no public
manual translation or invented article review date is required. Root runs the
relevant documentation, knowledge, owned-English and diff checks before
publication. Bootstrap implementation and measured gains remain open.
