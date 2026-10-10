# MIN-676: Native harness interface evidence

Date: 2026-10-10. Reviewer: Codex, acting as an agent reviewer.
Scope: read-only repository inspection, official documentation and unmodified
public CLI help/schema generation. This is not a hosted authentication,
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
