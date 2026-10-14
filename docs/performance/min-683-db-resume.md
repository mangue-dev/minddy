# MIN-683: bounded database contract review, 2026-10-14

This review resumes source `db15c6f8aa` on
`codex/min-683-instant-navigation`. It reuses the
[authenticated database attribution](min-683-db-attribution.md),
[cold-session report](min-683-cold-session.md) and relevant bootstrap sections
of the [architecture review](min-683-architecture-refresh.md). No SQL probe,
browser, benchmark, test, migration or fixture write was run by this agent.
The root owns CI repair, integration, checks and all UI clocks.

## Evidence and decision

The unchanged query path provides no reason to repeat SQL measurements. The
existing warm authenticated/RLS project projection executes in 13.014 ms;
the actual global first-page JSON/count wrapper executes in 62.069 ms. Exact
global/project counts take 1.781/1.220 ms. Complete project PostgREST delivery
takes 284.147/588.799 ms in the two isolated observations and returns
1,700,890 encrypted UTF-8 bytes. Those independent SQL and HTTP observations
cannot be subtracted into an exact transport phase or advertised as a
bootstrap saving. Ordinary protected route authentication separately takes
roughly 60–67 ms in admitted server observations.

These results support one bounded request that shares the existing live
authorization and normal project readers. They support neither another
index, removing exact counts, a selective protected projection, nor a shared
DTO cache. Existing deployed issue-policy batching and index usage are already
recorded; they are not new opportunities in this pass. MIN-614's relevant
method remains applicable: retain authorized repositories, key rotation,
tenant isolation and local-copy protections, and accept a latency optimization
only from identified comparable measurements. Its historical completed status
does not certify the current all-tab targets.

## Exact reader boundaries

| Reader | Preserved contract |
| --- | --- |
| `loadProjectIssues` | Uses the caller's authenticated Supabase client and `issueStore`, full `ISSUE_SELECT`, exact remainder counts, ascending UUID cursor pages of at most 1,000 rows, then position/number/ID order. Its independent RLS-scoped attachment reader supplies actual `resource_count`. Attachment failure remains the ordinary best-effort zero-count behavior; issue/decode/cursor failure returns explicit 500 and never an earlier successful partial list. |
| `loadProjectObjectives` | Uses the same authenticated client and protected `objectiveStore`; exhausts exact-count UUID cursors before sorting by creation time and ID. A later-page or decoding failure returns explicit 500. |
| `loadProjectMembers` | Uses ordinary service-role enrichment only after one live authorized actor boundary. The reader independently requires a living project plus actual ownership/membership, returning 404 for absent, deleted or denied projects and 500 for failed metadata/member/invitation reads. Owner synthesis, identity/avatar enrichment, member creation order, owner-only unexpired pending invitations, encrypted-email decoding and guarded legacy-schema fallback remain intact. |
| Ordinary categories GET | Uses authenticated `categoryStore`, full protected projection and creation order. It currently has one query rather than the complete cursor reader. Extracting that exact reader does not establish generalized completeness beyond its existing row-cap contract. |

`readCompleteScopedRows` rejects invalid or repeated UUIDs, a cursor that moves
backwards, impossible counts, empty pages with an outstanding remainder,
database errors and non-array results. Lower server row caps therefore do not
truncate success merely because a page has fewer than 1,000 rows. Separate
cursor requests are not an atomic transactional snapshot. A new bundle must
not claim a snapshot guarantee absent from its ordinary readers.

The base issue and objective GETs rely on current user RLS and retain their
ordinary empty-list behavior. An empty list cannot be reinterpreted as proof
of living-project membership. The members response has a stricter explicit
living-project/access contract. A bundle must preserve these resource-specific
outcomes rather than fabricate one universal successful scope.

## Authorization, delivery and client acceptance

Reuse `getAuthedUser` for a client-requested bundle, or its existing
`authorizeUserClient` core for a cookie-backed server component. Both verify
claims plus the refresh-backed live session/MFA boundary; a cached JWT or the
routing proxy is insufficient. Share that authorization only within this
request. Preserve per-query authenticated/RLS clients and the existing explicit
service enrichment ACL; do not substitute service-role reads for ordinary RLS.

Deliver independently completed small resources without waiting for a large
issue collection or external forge work. Bound the request manifest and server
fan-out. Preserve each exact query's scope, errors, completion, accepted
read-start and client owner generation. Ordinary optimistic overlays and
newer accepted versions must win against late older results. Keep initial
realtime catch-up, cancellation and account disposal. No cache timestamp,
aggregate slice or bundle arrival grants a fresh Page write basis.

All has the same 670 primary-project issue identities in the measured fixture,
but lacks project `resource_count`. Its members lack permitted invitations
and `isOwner`. Its category/objective buckets do not supply normal scoped
ordering and accepted-read provenance. Therefore it cannot be copied under
the normal project keys. Request-local sharing of unchanged readers is a
smaller contract than cross-request caching: the previously documented durable
data/access epoch, revocation, publication-fence and multiple-instance cache
requirements remain unimplemented.

## Verification ownership and remaining limits

The five CI secret-scanner matches in
`min-683-db-attribution-results.json` are reviewed SQL-helper definition
fingerprints in `reviewedHelperHashes`. The collector computes
`SHA256(pg_get_functiondef)` in its catalog mode, requires exact equality with
the reviewed map before its authenticated pre-request plan, and exports that
map. A local read-only provenance check recomputed all eight fingerprints
from the ignored deployed-auth catalog and confirmed equality with both the
raw accepted plan and public export. No values were printed. These fields
contain no credentials, JWT claims or document bodies. Any scanner exception
must target the reviewed exact findings; a file-wide exclusion is unnecessary.

Existing reader tests already cover normal-route DTO parity, authentication
rejection, lower caps, later-batch failure and owner/member/denied outcomes.
Any changed bundle adds its own behavior checks for independent small-result
delivery, cancellation, account replacement and optimistic ordering. Root
must complete pertinent CI failures before a performance increment and compare
identified control/candidate builds on the same current, unmodified cohort.

There are no new database performance numbers or runtime acceptance claims in
this report. No database path or schema changed during this review. The fixture's
empty attachment collection still limits attachment-heavy latency claims.
Public documentation remains accurate because this audit changes only internal
investigation evidence. Root runs documentation, knowledge, owned-English and
diff checks once integration is complete. MIN-683 stays in progress.
