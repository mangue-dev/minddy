# MIN-676: Native harness interface evidence

Date: 2026-10-10. Reviewer: Codex, acting as an agent reviewer.
Scope: read-only Minddy and pinned open-source repository inspection, official
documentation and unmodified public CLI help/schema generation. This is not a hosted authentication,
inference, security-isolation or erasure rehearsal.

Related design: [hosted native harness plan](../plans/min-676-native-agent-harnesses.md).
Repository baseline: `823b4b8765dffbb8e6fcbe4bdf59bdd182a7f63f`.
CLI inspection host: macOS with Node.js `v24.11.1`.

## Published versions inspected

Existing executables reported Codex `0.146.0` and Claude Code `2.1.251`.
To avoid treating those older installations as the current interface, subsequent
probes used exactly pinned public npm packages. No global installation, account
sign-in, credential-file inspection or model request was performed.

| Package | Pinned version | Registry integrity |
| --- | --- | --- |
| `@openai/codex` | `0.162.1` | `sha512-NWZdi/kxyjv/8EUGFupziGU38YyleugZRM4JXgY5XFH7FUmaFA33NZS2Bmq0HPazf7S3jJQQWsZ/jAK9jsrV3Q==` |
| `@anthropic-ai/claude-code` | `2.1.296` | `sha512-OX/k/rpcthMqnFKOWcpNcbiLsMKtAjLOpQNJHlYiDCFUznWCIwdRTyl/p9SdHVrsrzZuPMCNqZjnpakIni6upw==` |

Registry metadata lists Codex Linux x64/arm64 distributions and Claude Code's
Node.js requirement of `>=22.0.0`. Minddy selects `node24` in
`lib/server/agent/repo-host.ts`. This is a compatibility indication only;
neither binary was executed inside a Vercel allocation during this study.

## Reproduce the non-authenticated interface checks

```sh
npm view @openai/codex@0.162.1 engines optionalDependencies dist.integrity --json
npm view @anthropic-ai/claude-code@2.1.296 engines dist.integrity --json
npm exec --yes --package=@openai/codex@0.162.1 -- codex --version
npm exec --yes --package=@openai/codex@0.162.1 -- codex login --help
npm exec --yes --package=@anthropic-ai/claude-code@2.1.296 -- claude --version
npm exec --yes --package=@anthropic-ai/claude-code@2.1.296 -- claude auth login --help
npm exec --yes --package=@anthropic-ai/claude-code@2.1.296 -- claude --help
npm exec --yes --package=@anthropic-ai/claude-code@2.1.296 -- claude setup-token --help
npm exec --yes --package=@openai/codex@0.162.1 -- codex mcp --help
npm exec --yes --package=@anthropic-ai/claude-code@2.1.296 -- claude mcp --help
MIN676_PROBE_DIR=$(mktemp -d /tmp/minddy-min676-probe.XXXXXX)
npm exec --yes --package=@openai/codex@0.162.1 -- codex app-server generate-json-schema --out "$MIN676_PROBE_DIR/codex-schema"
```

The executed checks exited successfully. Generated schemas were held outside
the repository. They are reproducible public artifacts, not account state;
the full generated tree is intentionally not committed.

## Codex schema findings

Generation produced 317 JSON files. The observed schema-tree SHA-256 is
`d56de014b2f9312defddbec6915371e2f995fa17b25b5389e5137a5ebb734fd9`.
For reproducibility, sort all `.json` files by their relative POSIX path, then
hash each UTF-8 relative path, a NUL byte, the raw file bytes and another NUL byte
in that order. This fingerprint describes the generated tree, not the binary.

| Schema | Observed interface | Implication |
| --- | --- | --- |
| `ClientRequest.json` | `account/login/start`, `account/login/cancel`, `account/logout`, `account/read` | A supervisor can drive native login without implementing its own token exchange. |
| `ClientRequest.json:LoginAccountParams` | `chatgpt` and `chatgptDeviceCode` variants | Device login is represented in the pinned protocol, not just a documentation example. |
| `ClientRequest.json:LoginAccountParams` | `chatgptAuthTokens` described as unstable and internal-only | Exclude external native-token injection from the proposed Minddy implementation. |
| `ClientRequest.json` | `model/list`, `thread/start`, `thread/resume`, `turn/start`, `turn/steer`, `turn/interrupt` | Native orchestration has the required lifecycle operations; their behavior still needs live tests. |
| `ServerRequest.json` | `item/tool/requestUserInput` | User questions require a response bridge, not text-only stream rendering. |
| `v2/ThreadResumeParams.json` | `threadId` and configuration overrides; no `history` field | Do not promise cold reconstruction through arbitrary history injection. |

CLI login help also exposes `--device-auth`. No device code was requested and
no app-server was started against an existing personal account. The public
[app-server documentation](https://learn.chatgpt.com/docs/app-server) supplies
the protocol behavior; this probe establishes only schema/flag availability.

## Claude CLI findings

Pinned help identifies `claude auth login --claudeai` as the subscription login
route and `--console` as a different billing route. It advertises stream JSON
input/output, partial messages, resume, tool selection, permission handling,
explicit settings and strict MCP configuration.

The important negative finding is **bare mode does not read OAuth credentials**.
`--bare` uses API authentication or supported third-party credentials instead.
The [headless guide](https://code.claude.com/docs/en/headless) confirms this.
Thus a generic recommendation to use bare mode for unattended execution would
break MIN-676's central requirement.

`--safe-mode` preserves authentication but disables customizations, including
MCP/hooks, so it does not by itself prove the proposed guarded Minddy tool
configuration works. `--restricted`, `--setting-sources`, `--settings`,
`--tools` and `--strict-mcp-config` are candidate controls to validate together.
No permission bypass was enabled and no prompt was sent to a model.

The [authentication guide](https://code.claude.com/docs/en/authentication)
documents remote browser-code entry. Whether the published CLI works with a
bounded owner-only browser PTY on Minddy's actual Vercel environment remains a
hosted-pilot acceptance test.

## Sandbox and database inspection

The installed `@vercel/sandbox@3.5.0` declarations expose
`Session.openInteractive()` returning a WebSocket URL and token. Unlike
`Sandbox.openInteractive()`, the session operation is documented without
automatically resuming the sandbox. No transport was opened during inspection.
The declaration does not claim a login-command-only capability.

`sandbox.ts` uses `persistent: false`, and `drain.ts` sets the idle reap threshold
to five minutes. The historical DB baseline constrains `agent_engine` to
`loop`/`opencode` and `key_mode` to `platform`/`byok`; those are not native
subscription contracts. `launchAgentRun` rejects local execution and resolves
account worker settings. `vm/main.ts` dispatches OpenCode only.

`recordSandboxUsage` in `lib/server/usage.ts` records server-priced compute
separately from inference. Native subscription implementation must preserve
that separation and include authentication wait time rather than equating
external inference with free hosted compute.

## Verification limits and follow-up

Passed interface checks establish installable public packages, compatible
declared platform targets and inspectable orchestration primitives. They do
not establish personal subscription entitlement, commercial hosting permission,
Linux runtime behavior, native MCP/hook isolation, cold restore, end-to-end
login, token refresh or provider revocation.

The hosted pilot must execute the acceptance matrix in the design using
consenting test accounts and actual Minddy allocations. Store sanitized evidence
of outcomes, exact versions and allocation profile; never retain callback
codes, tokens, login transcripts or production account data as proof.

Repository checks for this documentation-only delivery are recorded in the PR.
No runtime or public-manual behavior is changed by these two internal documents.

## Durable account connection refinement

The owner's follow-up makes persistent account authentication mandatory, with
Codex and Claude Code as the initial native engines. An already authenticated
live allocation does not demonstrate acceptance. Setup must work in account AI
settings without an issue, project, run or locally installed agent.

Three additional pinned help commands above exited successfully. Claude's
`setup-token --help` confirms a long-lived subscription-token command; the
MCP commands confirm server-management interfaces in both binaries. These
checks requested help only: no token was generated, MCP server configured,
credential file opened or account authenticated. Token lifetime and restoration
behavior below are documentary evidence, not results from these help probes.

| Primary source reviewed on 2026-10-10 | Established scope | Remaining validation |
| --- | --- | --- |
| [Codex CI authentication](https://learn.chatgpt.com/docs/auth/ci-cd-auth) | Private trusted runners restore native auth and save refreshed state; serialize use. The guide excludes public/open-source repositories. | Exact public multi-user custody scope, encrypted write-back, lease/crash behavior and cold hosted execution. |
| [Claude authentication](https://code.claude.com/docs/en/authentication), [GitHub Actions](https://code.claude.com/docs/en/github-actions) | Native cached credentials and subscription CI tokens provide technical repeated-run mechanisms. | The hosted native permission does not resolve [third-party token-storage restrictions](https://code.claude.com/docs/en/legal-and-compliance) for a Minddy account vault. |
| [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli), [Claude MCP](https://code.claude.com/docs/en/mcp) | Both native clients support configured MCP servers. | Actual admitted Minddy tools, strict configuration, startup errors, mutation acknowledgement and Numo mediation. |
| [Linear coding sessions](https://linear.app/docs/coding-sessions), [AI credits](https://linear.app/docs/ai-credits), [Codex in Linear](https://learn.chatgpt.com/docs/third-party/linear) | Integrated Linear coding sessions use workspace credits; the separate ChatGPT-account integration starts provider cloud chats. | No inspected source discloses native personal credential storage in Linear-hosted ephemeral workers. |

The encryption inspection found user-scoped `EncryptedStore` primitives in
`lib/server/encryption/store.ts` and ownership-aware API-key access in
`lib/server/user-ai-key-content.ts`. This is reusable infrastructure, not an
implemented native vault. Its legacy/feature-flag fallback must not become an
unencrypted path for new subscription credentials. New entities require their
own guarded access, encryption policy, inventory and recovery/deletion tests.

Before public enablement of either native engine, record sanitized evidence for:

- One native account login, destruction of its setup sandbox, and two later
  cold allocations that use the same personal subscription without browser
  reauthentication or a warm VM.
- A real native renewal followed by versioned encrypted write-back and cold
  restore of the updated credential; concurrent/late writers and crash windows
  cannot restore an old seed or revive a disconnected connection.
- Complete cleanup of runtime plaintext while the authorized encrypted account
  profile survives; disconnect and account deletion fence active allocations
  and saved-state recovery, including restored backups.
- Every Numo launch mode resolving the selected account harness, and verified
  MCP operations or acknowledged Numo mediation of unsupported capabilities.
- Exception-only reconnect for unusable provider access, honest provider quota
  errors, separate Minddy compute/Numo charges and no automatic API fallback.

None of these live outcomes was exercised in this refinement. Provider custody
authorization, secret-free transport and OS isolation are release gates; a
documented capability or another product's implementation is not a passed test.

## Open-source implementation evidence

Read-only inspections on 2026-10-10 used immutable source revisions. No project
was installed or run against an account, and no hosted inference or credentials
were accessed. Repository license evidence concerns code reuse only.

| Repository and revision | Concrete evidence inspected | What it does not verify |
| --- | --- | --- |
| [T3 Code](https://github.com/pingdotgg/t3code/tree/a11f464133291122e0f6381b35e1b245d0aa9c73), `a11f464133291122e0f6381b35e1b245d0aa9c73`, MIT | `CodexChatGptAuth.ts`, `CodexChatGptSessionLock.ts`, `CodexManagedRuntime.ts`, `CodexChatGptHandoff.ts`, `ServerSecretStore.ts`, `CodexAdapterV2.ts`, `ClaudeAdapterV2.ts` and provider/remote guides. Managed Codex token sharing differs from native login; both adapters inject HTTP MCP. | The default file store is not encrypted. Remote machine persistence is not disposable SaaS recovery. No exact Minddy custody permission. |
| [opencompany](https://github.com/useopencompany/opencompany/tree/274f4d1c0ba7a2348b619b469dd3e284215715c2), `274f4d1c0ba7a2348b619b469dd3e284215715c2`, MIT | Native device login in a bounded E2B allocation, owner-bound encrypted auth, `codex-chat.ts` restore and `codex.ts:persistRefreshedCodexAuth` compare-and-swap write-back; Claude ACP/SDK transport and attempt-scoped MCP tests. | Refresh locks in custom inference code do not serialize native CLI turns. Retained worker sandboxes do not prove cold history restore. Source does not grant provider permission. |
| [project-sandbox](https://github.com/pkrusche/project-sandbox/tree/796590c9b9f8bfa48ffc177d2e9f11b6629d3959), `796590c9b9f8bfa48ffc177d2e9f11b6629d3959`, MIT | `oauth_refresh.py` native status commands under a host lock and security documentation of selected credential staging. | It explicitly warns that container-only renewal can be discarded. Status command success is not proof of refresh; auth outside checkout remains readable to container processes. |
| [Coral Centaur](https://github.com/Coral-Protocol/coral_centaur/tree/b5be00c1cd54574d9483232ad0e08f6b9a31c139), `b5be00c1cd54574d9483232ad0e08f6b9a31c139`, Apache-2.0/MIT | `claude-app-wrapper.py` native stream transport, `proxy_config.py` placeholder/proxy configuration and production token-broker instructions. | Shared vault, dedicated account and broker-owned OAuth renewal do not match Minddy's native per-user design and are not permission evidence. |

The source comparisons narrow the first live experiment: reproduce the native
Codex restore/write-back pattern with mandatory account encryption, add a lease
covering the entire native process lifetime, and prove actual rotated-state
recovery after destruction. Use a private fixture repository rather than
claiming the Codex CI guide authorizes public repository automation. For Claude,
retain the published CLI's login and authentication methods; test native profile
persistence without representing it as an approved public SaaS custody model.

The [2026-10-07 Claude SDK subscription update](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)
is billing evidence, not a waiver of credential restrictions. Published native
hosting conditions and customer CI token persistence justify advancing a
private prototype; provider outreach is not a universal prerequisite to
adapter development. Before public enablement, record the exact remaining
custody conclusion separately from successful tests. The full source links,
provider conditions and prototype sequence are in the related design.

Repository verification for this refinement: `check:documentation`,
`check:knowledge`, `check:owned-english`, relative documentation links and
`git diff --check` passed. Only the two internal study/evidence documents changed;
public manuals and runtime source remain untouched.

## Private prototype implementation and hosted probes (2026-10-10)

The subsequent implementation adds private account connection routes/settings,
mandatory encrypted native profiles and runtime cleanup descriptors, exclusive
fenced leases, published native controllers and a fixed two-allocation MCP pilot.
See [activation and pilot instructions](min-676-private-native-prototype.md).
The ordinary Numo worker remains unchanged and public enablement is still gated.

Actual authless hosted probes used fresh Vercel `node24`, `iad1`, 2-vCPU,
nonpersistent allocations, with no native personal profile, login or model turn:

| Probe | Actual result | Boundary |
| --- | --- | --- |
| Codex 0.162.1 published installation and controller bootstrap | Passed after correcting Linux capabilities and runtime paths. | npm success alone was insufficient; early native exits failed closed and those allocations were deleted. |
| Native Codex kernel isolation, completed before 16:28:07 UTC | Passed twice. Native exit 0 only after denied reads of synthetic profile bytes, controller source, transport directory and controller `/proc` environment, file descriptor and memory surfaces. Allocation stopped and deleted. | No paid inference or live profile restored. Same native permission profile is required before a fixture turn. |
| Claude Code 2.1.296, 16:29:40–16:29:54 UTC | Published binary `--version` exited 0; controller started; native account status returned unauthenticated; allocation stopped and deleted. | No Claude login, paid subscription or model turn. |

Codex's Linux subprocesses clear bounding, inheritable and ambient capabilities
and set no-new-privileges before native sandbox helpers start. Vercel's inherited
capabilities otherwise caused bubblewrap to reject startup. Published CLI code
lives outside the denied private controller/auth root; Node's actual runtime
directory is explicitly added to the child's allowlisted PATH. `/proc` and
`/sys` are denied, in addition to the native private PID namespace. Native MCP
and controller bearer tokens are separate, so the model's MCP connection cannot
export a profile or operate the controller.

Claude's published main npm launcher is a placeholder replaced by postinstall.
With lifecycle scripts disabled, bootstrap explicitly links the already
installed, version-pinned optional Linux platform binary. This deterministic
packaging correction was verified on the actual hosted allocation.

For the owner pilot, an isolated Docker Supabase project uses API port 55321 and
PostgreSQL port 55322. All 244 migrations applied and native SQL regressions
passed against actual PostgreSQL. The account and project are fictional local
fixtures; no remote Minddy data is copied. Existing Docker volumes and the
repository's `.env.local` are preserved. The connected remote database has not
received the native migration; the only migration command against it was a
dry run, before the user selected the local Docker database.

At this stage, live provider approval, encrypted real-token persistence and the
two fresh authenticated allocations remain pending the owner's Codex sign-in.
Do not interpret the successful authless kernel probe or synthetic renewal
tests as those acceptance results. Live Claude remains unverified because no
eligible paid account has been supplied.

Repository checks for this private implementation passed: 73 focused Vitest
tests, actual local PostgreSQL native SQL regressions, full application build,
typecheck, lint, native VM bundle build, encrypted-column/schema inventories,
documentation, knowledge, owned-English and whitespace checks. Public impact is
limited to the six `ai-settings-and-usage` guides and their revision-8 review;
full Numo engine selection and public native rollout remain pending.
