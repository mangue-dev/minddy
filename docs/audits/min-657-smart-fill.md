# Smart Fill creation failure (MIN-657)

Investigated on 2026-10-06. Times below are UTC. Hosted inspection was
read-only: Vercel request/deployment metadata, Supabase issue/category metadata
and AI usage, and OpenRouter generation metadata. No generation was replayed,
and no hosted data, configuration or deployment was changed.

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
