# MIN-561 — Jev prerequisites: verified OpenRouter access and shared config

Findings of the access milestone of MIN-557. Everything below was verified on
2026-09-18 against the live endpoints with the platform OpenRouter key. The
decision layer itself (MIN-562, `lib/server/decisions`) starts from here.

## Access path (verified)

- `typesafe/jev-1.13` is **not** callable through OpenRouter's
  `/api/v1/chat/completions`: the endpoint answers HTTP 400 with
  `"typesafe/jev-1.13 is a decisions model and cannot be used with the
  chat/completions endpoint. Use the /api/alpha/decisions endpoint instead."`
  The model is also absent from the public `/api/v1/models` catalog, so it
  never appears in the model picker.
- It IS callable through **`POST https://openrouter.ai/api/alpha/decisions`**
  with the same Bearer key (platform `OPENROUTER_API_KEY` or an OpenRouter
  BYOK key) and the native TypeSafe body: `{ state, model, questions }`.
  Verified smoke call: choice + noul over a small structured state answered
  in ~470 ms with calibrated probabilities.
- The native TypeSafe endpoint (`https://api.typesafe.ai/v1/systemone`)
  exists but minddy holds no TypeSafe key. OpenRouter stays the single path —
  it already carries the platform key, the usage accounting and BYOK.

## Decision: transport for the decision layer (MIN-562)

`fetchAiChat()` is NOT reusable as-is: wrong endpoint and wrong body. What IS
reusable, unchanged:

- Key resolution — the `resolveAiRuntime` pattern (`getUserByok` for BYOK,
  `isManagedAiEnabled()` + platform key otherwise); Jev is not a
  per-surface BYOK choice, the runner reads `jev_model`.
- SSRF guard — `fetchAiProvider("openrouter", url, options)`
  (`lib/server/ai-provider-request.ts` → `safeFetchResponse`): the decisions
  URL shares the chat endpoint's origin, so the same validated-host fetch
  applies.
- Usage accounting — the response already carries `usage.cost` computed from
  input tokens (no `usage: { include: true }` needed), plus a generation `id`
  (`gen-dec-…`) usable as `generationId` for the `ai_usage` idempotency key,
  and `provider: "TypeSafe"` in the envelope. `parseOpenRouterUsage` handles
  the `usage` object as-is; `recordAiUsage` takes `feature: "jev_decision"`.

The runner builds its own URL (origin of the configured base URL +
`/api/alpha/decisions` — note `chatCompletionsUrl()` appends
`/chat/completions` and must not be reused) and its own body.

## Call format and semantics

- Request: `{ state, model, questions }`. `state` is a string or structured
  JSON. `questions` is a map of typed questions; the three types are
  `choice` (options in `criteria`, a map of option → description, up to 255
  options), `score` (ordered level list) and `noul` (yes/no, the "boolean").
  There is no `single_choice`/`boolean` type name in the API — the plan's
  wording maps to `choice` and `noul`.
- Answers come back under the same question keys: `choice` +
  `probabilities` (sum to 1 over the given options only) + `confidence`
  (0–1, derived from the distribution's shape); `score` + `legend` +
  `probabilities` + `confidence`; `noul` (0–1 probability of yes, no separate
  confidence). Question ids are never sent to the model; every question is
  evaluated independently against the same state.
- Empty or ambiguous state does NOT error: Jev answers confidently on the
  option that matches "nothing fits" when an `other` option exists (verified:
  empty state → `other` at 0.99). The runner must therefore always offer an
  `other`-style option and refuse to call with an empty state, or low
  confidence means nothing.

## Limits and pricing (relevant to our use cases)

- Choice cardinality: 255 options max per question — plenty for categories,
  objectives and member lists.
- Context: 64k tokens per request (state + all questions); 32k for the state
  plus the single longest question.
- Rate limits (announced, may drift): 250k tokens/s, 1200 requests/min; 429
  carries `retry-after`, and 529 "overloaded" is a documented transient.
- Pricing: $0.042/MTok on input tokens only; output tokens are free.
  Verified: 458 input tokens → `$0.000019236` reported cost, exactly
  `tokens × 0.042e-6`. Latency measured 360–470 ms per small call (announced
  70–500 ms).
- Aliases (`jev-latest`, `jev-preview`) move across versions; the response
  reports the versioned model that answered (`typesafe/jev-1.13-20260917` at
  the time of writing). Pin thresholds to the versioned id when needed.

## Config added (no behavior change)

- `jev_model` (`kind: model`, fallback `typesafe/jev-1.13`, group
  `automations`, `noSuffix`) and `jev_decisions_enabled` (`kind: flag`,
  fallback `true`) in `lib/ai-model-config.ts`. The flag is an incident
  kill-switch, not a product setting (MIN-557 decision: no "fast/normal"
  switch in the UI).
- `jev_decision` added to `AiFeature`, to the `ai_usage` check constraint
  (migration `20270106930000_jev_decision_feature.sql`), to
  `BILLABLE_FEATURES` + the `automations` usage segment (Clément, 18/09:
  Jev usage counts in the automations segment of the user's included usage),
  to the history labels (all locales) and to the admin finance table.
