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
  "revision": 8,
  "sourceRevision": 8,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-19",
  "compatibility": {
    "version": "0.11.1 candidate with the global decision model (MIN-694); MIN-717 Smart Fill relations; MIN-718 hybrid issue search; MIN-733 always-on AI features",
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
      "lib/server/issue-semantic-search.ts"
    ]
  },
  "review": {
    "revision": 8,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun); agent:/root (MIN-694 decision model selector, save validation and fallback source and test review; existing figures unchanged); agent:/root (MIN-717 Smart Fill relations source review inherited from en revision 6; fr translation of added passages; no browser walkthrough); agent:/root (MIN-718 hybrid issue search source and unit-test review; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-733 removal of the instance AI switches: source and unit-test review of the admin registry and every former switch reader; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-733 instance-administration-models recaptured on 2026-10-19 in this locale from the local candidate with the Camille Roy demo account, temporarily granted admin and MFA; read-only, no setting changed; image inspected; see reviews/min-733-admin-models-capture-2026-10-19.json)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review); agent:/root/editorial_en_fr (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (inline-code syntax and unchanged-text review); agent:/root (MIN-694 six-locale decision model section meaning review; agent review, not human acceptance); agent:/root (fr translation of MIN-717 added passages with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root (fr translation of MIN-718 added passages with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root (fr removal of the sentences describing instance AI switches; retained-meaning self-review; agent review, not human acceptance)",
    "date": "2026-10-19"
  },
  "related": [
    "authentication-and-email",
    "instance-configuration"
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
      "alt": "Vue d’ensemble administrateur avec indicateurs agrégés des comptes, de l’accueil et du contenu.",
      "caption": "Vue d’ensemble affiche les indicateurs agrégés de l’instance. Finances est absent sur ce profil de démonstration, car aucune clé OpenRouter gérée n’est configurée.",
      "revision": 8,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1488,
        1148
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "instance-administration-models",
      "kind": "screenshot",
      "src": "/documentation/fr/instance-administration-models.png",
      "alt": "Réglages des modèles IA et du raisonnement de l’instance.",
      "caption": "Modèles règle les valeurs par défaut et les usages dédiés. La capture montre la configuration existante ; aucun réglage de modèle ou de fournisseur n’a été modifié.",
      "revision": 8,
      "reviewed": true,
      "capturedAt": "2026-10-19",
      "viewport": [
        1488,
        1148
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "instance-administration-flow"
  ]
}
---

## Utiliser la console d’administration de l’instance {#instance-administration}

L’administration de l’instance est distincte de la propriété d’un projet. Définissez `ADMIN_EMAILS` dans l’environnement serveur avec les adresses confirmées des comptes autorisés. Le rôle `app_metadata.role=admin` signé côté serveur est aussi accepté. Une session administrateur exige `aal2`, une MFA inscrite et vérifiée, ainsi que les contrôles courants du compte et de la session. L’accès est refusé si ces contrôles échouent. Connectez-vous, validez le code TOTP et ouvrez `/admin`. Ne modifiez pas les rôles de la base pour contourner l’inscription MFA. La console et ses API privées restent `noindex`.


![Vue d’ensemble administrateur avec indicateurs agrégés des comptes, de l’accueil et du contenu.](/documentation/fr/instance-administration-overview.png)

![Réglages des modèles IA et du raisonnement de l’instance.](/documentation/fr/instance-administration-models.png)

## Utiliser les capacités présentes {#panels}

La console regroupe Vue d'ensemble, Utilisateurs, Modèles et, selon la configuration, Finances. Finances reste masqué sans capacité OpenRouter gérée liée. L’attribution d’un forfait dépend d’une facturation configurée ou d’une dérogation existante. Ouvrir la console ne donne pas accès à la facturation Cloud sur une instance auto-hébergée sans fournisseur commercial. Examinez les modèles, leurs valeurs par défaut et les commandes de gestion des utilisateurs et quotas sur la version déployée avant de les modifier. Ces changements concernent l’instance entière ; vérifiez-les avec des comptes de démonstration.

## Choisir le modèle de décision IA {#decision-model}

Dans **Modèles**, section **Automatisations**, **Modèle de décision** fixe le modèle unique qui répond à toutes les décisions IA de l’instance : Smart Fill, Smart Assign et la relecture des retours. Il n’existe aucun choix par projet, par utilisateur ou par fonctionnalité. Le sélecteur ne propose que les modèles OpenRouter qui publient la capacité de décision ; les modèles de conversation, d’embedding et de transcription n’y apparaissent jamais. L’enregistrement teste le candidat par une décision représentative. Un modèle qui n’est pas un modèle de décision, refuse la requête, renvoie une réponse invalide ou dépasse 5 secondes est refusé, et le modèle actuel reste utilisé. Quand le catalogue ne peut pas être chargé, tout changement est refusé. Une instance auto-hébergée sans IA gérée n’a pas de catalogue plateforme et conserve le modèle par défaut, Jev.

Les nouvelles décisions utilisent le modèle enregistré en une minute environ sur chaque processus serveur. Quand le modèle échoue ou répond sous le seuil de confiance, la décision retombe sur le modèle LLM propre à la fonctionnalité, comme avant. Le seuil a été calibré sur Jev et les autres modèles de décision répartissent leur confiance autrement : après un changement, vérifiez l’accord par modèle dans la vue de base de données `ai_decision_evaluations_weekly`. Les lignes d’usage enregistrent le modèle qui a répondu.

## Configurer les relations Smart Fill {#smart-fill-relations}

Après l’enregistrement d’un ticket, Smart Fill peut l’indexer et le relier aux tickets liés. Deux champs de **Modèles**, section **Automatisations**, encadrent ce travail :

- **Embeddings des tickets** choisit le modèle qui transforme le titre et la description des tickets en vecteurs. La valeur par défaut est `openai/text-embedding-3-small`. Le changer démarre une nouvelle version de l’index : anciens et nouveaux vecteurs ne sont jamais comparés. La tâche horaire `/api/cron/issue-index` indexe ensuite les tickets existants, 100 par exécution, en facturant le propriétaire de chaque projet ; elle ne crée jamais de relation. Le même modèle transforme chaque requête de recherche par le sens en vecteur, avec les réglages de fournisseur IA du membre qui cherche, et les requêtes ne sont comparées qu’aux vecteurs de la version actuelle de l’index. Tant qu’un ticket n’est pas réindexé, la recherche de tickets liés et la recherche par le sens ne l’atteignent que par ses mots. La même tâche convertit en vecteurs chiffrés ceux enregistrés en clair dès que leur projet est chiffré.
- **Modèle de décision des relations** est le modèle LLM de repli qui répond aux décisions de relation quand le [modèle de décision](#decision-model) échoue ou n’est pas sûr, comme le modèle LLM propre à chaque fonctionnalité. La valeur par défaut est `deepseek/deepseek-v4-flash`.

Les champs d’embedding et de transcription refusent à l’enregistrement un modèle de la mauvaise famille, par exemple un modèle de conversation dans un champ d’embeddings, et le modèle actuel reste utilisé. Cette vérification nécessite le catalogue de la plateforme : quand il ne peut pas être chargé, comme sur une instance auto-hébergée sans IA gérée, le choix ne peut pas être vérifié et il est accepté. Pour les membres qui exécutent les automatisations avec leur propre clé, les valeurs par défaut par fournisseur comprennent `issue_embedding_model` : `text-embedding-3-small` pour OpenAI et `gemini-embedding-001` pour Google.

## Conserver les responsabilités opérateur {#responsibilities}

Vous restez responsable des droits minimaux des administrateurs, de la récupération MFA, des secrets serveur, des sauvegardes, de la rétention, des incidents et des coûts des fournisseurs. La console ne remplace ni une restauration de la base et de Storage ni un test SMTP. Si l’accès est refusé, vérifiez l’adresse confirmée, la liste autorisée, la MFA vérifiée et la session active avant toute modification. Une session révoquée ou bannie ne conserve pas ses privilèges parce que son JWT n’a pas encore expiré. N’incluez aucune donnée privée d’un autre utilisateur, aucun facteur de sécurité ni détail financier dans les captures.
