# Audit hebdomadaire — contraintes API des providers IA

Date : 2026-08-17
Fenêtre : depuis le rapport BYOK du 2026-08-15 ([byok-provider-compatibility.md](byok-provider-compatibility.md)), ou 30 jours.

## Résultat

Une seule divergence cassante vérifiée, côté Anthropic : les familles où le
raisonnement est **inéteignable** (Claude Fable 5, Claude Mythos 5, Claude
Mythos Preview) refusent `thinking: {type: "disabled"}` en 400. Le traducteur
envoyait pourtant ce champ à `effort: "off"` sur ces modèles — l'appel partait
en 400 et tuait le round. Corrigé : « off » n'y pose plus aucun champ, et le
modèle retombe sur son défaut (penser, ce qui est son seul comportement).

OpenAI, OpenRouter, Google et les endpoints génériques : aucun changement
cassant dans la fenêtre. Détails ci-dessous.

## Sources officielles relues

| Provider | Page | Statut |
| --- | --- | --- |
| OpenAI | Changelog API <https://developers.openai.com/api/docs/changelog> | Relue |
| OpenAI | Chat Completions — Create <https://developers.openai.com/api/reference/resources/chat> | Relue |
| OpenAI | Reasoning models <https://developers.openai.com/api/docs/guides/reasoning> | Relue |
| OpenRouter | Create a chat completion <https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion> | Relue |
| Anthropic | Claude Platform release notes <https://platform.claude.com/docs/en/release-notes/overview> | Relue |
| Anthropic | Thinking <https://platform.claude.com/docs/en/build-with-claude/thinking> | Relue |
| Anthropic | OpenAI SDK compatibility <https://platform.claude.com/docs/en/cli-sdks-libraries/libraries/openai-sdk> | Relue |
| Google | Gemini OpenAI compatibility <https://ai.google.dev/gemini-api/docs/openai> | Relue (résultats de recherche + page) |

## Matrice avant / après

| Provider | Point vérifié | Avant | Après | Décision |
| --- | --- | --- | --- | --- |
| OpenAI | `reasoning_effort` à plat | rabat `xhigh`/`max` sur `high` | idem | Inchangé, voir incertitudes |
| OpenAI | GPT-5.6 + function tools | `reasoning_effort: "none"` forcé + retry sur 400 explicite | idem | Conforme (docs : utiliser Responses ou `none`) |
| OpenRouter | Plafond de sortie | `max_completion_tokens` | idem | Conforme (`max_tokens` déprécié) |
| OpenRouter | `reasoning.effort` | forme imbriquée + `exclude: false` | idem | Conforme |
| Anthropic | `thinking: disabled` sur Fable 5 / Mythos 5 / Mythos Preview | envoyé → **400** | aucun champ | **Corrigé** (`lib/ai-chat.ts`) |
| Anthropic | `thinking: disabled` sur Opus 5 / Sonnet 5 | envoyé | idem | Conforme (accepté à effort par défaut) |
| Anthropic | Mode manuel (`budget_tokens`) | borné aux 4.5/4.6 | idem | Conforme (retiré sur les 5.x, jamais envoyé) |
| Anthropic | `temperature`/`top_p`/`top_k` non défauts sur les 5.x | 400 côté API | — | Aucune surface minddy ne les envoie |
| Google | `reasoning_effort` | rabat `xhigh`/`max` sur `high` | idem | Conforme (la compat Gemini ne documente que minimal→high) |
| Générique | Extensions propriétaires | jamais envoyées | idem | Conforme |

## Correctifs appliqués

- `lib/ai-chat.ts` : ajout de `isAlwaysThinkingClaude` (Fable 5, Mythos 5,
  Mythos Preview) et garde dans `anthropicReasoningFields` : `effort: "off"`
  sur ces familles → aucun champ `thinking`, au lieu de `{type: "disabled"}`
  qui revient en 400.
- `lib/ai-chat.test.ts` : couverture des trois familles concernées à « off »
  (pas de champ `thinking`) et contre-exemple Opus 5 / Sonnet 5 (toujours
  `disabled`).

## Tests

- `npx vitest run lib/ai-chat.test.ts lib/agent-reasoning.test.ts lib/server/ai-runtime.test.ts lib/server/agent/vm/llm-proxy.test.ts` — 5 fichiers, 113 cas, vert.
- `npm run typecheck` — vert.
- `git diff --check` — propre.
- Suite complète : 431 fichiers, 10 échecs **préexistants** dans
  `tools/oxlint/anti-slop/rules.test.ts` (suite du plugin vendorisé, hors
  périmètre, identique sur le dépôt sans mes changements).
- `npm run lint` : oxlint panique dans son allocateur Rust
  (`oxc_allocator`, sandbox), panique identique sur dépôt propre — non
  introduit par cette passe.
- `rg` des champs wire hors adaptateurs/profils/tests : uniquement
  `opencode-config.ts:48` (commentaire) et `loop.ts:165` (profil), aucun champ
  brut réintroduit par les surfaces.

## Incertitudes laissées intactes

- **OpenAI `reasoning_effort: "xhigh"` / `"max"`.** La référence officielle
  liste désormais ces deux valeurs pour Chat Completions, alors que le code les
  rabat sur `high` (garde de compat). Le rabat reste voulu : la même page
  précise « not all reasoning models support every value », minddy n'a pas
  d'index de capacités pour un BYOK OpenAI direct, et un 400 sur ce champ ne
  serait pas rattrapé par le filet de repli (qui ne couvre que l'alias de
  plafond et le couple tools + reasoning de GPT-5.6). Passer `xhigh`/`max`
  en direct exigerait un garde-fou par modèle que l'index OpenRouter seul
  fournit aujourd'hui.
- **Anthropic : sampling non défaut sur les 5.x.** Les release notes
  indiquent un 400 pour `temperature`/`top_p`/`top_k` non défauts sur
  Fable 5, Mythos 5, Mythos Preview, Opus 4.7/4.8/5 et Sonnet 5. Aucune
  surface minddy ne pose ces champs (vérifié par `rg temperature` dans les
  surfaces chat), donc aucune correction nécessaire ; à re-vérifier si une
  surface commence à les régler.
- **Couche OpenAI-compatible Anthropic** : continue d'ignorer
  `reasoning_effort` (documenté) ; minddy n'en dépend pas, la forme
  `thinking` y est acceptée.
