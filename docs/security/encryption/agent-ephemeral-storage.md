# Agent ephemeral storage and historical copy retirement

Server Agent jobs contain decrypted prompts and conversation context. OpenCode also
writes SQLite, WAL, repository snapshots and logs. Tool commands can write output
files. These bytes must not survive a stopped server sandbox. The encrypted
`agent_run_journal` and checkpoint provide OpenCode conversation recovery; native
workers use the encrypted checkpoint's bounded portable text history. The pushed
work branch provides checkout recovery.

## New server runs

- Vercel server sandboxes use the `agent-v2-<run ID>-<allocation generation>` namespace and
  `persistent: false`. A resumed empty session clones the work branch again and
  replays the encrypted journal. New sessions ignore all
  `AGENT_SANDBOX_SNAPSHOT_ID*` settings and boot from the runtime image.
- Self-hosted Docker containers mount `/vercel` and `/tmp` as tmpfs and disable
  the Docker log driver. Stopping a container removes it immediately. The runner
  removes an older volume-backed container and its volume before reusing its
  name, and sweeps stopped containers without a seven-day grace period. Sizing
  of the `/vercel` tmpfs defaults to 3 GiB and can be set with
  `AGENT_RUNNER_SANDBOX_TMPFS_BYTES`; a value below 1 GiB is ignored.
- The harness unlinks its one-shot `job.json` after reading it. Account erasure
  installs a durable SQL fence before run enumeration, then deletes both name
  generations and orphaned Vercel snapshots for known run IDs. Agent creation
  and queued-to-running claims serialize with that fence.
  Project trash, explicit purge and retention purge erase sandboxes before
  reporting completion or cascading run rows.

## Durable allocation and verifiable erasure

The allocation ledger deliberately survives account/project/run cascades.
Reservation serializes with account/project erasure fences, pins the current
run owner/project/actor/repository binding and uses a unique physical name.
Attach checks the binding again before private cloning and after allocation.
A durable provider-key intent is recorded before minting; new keys must be
attached to that ledger and strictly revoked on failure or erasure.

Revocation happens before cleanup. A late allocation is deleted after its
provider call settles. An uncertain provider result remains pending even after
a successful delete or 404: a request may still create an object later. The
bounded fair cron sweep repeatedly deletes the unique name and revokes known
keys, without changing uncertainty into proof. An unknown key-mint result also
blocks completion. Erasure rechecks all ledger rows in SQL after cleanup, so a
truncated REST enumeration cannot report false success; parent hard-delete
guards enforce the same condition.

A successful application erasure means its durable fences prohibit new
allocations and every recorded allocation has settled and been confirmed
cleaned with known keys revoked. It does not certify provider backup/telemetry
retirement. Process crashes or ambiguous provider/key requests require explicit
operator reconciliation under quiescent writers: enumerate provider names and
keys, obtain definitive request completion and deletion/revocation evidence,
then use the guarded reconciliation RPCs. Never expire a lease, clear a fence,
or use a 404 as the missing evidence. Retries may report incomplete until this
evidence exists; this is a security blocker, not successful erasure.

Before deploying this code for migration, stop/drain old runtimes that do not
reserve a ledger entry and inventory their in-flight requests. The new ledger
cannot retrospectively coordinate pre-ledger allocations. Restore allocation
ledger and fences together with parents under quiescent writers; independent
parent restoration must not silently reopen erasure. SQL and synthetic provider
fixtures cover the current protocol, not a production provider rehearsal.

## Private native account profiles

MIN-676's disabled-by-default private preview is an explicit durable exception:
allowlisted native authentication JSON is stored in the account-owned encrypted
`native_agent_connections.profile_ciphertext`, not a sandbox snapshot or journal.
The mandatory format-3 binding includes the owner, row ID, engine and column.
The separately encrypted runtime descriptor pins the exact allocation and tracks
whether the profile was imported and safely saved. It supports trusted lifecycle
and cleanup operations; it is never returned to the native model.
No credential contents are exposed in metadata reads, native output or client
caches. The native CLI alone owns provider token refresh. A healthy turn exports and
saves its profile under the revision/generation/lease fence before destruction;
an ambiguous imported profile is invalidated rather than reused. The next
allocation restores the current encrypted profile through SDK file operations.
The job and control-plane HTTP channel never carry that profile.

Account settings select the native worker for new Numo code lineages under the
private server allowlist; existing runs retain their frozen engine and connection
generation. Protocol 4 carries only bounded portable history and private handoff
paths. Repository bootstrap/refresh keeps forge secrets in trusted
infrastructure, with an encrypted allocation-bound refresh-policy context and
HTTP acknowledgements. No API inference credential is substituted.

The trusted supervisor and native CLI own the private auth directory. Model-led
repository commands use a separately kernel-isolated host denying that directory,
`/proc` and `/sys`; native builtin shell, edits, images and subagents remain
disabled. Each real allocation must pass the isolation probe before guarded
tools execute. Application tests describe those boundaries; paid Claude hosted
execution and public custody acceptance remain unvalidated until separately
recorded live evidence exists.

Subscription inference does not generate Minddy API-model usage. Minddy still
reserves and meters hosted compute, independently of any unrelated BYOK key;
Numo itself retains its configured API billing. Every resumed native turn uses a
fresh physical allocation, the pushed branch and encrypted text checkpoint,
without a retained sandbox or opaque native CLI session.

Connection generations and exclusive leases prevent late writers from restoring
a disconnected credential. Watchdog recovery claims the exact stale run before
invalidating credentials or stopping an allocation. A fresh completion claim
wins; an abandoned completion older than twenty minutes can be fenced and
recovered. Late native completion stamps require their original rest timestamp
and allocation with no recovery claim, including checkpoint-free retries.
Stop-only descriptors survive failed cleanup;
account erasure must stop those allocations before deleting Auth or key material.
Do not restore an old credential/profile row independently of its tombstone,
lease and account-erasure fences. Restore backups under quiescent writers and
require a new provider connection when rotation or revocation is uncertain.
The native vault uses the normal account data-key wrapping and offline root-key
rotation procedures; retain old roots only as required for historical encrypted
backups, never as a reason to replay retired authentication into a new sandbox.
See [the private pilot contract](../../validation/min-676-private-native-prototype.md)
for activation, expiry, compute accounting and unresolved creation reconciliation.

## Historical copies before migration or activation

The code change does not erase snapshots, Docker volumes, logs, exports or
backups created by older deployments. Before any production activation, an
authorized operator must perform a separate inventory and retirement:

1. Quiesce Agent writers and record every existing `agent_runs.sandbox_id`,
   including runs in deleted projects and personal conversations. Enumerate
   `agent-<run ID>` Vercel sandboxes and **all** of their snapshots, including
   orphaned snapshots without a current sandbox. Include snapshots referenced by
   `AGENT_SANDBOX_SNAPSHOT_ID*` settings even though new sessions ignore them.
   Do not infer absence from the
   `agent_runs` table alone; completed or deleted runs may no longer have rows.
2. Record all self-hosted `minddy-agent-*` Docker volumes and legacy Agent
   containers. Retire containers, volumes and their Docker log-driver files.
   Check filesystem and volume backups, host snapshots, container logs, APM and
   other observability sinks for old Agent output. Do not load production
   records into a development test database.
3. Delete each legacy Vercel sandbox with orphan-snapshot deletion and separately
   enumerate and delete snapshots that remain. Confirm snapshot listings are
   empty for the legacy namespace. Verify the provider's backup and retention
   policy for any copies outside the live snapshot listing.
4. Inventory retired desktop Agent directories under each device's
   `userData/agent-runs`, including SQLite/WAL, tool output, local diffs and
   diagnostic logs. Migration `20270106710000` rejects new local execution;
   these are historical endpoint copies. Obtain user-device cleanup evidence
   before considering their retention closed.
5. Resume representative server runs from an encrypted journal and pushed branch
   on an isolated environment. Confirm the new Vercel sandbox creates no
   post-stop snapshot and the self-hosted container leaves no Docker volume or
   log file. Search disposable fixture bytes for private sentinels after stop.

Vercel command output may be retained in provider telemetry outside the sandbox
filesystem. The application cannot delete that telemetry through the Sandbox
SDK; obtain its retention and deletion evidence before declaring historical
copy closure.
