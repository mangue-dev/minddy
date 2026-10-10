# MIN-676 private native subscription prototype

## Current hosted release decision (2026-10-10)

The existing implementation and earlier successful Codex runs are technical
evidence only. A fresh official-source review supersedes the previous conclusion
that the native app-server login route could continue as a hosted private pilot.
The [Codex app-server authentication reference](https://learn.chatgpt.com/docs/app-server#auth-endpoints)
explicitly excludes app-server authentication from commercial or hosted services.
Minddy's hosted sandbox execution falls within that boundary even with no users
or revenue. The earlier readiness pass paused further hosted authentication tests.
After reviewing that boundary, the owner explicitly requested the private
subscription reliability follow-up below. That instruction authorizes the
recorded private tests; it does not establish provider permission or authorize a
public rollout.

The [Sign in with ChatGPT overview](https://developers.openai.com/siwc/token-sharing-open-source)
provides the intended integration route, but its public open-source flow covers
local applications and self-hosted environments. Remotely hosted applications
are directed to the hosted integration interest process. Minddy's open-source
license does not establish that access. No application, provider approval or
production deployment has been performed. Keep the server gate and account
allowlist; removing confusing UI labels does not remove this release condition.

The sections below describe the implemented prototype and historical pilot
configuration. They are not permission to activate this auth route for a hosted
service. Claude remains implemented but its paid execution is untested.

This preview connects a personal Codex or Claude Code account from Account
settings → AI, persists an encrypted native profile, destroys the login sandbox,
and includes an internal two-allocation cold-start diagnostic. The current
settings interface removes its user-facing test button and combines sandbox
controls with the code agent. Eligible accounts can then choose
OpenCode, Codex or Claude Code as their code-agent default. Ticket implementation,
planning, verification, conversation work and routine workers use that selection
when creating a new lineage. Existing workers retain their frozen harness,
subscription connection ID and generation. A missing, disconnected or ineligible
native connection refuses work; it never silently switches to API inference.

The preview is private and disabled by default. Connecting a Claude account does
not establish paid execution eligibility: paid Claude hosted worker acceptance
remains unvalidated until an actual successful run is recorded. This document
states implemented contracts; live acceptance evidence belongs in the probe log.

## Historical pilot configuration

1. Apply the repository migration set, including
   `20270109200033_native_agent_connections.sql`,
   `20270109200034_native_subscription_workers.sql`,
   `20270109200035_atomic_agent_preferences.sql`,
   `20270109200036_native_worker_recovery.sql` and
   `20270109200037_abandoned_native_completion.sql` and
   `20270109200038_atomic_native_worker_profile.sql`, to an isolated local Docker
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

## Historical account pilot

Choose Connect, complete approval on the provider's own site and keep settings
open until the UI reports Connected. The server exports only allowlisted native
authentication JSON, writes it to the encrypted account vault, then stops and
deletes the login allocation before reporting success. Initial-login credentials
and their saved-state descriptor commit atomically too. A lost commit response or
a failed provider deletion leaves the confirmed profile connected and its lease
busy: the next poll or expired-lease reaper retries physical cleanup. It does not
repeat provider authorization or revoke a confirmed saved profile. Approval state is
ephemeral in the client, never stored in a query cache or analytics. Closing the
panel attempts cancellation; provider-side allocation expiry also bounds an
abandoned attempt. Login attempts expire after ten minutes, allocations after
fifteen minutes. A lease is never automatically reclaimed while cleanup is
unconfirmed.

The internal two-allocation diagnostic creates a fresh named allocation,
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
for retry, even if the revoked command still reports alive. A successful rest
commits the bounded native auth export and its encrypted `profileSaved` descriptor
in the same fenced database transaction, before landing the turn. A lost commit
response is reconciled from the current persisted descriptor during cleanup.
Expired-worker cleanup preserves a successfully committed profile when physical
destruction needs a retry, and releases the lease only after confirmed cleanup. An uncertain imported profile requires reconnect; a stale watchdog cannot
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

Disconnect here deletes Minddy's copy and its allocations. It does not confirm
revocation of that renewable session at OpenAI and does not revoke sessions on
the provider's other devices. This local disconnect contract must not be
presented as provider-side revocation. An authorized replacement integration
needs explicit remote-session revocation and truthful recovery when that request
cannot be confirmed.

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

## Codex ordinary-use readiness

The historical private owner pilot selected the connected Codex account and
launched hosted code work from Minddy. The accepted UI-to-PR run proves encrypted cold restoration,
guarded Minddy MCP calls, a pushed tested change and full allocation deletion.
It required retries after infrastructure fixes; it does not establish reliable
first-attempt delivery across every Numo model and entry point.

Code-worker identity comes from the run's frozen `agent_engine`, not its model
string or today's account preference. Settings reuse the existing MCP brand
marks. Worker cards, detail headers and conversation controls identify the
actual harness. Native controls describe CLI-selected defaults instead of API
model/reasoning pickers; native image input remains unavailable and is mediated
through Numo. Numo receives a safe account selection snapshot at prompt startup,
then uses authoritative frozen launch and handoff capabilities for existing work.
No credentials or connection identifiers enter that snapshot.

The current readiness pass replayed 96 local tests covering the credential store,
native connection and controller lifecycle, worker connections, signed route and
sandbox network policy. All passed. The three transactional regressions
`supabase/tests/native_agent_connections.test.sql`,
`supabase/tests/native_subscription_workers.test.sql` and
`supabase/tests/native_worker_recovery.test.sql` also passed against
`supabase_db_minddy-min676-local` using `psql -X -v ON_ERROR_STOP=1`.
Each script's opening `BEGIN` and closing `ROLLBACK` were checked before execution;
all transactions rolled back. Their synthetic owners and credentials do not
modify the connected account or prove provider renewal. No remote database,
provider credential or production environment was changed.

Three acceptance areas remain incomplete. The provider authorization condition
above applies before further live hosted Codex acceptance:

1. Run a fresh issue-to-PR acceptance without manual retries on the corrected
   worker. Exercise planning, verification and conversation/routine entry
   points, follow-up on a saved branch, worker questions, stop and explicit
   reconnect. Investigate the observed Numo responses that printed a tool-call
   representation instead of executing the follow-up; a claimed relaunch is not
   delivery evidence.
2. On the authorized authentication route, observe actual credential renewal,
   encrypted write-back and cold reuse after expiry, plus remote session
   revocation, local disconnect during active work and user-approved reconnect.
   Current generation/revision and lease tests cover fencing; successful reuse
   of a still-valid profile and synthetic token changes do not prove renewal.
   The old managed CLI's `account/read` refresh flag is a protocol capability,
   not acceptance evidence or permission to use it in Minddy hosting.
3. Replace the temporary Quick Tunnel and development process with the intended
   hosted application's stable HTTPS origin, then validate the same OIDC
   audience, tenant admission, cleanup and recovery there. Apply the reviewed
   migrations and encryption configuration only during an authorized rollout.
   Include a multi-user custody review, operational key rotation, backup
   recovery, erasure and reaper/crash evidence before expanding access. The
   implementation can derive the HTTPS origin from its deployment scope; that
   behavior and local OIDC tests do not attest that a durable deployment exists.
   This pass keeps Docker locally and does not migrate remote data.

## Authorized Codex integration path

After hosted access is established, replace CLI-owned device authentication with
Minddy's approved OAuth registration and consent flow. Retain a stable host
identifier and account/client mapping, validate PKCE, state, nonce and identity,
then store credentials under the existing mandatory owner-scoped encryption.
The final hosted client and redirect contract must come from that approved
integration; the public dynamic registration flow is not a hosting workaround.

The [official app-server integration](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server)
uses a ChatGPT-plan-authorized access token with a Responses provider configured
for `https://api.openai.com/v1`. The parent supplies the access token to the
isolated native process and keeps renewable credentials outside the repository
and model tools. Minddy must serialize renewal, persist the replacement under
the existing lease fence and restart/resume app-server with the renewed token.
MCP admission, frozen harness identity, compute metering, delivery checks and
destructive cleanup remain required.

The [official session lifecycle](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions)
also distinguishes remote renewable-session revocation from local token deletion.
Implement confirmed revocation, bounded retries and an explicit unconfirmed
state; never revoke the user's unrelated account sessions to test the feature.
Validate this lifecycle through genuine expiration/renewal, deletion and cold
restoration, then reconnect with the account owner's participation. No such
real-provider lifecycle test was performed in this pass.

Paid Claude execution is a separate, explicitly untested acceptance path. It
does not block Codex-specific private validation and must not be presented as a
validated provider when broader access is considered.

## Private session reliability validation (2026-10-10)

The owner explicitly requested continued private personal-subscription testing
after reviewing the hosted-authentication boundary. The account allowlist remains
in place; no production deployment or remote database migration was performed.
Claude paid execution remains untested.

The follow-up fixes five failure modes:

- Worker renewal and initial login commit the encrypted profile and saved runtime
  descriptor atomically in migration `20270109200038`. Cleanup reconciles a lost
  RPC response from the fresh stored revision and preserves a confirmed save.
- Expired-lease cleanup retries uncertain provider destruction without revoking a
  saved worker or initial-login profile. Unsaved imported profiles remain fenced
  and require reconnect when their rotation is uncertain.
- Concurrent shutdown callers share one promise and wait for physical child
  closure. SIGKILL alone cannot authorize export; a five-second unconfirmed stop
  rejects, closes event iteration and still permits host/MCP cleanup. A synthetic
  Claude status timeout retains the same shutdown fence.
- The server and VM use one strict subscription-profile validator. Account
  identity is preserved during renewal when present. Durable sibling staging
  files use unique names and are cleaned on replacement failure.
- Restore uses checked `mkdir -p` for trusted private paths. The real Vercel SDK
  rejects an existing directory; four pre-inference fixture attempts exposed the
  redundant harness-directory creation before this production fix. Those
  attempts injected no credentials and all their allocations were cleaned.

The passing probe used the saved encrypted account profile, Docker Supabase and
published Codex 0.162.1 in two fresh Vercel allocations. It used the production
worker admission/restore/supervisor/export/cleanup path, with the private SDK
mailbox forwarding one real owner-authorized Minddy `read_issue` per turn. It also
verified guarded write/read/command operations and private-directory denial. The
repository was disposable and the probe did not publish another PR.

| Evidence | First allocation | Second allocation |
| --- | --- | --- |
| Run | `3639e69c-6c12-4e09-847a-928a31431b81` | `79928046-851b-4a12-8386-27e626038023` |
| Allocation | `agent-v2-3639e69c-6c12-4e09-847a-928a31431b81-eb502902b009` | `agent-v2-79928046-851b-4a12-8386-27e626038023-f9a9ece7e05d` |
| Result | Completed; MCP/read/write/command/marker verified | Completed; MCP/read/write/command/marker verified |
| Native supervisor time | 22.915 seconds | 22.963 seconds |
| Access and refresh tokens changed | Both | Both |
| Provider account identity | Unchanged | Unchanged |
| SDK deletion | Typed 404 after deletion, checked again before allocation two | Typed 404 after deletion |

The second turn decrypted the updated profile from the account vault instead of
reusing the first turn's memory or sandbox. Both saved profiles went through the
new atomic commit. The final connection remained `connected`, generation 2,
revision 138, with no lease. No user reauthorization was requested. Both passing
allocation records are `cleaned` with no pending provider operation; the other
four allocations were also cleaned and the two unused queued fixtures canceled.
No fixture remained queued or running.

The native `account/read` call requested `refreshToken: true`; access and refresh
token changes establish actual provider renewal and durable restoration. The
access JWT was not expired at the start of either turn. Expiration was not forced,
and JWT expiry metadata was read only for this distinction. This does **not**
validate recovery after natural token expiry or provider revocation. No provider
token, hash, authentication transcript or account identifier was published.

Verification: 182 behavior tests across 12 files; all four native SQL suites passed
in local Docker with `ROLLBACK`. Typecheck, lint, both VM builds, encrypted-access
and encryption-schema checks passed. Documentation, knowledge, owned-English and
whitespace checks also passed. Documentation impact is limited to this record,
`min-676-harness-interface-probes.md`, the encryption lifecycle reference and its
SQL inventories. The public controls, availability gate and six-locale manual
remain accurate; no article, workflow or figure revision is required for these
private lifecycle fixes.

## Engine-specific model preferences and revocation recovery

Native settings now store separate `model` and `reasoningEffort` preferences for
Codex and Claude Code in `user_agent_preferences.native_model_preferences`.
OpenCode retains `default_model` and API reasoning. The protected partial RPC
merges only supplied engines. Native `agent_runs.model` and
`native_reasoning_effort` are immutable and flow through the VM job into Codex
`thread/start` model/config or Claude `--model`/`--effort`. Resume ignores changed
account settings. Model membership and supported effort validation do not prove
provider entitlement, and no API fallback is allowed.

The settings catalog `GET` reads metadata only. Codex's explicit `POST` refresh
owns an exclusive native lease, starts a bounded allocation, authenticates with
the unmodified CLI, pages through `model/list`, commits the refreshed encrypted
profile, saved marker and account/generation-bound catalog atomically, then
physically destroys the allocation. A lost commit response reconciles the saved
marker before cleanup. Unconfirmed destruction retains its fence. The public
catalog contains bounded model identifiers, display names and supported efforts;
it contains no auth bytes. Browser disk query persistence excludes this catalog.
Claude uses documented moving aliases and never claims paid account eligibility.

On 2026-10-10, official scoped Codex logout revoked the pilot refresh token and
the native CLI rejected its previous profile. The user reconnected through the
actual settings device flow, selected `gpt-6.1-sol`/`medium`, and two distinct
cold workers passed actual MCP and repository guard operations with saved token
rotation and typed SDK deletion proofs. See
`assets/min-676-reconnect-model-proof.json` and the harness probe report.
This does not establish natural expiry recovery: no authentic expired access
token was available and no signed claims were changed. Claude paid execution
remains untested. Availability and provider authorization conditions above remain.

An additional private acceptance on 2026-10-10 replaced only the first disposable
sandbox's imported access token with an explicitly synthetic expired fixture,
preserving the actual refresh token and ID token. Real native renewal, encrypted
write-back, Minddy MCP and a second untouched cold worker all passed without
another authorization. Both sandboxes were physically destroyed and allocation
ledgers cleaned. See `assets/min-676-simulated-expiry-proof.json` and the harness
probe report for exact assertions. This proves simulated expired-access recovery;
authentic expiry and provider HTTP 401 recovery remain unobserved. The current
account model selection was `gpt-6-luna` with automatic thinking. Claude remains
untested.
