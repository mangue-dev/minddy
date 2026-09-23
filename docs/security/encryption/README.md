# Global encryption inventory and delivery requirements

MIN-591 is one application-wide delivery. The existing invitation implementation
is a small converted surface, not the production rollout boundary. Do not enable
production migration on the strength of crypto unit tests or this inventory.

## Inventory and reproducibility

- `schema.json` records 116 application tables and 1,242 columns, their primary
  keys and foreign keys. It contains schema metadata, not application rows.
- `../../../lib/server/encryption/data-policy.json` classifies every recorded
  column exactly once. Its 188 encryption targets include the original content,
  derived copies, arbitrary user JSON, private identities, credentials and share
  tokens. This is a target policy, not evidence that those columns are encrypted.
- `consumers.json` records TypeScript/JavaScript table, view, RPC and object-store
  access candidates. Dynamic table names remain explicit `null` entries requiring
  caller review. Array and Buffer constructors are excluded.
- `sql-consumers.json` records 247 functions, ten views and 135 triggers. Function
  and view hashes pin the observed definitions without copying their bodies.
  Relation references are conservative text matches, not a SQL data-flow proof.
- `migrations.json` pins migration inputs. CI rejects added or changed migrations
  until the schema audit is refreshed, and rejects changed access candidates
  until the consumer inventory is reviewed. Moving a call to another line alone
  does not invalidate the inventory.

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
| Projects, issues, pages and views | Convert every server repository read/write and all imports, exports, MCP and AI consumers; add ciphertext/version storage and reject older plaintext writers. Preserve access checks before decryption and existing concurrency semantics. Objectives and category names now have converted repositories and bounded migrations; they still need representative staging validation before activation. |
| Histories and derived copies | Page versions, issue events and statistics now have converted repositories and migration. Assistant/agent conversations, checkpoints, messages, journals, tool arguments/results and surface projections remain to be converted with their source rows. |
| SQL functions and views | Review the recorded candidates; keep metadata-only transactions in SQL, move content transformations/search into authorized repositories and preserve atomic claims, counters, revisions and idempotency. The Numo view replay failure is fixed and its RLS regression passes; content transformations remain to be converted. |
| Search and equality | Implement application search with correct filtering, ordering, pagination and permissions. Add purpose-separated equality indexes for private identifiers and uniqueness; do not silently rotate a blind-index key independently of its indexed rows. |
| Forge data | Resolve ownership of repository data shared by several projects. Private repository names currently participate in primary/unique keys and lookup paths; introduce opaque/indexed identities before encrypting them. The generic row codec deliberately refuses sensitive primary keys. |
| Files and images | Replace direct browser uploads and signed plaintext-object reads with authorized server paths. Use opaque object names; migrate attachments, page files and private project icons, including copies/imports/exports/AI downloads and orphan cleanup. Public avatars have an explicit public-use exception. |
| Feedback and sharing | Encrypt private feedback identities/content/embeddings and recoverable share tokens, with lookup indexes and retention. Owner dialogs must still recover share URLs, so hashing the only stored share token would break the product. |
| Credentials and configuration | Migrate legacy environment-key envelopes and secret/configuration stores to the agreed protected boundary; verify Vault privileges and deployment-level statement logging. Never treat arbitrary configuration JSON as automatically public. |
| Migration and recovery | Add restartable batches for every target and object, compare-and-swap against concurrent edits, verification counters, rejection of obsolete writers, a restoration rehearsal and retention of historical wrapped keys. Test mixed plaintext/encrypted tenants and old versions. |
| Root key and operations | Provision a dedicated root key outside the database and rehearse key backup and restore. The offline root-key rewrap procedure is implemented and tested on isolated PostgreSQL; production rehearsal and application-scale latency remain. Production deployment and migration require a later explicit deployment request. |

The common row codec is connected to personal notes, statistics, activity, page
versions, comments (including page quotes), objectives, categories, project
creation drafts, and feedback post content. The remaining repositories in the
table above are unconverted. It authenticates the real primary key, table and owner, requires complete rows,
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

This is **not a completed feedback domain**. `feedback_users.email/name/external_id`
and the SQL/SSO equality paths still store private identities in clear; pending
`feedback_otp_codes.email` is also clear. Feedback attachments still use unencrypted
object transport, and promotion copies feedback text into the still-plaintext issue
source. These paths need coordinated repository, blind-index, object and issue
conversion before the feedback boundary can be declared complete. The branch's
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
