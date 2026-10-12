# Provider API constraints watch — 2026-10-12

Weekly comparison of minddy's provider contract with the providers' current
official documentation. Previous run: 2026-10-05 (PR #362, "update Anthropic
compatibility and OpenAI transcription fallback"). No live model calls and no
real keys were used; every divergence below cites an official page and a
`file:line` anchor.

## Window and sources

Window: 2026-10-05 → 2026-10-12 (since the previous report). Official pages
re-read, newest first:

- Anthropic: [OpenAI SDK compatibility](https://platform.claude.com/docs/en/cli-sdks-libraries/libraries/openai-sdk),
  [release notes](https://platform.claude.com/docs/en/release-notes/overview).
- OpenAI: [Using GPT-6 / latest model](https://developers.openai.com/api/docs/guides/latest-model),
  [reasoning guide](https://developers.openai.com/api/docs/guides/reasoning).
- OpenRouter: [chat completion OpenAPI schema](https://openrouter.ai/docs/api-reference/chat-completion),
  [usage accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting),
  [STT guide](https://openrouter.ai/docs/guides/overview/multimodal/stt),
  migration guides for [GPT-5.6](https://openrouter.ai/docs/cookbook/evaluate-and-optimize/model-migrations/gpt-5-6),
  [GPT-6](https://openrouter.ai/docs/cookbook/evaluate-and-optimize/model-migrations/gpt-6),
  [Claude 4.7](https://openrouter.ai/docs/cookbook/evaluate-and-optimize/model-migrations/claude-4-7),
  [Claude 5.5](https://openrouter.ai/docs/cookbook/evaluate-and-optimize/model-migrations/claude-5-5).
- Gemini: OpenAI-compatibility page
  ([ai.google.dev/gemini-api/docs/openai](https://ai.google.dev/gemini-api/docs/openai))
  could not be fetched directly from this sandbox (repeated transport errors);
  its content was verified through search excerpts of that official page only
  (see uncertainties).

Surfaces inspected: `lib/ai-chat.ts` (unified translator + 400 repairs),
`lib/agent-providers.ts` (request profiles), `lib/agent-reasoning.ts`,
`lib/server/ai-runtime.ts` (`fetchAiChat`, alias replay), `lib/server/assistant/loop.ts`,
`lib/server/agent/vm/llm-proxy.ts`, `lib/server/openrouter-transcribe.ts`,
`lib/server/embeddings.ts`, `lib/server/agent/models-catalog.ts`, `lib/server/agent/byok-validate.ts`.

## Announcements in the window

- **2026-10-07 — Claude Haiku 5.5** (`claude-haiku-5-5`): adaptive thinking at
  `medium` by default; manual `budget_tokens`, `temperature`, `top_p`, `top_k`
  and assistant prefill return 400 (Anthropic release notes, Oct 7 2026;
  OpenRouter Claude 5.5 migration guide). Forced tool choice remains accepted
  on this family (compat page's rejection list names only Opus 5.5, Sonnet 5.5,
  Fable 5.1, Mythos 5.1).
- **2026-10-07 — Sonnet 5.5 cache-read price drop**: pricing only, no contract
  impact.
- **2026-10-06 / 10-05 — Anthropic Models API additions**
  (`capabilities.server_tools`, `capabilities.thinking.types.disabled`): read
  endpoints only; minddy's native Anthropic usage is the `/v1/models` listing
  (`lib/server/agent/models-catalog.ts:217`), no change required.
- **2026-09-30 — Claude Sonnet 4.5 deprecation** (retirement 2026-11-30):
  minddy's Anthropic default is `claude-sonnet-5`; nothing pinned to 4.5.

The GPT-6 family (Sol/Luna 2026-09-22, 6.1 Sol 2026-09-29, Astra 2026-09-03)
predates the window but its Chat Completions constraints are part of the
current official OpenAI documentation, so they were confronted with the
translator (see below).

## Before / after

| # | Provider | Documented constraint (source) | Before | After |
| - | - | - | - | - |
| 1 | Anthropic compat (BYOK) | Haiku 5.5: `thinking: {type: "disabled"}` accepted at default effort; manual budgets 400 | `off` sent no field (thinking stayed on at `medium`); effort without budget sent no field | `off` sends `thinking: {type: "disabled"}`; effort without budget sends `thinking: {type: "adaptive"}`; fixed budget still unexpressed — `lib/ai-chat.ts:45` (`isAdaptiveClaude` now includes `haiku-5`) |
| 2 | OpenAI (BYOK) | GPT-6 Sol/Luna: Chat Completions function calling only with `reasoning_effort: "none"` (Using GPT-6) | Only `gpt-5.6*` matched (`lib/ai-chat.ts:71`) | `gpt-6-(sol\|luna)` and pro variants added (`needsReasoningOffWithFunctionTools`); Astra and 6.1 Sol deliberately excluded — they reject CC function calling entirely and reject `none` itself |

Both changes stay inside the model-aware translator (`lib/ai-chat.ts`); no
provider condition entered a business surface. The alias fallback is strictly
preserved: `alternateOutputTokenBody` still replays only after a 400 that
explicitly names the rejected ceiling alias (`lib/ai-chat.ts:250`),
`retryRejectedChatRequest` only on 400 (`lib/server/ai-runtime.ts:190`),
`llm-proxy.ts:519` likewise.

## Checked and unchanged

- **Anthropic compat**: `max_completion_tokens` and `stream_options` fully
  supported; `reasoning_effort` ignored (the `thinking` path is correct);
  forced-tool-use rejection list matches `rejectsForcedToolChoice`
  (`lib/ai-chat.ts:80`); prompt caching stays OpenRouter-only
  (`lib/agent-providers.ts:43`); `anthropic-version: 2023-06-01` remains the
  current header (`lib/server/agent/byok-validate.ts:79`).
- **OpenRouter**: `max_completion_tokens` documented (`max_tokens` deprecated);
  `reasoning.effort` enum covers the full internal vocabulary;
  `cache_control` block-level markers documented; `usage` /
  `stream_options.include_usage` now deprecated with no effect (usage always
  returned) — minddy keeps sending them, harmless, no behavior change;
  attribution headers unchanged; STT request shape (`input_audio` base64,
  `language`, `temperature`, `provider`) matches
  `lib/server/openrouter-transcribe.ts:67`.
- **OpenAI**: `max_completion_tokens`, `stream_options.include_usage`,
  `reasoning_effort` fold-down to `minimal..high` kept conservative (see
  below); GPT-5.6 rule unchanged and still documented.
- **Gemini compat**: `reasoning_effort` auto-mapped to `thinking_level`,
  `stream_options` shown in the official streaming example — matches the
  `google` profile (`lib/agent-providers.ts:170`).
- **Generic / local**: unchanged conservative profiles, no optional fields.

## Deliberately not encoded (documented divergences)

- **Sampling parameters**: Anthropic 4.7+/Mythos Preview/5.5 families and
  OpenAI GPT-6 (effort ≠ none) reject non-default `temperature`/`top_p` with
  400. No minddy chat surface sends sampling parameters today (the three
  `temperature: 0` call sites are STT, `lib/server/feedback/voice.ts:267`,
  `app/api/demo/dictate/route.ts:181`, `app/api/transcribe/route.ts:182`);
  the translator forwards `temperature` when set (`lib/ai-chat.ts:199`). Encode
  a family rule the day a surface starts sending it.
- **OpenAI `xhigh`/`max`**: now valid Chat Completions efforts for GPT-6
  models, but direct providers have no per-model capability index; the
  conservative fold to `high` (`lib/agent-reasoning.ts:170`) never 400s and is
  kept.
- **GPT-6 Astra / GPT-6.1 Sol**: no Chat Completions function calling at all.
  A BYOK OpenAI user selecting those ids gets failing tool rounds; the fix is
  a Responses-API transport or catalog filtering, both out of scope for a
  minimal translator patch.

## Tests and verification

- New rules covered per rule and provider in `lib/ai-chat.test.ts`: Haiku 5.5
  (adaptive form, `off` → `disabled`, fixed budget stays unexpressed), GPT-6
  Sol/Luna/pro → `none` with tools, Astra/6.1 Sol untouched, forced tool
  choice still accepted on Haiku 5.5.
- `npx vitest run lib/ai-chat.test.ts lib/agent-reasoning.test.ts
  lib/server/ai-runtime.test.ts lib/server/agent/vm/llm-proxy.test.ts` — 88 passed.
- Full suite `npm test`, `npm run typecheck`, `npm run check:owned-english`,
  `git diff --check` — all pass (results in the pull request description).

## Uncertainties

- The Gemini compat page could not be fetched directly (transport errors from
  this sandbox); its facts were taken from search excerpts of the official
  page, not from a full read.
- No live calls: OpenRouter's own normalization of `reasoning.effort` + tools
  for GPT-6 on the platform path is not re-verified here (recent internal
  validation runs used `gpt-6-luna` successfully through OpenRouter); the fix
  targets the direct OpenAI BYOK path only.
- OpenAI's exact 400 wording for the tools + reasoning rejection is unverified
  (the `repairRejectedAiChatBody` regex stays a best-effort backstop; the
  proactive translation now prevents the first failure).
