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
  "revision": 17,
  "sourceRevision": 17,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-17",
  "compatibility": {
    "version": "0.11.1 candidate; multi-provider settings and persistent personal Numo defaults; MIN-721 removal of code agents, sandboxes and code-work usage; MIN-693 project roles",
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
      "lib/server/agent/model.ts",
      "lib/server/ai-runtime.ts",
      "lib/server/usage.ts",
      "app/(app)/billing/page.tsx",
      "app/(marketing)/pricing/page.tsx",
      "lib/billing-plans.ts",
      "components/ai-elements/dictate-button.tsx",
      "app/api/transcribe/route.ts",
      "lib/use-issue-dictation.ts",
      "components/issue-side-panel.tsx",
      "lib/use-objective-dictation.ts",
      "lib/use-feedback-dictation.ts",
      "components/issue-timeline.tsx",
      "components/assistant/chat-input.tsx",
      "components/routines/routine-prompt-field.tsx",
      "lib/ai-surfaces.ts",
      "components/billing/usage-segment-ui.tsx",
      "docs/security/project-roles.md",
      "lib/project-roles.ts"
    ]
  },
  "review": {
    "revision": 17,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (PR #397 source review of voice/export additions; existing procedures and figures retained, no operational rerun); agent:/root/native_hosting_terms (private preview controls and limitations source/UI-test review; prior procedures retained, no native operational run); agent:/root/native_hosting_terms (private worker selection controls and fail-closed recovery source/UI-test review; no paid Claude execution or new provider rehearsal claimed); agent:/root/native_identity_docs (frozen identity and proactive context source review; prior operational evidence retained, no new provider execution); agent:/root (account organization and official hosted-auth restriction source review; no provider rerun); agent:/root (native model controls and frozen launch source review; live auth outcomes recorded separately); agent:/root (experimental Claude and explicit cold continuation source and fixture review; no live provider execution); agent:/root (provider routing, persistent Numo defaults and local Docker UI review; no provider inference); agent:/root (guided connection source, behavior fixtures and local visual review; no live provider authentication); agent:/root/min721_docs (MIN-721 source review inherited from en revision 16; fr translation of removal edits; no operational rerun); agent:/root (MIN-693 project roles: decision record, permission matrix and source review; no browser walkthrough, no new captures; unchanged evidence retained)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review); agent:/root/editorial_en_fr (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (PR #397 localized additions and equivalent meaning review; no independent or human review claimed); agent:/root/native_hosting_terms (localized private preview additions and equivalent meaning; agent review, no human acceptance claimed); agent:/root/native_hosting_terms (localized worker selection additions and equivalent meaning; agent review, no human acceptance claimed); agent:/root/native_identity_docs (localized additions and complete equivalent meaning; agent review, no human acceptance claimed); agent:/root (complete six-locale meaning review; agent review, not human acceptance); agent:/root (six-locale model-control meaning review; not human acceptance); agent:/root (six-locale experimental and reconnect additions; agent review, not human acceptance); agent:/root (complete six-locale defaults and routing meaning review; no human acceptance); agent:/root (six-locale wizard procedure equivalence; no human acceptance); agent:/root/min721_fr (fr translation of MIN-721 removal edits, equivalent meaning reviewed; agent review, not human acceptance); agent:/root/min693_fr with agent:/root (fr MIN-693 translation of the changed passages, localized labels and retained-meaning review; agent review, not human acceptance)",
    "date": "2026-10-17"
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
      "kind": "diagram",
      "src": "/documentation/fr/ai-providers-and-numo-defaults-flow.svg",
      "alt": "Les connexions, le routage par capacité et le modèle Numo personnel sont des réglages distincts.",
      "caption": "Plusieurs fournisseurs peuvent rester connectés. Le routage choisit le fournisseur par capacité ; le défaut Numo est enregistré par compte et fournisseur.",
      "revision": 17,
      "reviewed": true,
      "capturedAt": "2026-10-11",
      "viewport": [
        816,
        390
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "title": "Fournisseurs et modèle Numo",
        "items": [
          {
            "title": "Fournisseurs connectés",
            "detail": "Gardez plusieurs fournisseurs API connectés ; un ajout conserve les autres."
          },
          {
            "title": "Fournisseur par capacité",
            "detail": "Attribuez séparément le texte, la transcription et les embeddings, puis activez les usages."
          },
          {
            "title": "Modèle par défaut de Numo",
            "detail": "Suivez le défaut de l’app ou enregistrez votre modèle. Le choix d’une conversation est prioritaire."
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "ai-keys-and-models-workflow"
  ]
}
---

Les réglages IA du compte définissent les fournisseurs, les clés personnelles et les valeurs par défaut des fonctionnalités prises en charge. Vérifiez le routage des modèles avant de commencer, puis consultez les sections sur la consommation Cloud pour distinguer la facturation du fournisseur, le budget IA inclus et les limites des routines.

La section **IA de Minddy** des paramètres IA du compte configure les fournisseurs API utilisés par les conversations Numo, les routines, les automatisations, la voix et le feedback. Les agents de code que vous exécutez vous-même, connectés via le MCP minddy, utilisent leur propre abonnement ou compte API et ne consomment pas l’usage IA de Minddy.

## Configurer ses clés IA et modèles {#ai-keys-and-models}

Dans les paramètres IA du compte, **Provider IA** sélectionne le fournisseur de modèles de texte parmi Minddy Cloud et vos fournisseurs compatibles connectés. **Fournisseurs connectés** affiche toute la liste. Choisissez **Ajouter un fournisseur**, sélectionnez-le, saisissez sa clé API et son éventuelle URL de base, puis enregistrez. Vous pouvez connecter plusieurs fournisseurs ; en ajouter ou en sélectionner un ne supprime pas les autres. Ne collez jamais une clé dans une conversation ou une capture d’écran.

Attribuez indépendamment les familles texte, transcription et embeddings. Chaque famille utilise un seul fournisseur à la fois. Les interrupteurs d’usage de chaque fournisseur déterminent si Numo, les automatisations, la voix et le feedback utilisent cette clé ou le quota Minddy. Vous pouvez, par exemple, garder le texte sur OpenRouter et la transcription sur OpenAI. Sélectionner un fournisseur de texte ne réactive pas un usage Numo précédemment désactivé.

Dans **Modèle par défaut de Numo**, choisissez **Par défaut de l’app** ou un modèle précis du fournisseur actif de Numo. Ce choix est enregistré pour votre compte et séparément pour chaque fournisseur, après rechargement comme dans une nouvelle session. Le défaut de l’app suit le modèle configuré par l’application pour ce fournisseur. Le modèle choisi explicitement dans une conversation est prioritaire ; les conversations qui suivent votre défaut reprennent ses modifications ultérieures. Les tours déjà admis gardent leur modèle enregistré. Un modèle devenu indisponible ou hors des limites de votre offre est refusé : choisissez un autre modèle ou le défaut de l’app. L’export et l’import du compte incluent ces préférences, sans les credentials des fournisseurs.

Une clé non confirmée ou inaccessible peut laisser les appels IA généraux compatibles sur le quota Minddy lorsque l’IA gérée est configurée. Votre fournisseur facture les appels effectués avec sa clé. Les clés personnelles validées et le travail financé par Minddy suivent les [règles de budget ci-dessous](#consumption).

![Les connexions, le routage par capacité et le modèle Numo personnel sont des réglages distincts.](/documentation/fr/ai-providers-and-numo-defaults-flow.svg)

### Modèles locaux {#models}

Minddy appelle les modèles d’IA depuis le serveur : il ne peut donc pas utiliser un modèle qui tourne sur votre ordinateur. **Ajouter un fournisseur** ne propose pas d’Ollama local ni d’endpoint local compatible OpenAI. Un endpoint local enregistré dans une version précédente reste affiché dans **Fournisseurs connectés**, mais il ne peut servir ni les conversations Numo, ni les routines, ni les autres fonctions. Retirez-le et assignez à la place un fournisseur joignable depuis le serveur. Retirez un fournisseur devenu inutile avec son contrôle de confirmation et vérifiez le routage obtenu avant la prochaine exécution.


## Comprendre forfaits Cloud et consommation IA {#plans-and-ai-usage}

Cloud propose Free, Go et Pro. Tous incluent MCP, conversations Numo, actions contextuelles et routines. Les capacités, l’utilisation IA incluse, les modèles et le stockage diffèrent. Ouvrez Facturation pour consulter votre budget et votre consommation actuels, puis comparez la page publique des prix avant de choisir un plan ; ses chiffres constituent la référence actuelle.

Utilisez l’action de paiement ou de gestion d’abonnement proposée à votre compte. Vérifiez le montant, la période de facturation et la confirmation du fournisseur avant d’accepter. Un changement de plan réussi doit apparaître dans la facturation du compte ; vérifiez cet état plutôt que de considérer une fenêtre de paiement fermée comme une preuve.

### Ce qui consomme le budget {#consumption}

L’utilisation IA incluse couvre le raisonnement et les appels d’outils de Numo, les routines, les automatisations, la dictée vocale et le traitement des retours. La limite mensuelle d’IA incluse s’applique au travail financé par minddy. Le plafond par exécution d’une routine constitue une limite distincte qui peut mettre son exécution en pause ; le travail terminé reste dans la conversation. Ces limites n’autorisent pas la facturation automatique de dépassements. Consultez la carte de limite et la date de réinitialisation du budget lorsqu’elle est disponible.

Les clés personnelles compatibles font facturer les appels aux modèles par leur fournisseur plutôt que par l’utilisation IA incluse. Les familles ou usages non attribués qui passent par des appels financés par minddy restent soumis à leur allocation minddy. L’auto-hébergement comporte des coûts d’infrastructure et de fournisseurs facultatifs déterminés par l’installation ; exécuter le même cœur ne le transforme pas en abonnement Cloud.

### Capacités des formules {#plan-capacities}

Ces valeurs par défaut décrivent Minddy 0.20.0. Vérifiez la page de prix et le compte réels avant d’acheter ; les prix configurés au paiement et les dérogations du compte peuvent différer. Le nombre d’invités exclut le propriétaire du projet et inclut les membres, les lecteurs et les invitations en attente ; il n’y a pas de facturation par siège. Le stockage est imputé au propriétaire du projet qui reçoit les fichiers. Lorsque la propriété est transférée, ces limites, le stockage et l’IA de fond comme Smart Assign et la relecture des retours reposent sur l’offre du nouveau propriétaire.

| Plan | Projets | Tickets par projet | Invités par projet | Stockage | IA mensuelle incluse (USD) |
| --- | --- | --- | --- | --- | --- |
| Free | 2 | 300 | 3 | 1 GiB | 0.50 |
| Go | Illimités | Illimités | Illimités | 20 GiB | 5 |
| Pro | Illimités | Illimités | Illimités | 100 GiB | 15 |

La facturation affiche le budget IA restant et sa prochaine réinitialisation, **Évolution du budget**, ainsi que **Qu’est-ce qui consomme ?**, qui répartit la consommation entre **Routines**, **Numo**, **Dictée vocale**, **Retours** et **Automatisations**, en pourcentage du budget inclus. **Historique d'usage** liste les actions de la période en cours et leur part du budget.

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