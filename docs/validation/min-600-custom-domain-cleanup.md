# MIN-600 custom domain cleanup

Disabling a feedback board deletes its domain mapping in the same database
transaction. Domain deletions, including target cascades, persist a hostname
cleanup entry without a foreign key to the deleted project or publication.
Project/page trash also removes their mappings. An insert guard locks the
publication and project and rejects an unpublished target.

The application attempts provider cleanup immediately after board/share
revocation. An hourly authenticated cron retries durable entries and reconciles
legacy inactive mappings and Vercel production subdomains without a mapping.
Hostname leases serialize attachment, replacement, removal and reconciliation;
cleanup checks the retained mapping after acquiring the lease and acknowledges
only the captured queue identity. Network calls time out after five seconds,
and abandoned leases expire after two minutes.

Historical inventory cleanup preserves primary application hosts, Vercel
deployment hosts, wildcard/apex domains, redirects, branch/environment domains,
unknown creation timestamps and attachments younger than ten minutes. Domain
inventory is fully paginated or discarded; inventory failures still allow
previously queued cascades to retry. Each run processes up to ten due entries
within a forty-second work budget. Failed entries become eligible after five
minutes and are retried by the next hourly run. The self-hosted scheduler gives
this route a sixty-second request timeout.

Confirmations cover board deactivation, view revocation/deletion and page
unpublication. Copy is translated in all six product locales and explains the
hosting removal, DNS cleanup at the user's provider and reconnection requirement.

Validation:

- Focused Vitest coverage exercises provider outages/retries, retained mappings,
  reassignment before lease acquisition, lookup failures, lease contention,
  queue generations, protected hosts, inventory pagination, cron authentication,
  self-hosted scheduling and actual React confirmation/cancellation flows.
- `scripts/custom-domain-cleanup-regression.sql` passes on isolated PostgreSQL
  18.3 (PGlite), using the baseline target tables and their cascade foreign keys.
  It verifies board deactivation/reactivation, inactive-target rejection, view
  and project cascades, page/project trash, legacy reconciliation, queue identity
  replacement, lease expiry/token ownership and service-only privileges.
- Lint, typecheck, owned-English, encrypted-column access, encryption schema/
  consumer inventory and `git diff --check` pass.

The SQL check is an isolated fixture regression, not a complete Supabase replay.
Provider requests are mocked in tests; no production domains were changed.
The new migration must be applied before the updated application is deployed.
