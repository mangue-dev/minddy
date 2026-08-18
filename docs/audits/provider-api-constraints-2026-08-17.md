# Audit hebdomadaire — contraintes API des providers IA

Date: 2026-08-17
Window: from BYOK report dated 2026-08-15 ([byok-provider-compatibility.md](byok-provider-compatibility.md)), or 30 days.

## Result

Only one brittle divergence verified, on the Anthropic side: the families where the
reasoning is **unextinguishable** (Claude Fable 5, Claude Mythos 5, Claude
Mythos Preview) refuse `thinking: {type: "disabled"}` in 400. The translator
however sent this field to `effort: "off"` on these models — the call went out
in 400 and killed the round. Corrected: “off” no longer places any fields there, and the
model falls back on its default (thinking, which is its only behavior).

OpenAI, OpenRouter, Google and generic endpoints: no change
breaking in the window. Details below.

## Sources officielles relues

| Provider | Page | Status |
| --- | --- | --- |
| OpenAI | Changelog API <https://developers.openai.com/api/docs/changelog> | Proofread |
| OpenAI | Chat Completions — Create <https://developers.openai.com/api/reference/resources/chat> | Proofread |
| OpenAI | Reasoning models <https://developers.openai.com/api/docs/guides/reasoning> | Proofread |
| OpenRouter | Create a chat completion <https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion> | Proofread |
| Anthropic | Claude Platform release notes <https://platform.claude.com/docs/en/release-notes/overview> | Proofread |
| Anthropic | Thinking <https://platform.claude.com/docs/en/build-with-claude/thinking> | Proofread |
| Anthropic | OpenAI SDK compatibility <https://platform.claude.com/docs/en/cli-sdks-libraries/libraries/openai-sdk> | Proofread |
| Google | Gemini OpenAI compatibility <https://ai.google.dev/gemini-api/docs/openai> | Reread (search results + page) |

## Before/after matrix

| Provider | Item checked | Before | After | Decision |
| --- | --- | --- | --- | --- |
| OpenAI | `reasoning_effort` flat | flap `xhigh`/`max` on `high` | ditto | Unchanged, see uncertainties |
| OpenAI | GPT-5.6 + function tools | `reasoning_effort: "none"` forced + retry to 400 explicit | ditto | Compliant (docs: use Responses or `none`) |
| OpenRouter | Exit ceiling | `max_completion_tokens` | ditto | Compliant (`max_tokens` deprecated) |
| OpenRouter | `reasoning.effort` | nested form + `exclude: false` | ditto | Compliant |
| Anthropic | `thinking: disabled` on Fable 5 / Mythos 5 / Mythos Preview | sent → **400** | no fields | **Fixed** (`lib/ai-chat.ts`) |
| Anthropic | `thinking: disabled` on Opus 5 / Sonnet 5 | sent | ditto | Compliant (accepted at effort by default) |
| Anthropic | Manual mode (`budget_tokens`) | limited to 4.5/4.6 | ditto | Compliant (removed on 5.x, never sent) |
| Anthropic | `temperature`/`top_p`/`top_k` no defects on 5.x | 400 API side | — | No surface minddy sends them |
| Google | `reasoning_effort` | flap `xhigh`/`max` on `high` | ditto | Compliant (Gemini compat only documents minimal→high) |
| Generic | Proprietary extensions | never sent | ditto | Compliant |

## Fixes applied

- `lib/ai-chat.ts`: addition of `isAlwaysThinkingClaude` (Fable 5, Mythos 5,
  Mythos Preview) and keeps in `anthropicReasoningFields`: `effort: "off"`
  on these families → no `thinking` field, instead of `{type: "disabled"}`
  which returns in 400.
- `lib/ai-chat.test.ts`: coverage of the three families concerned “off”
  (no `thinking` field) and counterexample Opus 5 / Sonnet 5 (always
  `disabled`).

## Tests

- `npx vitest run lib/ai-chat.test.ts lib/agent-reasoning.test.ts lib/server/ai-runtime.test.ts lib/server/agent/vm/llm-proxy.test.ts` — 5 files, 113 cases, green.
- `npm run typecheck` — green.
- `git diff --check` — clean.
- Complete suite: 431 files, 10 **pre-existing** failures in
  `tools/oxlint/anti-slop/rules.test.ts` (continuation of the vendorized plugin, excluding
  perimeter, identical on the repository without my changes).
- `npm run lint`: oxlint panics in its Rust allocator
  (`oxc_allocator`, sandbox), identical panic on clean deposit — no
  introduced by this pass.
- `rg` of wire fields excluding adapters/profiles/tests: only
  `opencode-config.ts:48` (comment) and `loop.ts:165` (profile), no field
  raw material reintroduced by the surfaces.

## Uncertainties left intact

- **OpenAI `reasoning_effort: "xhigh"` / `"max"`.** The official reference
  now lists these two values for Chat Completions, while the code
  flap on `high` (compat guard). The flap remains desired: the same page
  specifies “not all reasoning models support every value”, minddy does not
  capacity index for a direct OpenAI BYOK, and a 400 on this field does not
  would not be caught by the fallback net (which only covers the alias of
  ceiling and the tools + reasoning couple of GPT-5.6). Pass `xhigh`/`max`
  live would require a guardrail per model than the OpenRouter index alone
  provides today.
- **Anthropic: non-defect sampling on 5.x.** Release notes
  indicate a 400 for `temperature`/`top_p`/`top_k` no faults on
  Fable 5, Mythos 5, Mythos Preview, Opus 4.7/4.8/5 and Sonnet 5. None
  surface minddy does not set these fields (checked by `rg temperature` in the
  cat surfaces), so no correction necessary; to re-check if a
  surface begins to adjust them.
- **OpenAI-Anthropic compatible layer**: continues to ignore
  `reasoning_effort` (documented); Minddy doesn't depend on it, the shape
  `thinking` is accepted there.
