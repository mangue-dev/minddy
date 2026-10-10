# MIN-676 private native subscription prototype

This preview connects a personal Codex or Claude Code account from Account
settings → AI, persists an encrypted native profile, destroys the login sandbox,
and offers a two-allocation cold-start test. Eligible accounts can then choose
OpenCode, Codex or Claude Code as their code-agent default. Ticket implementation,
planning, verification, conversation work and routine workers use that selection
when creating a new lineage. Existing workers retain their frozen harness,
subscription connection ID and generation. A missing, disconnected or ineligible
native connection refuses work; it never silently switches to API inference.

The preview is private and disabled by default. Connecting a Claude account does
not establish paid execution eligibility: paid Claude hosted worker acceptance
remains unvalidated until an actual successful run is recorded. This document
states implemented contracts; live acceptance evidence belongs in the probe log.

## Activation

1. Apply the repository migration set, including
   `20270109200033_native_agent_connections.sql`,
   `20270109200034_native_subscription_workers.sql`,
   `20270109200035_atomic_agent_preferences.sql`,
   `20270109200036_native_worker_recovery.sql` and
   `20270109200037_abandoned_native_completion.sql`, to an isolated local Docker
   Supabase database using the repository migration workflow. These add the
   connection vault, account default, frozen worker binding, worker leases,
   atomic compute reservations and fenced watchdog recovery. Do not enable the
   preview against a database missing those RPCs or erasure fences. Do not copy production data into the pilot.
2. Configure `MINDDY_DATA_ROOT_KEY`, Supabase service credentials and hosted
   Vercel Sandbox credentials. The native vault always uses the format-3
   encrypted store, independently of the optional content-encryption flag.
3. Set `MINDDY_NATIVE_AGENT_PROTOTYPE=true` and put the intended account UUID in
   `MINDDY_NATIVE_AGENT_PROTOTYPE_USER_IDS`. Both variables are server-only.
   The UI and all operations remain unavailable to other accounts.
4. Build with `npm run build:native-agent-prototype` (also included in predev and
   prebuild), then run the development app. Connection and two-allocation SDK
   diagnostics can control hosted sandboxes from the local app without a provider
   callback to localhost. Ordinary Numo workers require a reachable HTTPS
   `agentControlOrigin` and an authorized linked forge/repository binding. The
   local SDK mailbox fixture does not establish deployed HTTP control-plane
   acceptance.

For a local Docker-backed worker pilot, keep the UI and `MINDDY_PUBLIC_APP_URL`
on localhost and set the server-only `AGENT_CONTROL_ORIGIN` to a temporary HTTPS
bridge. Expose only `/api/agent-vm/*`; refuse account, UI and database paths.
Preserve Vercel's signed forwarding headers. The route reconstructs the audience
from this explicit server configuration before the SDK verifies the genuine
Vercel signature, expiration and audience; request Host headers cannot select
that audience. Keep `VERCEL_TEAM_ID` and `VERCEL_PROJECT_ID` identical to those
used for sandbox creation. An unsigned request must still return HTTP 403.
Bind a private fixture repository through the ordinary GitHub App connection,
using repository-scoped installation tokens and disabling issue synchronization.
Never place native profiles or forge credentials in the bridge configuration.

The native adapters pin published Codex 0.162.1 and Claude Code 2.1.296. Packages are
installed from npm with lifecycle scripts disabled. Native auth uses dedicated
homes, never the developer's ambient personal credentials or an API key. Codex
uses its native app-server device flow; Claude uses its native browser login and
approval-code input. A free Claude account is not evidence of paid subscription
eligibility; a real successful native turn is required to validate that path.

## Account pilot

Choose Connect, complete approval on the provider's own site and keep settings
open until the UI reports Connected. The server exports only allowlisted native
authentication JSON, writes it to the encrypted account vault, then stops and
deletes the login allocation before reporting success. Approval state is
ephemeral in the client, never stored in a query cache or analytics. Closing the
panel attempts cancellation; provider-side allocation expiry also bounds an
abandoned attempt. Login attempts expire after ten minutes, allocations after
fifteen minutes. A lease is never automatically reclaimed while cleanup is
unconfirmed.

Choose Test on new sandboxes. The server creates a fresh named allocation,
restores the profile, asks the native CLI to validate its account, and launches a
fixed private fixture turn. The only advertised Minddy MCP tool is the existing
read-only `minddy_list_projects` handler. Its normal authentication, rate limit,
membership checks and encrypted project-name handling remain in force. The
native CLI calls a loopback MCP endpoint; the trusted control plane executes the
queued tool under the owning account and returns its result through SDK files.
No Supabase service key, user session or public Minddy API token enters the VM.

The fixed turn must successfully call that tool and emit a unique marker. Native
output alone cannot establish success. The server writes the latest native
profile back under its exclusive revision/lease/generation fence, deletes the
allocation completely, decrypts the saved profile from the account vault, then
repeats with a different name. Success requires two distinct allocations, authentication and a real
MCP acknowledgement in both, with both allocations destroyed. A rotation signal
requires changed native token objects; unchanged tokens remain renewal
unverified. Fixtures that change synthetic tokens do not establish real renewal.

Claude disables native builtin tools and uses strict sole-MCP configuration.
Codex disables shell, images, web search, code mode and subagents and applies a
named native permission profile denying the whole private controller/auth area.
It also denies `/proc` and `/sys`, drops inherited Linux capabilities and gives
the native MCP client a separate token valid only for the loopback MCP endpoint.
A kernel probe against synthetic files must pass in the actual allocation
before Codex is eligible for this fixture. It fails closed on an unsupported
Linux sandbox mechanism. The test fixture lives outside the denied private area;
published CLI code also lives outside that area. This narrowly scoped pilot does
not establish arbitrary repository-work acceptance by itself. Ordinary native
workers use a separate kernel-isolated guarded command host; their own allocation
must pass its synthetic private-file and proc/sys denial probe before tools run.

Native model inference uses the user's subscription. Minddy budget admission
still applies to its compute, and allocation duration is recorded in the existing
idempotent sandbox usage ledger under the connection lease UUID. No API-model
usage is substituted silently. A failed subscription or native CLI yields a
bounded translated error, without provider transcripts or credentials.

## Hosted Numo workers

The account selector appears only for eligible private accounts, except that a
previously saved native choice remains visible with an unavailable state if
eligibility is removed. Selecting a native harness hides the OpenCode-only model
and reasoning controls: the native CLI selects its supported defaults. The user
must reconnect or explicitly choose OpenCode to change an unavailable selection.
Numo receives metadata and engine capabilities, never credentials. Native
builtin tools, images and native subagents are unavailable; questions and any
additional context are mediated by Numo through the guarded Minddy tools.

Protocol 4 rejects mixed native/API jobs. A native job contains portable,
bounded user/assistant history and private handoff paths, not provider auth,
opaque CLI sessions, a public API key or native inference pricing. The server
imports the decrypted profile through authenticated Sandbox SDK file operations;
the stopped supervisor exports it through the same private channel. Git bootstrap
and refresh keep forge credentials in trusted infrastructure; the job carries
only an encrypted, allocation-bound refresh-policy context. The HTTP refresh
surface returns an acknowledgement, not a forge secret. Public provider egress
uses the native network policy without API credential transformations.

A native worker claims the exclusive connection lease before allocation and
records its exact physical allocation before profile import. Lease heartbeat,
owner/engine/generation/revision checks and allocation identity fence stale
controllers. Watchdog recovery first atomically claims the exact stale run
snapshot, reserves its rest callback and changes the bound lease to stop. A
refreshed heartbeat or a fresh competing rest prevents that claim. A completion
handler abandoned for more than twenty minutes can be recovered: takeover
replaces its rest timestamp, and all late native terminal/requeue stamps require
the original timestamp, allocation identity and no recovery claim. The hosted
control-plane route has a sixty-second execution bound; elapsed time alone does
not restore execution authority. Cleanup happens before terminal failure; an interrupted or uncertain cleanup retains the durable claim
for retry, even if the revoked command still reports alive. A successful rest saves the bounded native auth export before
landing the turn and physically cleans the allocation before releasing the
lease. An uncertain imported profile requires reconnect; a stale watchdog cannot
clean a replacement allocation. Physical allocation and account-erasure fences
remain authoritative even after feature disablement or disconnect.

Guarded repository commands run in a kernel sandbox denying the private
controller/auth directory, `/proc` and `/sys`, with inherited capabilities and
loader variables constrained. They cannot acquire the native process's profile
or control-plane authority. Native CLI builtin edits and shell stay disabled;
repository work uses the same authorized Minddy tool and delivery checks.

Resumes create fresh hosted allocations, clone the pushed branch and replay the
encrypted checkpoint's bounded text history. They do not retain a sandbox or
restore an opaque native session. Partial repository work must be safely pushed
before destruction; a failed publication is reported as incomplete. Native
model inference is subscription-funded; atomic Minddy budget admission,
reservation and sandbox-duration accounting still cover compute. Numo's own API
usage remains billed through its existing Minddy configuration. An unrelated
BYOK key does not exempt a subscription worker from that compute budget.

## Disconnect, failures and account deletion

Disconnect clears the encrypted profile and fences older writers before SDK
cleanup. The encrypted runtime descriptor retains the controller or worker lifecycle
metadata needed to stop and delete the exact allocation. Login/test descriptors
include controller authority, timestamps and billing context; worker descriptors
pin the run, allocation and profile-import/save state. Cleanup failures retain a stop-only lease for retry. Account
deletion invokes this cleanup even if the preview flag has been turned off;
failure blocks Auth and encryption-key deletion so the descriptor remains usable.

An allocation intent is persisted before SDK creation. If a disconnect races
creation, a late creator must pass a second fence before importing credentials
or starting login. It deletes its own unauthenticated allocation if the fence is
lost. A 404 for an unresolved allocating intent does not prove that creation has
settled. Such an intent remains claimed for operator reconciliation under
quiescent writers; never manually clear it while SDK calls may still complete.
The existing two-minute agent-drain cron retries a bounded batch of expired or
stop-only leases, even when the preview is disabled. Cancel/disconnect stale
attempts explicitly during a local pilot without cron, and inspect the private
namespace when reconciling an interrupted process. Provider lifetime expiry bounds compute but does not
prove metadata/snapshot deletion or settle a creation request.

Logout here deletes Minddy's copy and its allocations. It does not revoke every
session on the provider's other devices. Provider-side account/session revocation
must be handled through that provider's normal account controls.

## Verification boundary

Focused tests cover native transports, strict profiles, encrypted owner/engine
binding, exclusive leases, stale writers, account erasure, actual registered MCP
handler scoping, private route responses and settings controls. SQL regressions
run against actual PostgreSQL in the isolated Docker Supabase project, not the
connected remote development database. Synthetic subprocess and allocation tests are not a live
subscription acceptance test. The recorded paid Codex worker fixture uses the
actual native supervisor, owner-scoped registered Minddy handlers and encrypted
vault through an SDK-relayed control-plane mailbox. Its acceptance evidence is
recorded in [the probe log](min-676-harness-interface-probes.md). Its two distinct allocations
exercise MCP calls, guarded repository read/write/commands, auth export and
physical deletion. This proves that controlled hosted worker path; it does not
prove UI-to-PR completion or acceptance of a deployed HTTPS control plane.
Paid Claude hosted execution remains unvalidated.

The subsequent local Docker-backed HTTPS pilot completed the ordinary
issue-interface-to-Numo-to-Codex-to-PR flow. A temporary bridge exposed only the
authenticated control plane; a genuine repository-scoped GitHub App token
authorized a private fixture. Codex read the issue through MCP, updated its plan,
fixed the repository, verified the unchanged tests and opened a real pull
request. Independent checkout tests and review confirmed its correctness.
The preceding and successful worker allocations were deleted completely, and
the same encrypted connection remained connected without another login. See
the [UI-to-PR proof](assets/min-676-ui-pr-proof.json) and probe log for exact scope.
The historical SDK-mailbox boundary above applies only to that earlier fixture.

Writable native repository hosts explicitly grant the fresh clone's `.git`
directory write access, since the pinned Codex kernel sandbox otherwise protects
Git metadata even under a writable project root. Read-only workers retain that
protection. Private credentials, controller process files and `/sys` remain
denied. Publication failure never establishes delivery: only changes actually
pushed to the remote branch survive sandbox deletion. The native UI reports this
limit and offers a retry from the saved branch, rather than promising retained
local files.

Record the actual hosted kernel result, paid account login, login-allocation
deletion, two cold allocations, owner-scoped MCP results and token-renewal evidence
in `min-676-harness-interface-probes.md`. Do not mark live Codex or Claude results
passed until those steps actually run. Public rollout remains separate from this private implementation. Full hosted
Numo acceptance, both harnesses' paid execution and real renewal must be recorded
individually; synthetic tests or successful connection alone do not establish them.
