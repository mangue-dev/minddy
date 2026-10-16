# MIN-694 — Global decision model: verified models and runtime contract

The AI decision layer (MIN-557, MIN-562) no longer depends on Jev alone. An
instance administrator selects ONE decision model in `/admin` → Models →
Automations → **Decision model**, and every decision caller uses it for its
next call. This note records what was verified on 2026-10-16 against the live
OpenRouter API with the platform key, and the behavior that follows.

## Callers (all through one setting)

| Use case | Entry point | Path to the model |
| --- | --- | --- |
| Smart Fill | `lib/server/smart-fill.ts` | `runDecision` → `runModelDecision` |
| Smart Assign (creation, sweep) | `lib/server/smart-assign.ts` | `runDecision` → `runModelDecision` |
| Feedback review (cron worker) | `lib/server/feedback/review.ts` | `runModelDecision` directly (two-stage flow) |

Smart Triage is rules-only (`lib/server/smart-triage.ts`) and calls no decision model. Every
path reads the model through `callDecisionModel`
(`lib/server/decisions/decision-model.ts`), which resolves `jev_model` with
`resolveConfiguredModel`. No caller passes a model of its own; only the save
probe passes a candidate.

## Configuration and propagation

- Storage stays the existing `app_config` row `jev_model` (and the other
  `jev_*` calibration keys). The names are historical; renaming encrypted
  `app_config` rows would bind them to a new key for no behavior change, and
  a second key would create two sources of truth. Installations that never
  changed the setting keep the registry default `typesafe/jev-1.13`.
- `app_config` reads are cached for 60 seconds per server process, so a saved
  model reaches every process within about a minute, without a deploy, and
  survives restarts because it lives in the database.
- Ledger feature ids `jev_decision` and `jev_shadow` are kept for the same
  reason: finance and usage history keep reading historical rows. Visible
  labels are now model-neutral ("AI decisions", "Decision checks").

## Catalog and discovery

`GET https://openrouter.ai/api/v1/models?output_modalities=all` lists decision
models with `architecture.output_modalities: ["decisions"]` (the decisions
endpoint documentation itself does not describe discovery). The shared index
(`lib/server/agent/openrouter-index.ts`) already requests every modality, so
the admin `decision` capability filters on that modality and excludes routers
and aliases (`~typesafe/jev-latest`, `~perplexity/pplx-decider-latest`) like
the other pickers. Chat, embedding and transcription models never carry the
modality.

## Save-time validation

`PATCH /api/admin/app-config` (admin and MFA gated as before) runs
`validateDecisionModelChoice` for a non-empty `jev_model`:

1. Empty platform decision catalog (fetch failure, or managed AI disabled) →
   `503 catalog_unavailable`.
2. Candidate absent from that catalog → `400 not_a_decision_model`.
3. Candidate fails a representative probe (`DECISION_MODEL_PROBE_SPEC`: a
   single choice, a multi-choice expanded to yes/no questions, an objective
   choice and a boolean, sent through the real adapter within the 5-second
   budget) → `422 compatibility_check_failed` with the failure `reason`
   (`http`, `timeout`, `network`, `invalid_response`, `no_key`).

Nothing is written on a refusal, and the dashboard keeps showing the previous
value. Clearing the row (registry default) is never probed. The probe is
billed to the platform (`{ platform: "decision model compatibility check" }`)
under `jev_decision`, about $0.00001 per save.

## Runtime failure behavior

- Model retired, renamed or refusing the request after it was saved: the call
  fails with `http` (logged with the model id), the runner reads it as
  `model_unavailable` and replays the use case's LLM pass, as for any Jev
  outage. Nothing is retried.
- Answer under `jev_confidence_floor`: `model_low_confidence`, LLM pass.
  Smart Fill keeps individually confident answers if that pass also fails.
- `jev_decisions_enabled = false` and `jev_llm_first` keep their meaning for
  whichever model is configured. Neither selects a model: the LLM pass uses
  each feature's existing LLM setting, and no feature can diverge from the
  global decision model.
- Usage rows record the versioned model the endpoint reports, and shadow
  comparison rows now carry it in `ai_decision_evaluations.decision_model`;
  the weekly view groups by it. Rows written before MIN-694 keep `NULL`.

## Compatibility of the published decision models

Measured with Minddy's real builders (`buildSmartFillSpec`,
`buildSmartAssignSpec`, `buildFeedbackReviewSpec`) and the save probe, through
`callDecisionModel`, one call each. Confidence is `decisionConfidence` (the
weakest answer). Latencies are single samples from Europe.

| Model | Probe | Smart Fill | Smart Assign | Feedback review |
| --- | --- | --- | --- | --- |
| `typesafe/jev-1.13` (default) | ok, 352 ms | ok, 0.33 | ok, 1.00 | ok, 0.94 |
| `typesafe/jev-1.14` | ok, 397 ms | ok, 0.33 | ok, 1.00 | ok, 0.89 |
| `perplexity/pplx-decider-v1.1-27b` | ok, 1312 ms | ok, 0.31 | ok, 1.00 | ok, 1.00 |
| `liquid/d1` | ok, 1482 ms | ok, 0.31 | ok, 0.97 | ok, 0.96 |
| `liquid/d1-ultra` | ok, 324 ms | ok, 0.32 | ok, 0.99 | ok, 0.98 |
| `inception/mercury-decide` | ok, 483 ms | ok, 0.59 | ok, 1.00 | ok, 0.75 |
| `nace-ai/drex-v1.5` | ok, 806 ms | ok, 0.27 | ok, 0.98 | ok, 0.97 |
| `microsoft/microsoft-decision-1` | ok, 1120 ms | ok, 0.39 | ok, 0.99 | ok, 0.89 |
| `togethercomputer/tev1-4b-experimental` | ok, 372 ms | ok, 0.56 | ok, 0.97 | ok, 0.64 |
| `jaredpalmer/kev-4b` | ok, 524 ms | ok, 0.07 | ok, 0.90 | ok, 0.36 |
| `upstage/solar-decide-flash` | ok, 1408 ms | ok, 0.29 | ok, 0.83 | ok, 0.63 |
| `openai/gpt-6-luna-decisions` | HTTP 502 (transient) | ok, 0.32 | ok, 1.00 | ok, 0.98 |
| `cloudflare/clef-flash` | HTTP 422 | HTTP 422 | ok, 0.87 | ok, 0.77 |
| `respan/span-01` | HTTP 400 | HTTP 400 | HTTP 400 | HTTP 400 |
| `scaledown/classify-1` | HTTP 400 | HTTP 400 | HTTP 400 | HTTP 400 |

Every model that answered picked the same Smart Assign member and the same
duplicate; Smart Fill differed on priority (`urgent` or `high`) and effort.

Findings that shaped the implementation:

- A shared endpoint does not mean a shared contract. Respan Span-01 requires a
  conversation transcript as `state`, ScaleDown requires `text`/`document`
  fields and plain-string criteria, and Clef Flash refuses the larger Smart
  Fill request. The modality filter alone would have listed them; the save
  probe refuses them.
- Earlier single-call probes measured 2.1 to 8.9 seconds for
  `microsoft/microsoft-decision-1`, `upstage/solar-decide` and
  `respan/span-02`. With the unchanged 5-second budget such a model would fall
  back to the LLM on every slow call; the probe refuses a candidate that times
  out at save time, but latency can vary afterwards.
- Score legends are echoed in three shapes: objects (TypeSafe, Perplexity),
  JSON strings (Liquid, OpenAI) and free text (Nace). The parser now accepts
  the first two and falls back to the level at the chosen index for the
  third. Minddy's current specs send no score question.
- Confidence is not calibrated across models. Smart Fill's weakest answer
  (effort) sits near 0.3 for most models, as for Jev, so it mostly falls back
  to the LLM under the 0.55 floor; Kev 4B reports much lower confidences,
  Mercury Decide and Tev1 higher ones. The floor stays one instance-wide
  calibration value; read `ai_decision_evaluations_weekly` per
  `decision_model` after a switch and adjust `jev_confidence_floor` or
  `jev_llm_first` from that evidence.
- Routing (platform key or the payer's OpenRouter BYOK key) is unchanged and
  model-independent; self-hosted instances without managed AI have no platform
  catalog, so the setting cannot be changed there and stays on the default.
