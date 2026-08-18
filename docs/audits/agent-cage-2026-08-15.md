# The harness cage — lightweighting audit, local path

**Reading audit. No code written.** It extends
[agent-local-2026-08-14.md](agent-local-2026-08-14.md) and **reopens its D3 decision**
upon request from the PO: local becomes the default mode (desktop app), and
the objective changes meaning — no longer “what perimeter to hold”, but **“what
parity with Claude Code, Codex and opencode”.**

> **Decisions taken on 2026-08-15, in §8** (D5 to D8): the entire disk with a
> prompt rule, the commit returned to the model on request, `ask_user` which suspends,
> `run_background` returned. **D3 is canceled.** §9 gives the order of battle,
> and this order carries a real constraint: D7 before D5.

Everything cited here has been reread in the code as of 2026-08-15, after
`1f1ad7d`. What is not measured is said to be unmeasured.

---

## 0. The verdict, in six lines

1. **A living fault, and it is not an arbitration: in local mode, NO ONE
   commit.** The harness no longer commits (D2bis-B), the prompt promises that it
   does, and the guardrail refuses the model to do so. Three texts, three
   versions. → §1.
2. **The cage has a shape, and it is systematically upside down: it closes the
   tool which DECLARE its intention and leaves open the shell which declares nothing.**
   This is not a new discovery — it is the “paper wall” of §2 of
   the previous audit — but the inversion of D3 changes the conclusion. → §2.
3. **Out of 16 constraints listed, 7 are based on a reason that is no longer true
   locally**, including three where the pattern is named “reopenable” in our own
   comments. → §3.
4. **The big delegation has already taken place** (−18,100 lines) and two of the three
   savings that the previous audit listed are **already made** locally. It remains
   less fat than the feeling says. → §4.
5. **The parity differences that are visible in use are six**, and the most expensive
   is not disk access: it is that **a local agent cannot run
   what he writes, nor ask a question without dying**. → §5.
6. The simplification that the OP is asking for **removes code instead of adding it**.
   This is the only direction of the file where “freer” and “simpler” are
   the same gesture. → §6.

---

## 1. The fault which is not a choice: the local tour delivers nothing

This is the only point in this audit that is a **bug**, and it is in production on
the local path.

| What is written | Where | What it says |
| --- | --- | --- |
| `if (job.writesToRepo && !current)` | [supervisor.ts:1836](../../lib/server/agent/vm/supervisor.ts#L1836) | in current submission mode, **nothing is committed nor pushed** at the end of the round (D2bis-B, assumed) |
| “At the end of each turn the harness delivers YOUR work by **committing only the paths you changed**, onto its own branch” | [prompt.ts:177](../../lib/server/agent/prompt.ts#L177) | model reads harness commit |
| “Refused `git commit` — **the harness owns git: it commits and pushes your work at the end of every turn**” | [command-guard.ts:352-359](../../lib/server/agent/command-guard.ts#L352-L359) | and if he tries, the refusal tells him again |

**Result for a local round: the work remains in the tree, the model grows
that he is delivered, and he has no way of delivering it himself.** The only way
remaining is `create_pr`, which pushes a branch onto the forge — so exactly the
gesture that D2bis-B wanted to withdraw, except for one tool.

Two consequences that can be read in behavior, not just in
texts:

- a model that follows the prompt **does not tell the user to commit**: it
  believes he did it. The round ends with “it’s delivered” and nothing is;
- the same sentence of `prompt.ts:177` says **“never commit”** two propositions
  earlier, and “the harness delivered by committing” later. The referee model
  between the two halves of the same sentence.

**This defect must be corrected regardless of the decision in §8** — it is
the opposite of a perimeter debate, the three texts must just say the same
thing.

---

## 2. The shape of the cage: it only catches the honest

The audit of 08/14 had measured the fact (§2, “the wall of paper”). The following is
its **generalization**, and it is what makes the requested relief coherent: the
same asymmetry is repeated **four times**, in four independent places.

| The tool that declares, closed | The shell that declares nothing, open | Where |
| --- | --- | --- |
| `read` on a `.env` → **refused** | `bash cat .env` → **pass** (`checkCommand` only targets git) | [opencode-permissions.ts:302-319](../../lib/server/agent/vm/opencode-permissions.ts#L302-L319) |
| `webfetch http://localhost:3000` → **denied** | `bash curl localhost:3000` → **pass** | [opencode-permissions.ts:331](../../lib/server/agent/vm/opencode-permissions.ts#L331) |
| `external_directory` → **`deny`**, the request is not even published | `grep -r ~ `, `find ~`, `node -e`, `sed`, `curl` → **pass** (20 of 30 orders measured) | [opencode-config.ts:423](../../lib/server/agent/vm/opencode-config.ts#L423) |
| `run_background` → **removed from toolset** | `bash "npm run dev &"` → **passes**, and becomes an orphan without a register | [tools.ts:1383](../../lib/server/agent/tools.ts#L1383) |

**The reading that matters is not “these guards can be bypassed”.** It is
that they can be avoided *by the dirtiest route*. Each row of the table
teaches the model that the clean way is refused and the shell works —
that is to say, it **moves the work to the place where we no longer see
nothing**, where there is neither `metadata.filepath`, nor `workdir`, nor file account
changed, nor child register.

A guardrail that pushes the model towards `bash` does not reduce risk: it reduces
our **observability** of risk. This is the best argument for relief,
and it is independent of any question of trust.

---

## 3. Cage inventory — 16 constraints, and what still motivates them

`local` = the trick plays on the user's machine (`isLocalJob`).
**Reason** = the reason written in the code. **Still true locally?** = verdict of
this audit.

| # | Constraint | Where | Written pattern | Still true locally? |
| --- | --- | --- | --- | --- |
| 1 | `git commit` / `push` / `reset` / `restore` / `checkout --` / `rebase` / `cherry-pick` / `stash drop` / `clean -f` / `--amend` refused | [command-guard.ts:94-101](../../lib/server/agent/command-guard.ts#L94-L101) | “the harness commits and pushes at the end of each turn” | **NO** — he no longer commits (§1) |
| 2 | Any path token carrying a `.git` segment refused, **reads included** | [command-guard.ts:441-475](../../lib/server/agent/command-guard.ts#L441-L475) | hooks + `.git/config` carries the push token | **partially** — locally there is no forge token in `.git/config` (it travels by `authUrl`), and `cat .git/HEAD` is harmless |
| 3 | `git -C`, `--git-dir`, `--work-tree` rejected in bulk | [command-guard.ts:232](../../lib/server/agent/command-guard.ts#L232) | “the harness has ONE deposit” | **to be decided** — this is the direct corollary of D3 (§8, Q1) |
| 4 | `git config` writes to executing keys | [command-guard.ts:274-297](../../lib/server/agent/command-guard.ts#L274-L297) | persistence that survives the run, in the human terminal | **YES, and it's the most justified guardrail of the lot.** Keep as is |
| 5 | `external_directory: "deny"` | [opencode-config.ts:423](../../lib/server/agent/vm/opencode-config.ts#L423) | “microVM only has one repository” | **NO** — the premise names the microVM |
| 6 | `read: "ask"` + refusal of `.env*` | [opencode-config.ts:377](../../lib/server/agent/vm/opencode-config.ts#L377), [opencode-permissions.ts:302](../../lib/server/agent/vm/opencode-permissions.ts#L302) | the user's actual `.env` | **yes on the intention, no on the form** — the shell passes (§2), and a global `ask` costs **one HTTP round trip per read** |
| 7 | `bash: "ask"` | [opencode-config.ts:392](../../lib/server/agent/vm/opencode-config.ts#L392) | this is what gives the hand to `command-guard` | **yes**, but the price is a round trip **per order** for a list that only targets git |
| 8 | `webfetch` refuses private addresses | [opencode-permissions.ts:331](../../lib/server/agent/vm/opencode-permissions.ts#L331), [local-guard.ts](../../lib/server/agent/vm/local-guard.ts) | LLM proxy, tools bridge, dev servers, NAS, VPN | **yes for the proxy and the bridge** (they are on the loopback and the bridge does not authenticate anything), **no for `localhost:3000`** |
| 9 | Unknown permission → `reject` | [opencode-permissions.ts:347](../../lib/server/agent/vm/opencode-permissions.ts#L347) | do not authorize what you have never read | **yes as a posture, but it's a ratchet**: each increase of opencode **removes** capacity instead of adding it (`lsp`, `plan_enter`/`plan_exit`, `doom_loop`, `skill`) |
| 10 | `run_background` removed | [tools.ts:1383](../../lib/server/agent/tools.ts#L1383) | `setsid` survives ⌘Q, no register | **NO** — the registry exists: [vm/child-registry.ts](../../lib/server/agent/vm/child-registry.ts). The comment itself says “reopenable on the day…” |
| 11 | `skill: false` | [opencode-config.ts:214](../../lib/server/agent/vm/opencode-config.ts#L214) | “the skills read the microVM disk; there are none » | **NO** — on the machine there are (`~/.config/opencode/skill`, and the deposit at the door) |
| 12 | `todowrite: false` | [opencode-config.ts:214](../../lib/server/agent/vm/opencode-config.ts#L214) | our checklist IS the ticket plan | **yes as product**, but a 20-step local refacto publishes 20 network writes to a shared surface |
| 13 | `websearch: false` | [opencode-config.ts:214](../../lib/server/agent/vm/opencode-config.ts#L214) | ceiling + billing | **YES.** To keep |
| 14 | `OPENCODE_PURE` + `OPENCODE_DISABLE_PROJECT_CONFIG` | [opencode-config.ts:762-763](../../lib/server/agent/vm/opencode-config.ts#L762-L763) | execution of arbitrary code from the contents of a repository | **yes for the plugins**, **debatable for the rest**: it also takes the MCPs from the repository and the `AGENTS.md`/`CLAUDE.md` **nested** (only those from the root are rendered) |
| 15 | `ask_user` **ENDS round** | [supervisor.ts:1428](../../lib/server/agent/vm/supervisor.ts#L1428) | “keeping a microVM open would cost hours of computing time” | **NO** — the premise names the microVM, and the measure already exists (§11.3.2 from the previous audit, `opencode-wait.probe.test.ts`) |
| 16 | Delivery door on the 1st `create_pr` (typecheck + tests + self-reading) | [delivery-gate.ts](../../lib/server/agent/delivery-gate.ts) | control attached to a gesture, never a turn reopened | **yes on the doctrine**, but locally it is **the only delivery path** (§1): it has therefore become a mandatory toll, and it runs on the user's Mac |

**Review: 7 “NO” (1, 5, 10, 11, 15, + 2 and 14 partials).** Five of them
bear a pattern that **explicitly names the microVM** — it is the signature of a
inherited constraint, not a product decision.

---

## 4. What is ALREADY delegated, and what is ALREADY settled

Read before proposing anything: **the feeling “we’re doing the work again
of opencode" is largely outdated.** The large delegation took place (MIN-286,
−18 100 lines: `agent-loop.ts` and `subagent.ts` deleted).

Are **already** in opencode: the round loop, the model call, the streaming, the
retries, context compaction, file and shell tools,
subagents, the system prompt, the end of turn criterion, the history of the
conversation.

And **three things this audit expected to find and which have already been found**:

| What I was looking for | Actual Condition |
| --- | --- |
| Export/replay of the log, useless locally since opencode SQLite persists for 7 days | **already short-circuited**: `if (local) return` in `syncJournal` ([supervisor.ts:1000](../../lib/server/agent/vm/supervisor.ts#L1000)), and restart probes the database instead of replaying ([:836-844](../../lib/server/agent/vm/supervisor.ts#L836-L844)) |
| The global layout that prevents two runs on a machine | **already set** (MIN-354, `HarnessLayout` per run) |
| The orphaned opencode server between two towers | **already set** (MIN-293, `children.json` + reread at ⌘Q and startup) |

**Design consequence: there is no longer any major delegation to be made.** This
which remains around opencode is the product (the thread, the ~37 domain tools, the
ledger, PR) and what opencode cannot do (cost per round, Stop,
the tower clock). **The relief requested is therefore not a transfer of
responsibility towards opencode: it is the removal of constraints.** The gain is
counts in deleted guardlines, not in delegated modules.

---

## 5. Parity — the six gaps that are visible in use

Compared to what Claude Code, Codex and bare opencode do on the machine of
someone. Ranked by **what it costs for a real shift**, not by
theoretical gravity.

### 5.1 The agent cannot rotate what he writes — *gap #1*

`run_background` removed (#10) **and** `webfetch` which refuses the loopback (#8). A
local agent can therefore neither launch `npm run dev`, nor go to see the rendered page,
neither launch a watcher, nor exercise a route. This is the most common feedback loop
short version that exists — and it's precisely the one that the desktop app makes possible
for the first time, since the port is that of the user's machine.

What others do: Claude Code launches substantive jobs and lists them;
bare opencode does not have a background mode but its `bash` is not cut.

**And the pattern is already there**: `children.json` exists and serves the server
opencode. Extending the registry to background jobs is a narrow task.

### 5.2 A question kills the round — *gap #2*

`ask_user` is terminal (#15). On the machine of someone who is **in front
screen**, a question should pause and resume — that's what it does
`POST /question/:id/reply`, measured (blocks without timeout, does not end the round).

The written pattern — the cost of an open microVM — is worth **zero** here.

This is the biggest product gain in the file, and it **removes** some code: the
current detour (rejection of the question → cut of the turn → answer which returns
disguised as a steering message for the next turn) is the most twisted path of the
harness.

### 5.3 The project file is a wall, but a wall of paper — *gap #3*

`external_directory: "deny"` (#5) + `git -C` refused (#3). A monorepo whose
packages are out of the attached folder, a neighboring repository to consult, a
`~/.config/…` to read: refused by tools, **reachable by the shell**.

What Claude Code does: reads wherever he wants, asks to **write** outside the cwd.

### 5.4 The deposit conventions are read half way — *gap #4*

`OPENCODE_DISABLE_PROJECT_CONFIG` (#14) closes the lift, and we re-serve
**only** the `AGENTS.md`/`CLAUDE.md` **from the root**
([supervisor.ts:294-306](../../lib/server/agent/vm/supervisor.ts#L294-L306) →
[opencode-config.ts:667](../../lib/server/agent/vm/opencode-config.ts#L667)).

Two distinct losses, and the second is the most embarrassing:

1. **Nested files are never read.** The mechanism nevertheless exists, and
   it is good: [repo-instructions.ts](../../lib/server/agent/repo-instructions.ts)
   is used lazily, on the first reading OR editing of a subfolder, the
   `AGENTS.md`/`CLAUDE.md` encountered between the root and the affected file
   (MIN-115 then MIN-247, borrowed from opencode). **He no longer has any points
   hook**: it stuck to the *result of the tool*, and the file tools
   now belong to opencode. `instructionFilesFor` and
   `formatTouchedInstructions` are therefore code without a caller on the only path
   who remains.
2. **On a local tour, the Minddy packaging is missing.** `readRepoInstructions` is not
   called only on the server side, where `host` is `null` locally — the comment says so
   in plain text ([execute.ts:1150-1156](../../lib/server/agent/execute.ts#L1150-L1156)).
   The *content* arrives well (opencode loads it using its `instructions` key), but
   **the border note does not accompany it**: the one which tells the model that these
   files are DATA about the project and not a source of orders
   ([repo-instructions.ts:53-54](../../lib/server/agent/repo-instructions.ts#L53-L54)).
   However, this is exactly the safeguard for prompt injection on a file that
   anyone can commit.

Same hatch: the **depot MCP servers** are closed. On the machine
the user, this is a capacity that Claude Code has and that we do not have.

### 5.5 The version ratchet — *gap #5*

Unknown permission → `reject` (#9). As is, `lsp`, `plan_enter`/`plan_exit`
(the opencode plan mode), `skill` and everything that 1.19 will add are refused
**by construction**. Combined with `OPENCODE_DISABLE_LSP_DOWNLOAD`, this means
that we will **never** have the LSP diagnostics glued back to the edition — the mechanism
same as [delivery-gate.ts:36-41](../../lib/server/agent/delivery-gate.ts#L36-L41)
cites as good form.

Refusal is the correct **default posture**; what is missing is the gesture that
raises: a list of authorized ones, reviewed at each version upgrade, rather than a
`default` who decides alone.

### 5.6 The cost of round trips — *gap #6, unmeasured*

`read: "ask"` (#6) **and** `bash: "ask"` (#7): **each read and each command
pays an HTTP** round trip in a local loop before executing. Neither Claude Code
nor bare opencode do that.

On a turn with 300 readings, it is 300 round trips to apply a rule which
fits in a glob (`*.env`), and 100% of the commands for a list which only targets
git. **Unmeasured** — and it is the most cost-effective measurement to make, because the
output is simple: the two rules are expressed in config ACL, where a `deny`
**short-circuited before publication** (measured, §1 line 1 of the previous audit).

⚠ **The price of this output, know before:** a global ACL cannot read
`bash -lc "git reset --hard"` nor `env -i git push`, which `command-guard` catches
today ([command-guard.ts:52-54](../../lib/server/agent/command-guard.ts#L52-L54)).
The choice is explicit: keep the round trip for these forms, or lose them.

---

## 6. What relief really removes

Counts reread, not estimated.

| Gesture | What leaves | What remains |
| --- | --- | --- |
| Return `git commit` to model (#1) | `ALWAYS_FORBIDDEN` loses `commit`/`push`, `refusal()` and its sentence, the 3 prompt lines which repeat it | `reset`/`restore`/`checkout --`/`clean -f` — they destroy human work, and it doesn't depend on any decision |
| `ask_user` blocking locally (#15) | question rejection, `abort`, `askedUser`, return by steering, `agent_question` branch of the report | all the way to the cloud, identically |
| Open `external_directory` (#5) | the dead `case` of [opencode-permissions.ts:279-283](../../lib/server/agent/vm/opencode-permissions.ts#L279-L283) (already named dead branch), the config line | `assertNotGit`, `resolveWithin`, `realPathOf` — they keep the **repository**, not the disk |
| ACL instead of `ask` on `read` (#6) | the round trip by reading, the `case "read"` | `isSecretFile`, also read by the secret scan |
| Return `run_background` (#10) | the filter line of `tools.ts` | to **write**: the registration of jobs in the children's register |
| Named Allowed Permissions (#9) | nothing | to **write**: the list, and a test that fails when opencode adds one |

**Order of magnitude: a few hundred guard lines, not
thousands.** The real gain from this project is **behavior** (§5.1, §5.2), not
of volume — and it must be said, because this is exactly the error that §11.3
from the previous audit had already had to correct once.

---

## 7. What must remain, whatever the decision

Non-negotiable, and none of these points restrict the model in his work:

1. **`git config` on the executing keys** (#4) — this is the only constraint of the
   batch whose victim is the user **after** the end of the run, in its own
   terminal. Nothing replaces it.
2. **`reset` / `restore` / `checkout -- <fichier>` / `clean -f` / `stash drop`**
   — they destroy uncommitted work which is not that of the agent. Claude
   Code does not refuse them, but Claude Code does not work in a
   session launched from a ticket, without anyone in front of the screen.
3. **`webfetch` to LLM proxy and tools bridge** — the bridge
   **does not authenticate anything**, and the proxy carries the model key. Refuse
   `localhost:3000` is collateral damage of this rule, not its purpose:
   the two are distinguished by the **port**, which is known to the supervisor.
4. **`websearch: false`** (#13) — cap and billing.
5. **The admission invariant** (§7 of the previous audit): an anchor run `pr`,
   webhook, mention, routine, channel or public board **does not leave
   never locally**. It's not a cage on the agent, it's a rule of
   routing — and that’s what loosens everything else.
6. **Local BYOK refusal** and LLM proxy path guarding.
7. **`scrubPaths` / `foreignPaths`** ([local-uplink.ts](../../lib/server/agent/vm/local-uplink.ts))
   — what goes up in `agent_run_events` is read by the entire project, 30 days.
   Opening reading outside the folder **increases** the stakes of this module; he doesn't
   does not restrict the one-byte model.

**Point #5 is the folder key.** This is because third-party content does not
never goes down on a machine as the local agent can be treated as a tool
of the user rather than as untrusted code. All the room to maneuver
of §8 depends on it.

---

## 8. Product owner decisions (2026-08-15)

Four decisions taken after reading this audit. **They cancel D3 of
2026-08-14** and replace the perimeter with a prompt rule backed by a
real question.

### D5. The entire disk, and writing elsewhere is WONDERED

The agent reads and writes wherever he wants on the machine, **but the system prompt tells him
requires explicitly asking the user before writing outside their
folder.**

**What it removes:**

- `external_directory: "deny"` ([opencode-config.ts:423](../../lib/server/agent/vm/opencode-config.ts#L423))
  and the corresponding `case`, already named dead branch
  ([opencode-permissions.ts:279-283](../../lib/server/agent/vm/opencode-permissions.ts#L279-L283));
- the wholesale refusal of `git -C` / `--git-dir` / `--work-tree`
  ([command-guard.ts:232](../../lib/server/agent/command-guard.ts#L232)) — this is
  the same perimeter, said by another word;
- **the refusal to write `case "edit"`** ([opencode-permissions.ts:241-254](../../lib/server/agent/vm/opencode-permissions.ts#L241-L254)):
  today `absoluteInRepo` RISES on any non-depot path. It is he who does
  the actual border, not the config line;
- therefore the symbolic link guard of
  [local-guard.ts](../../lib/server/agent/vm/local-guard.ts): it only exists
  to prevent `ln -s` from taking a write out of a scope that does not exist
  more. The custody of **name resolution** of the `webfetch` remains (§7.3).

**What that requires, and two points are hard:**

1. **The rule is a courtesy, not a wall — and it should be written as such.**
   A model who doesn't read it writes elsewhere without asking, and there's no stopping him.
   It is an accepted choice (§2 shows that the previous wall did not hold in any case
   than honest tools); what cannot be assumed is to describe it
   elsewhere as a guarantee. The opt-in screen should say what the agent can
   reach.
2. **TCC becomes blocking, and this was only a risk as long as D3 held.** The
   bundle does not carry any `NS…FolderUsageDescription` (§D4 of 08/14): as soon as
   the agent touches `~/Documents`, `~/Desktop`, `~/Downloads` or iCloud Drive,
   macOS refuses **and the request window doesn't even open**. The refusal is
   mute. And it costs a republication + a renotarization, so it doesn't
   not catch up at the end of the project.

**What becomes more important, not less:**
[local-uplink.ts](../../lib/server/agent/vm/local-uplink.ts). What rises in
`agent_run_events` is read by the entire project, 30 days — and the scope of
playback has just extended to the disc. `scrubPaths` / `foreignPaths` are now
the **only** barrier between personal files and the production base.

> **Track, to be decided by lot:** rather than `external_directory: "allow"`, the
> set **`ask` with automatic response `once` + a neutral event**. The
> verdict does not restrict anything, and the thread keeps track of each file output —
> exactly the opposite of the situation in §2, where the shell exited without leaving
> trace. Cost: one round trip on the 10 orders that publish.

### D6. The model commits, but only when asked

`git commit` is returned to the model. **By default it does not commit**: it leaves it
work in the tree and says what moved. It commits when the user
request — and it then follows the `AGENTS.md` / `CLAUDE.md` of the repository if any exist.

**What it removes:** `commit` from `ALWAYS_FORBIDDEN`
([command-guard.ts:94-101](../../lib/server/agent/command-guard.ts#L94-L101)), the
sentence from `refusal()` which promised a harness commit, and the two halves
contradictory [prompt.ts:177](../../lib/server/agent/prompt.ts#L177). **The
defect in §1 is closed by deletion.**

**What this requires:**

- **Serve nested conventions and their boundary notes** (§5.4). « Follow
  `AGENTS.md`/`CLAUDE.md`" only makes sense if the agent has read them: today he
  only has those from the root, and locally it receives them **without** the note that says
  that these are data and not orders. It's no longer a rank 3.
- **Rewrite the git block of the prompt once for good**: what the model does
  by default (nothing), what it does on request (commit), what remains refused
  (destroy work).

> **Sub-question left open, and I recommend closing it now:
> `git push`.** It was not in the question asked. Recommendation: **the
> leave refused**, because `create_pr` already has the remote (it mints it
> token, applies the delivery gate and connects the PR to the ticket) and that a `push`
> naked would bypass all three. The model commits locally, `create_pr` publishes.

### D7. `ask_user` suspends the tour locally

Restrained. `POST /question/:id/reply` blocks without timeout and returns control to the model
without completing the turn — already measured
([opencode-wait.probe.test.ts](../../lib/server/agent/vm/opencode-wait.probe.test.ts),
`MDY_OPENCODE_WAIT_LIVE=1`). The current refusal reason names the microVM
([supervisor.ts:1416-1427](../../lib/server/agent/vm/supervisor.ts#L1416-L1427)) and
is zero on a Mac.

**And this is what makes D5 applicable.** ⚠ **Order constraint, not a
preference:** “ask before writing elsewhere” requires a question
**blocking**. As long as `ask_user` ends the turn, the rule for D5 reads
“die before writing elsewhere” — the agent would ask his question, the turn
would stop, and writing would not take place until the next turn, if there is one.
**D7 must be delivered before D5.**

### D8. `run_background` is returned, with entry in the register

Retained, plus the distinction of the port for `webfetch` (§7.3) — the LLM proxy and the
tools bridge remain refused, the user's dev server passes. The
registry already exists
([vm/child-registry.ts](../../lib/server/agent/vm/child-registry.ts)) and serves the
opencode server; it must be extended to substantive jobs, which is what the comment from
[tools.ts:1350-1366](../../lib/server/agent/tools.ts#L1350-L1366) announced as
the condition of reopening.

---

## 9. Ordre de bataille

Each batch verifiable alone. **The order is not free between 1 and 3** (see D7).

| Bundle | Content | Decision | State (2026-08-15) |
| --- | --- | --- | --- |
| **0** | **Realign the three texts of §1** on the code | none — to do whatever happens | ✅ made (with lot 5) |
| **1** | `ask_user` suspends the tour locally; removal of the steering detour | D7 | ✅ done |
| **2** | `run_background` + registration in the child register; `webfetch` distinguishes port | D8 | ✅ done |
| **3** | Scope: `external_directory`, `case "edit"`, `git -C`, symbolic link guard — **and the prompt rule** | D5 (after 1) | ✅ done |
| **4** | TCC: `NS…UsageDescription`, republication + renotarization | D5 | ⚠️ **not applicable — the find was expired** |
| **5** | Delivery: `git commit` rendered, prompt git block rewritten | D6 | ✅ done |
| **6** | Nested conventions + local boundary note (§5.4) | D6 | ✅ done |
| **7** | List of authorized permissions + test that fails at the next opencode upgrade (§5.5) | none | ✅ done |
| **8** | Measure the cost of `read`/`bash` round trips, then ACL if it pays (§5.6) | measurement | ✅ done — `ask` kept, ACL does not pay |
| **9** | Repository MCP servers, `skill`, `todowrite` (§3 #11, #12) | to frame | ✅ done — implicit discovery closed, tools unchanged |

**Lot 0 leaves alone and immediately.** Lots 1 and 2 are those whose
difference can be seen in the first round.

---

### 9bis. What the implementation learned (2026-08-15, after the fact)

Three things the audit hadn't seen, and one it had missed.

**§1 was worse than described, and for a reason not in any of the three
cited texts.** The git block used for a LOCAL turn was not even that of §1:
`execute.ts` composes the anchor with `currentRepo: isCurrentRepoJob({repoMode})`,
or `repoMode` is the constant `"clone"` — a placeholder that the MACHINE
replaces with `"current"` (`assignmentToJob`), **after** the anchor has been
compound. The local tour therefore read the CLOUD block: “the harness commits and
pushes whatever you changed at the end of each turn”. Fourth version of the same
fact, and the most false. The fact to tell the model is `run.local_exec`, not a
field that someone else will write later.

**Batch 4 was already done.** The six `NS…UsageDescription` (Documents, Desktop,
Downloads, RemovableVolumes, NetworkVolumes, Microphone) are in
`desktop/electron-builder.yml` since MIN-359 — i.e. **before `1f1ad7d`**,
the basis for reading that this audit gives itself. Neither republication nor renotification to
predict. To check before reopening: `git show 1f1ad7d:desktop/electron-builder.yml`.

**Lot 6 no longer had a possible attachment point, and one was needed
new.** `collectTouchedInstructions` stuck to the result of a tool
file ; these tools belong to opencode. Measured in binary 1.18.16:
`InstructionContext.observe` goes up the `AGENTS.md`, but **between the
`directory` of the session and the project root only**, and under
`OPENCODE_DISABLE_PROJECT_CONFIG` — so never at our house. The nested ones pass
now by a **single document** that the supervisor composes and limits
(`formatServedInstructions`), served in `instructions`: this is the only form that
allows both to limit what enters the system prompt (opencode reads EN
WHOLE what we call it) and put the border note once.

**And a writing trap, for next time**: “SUSPENDS” contains
“ENDS.” A test that asserts `not.toContain("ENDS your turn")` on the text that
says `SUSPENDS your turn` cannot pass. Prompt assertions relate to
the entire sentence, never on the verb.

**The token `.git` of `command-guard`** (§3 #2) is not in any batch: it remains
refused. It's the only remaining perimeter that still retains something real
(user repository hooks), and its cost — not being able to `cat
.git/HEAD` — est nul, `git` knows everything about its own state.

---

### 9ter. Measurements of batches 8 and 9 (2026-08-15)

**Lot 8 slices to keep the back and forths.** The probe
[`opencode-cost.probe.test.ts`](../../lib/server/agent/vm/opencode-cost.probe.test.ts)
measurement, on `opencode-ai@1.18.16` and 30 calls, an additional cost of 0.40 ms per read
and 5.67 ms per command. The ACL pattern `*.env` covers the root well,
subfolders and paths outside the repository, but its refusal is generic: it does not
cannot direct the model to `.env.example`. The gain does not compensate for this
loss of guidance nor the inability of an ACL to understand a shell command
composed. **Decision: `read: "ask"` and `bash: "ask"` remain.**

**Lot 9 closes a discovery that was not documented.** The probe
[`opencode-capabilities.probe.test.ts`](../../lib/server/agent/vm/opencode-capabilities.probe.test.ts)
establishes that `skill` reads `~/.claude/skills`, `~/.agents/skills` and the skills of the
deposit from `$HOME`, independently of the `XDG_*` folders relocated by the
harness. `OPENCODE_DISABLE_EXTERNAL_SKILLS=1` cuts this implicit discovery
while still letting an explicitly named `skills.paths` list work.
**Decision: `skill` remains disabled and the hatch is placed in all
worlds; the day Minddy uses his own skills, he names them.**

`todowrite` does not publish any permissions and does not write anything outside of opencode:
its withdrawal remains a choice of product (a single checklist), not a saving of
network. The real shared write is the mirror of `update_plan` to the ticket;
the supervisor no longer replays it for a strictly identical shot,
while keeping each event in the log. Finally, the MCPs declared by the
deposit remain cut off by `OPENCODE_DISABLE_PROJECT_CONFIG`, while an MCP
explicitly provided in the Minddy configuration remains possible.
