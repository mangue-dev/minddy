# Linked PostgreSQL error audit

Investigated on October 6, 2026. All timestamps below are UTC. The linked
Supabase project is `cmzrlbnlytvgnomzgmqf` (`minddy`), shared by preview and
production. Hosted collection used read-only logs, schema metadata, migration
history and current activity statistics. Replays used a disposable PostgreSQL
17 container with synthetic rows. No hosted application rows, grants, settings
or migrations were changed, and no production application deployment was run.

## Recorded errors

The primary window is **October 5 21:30:38 through October 6 21:30:38**. A
second non-overlapping 24-hour window covers the preceding day. These are
PostgreSQL error events, not distinct failed requests or affected users.
The screenshot's rolling totals use a different observation window and are
not an exact reconciliation target. HTTP and PostgreSQL counts describe
different layers and must not be added together.

| Pattern | Primary window | Preceding day | Finding |
| --- | ---: | ---: | --- |
| `forge_repository_names_pkey` (`23505`) | 1,967 | 34,093 | Old registration deliberately inserted existing identities and caught the uniqueness error. Conflict-ignore upsert already exists in PR #350 and the current production release. |
| Realtime topic access denied (`42501`) | 737 | 98 | Every sampled context is the resolver's membership/topic authorization refusal, rather than its session/MFA branch. The client retries a refused scope indefinitely. Fixed here. |
| Statement timeout (`57014`) | 4 | 35 | Current-day events coincide with backend availability problems; two terminate the MFA pre-request hook and two have no recorded query. Earlier events include maintenance writes and issue/event reads. Existing maintenance limits and indexed progress RPCs from PR #350 are present. |
| Numo deadlock (`40P01`) | 0 | 3 | Event append holds the turn row and waits for an encryption marker. A message insert or protected tool completion holds the marker and waits for that turn. Reproduced and fixed here. |
| `idx_agent_run_events_run_seq` (`23505`) | 0 | 1 | A concurrent event sequence collision. The existing `appendEvent` caller recalculates the sequence up to four times. Logs do not establish failed recovery or a lost event; no speculative sequence/encryption redesign. |
| Database not accepting connections (`57P03`) | 0 | 6 | Backend availability event; not an application schema defect. |
| Administrator connection termination (`57P01`) | 2 | 0 | Coincides with the database/PostgREST restart. |

The current-day registry failures end at **16:20:16**. Vercel production metadata
identifies the September 30 release as commit `a9bc8296d`, whose registration
uses plain INSERT, and the October 6 release as `fc2d751d7`, which contains the
conflict-ignore upsert. The latter deployment became ready at **16:22:49**.
That timing and the logged SQL support an old-writer explanation; database logs
alone do not identify every writer's deployment. The existing identity tests
confirm concurrent registration retains and authenticates the stored ciphertext.

The API Gateway records **632 HTTP 5xx events**, all in the 14:00 and 15:00
hours. PostgREST timeouts appear around 14:27, Realtime cannot obtain a database
connection at 14:43, administrator termination occurs at 15:36, and PostgREST
restarts with connection refusals around 15:38. This establishes an availability
incident; the logs do not prove its infrastructure cause. Increasing timeouts,
bypassing MFA checks or changing database capacity is not justified by this
evidence. The current activity snapshot contains 23 idle client connections,
one active diagnostic query, one WAL sender, and no recorded blocked client
query; this is a point-in-time observation.

No PostgreSQL ERROR/FATAL/PANIC events were recorded in the queried window
**16:30 through collection at approximately 21:43**. The API window still
contains four admin RPC 404s at 21:16–21:17 and one rejected Auth token request.
The current service-role OpenAPI schema exposes both `get_admin_account` and
`get_admin_onboarding_signals`, and the auth/Realtime preflight passes. Those
schema failures are historical within this window. A short clean interval
does not establish absence of future errors or end-to-end application health.

## Realtime correction

`RealtimeProvider` now stops timer retries after explicit SQLSTATE `42501`.
It reconciles the affected query scope once and continues to enforce the
resolver's access decision. Membership rekeys and existing foreground recovery
can retry the scope. Auth SIGNED_IN/TOKEN_REFRESHED events wake only denied
scopes; healthy channels remain connected. Temporary database/transport errors
retain exponential backoff. Cleanup removes the additional auth listeners and
pending retries. A cancelled or superseded join no longer resolves its topic
after waiting for socket authentication.

This prevents amplification of a legitimate refusal; it does not claim that
the original topic should have been authorized. The logs do not include its
parameters, so a specific revoked project or caller is not attributed here.

## Numo lock correction

Migration `20270109200031_numo_event_lock_order.sql` updates three existing RPCs:

- Event append uses `FOR NO KEY UPDATE` for sequence allocation. It still
  serializes competing turn writers but permits the KEY SHARE checks performed
  by message foreign keys. Event append does not change the turn's key.
- Both tool completion variants lock and validate the parent turn before
  updating the tool ledger and acquiring its encryption fences. They retain
  the claim token and running/stopping checks, result bindings and worker
  registration. A stale claim returns false before changing the ledger.
- After obtaining the turn lock, append rechecks the event ID. Two overlapping
  retries return the same persisted event and advance the sequence once.

No encryption trigger, foreign key, authorization rule, isolation requirement
or RPC grant is weakened. CREATE OR REPLACE preserves the existing execution
grants. The function inventory refresh changes only those three definition
digests; the migration manifest adds only the reviewed new file.

The isolated test installs the actual previous RPC definitions and encryption
fence function on a reduced schema with real foreign keys. It deterministically
reproduces `40P01` for a message insert and each tool completion variant before
the upgrade; all three pairs commit after the upgrade. It also checks concurrent
same-ID retries, 12 distinct parallel appends, cross-turn event-ID rejection,
missing turns, rollback without sequence advancement, stale claims, terminal
turns, stopping turns, worker registration and service-only execution grants.
This is a focused PostgreSQL concurrency replay, not a full Supabase schema or
authenticated browser-flow validation.

## Verification and rollout boundary

- 99 focused Vitest tests pass across the provider, topic resolution, presence,
  catch-up, resume, agent live views, durable Numo turns and encrypted repository
  identities.
- The PostgreSQL 17 upgrade/concurrency test passes with no skipped cases:
  `MINDDY_NUMO_LOCK_TEST_CONTAINER=<disposable-container> node --test scripts/numo-event-lock-order.integration.test.mjs`.
- Typecheck, targeted lint, owned-English, encryption inventory and whitespace
  checks pass. Historical migrations, locale catalogs and deployment settings
  are untouched.

The Realtime change needs the normal application rollout. The Numo correction
is prepared as a migration and has not been applied to the shared hosted base.
At inspection, `20270109200029_remove_custom_domains.sql` was also pending,
while `20270109200030_admin_data_minimisation.sql` was recorded as applied.
The pending domain migration drops tables and removes data unrelated to this
incident. Do not use an indiscriminate `db push --include-all` to apply this
Numo fix. Review the independent pending migration and coordinate the production
database/application rollout. Afterward, compare fresh source-specific log
windows and repeat authenticated subscriptions and concurrent Numo operations.

Collection follows the [Supabase log query API](https://supabase.com/docs/guides/observability/advanced-log-filtering)
with explicit windows of at most 24 hours, source filters, SQLSTATE aggregation
and checks for HTTP/query errors. Lock compatibility follows the
[PostgreSQL 17 row-lock reference](https://www.postgresql.org/docs/17/explicit-locking.html#LOCKING-ROWS).
Raw logs, SQL parameters, account identities, private repository names and
credentials are excluded from Git.
