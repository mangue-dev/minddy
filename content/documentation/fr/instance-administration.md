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
  "revision": 12,
  "sourceRevision": 12,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-29",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review); MIN-798 Smart Fill title model; MIN-829 instance administration",
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
      "lib/server/assistant/admin-tools.ts"
    ]
  },
  "review": {
    "revision": 12,
    "fact": "agent:claude-code (MIN-829 tabs, accounts, costs, model categories, configuration file and Numo admin tools checked against lib/admin-tabs.ts, lib/ai-model-config.ts, lib/ai-model-config-file.ts, lib/server/admin-model-config.ts, lib/server/finance.ts, lib/admin-costs.ts, lib/server/retention.ts and lib/server/assistant/admin-tools.ts, including admin_get_costs; both figures recaptured on 2026-10-29 with captures/shots/documentation-admin from a local candidate against the preview capture admin, every write blocked, and inspected); agent:claude-code (MIN-798 Smart-fill titles model paragraph checked against lib/ai-model-config.ts, lib/ai-surfaces.ts and lib/server/smart-fill-title.ts: automations group, fallback deepseek/deepseek-v4-flash, not answered by the decision model; no figure changed); agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; both screenshots recaptured on 2026-10-20 with captures/shots/documentation-admin and the preview-only capture admin (MIN-740); no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:claude-code (fr MIN-829 sections with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (fr MIN-798 Smart-fill titles model paragraph with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:/root/min747 (fr translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (fr manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-29"
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
      "alt": "Onglet Comptes avec le nombre de comptes et la recherche d’un compte par adresse email exacte.",
      "caption": "Comptes affiche le nombre de comptes et la recherche de support ; la capture provient d’une instance de démonstration.",
      "revision": 12,
      "reviewed": true,
      "capturedAt": "2026-10-29",
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
      "revision": 12,
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


![Onglet Comptes avec le nombre de comptes et la recherche d’un compte par adresse email exacte.](/documentation/fr/instance-administration-overview.png)

![Onglet Modèles avec un modèle par défaut par catégorie et les modèles par tâche repliés.](/documentation/fr/instance-administration-models.png)

## Utiliser les capacités présentes {#panels}

La console compte trois onglets : **Comptes**, **Coûts** et **Modèles**. **Coûts** reste masqué sans capacité OpenRouter gérée liée. Les liens vers les anciens onglets Vue d’ensemble, Utilisateurs et Finances ouvrent **Comptes** ou **Coûts**. L’attribution d’un plan dépend d’une facturation configurée ou d’une dérogation existante. Ouvrir la console ne donne pas accès à la facturation Cloud sur une instance auto-hébergée sans fournisseur commercial. Ces changements concernent l’instance entière ; vérifiez-les avec des comptes de démonstration.

## Assister un compte {#accounts}

**Comptes** affiche le nombre de comptes de l’instance. En dessous, trouvez un compte uniquement par son adresse email exacte avec **Rechercher**. Ouvrez-le pour voir l’état de confirmation de son email, consulter ou **Remettre à zéro** son budget d’usage IA, ou **Offrir un plan** dans la condition ci-dessus. L’onglet n’affiche ni activité, ni inscriptions, ni accueil, ni nombre de projets, ni contenu personnel ; n’ouvrez un compte que pour une tâche de support ou de facturation.

## Suivre les coûts de l’instance {#costs}

**Coûts** affiche ce que les fournisseurs d’IA coûtent à l’instance, en dollars, comme ils le facturent, et se met à jour tout seul tant qu’il reste ouvert. Choisissez la période dans le menu en haut et restreignez tout par famille de fonctionnalités, par modèle ou par clé utilisée (la clé de l’instance ou les clés personnelles des membres). Quatre chiffres suivent, chacun avec sa tendance et son évolution par rapport à la période précédente : dépense totale, requêtes, tokens et coût par million de tokens. Viennent ensuite les fonctionnalités et les modèles les plus coûteux, puis la dépense par jour par modèle et par famille de fonctionnalités, les requêtes par jour par modèle et les exécutions récentes, qui s’ouvrent sur leurs appels. Les revenus, abonnements et marges ne sont pas affichés : la facturation Stripe se gère dans Stripe. Les clés OpenRouter par compte qu’aucun compte n’utilise plus sont supprimées chaque nuit.

## Choisir les modèles par catégorie {#models}

Chaque carte de **Modèles** a un **Modèle par défaut** pour sa catégorie : **Assistant** (Numo, titres de conversation, recherche web), **Automatisations** (Smart Fill et ses titres, Smart Assign, décisions de relation, correspondance des imports CSV, découpage des briefs, messages de commit de fusion), **Embeddings** (embeddings des tickets et des retours) et **Retours et site public** (analyse des retours, boîte à questions de la FAQ). Une tâche suit le modèle par défaut de sa catégorie jusqu’à ce que vous lui donniez son propre modèle dans **Modèles par tâche** ; choisissez **Modèle par défaut** dans son sélecteur pour qu’elle suive à nouveau la catégorie. Tant que le modèle par défaut d’une catégorie n’est pas renseigné, chaque tâche garde sa propre valeur intégrée. **Niveau de raisonnement**, **Modèle de décision** et les deux réglages **Voix** ont leur propre ligne. Renseigner le modèle par défaut d’une catégorie libère les tâches qui portent encore leur valeur intégrée, comme celles qu’une nouvelle instance reçoit à l’installation ; une tâche réglée sur un autre modèle le garde. **Modèles conseillés** fixe la courte liste sur laquelle s’ouvre chaque sélecteur de modèle. **Clés personnelles** est replié en bas de page : il ne concerne que les membres qui utilisent leur propre clé de fournisseur.

## Exporter et importer la configuration des modèles {#models-file}

**Exporter** télécharge la configuration des modèles dans un fichier JSON versionné (format `minddy.instance-models`) : modèles par défaut des catégories, modèles des tâches, raccourcis de routage, niveau de raisonnement, modèles conseillés et valeurs par défaut des fournisseurs pour les clés personnelles. Il ne contient ni clé d’API ni compte. **Importer** lit un tel fichier et liste chaque changement avant toute écriture ; **Appliquer** les écrit tous, ou aucun quand une valeur est refusée, par exemple un modèle qui n’est pas un modèle de décision. Un import remplace la configuration : les réglages absents du fichier reviennent à leur valeur par défaut. Un fichier d’une version antérieure de minddy est mis au format actuel ; un fichier d’une version plus récente est refusé tant que l’instance n’est pas mise à jour. Les entrées inconnues de cette version sont listées et ignorées.

## Administrer l’instance avec Numo {#numo}

Dans une conversation Numo ouverte depuis une session administrateur, Numo peut lire les coûts IA de l’instance, avec les mêmes chiffres et filtres que **Coûts**, lire et modifier la configuration des modèles, prévisualiser et appliquer un import, y compris un fichier de configuration joint à la conversation, trouver un compte par son adresse email exacte, lire son plan et son budget d’usage IA, et offrir ou retirer un plan. La session administrateur est vérifiée à nouveau avant chacune de ces actions, et Numo vous fait confirmer chaque changement avant de l’effectuer. Ces outils ne renvoient ni l’activité, ni les projets, ni le contenu d’un autre compte. Les mentions @Numo, les routines et l’aide publique de la documentation n’y ont jamais accès.

## Choisir le modèle de décision IA {#decision-model}

Dans **Modèles**, section **Automatisations**, **Modèle de décision** fixe le modèle unique qui répond à toutes les décisions IA de l’instance : Smart Fill, Smart Assign et la relecture des retours. Il n’existe aucun choix par projet, par utilisateur ou par fonctionnalité. Le sélecteur ne propose que les modèles OpenRouter qui publient la capacité de décision ; les modèles de conversation, d’embedding et de transcription n’y apparaissent jamais. L’enregistrement teste le candidat par une décision représentative. Un modèle qui n’est pas un modèle de décision, refuse la requête, renvoie une réponse invalide ou dépasse 5 secondes est refusé, et le modèle actuel reste utilisé. Quand le catalogue ne peut pas être chargé, tout changement est refusé. Une instance auto-hébergée sans IA gérée n’a pas de catalogue plateforme et conserve le modèle par défaut, Jev.

Les nouvelles décisions utilisent le modèle enregistré en une minute environ sur chaque processus serveur. Quand le modèle échoue ou répond sous le seuil de confiance, la décision retombe sur le modèle LLM propre à la fonctionnalité, comme avant. Le seuil a été calibré sur Jev et les autres modèles de décision répartissent leur confiance autrement : après un changement, vérifiez l’accord par modèle dans la vue de base de données `ai_decision_evaluations_weekly`. Les lignes d’usage enregistrent le modèle qui a répondu.

**Titres Smart-fill**, dans **Modèles**, section **Automatisations**, **Modèles par tâche**, choisit le modèle qui rédige le titre d’un ticket créé sans titre, et le réécrit lors d’une réévaluation. C’est une tâche de rédaction, pas une décision : le modèle de décision n’y répond jamais. La valeur par défaut est `deepseek/deepseek-v4-flash` ; quelqu’un attend le ticket, choisissez donc un modèle rapide.

## Configurer les relations Smart Fill {#smart-fill-relations}

Après l’enregistrement d’un ticket, Smart Fill peut l’indexer et le relier aux tickets liés. Deux champs de **Modèles** encadrent ce travail :

- **Embeddings des tickets**, dans la section **Embeddings**, **Modèles par tâche**, choisit le modèle qui transforme le titre et la description des tickets en vecteurs. La valeur par défaut est `openai/text-embedding-3-small`. Le changer démarre une nouvelle version de l’index : anciens et nouveaux vecteurs ne sont jamais comparés. La tâche horaire `/api/cron/issue-index` indexe ensuite les tickets existants, 100 par exécution, en facturant le propriétaire de chaque projet ; elle ne crée jamais de relation. Le même modèle transforme chaque requête de recherche par le sens en vecteur, avec les réglages de fournisseur IA du membre qui cherche, et les requêtes ne sont comparées qu’aux vecteurs de la version actuelle de l’index. Tant qu’un ticket n’est pas réindexé, la recherche de tickets liés et la recherche par le sens ne l’atteignent que par ses mots. La même tâche convertit en vecteurs chiffrés ceux enregistrés en clair dès que leur projet est chiffré.
- **Modèle de décision des relations**, dans la section **Automatisations**, **Modèles par tâche**, est le modèle LLM de repli qui répond aux décisions de relation quand le [modèle de décision](#decision-model) échoue ou n’est pas sûr, comme le modèle LLM propre à chaque fonctionnalité. La valeur par défaut est `deepseek/deepseek-v4-flash`.

Les champs d’embedding et de transcription refusent à l’enregistrement un modèle de la mauvaise famille, par exemple un modèle de conversation dans un champ d’embeddings, et le modèle actuel reste utilisé. Cette vérification nécessite le catalogue de la plateforme : quand il ne peut pas être chargé, comme sur une instance auto-hébergée sans IA gérée, le choix ne peut pas être vérifié et il est accepté. Pour les membres qui exécutent les automatisations avec leur propre clé, les valeurs par défaut par fournisseur comprennent `issue_embedding_model` : `text-embedding-3-small` pour OpenAI et `gemini-embedding-001` pour Google.

## Conserver les responsabilités opérateur {#responsibilities}

Vous restez responsable des droits minimaux des administrateurs, de la récupération MFA, des secrets serveur, des sauvegardes, de la rétention, des incidents et des coûts des fournisseurs. La console ne remplace ni une restauration de la base et de Storage ni un test SMTP. Si l’accès est refusé, vérifiez l’adresse confirmée, la liste autorisée, la MFA vérifiée et la session active avant toute modification. Une session révoquée ou bannie ne conserve pas ses privilèges parce que son JWT n’a pas encore expiré. N’incluez aucune donnée privée d’un autre utilisateur, aucun facteur de sécurité ni détail financier dans les captures.
