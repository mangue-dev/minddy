# Global encryption inventory and delivery requirements

MIN-591 is one application-wide delivery. The existing invitation implementation
is a small converted surface, not the production rollout boundary. Do not enable
production migration on the strength of crypto unit tests or this inventory.

## Inventory and reproducibility

The current source, copy, writer, reader, migration and proof status is tracked
in [the closure matrix](closure-matrix.md).

- `schema.json` records 169 application tables and 1,509 columns, their primary
  keys and foreign keys. It contains schema metadata, not application rows.
- `../../../lib/server/encryption/data-policy.json` classifies every recorded
  column exactly once. Its 174 encryption targets include the original content,
  derived copies, arbitrary user JSON, private identities, credentials and share
  tokens. The relay audit detail target was removed by an action-specific SQL
  guard and historical scrub; opaque attachment object paths replace two path
  encryption targets; merge undo JSON was replaced by guarded UUID relations;
  forge mention and provider-operation resource identities
  now use purpose-separated one-way equality digests. This is a target
  policy, not evidence that those columns are encrypted.
- `consumers.json` records 1,571 TypeScript/JavaScript table, view, RPC and object-store
  access candidates. Dynamic table names remain explicit `null` entries requiring
  caller review. Array and Buffer constructors are excluded.
- `sql-consumers.json` records 427 functions, ten views and 226 application triggers. Function
  and view hashes pin the observed definitions without copying their bodies.
  Relation references are conservative text matches, not a SQL data-flow proof.
- `migrations.json` pins migration inputs. CI rejects added or changed migrations
  until the schema audit is refreshed, and rejects changed access candidates
  until the consumer inventory is reviewed. Moving a call to another line alone
  does not invalidate the inventory.

The dated checkpoint sections below record the state when each tranche landed;
later checkpoints supersede their remaining-work statements.

The first 104 migrations were replayed on the isolated local Supabase stack;
the objective, category, project-draft and feedback-post migrations were applied
to successive schema-only clones of that replay.
No production rows were copied. Migration
`20270106910000_numo_history_drop_detail_href.sql` previously failed because
`CREATE OR REPLACE VIEW` cannot remove columns. It now recreates the three
known views and two dependent active-conversation policies transactionally,
without CASCADE, preserving invoker security and explicit read grants. The
Numo regression verifies private-history isolation and denial of inaccessible
active-conversation targets. Function grants in this snapshot reflect the
fresh replay's migration owner (`postgres`), rather than the earlier manually
restored schema's owner (`supabase_admin`). Foreign-key ordering is deterministic.

An instance that already recorded that migration will not automatically rerun
an edited historical file. Verify the three view definitions and two policies
during rollout; the fresh-replay correction is not evidence that production was
changed. The source and SQL consumer review remains unfinished even though the
complete schema can now be reproduced.

To reproduce against an isolated database, run `scripts/encryption-schema-audit.sql`
with `psql -At` and save its JSON output outside the repository. Review its
`tables` against `schema.json` and the policy, then run:

```sh
node scripts/write-encryption-sql-inventory.mjs /path/to/schema-metadata.json
node scripts/check-encryption-schema.mjs --write-consumers
npm run check:encryption-schema
```

Refresh the migration SHA-256 manifest only after reviewing the corresponding
schema and consumer changes. These checks prevent accidental inventory drift;
they do not certify unconverted access paths or replace database permissions.

## Plaintext decisions

| Policy group | Reason and restriction |
| --- | --- |
| `routing_identity` | Opaque primary/foreign identifiers, issue numbers and routing keys needed for joins, access checks and scheduling. Human-authored repository names are excluded. |
| `timestamp` | Lifecycle, retention and scheduling timestamps remain queryable. |
| `bounded_metadata` | Numeric counters, budgets, positions, booleans and bounded scheduler values. Arbitrary JSON is excluded. |
| `operational_configuration` | Status/provider/model/locale enums and reviewed structured settings, such as recurrence and sandbox pricing. New free-text fields require reclassification. |
| `public_identity` | Product-public display identities and avatars, public board slugs and published custom domains. A private email or share capability is not a public identity. |
| `one_way_authentication` | High-entropy token digests, salted password verifiers and server-keyed authentication proofs. A plain digest of a six-digit OTP does not meet this rule. |
| `encryption_metadata` | Wrapped keys, ciphertext, blind indexes and version fields; never plaintext key material. |
| `token_digest` | The invitation capability is retained only as a digest after conversion. The legacy format still needs its existing migration path. |
| `remove_projection` | Existing page plaintext search text and vectors must be removed when the source is encrypted, then rebuilt in the authorized application search path. This is a removal target, not permission to retain a plaintext copy. |

Supabase-owned Auth identity fields are outside the application-table snapshot.
Login email remains in Auth as required by the identity provider; application
copies do not inherit that exception. Public display names remain public. Object
bytes, object paths, external exports and observability are not SQL columns and
must be checked separately.

## Remaining implementation before one production rollout

| Surface | Required work and proof of completion |
| --- | --- |
| Projects, issues, pages and views | Project names, automation rules, smart-assignment rules, pages and their database cells now have converted repositories, authorized projections and activated old-writer guards. Review any remaining sensitive derived copies before global activation. Objectives and category names have converted repositories and bounded migrations; representative production-scale validation remains a pre-activation check. |
| Histories and derived copies | Page versions, issue events, statistics, durable agent replay journals and run event payloads now have converted repositories and migration. The event-triggered assistant summary and pending question copies are protected with their event. Numo surface destinations and the non-worker durable activity payloads now have protected readers, writers and migrations; initial prompts, other surface projections, checkpoints and conversation content remain to be converted with their source rows. |
| SQL functions and views | Review the recorded candidates; keep metadata-only transactions in SQL, move content transformations/search into authorized repositories and preserve atomic claims, counters, revisions and idempotency. The Numo view replay failure is fixed and its RLS regression passes; content transformations remain to be converted. |
| Search and equality | Implement application search with correct filtering, ordering, pagination and permissions. Add purpose-separated equality indexes for private identifiers and uniqueness; do not silently rotate a blind-index key independently of its indexed rows. |
| Forge data | Forge mention throttle identities and private repository names now use stable system blind indexes. The names have a recoverable encrypted registry and guarded equality keys across linked copies. Default branches use project-bound envelopes. Convert remaining legacy webhook credentials. The generic row codec deliberately refuses sensitive primary keys. |
| Files and images | Attachment, page-file and project-icon server paths now use opaque names, ciphertext bytes and authorized download routes. The icon bucket switches to private only after the object queue is empty; other object copies still need review. Public avatars have an explicit public-use exception. |
| Feedback and sharing | Feedback posts, private visitor identities, board SSO secrets and recoverable share tokens have repository and migration checkpoints below. Remaining feedback copies still need conversion; owner dialogs must retain access to share URLs. |
| Credentials and configuration | `app_config.value` and BYOK credentials, endpoints and private model choices have bounded CAS envelopes and activated old-writer guards. Migrate remaining legacy environment-key envelopes and secret/configuration stores; verify Vault privileges and deployment-level statement logging. Never treat arbitrary configuration JSON as automatically public. |
| Migration and recovery | Add restartable batches for every target and object, compare-and-swap against concurrent edits, verification counters, rejection of obsolete writers, a restoration rehearsal and retention of historical wrapped keys. Test mixed plaintext/encrypted tenants and old versions. |
| Root key and operations | Provision a dedicated root key outside the database and rehearse key backup and restore. The offline root-key rewrap procedure is implemented and tested on isolated PostgreSQL; production rehearsal and application-scale latency remain. Production deployment and migration require a later explicit deployment request. |

The common row codec is connected to personal notes, statistics, activity, page
versions, comments (including page quotes), objectives, categories, project
creation drafts, feedback post content, and the issue source paths described below.
The remaining repositories in the table above are unconverted. It authenticates the real primary key, table and owner, requires complete rows,
distinguishes legacy and encrypted states, clears protected columns and rejects
remaining plaintext search projections. Parent-owned records still require a
trusted repository to resolve and authorize their scope before calling it.

New encrypted values use envelope format 3. Each write derives a fresh AES-256
key with HKDF-SHA-256 from the cached scope DEK, a random 256-bit salt and the
complete authenticated context. That context includes the owner, table, column,
primary key, DEK version and JSON/binary encoding. A random 96-bit GCM nonce is
then used under that derived key. This avoids accumulating every scope write
under one AES key; a cache TTL alone would not limit that key's lifetime use.
Derivation is local and adds no external key-service calls. Independent WebCrypto interoperability
and tampering tests exercise both encryption directions. See
[RFC 5869](https://www.rfc-editor.org/info/rfc5869/) for HKDF. This is Minddy's own
versioned envelope format.

Formats 1 and 2 remain readable. Format 2 introduced authenticated key versions;
format 1 lacks that binding and must eventually be rewritten. Converted row
backfills upgrade old formats as well as old DEK versions. Invitation backfill
still only selects legacy rows, so its encrypted historical values need an
additional rotation pass. Rollback binaries must understand format 3 after any
format-3 writes. JSON strings cannot be reliably erased from JavaScript memory;
the store wipes the mutable plaintext/key buffers that it owns.

## Converted personal content and migration rehearsal

`MINDDY_CONTENT_ENCRYPTION_ENABLED=true` enables staging writes and maintenance
for `user_scratchpad`, `stat_events`, `issue_events`, `page_versions`, comments,
objectives, categories and project drafts. Keep it disabled in production until the
application-wide gates are satisfied. It is independent of the invitation flag.
Disabling it pauses backfill and new-record opt-in; already encrypted notes still
require decryption and encrypted writes. Task-completion snapshots derived from
those notes remain encrypted even with the flag disabled. Root-key failures never
fall back to plaintext. Statistics retain their existing best-effort delivery
contract; account imports instead surface failures.

The shared note repository serves the API, MCP and agent operations and account
transfer. Notes retain their optimistic revision check: migration advances the
revision and obsolete edits conflict. Imports no longer bypass that check or
silently truncate oversized notes. Realtime sends only invalidation metadata,
including on legacy rows. Statistics protect the project name, issue title and
task label together; their user scope remains valid after source deletion. The
current SQL aggregates only need clear ledger metadata. Project names in those
aggregates still need conversion with their source table.

The shared row worker reads a bounded batch, decrypts and verifies its newly
encoded replacement, then commits under repository-specific revision/ownership
checks. It counts failed/conflicted rows without logging their content. Attempt
ordering revisits failures without starving subsequent rows. Maintenance processes
at most 50 rows each for notes, statistics, activity, page versions, comments,
page comments, objectives, categories and project drafts per run,
alongside the invitation batch.
Each repository reports failure independently. Constraints reject plaintext in
converted rows, version inconsistencies, revision rollback and identity changes.

An opt-in local integration test uses real PostgreSQL key-registry RPCs and a
real `pg_dump`/restore of notes, statistics, wrapped keys and fixture users into
disposable databases. A second rehearsal covers project activity and page
snapshots, comments and page quotes across key rotation. These tests recover mixed legacy/current/historical versions
with empty caches, and reject the wrong wrapping key. The test uses the same local
root-key wrapper as production. This is a restoration proof for those tables,
not a full application recovery rehearsal. Source projects/issues/pages in the
history fixture remain plaintext and have no nested hierarchy; restoration of
the eventual encrypted sources and arbitrary self-referential trees still needs
a full-application rehearsal. No production rows are used.

After applying the migrations to a schema-only `minddy_min591_full_audit`
database in the local `supabase_db_minddy-encryption-test` Docker container:

```sh
docker exec -i supabase_db_minddy-encryption-test psql -v ON_ERROR_STOP=1 -U supabase_admin -d minddy_min591_full_audit < scripts/encryption-scratchpad-regression.sql
docker exec -i supabase_db_minddy-encryption-test psql -v ON_ERROR_STOP=1 -U supabase_admin -d minddy_min591_full_audit < scripts/encryption-statistics-regression.sql
docker exec -i supabase_db_minddy-encryption-test psql -v ON_ERROR_STOP=1 -U supabase_admin -d minddy_min591_full_audit < scripts/numo-history-view-regression.sql
docker exec -i supabase_db_minddy-encryption-test psql -v ON_ERROR_STOP=1 -U supabase_admin -d minddy_min591_full_audit < scripts/encryption-history-regression.sql
docker exec -i supabase_db_minddy-encryption-test psql -v ON_ERROR_STOP=1 -U supabase_admin -d minddy_min591_full_audit < scripts/encryption-comments-regression.sql
docker exec supabase_db_minddy-encryption-test createdb -U supabase_admin -T minddy_min591_full_audit minddy_min591_objective_audit
docker exec -i supabase_db_minddy-encryption-test psql -v ON_ERROR_STOP=1 -U supabase_admin -d minddy_min591_objective_audit < supabase/migrations/20270107090000_objective_encryption.sql
docker exec -i supabase_db_minddy-encryption-test psql -v ON_ERROR_STOP=1 -U supabase_admin -d minddy_min591_objective_audit < scripts/encryption-objectives-regression.sql
docker exec supabase_db_minddy-encryption-test createdb -U supabase_admin -T minddy_min591_objective_audit minddy_min591_category_audit
docker exec -i supabase_db_minddy-encryption-test psql -v ON_ERROR_STOP=1 -U supabase_admin -d minddy_min591_category_audit < supabase/migrations/20270107100000_category_encryption.sql
docker exec -i supabase_db_minddy-encryption-test psql -v ON_ERROR_STOP=1 -U supabase_admin -d minddy_min591_category_audit < scripts/encryption-categories-regression.sql
docker exec supabase_db_minddy-encryption-test createdb -U supabase_admin -T minddy_min591_category_audit minddy_min591_draft_audit
docker exec -i supabase_db_minddy-encryption-test psql -v ON_ERROR_STOP=1 -U supabase_admin -d minddy_min591_draft_audit < supabase/migrations/20270107110000_project_draft_encryption.sql
docker exec -i supabase_db_minddy-encryption-test psql -v ON_ERROR_STOP=1 -U supabase_admin -d minddy_min591_draft_audit < scripts/encryption-project-drafts-regression.sql
docker exec supabase_db_minddy-encryption-test createdb -U supabase_admin -T minddy_min591_draft_audit minddy_min591_feedback_audit
docker exec -i supabase_db_minddy-encryption-test psql -v ON_ERROR_STOP=1 -U supabase_admin -d minddy_min591_feedback_audit < supabase/migrations/20270107120000_feedback_post_encryption.sql
docker exec -i supabase_db_minddy-encryption-test psql -v ON_ERROR_STOP=1 -U supabase_admin -d minddy_min591_feedback_audit < scripts/encryption-feedback-posts-regression.sql
MINDDY_ENCRYPTION_DB_TEST=true npm test -- lib/server/encryption/database-recovery.integration.test.ts
```

The SQL rehearsals roll back all fixtures and check RLS, obsolete writers,
constraint failures, metadata-only Realtime, statistics aggregation and snapshot
survival after source deletion. The recovery test creates and drops only its
uniquely named databases and requires an empty audit template. Default tests
skip this integration test. Policy-wide serialization
round trips cover 73 supported protected tables; they are not proof that those
repositories are converted or authorized. `ai_decision_evaluations` has no
primary key; it needs a stable identity before the row codec can protect it.

## Activity and page history repositories

`issue-event-store.ts` is the activity persistence/read boundary for all four
parents: issues, objectives, feedback posts and pages. It resolves the parent
project before encryption; database composite foreign keys bind that project
to the actual parent, including service-role writes. Parent IDs, row IDs and
scope are immutable. Routes retain their authorization/RLS checks and MCP
reads record the caller in the decryption audit. Webhooks receive the logical
in-memory event after a successful insert, never the stored ciphertext.

The PR echo/burst guards now filter metadata in SQL, then compare decoded
values in 500-row pages. They do not apply a one-row limit before a protected
value comparison. The SQL cycle-duration aggregate uses the bounded
`starts_work` boolean instead of comparing the encrypted `to_value`; the
migration initializes it for old activity without broadcasting plaintext.
Realtime events carry invalidation metadata only. Queue attempts and
re-encryption do not produce user activity notifications.

`page-version-store.ts` protects complete title/icon/document snapshots and
serves both history previews and restore operations. History lists still omit
document bodies from the response, but must decrypt each full envelope to recover
titles. They first pin up to 200 metadata IDs, then fetch/decrypt at most ten
snapshots at a time to bound peak memory and avoid pagination drift. Measure
large-history memory and latency before production;
these tests are correctness checks, not production benchmarks. Retention only
reads IDs/timestamps and deletes rows through existing cascades.

The migration adds explicit row state, revision/CAS guards, fair retry queues
and scheduled 50-row batches for both tables. Once a project has a content key,
new histories remain encrypted even with the rollout flag off. Without root-key
configuration, stale legacy writers are rejected by the database rather than
allowed to leak new snapshots. History writes retain their existing best-effort
contract; provider/database failures produce generic error logs and no plaintext
fallback. Deployment must drain old writers and monitor those failures.

Only the metadata initialization (`project_id` and `starts_work`) is performed
inside the schema migration. Its table-lock duration must be measured on a
representative staging database. Content conversion itself remains bounded,
verified and resumable. These changes do **not** yet encrypt the current issue,
page or feedback bodies; the global activation remains
blocked on their conversion and the other surfaces listed above.

## Comment repositories and streams

`comment-store.ts` is the shared boundary for issue, objective, feedback and page
comments. The caller's authorization client, parent/author/visibility predicates,
ordering and limits remain intact. Only metadata predicates and explicitly
reviewed projections/joins are accepted. Content projections decode a complete
stored envelope before projecting the requested fields; metadata-only reads do
not fetch or decrypt bodies. CI rejects direct table and forge-content RPC access
outside this repository; dynamic accesses remain part of the separate audit.

The database binds every comment to its actual parent project. Row IDs and key
scopes cannot change, and encrypted rows cannot revert to plaintext. Complete
page bodies and quotes share one envelope. Body edits merge the existing quote
under a revision comparison; stale edits fail instead of losing content. Account
imports retain their metadata and authorization checks and now encode comments
before insert/update. API, MCP and agent reads use the same boundary; important
AI context reads report storage failures instead of treating them as empty threads.

Forge synchronization still writes its remote-identity sidecar and comment in
one locked transaction. Encryption uses a predetermined row ID. If two initial
deliveries race, the loser reloads that ID and encrypts again; SQL also rechecks
local edits and remote timestamps after encryption. Neither a partial sidecar
nor ciphertext authenticated for a different row is accepted.

Both comment tables have fair, bounded migration/re-encryption queues. A narrowly
scoped service-only RPC compares row revision, project and old key version, then
replaces ciphertext without changing the user's modification time or broadcasting
a user edit. This matters for GitHub conflict detection. It also handles comments
on soft-deleted pages while normal edits continue to require a live page.

Numo partial answers now persist through the repository at most once per 900 ms,
with serialized tool/final writes. `realtime.send` can retain its payload in the
database, so comment text is no longer sent through private live topics. SQL rejects
those retired stream calls; comment broadcasts contain routing metadata only.
Existing invalidation/polling retrieves authorized plaintext from the API. Failed
final persistence is reported. This adds database traffic compared with the old
broadcast-only stream; measure end-to-end latency, query load and flush behavior
under representative staging concurrency before activation. Other AI stream
families remain part of the unconverted scope. Historical Realtime retention,
logs and backups still require the global rollout audit; old copies are not
retroactively encrypted by changing new broadcasts.

Validation covers real cipher round trips, all comment parent types, quotes,
key rotation/flag rollback, tampering, concurrent edits, imports, forge identity
races, streaming failure/order, cron errors and PostgreSQL dump/restore. The SQL
rehearsal checks RLS, client/Numo immutability, timestamps, trashed pages, obsolete
writers, metadata broadcasts and the atomic forge RPC. The first 104 migrations
replayed on isolated Supabase. Application-scale latency and full recovery remain unverified.

## Objective source content

`objective-store.ts` protects objective names and descriptions under the project
key. The query adapter preserves RLS and caller filters, fetches complete rows
for protected projections, and strips ciphertext before returning API, MCP, agent,
board, search-index, public-share, notification and export data. Metadata-only
queries do not decrypt. Exact-name resolution still compares authorized decoded
rows in the application. Assistant comment triggers read routing metadata and
check project access before decrypting the objective. Account imports encode both
fields and compare revisions when replacing an existing row.
Objective reads for prompt context, smart fill and smart triage stop before model
execution when the repository reports a storage failure, instead of presenting
an incomplete objective list as if it were authoritative.

The guarded create/update RPCs keep project and lead membership checks. Creation
assigns the row ID before encryption; protected edits merge complete content
under a revision check so concurrent updates cannot overwrite each other.
Database constraints bind envelope version and row state, reject downgrades and
stale plaintext writers after a project key exists, and remove direct anonymous
and authenticated writes. Realtime broadcasts contain routing metadata only.
The statistics RPC now returns objective IDs and counts; the authorized server
repository hydrates names and sorts the result. This removes its SQL dependency
on plaintext objective names.

The hourly worker converts and re-encrypts at most 50 objectives per run. Its
service-only RPC marks fair attempts, compares project, revision and key version,
and preserves user modification timestamps. An isolated SQL regression checks
the migration CAS, guarded writes, revoked privileges and redacted broadcasts.
Repository tests cover encryption, projection, tampering and encryption after
the rollout flag is disabled for a project that already has a key. Production
flags remain off; no production backfill has run.

## Category source names

`category-store.ts` protects category names with the project content key. The
repository preserves RLS or an already authorized project scope, decodes names
for the board, authorized search, public views, exports, API, MCP and AI, and
never returns ciphertext in those payloads. Exact-name matching and name sorting
run after authorized decryption. A paged scan covers names beyond the first
1,000 database rows. ID-only membership checks remain metadata queries.

Default seeding, forge/import reconciliation, category creation, rename and
account transfer encode complete rows before writing. Renames use a revision
check; database state constraints reject plaintext in encrypted rows and stale
plaintext writers once a project content key exists. Client mutation grants are
removed; deletion rechecks project access inside a guarded SQL function. Realtime
broadcasts carry only routing metadata. Category
activity uses IDs, so it does not retain copied names.

The statistics RPC now returns category IDs and counts; the authorized server
repository hydrates names and merges equal labels for the existing presentation.
The hourly worker converts or re-encrypts at most 50 categories with verified
compare-and-swap and fair retry ordering. Isolated SQL verifies state, grants,
CAS, redacted broadcasts and metadata-only statistics. A disposable PostgreSQL
dump/restore test recovers category names across two project-key versions with a
cold cache and rejects an incorrect external root. Representative staging
latency and the application-wide recovery rehearsal remain outstanding.

## Project creation drafts

`project-draft-store.ts` protects the draft name and the complete arbitrary
wizard state under the owner's user content key. This includes the seed brief,
selected repository name and any compressed icon data URL held in the draft.
The only durable consumer is the authenticated draft API: its list filters by
owner under RLS, decrypts before returning the existing response shape, and
keeps ciphertext and revision fields out of the response. Draft deletion still
uses the owner's RLS policy. These drafts have no content search, history, MCP
or AI reader, and no derived database copy; the browser keeps only a draft ID
pointer across an external Git authorization redirect.

The guarded save function checks ownership and a row revision atomically after
the server encrypts the complete draft. The migration permits mixed legacy and
encrypted rows, rejects plaintext writes once a user has a content key, and
removes direct client insert/update grants. An unmigrated preview can still
save legacy drafts while the staging flag is off; a flag-enabled write fails
closed if the schema is unavailable. Hourly maintenance scans at most 50 rows,
verifies replacement plaintext before a revision and owner scoped compare-and-
swap, revisits failed rows, and preserves the user's edit timestamp. The SQL
regression covers owner isolation, stale writers, permissions, revision conflicts
and migration timestamps. A disposable PostgreSQL dump/restore test recovers
drafts across two user-key versions with an empty cache and rejects the wrong
root. No production draft migration or activation has occurred.

## Object codec status

The shared object codec encrypts file bytes and filename/MIME metadata, using
1 MiB chunks and an encrypted manifest binding each chunk's digest, position and
size. Tests cover empty files through the existing 20 MiB attachment limit,
truncation, reordering, substitution and owner/path changes. **No production
upload or download path uses it yet.** Remaining work includes authorized and
hosting-compatible upload transport, opaque paths, downloads for app/AI/export,
cross-project copies, all metadata rows, and verified object migration. A codec
unit test does not protect existing objects or make signed plaintext URLs safe.

## Implemented protection against authentication through a database dump

Previously a password-share cookie was `SHA256(token + ':' + password_hash)`.
Both inputs were stored in the database, so a reader could generate a valid
unlock cookie without knowing the password. Feedback OTPs also used an unkeyed
digest of the public row ID and a six-digit code, allowing offline enumeration.

Both now use domain-separated HMAC proofs with the server's required service
credential. The credential never enters a SQL expression or row. Tests reject
the former database-only proof, preserve valid authentication and check secret
rotation. This does not claim protection when the application credential is also
compromised, and does not replace content encryption or root-key separation.

Deployment invalidates existing share-unlock cookies and outstanding feedback
OTP codes: visitors must unlock again or request a new code. Do not accept the
old proof as a fallback; that would preserve the demonstrated bypass. Drain old
application instances during the eventual rollout. Service-credential rotation
also invalidates these authentication proofs; no long-lived content depends on them.

## Key rotation status

Hourly maintenance now selects at most 20 current **content** keys older than
90 days and advances them through the registry's compare-and-swap operation.
The scheduled candidate's version is checked again, so concurrent or delayed
jobs cannot rotate it twice. Historical keys remain available for reads. One
tenant failure does not stop the rest, and failures return a non-success status
to the scheduler without logging provider error details or key material.
An attempt timestamp is persisted before wrapping, and unattempted/older
attempts are selected first. Repeated failures therefore cannot permanently
occupy the head of a bounded queue. The service role can update only this
timestamp directly; wrapped keys and versions still require the guarded RPCs.
The migration explicitly revokes the broader service-role grants inherited from
Supabase defaults; adding a SELECT grant alone had not removed those privileges.
`scripts/encryption-rotation-regression.sql` verifies queue fairness and column
privileges on an isolated migrated database, inside a rolled-back transaction.

This schedules key advancement for every recorded content scope. It does not
yet implement re-encryption of all historical rows or objects. That migration
work remains required. Maintenance runs when either the invitation or staging
content flag is enabled; only converted repositories are registered for backfill.
Blind-index keys are excluded from this job to preserve equality lookup.

## Feedback post source tranche

The feedback post repository now encodes the canonical and submitted title/body,
translations, moderation reason and embedding together under the project's content
key. Creation through the public board, integration API and internal channel assigns
a stable ID before encryption. Team edits and AI review merge protected fields under
a guarded revision check; metadata-only status, voting and merge transactions remain
queryable. The hourly worker scans 50 posts with fair attempt ordering, verifies
replacement content and uses compare-and-swap for migration and key-version
rewrites, including trashed posts. Existing encrypted rows remain encrypted when
the staging flag is disabled. Legacy plaintext inserts or edits are rejected after
the project has a content key. Realtime broadcasts only IDs and project routing
metadata, even for legacy posts.

Repository reads cover the public board and private-author detail, team API/MCP
lists, review/AI context, issue promotion, dashboard, inbox, push and trash. Public
visibility is filtered before decryption. Feedback comment bodies and activity
events were already converted. SQL vector matching was removed; authorized server
search now scans and decrypts project rows in 200-row pages, computes cosine
similarity and ranks across the whole result set. Public suggestions filter to
published, public, non-spam posts before decryption. This preserves correctness
without a plaintext vector index, but its full-scan latency and key/cache load
must be measured on representative staging data before activation.

This is **not a completed feedback domain**. The later identity and attachment
checkpoints replace the earlier clear identity and object paths described here.
Recoverable share tokens and other board copies remain open. Promotion uses the
shared issue creation path, which can encode the new issue title and description
only when the separate staging issue
source flag is enabled; production flags remain off and existing issues have not
been migrated. The remaining sharing, object and issue paths need conversion
before the feedback boundary can be declared complete. The branch's
staging content flag is not a production rollout flag; both production encryption
flags remain disabled. No production data or objects were migrated.

Validation on the isolated `minddy_min591_feedback_audit` schema: the migration
and rolled-back SQL regression cover state constraints, obsolete writers, revision
conflicts, preserved edit time, grants, removal of SQL similarity, and metadata-only
Realtime payloads. The opt-in PostgreSQL dump/restore test recovers encrypted post
content and embeddings across two project-key versions with a cold cache and rejects
the wrong external root. Unit tests cover row/scope tampering and multi-page public
similarity search. These fixtures do not establish production-scale performance or
restore of feedback identities and files.

## Issue source tranche in progress

`issue-store.ts` encodes title, description, plan, remote URL and automation
override together under the project key. The shared creation path covers API,
MCP, agents, forge imports, recurrence and feedback promotion; bulk CSV/brief
imports and account transfer now encode before insert or upsert. The shared
update path merges protected fields after project authorization and retains its
`updated_at` compare-and-swap. Agent checklist synchronization compares the
source revision before replacing the plan. API, board, export, public-share,
MCP, AI, forge and notification readers now use the issue adapter, or explicitly
decode complete rows after their existing RLS/project check. Issue search scans
project rows in 200-row pages and compares decoded title and description in
application code. The Numo history view no longer selects `issues.title`; its
invoker-scoped reader hydrates the issue fallback through the repository.

Migration `20270107130000_issue_source_encryption.sql` adds row state, a
revision, content clearing, metadata-only Realtime, a fair queue and a
service-only compare-and-swap operation. An issue-specific project marker is
committed with the first encrypted issue. A project key made by another domain
does not by itself reject legacy issue writes; after the marker is committed,
plaintext inserts and source edits from old writers fail. The isolated SQL
rehearsal verifies these rules, client privileges, unchanged edit timestamps,
CAS conflicts and invoker security. Hourly issue backfill is capped at 50 rows
and runs only with both `MINDDY_CONTENT_ENCRYPTION_ENABLED=true` and
`MINDDY_ISSUE_SOURCE_ENCRYPTION_ENABLED=true`. The latter defaults off and must
remain off in production. An already encrypted issue still requires encryption
when either flag is disabled. A new plaintext issue in a marked project is
rejected by the database if encryption cannot be performed.

**This is not a completed issue boundary.** Service-role readers without a
project filter still need an authorization review before decryption; the shared
adapter preserves each caller's existing query but cannot prove authorization
itself. Some metadata-only issue updates remain direct, and the allowed demo
seed fixtures still write plaintext. Derived agent conversation/run and
pull-request titles, attachment links and object bytes, forge sidecars, and
external push/webhook/export destinations require a copy-by-copy retention and
authorization audit. An isolated dump/restore covers one encrypted parent and
child issue over two key versions, but the application-wide restore rehearsal
does not include encrypted issue sources or arbitrary parent trees. Application search needs
representative staging latency and key/cache-load measurements. Do not activate
the issue flag or describe the domain as converted until those paths and the
remaining SQL/RPC, imports/exports and old-writer checks are closed. Feedback
visitor identities, OTP email and files remain clear as above.

### Issue boundary follow-up — 24 September 2026

Service-role issue reads now bind the known project before decoding in Smart
Assign, automations, agent plan synchronization, PR review context and push
hydration. An interactive issue-anchored agent launch first reads only routing
metadata, confirms the user's current project access, then decodes the title in
that project. Account export now limits created/assigned issue content to projects
the exporting user currently owns or belongs to. PR review comments are decoded
only after the linked issue has been found in the run's project.

Nested PostgREST joins no longer request `issues.title` in agent-run lists,
agent-branch cleanup, project PR tools or the user PR list. These callers batch
up to 200 issue IDs and 100 authorized project IDs through `issueStore` before
displaying titles. Missing or foreign issue titles do not become a visible
linked issue. The encrypted-access CI guard rejects new nested selections of
protected issue columns. Capture-world issue seeds now fail before their legacy
plaintext writes when the target project has an active issue encryption marker.
The database guard continues to reject stale application writers. The isolated
issue SQL regression passed again; the PostgreSQL dump/restore rehearsal now
recovers two roots and five children across two key versions, with cold caches
and a wrong-root rejection.

**The issue boundary is still open.** The following paths can retain issue
content or sensitive related data in clear form:

| Path | Remaining work |
| --- | --- |
| Agent state | Run prompt, title, checkpoint and delegation input now have separately gated encrypted paths, with their conversation, initial-message and current-runtime copies protected. Steering and system messages, input answers, delegation results, outcome text, branch/PR metadata and other runtime fields still persist readable content. Durable replay batches and run events have separately gated encrypted paths; event-triggered summary and question copies follow the event ciphertext. Convert the remaining agent rows, SQL copies, Numo views, Realtime, imports and historical rows together. |
| Forge and external delivery | `pull_requests.title`, branch/repository names and URLs, GitHub issue metadata/sidecars and forge relay payloads remain clear in the application database. GitHub/GitLab issue synchronization, PR publication, webhooks, push and downloaded exports deliberately disclose content to their recipients or providers; review authorization, retention and provider controls for each destination. |
| Resources and objects | Issue attachment URLs, filenames, storage paths and file bytes remain clear. Direct upload/download, AI resource reads, account exports/imports, copy and orphan cleanup still need an authorized opaque-path object transport, migration and restore. MIME and size are currently classified as operational metadata. |
| Search and SQL | Application issue search reads through the repository, but representative latency and key/cache load are unmeasured. The SQL consumer inventory is a candidate list, not proof that every function or RPC has a safe content flow. |
| Recovery and rollout | The seven-node fixture exercises the schema's supported one-level parent hierarchy with children and parents in separate COPY statements in reverse dependency order. The data-only restore suppresses triggers, then recreates the parent foreign key to validate every restored link. PostgreSQL restores and decrypts them, but `pg_dump` still warns about self-referential foreign keys in data-only restores. A full application restore with every linked table and object remains unverified. No representative Minddy staging database or credentials were available in this session. |

The source flag and global content flag remain disabled in production. This
follow-up does not convert the remaining agent, forge, object or page sources, and is not an
issue-domain completion claim. Feedback visitor identities, pending OTP email
and feedback objects remain clear. No production data was migrated or deployed.

## Durable agent journal tranche — 24 September 2026

`agent_run_journal` is the first converted agent storage boundary. The server
resolves the owning run's project before encrypting an OpenCode replay batch.
Its gzip payload and original SHA-256 digest are authenticated inside a
project-key envelope bound to the run ID, session ID and stored lookup value.
The database stores a project-keyed HMAC for idempotent batch retries; the
blind-index key is independent of the content key and is not rotated by the
content-key scheduler. It must not be rotated without a coordinated lookup
rewrite of every stored journal row. Existing compressed and JSON retries are
checked before an encrypted insert. The first legacy JSON batch receives the
normal keyed lookup; identical historical duplicates receive a row-specific
lookup during migration so both the retry identity and the replay sequence
remain intact.

`loadRunJournal` reads the project scope from the run and decrypts before
bounded replay. Tampered rows or missing keys abandon automatic replay rather
than sending an incomplete session. The journal has no Realtime publication or
content broadcast; the SQL regression verifies that fact. A project-specific
marker rejects old plaintext inserts after the first encrypted batch. Direct
client mutations are revoked. Moving a parent run to another project after it
has encrypted journal rows is rejected so the ciphertext scope cannot silently change.
The hourly worker processes at most five rows per
pass, verifies plaintext equality before a version-checked replacement, and
revisits old envelope or content-key versions. The journal has no content search.

The isolated SQL regression passes state, stale-writer, CAS, privileges and
Realtime checks. Unit tests cover protected append/replay data, scope tampering,
legacy duplicate identities and key rotation. A real PostgreSQL dump/restore
recovers two encrypted batches across two project-key versions, with both
content and blind-index keys, cold caches and wrong-root rejection. The issue
restore fixture now deliberately reverses its COPY rows; children are restored
before parents within Minddy's enforced one-level hierarchy. This is still not
a full application/object recovery rehearsal.

The next agent boundary is the run event/message pair:
`agent_run_events.payload` is copied by the SQL
`capture_agent_assistant_message` trigger into
`agent_messages.content`. Its API and delegation readers now share a
project-bound event query which fails on storage errors; this is only the
first read-side step and the payload and trigger copy are still plaintext.
Those paths, conversation/run titles, prompts,
checkpoints, queued messages and input requests remain in clear form. The
journal tranche therefore does not close the issue boundary. No staging
connection or representative staging data was available: the available
Supabase project listing shows only the Minddy production project, while the
local database is a schema-only clone populated with small fixtures. Issue search latency and
project key/cache load cannot be inferred from those fixtures and remain
unmeasured. Both production encryption flags and the new journal flag remain
disabled; no production deployment or data migration occurred.

## Run events and event-triggered copies — 24 September 2026

`agent_run_events.payload` now has a separately gated project-key envelope.
The event writer resolves its parent run's project, allocates the event ID
before encryption and stores a format-3 ciphertext bound to that ID and run. The
authorized run API and delegation reader decrypt through one project-bound
repository. The live event broadcast uses the in-memory logical payload after
the database insert; the event table has no Realtime publication. An activated
project rejects obsolete plaintext event writers and cannot move an encrypted
run to another project. Older preview schemas retain a read-only legacy
fallback while the event flag is off.

The SQL summary trigger copies the event ciphertext into
`agent_messages.content`; Numo conversation detail and account export resolve
the source event after authorization and return the logical summary. The input
trigger copies the same ciphertext into `agent_run_input_requests` instead of
persisting the question array, while retaining only question/call routing IDs.
The status endpoint decrypts the pending question after its RLS read. Guards
reject new plaintext summary and question copies after project activation.
One service-only compare-and-swap RPC converts or rotates an event and both
derived copies in the same transaction. Hourly maintenance attempts at most
20 events with fair retry ordering and verifies the replacement before commit.
`MINDDY_AGENT_EVENT_ENCRYPTION_ENABLED` and the global content flag must both
be true for new opt-in writes or maintenance; both remain off in production.

The isolated SQL regression covers legacy and encrypted triggers, migration
CAS, stale writers, scope moves, copy guards and privileges. A real PostgreSQL
dump/restore recovers encrypted summary and question events across two content
key versions, their SQL-created copies and cold keys; a wrong root fails. The
issue recovery fixture now restores children and parents in separate COPY
statements with children first, then recreates the parent foreign key to
validate restored references. These are small, isolated fixtures, not a full
application or object restore. The Supabase CLI project listing contains the
Minddy production project but no identified Minddy staging project. No staging
connection or representative staging rows were supplied, so issue search
latency, event write throughput and project-key/cache load remain unmeasured;
fixture timings cannot establish production behavior.

This closes the event payload and its two event-triggered plaintext copies,
not the agent or issue boundary. The later run-title, checkpoint and delegation
input conversion is described below. Steering and system messages, pending
input answers, delegation results and Numo projections remain clear.
The next queue tranche has begun by making failed pending-message claims stop
the worker instead of silently appearing empty. Feedback visitor identities,
OTP email and feedback objects also remain clear. Production flags stay off;
no production migration or deployment occurred.

## Agent launch prompt checkpoint — 24 September 2026

`agent_runs.prompt` and `prompt_mentions` now share a project-key envelope
authenticated to the assigned run primary key. New run creation assigns that ID
before encryption; the managed-budget SQL RPC accepts the encrypted fields while
retaining its reservation and creation in one transaction. The SQL first-turn
trigger copies the ciphertext into `agent_messages.content` for the initial
prompt. Run reads, the issue and agent lists, Numo detail, and account export
decode only after their existing visibility checks. Imported transcript entries
without a source run receive their own message-ID-bound envelope and are decoded
after a conversation-scoped read. Legacy previews retain a read fallback while
the new flag is off.

A project marker rejects old plaintext run and initial-message writers after
the first encrypted launch or imported initial message. The guarded service RPC
converts an existing run and every run-linked initial-message copy together,
checking the run ID, project, conversation, and prior version. Hourly maintenance
attempts at most 20 rows with fair retry ordering, verifies the new envelope,
and rewrites historical key or envelope versions. The separate
`MINDDY_AGENT_LAUNCH_ENCRYPTION_ENABLED` flag and global content flag remain
disabled in production. The isolated SQL regression covers direct and
managed-budget creation, obsolete writers, copy mismatch, immutable scope,
client privileges, and Realtime absence. A real PostgreSQL dump/restore recovers
two launch prompts and their copies across two project-key versions with empty
caches; the wrong root fails. The issue restoration now commits children and
parents in separate reverse-order batches before restoring its parent FK.

**The agent boundary remains open.** The later run-title, checkpoint and
delegation-input conversion is described below. Initial system content,
steering and queued messages, input answers, delegation results, other runtime
fields, Numo projections, and any content they copy remain readable in SQL.
Imports of other agent message sources still need the general agent-message
boundary; encryption of run-linked initial prompts does not establish that the
whole transcript is protected. PR and forge data,
files, feedback visitor identities, OTP email, and feedback objects remain
clear as recorded above. No production deployment or migration occurred.

The accessible Supabase project listing on 24 September 2026 contains one
linked Minddy project and no identified Minddy staging project. The isolated
schema clones hold only synthetic one- and two-run fixtures and cannot estimate
production search latency, write latency, or project-key/cache load. Those
measurements remain outstanding until representative staging data and access
exist. Production flags stay off.

## Agent run title, checkpoint and delegation input — 24 September 2026

Three new project-key gates extend the converted agent boundary. `agent_runs.title`
and `agent_conversations.title` use ciphertext authenticated to the shared
conversation ID. The run creation path, including its atomic managed-budget
RPC, writes the title ciphertext before the SQL conversation trigger copies it.
The title-sync trigger preserves ciphertext on updates. Authorized run, Numo,
inbox, push and account-transfer readers decode the title after their existing
access checks; SQL Numo views and Realtime do not expose a clear copy. The
service-only migration RPC converts each run and its conversation copy under
one compare-and-swap, and a second RPC covers conversation rows without a run.

`agent_runs.checkpoint` uses a run-ID-bound envelope. The runtime-session
trigger copies the same ciphertext into `agent_runtime_sessions` while a run
owns the session; SQL resume checks now recognize ciphertext without examining
its contents. The run write and bounded migration update the run and its
current runtime copy in one transaction. Orphan runtime sessions have a
separate bounded compare-and-swap path. Clearing a finished checkpoint removes
both the clear value and ciphertext. Authorized run readers decrypt for resume.

Delegated briefs and attachment metadata share a run-ID-bound envelope in
`agent_runs.encrypted_delegation_input`; their clear SQL columns are null and
an empty array. Both ordinary and atomic managed-budget launch paths accept
the envelope. Run reads decode for the worker only after scope checks. A
service-only bounded compare-and-swap converts and rotates historical delegated
runs. Project activation markers and guards reject obsolete clear writers,
scope changes and version downgrades for these three surfaces. The opt-in flags
are `MINDDY_AGENT_TITLE_ENCRYPTION_ENABLED`,
`MINDDY_AGENT_CHECKPOINT_ENCRYPTION_ENABLED` and
`MINDDY_AGENT_DELEGATION_ENCRYPTION_ENABLED`, each requiring the global content
flag. All remain disabled in production. A deployed binary must support these
envelopes before enabling any gate; rolling back to a plaintext-only binary
after activation will be rejected by the database.

Isolated SQL regressions exercise clear-copy removal, old-writer rejection,
managed-budget creation, compare-and-swap conflicts, Realtime exclusion and
client privilege denial. Unit tests verify authenticated project and row
bindings. Real PostgreSQL dumps restore run/conversation, run/runtime and
delegation/parent-turn references with child rows loaded in independent earlier
transactions, then revalidate their foreign keys. Two data-key versions
decrypt with a cold cache; a different root fails. These fixtures contain at
most two runs per test. The Supabase CLI lists one linked Minddy project and
no identified staging project; representative staging search, write latency
and key/cache-load measurements could not be run. Fixture timings do not
establish those performance bounds. No production data or migration was used.

The agent boundary remains open. `agent_messages.content` for `system` and
`steering`, `agent_run_messages.content/mentions`, and
`agent_run_input_requests.answer` remain clear, as do `agent_runs.delegation_result`,
`outcome`, `error_message`, `verdict`, `base_branch`, `branch_name`, `pr_url`
and `deployment_url`; `agent_runtime_sessions.base_branch/work_branch`,
`agent_turns.error_message/outcome`, `agent_conversation_contexts.snapshot`,
`agent_artifacts.ref/url` and related Numo, notification and forge copies need
their own source-and-derived conversion. `numo_assistant_turns.outcome` and
the two agent outcome fields were moved into the policy's encryption targets
because they can contain authored summaries. The issues and feedback
boundaries remain open; in particular `feedback_users.email/name/external_id`,
`feedback_otp_codes.email`, feedback attachment objects and any remaining
derived copies are still clear. MIN-591 must stay in progress.

## Root-key setup and recovery

`MINDDY_DATA_ROOT_KEY` is a dedicated 32-byte random key encoded as 64 hex
characters. Generate it with `openssl rand -hex 32`. Keep it in the hosting
platform's protected server configuration, separate from PostgreSQL and its
backups. The self-hosted installer generates it for each installation. Never
reuse `VAULT_ENC_KEY`, a database credential, or another application secret:
those have independent lifecycles and may be rotated for unrelated reasons.

The application derives distinct wrapping keys for content and blind indexes
from the root and uses AES-256-GCM to wrap random tenant data keys. The wrapped
format and associated data authenticate the purpose and scope. The root key is
available to the application runtime, so runtime compromise can expose it;
database-only compromise cannot recover the data keys. Protect the runtime
configuration and never put the root key in Git, SQL, logs or client bundles.

Keep a protected recovery copy of the root key. The full self-hosted cold backup
includes the environment file and therefore needs strong outer encryption and
strict access control. A restore must use the original key. A different key fails closed; it cannot
recover old content. Keep the root stable across upgrades and redeployments.
The [offline root-key rotation procedure](root-key-rotation.md) rewraps every
recorded data key in one guarded PostgreSQL transaction while all Minddy
processes are stopped. An isolated database test covers rollback on mismatch,
content recovery with the new root and rejection of the old root. A production
rehearsal and backup recovery check are still required. The scheduled 90-day
data-key rotation is separate and does not replace root-key rotation.

## Standalone agent transcript checkpoint — 24 September 2026

Imported transcript messages without a run, event or queue parent, plus
run-linked `system` messages without a source event or queue entry, now use the
project-key envelope already bound to `agent_messages.id`. Account import
encodes them; authorized Numo and account-export reads decode after scope
checks. A project marker rejects new plaintext messages and edits by obsolete
writers. A 20-row maintenance pass verifies and compare-and-swaps legacy rows,
then revisits old key and envelope versions. SQL also prevents moving a
conversation with encrypted messages to another project. The Numo view retains
only ciphertext for converted messages, and `agent_messages` is not published
to Realtime.

An isolated SQL regression checks stale-writer rejection, compare-and-swap,
scope immutability and the absence of clear message text in the source and
Numo projection. A real PostgreSQL dump and restore recovers two key versions
with cold caches, rejects the wrong root, and loads child messages before
their parent conversation in separate committed batches. These fixtures have
two messages and do not measure representative search, latency or key-cache
load. `supabase projects list` identifies one linked Minddy project and no
Minddy staging project; no staging credentials are present in the environment.

The agent boundary is **still open**. Queue-backed `agent_messages.content`
for `steering`, `agent_run_messages.content/mentions`, and
`agent_run_input_requests.answer` remain clear, as do
`agent_runs.delegation_result/outcome/error_message/verdict/base_branch/
branch_name/pr_url/deployment_url`, `agent_runtime_sessions.base_branch/
work_branch`, `agent_turns.error_message/outcome`,
`agent_conversation_contexts.snapshot`, `agent_artifacts.ref/url`, and
their Numo, notification, forge and account-transfer copies. PR/forge data,
attachment objects, feedback identities (`feedback_users.email/name/
external_id`), `feedback_otp_codes.email` and feedback objects remain open.
No production flag was enabled, and no production deployment or data migration
was performed.

## Queued steering and mediated answer checkpoint

Queued `agent_run_messages.content/mentions` now use a project-key envelope
bound to the queue message ID. The SQL capture trigger copies the same
ciphertext and key version into `agent_messages.content`. Direct writes and the
atomic latest-run/resume RPCs persist the protected version; an activated
project refuses old plaintext writers. Claims decode after resolving the run's
project, and Numo plus account export hydrate the SQL copy after authorized
reads.

Mediated Numo steering and answers also protect the parent
`assistant_messages` copy, including its context and non-routing metadata.
`agent_run_input_requests.answer` uses a separate request-ID-bound envelope.
The resume and steering RPCs keep their status, budget and message
transactions while accepting ciphertext. One service-only compare-and-swap
operation converts or rotates the queue row, transcript copy, answered
request and parent message together, refusing missing or changed copies. A
bounded 20-row maintenance pass verifies replacements. Parent conversation,
AI history, attachment lookup, routine transcript, Numo detail and account
export decrypt after their authorization checks. The parent row retains only
the worker run/question routing marker in JSON metadata. SQL guards reject
plaintext worker copies and version rollback after project activation.

The isolated SQL regressions check copy equality, stale-writer refusal, scope
immutability, compare-and-swap conflicts, SQL and Numo plaintext absence,
and atomic mediated RPC writes. Real PostgreSQL dump/restore fixtures recover
queue and answer copies under two project-key versions with cold caches and
wrong-root rejection. They commit transcript, queue, answer, parent assistant,
run and conversation rows in independent child-first batches and revalidate
selected foreign keys. These fixtures contain only two messages and cannot
estimate search latency, write latency or key/cache load. `supabase projects
list` still shows one linked Minddy project and no identified Minddy staging
project; no staging credentials are available in the environment. Production
encryption flags remain disabled; no production deployment or data migration
occurred.

The agent boundary remains open: `agent_runs.delegation_result/outcome/
error_message/verdict/base_branch/branch_name/pr_url/deployment_url`,
`agent_runtime_sessions.base_branch/work_branch`, `agent_turns.outcome/
error_message`, conversation contexts, artifacts and their Numo projections
are still plaintext. Other PR/forge copies and attachment object bytes are
unconverted. Feedback identities (`feedback_users.email/name/external_id`),
`feedback_otp_codes.email` and feedback objects remain plaintext. The issue
boundary and MIN-591 remain in progress, and PR #289 remains a draft.

## Agent context snapshot checkpoint

`agent_conversation_contexts.snapshot` now uses a project-key envelope bound
to the stable conversation/kind/resource tuple. Encrypted rows retain only an
empty JSON object in the source and `numo_contexts` view. Account import
encrypts snapshots; account export and authorized Numo detail reads decrypt
them after the source row's access policy. SQL-generated context links have
empty snapshots and remain metadata-only. An activated project rejects direct
legacy inserts, including empty inserts, and content changes; SQL trigger
creation of empty links remains permitted. A 20-row service-only maintenance
pass verifies ciphertext and uses a compare-and-swap RPC to convert or rotate
snapshots. A parent project move is rejected when it would invalidate the
encryption scope.

The isolated SQL regression checks obsolete-writer rejection, source and Numo
plaintext absence, parent scope and CAS. A real PostgreSQL dump/restore test
loads context children before their parent conversation in separate committed
batches, revalidates the foreign key, recovers two project-key versions from
cold caches and rejects the wrong root. The fixture contains two snapshots
and cannot estimate representative latency or key/cache load. Production
flags remain disabled; no production deployment or data migration occurred.

The agent boundary remains open: run and turn outcomes/errors/results, branch
and PR fields, runtime branch copies, artifacts, Numo projections and other
agent content listed in the policy still need conversion. The issue boundary
still includes forge and PR copies, attachment links and object bytes, external
outputs and old writers. Feedback identities and objects remain open. MIN-591
and the draft PR remain in progress.

## GitHub issue metadata sidecar checkpoint

The `github_issue_sync_metadata.milestone` and `metadata` JSON fields now
share an issue-ID-bound project envelope. Their SQL columns hold only `NULL`
and an empty object after conversion. The GitHub sync writer encrypts before
an atomic timestamp-guarded RPC; older timestamped webhook deliveries cannot
replace a newer sidecar. Authorized issue API and MCP reads decrypt after issue access
checks, while exports do not include this provider-specific sidecar. A
project marker rejects obsolete plaintext inserts and edits. A bounded
20-row CAS pass converts or rotates legacy rows and preserves concurrent sync
updates. The parent issue cannot move projects after the sidecar is encrypted.

The isolated SQL regression checks stale delivery, old-writer refusal, CAS,
source plaintext absence and client/Realtime privileges. A PostgreSQL dump
and restore test loads sidecars before encrypted issue parents in separate
committed batches, revalidates their foreign key, recovers two key versions
from cold caches and rejects a wrong root. Its two-row fixture is insufficient
for latency or key/cache estimates. Other issue copies, attachment metadata
and bytes, PR/forge data, external outputs and feedback identities/objects
remain open. Production flags remain disabled and no production data was
changed.

## GitHub issue comment link checkpoint

`github_issue_comment_syncs.html_url` now stores a project-key envelope bound
to the issue and stable remote comment ID, including when the link is absent.
The encrypted URL travels through the same atomic comment synchronization RPC
as the body; the RPC preserves stale-delivery and comment-ID conflict checks.
Issue API and MCP readers decrypt only after their issue access checks. An
activated project rejects the older plaintext RPC writer and direct edits.
A bounded 20-row CAS worker converts and rotates historical links while
preserving concurrent sidecar updates.

The SQL regression checks source ciphertext, obsolete writers, migration CAS,
stale deliveries and client/Realtime privileges. The PostgreSQL recovery
rehearsal loads comment-link rows before encrypted comments and issue parents
in separate committed batches, revalidates their foreign keys, recovers two
key versions from cold caches and rejects a wrong root. Its two-row fixture
does not measure staging latency. PR/forge copies, attachment objects,
external outputs and feedback identities/objects remain open; the issue and
agent boundaries are still incomplete. No production flags or data changed.

## Agent verification verdict checkpoint

`agent_runs.verdict` now uses a run-ID-bound project envelope. The agent tool
and guarded run writer encrypt before persistence; run hydration and the legacy
automation-chain reader decrypt after their existing scope checks. The SQL
column becomes `NULL` and Numo views have no verdict projection. An activated
project rejects obsolete plaintext verdict inserts and edits, identity changes
that would break authentication, and key-version rollback. A service-only
20-row compare-and-swap pass verifies historical conversion and rotation.

The SQL regression checks plaintext absence, old-writer refusal, CAS,
client privilege and Realtime exclusion. A real PostgreSQL dump/restore test
loads turns, runs and conversations in separate child-first batches, recovers
two key versions with cold caches and rejects a wrong root. Its two-row
fixture cannot measure representative throughput or key/cache load. Other
run results, errors, delegation results, branch/PR/runtime/artifact fields,
Numo automation outcomes, issue PR/forge copies, attachment objects and
feedback identities/objects remain open. Production flags are disabled; no
production data migration or deployment occurred.

## Agent deployment affinity checkpoint

`agent_runs.deployment_url` now stores an opaque format-3 project-key envelope
bound to the run ID for preview deployments. Its same-column value carries a
system-keyed HMAC equality prefix and the envelope key version; the preview
URL itself is absent from SQL. The common production/local queue retains
`NULL`. This layout keeps the managed-budget insertion RPC atomic without a
second SQL copy. Both local and cloud drains query legacy exact URLs and the
encrypted equality prefix during conversion. The production dispatcher
decrypts due preview URLs before waking deployments. Authorized run hydration
also decrypts after its existing access checks.

A project marker rejects obsolete plaintext preview writers once an encrypted
run exists, plus scope changes and key-version rollback. A service-only
20-row compare-and-swap worker converts and rotates historical preview URLs.
The blind-index key is separate from content keys and remains stable across
content-key rotations, as with invitation email equality indexes. Rotating
that system blind-index key would require a coordinated index rewrite before
new drains could locate existing runs.

The SQL regression checks legacy-writer rejection, equality lookup, the
managed-budget RPC, CAS, key rollback and Realtime absence. A PostgreSQL
dump/restore test loads turns, runs and conversations in independent
child-first batches, recovers two content-key versions and the blind-index
key from cold caches, and rejects a wrong root. The fixture contains two
runs and cannot estimate representative drain latency or key/cache load.
Other run/turn results, branch/PR/runtime/artifact fields and Numo copies,
issue PR/forge and attachment copies, and feedback identities/objects remain
open. Production flags remain disabled; no production migration or deployment
occurred.

## Agent base branch checkpoint

`agent_runs.base_branch` now stores a run-ID-bound format-3 project envelope
in the existing text column. The runtime synchronization trigger copies the
same ciphertext into `agent_runtime_sessions.base_branch` atomically. A
runtime trigger checks that an encrypted copy matches its current run and
rejects direct plaintext edits after project activation. Run creation,
managed-budget creation and guarded stamps encrypt before SQL; authorized
run, issue-panel and inherited-work reads decrypt after their access checks.
Detached runtime sessions use a separate conversation-ID binding. A runtime
copy retains its original run ID after its run is deleted while the
conversation survives, so its ciphertext remains decryptable and rotatable.

The two service-only compare-and-swap workers convert or rotate runs and
detached runtime copies in bounded 20-row batches. A project marker rejects
old plaintext writers, scope changes and key-version rollback. The SQL
regression proves that source and runtime copies lack the branch text and
that older run and runtime writers fail. A PostgreSQL dump/restore test loads
turns, runtime sessions, runs and conversations in separate child-first
batches, revalidates runtime foreign keys, recovers two key versions from
cold caches and rejects a wrong root. Its two-run fixture cannot estimate
staging latency or key/cache load. `branch_name`, `pr_url`, turn outcomes,
delegation results, artifacts and Numo copies, as well as issue PR/forge and
attachment copies and feedback identities/objects, remain open. Production
flags are disabled; no production data was changed.

## Agent work branch and delegated result checkpoints — 24 September 2026

`agent_runs.branch_name` now uses a run-bound project envelope and a
purpose-separated system blind index for equality lookup. Its current runtime
copy carries the same ciphertext; branch artifact refs contain only the blind
index and retain a bound run ID for recovery after run deletion. Detached
runtime and artifact rows use their own stable IDs for encryption. The live
run, PR inheritance, Numo detail, delegation and account-transfer readers
decrypt only after resolving the authorized project. SQL sync writes the
encrypted run value to its copies in the same transaction. A project marker
rejects new plaintext branches and invalid copy writes. Bounded service-only
compare-and-swap passes convert and rotate run, runtime and artifact rows.

`agent_runs.delegation_result` now stores a run-bound ciphertext. The
worker-result event and its turn checkpoint carry an event-bound ciphertext
with clear run, event and project routing IDs. Bounded compare-and-swap
passes cover historical results, events and checkpoints, including a
checkpoint whose event row has been removed. The event pass updates an exact
matching checkpoint in the same transaction. The Numo reader decrypts after
the authorized turn read. The stale-turn recovery routine now resumes
terminal workers through the application repository so SQL does not rebuild
a plaintext worker result from protected run columns. An activated project
rejects plaintext worker payloads and clear sidecars on new writes.

Isolated SQL regressions check copy equivalence, compare-and-swap conflicts,
stale-writer rejection and the Numo view. PostgreSQL dump/restore rehearsals
recover two project-key versions with cold caches, child-first committed
batches and a wrong-root rejection. They do not measure representative search,
latency or key/cache load; those measurements are a prerequisite to production
activation, not to review of this code. Production flags remain disabled and
no production migration or deployment has run.

The agent boundary remains open. In particular, run and turn outcomes/errors,
`agent_runs.pr_url`, non-branch artifact refs and artifact URLs, PR/forge
copies, and the other targets listed above still require coordinated
conversion. Issue attachment links and bytes, feedback identities and
feedback objects also remain plaintext. The code PR must remain a draft until
these conversions and their proofs are complete.

## Agent run and turn summary checkpoint — 24 September 2026

`agent_runs.outcome/error_message` now use run-bound project envelopes in
their existing columns. The turn synchronization trigger copies the same
ciphertext atomically into the latest `agent_turns` row. Earlier turn values
retain their own encrypted values under the same run binding. Archived turns
imported without a live run use a turn-ID binding; the import now stores them
with a nullable `run_id` instead of failing the old non-null constraint.
Authorized run, issue-panel, Numo-detail and account-export readers decrypt
after access checks. The status writer and stalled-preview writer encrypt
before updating a run. A project marker rejects obsolete plaintext run and
turn edits; guarded, bounded compare-and-swap workers convert and rotate both
tables.

The isolated SQL regression checks the source, turn and Numo projection,
old-writer refusal, archived-turn import and stale CAS rejection. A real
PostgreSQL dump/restore loads turns before runs and conversations in separate
committed batches, revalidates foreign keys, recovers two key versions with
cold caches and rejects a wrong root. Representative latency and key/cache
measurements remain a prerequisite to production activation. Other agent
fields and the issue, forge, attachment and feedback boundaries remain open;
production flags remain disabled.

## Agent pull-request URL checkpoint — 24 September 2026

`agent_runs.pr_url` now uses a run-bound project envelope. The SQL runtime
trigger copies that ciphertext into the current pull-request artifact in the
same transaction, and the artifact retains the bound run ID if the run is
deleted. Detached artifacts use their own ID binding. A project marker rejects
obsolete plaintext run and artifact URL writers, key-version rollback and
scope moves. The artifact and run compare-and-swap workers operate in bounded
batches; the artifact pass runs first so a clear copy cannot survive a run
conversion. Authorized run lists, issue panels, Numo work and artifact views,
delegation output and routine history decrypt after their access checks.

The isolated SQL regression checks the run, artifact and Numo copy, old-writer
refusal and CAS. A PostgreSQL dump/restore loads artifacts before runs and
conversations in independent committed batches, revalidates a foreign key,
recovers two project-key versions from cold caches and rejects a wrong root.
This does not convert the separate `pull_requests` table, forge sidecars or
external provider URLs. Those issue-bound copies and the remaining agent
references still require conversion. Production flags remain disabled; no
production migration or deployment occurred.

## Shared pull-request URL checkpoint — 24 September 2026

`pull_requests.url` now uses a system-key envelope bound to the stable PR ID.
The monotonic forge upsert supplies that ID before encryption, checks for an
existing row and retries a concurrent first insert with its established ID.
Repository renames keep the ID and therefore preserve decryption. An activated
global marker rejects obsolete clear URL inserts and updates. A bounded
service-only compare-and-swap pass converts and rotates existing PR URLs.
Authorized PR repositories, review-run context, the project PR tool and agent
list decode after their access checks. Realtime receives ciphertext.

The old SQL PR-to-run state synchronization no longer copies a system-bound
PR cipher into a project-bound run. It keeps the state update transactional.
The application decrypts the current PR URL, binds it separately to each run
and calls a service-only CAS operation that checks the current PR version,
repository link and prior run value. That operation updates the run and its
artifact copy in one transaction. SQL regression checks source, run, artifact
and Numo projection, stale observations, old writers and client privileges.
A PostgreSQL dump/restore loads artifacts and runtime rows before runs and
shared PR rows in independent batches, recovers two system and project key
versions with cold caches, and rejects a wrong root.

This checkpoint does not convert shared PR titles, branch or repository names,
other forge sidecars, issue attachment objects or feedback identities and
objects. Those remain open in MIN-591. Representative search, latency and
key/cache-load measurements are required before production activation, not
before code review. Production flags remain disabled and no production data
migration or deployment has run.

## Shared pull-request title and branch checkpoint — 24 September 2026

`pull_requests.title`, `head_branch` and `base_branch` now use separate
system-key envelopes bound to the stable PR ID and column. The monotonic
upsert encrypts supplied fields before its timestamp-guarded transaction;
the direct title-update path does the same. An activated global marker refuses
new clear values and changed clear values from obsolete writers while leaving
unchanged historical fields readable during a bounded migration. One
service-only compare-and-swap pass converts or rotates all three columns
under a single row lock. Authorized PR lists, review runs, agent lists,
inbox/push hydration, assistant context and project tools decrypt after their
access checks. The Numo history view no longer projects a shared PR title;
its authorized reader resolves the title from the linked run and PR instead.
Realtime carries only stored ciphertext for converted fields.

The SQL regression verifies source and Numo projection, stale CAS and old
writer refusal. The shared PR PostgreSQL restore also recovers title and
branch fields over two system-key versions with cold caches, child-first
independent batches and a wrong-root rejection. Repository names, issue
attachment links and bytes, remaining forge sidecars, feedback identities
and objects are still clear. These and the rest of the remaining-implementation
table must be closed before the global boundary can be declared converted.
Representative search, latency and key/cache-load measures remain a
production-activation prerequisite; no production flag, migration or deploy
was run.

## Pull-request comment edit checkpoint — 24 September 2026

`pr_comment_edits.body` now uses a system-key envelope bound to its stable edit
ID. The forge webhook and Minddy edit paths share the same writer. That writer
decrypts the latest authorized snapshot before deduplicating an echo, assigns
the new ID before encryption and stores only ciphertext after activation. The
authorized history route decrypts after resolving PR access. A global marker
rejects old clear inserts and updates, and a bounded service-only CAS worker
converts or rotates historical bodies.

The isolated SQL regression checks source plaintext absence, CAS and old
writer rejection. The shared PR dump/restore loads edit rows in an independent
batch before their PR and agent rows, recovers two key versions with cold
caches, and rejects a wrong root. Repository names and the other forge,
attachment and feedback surfaces in the remaining-implementation table are
still open. No production flag, data migration or deploy was run.

## Forge relay delivery checkpoint — 24 September 2026

`forge_relay_deliveries.payload` and `last_error` now use separate system-key
envelopes bound to the stable instance, provider and delivery GUID. The enqueue
path encrypts before its idempotent insert. The worker checks the instance is
still active before decrypting and forwarding the payload to that authorized
endpoint. Retry diagnostics are encrypted; the admin reader decrypts them.
Instance revocation marks pending deliveries dead and clears their diagnostic.
An activated global marker rejects obsolete clear inserts and changed clear
updates. A bounded service-only row CAS converts and rotates both columns.

The isolated SQL regression checks the source, duplicate enqueue, stale CAS,
old-writer rejection and RPC privileges. The shared PR PostgreSQL dump/restore
loads deliveries before their parent instances in independent batches, recovers
two system-key versions from a cold cache, and rejects a wrong root key.
Repository names, relay audit and link copies, attachments and feedback remain
open. Representative search, latency and key/cache-load measurements are a
prerequisite to production activation. No production flag, data migration or
deployment was run.

## Forge relay audit copy removal — 24 September 2026

The audit ledger retains action, instance and timestamp, which are sufficient
for mint quotas and incident correlation. Its arbitrary `detail` JSON previously
copied private webhook URLs, instance names and unbounded upstream errors.
Application writers now submit an empty object. A database guard permits only
an empty object or the SQL mint reservation's fixed `{ "state": "reserved" }`
metadata; it rejects older arbitrary detail writers. A bounded service-only
CAS pass removes historical detail without changing quota timestamps. The SQL
regression verifies stale CAS, removal and old-writer refusal. The relay
PostgreSQL restore loads audit rows independently before parent instances.
Audit detail is classified as bounded metadata only under that SQL guard.
Other forge and issue copies remain open.

## Agent artifact reference boundary — 24 September 2026

Branch refs and their runtime copies use the project-bound branch envelope and
stable blind equality token described above. Pull-request artifact refs are
only numeric forge PR identifiers; an additional SQL trigger now rejects
arbitrary text from older writers and preserves the numeric equality key used
by the runtime trigger. Its isolated SQL regression verifies refusal and the
valid numeric path. Artifact URLs remain independently encrypted as described
in the agent PR URL checkpoint.

## Attachment object and metadata checkpoint — 24 September 2026

Private attachment and page-file writes now use opaque paths and server-side
byte encryption when `MINDDY_ATTACHMENT_OBJECT_ENCRYPTION_ENABLED=true` together
with the global content flag. Browser uploads enter through an authenticated
server route. An activated database marker rejects authenticated direct Storage
uploads and SQL references to unregistered objects. Read paths, including AI,
MCP, exports and public page files, decrypt after their existing authorization
checks; expiring application URLs carry an authenticated path and disposition.
Object bytes are stored in independently authenticated chunks. Storage quota
uses the registered object's logical byte count. Legacy named objects move to
opaque paths through a bounded worker; SQL references and a blind path alias
swap atomically, and a per-object attempt queue prevents a failed object from
starving later batches.

`attachments.file_name`, link `url` and `icon_data_url`, plus
`page_files.file_name`, use row- and project-bound envelopes when
`MINDDY_ATTACHMENT_METADATA_ENCRYPTION_ENABLED=true`. Direct writers,
imports and exports use the same codec. A bounded CAS worker rotates old values,
and SQL guards reject changed clear metadata after activation. SQL regressions
cover old-writer refusal, aliases, queue fairness and CAS. The isolated
PostgreSQL dump/restore loads attachment rows and object registry records before
parents in independent committed batches, recovers two project-key versions
with cold caches and rejects a wrong root key. Its object archive is an
in-memory ciphertext fixture; a representative Storage backup/restore and
latency measurement remain production activation checks. Private project icons
and other file surfaces in the table above remain open. Production flags remain
disabled.

## Feedback identity checkpoint — 24 September 2026

`feedback_users.email`, `name` and `external_id` now have row- and
project-bound envelopes. Purpose-separated version-one blind indexes retain
email and external-ID lookup and uniqueness across content-key rotation.
Pending `feedback_otp_codes.email` uses a separate system-bound envelope and
blind index; protected issuance and claim RPCs retain atomic cooldown, quota,
attempt and consumption behavior, including legacy rows during conversion.
Feedback sessions, team readers, comments and erasure decode only after their
existing access checks. Team search filters decrypted rows in ordered batches.
A bounded CAS worker converts and rotates both tables. The SQL regression
checks source and OTP copies, uniqueness controls, old-writer refusal and RPC
privileges. A local PostgreSQL dump/restore loads feedback children before
parent boards and projects in independent batches, recovers two key versions
from cold caches and rejects the wrong root. This does not close the feedback
or application-wide boundary: private project icons, remaining
SQL and object targets in the table above need conversion. Production flags
remain disabled.

## Recoverable share token checkpoint — 24 September 2026

When `MINDDY_SHARE_TOKEN_ENCRYPTION_ENABLED=true` together with the global
content flag, new `view_shares.token` values use a system-bound, row-authenticated
envelope. A purpose-separated version-one blind index supports public token
lookup without exposing the bearer secret in SQL. Authorized owner dialogs,
public share routes and custom-domain routing decode at the application
boundary. The guarded view-share RPC retains its row lock and password update
semantics; page publishing creates an opaque row identity before encryption.
Legacy shares remain readable during conversion. A bounded CAS worker rotates
them and records attempts in a fair queue. After activation the trigger rejects
new clear tokens from old RPC and page writers. The isolated SQL regression
verifies the source, CAS and old-writer refusal. The PostgreSQL dump/restore
loads share children in independent transactions before their parent views and
projects, then recovers two key versions with cold caches and rejects a wrong
root. Representative search, latency, key-cache and load measurements remain
checks before production activation, not blockers for code review. Production
flags remain disabled.

## Numo surface destination checkpoint — 24 September 2026

`numo_surface_events.destination` is now encrypted with the actor's user key
and authenticated to the event ID when the surface destination flag and global
content flag are enabled. Reservation creates the event ID before sealing;
idempotent replay and the live projection decode the stored destination through
the same repository. A bounded CAS worker converts and rotates older JSON
destinations. The database rejects new clear JSON once the first ciphertext is
written. The SQL regression checks old-writer refusal and stale CAS. An isolated
PostgreSQL restore loads events before threads and conversations in independent
batches, reads two key versions with cold caches and rejects a wrong root.
Other Numo operation, message and conversation content in the remaining-work
table still needs conversion. No production flag was enabled.

## App configuration value checkpoint — 25 September 2026

The common row codec now seals `app_config.value` with a system content key
bound to its configuration key when both the global content flag and
`MINDDY_APP_CONFIG_ENCRYPTION_ENABLED=true` are enabled. Reads decode through
the configuration repository, including the batched reader. An existing
encrypted row stays encrypted if the write flag is later disabled. Once the
first ciphertext is stored, a database marker rejects new or changed clear
values from obsolete writers. A bounded service-only CAS worker verifies and
rotates historical values while retaining earlier key versions. The SQL
regression checks the source, stale CAS, client privileges and obsolete writer
refusal. The isolated PostgreSQL restore loads ciphertext rows before the
key registry in independent batches, recovers two key versions from cold
caches and rejects the wrong root. This does not close the other credential,
configuration, agent, issue or Numo targets. Production flags remain disabled;
representative latency and cache-load measurements are required before
activation, not code review.

## Feedback merge undo relation checkpoint — 25 September 2026

`feedback_merge_events.payload` previously held free-form JSON even though
the merge and undo logic only needs three sets of UUIDs. New merges now store
an empty payload and record moved votes, deduplicated votes and repointed
chains as typed rows in `feedback_merge_event_links` in the same SQL
transaction. Undo reads those rows under its existing event lock and retains a
legacy JSON path until historical rows are converted. A trigger rejects new
or changed non-empty payloads from older writers. A bounded service-only CAS
worker copies the historical UUIDs to typed rows and clears the JSON; failed
attempts rotate through the queue. The child table has RLS and no client
write privilege. SQL regression verifies merge and undo semantics, source
JSON absence, stale CAS and old-writer refusal. The isolated PostgreSQL
restore loads child links before events and posts in independent committed
batches and revalidates their foreign key. The cleanup worker is gated by
`MINDDY_FEEDBACK_MERGE_PAYLOAD_CLEANUP_ENABLED=true` and the global content
flag; both remain disabled in production. Other issue, forge and feedback
copies remain open.

## Feedback SSO root-key checkpoint — 25 September 2026

`feedback_boards.sso_secret` now uses the project's content key and authenticated
board identity for new writes behind the feedback SSO and global content flags.
The owner and public SSO readers support both new ciphertext and the older
environment-key envelope until migration. The locked protected RPC preserves
only-if-absent initialization, checks the board identity and returns the
current secret on a replay. A bounded CAS worker converts plaintext and old
environment-key envelopes, verifies the replacement and rotates old project
key versions. The SQL regression checks CAS, locked initialization and refusal
of the old writer after activation. An isolated PostgreSQL restore loads board
rows before parents in independent batches, recovers two project-key versions
with cold caches and rejects a wrong root. Keep the old environment secret
available until verification shows every legacy board has migrated. Production
flags remain disabled; other configuration stores remain open.

## Forge mention throttle identity checkpoint — 25 September 2026

`forge_mention_throttle.key` now uses a purpose-separated system blind index
with its search key pinned to version one. The service derives the digest before
the atomic claim; the protected RPC first folds a historical clear counter into
its indexed row under one advisory lock, preserving the current window and
count. A bounded CAS pass converts counters not touched by live claims. Once an
indexed row activates the marker, the database rejects the old clear-key RPC
and direct clear inserts or updates. SQL regression checks count continuity,
CAS, source plaintext absence, client privilege and obsolete-writer refusal.
The PostgreSQL rehearsal restores counters and both blind-index key versions
from independent batches with cold caches and rejects the wrong root. Other
forge repository and identity sidecars remain open. Production flags remain
disabled; representative throughput and key/cache-load measurements are a
prerequisite to production activation, not code review.

## Durable Numo activity checkpoint — 25 September 2026

Non-worker `numo_turn_events.payload` now uses a user-key envelope bound to the
event ID and carries its turn and owner IDs for database validation. The durable
emitter encrypts before the idempotent append RPC; the authorized status reader
decodes after conversation access. Worker event payloads retain their existing
project-bound encryption and checkpoint synchronization. A bounded CAS worker
converts clear historical activity and rotates older user key versions. The
database rejects new clear non-worker payloads after activation. Isolated SQL
regression and PostgreSQL dump/restore check source plaintext absence, old
writer rejection, child-first independent batches, two key versions, cold
caches and a wrong-root rejection. Other Numo message, turn, tool-operation and
conversation fields remain open, including copies of some activity content.
Production flags remain disabled; representative search, latency and key/cache
measurements precede production activation.

## Provider operation resource identity checkpoint — 25 September 2026

`provider_operation_reservations.resource_key` now stores a purpose-separated
system blind index pinned to search-key version one. The protected reservation
RPC checks active legacy and indexed leases under the original actor/resource
lock order, so duplicate suppression and sliding-window quotas continue during
migration. The protected release converts an old active lease in the same
transaction. A bounded service-only CAS pass converts remaining rows without
granting direct table reads to the service role. The database refuses new clear
keys and obsolete clear writers after activation. SQL regression checks quota
and lease continuity, source plaintext absence, CAS, client privileges and old
writer rejection. The PostgreSQL rehearsal restores reservations before their
owner and key registry, checks both blind-index key versions with cold caches
and rejects a wrong root. Production flags remain disabled; other private
forge repository paths still need conversion.

## Agent chain code boundary — 25 September 2026

`agent_chains.pending_event` and `stop_reason` carry only finite routing codes.
The database now validates the exact two-key pending event shape and both code
sets on new or changed values. Arbitrary JSON or text from an obsolete writer
is rejected. A bounded service-only CAS pass clears invalid historical pending
events and replaces invalid stop reasons with the `invalid` code. Valid codes
remain available for the scheduler, report, Realtime and analytics without
project-key decryption. The SQL regression verifies source and old-writer
behavior; an isolated PostgreSQL restore loads chains before issue and project
parents in separate committed batches and validates the references. The cleanup
worker requires `MINDDY_AGENT_CHAIN_CODE_CLEANUP_ENABLED=true` and the global
content flag. Both remain disabled in production. Numo conversation and tool
content remains open.

## Numo turn admission snapshot checkpoint — 25 September 2026

`numo_assistant_turns.intent` retains the admitted automation issue title and
plan across retries. New turns now seal the complete intent under the user's
content key, authenticated to the immutable conversation and request identity.
The ordinary and budgeted admission RPCs store the same opaque JSON wrapper;
claim, checkpoint, stop, retry, routine and automation readers decode it at the
server boundary. A database trigger validates row bindings and key versions,
marks activation on the first encrypted write, and refuses changed clear intent
from older writers. A bounded CAS worker converts and rotates historical rows.
The unit and SQL regressions verify source plaintext absence, binding, stale
CAS and old-writer refusal. The isolated dump/restore loads turns before their
conversation and owner parents, reads two key versions with cold caches and
rejects a wrong root key. Conversation messages, checkpoints and tool results
still have their own plaintext paths, so
the Numo boundary is not closed. Production flags remain disabled.

## Durable Numo automation operation checkpoint — 25 September 2026

`numo_automation_operations.prompt`, `context`, `outcome_summary` and
`outcome_blockers` now have project-key format-3 envelopes bound to the chain,
step and field. The reservation, recovery, chain verdict and outcome tool paths
decode at the server boundary. Outcome idempotence compares decoded values.
The database marks activation on the first encrypted write, validates JSON
envelope identity, rejects changed clear values and lower key versions, and
keeps historical rows writable only until their bounded service-only CAS pass
converts them. The unit and SQL regressions verify the source, field binding,
stale CAS and obsolete writers. An isolated dump/restore loads operations
before chain and conversation parents in independent batches, recovers two key
versions with cold caches and rejects a wrong root key. The worker requires
`MINDDY_NUMO_AUTOMATION_ENCRYPTION_ENABLED=true` and the global content flag;
both remain disabled in production. The reservation now stores only the issue
routing identifier as its conversation title; its CAS migration removes the
historical issue-title prefix from first-step conversations. This checkpoint
does not close the Numo or agent boundary. Conversation error messages,
assistant messages, tool
operations, checkpoints and projections remain open. Representative search,
latency and key/cache-load measurements precede production activation.

## Numo agent-title editor checkpoint — 25 September 2026

The shared Numo conversation edit RPC previously wrote agent conversation
titles into the legacy clear column. The authorized API now resolves the
invoker-visible agent conversation, encrypts an edited title under its project
key, and passes only the envelope and version to the locked RPC. The RPC keeps
its project-access and ownership checks, accepts the protected agent fields,
and lets the existing agent title guard reject an obsolete clear-title edit
after activation. Its assistant branch follows the conversation title
checkpoint below. The
isolated SQL regression verifies the encrypted agent row and Numo projection,
obsolete writer refusal and client privilege. Production flags remain off.

## Assistant conversation title checkpoint — 25 September 2026

`conversations.title` now uses a user-key format-3 envelope authenticated to
the conversation ID. Direct chat, surface, intent, account import and edit
writers encrypt before persistence. Routine and automation reservations use
the stable request ID for the new conversation, so their SQL transactions can
insert a title encrypted beforehand without weakening claim or replay checks.
The invoker history views project ciphertext; authorized history/detail and
account export readers decode after access. A bounded service-only CAS pass
converts historical titles and rotates old key versions. The activation guard
refuses changed clear titles and lower versions. Unit and SQL regressions test
source, view, both SQL reservation writers, stale CAS and old-writer refusal.
The isolated dump/restore loads conversation identities and conversations in
independent child-first batches, recovers two user-key versions with cold
caches and rejects a wrong root. The worker requires
`MINDDY_NUMO_CONVERSATION_TITLE_ENCRYPTION_ENABLED=true` and the global content
flag, both off in production. Conversation error messages, assistant messages,
turn outcomes and checkpoints remain open; this is not a global Numo closure.

## Durable Numo user-message checkpoint — 25 September 2026

The ordinary and budgeted Numo admission RPCs now persist the user message
under a predetermined message ID. The user's prompt, context and metadata are
sealed together under a user-key format-3 envelope bound to that ID. The SQL
transaction still admits the turn, message and conversation status atomically;
repeated request IDs reuse the original turn and message. The `numo_messages`
view projects only the ciphertext and cleared context/metadata. Authorized
history, execution, attachment, account import and export paths decode after
access checks. Worker-parent messages keep their separate project-key boundary.

The activation marker rejects obsolete direct user-message inserts and clears
after the first protected write. A service-only 30-row compare-and-swap worker
verifies historical conversion and rotates old key versions. The ordinary and
budgeted admission regression checks source, projection, idempotence, CAS and
old-writer rejection. A real PostgreSQL dump/restore loads messages before
turns, conversations and owner rows in separate transactions, validates their
foreign keys, reads two user-key versions with cold caches and rejects a wrong
root. `MINDDY_NUMO_USER_MESSAGE_ENCRYPTION_ENABLED` and the global content flag
remain off in production. Assistant/tool messages, turn checkpoints, tool
operations, outcomes and conversation errors still contain plaintext paths;
the Numo and global boundaries remain open. Representative search, latency,
key/cache and load measurements remain checks before production activation.

## Durable Numo final-answer checkpoint — 25 September 2026

Final `assistant_messages` rows now seal answer content, reasoning metadata,
context and legacy tool identity under a user key bound to the message ID.
`numo_assistant_turns.outcome` uses a separate turn-bound envelope. The
`numo_messages` and `numo_turns` views expose only ciphertext and cleared
message metadata; authorized history, turn execution, surface projection and
account export readers restore the logical values after access checks. Account
import encrypts standalone assistant answers. A saved answer can still recover
a turn after a crash before checkpointing, and a concurrent duplicate insert
reloads the original answer ID.

The activation marker rejects old clear final-message and outcome writers.
Service-only bounded migration locks each turn and its final message, checks
their prior values and converts both in one SQL transaction; standalone
answers use the same compare-and-swap RPC without a turn. The SQL regression
checks source and Numo views, obsolete writers, stale CAS and copy clearing.
PostgreSQL recovery loads messages and turns before their owners in independent
batches, validates foreign keys, reads two user-key versions with cold caches
and rejects a wrong root. The new flag is off in production. Tool-call and
tool-result messages, checkpoints, tool operations, errors and routine copies
remain open; this is not a global Numo or agent boundary closure.

## Durable Numo error-copy checkpoint — 25 September 2026

Turn errors, conversation errors and routine occurrence failures now use
separate user-key format-3 envelopes bound to each row. The turn checkpoint
RPC writes its turn and conversation copies in one transaction; the routine
failure RPC does the same for an occurrence and its conversation. The SQL
recovery functions retain their status signals without persisting fixed clear
error text. Invoker views project ciphertext. Authorized conversation,
status, routine and turn readers decode after access checks. A service-only
bounded CAS worker migrates and rotates each source with its conversation
copy; an activation marker rejects changed clear errors and obsolete writers.

The SQL regression checks all three source tables, Numo projections, stale
CAS, old-writer refusal and RPC grants. Isolated PostgreSQL recovery restores
child rows before their parents in separate batches, decrypts two key versions
from cold caches and rejects a wrong root key. The global content flag and
`MINDDY_NUMO_ERROR_ENCRYPTION_ENABLED` remain disabled in production.
Search, latency, key-cache and load measurements remain checks before
production activation, not blockers to review of the code PR.

## Durable Numo tool content checkpoint — 25 September 2026

Assistant tool-call rounds, tool-result messages, model/tools checkpoints and
the arguments, result and model result of the replay ledger now use separate
user-key format-3 envelopes. Assistant rounds and their checkpoint are inserted
atomically. The ledger compares a stable purpose-separated argument digest so
randomized ciphertext does not break idempotent claims. The worker run ID is
retained as a typed routing reference; obsolete JSON readers and writers are
rejected by activated SQL guards. Authorized conversation, routine, export,
surface and replay readers decode after ownership checks. A bounded CAS worker
rotates message/checkpoint pairs and ledger rows. The message and operation
regression verifies source and projection storage, old-writer refusal, grants
and replay behavior. Isolated PostgreSQL recovery loads operation and message
children before turns, conversations and users in separate batches, checks two
key versions with cold caches and rejects a wrong root key.

`MINDDY_NUMO_TOOL_CONTENT_ENCRYPTION_ENABLED` remains disabled in production.
Representative search, latency, key-cache and load checks remain pre-activation
controls, not blockers to review of the code PR.

## Recoverable forge repository identity checkpoint — 25 September 2026

Private GitHub and GitLab repository names now use a stable, purpose-separated
system blind-index token in SQL equality keys. A service-only registry retains
the original spelling in a format-3 system-key envelope bound to provider and
token. Link owner/name duplicates are cleared; aliases, PR keys and sync stamps,
PR comment history, relay mirrors and relay claims use the same token within
their own database. Authorized readers recover the name after their project,
PR or verified forge-event access check. Clear names sent to GitHub, GitLab or
an authorized relay remain external transmissions, not durable Minddy copies.

The link, webhook, agent, notification, AI, relay and PR paths use the token for
database lookup. Protected repository rename moves links, PRs, comment edits
and stale sync state in one SQL transaction, preserving duplicate-PR attachment
behavior. The service-only 30-row worker compares each old row before writing,
registers aliases, and rotates registry envelopes without changing tokens.
Activation refuses a clear or unregistered name anywhere in the six source
and copy tables. Once activated, table guards reject older direct and RPC
writers. The SQL regression proves source/copy and PR-join storage, CAS,
rename and obsolete-writer rejection. Real PostgreSQL recovery restores child
copies before links and the registry in independent batches, decrypts two key
versions from cold caches and rejects a wrong root.

`MINDDY_FORGE_REPOSITORY_NAME_ENCRYPTION_ENABLED` and the global content flag
remain disabled in production. Other forge fields and the global MIN-591
boundary remain open. Representative search, latency, key-cache and load
measurements are checks before production activation, not code PR blockers.

## Forge default-branch checkpoint — 25 September 2026

`project_git_links.default_branch` now uses a format-3 project-key envelope
bound to the stable project ID. The authorized link and clone repositories
decrypt it before using a branch at the forge or copying it into an agent
launch. The agent run and runtime copies retain their separate protected
branch bindings. New binding writes encrypt under an opt-in flag; a global
activation marker rejects old clear updates and inserts after all rows have
passed verification. A 30-row compare-and-swap worker verifies and rotates
historical values without changing the repository link identity.

The SQL regression proves the source, projection, stale-CAS rejection, old
writer refusal and service-only migration grant. A real PostgreSQL restore
loads the link children before their projects and connection in independent
batches, decrypts two key versions with cold caches and rejects a wrong root.
`MINDDY_FORGE_DEFAULT_BRANCH_ENCRYPTION_ENABLED` remains off in production.
Legacy forge webhook credentials and other global MIN-591 sources remain open.

## Private project icon checkpoint — 25 September 2026

`projects.icon_url` becomes a local authorization-gated route and
`icon_storage_path` is an opaque immutable object path. Icon bytes and MIME
metadata use the project-key object codec. New writes upload and verify a
ciphertext object, register it, then compare-and-swap the project reference;
the prior object is removed after the swap. Account import re-encrypts transfer
bytes, and an owner-authorized export deliberately transmits clear bytes to
that external recipient. Current members can read the route. Enabled feedback
boards and public, unlocked shares can use their existing capability tokens;
password-protected share pages show the generated orb instead of widening their
path-scoped unlock cookie. Invitation emails likewise use the orb when the icon
route requires an account session.

The bounded worker converts historic objects or guarded external icon URLs,
rotates old key versions and removes orphaned clear objects. Activation refuses
any unverified project reference or unregistered Storage object, then makes the
bucket private in the same database transaction. Storage RLS bars
authenticated direct object reads and writes; a storage trigger rejects old
service-role object paths after activation. The bucket reconciliation script preserves
public access only until that activation marker exists. SQL and route tests
prove the source, old-writer rejection, capability checks and private bucket
switch; a PostgreSQL dump/restore test loads child references in independent
batches and verifies two key versions from cold caches and wrong-root rejection.
`MINDDY_PROJECT_ICON_ENCRYPTION_ENABLED` remains disabled in production. The
global MIN-591 boundary remains open; representative search, latency, key-cache
and load measurements are required before production activation, not for code
review of this PR.

## Project and personal board view checkpoint — 25 September 2026

`views.name`, `filters` and `display` use one row-bound format-3 envelope with
the project key for project views and the user key for global personal views.
Creation, baseline seeding, revision-guarded edits and account transfer use the
same codec. Authorized list, Numo tool, owner export, shared-view and feedback
navigation readers decode only after their existing access or capability gate.
The generic Realtime payload and SQL share join now contain ciphertext and
null protected columns. Share tokens are decoded independently after the
public-tab visibility check.

The 30-row worker verifies and rotates legacy and old-key rows with a
content-revision compare-and-swap. Activation requires every row to be checked
and rejects subsequent clear inserts, edits and owner changes. The SQL
regression verifies source and share projection clearing, a stale revision and
old-writer rejection. PostgreSQL recovery restores share children before views
and their owners in independent batches, reads two key versions from cold
caches and rejects a wrong root key. `MINDDY_VIEW_CONTENT_ENCRYPTION_ENABLED`
remains disabled in production. The global MIN-591 boundary remains open.

## Personal saved-view bookmark checkpoint — 25 September 2026

`saved_views.name` and `href` use one user-key format-3 envelope. Name equality
uses a purpose-separated user blind-index key pinned to version one, so content
rotation cannot change uniqueness or resave behavior. Authenticated RLS reads
establish ownership before decoding; account export sends clear values only to
the authorized owner, while account import re-encrypts them under the target
user. Legacy bookmarks retain their equality path until the bounded 30-row
CAS worker verifies and converts them. Activation requires a checked encrypted
row for every bookmark; table guards then refuse clear inserts, edits, owner
changes and key downgrades.

The SQL regression checks source clearing, protected uniqueness, stale CAS,
service-only activation and obsolete-writer refusal. A PostgreSQL restore loads
bookmarks before the user in independent batches, decodes two content-key
versions and the stable index from cold caches, and rejects a wrong root key.
`MINDDY_SAVED_VIEW_ENCRYPTION_ENABLED` stays off in production. Other MIN-591
targets remain open; representative search, latency, key-cache and load checks
are required before production activation, not code-review blockers.

## Agent routine instruction checkpoint — 25 September 2026

`agent_routines.title`, `prompt`, `prompt_mentions` and the optional
`base_branch` use a project-key format-3 envelope bound to the routine ID.
The `last_error` field contains only one of the documented bounded error codes;
historic free-form errors become `launchFailed` during conversion. Owner
creation and revision-guarded edits, due scans, occurrence recovery and account
transfer use the same codec. Member or owner access is checked before full
routine reads; authenticated app-tab labels, owner trash, inbox and push
notification readers decrypt only the title after their existing gates.
Realtime and SQL occurrence references retain IDs and ciphertext, not a clear
instruction copy. An encrypted routine occurrence refuses to start until the
existing Numo conversation-title, user-message, intent, event, tool, final and
error copy paths are also protected; the rollout activates these converted
paths together so the prompt cannot be copied into a legacy clear turn.

The 30-row worker verifies source content and rotates old keys under a
content-revision compare-and-swap. Activation checks every row and thereafter
rejects clear inserts, updates, scope changes, key downgrades and free-form
error text. SQL regression checks the source, stale CAS, metadata-only status
updates and old-writer refusal. PostgreSQL recovery loads routine children
before projects and users in independent batches, reads two key versions from
cold caches and rejects a wrong root key. The production flag
`MINDDY_AGENT_ROUTINE_ENCRYPTION_ENABLED` remains off; the wider MIN-591
boundary remains open.

## Project identity and configuration checkpoint — 25 September 2026

`projects.name`, `automations` and `smart_assign_rules` use a row-bound project
key envelope. The project acronym remains a routing identifier. An icon URL is
permitted as metadata only after the private object conversion has replaced it
with the local versioned route; an external icon URL blocks content activation.
Project creation, owner-only revision-guarded content edits and account import
encrypt complete rows. Account export restores only authorized plain fields.
Membership and owner checks precede decryption. Public board and share
capabilities, invitation tokens, agent and Numo context, MCP, webhook delivery,
statistics, billing and trash hydrate the name through their existing access
gate. The statistics RPCs return no source name and the application hydrates
authorized labels after receiving identifiers.

The 30-row worker verifies legacy or old-key content and advances it with a
content-revision compare-and-swap. SQL activation requires the private project
icon marker and checked encrypted rows; the guard rejects clear inserts,
updates, scope changes, key downgrades and external icon references. The SQL
regression checks source/member projections, stale CAS and old writers.
PostgreSQL recovery restores member children before projects and users in
independent batches, verifies two key versions from cold caches and rejects a
wrong root key. `MINDDY_PROJECT_CONTENT_ENCRYPTION_ENABLED` remains disabled
in production. Pages and other global MIN-591 targets remain open. Search,
latency, key-cache and load measurements are pre-activation checks, not code PR
blockers.

## Page content and database-cell checkpoint — 26 September 2026

Page titles, icons, bodies, database schemas, title-column names and entry
values now use one project-bound row envelope. Page history and file metadata
retain their earlier independent encryption. Authorized page, AI/MCP, export,
Numo and public-share readers decode after their access gate. Public branch
reads scan only page IDs and parent IDs across the project before fetching
content for the branch; unrelated pages are never decrypted for that share.
Search reads RLS-visible pages in batches and ranks the decoded content in the
application. The stored search text and generated vector clear with the source.
Realtime carries invalidation metadata without content or ciphertext.

Page edits, duplicate trees, database schema/value changes and archive imports
write ciphertext. The database batch checks parent and child revisions while
holding locks and updates deleted entries alongside a changed schema, so
restoration cannot revive stale cells. Imports keep request replay atomic. The
permanent-delete foreign keys now cascade through encrypted page trees instead
of detaching populated entries. A 30-row worker verifies legacy conversion and
rotates old envelopes under a content-revision compare-and-swap. Activation
requires checked encrypted rows and rejects obsolete plaintext writers.

The isolated SQL regression covers sources, search and Realtime projections,
atomic database edits/import, idempotence, trashed entries, purge and old-writer
rejection. A real PostgreSQL dump/restore loads encrypted children before
parents, projects and users in separate batches, verifies two key versions from
cold caches and rejects an incorrect root key. The page flag and global content
flag remain disabled in production. Representative search, latency, key-cache
and load measurements remain controls before production activation, not code
PR blockers. Other MIN-591 targets remain open.

## BYOK credential checkpoint — 26 September 2026

`user_ai_keys.key_encrypted`, `base_url` and `feature_models` now move together
into a row-bound user-key envelope. Capability assignments retain only opaque
credential IDs. Account settings decode only after the owner check and return
an explicit safe projection without the credential. Agent resolution uses the
same codec; account export includes the endpoint but never the secret.

Protected save and preference RPCs preserve assignment atomicity and use the
content revision as a compare-and-swap token. A 30-row maintenance pass
verifies legacy credentials, migrates or rotates them and records conflicts.
Failed attempts advance an independent queue timestamp without marking the row
verified, so an unreadable credential cannot starve later rows or activate the
gate.
Activation requires checked sealed rows; SQL rejects clear inserts, updates,
scope changes and obsolete writers. The regression covers source and old RPC
rejection. PostgreSQL recovery loads assignments before credentials and users
in separate batches, reads two key versions with cold caches and rejects an
incorrect root key. `MINDDY_USER_AI_KEY_ENCRYPTION_ENABLED` and the global
content flag remain off in production. Other legacy credential stores and the
remaining MIN-591 boundaries are still open.
