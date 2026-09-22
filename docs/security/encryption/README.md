# Global encryption inventory and delivery requirements

MIN-591 is one application-wide delivery. The existing invitation implementation
is a small converted surface, not the production rollout boundary. Do not enable
production migration on the strength of crypto unit tests or this inventory.

## Inventory and reproducibility

- `schema.json` records 116 application tables and 1,200 columns, their primary
  keys and foreign keys. It contains schema metadata, not application rows.
- `../../../lib/server/encryption/data-policy.json` classifies every recorded
  column exactly once. Its 188 encryption targets include the original content,
  derived copies, arbitrary user JSON, private identities, credentials and share
  tokens. This is a target policy, not evidence that those columns are encrypted.
- `consumers.json` records TypeScript/JavaScript table, view, RPC and object-store
  access candidates. Dynamic table names remain explicit `null` entries requiring
  caller review. Array and Buffer constructors are excluded.
- `sql-consumers.json` records 224 functions, ten views and 125 triggers. Function
  and view hashes pin the observed definitions without copying their bodies.
  Relation references are conservative text matches, not a SQL data-flow proof.
- `migrations.json` pins migration inputs. CI rejects added or changed migrations
  until the schema audit is refreshed, and rejects changed access candidates
  until the consumer inventory is reviewed. Moving a call to another line alone
  does not invalidate the inventory.

The snapshot came from a schema-only copy of the isolated local Supabase stack,
with later table migrations applied. No production rows were copied. A known
replay failure remains in `20270106910000_numo_history_drop_detail_href.sql`:
`CREATE OR REPLACE VIEW` attempts to remove an existing column. The recorded
Numo views therefore still have their preceding definitions; the later table
migrations do not change that fact. A successful fresh replay and a refreshed
view inventory are required before declaring the schema audit complete.

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
| Histories and derived copies | Convert page versions, issue events, statistics, assistant/agent conversations, checkpoints, messages, journals, tool arguments/results and surface projections together with the original rows. Remove plaintext SQL projections. |
| SQL functions and views | Review the recorded candidates; keep metadata-only transactions in SQL, move content transformations/search into authorized repositories and preserve atomic claims, counters, revisions and idempotency. The Numo view replay error must be resolved and replayed. |
| Search and equality | Implement application search with correct filtering, ordering, pagination and permissions. Add purpose-separated equality indexes for private identifiers and uniqueness; do not silently rotate a blind-index key independently of its indexed rows. |
| Forge data | Resolve ownership of repository data shared by several projects. Private repository names currently participate in primary/unique keys and lookup paths; introduce opaque/indexed identities before encrypting them. The generic row codec deliberately refuses sensitive primary keys. |
| Files and images | Replace direct browser uploads and signed plaintext-object reads with authorized server paths. Use opaque object names; migrate attachments, page files and private project icons, including copies/imports/exports/AI downloads and orphan cleanup. Public avatars have an explicit public-use exception. |
| Feedback and sharing | Encrypt private feedback identities/content/embeddings and recoverable share tokens, with lookup indexes and retention. Owner dialogs must still recover share URLs, so hashing the only stored share token would break the product. |
| Credentials and configuration | Migrate legacy environment-key envelopes and secret/configuration stores to the agreed protected boundary; verify Vault privileges and deployment-level statement logging. Never treat arbitrary configuration JSON as automatically public. |
| Migration and recovery | Add restartable batches for every target and object, compare-and-swap against concurrent edits, verification counters, rejection of obsolete writers, a restoration rehearsal and retention of historical wrapped keys. Test mixed plaintext/encrypted tenants and old versions. |
| KMS and operations | Provision a separate test key/role, run the real-KMS test and application-scale latency measurements, verify production IAM/audit/alerts and backup recovery. Production deployment and migration require a later explicit deployment request. |

The common row codec is tested but is not yet connected to those repositories.
It authenticates the real primary key, table and owner, requires complete rows,
distinguishes legacy and encrypted states, clears protected columns and rejects
remaining plaintext search projections. Parent-owned records still require a
trusted repository to resolve and authorize their scope before calling it.

New encrypted values use envelope format 2, which authenticates the DEK version
as well as the row/table/column/owner. Format 1 did not include the key version
in AAD: if two registry versions referred to the same wrapped key, changing the
envelope's version could still authenticate. A regression test demonstrates
that format 2 rejects this change and a format downgrade. Existing format-1
values remain readable; the eventual re-encryption pass must upgrade them.
Rollback binaries must understand format 2 after any format-2 write occurs.

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
work remains required. Maintenance is still gated by the existing invitation
write flag until the global repositories and rollout controls are implemented.
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
