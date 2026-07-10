# Audit output schema

## Finding object

Each finding is one object. Subagents return a JSON array of these; the orchestrator merges them
into `copy-audit.json`.

```json
{
  "id": "onboarding.step2.description",
  "location": "messages/fr.json → onboarding.step2.description",
  "code_refs": ["src/app/(app)/onboarding/Step2.tsx:41"],
  "category": "stale_mix",
  "severity": "high",
  "action": "rewrite",
  "current": "Choisissez un template puis personnalisez-le.",
  "proposed": "Décrivez votre capture, Studio la génère.",
  "evidence": "Step2.tsx renders <StudioPrompt/>; no template picker exists anymore.",
  "question": null,
  "note": "Old template flow; verify wording matches product framing."
}
```

Field rules:

- `category` ∈ `info_overload | useless_info | tech_leak | dev_note | stale_mix | unclear | inconsistent | display`.
- `severity` ∈ `high | med | low`. High = wrong/misleading/leaks; med = unclear/bloated; low = polish.
- `action` ∈ `rewrite | remove | to_tooltip | truncate_tooltip | NEEDS_ANSWER`.
- `proposed`: required for `rewrite`/`to_tooltip`/`truncate_tooltip`; `null` for `remove` and
  `NEEDS_ANSWER`. Must be in the app's language and confirmed register.
- `evidence`: required whenever a claim was checked against code (esp. `stale_mix`, `tech_leak`).
- `question`: required and non-null **only** when `action == "NEEDS_ANSWER"`; a precise, answerable
  question. Otherwise `null`.
- Never emit a `proposed` you had to invent. If you can't ground it, use `NEEDS_ANSWER`.

## copy-audit.json (final file)

```json
{
  "app": "<name/path>",
  "params": { "register": "vous", "language": "fr", "audience": "...", "aggressiveness": "conservative" },
  "generated_at": "<iso>",
  "summary": { "total": 0, "by_category": {}, "needs_answer": 0 },
  "findings": [ /* finding objects */ ]
}
```

## copy-audit.md (human review — use this structure)

```markdown
# Copy audit — <app>

**Paramètres** : vouvoiement · fr · audience <..> · mode <conservative|aggressive>
**Total** : N problèmes  ·  X à corriger  ·  **Y questions pour toi**

## ⚠️ Questions pour toi (à répondre avant copy-fix)
Pour chaque NEEDS_ANSWER : l'emplacement, le texte actuel, et la question précise.

## Résumé par catégorie
| Catégorie | Nombre | Sévérité dominante |
| --- | --- | --- |
...

## Findings
### stale_mix (n)
Pour chaque finding : emplacement · `current` → `proposed` (ou "à supprimer") · evidence · note.
### tech_leak (n)
...
### info_overload (n)
...
(etc., une section par catégorie présente, `display` en dernier)
```

The **Questions pour toi** section comes first on purpose: it's the gate. `copy-fix` will refuse to
run while any of them is unanswered.