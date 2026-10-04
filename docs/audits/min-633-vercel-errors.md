# Vercel runtime error audit (MIN-633)

Investigated on 2026-10-04. Times below are UTC. The hosted investigation was
read-only: Vercel request/deployment metadata, Supabase logs, schema metadata
and migration history. Fixes were tested locally; no hosted migration, production
application deployment, key rotation or data repair was performed.

## Scope and attribution

The Vercel window starts at **2026-09-27 16:35** and ends with collection on
October 4 around **16:50**. Production and preview were queried separately using
`vercel logs --no-branch --environment <environment> --level error --json`.
Historical pages were limited to 50, deduplicated by request ID and continued
with `--until` just before the oldest returned timestamp. Larger CLI limits
repeated the same page. Counts are observed request records, not a complete
census of all failures; retention, log-level filtering and pagination limit
what can be concluded. Empty recent production results do not establish health.

The collection contains **694 preview and 192 production records** across
30 deployment IDs. Deployment metadata maps each ID to its actual commit:

| Deployment | Environment | Commit | Relevant observation |
| --- | --- | --- | --- |
| `dpl_CxfazdpjMdFaxdhGvVngn549uEgo` | Production | `a9bc8296deba40f869d9c552cbcc824ab67f8a4e` | Backend outages, maintenance timeout, PR read failures |
| `dpl_5kvArxcAxbzQcbb3CrtaZFMg4sVv` | Preview | `c0c8675c4fed7c6ca30f00a30c28434a4ac21efb` | Continuing issue/search failures and live-auth 503s on October 4 |
| `dpl_4JhJ3ME8WrH5vKUVUQzvqNVaLBtg` | Preview | `8ba5e265e9a6b9775456905c7c9c2106bef923cc` | PR read timeouts before later PR-read fixes |
| `dpl_3EqheLFhetaRA6ja2JrjY7bTTLzs` | Preview | `fa20c238cf4779265badc6a9fc34d251b50db990` | PR-link schema rollout interval |

The working base is `ccb345030c41cbe5ca6f6c262ce24612e3ae1cde`.
The maintenance and duplicate-registration defects are still present there.
Production and preview use the same Supabase backend, so backend logs alone
cannot attribute a statement to an environment. Raw bodies, SQL parameters,
private repository names, user identities and credentials are excluded from Git.

| Observed family | Preview | Production | Disposition |
| --- | ---: | ---: | --- |
| `live_authorization_check_failed` | 365 | 71 | Fail-closed 503 during backend unavailability; do not bypass live session/MFA checks |
| Sanitized project issue-list failures | 90 | 15 | Continuing; SQL correlation identifies maintenance contention and upstream outages |
| Search-index issue-content failures | 19 | 3 | Same backend dependency; no evidence of a ciphertext authentication failure |
| Runtime timeouts | 14 | 8 | Mostly PR reads; includes one production maintenance timeout |
| PR repository sweep failures | 21 | 5 | Often overlap backend failures; later PR-read changes require post-rollout confirmation |
| Missing `pull_request_issues` schema-cache table | 9 | 0 | Historical rollout interval; table and migration are present at audit time |
| Routine `agent_run_budget_values_invalid` | 0 | 4 | Already addressed by MIN-620 / PR #317 and migration `20270109200018` |

Several requests contain Cloudflare 522 HTML, missing error codes after failed
key-registry reads, or `PGRST003` pool-acquisition failures. These are upstream
availability evidence, not proof that a stored key or repository identity is
missing. PR #343 reduces repeated encrypted PR/key reads and PR #347 updates PR
pages; old deployment errors are not grounds for duplicating those changes.
One dictation cleanup returned `response_json_invalid`; its existing fallback
retains the raw transcript. No separate reproducible dictation defect was found.
Other isolated webhook, Realtime and agent errors lack sufficient attribution
for an additional behavioral change in this PR.

## Confirmed load and query defects

The Supabase unified log API was queried over **2026-10-04 00:00–16:40**,
explicitly filtering `postgres_logs`. It returned:

- **23,036** duplicate `forge_repository_names_pkey` errors (`23505`).
- **25** statement timeouts (`57014`), including eight inside
  `record_encryption_backfill_progress` and four migration RPCs.
- One Numo foreign-key deadlock and two Realtime authorization refusals.

Twenty of the 25 timeouts occur at **13:16 or 14:16**, immediately after the
hourly maintenance schedule at minute 15. They include issue/category/agent
reads and two live authorization lookups. The progress RPC uses
`to_jsonb(t)->identity_key` in its locking SELECT and UPDATE, forcing scans
instead of identity-index lookups. One timeout explicitly waits on an envelope
key advisory lock. The current route also starts approximately 90 repository
passes together, with only shared Agent/Numo bundles serialized. This supports
reducing maintenance load; it does not prove that every Vercel failure shares
one cause. The earlier MIN-549 indexed issue/category RLS policies are already
installed and are retained.

## Corrections

`registerRepositoryName` now uses conflict-ignore upsert on `(provider, token)`.
It preserves the winner's ciphertext, authenticates the persisted name and
checks its stable token. Database failures and transplanted ciphertext still
fail. Ordinary repeated registrations no longer intentionally generate SQL
uniqueness errors.

`MaintenanceRunner` caps active repository passes at three, with at most one
shared Agent/Numo bundle active. All domains, including forge attachment work,
share this pool. The initial domain rotates hourly and results retain their
original positions. Rejection frees a slot without blocking later domains.
A 50-second deadline covers key rotation and repository work, combining caller
cancellation with the time budget. Supabase transport inherits that signal only
inside the maintenance async context, so queued passes stop and in-flight SDK
requests are cancelled without altering concurrent application requests.
Interrupted work reports an incomplete 503 and resumes through existing
per-row attempt cursors. Cancellation cannot undo a transaction already
committed by the backend; existing CAS and authenticated verification rules
remain the recovery boundary.

Migration `20270109200025_indexed_backfill_progress.sql` uses typed identity
column equality via `jsonb_populate_record` on the identity keys only. Complete
JSON snapshot comparison, row locks, attempt advancement after stale snapshots,
verified-only checked timestamps, the allowlist and service-role-only execution
remain intact. SQL and migration inventory digests were refreshed for this
function; table policy and schema are unchanged.

On disposable PostgreSQL 17, five runs of the progress RPC against 10,001
synthetic issue rows had medians of **10.369 ms before and 1.116 ms after**.
The locking SELECT uses `issues_pkey`. These are local synthetic measurements,
not a prediction of hosted latency or a full Supabase clean-install validation.

## Verification and follow-up

- 62 focused Vitest tests pass across registration, transport, maintenance,
  cancellation, rotation, invitations, forge attachments and verification.
- The disposable PostgreSQL upgrade test passes: current and stale snapshots,
  attempt versus proof timestamps, missing/invalid identities, UUID/text/bigint
  composite keys, provider isolation, execution grants, session-setting cleanup
  and indexed query planning.
- Typecheck, targeted lint, owned-English, encrypted-column access, encryption
  schema/inventory and whitespace checks pass.
- Locale catalogs, runtime flags, existing migrations, authorization rules and
  deployment configuration are untouched.

After the PR is reviewed, roll out the application and migration through the
normal authorized deployment workflow. Repeat authenticated issue/search/PR
reads around an hourly maintenance pass and compare a fresh Vercel/Supabase
window. Specifically confirm the disappearance of intentional registry `23505`
errors and measure timeout/pool pressure. Shared-backend saturation across
separate deployments and the isolated Numo deadlock need fresh evidence if they
continue; this PR does not introduce a distributed maintenance lease or claim
that external outages have been resolved.

The collection follows the [Vercel logs reference](https://vercel.com/docs/cli/logs)
and [Supabase unified logs API](https://supabase.com/docs/reference/api/v1-get-project-logs),
using explicit windows and source filters rather than interpreting empty or
truncated results as absence of errors.
