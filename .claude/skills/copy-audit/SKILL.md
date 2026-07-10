---
name: copy-audit
description: >-
  Audit an application's user-facing copy against its real source code to find text that is
  unclear, bloated, needlessly technical, outdated, inconsistent, or was never meant for users.
  Use this whenever the user wants to review, audit, clean up, tighten, or improve the wording /
  copy / microcopy / UX writing / in-app text of an app — especially AI-generated or "vibe-coded"
  apps, where in-app text tends to cram several ideas into one string, blend an old feature
  description with the new behavior, leak infra/technical details, or contain notes the AI left for
  the developer. Trigger on phrases like "audit my copy", "the text in my app is bad/confusing",
  "clean up the wording", "review my UI strings", "my i18n needs a pass", "my labels are a mess",
  even when the user doesn't say the word "audit". This skill is READ-ONLY: it never edits files.
  It produces copy-audit.json + copy-audit.md, which the companion skill `copy-fix` then applies.
---

# copy-audit

Phase 1 of a two-phase workflow (`copy-audit` → `copy-fix`). This skill **only diagnoses**; it
never edits source files. It grounds every judgment in the **real code**, not the string in
isolation, and it uses a **swarm of subagents** to analyze copy in parallel.

The output is a validated audit the user reads before anything is changed. That review gate is the
whole point: an AI rewriting all the copy at once is exactly what produced the mess. Nothing gets
fixed until the human has seen the findings.

## Core rule: never invent

If you cannot determine the correct text from the code plus the confirmed parameters, you MUST emit
a `NEEDS_ANSWER` finding with a precise question. Never guess a replacement, never assume what a
feature is "supposed" to do, never machine-translate. Uncertainty is surfaced, not filled in.

## Step 0 — Confirm parameters (ask, don't assume)

You cannot judge register consistency or what counts as "too technical" without knowing the target.
If these were not given, ask before analyzing. Infer the language from the files, but confirm the rest:

- **Register**: `tu` / `vous` (or informal / formal). Required to flag register drift.
- **Language(s)**: which locale(s) to audit (infer from files, confirm).
- **Audience**: e.g. non-technical founders, developers, general public. Calibrates "tech_leak".
- **Aggressiveness**: `conservative` (propose everything, cut nothing on sight) or `aggressive`
  (propose removals freely). Either way, nothing is applied here — this only tunes how much you flag.
- **Style guide** (optional): path to an existing tone/voice guide to align with.

All rewritten copy in the audit must be in the app's language and respect the confirmed register.

## Step 1 — Discover where copy lives (orchestrator)

Build a complete inventory of user-facing strings. Search in priority order:

1. **i18n / message catalogs** (highest priority): `next-intl` (`messages/*.json`, `src/messages/`),
   `react-i18next` / `i18next` (`locales/**/*.json`, `public/locales/`), `.po`/`.pot` files,
   `en.json`/`fr.json`, `i18n/` directories.
2. **Hardcoded UI strings** in `.tsx`/`.jsx`/`.vue`/`.svelte`: visible text nodes, plus
   `aria-label`, `placeholder`, `title`, `alt`, `label`, toast/notification/error strings,
   empty-state text, and CTA labels.
3. **String constants**: `constants.ts`, `copy.ts`, `strings.ts`, enums used as labels.

For **each** string, record its **usage site(s) in code** — this is what makes code-grounding
possible:

- i18n key (e.g. `onboarding.step2.description`): grep the codebase for the key to find every
  component that renders it, then note those files.
- Hardcoded string: the usage site is where it sits; note the file and line.

Produce a flat inventory: `{ id, location, current, code_refs[] }`. Chunk it in Step 2 — do not
analyze here.

## Step 2 — Swarm analysis (subagents, in parallel)

Do **not** analyze all strings yourself in one pass. Split the inventory into coherent batches and
spawn one subagent per batch.

**Batching**: group strings by feature / route / component so each batch travels with the code that
uses it. Aim for ~15–40 strings per batch. Keep a component's strings together. Cap concurrency at a
reasonable number of subagents in flight (e.g. 4–8) and launch the rest as slots free up.

**Give each subagent**, in its prompt:

- the batch (each string with its `id`, `location`, `current`, and `code_refs`),
- the confirmed parameters (register, language, audience, aggressiveness, style guide),
- instruction to **read `references/taxonomy.md`** (categories + detection heuristics, including the
  code-grounding rule) and **`references/schema.md`** (exact output format),
- instruction to **read the referenced code files** for any string where the copy makes a claim
  about behavior (steps, options, limits, buttons, counts) — compare the claim to what the code
  actually does. This is how `stale_mix` / feature-mismatch is caught.
- instruction to return **JSON only** (an array of findings per `references/schema.md`), no prose.

Subagent prompt template:

```
Analyze this batch of user-facing strings for copy problems. You are one of several agents;
only handle YOUR batch.

Parameters: register=<tu|vous>, language=<..>, audience=<..>, aggressiveness=<..>, style_guide=<path|none>

Read these files first:
- <skill-path>/references/taxonomy.md   (the categories, detection heuristics, code-grounding rule)
- <skill-path>/references/schema.md     (the exact finding JSON you must return)

For any string that describes app behavior, OPEN and read its code_refs and judge the copy against
what the code actually does. If the code makes the correct text unambiguous, propose it and cite the
code as evidence. If it is ambiguous, emit action="NEEDS_ANSWER" with a precise question. Never guess.

Batch:
<json array of {id, location, current, code_refs}>

Return ONLY a JSON array of findings. No commentary.
```

## Step 3 — Global consistency pass (needs the whole set)

Local subagents can't see register drift or terminology drift across the app. After collecting all
findings, run one consistency analysis over the **full** inventory (do it yourself as orchestrator,
or spawn a single consistency-only subagent given the entire flat string list). Check:

- register drift (mix of `tu`/`vous`, or informal/formal) against the confirmed parameter,
- terminology drift (two different words for the same concept — e.g. "projet" vs "espace"),
- button/label conventions (casing, trailing punctuation, imperative vs noun),

and emit `inconsistent` findings for violations, with the dominant/target convention noted.

## Step 4 — Merge and emit

Merge all findings. Dedupe (same `id` flagged twice → keep the highest-severity, merge notes).
Sort by severity then location. Write both:

- **`copy-audit.json`** — the machine-readable findings array (schema in `references/schema.md`).
  This is the contract consumed by `copy-fix`.
- **`copy-audit.md`** — the human review document (template in `references/schema.md`): a summary
  count per category, then findings grouped by category, with a clearly separated **"Questions for
  you"** section listing every `NEEDS_ANSWER`.

Then tell the user: review `copy-audit.md`, answer the questions, and run `copy-fix` when ready.
Do not offer to edit any file from this skill.

## Priority reminder

Copy quality comes first; display changes (`display` category — tooltips, truncation) are secondary.
Never let a display suggestion override or dilute a genuine copy fix.