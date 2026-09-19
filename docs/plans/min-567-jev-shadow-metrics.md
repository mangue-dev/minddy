# MIN-567 — Jev vs LLM shadow comparison: calibration method

How the data of the shadow comparison (`ai_decision_evaluations`, wired by
MIN-567) is turned into decisions about the decision layer. Everything here
is operations on `app_config` and the admin dashboard — no deploy, no code
change.

## What the shadow comparison records

After a CONFIDENT Jev decision (`engine: "jev"`, confidence at or above the
floor) on real traffic, a uniform roll under `jev_shadow_sample_rate`
(default 0.05) samples it. In the background (`afterOrNow`), the real LLM
pass is replayed — verbatim recipe, same spec, own ledger run billed under
`jev_shadow` — and one row is written:

- both engines' full answer maps and global confidences,
- `agree` — whether every answer BOTH engines gave matches (multi-choice as
  sets). `NULL` when the replay failed or answered nothing comparable: an
  unknown, never a disagreement,
- each leg's end-to-end latency, and the replay's ledger cost (the delta
  sampling adds over Jev-only).

The replay never decides: the caller's outcome was final before the
comparison was scheduled. A decision that already fell back to the LLM is
never sampled — the LLM decided for real, there is nothing to compare.

`feedback_review` is not sampled by this mechanism (its two-stage flow of
MIN-565 runs outside the runner); its rows would need a dedicated wiring,
tracked separately if the filter's precision needs the same measurement.

## Reading the data

`/admin` → Overview → “AI decisions” shows, per use case, the last six
weeks of: samples, agreement (agree / comparable), the weekly series, the
average latency of each engine, and the average shadow cost per sample.
The same numbers come from the `ai_decision_evaluations_weekly` view
directly, e.g.:

```sql
select * from ai_decision_evaluations_weekly
where use_case = 'smart_fill'
order by week_start desc limit 8;
```

For a per-confidence-bucket read (the actual calibration input), aggregate
the rows in SQL:

```sql
select width_bucket(jev_confidence, 0.55, 1.0, 9) as bucket,
       min(jev_confidence) as bucket_floor,
       count(*) as samples,
       count(*) filter (where agree) as agree,
       round(avg((agree::int)::numeric) filter (where agree is not null), 3) as agreement
from ai_decision_evaluations
where use_case = 'smart_fill' and agree is not null
group by 1 order by 1;
```

## Calibrating `jev_confidence_floor`

The floor's job: trust Jev exactly as far as its precision justifies, with
the LLM pass as the reference. The method:

1. Accumulate: keep the sample rate (0.05) until a use case has at least
   ~100 comparable rows per confidence bucket of interest, or one month of
   traffic — whichever comes first. Below that, agreement per bucket is
   noise.
2. Bucket by `jev_confidence` (the query above). The floor should sit at
   the LOWEST bucket edge whose agreement reaches the target — the
   agreement of the LLM pass itself, measured the same way when Jev is
   unavailable, in practice ≥ 0.98 for the choice questions. Do not guess
   the target: measure the LLM's own agreement against the use case's
   downstream signal (edits after a Smart Fill patch, reassignments after
   Smart Assign) and use that as the bar Jev must clear to be cheaper.
3. Adjust by one step at a time (0.05), one use case at a time, and watch
   the next week's agreement at the new floor before going further:

   ```sql
   update app_config set value = '0.60' where key = 'jev_confidence_floor';
   ```

   Raising the floor sends more low-confidence Jev decisions to the LLM
   (slower, pricier, closer to the old behavior); lowering it trusts more
   Jev. Never lower the floor on the strength of the shadow agreement alone
   — high agreement among CONFIDENT decisions says the confident band is
   safe, it says nothing about the band below the current floor.

   **What the shadow can and cannot see:** the sampling roll happens only
   inside the confident branch, so buckets BELOW the current floor never
   produce rows — at any sample rate. The LLM pass that answers those
   decisions is the real fallback (same run), not a shadow, and it is not
   recorded. To evaluate a LOWER floor, treat it as the measured experiment
   it is: the candidate band is currently decided by the LLM; lower the
   floor one step and that band becomes Jev-decided AND sampled, so the
   next week's rows show its agreement directly. If it lands below target,
   raise the floor back — a week of one-step exposure is the price of the
   evidence. (Recording the fallback pairs — Jev's discarded answers against
   the LLM pass that already ran on the same run — would measure the
   sub-floor bands with zero exposure and zero extra LLM cost; that was a
   deliberate scope cut of MIN-567, worth an issue if downward calibration
   becomes frequent.)

4. When the floor moves, note the date, the sample size and the buckets in
   this file, under "Calibration history".

## Switching a use case LLM-first

If a use case is structurally bad at Jev — agreement below target across
the confidence band even after raising the floor, for at least four
consecutive weeks — list it in `jev_llm_first`. The runner reads the key
on every decision; the switch is instant and reversible:

```sql
update app_config set value = 'smart_fill,feedback_review'
  where key = 'jev_llm_first';
```

Effects, all by design: the use case skips Jev entirely (one LLM pass, the
pre-MIN-557 behavior), its fallback reason reads `jev_llm_first`, and it is
NOT shadow-sampled the other way round (the LLM decided for real; the LLM
is the reference, there is no Jev side to compare). Re-enabling Jev later
is the same edit — empty the value, let the shadow rebuild the evidence.

## Cost and latency

The view exposes `llm_cost_sum` over `llm_cost_count`: the dashboard reads
the AVERAGE cost of one sampled replay — one full LLM pass, e.g. the
smart-fill pass — NOT a rate-scaled figure. The overhead the sampling adds
PER ORIGINATING decision is `rate × (that average)` (0.05 × the pass at the
default rate); the two units answer different questions — "what does a
shadow comparison cost" vs "what does the measurement apparatus add to
every decision" — and the dashboard shows the first, so do not divide or
multiply it by the rate when reading it. The latency averages
(`jev_latency_sum / jev_latency_count`, `llm_latency_sum /
llm_latency_count`) answer "how much slower is the LLM when someone is
waiting" — the replay runs after the response, so only its cost, never its
latency, is borne by the user.

## Prompt alignment (System One format) — evaluated, not adopted

MIN-562 kept the LLM recipes verbatim from the pre-decision passes, so the
fallback behaves exactly like the production code it replaced. The shadow
comparison could be made "purer" by rewriting those prompts on the System
One question format (the mapping the `typesafe-ai/system-one-adapter-python`
wrapper performs: typed questions with criteria/levels over a structured
state). Evaluated and declined, for three reasons:

1. The comparison is already apples-to-apples at the DECISION level: both
   engines answer the same `DecisionSpec` — same state, same question
   keys, same option values, same allowed vocabulary, validated by their
   own adapters. Only the rendering differs (a rendered prompt vs a
   structured body), and rendering is part of what each engine is.
2. Aligning the prompts would CHANGE the production fallback (MIN-562's
   verbatim contract) for a measurement's sake — the reference would stop
   being the implementation that is proven, which defeats the point of
   using it as reference.
3. The recorded answer maps make any per-question doubt checkable after
   the fact, without changing either engine.

If a specific divergence is ever suspected (a question Jev and the LLM
seem to read differently), the check is: pull sampled rows for that
question key, compare per question, and only then consider a prompt
change — as its own issue, with the shadow measuring the before/after.

## Calibration history

| Date | Use case | Change | Evidence |
| ---- | -------- | ------ | -------- |
| 2026-09-19 | — | floor seeded at 0.55, shadow rate 0.05 (MIN-562) | initial |
