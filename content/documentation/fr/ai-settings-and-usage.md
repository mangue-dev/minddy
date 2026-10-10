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
  "revision": 9,
  "sourceRevision": 9,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-10",
  "compatibility": {
    "version": "0.11.1 candidate with allowlisted private native preview (MIN-676); MIN-676 private hosted native worker selection",
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
      "content/documentation/reviews/min-676-native-worker-selection-2026-10-10.md"
    ]
  },
  "review": {
    "revision": 9,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (PR #397 source review of voice/export additions; existing procedures and figures retained, no operational rerun); agent:/root/native_hosting_terms (private preview controls and limitations source/UI-test review; prior procedures retained, no native operational run); agent:/root/native_hosting_terms (private worker selection controls and fail-closed recovery source/UI-test review; no paid Claude execution or new provider rehearsal claimed)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review); agent:/root/editorial_en_fr (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (PR #397 localized additions and equivalent meaning review; no independent or human review claimed); agent:/root/native_hosting_terms (localized private preview additions and equivalent meaning; agent review, no human acceptance claimed); agent:/root/native_hosting_terms (localized worker selection additions and equivalent meaning; agent review, no human acceptance claimed)",
    "date": "2026-10-10"
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
      "revision": 9,
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
      "id": "ai-keys-and-models-defaults-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/ai-keys-and-models-defaults-workflow.png",
      "alt": "Modèle de code et niveau de raisonnement par défaut.",
      "caption": "Modèle et raisonnement par défaut d’OpenCode. Les nouveaux agents OpenCode utilisent ces valeurs ; les agents en cours conservent leurs réglages figés.",
      "revision": 9,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        816,
        217
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
      "revision": 9,
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
    "ai-keys-and-models-defaults-workflow",
    "plans-and-ai-usage-workflow"
  ]
}
---

Les réglages IA du compte définissent les fournisseurs, les clés personnelles et les valeurs par défaut des fonctionnalités prises en charge. Vérifiez le routage des modèles avant de commencer, puis consultez les sections sur la consommation Cloud pour distinguer la facturation du fournisseur, le budget IA inclus, le calcul de la sandbox et les limites des routines.

## Configurer ses clés IA et modèles {#ai-keys-and-models}

Ouvrez les réglages IA du compte, ajoutez un fournisseur compatible et saisissez sa clé ainsi que l’URL de base éventuellement requise. Enregistrez et vérifiez l’état de confirmation. Pour les appels IA disposant d’un recours géré, une clé non confirmée ou injoignable laisse l’utilisation sur minddy. Ce recours exige une IA gérée configurée ; les workers de code suivent les règles de modèle lié au fournisseur ci-dessous. Ne collez jamais la clé dans une conversation ou une capture.

Attribuez les familles de modèles de texte, transcription et embeddings à des clés compatibles ou laissez-les sur minddy. Pour chaque clé, choisissez les usages activés : conversations Numo, travail sur le code, automatisations, voix et retours. Un usage ou une famille sans attribution utilisable reste comptabilisé sur minddy. Votre fournisseur facture les appels réalisés avec sa clé. Le calcul de la sandbox est comptabilisé séparément ; les clés personnelles validées (BYOK) et le travail financé par minddy suivent les [règles de budget ci-dessous](#consumption).

![Carte du fournisseur IA avec minddy Cloud sélectionné.](/documentation/fr/ai-keys-and-models-workflow.png)

### Choisir un abonnement personnel de code dans l’aperçu privé {#native-agent-preview}

Si votre compte a été activé pour l’aperçu privé, les paramètres IA du compte affichent **Abonnements personnels de code**. Choisissez **Connecter Codex** ou **Connecter Claude Code**, puis autorisez l’accès sur la page officielle du fournisseur avec votre propre compte. Pour Codex, saisissez le code de connexion affiché sur cette page. Si Claude demande un code d’autorisation, collez uniquement ce code dans Minddy et choisissez **Terminer la connexion**. Vous devez avoir accès à Codex ou disposer d’un abonnement Claude incluant Claude Code. **Annuler la connexion** arrête une tentative en cours.

Après la connexion, **Tester de nouvelles sandboxes** vérifie l’accès natif et les outils Minddy dans deux nouvelles sandboxes hébergées. Examinez le résultat, notamment la destruction de chaque sandbox. Un test d’accès réussi ne prouve pas le renouvellement de l’authentification : un message distinct indique lorsque ce renouvellement n’a pas été observé. La connexion est sauvegardée pour les tests suivants ; reconnectez-vous si l’accès expire ou ne peut pas être restauré. **Déconnecter** supprime la connexion sauvegardée par Minddy ; cela ne résilie pas votre abonnement au fournisseur.

Après la connexion, sélectionnez **Codex** ou **Claude Code** dans **Agent de code**. Numo utilise ce choix pour les nouveaux agents travaillant sur un dépôt : implémentation de tickets, plans, vérifications et travaux demandés dans une conversation ou une routine. Le CLI natif choisit son modèle et son raisonnement ; les réglages du modèle API d’OpenCode ne s’appliquent pas. Les agents s’exécutent dans des sandbox serveur hébergées avec les outils Minddy. Aucun ordinateur local ni sandbox permanente n’est nécessaire.

L’aperçu natif expose les outils Minddy contrôlés via MCP. Les outils intégrés natifs du fournisseur, les images en entrée et les sous-agents ne sont pas disponibles dans ces adaptateurs. Numo lit les capacités de l’adaptateur choisi et reçoit celles de l’agent figé avec son résultat. Il transmet les questions de l’agent à partir du contexte fiable de la conversation, ou vous interroge lorsqu’une décision manque. Numo peut utiliser ses propres outils pris en charge dans les limites de votre autorisation ; il n’invente pas d’opérations non prises en charge par le moteur.

Une connexion manquante, un accès expiré ou une limite du fournisseur arrête le travail natif. Minddy ne bascule pas automatiquement vers OpenCode, un autre fournisseur API ou un autre payeur. Reconnectez le compte sélectionné ou choisissez explicitement **OpenCode**. La déconnexion ou la perte d’accès à l’aperçu conserve le choix enregistré jusqu’à votre modification. Les agents existants conservent le moteur choisi au démarrage.

Votre abonnement finance l’usage du modèle natif. Les appels de conversation Numo et le calcul des sandbox suivent toujours les règles d’usage et de budget Minddy. Cet aperçu est réservé aux comptes activés ; l’exécution réelle avec un abonnement Claude Code payant n’a pas encore été validée. Une connexion ou un test de démarrage réussi ne prouve pas le fonctionnement de tous les abonnements, du renouvellement de l’authentification ou d’une implémentation complète.

### Modèles et lieu d’exécution {#models}

**OpenCode:** Le choix du modèle de code est lié à son fournisseur. Après le changement, la désactivation ou la perte d’une clé personnelle, le choix précédent peut ne plus correspondre au fournisseur actif. Un nouveau worker refuse alors de démarrer jusqu’au choix d’un modèle compatible dans les réglages IA du compte ; il ne sélectionne pas automatiquement un modèle moins cher ou une valeur par défaut de la plateforme. Une exécution BYOK déjà fixée ne change pas de payeur lorsque sa clé devient indisponible.

Avec **OpenCode**, réglez ici le modèle de code et le raisonnement par défaut des nouveaux agents. Avec **Codex** ou **Claude Code**, le CLI choisit ces valeurs. Les agents existants conservent leurs réglages figés. Choisissez séparément la région et la taille des sandbox. Ces choix ne remplacent pas le modèle de conversation.

Lorsqu’ils sont configurés, Ollama local et les endpoints compatibles OpenAI peuvent servir les conversations par le bridge desktop. Ils ne peuvent pas servir le travail sur le code délégué ou les routines exécutées dans la sandbox serveur. Pour ces usages, choisissez un fournisseur joignable depuis le serveur. Retirez un fournisseur devenu inutile avec son contrôle de confirmation et vérifiez le routage obtenu avant la prochaine exécution.

![Modèle de code et niveau de raisonnement par défaut.](/documentation/fr/ai-keys-and-models-defaults-workflow.png)

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
