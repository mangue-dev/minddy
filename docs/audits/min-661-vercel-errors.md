# Vercel runtime errors (MIN-661)

Investigated on October 8, 2026, against `3ec060ce0`. Hosted inspection was
limited to deployment metadata, log queries, schema metadata and migration
history. No production deployment, hosted migration or application data repair
was performed. Times below are UTC.

## Evidence and attribution

The attachment `minddy-log-export-2026-10-07T14-34-56.csv` has SHA-256
`ff6f9c05aa03910afc8310cbb07b191028e58206f4ce4a4ae507f970e61a58d9`.
Its 180 rows represent **78 distinct request IDs**, from October 7 03:15:30
through 14:25:50. Request records and console events repeat the same request;
counting rows as independent failures overstates the incident.

| Failure | Production requests | Preview requests | Finding |
| --- | ---: | ---: | --- |
| Issue listing | 12 | 17 | Protected database query failed; original SQL/transport cause was omitted from logs |
| Search index | 3 | 8 | Same sanitized issue-content query failure |
| Git credential refresh | 12 | 0 | Confirmed incorrect policy accessor; SDK readback also redacts injected credentials |
| Custom-domain cron | 12 | 0 | Old application calls a removed RPC |
| Encryption maintenance | 12 | 0 | All recorded durations reach the existing 50-second deadline |
| Admin overview | 2 | 0 | Old application calls the removed `get_admin_users_overview` RPC |

Vercel deployment metadata identifies the exported production deployment
`dpl_9FFuQYcugTYYNGEmYDfHc7j4WM9r` as `fc2d751d7` on `production`.
The four previews resolve to `276545734`, `a7106fb6a`, `fc5609273` and
`d47a6089f`. Preview failures therefore continue after the domain/admin changes
and must not be explained solely by production's old code.

The linked database is `cmzrlbnlytvgnomzgmqf`, shared by preview and production.
At inspection, migrations `20270109200025` through `20270109200031` are applied.
`get_admin_users_overview` is absent, while `get_admin_account`,
`get_admin_onboarding_signals` and `record_encryption_backfill_progress` exist.
The current issue SELECT policy retains the indexed project-membership form.

Source-filtered Supabase log queries over October 7 03:00–14:35 returned 148
PostgreSQL events, 52 PostgREST events and 11 API Gateway 404s for
`reconcile_inactive_custom_domains`. The PostgreSQL sample contains no recorded
statement timeout/error, and PostgREST records cache reloads. These results
support the removed-domain RPC mismatch, but do not establish the cause of
the issue/search failures or prove backend health. The log service's HTTP 200
can carry a query error; unsuccessful field queries were rejected and retried
with supported fields. Raw logs, URLs with parameters and credentials are
excluded from Git.

## Git refresh correction

`Sandbox.networkPolicy` is the sandbox default, while creation/runtime policies
belong to `currentSession()`. The installed SDK also reconstructs injected
headers as `<redacted>`. Simply switching accessors would write redacted model
credentials back and leave old Git rules unrecognized.

The launcher now seals its original desired policy using the existing project
encryption store, authenticated to the sandbox name and session ID. Only this
ciphertext travels in `VmJob` and the `/repo-auth` body. After the existing
running-run, creator-access and repository-binding checks, the server opens
the sealed policy, replaces its Git credential, and updates the same running
session directly. The original bounded model key, control-plane forwarding,
public connectivity and denied subnet rules survive. No shared model key is
substituted and no plaintext policy is persisted or returned to the VM.

Vercel execution now requires a valid `MINDDY_DATA_ROOT_KEY` (64 hexadecimal
characters), including on Vercel-hosted deployments with content encryption
disabled. The shared capability check rejects missing or malformed keys at
agent admission and before provider allocation, instead of failing when sealing
the refresh policy after allocation. The self-hosted runner does not acquire
this prerequisite.

A context from another project/allocation/session, tampered ciphertext, missing
context, a stopped session or a failed provider update cannot install credentials.
The route returns a controlled 503 without logging provider bodies. Self-hosted
Git relay refresh remains unchanged. Older Vercel jobs lack the sealed context
and need a fresh allocation; their original secrets cannot be reconstructed
from redacted provider readback.

This behavior is verified against the installed SDK with synthetic session
metadata and an in-memory transport. It follows Vercel's
[session API](https://vercel.com/docs/sandbox/sdk-reference) and its
[policy manager's redaction handling](https://github.com/vercel/ai/blob/main/packages/sandbox-vercel/src/vercel-network-policy-manager.ts).

## Remaining errors and rollout

Issue/search failures take 8.1–9.4 seconds, consistent with the authenticated
client's existing eight-second transport deadline. The export's generic message
cannot distinguish SQLSTATE, pool acquisition, transport or deadline errors.
Protected issue queries now log only a validated SQLSTATE/PostgREST code, HTTP
status and a fixed failure category. Query details, hints, SQL, URLs and content
remain excluded, and responses keep their existing sanitized behavior. There
is no evidence here to justify bypassing RLS, increasing deadlines or hiding
failed reads.

Maintenance failures take 50.0–50.2 seconds. The old production route also
schedules the removed custom-domain verification worker. Current code already
removes that worker and the custom-domain cron (PR #375). Current admin code
uses the replacement account/onboarding RPCs (PR #380). Their normal application
rollout is required to match the already-upgraded shared database; recreating
removed APIs would undo those changes.

Maintenance now reports fixed failed/interrupted domain names and whether its
abort signal fired. It retains the 50-second budget, concurrency limits, cursor
recovery, incomplete response status and encryption verification rules. This
diagnostic change does not claim to make every maintenance pass finish or to
resolve an unobserved upstream failure.

After application review and an authorized rollout, start a fresh Vercel agent
allocation and verify Git pushes while the model remains usable. Repeat
authenticated issue/search reads and inspect an hourly maintenance pass using
the new diagnostics. If they still fail, use the retained failure code/status
and affected domains to reproduce the underlying cause. Do not mark the
production incident resolved solely from local tests or an empty log sample.

## Verification

253 focused tests across 17 files cover SDK redaction, ciphertext/session binding, controlled
refresh failures, control-plane admission, VM transport/launch, issue privacy,
maintenance cancellation and domain diagnostics, and current admin RPC paths.
The agent VM bundle builds successfully. Targeted lint, owned-English,
encrypted-column access, encryption inventory and whitespace checks pass.

The root-key prerequisite follow-up passes 111 focused tests across six files,
including missing/malformed configuration, rejection before run creation and
provider allocation, and existing sandbox allocation/refresh/watchdog behavior.

The standard TypeScript command includes pre-existing ignored Playwright
capture sources under `output/` and reports errors there. A temporary config
extending the repository config, with only that ignored output directory added
to the exclusions, passes; application TypeScript configuration is unchanged.
Historical migrations, locale catalogs and production deployment settings are untouched.

Log collection follows the
[Supabase unified logs API](https://supabase.com/docs/reference/api/v1-get-project-logs)
with explicit windows and source filters.
