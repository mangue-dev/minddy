---
{
  "id": "external-minddy-mcp",
  "locale": "fr",
  "title": "Connecter un assistant externe au MCP Minddy",
  "summary": "Autoriser un client compatible sur la bonne instance et révoquer son accès si nécessaire.",
  "topic": "Numo et intégrations",
  "type": "guide",
  "audiences": [
    "integrator",
    "member"
  ],
  "workflows": [
    "N09"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12)",
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
      "app/(marketing)/mcp/page.tsx",
      "app/api/mcp/route.ts",
      "lib/site.ts",
      "components/settings/mcp-connect-panel.tsx",
      "components/settings/account-connected-apps-section.tsx",
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "content/documentation/reviews/mcp-access-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "external-minddy-mcp-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/external-minddy-mcp-workflow.png",
      "alt": "Choix du client MCP Minddy : Claude, Codex et autres assistants.",
      "caption": "Choisissez votre client pour afficher sa commande ou sa configuration d’installation.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
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
      "revision": 1,
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
      "revision": 1,
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

## Configurer le client {#external-minddy-mcp}
Ouvrez la page publique de configuration MCP de l’instance et choisissez les instructions de votre client. Utilisez le point d’accès affiché, terminé par `/api/mcp`. En self-hosted, utilisez votre origine, pas celle du Cloud. Le client doit prendre en charge la connexion MCP distante et le parcours OAuth présenté.

Connectez-vous dans le navigateur et examinez l’autorisation avant d’accorder l’accès. La connexion agit avec votre compte Minddy, sans accès aux projets qui vous sont interdits. Commencez par une lecture d’un ticket déjà accessible, puis vérifiez le projet renvoyé.

![Choix du client MCP Minddy : Claude, Codex et autres assistants.](/documentation/fr/external-minddy-mcp-workflow.png)


## Périmètre et révocation {#access}
Les clients externes utilisent les outils disponibles pour tickets, plans, commentaires, pages, retours, cycles, routines et carnet dans les limites autorisées. Le serveur MCP existe dans tous les forfaits Cloud ; l’IA du client dépend de sa configuration et de ses coûts.

La section Minddy MCP des paramètres du compte liste les accès externes et leur révocation. Révoquez un client devenu inutile ou non fiable. Cette section diffère de MCP pour Numo, qui connecte Numo à d’autres services. Ne collez jamais de jetons dans les tickets, les retours publics ou les captures.

![Dialogue d’installation de Codex sur l’instance locale.](/documentation/fr/external-minddy-mcp-install-workflow.png)

![Liste des applications connectées sans autorisation active.](/documentation/fr/external-minddy-mcp-accesses-workflow.png)
