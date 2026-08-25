# The reasoning of the code agent, provider by provider

> **Date**: 2026-07-29, reviewed on 2026-08-11 · **Ticket**: MIN-122
>
> What the user chooses, what really goes on the thread, and what is
> passes when the model in front does not want it.

## What changed on 2026-08-11: the levels are those of the MODELS

The original four tiers (`off` / `low` / `medium` / `high`) were the
same for all models. They are no longer, because the models do not
are not: OpenRouter publishes the accepted levels **model by model** in
`/models` (object `reasoning`, field `supported_efforts`) — 128 models out of 406 in
declare one, and two of them are rarely the same:

| Model | What he accepts |
| --- | --- |
| `openai/gpt-5.1` | `low` · `medium` · `high` · `none` |
| `openai/gpt-5.1-codex-max` | `low` · `medium` · `high` · **`xhigh`**, and `mandatory` (no “no reasoning”) |
| `google/gemini-3.6-flash` | **`minimal`** · `low` · `medium` · `high`, `mandatory` |
| `anthropic/claude-*` | he reasons, but publishes **no** enumeration |
| a model without an object `reasoning` | nothing: the selector remains inert |

The internal vocabulary therefore expands to that of OpenRouter — `off`, `minimal`,
`low`, `medium`, `high`, `xhigh`, `max` — except for one word: their `none` is our
`off`, which says a little more (do not send **any** fields).

Three consequences, all in [lib/agent-reasoning.ts](../lib/agent-reasoning.ts):

- **the selector lists what the chosen model accepts** (`reasoningLevelsFor`),
  and falls back on the four histories when the model publishes nothing — a
  Direct BYOK, a non-index model. A level that we do not know how to name is thrown
  by reading the index rather than guessing;
- **a level that no longer holds is lowered** (`nearestReasoningLevel`): first
  downward, never above what was requested — unless the model has
  nothing cheaper;
- **`xhigh` and `max` only go to OpenRouter.** This is its vocabulary, and it
  the flap itself on what the model accepts. The compat diapers do not
  only know that of the OpenAI API: we therefore fold BEFORE sending, because
  that a refused field returns to 400 and kills the round.

The `CHECK` constraint of the two columns concerned has been extended accordingly
(`supabase/migrations/20261212090000_agent_reasoning_levels_widen.sql`): this is a
pure enlargement, no existing lines to rewrite.

## The principle in one sentence

**A single internal vocabulary: `effort`.** Levels are expressed in
`AiChatRequest.reasoning`, then translated at the last moment: `reasoning` at
OpenRouter, `reasoning_effort` at OpenAI/Gemini and `thinking` model-aware at
Anthropic. The contract and the translation live in
[lib/ai-chat.ts](../lib/ai-chat.ts); [lib/agent-reasoning.ts](../lib/agent-reasoning.ts)
no longer carries a decision specific to a surface.

## The table

| Provider | Endpoint | `reasoningField` | What goes on the wire |
| --- | --- | --- | --- |
| **OpenRouter** (quota minddy + BYOK) | `openrouter.ai/api/v1/chat/completions` | `reasoning` | `reasoning: { effort: "low"\|"medium"\|"high", exclude: false }` |
| **OpenAI** (BYOK) | `api.openai.com/v1/chat/completions` | `reasoning_effort` | `reasoning_effort: "low"\|"medium"\|"high"` |
| **Anthropic** (BYOK) | `api.anthropic.com/v1/chat/completions` | `thinking` | adaptive on current families; manual budget limited only when the family accepts it |
| **Google / Gemini** (BYOK) | `…/v1beta/openai/chat/completions` | `reasoning_effort` | `reasoning_effort: "low"\|"medium"\|"high"` |
| **Generic** (OpenAI-compatible) | base URL entered | *(none)* | **nothing, never** |

At `off`, no fields are sent to OpenRouter/OpenAI/Gemini/generic. On a
Claude family recognized, the adapter explicitly sends
`thinking: { type: "disabled" }`, because Claude 5 can reason by default.

OpenAI GPT-5.6 exception: as soon as Chat Completions contains function tools,
the adapter sends `reasoning_effort: "none"`, regardless of the level chosen.
OpenAI rejects this combination with active effort and recommends Responses
to maintain both reasoning, tools and multi-turn.

**The default is `medium`** (“Standard” in the UI): a code agent gains at
think a little before acting. `off` was the default on the day of delivery of
MIN-122, to not change anything in the existing behavior while observing the
field on the real; this was not the best setting for the user.
The fault lives in one place, `DEFAULT_REASONING_LEVEL`
([lib/agent-reasoning.ts](../lib/agent-reasoning.ts)): the server cascade
(`resolveReasoningLevel`), launch selector and account setting
everyone reads. The `agent_runs.reasoning_level` column keeps a `default 'off'`
in base — a net that is never used, `createRun` always writing the level
resolved.

### Why the credits remain silent

Its base URL is an unknown server (vLLM, LM Studio, an in-house proxy, etc.). The
*documented* compat layers ignore unknown fields; a strict waiter, he,
answers **400**, and an unrecoverable 400 kills the run. Send a field to a
endpoint about which we know nothing, it is betting the user's run on a
assumption. We don't do it.

## Anthropic and Gemini particularities

The OpenAI-compatible Anthropic layer ignores `reasoning_effort`, but accepts the
Anthropic `thinking` setting. The adapter therefore chooses the mode according to
the family: adaptive for current models, manual only on
4.5/4.6 families who accept it when a fixed budget is requested. The budget
manual always remains at least at 1024 and strictly under the output ceiling.
An unknown family receives no experimental fields.

Gemini instead documents `reasoning_effort` and its translation to
`thinking_level`/`thinking_budget`. You should not send the field directly
native `thinkingConfig` on the OpenAI-compatible surface.

The provider-specific contract and its compatibility boundaries are enforced in
[`lib/ai-chat.ts`](../lib/ai-chat.ts) and covered by its tests.

## What each level means in concrete terms

`effort` is a relative cursor, not a token budget: it is the provider who
decides how many reflection tokens it grants, and this varies from model to model
the other. What minddy guarantees is monotony — `low` < `medium` < `high` —
and the fact that `off` doesn't ask for anything.

| Level | What it changes | What it costs |
| --- | --- | --- |
| `off` | The model responds directly. | Nothing more. |
| `low` | A short thought before acting. | +1024 cap tokens. |
| `medium` | The model takes the time to prepare her work. | +2048. |
| `high` | The longest thinking, for difficult tasks. | +4096. |

The “cost” column is the increase in the internal ceiling `maxOutputTokens`
(`reasoningMaxTokens`): **reflection tokens are counted towards the cap
output and its alias provider** by the compat layers. Without this increase, at `high`, the reflection would eat
most of the 8192 in the OpenRouter/Anthropic profile and would truncate the response **and
the tool-calls** of the round.

## `high` and the minddy quota

**The four levels are open to all**, minddy quota included. The subscription is
paid: it must be usable in its entirety.

A “`high` limit reserved for BYOK” existed for a while, then was removed — it does not
protected from nothing. Reflection tokens are billed from the usage budget
monthly plan (`plan.includedUsageUsd`,
[lib/server/agent/quota.ts](../lib/server/agent/quota.ts)), but this budget is
**already** a hard terminal: `checkAgentQuota` refuses the launch when it is
exhausted, the loop stops by itself when it drops to zero during the run, and the
spend-guard keeps the OpenRouter key. A `high` therefore consumes the budget faster —
which is the business of the one who paid for it - without ever being able to exceed it.
Restricting the level in addition was a rule to be explained in exchange for nothing.

**Nothing to correct on the counting side** — observed on real OpenRouter calls
(2026-07-29, `anthropic/claude-sonnet-4.5`):

```
prompt_tokens: 52 · completion_tokens: 170 · total_tokens: 222   (52 + 170 = 222)
completion_tokens_details.reasoning_tokens: 103
cost: 0.002706
```

`reasoning_tokens` is a **detail of** `completion_tokens`, not a counter to
side: the reflection tokens are therefore already in `completion_tokens` **and** in
`usage.cost`. `parseOpenRouterUsage` ([lib/server/ai-usage.ts](../lib/server/ai-usage.ts))
has nothing to change — neither for the quota (counted in USD), nor for the display of
tokens.

The additional cost is real and can be seen: on the same short prompt, `off` cost
$0.000165 and `low` $0.002592. It is not limited by a level ceiling — the
four are open to all, minddy quota included — but by the usage budget
itself: `checkAgentQuota` refuses the launch and the loop stops by itself
when he is exhausted.

## When the model is not capable

Two behaviors remain possible, and they are distinguished **only at execution**:

1. **The field is ignored.** The run takes place normally, without reflection. Nothing
   indicates it — otherwise the thread will not display any “Reasoning” lines.
2. **The field is rejected (400).** Known case: OpenAI + a non-reasoning model
   (`gpt-4o`, `gpt-4o-mini`). A 400 cannot be taken back: without guardrails, it
   would cause the run to fail.

The main safeguard is now static: the credits remain silent, and the
known providers all go through the model-aware translator. A field rejection of
reasoning is not restarted silently, because this would make one believe that the
chosen level has been applied. Only the output ceiling alias can be retried,
once, after a 400 which explicitly names this alias as unsupported.

**If an endpoint silently ignores the field** (level chosen, no effect
observable), the correct answer is to **remove its capacity from the register** rather than
to lie in the UI.

## What the user sees

The reasoning **is not streamed**. It used to be (a text bubble that
was written directly), which drowned the progress of the work under pages of
monologue. Instead:

- during reflection, a compact “Reasoning” line (same template as a
  tool-call) with a **seconds counter on the right**, timed on the server side and
  rebroadcast ~4 times per second on the `agent-run:{runId}` topic;
- at the end of the round, the trace is persisted (event `thinking` marked
  `kind: "reasoning"`, capped at 2000 characters, with its `durationMs`) and remains
  **folded** — unfoldable for anyone who wants to read it.

The level is **frozen on run** (`agent_runs.reasoning_level`), like the model:
a run is divided into chunks taken up by successive serverless invocations, a
state in memory would not survive it. The personal flaw lives in
`user_agent_preferences.default_reasoning_level` ; `null` (never set) falls to
`DEFAULT_REASONING_LEVEL`, or `medium`.

## The compaction reasoning

The **compaction** call (the stale history middle summary) does not receive
never a level of reasoning: it is a mechanical summarization, reflection
would only be cost.

## Check

```bash
npx vitest run lib/agent-reasoning.test.ts   # forms per provider, generic gate, ceiling
```

### What was verified on real (2026-07-29)

Direct probe on `openrouter.ai/api/v1/chat/completions` with the platform key,
by replaying the body that `streamCompletionOnce` constructs:

| Level | `reasoning_tokens` | Received reasoning deltas | Cost |
| --- | --- | --- | --- |
| `off` | 0 | none | $0.000165 |
| `low` | 81 | 304 characters, 1.3 sec | $0.002592 |
| `high` | 83 | 311 characters, 1.7 sec | $0.002727 |

Three things confirmed at once: the field is **transmitted**, it is **respected**
(`off` literally produces no reflection tokens), and the trace returns fine
in `delta.reasoning` — so the loop timer has something to measure.

### What remains to be seen by provider

BYOK **OpenAI / Anthropic / Gemini direct** have not been probed (no key
test on hand). The most interesting case is OpenAI + a **non** model
reasoner (`gpt-4o-mini`): this is the expected trigger of guardrail 400. This
that we then check, it is not that the level applies, it is that the run **is
ends anyway**.
