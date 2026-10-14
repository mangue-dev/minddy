# MIN-683: resumed database contract review

October 14, 2026. This source review starts from published `242b7b77d`
on `codex/min-683-instant-navigation`. It reuses
[database attribution](min-683-db-attribution.md) and the
[bounded bootstrap design](min-683-bootstrap-resume.md). It performs no SQL,
API, browser, benchmark, build or test execution. The root agent owns the
matched UI comparisons and final verification. This report does not establish
new performance results or validate an open acceptance criterion.

## Decision

Use the existing complete objective/member readers for the first bounded
project bootstrap. Keep the issue collection independently delivered if it is
later included. No index, migration, count removal, protected projection change,
All-to-project cache promotion or cross-request cache is justified by the
existing evidence. A small independent result must not wait for a large issue
collection or for another reader's service-role enrichment.

The measured authenticated executor uses existing indexes and warm shared
buffers. Its complete project issue projection takes 13.014 ms, while the
actual global first-page JSON/count wrapper takes 62.069 ms. The separate
authenticated transport observations are hundreds of milliseconds and carry
megabytes; their executor, authorization, gateway and transport components
cannot be derived by subtracting separate probes. These sparse results support
reducing repeated admission and transport work, not an index proposal or a
predicted bootstrap saving.

## Complete reader contracts

| Reader | Query and completeness | Accepted result and failure behavior |
| --- | --- | --- |
| `loadProjectIssues` | User RLS client; `*, issue_categories(category_id)`; exact remaining count; project filter; ascending UUID cursor; limit 1,000. Attachment source independently uses the same completeness reader and project filter, with `comment_id IS NULL`. | Full protected issue decoding, flattened `category_ids`, removed archived `automation_override`, position/number/UUID ordering, issue-level `resource_count`. Issue database/decode failure returns 500 without an earlier batch. Attachment failure intentionally discards its incomplete aggregate and supplies zero counts; preserve this ordinary best-effort behavior. |
| `loadProjectObjectives` | User RLS client; full protected projection; exact remaining count; project filter; ascending UUID cursor; limit 1,000. | Complete decrypted DTOs sorted by creation time then UUID. A later page or decode failure returns 500 without partial success. |
| `loadProjectMembers` | Service client only inside the existing explicit ACL; living-project metadata, full UUID-ordered memberships and pending unexpired invitations, each paginated with exact remaining counts and limit 1,000. Membership cursor is `user_id`. | Current owner/member access, synthesized owner, creation-ordered members, newest-first invitations, names and avatar seeds. Only owners receive decoded invitations. Missing/deleted/inaccessible project returns 404; database/enrichment/decode failure returns 500. Legacy invitation projection applies only to the recognized missing-encryption-schema error. |

`readCompleteScopedRows` validates row arrays, UUID identity, strict cursor
progress, duplicate rejection and safe exact counts. Each count describes the
remaining scope after its cursor, so a database row cap below 1,000 does not
silently truncate a collection. It fails when a positive remaining count
produces no rows. These sequential pages are not a transactionally coherent
snapshot; a bootstrap must not invent snapshot isolation, a common version, or
a shared point-in-time guarantee.

The existing reader regressions cover lower caps of 250/1,000, 1,206-row
collections, protected decoding, late page failures, member access discovered
beyond the first page, owner-only invitations and ordinary route parity. These
are existing test cases inspected as source, not new test execution or new
production database evidence.

## Authorization and coherence boundaries

Run `getAuthedUser` within the actual bootstrap request and pass that exact
cookie-backed authenticated client and actor identity to RLS readers. Verified
claims alone do not establish current live-session/MFA authorization. Member
enrichment retains its own current living-project and owner/member checks;
an empty authorized issue/objective result is not a substitute for those checks.

Sharing Next request authorization does not remove PostgREST's ordinary
authenticated pre-request MFA/session hook from each database read. The
existing 14.370 ms hook observation is isolated SQL work, not a claim of
60–67 ms saved per bundled reader or a predicted aggregate saving. No
cross-request authorization or DTO cache is introduced by this decision.

The ordinary client query functions preserve their original request start for
`applyPendingIssues`, `applyPendingObjectives` and `applyPendingRelations`.
If readers share an admitted request, establish provenance before dispatch,
not when a later frame arrives. Keep the pending overlays, initial realtime
catch-up, invalidation generation, account/QueryClient fencing and newer
accepted-version protection. Display preparation grants no fresh write basis.
Do not publish under project keys through bare `setQueryData` or copy an All
slice: the global issue DTO lacks project resource counts, and global member,
integration and relation data have different contracts.

## Reader sets outside the first prototype

The ordinary categories reader is a single protected, creation-ordered query;
the integration summary reader is a single service-role query behind current
project access, with ordinary decoded fields and ownership wrapper. Relations
use the user RLS client, project filter and exact polymorphic endpoint DTO in a
single query, without an explicit order. None of these ordinary lists proves
general completeness beyond a server row cap. Reusing them preserves parity;
it cannot be reported as introducing complete pagination.

The views GET checks current project access, creates missing baseline views,
then lists shared/personal views under user RLS and decodes them in
position/creation order. A bootstrap cannot silently omit these seed semantics
or describe this path as read-only. Leave these readers outside the first
objective/member experiment; broaden only after a targeted matched comparison
supports the implementation and an explicit source contract is retained.

## Verification and documentation impact

No source or schema change belongs to this database review. It records internal
implementation constraints without adding a public control, configuration,
reader workflow or release guarantee. Root runs the repository's relevant
documentation, knowledge, owned-English and diff checks before publication.
The existing database probe and rejected architecture experiments remain
unchanged; the evidence index is generated once after root's final measurements.
