# Supabase error audit (MIN-549)

Investigated on 2026-09-19. All times are UTC. Preview and production resolve
to the same Supabase project. Hosted inspection was read-only; fixes and write
replays were tested on a disposable local Supabase instance with synthetic data.
No hosted migrations, data repairs, grants, or production deployment were applied.

## Evidence and attribution

The baseline spans **2026-09-15 19:00 through 2026-09-19 19:00**, queried in four
24-hour windows through the Supabase Management API. PostgreSQL counts below
are error events, not affected users or distinct application requests. Matching
PostgREST errors describe the same failures and are not added to those counts.

Vercel inspection returned **72 distinct preview request records** across the
same period, including `main` and disposable branch previews. The CLI repeated
pages when asked for more than 50 historical records; records were deduplicated
by request ID. Preview frequencies are therefore **observed lower bounds**,
not a complete census. PostgreSQL alone does not identify a deployment.
Raw logs, SQL parameters, IP addresses, account identities and credentials are
excluded from this document and from Git.

The last 24-hour window contains 71,476 API Gateway events, 384 Postgres events,
225 PostgREST events and 686 Auth events. There are no deployed Edge Functions
and neither `function_logs` nor `function_edge_logs` returned events in the
four windows. Auth returned no failed requests in the last window; earlier
windows contain seven rejected admin-user password fixtures and one
`refresh_token_not_found` response. These do not establish a recurring preview
authentication defect.

| Pattern | Count | Impact and disposition |
| --- | ---: | --- |
| Issue reads exceeding statement timeout (`57014`) | 25 Postgres; at least 49 preview request timeouts over four days | High: global board, issue reconciliation and project issue lists fail. 21 database statements were global reads and four were project-scoped reads. Corrected the repeated RLS work described below. |
| Mixed activity batches violate `issue_events.via_smart_fill` NOT NULL (`23502`) | 8 Postgres; also confirmed in preview | High: ticket creation succeeds but its activity batch and associated webhook dispatch disappear. Fixed in `insertEvents`. |
| `numo_turn_events_type_check` (`23514`) | 24 Postgres; at least 11 preview requests | Previously lost reasoning activity. Already fixed by `20270106920000_numo_turn_events_reasoning_delta.sql` (PR #236); migration is present in hosted history and no later occurrences appear after Sep 17 13:25. No duplicate fix. |
| Realtime topic access denied (`42501`) | 111 | Authorization refusals, last seen Sep 18 15:25. Do not weaken topic/session checks. No matching continuing preview defect established; investigate a fresh subscribed topic and membership generation if this recurs. |
| Invalid UUID `undefined` (`22P02`) | 105 | Project reads, concentrated around Sep 17 18:58 and 22:07–22:09 alongside duplicate project creation. Origin is not established by these database logs. Follow up on the caller that continues after creation fails; do not treat the string as a valid project. |
| Invalid UUID from PR capture fixture (`22P02`) | 13 | The literal matches `captures/shots/pull-request/fixture.mjs::PR_ID`. Capture traffic escaped its mocked route. Isolate capture networking; excluded from ordinary preview application failures. |
| Duplicate live project key (`23505`) | 9 | Creation conflicts; overlaps the malformed project-read bursts. No evidence here that valid unique keys fail. Inspect the creation caller together with the `undefined` reads. |
| Missing `ai_usage.idempotency_key` (`23502`) | 5 | Billing write failures on Sep 16 12:52–12:54. Current `lib/server/ai-usage.ts` supplies the key and has regression coverage. No preview attribution or later recurrence established; no ledger repair performed. |
| Boolean-to-timestamp cast (`42846`) | 6 | Includes four application statements and two diagnostic statements. Already addressed by `20270106890000_fix_numo_stop_null_cast.sql`, present in hosted history. |
| `agent_run_budget_values_invalid` (`22023`) | 4 | Existing budget guard rejection; cause and preview reproduction remain unproven. Inspect routine input/budget metadata on a fresh occurrence. |
| Missing `projects.smart_triage_mode` (`42703`) | 5 | Short rollout interval Sep 19 11:39, followed by the schema migration. A failed function REVOKE and one view-column rename also appear during migration work; current repository migrations contain the corresponding fixes. |
| Missing `user_ai_capability_assignments` | 19 API Gateway 404s in the last window | The existing BYOK migration `20270106990000` is absent from hosted migration history. This is a pending schema rollout, potentially affecting current preview code too; coordinate it before validating BYOK. It is not evidence for changing the new BYOK queries back to the old schema. |

Other low-volume events: three `conversation_busy` refusals, one
`routine_not_found`, one duplicate agent event sequence, one numeric UUID input,
and diagnostic queries for obsolete columns/operators. Two SQL exceptions
explicitly identify diagnostic probes. They require caller attribution before
being treated as preview regressions. Vercel also contains forge credential
rotation, PR AI merge and Jev response errors outside the Supabase root causes
fixed here. Four sampled live-auth checks hit the existing backend deadline;
the audit does not establish an independent Auth database bottleneck.

## Corrected activity batches

`lib/server/issue-events.ts::insertEvents` sends a heterogeneous JSON array:
ordinary events omit flags that a Smart-fill event sets. The Supabase SDK
defaults missing fields in a bulk insert to NULL. PostgREST therefore inserts
NULL into the ordinary row's non-null `via_smart_fill` column and rejects the
whole batch. Mixed timestamps and other attribution flags have the same risk.

The insert now uses `{ defaultToNull: false }`, emitting `Prefer: missing=default`.
Database defaults apply to absent fields; explicit false, nullable values,
timestamps and per-row actor attribution are retained. Failed inserts still
log an error and do not dispatch webhooks for events that were never saved.
This remains a best-effort activity write after the primary mutation; throwing
after a ticket has committed could encourage duplicate creation on retry.

A real local PostgREST replay reproduced `23502` for the original Smart-fill
batch and returned HTTP 201 for the corrected batch. A separate mixed-timestamp
batch reproduced `created_at` NOT NULL failure before the fix and persisted all
three rows after it, retaining the explicit historical timestamp.

## Corrected issue reads

The failed SQL is generated by `ISSUE_SELECT` in `/api/me/board`, `/api/me/issues`
and `/api/projects/[id]/issues`. A bounded hosted `EXPLAIN ANALYZE` in a read-only
transaction under `authenticated` showed 615 visible issues and 909 category
links taking **686.04 ms**, excluding network and serialization. The category
parent lookup ran 909 times, with `can_access_project(project_id)` appearing
twice in its filter. This is a measured source of repeated work; it does not
prove every historical timeout had the same cause.

`20270107000000_issue_read_policy_batching.sql` changes only two SELECT policies:

- `issues_select` uses the RLS-visible projects set, whose existing SELECT
  policy has the same owner-or-member rule, and retains `deleted_at IS NULL`.
- `issue_categories_select` relies on the parent issue's RLS visibility,
  removing the duplicate explicit project check.

No service-role substitution, new security-definer function, authorization cache,
timeout increase, retry loop or write-policy change is introduced. The existing
behavior for tickets inside a trashed project remains unchanged. Live session
and MFA enforcement still run through the PostgREST pre-request hook.

On the same isolated PostgreSQL 17 database, five sequential runs per policy
version over 650 synthetic issues and 1,300 category links measured:

| Policy | Execution times (ms) | Median |
| --- | --- | ---: |
| Original | 84.448, 76.076, 75.357, 75.971, 81.425 | 76.076 ms |
| Corrected | 2.915, 2.700, 2.711, 3.104, 2.411 | 2.711 ms |

This is approximately 28 times faster for this local fixture, not a hosted
latency guarantee. Ten concurrent authenticated PostgREST reads then returned
HTTP 200 with all 650 issues and 1,300 links, in 48–123 ms each. Five corrected
activity batches returned HTTP 201. From **19:16:40.822** through the end of that
replay, the local PostgREST and PostgreSQL container logs recorded no errors.
Earlier deliberate failing requests are excluded from this post-fix window.

## Verification and rollout

- 23 focused Vitest tests passed across activity insertion, ticket birth,
  occurrence timestamps and the existing Numo reasoning migration regression.
- 19 pgTAP assertions passed: owner/member equivalence to the original
  predicate, foreign and anonymous isolation, trash behavior, member writes,
  membership revocation and identity changes between statements.
- Typecheck, targeted lint, owned-English and whitespace checks passed.

The disposable bootstrap exposed an **existing** failure in
`20270106910000_numo_history_drop_detail_href.sql`: PostgreSQL rejects dropping
a view column with `CREATE OR REPLACE VIEW`. The new policy migration and tests
were applied to the successfully loaded schema prefix through `20270106900000`;
later Numo/BYOK migrations do not change these issue/project policies. This is
not a successful full clean-install validation. Repairing that historical view
migration while preserving its dependent views, policies and grants is a
separate bootstrap follow-up. No historical migration was edited here.

Hosted recurrence verification remains a rollout step: the policy migration has
not been applied to the shared database. After its coordinated application and
preview deployment, repeat authenticated global/project board reads and a
Smart-fill creation, check activity attribution, then query a bounded window
for `23502` and `57014` and correlate with that exact preview deployment.
Successful local replay does not establish absence of future hosted errors.

For subsequent audits, use the [Supabase log query API](https://supabase.com/docs/guides/observability/advanced-log-filtering)
with explicit UTC windows of at most 24 hours, enumerate `source`, and aggregate
`log_attributes['parsed.sql_state_code']` for Postgres errors. Query Auth status
and Edge Function sources separately, inspect query errors before interpreting
empty results, deduplicate Vercel request IDs, and keep production-only schema
drift separate from reproducible preview defects.
