# MIN-620: routine worker admission and notification failures

Investigated on 2026-10-01 using production Vercel logs, the Supabase Management
API log query endpoint, and read-only database metadata/occurrence queries.
Times below are UTC; add two hours for Europe/Paris on this date.

The three worker launches failed on a database constraint before any worker
started. The later notification write failed on a different constraint. Neither
failure was a quota refusal or a sandbox startup failure.

## Evidence

The scheduled occurrence of routine `9890fe94-6f2a-40b1-b797-2f2f3f440755` was
scheduled for **07:00 UTC / 09:00 Europe/Paris**. Its Numo turn started at
07:00:31.369 and ended at 07:01:33.956 with orchestration status `completed`.
There are **zero** agent runs belonging to that turn. The parent's completed
status records the end of the conversation, not successful completion of the
requested MCP audit.

| DB timestamp | Request | HTTP status | SQLSTATE / constraint |
| --- | --- | --- | --- |
| 07:01:00.526 | `create_agent_run_with_budget` | 400 | `23514`, `agent_runs_delegation_brief_check` |
| 07:01:11.801 | `create_agent_run_with_budget` | 400 | `23514`, `agent_runs_delegation_brief_check` |
| 07:01:24.706 | `create_agent_run_with_budget` | 400 | `23514`, `agent_runs_delegation_brief_check` |
| 07:01:50.677 | notifications insert | 400 | `23514`, `notifications_numo_work_pair_check` |

API Gateway timestamps precede these database errors by 70–105 ms. The Vercel
cron request `zt6qh-1790838025144-47c8c27b96e9` contains exactly three
`[assistant] tool_execution_failed` logs followed by one
`[notifications] insert_failed`. Its request timestamp is 07:00:25.144, rather
than the timestamp of each internal operation. Database statement context names
the admission RPC; the occurrence record and local reproduction establish the
failure sequence without relying solely on nearby timestamps.

The query from midnight through the investigation snapshot at approximately
10:00 UTC found these three admission errors and no other agent-run errors.
The API query's requested end was 11:35 UTC, which was still in the future;
this is not an observation of the rest of the day. In the 05:00–snapshot window,
the same notification constraint also failed three times at 09:31:10.410,
09:35:29.117 and 09:36:05.625, during subsequent assistant-chat requests.

Separate requests later in the morning recorded Supabase connection failures,
including Cloudflare HTTP 522 responses. Those events do not explain the
07:01 constraint rejections. The broader log window also contains forge-name
uniqueness failures; they are outside this fix. A generic initial database
error query hit its 500-row limit, so the admission and notification counts
above come from dedicated filtered queries and separate aggregates.

Raw row details, conversation content, credentials and unrelated account data
are excluded from this report and the repository. The production schema was
only read; no production runs, notifications, settings or migrations changed.

## Causes and corrections

`encodeAgentDelegationInput` correctly returns `delegation_brief: null` with
an encrypted envelope. In the admission RPC, `p_values->'delegation_brief'`
turns the explicit JSON null into a non-SQL-null JSONB value. The existing
brief constraint requires SQL NULL or a valid object. `prompt_mentions` has
the same conversion defect: encrypted launch state requires SQL NULL there.
The ordinary BYOK insert does not use this JSON extraction path.

Forward migration `20270109200018_agent_launch_json_nulls.sql` normalizes these
two nullable JSON inputs with `NULLIF(value, 'null'::jsonb)`. It preserves the
existing RPC body otherwise, including parent ownership, tool-call uniqueness,
account/operation reservations, row locks, encryption constraints and the
service-role-only execution grant. Migration and function audit hashes are
refreshed; the definer, empty search path, ACL, referenced relations and column
classifications are unchanged.

`notifyRoutineOfNumoTurn` used to set a Numo conversation even when no delegated
run existed, producing an incomplete conversation/work pair. It now sets both
fields only when a worker exists. A workerless routine retains `routine_id`,
which opens its routine history. This covers ordinary Numo-only routines,
completed conversations, failures, stops and questions. Launching a code worker
remains optional; the paired-work constraint is retained.

`createRun` now retains safe SQLSTATE, constraint and HTTP status metadata.
Unexpected `launch_code_agent` failures return a stable error code, stage,
correlation reference and structural diagnostics; the same reference appears
in the server log with routine/turn/tool-call identifiers. Known quota and
configuration refusals keep their existing messages and gain explicit codes.
Notification insert/upsert failures log safe structural metadata, target IDs
and counts; thrown write failures are also contained.

There is no automatic retry. These observed failures are deterministic;
retrying would repeat them. An uncertain transport failure can happen after a
write commits, so the result asks for a run-state check before another launch.
No raw database message, detail, hint, stack or HTML response reaches Numo or
these diagnostic logs. Push delivery remains conditional on a successful write.

## Verification

- 141 focused Vitest tests passed across launch results, diagnostic redaction,
  run creation, routine occurrences, notifications, navigation, worker model
  boundaries, PR lineage and durable-loop recovery.
- The PostgreSQL 17 replay uses the real baseline run table, delegation/launch
  constraints, encryption guards and admission RPC, with stubs for unrelated
  relations. The original RPC rejects the encrypted fixture with the observed
  `23514` / `agent_runs_delegation_brief_check`. After applying the forward
  migration, the regression script completes and rolls back all fixture rows.
- SQL assertions cover explicit/omitted nulls, encrypted and legacy content,
  service-role grants, account caps, reservation validation, parent existence,
  invalid scalar briefs, mixed plaintext/ciphertext and duplicate tool calls.
- Typecheck, focused lint, owned-English, encryption inventory and whitespace
  checks passed. This is an isolated admission replay, not a full Supabase
  clean-install or production end-to-end run.

To reproduce on a disposable PostgreSQL database, emit the focused schema with
`node test/agent-launch-json-nulls-fixture.mjs`, load it using `psql`, and run
`supabase/tests/agent_launch_json_nulls.test.sql` once before and once after
applying `supabase/migrations/20270109200018_agent_launch_json_nulls.sql`.
The first invocation must fail; the second must complete. The SQL regression
can also run against a fully migrated disposable Minddy database.

Production rollout requires applying the forward migration and deploying the
application. Neither was performed for this issue. Then verify both a routine
that stays entirely in Numo and a routine authorized to launch a code worker;
confirm the occurrence, admitted run (when requested), notification target and
absence of these two constraint errors. The historical audit was not rerun.

Log-query method: [Supabase SQL log filtering](https://supabase.com/docs/guides/observability/advanced-log-filtering).
