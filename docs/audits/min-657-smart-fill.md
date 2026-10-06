# Smart Fill creation failure (MIN-657)

Investigated on 2026-10-06. Times below are UTC. Hosted inspection was
read-only: Vercel request/deployment metadata, Supabase issue/category metadata
and AI usage, and OpenRouter generation metadata. The initial inspection
replayed no generation. A subsequent Jev investigation made two small
diagnostic calls, described below. No application data, configuration or
deployment was changed.

## Incident attribution

MIN-657 was inserted at **01:39:05.794214**, with its creation event at
**01:39:06.170596**. Its project had six existing categories created before
the issue. The one/two-category validation defect fixed in PR #371 does not
explain this incident.

Vercel records request `gp4q5-1791250738357-295648ec53c6`, starting at
**01:38:58.357**, for the issue-creation POST of this project. It returned
**201** on `preview.minddy.app`, deployment
`dpl_HPBcEePPmkHyEA8pbNAaizq3utaX`. Deployment metadata identifies commit
`43426ec84e2a286b39f41f2d359dfa1cef24ee8f` on `main`.
The request contains no runtime error messages. A bounded preview query over
**01:38:45–01:39:10** returned seven request records, including this POST.
The broader four-minute preview query hit its 50-record page limit; the
narrower window avoids attributing its incomplete results to this creation.

Supabase has one issue created in this project during **01:37–01:41**.
Its creator matches the billed user of run
`5f78a8c8-bd86-432f-b63c-55cffa5a6de1`. The project's AI usage in that window
contains exactly these two calls on the same run:

| Recorded at | Sequence | Feature | Model | Completion tokens |
| --- | ---: | --- | --- | ---: |
| 01:39:00.795017 | 0 | `jev_decision` | `typesafe/jev-1.13-20260917` | 611 |
| 01:39:05.404465 | 1 | `smart_fill` | `deepseek/deepseek-v4-flash` | 256 |

This establishes that Smart Fill reached the decision layer and its LLM
fallback immediately before the insert; it was not skipped by the category
validation or account/budget gates. The reason Jev fell back is not persisted
in these usage rows.

## Confirmed generation truncation

OpenRouter metadata for `gen-1791250741-lhufG01XodQFh7DUjxnO` reports:

- Model: `deepseek/deepseek-v4-flash-20260423`, provider: Cloudflare.
- Generation created at **01:39:01.151**.
- `finish_reason` and `native_finish_reason`: **`length`**.
- `native_tokens_completion`: **256**; `native_tokens_reasoning`: **254**.
- Generation time: **4110 ms**; latency: **1208 ms**; not cancelled.

The deployed Smart Fill profile allowed only 256 output tokens and requested
no reasoning effort. Almost the entire output allowance was consumed by
reasoning, and the provider ended the generation at the token ceiling.
This is evidence of output truncation, rather than a request timeout or
insufficient category count. The issue's priority, effort, categories and
objective were subsequently set manually, with no Smart Fill activity event.

The deployed `forcedToolCall` records usage before checking the expected
tool call. A missing expected tool call returns `null` without an error log;
the empty Smart Fill patch then permits normal issue creation. This explains
why a successful POST with a recorded AI expense can leave an unfilled issue.
Generation metadata does not include the response body; absence of the usable
tool output is inferred from the truncation, saved issue activity and this
deployed control flow.

## Why the Jev decision did not become final

The historical Jev generation's provider response reports **HTTP 200** and
**123 ms** latency. Its recorded usage rules out a disabled Jev engine, a
Smart Fill LLM-first override, missing credentials or an HTTP rejection for
this run. Jev was called; its decision was discarded afterward.

The deployed runner permits two remaining paths: an invalid/missing parsed
answer (`jev_unavailable`) or confidence below the configured floor
(`jev_low_confidence`). Its default floor is **0.55**; the current database
value is null and therefore also uses 0.55. A historical runtime override
cannot be reconstructed from the current configuration alone.

`decisionConfidence` takes the **minimum** of all field confidences. For a
category set, the Jev adapter also takes the minimum over every category's
yes/no confidence, including categories not selected. An uncertain objective,
effort or category can therefore discard otherwise confident priority/category
answers and trigger a full LLM replacement. Answers are not merged across
engines. This is the existing conservative decision policy, not a transport
failure.

The exact Vercel request lookup returns one successful request with no runtime
messages. A malformed Jev response would normally emit a
`[decisions-jev] invalid response` error; low confidence emits no diagnostic
message in the deployed runner. The absence of an error supports the
low-confidence explanation, but is not a retained record of the original
scores or proof that no log was dropped.

OpenRouter's generation-content endpoint returns **404, Content not available
for this generation** for the historical Jev call. Supabase contains zero
decision evaluation rows in the incident window, and the shadow mechanism
records only accepted Jev decisions, not discarded fallback pairs. The
historical answer values and confidence scores cannot be recovered from
these sources. [OpenRouter's logging documentation](https://openrouter.ai/docs/guides/features/logs)
explains that stored input/output requires logging to have been enabled when
the call ran; metadata alone does not retain the answer body.

Two direct diagnostic calls to the same versioned Jev model used the issue's
unchanged title, the six current categories and four current active
objectives. One supplied no description; the other supplied the current
description. These are reproductions, not the original request: the original
description and context ordering were not retained.

The real `parseJevAnswers`, `buildSmartFillSpec` and `decisionConfidence`
functions accept both diagnostic responses and produce:

| Description variant | Priority | Effort | Categories | Objective | Global confidence |
| --- | ---: | ---: | ---: | ---: | ---: |
| None | 0.65 | 0.56 | 0.50 | 0.35 | **0.35** |
| Current | 0.67 | 0.50 | 0.52 | 0.38 | **0.38** |

Both valid responses fall below 0.55, with the objective as the weakest field,
and reproduce the full fallback to the LLM. The two generation IDs are
`gen-dec-1791295931-KWu8to3dkflp5Tn93htG` and
`gen-dec-1791295932-7PttbzUFZW4KsdN0hByT`; combined provider cost is
**$0.000115752**. No issue or application usage-ledger row was written by
these direct diagnostic calls.

The supported conclusion is that **low confidence is the likely reason Jev
was discarded**, and the current policy reproduces that behavior on this
issue. The specific historical field/score cannot be asserted. No threshold
or confidence policy change is justified by this one incident; lowering the
floor or retaining partial answers would require a separate quality decision.

## Fix and verification

PR #371 already raises the Smart Fill LLM output ceiling to 2048 tokens and
requests low reasoning effort, with the same 20-second timeout and non-fatal
failure behavior. This part of the PR addresses the observed token exhaustion.
The small-category and Create more corrections address separate reproducible
defects; they are not the cause of MIN-657's own creation failure.

The code changes passed 169 tests across ten focused test files, TypeScript,
targeted lint and owned-English/whitespace checks. The follow-up adds only this
audit and passes documentation checks. No live generation with the new profile
has been tested, so this evidence establishes the original failure and the
reason for the fix, not a guarantee against future provider failures.
