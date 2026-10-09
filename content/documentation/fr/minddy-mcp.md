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
  "revision": 5,
  "sourceRevision": 5,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12); 0.11.1 candidate (89ebb59a5)",
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
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "content/documentation/reviews/mcp-access-capture-candidates.json",
      "lib/server/mcp/catalog.ts",
      "lib/server/mcp/tools.ts",
      "lib/server/mcp/page-tools.ts",
      "lib/server/mcp/auth.ts",
      "app/llms-full.txt/route.ts",
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json",
      "lib/server/app-origin.ts",
      "lib/server/oauth/issuer.ts",
      "app/api/oauth/register/route.ts",
      "lib/server/oauth/metadata.ts"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun); agent:/root (MIN-672 MCP availability and network guidance checked against route, origin, discovery, registration and local launcher source; no operational rerun)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review); agent:/root (inline-code syntax and unchanged-text review); agent:/root (MIN-672 fr network guidance and terminology review)",
    "date": "2026-10-09"
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
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-09",
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
      "alt": "Dialogue d’installation de Codex sur l’instance locale.",
      "caption": "Dialogue d’installation de Codex. Utilisez l’origine de votre instance ; la commande affichée n’a pas été exécutée pour cette capture.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        560,
        380
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

Le MCP minddy permet à un assistant externe d’utiliser les outils minddy avec les accès de votre compte. Connectez l’assistant depuis le parcours de configuration de l’instance, contrôlez ou révoquez ses accès dans les réglages du compte, puis lisez les schémas actuels des outils avant de modifier tickets, pages ou routines.

## Connecter un assistant externe au MCP minddy {#external-minddy-mcp}

Ouvrez la page publique de configuration MCP de l’instance et choisissez les instructions de votre client. Utilisez le point d’accès affiché, terminé par `/api/mcp`. En self-hosted, utilisez votre origine, pas celle du Cloud. Le client doit prendre en charge la connexion MCP distante et le parcours OAuth présenté.

Connectez-vous dans le navigateur et examinez l’autorisation avant d’accorder l’accès. La connexion agit avec votre compte minddy, sans accès aux projets qui vous sont interdits. Commencez par une lecture d’un ticket déjà accessible, puis vérifiez le projet renvoyé.

![Choix du client MCP minddy : Claude, Codex et autres assistants.](/documentation/fr/external-minddy-mcp-workflow.png)

### Disponibilité du MCP et accès réseau {#network-access}

Le MCP est inclus dans minddy auto-hébergé et démarre avec l’application. Il fonctionne directement sur `/api/mcp`, à l’origine de l’instance configurée par `MINDDY_PUBLIC_APP_URL`. La découverte OAuth et l’enregistrement dynamique des clients sont inclus : aucun serveur MCP séparé, aucune application OAuth dédiée ni aucun proxy minddy Cloud n’est nécessaire. Connectez votre client MCP au point d’accès de votre instance, puis connectez-vous et accordez l’accès dans le navigateur.

La disponibilité du service ne garantit pas son accessibilité réseau. Le client MCP et le navigateur utilisé pour l’autorisation doivent tous deux pouvoir atteindre les URL MCP et OAuth annoncées. Si vous définissez explicitement `OAUTH_ISSUER`, cette origine doit aussi être accessible. Le client doit prendre en charge la connexion, le parcours OAuth et le chemin réseau choisi ; certains clients exigent HTTPS même sur un réseau privé.

- **Même ordinateur :** `http://localhost:6463/api/mcp` fonctionne pour un client compatible exécuté sur l’ordinateur qui héberge l’instance locale. `localhost` et `127.0.0.1` désignent l’ordinateur qui établit la connexion. Le lanceur d’instance locale de l’application desktop écoute uniquement sur l’interface de boucle locale ; un autre ordinateur ou un agent hébergé dans le cloud ne peut pas y accéder directement. Ouvrir l’URL localhost du serveur sur un autre ordinateur renvoie vers cet autre ordinateur.

- **LAN ou VPN :** une instance configurée avec `http://192.168.1.50` annonce `http://192.168.1.50/api/mcp`. Un client du réseau local, ou connecté par VPN, peut l’utiliser si l’adresse d’écoute, l’origine configurée, le port de l’application, le pare-feu et le routage permettent l’accès. Le navigateur doit pouvoir atteindre les mêmes URL d’autorisation annoncées. Cela nécessite une installation serveur accessible ; changer uniquement l’URL du client n’expose pas un processus limité à la boucle locale.

- **Hors du réseau privé :** utilisez une origine HTTPS accessible, par exemple `https://tickets.example.com/api/mcp`, ou un autre chemin réseau pris en charge par le client. Un agent hébergé doit disposer de son propre accès réseau à l’instance ; le VPN de l’ordinateur du navigateur ne lui fournit pas cet accès. Héberger minddy localement ne l’expose pas automatiquement à Internet.

### Périmètre et révocation {#access}

Les clients externes utilisent les outils disponibles pour tickets, plans, commentaires, pages, retours, cycles, routines et carnet dans les limites autorisées. Le serveur MCP existe dans tous les forfaits Cloud ; l’IA du client dépend de sa configuration et de ses coûts.

La section minddy MCP des paramètres du compte liste les accès externes et leur révocation. Révoquez un client devenu inutile ou non fiable. Cette section diffère de MCP pour Numo, qui connecte Numo à d’autres services. Ne collez jamais de jetons dans les tickets, les retours publics ou les captures.

![Dialogue d’installation de Codex sur l’instance locale.](/documentation/fr/external-minddy-mcp-install-workflow.png)


## Utiliser MCP minddy et découvrir ses outils actuels {#mcp-tool-reference}

minddy expose `/api/mcp` en Streamable HTTP, avec outils stateless et OAuth 2.1. Connectez votre compte par consentement dans le navigateur ; les anciennes clés statiques `mdyk_` ne sont pas acceptées. Commencez par `minddy_list_projects` pour les UUID accessibles, puis lisez les schémas du serveur connecté. `/llms-full.txt` est généré depuis ces enregistrements et fournit les paramètres actuels exacts. Ne devinez pas les outils depuis une ancienne liste copiée. Chaque opération projet revérifie l’accès et retourne des codes stables.

### Lire avant de modifier les plans {#issue-plans}

`minddy_get_issue` accepte UUID de ticket, identifiant de ticket tel que `DEMO-42` ou numéro de ticket, avec `project_id` fourni séparément. Ses `plan_tasks` fournissent les `task_index` à partir de zéro. `minddy_update_plan_task` reçoit un lot `tasks` avec `pending`, `in_progress`, `completed` ou `cancelled`. Un index invalide refuse tout le lot. Ajoutez avec `minddy_append_to_plan` et modifiez un passage avec `minddy_edit_issue_text` et `old_string`/`new_string` exacts et uniques. Relisez si le passage est périmé ; remplacer le plan entier peut écraser la progression d’autrui. Les questions sous `## Questions` ne comptent pas comme tâches.

### Respecter versions et propriété {#pages-and-routines}

`minddy_list_pages` décrit la hiérarchie ; `minddy_search_pages` trouve des extraits et `minddy_get_page` lit Markdown complet, commentaires et valeurs de base. Préférez ajout/modification partielle et gardez les contrôles de version pour remplacement complet. Préservez exactement URLs de fichiers/images. `minddy_create_page` avec `database=true` crée une base ; `minddy_update_page_database` exige révision pour schéma, valeur précédente pour cellule et tokens aperçu/application pour conversions. Les outils de routine réservés au propriétaire créent, suspendent, déplacent ou retirent des demandes planifiées. Lisez l’existant avant de créer un doublon. `minddy_add_resource` limite les fichiers à 10 Mo ; les outils pages n’inventent pas d’URLs.

### Vérifier avec un exemple {#example}

L’exemple expurgé change l’état de la première tâche d’un plan déjà lu. Remplacez UUID projet et ticket par la découverte ; `task_index` doit venir de la dernière lecture. Vérifiez `plan_tasks` et `plan_progress` retournés. Pour un refus d’accès, contrôlez compte et autorisation projet ; pour conflit périmé, relisez puis appliquez uniquement la modification voulue. Ne répétez pas une mutation externe incertaine avant d’en vérifier le résultat.

```json
{
  "project_id": "00000000-0000-4000-8000-000000000001",
  "issue": "DEMO-42",
  "tasks": [{"task_index": 0, "state": "in_progress"}]
}
```
