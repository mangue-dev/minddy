# Numo reasoning levels, provider by provider

> **Date**: 2026-07-29, reviewed on 2026-10-05, 2026-10-16 and 2026-10-28 · **Tickets**: MIN-122, MIN-721, MIN-826
>
> What the user chooses, what really goes on the wire, and what happens
> when the model in front does not accept it.

These levels were introduced for Numo's code worker. MIN-721 removed that
worker: the levels now apply to Numo conversations (the composer selector and
the instance default) and to the AI features that share `lib/ai-chat.ts`.
The code worker's run and preference tables were dropped with it.

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

Direct BYOK providers have no index either. Their levels come from the
documented per-model rules in `nativeModelReasoning` (`lib/ai-chat.ts`), the
same rules the translator applies, so the picker never offers a level the
request would drop (MIN-826). A model with `reasoning: null` has no level at
all and the Numo slider stays on "Off": a non-reasoning OpenRouter model, an
OpenAI chat model (`gpt-4o`), a non-thinking Gemini, and every model of an
endpoint without a reasoning field (OpenCode gateways, generic, LM Studio,
Ollama).

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

| Provider | Endpoint | Levels (picker = wire) | At `off` |
| --- | --- | --- | --- |
| **OpenRouter** (quota minddy + BYOK) | `openrouter.ai/api/v1/chat/completions` | `reasoning: { effort, exclude: false }`, levels published per model | `reasoning: { enabled: false }` |
| **OpenAI** (BYOK) | `api.openai.com/v1/chat/completions` | `reasoning_effort` on reasoning models only (o-series, GPT-5): `low`/`medium`/`high`, plus `minimal` on GPT-5 | `"none"` on GPT-5.1+; GPT-5 and o-series always reason |
| **Anthropic** (BYOK) | native `api.anthropic.com/v1/messages` | adaptive families: `thinking: { type: "adaptive", display: "summarized" }` + `output_config: { effort }` (`low`…`max`, no `xhigh` on 4.6); 4.5: `budget_tokens` | `thinking: { type: "disabled" }`; Opus/Sonnet 5.5, Fable, Mythos: effort `low` |
| **Google / Gemini** (BYOK) | `…/v1beta/openai/chat/completions` | `reasoning_effort`: 2.5 Flash / Pro and Gemini 3 `low`/`medium`/`high`, Gemini 3 Pro `low`/`high` | `"none"` on 2.5 Flash; 2.5 Pro and Gemini 3 always reason |
| **OpenCode, generic, local** | gateway or base URL entered | *(none)*: no level offered | nothing |

**`off` means off** where the model allows it (MIN-826). It used to send no
field, which ran most models at their default effort: on OpenRouter a
DeepSeek V4.1 Flash call still produced 38 reasoning tokens at "off", and
OpenAI GPT-5.x and Gemini 2.5 Flash default to `medium`. The Numo slider
keeps "Off" as its first stop; on a model that must reason,
`resolveNumoTurnConfiguration` runs its lowest level instead. When a catalog
did not say a model must reason, the provider's 400 ("Reasoning is
mandatory…", "cannot be turned off") is replayed once without the field by
`repairRejectedAiChatBody`.

Claude Opus 5.5, Sonnet 5.5, Fable 5.1, and Mythos 5.1 reject forced tool use
on every request. The shared chat adapter downgrades forced `tool_choice` to
`auto` on those families; non-forced choices remain unchanged. A forced tool
call also drops a manual thinking budget ("Thinking may not be enabled when
tool_choice forces tool use"). See the
[Anthropic thinking reference](https://platform.claude.com/docs/en/build-with-claude/thinking).

OpenAI GPT-5.6 exception: as soon as Chat Completions contains function tools,
the adapter sends `reasoning_effort: "none"`, regardless of the level chosen.
OpenAI rejects this combination with active effort and recommends Responses
to maintain both reasoning, tools and multi-turn.

### Smart Fill structured output

Smart Fill has a 2048-token output budget and a 20-second LLM deadline.
Its forced tool call opts into `preferNonReasoning`: the cached OpenRouter
metadata must report a reasoning object with `mandatory: false` before the
request explicitly sends `reasoning: { enabled: false }`. This differs from
`effort: "off"`, which still omits reasoning fields and keeps model defaults.
The shared chat contract exposes this explicit setting as
`AiChatRequest.reasoning.enabled: false` for OpenRouter only.

Metadata is checked against the resolved runtime model, including an account's
BYOK override and routing suffix. Available metadata, including stale entries,
is read synchronously; the existing catalog loader refreshes in the background
without delaying generation. The catalog is cached per function instance, so
the decision runner starts loading it while the decision model answers, and an empty cache
waits at most `COLD_CATALOG_WAIT_MS` (1.5 seconds) inside the 20-second
deadline before the request is sent. A catalog still missing after that wait,
or mandatory/unknown reasoning, retains the existing low-effort request for
that call and logs `reasoning_metadata_unavailable`. A failed refresh leaves cached metadata usable. Direct BYOK
providers keep their provider-specific effort translation. Smart Assign and
Feedback Review do not opt into this policy.

The forced tool helper reports `request_timeout` when its deadline interrupts
the request or response body. Invalid response JSON remains
`response_json_invalid`; missing expected tools report `output_truncated` for
a `length` finish reason or `expected_tool_missing` otherwise. These are fixed
codes without response content or exception messages. A deadline never
triggers a retry, and an unsuccessful fill still permits issue creation.
See the [MIN-674 incident review](audits/min-674-smart-fill.md).

When that LLM fallback fails after a low-confidence decision-model answer,
Smart Fill keeps the answers whose own confidence meets `jev_confidence_floor` and
fills only those fields. The runner offers this through the opt-in
`keepConfidentModelAnswers` input; Smart Assign and Feedback Review still
receive `null`. The runner logs `llm_failed` with the fallback reason, run ID
and kept field names, and Smart Fill logs its outcome (`no_decision`,
`model_partial` or an empty patch) and gate skips (`platform_disabled`,
`budget_exhausted`, `context_unavailable`). These lines contain no issue
text, answers or exception messages. See the
[MIN-687 incident review](audits/min-687-smart-fill.md).

**The default is `medium`** (“Standard” in the UI): Numo thinks a little
before acting. `off` was the default on the day of delivery of
MIN-122, to not change anything in the existing behavior while observing the
field on the real; this was not the best setting for the user.
The default lives in one place, `DEFAULT_REASONING_LEVEL`
([lib/agent-reasoning.ts](../lib/agent-reasoning.ts)), which the Numo
conversation configuration
([lib/server/assistant/conversation-config.ts](../lib/server/assistant/conversation-config.ts))
and the instance model settings read.

### Why the credits remain silent

Its base URL is an unknown server (vLLM, LM Studio, an in-house proxy, etc.). The
*documented* compat layers ignore unknown fields; a strict waiter, he,
answers **400**, and an unrecoverable 400 kills the turn. Sending a field to an
endpoint about which we know nothing bets the user's turn on an
assumption. We don't do it.

## Anthropic and Gemini particularities

Anthropic is the one provider not reached through an OpenAI-compatible layer.
Its compatibility endpoint cannot carry Claude's reasoning, as checked against
the API with a BYOK key on 2026-10-27: `thinking: { type: "adaptive" }`
returns 400 "Adaptive thinking is not available via the OpenAI compatibility
endpoint" on every model (every Numo turn on Claude 4.7+ and Claude 5 failed),
and `reasoning_effort` / `output_config.effort` are accepted and ignored.

`fetchAiChat` therefore converts the chat body to the native Messages API and
converts the reply back (`lib/server/anthropic-messages.ts`): system messages
are hoisted, tool calls become `tool_use` / `tool_result` blocks, images and
PDFs become `image` / `document` blocks, `response_format` with a JSON schema
becomes `output_config.format`, and the event stream becomes chat chunks.
Thinking summaries stream as `delta.reasoning`, the field the Numo reasoning
feed already reads. Callers see no difference. The native API accepts tool
history without the earlier thinking blocks, which the chat history does not
keep. Every request also sets top-level `cache_control` (automatic prompt
caching of the system prompt and tools Numo resends each round). Numo now
sends images and PDFs to Claude, which every current model reads.

Thinking takes its share of `max_tokens`: when adaptive thinking runs, the
ceiling is lifted to at least 16,000 tokens (only generated tokens are billed).
`temperature` is dropped on Claude 4.7 and later, which reject it.

Gemini 3 returns a `thought_signature` in each tool call's `extra_content`
and expects it back on the next round. The loop keeps `extra_content` on the
stored tool calls; the translator strips it for every other provider.
Gemini thought summaries need `extra_body.google.thinking_config`, which is
not sent yet, so Gemini's reasoning feed stays empty, as OpenAI's does
(Chat Completions returns no reasoning text).

The loop reads `delta.reasoning` (OpenRouter, the Anthropic transport) and
`delta.reasoning_content` (DeepSeek-style upstreams behind OpenCode or vLLM).

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
protected from nothing. Reflection tokens are billed from the monthly plan usage budget
(`plan.includedUsageUsd`), but this budget is **already** a hard limit: Numo
refuses a turn when it is exhausted, and the spend guard protects the
OpenRouter key. A `high` therefore consumes the budget faster —
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
$0.000165 and `low` $0.002592. It is not limited by a level ceiling (the
four are open to all, minddy quota included) but by the usage budget
itself.

## When the model is not capable

Two behaviors remain possible, and they are distinguished **only at execution**:

1. **The field is ignored.** The turn takes place normally, without reflection. Nothing
   indicates it — otherwise the thread will not display any “Reasoning” lines.
2. **The field is rejected (400).** Known case: OpenAI + a non-reasoning model
   (`gpt-4o`, `gpt-4o-mini`). A 400 cannot be taken back: without guardrails, it
   would cause the turn to fail.

The main safeguard is now static: the credits remain silent, and the
known providers all go through the model-aware translator. A field rejection of
reasoning is not restarted silently, because this would make one believe that the
chosen level has been applied. Only the output ceiling alias can be retried,
once, after a 400 which explicitly names this alias as unsupported.

**If an endpoint silently ignores the field** (level chosen, no effect
observable), the correct answer is to **remove its capacity from the register** rather than
to lie in the UI.

## What the user sees

The reasoning **is not streamed** as answer text: that drowned the progress of
the work under pages of monologue. Numo shows it in a compact, collapsible
reasoning block (`components/agent/reasoning-block.tsx`) that anyone can unfold
to read the trace.

The level is resolved when the turn is admitted and passed with it
(`reasoningLevel` in
[lib/server/assistant/conversation-config.ts](../lib/server/assistant/conversation-config.ts)),
like the model: an explicit conversation choice wins, otherwise the instance
default applies, and a level the model no longer accepts is lowered with
`nearestReasoningLevel`.

## The compaction reasoning

The **compaction** call (the stale history middle summary) does not receive
never a level of reasoning: it is a mechanical summarization, reflection
would only be cost.

## Check

```bash
npx vitest run lib/agent-reasoning.test.ts lib/ai-chat.test.ts lib/server/anthropic-messages.test.ts
```

### What was verified on real (2026-07-29)

Direct probe on `openrouter.ai/api/v1/chat/completions` with the platform key,
by replaying the body that `streamCompletionOnce` constructs:

| Level | `reasoning_tokens` | Received reasoning deltas | Cost |
| --- | --- | --- | --- |
| `off` | 0 | none | $0.000165 |
| `low` | 81 | 304 characters, 1.3 sec | $0.002592 |
| `high` | 83 | 311 characters, 1.7 sec | $0.002727 |

Three things confirmed at once: the field is **transmitted**, it is
**respected**, and the trace returns fine in `delta.reasoning`, so the loop
timer has something to measure. `off` produced no reflection tokens on that
model only because it does not reason by default; see the `off` rule above.

### What was verified on real (2026-10-28, Anthropic BYOK)

Through `fetchAiChat` and the native transport, with a BYOK key: Claude Opus
5.5 at `low` answered a counting problem with 155 output tokens and a short
thinking summary, at `max` with 520 tokens and a summary five times longer,
and at `off` with no thinking. Opus 4.7, Opus 4.6 (`xhigh` folded to
`high`) and Haiku 4.5 (manual budget) answered with their summaries streamed;
a tool round trip, forced tool calls without streaming, an image, and a 404
passed through in the chat error shape all behaved.

### What remains to be seen by provider

BYOK **OpenAI and Gemini direct** have not been probed (no key on hand):
their rules follow the providers' documentation (developers.openai.com
reasoning guide, ai.google.dev OpenAI compatibility and thinking pages). The
ones to confirm first: a GPT-5.x turn at "off" (`"none"`), a Gemini 3 turn
with two tool rounds (the `thought_signature` echo), and Ollama, which
documents `reasoning_effort` but is left without a field until a local model
confirms it.
