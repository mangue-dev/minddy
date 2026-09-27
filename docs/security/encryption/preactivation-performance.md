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

Record expected ordered page IDs for these searches in a local JSON file:
single title word, body word, `alpha OR beta`, `alpha -beta`, quoted phrase,
multiword AND, no match, broad common word, and a term on a legacy page.
Include same-titled pages in two projects, a private page outside the actor's
membership and enough matches to exercise the route's 20-result limit. The
expected IDs come from the authorized baseline and must be reviewed before the
encrypted run. Example configuration (replace UUIDs and expected IDs):

```json
{
  "baseUrl": "http://127.0.0.1:3000",
  "projectId": "00000000-0000-4000-8000-000000000001",
  "queries": [
    { "text": "alpha OR beta", "expectedIds": ["00000000-0000-4000-8000-000000000002"] },
    { "text": "alpha -beta", "expectedIds": [] },
    { "text": "\"alpha beta\"", "expectedIds": [] }
  ]
}
```

## Commands and measurements

Use a dedicated test account cookie in the shell; the probe never prints it.
Run the same commands against both deployments. The write probe creates and
trashes at most 20 pages per pass, within the normal per-user rate limit.
For more write samples, use separate fixture accounts and repeat passes after
the rate-limit window. Store output outside the repository.

```sh
export MINDDY_BENCHMARK_COOKIE='session cookie for the fixture account'
node scripts/encryption-preactivation-probe.mjs /tmp/min591-benchmark.json search 1 100 > /tmp/min591-search-cold.json
node scripts/encryption-preactivation-probe.mjs /tmp/min591-benchmark.json search 8 800 > /tmp/min591-search-warm-8.json
node scripts/encryption-preactivation-probe.mjs /tmp/min591-benchmark.json search 32 1600 > /tmp/min591-search-warm-32.json
node scripts/encryption-preactivation-probe.mjs /tmp/min591-benchmark.json write 4 20 > /tmp/min591-write.json
```

Restart the application processes and clear only their in-memory key caches
before the cold pass; do not flush the database buffer cache. Run two warm-up
passes before recording warm results. Repeat the sequence three times and
retain each run, commit SHA, schema version, fixture counts, application
instance count, database size and machine specifications. Use the same
concurrency and query order for baseline and proposed copies.

Collect HTTP p50/p95/p99, mismatch and error counts from the probe. Collect
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

Compare cold and warm key-registry calls per distinct project/user scope.
Within one cache TTL, warm passes should not reload the same current key for
every row. Also record application RSS, event-loop delay, 429/5xx responses,
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
- Warm key-registry lookup calls are bounded by the distinct active scopes per
  cache TTL, rather than by page or object count. Cold caches recover without
  failed decryptions. Rotation batches continue to advance under concurrent
  reads and writes, without starving older rows or objects.

If a threshold fails, profile the failing query or repository path, fix it,
and rerun the same fixture and commands. This gate precedes a separately
authorized production migration and activation. It does not require production
measurements to validate the code PR.
