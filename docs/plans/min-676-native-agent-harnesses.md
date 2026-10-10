# MIN-676: Personal coding subscriptions in hosted Minddy sandboxes

Research date: 2026-10-10. Reviewer: Codex, acting as an agent reviewer.
Repository baseline: `823b4b8765dffbb8e6fcbe4bdf59bdd182a7f63f`.
Status: feasibility study; no native runtime, login flow or provider agreement
has been shipped or validated by this change.

## Scope and recommendation

The owner requested a feasibility study first. The eventual feature must be
native to hosted Minddy: users select a coding harness and use their own paid
subscription inside Minddy's server sandbox. Local execution and a self-hosting
restriction do not meet this requirement.

**The execution interfaces are technically suitable. A production integration
is conditional on authentication, credential isolation and provider approval
evidence.** Build native adapters for the published Codex app-server and Claude
Code CLI, retaining OpenCode as the existing default. Let the original CLI own
its login and inference. Keep Numo as the orchestration layer and return worker
events, verification and PR artifacts through Minddy's existing control plane.

Treat subscription access, harness selection and sandbox compute as separate
concepts. Ori is a possible later OpenRouter routing option; it does not satisfy
the personal Codex/Claude subscription requirement.

The owner's follow-up requires a durable account connection. Initial native
compatibility is **Codex and Claude Code only**. In account AI settings, the
user connects a personal subscription and selects their default code worker.
Every subsequent implementation, plan, review, ticket delegation, direct Numo
request and routine resolves that setting through the same launch path.
Selecting a native engine replaces OpenCode for new workers on that account;
Numo's own conversational model remains a separate setting and funding source.

Authentication must survive **complete sandbox destruction**. Keeping a VM
alive, requiring login for every task, or requiring local software does not
meet the requested experience. A temporary login allocation is acceptable only
if it exports an approved durable credential representation and is destroyed
after setup. The first qualifying hosted pilot must prove login once, destroy
the allocation and execute in a fresh allocation without another browser login.
Manual reconnect remains necessary when the provider revokes or expires access;
no integration can promise that a personal session lasts forever.

An encrypted, account-owned native credential vault is the proposed technical
design, subject to provider authorization. Codex documents credential restore
and write-back on ephemeral runners. Claude Code has native persistent auth
and a CI token, but its restrictions on third-party token custody still need
resolution. Encryption addresses storage security, not permission to store.

## Provider feasibility

| Route | Evidence and conclusion | Release condition |
| --- | --- | --- |
| Unmodified Claude Code with the user's Claude subscription | Anthropic documents hosted native binary use. Native cached auth and a CI token can technically avoid per-run login. | Confirm a permitted durable custody mechanism: the legal page also prohibits third-party collection/storage of Claude session tokens. Do not infer an exception from encryption or CI token availability. |
| Native Codex app-server with the user's ChatGPT account | Native login and worker lifecycle are supported. Official CI guidance explicitly describes restoring auth on ephemeral runners and saving the refreshed file. | Confirm Minddy's paid, multi-user hosting and durable user credential custody; validate a serialized native refresh cycle across destroyed allocations. |
| Sign in with ChatGPT tokens supplied by Minddy | The public open-source flow covers local apps and self-hosted VMs; paid or remotely hosted apps are directed to a separate interest process. | Do not treat Minddy's open-source license as authorization for its hosted offering. A separate approved integration would need its own client registration and consent. |
| Ori wrapping Codex, Claude Code or OpenCode | Ori supplies OpenRouter credentials, models and organization settings to the chosen CLI. | Optional harness choice with OpenRouter billing, not native subscription consumption. |
| Other coding CLI subscriptions | This study does not establish support or hosting permission for every coding assistant. | Add each harness only after the same auth, protocol, isolation and terms review. |

Anthropic's [legal and compliance page](https://code.claude.com/docs/en/legal-and-compliance)
distinguishes running the original CLI from offering a third-party Claude login
or routing subscription credentials through another application. Its hosted
conditions require the published binary, preservation of its authentication
methods and usage billed directly to each end user. The same page restricts
third-party collection and storage of Claude session tokens. Hosted execution
permission alone therefore does not establish permission for Minddy's proposed
durable vault, including a token produced by `claude setup-token`. Its
[Commercial Terms](https://www.anthropic.com/legal/commercial-terms) remain part
of that arrangement. No agreement acceptance or provider contact was performed
during this study.

The [Codex app-server reference](https://learn.chatgpt.com/docs/app-server)
documents CLI-owned account login. OpenAI's
[ChatGPT plan integration overview](https://developers.openai.com/siwc/token-sharing-open-source)
separately directs paid or remotely hosted integrations to an interest form.
That limitation applies to that integration route; it is not proof that the
original CLI's device login is technically unavailable. Conversely, the
existence of device login is not proof that a paid SaaS may offer it without
additional conditions. Ask OpenAI about the exact hosted-native-CLI design.
The [European terms](https://openai.com/policies/eu-terms-of-use/) also prohibit
account sharing and bypassing usage restrictions. Personal connections must
not become pooled credentials for a team, project or platform.

## Repository constraints

| Component | Current behavior | Consequence for the implementation |
| --- | --- | --- |
| `lib/agent-engines.ts`, `lib/server/agent/runs.ts:createRun` | OpenCode is the only live engine; historical `loop` runs remain readable. `createRun` freezes `AGENT_ENGINE`. | A native harness requires an explicit frozen engine selection and compatible DB constraints. |
| `lib/server/agent/launch.ts:launchAgentRun` and `model.ts:resolveAgentModel` | New workers take their provider-bound model from account settings. Local launches are rejected. | Extend the account worker configuration rather than adding model/credential overrides to Numo tool calls. Keep hosted execution. |
| `vm/main.ts`, `vm/protocol.ts` | The job requires OpenCode input and runs the OpenCode supervisor. | Version the discriminated job contract; never let an older bundle silently run a native job as OpenCode. |
| `vm/supervisor.ts:runOpencodeTurn` | Owns interruption, questions, plans, tool counters, delivery, checkpoints and usage as well as OpenCode-specific session handling. | Extract common lifecycle services before adding separate native adapters. Changing only the executable would bypass existing guarantees. |
| `vm/tool-bridge.ts`, `vm/opencode-tools.ts` | Tools are generated as OpenCode modules around server-owned definitions and supervisor operations. | Expose the same admitted tools through MCP for native CLIs. Do not create another unconstrained public integration key. |
| `sandbox.ts`, `drain.ts`, allocation/erasure helpers | Live allocations may be reused. Stopped allocations have empty filesystems; idle sandbox cleanup is five minutes. | Separate account credential lifetime from allocation lifetime. Restore approved credentials at cold start, save native refreshes, then destroy plaintext with the allocation. |
| `encrypted-journal.ts`, `run-journal-codec.ts` | Conversation history is recovered through an encrypted OpenCode event journal. | A native thread/session ID alone cannot restore files in a fresh allocation. Each adapter needs validated, credential-free history export/import. |
| `network-policy.ts`, `vm/llm-proxy.ts` | API credentials are injected or relayed outside the untrusted tool environment; the proxy redacts model inputs. | Native OAuth files change the trust boundary. Direct provider traffic does not pass through the current redaction proxy. |
| `quota.ts`, `usage.ts`, `ai-usage.ts`, `vm-rest.ts` | AI key modes are `platform` and `byok`; sandbox usage is recorded separately. | Add a subscription inference mode without granting unlimited Minddy compute or disabling paid-tool limits. |
| `lib/server/encryption/store.ts`, `registry.ts`, `user-ai-key-content.ts` | User-scoped authenticated encryption and ownership-aware credential access exist for API keys. | Reuse encryption infrastructure with a separate native credential entity, mandatory protection, revision checks and narrow server access; never reuse API-key entitlement semantics. |
| `lib/server/assistant/{prompt.ts,prompt-context.ts,tools.ts,execute-tool.ts}` | Numo delegates through `launch_code_agent` and already owns Minddy operations. | Supply actual adapter capabilities and mediate unsupported operations without attributing them to the worker. |

The existing retention requirements are documented in
[agent ephemeral storage](../security/encryption/agent-ephemeral-storage.md).
Retired desktop launcher code is not a supported shortcut back to local work.
Self-hosted Docker tmpfs behavior is useful parity evidence, not the delivery
target for this issue.

## Native interfaces and authentication

### Codex

Use `codex app-server --listen stdio://` with the supervisor as its private
JSON-RPC client. Initialize with Minddy's stable client identity, then use native
account login, model discovery and thread/turn operations. Prefer
`account/login/start` with `type: chatgptDeviceCode` for a remote sandbox; display
the verification URL and short-lived user code only to the connection owner.
Keep the device-code exchange and token renewal inside Codex. Support explicit
login cancellation and logout. The user's workspace may disallow device login.

The generated schema from `@openai/codex@0.162.1` contains these operations.
It also marks externally supplied `chatgptAuthTokens` as unstable and for OpenAI
internal use only. Do not use that field as a convenient token-upload API,
even though the live documentation describes an experimental variant.

Use `thread/start`, `turn/start`, `turn/steer` and `turn/interrupt`; translate
native approval and user-input requests to Minddy's existing controls. Consider
`model/list` a catalog and verify eligibility on a real completed turn. Never
consume reset credits, change accounts or switch to an API key automatically
when the subscription reaches its limit.

Cold recovery needs the native rollout state as well as the thread ID. The
tested schema's `ThreadResumeParams` has no general `history` import field.
Validate an allowlisted native rollout restoration on the pinned release; do
not assume that replaying OpenCode events or passing a saved ID is sufficient.
If exact restore cannot be proved, recover the branch and an explicitly labeled
summary into a new native session rather than claiming uninterrupted memory.

### Claude Code

Run the published CLI's `claude auth login --claudeai` in an owner-only login
terminal. Its [authentication guide](https://code.claude.com/docs/en/authentication)
describes the browser URL and terminal-code fallback used for remote machines.
Passwords, native OAuth access/refresh tokens and credential files must never
be pasted into a Minddy settings form or routed through OpenCode.

After login, run the unchanged CLI in print mode with `--input-format stream-json`,
`--output-format stream-json`, `--verbose` and `--include-partial-messages`.
Use the [headless interface](https://code.claude.com/docs/en/headless) to consume
the terminal result and handle interruption; EOF or process exit alone is not
successful completion. Do not enable API fallback or interpret cumulative
session cost estimates as a bill from the user's subscription.

**Do not use `--bare` or `CLAUDE_CODE_SIMPLE=1` for subscription runs.** The pinned
CLI help and headless documentation say that bare mode skips OAuth credentials.
The [CLI reference](https://code.claude.com/docs/en/cli-reference) supplies
`--setting-sources`, `--settings`, `--strict-mcp-config`, tool selection and
restricted mode as candidate configuration controls. Verify their combination
with login, repository instructions, Minddy hooks and MCP in the hosted pilot.
`--safe-mode` also disables customizations, so it is not automatically a working
configuration for the required Minddy bridge.

### Hosted login transport

The installed Vercel SDK exposes
`sandbox.currentSession().openInteractive(): { url, token }` for a PTY.
Use the current session rather than an API that might resume an erased sandbox.
This proves an available transport interface, not a tested end-to-end browser
login. The returned capability opens a shell; it is not inherently restricted
to a login command. Prototype an owner-only, bounded native-login terminal and
verify whether a dedicated CLI PTY is needed instead of exposing that capability.

A Minddy route must check the authenticated account, connection owner, login
attempt, current allocation generation and account erasure fence before access.
Setup is account-owned and must work before any project or run exists. Use
proposed endpoints under `app/api/account/agent-connections/`, not a run-owned
credential setup API. Session capabilities and OAuth callback
codes stay out of chat, project events, persisted transcripts, analytics and
provider command logs. Browser-to-sandbox traffic must be encrypted; no public
unauthenticated app-server listener is acceptable. Shared PR viewers cannot
open another user's authentication terminal.

## Proposed runtime and data contract

These are proposed interfaces and fields, not existing repository APIs.

| Concept | Proposed representation | Ownership and behavior |
| --- | --- | --- |
| Harness | `agent_engine: opencode \| codex \| claude_code` | Freeze on each new run; retain historical `loop`. |
| Inference funding | `inference_auth: platform_api \| user_api \| native_subscription` | Independent from engine, compute and Numo's own model funding. |
| Account worker selection | Engine, model/reasoning, native connection ID where applicable | Chosen in account AI settings and resolved for every new worker; only Codex/Claude Code are new native choices. |
| Native connection | ID, owner, harness, state, credential revision, expiry and disconnect generation | Durable account metadata, independent of allocation IDs; never return native credential contents to the client. |
| Native credential | Provider-approved opaque credential bytes in a dedicated encrypted entity | User-scoped server storage with mandatory encryption, ownership checks, audited access, versioned restore/write-back and defined deletion. |
| Login/allocation binding | Connection ID, attempt ID, allocation generation, lease and erasure fence | Temporary runtime authorization; cannot grant durable ownership or survive disconnect. |
| Authentication state | `disconnected -> awaiting_auth -> connected -> reconnect_required/revoked` | Connected means a saved credential exists, not guaranteed entitlement. A cold allocation independently validates restored native authentication before inference. |
| Worker state | queued/preparing/auth wait/running/needs input/terminal | Decide whether auth wait is a separate field or DB status during schema design; update drain and uniqueness rules together. |
| Native checkpoint | Engine/version, native session ID, durable journal cursor, branch, plans and delivery state | No credentials, terminal capabilities, callback codes or full home-directory archive. |
| Usage | Token counts when available, source, estimate flag, externally funded inference | Subscription quota is provider-controlled. Never claim a USD estimate measures remaining plan allowance. |

The runtime adapter needs `prepare`, `startTurn`, `steer`, `interrupt`,
`answerInput`, `exportHistory`, `restoreHistory` and `close` operations plus a
normalized event stream. Authentication is a separate account-connection service;
native restore and validation must finish before any model turn starts.
Every failure still returns a
`VmTurnReport` through the existing terminal-report path.

The MCP bridge should reuse `agentToolsFor`, `startToolBridge`, project/run
admission and server-owned delivery operations. Preserve plan synchronization,
questions, web-search counters, validation, secrets scanning, DCO commits,
Git refresh and verified PR creation. Each engine translates its native tool
names into the event names used by `delegation.ts:buildAgentDelegationResult`.
Otherwise Numo cannot verify the worker's claimed tests or artifacts.

### Minddy tools and Numo mediation

Both initial native engines are MCP clients. The official
[Codex MCP reference](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)
documents stdio and HTTP servers; the
[Claude MCP reference](https://code.claude.com/docs/en/mcp)
documents explicit CLI server configuration and initialization errors.
The normal implementation is a private Minddy MCP bridge in the allocation,
backed by the existing admitted tool definitions. Published support does not
prove every Minddy tool, interaction or strict runtime setting works together.

Add a tested, versioned capability manifest in proposed
`lib/agent-harness-capabilities.ts`. It records actual available Minddy tools,
questions, interruption, steering, plan delivery, artifact delivery and history
restoration. Pin a manifest to the run and reconcile it with startup/tool-list
handshakes. Make it visible as metadata to Numo through `prompt-context.ts`,
`launch_code_agent` results and delegation reports; never include credentials.
Engine names or a model's claim are insufficient capability evidence.

Numo keeps its existing Minddy tools regardless of the worker engine. If a
tested adapter cannot perform a Minddy operation directly, the worker returns
a structured request or verified result and Numo performs the permitted
operation using its own authenticated tools. For example, a worker may produce
a repository-grounded plan for Numo to save, rather than claim it updated the
issue. Record the actual actor and acknowledgement, and deduplicate mutations.
Do not execute instructions hidden in arbitrary stdout as tool requests.

Fallback preserves the same project, owner, original authorization, delivery
requirements and server validation. Numo cannot invent test evidence or a PR
URL, approve a sensitive operation itself, or grant capabilities it does not
have. If neither side has a required operation, return an explicit limitation.
An unexpected MCP failure must be reported and assessed against the task's
required capabilities, not silently converted into an allegedly complete run.

## Credential lifetime, concurrency and isolation

### Provider mechanisms and limits

OpenAI's [ephemeral-runner authentication guide](https://learn.chatgpt.com/docs/auth/ci-cd-auth)
prescribes restoring `auth.json`, letting Codex renew it and saving the updated
file to secure storage. It warns against concurrent copies or restoring the
original seed after refresh. This supports the proposed mechanism technically;
it does not establish Minddy's commercial entitlement. The ordinary
[authentication reference](https://learn.chatgpt.com/docs/auth)
documents file-backed native credentials and automatic renewal.

Claude's [authentication reference](https://code.claude.com/docs/en/authentication)
documents Linux native credential files and `claude setup-token`, which creates
a one-year subscription token for `CLAUDE_CODE_OAUTH_TOKEN`. Local MCP remains
available with that token; it is not a connector or Remote Control credential.
The official [GitHub Actions guide](https://code.claude.com/docs/en/github-actions)
also provisions subscription tokens in customer repository secrets for fresh
runners. These customer workflows establish a technical route, not permission
for a third-party multi-user vault. Minddy must obtain clarification for either
cached native profiles or setup tokens before implementing that custody route.

No documented provider-managed personal-subscription connection API was found
that solves this requirement without native credential retention. Delegating
to provider cloud, using customer GitHub Actions, enterprise workload identities
or using API keys changes the requested product or eligibility. Evaluate them
only as explicitly different options, not as completion of MIN-676.

### Proposed durable vault and cold-start sequence

The following design is conditional on each provider permitting it:

1. Start a bounded, auth-only allocation from account AI settings. No repository
   is cloned. The published CLI owns browser/device authentication. Native auth
   output travels on a dedicated secret channel; a setup-token must never enter
   the visible terminal stream, task conversation or generic command log.
2. Save only the allowlisted provider-approved credential representation in a
   new server-only `native-agent-credentials.ts` facade. Use the existing
   `EncryptedStore` under the user's scope, distinct from `user_ai_keys`, with
   mandatory encryption and no unprotected fallback. Proposed SQL entities
   `native_agent_connections` and `native_agent_credentials` separate client
   metadata from secrets; extend encryption policy/inventory and access audits.
   Authenticate ciphertext with owner, entity/column and connection row ID;
   validate engine/schema and profile revision through guarded DB operations.
3. Mark the account connection saved only after the encrypted write commits,
   then destroy the login allocation. Disconnect/erasure fences apply to late
   auth results, which must not resurrect a removed connection.
4. At launch, freeze the account-selected engine and connection owner. Acquire
   an exclusive per-connection lease before creating a worker; queue another
   run using that profile without holding a paid waiting sandbox. Restore the
   latest committed profile into the CLI's private auth location via a narrow,
   encrypted control channel. No full home directory, profile snapshot, API-key
   proxy or unsupported `chatgptAuthTokens` injection is involved.
5. Validate native auth, initialize the tested Minddy MCP bridge, then start
   inference. Only the published CLI exchanges and refreshes subscription
   tokens. The supervisor has no generic provider OAuth refresh implementation.
6. Persist each stable credential change through a revision-checked write-back
   tied to owner, connection generation, lease and allocation generation. Save
   the CLI's latest file, not the initial seed; never expose secret bytes in
   `VmTurnReport`, histories or general event endpoints. Flush before normal
   teardown, release the lease only after processes and refreshed state settle,
   and destroy all allocation plaintext. No idle keepalive is required.

Lease expiry alone cannot establish that the old process stopped. Fence stale
writers and require settled allocation cleanup before issuing a new lease;
otherwise two processes could rotate the same token. Test crashes during
refresh and between token rotation and encrypted write-back. If recovery cannot
prove a usable profile, mark reconnect required with an honest failure; do not
repeatedly restore stale state, silently bill an API or keep compute alive.
The normal happy path must reconnect automatically after every cold allocation.

The encrypted account credential is intentionally durable; plaintext prompts,
tool output and runtime auth copies remain ephemeral. Update the storage
contract and encryption review during implementation to name this exception,
key rotation, region binding, retention, backup recovery and deletion behavior.
Disconnect first fences access, stops dependent allocations, invalidates
capabilities and prevents delayed write-back. Then retire the saved credential
and encryption access with backup/restore tombstones. Deleting a project/run
erases its allocations, not an account connection shared with other projects;
account deletion retires all native connections. Deletion is not proof of
provider-side revocation; document and exercise supported logout/revocation.

[Vercel Drives](https://vercel.com/changelog/drives-for-vercel-sandbox-are-now-in-public-beta)
could hold an encrypted profile independently of compute, but add mount and
retention semantics without resolving custody permission. Prefer the existing
encrypted store unless a measured native requirement justifies a separate
encrypted user profile volume. A plaintext Drive or whole-home snapshot is
not an acceptable substitute. Client-only encrypted storage also cannot support
unattended Numo/routines unless a durable authorized decryption mechanism exists.

Never pool users' subscriptions or let project reviewers access connection
capabilities. Connection ownership follows the authenticated launch actor or
the existing routine owner, never the ticket assignee or project owner's plan.

The model's generated commands must not be able to read the native auth store,
steal session capabilities or call privileged control surfaces. Native login
introduces readable secret files that today's firewall approach avoids. Merely
placing them outside the checkout is insufficient. Prototype OS-enforced tool
isolation and native file-tool policies on Vercel, including `/proc`, symlinks,
package lifecycle scripts, hooks, plugins and MCP subprocesses. Claude's
[Bash sandbox documentation](https://code.claude.com/docs/en/sandboxing) explicitly
separates shell isolation from file tools, hooks and MCP. Deny unsandboxed
fallback, and fail startup if required isolation is unavailable.

Before native inference, redaction must happen in guarded tool results and
context exports rather than relying on Minddy's OpenAI-compatible model proxy.
A new engine needs behavioral secret-sentinel tests in addition to an entry in
`redaction-invariant.test.ts`. If the pinned harness cannot isolate credentials
without modifications or unsupported hooks, do not enable that adapter.

## Billing and model selection

Subscription inference is paid to the provider under the user's agreement.
Minddy continues accounting for server-calculated sandbox allocation time,
Numo's separately funded orchestration and paid platform tools. Reuse the
atomic parent-turn budget/reservation logic for charges Minddy actually bears.
Do not label a subscription connection as BYOK: `checkAgentQuota` currently
treats validated BYOK as unlimited and would be the wrong compute admission.
Authentication setup must not require a nonexistent model API key.

Handle `total_cost_usd` from Claude as an estimate with cumulative-session
semantics, and Codex tokens as provider-reported usage where available. Store
externally funded estimates separately from chargeable platform inference;
replay/retries must not bill the same compute interval or paid-tool call twice.
Subscription runs cannot promise the current API-key USD cap bounds external
inference. Use a duration/turn limit, provider limit errors and real interruption
to bound execution, with a documented provider cancellation window.

Settings select engine, funding mode and a model valid for that combination.
Freeze those settings and the connection owner on launch. Native catalogs need
their own capability checks, not OpenRouter's price index or plan multiplier
as entitlement proof. Changing future preferences cannot silently migrate an
existing conversation's engine, user, history or funding source.

## Ordered implementation backlog

All items below remain pending. Names of new files/functions are design targets.
Complete hosted acceptance tests before marking MIN-676 implemented.

- [ ] **Provider gates and cold hosted pilot:** record authorization for Minddy's paid native hosting and durable user credential custody, explicitly resolving Anthropic's third-party storage restriction. With consenting test accounts, connect from account settings, destroy the login allocation, run in two fresh hosted Vercel allocations and verify native renewal, logout and credential isolation. A live-allocation-only pilot cannot satisfy this step.
- [ ] **Schema, encrypted credentials and admission:** add a new `supabase/migrations/` migration and SQL tests for engine/funding constraints, account-owned connection metadata, mandatory encrypted native credential entities, RLS, profile revisions, exclusive connection leases, allocation generations and disconnect/erasure fences. Add `lib/server/agent/native-agent-credentials.ts` using `lib/server/encryption/{store.ts,registry.ts}`; extend encryption policies, schema inventory, audits and guarded run/allocation reservation RPCs. Never expose credential contents through metadata reads or reuse BYOK admission.
- [ ] **Shared contracts and capabilities:** extend `lib/agent-engines.ts`, `lib/server/agent/runs.ts:createRun`, `harness-layout.ts` and `vm/protocol.ts:parseVmJob`. Add `lib/agent-harness-capabilities.ts`, engine-bound frozen connection metadata and a discriminated native job/checkpoint without secret values. Bump `VM_PROTOCOL_VERSION`; extend bundle manifests and diagnostics in `harness-bundle.ts` and `scripts/build-agent-vm.mjs`.
- [ ] **Common supervisor services:** extract lifecycle, tool counters, heartbeat, delivery, redaction and normalized events from `vm/supervisor.ts:runOpencodeTurn` into a shared runtime service. Define `vm/harness-adapter.ts`; preserve OpenCode regression coverage before adding native dispatch.
- [ ] **Native runtimes:** add `vm/codex-client.ts`, `vm/codex-adapter.ts`, `vm/claude-code-adapter.ts` and `vm/native-cli-install.ts` with pinned published binaries, install integrity, child cleanup and strict configuration. Wire `vm/main.ts`; implement lifecycle operations, capability startup checks, user input and terminal reports using real pinned-CLI fixtures. Initial native engines are Codex and Claude Code only.
- [ ] **Minddy tools and Numo mediation:** add `vm/mcp-tool-bridge.ts` around `agentToolsFor`/`startToolBridge` and share guarded definitions with `vm/opencode-tools.ts`. Adapt worker `prompt.ts`, `opencode-anchor.ts` and `delegation.ts` for native tool names and capability reports. Extend `lib/server/assistant/{prompt.ts,prompt-context.ts,tools.ts,execute-tool.ts}` with actual worker capabilities and typed requests/results so Numo performs authorized unsupported Minddy operations with actor provenance, acknowledgements and idempotency. Fail honestly when neither side can satisfy a required operation.
- [ ] **Durable connection lifecycle:** add `lib/server/agent/native-agent-connections.ts` and `vm/native-auth.ts`; integrate `sandbox.ts`, `sandbox-allocation.ts`, `sandbox-erasure.ts`, `drain.ts` and `prune.ts`. Implement bounded account login, restore-before-inference, native refresh write-back with revision/lease/generation checks, cold restart and cleanup. Serialize profile use without allocating a waiting VM; fence crashes, cancellation, disconnect and late writers. Account credentials persist independently of run/project allocations; plaintext runtime auth never survives teardown.
- [ ] **Account authentication surface:** add account-owned endpoints under `app/api/account/agent-connections/` for metadata, login attempts, bounded native transport, cancellation and disconnect, plus `components/settings/native-agent-connections.tsx`. Setup works with no run or project. Validate owner, origin, attempt/connection generation and expiry; omit secret values and disable persisted terminal transcripts, replay and analytics. Destroy the auth-only sandbox after successful vault commit, cancellation or timeout.
- [ ] **Account settings and every launch path:** extend `app/api/account/agent-preferences/route.ts`, `lib/agent-api.ts`, `lib/use-agent-preferences-query.ts`, `components/settings/account-ai-keys-section.tsx`, `lib/server/agent/model.ts`, `launch.ts:launchAgentRun` and `execute.ts` for the account-selected default harness and approved saved connection. Native selection replaces OpenCode for new implementation, planning, verification, ticket/direct Numo, PR and routine workers. Freeze existing lineages; never silently fall back to API billing or select another user's connection.
- [ ] **Recovery, usage and security contract:** implement native history codecs in `run-journal-codec.ts`/`encrypted-journal.ts`; extend `control-plane.ts`, `vm-rest.ts`, `quota.ts`, `run-key.ts`, `lib/server/usage.ts` and `lib/server/ai-usage.ts` for externally funded inference, bounded compute and paid-tool accounting. Add a dedicated secret transfer channel; update network/tool isolation and `docs/security/encryption/agent-ephemeral-storage.md` with the encrypted account credential retention exception, root/data-key rotation, backup/tombstone recovery and verified deletion. Maintain self-hosted compatibility without restricting hosted delivery.
- [ ] **Complete documentation and verification:** update the `numo` and `ai-settings-and-usage` guides in six locales, message catalogs and factual review evidence. Run adapter/launch/assistant-capability/MCP/quota/journal/credential-revision/isolation/erasure tests, relevant lint/typecheck, documentation/knowledge/English checks, `git diff --check` and the cold-hosted acceptance matrix below. Require `check:documentation:release` before production publication. Create or update the DCO-signed implementation PR with `npm run work:pr`.

## Release acceptance and open decisions

| Scenario | Required observed result |
| --- | --- |
| Account AI settings connects a personal subscription with no run/project | Native CLI owns login; the committed encrypted connection is account-owned and the temporary login sandbox is destroyed. Only Codex/Claude Code are new native choices. |
| First login allocation is destroyed; a fresh worker runs later | Latest saved credential restores and validates without browser login, local software, a Drive with plaintext auth or an idle VM. |
| Native credential renews; that worker is destroyed; another cold worker starts | Latest refreshed state is committed and reused; the original seed is never restored over it. |
| Implement, generate a plan, verify, ticket delegation, direct Numo, PR action and routine | Every new worker uses the account-selected native engine and correct connection owner through the same launch resolver. |
| Minddy MCP is available | Actual guarded tool list is advertised to the native worker; plan/task updates and artifacts have server acknowledgements and verified results. |
| A tested native capability is unavailable or MCP startup fails | Numo sees the real capability state and performs authorized supported operations itself, or reports the unmet requirement. No fake worker tool execution or success. |
| Secret-bearing fixture, malicious instructions and package install | Native auth files/environment and capabilities are unreadable to generated code and absent from model results, journals, events, logs, command telemetry and MCP child environments. |
| Two workers use one connection; a lease holder crashes during renewal | Serialize before paid allocation; settle old processes and fence late writes. No duplicate refresh, stale state restoration or connection resurrection. |
| User changes engine or true token revocation/expiry occurs | Future workers follow the new selection; existing lineage stays explicit. Reconnect is requested only for unusable provider access, not normal sandbox cleanup; no API fallback. |
| Stop, tool approval, question and steering during a long command | Responsive interruption; no lost input, orphaned child, false completion or unrecoverable checkpoint. |
| Allocation is stopped and recreated | All allocation plaintext is destroyed. Approved encrypted account auth persists; branch and supported history recover without pretending native IDs alone contain history. |
| Login abandoned, user idle for a long period, or unattended routine starts | Login timeout destroys setup resources. No idle VM expense; subsequent launch uses saved native auth or reports actual revoked/expired access. No model calls merely to keep a login alive. |
| Two users/projects and a shared ticket/PR reviewer | No cross-owner secret or login access. Deleting one project/run cannot remove another project's account connection; all its runtime copies are retired. |
| Disconnect/account erasure races with login, restore or write-back; old backup restored | Fence blocks access and late writers, active allocations stop, saved credential is retired and tombstones prevent restoration. Provider revocation is distinguished from Minddy deletion. |
| Provider throttles or CLI/transport crashes | Preserve reviewable work, interrupt children, report failure and account for costs idempotently; mark reconnect only when credential recovery actually fails. |
| Current OpenCode worker and historical run | Existing API/BYOK launch, recovery, redaction, delivery and billing remain correct for accounts retaining that selection. |

Unresolved before production: provider authorization for the exact paid hosting
and durable credential-custody design; Claude's third-party storage restriction;
secret-free login/transport telemetry; native credential/tool isolation on Vercel;
crash-safe refresh write-back and backup erasure; cold history restoration;
and quota/cancellation behavior on real subscriptions. A session-bound pilot
is insufficient for the owner's requirement. These gates are not negative
findings proving the requested feature impossible. No provider was contacted
and no personal account authenticated during this study.

## Documentation impact and evidence

This study changes only internal planning/validation documents. Published
behavior, UI controls, configuration and desktop version are unchanged, so
public article revisions, new illustrations and invented release review dates
would be inappropriate in this PR.

The implementation must update `numo` and `ai-settings-and-usage` in `en`, `fr`,
`de`, `es`, `it` and `pt-BR`, including actual control labels, billing,
durable account login, disconnect, exceptional reauthentication, routines,
capability mediation and cold recovery. Identify affected workflow and
figure IDs from `coverage.json` during implementation rather than inventing
new IDs in this study. Record real hosted-procedure and language review evidence
before publishing those instructions.

See [the interface probe record](../validation/min-676-harness-interface-probes.md)
for exact pinned CLI commands, schema findings and the limits of this study's
verification. Competitor evidence is recorded below separately from Minddy's
own feasibility and acceptance requirements.

## How other hosted products implement this

Research agents examined competitors using their official documentation
and public repositories on 2026-10-10, including the owner's Linear follow-up.
These are documented product behaviors
and code observations, not authenticated product tests or provider contracts.

| Product | Hosted subscription flow | Useful implementation precedent | What remains unknown or incompatible |
| --- | --- | --- | --- |
| Tembo | Personal Codex device-code login; Claude browser approval with returned code. Native Claude Code runs in its Linux session environments. | Account connections are distinct from session harnesses; inference funded by a subscription and VM compute are separated. | Hosted auth/storage source is not public. Some subscription paths also support OpenCode/Pi, so not every path can be described as native Codex execution. |
| Ona Cloud | Native Codex connected to a user's ChatGPT plan using device authorization. | A first-class cloud integration, personal/service-account ownership, separate compute and provider allowance. | No public evidence of auth encryption, refresh locking or immediate revocation of active sessions. Service-account capabilities do not establish permission to pool personal plans. |
| Boxes.dev | Native Codex/Claude on managed Linux devboxes; device code or browser approval plus code. | Explicit account-switch, sleep/reboot and disconnect behavior; API fallback is opt-in. | Retains machine state through sleep and warns that machine processes can read delivered credentials. This differs materially from Minddy's ephemeral and secret-isolation requirements. |
| CloudCLI Cloud | Hosted containers with a PTY-based native login interface. | Public PTY reconnect and provider-runtime code is available. | Its Claude conversation path uses Agent SDK; presence of OAuth support in source is not proof of subscription eligibility for a third-party service. |
| opencompany | Dedicated cloud Codex login sandbox and persistent hosted worker sandboxes. | Public per-user encrypted credential storage and refresh-lock implementation. | Copies native auth state; its custom Claude usage probe is not an acceptable template for a native-only subscription design. |
| Linear Agent coding sessions | Native coding harnesses in cloud environments funded by workspace AI credits. | Integrated issue delegation, steering and review. | This documented path charges for model tokens; it does not establish personal subscription reuse. |
| Codex by OpenAI in Linear | Paid ChatGPT account integration delegates to Codex cloud chats. | Connect once and delegate from an issue, with results returned to the tracker. | Provider-cloud execution does not show native auth persistence in Linear-owned sandboxes and changes Minddy's required execution destination. |
| Sinatra, listed in Linear's directory | Connect a Claude/ChatGPT subscription and start a fresh isolated cloud sandbox per task. | A closer functional precedent for durable subscription access with ephemeral compute. | The directory does not explain credential storage, renewal or provider permission. |

### What Linear actually documents

Linear's [coding sessions guide](https://linear.app/docs/coding-sessions)
describes its integrated coding worker and workspace configuration. Its
[AI credits guide](https://linear.app/docs/ai-credits) explicitly charges for
model tokens and sandbox time. These integrated sessions should not be cited
as evidence that Linear stores personal subscription credentials.

The separate [Codex integration by OpenAI](https://linear.app/integrations/codex)
is a different route. The official OpenAI
[Linear integration guide](https://learn.chatgpt.com/docs/third-party/linear)
requires Codex cloud setup, GitHub and a repository environment, then launches
a cloud chat from an issue. The account connection and progress UX are useful
references; the published flow does not expose a reusable native auth profile
or prove Linear hosts the CLI with a saved personal credential.

Linear's [MCP guide](https://linear.app/docs/mcp) illustrates giving native
coding clients access to tracker tools. The OAuth there authorizes Linear
operations, not a Claude/ChatGPT subscription. Keep Minddy tool authorization
separate from model inference credentials in the same way.

The [Sinatra directory entry](https://linear.app/integrations/sinatra)
describes a personal subscription connection plus fresh task sandboxes, which
matches the requested behavior more closely. Its private retention and refresh
implementation remains unknown. No consulted Linear source discloses native
credential encryption, token renewal or a provider agreement transferable to
Minddy.

### Other hosted precedents

Tembo's [models guide](https://docs.tembo.io/features/models) documents the
personal account flows and separately billable compute. Its
[Claude integration](https://www.tembo.io/integrations/claude-code) describes
native harness execution. However, the guide calls Claude connections personal
while the [2026-10-02 changelog](https://www.tembo.io/changelog/session-forking-claude-subscriptions-and-new-models)
advertises workspace sharing. Do not copy that account-sharing behavior or
treat the conflicting descriptions as an established authorization model.
Its [sandbox guide](https://docs.tembo.io/features/sandbox/overview) and
[recovery announcement](https://www.tembo.io/changelog/task-recovery-bulk-invites-and-free-plan-projects)
also describe different retention/recovery behavior. Their deletion statements
do not prove that native credential copies are retired. The public
[`tembo/tembo` tree](https://github.com/tembo/tembo) contains no hosted auth
implementation; [native package definitions](https://github.com/tembo/llm-agents.nix/tree/main/packages)
corroborate CLI packaging, not its token lifecycle.

Ona's [Codex connection guide](https://ona.com/docs/ona/integrations/configure-codex)
and [native agent guide](https://ona.com/docs/ona/agents/codex) provide a direct
precedent for the intended hosted feature. Their account and service-account
flows help specify ownership and automation, while provider limits may still
pause work. They do not disclose a reusable SaaS hosting agreement.

Boxes documents [connection and fallback](https://boxes.dev/help/connect-agents),
[sleep and recovery](https://boxes.dev/help/sleep-wake-recover) and
[credential removal](https://boxes.dev/help/data-and-credentials). Removing
saved credentials is distinct from revoking upstream access or stopping a
running process that already received them. Minddy's disconnect design must
therefore invalidate its own capabilities, stop dependent workers and give
accurate instructions for provider-side revocation.

CloudCLI's [hosted documentation](https://cloudcli.ai/docs/cloud/overview)
links to its [open-source UI](https://cloudcli.ai/open-source). At public commit
`7c3049fe8e157f12b7add3e496d8d2fe6fa5c014`, its
[shell WebSocket service](https://github.com/siteboon/claudecodeui/blob/7c3049fe8e157f12b7add3e496d8d2fe6fa5c014/server/modules/websocket/services/shell-websocket.service.ts)
launches a PTY, forwards login URLs and keeps a detached terminal reconnectable
for up to 30 minutes. Its
[Codex app-server client](https://github.com/siteboon/claudecodeui/blob/7c3049fe8e157f12b7add3e496d8d2fe6fa5c014/server/modules/providers/list/codex/codex-app-server.client.ts)
demonstrates stdio JSON-RPC thread forks. Its
[Claude runtime](https://github.com/siteboon/claudecodeui/blob/7c3049fe8e157f12b7add3e496d8d2fe6fa5c014/server/modules/providers/list/claude/claude-runtime.provider.js)
imports the Agent SDK. Do not copy token-file inspection as a freshness check
or buffered authentication transcripts as a safe retention policy.

At opencompany commit `274f4d1c0ba7a2348b619b469dd3e284215715c2`,
[Codex login](https://github.com/useopencompany/opencompany/blob/274f4d1c0ba7a2348b619b469dd3e284215715c2/apps/runner/src/codex-auth.ts)
runs in a dedicated sandbox with a 15-minute flow limit and 20-minute sandbox
lifetime. [Credential persistence](https://github.com/useopencompany/opencompany/blob/274f4d1c0ba7a2348b619b469dd3e284215715c2/packages/db/src/codex-auth.ts)
uses per-user encrypted native state and refresh locks. Its
[Claude usage-probe note](https://github.com/useopencompany/opencompany/blob/274f4d1c0ba7a2348b619b469dd3e284215715c2/docs/claude-code-subscription-usage.md)
describes custom inference traffic to obtain usage headers. The engineering
patterns are inspectable; that probe and credential-copy design do not prove
provider-approved native CLI hosting and must not be adopted without review.

The transferable pattern is a personal connection, an actual hosted harness,
bounded authentication and separately metered infrastructure. No examined
public source establishes Minddy's permission to replicate another product's
provider-specific exception, persistent credential store or shared account.
