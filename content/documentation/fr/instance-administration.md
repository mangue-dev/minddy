---
{
  "id": "instance-administration",
  "locale": "fr",
  "title": "Administration d’instance",
  "summary": "L’administration de l’instance est distincte de la propriété d’un projet.",
  "topic": "Exploiter une instance",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H16"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 19,
  "sourceRevision": 19,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-13",
  "compatibility": {
    "version": "0.30.0 (MIN-794 release review)",
    "editions": [
      "self-hosted"
    ],
    "profiles": [
      "full",
      "managed",
      "source",
      "local"
    ],
    "evidence": [
      "app/(app)/admin/page.tsx",
      "app/(app)/admin/layout.tsx",
      "components/admin/admin-dashboard.tsx",
      "lib/admin-tabs.ts",
      "lib/server/admin.ts",
      "docs/self-hosting-auth.md",
      "lib/ai-model-config.ts",
      "app/api/admin/app-config/route.ts",
      "lib/server/decisions/model-validation.ts",
      "lib/server/issue-relation-inference.ts",
      "lib/server/model-capability-validation.ts",
      "app/api/cron/issue-index/route.ts",
      "lib/server/issue-semantic-search.ts",
      "components/admin/admin-accounts-dashboard.tsx",
      "components/admin/admin-costs-dashboard.tsx",
      "components/admin/admin-models-dashboard.tsx",
      "lib/ai-model-config-file.ts",
      "lib/server/admin-model-config.ts",
      "lib/server/model-config.ts",
      "lib/server/assistant/admin-tools.ts",
      "lib/instance-variables.ts",
      "lib/server/instance-variables.ts",
      "app/api/admin/instance-variables/route.ts",
      "components/admin/admin-instance-dashboard.tsx",
      "components/agent/model-combobox.tsx",
      "lib/server/assistant/conversation-config.ts",
      "lib/decision-engine.ts",
      "lib/server/decisions/engine.ts"
    ]
  },
  "review": {
    "revision": 19,
    "fact": "agent:claude-code (Aligned quoted UI labels with the MIN-885 copy audit, checked against messages/*.json; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured); agent:claude-code (0.30.0 release review, MIN-794: its evidence changes in the v0.20.0..0.30.0 delta were documented by the pull requests that made them; the article was updated by pull requests in that delta; not re-audited line by line; 2 screenshot(s) recaptured on 2026-11-04 from a local candidate against the preview demo account and inspected, 1 kept with their earlier capture; no browser walkthrough of the procedures); agent:claude-code (MIN-928: event screening added to the Assistant category of Models, checked against lib/ai-model-config.ts; rest of the article unchanged since the previous review; no figure recaptured); agent:claude-code (MIN-929: Background turns per day added to the Assistant card of Models, checked against lib/ai-model-config.ts and lib/ai-model-config-file.ts; rest of the article unchanged since the previous review; no figure recaptured); agent:claude-code (MIN-930: home summary added to the Assistant category of Models, checked against lib/ai-model-config.ts); agent:claude-code (MIN-954: sentence on Numo's model on minddy Cloud in #models, source audit against lib/server/assistant/conversation-config.ts; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-954 model roles: #models, #models-file, #decision-model and #smart-fill-relations rewritten for one model per role, source audit against lib/ai-model-config.ts, lib/ai-model-config-file.ts, lib/server/admin-model-config.ts and components/admin/admin-models-dashboard.tsx; no browser walkthrough; the instance-administration-models screenshot still shows the former category cards and needs a recapture); agent:claude-code (MIN-954: recommended models and routing shortcuts removed from #models and #models-file, checked against components/admin/admin-models-dashboard.tsx and lib/ai-model-config-file.ts); agent:claude-code (MIN-980: decision engine switch in #decision-model, per-member decision model and the models file's decision engine in #models-file, source audit against lib/ai-model-config.ts, lib/ai-model-config-file.ts, lib/server/admin-model-config.ts and components/admin/admin-models-dashboard.tsx; no browser walkthrough; the instance-administration-models screenshot does not show the new switch and was not recaptured)",
    "language": "agent:claude-code (fr changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (fr MIN-928 passage with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (fr MIN-929 passage translated from en with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (fr MIN-954 passage with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (fr MIN-954 model-role passages with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (fr MIN-980 decision passages with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-13"
  },
  "related": [
    "authentication-and-email",
    "instance-configuration",
    "recommended-models"
  ],
  "aliases": [],
  "tags": [
    "Utiliser la console d’administration de l’instance"
  ],
  "figures": [
    {
      "id": "instance-administration-flow",
      "kind": "screenshot",
      "src": "/documentation/fr/instance-administration-overview.png",
      "alt": "Onglet Comptes avec le nombre de comptes et la recherche d’un compte par adresse e-mail exacte.",
      "caption": "Comptes affiche le nombre de comptes et la recherche de support ; la capture provient d’une instance de démonstration.",
      "revision": 19,
      "reviewed": true,
      "capturedAt": "2026-11-04",
      "viewport": [
        1488,
        1148
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "instance-administration-models",
      "kind": "screenshot",
      "src": "/documentation/fr/instance-administration-models.png",
      "alt": "Onglet Modèles avec un modèle par défaut par catégorie et les modèles par tâche repliés.",
      "caption": "Modèles affiche un modèle par défaut par catégorie ; les modèles par tâche restent repliés. Aucun réglage de modèle ou de fournisseur n’a été modifié pour cette capture.",
      "revision": 19,
      "reviewed": true,
      "capturedAt": "2026-11-04",
      "viewport": [
        1488,
        1148
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "instance-administration-instance",
      "kind": "screenshot",
      "src": "/documentation/fr/instance-administration-instance.png",
      "alt": "Onglet Instance avec la source de chaque variable, une clé OpenRouter masquée définie ici et les adresses des administrateurs issues du fichier.",
      "caption": "Instance indique d’où vient chaque valeur ; les secrets ne gardent que leurs derniers caractères. Cette capture provient d’une instance auto-hébergée locale jetable.",
      "revision": 19,
      "reviewed": true,
      "capturedAt": "2026-10-29",
      "viewport": [
        1488,
        1148
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "instance-administration-flow"
  ]
}
---

## Utiliser la console d’administration de l’instance {#instance-administration}

L’administration de l’instance est distincte de la propriété d’un projet. Définissez `ADMIN_EMAILS` dans l’environnement serveur avec les adresses confirmées des comptes autorisés. Le rôle `app_metadata.role=admin` signé côté serveur est aussi accepté. Une session administrateur exige `aal2`, une MFA inscrite et vérifiée, ainsi que les contrôles courants du compte et de la session. L’accès est refusé si ces contrôles échouent. Connectez-vous, validez le code TOTP et ouvrez `/admin`. Ne modifiez pas les rôles de la base pour contourner l’inscription MFA. La console et ses API privées restent `noindex`.


![Onglet Comptes avec le nombre de comptes et la recherche d’un compte par adresse e-mail exacte.](/documentation/fr/instance-administration-overview.png)

![Onglet Modèles avec un modèle par défaut par catégorie et les modèles par tâche repliés.](/documentation/fr/instance-administration-models.png)

## Utiliser les capacités présentes {#panels}

La console compte trois onglets : **Comptes**, **Coûts**, **Modèles** et, là où c’est autorisé, **Instance**. **Coûts** reste masqué sans capacité OpenRouter gérée liée. Les liens vers les anciens onglets Vue d’ensemble, Utilisateurs et Finances ouvrent **Comptes** ou **Coûts**. L’attribution d’un plan dépend d’une facturation configurée ou d’une dérogation existante. Ouvrir la console ne donne pas accès à la facturation Cloud sur une instance auto-hébergée sans fournisseur commercial. Ces changements concernent l’instance entière ; vérifiez-les avec des comptes de démonstration.

## Assister un compte {#accounts}

**Comptes** affiche le nombre de comptes de l’instance. En dessous, trouvez un compte uniquement par son adresse e-mail exacte avec **Rechercher**. Ouvrez-le pour voir l’état de confirmation de son e-mail, consulter ou **Remettre à zéro** son budget d’usage IA, ou **Offrir un plan** dans la condition ci-dessus. L’onglet n’affiche ni activité, ni inscriptions, ni accueil, ni nombre de projets, ni contenu personnel ; n’ouvrez un compte que pour une tâche de support ou de facturation.

## Suivre les coûts de l’instance {#costs}

**Coûts** affiche ce que les fournisseurs d’IA coûtent à l’instance, en dollars, comme ils le facturent, et se met à jour tout seul tant qu’il reste ouvert. Choisissez la période dans le menu en haut à droite du volet, et restreignez tout avec le bouton **Filtres** à côté, par fonctionnalité ou par modèle. Les appels effectués avec les clés personnelles des membres ne sont jamais enregistrés et n’apparaissent donc pas ici. Quatre chiffres suivent, chacun avec sa tendance et son évolution par rapport à la période précédente : dépense totale, requêtes, tokens et coût par million de tokens. Viennent ensuite les fonctionnalités et les modèles les plus coûteux, puis la dépense par jour par modèle et par famille de fonctionnalités, les requêtes par jour par modèle et les exécutions récentes, qui s’ouvrent sur leurs appels. Les revenus, abonnements et marges ne sont pas affichés : la facturation Stripe se gère dans Stripe. Les clés OpenRouter par compte qu’aucun compte n’utilise plus sont supprimées chaque nuit.

## Choisir les modèles {#models}

**Modèles** compte une carte par sorte de modèle, et chaque sorte utilise un seul modèle pour toute l’instance. **Modèle de langage** règle le modèle qu’utilisent Numo et toutes les tâches de texte : titres de conversation, recherche web, tri des événements, mot de l’accueil, Smart Fill et ses titres, Smart Assign, décisions de relation, correspondance des imports CSV, découpage des briefs, messages de commit de fusion, nettoyage des dictées, relecture des retours et questions de la FAQ. La même carte contient le **Niveau de raisonnement** de Numo et **Tours en arrière-plan par jour**, qui plafonne les tours que [Numo en arrière-plan](/docs/numo#background) fait pour un membre en 24 heures : 20 si le champ est vide, 0 pour désactiver Numo en arrière-plan pour tous ; le fichier des modèles ne le contient ni ne le réinitialise. **Embeddings** règle le modèle d’embeddings unique des tickets et des retours, **Voix** le modèle de transcription vocale et **Décisions** le [modèle de décision](#decision-model). Aucune tâche n’a de modèle propre. Une instance qui avait réglé un modèle par défaut de catégorie dans une version antérieure continue de l’utiliser : la carte l’affiche, et enregistrer la carte le remplace. **Clés personnelles** est replié en bas : pour chaque fournisseur, il contient le modèle qu’utilise la clé d’un membre pour chaque sorte quand ce membre n’en a choisi aucun.

Sur minddy Cloud, le Numo de chaque membre utilise le modèle et le **Niveau de raisonnement** de la carte **Modèle de langage**, que les membres ne peuvent pas changer. Seule une clé personnelle donne à un membre le choix du modèle de langage, qui sert alors à Numo et à toutes ses tâches de texte.

## Exporter et importer la configuration des modèles {#models-file}

En haut à droite du volet **Modèles**, **Exporter** télécharge la configuration des modèles dans un fichier JSON versionné (format `minddy.instance-models`) : le modèle de chaque sorte, le niveau de raisonnement, le moteur des décisions et les modèles par défaut des clés personnelles. Il ne contient ni clé d’API ni compte. **Importer** lit un tel fichier et liste chaque changement avant toute écriture ; **Appliquer** les écrit tous, ou aucun si une valeur est refusée, par exemple un modèle qui n’est pas un modèle de décision. Un import remplace la configuration : les réglages absents du fichier reviennent à leur valeur par défaut. Un fichier d’une version antérieure de minddy est mis au format actuel : ses modèles par défaut des catégories Assistant et Embeddings remplissent le modèle de langage et le modèle d’embeddings, et ses modèles par tâche, raccourcis de routage et modèles conseillés sont listés puis ignorés. Un fichier d’une version plus récente est refusé tant que l’instance n’est pas mise à jour.

## Administrer l’instance avec Numo {#numo}

Dans une conversation Numo ouverte depuis une session administrateur, Numo peut lire les coûts IA de l’instance, avec les mêmes chiffres et filtres que **Coûts**, lire et modifier la configuration des modèles, prévisualiser et appliquer un import, y compris un fichier de configuration joint à la conversation, trouver un compte par son adresse e-mail exacte, lire son plan et son budget d’usage IA, et offrir ou retirer un plan. La session administrateur est vérifiée à nouveau avant chacune de ces actions, et Numo vous fait confirmer chaque changement avant de l’effectuer. Ces outils ne renvoient ni l’activité, ni les projets, ni le contenu d’un autre compte. [Numo en arrière-plan](/docs/numo#background) y a aussi accès tant que votre compte est administrateur avec l’authentification à deux facteurs activée : il lit de lui-même la configuration des modèles et les coûts, et toute autre action demande l’un de vos souvenirs, qui remplace votre confirmation. Les mentions @Numo, les routines et l’aide publique de la documentation n’y ont jamais accès.

## Modifier les variables de l’instance {#instance-variables}

Sur une instance auto-hébergée dont le fichier d’environnement définit `MINDDY_CONFIG_OVERRIDES=1`, l’onglet **Instance** modifie certaines de ses variables sans toucher au fichier : la clé OpenRouter, les adresses des administrateurs, le fournisseur et les expéditeurs d’e-mail, vos propres apps GitHub et GitLab, les statistiques, le nom et l’adresse de contact de l’instance, et la publication de la configuration des modèles. Le guide d’installation demande s’il faut l’autoriser, et l’app desktop l’active pour l’instance qu’elle installe sur votre ordinateur. Seul le fichier l’active ou le désactive ; minddy Cloud ne le propose jamais.

![Onglet Instance avec la source de chaque variable, une clé OpenRouter masquée définie ici et les adresses des administrateurs issues du fichier.](/documentation/fr/instance-administration-instance.png)

Le champ de recherche au-dessus de la liste retrouve une variable par son nom, son libellé ou sa description. Une valeur enregistrée dans l’onglet remplace celle du fichier, et **Retirer** ramène la valeur du fichier. Chaque variable indique d’où vient sa valeur ; les secrets n’affichent que leurs derniers caractères. La plupart des changements s’appliquent en une minute ; l’onglet signale ceux qui s’appliquent après le redémarrage de l’instance, et l’app desktop propose alors **Redémarrer maintenant**. L’accès à la base, les clés de chiffrement, l’adresse de l’app et les valeurs fixées à la compilation ne se définissent que dans le fichier : une mauvaise valeur dans l’onglet ne vous bloque donc jamais. Retirez-la, ou définissez `MINDDY_CONFIG_OVERRIDES=0` dans le fichier pour revenir à ses valeurs.

Enregistrer un secret ou les adresses des administrateurs demande votre code à deux facteurs si vous ne l’avez pas saisi ces dernières minutes, et vous ne pouvez pas retirer votre propre adresse. Chaque changement apparaît dans l’Inbox des autres administrateurs, y compris ceux désignés par rôle, et par e-mail chez tous les administrateurs, vous compris, si l’instance envoie des e-mails. Enregistrer une valeur inchangée n’enregistre rien. Chaque variable garde ses dernières versions, avec qui l’a modifiée et quand ; **Restaurer** en remet une en place. Les valeurs sont stockées dans la base, chiffrées quand le chiffrement de l’espace de travail est activé.

## Choisir le modèle de décision IA {#decision-model}

Dans **Modèles**, **Décisions**, **Modèle de décision** règle le modèle de décision unique qui répond à toutes les décisions IA de l’instance : Smart Fill, Smart Assign, décisions de relation, tri des événements et relecture des retours. Il n’existe aucun choix par projet ou par fonction ; un membre peut choisir un autre modèle de décision pour sa propre clé OpenRouter dans ses réglages IA. Le sélecteur ne liste que les modèles OpenRouter qui publient la capacité de décision ; les modèles de chat, d’embeddings et de transcription n’y apparaissent jamais. L’enregistrement teste le candidat avec une décision représentative. Un modèle qui n’est pas un modèle de décision, refuse la requête, renvoie une réponse invalide ou met plus de 5 secondes est refusé, et le modèle actuel reste en service. Quand le catalogue ne peut pas être chargé, tout changement est refusé. Les instances auto-hébergées sans IA gérée n’ont pas de catalogue de plateforme et gardent le modèle par défaut, Jev.

**Utiliser un modèle de langage pour les décisions**, sur la même carte, confie plutôt chaque décision au **Modèle de langage** et masque **Modèle de décision**. C’est le réglage par défaut de chaque membre, qui peut en décider autrement dans ses [réglages IA](/docs/ai-settings-and-usage#ai-keys-and-models). Activez-le quand votre instance n’a accès à aucun modèle de décision, par exemple une instance auto-hébergée sans IA gérée dont les membres utilisent leurs propres clés.

Les nouvelles décisions utilisent le modèle enregistré en une minute environ, sur chaque processus serveur. Quand le modèle échoue ou répond sous le seuil de confiance, la décision retombe sur le modèle de langage. Le seuil a été calibré sur Jev et les autres modèles de décision répartissent leur confiance autrement : après un changement, vérifiez l’accord par modèle dans la vue `ai_decision_evaluations_weekly` de la base. Les lignes d’usage indiquent le modèle qui a répondu.

## Configurer les relations Smart Fill {#smart-fill-relations}

Une fois un ticket enregistré, Smart Fill peut l’indexer et le lier aux tickets liés. **Modèle d’embeddings**, dans **Modèles**, **Embeddings**, transforme le titre et la description des tickets, ainsi que les retours, en vecteurs. Le modèle par défaut est `openai/text-embedding-3-small`. Le changer démarre une nouvelle version de l’index : anciens et nouveaux vecteurs ne sont jamais comparés. La tâche horaire `/api/cron/issue-index` indexe alors les tickets existants, 100 par passage, et facture le propriétaire de chaque projet ; elle ne crée jamais de relation. Le même modèle transforme chaque requête de recherche par le sens en vecteur, avec les réglages de fournisseur IA du membre qui cherche, et les requêtes ne sont comparées qu’aux vecteurs de la version actuelle de l’index. Tant qu’un ticket n’est pas réindexé, la recherche de tickets liés et la recherche par le sens ne le trouvent que par ses mots. La même tâche chiffre les vecteurs stockés en clair dès que leur projet est chiffré. Les décisions de relation utilisent le [modèle de décision](#decision-model) et retombent sur le modèle de langage quand il échoue ou hésite.

Les champs d’embedding et de transcription refusent à l’enregistrement un modèle de la mauvaise famille, par exemple un modèle de conversation dans un champ d’embeddings, et le modèle actuel reste utilisé. Cette vérification nécessite le catalogue de la plateforme : quand il ne peut pas être chargé, comme sur une instance auto-hébergée sans IA gérée, le choix ne peut pas être vérifié et il est accepté. Pour les membres qui exécutent les automatisations avec leur propre clé, les valeurs par défaut par fournisseur comprennent `issue_embedding_model` : `text-embedding-3-small` pour OpenAI et `gemini-embedding-001` pour Google.

## Conserver les responsabilités opérateur {#responsibilities}

Vous restez responsable des droits minimaux des administrateurs, de la récupération MFA, des secrets serveur, des sauvegardes, de la rétention, des incidents et des coûts des fournisseurs. La console ne remplace ni une restauration de la base et de Storage ni un test SMTP. Si l’accès est refusé, vérifiez l’adresse confirmée, la liste autorisée, la MFA vérifiée et la session active avant toute modification. Une session révoquée ou bannie ne conserve pas ses privilèges parce que son JWT n’a pas encore expiré. N’incluez aucune donnée privée d’un autre utilisateur, aucun facteur de sécurité ni détail financier dans les captures.
