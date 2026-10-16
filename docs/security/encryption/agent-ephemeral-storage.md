# Retired Agent execution storage and historical copy retirement

Minddy no longer runs code agents. MIN-721 removed the Vercel Sandbox backend,
the self-hosted `agent-runner` service and its Docker sandboxes, the private
native-worker preview and the `AGENT_EXECUTION_BACKEND` capability. Numo is a
tracking assistant: it starts no sandbox, writes no job file and keeps no
OpenCode SQLite, WAL, repository checkout or tool output outside the database.
New deployments therefore create no Agent ephemeral storage.

Removing the code does not erase copies that older deployments created. This
page keeps the retirement procedure for those copies. Treat them as decrypted
content: server Agent jobs carried prompts and conversation context, and the
sandboxes held checkouts, OpenCode state, logs and command output.

## What older deployments may have left

- Vercel sandboxes named `agent-<run ID>` or `agent-v2-<run ID>-<generation>`,
  their snapshots (including orphaned snapshots and any referenced by the
  retired `AGENT_SANDBOX_SNAPSHOT_ID*` settings) and provider telemetry of
  command output.
- Self-hosted `agent-runner` containers, `minddy-agent-*` containers and
  volumes, and their Docker log-driver files. Releases from MIN-591 onward used
  tmpfs and disabled Docker logs, but earlier releases did not.
- Desktop `userData/agent-runs` directories from the retired local execution
  path, including SQLite/WAL, tool output, local diffs and diagnostic logs.
- Database backups taken before migration `20270109200049_drop_code_agent_schema.sql`.
  That migration dropped the run, journal, sandbox allocation and native
  connection tables with their rows; earlier backups still hold those rows and
  follow their own retention policy.

## Historical copies before migration or activation

An authorized operator must perform a separate inventory and retirement:

1. Enumerate all Vercel sandboxes in both name generations and **all** of
   their snapshots, including orphaned snapshots without a current sandbox.
   The run table that recorded sandbox IDs was dropped by migration
   `20270109200049`; if a pre-migration backup is available, use its sandbox
   IDs only as a cross-check, never as proof of absence.
2. On self-hosted hosts, start the current profile with `--remove-orphans` so
   Compose deletes the retired `agent-runner` container. Then record and retire
   remaining `minddy-agent-*` containers, their volumes and Docker log-driver
   files. Check filesystem and volume backups, host snapshots, container logs,
   APM and other observability sinks for old Agent output. Do not load
   production records into a development test database.
3. Delete each legacy Vercel sandbox with orphan-snapshot deletion and
   separately enumerate and delete snapshots that remain. Confirm snapshot
   listings are empty for both namespaces. Verify the provider's backup and
   retention policy for any copies outside the live snapshot listing.
4. Inventory retired desktop Agent directories on each device. Migration
   `20270106710000` already rejected new local execution; these are historical
   endpoint copies. Obtain user-device cleanup evidence before considering their
   retention closed.
5. Revoke provider keys that older deployments minted for sandboxes, including
   OpenRouter provisioning keys, and remove the retired environment variables
   (`AGENT_EXECUTION_BACKEND`, `AGENT_RUNNER_URL`, `AGENT_RUNNER_SECRET`,
   `AGENT_CONTROL_ORIGIN`, `AGENT_SANDBOX_SNAPSHOT_ID*`, `VERCEL_TOKEN`,
   `VERCEL_TEAM_ID`, `VERCEL_PROJECT_ID` and `OPENROUTER_PROVISIONING_KEY`)
   from every deployment secret store.

Vercel command output may be retained in provider telemetry outside the sandbox
filesystem. The application cannot delete that telemetry; obtain its retention
and deletion evidence before declaring historical copy closure. Process crashes
or ambiguous provider requests from the retired backend still require explicit
operator reconciliation: obtain definitive deletion and revocation evidence and
never treat a 404 or the passage of time as proof of erasure.
