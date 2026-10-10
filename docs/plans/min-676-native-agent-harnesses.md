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

The first hosted pilot should use session-bound native authentication. The
current storage contract deliberately destroys sandbox files on stop. Reusing
an already authenticated live allocation is compatible with that contract;
keeping login across allocation destruction is a separate unresolved design.
Do not describe either a local-only prototype or an API-key-only adapter as
completion of this feature.

## Provider feasibility

| Route | Evidence and conclusion | Release condition |
| --- | --- | --- |
| Unmodified Claude Code with the user's Claude subscription | Anthropic explicitly describes hosted sandboxes running its published binary with individual user authentication. This is a viable documented route. | Minddy must comply with Anthropic's Commercial Terms and the hosted-product conditions. Validate direct CLI login and prevent Minddy from collecting or reusing native session tokens. |
| Native Codex app-server with the user's ChatGPT account | The CLI protocol supports account login, device codes, turns, streaming and interruption. This establishes technical capability, not a commercial hosting agreement. | Obtain confirmation covering Minddy's paid, multi-user hosted use, delegated/background work and credential lifecycle before enabling it in production. |
| Sign in with ChatGPT tokens supplied by Minddy | The public open-source flow covers local apps and self-hosted VMs; paid or remotely hosted apps are directed to a separate interest process. | Do not treat Minddy's open-source license as authorization for its hosted offering. A separate approved integration would need its own client registration and consent. |
| Ori wrapping Codex, Claude Code or OpenCode | Ori supplies OpenRouter credentials, models and organization settings to the chosen CLI. | Optional harness choice with OpenRouter billing, not native subscription consumption. |
| Other coding CLI subscriptions | This study does not establish support or hosting permission for every coding assistant. | Add each harness only after the same auth, protocol, isolation and terms review. |

Anthropic's [legal and compliance page](https://code.claude.com/docs/en/legal-and-compliance)
distinguishes running the original CLI from offering a third-party Claude login
or routing subscription credentials through another application. Its hosted
conditions require the published binary, preservation of its authentication
methods and usage billed directly to each end user. Its
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
| `sandbox.ts`, `drain.ts`, allocation/erasure helpers | Live allocations may be reused. Stopped allocations have empty filesystems; idle sandbox cleanup is five minutes. | A native login expires with its allocation unless an approved persistence design is introduced. Login waits need bounded cleanup and billing. |
| `encrypted-journal.ts`, `run-journal-codec.ts` | Conversation history is recovered through an encrypted OpenCode event journal. | A native thread/session ID alone cannot restore files in a fresh allocation. Each adapter needs validated, credential-free history export/import. |
| `network-policy.ts`, `vm/llm-proxy.ts` | API credentials are injected or relayed outside the untrusted tool environment; the proxy redacts model inputs. | Native OAuth files change the trust boundary. Direct provider traffic does not pass through the current redaction proxy. |
| `quota.ts`, `usage.ts`, `ai-usage.ts`, `vm-rest.ts` | AI key modes are `platform` and `byok`; sandbox usage is recorded separately. | Add a subscription inference mode without granting unlimited Minddy compute or disabling paid-tool limits. |

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

A Minddy route must check user, run owner, current allocation generation and
erasure fence before granting access. Session capabilities and OAuth callback
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
| Native connection | ID, owner, harness, allocation ID/generation, state, expiry | Server-owned metadata only. Never store native credential contents here. |
| Authentication state | `disconnected -> awaiting_auth -> ready -> expired/revoked` | CLI-observed transitions. A resumed empty allocation cannot inherit `ready`. |
| Worker state | queued/preparing/auth wait/running/needs input/terminal | Decide whether auth wait is a separate field or DB status during schema design; update drain and uniqueness rules together. |
| Native checkpoint | Engine/version, native session ID, durable journal cursor, branch, plans and delivery state | No credentials, terminal capabilities, callback codes or full home-directory archive. |
| Usage | Token counts when available, source, estimate flag, externally funded inference | Subscription quota is provider-controlled. Never claim a USD estimate measures remaining plan allowance. |

The runtime adapter needs `prepare`, `startTurn`, `steer`, `interrupt`,
`answerInput`, `exportHistory`, `restoreHistory` and `close` operations plus a
normalized event stream. Authentication is a separate native-session service;
it must finish before any model turn starts. Every failure still returns a
`VmTurnReport` through the existing terminal-report path.

The MCP bridge should reuse `agentToolsFor`, `startToolBridge`, project/run
admission and server-owned delivery operations. Preserve plan synchronization,
questions, web-search counters, validation, secrets scanning, DCO commits,
Git refresh and verified PR creation. Each engine translates its native tool
names into the event names used by `delegation.ts:buildAgentDelegationResult`.
Otherwise Numo cannot verify the worker's claimed tests or artifacts.

## Credential lifetime, concurrency and isolation

For the pilot, the CLI writes its own credentials only inside the private live
allocation, outside the repository. No auth directory is uploaded to Supabase,
included in the encrypted conversation journal or captured in a snapshot.
On stop or expiry, destroy the allocation and mark its connection expired.
Reconnection happens in Minddy's hosted interface, never on the user's machine.
Cancel abandoned logins after a documented timeout. Bill the bounded allocation
time while waiting, and show that cost before starting login.

This means the current five-minute idle reaper may require another native login
on the next message. It is an explicit UX cost, not a resolved seamless-account
connection. Before the full feature is called complete, decide whether that
session-bound experience is acceptable or approve a durable native profile
design with the providers and Minddy's retention owner.

[Vercel Drives](https://vercel.com/changelog/drives-for-vercel-sandbox-are-now-in-public-beta)
now offer persistence across allocations, with one read-write mount at a time.
A Drive is technically relevant but does not establish permission to persist
native credentials or satisfy Minddy's ephemeral-storage policy. Do not mount a
plaintext profile Drive, copy refresh tokens into `user_ai_keys`, or duplicate
one credential profile across concurrent workers. Durable profiles would need
provider-approved storage, encryption/key ownership, refresh serialization,
regional binding, revocation and verifiable deletion including retained copies.
That is a gated extension, not a hidden requirement fulfilled by a storage SDK.

Never pool different users' subscriptions. Concurrent runs must either have
independently authenticated private allocations or wait for their owner's
exclusive session lease. Project members may review work without obtaining the
author's inference identity. Scheduled jobs cannot request a human login
silently: if no eligible live session exists, leave work awaiting its owner,
with bounded compute and a clear recovery action. Do not fall back to paid API
usage. An unattended run that cannot finish before session expiry reports the
failure and retained branch, rather than repeatedly allocating new VMs.

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

- [ ] **Provider gates and hosted pilot:** record Minddy's Anthropic hosted-use
  compliance and OpenAI's answer for the exact paid native-CLI flow in a factual
  validation record. Use consenting test accounts in an isolated hosted Vercel
  allocation to prove native login, one inference turn and logout. Test the
  credential isolation boundary before designing durable profiles.
- [ ] **Schema and admission:** add a new `supabase/migrations/` migration and
  matching SQL tests for engine/funding constraints, account-owned connection
  metadata, RLS, allocation generation, login/session leases and erasure fences.
  Extend the guarded run-creation/reservation RPCs; preserve old rows and prevent
  auth waits from bypassing active-worker or compute limits.
- [ ] **Shared contracts:** extend `lib/agent-engines.ts`, `runs.ts:createRun`,
  `harness-layout.ts` and `vm/protocol.ts:parseVmJob`. Add a discriminated native
  job/checkpoint and bump `VM_PROTOCOL_VERSION`. Extend bundle manifest and
  version diagnostics in `harness-bundle.ts` and `scripts/build-agent-vm.mjs`.
- [ ] **Common supervisor services:** extract lifecycle, tool counters,
  heartbeat, delivery, redaction and normalized event handling from
  `vm/supervisor.ts:runOpencodeTurn` into a shared runtime service. Define
  `vm/harness-adapter.ts`; preserve existing OpenCode behavior and regression
  coverage before wiring another live engine.
- [ ] **Native runtimes:** add `vm/codex-client.ts`, `vm/codex-adapter.ts`,
  `vm/claude-code-adapter.ts` and `vm/native-cli-install.ts` with pinned published
  versions, install integrity, child-registry cleanup and strict config. Wire
  engine dispatch in `vm/main.ts`; implement events, input answers, steering,
  interruption and terminal reports with real pinned-CLI fixtures.
- [ ] **Minddy tools:** add `vm/mcp-tool-bridge.ts` around `agentToolsFor` and
  `startToolBridge`; share guarded tools with `vm/opencode-tools.ts`. Adapt
  `prompt.ts`, `opencode-anchor.ts` and `delegation.ts` to native tool names
  while preserving authorization, plan state, tests and PR artifact validation.
- [ ] **Native session service:** add `native-agent-sessions.ts` and
  `vm/native-auth.ts`; integrate `sandbox.ts`, `sandbox-allocation.ts`,
  `sandbox-erasure.ts`, `drain.ts` and `prune.ts`. Implement owner-bound auth
  wait, cancellation, expiry, session leasing and account/project/run erasure.
  No credential collection or profile snapshots; durable reconnect is a
  separately gated design if the session-bound pilot is insufficient.
- [ ] **Hosted authentication surface:** add run-owned auth endpoints under
  `app/api/agent-runs/[runId]/auth/` and a private login view in
  `components/agents/native-agent-auth.tsx`. Integrate the sandbox PTY/device
  flow without persisted terminal contents. Validate capabilities, origin,
  expiry, generation and disconnect; disable session replay/analytics here.
- [ ] **Settings and launch:** extend
  `app/api/account/agent-preferences/route.ts`, `lib/agent-api.ts`,
  `lib/use-agent-preferences-query.ts`, `components/settings/account-ai-keys-section.tsx`,
  `lib/server/agent/model.ts`, `launch.ts:launchAgentRun` and `execute.ts` for
  engine-bound settings and ready native sessions. Keep all launch triggers,
  including Numo, PR actions and routines, on this single resolution path.
- [ ] **Recovery and usage:** implement a versioned native history codec in
  `run-journal-codec.ts`/`encrypted-journal.ts` with engine-specific restoration;
  extend `control-plane.ts`, `vm-rest.ts`, `quota.ts`, `run-key.ts`,
  `lib/server/usage.ts` and `lib/server/ai-usage.ts` for separately funded
  inference, bounded hosted compute, paid tools and idempotent accounting.
  Update network policy and the self-hosted runner's compatibility without
  making self-hosting the only supported deployment.
- [ ] **Complete documentation and verification:** update the affected
  public guides, six locale message catalogs and factual review evidence;
  run adapter/launch/control-plane/quota/journal/isolation/erasure tests,
  relevant lint/typecheck, `check:documentation`, `check:knowledge`,
  `check:owned-english`, `git diff --check` and hosted acceptance below.
  Require `check:documentation:release` before production publication. Create
  or update the DCO-signed implementation PR with `npm run work:pr`.

## Release acceptance and open decisions

| Scenario | Required observed result |
| --- | --- |
| Hosted browser user connects a personal subscription | Native CLI completes its own login in a Minddy allocation; no API key or local agent installation is required. |
| Worker is delegated by Numo | Uses the frozen native harness and owner; tests, file changes and verified PR URL return through existing durable events. |
| Secret-bearing fixture, malicious instructions and package install | Native auth and other secrets are unreadable to tool execution and absent from model-visible results, journals, project events and logs. |
| User changes provider or session expires | No automatic API charges or account switching; owner gets a clear reconnect action. |
| Stop, tool approval, question and steering during a long command | Prompt response with no lost message, orphaned child, false completion or unrecoverable checkpoint cursor. |
| Allocation is stopped and recreated | Credentials are gone; branch and supported history recover honestly; ready auth is invalidated and owner reconnects. |
| Two users, two projects or concurrent workers | Cross-owner auth access fails; leases prevent shared refresh races; reviewers cannot run on another user's subscription. |
| Login abandoned, idle allocation, routine without active login | Bounded allocation time and explicit expiry; no runaway queue/reallocation or silent unattended API fallback. |
| Account/project erasure races with login/allocation | Fence blocks access, resources are retired and late capabilities cannot reopen a session. |
| Provider throttles or CLI/transport crashes | Preserve reviewable work, interrupt children, report failure and keep cost accounting idempotent. |
| Current OpenCode worker and historical run | Existing API/BYOK launch, recovery, redaction, delivery and billing remain correct. |

Unresolved before production: OpenAI's hosted-commercial scope; acceptable
reauthentication frequency; a provider-approved durable profile if required;
actual PTY behavior and logging; native credential/tool isolation on Vercel;
cold history restoration; quota/cancellation behavior on real subscriptions;
and semantics for routines whose personal connection is no longer live.
These are implementation gates, not negative findings proving the feature
impossible. No third-party provider was contacted and no personal account was
authenticated during this study.

## Documentation impact and evidence

This study changes only internal planning/validation documents. Published
behavior, UI controls, configuration and desktop version are unchanged, so
public article revisions, new illustrations and invented release review dates
would be inappropriate in this PR.

The implementation must update `numo` and `ai-settings-and-usage` in `en`, `fr`,
`de`, `es`, `it` and `pt-BR`, including actual control labels, billing,
authentication, expiry, routines and recovery. Identify affected workflow and
figure IDs from `coverage.json` during implementation rather than inventing
new IDs in this study. Record real hosted-procedure and language review evidence
before publishing those instructions.

See [the interface probe record](../validation/min-676-harness-interface-probes.md)
for exact pinned CLI commands, schema findings and the limits of this study's
verification. Competitor evidence is recorded below separately from Minddy's
own feasibility and acceptance requirements.

## How other hosted products implement this

Two research agents examined competitors using their official documentation
and public repositories on 2026-10-10. These are documented product behaviors
and code observations, not authenticated product tests or provider contracts.

| Product | Hosted subscription flow | Useful implementation precedent | What remains unknown or incompatible |
| --- | --- | --- | --- |
| Tembo | Personal Codex device-code login; Claude browser approval with returned code. Native Claude Code runs in its Linux session environments. | Account connections are distinct from session harnesses; inference funded by a subscription and VM compute are separated. | Hosted auth/storage source is not public. Some subscription paths also support OpenCode/Pi, so not every path can be described as native Codex execution. |
| Ona Cloud | Native Codex connected to a user's ChatGPT plan using device authorization. | A first-class cloud integration, personal/service-account ownership, separate compute and provider allowance. | No public evidence of auth encryption, refresh locking or immediate revocation of active sessions. Service-account capabilities do not establish permission to pool personal plans. |
| Boxes.dev | Native Codex/Claude on managed Linux devboxes; device code or browser approval plus code. | Explicit account-switch, sleep/reboot and disconnect behavior; API fallback is opt-in. | Retains machine state through sleep and warns that machine processes can read delivered credentials. This differs materially from Minddy's ephemeral and secret-isolation requirements. |
| CloudCLI Cloud | Hosted containers with a PTY-based native login interface. | Public PTY reconnect and provider-runtime code is available. | Its Claude conversation path uses Agent SDK; presence of OAuth support in source is not proof of subscription eligibility for a third-party service. |
| opencompany | Dedicated cloud Codex login sandbox and persistent hosted worker sandboxes. | Public per-user encrypted credential storage and refresh-lock implementation. | Copies native auth state; its custom Claude usage probe is not an acceptable template for a native-only subscription design. |

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
