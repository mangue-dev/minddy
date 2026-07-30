# Le raisonnement de l'agent de code, provider par provider

> **Date** : 2026-07-29 · **Ticket** : MIN-122
>
> Ce que l'utilisateur choisit (`off` / `low` / `medium` / `high`), ce qui part
> vraiment sur le fil, et ce qui se passe quand le modèle en face n'en veut pas.

## Le principe en une phrase

**Un seul vocabulaire de wire : `effort`.** Les quatre niveaux se traduisent en
deux formes seulement — `reasoning: { effort }` chez OpenRouter, `reasoning_effort`
à plat chez les trois couches compat OpenAI. Tout est décidé dans
[lib/agent-reasoning.ts](../lib/agent-reasoning.ts), et la seule gate est le champ
`reasoningField` du registre ([lib/agent-providers.ts](../lib/agent-providers.ts)) :
un provider qui ne le déclare pas n'envoie jamais rien.

## Le tableau

| Provider | Endpoint | `reasoningField` | Ce qui part sur le fil |
| --- | --- | --- | --- |
| **OpenRouter** (quota minddy + BYOK) | `openrouter.ai/api/v1/chat/completions` | `reasoning` | `reasoning: { effort: "low"\|"medium"\|"high", exclude: false }` |
| **OpenAI** (BYOK) | `api.openai.com/v1/chat/completions` | `reasoning_effort` | `reasoning_effort: "low"\|"medium"\|"high"` |
| **Anthropic** (BYOK) | `api.anthropic.com/v1/chat/completions` | `reasoning_effort` | `reasoning_effort: "low"\|"medium"\|"high"` |
| **Google / Gemini** (BYOK) | `…/v1beta/openai/chat/completions` | `reasoning_effort` | `reasoning_effort: "low"\|"medium"\|"high"` |
| **Générique** (OpenAI-compatible) | base URL saisie | *(aucun)* | **rien, jamais** |

À `off`, **aucun** champ n'est envoyé, quel que soit le provider : c'est le
comportement d'avant MIN-122 à l'octet près, et c'est le défaut.

### Pourquoi le générique reste muet

Sa base URL est un serveur inconnu (vLLM, LM Studio, un proxy maison…). Les
couches compat *documentées* ignorent les champs inconnus ; un serveur strict, lui,
répond **400**, et un 400 non reprenable tue le run. Envoyer un champ à un
endpoint dont on ne sait rien, c'est parier le run de l'utilisateur sur une
supposition. On ne le fait pas.

## Ce qu'on n'utilise PAS, contrairement à la description du ticket

La description de MIN-122 annonçait `thinking: { type: "enabled", budget_tokens }`
pour Anthropic et `thinkingConfig` pour Gemini. **Les deux sont faux ici**, pour la
même raison — et c'est le piège que le prochain lecteur du ticket va reproduire :

- Ce sont des champs des **API natives** (Anthropic Messages, Gemini
  `generateContent`). minddy ne tape ni l'une ni l'autre : tous les providers
  passent par leur couche **OpenAI-compatible** `/chat/completions`
  ([lib/agent-providers.ts](../lib/agent-providers.ts)), qui ne connaît que
  `reasoning_effort`.
- Et `thinking.budget_tokens` est de toute façon **retiré** de l'API Anthropic : il
  renvoie un 400 sur les Claude actuels — dont `claude-sonnet-5`, le défaut
  Anthropic de minddy. L'implémenter comme décrit aurait cassé 100 % des runs
  Anthropic.

Corollaire agréable : sans champ `budget_tokens`, l'invariant
« `budget_tokens` < `max_tokens` » disparaît. Il ne reste à arbitrer par provider
que la FORME (imbriquée vs plate).

## Ce que chaque niveau veut dire concrètement

`effort` est un curseur relatif, pas un budget de tokens : c'est le provider qui
décide combien de tokens de réflexion il accorde, et cela varie d'un modèle à
l'autre. Ce que minddy garantit, c'est la monotonie — `low` < `medium` < `high` —
et le fait que `off` ne demande rien.

| Niveau | Ce que ça change | Ce que ça coûte |
| --- | --- | --- |
| `off` | Le modèle répond directement. | Rien de plus. |
| `low` | Une courte passe de réflexion avant d'agir. | +1024 tokens de plafond. |
| `medium` | Le modèle prend le temps de préparer son travail. | +2048. |
| `high` | La réflexion la plus longue, pour les tâches difficiles. | +4096. |

La colonne « coût » est le relèvement de `max_tokens`
(`reasoningMaxTokens`) : **les tokens de réflexion sont comptés dans `max_tokens`**
par les couches compat. Sans ce relèvement, à `high`, la réflexion mangerait
l'essentiel des 8192 du profil OpenRouter/Anthropic et tronquerait la réponse **et
les tool-calls** du round.

## `high` et le quota minddy

**Les quatre niveaux sont ouverts à tous**, quota minddy compris. L'abonnement est
payé : il doit être utilisable en entier.

Un plafond « `high` réservé au BYOK » a existé un temps, puis a été retiré — il ne
protégeait de rien. Les tokens de réflexion sont facturés sur le budget d'usage
mensuel du plan (`plan.includedUsageUsd`,
[lib/server/agent/quota.ts](../lib/server/agent/quota.ts)), mais ce budget est
**déjà** une borne dure : `checkAgentQuota` refuse le lancement quand il est
épuisé, la boucle s'arrête d'elle-même quand il tombe à zéro en cours de run, et le
spend-guard garde la clé OpenRouter. Un `high` consomme donc le budget plus vite —
ce qui est l'affaire de celui qui l'a payé — sans jamais pouvoir le dépasser.
Restreindre le niveau en plus, c'était une règle à expliquer en échange de rien.

**Rien à corriger côté comptage** — constaté sur de vrais appels OpenRouter
(2026-07-29, `anthropic/claude-sonnet-4.5`) :

```
prompt_tokens: 52 · completion_tokens: 170 · total_tokens: 222   (52 + 170 = 222)
completion_tokens_details.reasoning_tokens: 103
cost: 0.002706
```

`reasoning_tokens` est un **détail de** `completion_tokens`, pas un compteur à
côté : les tokens de réflexion sont donc déjà dans `completion_tokens` **et** dans
`usage.cost`. `parseOpenRouterUsage` ([lib/server/ai-usage.ts](../lib/server/ai-usage.ts))
n'a rien à changer — ni pour le quota (compté en USD), ni pour l'affichage des
tokens.

Le surcoût est réel et se voit : sur le même prompt court, `off` coûtait
0.000165 $ et `low` 0.002592 $ — d'où la borne `medium` en mode plateforme.

## Quand le modèle n'est pas capable

Deux comportements possibles, et ils ne se distinguent **qu'à l'exécution** :

1. **Le champ est ignoré.** Le run se déroule normalement, sans réflexion. Rien ne
   le signale — sinon que le fil n'affichera aucune ligne « Raisonnement ».
2. **Le champ est rejeté (400).** Cas connu : OpenAI + un modèle non raisonneur
   (`gpt-4o`, `gpt-4o-mini`). Un 400 n'est pas reprenable : sans garde-fou, il
   ferait échouer le run.

Le garde-fou vit dans `streamCompletion`
([lib/server/agent/agent-loop.ts](../lib/server/agent/agent-loop.ts)) : sur un 400
dont le message cite `reasoning` ou `reasoning_effort`, l'appel est **relancé une
fois sans le champ** (la relance ne consomme pas d'essai de reprise — l'échec
n'était pas transitoire), le couple `provider:model` est mémorisé pour le process
(plus d'aller-retour aux rounds suivants), et un event `status`
`phase: "reasoning_unsupported"` est émis — le fil affiche « Ce modèle ignore le
niveau de raisonnement » plutôt que de laisser croire à un effet.

**Si un endpoint ignore silencieusement le champ** (niveau choisi, aucun effet
observable), la bonne réponse est de **retirer sa capacité du registre** plutôt que
de mentir dans l'UI.

## Ce que l'utilisateur voit

Le raisonnement **n'est pas streamé**. Il l'était autrefois (une bulle de texte qui
s'écrivait en direct), ce qui noyait le déroulé du travail sous des pages de
monologue. À la place :

- pendant la réflexion, une ligne compacte « Raisonnement » (même gabarit qu'un
  tool-call) avec un **compteur de secondes à droite**, chronométré côté serveur et
  rediffusé ~4 fois par seconde sur le topic `agent-run:{runId}` ;
- en fin de round, la trace est persistée (event `thinking` marqué
  `kind: "reasoning"`, capée à 2000 caractères, avec sa `durationMs`) et reste
  **repliée** — dépliable pour qui veut la lire.

Le niveau est **figé sur le run** (`agent_runs.reasoning_level`), comme le modèle :
un run est découpé en chunks repris par des invocations serverless successives, un
état en mémoire n'y survivrait pas. Le défaut perso vit dans
`user_agent_preferences.default_reasoning_level`.

## Le raisonnement de la compaction

L'appel de **compaction** (le résumé du milieu d'historique périmé) ne reçoit
jamais de niveau de raisonnement : c'est une summarization mécanique, la réflexion
n'y serait que du coût.

## Vérifier

```bash
npx vitest run lib/agent-reasoning.test.ts   # formes par provider, gate generic, plafond
```

### Ce qui a été vérifié sur du vrai (2026-07-29)

Sonde directe sur `openrouter.ai/api/v1/chat/completions` avec la clé plateforme,
en rejouant le corps que construit `streamCompletionOnce` :

| Niveau | `reasoning_tokens` | Deltas de raisonnement reçus | Coût |
| --- | --- | --- | --- |
| `off` | 0 | aucun | 0.000165 $ |
| `low` | 81 | 304 caractères, 1,3 s | 0.002592 $ |
| `high` | 83 | 311 caractères, 1,7 s | 0.002727 $ |

Trois choses confirmées d'un coup : le champ est **transmis**, il est **respecté**
(`off` ne produit littéralement aucun token de réflexion), et la trace revient bien
en `delta.reasoning` — donc le chrono de la boucle a de quoi mesurer.

### Ce qui reste à constater par provider

Les BYOK **OpenAI / Anthropic / Gemini directs** n'ont pas été sondés (pas de clé
de test sous la main). Le cas le plus intéressant y est OpenAI + un modèle **non**
raisonneur (`gpt-4o-mini`) : c'est le déclencheur attendu du garde-fou 400. Ce
qu'on vérifie alors, ce n'est pas que le niveau s'applique, c'est que le run **se
termine quand même**.
