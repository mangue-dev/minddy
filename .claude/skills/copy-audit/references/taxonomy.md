# Copy problem taxonomy

The categories below are the shared contract between `copy-audit` (detection) and `copy-fix`
(application). Use the exact category names. Examples are in French because the target apps are
French; adapt to the app's language.

## Code-grounding rule (applies across categories)

A string is never judged in isolation when it makes a **claim about behavior** — steps, options,
counts, limits, what a button does, what happens next. Open the string's `code_refs` and compare
the claim to what the code actually does. This is the only way to catch text that has drifted out of
sync with the feature. When the code makes the correct text unambiguous, propose it and put the
relevant code location in `evidence`. When it does not, emit `NEEDS_ANSWER`.

---

## info_overload
Several distinct ideas crammed into one string; a label that is also an explanation; a CTA welded to
a justification.

- **Signals**: 2+ independent clauses doing different jobs; "et aussi", "de plus", semicolons
  joining ideas; a button whose text explains *why* instead of naming the action.
- **Default action**: `rewrite` (split into one idea per element), or `to_tooltip` when the
  secondary idea is genuinely helper-level detail.
- **Example** — bad: `"Enregistrer vos modifications et synchroniser avec GitHub pour mettre à jour les captures"` on a button.
  → button `"Enregistrer"`, and the sync detail becomes helper text or a tooltip if needed.

## useless_info
States something obvious, already visible in the adjacent UI, or not actionable. Adds words, not
meaning.

- **Signals**: restates the visible label; explains the self-evident; filler ("veuillez noter que…").
- **Default action**: `remove`.
- **Example** — bad: `"Cliquez sur le bouton ci-dessous pour continuer"` directly above a
  "Continuer" button. → remove.

## tech_leak
Exposes things the user has no reason to see: infrastructure, internal system/table names, stack
terms, raw error codes, HTTP status, tokens, env, endpoints.

- **Signals**: words like `endpoint`, `API`, `token`, `webhook`, `Supabase`, `cache`, `build`,
  table/column names, raw codes ("Error 421", "PGRST116"); a raw thrown error surfaced verbatim to
  the UI (cross-check `code_refs`).
- **Default action**: `remove` if it's noise, or `rewrite` to translate into user language.
- **Example** — bad: `"Échec de la requête vers l'endpoint /api/captures (500)"`.
  → `"La capture a échoué. Réessayez dans un instant."`

## dev_note
Text meant for a developer that leaked into the UI. Extremely common in vibe-coded apps.

- **Signals**: `TODO`, `FIXME`, `placeholder`, `lorem`, "replace this", "for now", "temporary",
  "hardcoded", meta-commentary about the app itself ("cette section affichera bientôt…"), an
  instruction addressed to the implementer rather than the user.
- **Default action**: `remove` (or `NEEDS_ANSWER` if it hints at unbuilt UI that may need real copy).
- **Example** — bad: `"TODO: brancher la vraie liste de projets ici"` shown in an empty state.

## stale_mix (feature-mismatch)
Copy describes behavior the code no longer does, or blends an old flow with the current one. **This
category REQUIRES reading code_refs.**

- **Signals**: mentions a button/step/option that no longer exists in the component; describes a
  limit/count/plan that differs from the code; onboarding text describing a removed flow.
- **Default action**: if `code_refs` make the correct description unambiguous → `rewrite` with the
  corrected text and `evidence` pointing to the code, still marked for human review. If intent is
  ambiguous → `NEEDS_ANSWER` (e.g. "Le texte parle de 3 étapes, le code en a 2 — laquelle est à jour ?").
- **Example** — copy: `"Choisissez un template puis personnalisez-le"`; code: the template picker was
  removed, Studio now generates directly. → propose `"Décrivez votre capture, Studio la génère"`,
  evidence = `Studio.tsx`.

## unclear
Ambiguous, vague, jargon-y, passive, or leaves the user unsure what happens next.

- **Signals**: unclear referent ("cela", "cette action"); passive voice hiding the actor; abstract
  nouns; a CTA that doesn't say what it does.
- **Default action**: `rewrite`.

## inconsistent
(Detected in the global consistency pass, not per-batch.) Register drift, terminology drift, or
label-convention drift across the app.

- **Signals**: `tu`/`vous` mix vs the target register; two words for one concept ("projet" vs
  "espace"); inconsistent button casing or trailing punctuation.
- **Default action**: `rewrite` to align to the confirmed register / dominant convention.

## display (secondary — copy still comes first)
Not a wording problem but a presentation one.

- **to_tooltip (progressive disclosure)**: an inline explanation that should become an info `(i)`
  icon + tooltip so the primary surface stays clean.
- **truncate_tooltip**: a string that will overflow its container (see budgets) — truncate with the
  full text available on hover/tap.
- **Length budgets (heuristics, mark for review)**: button ≤ ~24 chars, nav item ≤ ~20, chip/badge
  ≤ ~15, table cell / single line ≤ ~48. Over budget in a tight component → `truncate_tooltip`.
- **Default action**: `to_tooltip` or `truncate_tooltip`.