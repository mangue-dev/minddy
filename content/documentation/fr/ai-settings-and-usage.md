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
  "revision": 23,
  "sourceRevision": 23,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-29",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "components/ai-elements/dictation-pill.tsx",
      "components/ai-elements/use-dictation-recorder.ts",
      "components/settings/account-preferences-section.tsx",
      "components/settings/dictation-vocabulary-section.tsx",
      "lib/dictation-vocabulary.ts",
      "lib/dictation-hallucinations.ts",
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
      "lib/project-roles.ts",
      "components/agent/model-combobox.tsx"
    ]
  },
  "review": {
    "revision": 23,
    "fact": "agent:claude-code (model pickers show the default's model by name instead of App default when that model is in the catalog, and choosing it keeps following the default; checked against components/agent/model-combobox.tsx and components/settings/account-ai-keys-section.tsx; not checked in the running app; rest of the article unchanged since the previous review; no figure changed, the diagram does not show picker labels)",
    "language": "agent:claude-code (fr changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-29"
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
      "alt": "Les fournisseurs connectés, un fournisseur par usage, ainsi que le fournisseur et le modèle de Numo sont des réglages distincts.",
      "caption": "Chaque usage passe par minddy Cloud ou un fournisseur connecté. Le défaut de Numo est enregistré par fournisseur ; une conversation peut choisir son propre fournisseur et son modèle.",
      "revision": 23,
      "reviewed": true,
      "capturedAt": "2026-10-28",
      "viewport": [
        816,
        390
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "title": "Fournisseurs, usages et Numo",
        "items": [
          {
            "title": "Fournisseurs connectés",
            "detail": "minddy Cloud et vos clés API restent disponibles côte à côte."
          },
          {
            "title": "Un fournisseur par usage",
            "detail": "Chaque usage précis, des titres de Numo à la transcription, choisit son fournisseur."
          },
          {
            "title": "Fournisseur et modèle de Numo",
            "detail": "Choisissez un fournisseur, puis son modèle. Une conversation peut choisir les siens."
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

Dans les paramètres IA du compte, **Fournisseurs connectés** liste minddy Cloud, inclus dans votre forfait, et les fournisseurs API que vous avez connectés. Choisissez **Ajouter un fournisseur**, sélectionnez un fournisseur, saisissez sa clé API et l’URL de base éventuellement requise, puis enregistrez. Vous pouvez connecter plusieurs fournisseurs ; en ajouter un ne retire pas les autres et ne change pas ce qu’utilisent vos usages. Ne collez jamais une clé dans une conversation ou une capture d’écran.

Plus bas, **Numo**, **Automatisations**, **Dictée vocale** et **Retours** listent leurs usages précis, comme les conversations, les titres des conversations et la recherche web de Numo, ou Smart Fill et la transcription. Chaque usage choisit son fournisseur, minddy Cloud ou un fournisseur connecté, et change seul : vous pouvez tout laisser sur minddy Cloud sauf les conversations de Numo. Un usage ne propose que les fournisseurs capables de le servir : la transcription et la recherche par le sens demandent un fournisseur qui propose ces modèles, et la recherche web demande minddy Cloud ou une clé OpenRouter. Quand un usage passe par l’une de vos clés, son modèle apparaît sous le fournisseur : gardez le modèle présélectionné du fournisseur ou choisissez-en un autre. Les choix s’appliquent immédiatement. Sur une instance sans minddy Cloud, un fournisseur nouvellement connecté sert chaque usage qui n’en a pas encore.

Pour les **Conversations** de Numo, choisissez le fournisseur, puis un modèle de ce fournisseur. Le sélecteur affiche le modèle par défaut de l’app sous son propre nom, coché tant que vous le suivez ; le choisir garde votre réglage aligné sur le défaut de l’app, dont les changements ultérieurs s’appliquent donc encore. **Par défaut de l’app** n’apparaît comme option que si ce modèle ne figure pas au catalogue. Ce défaut est enregistré pour votre compte et séparément pour chaque fournisseur, entre les rechargements et les nouvelles sessions. Dans une conversation, la liste des modèles à côté du micro s’ouvre sur les fournisseurs lorsque plusieurs sont disponibles ; choisissez-en un pour voir ses modèles. La conversation garde ce fournisseur et ce modèle, et les conversations qui suivent votre défaut reprennent les changements ultérieurs du compte. Les tours déjà admis conservent leur fournisseur et leur modèle figés. Un modèle enregistré devenu indisponible ou supérieur à votre forfait est refusé : choisissez un autre modèle ou le modèle par défaut de l’app. Si le fournisseur d’une conversation est retiré, Numo vous demande d’en choisir un autre au lieu d’en changer seul. L’export et l’import du compte incluent ces préférences de modèle, sans les identifiants des fournisseurs.

Une clé non confirmée ou inaccessible peut laisser les appels IA généraux compatibles sur le quota Minddy lorsque l’IA gérée est configurée. Votre fournisseur facture les appels effectués avec sa clé, et minddy ne les enregistre pas. Les clés personnelles validées et le travail financé par Minddy suivent les [règles de budget ci-dessous](#consumption).

![Les fournisseurs connectés, un fournisseur par usage, ainsi que le fournisseur et le modèle de Numo sont des réglages distincts.](/documentation/fr/ai-providers-and-numo-defaults-flow.svg)

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

1. Ouvrez le formulaire ou le ticket concerné et choisissez son microphone. Dans un ticket ouvert, Command+Maj+D sur macOS ou Ctrl+Maj+D ailleurs active ou arrête la modification vocale. Une barre de dictée s’ouvre en bas de l’écran, en panneau sur un téléphone, avec le compteur et une onde qui suit votre voix. Le reste de l’interface attend la fin de l’enregistrement.
2. Parlez dans la langue de l’interface, qui guide la transcription. Pour modifier un ticket, formulez clairement l’action, par exemple « Passe la priorité à haute ». Choisissez **Transcrire** (✓), appuyez sur Command+Entrée sur macOS ou Ctrl+Entrée ailleurs (Entrée fonctionne aussi) ou refaites le raccourci, puis attendez la fin de la transcription et du traitement Numo. Pour jeter l’enregistrement, choisissez **Abandonner l’enregistrement** (✕) ou appuyez sur Échap, puis **Abandonner** : rien n’est envoyé.
3. Vérifiez le résultat. Les messages Numo, commentaires et instructions de routine reçoivent du texte modifiable ; relisez-le avant de l’envoyer ou de l’enregistrer. Les formulaires de création reçoivent des champs de brouillon à confirmer. Dans le formulaire de nouveau ticket avec Smart Fill activé, la dictée laisse à Smart Fill le titre (quand Smart Fill l’écrit), la priorité, l’effort, les catégories et l’objectif, sauf si vous demandez l’une de ces propriétés, par exemple « mets l’effort à M ». La modification vocale d’un ticket existant applique immédiatement les changements : vérifiez ensuite ses champs et corrigez toute erreur avec les commandes habituelles. La dictée n’accorde aucun droit supplémentaire.

### Consommation et limites d’enregistrement {#voice-limits}

L’audio est envoyé au service de transcription configuré, puis peut être corrigé ou interprété par un modèle IA. Le nettoyage corrige la ponctuation, les hésitations et les reprises ; pour insérer les mots tels qu’ils ont été entendus, désactivez **Nettoyer les dictées** dans **Paramètres du compte** > **Préférences** > **Dictée vocale** : aucun modèle de nettoyage n’est alors appelé pour vos dictées. Avec ou sans nettoyage, minddy retire les phrases que les modèles de transcription inventent sur un silence, comme les crédits de sous-titrage ou un « Merci d’avoir regardé » final. Le feedback public garde son propre traitement. Sous **Vocabulaire**, juste en dessous, ajoutez jusqu’à 50 noms et termes que la dictée doit écrire à votre façon ; renseignez **Entendu comme** pour remplacer ce mot dans chaque dictée, même sans nettoyage. La consommation suit les règles du fournisseur et du budget du compte ; l’enregistrement et son interprétation peuvent être comptabilisés séparément. Le feedback public possède ses propres conditions de disponibilité et de facturation, décrites dans le [guide du feedback](/docs/feedback). La démo de la page d’accueil a une limite distincte et ne constitue pas un quota de dictée du compte.

Le service de transcription connecté accepte jusqu’à 10 MiB d’audio et 30 requêtes par compte et par heure. L’enregistreur partagé s’arrête après 20 minutes par précaution. Préférez des prises courtes pour vérifier chaque résultat. Conservez le texte existant jusqu’à vérification ; l’enregistreur ne sauvegarde pas vos fichiers audio.

### Reprendre après un échec {#voice-recovery}

Si l’accès est refusé, autorisez le microphone pour le site et pour le navigateur ou l’app desktop dans le système, puis réessayez. Si aucun appareil n’est détecté, branchez ou sélectionnez un microphone ; s’il est occupé, fermez l’application qui l’utilise. Si l’enregistrement n’est pas compatible, utilisez un autre navigateur compatible ou saisissez le texte au clavier.

En cas de silence ou de résultat vide, vérifiez le périphérique d’entrée et faites une courte prise audible. Si l’enregistrement est trop volumineux, divisez-le. Un message de limitation indique le délai d’attente ; attendez avant de réessayer. Pour un problème de budget ou de fournisseur, vérifiez la consommation IA, les affectations de voix et la configuration de l’instance. Si la correction échoue mais que la transcription est renvoyée, relisez et modifiez ce texte. Avant de répéter une modification de ticket qui semble avoir échoué, vérifiez ses champs pour éviter de l’appliquer deux fois.