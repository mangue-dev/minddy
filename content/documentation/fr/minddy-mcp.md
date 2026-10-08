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
  "revision": 2,
  "sourceRevision": 2,
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
      "app/llms-full.txt/route.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review)",
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
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "external-minddy-mcp-install-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/external-minddy-mcp-install-workflow.png",
      "alt": "Dialogue d’installation de Codex sur l’instance locale.",
      "caption": "Dialogue d’installation de Codex sur l’instance locale. Utilisez l’origine de votre instance ; la commande affichée n’a pas été exécutée pour cette capture.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "external-minddy-mcp-accesses-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/external-minddy-mcp-accesses-workflow.png",
      "alt": "Liste des applications connectées sans autorisation active.",
      "caption": "Consultez ici les applications autorisées. Le compte de démonstration ne possède aucune autorisation active ; aucune autorisation ni révocation n’a été exécutée.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "external-minddy-mcp-workflow",
    "external-minddy-mcp-install-workflow",
    "external-minddy-mcp-accesses-workflow"
  ]
}
---

Le MCP minddy permet à un assistant externe d’utiliser les outils minddy avec les accès de votre compte. Connectez l’assistant depuis le parcours de configuration de l’instance, contrôlez ou révoquez ses accès dans les réglages du compte, puis lisez les schémas actuels des outils avant de modifier tickets, pages ou routines.

## Connecter un assistant externe au MCP minddy {#external-minddy-mcp}

Ouvrez la page publique de configuration MCP de l’instance et choisissez les instructions de votre client. Utilisez le point d’accès affiché, terminé par `/api/mcp`. En self-hosted, utilisez votre origine, pas celle du Cloud. Le client doit prendre en charge la connexion MCP distante et le parcours OAuth présenté.

Connectez-vous dans le navigateur et examinez l’autorisation avant d’accorder l’accès. La connexion agit avec votre compte minddy, sans accès aux projets qui vous sont interdits. Commencez par une lecture d’un ticket déjà accessible, puis vérifiez le projet renvoyé.

![Choix du client MCP minddy : Claude, Codex et autres assistants.](/documentation/fr/external-minddy-mcp-workflow.png)

### Périmètre et révocation {#access}

Les clients externes utilisent les outils disponibles pour tickets, plans, commentaires, pages, retours, cycles, routines et carnet dans les limites autorisées. Le serveur MCP existe dans tous les forfaits Cloud ; l’IA du client dépend de sa configuration et de ses coûts.

La section minddy MCP des paramètres du compte liste les accès externes et leur révocation. Révoquez un client devenu inutile ou non fiable. Cette section diffère de MCP pour Numo, qui connecte Numo à d’autres services. Ne collez jamais de jetons dans les tickets, les retours publics ou les captures.

![Dialogue d’installation de Codex sur l’instance locale.](/documentation/fr/external-minddy-mcp-install-workflow.png)

![Liste des applications connectées sans autorisation active.](/documentation/fr/external-minddy-mcp-accesses-workflow.png)

## Utiliser MCP minddy et découvrir ses outils actuels {#mcp-tool-reference}

minddy expose /api/mcp en Streamable HTTP, avec outils stateless et OAuth 2.1. Connectez votre compte par consentement dans le navigateur ; les anciennes clés statiques mdyk_ ne sont pas acceptées. Commencez par minddy_list_projects pour les UUID accessibles, puis lisez les schémas du serveur connecté. /llms-full.txt est généré depuis ces enregistrements et fournit les paramètres actuels exacts. Ne devinez pas les outils depuis une ancienne liste copiée. Chaque opération projet revérifie l’accès et retourne des codes stables.

### Lire avant de modifier les plans {#issue-plans}

minddy_get_issue accepte UUID de ticket, identifiant de ticket tel que DEMO-42 ou numéro de ticket, avec project_id fourni séparément. Ses plan_tasks fournissent les task_index à partir de zéro. minddy_update_plan_task reçoit un lot tasks avec pending, in_progress, completed ou cancelled. Un index invalide refuse tout le lot. Ajoutez avec minddy_append_to_plan et modifiez un passage avec minddy_edit_issue_text et old_string/new_string exacts et uniques. Relisez si le passage est périmé ; remplacer le plan entier peut écraser la progression d’autrui. Les questions sous ## Questions ne comptent pas comme tâches.

### Respecter versions et propriété {#pages-and-routines}

minddy_list_pages décrit la hiérarchie ; minddy_search_pages trouve des extraits et minddy_get_page lit Markdown complet, commentaires et valeurs de base. Préférez ajout/modification partielle et gardez les contrôles de version pour remplacement complet. Préservez exactement URLs de fichiers/images. minddy_create_page avec database=true crée une base ; minddy_update_page_database exige révision pour schéma, valeur précédente pour cellule et tokens aperçu/application pour conversions. Les outils de routine réservés au propriétaire créent, suspendent, déplacent ou retirent des demandes planifiées. Lisez l’existant avant de créer un doublon. minddy_add_resource limite les fichiers à 10 Mo ; les outils pages n’inventent pas d’URLs.

### Vérifier avec un exemple {#example}

L’exemple expurgé change l’état de la première tâche d’un plan déjà lu. Remplacez UUID projet et ticket par la découverte ; task_index doit venir de la dernière lecture. Vérifiez plan_tasks et plan_progress retournés. Pour un refus d’accès, contrôlez compte et autorisation projet ; pour conflit périmé, relisez puis appliquez uniquement la modification voulue. Ne répétez pas une mutation externe incertaine avant d’en vérifier le résultat.

```json
{
  "project_id": "00000000-0000-4000-8000-000000000001",
  "issue": "DEMO-42",
  "tasks": [{"task_index": 0, "state": "in_progress"}]
}
```
