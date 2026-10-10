# Smart Fill fallback failure (MIN-674)

Investigated on October 10, 2026. Historical inspection used read-only Vercel
deployment/request metadata, Supabase issue metadata, events and AI usage,
and OpenRouter generation/model metadata. Two small synthetic provider calls
tested the request setting; no issue, application configuration, usage-ledger
row or deployment was changed by those diagnostics. Times below are UTC unless
explicitly labeled Paris time. Raw logs, credentials and protected issue
content are excluded from Git.

## Incident attribution

MIN-673 was inserted at **21:49:40.522812** on October 9, or **23:49:40 Paris
time**. Its creation event at **21:49:41.276437** is followed by manual priority,
effort, category and objective edits between **21:49:58** and **21:50:14**.
None has `via_smart_fill: true`.

The bounded Vercel query over **21:48:50–21:50:00** returned 32 request records,
below its 50-record limit. Request `pdvf5-1791582557246-2f4bf58028ce` starts at
**21:49:17.246**, creates an issue in the reported project on
`preview.minddy.app`, returns **201**, and logs:

```text
smart-fill LLM call failed: response_json_invalid
```

Deployment `dpl_F7ZBrzX58XZgTgrN2JeiwzXsF5Q9` identifies commit
`89ebb59a502884e79e3c5fc459403d26bad1f8f0` on `main`. It includes PR #371,
the MIN-657 correction, with 2048 output tokens, low reasoning effort and
the same 20-second LLM deadline. This incident therefore occurred after that
correction was deployed.

The project's usage between **21:48–21:53** contains one Jev generation at
**21:49:19.868622**, run `84e8d3de-9371-4417-8697-05b60ab81304`, sequence 0,
generation `gen-dec-1791582559-zpTnhHPqT51q8jk6qPcG`. It matches the issue
creator and records 581 completion tokens. OpenRouter metadata reports the
TypeSafe provider and 132 ms latency. There is no Smart Fill LLM usage row
in this window. The runtime error establishes that the LLM fallback was
attempted; account preferences, the budget gate and context gathering did not
skip this creation's fill.

## Failure and limits of historical evidence

The deployed helper wraps every `response.json()` failure in the same
`response_json_invalid` code. That includes a deadline abort while reading a
successful HTTP response. Issue insertion roughly twenty seconds after the
Jev usage row is strongly consistent with this body-read deadline. It does
not prove that the historical failure was an abort rather than malformed
upstream JSON: the original response, abort state and LLM generation ID are
not retained. Usage is recorded only after response JSON has been read,
so absence of an LLM ledger row does not establish absence of provider cost.
The discarded Jev answers and confidence scores are also unavailable.

At inspection, `smart_fill_model` has no configured override,
`smart_fill_model_suffix` is null, and the platform fallback is
`deepseek/deepseek-v4-flash`. These current settings cannot reconstruct an
unretained historical BYOK override. The public OpenRouter catalog marks this
model's reasoning as optional, with `high` and `xhigh` supported and `high`
as the default. The requested `low` effort is not a reliable bound on its
reasoning. Increasing output allowance addressed MIN-657's confirmed token
exhaustion, but did not eliminate the latency risk of optional reasoning.

## Correction

- `lib/server/decisions/llm.ts` enables `preferNonReasoning` only for Smart Fill,
  retaining the 2048-token ceiling, low-effort fallback and 20-second deadline.
- `lib/server/feedback/forced-tool-call.ts` checks the effective OpenRouter
  runtime model's cached catalog metadata. It disables reasoning only when a
  reasoning object marks it optional. Mandatory/unknown models and direct
  BYOK providers retain their existing contract. Available metadata, including
  stale entries, is read immediately; catalog refresh runs in the background
  without reducing the 20-second generation budget. A cold cache uses the
  existing low-effort request until metadata becomes available for later calls.
- `lib/ai-chat.ts` translates the explicit disable request to
  `reasoning: { enabled: false }` on OpenRouter. Existing `off` behavior stays
  unchanged.
- The forced tool helper distinguishes deadline interruption from invalid
  JSON, and logs fixed missing-tool/truncation codes. It keeps existing usage
  recording and non-fatal issue creation, with no retry after a deadline.

## Synthetic provider verification

Two direct calls used the same synthetic Smart Fill issue and four-field
tool schema, the default model, 2048 tokens and a 20-second deadline. These
are request-setting diagnostics, not a replay of MIN-673 or a latency benchmark.
Both produced a valid `fill_issue` call:

| Request | Wall time | Completion tokens | Reasoning tokens | Provider cost |
| --- | ---: | ---: | ---: | ---: |
| `effort: low` | 10.450 s | 272 | 171 | $0.000098686 |
| `enabled: false` | 9.214 s | 98 | 0 | $0.000064582 |

Generation IDs are `gen-1791594466-fpncHdoMisNkBJdnoTTS` and
`gen-1791594476-CXEDmaC6kLou1j8KECT6`. Combined cost is **$0.000163268**.
The generated judgments differ, so these calls confirm that disabling
reasoning is accepted and removes reasoning tokens, not identical decisions
or guaranteed completion under twenty seconds. A provider outage or slow
response can still produce an empty patch.

OpenRouter documents the explicit disable setting and model reasoning
capabilities in its [reasoning reference](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens).

## Documentation and verification

The technical reference `docs/reasoning-levels.md` records the request policy
and diagnostic codes. Public workflows, controls, screenshots and localized
labels are unchanged; no public article/workflow/figure IDs are affected.
Regression coverage checks optional/mandatory/unknown cached metadata,
background refresh failure, stalled refresh and cold/stale cache handling,
runtime BYOK selection, routing fallback,
response-body deadline classification, usage recording and safe logging.
The PR #399 review follow-up verifies that generation starts immediately
during a 10-second catalog refresh and can take 15 seconds within the original
20-second deadline. The two focused test files pass 40 tests. TypeScript,
targeted lint, documentation, knowledge, owned-English and whitespace checks
also pass. No public article/workflow/figure IDs are affected by this follow-up.
