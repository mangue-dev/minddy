# MIN-591 preactivation performance protocol

Run this protocol against a dedicated staging deployment and an isolated
PostgreSQL copy. It measures code readiness; it does not assume that production
rows have been migrated. Keep production flags and production data untouched.

The corrective review uses isolated PostgreSQL, synthetic fixtures and a private
restored production copy. Representative search parity, latency, key-cache and load controls
below belong to staging before activation; production measurements are not a
code-PR acceptance requirement. The readiness endpoint reports only its
explicit scope (ten critical families plus forge objects), never global closure.

## Fixture and oracle

Prepare two isolated databases with the same anonymized, permission-preserving
fixture: one at the previous searchable schema for a latency baseline, and one
with the proposed migrations and the global encryption switch enabled. Include at least ten
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

## Object and concurrent maintenance gate

Use only an isolated staging deployment and its isolated PostgreSQL database.
Set `MINDDY_CONTENT_ENCRYPTION_ENABLED=true` and configure `MINDDY_DATA_ROOT_KEY`
there before invoking the authenticated maintenance route.
Record the commit, flag values, schema version and batch response for each pass.
Run enough bounded passes for the counters to stabilize, including a pass with
no new forge upload. The final pass must report no failed object candidate
and the SQL gate below must be true. The response field names are
`forge_attachments` and `forge_attachment_rotation`. MIN-721 dropped the Agent
journal and Numo worker copies with their tables, so they are no longer
candidates.

```sh
printf 'header = "Authorization: Bearer %s"\n' "$CRON_SECRET" |
  curl --fail-with-body --silent --show-error --config - \
    "$STAGING_BASE_URL/api/cron/encryption-maintenance" > /tmp/min591-maintenance.json
```

While maintenance runs, use two independent authorized clients to create and
read a published forge image and a historical image link with duplicate
batches. Repeat with a paused flag and an old writer in the isolated database.
The published and historical links must return the original bytes through the
authorized reader, their stored replacement objects must have opaque paths and
verified encrypted metadata, and cleanup must leave no orphan registrations.
Later valid candidates must advance even if an earlier candidate fails.
Concurrent writes must either commit under the protected guard or lose
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
```

Run the SQL old-writer, race and rename regressions against a fresh local clone
of the final schema, with `ON_ERROR_STOP=1`; each script rolls back its fixture.
The PostgreSQL oracle and final-schema restore suite are separate requirements:

```sh
psql "$LOCAL_MIN591_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f scripts/encryption-forge-attachment-regression.sql
psql "$LOCAL_MIN591_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f scripts/encryption-forge-attachment-isolation-regression.sql
psql "$LOCAL_MIN591_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f scripts/encryption-forge-rename-attachment-regression.sql
psql "$LOCAL_MIN591_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f scripts/encryption-min591-feedback-attempt-regression.sql
MIN591_REQUIRE_PG_ORACLE=1 MIN591_PG_ORACLE_CONTAINER=supabase_db_minddy-encryption-test npx vitest run lib/server/pages-search-oracle.integration.test.ts
MINDDY_ENCRYPTION_DB_TEST=true MINDDY_ENCRYPTION_FINAL_TEMPLATE=minddy_min591_security_final_20260927 npx vitest run lib/server/encryption/database-recovery.integration.test.ts
```

The container and template names in the last two commands of the previous block are local example
fixtures; create an equivalent isolated final-schema clone when using another
host. The recorded PostgreSQL rank/order corpus runs in the ordinary test
suite. `MIN591_REQUIRE_PG_ORACLE=1` makes the explicit container-backed command
fail if the database is unavailable; it checks the broader rank/excerpt corpus
and the actual `search_pages` function under RLS and `limit=1`. Retain the real
Storage-service backup and restore as a distinct gate:
the in-memory object fixture and PostgreSQL metadata restore do not establish
that Storage bytes survive service restoration.

## Follow-up activation controls for MIN-591

Before enabling the global encryption switch, apply the follow-up migrations in staging,
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

For pull-request URLs/content, OAuth clients/codes, API keys, integrations, push subscriptions and billing
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

Require HTTP 200, scoped `ready: true`, and zero blocked rows in every family on both
passes. HTTP 409 means a legacy, failed, tampered or wrong-key candidate still
blocks activation; HTTP 503 means the verifier itself could not complete.
The verifier walks every current row by keyset, checks the current key version,
and decrypts protected values. It returns counts only. It is not an atomic
snapshot across requests, so do not use it as a concurrent-writer completion
proof. Retain failed candidates for repair and keep their `checked_at` null.
Require the separate `forgeObjects` byte result too. SQL metadata completeness
alone cannot authenticate Storage bytes. `globalReadiness: "not_assessed"`
means every other target and retained copy still needs its own closure proof.

Before this verifier, apply the additive OTP and authenticated-content
migrations. Run the six bounded content workers until both
`*_encryption_attempted_at` and `*_encryption_checked_at` inventories are
understood; a conflict advances only the attempt cursor. Confirm that the
system, project and user registry keys already exist. The verifier must not
create keys, even if the scanned tables are empty. Inventory historical Vercel
snapshots, Docker volumes, desktop files and provider command telemetry left by
the retired code agent using the Agent storage runbook.

Inventory effective Realtime comment partitions plus older backups, replica
logs, analytics exports and external sinks under their retention policy. The
active partition purge and old-writer guard do not erase prior backups or
copies already delivered to another service. MIN-721 dropped the Agent live
snapshots with their run tables; older database backups and Realtime sinks
that may hold them follow the same separate retention plan.

For forge attachments, test backup and restore of the actual Storage service,
including old PR-ID paths and current opaque objects. The simulated object
fixture and PostgreSQL metadata restore cover separate, narrower boundaries.
Measure representative search results, latency and key/cache load in staging
before activation; a production performance measurement is not a code PR gate.
