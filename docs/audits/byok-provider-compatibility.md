# BYOK audit — AI query compatibility

Date : 2026-08-15

## Result

The observed failure came from a duplicate Chat Completions contract in the
surfaces: each sent `max_tokens` directly. OpenAI now documents
`max_completion_tokens` as the current ceiling and specifies that `max_tokens` is
depreciated and incompatible with models of reasoning. OpenRouter accepts
still both, but also deprecates `max_tokens`.

The fix is ​​therefore not a local OpenAI condition. The common contract lives
in `lib/ai-chat.ts` and expresses `maxOutputTokens`, `reasoning`, `tools`,
`toolChoice`, streaming and other common intentions. Only one adapter
then translates the request to the wire of each provider.

## Matrice provider

| Provider | Endpoint used | Exit ceiling | Reasoning | Usage stream | Notes |
| --- | --- | --- | --- | --- | --- |
| OpenRouter | `/api/v1/chat/completions` | `max_completion_tokens` | `reasoning: { effort }` or `reasoning.max_tokens` | `usage.include` + `stream_options.include_usage` | Non-portable extensions (web plugin) go through `extensions` and remain explicitly OpenRouter-only. |
| OpenAI | `/v1/chat/completions` | `max_completion_tokens` | `reasoning_effort`; forced to `none` for GPT-5.6 + function tools | `stream_options.include_usage` | OpenAI recommends Responses for reasoning, tools and multi-turning. As long as minddy uses Chat Completions, GPT-5.6 cannot combine function tools and reasoning effort. |
| Anthropic | `/v1/chat/completions` (compatible layer) | `max_completion_tokens` | `thinking: adaptive` on current families; manual budget limited when explicitly requested on 4.5/4.6; nothing for an unknown family | `stream_options.include_usage` | `reasoning_effort` is ignored by the compatible layer. Manual mode is legacy and refused by many current Claudes. Tools output remains validated by minddy because `strict` is ignored. |
| Google Gemini | `/v1beta/openai/chat/completions` | `max_completion_tokens`, with targeted fallback to `max_tokens` if the endpoint explicitly rejects it | `reasoning_effort` | `stream_options.include_usage` | Google documents the efforts and streaming, but not the name of the chat cap in its compatibility page, still beta. The primary choice follows the current OpenAI contract; fallback avoids betting a user call on this undocumented area. |
| Generic | `<base>/chat/completions` | `max_tokens` | no fields | no proprietary field | Conservative choice for servers that only implement the old OpenAI contract. An unknown database never receives `reasoning`, `usage` or `stream_options`. |

## Sources officielles

- OpenAI Chat Completions: `max_completion_tokens` includes visible output and
  reasoning tokens; `max_tokens` is deprecated and incompatible with
  o-series models. <https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create>
- OpenAI GPT-5.6: family accepts `none` as level and recommendation
  official is to use Responses for reasoning workflows,
  calling and multi-turn function.
  <https://developers.openai.com/api/docs/guides/latest-model>
- OpenRouter Chat Completions: `max_tokens` is deprecated in favor of
  `max_completion_tokens`; the `reasoning` form is the abstraction of the gateway.
  <https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion>
- Anthropic, OpenAI layer compatible: the two ceilings and `stream_options`
  are supported, `reasoning_effort` is ignored, `thinking` remains the way to
  control. Anthropic specifies that this layer is mainly used to test/compare and
  recommends native API for all Claude capabilities.
  <https://platform.claude.com/docs/en/cli-sdks-libraries/libraries/openai-sdk>
- Anthropic, reasoning families: Claude 4.7+ and Claude 5 use the
  adaptive reasoning; the manual budget is legacy and incompatible with
  some current families. Manual reasoning also limits choices
  forced tools, unlike adaptive.
  <https://platform.claude.com/docs/en/about-claude/models/extended-thinking-models>
- Gemini, OpenAI compatibility: streaming, function calling and
  `reasoning_effort` are translated by the Gemini layer. The page still says
  that this compatibility is in beta and does not list either cap name.
  <https://ai.google.dev/gemini-api/docs/openai>

Both transports (server calls and opencode proxy) finally apply a net
very narrow. They retry only once after a `400` which explicitly cites
the ceiling alias sent as unsupported, or the function tools + pair
`reasoning_effort` as prohibited. No other `400` is restarted.

## Couverture des surfaces

The following chat paths now consume the same contract:

- Numo chat and tool loop;
- `@Numo` in comments;
- dictation of ticket, objective and notebook;
- storage of dictated feedback;
- shared structured calls (titles, smart assign/fill, import, brief,
  feedback analysis);
- public demo, still forced on OpenRouter;
- web search, voluntarily OpenRouter-only;
- code agent via the opencode proxy legacy border.

Modalities that are not Chat Completions keep their dedicated endpoint:

- transcription: OpenRouter and native OpenAI; Anthropic/Google remain on the
  quota minddy endpoint fault `/audio/transcriptions` equivalent in this
  path;
- embeddings: OpenRouter, OpenAI, Gemini or generic endpoint; Anthropic
  remains on the minddy quota due to lack of native embedding model configured;
- model listing and key validation: control calls without generation,
  therefore outside of the cat contract.

## Non-regression invariants

1. A surface should never write `max_tokens`, `max_completion_tokens`,
   `reasoning_effort`, `thinking`, `usage` or `stream_options` itself.
2. Any common field enters `AiChatRequest`, then receives a test by provider.
3. An unknown extension is never sent to a generic endpoint.
4. A new model-specific feature (like the Anthropic manual change →
   adaptive) is decided in the adapter, not in the surfaces.
5. Structured responses are always validated on the minddy side: the
   compatibility of a provider does not constitute a strict JSON Schema guarantee.
6. The two authorized fallbacks are only activated upon their explicit rejection; a
   other model, tool or schema error retains its original answer.
7. On Chat Completions, GPT-5.6 + function tools always receives
   `reasoning_effort: "none"`. Restoring reasoning requires migration
   complete transport to Responses, including responses and streaming.
