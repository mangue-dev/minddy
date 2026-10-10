---
{
  "id": "ai-settings-and-usage",
  "locale": "fr",
  "title": "Réglages et consommation IA",
  "summary": "Configurez vos clés IA personnelles et les modèles par défaut, puis comprenez les limites des offres Cloud et le suivi de la consommation.",
  "topic": "Compte et applications",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A04",
    "A08",
    "A10"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 13,
  "sourceRevision": 13,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-11",
  "compatibility": {
    "version": "0.11.1 candidate with allowlisted private native preview (MIN-676); MIN-676 private hosted native worker selection; MIN-676 frozen worker identity and proactive Numo context; MIN-676 split account AI settings, restricted native access and hosted authentication requirement; MIN-676 engine-specific native model and thinking controls",
    "editions": [
      "Cloud",
      "self-hosted"
    ],
    "profiles": [
      "web",
      "mobile",
      "desktop"
    ],
    "evidence": [
      "content/knowledge/plans-and-billing.md",
      "components/settings/account-ai-keys-section.tsx",
      "components/settings/account-sandbox-section.tsx",
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "lib/server/agent/model.ts",
      "lib/server/ai-runtime.ts",
      "lib/server/agent/quota.ts",
      "lib/server/usage.ts",
      "lib/server/agent/execute.ts",
      "app/(app)/billing/page.tsx",
      "app/(marketing)/pricing/page.tsx",
      "lib/billing-plans.ts",
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json",
      "components/ai-elements/dictate-button.tsx",
      "app/api/transcribe/route.ts",
      "lib/use-issue-dictation.ts",
      "components/issue-side-panel.tsx",
      "lib/use-objective-dictation.ts",
      "lib/use-feedback-dictation.ts",
      "components/issue-timeline.tsx",
      "components/assistant/chat-input.tsx",
      "components/routines/routine-prompt-field.tsx",
      "content/documentation/reviews/pr397-review-fixes-2026-10-09.md",
      "components/settings/native-agent-connections.tsx",
      "components/settings/native-agent-connections.test.tsx",
      "content/documentation/reviews/min-676-private-native-preview-2026-10-10.md",
      "app/api/account/agent-preferences/route.ts",
      "content/documentation/reviews/min-676-native-worker-selection-2026-10-10.md",
      "components/agent/agent-engine-badge.tsx",
      "lib/server/assistant/account-worker-context.ts",
      "content/documentation/reviews/min-676-native-identity-2026-10-10.md",
      "content/documentation/reviews/min-676-account-ai-organization-2026-10-10.md",
      "lib/native-agent-models.ts",
      "components/settings/native-agent-model-preferences.tsx",
      "content/documentation/reviews/min-676-model-controls-2026-10-10.md",
      "content/documentation/reviews/min-676-review-fixes-2026-10-11.md"
    ]
  },
  "review": {
    "revision": 13,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (PR #397 source review of voice/export additions; existing procedures and figures retained, no operational rerun); agent:/root/native_hosting_terms (private preview controls and limitations source/UI-test review; prior procedures retained, no native operational run); agent:/root/native_hosting_terms (private worker selection controls and fail-closed recovery source/UI-test review; no paid Claude execution or new provider rehearsal claimed); agent:/root/native_identity_docs (frozen identity and proactive context source review; prior operational evidence retained, no new provider execution); agent:/root (account organization and official hosted-auth restriction source review; no provider rerun); agent:/root (native model controls and frozen launch source review; live auth outcomes recorded separately); agent:/root (experimental Claude and explicit cold continuation source and fixture review; no live provider execution)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review); agent:/root/editorial_en_fr (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (PR #397 localized additions and equivalent meaning review; no independent or human review claimed); agent:/root/native_hosting_terms (localized private preview additions and equivalent meaning; agent review, no human acceptance claimed); agent:/root/native_hosting_terms (localized worker selection additions and equivalent meaning; agent review, no human acceptance claimed); agent:/root/native_identity_docs (localized additions and complete equivalent meaning; agent review, no human acceptance claimed); agent:/root (complete six-locale meaning review; agent review, not human acceptance); agent:/root (six-locale model-control meaning review; not human acceptance); agent:/root (six-locale experimental and reconnect additions; agent review, not human acceptance)",
    "date": "2026-10-11"
  },
  "related": [
    "scheduled-routines"
  ],
  "aliases": [
    "ai-keys-and-models",
    "plans-and-ai-usage",
    "plans-and-billing"
  ],
  "tags": [
    "Configurer ses clés IA et modèles",
    "Comprendre forfaits Cloud et consommation IA"
  ],
  "figures": [
    {
      "id": "ai-keys-and-models-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/ai-keys-and-models-workflow.png",
      "alt": "Carte du fournisseur IA avec minddy Cloud sélectionné.",
      "caption": "Le fournisseur Cloud sélectionné utilise le forfait du compte. Le sélecteur permet de configurer un fournisseur personnel.",
      "revision": 13,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        816,
        212
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "plans-and-ai-usage-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/plans-and-ai-usage-workflow.png",
      "alt": "Page d’usage IA du compte de démonstration.",
      "caption": "Page d’usage IA du compte de démonstration. Le budget actuel, les catégories et l’historique proviennent du compte ; aucun achat ni travail facturé n’a été déclenché.",
      "revision": 13,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        1154,
        1016
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "ai-keys-and-models-workflow",
    "plans-and-ai-usage-workflow"
  ]
}
---

Les réglages IA du compte définissent les fournisseurs, les clés personnelles et les valeurs par défaut des fonctionnalités prises en charge. Vérifiez le routage des modèles avant de commencer, puis consultez les sections sur la consommation Cloud pour distinguer la facturation du fournisseur, le budget IA inclus, le calcul de la sandbox et les limites des routines.

Les paramètres IA séparent **IA de Minddy** et **Agent de code**. L’IA de Minddy configure les fournisseurs API pour les conversations Numo, les automatisations, la voix et le feedback. Les abonnements de code concernent uniquement les agents qui travaillent sur les dépôts ; ils ne financent pas l’IA générale de Minddy.

## Configurer ses clés IA et modèles {#ai-keys-and-models}

Ouvrez les réglages IA du compte, ajoutez un fournisseur compatible et saisissez sa clé ainsi que l’URL de base éventuellement requise. Enregistrez et vérifiez l’état de confirmation. Pour les appels IA disposant d’un recours géré, une clé non confirmée ou injoignable laisse l’utilisation sur minddy. Ce recours exige une IA gérée configurée ; les workers de code suivent les règles de modèle lié au fournisseur ci-dessous. Ne collez jamais la clé dans une conversation ou une capture.

Attribuez les familles de modèles de texte, transcription et embeddings à des clés compatibles ou laissez-les sur minddy. Pour chaque clé, choisissez les usages activés : conversations Numo, automatisations, voix et retours. Choisissez séparément le financement OpenCode dans **Agent de code**. Un usage ou une famille sans attribution utilisable reste comptabilisé sur minddy. Votre fournisseur facture les appels réalisés avec sa clé. Le calcul de la sandbox est comptabilisé séparément ; les clés personnelles validées (BYOK) et le travail financé par minddy suivent les [règles de budget ci-dessous](#consumption).

![Carte du fournisseur IA avec minddy Cloud sélectionné.](/documentation/fr/ai-keys-and-models-workflow.png)

### Choisir l’agent de code {#native-agent-preview}

**Claude Code est Expérimental.** Il nécessite une offre incluant Claude Code ; un compte Free ne suffit pas. Son exécution réelle avec abonnement et le renouvellement de ses sessions restent non validés. Connecter un compte ne garantit pas que son offre permet d’utiliser le modèle choisi.

Après une reconnexion, demandez explicitement à Numo de continuer l’agent précédent ou envoyez un nouveau message dans sa conversation de code. Minddy crée un nouveau run avec la nouvelle connexion, en conservant le moteur, le modèle, la réflexion, la branche et le contexte de conversation disponible dans ses limites de taille. Le run précédent conserve sa génération de connexion enregistrée ; la connexion des agents actifs n’est jamais remplacée.

Dans **Agent de code**, choisissez **OpenCode (Minddy Cloud)** ou OpenCode avec le fournisseur de modèles de texte configuré ci-dessus. Le contrôle **Fournisseur IA** choisit le financement du travail de code indépendamment des autres usages API. Configurez ici le modèle et le raisonnement OpenCode. La région et la taille de sandbox se trouvent dans la même section et s’appliquent aux agents de code hébergés.

Choisissez d’abord **Codex** ou **Claude Code** pour afficher uniquement les contrôles de connexion de cet agent. Le sélectionner ne le connecte pas et ne lance aucun travail. Les contrôles actuels de connexion Codex décrivent le prototype technique historique ; ne les utilisez pas dans Minddy hébergé avant qu’une intégration autorisée remplace ce mécanisme. Pour les comptes Claude activés, **Connecter Claude Code** démarre l’autorisation dans le navigateur. Autorisez uniquement sur la page officielle Claude et collez seulement son code d’autorisation dans Minddy, puis choisissez **Terminer la connexion** si demandé. **Annuler la connexion** arrête une tentative. **Déconnecter** supprime l’accès enregistré par Minddy ; cela ne résilie pas l’abonnement et ne prouve pas la révocation OAuth distante.

L’authentification Codex par abonnement dans les services hébergés n’est pas disponible pour un usage général. OpenAI exclut explicitement l’authentification app-server des services hébergés et les oriente vers son programme Sign in with ChatGPT. Minddy doit utiliser une intégration autorisée avant son ouverture. Les tests techniques restreints ne prouvent ni l’autorisation du fournisseur ni la reprise après expiration naturelle des tokens. L’exécution payante de Claude Code reste non testée. Retirer les badges de l’interface ne change pas ces conditions de disponibilité. [OpenAI app-server](https://learn.chatgpt.com/docs/app-server#auth-endpoints), [Sign in with ChatGPT](https://developers.openai.com/siwc/token-sharing-open-source).

Les conversations des agents natifs affichent l’agent, le modèle et la réflexion enregistrés, ou le réglage par défaut de l’agent sans choix explicite. Elles ne proposent pas les commandes API d’OpenCode ni les pièces jointes image. Les conversations OpenCode conservent leurs commandes API.

Avant de déléguer, Numo reçoit le choix actuel du compte et les capacités de l’adaptateur sélectionné. Une fois l’agent lancé, son moteur et ses capacités enregistrés font référence pour cette exécution, même après une modification des paramètres du compte. Numo nomme cet agent lorsqu’il explique le travail délégué. Si le choix du compte est inaccessible, il vérifie les paramètres au lieu de le deviner.

L’adaptateur natif expose les outils Minddy contrôlés via MCP. Les outils intégrés natifs du fournisseur, les images en entrée et les sous-agents ne sont pas disponibles dans ces adaptateurs. Numo transmet les questions de l’agent à partir du contexte fiable de la conversation, ou vous interroge lorsqu’une décision manque. Numo peut utiliser ses propres outils pris en charge dans les limites de votre autorisation ; il n’invente pas d’opérations non prises en charge par le moteur.

Une connexion manquante, un accès expiré ou une limite du fournisseur arrête le travail natif. Minddy ne bascule pas automatiquement vers OpenCode, un autre fournisseur API ou un autre payeur. Choisissez explicitement **OpenCode** pour utiliser la voie API. Codex hébergé doit attendre l’intégration autorisée ; une nouvelle connexion par code n’est pas une solution permise. Pour Claude, reconnectez le compte sélectionné lorsque l’accès est disponible. La déconnexion ou la perte d’accès conserve le choix enregistré jusqu’à votre modification. Les agents existants conservent leur moteur enregistré.

Les abonnements natifs financent uniquement les modèles de code ; les appels API de Numo et le calcul des sandbox restent comptabilisés séparément.

### Modèles et lieu d’exécution {#models}

**OpenCode:** Le choix du modèle de code est lié à son fournisseur. Après le changement, la désactivation ou la perte d’une clé personnelle, le choix précédent peut ne plus correspondre au fournisseur actif. Un nouveau worker refuse alors de démarrer jusqu’au choix d’un modèle compatible dans les réglages IA du compte ; il ne sélectionne pas automatiquement un modèle moins cher ou une valeur par défaut de la plateforme. Une exécution BYOK déjà fixée ne change pas de payeur lorsque sa clé devient indisponible.

Dans **Agent de code**, choisissez le modèle et la réflexion des nouveaux agents. **Automatique** laisse l’agent sélectionné choisir son réglage par défaut. Le bouton Codex **Actualiser les modèles** lit le catalogue du CLI Codex connecté, avec les niveaux de réflexion pris en charge. Il n’utilise pas la liste API d’OpenRouter. Actualisez après un changement de connexion ou pour obtenir les choix actuels. Un modèle proposé par Codex peut rester limité par votre compte ; son exécution confirme l’accès. Claude Code propose les alias **Sonnet**, **Opus** et **Haiku**, qui suivent les recommandations du CLI installé. Son exécution avec un abonnement reste non testée. L’actualisation démarre puis détruit brièvement une sandbox ; son calcul est comptabilisé séparément des modèles utilisés avec l’abonnement.

Avec Codex ou Claude Code, changer de modèle remet la réflexion sur **Automatique**, afin de ne pas conserver un niveau incompatible du modèle précédent. Choisissez ensuite un niveau disponible. Les préférences d’OpenCode, Codex et Claude Code sont distinctes. Les agents existants conservent l’agent, le modèle et la réflexion enregistrés au lancement, y compris lors d’une reprise. Ces choix ne changent pas le modèle des conversations Numo. La région et la taille de sandbox restent dans la même section Agent de code.

Lorsqu’ils sont configurés, Ollama local et les endpoints compatibles OpenAI peuvent servir les conversations par le bridge desktop. Ils ne peuvent pas servir le travail sur le code délégué ou les routines exécutées dans la sandbox serveur. Pour ces usages, choisissez un fournisseur joignable depuis le serveur. Retirez un fournisseur devenu inutile avec son contrôle de confirmation et vérifiez le routage obtenu avant la prochaine exécution.


## Comprendre forfaits Cloud et consommation IA {#plans-and-ai-usage}

Cloud propose Free, Go et Pro. Tous incluent MCP, conversations Numo, actions contextuelles, travail sur le code et routines. Les capacités, l’utilisation IA incluse, les modèles et le stockage diffèrent. Ouvrez Facturation pour consulter votre budget et votre consommation actuels, puis comparez la page publique des prix avant de choisir un plan ; ses chiffres constituent la référence actuelle.

Utilisez l’action de paiement ou de gestion d’abonnement proposée à votre compte. Vérifiez le montant, la période de facturation et la confirmation du fournisseur avant d’accepter. Un changement de plan réussi doit apparaître dans la facturation du compte ; vérifiez cet état plutôt que de considérer une fenêtre de paiement fermée comme une preuve.

### Ce qui consomme le budget {#consumption}

L’utilisation IA incluse couvre le raisonnement, les appels aux outils minddy, l’automatisation, les appels au modèle du worker et le calcul de la sandbox serveur. La limite mensuelle d’IA incluse s’applique au travail financé par minddy. Le plafond par exécution d’une routine constitue une limite distincte qui peut mettre son exécution en pause ; le travail terminé reste dans la conversation. Ces limites n’autorisent pas la facturation automatique de dépassements. Consultez la carte de limite et la date de réinitialisation du budget lorsqu’elle est disponible.

Les clés personnelles compatibles font facturer les appels aux modèles par leur fournisseur plutôt que par l’utilisation IA incluse. Un worker qui utilise une clé BYOK validée contourne le quota du forfait et le plafond de calcul du compte. Le calcul de la sandbox conserve un coût réel et reste comptabilisé dans l’utilisation ; cet enregistrement ne signifie pas que le plafond mensuel du forfait s’applique à cette exécution BYOK. Les familles ou usages non attribués qui passent par des appels financés par minddy restent soumis à leur allocation minddy. L’auto-hébergement comporte des coûts d’infrastructure et de fournisseurs facultatifs déterminés par l’installation ; exécuter le même cœur ne le transforme pas en abonnement Cloud.

### Capacités de la version candidate {#plan-capacities}

Ces valeurs par défaut décrivent la version candidate 0.11.1 identifiée. Vérifiez la page de prix et le compte réels avant d’acheter ; les prix configurés au paiement et les dérogations du compte peuvent différer. Le nombre d’invités exclut le propriétaire du projet. Le stockage est imputé au propriétaire du projet qui reçoit les fichiers.

| Plan | Projets | Tickets par projet | Invités par projet | Stockage | IA mensuelle incluse (USD) |
| --- | --- | --- | --- | --- | --- |
| Free | 2 | 300 | 3 | 1 GiB | 0.50 |
| Go | Illimités | Illimités | Illimités | 20 GiB | 5 |
| Pro | Illimités | Illimités | Illimités | 100 GiB | 15 |

![Page d’usage IA du compte de démonstration.](/documentation/fr/plans-and-ai-usage-workflow.png)

## Dicter du texte et des modifications {#voice-dictation}

Utilisez le microphone à côté d’un champ compatible pour dicter un ticket, un objectif, un commentaire, un message Numo, un feedback ou une instruction de routine. Vous devez pouvoir écrire à cet endroit, disposer d’un microphone fonctionnel et utiliser un navigateur compatible avec l’enregistrement. Autorisez le microphone pour ce site dans le navigateur et le système d’exploitation. Utilisez HTTPS pour une instance distante. Sur le Cloud, votre budget IA doit être disponible ; une instance self-hosted doit aussi disposer de fournisseurs de transcription et de dictée fonctionnels. Les clés personnelles et les modèles de voix se règlent [plus haut](#ai-keys-and-models).

1. Ouvrez le formulaire ou le ticket concerné et choisissez son microphone. Dans un ticket ouvert, Command+Maj+D sur macOS ou Ctrl+Maj+D ailleurs active ou arrête la modification vocale. Vérifiez que le compteur et la forme d’onde apparaissent.
2. Parlez dans la langue de l’interface, qui guide la transcription. Pour modifier un ticket, formulez clairement l’action, par exemple « Passe la priorité à haute ». Arrêtez avec le bouton carré et attendez la fin de la transcription et du traitement Numo avant de fermer le formulaire.
3. Vérifiez le résultat. Les messages Numo, commentaires et instructions de routine reçoivent du texte modifiable ; relisez-le avant de l’envoyer ou de l’enregistrer. Les formulaires de création reçoivent des champs de brouillon à confirmer. La modification vocale d’un ticket existant applique immédiatement les changements : vérifiez ensuite ses champs et corrigez toute erreur avec les commandes habituelles. La dictée n’accorde aucun droit supplémentaire.

### Consommation et limites d’enregistrement {#voice-limits}

L’audio est envoyé au service de transcription configuré, puis peut être corrigé ou interprété par un modèle IA. La consommation suit les règles du fournisseur et du budget du compte ; l’enregistrement et son interprétation peuvent être comptabilisés séparément. Le feedback public possède ses propres conditions de disponibilité et de facturation, décrites dans le [guide du feedback](/docs/feedback). La démo de la page d’accueil a une limite distincte et ne constitue pas un quota de dictée du compte.

Le service de transcription connecté accepte jusqu’à 10 MiB d’audio et 30 requêtes par compte et par heure. L’enregistreur partagé s’arrête après 20 minutes par précaution. Préférez des prises courtes pour vérifier chaque résultat. Conservez le texte existant jusqu’à vérification ; l’enregistreur ne sauvegarde pas vos fichiers audio.

### Reprendre après un échec {#voice-recovery}

Si l’accès est refusé, autorisez le microphone pour le site et pour le navigateur ou l’app desktop dans le système, puis réessayez. Si aucun appareil n’est détecté, branchez ou sélectionnez un microphone ; s’il est occupé, fermez l’application qui l’utilise. Si l’enregistrement n’est pas compatible, utilisez un autre navigateur compatible ou saisissez le texte au clavier.

En cas de silence ou de résultat vide, vérifiez le périphérique d’entrée et faites une courte prise audible. Si l’enregistrement est trop volumineux, divisez-le. Un message de limitation indique le délai d’attente ; attendez avant de réessayer. Pour un problème de budget ou de fournisseur, vérifiez la consommation IA, les affectations de voix et la configuration de l’instance. Si la correction échoue mais que la transcription est renvoyée, relisez et modifiez ce texte. Avant de répéter une modification de ticket qui semble avoir échoué, vérifiez ses champs pour éviter de l’appliquer deux fois.
