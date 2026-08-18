# The orchestrator in the microVM — framing

> **Date**: 2026-08-07 · **Ticket**: MIN-221 · **Objective**: *Orchestrator in
> long process* (MIN-222 to MIN-225)
>
> **The direction was taken before this document**: the loop lives in the microVM,
> the function receives the request, starts or wakes up the VM, and returns control. We don't
> do not change supplier. This document does not reopen this decision — it decides
> the seven points which make it constructible, and he corrects two premises.
>
> **What was measured to write it**, rather than assumed: the brokerage of
> credentials of the Vercel Sandbox firewall, exercised in a real microVM with the
> real platform key (§1); the cost of a round trip order (§5). Both
> probes are reproducible, their method is in the text.

---

## What has changed since the tickets were written

Two premises of the project no longer hold as they are. They don't cancel it
not — one simplifies it a lot, the other removes an argument from it.

**The credentials proxy is not to be built.** MIN-223 proposed to decide between
two forms to write ourselves (a relay endpoint, or a re-signing of traffic
outgoing “on the Cloudflare model”). The second exists **natively in Vercel
Sandbox**, in the already installed SDK (`@vercel/sandbox@2.6.0`), under the name
*credentials brokering*. It is measured in §1. The estimated ticket `l` becomes a
a question of configuration and safeguards, not of infrastructure.

**Latency gain is not established.** MIN-224 figure “~0.3 s per tool call,
i.e. 30 to 45 s per run.” The measurement of §5 does not confirm this, and the figure must
be re-diverted before being re-served. This does not change the decision: the file of
migration, these are the **11 out of 15 defects** of [problems.md](../problems.md)
who live in slicing, not latency.

---

## 1. The credentials proxy

**Decision: neither of the two proposed forms. The Vercel Sandbox firewall is
the brokerage, and the microVM no longer holds anything at all.**

`networkPolicy` accepts, per domain, rules for `match` (method, path,
headers, query) and `transform` (headers to set on the outgoing request). The
rewriting takes place **after exiting the VM**, in the proxy which terminates the TLS:
the secret never enters his memory space. Politics arises at the
creation and **updates hot** (`sandbox.updateNetworkPolicy`), without
restart the process.

**Probe from 2026-08-07** — real microVM `node24`, real OpenRouter platform key,
policy posed at creation:

```ts
{ allow: {
    "openrouter.ai": [{
      match: { method: ["POST"], path: { exact: "/api/v1/chat/completions" } },
      transform: [{ headers: { authorization: `Bearer ${OPENROUTER_API_KEY}` } }],
    }],
    "*": [],   // the rest of the Internet remains open — see below
} }
```

| What we launched in the VM | Result |
| --- | --- |
| `env \| grep -iE 'key\|token\|secret'` | **no sensitive variables** |
| `grep -c 'sk-or' /proc/self/environ` | **0** |
| `POST /api/v1/chat/completions`, `Authorization: Bearer minddy-placeholder` | **HTTP 200**, real completion, `cost: 0,00000581 $`, `is_byok: false` |
| `GET /api/v1/key`, **same** placeholder (excluding matcher) | **HTTP 401** `Missing Authentication header` |
| `GET httpbin.org/headers` (via catch-all `*`) | receives `Bearer minddy-placeholder` — **injection does not leak elsewhere** |

The matcher is therefore a real boundary: the VM can do *one* credited thing,
and not the provisioning route next door which would have made it possible to issue keys.

**What the microVM still holds: nothing.** No short token, no key to
reduced range. It's stronger than the ticket hoped for, and it's worth too
for its identity — cf. §2, where it is proven by the platform instead of being
carried by a secret.

**Which remains possible, and which must be named.** A hostile model can call the
credited route **outside the loop**: the probe has just done it, with a
`curl`. It's not exfiltration, it's **expense** — and it escapes
to the ledger. The guardrail is not another control in the VM (it is
compromised by hypothesis), it is one **OpenRouter key per run, with hard ceiling**,
minted at launch by the function via the provisioning API, injected by the
`transform`, revoked at the end of the run. The ceiling is then held by the
provider, outside the VM *and* outside our code. In BYOK, we cannot
cap the user's key: it's their key and their bill — to **say** in
the BYOK screen, not to be corrected.

**What we are not trying to close, and why it is what unlocks the
construction site.** Exfiltration of the *contents of the repository* remains possible: the catch-all `*`
let the VM attach anything. This is already the case today (`run_command`
+ open network, cf. §3.2 of [comparison](agent-harness-comparison.md)), the
migration doesn't make it worse, and strict whitelisting would break `npm install`
on the deposits of our users — of which we know neither the private registers nor
the mirrors. Address “the secret must not come out” and “the data must not
coming out” as **two problems** is what makes the first one solvable today.
The second remains open, and the firewall will be able to close it the day we have the opportunity to do so.
need and knowledge of deposits.

**Technical counterpart to know**: to transform, the proxy **ends the
TLS**, with a sandbox CA added to the system certificates. The probe confirms
that the standard variables are already wired (`NODE_EXTRA_CA_CERTS`,
`CURL_CA_BUNDLE`, `GIT_SSL_CAINFO`, `SSL_CERT_FILE`, `NODE_USE_SYSTEM_CA=1`…). A
repository tool that ships its own CA bundle will fail — rare case, message
error to recognize.

---

## 2. The events channel

**Decision: HTTP call to a collection route — but we're not the ones doing it
sign, and the VM does not carry any token.**

The same firewall offers `forwardURL`: requests from the VM to a domain
given are **forwarded to a handler of ours**, with the addition of the header
`vercel-sandbox-oidc-token`. Its claims bear `team_id`, `project_id`,
`sandbox_id` and `sandbox_name` — and our `sandbox_name` **is** `agent-<run.id>`
([sandbox.ts:23](../lib/server/agent/sandbox.ts)). `defineSandboxProxy`
(`@vercel/sandbox/proxy`) checks signature, issuer, expiration and `aud`.

The identity of the run is therefore **proven by the platform and unfalsifiable from the
VM**. Direct consequences:

- no Supabase key enters the microVM, at any range;
- a VM can only write events on **its** run — not because it is checked,
  because it cannot claim anything else;
- the direct follows the same path: `broadcastRunStream`
  ([live.ts:93](../lib/server/agent/live.ts)) becomes a POST on the same surface,
  and the collector **derives the topic from `sandbox_name`** instead of receiving it.
  A run cannot broadcast on another's feed. A Supabase key within reach
  reduced, she would not have been able to prevent it: the topic is a parameter.

On the server side, the collection route does what `appendEvent`
([runs.ts:1076](../lib/server/agent/runs.ts)) already does — same calculation of `seq`,
same retry on collision, same `broadcastRunEvent` behind.

**The point that had to be measured before committing to it: measured, and it passes.**
Probe from 2026-08-07 (MIN-223) — real microVM `node24`, route `defineSandboxProxy`
deployed in preview, `forwardURL` = the bare origin of the deployment:

| What we measured | Result |
| --- | ---: |
| JSON round trip, new connection (median of 20) | **62ms** (min 49, max 130) |
| The same when reusing the connection (median of 20) | **55ms** |
| 60 sec SSE flow | **held** — 200, TTFB **54 ms**, 61 events, total 60.08 s |
| Request body accepted | **4 MiB yes, 4.3 MiB no** (413 `FUNCTION_PAYLOAD_TOO_LARGE`) |
| `sandbox_name` received in handler | **correct**, the identity of the run is well proven |
| Policy after session resume | **survives** — completion 200 and forward 200 without resting anything |

The control plan therefore costs **~55 ms per call** compared to ~211 ms of a
round trip `runCommand` (§5): it is not the expensive point of the migration. The
fallback (`transform` on the Supabase domain, assuming that a compromised VM
can write events on another run) **does not need to be** — we leave it
written for the record, it is no longer the way.

**Two results not to be lost, because they constrain MIN-224.**

1. **The body is capped at 4.5 MB** — the limit of Vercel functions, which the
   forward does not report. Or `MAX_CHECKPOINT_BYTES` is worth **8 MB**
   ([checkpoint-fit.ts](../lib/server/agent/checkpoint-fit.ts)): a checkpoint at
   its current ceiling **does not pass**. The route itself refuses beyond 4 MB,
   in JSON — without that the platform renders a 413 in HTML that a loop would read as
   a success, and that’s the checkpoint we would lose. To be decided in MIN-224:
   lower the cap of `fitCheckpoint`, or remove the checkpoint from this route.
2. **The domain called must RESOLVE to DNS.** A fictitious TLD
   (`minddy-control.invalid`) and a subdomain without registration
   (`agent-vm.minddy.app`) both fail in `curl (6) could not resolve host`,
   in http as in https: the firewall does not intercept a resolution that does not have
   place. Hence the form chosen — the VM calls **our own origin**, and the
   `forwardURL` being this bare origin, the URL it calls and the one that arrives
   with us are literally the same; the firewall only adds the OIDC.

**Transform or forwardURL for LLM?** Both work; they don't hold
the same promise.

| | `transform` (measured, §1) | `forwardURL` (unmetered) |
| --- | --- | --- |
| Does the key fit into the VM? | no | no |
| Who counts the expense? | the loop, **in** the VM | our handler, **outside** the VM |
| Can a compromised VM spend off-meter? | yes (limited by the ceiling key) | no |
| Function invocations | zero | one per round LLM |
| Streaming SSE long | native | **held** (measured: 60 s, TTFB 54 ms) |

**Retained: `transform` + key per run on hard ceiling.** This is the only one of the two that
be measured, it does not add any invocation on the hottest path, and the
supplier cap limits exactly what the meter would miss. `forwardURL`
remains the path of the control plane (events, checkpoint, tools), where the volume is
low and where the proven identity is worth more than the latency.

**The cost of invocations, encrypted because it will surprise otherwise**: `emitLive`
broadcast ~4×/s (`LIVE_FLUSH_MS = 250`). A ten minute ride makes ~2,400 calls
to the control plan. Three outcomes, in the order in which we take them: keep 250 ms
and **measure**; increase to 500 ms; or hold **a single long connection** (the
Vercel functions now accept WebSockets). v1 takes first, and
put the number on the dashboard — not the other way around.

---

## 3. What remains in the function

The border, black on white. **Everything not in this list goes into
the VM.**

1. **Launch** (`launchAgentRun`): quota, creation of the `agent_runs` line,
   resolution of the deposit and mint of the forge token, creation or awakening of the
   microVM, **installing the `networkPolicy`**, starting the loop process
   `detached: true`, immediate return.
2. **Waking up**: the same gesture on a resting run that we restart (`/steer` on a
   run `completed`).
3. **The control plane** that the VM calls (§2): events, checkpoint, ledger
   `ai_usage`, tools ticket and notebook, forge tools (`create_pr`, comments from
   PR), notifications, ticket status sync, string hooks
   automation.
4. **UI readings**: events, diff, PR, heartbeat — unchanged, they do not
   know nothing of all that.
5. **`steer` and `interrupt` — unchanged, and this is the cheapest point of the
   construction site.** Both are already passing through the base (`agent_run_messages`,
   `interrupt_requested`) and the loop *interrogates* them
   ([agent-loop.ts:853](../lib/server/agent/agent-loop.ts)). She will continue,
   from the VM, by the control plane. **No function→VM control channel
   needs to be invented** — no exposed port, no websocket, no signal file.
6. **The idle microVM reaper** (`reapIdleSandboxes`) and the **watchdog**
   which replaces `requeueStuckRuns` (§4).

What leaves, therefore: `runAgentLoop` and all its orchestration, the 25 tools, the
prompt system, editing cascade, pruning, compaction, subagents,
background jobs, `commitAndPush`.

**How the code arrives in the VM.** The package to be loaded does not contain **any
SDK** — neither `@supabase/supabase-js`, nor forge client: everything goes through `fetch`
to the control plane. It's pure logic plus HTTP calls. A bundle
esbuild written by `writeFiles` at startup is sufficient (esbuild is not yet a
dependency of the repository: this is an addition to make). The pre-heated image
(`AGENT_SANDBOX_SNAPSHOT_ID`, already wired) remains the optimization after, not v1.

**MicroVM footage changes hands.** `recordSandboxUsage`
([execute.ts:3176](../lib/server/agent/execute.ts)) charges today the
wall-clock of the chunk from the `finally` of the function. Without chunk, there is no more
no one to keep this clock: the footage becomes “beginning of the round → end of the
turn”, placed by the loop at the moment when she gives up the hand, with the guard dog
as a net when she doesn't. **Don't forget**: it's half
compute the invoice, and it would disappear silently.

---

## 4. When the VM dies anyway

**Decision: the checkpoint does not disappear, it changes role.** Today it
is the transport between two **chunks**. Tomorrow it is the state between two **towers**,
plus a periodic save during the turn.

**Why it can't disappear.** A conversation at rest three days,
whose microVM was cut off by the reaper (~5 min of inactivity) and the snapshot
erased by its expiration, must leave with its history. The checkpoint is
only place where he lives.

**Pushed WIP branch is not enough**, contrary to what the ticket
hoped — and this is the point to contradict first if someone is not
okay. It saves the **work**, not the **conversation**. A tour resumed since
git alone finds its code and loses everything that the model had understood, tried,
dismissed. This is already true today beyond the expiration of the snapshot, and it is
already bad.

**The form retained**: writing at the end of each turn (like today), more
a periodic save point during the turn — every N minutes or M
rounds, to be calibrated. Without it, a two-hour tour that loses its VM loses two
hours. `fitCheckpoint` ([checkpoint-fit.ts](../lib/server/agent/checkpoint-fit.ts),
MIN-217) is kept as is: written six times less often, no less useful.

**The watchdog replaces `requeueStuckRuns`.** A run `running` whose process
loop is dead — `Command.wait()` has returned, or the VM session has disappeared —
returns to rest on its last checkpoint, and **says it in the thread**. This is not
plus a claim theft from someone presumed to be blocked (`STUCK_RUNNING_MS`, 20 min of silence),
it is a death report, and it is correct: the platform knows if the process is alive.

---

## 5. Tools in the VM

**`resolveWithin` and `assertNotGit` keep exactly the same meaning, and do not change
not one line.** These are pure path functions
([repo-path.ts](../lib/server/agent/repo-path.ts)), applied to the arguments of the
model before touching the disc. That the harness turns in the machine it
guard does not change anything that they refuse.

**What really changes, and which we would otherwise discover in pain**: the
harness and model now share the same disk. Two consequences.

- The harness must live **outside `REPO_DIR`**, like `TOOL_OUTPUT_DIR` does
  already ([sandbox.ts:71](../lib/server/agent/sandbox.ts)), so that the `git add -A`
  end of turn never prevails in a commit.
- The microVM ceases to be “disposable and inconsequential” — the argument of §3.2 of
  [comparison](agent-harness-comparison.md), which justified not guarding
  orders. A `rm -rf /vercel/sandbox` of the model now kills its own
  tower. It's an **inconvenience, not a flaw** (nothing lasting lives there, the
  branch is pushed), but the argument “the VM is disposable” can no longer be
  invoked as is.

**The latency gain, measured, and smaller than announced.**

| Measurement (2026-08-07, real microVM, driven from the Mac) | Value |
| --- | ---: |
| Round trip `runCommand("true")`, median of 10 | **211 ms** (min 176, max 933) |
| The same 10 commands chained **in** the VM, a single round trip | **227 ms** total |

Or ~21 ms per command versus ~211 ms: **the RPC is indeed the majority of the cost**.
But the measurement starts from France, and the journey to the Vercel control plane in
bears the brunt (~180 ms of floor observed on a reused connection). Since
a function co-located in `iad1`, it will be **significantly less**.

**Conclusion: the figure “~0.3 s per tool call, 30 to 45 s per run” of MIN-224
is not established.** It must be re-derived from the production timestamps
(`agent_run_events`, `tool_call` → `tool_result`, **minus** the duration of the command
itself) before being used as an argument. The migration file remains
whole without it: these are the 11 defects out of 15 in the audit.

---

## 6. The migration path

**Decision: flag by PROJECT, frozen on the run line when launched.**

**By project, not by run.** By run, we cannot answer “why this
Did one session behave differently than the other? ". Per project, we switch one
deposit at the same time — starting with Minddy's, where we see everything — and a
conversation never changes engine during its life. The mechanism exists:
a `app_config` (like `agent_subagent_max_parallel`,
[subagent-config.ts:105](../lib/server/agent/subagent-config.ts)) carrying a
list of `project_id`.

**Fixed at launch.** The flag is read at launch and written on the run line,
as `model` and `reasoning_level` already are
([runs.ts:178](../lib/server/agent/runs.ts)). Without that, a lap resumed after the
switch would start again on a loop which never saw its checkpoint.

**How long do the two coexist.** The time that an actual deposit — minddy —
spend **an entire week** on the new form without the thread saying anything else
thing as the old one: same events, same order, same ledger costs. This is the
criterion, not a date. **Who decides**: Clément, on this criterion.

---

## 7. What to delete, and when

**After, never during.** Each line is a batch 3 ticket (MIN-225) which is
closes on its own the day the last project collapsed. List verified in the
code, no memory:

| File | What dies |
| --- | --- |
| [execute.ts](../lib/server/agent/execute.ts) | The entire chunk loop: admit (`chunkFitsSubagentResume`, event `chunk_deferred`), bootstrap replay, exit `suspended`, `MAX_WALL_CLOCK_MS`, `MAX_ERROR_REQUEUE_ATTEMPTS`, `SUBAGENT_RESUME_DEFER_MS` |
| [chunk-budget.ts](../lib/server/agent/chunk-budget.ts) | **The module, except one function**: `COMMIT_MARGIN_MS`, `MIN_SOFT_DEADLINE_MS`, `CHUNK_FLOOR_MS`, `COLD_SETUP_ALLOWANCE_MS`, `MIN_CHUNK_BUDGET_MS`, `chunkSoftDeadlineMs`. `runCommandTimeoutMs` **survives** (the tool ceiling remains) but loses its term `remainingMs` |
| [drain.ts](../lib/server/agent/drain.ts) | `drainAgentRuns` and its claim→execute loop. `reapIdleSandboxes` and `hasDueAgentWork` **survive** |
| [runs.ts](../lib/server/agent/runs.ts) | `claimRun`, `requeueStuckRuns`, `STUCK_RUNNING_MS`, `MAX_CRASH_ATTEMPTS` ; columns `continuations`, `attempts`, `window_started_at`, and `not_before` in its requeue usage |
| `AgentCheckpoint` | `parkedForSubagents`, `providerRetries`, `usageSeq` (more slice per chunk); `instructions`, `editedPaths`, `repoTouched`, `lastFilesSha` become **local tour variables** again. `messages` remains |
| [subagent.ts](../lib/server/agent/subagent.ts) | `suspendAll`, `resumeSuspended`, `restore`, `SubagentRecord` serialized, `SUBAGENT_RECORDS_KEPT`, `isResumableSubagent`. Girls become promises again |
| [subagent-config.ts](../lib/server/agent/subagent-config.ts) | `SUBAGENT_PARENT_RESERVE_MS`, `SUBAGENT_MIN_MS`, `SUBAGENT_RESUME_MIN_SOFT_DEADLINE_MS`, `chunkFitsSubagentResume`, `SUBAGENT_MAX_MS`, `SUBAGENT_CUT_MARGIN_MS` |
| [retry.ts](../lib/server/agent/retry.ts) | `planProviderStall` (MIN-219): a long process **waits**, it no longer queues. The backoff remains, recovery accounting disappears |
| [agent-loop.ts](../lib/server/agent/agent-loop.ts) | `MAX_ROUNDS_PER_CHUNK`, the soft-deadline and its output `suspend`, `MAX_COMPACTIONS_PER_WINDOW`, `AGENT_COMPACT_MIN_BUDGET_MS` |

**Which CANNOT be deleted and which one would think disposable.** **Lot 1** of the audit
journey with the loop: the spending limit shared between the girls, reading
of `finish_reason`, refusal of unreadable tool arguments, lock
writing `create_pr`. And `fitCheckpoint` (MIN-217) remains: a checkpoint
end of turn can be as big as an end of chunk checkpoint.

---

### 7 bis. What was actually deleted (MIN-225, 2026-08-14)

**The table above was written before the move to opencode, and half of
its lines were carried away by this turn rather than by this ticket** — the loop
entire house is gone in MIN-286 (file `harness-opencode.md` §2.31), with
`agent-loop.ts`, `subagent.ts`, `exec-tool.ts`, `checkpoint-fit.ts` and the rest.
What remained of the CUTTING machinery, and which left here:

| What disappears | What replaces it |
| --- | --- |
| `chunk-budget.ts` **entire** (not “except a function”) | `runCommandTimeoutMs` no longer has a caller: its consumer was `exec-tool.ts`, and opencode runs the shell itself |
| `drain-chain.ts`, `MAX_DRAIN_CHAIN`, the `?chain=N` parameter | nothing: a launch is counted in seconds, a window absorbs all the runs due, and the two paths which re-enqueue a run call `kickAgentDrain` directly |
| `requeueStuckRuns`, `STUCK_RUNNING_MS`, `MAX_CRASH_ATTEMPTS` | `reapDeadVmRuns`, which does not presume death after twenty minutes of silence: it ASKS the platform if the process lives |
| boot floor (`CHUNK_FLOOR_MS`) and daughter resume admission (`chunkFitsSubagentResume`, `SUBAGENT_PARENT_RESERVE_MS`, `SUBAGENT_MIN_MS`) | nothing: they protected a chunk from the death of its function, and the function no longer carries the trick |
| `MIN_CHUNK_BUDGET_MS` (40 s, derived from chunk) | `MIN_LAUNCH_BUDGET_MS` (120 s), sized on what a **launch** costs: the clone of a cold repository, not thirteen minutes of work |
| `maxDuration = 800` on the cron route | `300`, the default — the handler only throws, and keeping 800 would lie about his profession |
| `window_started_at` (written, never read) | Nothing ; the **column** remains in base, cf. below |

**Two lines in the original table were false, and remained so**:
`planProviderStall` **survives** (it is called by `landVmTurn`, see the plan of
MIN-225), and `claimRun` **survives** — the CAS remains the only protection against a
double launch.

**Columns are NOT deleted, and this is deliberate.** `continuations` and
`attempts` are still READ (seq bands of the ledger, re-queue terminal on
error); `window_started_at` is no longer, but a `drop column` must follow the
deployment of code that stopped writing it, never preceded it — otherwise all
Writing the in-flight version fails the second the migration passes. Three
inert columns cost nothing; the window between migration and deployment, yes.

---

## Open question decided: is an EU region blocking?

**No — and there is still a line to correct, regardless of the site.**

Vercel Sandbox only exists in **`iad1`** (pricing documentation, revision of the
2026-08-04; this is also where the user repository is cloned today).
Migration only adds one thing: the **checkpoint** — the history of the
conversation — now passes through the VM instead of remaining between the function and
Supabase. Same country, same subcontractor, already on the register.

But by rereading [docs/rgpd/sous-contractors.md](rgpd/sous-contractors.md) for the
check, the Vercel sheet says: *“ephemeral micro-VM per run, destroyed at the end. The
repository code is cloned there for the duration of the run only. »* **This is already inaccurate
today**: sandboxes are `persistent: true` with a snapshot preserved
**7 days** ([sandbox.ts:60](../lib/server/agent/sandbox.ts)) — the filesystem is
*stored*, not just *in transit*. The migration will add the history of the
conversation. **The sheet was corrected at the same time as this document**: duration of
snapshot retention, and `iad1` as a *closed* constraint for sandboxes —
where the region of *functions* remains an open point.

---

## What this framing did not do

- **The end-to-end run in the new form was not played.** He requests the
  VM bundle and the collection route, i.e. the start of MIN-224. It remains there
  first step of checking this ticket, before the first test.
- ~~**`forwardURL` is not measured**~~ — **made 2026-08-07** (MIN-223), numbers
  in §2. It holds: ~55 ms per round trip, SSE of 60 s held. Two constraints in
  are output (body capped at 4.5 MB, domain must resolve in DNS), all
  two in charge of MIN-224.
- **Intra-region RPC latency is not measured** (§5), and the figure of MIN-224
  should not be re-served until ready.
