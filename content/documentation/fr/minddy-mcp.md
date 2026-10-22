---
{
  "id": "minddy-mcp",
  "locale": "fr",
  "title": "MCP minddy",
  "summary": "Connectez un assistant externe à minddy, contrôlez ses accès et découvrez les outils MCP disponibles et les méthodes de modification adaptées.",
  "topic": "Numo et intégrations",
  "type": "guide",
  "audiences": [
    "integrator",
    "member"
  ],
  "workflows": [
    "N09",
    "T06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 14,
  "sourceRevision": 13,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-22",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
    "editions": [
      "Cloud",
      "self-hosted"
    ],
    "profiles": [
      "web",
      "mobile",
      "desktop",
      "full",
      "managed"
    ],
    "evidence": [
      "app/(marketing)/mcp/page.tsx",
      "app/api/mcp/route.ts",
      "lib/site.ts",
      "components/settings/mcp-connect-panel.tsx",
      "components/settings/account-connected-apps-section.tsx",
      "lib/server/mcp/catalog.ts",
      "lib/server/mcp/tools.ts",
      "lib/server/mcp/page-tools.ts",
      "lib/server/mcp/auth.ts",
      "app/llms-full.txt/route.ts",
      "lib/server/app-origin.ts",
      "lib/server/oauth/issuer.ts",
      "app/api/oauth/register/route.ts",
      "lib/server/oauth/metadata.ts",
      "lib/server/database-tool-schema.ts",
      "lib/server/page-databases.ts",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "lib/server/issue-reads.ts",
      "components/settings/account-settings-page.tsx"
    ]
  },
  "review": {
    "revision": 14,
    "fact": "agent:MIN-768 (MCP setup moved to wizards: changed passages checked against components/settings/account-mcp-clients.tsx and mcp-connect-panel.tsx; 1 screenshot recaptured on 2026-10-21 from the local candidate and inspected; earlier evidence retained in git history); agent:claude-code (MIN-762 UI label correction: quoted labels aligned on the corrected fr catalog; no behavior change, no new captures)",
    "language": "agent:MIN-768 (fr translation of the changed passages with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (fr MIN-762 label edit; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
  },
  "related": [
    "numo",
    "integration-troubleshooting"
  ],
  "aliases": [
    "external-minddy-mcp",
    "mcp-tool-reference"
  ],
  "tags": [
    "Connecter un assistant externe au MCP minddy",
    "Utiliser MCP minddy et découvrir ses outils actuels"
  ],
  "figures": [
    {
      "id": "external-minddy-mcp-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/external-minddy-mcp-workflow.png",
      "alt": "Choix du client MCP minddy : Claude, Codex et autres assistants.",
      "caption": "Choisissez votre client pour afficher sa commande ou sa configuration d’installation.",
      "revision": 14,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        816,
        252
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "external-minddy-mcp-install-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/external-minddy-mcp-install-workflow.png",
      "alt": "Étape d’installation de Codex dans l’assistant de connexion au MCP de minddy, avec le point d’accès de minddy Cloud.",
      "caption": "Cet exemple se connecte à minddy Cloud. Pour l’auto-hébergement, utilisez l’origine de votre instance ; la commande affichée n’a pas été exécutée pour cette capture.",
      "revision": 14,
      "reviewed": true,
      "capturedAt": "2026-10-21",
      "viewport": [
        560,
        308
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "external-minddy-mcp-workflow",
    "external-minddy-mcp-install-workflow"
  ]
}
---

Le MCP minddy permet à un assistant externe d’utiliser les outils minddy avec les accès de votre compte. Connectez l’assistant depuis le parcours de configuration de l’instance, contrôlez ou révoquez ses accès dans les paramètres du compte, puis lisez les schémas actuels des outils avant de modifier tickets, pages ou routines.

## Connecter un assistant externe au MCP minddy {#external-minddy-mcp}

Ouvrez la page publique de configuration MCP de l’instance et choisissez les instructions de votre client. Utilisez le point d’accès affiché, terminé par `/api/mcp`. En self-hosted, utilisez votre origine, pas celle du Cloud. Le client doit prendre en charge la connexion MCP distante et le parcours OAuth présenté.

Connectez-vous dans le navigateur et examinez l’autorisation avant d’accorder l’accès. La connexion agit avec votre compte minddy, sans accès aux projets qui vous sont interdits. Commencez par une lecture d’un ticket déjà accessible, puis vérifiez le projet renvoyé.

Dans les paramètres du compte, la section MCP de minddy ouvre un assistant en deux étapes pour chaque client : copiez la commande d’installation, la configuration ou l’URL du serveur, puis autorisez la connexion du client. La seconde étape indique quand minddy reçoit cet accès ; d’ici là, la fermer ne fait que reporter la connexion.

![Choix du client MCP minddy : Claude, Codex et autres assistants.](/documentation/fr/external-minddy-mcp-workflow.png)

### Disponibilité du MCP et accès réseau {#network-access}

Le MCP est inclus dans minddy auto-hébergé et démarre avec l’application. Il fonctionne directement sur `/api/mcp`, à l’origine de l’instance configurée par `MINDDY_PUBLIC_APP_URL`. La découverte OAuth et l’enregistrement dynamique des clients sont inclus : aucun serveur MCP séparé, aucune application OAuth dédiée ni aucun proxy minddy Cloud n’est nécessaire. Connectez votre client MCP au point d’accès de votre instance, puis connectez-vous et accordez l’accès dans le navigateur.

La disponibilité du service ne garantit pas son accessibilité réseau. Le client MCP et le navigateur utilisé pour l’autorisation doivent tous deux pouvoir atteindre les URL MCP et OAuth annoncées. Si vous définissez explicitement `OAUTH_ISSUER`, cette origine doit aussi être accessible. Le client doit prendre en charge la connexion, le parcours OAuth et le chemin réseau choisi ; certains clients exigent HTTPS même sur un réseau privé.

- **Même ordinateur :** `http://localhost:6463/api/mcp` fonctionne pour un client compatible exécuté sur l’ordinateur qui héberge l’instance locale. `localhost` et `127.0.0.1` désignent l’ordinateur qui établit la connexion. Le lanceur d’instance locale de l’application desktop écoute uniquement sur l’interface de boucle locale ; un autre ordinateur ou un agent hébergé dans le cloud ne peut pas y accéder directement. Ouvrir l’URL localhost du serveur sur un autre ordinateur renvoie vers cet autre ordinateur.

- **LAN ou VPN :** une instance configurée avec `http://192.168.1.50` annonce `http://192.168.1.50/api/mcp`. Un client du réseau local, ou connecté par VPN, peut l’utiliser si l’adresse d’écoute, l’origine configurée, le port de l’application, le pare-feu et le routage permettent l’accès. Le navigateur doit pouvoir atteindre les mêmes URL d’autorisation annoncées. Cela nécessite une installation serveur accessible ; changer uniquement l’URL du client n’expose pas un processus limité à la boucle locale.

- **Hors du réseau privé :** utilisez une origine HTTPS accessible, par exemple `https://tickets.example.com/api/mcp`, ou un autre chemin réseau pris en charge par le client. Un agent hébergé doit disposer de son propre accès réseau à l’instance ; le VPN de l’ordinateur du navigateur ne lui fournit pas cet accès. Héberger minddy localement ne l’expose pas automatiquement à Internet.

### Périmètre et révocation {#access}

Les clients externes utilisent les outils disponibles pour tickets, plans, commentaires, pages, retours, cycles, routines et carnet dans les limites autorisées. Les outils appliquent votre rôle actuel dans chaque projet à chaque appel : un changement de rôle s’applique donc sans reconnexion. En tant que lecteur, vous disposez des outils de lecture, ainsi que des outils de commentaire lorsque le propriétaire a activé **Peut commenter** pour vous. Le serveur MCP existe dans tous les forfaits Cloud ; l’IA du client dépend de sa configuration et de ses coûts.

La section minddy MCP des paramètres du compte liste les accès externes et leur révocation. Révoquez un client devenu inutile ou non fiable. Cette section diffère de la carte **MCP pour Numo** de l’onglet **IA et Numo**, qui connecte Numo à d’autres services. Ne collez jamais de jetons dans les tickets, les retours publics ou les captures.

![Étape d’installation de Codex dans l’assistant de connexion au MCP de minddy, avec le point d’accès de minddy Cloud.](/documentation/fr/external-minddy-mcp-install-workflow.png)


## Utiliser MCP minddy et découvrir ses outils actuels {#mcp-tool-reference}

minddy expose `/api/mcp` en Streamable HTTP, avec outils stateless et OAuth 2.1. Connectez votre compte par consentement dans le navigateur ; les anciennes clés statiques `mdyk_` ne sont pas acceptées. Commencez par `minddy_list_projects` pour les UUID accessibles, puis lisez les schémas du serveur connecté. `/llms-full.txt` est généré depuis ces enregistrements et fournit les paramètres actuels exacts. Ne devinez pas les outils depuis une ancienne liste copiée. Chaque opération projet revérifie l’accès et retourne des codes stables.

### Lire avant de modifier les plans {#issue-plans}

Pour trouver un ticket, appelez `minddy_list_issues` avec `query` : la recherche porte sur les mots du titre et de la description, un identifiant ou un numéro. Les correspondances textuelles et les identifiants exacts passent en premier ; une requête descriptive peut ensuite ajouter des tickets du même projet trouvés [par le sens](/docs/navigation#search-by-meaning), marqués `match: "semantic"`. Lisez un tel ticket avant d’agir dessus. La recherche par le sens est facturée à votre compte sous **Recherche de tickets** et n’a pas lieu si vous avez désactivé **Indexer les tickets**.

`minddy_get_issue` accepte UUID de ticket, identifiant de ticket tel que `DEMO-42` ou numéro de ticket, avec `project_id` fourni séparément. Ses `plan_tasks` fournissent les `task_index` à partir de zéro. `minddy_update_plan_task` reçoit un lot `tasks` avec `pending`, `in_progress`, `completed` ou `cancelled`. Un index invalide refuse tout le lot. Ajoutez avec `minddy_append_to_plan` et modifiez un passage avec `minddy_edit_issue_text` et `old_string`/`new_string` exacts et uniques. Relisez si le passage est périmé ; remplacer le plan entier peut écraser la progression d’autrui. Les questions sous `## Questions` ne comptent pas comme tâches.

Les lectures qui renvoient du texte avec des images (`minddy_get_issue`, `minddy_get_objective`, `minddy_get_page`, `minddy_get_feedback`, `minddy_get_scratchpad`) les listent sous `images`, chacune avec son `src` et son texte alternatif. Passez ce `src` tel quel à `minddy_get_image` : l’outil vérifie votre accès au projet de l’image, ou qu’une image du carnet est bien la vôtre, et renvoie l’image jusqu’à 10 Mo avec une `download_url` signée valable environ dix minutes. Une image hébergée hors de minddy revient sous la forme de son URL seulement.

### Respecter versions et propriété {#pages-and-routines}

`minddy_list_pages` décrit la hiérarchie ; `minddy_search_pages` trouve des extraits et `minddy_get_page` lit le Markdown complet, les commentaires et les valeurs des bases de données. Préférez les outils d’ajout ou de modification pour les changements partiels et fournissez la version actuelle pour un remplacement complet. Préservez exactement les URL des fichiers et des images. `minddy_create_page` avec `database=true` crée une base ; `minddy_update_page_database` exige la révision de la base pour modifier le schéma et la valeur précédente pour modifier une cellule.

Pour convertir un type, utilisez `operation=convert` avec `propertyId`, `targetType`, `revision` et `preview=true`. Examinez `incompatibleCount`, puis renvoyez les mêmes paramètres avec `preview=false` et le `token` retourné. Définissez `confirmLoss=true` uniquement après autorisation explicite de l’utilisateur d’effacer les valeurs incompatibles.

Les outils de routine réservés au propriétaire permettent de créer, modifier, suspendre ou supprimer des routines déclenchées par une planification, un événement ou une nouvelle entrée de base de données. Lisez les routines existantes avant d’en créer une pour éviter les doublons. `minddy_add_resource` limite les fichiers à 10 Mo ; les outils de pages ne créent pas d’URL de fichiers fictives.

### Vérifier avec un exemple {#example}

L’exemple expurgé change l’état de la première tâche d’un plan déjà lu. Remplacez UUID projet et ticket par la découverte ; `task_index` doit venir de la dernière lecture. Vérifiez `plan_tasks` et `plan_progress` retournés. Pour un refus d’accès, contrôlez compte et autorisation projet ; pour conflit périmé, relisez puis appliquez uniquement la modification voulue. Ne répétez pas une mutation externe incertaine avant d’en vérifier le résultat.

```json
{
  "project_id": "00000000-0000-4000-8000-000000000001",
  "issue": "DEMO-42",
  "tasks": [{"task_index": 0, "state": "in_progress"}]
}
```


## Choisir un objectif pour un retour {#feedback-objectives}

Les lectures des retours incluent `objective_id` ; `minddy_list_feedback` accepte un filtre facultatif sur l’objectif (`null` sélectionne les demandes sans objectif). Utilisez `minddy_link_feedback_objective` avec `project_id`, `feedback_post_id` et `objective_id` uniquement lorsque l’utilisateur demande explicitement ce lien ; `null` le retire. L’objectif doit être actif et appartenir au même projet. Le détail d’un objectif inclut `linked_feedback`. Le propriétaire peut fournir `objective_id` à `minddy_create_integration` pour une clé de retours, ou modifier le réglage avec `minddy_update_integration_objective`. Les retours existants gardent leur choix. La conversion reprend l’objectif et les catégories ; la revue Numo n’assigne jamais d’objectif.
