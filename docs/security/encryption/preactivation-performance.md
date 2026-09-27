# MIN-591 preactivation performance protocol

Run this protocol against a dedicated staging deployment and an isolated
PostgreSQL copy. It measures code readiness; it does not assume that production
rows have been migrated. Keep production flags and production data untouched.

## Fixture and oracle

Prepare two isolated databases with the same anonymized, permission-preserving
fixture: one at the previous searchable schema for a latency baseline, and one
with the proposed migrations and encryption flags enabled. Include at least ten
projects, 10,000 pages, 100,000 issues, 100 active Numo runs and 1,000 objects.
Use page bodies with a 2 KiB median and 64 KiB 95th percentile. In the proposed
copy, retain 20% legitimate legacy pages, protect 40% with the previous content
key and 40% with the current key. Keep two authorized members and one unrelated
account; test both member and nonmember sessions. Seed via application
repositories or restore an anonymized fixture, never by inserting plaintext
directly into a protected column.

Record expected ordered page IDs and exact displayed excerpts for these searches in a local JSON file:
single title word, body word, `alpha OR beta`, `alpha -beta`, quoted phrase,
multiword AND, no match, broad common word, and a term on a legacy page.
Include same-titled pages in two projects, a private page outside the actor's
membership and enough matches to exercise the route's 20-result limit. The
expected values come from the authorized PostgreSQL `search_pages` baseline and
must be reviewed before the encrypted run. The probe rejects missing oracle
fields and a 404 oracle with nonempty results. Include actual punctuation and
token classes observed in the staging corpus, especially unusual tokens beyond
the tested email, IP and CJK cases: the in-memory lexer is not a formal port of
every PostgreSQL `simple` parser class. A separate nonmember
configuration uses `expectedStatus: 404`, empty IDs and empty excerpts; the
project route hides membership with 404. Example
configuration (replace UUIDs and oracle values):

```json
{
  "baseUrl": "http://127.0.0.1:3000",
  "projectId": "00000000-0000-4000-8000-000000000001",
  "queries": [
    { "text": "alpha OR beta", "expectedStatus": 200, "expectedIds": ["00000000-0000-4000-8000-000000000002"], "expectedExcerpts": ["Reviewed baseline excerpt"] },
    { "text": "alpha -beta", "expectedStatus": 200, "expectedIds": [], "expectedExcerpts": [] },
    { "text": "\"alpha beta\"", "expectedStatus": 200, "expectedIds": [], "expectedExcerpts": [] }
  ]
}
```

Issue search needs a separate oracle because `searchIssues` scans authorized
issues in 200-row pages, decrypts title and description, and returns matches
ordered by `updated_at DESC, id ASC`. Populate both isolated deployments with
the same 100,000 issue contents and permissions. In the proposed deployment,
use 20% legacy, 40% previous-key and 40% current-key rows. Record exact
ordered IDs for an issue identifier, a bare
number, title-only and description-only terms, a no-match term, a match near
the final page, and terms yielding more than the 20-result default and
100-result maximum. Include another project's private issue and a nonmember
actor. Exercise the real authorized MCP/AI `search_issues` path with the same
project and actor on both deployments; do not replace it with a direct SQL
query or a synthetic endpoint. Record response status, exact IDs, pagination
work, and p50/p95/p99 for cold and warm application processes at concurrency
1, 8 and 32. A nonmember must receive no private issue. Keep the query set,
ordered baseline oracle and response captures outside the repository. Compare
database scans, key-registry reads, unwraps, CPU and pool occupancy with the
page-search measurements below. A full-scan no-match or late-match query must
meet the agreed staging latency budget before activation; if it does not,
profile and repair issue search before lifting the flag.

## Commands and measurements

Use a dedicated test account cookie in the shell; the probe never prints it.
Run the same commands against both deployments. The write probe creates and
trashes at most 20 pages per pass, within the normal per-user rate limit.
For more write samples, use separate fixture accounts and repeat passes after
the rate-limit window. Store output outside the repository.

```sh
export MINDDY_BENCHMARK_COOKIE='session cookie for the fixture account'
node scripts/encryption-preactivation-probe.mjs /tmp/min591-benchmark.json search 1 1 cold 0 > /tmp/min591-search-cold-0.json
node scripts/encryption-preactivation-probe.mjs /tmp/min591-benchmark.json search 8 800 warm > /dev/null
node scripts/encryption-preactivation-probe.mjs /tmp/min591-benchmark.json search 8 800 warm > /dev/null
node scripts/encryption-preactivation-probe.mjs /tmp/min591-benchmark.json search 8 800 warm > /tmp/min591-search-warm-8.json
node scripts/encryption-preactivation-probe.mjs /tmp/min591-benchmark.json search 32 1600 warm > /tmp/min591-search-warm-32.json
node scripts/encryption-preactivation-probe.mjs /tmp/min591-benchmark.json write 4 20 warm > /tmp/min591-write-warm.json
```

Restart every application instance before **each** cold request, then invoke
`search 1 1 cold QUERY_INDEX` exactly once. Repeat for every query and sample;
these are distinct cold observations. Do not flush the database buffer cache.
Keep instances running for the two discarded warm-up passes and measured warm
passes. Run the command block with `set -e`; capture the discarded warm-up
responses outside the repository and verify exit status zero and an empty
`failures` array before measuring. The `cold` label does not restart an
instance; record the restart and process ID beside each cold sample. Repeat
the sequence three times and
retain each run, commit SHA, schema version, fixture counts, application
instance count, database size and machine specifications. Use the same
concurrency and query order for baseline and proposed copies.

Collect HTTP p50/p95/p99, mismatch and error counts from the probe, aggregating
cold one-request outputs separately from warm outputs. Collect
database CPU, connection pool occupancy, I/O and `pg_stat_statements` calls and
total time for the search and `envelope_data_keys` queries. In the isolated
staging database, enable `pg_stat_statements` before the run if needed; then
capture its counters before and after each pass:

```sql
SELECT query, calls, total_exec_time, mean_exec_time, rows
FROM pg_stat_statements
WHERE query ILIKE '%search_pages%'
   OR query ILIKE '%envelope_data_keys%'
ORDER BY total_exec_time DESC;
```

Compare cold and warm key-registry calls and unwraps separately per distinct
project/user scope and key version. `ManagedDataKeys.current` checks the registry
on each write to observe rotations by other instances immediately; the cache
bounds **unwraps** per scope/version and TTL, not `loadCurrent` lookups. Instrument
the staging process at `DataKeyRegistry.loadCurrent` and `KeyWrapper.unwrap` with
aggregate counters and durations; emit no scope IDs, keys or content. Correlate
their per-process deltas with `pg_stat_statements` and the number of encrypted
write attempts. A warm interval should have one current-key lookup per write
attempt, plus documented initialization/rotation calls; report the database
time and p95 for those lookups. Unwraps should be at most one per accessed
scope/version in each cache TTL window, plus documented evictions and rotations.
Treat absent counters or unexplained excess as a failed gate, rather than
assuming the cache is free. An in-flight write may use the previously current
version during a concurrent rotation; subsequent writes must observe the new
version. The per-process rollback refusal covers scopes still retained in its
bounded high-water cache; the database's monotonic version RPCs are the durable
normal-operation guard.
Also record application RSS, event-loop delay, 429/5xx responses,
object upload/download throughput and maintenance batch duration. Use the
fixture nonmember account to confirm zero private hits at all concurrency
levels. Never include plaintext, keys, cookies or raw query terms in logs.

## Acceptance before activation

- Search returns exactly the reviewed ordered IDs, excerpts and 20-result cap
  for every query and permission state; zero private results reach a nonmember.
- No unexpected HTTP failures, stale-writer acceptance, CAS loss or stored clear
  copies occur. Expected conflict responses are counted separately.
- At concurrency 8, search p95 is at most 750 ms and at most twice baseline;
  p99 is at most 2 s. At concurrency 32, p95 remains at most 1.5 s.
- Page write p95 is at most 1.5 s and at most twice baseline, excluding the
  documented rate-limit response. Database CPU stays below 70% sustained and
  pool occupancy below 80% at concurrency 32.
- Warm key unwraps are bounded by distinct active scope/version pairs per cache
  TTL, allowing recorded evictions and rotations; registry lookups are counted
  and timed separately per encrypted write. Cold caches recover without failed
  decryptions, and current-key version regressions are refused while retained
  by the process. Rotation batches continue to advance under concurrent
  reads and writes, without starving older rows or objects.

If a threshold fails, profile the failing query or repository path, fix it,
and rerun the same fixture and commands. This gate precedes a separately
authorized production migration and activation. It does not require production
measurements to validate the code PR.

## Object, Agent and concurrent maintenance gate

Use only an isolated staging deployment and its isolated PostgreSQL database.
Enable the relevant encryption flags there, including the Agent journal and
delegation-result flags, before invoking the authenticated maintenance route.
Record the commit, flag values, schema version and batch response for each pass.
Run enough bounded passes for the counters to stabilize, including a pass with
no new forge upload. The final pass must report no failed object, Agent journal,
Numo event or Numo checkpoint candidate and the SQL gate below must be true.
The response field names are `forge_attachments`,
`forge_attachment_rotation`, `agent_journal`, `numo_worker_events` and
`numo_worker_checkpoints`.

For a historical worker row without a run ID or parent association, do not
infer the owner from `active_run_id`: that field can already point to worker B.
In the isolated staging database, inspect the event/turn, candidate run,
conversation and project associations and independent run history. Quarantine
any row whose run cannot be established. After documenting the evidence in a
review record, a service operator may call
`register_numo_worker_legacy_binding('event', event_id, run_id,
'review-record-id')` or its `'checkpoint'` form. The reference is only an audit
pointer; registration does not prove the human inference. The RPC snapshots
opaque source revisions and refuses inconsistent project/turn associations.
Any subsequent event edit is refused and a checkpoint edit requires a fresh
review. Require zero unresolved ambiguous rows before activation.

```sh
printf 'header = "Authorization: Bearer %s"\n' "$CRON_SECRET" |
  curl --fail-with-body --silent --show-error --config - \
    "$STAGING_BASE_URL/api/cron/encryption-maintenance" > /tmp/min591-maintenance.json
```

While maintenance runs, use two independent authorized clients to create and
read a published forge image and a historical image link, advance worker A then
worker B on the same Numo turn, and rotate an Agent journal key with duplicate
batches. Repeat with a paused flag and an old writer in the isolated database.
The published and historical links must return the original bytes through the
authorized reader, their stored replacement objects must have opaque paths and
verified encrypted metadata, and cleanup must leave no orphan registrations.
Worker A's historical event and its checkpoint must migrate after B starts;
the later valid Numo and journal rows must advance even if an earlier candidate
fails. Concurrent writes must either commit under the protected guard or lose
the documented CAS; no clear row, metadata object or old writer may be accepted.

In the isolated database, collect the gate and candidate counts after the
concurrent pass. A successful verification timestamp is never inferred from an
attempt timestamp. Investigate every remaining unverified, failed or ambiguous
candidate before activation.

```sql
SELECT public.forge_attachment_migration_complete() AS forge_complete;
SELECT count(*) AS legacy_forge_objects FROM storage.objects
 WHERE bucket_id = 'forge-attachments'
   AND name !~ '^projects/[0-9a-f-]{36}/forge/[0-9a-f-]{36}/[0-9a-f-]{36}$';
SELECT count(*) AS unverified_numo_events FROM public.numo_turn_events
 WHERE type IN ('worker_completed','worker_failed','worker_input')
   AND (payload_encryption_checked_at IS NULL OR
     NOT public.numo_worker_payload_verified(payload,'event',id));
SELECT count(*) AS unverified_numo_checkpoints FROM public.numo_assistant_turns
 WHERE checkpoint ? 'worker_event'
   AND (worker_checkpoint_encryption_checked_at IS NULL OR
     NOT public.numo_worker_payload_verified(
       checkpoint #> '{worker_event,payload}','checkpoint',id));
SELECT count(*) AS unverified_agent_journal FROM public.agent_run_journal
 WHERE encryption_checked_at IS NULL;
```

Run the SQL old-writer, race and rename regressions against a fresh local clone
of the final schema, with `ON_ERROR_STOP=1`; each script rolls back its fixture.
The PostgreSQL oracle and final-schema restore suite are separate requirements:

```sh
psql "$LOCAL_MIN591_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f scripts/encryption-forge-attachment-regression.sql
psql "$LOCAL_MIN591_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f scripts/encryption-forge-attachment-isolation-regression.sql
psql "$LOCAL_MIN591_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f scripts/encryption-forge-rename-attachment-regression.sql
psql "$LOCAL_MIN591_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f scripts/encryption-min591-worker-feedback-regression.sql
MIN591_REQUIRE_PG_ORACLE=1 MIN591_PG_ORACLE_CONTAINER=supabase_db_minddy-encryption-test npx vitest run lib/server/pages-search-oracle.integration.test.ts
MINDDY_ENCRYPTION_DB_TEST=true MINDDY_ENCRYPTION_FINAL_TEMPLATE=minddy_min591_security_final_20260927 npx vitest run lib/server/encryption/database-recovery.integration.test.ts
```

For Realtime, use an isolated **pre-correction** schema clone. Compose the
regression with the corrective migration inside its one transaction, then run
it against that clone. The regression asserts an effective partition, a
durable clear sentinel before migration, its purge, and old-writer refusal:

```sh
node -e 'const fs=require("fs");const marker="-- APPLY_AGENT_REALTIME_MIGRATION_HERE";const source=fs.readFileSync("scripts/encryption-agent-realtime-regression.sql","utf8");const migration=fs.readFileSync("supabase/migrations/20270108010000_agent_realtime_content_refusal.sql","utf8").replace(/^BEGIN;\s*/,"").replace(/\s*COMMIT;\s*$/,"");if(!source.includes(marker))throw Error("Realtime regression marker missing");fs.writeFileSync("/tmp/min591-realtime-regression.sql",source.replace(marker,()=>migration));'
psql "$LOCAL_MIN591_PRE_REALTIME_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f /tmp/min591-realtime-regression.sql
```

The container and template names in the last two commands are local example
fixtures; create an equivalent isolated final-schema clone when using another
host. The recorded PostgreSQL rank/order corpus runs in the ordinary test
suite. `MIN591_REQUIRE_PG_ORACLE=1` makes the explicit container-backed command
fail if the database is unavailable; it checks the broader rank/excerpt corpus
and the actual `search_pages` function under RLS and `limit=1`. Retain the real
Storage-service backup and restore as a distinct gate:
the in-memory object fixture and PostgreSQL metadata restore do not establish
that Storage bytes survive service restoration.

## Follow-up activation controls for MIN-591

Before lifting any encryption flag, apply the follow-up migrations in staging,
then run the two-session snapshot regression against an isolated clone. Keep
the scope marker and content-key writes at `READ COMMITTED`; a transaction at
`REPEATABLE READ` or `SERIALIZABLE` must fail before it can cross a marker.
Audit all protected table triggers and activation functions when the schema
changes. Review every Numo queue where `*_encryption_attempted_at` advances
while the corresponding `*_encryption_checked_at` is still null. A failed
attempt is evidence of a blocker, never of completion. In particular, inspect
the intent queue and the previously used tool marker:

```sql
SELECT count(*) AS unverified_intents FROM public.numo_assistant_turns
 WHERE intent_encryption_checked_at IS NULL
   OR NOT COALESCE(intent ? 'encrypted_intent', false);
SELECT count(*) AS unverified_tool_messages FROM public.assistant_messages
 WHERE tool_payload_attempted_at IS NOT NULL
   AND tool_payload_checked_at IS NULL;
```

For pull-request URLs/content, Agent run/runtime checkpoints and journals,
OAuth clients/codes, API keys, integrations, push subscriptions and billing
identities,
`*_checked_at` is only a worker assertion. It cannot authenticate AES-GCM in
SQL. After the bounded workers finish, quiesce staging writers and invoke the
cron-secret-protected read-only verifier twice, with a stable source-row count
between passes:

```sh
printf 'header = "Authorization: Bearer %s"\n' "$CRON_SECRET" |
  curl --fail-with-body --silent --show-error --config - \
    "$STAGING_BASE_URL/api/cron/encryption-readiness" \
    > /tmp/min591-encryption-readiness.json
```

Require HTTP 200, `ready: true`, and zero blocked rows in every family on both
passes. HTTP 409 means a legacy, failed, tampered or wrong-key candidate still
blocks activation; HTTP 503 means the verifier itself could not complete.
The verifier walks every current row by keyset, checks the current key version,
and decrypts protected values. It returns counts only. It is not an atomic
snapshot across requests, so do not use it as a concurrent-writer completion
proof. Retain failed candidates for repair and keep their `checked_at` null.

Before this verifier, apply the additive OTP, authenticated-content and Agent
erasure-fence migrations. Run the six bounded content workers until both
`*_encryption_attempted_at` and `*_encryption_checked_at` inventories are
understood; a conflict advances only the attempt cursor. Confirm that the
system, project and user registry keys already exist. The verifier must not
create keys, even if the scanned tables are empty. Exercise the complete Agent
resume path after a stop and account/project deletion on a staging clone, then
inventory historical Vercel snapshots, Docker volumes, desktop files and
provider command telemetry using the Agent storage runbook.

Inventory effective Realtime comment partitions plus older backups, replica
logs, analytics exports and external sinks under their retention policy. The
active partition purge and old-writer guard do not erase prior backups or
copies already delivered to another service. For Agent live, install the
`agent_run_live_snapshots` schema and `set_agent_run_live_snapshot` RPC, and
configure the same valid root key on every live writer before routing stream
or diff traffic. Verify the endpoint returns 503 if any prerequisite is
missing, then retest after it is restored.

Live snapshots are current-state records, not an append-only transcript. Each
stream or diff update replaces only that kind when its millisecond timestamp
increases and its content-key version does not regress. A long-running run
retains its latest snapshot across process restarts and key rotations; readers
need the historical content-key versions until that snapshot is replaced.
The row expires when the run leaves `running`, and run deletion cascades it.
There is no age-based expiry while a run remains `running`, so operational
cleanup must mark abandoned runs terminal. The isolated PostgreSQL
dump/restore test covers a 45-day running row with two historical key versions,
cold-cache reads, wrong-root refusal, stale-write refusal and terminal cleanup.
Before activation, restore a live running snapshot and its key registry in
staging, then finish the run and confirm no snapshot remains. Inventory any
older database backups and Realtime sinks under their separate retention plan.

For forge attachments, test backup and restore of the actual Storage service,
including old PR-ID paths and current opaque objects. The simulated object
fixture and PostgreSQL metadata restore cover separate, narrower boundaries.
Measure representative search results, latency and key/cache load in staging
before activation; a production performance measurement is not a code PR gate.
