# Audit BYOK — compatibilité des requêtes IA

Date : 2026-08-15

## Résultat

La panne observée venait d'un contrat Chat Completions dupliqué dans les
surfaces : chacune envoyait directement `max_tokens`. OpenAI documente désormais
`max_completion_tokens` comme plafond courant et précise que `max_tokens` est
déprécié et incompatible avec les modèles de raisonnement. OpenRouter accepte
encore les deux, mais déprécie lui aussi `max_tokens`.

Le correctif n'est donc pas une condition OpenAI locale. Le contrat commun vit
dans `lib/ai-chat.ts` et exprime `maxOutputTokens`, `reasoning`, `tools`,
`toolChoice`, le streaming et les autres intentions communes. Un seul adaptateur
traduit ensuite la requête vers le wire de chaque provider.

## Matrice provider

| Provider | Endpoint utilisé | Plafond de sortie | Raisonnement | Usage stream | Notes |
| --- | --- | --- | --- | --- | --- |
| OpenRouter | `/api/v1/chat/completions` | `max_completion_tokens` | `reasoning: { effort }` ou `reasoning.max_tokens` | `usage.include` + `stream_options.include_usage` | Les extensions non portables (plugin web) passent par `extensions` et restent explicitement OpenRouter-only. |
| OpenAI | `/v1/chat/completions` | `max_completion_tokens` | `reasoning_effort`; forcé à `none` pour GPT-5.6 + function tools | `stream_options.include_usage` | OpenAI recommande Responses pour le raisonnement, les tools et le multi-tour. Tant que minddy utilise Chat Completions, GPT-5.6 ne peut pas combiner function tools et effort de raisonnement. |
| Anthropic | `/v1/chat/completions` (couche compatible) | `max_completion_tokens` | `thinking: adaptive` sur les familles actuelles ; budget manuel borné quand explicitement demandé sur 4.5/4.6 ; rien pour une famille inconnue | `stream_options.include_usage` | `reasoning_effort` est ignoré par la couche compatible. Le mode manuel est legacy et refusé par plusieurs Claude actuels. Les sorties de tools restent validées par minddy car `strict` est ignoré. |
| Google Gemini | `/v1beta/openai/chat/completions` | `max_completion_tokens`, avec repli ciblé vers `max_tokens` si l'endpoint le rejette explicitement | `reasoning_effort` | `stream_options.include_usage` | Google documente les efforts et le streaming, mais pas le nom du plafond de chat dans sa page de compatibilité, encore bêta. Le choix primaire suit le contrat OpenAI actuel ; le repli évite de parier un appel utilisateur sur cette zone non documentée. |
| Générique | `<base>/chat/completions` | `max_tokens` | aucun champ | aucun champ propriétaire | Choix conservateur pour les serveurs qui n'implémentent que l'ancien contrat OpenAI. Une base inconnue ne reçoit jamais `reasoning`, `usage` ou `stream_options`. |

## Sources officielles

- OpenAI Chat Completions : `max_completion_tokens` inclut sortie visible et
  tokens de raisonnement ; `max_tokens` est déprécié et incompatible avec les
  modèles o-series. <https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create>
- OpenAI GPT-5.6 : la famille accepte `none` comme niveau et la recommandation
  officielle est d'utiliser Responses pour les workflows de raisonnement,
  function calling et multi-tour.
  <https://developers.openai.com/api/docs/guides/latest-model>
- OpenRouter Chat Completions : `max_tokens` est déprécié en faveur de
  `max_completion_tokens`; la forme `reasoning` est l'abstraction du gateway.
  <https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion>
- Anthropic, couche OpenAI compatible : les deux plafonds et `stream_options`
  sont supportés, `reasoning_effort` est ignoré, `thinking` reste la voie de
  contrôle. Anthropic précise que cette couche sert surtout à tester/comparer et
  recommande l'API native pour toutes les capacités Claude.
  <https://platform.claude.com/docs/en/cli-sdks-libraries/libraries/openai-sdk>
- Anthropic, familles de raisonnement : Claude 4.7+ et Claude 5 utilisent le
  raisonnement adaptatif ; le budget manuel est legacy et incompatible avec
  certaines familles actuelles. Le raisonnement manuel limite aussi les choix
  d'outil forcés, contrairement à l'adaptatif.
  <https://platform.claude.com/docs/en/about-claude/models/extended-thinking-models>
- Gemini, compatibilité OpenAI : streaming, function calling et
  `reasoning_effort` sont traduits par la couche Gemini. La page indique encore
  que cette compatibilité est en bêta et n'énumère aucun des deux noms de plafond.
  <https://ai.google.dev/gemini-api/docs/openai>

Les deux transports (appels serveur et proxy opencode) appliquent enfin un filet
très étroit. Ils retentent une seule fois après un `400` qui cite explicitement
l'alias de plafond envoyé comme non supporté, ou le couple function tools +
`reasoning_effort` comme interdit. Aucun autre `400` n'est relancé.

## Couverture des surfaces

Les chemins chat suivants consomment désormais le même contrat :

- chat Numo et boucle d'outils ;
- `@Numo` dans les commentaires ;
- dictée de ticket, d'objectif et du carnet ;
- rangement d'un feedback dicté ;
- appels structurés partagés (titres, smart assign/fill, import, brief,
  analyse feedback) ;
- démo publique, toujours forcée sur OpenRouter ;
- recherche web, volontairement OpenRouter-only ;
- agent de code via la frontière legacy du proxy opencode.

Les modalités qui ne sont pas des Chat Completions gardent leur endpoint dédié :

- transcription : OpenRouter et OpenAI natif ; Anthropic/Google restent sur le
  quota minddy faute d'endpoint `/audio/transcriptions` équivalent dans ce
  chemin ;
- embeddings : OpenRouter, OpenAI, Gemini ou endpoint générique ; Anthropic
  reste sur le quota minddy faute de modèle d'embedding natif configuré ;
- listing de modèles et validation de clé : appels de contrôle sans génération,
  donc hors contrat chat.

## Invariants de non-régression

1. Une surface ne doit jamais écrire `max_tokens`, `max_completion_tokens`,
   `reasoning_effort`, `thinking`, `usage` ou `stream_options` elle-même.
2. Tout champ commun entre dans `AiChatRequest`, puis reçoit un test par provider.
3. Une extension inconnue n'est jamais envoyée à un endpoint générique.
4. Une nouveauté model-specific (comme le changement Anthropic manuel →
   adaptatif) est décidée dans l'adaptateur, pas dans les surfaces.
5. Les réponses structurées sont toujours validées côté minddy : la
   compatibilité d'un provider ne vaut pas garantie de JSON Schema stricte.
6. Les deux replis autorisés ne s'activent que sur leur rejet explicite ; une
   autre erreur de modèle, de tool ou de schéma conserve sa réponse originale.
7. Sur Chat Completions, GPT-5.6 + function tools reçoit toujours
   `reasoning_effort: "none"`. Rétablir le raisonnement nécessite une migration
   complète de ce transport vers Responses, réponses et streaming compris.
