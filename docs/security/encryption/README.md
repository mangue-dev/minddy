# Global encryption inventory and delivery requirements

MIN-591 is one application-wide delivery. The existing invitation implementation
is a small converted surface, not the production rollout boundary. Do not enable
production migration on the strength of crypto unit tests or this inventory.

## Inventory and reproducibility

- `schema.json` records 116 application tables and 1,217 columns, their primary
  keys and foreign keys. It contains schema metadata, not application rows.
- `../../../lib/server/encryption/data-policy.json` classifies every recorded
  column exactly once. Its 188 encryption targets include the original content,
  derived copies, arbitrary user JSON, private identities, credentials and share
  tokens. This is a target policy, not evidence that those columns are encrypted.
- `consumers.json` records TypeScript/JavaScript table, view, RPC and object-store
  access candidates. Dynamic table names remain explicit `null` entries requiring
  caller review. Array and Buffer constructors are excluded.
- `sql-consumers.json` records 228 functions, ten views and 129 triggers. Function
  and view hashes pin the observed definitions without copying their bodies.
  Relation references are conservative text matches, not a SQL data-flow proof.
- `migrations.json` pins migration inputs. CI rejects added or changed migrations
  until the schema audit is refreshed, and rejects changed access candidates
  until the consumer inventory is reviewed. Moving a call to another line alone
  does not invalidate the inventory.

The current snapshot comes from a complete replay of all 103 migrations on the
isolated local Supabase stack. No production rows were copied. Migration
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
| Projects, issues, objectives, categories, comments, pages and views | Convert every server repository read/write and all imports, exports, MCP and AI consumers; add ciphertext/version storage and reject older plaintext writers. Preserve access checks before decryption and existing concurrency semantics. |
| Histories and derived copies | Page versions, issue events and statistics now have converted repositories and migration. Assistant/agent conversations, checkpoints, messages, journals, tool arguments/results and surface projections remain to be converted with their source rows. |
| SQL functions and views | Review the recorded candidates; keep metadata-only transactions in SQL, move content transformations/search into authorized repositories and preserve atomic claims, counters, revisions and idempotency. The Numo view replay failure is fixed and its RLS regression passes; content transformations remain to be converted. |
| Search and equality | Implement application search with correct filtering, ordering, pagination and permissions. Add purpose-separated equality indexes for private identifiers and uniqueness; do not silently rotate a blind-index key independently of its indexed rows. |
| Forge data | Resolve ownership of repository data shared by several projects. Private repository names currently participate in primary/unique keys and lookup paths; introduce opaque/indexed identities before encrypting them. The generic row codec deliberately refuses sensitive primary keys. |
| Files and images | Replace direct browser uploads and signed plaintext-object reads with authorized server paths. Use opaque object names; migrate attachments, page files and private project icons, including copies/imports/exports/AI downloads and orphan cleanup. Public avatars have an explicit public-use exception. |
| Feedback and sharing | Encrypt private feedback identities/content/embeddings and recoverable share tokens, with lookup indexes and retention. Owner dialogs must still recover share URLs, so hashing the only stored share token would break the product. |
| Credentials and configuration | Migrate legacy environment-key envelopes and secret/configuration stores to the agreed protected boundary; verify Vault privileges and deployment-level statement logging. Never treat arbitrary configuration JSON as automatically public. |
| Migration and recovery | Add restartable batches for every target and object, compare-and-swap against concurrent edits, verification counters, rejection of obsolete writers, a restoration rehearsal and retention of historical wrapped keys. Test mixed plaintext/encrypted tenants and old versions. |
| KMS and operations | Provision a separate test key/role, run the real-KMS test and application-scale latency measurements, verify production IAM/audit/alerts and backup recovery. Production deployment and migration require a later explicit deployment request. |

The common row codec is connected to personal notes and statistics snapshots.
The other repositories in the table above remain unconverted. It authenticates the real primary key, table and owner, requires complete rows,
distinguishes legacy and encrypted states, clears protected columns and rejects
remaining plaintext search projections. Parent-owned records still require a
trusted repository to resolve and authorize their scope before calling it.

New encrypted values use envelope format 3. Each write derives a fresh AES-256
key with HKDF-SHA-256 from the cached scope DEK, a random 256-bit salt and the
complete authenticated context. That context includes the owner, table, column,
primary key, DEK version and JSON/binary encoding. A random 96-bit GCM nonce is
then used under that derived key. This avoids accumulating every scope write
under one AES key; a cache TTL alone would not limit that key's lifetime use.
Derivation is local and adds no KMS calls. Independent WebCrypto interoperability
and tampering tests exercise both encryption directions. See
[RFC 5869](https://www.rfc-editor.org/info/rfc5869/) for HKDF. This is Minddy's own
versioned envelope format, not the AWS Encryption SDK's wire format.

Formats 1 and 2 remain readable. Format 2 introduced authenticated key versions;
format 1 lacks that binding and must eventually be rewritten. Converted row
backfills upgrade old formats as well as old DEK versions. Invitation backfill
still only selects legacy rows, so its encrypted historical values need an
additional rotation pass. Rollback binaries must understand format 3 after any
format-3 writes. JSON strings cannot be reliably erased from JavaScript memory;
the store wipes the mutable plaintext/key buffers that it owns.

## Converted personal content and migration rehearsal

`MINDDY_CONTENT_ENCRYPTION_ENABLED=true` enables staging writes and maintenance
for `user_scratchpad`, `stat_events`, `issue_events` and `page_versions`. Keep it disabled in production until the
application-wide gates are satisfied. It is independent of the invitation flag.
Disabling it pauses backfill and new-record opt-in; already encrypted notes still
require decryption and encrypted writes. Task-completion snapshots derived from
those notes remain encrypted even with the flag disabled. KMS failures never
fall back to plaintext. Statistics retain their existing best-effort delivery
contract; account imports instead surface failures.

The shared note repository serves the API, MCP and agent operations and account
transfer. Notes retain their optimistic revision check: migration advances the
revision and obsolete edits conflict. Imports no longer bypass that check or
silently truncate oversized notes. Realtime sends only invalidation metadata,
including on legacy rows. Statistics protect the project name, issue title and
task label together; their user scope remains valid after source deletion. The
current SQL aggregates only need clear ledger metadata. Project/category/objective
names in those aggregates still need conversion with their source tables.

The shared row worker reads a bounded batch, decrypts and verifies its newly
encoded replacement, then commits under repository-specific revision/ownership
checks. It counts failed/conflicted rows without logging their content. Attempt
ordering revisits failures without starving subsequent rows. Maintenance processes
at most 50 rows each for notes, statistics, activity and page versions per run,
alongside the invitation batch.
Each repository reports failure independently. Constraints reject plaintext in
converted rows, version inconsistencies, revision rollback and identity changes.

An opt-in local integration test uses real PostgreSQL key-registry RPCs and a
real `pg_dump`/restore of notes, statistics, wrapped keys and fixture users into
disposable databases. A second rehearsal covers project activity and page
snapshots across key rotation. These tests recover mixed legacy/current/historical versions
with empty caches, and rejects the wrong wrapping key. The KMS in this test is an
in-memory substitute, not AWS. This is a restoration proof for those tables,
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
MINDDY_ENCRYPTION_DB_TEST=true npm test -- lib/server/encryption/database-recovery.integration.test.ts
```

The SQL rehearsals roll back all fixtures and check RLS, obsolete writers,
constraint failures, metadata-only Realtime, statistics aggregation and snapshot
survival after source deletion. The recovery test creates and drops only its
uniquely named databases and requires an empty audit template. Default tests
skip this integration test and the live AWS test. Policy-wide serialization
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
new histories remain encrypted even with the rollout flag off. Without KMS
configuration, stale legacy writers are rejected by the database rather than
allowed to leak new snapshots. History writes retain their existing best-effort
contract; provider/database failures produce generic error logs and no plaintext
fallback. Deployment must drain old writers and monitor those failures.

Only the metadata initialization (`project_id` and `starts_work`) is performed
inside the schema migration. Its table-lock duration must be measured on a
representative staging database. Content conversion itself remains bounded,
verified and resumable. These changes do **not** yet encrypt the current issue,
page, objective, feedback or comment bodies; the global activation remains
blocked on their conversion and the other surfaces listed above.

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
compromised, and does not replace content encryption or KMS isolation.

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
An attempt timestamp is persisted before the KMS call, and unattempted/older
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

## Managed KMS setup

A KMS is a managed service that keeps the root key outside the application
database. The application authenticates with an IAM role and asks KMS to wrap or
unwrap tenant data keys. The root key itself never reaches the application.

`deploy/aws/data-encryption-kms.json` is a CloudFormation template for one
environment. It enables native root-key rotation, retains the key when a stack
is deleted/replaced, and grants the supplied application role only
`GenerateDataKey` and `Decrypt`, restricted to Minddy encryption contexts.
Account administrators can still change policy, as required for recovery; the
application role must not also receive administration permissions through IAM.

An operator must first create/use an AWS account and an application IAM role,
configure the hosting platform to assume that role, then deploy this template
in the chosen region. Prefer short-lived workload credentials. Use separate
keys and roles for test and production. The stack outputs provide
`MINDDY_DATA_KMS_KEY_ID` and `MINDDY_DATA_KMS_REGION`; an ARN is an identifier,
not a secret. Neither the role nor the stack has been provisioned by this change.

Once a test role and key exist, run the explicitly enabled integration test:

```sh
MINDDY_KMS_INTEGRATION_TEST=true npm test -- lib/server/encryption/kms.integration.test.ts
```

It makes real GenerateDataKey/Decrypt calls using the configured test key,
checks scope authentication and historical-key reads, and prints cold/warm
crypto timing percentiles without plaintext or key material. It stores wrapped
test keys only in process memory. The default test suite skips it. Its registry
is in memory, so the timings are not repository, database or search benchmarks.
No real KMS timing or CloudFormation deployment has been verified yet.

AWS references: [CloudFormation KMS key configuration](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-kms-key.html),
[encryption context](https://docs.aws.amazon.com/kms/latest/developerguide/encrypt_context.html)
and [KMS policy conditions](https://docs.aws.amazon.com/kms/latest/developerguide/conditions-kms.html).
