# MIN-676 private native subscription prototype

This preview connects a personal Codex or Claude Code account from Account
settings → AI, persists an encrypted native profile, destroys the login sandbox,
and offers a two-allocation cold-start test. It does not select a new default
worker for Numo yet. Normal ticket, planning, verification and routine workers
continue to use their existing OpenCode configuration.

## Activation

1. Apply `20270109200033_native_agent_connections.sql` to the intended development
   Supabase database using the repository migration workflow. Do not enable the
   preview against a database without its connection RPCs and erasure fence.
2. Configure `MINDDY_DATA_ROOT_KEY`, Supabase service credentials and hosted
   Vercel Sandbox credentials. The native vault always uses the format-3
   encrypted store, independently of the optional content-encryption flag.
3. Set `MINDDY_NATIVE_AGENT_PROTOTYPE=true` and put the intended account UUID in
   `MINDDY_NATIVE_AGENT_PROTOTYPE_USER_IDS`. Both variables are server-only.
   The UI and all operations remain unavailable to other accounts.
4. Build with `npm run build:native-agent-prototype` (also included in predev and
   prebuild), then run the development app. The local web control plane can
   operate the hosted sandboxes: no provider callback to localhost is required.

The prototype pins published Codex 0.162.1 and Claude Code 2.1.296. Packages are
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
allocation completely, then repeats with a different name and the newly saved
profile. Success requires two distinct allocations, authentication and a real
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
not establish safe permissions for arbitrary repository work.

Native model inference uses the user's subscription. Minddy budget admission
still applies to its compute, and allocation duration is recorded in the existing
idempotent sandbox usage ledger under the connection lease UUID. No API-model
usage is substituted silently. A failed subscription or native CLI yields a
bounded translated error, without provider transcripts or credentials.

## Disconnect, failures and account deletion

Disconnect clears the encrypted profile and fences older writers before SDK
cleanup. The encrypted runtime descriptor retains only the private controller
token, allocation name, timestamps and billing context needed to stop and
delete the process. Cleanup failures retain a stop-only lease for retry. Account
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
run against an isolated local PostgreSQL-compatible fixture, not the connected
development database. Synthetic subprocess and allocation tests are not a live
subscription acceptance test.

Record the actual hosted kernel result, paid account login, login-allocation
deletion, two cold allocations, owner-scoped MCP results and token-renewal evidence
in `min-676-harness-interface-probes.md`. Do not mark live Codex or Claude results
passed until those steps actually run. Public rollout and full Numo worker
selection remain separate pending tasks in MIN-676.
