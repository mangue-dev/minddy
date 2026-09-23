# Application data encryption (MIN-591)

## Status and security boundary

The owner requires one complete delivery across all sensitive data. The current
global inventory, concrete blockers, root-key setup and migration requirements are in
[the global delivery inventory](encryption/README.md). The invitation-only
foundation described below is not a production rollout boundary. Personal notes
and statistics snapshots now also have repository integration and isolated
migration/recovery tests; the linked global inventory is the current status.

This is the initial implementation inventory and rollout contract. Most content
columns listed below still have unconverted plaintext access paths. No protection against a database
dump should be claimed until their plaintext columns, search projections,
history, and alternate write paths have been migrated and removed.

Minddy needs unattended server-side AI access, so the application server must be
able to decrypt. The intended boundary is a dedicated server root key outside Postgres,
versioned data keys per project or user, and authenticated application encryption
before writes. This protects a database-only extraction, including backups. It
does not protect a compromised application runtime, a principal allowed to use
both the server configuration and the database, or plaintext that has already reached external AI,
email, search, observability, exports, or files. Database RLS and application
authorization remain necessary.

Supabase Auth stores the account email as an identity used for login. It remains
in `auth.users` while Supabase Auth is the identity provider. A blind index in
Minddy's own tables cannot replace that Auth identity. User-visible display
names are intentionally public to members of their projects.

## Implemented foundation on this branch

`lib/server/encryption/` provides AES-256-GCM with row/column AAD, branded
`Encrypted<T>` values, a separate HMAC blind index, a local root-key wrapper,
bounded in-memory key caching, and an atomic SQL key registry. The first
converted column is `project_invitations.invited_email`. Its database migration
is additive: legacy rows remain marked `encryption_version = 0`, and new rows
are encrypted only when `MINDDY_INVITATION_ENCRYPTION_ENABLED=true`. Without that
flag, existing writes stay legacy. The hourly maintenance route converts up to
100 legacy invitations per run,
deletes expired legacy invitations, and clears email from answered legacy rows.
It runs on both Vercel and the self-hosted scheduler. Already encrypted expired
invitations are deleted by the daily retention sweep.
The normal retention sweep now deletes expired invitations at their
`expires_at` time rather than keeping them for another 60 days.
Maintenance also advances up to 20 current content DEKs older than 90 days,
using a version check to avoid duplicate rotations. Re-encryption of all
historical content and objects remains unfinished.

The rollout requires `MINDDY_DATA_ROOT_KEY`, a dedicated 32-byte random key
encoded as 64 hex characters. Generate it with `openssl rand -hex 32`, store it
in protected server configuration, and preserve a protected recovery copy.
The self-hosted installer generates it automatically. The root key wraps
independent random content and blind-index data keys with AES-256-GCM, binding
each wrapped key to its purpose and scope. Never put the root key or a plaintext
DEK in SQL, Git, or a client bundle. Do not reuse an existing application secret:
routine rotation of that secret would make historical content unreadable.
Before enabling the flag, apply the schema migrations, verify the key in the
target environment, and rehearse backup/key recovery on an isolated database.
The full self-hosted cold-backup procedure seals the environment alongside the
database, so the whole backup must be encrypted and access-controlled. Replacing
the root key requires an outage and the guarded
[offline rewrap procedure](encryption/root-key-rotation.md). Rehearse it with a
verified restore before production use; keep the old root for older backups.
Because there is only one production database, no migration or backfill was run
on production while preparing this branch.
Read and response paths tolerate the pre-migration invitation schema while the
flag is off, so a preview deployment sharing that database does not require a
production schema change. Encrypted writes still require the migrations first.

The invitation blind index is global so an account can claim pending invites
across projects without scanning every tenant. Equal addresses therefore have
equal indexes across projects; a database reader can correlate them. The HMAC
key itself is a separately wrapped system key, so a database-only extraction
cannot cheaply enumerate addresses. Invitation email is returned to the owner
and to the invitation recipient where the product needs it; ordinary project
members no longer receive the pending invitation list. Encrypted invitations
store a SHA-256 digest of their random preview token; legacy links keep working
while the backfill replaces their stored bearer token with its digest.

This is a foundation, not completion of MIN-591. Issue/page/comment content,
derived search/history copies, files, and other inventory rows remain clear.
There is no scheduled DEK rotation/backfill for those rows yet. Existing credential
blobs have not moved to Vault, and the managed production statement-logging
setting has not been changed. The CI guard covers literal table and RPC access
to `project_invitations` and
`envelope_data_keys` across repository JavaScript/TypeScript sources. It must
expand with each converted table; dynamically constructed queries and raw SQL
still require review.

## Column inventory

The default is to encrypt text, JSON, and user-supplied URLs unless there is a
documented reason to keep the value queryable. This inventory covers the main
tables in `20270106090000_baseline.sql`; later migrations and every derived copy
must be checked before a column is declared migrated.

| Data | Encrypt or remove from database plaintext | Clear metadata and reason |
| --- | --- | --- |
| `projects` | `name`, `smart_assign_rules`, `automations`, `icon_url` when user-provided | IDs, owner, key, colors, flags, counters, timestamps. Project key is a shared identifier used in issue references and URLs; keep it clear. |
| `objectives` | `name`, `description` | IDs, project and user references, status, target date, color, timestamps. |
| `issues` | `title`, `description`, `plan`, user-supplied `remote_url` and automation content | IDs, number, project and user references, status, priority, effort, dates, position, recurrence and forge routing identifiers. |
| `issue_events` | `from_value`, `to_value` when they contain content; event history must not preserve old plaintext | IDs, actor, type, field name, timestamps and flags. |
| `comments`, `page_comments` | `body`, `quote` | IDs, parent and author references, status and timestamps. |
| `pages`, `page_versions` | `title`, `content`, and `search_text`; remove plaintext `search_tsv` projection | IDs, hierarchy, version, position, icon if catalog-only, flags, author and timestamps. |
| `feedback_posts` | Private `title`, `body`, submitted and translated text, moderation explanation, embeddings if reversibility or membership leakage is possible | IDs, status, counts, visibility, classification and timestamps. Public posts require a separate publication projection. |
| `project_invitations` | `invited_email` with an HMAC equality index; purge ciphertext and index when accepted, rejected, cancelled or expired | IDs, inviter/invitee references, status and dates. `token` is a bearer secret and needs a one-way digest, not reversible encryption. |
| `feedback_users` | `email`, private `name`, `external_id` if it identifies a person; equality needs scoped blind indexes | ID, project ID, verification state and dates. Public pseudonyms remain clear only when published by design. |
| `agent_messages`, `assistant_messages`, `conversations`, `agent_conversations` | Message bodies, tool payloads, context, titles and error text that may echo user content | IDs, roles, state, routing references and timestamps. |
| `project_drafts`, `user_scratchpad`, `views`, `saved_views`, `categories` | User-authored names, bodies, filters, links and drafts | IDs, ownership references, type, position, flags and timestamps. |
| `attachments`, `page_files` and storage objects | User file names, user-supplied URLs, extracted text and object bytes | IDs, references, MIME type, size and dates. Object storage needs its own envelope and migration. |
| Credential tables | Existing encrypted blobs need a key migration plan; never copy decrypted secrets into SQL literals | IDs, owner references, key hashes/prefixes, provider and dates. |

The whitelist of clear identifiers is IDs and foreign keys, issue/project keys,
status/priority/effort, bounded counters, flags, timestamps, routing provider
names and documented public handles. A URL, title, file name, arbitrary JSON
value, or free-text error is not metadata merely because code currently queries
it. The account email is the Supabase Auth exception; invitation and feedback
emails are not.

## Current paths that prevent a safe column flip

- `lib/server/issue-reads.ts`, `create-issue.ts`, `update-issue.ts`,
  `add-comment.ts`, `pages.ts`, and `members.ts` are useful repository entry
  points, but `app/api/`, assistant, agent, MCP, import/export and forge modules
  also address the tables directly. Search for both `.from("issues")` and RPCs.
- `app/api/me/search-index/route.ts` returns issue and page titles to clients.
  `lib/server/pages-search.ts` maintains plaintext `pages.search_text`, and the
  generated `search_tsv` column indexes it. These must be removed or moved to
  an explicitly protected search service before claiming page encryption.
- `public.create_project_invitation_guarded` currently takes plaintext email
  and returns the whole row. `members.ts` searches `invited_email` directly.
  The guarded RPC must accept ciphertext and a blind index, preserve its
  ownership and capacity checks, and return only approved fields.
- The original `broadcast_invitations_row` trigger sent the whole row,
  including invitation email and bearer token, to Realtime. The additive
  invitation migration replaces it with a redacted projection.
- Existing SQL functions, triggers, page history, issue events, public sharing,
  feedback publication, account export/import, and outbound AI/forge calls can
  duplicate content. A migration must account for each copy.
- Supabase REST grants and RLS currently allow some row reads from authenticated
  clients. Even after encrypting values, sensitive columns should only be read
  by a server repository and never returned as ciphertext to arbitrary callers.

## Encryption contract

Use one server-only `EncryptedStore` with a branded `Encrypted<T>` type at the
database boundary. AES-256-GCM needs a fresh random 96-bit nonce per value and
AAD containing schema version, scope kind and ID, table, column, and row ID.
The ciphertext format must be explicitly versioned and reject malformed input,
unknown versions, wrong AAD, and failed authentication. Use separate key material
for encrypted values and blind indexes. A blind index is HMAC over a normalized,
purpose-specific value and scope; a regular hash of an email is reversible by
dictionary attack. Never log plaintext, key material, or full ciphertext.

The application must unwrap each DEK using the server root key and cache it for a short,
bounded period, with coalesced concurrent loads and explicit invalidation on
rotation. The first implementation checks the current key version in Postgres
on each write, while the unwrapped bytes remain cached; this avoids stale
writes from other application instances after rotation and adds one database
lookup to encrypted writes. Authenticated associated data binds each wrapped
key to its purpose and scope. Repository audit events record actor, reason,
scope and row ID without content. Fail closed when the root key is missing,
wrong or unavailable. Root-key rotation does not rotate DEKs or re-encrypt
content; it needs a separate rewrap procedure before the old root is removed.

Every encrypted row needs a row-level migration/version state. Transition reads
may accept legacy plaintext only when that row explicitly says it is legacy;
they must never infer this from a global feature flag or silently interpret a
malformed ciphertext as plaintext. The invitation migration uses mixed legacy
and encrypted rows with per-row versioning; it does not write a second plaintext
copy for new encrypted invitations. After backfill, plaintext column access must
be revoked and
the columns dropped in a later verified migration. Rotation writes the new DEK
version first, reads the recorded version, and backfills old rows in bounded,
restartable batches. Never rely on trying every key version as a substitute for
the row's recorded version.

## Rollout and verification gates

1. Inventory all schema revisions and REST/RPC paths, including public views,
   storage, realtime, export and AI paths. Create a testable cleartext allowlist.
2. Introduce the dedicated root key in protected server configuration outside the database.
   Store wrapped DEKs and a distinct blind-index key; verify key recovery and
   backup restore before production writes.
3. Add additive columns and mixed-version reads behind a per-row state. Migrate one
   small surface, beginning with invitation email, including all read and
   acceptance paths. Keep authorization checks intact.
4. Migrate content by dependency order (issues and history, pages and search,
   comments, agent conversations, feedback, remaining text and files). Add a
   code check that fails on unapproved direct access to each converted column.
5. Backfill by bounded batches with idempotent checkpoints, compare row counts
   and authenticated decrypts, then stop plaintext writes, revoke access and
   remove old columns and derived plaintext indexes. A rollback after this
   point requires the old key versions and a tested restore procedure.
6. Exercise key unavailability, tampering, mixed-version reads, concurrent key
   creation, restart during backfill, sharing, search, account export, and
   latency at realistic data sizes. Measure cache hit rate and p95/p99
   repository read/write latency.

Supabase Vault can reduce plaintext secrets in backups, but its
`vault.decrypted_secrets` view exposes them to roles with view access. It is a
separate control from application-side encryption. Lock down that view before
using it. Database statement logging is an operator-level setting; avoid SQL
literals with secrets even if logging is disabled.

## Initial implementation review against the issue plan

The initial issue thread and wiki described an invitation-only first slice.
The owner has since required a complete rollout across all sensitive data.
Task numbers below follow the displayed plan
(one-based; the MCP task indices are zero-based).

| Task | Review result |
| --- | --- |
| 1. Column and consumer audit | Incomplete. The inventory above covers the main content tables, not every column or consumer. For example, `agent_run_events.payload`, `agent_run_journal.events`, and `agent_run_messages.content` are also content-bearing copies in the baseline. Later schema changes and SQL consumers still need a complete audit. Reopened. |
| 2. Server crypto store | Implemented: branded ciphertext, AES-GCM with row/column/scope AAD, explicit key versions, separate HMAC keys, local root-key wrapper, coalesced loads and bounded cache lifetime. Concurrent cache eviction and initial-key cleanup were corrected in this review. |
| 3. Schema and privileges | Partially implemented: the key registry and invitation state/index/privilege migration exist, but other target content tables have no encryption columns. Vault view privileges are revoked; credential migration and statement-log configuration remain open. Reopened. |
| 4. Repository conversion | Invitations use server paths; issue, page, comment, file, search and history paths remain plaintext. Keep in progress. |
| 5. Backfill, rotation and recovery | The bounded invitation backfill and response/expiry cleanup exist. Content DEK advancement is now scheduled, but historical-content re-encryption, broader migration, mixed-writer rollback and recovery rehearsals remain open. Keep in progress. |
| 6. CI guard | Implemented for the converted surface. This review adds invitation RPCs, the key registry and source directories previously omitted by the scanner. This is a source-convention check, not a security boundary against deliberately hidden queries. |
| 7. Verification | Local regression tests and isolated SQL checks cover the current foundation. Production-scale latency, complete search behavior and application-wide backup recovery remain unverified. Keep in progress. |
| 8. Wiki and operational review | The wiki states the current limitations and setup. An operational recovery runbook and measured performance still depend on the remaining implementation and rehearsals. Keep in progress. |

Two departures from the original design should be retained: new encrypted
invitations have no duplicate plaintext write, and reads select the recorded key
version instead of trying every historical DEK. Both make the row state explicit
and avoid keeping plaintext or masking corrupted state. The global invitation
HMAC index is justified by cross-project account claiming; its equality leakage
is documented above. Account email remains in Supabase Auth as specified.

The review reproduced and corrected:

- Concurrent key loads could fail when another scope evicted their cache entry
  before the awaiting caller received it. Callers now receive independent key
  copies, and shared temporary bytes are cleared after the last waiter.
- Unicode NFC normalization changed invitation email spelling while Auth lookup
  and acceptance used trim/lowercase only. Encryption and indexing now preserve
  that existing identity comparison, including decomposed Unicode addresses.
- Backfill converted expired rows to `cancelled`, making them permanently
  invisible to pending-invitation retention. It now deletes those rows and
  checks the selected status before mutation so a concurrent response wins.
- The self-hosted scheduler never called encryption maintenance. It now uses
  the same hourly schedule as Vercel.
- The CI guard accepted invitation RPC calls and source files outside `app/`
  and `lib/`. It now checks those paths and the key registry too.
- The maintenance route test lived outside Vitest's configured test discovery.
  It now lives with the server encryption tests and runs in the normal suite.

The SQL verification ran against the existing isolated local Supabase instance,
inside a rolled-back transaction: role privileges, first-key idempotency,
rotation compare-and-swap, invitation row constraints, redacted RPC responses,
and email purge on terminal rows passed. No production migration was applied.
The local suite exercises the root-key wrapper; it cannot establish production-scale latency.

Before a production rollout, rehearse disabling the write flag with both legacy
and encrypted rows present. The legacy creation RPC compares plaintext email,
whereas the encrypted RPC also compares the blind index; mixed deployments must
not be assumed to provide safe rollback or cross-format uniqueness. This remains
part of the unfinished migration/recovery task rather than a claim of a verified
rollback procedure.

## References

- [Supabase Auth identities](https://supabase.com/docs/guides/auth/users)
- [Supabase Vault and decrypted view privileges](https://supabase.com/docs/guides/database/vault)
- [OWASP cryptographic storage and key separation](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
