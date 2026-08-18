# Replace our agent loop with headless opencode

> **DECISION TAKEN on 2026-08-12: here we go.** The three probes from batch 0 pass
> (recovery §2.2, cost §2.5, packaging §2.7), none reduces the work, and
> Clément validated the turn. The fallback that the plan envisaged — “opencode in a
> tower, checkpoint house around” — is irrelevant: the recovery works. This
> document ceases to be an instruction file to become the **reference of
> implementation** of lots 1 to 3.
>
> **Date**: 2026-08-12 · **Ticket**: MIN-286
>
> **Pinned bases**: minddy at `77a7503`; **opencode `opencode-ai@1.18.16`**
> (npm, MIT license), the native binary, not the repository.
>
> **Method.** Everything this document claims about opencode has been **measured on this
> binary there**, headless server started and controlled in HTTP: the public doc is
> silent or false on at least five of the points which decide the construction site. When
> a line comes from a source reading and not from an execution, it is said.
> The measures that cost the model (real OpenRouter key, disposable repository) are
> dated and quantified; surface measurements (list of tools, config diagram,
> agents, permissions) cost nothing and are replayed in thirty seconds:
>
> ```bash
> opencode serve --port 4211 --hostname 127.0.0.1 # OPENCODE_DB=/tmp/oc.db
> curl -s "localhost:4211/experimental/tool/ids?directory=$REPO"
> curl -s "localhost:4211/experimental/tool?directory=$REPO&provider=openrouter&model=$M&agent=build"
> curl -s "localhost:4211/api/agent?directory=$REPO"
> curl -s localhost:4211/doc # Full OpenAPI: 162 routes
> ```
>
> **This document is not a comparison.** The “who is worth what” file is
> [docs/harness-2026-08.md](harness-2026-08.md), and it is still relevant.
> Here, the decision is made: we adopt opencode. The following is the **border**
> and the **parity inventory** — what ceases to be our code, and what must
> stay that way.

---

## 1. The border

The microVM runs `opencode serve`. A thin **supervisor** — the current one
[vm/main.ts](../lib/server/agent/vm/main.ts), emptied of its loop — the driver
HTTP, translates its `/event` stream into `agent_run_events`, and returns the `VmTurnReport`
that the control plan is already waiting
([vm/protocol.ts](../lib/server/agent/vm/protocol.ts)). The Vercel function does not
does not change roles: it launches, it serves the control plane, it does not loop.

| Stay with us, and forever | Switch to opencode |
| --- | --- |
| The control plan and its routes | The trick loop (prompt → tools → response) |
| The ledger, quotas, ceilings | The model call, streaming, retries |
| The product events thread (`agent_run_events`) | Output truncation, compaction |
| **domain** tools (ticket, notebook, pages, PR) | **File** tools and the shell |
| The Forge (clone, branch, commit, push, PR) | Session state (SQLite + event log) |
| Delivery rules (gate, self-review, plan closure) | Delegation to sub-agents |

**No secrets enter the VM.** Unchanged: the `transform` of the firewall sets the
key output, opencode sends the placeholder (`llmPlaceholderKey` of `VmJob`).
The mirror test of
[vm-bundle-secrets.test.ts](../lib/server/agent/vm-bundle-secrets.test.ts) must
exist for the `OPENCODE_CONFIG_CONTENT` product.

**What this shift implies, and what needs to be said**: we adopt the release cadence
by a third on the most critical path of the product. This is the assumed price — the
same reasoning as “we build a tracker, not a code agent”.

---

## 2. What was measured

### 2.1 The five points of parity (2026-08-12, real run, ~$0.01)

| Question | Measurement |
| --- | --- |
| Cost traceability | **Per assistant message, therefore per round**: `cost` (USD) + `tokens {input, output, reasoning, cache:{read, write}}` + `modelID` + `providerID` + `finish`. Reported: `cost: 0.000994616`, `cache.read: 1792`. |
| Choice of model | **By request**: `model: {providerID, modelID}`. Two models in the **same** session, each billed at its own price (deepseek $0.00026 then haiku $0.0114). 345 OpenRouter models loaded with price and window. |
| BYOK | `provider.<id>.options.{apiKey, baseURL}` in config, and `OPENCODE_CONFIG_CONTENT` / `OPENCODE_AUTH_CONTENT` pass **everything by environment variable, without file**. |
| Domain Tools | An in-house tool filed in `.opencode/tool/*.ts` is **served to the model and called**: `read_minddy_issue(identifier: "MIN-286")` → complete call with `callID`, `input`, `output`, start/end timestamp. |
| Interruption | `POST /session/:id/abort` renders in **40 ms**, the in-flight request completes properly. |

### 2.2 The recovery — the point that could kill the site (2026-08-12, $0.006)

Two servers isolated by `OPENCODE_DB`, base B **empty**, repository B **recloned to one
other path**. `POST /sync/history` exports history in **events**
(`{aggregateID, seq, type, data}`), `POST /sync/replay` plays it again at B:
session restored **with its id**, its 9 messages, its cumulative cost identically
($0.00393204), and the model **returned the secret word from the first round** on a
machine that had never seen the conversation. **86 events, 61 KB, replay in 95 ms.**
And it's **incremental** by `seq`: 5 events / 3.6 KB for the last round.

Three consequences:

- **(a)** the checkpoint ceases to be a big document rewritten every turn: it
  becomes an **append-only journal**. `VM_MAX_CHECKPOINT_BYTES`
  ([protocol.ts:52](../lib/server/agent/vm/protocol.ts)) and all `fitCheckpoint`
  become irrelevant;
- **(b)** the `projectID` of opencode is the **hash of the first commit** of the repository,
  not a path (`2be2c2a3…` on the probe repository): a new clone in a
  new microVM falls alone on the correct project identity;
- **(c)** trap that no doc says: the export returns **snake_case**
  (`aggregate_id`), the replay expects **camelCase** (`aggregateID`).

What **does not travel**: uncommitted work. Expected, and already covered by the
WIP branch pushed at end of turn.

### 2.3 What the surface of the binary says (measured on 2026-08-12, zero cost)

- **14 integrated tools**, and not one more:
  `invalid, question, bash, read, glob, grep, edit, write, task, webfetch, todowrite, websearch, skill, apply_patch`.
- **Two of them are conditional, and the condition is ours.**
  `apply_patch` replaces `edit`/`write` on `gpt-*` models — measured:
  `openai/gpt-5.5` receives `apply_patch` **without** `edit`/`write`, `deepseek-v4-flash`
  receives the opposite. It's exactly `usesApplyPatch`
  ([patch.ts](../lib/server/agent/patch.ts), MIN-115), already rendered.
- **`websearch` is NOT served on `openrouter`** — measured: absent from all three games
  of tools rendered. The source confirms this (`webSearchEnabled`: provider `opencode`,
  or Exa / Parallel key). **Our `web_search` therefore does not disappear**: it must be
  a domain tool anyway, which the cap and billing required
  already (§3).
- **`read` also reads directories** (“For directories, entries are returned one
  per line … with a trailing `/`"). `list_dir` therefore has a counterpart, unlike
  what we believed.
- **`bash` is a PERSISTENT** shell (“a persistent bash session”), with `workdir`.
  This is a **correction of a defect from us**: our `runShell` starts again from a
  `sh -c` nine on each call, and 29 production commands prefix a `cd`
  ([agent-harness-comparison.md](agent-harness-comparison.md) §3.6). Timeout by
  default 120 s (ours: `RUN_COMMAND_TIMEOUT_MS` = 180 s, to be reported in config).
  Truncation at 2,000 lines / 50 KB with switch to a rereadable file —
  adjustable by `tool_output.{max_lines, max_bytes}`.
- **`task` knows how to take a girl and put her in the background**: `task_id` continues
  session of a subagent, and the launch in the background is notified upon return. Our three
  delegation tools (`spawn_agent`, `agent_status`, `list_agents`) fall into
  this one more `/experimental/session/:id/background`.
- **The agents delivered cover our two sub-agent modes**:
  `explore` (`subagent` mode) already carries our doctrine — `* deny` permissions,
  then `grep/glob/read/webfetch/websearch allow`. `general` = our `implement`.
  Read-only is a **property of the permission set**, not a sentence.
  prompt: same doctrine as `subagentToolsFor`.
- **Permissions are an ordered ACL**, not three booleans:
  `{action, resource, effect: allow|ask|deny}`, last winning rule, `resource`
  overall. The delivered `plan` agent shows this: `edit * deny` then
  `edit .opencode/plans/*.md allow`. This is what expresses our `writesToRepo: false`
  of a proofreading session.

**⚠ The `read *.env ask` delivered by default was NEUTRALIZED by our config
  (corrected in MIN-360).** The binary ruleset works well
  `read: {"*": "allow", "*.env": "ask", "*.env.*": "ask", "*.env.example": "allow"}`
  — that sentence was true. What was missing is the following: **our rules are
  concatenated AFTER**, and the last one to match wins. Our `read: "allow"`
  therefore deleted the question, in the two places where it was written (the map
  global, and the literal of the `explore` subagents, that is to say precisely those
  whose job is to read). No consequence on a disposable clone; in fashion
  current repository, it is the `.env` **real** of the user who entered silently
  in the context of the model.
  Since MIN-360, `read` changes to `ask` **on the local path** and the verdict is
  we ([opencode-permissions.ts](../lib/server/agent/vm/opencode-permissions.ts)):
  take control rather than redeclare their glob, because an ACL that we do not
  control not depends on the concatenation order and glob semantics of a
  version. **A general reading to take from it: what opencode book does not survive
  our config only if we rewrite it.**
- **The config carries everything parity needs** (OpenAPI schema):
  `agent.<id>.{prompt, tools, permission, model, temperature, maxSteps}`,
  `tools` (card name → boolean; **be careful, it does not REMOVE the built-in, it
  changes it to `deny`** — it's the agent's toolset that does it
  disappear, cf. §2.8), `instructions[]`, `subagent_depth`
  (our one-level hierarchy), `plugin[]`, `provider`, `small_model`,
  `compaction.{auto, prune, tail_turns, preserve_recent_tokens, reserved}`,
  `shell`, `tool_output`.
- **162 routes** in total, including those on which the supervisor depends:
  `/session/:id/{prompt, wait, interrupt, permission/:id/reply, question/:id/reply, message, history, event}`,
  `/global/health`, `/event`, `/config/providers`, `/experimental/tool`.

### 2.4 Trap: the server carries TWO generations of API

The same binary serves `/session/*` (legacy) **and** `/api/session/*` (v2), and they
**do not have the same roads**. Noted in the OpenAPI of 1.18.16:

| What the supervisor needs | Where is it |
| --- | --- |
| `abort`, `children`, `fork`, `shell`, `prompt_async`, `diff`, `todo` | **legacy**: `/session/:id/…` |
| `wait` (⚠️ **answers 503**, cf. §2.10), `question/:id/reply`, `history`, `context`, `interrupt`, `compact` | **v2**: `/api/session/:id/…` |
| `message` (POST = post a trick), `permission/:id/reply` | the **two** |

There is **no** `POST /session/:id/prompt`: on the legacy side, posting a trick is
`POST /session/:id/message` (blocking, makes the assistant message complete — this is what
that the probes use), and `prompt` only exists on `/api`. A fault of a
segment does not return a 404 but **the TUI HTML page**, therefore a
`JSON.parse` which explodes on `<!doctype`: error encountered, please note.
For a long spin, the pair is `POST /session/:id/prompt_async` (204 immediate)
then `POST /api/session/:id/wait` — two different prefixes for the two halves
with the same gesture. To be isolated in a single client, otherwise the fault will be repeated everywhere.
And `/sync/history` renders `snake_case` (`aggregate_id`) where `/sync/replay`
expects `camelCase`: it's **in the diagram**, it's not a probe accident.

### 2.5 The cost: ZERO difference over 5 generations (2026-08-12, $0.008)

This was the question that decided the connection of the ledger. **It is cut, and
in a good way.**

Assembly: a **local proxy** between opencode and OpenRouter (`baseURL` pointed to
`127.0.0.1`), which relays as is and notes the `id` of each generation read in the
SSE flow. After the turn, `GET /api/v1/generation?id=…` returns the **charged** cost of
each. Five generations, two models, one real ride with `read`, `bash` and `glob`.

| # | Model | opencode `cost` | Billed by OpenRouter | Gap |
| --- | --- | --- | --- | --- |
| 1 | `anthropic/claude-haiku-4.5` | 0.00246325 | 0.00246325 | **0** |
| 2 | `anthropic/claude-haiku-4.5` | 0.00148755 | 0.00148755 | **0** |
| 3 | `anthropic/claude-haiku-4.5` | 0.00162075 | 0.00162075 | **0** |
| 4 | `anthropic/claude-haiku-4.5` | 0.00123180 | 0.00123180 | **0** |
| 5 | `deepseek/deepseek-chat-v3.1` | 0.00113352 | 0.00113352 | **0** |

Exact **round by round**, not just on the total, and **cache included**: the
division into tokens is also reconciled to the nearest unit
(`input + cache.read + cache.write` = `native_tokens_prompt` out of five).

**And yet opencode does not ask OpenRouter about the cost.** It calculates it,
catalog price models.dev × tokens, in exact decimal
(`Session.getUsage`, `session.ts:337`) — no `usage: {include: true}` is
sent. The equality comes from the fact that models.dev **copies** the OpenRouter grid.
What is concluded, and what is not concluded:

- ✅ **the `cost` of opencode can be used in the ledger as is**: it is not a
  5% approximation, it's the same number;
- ⚠️ **the risk is not arithmetic, it is CATALOGUE.** A price that changes
  at OpenRouter and hanging around at models.dev, a model routed to a
  underlying supplier to another tariff, a variant `:floor`/`:nitro`: there,
  the gap will appear, and nothing in opencode will point it out.

> **Adjusted since, in batch 1 (§2.8)**: we no longer depend on the models.dev catalog.
> The provider we declare bears **our** prices, read in the OpenRouter index — the
> same source as the multiplier and the plan ceiling. The risk of drift
> becomes a risk on OUR index, which we already know how to monitor.

### 2.6 `generation_id`: recoverable, for ~40 lines

Opencode doesn't expose it anywhere — the keys for a helper message are
`id, sessionID, role, time, parentID, modelID, providerID, mode, agent, path, cost,
tokens, finish`, and that's it. **But the probe recovered it 5 times out of 5** in
interposing: this is the local proxy of §2.5.

Transposed into production, it works: the `baseURL` of opencode becomes
`127.0.0.1:<port>` **in the microVM**, the supervisor relays to the URL of
real completion — always with the placeholder, therefore always transformed by the
firewall, `network-policy.ts` unchanged and no secrets in the VM. The proxy is
also the place to put `usage: {include: true}` if you want the cost of
supplier rather than that of the catalog.

**Recommendation**: connect the ledger to the opencode `cost` (`estimated: false`,
it is the same number), and place the proxy in the supervisor from batch 1 — it does not
costs almost nothing, it makes `generation_id` for support and reconciliation,
and it is he who will catch up with a catalog drift the day it arrives.

### 2.7 Packaging in the microVM: yes, and startup costs 1.3 s

Measured on 2026-08-12 in a **real** Vercel Sandbox microVM, runtime `node24` —
the same as the agent code (`SANDBOX_RUNTIME`,
[repo-host.ts:37](../lib/server/agent/repo-host.ts)) —, 2 vCPU, 4.28 GB RAM. The
probe is in the repository and is replayed:
[opencode-packaging.probe.test.ts](../lib/server/agent/vm/opencode-packaging.probe.test.ts).

| Measurement | Value |
| --- | --- |
| `npm i opencode-ai@1.18.16` | **10.6 s** (10.6 / 11.5 / 11.8 / 9.5 s over four passes) |
| Weight on disc | **351 MB** of `node_modules` (native binary: 144 MB) |
| Cold start → `/global/health` | **1336ms** |
| Hot start | **1238ms** |
| Getting started without an online catalog (`OPENCODE_DISABLE_MODELS_FETCH=1`) | **1248ms**, `healthy: true` |
| Tools served in the VM | the 14, identical to the position |

**What this actually changes**: the only real cost is the **installation**, not the
startup. And it deletes itself — `sandbox.ts` already knows how to boot from an image
pre-heated (`AGENT_SANDBOX_SNAPSHOT_ID`). **Recommendation: bake opencode in
this snapshot**, and the cost of turning on the critical path drops to ~1.3 s per
new microVM.

**DONE on 2026-08-12**:
[scripts/create-agent-snapshot.ts](../scripts/create-agent-snapshot.ts) installs
opencode in `/vercel/oc` before freezing the image, and the question that remained
open is decided by the measurement — **`/vercel/oc` survives well when taken
image**, while it is outside `/vercel/sandbox`, the working directory of
runs. The script therefore replays a reboot on its own snapshot and does not announce the id
that after seeing `opencode --version` respond to it: without this control, a
image which would not have cooked anything would make a perfectly valid id, and the only trace
would be a slowness that no one ever connects with here. Reading: **12 s
installation, 351 MB, 0.54 GB image**, `expiration: 0` (**never** — one
base snapshot is a product image; those of runs expire well).

Two consequences written in code rather than in memory:

- the snapshot must be replayed after any `OPENCODE_VERSION`** bump;
- and if we forget it, `opencode-host.ts` now compares the version **placed on the
  disk** to its pin, and reinstalls when they diverge. A simple test
  of existence would have found yesterday's binary very good, and all the runs
  would have run on the old engine while the depot swears to the contrary.

Starting without an online catalog also works, which means that a run does not
does not depend on the availability of models.dev — to be confirmed on **prices**
(the onboard catalog must be fresh, see the risk of drift in §2.5).

**RECIPE TRAP, and it cost three passes**: in a `sh -c` of the Sandbox,
launch a server in `nohup … &` (or `setsid … &`, redirected fds, `</dev/null`
included) **drops the RPC command** — `TypeError: terminated` /
`UND_ERR_SOCKET` in ~25 s, without a single output line, and the `detached: true`
of the SDK changes nothing. The same server **in the foreground starts perfectly**.
The form that works: keep the server in the foreground, read the line
“listening” on the tube to time, query the API from the same
command, and limit everything by `timeout` under the 75 s at the end of which the socket
RPC exits anyway. This is the shape of the probe.

### 2.8 The configuration of a lathe: four measurements which outline it (lot 1, zero cost)

Measured on 2026-08-12 by writing [opencode-config.ts](../lib/server/agent/vm/opencode-config.ts),
on the same binary, with a **fake local OpenAI-compatible endpoint** — it makes
a canonical SSE flow and **logs the body of each request**. This is what
allows you to check what really goes into the model without spending a cent, and
three of the four points below are ONLY seen there.

1. **A model declared without `cost` makes `cost: 0`.** Exact tokens
   (`input: 1000, output: 200`), zero cost. With `cost: {input: 3, output: 15}`
   declared in the provider, opencode renders **0.006 $** — exact to decimal.
   **Consequence, and it is structuring**: we declare **our own
   provider** (`minddy`, on `@ai-sdk/openai-compatible`, the only layer that our
   five providers all speak) **with OUR prices**, those of the OpenRouter index. The
   cost that opencode renders is then ours, and the only risk that the probe of
   cost had left open — the **catalogue drift** models.dev (§2.5) —
   disappears. Hence `VmJob.pricing` ([protocol.ts](../lib/server/agent/vm/protocol.ts)),
   filled by `getModelPricing` ([model.ts](../lib/server/agent/model.ts)) from
   the same index, including cache. Unknown prices (BYOK excluding index) → no `cost`,
   and the usage should be written `estimated` rather than zero.
2. **`reasoning_effort` flat is REMOVED from the body** on the main call —
   opencode has this key. The **nested** form `options.reasoning = {effort}`
   passes intact, and any field (`extra_marker`) also passes: this is not
   so not a general filter, it's this key. The trap is that she survives
   on the small model** (title), so a cursory check sees it
   leave. For us: OpenRouter is served (it is already our form,
   `reasoningField: "reasoning"`), but compat layers **openai / anthropic /
   google lose their level of reasoning** in 1.18.16 — it's the local proxy
   of the supervisor (§2.6) who will reinject it, its second reason for being.
3. **`tools: {x: false}` does not REMOVE the built-in `x`**: it remains used in the model
   and opencode makes it a `deny` permission (measured on `todowrite`). What
   made disappear, it is the tool set of the **agent** (`agent.<id>.tools`).
   The config therefore poses both — the global map for permission, the set of
   the agent for the absence. §2.3 said “this is how `websearch` and
   `todowrite` will come out”: true of the result, false of the mechanism.
4. **`agent.<id>.prompt` REPLACES the built-in system prompt**, and `instructions`
   is a list of **file paths** whose contents are appended to the message
   system (marker found in the body). Minddy anchor travels so by a
   file written under `HARNESS_DIR`, outside the repository. Incidentally: an id of
   **slash** model (`minddy/deepseek/deepseek-chat-v3.1`) is cut at FIRST
   slash and resolves correctly, from the config to the request body.

### 2.9 Domain tools: 32 out of 32, with our diagrams (lot 1, zero cost)

Measured on 2026-08-12 by writing [opencode-tools.ts](../lib/server/agent/vm/opencode-tools.ts),
and **replayable**: [opencode-tools.probe.test.ts](../lib/server/agent/vm/opencode-tools.probe.test.ts)
(kept by `MDY_OPENCODE_TOOLS_PROBE=1`) installs the binary, writes the files
production, starts a server and compares the schemas served to ours. **7.5 sec.**

| What you needed to know | Measurement |
| --- | --- |
| Are our tools used? | **32 of 32**, byte-identical descriptions, structurally identical schemas (types, enums, descriptions, required/optional sharing). |
| Is a tool really CALLED? | Yes, end to end: model → tool generated → local bridge → result in the conversation, with `callID` and `sessionID`. |
| Does anything need to be installed? | No. `@opencode-ai/plugin` is resolved by the binary runtime; no `node_modules` to set. |

Three traps, and the first decides the shape of the generator:

1. **Two forms of declaration, only one usable.** The bare object
   (`export default { description, args, execute }`) treats `args` as a
   card *name → schema* and **makes EVERYTHING mandatory** — put a JSON Schema on it
   complete produces an absurd schema (`required: ["properties",
   "additionalProperties"]`, measured) that the model receives as is, without a
   error. The form `tool({...})` accepts `tool.schema` (zod) with `.optional()`
   and renders the diagram exactly. Our tools have optional parameters everywhere: the
   generator **thus emits zod**, translated from the `tools.ts` schematics.
2. **A tool can live outside the repository**: `$XDG_CONFIG_HOME/opencode/tool/*.ts`
   is loaded as the `.opencode/tool/` of a project. It's not a
   preference — in the repository, the 32 files would go into the `git add -A`
   end of turn and would be committed to the user.
3. **`process.env` is readable from a tool**, which allows the address of the
   bridge to go down without being hardwritten in the generated code.

**An assumed shift in framing**: the generated tool is sent to the **supervisor**
(127.0.0.1) and not directly to the control plane. The guarantee does not change —
it is the supervisor who makes the outgoing call, therefore always the OIDC of the firewall and
no secrets in the VM — but it makes possible what a direct call
prohibited: TOUR counters (web search ceiling, image ceiling,
review anchors already installed), `create_pr` which is cut in two (the VM pushes, the
function opens), and the delivery rules which must see the calls made.

**What remains open, and which will have to be decided in lot 2**: the IMAGES. The tool
generated renders text; `read_resource` on a mockup today renders an image
that the model really looks (MIN-111). The execution context of a tool
opencode exposes `metadata` and shares — to measure before plugging in the ledger.

### 2.10 Driving a tour: two routes in §2.4 are wrong (lot 1)

Measured on 2026-08-12 by writing to the customer
([opencode-client.ts](../lib/server/agent/vm/opencode-client.ts)) and the
supervisor ([supervisor.ts](../lib/server/agent/vm/supervisor.ts)).

| Road | What §2.4 said about it | What she does |
| --- | --- | --- |
| `POST /api/session/:id/wait` | half v2 of the prompt/wait couple | **503** — “Session wait is not available yet”. It is in the OpenAPI, the server does not implement it. |
| response to permission | `POST /permission/:id/reply` | It EXISTS and this is the one we need (corrected in batch 2, §2.13): body `{reply, message?}`. `POST /session/:id/permissions/:permissionID` also works but is `deprecated` **and has no `message`**. |

Direct consequence, and it is better than the plan: **the end of a turn reads
on `session.idle` of the `/event`** stream, which we consume anyway for the thread.
No HTTP request remains open during the hours that a tour lasts.
Verified end-to-end against binary: health, session creation,
`prompt_async` (204), flow to `session.idle`, `abort` (200).

**The trap of snake_case (§2.2) also bites ON READING**, and this is the fault that
the first draft of the supervisor carried: the incremental export cursor drifts
of `aggregateID`, which `/sync/history` **does not send** (it returns `aggregate_id`). The
cursor therefore remained empty, and each turn re-exported the entire history — which
grows until it no longer passes, without any test falling. Normalization is
now done **from the reading**, not just before the replay. Recorded on the
binary: 131 events exported, all in camelCase after client passage.

### 2.11 The three probes from lot 0, together

| Probe | Verdict | Cost of measurement |
| --- | --- | --- |
| Resumption of a session on another machine | **pass** — replayable, incremental event log | $0.006 |
| Cost per ledger | **pass** — zero gap, `generation_id` recoverable | $0.008 |
| Packaging in microVM | **pass** — 1.3 s startup, 10.6 s install removable by snapshot | a few minutes of Sandbox |

None block. The site can move on to lot 1 — remains the **decision** of
Clément, who is a point of the plan in her own right.


### 2.12 The ledger of a round: the proxy is installed, and the flow is that of the SERVER (batch 2)

Written on 2026-08-12 by plugging in `ai_usage`
([supervisor.ts](../lib/server/agent/vm/supervisor.ts), `TurnLedger`;
[llm-proxy.ts](../lib/server/agent/vm/llm-proxy.ts)).

The proxy of §2.6 **exists**: opencode speaks to `127.0.0.1`, the supervisor relays
to the provider with the placeholder, `network-policy.ts` does not change. He makes
three things which have no other point of observation — the `generation_id`, the
**charged cost** (`usage: {include: true}`, which takes precedence over the one that opencode
calculates), and the flat `reasoning_effort` that §2.8 had seen disappear from the body.

What the connection revealed, and which no doc says:

1. **The `/event` flow is that of the SERVER, not of a session.** When the model
   delegates, the girl opens her own session and her frames arrive mixed with those
   of the mother. Three faults resulted, all silent: a `session.idle`
   of girl **finished the round**, the girl's text entered the response
   (therefore in the commit message), and its expenditure fell within the band of
   `seq` of the parent. Everything that is translated now carries its `sessionId`, and
   girls write in the band `subagentUsageSeq` — the convention of the
   home loop, so that the order of a run reads the same on both engines.
2. **The trick answer was ALWAYS empty**, and the test that showed it didn't exist
   step: `message.updated` (end of round) arrives **before** `session.idle`, and it is
   him who empties the live text. The trick read his answer in this already emptied bag.
   The thread displayed nothing and the commit message fell back to its generic form.
   The last completed round is now kept separate (`replyOf`).
3. **The checkpoint must have `usageSeq`.** `execute.ts` rereads it
   (`run.checkpoint?.usageSeq ?? …`); without him, a repeated turn renumbers his
   lines over those of the previous round. Nothing is lost - no constraints
   of uniqueness, the expense is summed — but the order of the calls of a run becomes false,
   which is exactly what a `seq` is used to say.

**The spending cap is held in the same place**, at the round border: the
accumulation of `message.updated` against `budgetUsd`, reread every minute
(`BUDGET_REFRESH_INTERVAL_MS`, moved to [agent-models.ts](../lib/agent-models.ts)
so that the supervisor does not reimport the loop that batch 3 deletes), then
`abort` and status `budget_exhausted` — not `error`, otherwise the function would retry
a run that no longer has enough to pay for. **What remains to be measured**: what opencode
invoice for a round cut in flight. If it places a `finish` on the aborted message, the
line is written like an ordinary round; otherwise the expense comes out of the meters, and
this is the fault that MIN-216 had closed on the home loop side
([abandoned-spend.ts](../lib/server/agent/abandoned-spend.ts), kept for this).

The round → generation pairing is done by model, then by output tokens,
otherwise in order of arrival: **exact sequentially**, only probable when
two girls run in parallel on the same model. What is at stake here is a
reconciliation reference, not an expense — the tokens and cost come from the
round, never pairing.

### 2.13 Safeguards and `ask_user`: what the permission publishes (batch 2)

Measured on 2026-08-12 with a **fake local provider** who scripts calls from
tool — the model does not rotate, the measurement costs nothing, and it relates to the real
binary ([opencode-permissions.ts](../lib/server/agent/vm/opencode-permissions.ts)).

| What we wanted to know | Measurement |
| --- | --- |
| What a permission publishes | `permission.asked` → `{id, sessionID, permission, patterns, metadata, always, tool: {messageID, callID}}`. **Legacy form**, not `permission.v2.asked`. |
| Does `bash: "ask"` ask for everything? | **Yes**, including `echo hi`: `metadata.command` carries the command. The guardrail therefore sees exactly what `run_command` saw. |
| What a writing publishes | `permission: "edit"`, `metadata.filepath` **ABSOLUTE** (+ a `diff`), whatever the tool (`write`, `edit`, `apply_patch`). Outside of the deposit, a `external_directory` precedes it. |
| How a rejection speaks to the model | `POST /permission/:id/reply {reply: "reject", message}` → the tool returns to `error`: “The user rejected permission … with the following feedback: *message*”. The refusal therefore remains **a tool error**, like with us. |
| What `question` does | `question.asked` → `{id, sessionID, questions: [{question, header, options: [{label, description}], multiple}], tool: {callID}}`, and the tool **BLOCK** until `POST /question/:id/reply` or `/reject`. |
| What a `abort` leaves behind | The tool in flight goes to `error` (“Tool execution aborted”) and the history **remains matched**: the next round starts again without a hole. |

Three consequences, and two of them correct code already written:

1. **`.git/` is not kept by anyone at opencode** — measured: one `write` on
`<repository>/.git/config` was **executed** and overwrote the file. It's
   exactly what `assertNotGit` protects (write a hook or a `config` =
   exfiltration of the installation token). Hence `permission.edit: "ask"` on a
   session which writes, where batch 1 had put `allow`: it is the `ask` which gives
   hand to the supervisor. The connection trap, caught by a test:
   `resolveWithin` takes a **relative** path and pastes an absolute under the repository
(`/etc/passwd` → `<repository>/etc/passwd`), so does not refuse anything — but `filepath` is
   absolutely absolute.
2. **A `abort` publishes `session.error` `MessageAbortedError`.** We cut
   ourselves in three WANTED cases (spending ceiling, question asked, deadline):
   without filter, each wrote a `error` event to the thread and a
   `errorMessage: "Aborted"` over the real pattern. The translator dismisses it.
3. **`ask_user` remains TERMINAL, against the grain of opencode.** With us the session
   goes on hold and the response comes back the next turn via the steering; at
   opencode the tool blocks, and keep a microVM open for the time that a human
   coming back would cost hours of computing time to do nothing. The supervisor
   therefore emits our event `question` (same payload, the feed map knows nothing
   of the engine), **dismisses** the question and **cuts** the session — both gestures
   leave a matched history. The `question` permission **is not
   consulted**: what really removes `ask_user` from a routine is the game of
   tools of the agent, not the ACL.
### 2.14 Sub-agents: the name of the agent IS the model (batch 2)

Measured on 2026-08-12, same setup as in §2.13 (fake local supplier, zero cost),
plus a reading of the binary. Five measures, three of which correct the framing:

| What we wanted to know | Measurement |
| --- | --- |
| Does the `task` tool know how to choose a model? | **No.** Its schema is `{description, prompt, subagent_type, task_id, command}` — and nothing else. A girl's model comes from `agent.<id>.model` (`b.model ?? the parent message's model`). |
| How the model learns the offer | The server sticks to the description of the tool `task`: “Available agent types and the tools they have access to:” then a `- <name>: <description>` per **non-primary** agent. Without `description`, it writes "This subagent should only be called manually by the user". |
| How to remove a sub-agent from the offer | `permission.task` is evaluated with **agent name** as boss: `{"*": "allow", "explore-cheap": "deny"}` removes `explore-cheap` from the served list. |
| What a girl really gets | `agent.<id>.tools` **removes** for good, including wildcard: `{"*": false, read: true}` → **only one tool** in the request body. Checked on the body, not on `/experimental/tool`, which renders the entire registry without applying the agent. |
| What the delegation publishes | `permission.asked` `{permission: "task", patterns: ["explore-cheap"], metadata: {description, subagent_type}}`, **before** opencode resolves the agent; then the part of the tool carries `state.metadata = {parentSessionId, sessionId, model}` — the only place from which to attach a girl to her call. |

Four consequences:

1. **One agent per (mode × model).** `explore` / `general` on the run model,
   then `explore-<slug>` / `general-<slug>` by favorite. This is the only translation
   possible from the `model` field of `spawn_agent`.
2. **The offer is tightening on curated favorites**, and it is assumed: `spawn_agent`
   accepted any id from the catalog (`allowedIds`, ~345 models), which we do not
   cannot list in agents without inflating the tool description by 700 lines.
   The plan ceiling remains held — the favorites have already passed
   `scopeSubagentModels` — it is simply **by construction** rather than by
   a resolver. A name off the list returns as a tool error, with the offer.
3. **Each model offered must be PRICED** in the `provider` (same measure as in
   §2.8: no `cost` → `cost: 0`). A favorite whose OpenRouter index does not give
   not the price is not offered at all — measured end to end: one girl on
   a priced model makes its cost like the mother.
4. **`OPENCODE_ENABLE_PARALLEL` has nothing to do with girls' parallelism**,
   contrary to what the plan assumed: it is the flag of the supplier of
   *Parallel* web search (`RuntimeFlags.enableParallel`, next to `enableExa`).
   The simultaneous ceiling (`maxParallel`, `app_config`) is therefore held on the
   permission request from `task`, which is the only checkpoint that exists.
   Namely with: without `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS`, a `task`
   **blocks** the parent — the concurrent only comes from a round that calls `task`
   several times.

**Trap read in the binary, not yet bitten**: `POST /permission/:id/reply` with
`reply: "reject"` ALSO rejects **all other permissions awaiting the
same session** (`Permission.reply`, loop on `pending`). A competing refusal
can therefore carry a legitimate appeal suspended at the same time. Rare as long as
supervisor responds as needed (one request at a time), to keep in mind the
day when one unexplained refusal will appear alongside another.

### 2.15 Delivery rules: no plugin, and shell exit code (batch 2)

The plan announced “delivery-gate, self-review, plan-closure **reimplemented in
opencode** plugin (`tool.execute.before/after`, `session.idle`)”. **The plugin does not have
no place to be**, and it is not a shortcut: the three facts that these rules
They are already arriving at our house.

| The fact that the rule reads | Where he came from | Where he comes from now |
| --- | --- | --- |
| `editedPaths` | our tools `edit_file` / `write_file` / `apply_patch` | the **permission request** `edit`, when the supervisor authorizes it (`metadata.filepath`, absolute — §2.13) |
| “the model tested itself” (`VerificationSink`, MIN-262) | the exit code of `run_command` | **`state.metadata.exit`** from the tool `bash` |
| the written plan (`planWrites`) | `watchPlanWrites` on ticket tools | the **same** `watchPlanWrites`, placed on the deck hatch |

A plugin would therefore have added a third place where the harness speaks to the model,
in a generated file running *in* opencode, without rendering anything more. The
four modules remain **unchanged, with their tests**; the wiring lives in
[opencode-delivery.ts](../lib/server/agent/vm/opencode-delivery.ts).

**Two things to know, and the second is a trap.**

1. **Opencode's `bash` places `exit` on its `metadata`** (read in the source:
   `metadata: {output, exit: code, truncated, …}`), and a **non-zero code does not
   not fail the tool** — the part remains `completed`. The status of the tool does not say
   so NOTHING about the command's verdict: only `metadata.exit` says it. And it is worth
   `null` on a command aborted or killed by timeout — an unknown code
   is not a zero, and taking it as such would **silence** the door of
   delivery on a tour that no one checked.
2. **The voice of the harness (`followUp`) goes into the TEXT of the tool result.** The
   home loop served it as a `user` message after the round, due to lack of power
   magnify a result that it elided in the middle; at opencode a result
   tool *is* the text that the tool renders, and nothing elides it under the caps
   of `tool_output` (2,000 lines / 50 KB — the largest block, the diff, is capped at
   12 KB). The bridge therefore pastes it after the result, separated from an empty line.

**What we assume**: the edition is noted at **authorization**, not at execution.
An authorized then failed write charges for an unnecessary type-check — the meaning
cautious, the opposite letting out code that the door has not seen.

### 2.16 The forge: `create_pr` is the only tool cut in two (lot 2)

The other eight forging tools do not move: the three writings of a
replay (`comment_pr`, `comment_pr_line`, `reply_pr_thread`) and the seven pull
project requests are **ordinary domain tools** — they go through the
bridge, which sends them to the control plane, sole holder of the forge token
([pr-tools.ts](../lib/server/agent/pr-tools.ts) and
[project-pr-tools.ts](../lib/server/agent/project-pr-tools.ts) do not change
of one line). The only state that goes back and forth is the **anchor counter**
(`prInlineComments`): the ceiling of 5 is counted over the life of the RUN, the function
opposes it and returns the one it has reached, the bridge guards it, the checkpoint
carries to the next round.

`create_pr` is cut in two — **the VM pushes, the function opens** —, and
this is the right way: the repository is in the microVM, the forge token and
the status of the pull request on the function side. The supervisor therefore executes half
push itself (`supervisorTools`, [supervisor.ts](../lib/server/agent/vm/supervisor.ts))
and posts the push result to the control plane, which calls
`openPullRequestAfterPush` unchanged.

**Three differences with the home loop, and each fixes a real case:**

1. **The branch is UP, not reread.** `agent_runs.branch_name` is not stamped
   that after a real push (MIN-123), but this push is the first of the run in the
   normal case: the function would read a null branch and open the pull request
   on an empty head.
2. **The `jobsNote` is back** (§2.21). `bash` does not have a background mode, but
   `run_background` is stored as a local tool: a dev server can therefore run
   at the time of delivery. He is killed BEFORE staging, and the model learns about it
   in the same response — a silently stopped waiter makes him believe that he
   turns (MIN-209).
3. **Parent's write lock is held HERE.** `commitAndPush` done
   `git add -A` on a SHARED sandbox: deliver while a `implement`
   work would take away his half-finished work. At opencode the tool `task`
   BLOCKS the parent, so the case is rare — but a round that calls `task` and
   `create_pr` side by side reopens it, and the permission request does not pass
   than opencode tools.

**A REVIEW session (`writesToRepo: false`) does not have this tool at all**, and
three turns of the key rather than a prompt phrase: `agentToolsFor` is not useful
not at the `pr` anchor (so no file generated), the bridge refuses it if it arrived
anyway, and the config sets `permission.edit: "deny"` by removing `edit` /
`write` / `apply_patch` of the agent's toolset (§2.8, measure n°4: the card
global poses the permission, the agent game does the absence).

### 2.17 The end-of-round commit: where opencode places ITS files (batch 2)

The commit and end-of-round push do not change in nature — `commitAndPush`
after `session.idle`, message derived from the response (`commitMessageFromReply`),
diff of the turn by `changedFiles`. Only one push path exists in the
supervisor, shared with `create_pr` (§2.16): the push URL is **re-resolved there
every time**, because a tour lasts hours and an installation token
forge one hour.

What required a measurement is what opencode writes **where**, since the round
ends with a `git add -A`. Measured on 2026-08-12 (real server on a git repository
disposable, session created):

| What opencode writes | Where, by default | Where we put it |
| --- | --- | --- |
| state (sessions, messages, permissions) | `$XDG_DATA_HOME/opencode/opencode.db` | `OPENCODE_DB` → `HARNESS_DIR/opencode.db` |
| working **snapshots** — git repositories | `$XDG_DATA_HOME/opencode/repos/` | `XDG_DATA_HOME` → `HARNESS_DIR/data` |
| newspapers | `$XDG_DATA_HOME/opencode/log/` | ditto |
| downloaded binaries | `$XDG_CACHE_HOME/opencode/bin/` | `XDG_CACHE_HOME` → `HARNESS_DIR/cache` |
| our 32 domain tools | `$XDG_CONFIG_HOME/opencode/tool/` | `XDG_CONFIG_HOME` → `HARNESS_DIR/config` |

**The repository itself remains blank**: after startup and session creation,
`git status --porcelain` doesn't return anything, and there is no `.opencode/` in the
project — the state has left the repository disk for SQLite (§2.2).

The two added variables therefore do not correct an observed defect but in
close a possible: by default these files go to the `$HOME` of the
microVM — outside the repository, but **out of our reach**, whereas a `$HOME`
absent or placed on the repository by a sandbox image would be enough to bring back
entire git repositories in the tour commit. All opencode state holds
now under `HARNESS_DIR`, which is **brother** of `REPO_DIR` and therefore out of
scope of `git add -A`.

---

### 2.18 The minddy anchor and the turn prompt (lot 3)

Batch 1 had installed `instructions: [OPENCODE_ANCHOR_FILE]` in the config without
no one writes this file: the supervisor received a `SupervisorInput` that
only one test fulfilled. This is what this lot closes, and the question to be decided
was not technical — **what do we put in it?**

**What we don't put there**: a redescription of opencode tools. Its prompt
system already described `read`, `edit`, `bash`, `task`, `question`; repeat them less
well, in the same system message, it is contradicting oneself.

**What we put there**: the three things that opencode cannot know.

1. **Who the agent is** in minddy, and what the session is anchored to (ticket /
   notebook / PR proofreading).
2. **The 32 domain tools** and their doctrine — the ticket plan belongs to
   the user, a status is never written, an anchored remark is rationed.
3. **What HARNESS imposes on its tools**: git belongs to us and the shell
   refuses what destroys work, web research is ours and capped, a
   question ENDS the round, the delivery door of the first `create_pr`.

**And it's THE SAME TEXT as the house loop.** The doctrine fragments have been
taken out of the body of `buildAgentSystemPrompt`
([prompt.ts](../lib/server/agent/prompt.ts)) and are called by both engines;
the only thing that varies is declared in a table, `PromptToolNames` (`read_file`
→ `read`, `run_command` → `bash`, `spawn_agent` → `task`, `ask_user` → `question` ;
`run_background` has the SAME name on both sides since §2.21). Two guards
hold together:

- the home loop prompt is **unchanged at byte** — checked on 192
  anchor × options combinations during refactor;
- the anchor used for opencode does not contain **any tool name from the old harness**
  ([opencode-anchor.test.ts](../lib/server/agent/opencode-anchor.test.ts)): this is
  the only fault of this family which is not seen anywhere - a model calls for a
  tool that doesn't exist, round after round, and he just looks stupid.

Three deviations are written by hand, because the measurement made them different:
`task` **blocks** the parent (§2.14, so “you never wait, you never probe
never" is false here), there is **no batch editing** (§3.2), and `bash` **does not
does not** keep the complete output of a command (no `full_output_path` to
promise — it's `shellSavesOutput` in the table, not the absence of tool
background, who says it).

The **prompt of the turn** is what the leader put in the messages
user: ticket or pull request context, legacy work, instructions
from the depot, request from the launcher. On a restart it is empty — the history is in
the log, and the request arrives via the steering (§2.19).

### 2.19 Steering and “Stop” (lot 3)

The two most visible gestures of the product, and the two that were missing from the
supervisor: the “Stop” button did nothing, and a message was written for a
lap remained in line until the next lap — on a lap that lasts hours,
that is to say indefinitely.

**A message is not injected into a working session.** At opencode there is no
there is no history to transfer between two calls: there is a round in progress. The gesture is
so `abort` (40 ms measured, the request in flight completes properly) then a
new prompt **to the following `session.idle`** — the same safe boundary as the loop
house, reached from the other end.

Two rules that decide the rest:

- **We only drain the line when we are able to post behind.**
  `pullSteering` consumes; a message drained and not posted is lost for good,
  since the control plane only re-queues a run on what remains in the queue.
  Hence the `hasPendingMessages` probe before the drain.
- **A “Stop” accompanied by a message continues in THIS lap**, and the flag
  is then **consumed** — otherwise the next poll would reread it and exit,
  message accepted and never played. This is word for word the reasoning of
  `clearInterrupt` into `agent-loop.ts`, and both engines hold it the same.

The poll is **temporal** (5 s) and not per round, since there are no more rounds to
us: its granularity is that of the flow of events. A three minute `bash` delays
therefore the stop all the more — this was already true of the house loop, which did not reread the
flag only between two rounds.

### 2.20 No flag: opencode IS the engine (batch 3)

The first version of this batch placed a flag per project in `app_config`, on the
VM flag model of MIN-224. **Clément removed it**, and the argument is correct:
minddy has a user, and a switch that only one person could flip
not worth the surface area it adds. `agent_opencode_projects` and
`agent_loop_in_vm_projects` have therefore both disappeared, with the module which
read — brand new run leaves on opencode, in the microVM, without asking anything.

**What remains, and which is not the flag**: the `agent_runs.agent_engine` column,
written at creation and never reread elsewhere. She doesn't decide anything; she **said**
which harness played that run. Two reasons to keep it:

1. **A run already in flight keeps its engine.** Both do not keep their memory in
   same place (`checkpoint.messages` against `checkpoint.opencode`): switch back
   conversation in progress would not cause him to lose a setting, it would cause him to lose his
   historical. The deployment of the seesaw therefore has no effect on what rotates.
2. **Reading an incident.** “Why did this run behave differently?” » se
   responds on the line, not on the state of a config at the time we look.

The `loop` value will disappear with `agent-loop.ts`, when there is nothing left to
resume. And `loop_in_vm` is now always true: the column is read by
sweepers (`reapDeadVmRuns` wants it true, `requeueStuckRuns` wants it false), so
she must tell the truth even when no one decides to do so anymore.

The server, finally, is held by
[vm/opencode-host.ts](../lib/server/agent/vm/opencode-host.ts): `spawn` of a
ordinary child from the harness process (the `nohup` trap of §2.7 does not
only concerned a Sandbox RPC command), version **pinned**, and installation
**only if binary is missing** — baked into `AGENT_SANDBOX_SNAPSHOT_ID` it doesn't
never misses and the turn pays 1.3 s, otherwise the fallback costs the measured 10.6 s.

### 2.21 `run_background`, reposted in tool local (batch 3)

`bash` has **no** background mode, and the opencode register `BackgroundJob` serves
`task`, not the shell (§3.2). The withdrawal that held until now was a sentence of
prompt: “your shell is PERSISTENT, start your server in `&` and kill it yourself”.
He carried the doctrine — *run the code for real* — and **none of his
guardrails**:

- nothing killed the server before the end of turn `git add -A`, so it wrote
  in the repository while we committed it, and it kept the microVM awake afterwards;
- its output was not bounded by anyone (`BACKGROUND_OUTPUT_CAP`, the increment by
  probe): a chatty watcher came back in full in the context;
- `checkCommand` did not see the order being placed — a `git push` launched in `&`
  would have escaped the git guardrail of MIN-108.

The tool is therefore rested, and **it is the only LOCAL tool** of this harness: it does not come out
never from microVM. [background.ts](../lib/server/agent/background.ts) does not move
of one line — the policy (ceiling of 3 jobs, safeguards, offsets, formatting)
is pure, and its tests don't move either. Only the wiring is new:

| What was needed | Where |
| --- | --- |
| The file used for the model | `opencodeToolFiles` generates it like the other 32 (`LOCAL_TOOL_NAMES`) |
| Execution | The bridge, in `supervisorTool` — no `cp.callTool`: the control plane has no repository to run |
| Hands on deposit | `repoBackgroundRunner`, moved from `exec-tool.ts` to [repo-host.ts](../lib/server/agent/repo-host.ts) — both engines use it, and batch 3 will eventually remove the first |
| The stop before any staging | `create_pr` (with its `jobsNote`) and the end of the turn, before the push |
| The prompt | `backgroundToolNote`, SHARED fragment: home loop is byte unchanged, opencode anchor makes it with `bash` for shell |

**A trap measured on the binary, which would have made the tool half useless**: the
complete log of a job lives in `TOOL_OUTPUT_DIR`, therefore **outside the repository** — otherwise
the `git add -A` at the end of the turn would commit it. Or opencode gates readings out
project behind the `external_directory` permission, which **we refuse** (§ safeguard
crazy). The note which tells the model where its log is has therefore become dependent on the
engine: `read_file`/`grep` for the home loop, **the shell** (`tail`, `grep`)
for opencode. The original text would have sent him against a wall that is held
ourselves, and to a tool (`read_file`) which does not exist there.

**A table trap, caught in passing**: `PromptToolNames.background` was used
also an engine discriminator — “no background tool” was worth “no
`full_output_path` neither.” The two broke up the day opencode had a
background tool: the `shellSavesOutput` field now says the second thing, without
what the anchor would have started to promise to the model a complete output file that
opencode's `bash` does not keep.

A **replay** session does not have one: `PR_REVIEW_TOOLS` does not carry it, so it
is neither generated, nor routed, nor announced — a review takes place in a session.

### 2.22 The images of `read_resource`: they cross, and TWO declarations were needed (batch 3)

Measured on 2026-08-12 on `opencode-ai@1.18.16`, real server, real key, model of
vision, ~$0.004 over four passes. The probe remains in the depot and replays:
[opencode-images.probe.test.ts](../lib/server/agent/vm/opencode-images.probe.test.ts)
(`MDY_OPENCODE_IMAGE_PROBE=1`) — the model must name the four quadrants of a
64x64 PNG generated at runtime, which no model guesses.

The plan assumed a **prompt restart** carrying the image after the tool. It was not
not necessary, and the real way is better: the `ToolResult` of `@opencode-ai/plugin`
has a rich form, `{title, output, attachments}`, and `ToolAttachment` is
`{type: "file", mime, url, filename}` — **a data URL passes as is**, which
falls right on `AgentToolImage` ([content.ts](../lib/server/agent/content.ts)), which
is already a data URL and for the same reason (the history is replayed for hours
later a signed URL expired).

What opencode does with it, read in the request body: it sends a message `user`
just after the round, `[{type: "text", text: "Attached media from tool result:"},
{type: "image_url", image_url: {url: …}}]` — **exactly** what the house loop does
was building. This message is NOT persisted in session (checked on
`/session/:id/message`: three messages, not four), so it produces no
event and cannot enter the round text or commit message.

**THE TRAP, and it silently cost parity.** `attachment: true` on the model
**is not enough**. The image passes through the entire harness, and opencode replaces it at
last moment by a text:

> `ERROR: Cannot read "quad.png" (this model does not support image input). Inform the user.`

The model therefore responded `NO_IMAGE` — and in production it would have warned
the user of a limit that does not exist. What the binary tests is
`capabilities.input.image`, which is declared in config by **`modalities.input`**.
Hence the two fields placed together in `modelDef`, on the same `job.imageInput`.
Nothing in a type-check or in a unit test would have said that.

The wiring is made up of three parts:

| Room | What she does |
| --- | --- |
| [opencode-config.ts](../lib/server/agent/vm/opencode-config.ts) | `attachment` **and** `modalities.input: ["text","image"]` when `job.imageInput` |
| [tool-bridge.ts](../lib/server/agent/vm/tool-bridge.ts) | the `images` of the control plane becomes a **shell** `{output, attachments}`, announced by the header `x-minddy-attachments` |
| [opencode-tools.ts](../lib/server/agent/vm/opencode-tools.ts) | the generated tool makes the envelope `ToolResult` rich; without the header, it renders the text as before, to the byte |

The **text** of the result does not change: the MSDS remains what it is
model reads, the image is added. A thread therefore tells the same thing on both sides of
the seesaw. Subagents don't need it: `read_resource` is in
`SUBAGENT_FORBIDDEN_TOOLS`, their models therefore do not declare the modality.

### 2.23 The round cut in flight: opencode charges NOTHING, the proxy does (lot 3)

Measured on 2026-08-12, real server, real key, ~$0.003 per pass. Probe
replayable:
[opencode-abort.probe.test.ts](../lib/server/agent/vm/opencode-abort.probe.test.ts)
(`MDY_OPENCODE_ABORT_PROBE=1`) — it mounts the **real** production proxy.

This is the question that the plan left open, and the answer is
bad:

| After a `abort` in full generation | What we note |
| --- | --- |
| The opencode helper message | `finish: null`, `cost: 0`, `tokens: {input: 0, output: 0}`, `error: MessageAbortedError` — while **179 characters** were written |
| Our translator | requires a `finish` to write to the ledger, rightly so: without it it would write an empty line then a real |
| The supplier | charged **$0.002827** (2,032 prompt tokens, 159 completion tokens) |

All but one of the supervisor outputs pass through a `abort` — ceiling of
expenditure, “Stop”, steering, deadline, question of the model. The expense therefore came out
of the ledger, the quota and the invoice **on a gesture that can be triggered at will**:
exactly the fault that MIN-216 had closed on the home loop side, reopened by the
engine change.

**Which closes it, and this is a property of the proxy, not an estimate**: it does not
passes no signal to its upstream `fetch`. When opencode leaves, the loop
continuous playback until the last frame — **1221 ms later, without an error
of socket** — and this frame carries `usage`, therefore the cost invoiced and the
`generation_id`. The supervisor therefore calls `proxy.settle()` then `proxy.drain()`
at the end of the round (`TurnLedger.recordOrphans`) and writes the line to the amount of
SUPPLIER, `estimated: false`.

Two choices that go with it:

- a flow which would not even have returned its `usage` (supplier cut off, breakdown
  network) **is not written**: a zero line would read “this call was
  free”, which makes the hole again. She's in the journal.
- the line takes a `seq` from the **mother**: the proxy sees HTTP, not
  sessions. A messy line is better than an expense that doesn't exist anywhere.

`abandoned-spend.ts` remains in the repository for the home loop, but the path
opencode doesn't use it: it has nothing to estimate.

### 2.24 The first production run: dead at startup, silent at runtime (batch 3)

First real run on opencode in production, 2026-08-12. The thread displays “Opening
from the sandbox” then “Agent Numo is working” — and nothing more, ever. Autopsy by
the run line: `error_message: "opencode did not become healthy within 60000 ms"`,
installed **6 min 30** after starting the harness. Two faults, and the second does not
would be seen only after correcting the first one.

**1. The health probe had no cap, so the wait didn't have one either
more.** The microVM logs say that the server started (`opencode server
listening on http://127.0.0.1:4096`, its SQLite database created at T+1 s), and yet the
probe got nothing. On a **new** microVM, the disk is hydrated
lazily: the first exec of the 176 MB of binary costs much more than
the 1.3 s measured at batch 0 on a hot VM, and during this time the server
**accepts the connection without responding**. A `fetch` without signal then waits for the
`headersTimeout` from undici — **300 s** —, which explains the difference between the 60,000 ms
announced and the 6 min 30 experienced: the survey loop did not complete, it made
A query and waited five minutes. Corrected on both sides: `healthy()` carries its
own cap (2 sec), boot cap changes to 5 min, error cites time
**actually** expected, and a log line falls every 15 s so that the
next diagnosis takes place in a log reading.

**2. REFLECTION deltas carry `field: "text"`, like the answer.** Read in the
binary 1.18.16 (`case "reasoning-delta"` → `updatePartDelta({… field:"text"})`) then
**captured** against a fake local supplier, zero cost
([fixtures/opencode-reasoning.ndjson](../lib/server/agent/vm/fixtures/opencode-reasoning.ndjson)):
a delta frame says nothing about what it transports, only the
`message.part.updated` opening of the said part (`type: "reasoning"`, `text: ""`,
`time.start`). As long as it was not read, the chain of thought entered the text
of the round — therefore in what the thread displays as the agent's word, and in the
commit message — and the thread reflection counter (MIN-122) remained off: a
`reasoning_level: high` model can think minutes before its first word, and the
fil had nothing to show during this time. The translation now holds nature
on each side, removes the reflection from the bag of text, turns on `reasoningActive` on
direct and makes the trace folded under the **same** event `thinking` as the loop
house.

**By the way, the same fault elsewhere**: our own prompt, republished by the
session in `message.part.updated` of type `text`, was also included in the response
of the turn (measured on the fixture: the response began with “say hello”). The role
of a message can only be read on `message.updated` — we retain it, and the shares of
`user` messages are discarded.

---

### 2.25 The thread no longer told the trick: three symptoms, only one missing (lot 3)

Second production run, 2026-08-12, `openai/gpt-5.6-luna`. The work is good
(PR open, tests and type-check passed), but **the screen lies on three points**:

1. the text that the model writes between two sets of tools appears live then
   **disappears**;
2. the round ends normally and the thread makes it **"interrupted"**;
3. on the following message, the indicator restarts with the time of the **previous** lap,
   the unfolding of which then empties into raw events, without closure.

**A single lack explains all three**: the supervisor did not issue ANY
event for the template text. The run has 148 events — `tool_call`,
`tool_result`, `thinking (reasoning)`, `status` — and not a text bubble.

- The direct is not persisted anywhere (this is its definition): without an event behind it,
  the narration fades at the end of the round. → symptom 1.
- The thread only knows one end of turn sign, the **`summary`** event
  (`closesTurn`, agent-event-feed.tsx). A lap at rest without a fence is read as
  a tour stopped along the way. → symptom 2.
- The round remaining open, the work of the next round is stacked in the same
  accordion, and the `user_message` of the steering **empty** the work not closed in items
  free (`flush()`). → symptom 3.

The house loop rule is repeated at the word (`agent-loop.ts`): `thinking`
(without `kind`, 2,000 characters) for the text of a round that CONTINUES — at
opencode, `message.updated` with `finish: "tool-calls"` —, `summary` (8,000) for
turn response, issued at the end of the turn and **only** if it has ended
normally: a cut turn has no final word, and the thread must continue to
say it interrupted. The live stream goes silent at the end of an intermediate round (`clearLive`)
but **keep** the text of the last round: its `summary` only leaves after export
of the log and push it, and clearing it earlier would flash the response.

**And the girls**: their relationship didn't go anywhere either. The block of one
subagent reads a `summary` marked with its name and closes on
`status: subagent_report` — the two now leave on his `session.idle`.

### 2.26 Rereading the site: fourteen defects, and the reason they share

Verification pass dated 2026-08-12, plan and file in hand, code read line at
line. Fourteen confirmed defects — corrected, each with its own test —, sixteen
suspicions refuted. **No task in the plan was wrong enough to start again
“to do”: what was missing was always a link, never the brick.**

**The pattern, and it is the same six times: a complete writing, a reading
absent.** A path where we carefully produce data that no one
relit doesn't lift anything, doesn't type anything wrong, and is only seen on a real run.

| The default | What was missing |
| --- | --- |
| **The restart did not restart anything.** `VmJob.opencode` was not written by anyone (`execute.ts`): each turn created a NEW session. The supervisor exported, the control plane stamped, `AgentCheckpoint` declared — and the microVM received nothing. The batch 0 probe measured a path that production never took. | a reading line |
| **A restarted round replayed its start.** Corollary of the previous one: `messages` being empty under opencode, the cold start would restart, and the context of the ticket + the launcher's request would be reposted OVER the restored history. `VmJob.opencodeInput` however promises “`prompt` is empty on a RESUME round”. | a branch |
| **A silent stream froze the round.** "Stop", steering, periodic save and wall deadline all lived IN the body of the event loop. A twenty-minute `bash` publishes nothing: no more clock, and above all no more `last_activity_at` — the watchdog went to probe a living microVM (§2.24 had corrected the symptom, not the cause). Hence the **beat** (`LIFECYCLE_BEAT_MS`), which runs against the next event. | a timer |
| **The log was not limited by anything.** The export is incremental, the SEND is not: the checkpoint carries the entire accumulator. The plan held the 4.5MB cap as "not applicable" since the checkpoint became append-only — **an append-only log rewrites itself entirely with each save**. Passed the bar: 413 put away as a temporary breakdown, no more backup, no more heartbeat, final report refused. We drop the log (we never plan it: `/sync/replay` wants contiguous `seq`) and we say `turnHistoryReset`. | the ceiling |
| **A drained steering message could die.** `pullSteering` CONSUMES, and the turn can exit between the drainage and the post (ceiling, deadline, run concluded). Accepted on screen, lost forever — and the run didn't wake up, since it was the queue that re-queued it. Hence `POST /messages`, which puts it back in line. | a way back |
| **The ceiling of sub-agents did not limit anything.** It was counted on LIVE girls, but the birth follows the authorization (the deposit itself anchors it: `runningAtAsk === 0`). A round that calls `task` three times saw all three requests pass. `SubagentContext.pending` counts the open credit. | the account of the brides |
| **An error response from the provider caused a round to be billed TWICE.** The proxy reader allocated from the first readable JSON line: one `{"error":…}` out of 429 became a generation with the EMPTY model, therefore matchable to everything. The round started again without its cost, and the real generation ended up as “orphans”. | two guards (status, and trace) |
| **`prompt_tokens` did not mean the same thing on both engines.** Opencode's `input` EXCLUDES cache. The plan said `input→prompt_tokens`: **it was the plan that was wrong**, and its own measure said so (`input + cache.read + cache.write = native_tokens_prompt`, §2.5). The `cached_tokens / prompt_tokens` (MIN-242) hit rate could exceed 1, and the row-to-row comparison — the toggle criterion — was not comparing the same thing. | the addition |
| **The delivery gate was blind to the shell.** `rm`, `mv`, `sed -i`, a codemod: no more `delete_file` nor `move_file` under opencode, so `editedPaths` remained empty and a trick that only delivered **without a check**. It is the working tree which decides now (`probeRepoTouched`), in recourse only. | reading git |
| **`abortsRequested` never resets to zero.** A `abort` can publish nothing (opencode responds 200 on an idle session), and the steering cuts sessions which have sometimes just ended. The credit remained open, and the FOLLOWING cut — the one that no one asked for — was swallowed: no event, no error, a round put “finished”. | round reset |
| **An end of turn on `length` started twice.** The narration was decided on “≠ `stop`”, while `tool-calls` is the only ending that CONTINUES. The text started in `thinking` (2,000) then in `summary` (8,000) — and the thread duplicates by equality of text, which two ceilings never return. | the good predicate |
| **`update_plan` made a bubble.** CONTROL Tool: the house loop did not emit any events. At opencode it goes through binary, so the flow publishes its parts — the checklist was told twice. | a filter |
| **`webfetch` left without its URL.** No opposite house, therefore no case in `toolArgSummary`: the event left at `{}`. A web reading tour that is unreadable on replay. | a `case` |
| **The reason for a local refusal no longer came up.** `forbidden_command` on a `run_background` died in the bridge: refusals ceased to be measurable on `agent_run_events`. | a reminder |

And a fifteenth, excluding VM: the installation safeguard of
[create-agent-snapshot.ts](../scripts/create-agent-snapshot.ts) could not be
trigger — `npm i … | tail -5` returns the exit code of `tail`, which succeeds
always. A broken register would have been mistaken for a bad binary.
version ten lines below.

**What the rereading did NOT find, and which is worth saying**: the sixteen
refuted suspicions almost all focused on the most commented places in the
construction site — proxy, permissions, generation matching, images.
Where the code explains why it does what it does, it was right. The
fourteen real faults all live at a BORDER: between two modules, between the
plan and the VM, between a write and its read.

### 2.27 The second rereading: seven defects, all on an EXCEPTIONAL path

Pass dated 2026-08-13, conducted by six independent readers followed by a rebuttal
contradictory of each suspicion: **seven defects confirmed and corrected**, six
refuted. No task in the plan goes back to “to be done” — like the time before,
what was missing was a link, never the brick.

**The motif, this time, is no longer “writing without reading” but “the path
NORMAL is treated, the other is not”.** Each defect is read in the same way: this
which should arrive at the end of a round did indeed arrive at the end of a *successful* round,
and nowhere else.

| The default | What was missing |
| --- | --- |
| **A dead turn in flight charged nothing.** `recordOrphans` — the only writer of a round's expense that opencode does not charge (§2.23) — lived after the loop, so only on the happy path. But the ONLY way to learn that the opencode server is dead is its `/event` flow which breaks: the exception skipped the restart, the `finally` closed the proxy behind, and the report announced `costUsd: 0` on a round that the provider had billed for. The hole of MIN-216, reopened on the path where it is most likely. | the `catch` |
| **The text of a cut round was glued back together in front of the next one.** The text bag was only emptied at the end of a BILLED round; an aborted round does not. On a steering (`abort` then new prompt on the same session), the fragment written before the cut went back to the top of the live, the turn response, the `summary` **and the commit message**. | the dump on `MessageAbortedError` |
| **`sessionError` never reset.** A non-cutting session error does NOT exit the loop. Reposted by a message from steering, the tour ended well, pushed - and still parked `error`, without its `summary`, therefore made “interrupted” by the wire. | reset on repost |
| **The live's tool counter was cumulative, including girls.** The thread reads `tools === 0` as "this text may be the answer" (`isLiveAnswer`); the home loop sends the INTERNAL accumulator to the round. Cumulatively, it never fell: as soon as a turn had called a tool once, all its subsequent responses were displayed as narration. | round reset |
| **The tool descriptions cited the OLD harness tools.** `agentToolsFor` is the only source, and its text says "use run_command for those", "exactly like edit_file". Served as is, `run_background` sent the model to call a tool that opencode does not serve — while its system prompt cited `bash` (`OPENCODE_TOOL_NAMES`). Two truths in the same context. | the name table, at generation |
| **A REVIEW received the delegation.** `primaryTools` serves `task` as soon as `subagents.maxParallel > 0`, and the job set this ceiling without looking at `writesToRepo` — the two prompts already conditioned it. A proofreading run could therefore open girls who EDIT the repository. | the same condition on the job |
| **Deletions and new files made in the shell did not trigger any checks.** `probeRepoTouched` (§2.26) opened the door but filled `editedPaths` with `turnDiffStat.files`, which EXCLUDES deletions and only counts new files in number: a trick that only did `rm lib/x.ts` deliver without one type-check, while it is the change that breaks the typing elsewhere. And nothing PERMITTED the model check (`noteVerificationStale` has only one caller, the `edit` permission): a green `npm test` before the `rm` silenced the door. The home loop did both since `delete_file`. | `turnTouchedPaths`, and expiration |

**What has been refuted**, and is worth noting so as not to return to it: the `/event` flow
subscribed after the first prompt (measured: no frame lost), the steering drained
on a failed `prompt_async` (the log is replayed before), `recordOrphans` on
a non-OpenRouter provider, the time limit of `bash` (120 s **by default**,
that the model can go up to 600 s — the opposite of a lost ceiling), and the ceiling
of images per round (`MAX_IMAGES_PER_TURN`): the message that opencode produces of a
attachment is NOT persisted in session (§2.22), so it does not restart each time
round and does not enter the log; there remains a behavioral gap to be measured
during the week of observation, not one fault with a false output.

### 2.28 A null byte, and the round freezes — the incident of 2026-08-12 (11 p.m.)

Two symptoms reported the same evening, only one defect underneath, and it is not
in the supervisor: **it is in what Postgres accepts**.

What is visible: a steering message sent while the agent is responding cuts off
response **and don't restart it** — like a “Stop”. The tour remains “in progress”,
frozen on the same tool for a quarter of an hour, the microVM is still running, and the
message disappeared from the conversation on reload. Then, a few more minutes
late, the session clears itself with "the process of this round has stopped
before I finish.”

What happened, read in the production logs (runs `66023558`, `a8051d06`):

```
[agent-runs] stampRun 66023558 → (fields) failed: unsupported Unicode escape sequence   PUT /checkpoint → 409
[agent-runs] stampRun 66023558 → completed failed: unsupported Unicode escape sequence  POST /rest → 200
```

`\u0000` is stored NEITHER in `text` NOR in `jsonb`: Postgres refuses the line
whole. And what we write comes from a model and its shell — the output
of a command that affects a binary, a log truncated in the middle of a character, the
opencode event log that carries them. **A byte, and the string
whole falls, in this order:**

1. periodic backup is refused ⇒ **the heartbeat stops**;
2. the control plan renders **409**, and the supervisor reads a 409 as "run has
   been concluded elsewhere”: he cuts the trick and returns the hand. The steering was not
   for nothing in the cut - he fell at the same moment;
3. the end of turn report is not written either, and `landVmTurn` swallows
   failure: the run **remains `running`** while the VM dies behind;
4. the guard dog notices it three minutes later — hence the phrase about the
   stopped process, which described a consequence, not the cause.

Three fixes, one per link, and the first would be enough to close the known case:

- **`stripUnstorable`** ([runs.ts](../lib/server/agent/runs.ts)) removes the null byte
  and the isolated half-characters of everything that goes into base — `stampRun`,
  `appendEvent`, `insertRunMessage`. We withdraw them rather than refuse
  writing: they are worth nothing to anyone, and the trick is worth a lot.
- **A write failure is no longer a completed run**: `stampRunResult` distinguishes
  “the guard did not match” of “the base refused”, and the control plan makes
  **503** on the second — the client tries again, the round continues. This is what
  turned any basic hiccup into the death of a living trick.
- **The quiescence is successful**: if the checkpoint is refused, `vm-rest` does it again
  stamp **without it** and says it to the thread (`checkpointRefused`). A session starts from
  its previous state, instead of remaining open until the watchdog.

And a fourth, off-channel but from the same evening: `insertRunMessage` was not watching
not the result of its insert. supabase-js does not raise — it returns `{ error }`. The
the steering route therefore replied `ok` on a message that **no one had posted
file**: optimistic bubble on the screen, agent who does not read anything, message disappeared
reloading. It rises now, and the composer removes his bubble while saying it.

### 2.29 The log leaves the run line — the memory of a real session

The first successful long run (2026-08-13, run `1e8775aa`, 31 minutes, 753
events, $1.03) ended on `turnHistoryReset`: **entire conversation
lost**. The next round, the one that was just supposed to open the pull request, is therefore
left the ticket — he redid a plan, re-explored the repository, then opened the PR.
Seen from the screen: “it starts again from the beginning”. And he dropped his newspaper
second time, after four minutes.

**What a newspaper really weighs**, measured at the checkpoint of a tour of two
minutes: 226 events, **333 KB**. The detail explains everything — a
`message.part.updated` of tool carries the **full output** of the tool (a read
of 260 lines = 22 KB), and opencode republishes the part at each change of state
(`pending`, `running`, `completed`). The 3.2 MB ceiling therefore falls **at the end
about fifteen file readings**. This was not a borderline case: it was
the NORMAL outcome of any working trick.

Two ceilings, and the second was not visible:

1. the **body** of the control plane (4.5 MB on the platform side, 3.2 with us) — a
   append-only log rewrites itself integer on each save;
2. the **run line**, reread by `getRun` at **each call** of the control plan
   (one per tool, per event, per ledger line). A 333 KB newspaper was paid for there
   hundreds of times per turn, to no avail.

Hence [`agent_run_journal`](../supabase/migrations/20261214090000_agent_run_journal.sql):
the log is written in **append**, one batch per backup, and the run line does not
keeps only the **pointer** (`{sessionId, seq}`, a few dozen bytes). The
supervisor pushes its increments (`POST /journal`, cut to 1.5 MB to fit
in a body — never an event straddling two lots, `/sync/replay` wanting one
contiguous sequence), and the function brings everything together **once per turn** before
pass it to the microVM.

Three consequences, one of which was not the goal: the memory of a session
no longer has a size cap, the control plane stops carrying the log
at each tool call, and `turnHistoryReset` no longer has a reason to trigger
on this path. The cursor **only advances once the batch has been written**: a sending
which fails causes the same slice to be re-exported on the next pass, rather than
leave a permanent hole in the newspaper.

---

### 2.30 The observation window, recorded at base (2026-08-14)

First reading of the observation week, on the **14 production runs**
from the switch (2026-08-12 6 p.m. → 2026-08-14 8 a.m.), read in base by the REST API
in service key. All carry `agent_engine = opencode`: there is only one left
engine, and it is he who plays the role.

**Traceability holds, and it is verified by arithmetic.** For each of the
eleven healthy runs, `agent_runs.cost_usd` is **exactly** the sum of its rows
of ledger, `agent_code` + `sandbox_compute`, to the nearest rounding (0.038833 =
0.029027 + 0.009806). On the **394 lines** `agent_code` of the window:

| What we wanted not to lose | Statement |
| --- | --- |
| Actual cost, not estimated | `estimated: false` of **394/394** |
| Supplier reconciliation | `generation_id` present on **394/394** |
| Imputation to a human | `user_id` present on **394/394** |
| Two distinct models, each billed at its own price | yes (`gpt-5.6-luna`, `deepseek-v4-flash`) |

Window total: **$1.42** on the runs line, **$1.40** on the ledger
model, the difference being the microVM compute, also at the ledger.

**The only defect found, and it is real.** The three runs whose process died
(“The agent process stopped unexpectedly”) carry `cost_usd = 0` on their
line, while the ledger carries their expense: **$0.159** model, **$0.190**
compute included, invisible on the line. The three lines were glued back together
hand on 2026-08-14, to the amount of the ledger. The cause
is in `reapDeadVmRuns` ([drain.ts](../lib/server/agent/drain.ts)): the dog of
the watchdog charged correctly for the compute of the microVM, but never put the
**column** to the ledger — what `landVmTurn` does on the healthy path
(`Math.max` from the end of turn report). Neither the bill nor the ceilings were
affected (`finance.ts` reads the ledger, `control-plane.ts` and `execute.ts` take
already the MAX of both): what lied is **what a human rereads after a
incident**. The MIN-216 hole, on the last path which had not filled it.

Corrected in the same gesture, with its three tests
([vm-watchdog.test.ts](../lib/server/agent/vm-watchdog.test.ts)): the MAX, the
no backtracking when the ledger is late, and the **order** — rereading the ledger
comes AFTER `recordSandboxUsage`, otherwise the amount read would not carry the
compute line that we have just written. This defect is not specific to opencode: the
watchdog is common to both motors, the rocker only made it
frequent.

**Two window errors that are not harness faults**: one
`reasoning_effort` in duplicate (run `c7465b6b`, 8:17 p.m.), corrected the same evening by
`patchCompletionBody` ; and “No endpoints available matching your guardrail
restrictions” on `deepseek-v4-pro` — an OpenRouter provider policy,
outside of our code.

**What the window doesn't say yet.** She's a day and a half old, not a week old,
and the three dead processes are all BEFORE the fixes in §2.28 and
§2.29: the four runs of 2026-08-14 are clean from start to finish. It's
encouraging, this is not the proof — we need the rest of the week.
`AGENT_SANDBOX_SNAPSHOT_ID` is in place on Vercel (Production and Preview).

---

### 2.31 Removing the home loop (2026-08-14)

Decided by Clément **without waiting for the end of the observation week**: the
four runs of 14 are clean, and a loop that we keep “just in case” is a
loop that must continue to be compiled.

**What's gone** — 83 files affected, **18,100 lines less**:

| What disappears | Why |
| --- | --- |
| `agent-loop.ts` (2,305 l.), `tool-loop.ts`, `compact.ts`, `checkpoint-fit.ts` | the loop, its cycle detection, its compaction, its checkpoint planing |
| `vm/turn.ts` (+ its test) | the loop played IN the microVM; `vm/main.ts` no longer needles |
| `subagent.ts` (1,066 l.), `subagent-templates.ts` | the girls' registry — opencode opens its sessions itself (§2.14) |
| `exec-tool.ts` (1,053 l.), `patch.ts` | the executor of the 25 tools and editing by envelope: opencode makes its own |
| the 15 generic tools of `tools.ts`, `subagentToolsFor` | announced to no one — the bridge only serves the domain and the premises |
| `buildAgentSystemPrompt`, `buildSubagentSystemPrompt` (`prompt.ts`) | the loop prompt; opencode anchor keeps fragments |
| `caching.ts`, `abandoned-spend.ts` | the prompt cache and the estimation of a cut round: the proxy does better (§2.23) |
| ~1,100 lines of `execute.ts` | the operating loop, its subagents, its handlers `create_pr`/`web_search` |

**What remained, and it's not nostalgia**: `edit.ts` (the engine
edition also serves `minddy_edit_issue_text`, MCP side), `prune.ts` /
`content.ts` (their truncation helpers are read by five domain tools),
`retry.ts` (provider fallback, again played by `landVmTurn`), and
`agent-contract.ts` — a NEW module, where the types that the loop hosted without
own them have moved: event, usage line, direct load, plan stage.

**Three things found while cutting, and none were in the plan:**

1. **The loop prompt system was built every cold turn, then
   discarded.** `userPromptFromMessages` only keeps `user` messages; the message
   `system` composed just above didn't go anywhere. He never has anything
   cost the model — only us, at each start.
2. **A legacy run would have posted its entire conversation as a prompt.** The primer
   did `messages = run.checkpoint.messages` when the checkpoint carried them;
   under opencode, this table becomes the PROMPT of the round. An old repeat run would have
   reread his own conversation as an instruction that had just arrived. The branch
   is removed: a loop checkpoint is no longer recognized, the turn falls on
   the cold primer.
3. **And he SAYS it.** `priorConversationLost` adds a sentence to the turn prompt
   resumed: "the previous rounds were played by the old engine, you don't see
   not this exchange.” Write a format translator for closed conversations
   since August 10 was not worth its code; silence would have given an agent
   amnesiac without explanation, which is the fault that this site has spent its
   time to correct.

**A previous regression, noted in passing**: `collectTouchedInstructions`
(MIN-115, subfolder `AGENTS.md` served on first read in)
**no longer has any callers** since the switch — it was the exec-tool that
stuck to the result, and opencode reads the files itself. The module is kept,
its policy is intact; what is missing is the wiring on the bridge. It's not
the suppression that caused it made it visible.

**What the tests are becoming.** 4,559 cases green, compared to 4,973 before. The cases
parties tested the loop (its streaming, its girl covers, its tools
publishing); those who kept a doctrine still alive were REPOINTED
rather than deleted — the delivery door keeps its 32 pure cases,
`repo-instructions-source.test.ts` (MIN-328, the fork prompt) now aims
`repo-instructions.ts`, `run-spend.test.ts` aims for `landVmTurn`, and
`platform-tool-anchors.test.ts` (MIN-326) confronts the announcement at the table without
go through the executor. `AGENT_ENGINES` keeps its two values — hundreds of
lines of runs carry `loop` — but a `LIVE_AGENT_ENGINES` distinguishes them from this
who can still PLAY: it is on this that the safeguard of secrets is counting.

### 2.30 Repository contents were executing code — both hatches (MIN-360)

Opencode **auto-discovers** from the repository, and minddy wasn't asking either
variables that prevent it. In a disposable microVM, with no issues. In deposit mode
current on the user's machine, this is **execution of arbitrary code
from the contents of a repository** — an injection vector that completely bypasses
the permissions model, since it executes before it.

Found **in binary** (1.18.16, `opencode-darwin-arm64`), not deduced from a doc:

| Varies | What it cuts, as the code says |
| --- | --- |
| `OPENCODE_PURE=1` | The **server** plugin loader does `let A = flags.pure ? [] : config.plugin_origins ?? []`. No more external plugins: neither those declared in a `opencode.json` of the repository, nor the `*.ts` collected under `.opencode/plugin(s)/`. Our plugins are not affected — there are none (§2.15). |
| `OPENCODE_DISABLE_PROJECT_CONFIG=1` | `ConfigPaths.directories` stops fetching `.opencode/` from the repository, `ConfigPaths.files` stops fetching `opencode.json(c)`. This closes the **tools** of the repository (`*.ts` executed as soon as the model calls them) and its **MCP servers** (a process launched at the start of the session). |

**Why our config was not enough**, while the merge order is for us
favorable: `OPENCODE_CONFIG_CONTENT` is correctly applied **after** the
`opencode.json` of the repository, so our ACL gains on what REPLACES itself. But
`plugin`, `mcp` and the tools of a `.opencode/` **are added** — there is nothing to
win on a list that concatenates.

**What the second hatch takes away, and which had to be returned:** the
`AGENTS.md` / `CLAUDE.md` of the repository, which opencode loaded by the SAME return.
They return to `instructions[]`, named, root only, probed by the
supervisor. What we lose — subfolder files, which opencode stuck to
thread of water — is the price of the closure, and it is written in the code.
**Our** tools folder is intact: it comes from `Path.config`
(`XDG_CONFIG_HOME`), which remains included unconditionally.

### 2.31 What comes back from the user's machine (MIN-361)

All the rest of the local site reasons on what **comes down** — the token of
run, model key, forge token. What **goes back** is the only point of the
file that cannot be repaired after the fact: what is assembled is assembled. Hence three
decisions, made before the launcher (MIN-293) rather than during.

**1. A local run does not export its log.** `agent_run_journal` carries the
COMPLETE output of each tool — a reading of 260 lines weighs 22 KB,
republished two to three times — it is kept for 30 days and replayed in front of the
model. Its only written justification is “to make a turn independent of the
microVM which preceded it", and **she comes across a machine**: the base
Opencode SQLite lives under `harnessDir`, therefore under the root **of run** and not of
round, and the session is still there in the next round. We would export a service already
rendered at the price of someone's disk in the production base.

| | microVM | machine |
| --- | --- | --- |
| Memory of the session between two rounds | `agent_run_journal`, replayed at startup | the local SQLite database, never left |
| Full release of server-side tools | yes, 30 days | **nothing** |
| Forensics of a failed run | the newspaper | thread previews, and the opencode log left with its owner |

**What this imposes on the launcher**: the root of a local run is not cleaned
between two turns. If it still disappears, the supervisor sees it (`test -f`
on `opencodeDbPath`) and logs in again — a checkpoint `sessionId`
without its basis would speed off into the void, and break the conversation for good.

**2. What still comes up is filtered, not raw.** `agent_run_events` is persisted
30 days and read by any member of the project. Two gestures at the exit border,
where the substitution of secrets is already posed
([local-uplink.ts](../lib/server/agent/vm/local-uplink.ts)):

- **the machine paths are rewritten** — the deposit becomes relative, the
 house becomes `~`. This is the gesture that processes `/Users/<first name last name>/…`, which
  is not in the suspicious outputs but in **all**: every trace of
  stack, each `pwd`, including for a file that is IN the repository. A rule
  who would only look at what comes out of the deposit would let it pass in its entirety.
  It also passes the final word, therefore the **commit message** and
  `agent_runs.outcome` ;
- **an output that speaks from elsewhere is retained, and only counted.** The
  trigger is the CALL as well as the exit: `cat ~/.ssh/id_rsa` makes
  text which carries no path, and this is the case which counts. What remains
  visible is the **gesture** — we must be able to read what the agent went to do,
  especially outside the file; what doesn't rise is the **content**.

“Personal” means `/Users/x`, `/home/x`, `~`, and mount points
(`/Volumes`, `/mnt`, `/media`). **Not `/usr`, not `/opt`, not `/etc`** — these
three are identical on all Macs, they are in half of the traces of
stack, and `/etc` appears in the CONTENT repositories (a Dockerfile, a conf
nginx). Including them would result in perfectly ordinary readings being remembered, and a
guard who empties the thread of his honest exits does not stay in place. The residue
is therefore named rather than hidden: `cat /etc/hosts` by the shell goes up, in the same way
order as the “paper wall” of §2 of the local audit.

**3. It's said literally**, in the screen that attaches the folder
(`Settings.localRepoWarning`) and in the privacy policy
(`Privacy.agentText`, `Privacy.retentionAgentDesc`): what the agent does on the
machine goes into the thread, stays there for 30 days and can be read by several people.

**What this lot does not close**, and which belongs to the lot of safeguards: the
shortest exfiltration path is not `curl`, it's `git add -A` → commit
→ push → pull request. This is the scanning of secrets before push
([secret-scan.ts](../lib/server/agent/secret-scan.ts), MIN-360) which keeps it; this
This ticket only related to what we **store**.

### 2.32 Permissions, frozen in probes — and four more measures (MIN-362)

The local audit of 2026-08-14 had revealed its eighteen unknowns with probes
**disposable**, recorded in a `.md`. They are now executable, and
they restart at the next bump of `OPENCODE_VERSION`:

| Probe | What she keeps | Cost |
| --- | --- | --- |
| [opencode-permissions.probe.test.ts](../lib/server/agent/vm/opencode-permissions.probe.test.ts) (`MDY_OPENCODE_PERMS_PROBE=1`) | the order of the rules, the pattern of an “always”, the refusal cascade, the grammar of the patterns, the toolset, the session ruleset, the V2 store, and the 30 shell commands | ~2 min, **no model** |
| [opencode-wait.probe.test.ts](../lib/server/agent/vm/opencode-wait.probe.test.ts) (`MDY_OPENCODE_WAIT_PROBE=1`) | the absence of timeout, the death of the process during a wait, the question which does not end the round, and — under `MDY_OPENCODE_WAIT_LIVE=1` — the same wait with a **real** provider | ~50 s, +2 min and ~$0.003 for the live case |
| [worktree-hooks.git.test.ts](../lib/server/agent/worktree-hooks.git.test.ts) | `core.hooksPath` of the main repository **applies** to the commit of a worktree; our end of the tour is plumbing | ordinary, in `npm test` |

The decor is shared: [opencode-probe-rig.ts](../lib/server/agent/vm/opencode-probe-rig.ts),
a fake OpenAI-compatible provider that **scripts** tool calls — it's
which makes the measurement deterministic and free.

**What these probes added to the audit**, and which changes lines of code:

1. **The grammar of the patterns is not the same depending on the permission.** `edit`
   matches paths **relative to the repository**, without expanding `~`;
   `external_directory` matches **absolute** folders, with expanded `~`. The
   corollary is hard: `permission.edit = {"~/.ssh/*": "deny"}` — the way
   whose protection anyone would write — **does not prevent anything and does not require
   nothing**. Writes `"../.ssh/*"`, the same refusal bites. A path ACL for the
   run local must therefore be constructed relative, or not constructed.
2. **The REST catalog is not that of the model.** A bare `deny` removes the
   tool of what is **offered to the model** (measured in the request body of the
   provider), but `/experimental/tool` continues to list it. The measurement of
   the audit was fair; the place to read it was not.
3. **A session ruleset in `action: "allow"` is a real ACL** (unknown to the
   §9 of the audit): it lifts the `ask` from the config without cutting the set of tools —
   where the session `deny` cuts off. This is the only form of authorization
   per session which does not cost a tool.
4. **The V2 system is not connected to anything**: neither `/api/session/:id/permission`,
   neither `/api/permission/request` nor `/api/permission/saved` sees
   anything — even after an “always”. The only native persistence
   offered therefore remains unusable in 1.18.16.
5. **A long wait survives with a real supplier**: 120 seconds of request
   pending on a Haiku round via the proxy, and the round restarts when you respond.
   The fake provider couldn't tell — he had finished his feed before.
6. **`core.hooksPath` traverses worktrees.** The `config` of the main repository
   is shared (only `extensions.worktreeConfig` cuts it): a `git commit`
   from the worktree of a run executes the user's `pre-commit`, husky
   understood. This is not our way — `commitTurnAndPush` is plumbing
   — but anything that would otherwise commit to a worktree should know that.

---

## 3. The parity inventory — our 51 tools, one by one

Source: [tools.ts](../lib/server/agent/tools.ts) (1,801 lines). 51 tools served,
divided into `CORE_TOOLS` (18), `MINDDY_TOOLS` (22), `PR_TOOLS` (3),
`PROJECT_PR_TOOLS` (7) and `create_pr`.

### 3.1 Rendered by opencode — 14 tools that cease to be our code

| Ours | At opencode | What you need to know |
| --- | --- | --- |
| `read_file` | `read` | Same form: absolute `filePath`, `offset`/`limit`, numbered lines, images and PDF attachment. |
| `list_dir` | `read` (on a directory) | No dedicated tool: it is `read` which lists, one name per line, the final `/` on the folders. |
| `glob` | `glob` | `pattern` + `path`. |
| `grep` | `grep` | `pattern` + `path` + `include`, ripgrep. Our [grep-pattern.ts](../lib/server/agent/grep-pattern.ts) / [grep-scope.ts](../lib/server/agent/grep-scope.ts) fall with it. |
| `edit_file` | `edit` | `oldString`/`newString`/`replaceAll`. Our cascade of [edit.ts](../lib/server/agent/edit.ts) is **borrowed from opencode**: we return the original. |
| `write_file` | `write` | Same pair, same mutual exclusion with `apply_patch`. |
| `apply_patch` | `apply_patch` | **Same toggle as ours** on `gpt-*` (measured §2.3). |
| `run_command` | `bash` | Shell **persistent** (gain), `workdir` (gain), timeout to be postponed to 180 s. |
| `move_file` | `bash` | `mv`. No dedicated tool — and the safeguard remains ours (§3.4). |
| `delete_file` | `bash` | `rm`, same. |
| `spawn_agent` | `task` | **FACT** (§2.14): `subagent_type` + `prompt`. The `model` field becomes the NAME of the agent (`explore-<slug>`), the plan ceiling is held by construction, the simultaneous ceiling by the permission verdict. |
| `agent_status` | `task` (`task_id`) | Resumption of a girl by her id, notification upon return of a launch in the background. |
| `list_agents` | — | Not applicable: the supervisor sees child sessions by `/session/:id/children`. |
| `ask_user` | `question` | Native tool + `POST /session/:id/question/:requestID/reply`. The supervisor plugs our `ask_user` into it. |

### 3.2 Without native counterparts — 2 tools to install ourselves, **in the VM**

These are **local** tools (`.opencode/tool/*.ts`, executed in the microVM) and
no domain tools: they do not talk to the control plane.

| Ours | Why it doesn't fall | What we do |
| --- | --- | --- |
| `apply_edits` | Opencode has **no** batch editing (no `multiedit` in 1.18.16). | To decide: put it back in local tool, or abandon it and let the model chain `edit`. The second option costs rounds; the first maintains an editing tool, that is to say exactly what we wanted to stop maintaining. **Proposed default: abandon it**, and measure the additional cost in rounds over the changeover week. |
| `run_background` | `bash` does not have a background mode; opencode's `BackgroundJob` register serves `task`, not the shell. | **DONE (§2.21)**: reposted in LOCAL tool, served by the bridge and executed by the supervisor. [background.ts](../lib/server/agent/background.ts) does not move one line. |

### 3.3 To be redeclared in DOMAIN tools — 35

> **DONE in batch 1**: [opencode-tools.ts](../lib/server/agent/vm/opencode-tools.ts)
> generates them, **32 served out of 32 with our schemas** (§2.9). There is no
> “single table” to write, and it’s better this way: the generator calls
> `agentToolsFor` and filter on routing `Set`
> ([platform-tool-names.ts](../lib/server/agent/platform-tool-names.ts)) — the
> source IS `tools.ts`, so nothing can diverge. The 3 missing from the account
> 35 are not lost: `ask_user` has a native counterpart (`question`), and
> `read_attachment` is a runtime name that is no longer used.

Each becomes a `$XDG_CONFIG_HOME/opencode/tool/*.ts` — **outside the repository**, without
what the end-of-turn `git add -A` would commit them — which posts to the supervisor,
which calls the control plan with the identity given to it by the OIDC of the
firewall (same path as
[control-plane-client.ts](../lib/server/agent/vm/control-plane-client.ts)).

> **The bridge is written**: [tool-bridge.ts](../lib/server/agent/vm/tool-bridge.ts),
> a local server that the supervisor opens BEFORE opencode (its address between
> in the environment) and whose URL is `MDY_SUPERVISOR_URL`. It exists for
> what **the control plan does not count** — it charges what is asked of it,
> he doesn't know what a trick is: the web search ceiling, the anchors of
> proofreading already asked, reading images. Two response rules that hold
> everything else: a FAILED tool responds **200** with `{"error": …}` (the model
> must read the error and decide — a 5xx would make it return a sentence of
> transport which hides the reason), an **unknown name responds 404** (this one is
> our fault, it must be seen).

| Family | Tools |
| --- | --- |
| Tickets (8) | `search_issues`, `read_issue`, `read_feedback`, `read_resource`, `update_issue`, `write_issue_plan`, `append_to_plan`, `edit_issue_text` |
| Wiki (7) | `list_pages`, `search_pages`, `read_page`, `create_page`, `update_page`, `append_to_page`, `edit_page_text` |
| Notebook (4) | `read_scratchpad`, `add_scratchpad_tasks`, `update_scratchpad_task`, `set_scratchpad` |
| Creation / automation (3) | `create_issue`, `create_routine`, `report_verdict` |
| Project PR (7) | `list_pull_requests`, `read_pull_request`, `comment_pull_request`, `comment_pull_request_line`, `reply_pull_request_thread`, `review_pull_request`, `set_pull_request_state` |
| PR reread (3) | `comment_pr_line`, `comment_pr`, `reply_pr_thread` |
| Delivery (1) | `create_pr` |
| Session plan (1) | `update_plan` — `todowrite` is off: our checklist **is** the ticket plan, it synchronizes ([plan-sync.ts](../lib/server/agent/plan-sync.ts)), a local todo cannot be read anywhere |
| Web (1) | `web_search` — **FACT**: the built-in `websearch` is turned off (§2.3, it's not served on OpenRouter anyway) and ours replaces it. The ceiling of the turn (`webSearchMax`, 5 — `MAX_WEB_SEARCHES_PER_TURN`) is held by the bridge, mother and daughters combined, and the counter serves as `seq`: two searches of the same turn make two ledger lines, not one. A rejected search never reaches the control plane, so does not pay the Exa plan (`WEB_SEARCH_USD_PER_CALL`, $0.005) |

What **does not change** with them: anchor targeting (`TARGET_SUFFIX`,
`withRequiredIssue`), structural setbacks (`NON_INTERACTIVE_FORBIDDEN_TOOLS`
for a routine, read-only replay, `SUBAGENT_FORBIDDEN_TOOLS`).
They are now posed by the **config** (`agent.<id>.tools` + `permission`) at
instead of a `filter` on a board — but they are the same rules, and they remain
**structural**, not prompt sentences.

### 3.4 What is not a tool and does not move a line

Pure, tested, unobtrusive functions at opencode. The supervisor plays them again
on `POST /permission/:id/reply` and in a **plugin** (`tool.execute.before/after`,
`session.idle`).

> **DONE in batch 2** for the first two: `command-guard` and `repo-path` are
> replayed on `permission.asked` by
> [opencode-permissions.ts](../lib/server/agent/vm/opencode-permissions.ts) — a
> pure module, and **their tests did not move a single line** (§2.13).

[command-guard.ts](../lib/server/agent/command-guard.ts) ·
[repo-path.ts](../lib/server/agent/repo-path.ts) (`resolveWithin`, `assertNotGit`) ·
[delivery-gate.ts](../lib/server/agent/delivery-gate.ts) ·
[self-review.ts](../lib/server/agent/self-review.ts) ·
[plan-closure.ts](../lib/server/agent/plan-closure.ts) ·
[network-policy.ts](../lib/server/agent/network-policy.ts) ·
[quota.ts](../lib/server/agent/quota.ts) ·
[abandoned-spend.ts](../lib/server/agent/abandoned-spend.ts).

**Their existing tests must pass unchanged.** This is the criterion: if one of these
tests must move, it is because we moved a product rule without meaning to.

### 3.5 To be deleted, but only after the switch

`agent-loop.ts` (2,407 l.), the generic half of `tools.ts`, `tool-loop.ts`,
`prune.ts`, `compact.ts`, `edit.ts`, `patch.ts`, `subagent*.ts`, `retry.ts`,
`content.ts`, `checkpoint-fit.ts`. **Each line confirmed with a `grep` before
leave, no memory** — and not before the changeover week of batch 3.

---

## 4. What remains to be decided

1. ~~**The cost to the ledger**~~ → **sliced** (§2.5): zero difference, we plug in the `cost`
   of opencode, and the supervisor proxy keeps `generation_id` (§2.6).
2. ~~**Cold start in the Sandbox**~~ → **clear** (§2.7): 1.3 s, and
   the installation cooks in the pre-heated snapshot.
3. ~~**The decision to go**~~ → **taken on 2026-08-12**, cf. the header.
4. **`apply_edits`**: abandoned (proposed default) or reposted in local tool? The only one
   question still open, and it is decided on measure - during the week of
   switch of batch 3, at the additional cost in rounds observed, not before.

The rest of the site is in the MIN-286 plan.
