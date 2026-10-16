# Smart Fill fallback timeout (MIN-687)

Investigated on October 16, 2026. Historical inspection was read-only:
Supabase AI usage and configuration, Vercel deployment and request logs, and
OpenRouter generation metadata. No generation, issue, configuration or
deployment was changed. Times are UTC. Raw logs, credentials and issue
content are excluded from Git.

## Incident attribution

MIN-686 was inserted at **15:25:13.274326** on October 12. Its priority
moved from `none` to `medium` by hand at 18:51, followed by manual effort,
category and objective edits, with no `via_smart_fill` event.

The project's AI usage between **15:23:30–15:26:00** contains one row: Jev
at **15:24:52.377546**, run `8d09b7bc-008a-40d3-a529-b84cbf136641`, sequence
0, generation `gen-dec-1791818692-9p27E03Gr4ClwhD5CUi5`, billed to the issue
creator. There is no Smart Fill LLM row.

The bounded Vercel query over **15:24:40–15:25:20** on deployment
`dpl_F4h9ikqqXWanM97Zhdthi8hMEsx6` (commit `d5c2d862e4b3`, `main`, served
by `preview.minddy.app`) returns request
`qldhw-1791818689578-687b788b77ca`: a POST to the project's issue route,
status **201**, logging:

```text
smart-fill LLM call failed: request_timeout
```

That commit contains PR #399 (MIN-674). The 20.8 seconds between the Jev
row and the insert match the 20-second LLM deadline. Jev answered, was
discarded (low confidence or an invalid answer; the runner did not log which),
and the LLM fallback timed out before headers arrived. Account preferences,
budget and context did not skip this fill.

## Why the LLM fallback still times out

OpenRouter metadata for the 25 Smart Fill generations recorded between
October 10 and 15 (after the MIN-674 deployment) shows two populations:

| Reasoning tokens | Generations | Generation time |
| --- | ---: | --- |
| 0 (reasoning disabled) | 5 | 1.7–2.5 s |
| 124–1046 (low effort) | 20 | 1.2–18.9 s, eleven at 11.9 s or more |

Only 5 of 25 calls actually disabled reasoning. MIN-674's policy reads the
OpenRouter catalog from a cache held in each function instance's memory, and
deliberately never waited for it. Issue creation is infrequent, so it usually
runs on a fresh instance with an empty cache. The request then keeps
low-effort reasoning, which adds 4–17 seconds and leaves no margin before the
20-second deadline. Two generations on October 15 also finished with `stop`
and reasoning tokens only, without the forced tool call.

Failed generations write no usage row, so their own metadata is not
retrievable, and the share of creations that timed out cannot be counted
from the ledger. The discarded Jev answers and scores are not retained.

## Correction

- `lib/server/feedback/forced-tool-call.ts`: when the cache has no entry
  for the model, wait up to `COLD_CATALOG_WAIT_MS` (1.5 s, inside the
  existing deadline) for the shared catalog load before sending the request.
  Stale entries remain immediate. A catalog that is still unavailable keeps the
  low-effort request and logs `reasoning_metadata_unavailable`.
- `lib/server/decisions/llm.ts` and `runner.ts`: start the catalog load
  while Jev answers, so the fallback usually finds it ready.
- `runner.ts`: with the opt-in `keepConfidentJevAnswers`, a failed LLM
  fallback after a low-confidence Jev decision keeps the Jev answers that
  individually meet `jev_confidence_floor`. Smart Fill opts in; other use
  cases are unchanged. The global floor, token ceiling, deadline and
  one-pass fallback are unchanged, and there is no retry.
- Diagnostics: the runner logs `llm_failed` with its fallback reason, run ID
  and kept field names. Smart Fill logs gate skips and empty or partial
  outcomes with fixed codes. No issue text, answers or exception messages
  are logged.

## Verification and limits

Regression tests cover the cold-cache wait (catalog arriving in time and
stalled), stale-cache immediacy, the unavailable-metadata code and its
redaction, partial salvage with and without the opt-in, the
no-confident-answer case, run-ID correlation and Smart Fill's partial outcome.
`forced-tool-call`, decision, Smart Fill and creation birth-event suites pass.

No live generation was replayed. Disabling reasoning shortens generation but
does not guarantee completion: a slow provider can still time out, and the
partial salvage then fills only the fields Jev was individually confident
about. The new outcome logs make the next unfilled issue attributable from
Vercel logs alone. Public workflows and controls are unchanged; the manual
already describes Smart Fill as filling missing fields, so no public article,
workflow or figure IDs are affected.
