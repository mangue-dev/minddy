# MIN-683: database read-path attribution, 2026-10-14

The measured database executor does not explain the current cold-navigation
tail by itself. Under the actual fixture identity and authenticated RLS, the
actual global first-page PostgREST JSON/count wrapper executes in 62.069 ms.
A complete project issue projection and its category links execute in
13.014 ms; the first 1,000 global issues without the outer JSON wrapper execute
in 12.736 ms. The corresponding isolated
authenticated PostgREST reads take hundreds of milliseconds and transfer
megabytes before application decryption. These sparse probes justify separating
SQL, authorization, JSON production, transport and decryption before changing
the read architecture. They do not establish a cold PostgreSQL or preview
performance percentile.

## Identity and execution boundaries

Only `captures-demo+min540@minddy.app`, user
`86df71f9-44a7-4cc1-8085-5baa6c744490`, marker
`min-540-performance-v1` was authenticated. The database catalog independently
confirmed that exact identity. The linked Supabase database is
`cmzrlbnlytvgnomzgmqf`; its origin matches the fixture authentication origin.
The primary account, GitHub connection and fixture contents were untouched.
No index, migration, mutating function, merge or deployment was executed.

The isolated probe source is
`scripts/performance/min683-db-attribution.mjs`. Its phases ran sequentially
after the root's timed native comparison ended and before the server agent's
API probes. They are excluded from ordinary renderer measurements. Raw catalog,
plans and transport metadata remain in ignored
`output/playwright/performance/min683-db-*-20261014.json`. Exported evidence
contains row counts, metadata and hashes, never issue bodies, ciphertext or
authentication tokens. The reviewed export is
[`min-683-db-attribution-results.json`](min-683-db-attribution-results.json).
Two early transport attempts failed at the first
response because the runner called the Fetch `ok` property as a function.
Those attempts remain preserved, excluded and uncounted; the corrected run
completed six reads. One wrapper-template discovery attempt also failed because
its broad `INSERT` filter excluded the ordinary `response_inserted` result
alias. The corrected SELECT-only discovery and bounded analysis succeeded.
Each evidence run preserves its literal runner hash; later runner corrections
are not retroactively described as the same source.

Management queries used `BEGIN TRANSACTION READ ONLY`, local
`statement_timeout = '5s'`, `lock_timeout = '500ms'`,
`idle_in_transaction_session_timeout = '10s'` and `ROLLBACK`. Each analyzed
query additionally set `ROLE authenticated`, `row_security = on`, and the
fixture `sub`/`role` claims. `auth.uid()` returned the fixture ID and
`row_security_active('public.issues')` returned true. The actual deployed
`can_access_project`, `is_project_owner` and `is_project_member` definitions
are STABLE, SELECT-only helpers. The audited policies use the current identity
through `auth.uid()`; their data access does not depend on an omitted `aal` or
`session_id` claim. This is relevant user RLS evidence, not a service-role plan.

The SQL plans intentionally exclude the PostgREST pre-request authorization
function. Its deployed setting is `public.enforce_mfa_aal`, which separately
checks MFA and the current auth session. The ordinary transport probes used
the real newly authenticated fixture JWT and therefore exercised those guards.
No claim that their authorization time is zero follows from the SQL plans.
The final wrapper plan copied only `sub`, `role`, `session_id`, `aal` and `amr`
from an actual fixture JWT into its private transaction context. Only the names
of these claims are recorded. It still does not invoke the pre-request guards.
After the root's independent web batch ended and before its independent native
batch, one separate bounded probe measured the actual pre-request hook. The
complete deployed wrappers and transitives were reviewed first: `enforce_mfa_aal`,
`mfa_aal_ok`, `mfa_aal_ok_for_user`, `auth_session_is_current`,
`is_auth_session_active`, and `auth.role`/`uid`/`jwt` are STABLE and contain only
SELECT/control logic, current settings and read-only PostgreSQL built-ins.
Their exact reviewed definition hashes gate the runner's authorization mode.
No helper writes or executes dynamic SQL; the auth tables are read inside the
existing SECURITY DEFINER functions without exporting their row contents.

`EXPLAIN ANALYZE SELECT public.enforce_mfa_aal()` then succeeded under
`ROLE authenticated` and the actual fixture JWT allowlist inside the same
five-second read-only transaction boundary. Execution took **14.370 ms**,
planning **0.053 ms**, with 2,032 shared hits and no shared reads, dirtied or
written blocks, temporary work or triggers. This isolates PostgreSQL's live
MFA/session authorization hook. It excludes gateway signature/JWT validation,
Next authentication, RPC round trips and transport. It is a single separate
observation, not a percentile or a duration to subtract from, or add to, the
other isolated SQL/HTTP observations. The generated issue-wrapper plan remains
a separate 62.069 ms query without this pre-request hook.
The deployed authenticated/authenticator role has an eight-second statement
timeout; transport requests also had a ten-second client deadline and no retry
after a failed, denied or limited response.

## Deployed state and real reader contract

`20270107000000_issue_read_policy_batching.sql` is existing tracked source and
is already deployed. The actual `issues_select` policy builds the user's
owner/member project set and excludes trashed issues. The category-link policy
tests existence of its parent issue through that parent's RLS. Do not propose
this existing migration as a new MIN-683 improvement or attribute current
latency to a missing batching migration.

Both ordinary global and project issue readers request
`*,issue_categories(category_id)`, exact remainder counts, ascending UUID
ordering and a 1,000-row limit. A cursor page filters `id > after`; its exact
count describes that remaining scope. Counts prove completeness under a lower
PostgREST row cap. The frozen source contains 1,206 global issues and 670 in
Performance 1, so the global reader needs two sequential pages. Removing the
count without replacing the completeness proof would be an unrelated contract
change. Concurrent pages are not a transactionally coherent snapshot.

The protected issue wrapper expands any protected field projection to `*`
before decoding the full protected envelope. A caller asking for a title
therefore cannot assume that SQL only retrieves a title. The measured full
source is entirely encrypted. A future protected projection optimization must
still select the required authenticated envelope/metadata and validate the
same content contract; no selective field change is installed in this session.

## Authenticated executor results

These EXPLAIN ANALYZE queries reproduce the source projection, RLS,
category-link lateral aggregation, ordering and scope explicitly. They do not
claim to reproduce PostgREST's outer response JSON/count wrapper.

| Isolated query | Rows | Planning | Execution |
| --- | ---: | ---: | ---: |
| Global exact count | 1,206 counted | 2.639 ms | 1.781 ms |
| Global full projection and links, first cursor page | 1,000 | 4.540 ms | 12.736 ms |
| Project exact count | 670 counted | 2.505 ms | 1.220 ms |
| Project full projection and links | 670 | 5.851 ms | 13.014 ms |
| Project issue-level attachment source | 0 | 0.998 ms | 0.204 ms |
| Actual global exact-count JSON wrapper, first page | 1,000 aggregated | 5.812 ms | 62.069 ms |
| Actual authenticated live MFA/session pre-request hook | 1 successful invocation | 0.053 ms | 14.370 ms |

All observed buffer accesses were shared hits, with zero shared reads. The
global ordered read uses `issues_pkey`; the project read/count uses
`idx_issues_project`. Category links use `issue_categories_pkey`, and their
parent RLS lookup uses `issues_id_project_history_key`. Owner resolution uses
`idx_projects_owner`; the small member relation is scanned. The global count
scans the small issue relation and returns the complete authorized 1,206 rows.
These warm plans do not justify an additional index. The attachment result
also means this fixture does not establish performance for heavily populated
issue attachment collections.

Management API round trips were 1.34–1.62 seconds, separate from executor
duration. They include administrative connection/API costs and are never used
as application transport measurements.

The final row uses the actual parameterized SQL statement captured read-only
from `pg_stat_statements`, fingerprint
`655997c30569eb3f584735b572c3b76f498cfe11fe68f38a53e97e004da93d8f`.
It includes the category lateral JSON aggregation, full-row outer `json_agg`,
exact `pgrst_source_count` and response-header/status projection. Reviewed
bindings set top-level/nested limits to 1,000 and offsets to zero, use the empty
array JSON defaults, and set response insertion metadata to null. Category
collections are all below that limit in this fixture. The analyzed statement
executes only read-only functions; the runner accepts that reviewed template
hash, not arbitrary database-supplied SQL. It records 11,274 shared hits and no
shared reads. No claim is made that the separately measured 13 ms projection
captures this roughly 62 ms full executor work. Historical mixed-account
statement means identify SQL structure only and are excluded from fixture
performance conclusions. The project and second global page outer wrappers
were not individually analyzed.

## Preview metadata boundary

One fixed read-only SELECT joined the supplied Minddy project
`07b14964-0def-4941-8ddf-686572d6345d` to its repository link and PR number 420
by provider and stored repository equality. It found candidate
`27f9154b-226f-437e-b2ba-fd7da35848e3`, GitHub number 420, state `draft`, updated
at `2026-10-14T14:05:33Z`, and last synced at
`2026-10-14T14:05:40.364533Z`. The repository identity is protected; no encrypted
name, content, key or principal credential was retrieved. This is a project-link
metadata match, not independently decrypted proof of `mangue-dev/minddy` or a
reproduction of the reported merge-state failure. The Performance Tester has
not been given access to the principal repository. Runtime response/log/build
diagnosis belongs to the separate preview investigation.

## Actual PostgREST transport

The six GETs use the ordinary exact-count, embedded-link projection. Every
page's IDs and complete response fingerprint match across both repetitions.
Global pages return `0-999/1206` and `0-205/206`; the project returns
`0-669/670`. All 1,206/670 rows are encrypted. Neither run produced a rate-limit
or permission failure. The gateway returned no `Server-Timing` header.

| Complete scoped read | Requests | UTF-8 response bytes | Headers + complete body, run 1 / 2 | Local JSON parse, run 1 / 2 |
| --- | ---: | ---: | ---: | ---: |
| Global 1,206 issues | 2 sequential | 3,428,471 | 767.681 / 551.998 ms | 4.368 / 4.536 ms |
| Project 670 issues | 1 | 1,700,890 | 284.147 / 588.799 ms | 1.982 / 1.451 ms |

The first global page alone is 2,838,223 bytes and contains 1,159 category
links; the second is 590,248 bytes with 235 links. The project has 700 links.
Measured UTF-8 body length is not the compressed wire byte count. The headers
and body interval combines live JWT/MFA/session authorization, the generated
SQL/JSON response, gateway/CDN and local-machine transport. It cannot be
subtracted from the equivalent executor plan to produce independent phase
times. These requests also use the local machine's route to Supabase, not a
Vercel preview instance's route. Application decryption, DTO mapping, response
serialization, preloading admission and rendering are absent from this probe.

## Bounded strategy

1. Compare the existing admitted All `issues_db` and `issues_decode` phases
   with complete source proofs, then ordinary complete-content UI observations.
   Keep every build, environment and fixture fingerprint identified. A faster
   SQL count cannot be presumed to improve a first-click tail.
2. Investigate repeated complete collection reads and protected storage
   projections before adding indexes or weakening exact pagination. Preserve
   complete scoped DTOs, resource-count differences, ordering and late-error
   behavior. Never install a global subset under a complete project key.
3. Explore server caching only with an explicit account/project/access scope,
   row and version identity, fresh authorization, remote-change invalidation,
   optimistic-write ordering, revocation and cross-instance guarantees. A
   larger TTL provides none of these. Cached display data must not replace the
   fresh versioned write/merge basis.

No application or schema optimization is retained on the basis of these sparse
probes. The next diagnosis needs server phase attribution and independent
first activations, including the open focus/write preservation gates. MIN-683
remains in progress and the requested all-tab readiness and latency targets
remain unvalidated.
