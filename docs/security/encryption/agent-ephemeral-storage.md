# Agent ephemeral storage and historical copy retirement

Server Agent jobs contain decrypted prompts and journal events. OpenCode also
writes SQLite, WAL, repository snapshots and logs. Tool commands can write output
files. These bytes must not survive a stopped server sandbox. The encrypted
`agent_run_journal` and checkpoint provide conversation recovery; the pushed
work branch provides checkout recovery.

## New server runs

- Vercel server sandboxes use the `agent-v2-<run ID>` namespace and
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
