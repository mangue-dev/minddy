# Minddy's agent code harness, compared to Codex and OpenCode

> **Date** : 2026-07-27 · **Ticket** : MIN-101
>
> **Bases compared, with pinned commit** (the three move quickly; any assertion
> below is true *to these commits*, and should be reread before reserving
> in six months):
>
> | Basic | Deposit | Commit |
> | --- | --- | --- |
> | minddy | this deposit | `58558ce29e9d0a6612ae48b8e0c8e989a8f10e5d` |
> | Codex | `openai/codex` | `294d813263de08061cb303e7b601d7ea6a5e72e8` |
> | OpenCode | `anomalyco/opencode` (branche `dev`) | `40e4d730cac33cc9e76659ae7acb16b3a6132b83` |
>
> **Method.** Three passes: (1) factual inventory of Minddy written first,
> file by file; (2) targeted reading of the two references on the files which
> make harness decisions; (3) comparison with production data
> (`agent_run_events`, last 60 days). Each statement cites an actual file.
>
> **What was not done, and why.** The plan called for two probes in one
> actual agent session. They have been replaced by stronger evidence and
> free: (1) the absence of shell state is *in the code* — `runShell` starts again
> a new `sh -c` on each call — and corroborated by 29 production orders
> which prefix a `cd`; (2) the behavior on long output was established by
> a **deterministic probe** replaying the real truncation chain (§3.6), more
> reproducible than a single run and without spending LLM or sandbox credits.
>
> **Prioritization framework.** Minddy's differentiator is sobriety. Each
> deviation passes three filters: (a) is it *measured* or only *observed*? (b) that
> does it cost in product area? (c) an agent who works on a minddy ticket in
> does it need, or is it a CLI feature? **A real gap that we decide not to
> filling is a valid conclusion** — the “Not retained, and why” section
> counts seven.

---

## 1. Our harness today

### 1.1 Tools exposed to the model

[lib/server/agent/tools.ts](../lib/server/agent/tools.ts) defines **13 core tools,
common to both anchors:

| Family | Tools |
| --- | --- |
| Exploration | `read_file` (windowed, numbered), `list_dir`, `glob`, `grep` |
| Edition | `edit_file`, `apply_edits` (multi-file batch), `write_file`, `move_file`, `delete_file` |
| Verification | `run_command` |
| Excluding deposit | `web_search` (OpenRouter runs only, see `agentToolsFor`) |
| Control | `update_plan`, `ask_user` |

plus **10 Minddy tools**, served to BOTH anchors since MIN-125:

| Family | Tools |
| --- | --- |
| Project tickets | `search_issues`, `read_issue`, `read_attachment`, `update_issue`, `write_issue_plan`, `create_issue` |
| Launcher scratchpad | `read_scratchpad`, `add_scratchpad_tasks`, `update_scratchpad_task`, `set_scratchpad` |

plus `create_pr`, the only one whose formulation still depends on the anchoring. Either
**25 tools maximum** in a session.

The anchor (MIN-84) only decides one thing on the tools side: the **target by
default** of the three tools which take a `issue` (`read_issue`, `update_issue`,
`write_issue_plan`) — the run ticket when there is one, otherwise `issue` is
mandatory and resolves with `search_issues`. `agentToolsFor` says it in the
description of these three tools, as it already patches that of `read_attachment`
according to the multimodality of the model.

**No tool changes a ticket status**: `update_issue` neither exposes `status`
nor `priority` and explicitly rejects the argument if the model hallucinates it. THE
only status entries on the agent side remain those of the harness
([issue-status-sync.ts](../lib/server/agent/issue-status-sync.ts) : `in_progress`
at launch, then the PR cycle). Likewise, `create_issue` does not expose
status: the created ticket lands on the LAUNCHER account setting
(`user_metadata.numo_default_status`), announced in the run context message
— never in the system prompt, which must remain identical from user to user
the other for prompt caching.

Constants governing their behavior:

- `RUN_COMMAND_TIMEOUT_MS = 180_000` ([tools.ts:45](../lib/server/agent/tools.ts#L45)) —
hard timeout, **not configurable by the model**, and no `workdir` either:
the signature of `run_command` is `{ command: string }`, nothing else.
- `CONTROL_TOOLS = new Set(["update_plan", "ask_user"])`: processed by the loop,
never sent to the Sandbox.
- **No end of turn tool.** The turn ends when the model responds
text without tool-call (natural ending). A shim still responds to old people
  checkpoints that call `finish`
  ([agent-loop.ts:888](../lib/server/agent/agent-loop.ts#L888)).

### 1.2 Prompt system

[lib/server/agent/prompt.ts](../lib/server/agent/prompt.ts) —
`buildAgentSystemPrompt({ locale, anchor, webSearch })`. Deliberately **stable**
(it only depends on the language, the anchor and the presence of `web_search`) for
that the prefix is ​​actually shared by the prompt caching
([caching.ts](../lib/server/agent/caching.ts)). Sections: conversational intro,
Tools, anchoring (The ticket / The notebook), Git and pull requests, “How to work when the
user asks for code changes” (5 steps: Explore → Edit → Verify → Self-review →
Reply), Asking, Rules.

Around it, three `user` bootstrap messages, in this order
([execute.ts:666-724](../lib/server/agent/execute.ts#L666-L724)) :

1. `buildAgentContextMessage` — deposit + ticket (description, plan, attachments
advertised by name/size/id). Explicitly presented as a **snapshot**.
2. If applicable, `buildInheritedPrMessage` / `buildInheritedBranchMessage` —
the start of a cold session which inherits from an already advanced branch (MIN-68):
summary of the previous session, PR body, review thread, and especially the
**threads anchored to a line of code** (`toPrLineThreads`, with `diff_hunk`
truncated from above to 8 lines — the tail bears the commented line).
3. `readRepoInstructions` — `AGENTS.md` then `CLAUDE.md`, **at the root of the clone
   only**, capped at `REPO_INSTRUCTIONS_MAX_BYTES = 32_000`
([execute.ts:346-372](../lib/server/agent/execute.ts#L346-L372)), packaged in
   `<REPO_INSTRUCTIONS>`.

Then the launcher's request as the last message.

### 1.3 Sandbox

[lib/server/agent/sandbox.ts](../lib/server/agent/sandbox.ts) — a Vercel microVM
Sandbox per run, named `agent-<run.id>`:

- runtime `node24`, `persistent: true`, `resume: true`,
`SANDBOX_TIMEOUT_MS = 24 h` (the cap of the Pro plan; the inactivity reaper cuts
well before), `SANDBOX_SNAPSHOT_EXPIRATION_MS = 7 days` + `keepLastSnapshots: 1`.
A resumed run wakes up its VM with its filesystem restored; after the expiration of
snapshot, we re-clone (git is the durable net).
- `REPO_DIR = /vercel/sandbox/repo`, clone `--depth 1` on the base branch then
switches to the working branch (`cloneRepo`).
- `runShell(sandbox, command, { cwd = REPO_DIR, timeoutMs, signal, env })` :
****CODE_0__ in a new process on each call**. No session, no state,
no substantive process.
- Read limits: `READ_MAX_LINES = 2000`, `READ_MAX_LINE_CHARS = 2000`,
  `READ_MAX_BYTES = 250_000`, `GLOB_MAX_FILES = 100`.
- `grepRepo` = `git grep --no-color -I -E --untracked` (regex **POSIX extended**),
`globRepo` = `git ls-files --cached --others --exclude-standard`: both
gitignore-aware, with no dependencies to install.
- Path security: `resolveWithin` (rejects any output from `REPO_DIR`) and
`assertNotGit` (refuses writes to `.git/` — hooks, config)
([repo-path.ts](../lib/server/agent/repo-path.ts)). It's the
defense in depth: microVM remains the real frontier.

### 1.4 Agent loop

[lib/server/agent/agent-loop.ts](../lib/server/agent/agent-loop.ts) —
`runAgentLoop` :

- `MAX_ROUNDS_PER_CHUNK = 60`, suspends at the **top** of each round if the
soft-deadline of the chunk is exceeded (safe boundary: no in-flight calls).
- `READ_ONLY_TOOLS` = `read_file, list_dir, glob, grep, search_issues, read_issue,
read_attachment, read_scratchpad` → if **all** tool-calls in a round are
read-only, they are executed in parallel (`Promise.all`), results pushed back
in the original order.
- `pullSteering()` drains pending user messages at the top of each
round → hot orientation, and recovery of a `ask_user`.
- `emitLive` republishes the text currently being written ~4×/s (`LIVE_FLUSH_MS = 250`).
- LLM retakes: `MAX_STREAM_ATTEMPTS = 4`, exponential backoff capped at
`MAX_RETRY_WAIT_MS = 30_000`, `Retry-After` honored, inactivity timeout
`STREAM_IDLE_TIMEOUT_MS = 60_000` reset at each SSE byte
([retry.ts](../lib/server/agent/retry.ts)). Exhaustion of a recoverable error →
**suspend** (resume on fresh function), not failure.
- 400 “context too long” → `dropOldestRound` up to `MAX_CONTEXT_TRIMS = 4`,
then same call retried.

### 1.5 Context

- **Pruning** ([prune.ts](../lib/server/agent/prune.ts)): at each border of
round, `pruneToolOutputs` replaces the oldest tools output with
`PRUNE_STUB`, protecting the last `PRUNE_PROTECT_BYTES = 40_000` bytes, and
only if we recover at least `PRUNE_MINIMUM_BYTES = 20_000`.
- **Truncation by result**: each `role:"tool"` message goes through
`headTail(JSON.stringify(result), 6000)` — start + end kept, middle elided.
- **Compaction** ([compact.ts](../lib/server/agent/compact.ts)): beyond
`min(window × 0.75, AGENT_COMPACT_ABSOLUTE_MAX_TOKENS = 120_000)` — or
`AGENT_COMPACT_TOKEN_THRESHOLD = 70_000` when the window is unknown —, a
LLM sub-call summarizes the outdated environment
(`SUMMARIZE_INSTRUCTION`, 5 points), preserving the seed prefix verbatim and
`AGENT_COMPACT_KEEP_RECENT_BYTES = 48_000` tail. Safe breaking point:
queue never starts on a `tool` message. Capped at
`MAX_COMPACTIONS_PER_WINDOW = 3` per window of `MAX_ROUNDS_PER_CHUNK` rounds
(MIN-259), never launched if there are less than
  `AGENT_COMPACT_MIN_BUDGET_MS = 60_000`.
- Streamed reasoning is **displayed but never persisted** in `messages`.

### 1.6 Editing

[lib/server/agent/edit.ts](../lib/server/agent/edit.ts) — a cascade of **10
replacers**, from the strictest to the most tolerant: `Simple`, `LineTrimmed`,
`BlockAnchor` (anchors + Levenshtein similarity ≥ 0.65), `WhitespaceNormalized`,
`IndentationFlexible`, `UnicodeNormalized`, `EscapeNormalized`, `TrimmedBoundary`,
`ContextAware`, `MultiOccurrence`. Safeguards: `isDisproportionateMatch` (rejects a
span much larger than `oldString`) and `realignBoundary` (the border `\n`).
Failure is **loud** (throw), never a silent corruption. `applyEdit`
return content + unified diff + counters; `execute.ts` returns to the model a diff
capped at `EDIT_DIFF_CAP = 4000`.

### 1.7 Life cycle and persistence

[execute.ts](../lib/server/agent/execute.ts) — `executeAgentRun` executes **a
chunk** :

- Budget: `AGENT_SOFT_DEADLINE_MS = 250_000` minus `COMMIT_MARGIN_MS = 25_000`,
floor `MIN_SOFT_DEADLINE_MS = 20_000`. Hard timeout of a model call:
  `AGENT_RUN_TIMEOUT_MS = 210_000`.
- Per-turn runaway safeguards: `AGENT_MAX_CONTINUATIONS = 20`,
  `MAX_WALL_CLOCK_MS = 60 min`, `MAX_CHECKPOINT_BYTES = 8_000_000`.
- **The checkpoint IS the history** (`AgentCheckpoint.messages`, persisted in base) —
no separate `assistant_messages`.
- **The harness has git**: `commitAndPush` at the end of each turn and at each
suspend (WIP). `remoteUpdated` (has the remote advanced?) controls the reopening
of a PR refused (`reopenIfRejectedWorkPushed`). The creation of PR is a
decision (`create_pr`), not an automatism.
- `changedFiles(from, to)` produces the turn's `files_changed` event (cap
  `CHANGED_FILES_CAP = 100`).

### 1.8 What the prompt asks but the harness does not execute

This is the most interesting boundary — and it's exactly where both
references diverge the most from us.

| The prompt says… | The harness… |
| --- | --- |
| “Never run `git commit`, `git reset --hard`, `git checkout -- `, `git rebase`, `git push`, force-push, or `--amend`” | …executes the command as is. `run_command` never inspects what is passed to him. |
| “Verify. Run the project's linter / type-check / build / tests » | …does not execute anything on its own and does not know if it has been done. No signal, no event. |
| “Self-review. Run `git diff` and read your change end to end » | …don’t check that it happened. |
| “Read the file first so `old_string` matches” | …does not impose anything: `edit_file` on a never-read file passes if the cascade finds the block. |
| “Never print secrets or the git remote URL” | …does not filter any output. The `authUrl` carries an installation token. |
| “Stay within this repository” | …**that, if**: `resolveWithin` + `assertNotGit` are executed (but only on tools files, not on `run_command`). |

---

## 2. What our runs say

Query on `agent_run_events` (type `tool_result`), **last 60 days**:
1,123 tool results, 2,658 events, 15 runs. *Small sample —
Percentages are indicative, failure modes are not.*

| Tool | Calls | Chess | Rate |
| --- | ---: | ---: | ---: |
| `read_file` | 445 | 0 | 0,0 % |
| `grep` | 336 | 3 | 0,9 % |
| **`run_command`** | **224** | **30** | **13,4 %** |
| `glob` | 30 | 0 | 0,0 % |
| `list_dir` | 26 | 0 | 0,0 % |
| `edit_file` | 23 | 1 | 4,3 % |
| **`apply_edits`** | **19** | **8** | **42,1 %** |
| `read_issue` | 6 | 0 | 0,0 % |
| `create_pr` | 5 | 0 | 0,0 % |
| autres (`write_issue_plan`, `write_file`, carnet) | 15 | 0 | 0,0 % |

**The three real failure modes.**

1. **`run_command` fails on the environment, not on the code.** The most common errors
most frequent: `sh: line 1: tsc: command not found` (7×, two versions of
project) — the `npm run typecheck` leaves before the dependencies are
installed; `npm error code ERESOLVE` (3×) — the install itself fails;
7 failures at `exitCode: 1` with empty **stdout AND stderr** (see §3.6, the probe).

2. **`apply_edits`: 42% “failure” is a reporting artifact.** The tool
   returns `success: applied.every(r => r.ok === true)`: a batch of 6 files
1 of which fails is counted as a total failure. Of the 8 cases, the dominant cause
is `No changes to apply: oldString and newString are identical.` — the model
re-applies an edit already made. A case is a `Unknown tool: apply_edits`
(checkpoint prior to tool wiring).

3. **`grep` fails on POSIX ERE syntax.** All 3 failures are the same
thing: `fatal: -e option, 'onUpdateIssue={': Unmatched \{`. The model seeks
From the JSX literal, `git grep -E` reads `{` as a quantifier. Our tool
does not offer “string literal” mode.

**What the model does to bypass the harness** (220 `run_command` on all
the product's history):

| Pattern | Occurrences | What it says |
| --- | ---: | --- |
| `sed -n` / `nl -ba` (windowed reading) | 68 (31%) | The model rereads files **outside** of `read_file`. |
| `grep` / `rg` direct | 35 (16 %) | It bypasses our `grep` tool. |
| Prefix `cd …` | 29 (13%) | Including `cd /vercel/sandbox/repo && …` — the **default** cwd. The model doesn't know where it is, due to lack of `workdir` and persistent shell. |
| Pipe to `head`/`tail` | 23 (10%) | He blocks the exit himself because he has learned that the harness cuts it off. |
| `cat` | 12 | Same as `sed -n`. |
| `2>&1` | 12 | It fears losing `stderr`. |

**And two git commands explicitly prohibited by the prompt were executed**:
`git checkout -- components/app-shell-chrome.tsx` (2026-07-14) and
`cd /vercel/sandbox/repo && git checkout -- package-lock.json && git diff --stat`
(2026-07-15). The prompt says “never”; the harness obeyed the pattern. **It's a
deviation measured, not observed.**

---

## 3. Differences observed, axis by axis

### 3.1 Tools exposed to the model

| | minddy | Codex | OpenCode |
| --- | --- | --- | --- |
| Exploration | `read_file`, `list_dir`, `glob`, `grep` (git grep, POSIX ERE) | Via shell (`rg` recommended by the prompt) | `read`, `glob`, `grep` (**ripgrep**) |
| Edition | `edit_file` / `apply_edits` / `write_file` / `move_file` / `delete_file` (string replace) | `apply_patch` **freeform with Lark grammar** ([apply_patch.lark](https://github.com/openai/codex/blob/294d813/codex-rs/core/src/tools/handlers/apply_patch.lark)) — constrained decoding | `edit`+`write` **or** `apply_patch`, **chosen according to the model**: `gpt-*` (excluding `oss`/`gpt-4`) → `apply_patch` ([registry.ts](https://github.com/anomalyco/opencode/blob/40e4d73/packages/opencode/src/tool/registry.ts)) |
| Shell | `run_command { command }` | `exec_command` (PTY, `session_id`), `write_stdin`, `shell_command` | `shell { command, timeout, workdir }` |
| Web | `web_search` (OpenRouter only) | `web.run`, `tool_search` (BM25 on deferred tools) | `websearch`, `webfetch` |
| Delegation | — | `spawn_agent`, `send_input`, `send_message`, `followup_task`, `wait_agent`, `list_agents`, `resume_agent`, `close_agent`, `interrupt_agent` | `task` (subagents, with `task_id` to resume the same session) |
| Multimodal | `read_attachment` returns **the ticket image attachment** as an image part, when the run model accepts it (MIN-111) | `view_image` (“View a local image file … when visual inspection is needed”) | `read` returns images and PDF **as attachments** ([read.txt](https://github.com/anomalyco/opencode/blob/40e4d73/packages/opencode/src/tool/read.txt)) |
| Context introspection | — | `get_context_remaining` → `{ tokens_left }`; `new_context` (“Start a new context window”) | — |
| Code semantics | — | — | `lsp` (experimental): `goToDefinition`, `findReferences`, `hover`, `documentSymbol`, `workspaceSymbol`, `callHierarchy` |
| Invalid Call Repair | — | — | tool `invalid`: malformed args return to the model as an error message instead of breaking the round |
| Permissions | — | `request_permissions`: model **requests** more fs/network access during tour | `ctx.ask({ permission, patterns })` on each tool |
| Checklist | `update_plan` | `update_plan` | `todowrite` |
| Questions | `ask_user` (1–4, options, « (Recommended) », `multi_select`) | `request_user_input` (1–3, options `label`+`description`, « (Recommended) », `autoResolutionMs`) | `question` (options, « (Recommended) », `multiple`) |

> **Verdict — real and costly gap on three points**: (a) no visual input,
> while a model attached to a ticket is a *native minddy* use case;
> (b) the shell is the most used tool and the fewest in parameters;
> (c) `grep` in POSIX ERE breaks on JSX, measuredly.
> On `ask_user`: **no difference** — ours is at the level of `request_user_input`.
>
> *Revision of 2026-07-28*: the line “delegation is a CLI feature
> multi-windows" does not work. She describes the *form* she takes at Codex
> (nine tools, named agents, mailbox) without looking at what it allows. **Gap
> real, retained** in a form reduced to a single tool → MIN-112. On the
> permissions, on the other hand, the verdict stands: see §3.2.

### 3.2 Sandbox: isolation, filesystem, network

| | minddy | Codex | OpenCode |
| --- | --- | --- | --- |
| Insulation | microVM Vercel Sandbox per run, `node24`, `persistent: true` | `SandboxPolicy`: `ReadOnly` / `WorkspaceWrite` / `ExternalSandbox` / `DangerFullAccess` ([protocol.rs:995](https://github.com/openai/codex/blob/294d813/codex-rs/protocol/src/protocol.rs#L995)) | None — runs on the user's machine, protected by the permissions system |
| Writing scope | all `REPO_DIR` ; `resolveWithin` + `assertNotGit` on tool files | `WritableRoot` with `read_only_subpaths` — `.codex`, `.git`, **notably `.git/hooks`**, refused *even under a writable root* | permission by path pattern |
| Network | open (clone/push depends on it) | `network_access` explicit by policy; dedicated network approvals ([network_approval.rs](https://github.com/openai/codex/blob/294d813/codex-rs/core/src/tools/network_approval.rs), 1141 lines) | permission |
| Guardrail on orders | **none** — the prompt alone | `exec_policy.rs` (1,154 lines): Rules DSL, `is_safe_git_command` (only `git status`/`log`/`diff`/`show`/`branch` with read-only arguments are safe — **`git fetch` no**), `dangerous_command_match` (`ForcedRm`…), `BANNED_PREFIX_SUGGESTIONS` | `ctx.ask` before each `shell`, tree-sitter analysis of affected paths |
| Approvals | — | `with_cached_approval` + `ApprovedForSession` | `always`/`patterns` per permission |

> **Verdict — real difference, partially outside our product model.** Our
> isolation (disposable microVM, one per run) is *structurally stronger* than
> that of Codex locally and without common measure with OpenCode: we have nothing to
> protect with a `rm -rf`. But the total absence of safeguards **executed** on the
> git commands is a real *and measured* gap (§2): what the harness protects is not
> not the machine, it's **the user's work on the branch**. The system
> interactive approvals make no sense for us (the agent turns in the
> cloud, no one is looking) — this is the perfect counter-example of a CLI feature.

### 3.3 Feedback cycle: plan → implementation → verification

| | minddy | Codex | OpenCode |
| --- | --- | --- | --- |
| Session plan | `update_plan` + mirror to ticket map (`syncPlan`) | `update_plan` with **examples of good and bad plans** in the prompt ([default.md:72-121](https://github.com/openai/codex/blob/294d813/codex-rs/protocol/src/prompts/base_instructions/default.md)) | `todowrite`; `plan` **read-only** mode with plan file on disk, and `plan-enter`/`plan-exit` |
| Return after editing | unified diff (cap 4,000 char.) | nothing ("Do not waste tokens by re-reading files after `apply_patch`. The tool call will fail if it didn't work.") | diff **+ LSP diagnostics of the file reinjected**: `LSP errors detected in this file, please fix:` ([edit.ts:201](https://github.com/anomalyco/opencode/blob/40e4d73/packages/opencode/src/tool/edit.ts#L201), same as `write.ts`, `apply_patch.ts`) |
| Verification Doctrine | 5 prompt lines (“Verify”, “Self-review”) | an entire “Validating your work” section: start with the most specific test then expand, **do not add tests to a repository that does not have any**, formatting: 3 iterations max then we give up, proactive behavior **conditional on approval mode** | tool prompt `shell` |
| Mode Toggle | — | collaboration modes (`ModeKind`) which control the availability of tools | agents `plan` / `build`, with **synthetic reminders injected at the toggle** ([reminders.ts](https://github.com/anomalyco/opencode/blob/40e4d73/packages/opencode/src/session/reminders.ts)) |

> **Verdict — real and costly difference on one point: return after editing.**
> OpenCode closes the loop *in the tool itself*: you edit, you receive the
> typing errors. With us we need one more `run_command`, which the model does not
> not always done, and whose output is massacred (§3.6). The rest (modes,
> plan-read-only mode) is the ergonomics of CLI — and our mirror
> `update_plan` → ticket plan has no equivalent anywhere: **it's us who
> sommes devant**.

#### Cost of a type-check in the sandbox (measured on 2026-07-28, MIN-110)

R4 said “do not implement until you have this figure”. Here it is. Measures
made in a **real Vercel Sandbox microVM** (`node24`, 2 vCPU, 4.2 GB of
RAM — the exact parameters of `getOrCreateAgentSandbox`), on a fresh clone of the
minddy repository (~1,100 TS/TSX files), dependencies installed by
`pnpm install --frozen-lockfile` (21 s, once per microVM). Mac column
given for the scale: an M-series is ~2.4× faster, the difference is stable.

| Diet | microVM | Mac |
| --- | ---: | ---: |
| `tsc --noEmit`, **cold** (no `.tsbuildinfo`) | **22.6 sec** | 9.4 sec |
| `tsc --noEmit`, hot, no change | **4.9 sec** | 2.5s |
| `tsc --noEmit`, hot, after editing a sheet file | **10.7 sec** | 4.5s |
| `tsc --noEmit`, hot, after edition of `lib/types.ts` (104 importers) | **14.4 sec** | — |
| `tsc --watch`: start + initial check | 22.2 sec | — |
| `tsc --watch`: recheck after editing | 0.6 – 11.3 s | — |
| `tsc --watch`: resident memory **permanent** | **1.7 → 1.9 GB** of 4.2 | — |
| `tsc --noEmit <one file>` (outside `tsconfig.json`) | 0.5 – 0.9 s | 0.8 s |
| Sonde `test -f tsconfig.json && test -x node_modules/.bin/tsc` | 1 ms | — |

Forcing `--incremental --tsBuildInfoFile` **out of the repository** costs nothing (20.8 /
4.5 / 10.9 / 14.5 s) and keeps `git status` clean — this is the form retained, it
works even if the `tsconfig.json` of the repository does not activate `incremental`.

**How ​​many editions are there to cover?** On the entire product history:
44 successful edits over 15 runs, grouped into **30 bursts** of edits
consecutive (median 1, average 1.5, max 4). A run alone has 26.

**Verdict: path B — one check per ROUND, not per edition.** Three reasons, in
the order in which they weigh.

1. **The price.** A check costs 4.9 s at floor, ~11 s in normal mode, 14.4 s
when the affected file is a crossroads. By edition, the run has 26 editions
would pay 110 s (deduplicated per burst) to 290 s (raw) — i.e., in the second
case, **more than the entire soft-deadline of a chunk (250 s)**. By turn, the
same session pays 11 s. The ratio is 1 to 25.
2. **Correctness — the argument that would have sufficed alone.** A coherent change
is spread over several files (bursts of 1 to 4 editions, measured).
Type-checker *between* two halves of the same change reports errors that
the next edit erases: rename a prop, then rewire its three
callers, would make the harness shout three times for nothing. The cost is not only
wall time, it's a wasted LLM round and a model pushed to "repair"
a transient state. OpenCode gets away with it because its diagnostics are
**by file and snapshots** (already hot LSP server), and because a human
   reviews it. We have neither one.
3. **`tsc --watch` (route not planned in the plan) is a trap.** Its rechecks are
sometimes excellent (0.6 s) but it immobilizes **1.9 GB of the 4.2 GB of the
microVM**, the same one which must run `next build` and the tests; he
does not survive the shutdown of the microVM between two chunks (22 s restart at
each repeat); and nothing properly connects a recheck to the *edition that has it
triggered*. Discarded.

And the "single-file targeted verification" of the original plan is **wrong**,
not just fast: `tsc --noEmit <fichier>` ignores `tsconfig.json` —
measured on a perfectly healthy `.tsx` of the repository, **37 phantom errors** (JSX not
configured, alias `@/…` unresolved). A guy-check who lies is worse than no
type-check.

**Which is not guaranteed and we assume.** The check can only be turned if
`node_modules` exists — or §2 shows 7 `tsc: command not found`, the model launching
`npm run typecheck` before installing. The tool **silent** in this case: probe
1 ms, no attempt to install anything in its place. A harness that
would transform an uninstalled environment into a wall of errors would be worse than
silencieux.

### 3.4 Persistence between turns

| | minddy | Codex | OpenCode |
| --- | --- | --- | --- |
| History | `AgentCheckpoint.messages` in the database; cap `MAX_CHECKPOINT_BYTES = 8 MB` | `context_manager/history.rs` + `normalize.rs` | messages/parts in the database, `message-v2.ts` |
| Workspace status | **persistent microVM snapshot** (7 days) + git branch pushed every round | user's filesystem (it doesn't move) | ditto |
| Cold session that inherits | `buildInheritedPrMessage`: summary of the previous session + PR + review thread + **anchored threads line by line** | — | — |
| Backspace | — | — | `revert.ts`: return to a given message via snapshots, `unrevert` |
| Pruning | `pruneToolOutputs` (protects 40 KB, threshold 20 KB) | `normalize.rs` | `truncate` at the time of the call |
| Compaction | LLM subcall, threshold 70k tokens or 75% of window, keeps 48KB tail | three ways: local (`compact.rs`), **remote** (`compact_remote_v2.rs`, 864 lines), and **token budget** → *new context window without summary* (`compact_token_budget.rs`) | `overflow.ts`: `COMPACTION_BUFFER = 20_000` reserved, triggers when `tokens >= model.limit.input - reserved` |
| Does the model know where it is? | **no** — we compact behind his back | **yes**: `get_context_remaining`, and it can request `new_context` itself | no |

> **Verdict — no difference on persistence, real difference on context.** Our
> persistence is the most ambitious of the three, because it is the only one that must
> survive a serverless function that dies: snapshot + git branch +
> checkpoint. OpenCode's `revert` is an interactive editor feature; at the house of
> we git already does this.
>
> *Revision of 2026-07-28*: I wrote “our compaction solves the problem”. She
> would fix it — **she never filmed**. Zero phase event `compacted` or
> `context_trim` since commissioning, because the threshold is 75% of the
> model window and that the models used have windows from 1,000,000 to
> 1,050,000 tokens: effective threshold ~787,000, compared to ~140,000 tokens for our plus
> large checkpoint (558 KB, 569 messages). Two consequences: the threshold is calibrated
> on the wrong variable — with a 1M window, which caps a session
> long is the **cost per round**, not the window — and a never-stretched net is a
> net with holes until proven otherwise. → MIN-113.

#### What a big context costs (measured on 2026-07-28, MIN-113)

The threshold had to be recalibrated “on cost”, it was still necessary to know the
cost. Measurement on **814 calls** `ai_usage` from `feature = 'agent_code'` since
commissioning, by crossing `prompt_tokens` and `cost` real.

**The context actually reached.** p50 = 29,851 · p75 = 44,757 · p90 = 86,815 ·
p95 = 135,115 · p99 = 153,808 · **max = 158,301**. A single run exceeds 60 k: 171
rounds on `anthropic/claude-sonnet-5`, final context 158,301 tokens, **13.9 M of
prompt tokens accumulated for $27.85**. The other 14 runs combined cost $4.03.

**The marginal cost of context**, adjusted by least squares on
`cost = a·prompt_tokens + b·completion_tokens` :

| Model | Rounds | $ / 1M prompt tokens | $ / 1M completion |
| --- | ---: | ---: | ---: |
| `openai/gpt-5.6-luna` | 590 | 0,18 | 6,69 |
| `anthropic/claude-sonnet-5` | 171 | **2,00** | 8,37 |
| `deepseek/deepseek-v4-flash` | 53 | 0,06 | 0,39 |

**Prompt caching does not amortize anything — false assumption.** $2.00/M is *exactly*
the full input price of Sonnet 5 (introductory price, $2/M until 2026-08-31).
By modeling each round at `prompt × 2 $/M + completion × 10 $/M`, i.e. **without
no cache**, we find $28.35 against $27.85 observed — **ratio 0.982**, and
**121 of the 171 rounds stick to the “no cache” model at ±2%**. Rounds 1 and 2
clearly show a cache read (ratio 0.15 and 0.19); from round ~60 the ratio
is 1.000 to the fourth decimal place. The reason is in the code:
[caching.ts](../lib/server/agent/caching.ts) places its two breakpoints on the
system message and the end of the seed prefix — **both HEAD**. The hidden block
therefore remains frozen at a few thousand tokens while the history reaches some
150,000, and its share becomes negligible. We pay full price for the entire
conversation, each round.

> If the entire history was read from the cache, this run would have cost **$3.35 at
> instead of $27.85** (−88%). This is a much bigger lever than compaction, and
> that's another subject: moving the breakpoint to the TAIL of history each round.
> Outside the perimeter of MIN-113, which calibrates the existing net. → to be opened separately.

**At what point is summarization profitable?** Compaction costs one subcall
on everything except the tail (~12k tokens), then drops the context to ~25k. HAS
150k on Sonnet 5: the round costs $0.300, the subcall $0.288, the round
next $0.050 — **depreciated in 1.2 rounds**. The ratio is the same on all three
models and at all thresholds tested between 60 k and 200 k (1.1 to 1.6 rounds), because
that the summarization cost and economy per round are both linear in `T`. There
profitability therefore does not discriminate: **compaction is profitable from ~60 k**. This
who sets the threshold from below is quality — don't harass sessions
normal — not the cost.

**Selected threshold: `AGENT_COMPACT_ABSOLUTE_MAX_TOKENS = 120_000`.**

| T | Rounds ≥ T (of 814) | Runs affected | Simulated cost of the big run |
| ---: | ---: | ---: | ---: |
| 100 k | 61 (7,5 %) | 1 | 19,75 $ (−29 %) |
| **120 k** | **48 (5,9 %)** | **1** | **20,77 $ (−25 %)** |
| 150 k | 16 (2,0 %) | 1 | 23,37 $ (−16 %) |
| 160k and beyond | **0** | **0** | unchanged |

The 180,000 tokens proposed for the framework are **discarded by the measure**: none of the
814 rounds observed does not reach 160,000, so a cap at 180k would not trigger
never — this would reproduce the ticket bug with a smaller number. 120,000
is placed above p90 (86,815): normal sessions do not see it, only
the ~6% of rounds of the really long run cross it, and it would have saved
a quarter of the cost of this run.

#### The complete path, practiced for real

“False code never executed is broken code until proven otherwise”
calls for a proof, not one more unit test. Two levels:

**1. Integration test** — [compact-path.test.ts](../lib/server/agent/compact-path.test.ts)
runs `runAgentLoop` while ONLY mocking `fetch`: SSE streaming,
subsummary call, rebuild and next round are the real code. This
which is checked is not the return value but **the body actually sent to the
provider on the next round** — matching `tool_call` ↔ `tool`, no orphan `tool`,
seed prefix verbatim, summary present only once. Same thing for
`dropOldestRound` on a 400 “context too long”: convergence in ≤ 4 tests,
pairing intact on every attempt, and a 400 which is NOT an overrun
context fails the run without pruning anything. The two guardrails were checked in
breaking them: without the `Math.min`, the recalibration test fails.

**2. Against the real provider, on a real checkpoint** (2026-07-28). The checkpoint
longest production run in messages (run `1d08300a`, **569 messages, 40,266
tokens**) passed in the real string `pruneToolOutputs` → `planCompaction` →
subcall summary → reconstruction:

| Step | Result |
| --- | --- |
| Compaction plan | seed 3 msg · to summarize 480 msg · tail 86 msg |
| Summary subcall (`deepseek-v4-flash`) | 3,488 character note, $0.0033 |
| Reconstructed history | **90 messages, 15 006 tokens** (−63%), valid pairing |
| Next round on `openai/gpt-5.6-luna` | **200 OK**, 18,225 prompt tokens |
| Next round on `anthropic/claude-sonnet-5` | **200 OK**, 30,719 prompt tokens |

Both models pick up the thread correctly — the response continues on the
real work of the run (multiple selection and grouped actions, MIN-75), not on a
generality. The dreaded matching 400 doesn't happen on either one. Cost
check total: **$0.08**.

What remains uncovered, and can only be covered after deployment: that the event
`compacted` lands in `agent_run_events` via the harness deployed, and that
the sandbox continues after compaction.

#### The model is warned before being cut

Third complaint raised: the model received a summary prefixed in the middle of its own
reasoning, without notice. `runAgentLoop` now injects **only once per
chunk**, a `user` message runs as soon as the context crosses **70% of the threshold** —
“finish the step you are on and reply, do not start new exploration” — and emits a
event `status` of phase `context_warning`, which gives a precursor
measurable compaction.

**No tool `get_context_remaining`**, and this is deliberate: it is the opposite choice
of Codex. The harness already knows `lastPromptTokens` each round; to spend
a turn to the model to ask for a number that can be pushed to it is bad
exchange. The comment is in the code so that we don't "fix" it.

### 3.5 Self-correction and retry

| | minddy | Codex | OpenCode |
| --- | --- | --- | --- |
| Network/LLM retest | 4 attempts, exponential backoff, `Retry-After`, inactivity timeout 60 s, then **suspend** instead of failing | — | `RETRY_INITIAL_DELAY = 2000`, factor 2, 30 s cap without header, `retry-after` and `retry-after-ms` honored |
| Context too long (400) | `dropOldestRound` × 4, then retry | compaction | compaction |
| Failed edition | cascade of **10 replacers**, noisy failure | Lark grammar: model **cannot** produce a malformed patch | cascade of **9 replacers** (ours + one less: no `UnicodeNormalizedReplacer`) |
| Malformed tool call | the round breaks or the arg becomes `""` (`safeParse` returns `{}`) | schema validation | **tool `invalid`**: validation error returns to model as tool output, round continues |
| After an edition | nothing | nothing | **LSP diagnostics** |

> **Verdict — a real gap (`invalid`), a point where we are ahead.**
> Our editing cascade is *strictly superior* to that of OpenCode which it
> is derived (we added `UnicodeNormalizedReplacer` — the models emit
> em dashes and curved quotes where the file has ASCII). The tool
> `invalid` from OpenCode fills a real hole: `safeParse` silently swallows
> a malformed JSON of arguments and executes the tool with `{}`.

### 3.6 Large files and browsing

| | minddy | Codex | OpenCode |
| --- | --- | --- | --- |
| Reading | 2000 lines by default, `offset`/`limit`, **explicit footer**: “Showing lines X-Y of Z. Use offset/limit to read more. » | via shell | 2000 lines, `offset`/`limit`, lines > 2000 chars. truncated |
| Command output | `cap(stdout, 4000)` + `cap(stderr, 2000)` — **truncation by the HEAD, the tail is lost** ([execute.ts:326-338](../lib/server/agent/execute.ts#L326-L338)) then `headTail(…, 6000)` | budget in **tokens** (`max_output_tokens`, default 10,000, ceiling 1 MiB / ~256 k tokens), configurable **per call** | 2000 lines / 50 KiB (configurable), and **beyond: full output is written to disk**, the model receives a preview + “Full output saved to: `<file>` — Use Grep to search the full content or Read with offset/limit” ([truncate.ts:129-137](https://github.com/anomalyco/opencode/blob/40e4d73/packages/opencode/src/tool/truncate.ts#L129-L137)) |
| Instructions to the model | — | — | “Do NOT use `head`, `tail`, or other truncation commands to limit output; the full output will already be captured to a file » |
| Context pruned output | `PRUNE_STUB`: “Re-read the file or re-run the search if you still need it. » | — | file on disk, always rereadable |

> **Verdict — real, costly, and most serious discrepancy in the document.**
>
> **Deterministic probe.** I made a typical output of `npm test` fail
> (407 lines: 400 lines of green checkmarks, then the summary — name of the test
> miss, assertion, `Test Files 1 failed`) in actual truncation string
> (`cap(4000)` de [execute.ts](../lib/server/agent/execute.ts) puis
> `headTail(6000)` de [agent-loop.ts](../lib/server/agent/agent-loop.ts)) :
>
> ```
> raw stdout: 16,595 characters, 407 lines
> after cap(4000): is the final verdict present?  NO
> the name of the failed test?          NO
> after headTail(6000): final verdict present?            NO
> last lines seen by the model:
>    ✓ lib/foo/bar-97.test.ts (7 tests) 10ms
>    ✓ lib/foo/bar-98.test.ts (7 tests) 11ms
>    ✓ lib/foo/bar-99.test.ts (7… [truncated]","stderr":""}
> ```
>
> **The model sees a hundred green tests and `exitCode: 1`, without knowing what broke.**
> `headTail` exists precisely to keep the queue — but `cap()` has already destroyed it
> upstream. This is not an assumption: it is the code path executed each time
> `run_command`. And that directly explains the 23 pipes to `head`/`tail` and the
> 12 `2>&1` of §2: the model has learned to defend itself from the harness.

### 3.7 Testing and verification

| | minddy | Codex | OpenCode |
| --- | --- | --- | --- |
| Doctrine | 1 line: “run the project's linter / type-check / build / tests” | “Validating your work” section: from the most specific to the broadest, **never tests in a repository without tests**, 3 iterations max on formatting, proactivity conditioned on approval mode | tool prompt `shell` |
| Where the project declares its orders | `AGENTS.md`/`CLAUDE.md` **at clone root only**, 32,000 bytes | `AGENTS.md` **hierarchical**: from the project root to the cwd, concatenated in this order, `AGENTS.override.md` local, `project_doc_max_bytes` = **32 KiB** ([config/mod.rs:206](https://github.com/openai/codex/blob/294d813/codex-rs/core/src/config/mod.rs#L206)) | `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md` (deprecated), + global `~/.config/opencode/AGENTS.md` and `~/.claude/CLAUDE.md` ; “the first project-level match wins so we don’t stack from every ancestor” |
| Environment ready? | no — the agent discovers that `node_modules` is empty | the environment is that of the user | ditto |
| Verification signal | no event, no trace | — | — |

> **Verdict — real and costly gap, but not where we expected.** Our target
> 32 KB is already aligned with Codex (`execute.ts`'s comment says so). There
> `AGENTS.md` hierarchy is a refinement of monorepo which we do not have
> need. **The real gap is upstream**: at Codex and OpenCode, the repository is already
> installed — for us, a fresh microVM has an empty `node_modules`, and
> `tsc: command not found` is our most frequent error (§2). It's not a
> harness gap in the strict sense, this is the price of our execution model.

---

## 4. Prioritized opportunities

| # | Opportunity | Impact | Cost | Product surface | Files |
| --- | --- | --- | --- | --- | --- |
| **1** | **Keep the QUEUE of command outputs** (`headTail` instead of `cap`) | Very strong — without it, the agent cannot read a failing test | Trivial (2 lines) | Zero | [execute.ts:326-338](../lib/server/agent/execute.ts#L326-L338) |
| **2** | **Long output deposited in the sandbox and rereadable** (OpenCode model) | Strong — removes information loss *and* workarounds `head`/`tail` | Medium | Null (the tool does not change signature) | `execute.ts`, `sandbox.ts` |
| **3** | **Safeguard executed on destructive git commands** | Strong — protects the user's work; deviation **measured** (2 occurrences) | Low | Zero | new `lib/server/agent/command-guard.ts`, plugged into `makeExecTool` |
| **4** | **Type diagnostics reinjected after editing** | Strong — closes the edit→error loop in the tool | Medium-strong (you need a type-checker in the VM) | Zero | `execute.ts` (`edit_file`, `apply_edits`, `write_file`) |
| **5** | ****CODE_0__ and `timeout_ms` on `run_command`** | Average — 13% of commands prefix an unnecessary `cd` | Trivial | Null (optional parameters) | `tools.ts`, `execute.ts` |
| **6** | **Literal mode on `grep` (`fixed_strings`)** | Average — 3 measured failures, all from JSX | Trivial | Zero | `tools.ts`, `sandbox.ts` (`-F` instead of `-E`) |
| **7** | **Visual input: images of attachments seen by the model** | Medium-strong on *our* use case (model attached to a ticket) | Strong (history changes to `content: Array<Part>`) | Low | `agent-loop.ts`, `issue-tools.ts`, `prompt.ts`, `compact.ts` |
| **8** | ****CODE_0__ honest on `apply_edits`** (partial success ≠ failure) | Weak in functionality, strong in readability of metrics | Trivial | Zero | `execute.ts:324` |
| **9** | **Tool `invalid`: repair a malformed call instead of suffering it** | Low (not measured by us) | Low | Zero | `agent-loop.ts` (`safeParse`) |
| **10** | ****CODE_0__ used for `gpt-*`** models (10 runs / 15) | Medium — the format these models are trained on | Medium | Null (the tool replaces `edit_file`/`write_file` depending on the model) | `tools.ts`, new `patch.ts`, `execute.ts` |
| **11** | **Subagents, one-level hierarchy** | Strong on capacity, poor on reliability | Strong | **Real** — this is the only line in the table that adds a product concept | `tools.ts`, `agent-loop.ts`, new `subagent.ts` |
| **12** | **Background commands** (dev server, poll, stop) | Strong — the agent can finally see what he writes happening | Medium | Low (3 tools, or 1 tool with 3 actions) | `tools.ts`, `sandbox.ts`, `execute.ts` |
| **13** | **Context management: calibrate it, test it, report it to the model** | Strong — today it's code never executed | Medium | Zero | `agent-loop.ts`, `compact.ts`, `lib/agent-models.ts` |
| **14** | **`AGENTS.md` / `CLAUDE.md` of the affected subfolders** | Low-medium | Low | Zero | `execute.ts` (`readRepoInstructions`) |

### Not retained, and why

**One** real gap that we decide not to fill:

- **Interactive approval system** (Codex `request_permissions`,
OpenCode `ctx.ask`). The agent runs in the cloud, often while
the user does something else. A blocking approval is a dead session.
And isolation makes the question moot: the microVM is disposable, the agent can
do pretty much what he wants without consequence. `ask_user` already covers the only
case that counts — a *product decision* that blocks. **Decision confirmed after
  review.**

And **a variant** discarded in favor of another form (see §5, R12):

- **`get_context_remaining` as the tool that the model queries.** Spend a
turn to the model to ask for his remaining budget is a bad exchange when the
harness already knows the number each round (`lastPromptTokens`). We
keeps the idea - that the model KNOWS where it is - but by **pushing** it to
useful moment rather than making him shoot it.

> ### Revision of 2026-07-28 — six deviations reinstated
>
> The first version of this document excluded seven. The review recovered six,
> including **two on an analysis error on my part** and **four on a decision
> assumed product** (“minddy must be able to do any job, not
> only sober work"). Four figures, measured after the fact, decided:
>
> | Measurement | Value | What it invalidates |
> | --- | --- | --- |
> | Dominant pattern of runs | ****CODE_0__: 10 runs / 15** | “our default is DeepSeek, `apply_patch` is useless” |
> | Form of OpenCode tool `apply_patch` | **normal tool, one `patchText: string`** parameter — no grammar, no support provider | “the patch format is not portable” |
> | Context windows of the models used | **1,050,000 / 1,048,576 / 1,000,000 tokens** → compaction threshold at ~787,000 | “our compaction covers long sessions” |
> | Events `status` of phase `compacted` / `context_trim` | **0, always** | ditto — the machinery **never turned** |
>
> **What I was wrong.**
>
> - **`apply_patch`.** I was right about Codex (Lark grammar = constrained decoding,
> not portable via OpenRouter) and I drew a false conclusion about the
> *format*. OpenCode implements the same format as an ordinary one-to-one **tool
> string parameter** ([apply_patch.ts:18-20](https://github.com/anomalyco/opencode/blob/40e4d73/packages/opencode/src/tool/apply_patch.ts#L18-L20))
> — zero provider dependency. And it only serves it for `gpt-*` models, which are
> precisely 10 of our 15 runs. → **retained, R8.**
> - **Context management.** I wrote “no penalizing deviation” because the
> machinery exists. It exists, but **it has never been exercised once
> times in production**: with windows of 1M tokens, the 75% threshold is at
> 787k, and our largest checkpoint is ~140k tokens. Emergency code
> never executed is broken code until proven otherwise, and the true ceiling
> is not the window — it is the **cost per round** (we return 140k tokens to
> each call) and `MAX_CHECKPOINT_BYTES`. → **retained, R12.**
>
> **This is a product decision, not an analysis error.**
>
> - **Subagents.** My argument (cost, opacity, prompt surface) remains true;
> it is simply subordinate to a choice: delegating is a way of working
> normal in 2026, and a harness that does not know how to do it will plateau. **Hierarchy
> at a single level** — a subagent cannot launch others. → **R9.**
> - **Background commands.** I had rejected the Codex session shell, and
> it remains true: a PTY session would not survive our suspend/resume. But
> I stopped at the mechanics instead of looking at the capacity it carries —
> **launch a dev server and check that the application is really running**.
> Today `run_command` blocks up to 180 s then kills the process: our
>   agent cannot see its own work running. → **R10** (start / poll /
>   stop, no PTY).
> - **Hierarchy of `AGENTS.md`.** “Monorepo refinement” was correct and
> insufficient: it is above all very cheap, and one deposit in two puts a
> `CLAUDE.md` in a subfolder. → **R11.**
> - **Tool `lsp`.** Kept outside scope **immediate**, but no longer as a matter of principle:
> it becomes a natural continuation of R4 (MIN-110). If the measurement shows that a
> language server can live in the microVM, "find all references"
> — which `grep` approximates poorly — follows almost for free. **Packaged at
> measurement of MIN-110**, not refused.

---

## 5. Concrete recommendations

### R1 — Keep the tail of the command outputs *(rank 1)*

**What.** In [execute.ts](../lib/server/agent/execute.ts), box `run_command`:
replace `cap(r.stdout, 4000)` / `cap(r.stderr, 2000)` with `headTail(...)`, already
exported by [prune.ts](../lib/server/agent/prune.ts).

**Risk.** None: `headTail` returns the string as is below the threshold, so
no behavior changes on short outings.

**Measurable.** Replay the probe from §3.6 in test (`execute.test.ts`): the verdict
final must be present. In production, the failure rate of `run_command` followed by
`run_command` immediately retried with `| tail` must fall to zero.

### R2 — Long output placed in the sandbox *(rank 1)*

**What.** Beyond the threshold, write the full output to
`/vercel/sandbox/tool-output/<runId>-<seq>.log` (outside `REPO_DIR`, so never
committed) and return the preview + the path to the model, with the OpenCode instruction:
“Use `grep` to search the full content or `read_file` with offset/limit”. It therefore requires
therefore authorize `read_file`/`grep` on this specific path (an exception named in
`resolveWithin`, not a general opening).

**Where.** `makeExecTool` (`run_command`) in `execute.ts`; writing helper in
`sandbox.ts` ; paragraph in `buildAgentSystemPrompt` explicitly saying not to
   pipe to `head`/`tail`.

**Risk.** The file must remain outside the repository (otherwise it leaves during commit) and be
cleaned with the VM. The persistent snapshot keeps them for 7 days — acceptable.

**Measurable.** The share of `run_command` containing `| head`/`| tail` (10% today,
§2) must tend towards zero.

### R3 — Safeguard executed on destructive commands *(rank 1)*

**What.** A pure module `lib/server/agent/command-guard.ts`, testable like
`repo-path.ts` : `checkCommand(command: string): { allowed: boolean; reason?: string }`.
Refuse — **by returning a tool error to the model, not by breaking the round** —
`git commit`, `git push`, `git reset --hard`, `git checkout --`, `git rebase`,
`git cherry-pick`, `--amend`, `--force`/`-f` on a push. The error message should
explain *why* (“the harness owns git: it commits and pushes at the end of
each turn") so that the model adapts rather than insists.

**Where.** Connected at the head of box `run_command` of `makeExecTool`. The prompt keeps its
paragraph: the rule is the same, it simply becomes true.

**Risk.** A false positive would block a legitimate order. Hence: **closed list
and short** of reasons, never a heuristic. Do not target `git add` (harmless) or
the git reading. Codex makes the same choice with `is_known_safe_command`: `git
status`/`log`/`diff`/`show` safe, the rest on a case by case basis.

**Measurable.** An event `tool_result` with `success: false` and
`reason: "forbidden_command"` per attempt → the request in §2 becomes a counter
tracking, and a non-zero value indicates a model fighting against the harness.

### R4 — Type diagnostics at end of turn *(rank 2)* — **measured, channel B retained**

**What.** An incremental `tsc --noEmit` **once per turn**, at the moment when the
model prepares to return the hand, if and only if the trick has touched
files and that the repository has a *usable* type-checker (`tsconfig.json` **and**
`node_modules/.bin/tsc`). Non-empty errors → injected as message `user` and the
turn **restarts** instead of ending: `Type errors detected after your changes,
please fix:`, files affected by the round listed first. Only one
reroll per round (the second check verifies the fix, then the round ends
regardless).

**What the measurement decided** (§3.3, “Cost of a type-check in the sandbox”):
per edition, 4.9 to 14.4 s × 44 editions — up to 290 s on a single run, more
than a whole chunk. Per turn, 11 s. And above all, check between two halves of a
same change brings up errors that the next edition erases. `tsc --watch`
(1.9 GB residents) and file-by-file verification (37 phantom errors on
a healthy file) are discarded on measure, not on intuition.

**Risk.** An already broken deposit would cause the model to go around in circles: hence the restart
unique, and an explicit prompt instruction — an error foreign to its
change is indicated in the response, it is not corrected.

**Measurable.** Number of rounds that end with typing errors
introduced by the agent — now unknown, which is already a problem.

### R5 — `workdir` and `timeout_ms` on `run_command` *(rank 2)*

**What.** Two optional parameters on `run_command` in `tools.ts`, passed to
`runShell` (which already accepts them: `opts.cwd`, `opts.timeoutMs`). Description of
tool using the OpenCode formula: “AVOID using `cd <dir> && <cmd>`; use the
`workdir` parameter instead.” Bound `timeout_ms` by `RUN_COMMAND_TIMEOUT_MS`.

**Risk.** `workdir` must go through `resolveWithin` — otherwise we have just reopened the
exit from the depot which is closed everywhere else.

**Measurable.** Share of `run_command` calls containing a `cd` (13% today).

### R6 — Literal mode on `grep` *(rank 2)*

**What.** Parameter `fixed_strings?: boolean` → `git grep -F` instead of `-E`
(`grepRepo` in `sandbox.ts`). And above all: when `git grep` fails with
`Unmatched \{` or `Unmatched \(`, **automatically try again in `-F`** and say it
in the result (“pattern retried as a literal string”) — the model searches for
JSX, not a regex.

**Measurable.** The failure rate of `grep` (0.9% today) must drop to zero on
`Unmatched` errors.

### R7 — Visual entry *(rank 2 since 2026-07-28, to be framed separately)*

**What.** `AgentChatMessage.content` must accept `Array<{type:"text"|"image_url"}>`
and `read_attachment` return the image as part image when the run model is
multimodal. Key `agent-loop.ts` (serialization), `compact.ts` (`messageBytes`,
`serializeForSummary`), `prune.ts` (pruning should not eat an image yet
utile), `caching.ts`.

**Why it's different for us.** Codex and OpenCode give the model an image
*from the disk*. With us, the image is **a ticket attachment** — a model that
someone filed writing the issue. This is the only point in this document where the
need is *stronger* than in references, not less.

**Risk.** Cost per turn and a growing checkpoint. **Compatibility
is no longer a risk**: the `input_modalities` of the OpenRouter index give
`["file","image","text"]` for `openai/gpt-5.6-luna` and
`["text","image","file"]` for `anthropic/claude-sonnet-5` — i.e. **11 of our 15
runs**. Only `deepseek/deepseek-v4-flash` is `["text"]`. This increases the rank of R7:
the capacity is missing from the vast majority of real sessions.

> **Dated 2026-07-28 (MIN-111).** `content` accepts parts `text`/`image_url`
> (reading helpers in `content.ts`, used by the five consumers), the
> model capability is read in the same OpenRouter index as the context window
> (`supportsImageInput`), and `read_attachment` returns the image in **data URL** — not
> in signed URL: it expires in 10 minutes, the checkpoint is replayed much later.
> The “checkpoint growing” risk is limited by three ceilings: 750 KB per image
> (~1 MB encoded), 2 images per turn, 3 images retained in the entire history
> (`capHistoryImages`). An image is billed per context at a flat rate of 4,000
> characters, never at the size of its base64 — otherwise the first open model
> would trigger compaction every round. Form checked against real
> provider: Anthropic, OpenAI and Google all accept an image part IN a
> message `role:"tool"` and correctly describe the image (the point that no test
> unitaire ne pouvait trancher).

### R8 — `apply_patch` for `gpt-*` models *(rank 2)*

**What.** A tool `apply_patch` with a single parameter `patch: string`, in the format
`*** Begin Patch` / `*** Update File:` / `@@` / `+-` — that of Codex and
from OpenCode. Served **instead** of `edit_file`/`write_file` when the run model
is a `gpt-*` (the exact OpenCode rule: `includes("gpt-") && !includes("oss")
&& !includes("gpt-4")`); otherwise nothing changes.

**Why now.** 10 of our 15 runs run on `openai/gpt-5.6-luna`.
This is the format this family is trained on, and it carries **context**
(`@@ def greet():`) where `old_string` carries an exact string — so it tolerates
better a rough reading of the file.

**What it does NOT bring.** Matching reliability: `edit_file` is 4.3%
failure and the only case is an idempotent edition. Do not sell this ticket as
a bug fix — it is an adaptation to the model, to be validated by comparison.

**Risk.** Two editing engines to maintain. Hence: the patch parser produced
`{oldString, newString}` that we pass through the **existing cascade**
from [edit.ts](../lib/server/agent/edit.ts), instead of writing a second applicator.

**Measurable.** Failure rate of `apply_patch` vs `edit_file` on `gpt-*` runs, and
number of editions per round (the format groups several hunks).

### R9 — Subagents, one-level hierarchy *(rank 2)*

**What.** A tool `spawn_agent { task, mode }` which launches a child session in
**the same sandbox**, with its own history, and returns a report to the parent
text. Two modes: `explore` (read-only toolset) and `implement` (read-only toolset)
complete). The subagent **does not** have `spawn_agent`: the hierarchy stops at a
level, by construction and not by instruction.

**The three constraints that decide the design.**

1. **The sandbox is shared**, unlike Codex and OpenCode where each agent
sees the same disk because it is the user's disk. At the two of us
subagents that write in parallel step on each other in a git repository whose
the harness does `git add -A` at the end of the turn. Rule: **`explore` can
be parallel, the `implement` are serialized** — only one writer at a time.
2. **The budget is counted by `ai_usage.user_id`.** Each call from a sub-agent
must go through `recordAiUsage` with the `user_id` and the `run_id` of the parent,
in a dedicated `seq` band (like `WEB_SEARCH_SEQ_BASE` and
`SANDBOX_USAGE_SEQ_BASE`). Otherwise delegation becomes a billing hole.
3. **The soft-deadline is that of the parent.** A sub-agent receives a fraction of the
remaining budget of the chunk and hands over before, otherwise a `spawn_agent` can do
miss the end-of-round commit.

**Main risk — opacity.** An agent who delegates becomes illegible in the
thread. The sub-agent must therefore emit its events on the same `run_id`, with a
kinship marker, and that the thread makes them folded under the call.

**Measurable.** Share of tours that delegate, average cost of a tour with vs without
delegation, and above all: was the sub-agent's report used (the parent
he quotes in his response)?

### R10 — Background commands *(rank 2)*

**What.** `run_command` with `background: true` returns a `job_id` instead
to wait; `check_command { job_id }` returns the accumulated output since the
last call and status (`running` / `exited`); `stop_command { job_id }` kill him
process. All jobs are killed at the end of the turn.

**The ability it unlocks.** Run `npm run dev`, wait for it to listen, then
`curl localhost:3000` — **see what we just wrote turn around**. Today
impossible: `run_command` blocks until `RUN_COMMAND_TIMEOUT_MS` (180 s) then kills.
This is the lack that prevents the agent from checking anything other than unit tests.

**What we do NOT do.** No PTY, no `write_stdin`, and no shell session that
survives the round. An interactive session would survive neither suspend/resume nor
the shutdown of the microVM by the reaper — and the interactivity is only useful to a human
at a terminal.

**Risk.** A forgotten process that consumes the microVM. Hence: job ceiling
simultaneous (3), unconditional kill at end of turn, and accumulated output on disk
via the R2 mechanism.

### R11 — Affected subfolder instructions *(rank 3)*

**What.** `readRepoInstructions` today reads `AGENTS.md` and `CLAUDE.md` **at the
root of the clone**. Add, at the first edition in a sub-folder, the
`AGENTS.md`/`CLAUDE.md` encountered between the root and this file — the rule of
Codex, but **lazy**: load only what the agent touches instead of
concatenate the entire tree at the seed.

**Why lazy.** The overall cap remains 32 KB. Load the entire tree with one
monorepo at boot would fill it with package conventions that the agent won't touch
never, to the detriment of those of the root.

### R12 — Context management: calibrate, test, report *(rank 2)*

**The real problem, measured.** The compaction has **never turned**: zero events
`status` phase `compacted` or `context_trim` since commissioning. Cause:
`compactThreshold = contextWindow * 0.75`, and the models used have windows
from 1,000,000 to 1,050,000 tokens → threshold at ~787,000, when our biggest checkpoint
weighs ~140,000 tokens (558 KB of JSON, 569 messages).

**Three consequences, three actions.**

1. **The threshold is calibrated on the wrong variable.** With a window of 1 M, this
that caps a long session is not the window — it's the **cost per
round** (we return the entire history on each call) and `MAX_CHECKPOINT_BYTES`.
→ limit the threshold by an absolute ceiling in addition to the ratio:
`min(contextWindow * 0.75, cost_ceiling)` in
   [agent-loop.ts](../lib/server/agent/agent-loop.ts).
2. **Fallout code never executed is broken code until proven
contrary.** `planCompaction`, `dropOldestRound` and `pruneToolOutputs` have
unit tests, but the full path (summary subcall, reconstruction of
the history, next round which starts again) never turned out for real.
→ an integration test which forces the threshold to 5,000 tokens and runs a
   real session.
3. **The model does not know that it has been compacted.** It receives a message `user`
prefixed `COMPACT_SUMMARY_PREFIX` in the middle of its own reasoning. Instead
that a tool `get_context_remaining` that he should remember to call, **push him
information when needed**: when `lastPromptTokens` exceeds ~70% of the
threshold, inject a line “you are approaching the context limit — wrap up the
current step and reply” before the call. He concludes properly instead of being
cut.

**Measurable.** Phase events `compacted` must become non-zero after
recalibration — and if `compacted` increases without the quality falling, the threshold is good.

> **Done on 2026-07-28 (MIN-113).** Threshold limited by
> `AGENT_COMPACT_ABSOLUTE_MAX_TOKENS = 120_000`, full path exercised (test
> integration + real checkpoint against the real provider), notice
> `context_warning` injected at 70% of the threshold. Figures, calibration and validation:
> §3.4. **Discovery in passing**: prompt caching does not amortize anything — the
> breakpoints of `caching.ts` are at the top of the history, we therefore pay full price
> the entire conversation in each round. Estimated leverage −88% on one run
> long, much longer than compaction; it’s another project.

---

## 6. Follow-up tickets

Created from this document, related to MIN-101:

| Ticket | Rank | Recommendation |
| --- | --- | --- |
| **MIN-107** — *No longer lose the end of `run_command`* outputs | 1 | R1 + R2 — the tail of the command outputs, and the long readable output |
| **MIN-108** — *Make the harness execute the git prohibitions that it simply says* | 1 | R3 — guardrail executed on destructive commands |
| **MIN-109** — *Three frictions measured on the tools* | 2 | R5 + R6 + R8 — `workdir`/`timeout_ms`, `grep` literal, `success` honest to `apply_edits` |
| **MIN-110** — *Return typing errors right after editing* | 2 | R4 — post-edit diagnostics (**starts by measuring the cost**, and abandonment is a valid outcome) |
| **MIN-111** — *Let the agent SEE the models attached to the tickets* | 2 | R7 — visual input (**upgraded**: 11 runs / 15 runs on a model that accepts images) |

Created at the review of 2026-07-28, with the six gaps reinstated:

| Ticket | Rank | Recommendation |
| --- | --- | --- |
| **MIN-112** — *Subagents, single level* | 2 | R9 — delegation, `explore` parallel / `implement` serialized, billing to the owner |
| **MIN-113** — *Compaction never turned* | 2 | R12 — recalibrate threshold on cost, exercise full path, prevent model |
| **MIN-114** — *Background commands* | 2 | R10 — launch a dev server and see its work running (blocked by MIN-107) |
| **MIN-115** — *`apply_patch` for `gpt-*` + subfolder instructions* | 3 | R8 + R11 |

Two opportunities have **no** tickets, and this is deliberate:

- **The `invalid`** tool (opportunity 9): the gap is real at OpenCode, but we
have no measured occurrence of a malformed tool call. We're waiting for a signal.
- **The tool `lsp`**: reclassified as *conditioned to the measurement of MIN-110*. If a
language server can live in the microVM, it follows almost for free;
otherwise the question does not arise. Noted in comments on MIN-110.

---

## Appendix — reproduce the measurements

Pass 3 scripts live in the session scratchpad (uncommitted).
To replay them, the essential thing is a PostgREST request on
`agent_run_events` with the service key:

```
GET {SUPABASE_URL}/rest/v1/agent_run_events
    ?select=payload,created_at
    &type=eq.tool_result
    &created_at=gte.{ISO}
```

then aggregation on `payload->>'name'` and `payload->>'success'`. Warning: the
events before 2026-07-18 carry an old form payload
(`{ id, name, args }` where `args` is the raw JSON) — recent payloads carry the
unstructured summary (`{ id, name, command }` for `run_command`). Any aggregation
who ignores the old form loses half of the `run_command`.
