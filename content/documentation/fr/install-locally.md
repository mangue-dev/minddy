---
{
  "id": "install-locally",
  "locale": "fr",
  "title": "Instances locales",
  "summary": "Utilisez un clone dédié à l’évaluation avec Node.js 24, pnpm 10.28.0, Git, la CLI Supabase et un daemon Docker actif.",
  "topic": "Exploiter une instance",
  "type": "tutorial",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H02"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 5,
  "sourceRevision": 5,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
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
      "docs/self-hosting.md",
      "scripts/self-hosting-local.mjs",
      "content/knowledge/self-hosting.md",
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json",
      "content/documentation/reviews/editorial-clarity-en-fr-2026-10-09.md",
      "content/documentation/reviews/editorial-clarity-de-es-2026-10-09.md",
      "content/documentation/reviews/editorial-clarity-it-pt-BR-2026-10-09.md",
      "app/api/mcp/route.ts",
      "lib/site.ts",
      "lib/server/app-origin.ts",
      "lib/server/oauth/issuer.ts",
      "app/api/oauth/register/route.ts",
      "lib/server/oauth/metadata.ts",
      "content/documentation/reviews/premerge-it-pt-BR-2026-10-10.md",
      "content/documentation/reviews/premerge-light-review-2026-10-10.md"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun); agent:/root (MIN-672 MCP availability and network guidance checked against route, origin, discovery, registration and local launcher source; no operational rerun)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review); agent:/root/editorial_en_fr (collection-caption clarity); agent:/root (inline-code syntax and unchanged-text review); agent:/root (MIN-672 fr network guidance and terminology review)",
    "date": "2026-10-09"
  },
  "related": [
    "workspace-encryption",
    "self-hosted-diagnostics"
  ],
  "aliases": [],
  "tags": [
    "Lancer une instance locale depuis l’application desktop"
  ],
  "figures": [
    {
      "id": "install-locally-flow",
      "kind": "diagram",
      "src": "/documentation/fr/install-locally-flow.svg",
      "alt": "Schéma: L’app desktop sélectionne le clone. Application locale : port 6463. Supabase minimal et données durables. Quitter arrête app et backend.",
      "caption": "L’application desktop gère le démarrage et l’arrêt des services locaux, tout en conservant leurs données.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "collection",
        "items": [
          {
            "title": "L’app desktop sélectionne le clone"
          },
          {
            "title": "Application locale : port 6463"
          },
          {
            "title": "Supabase minimal et données durables"
          },
          {
            "title": "Quitter arrête app et backend"
          }
        ]
      }
    },
    {
      "id": "install-locally-wizard",
      "kind": "screenshot",
      "src": "/documentation/fr/install-locally-wizard.png",
      "alt": "Assistant public d’installation avec le profil sur cet ordinateur sélectionné.",
      "caption": "Choisissez l’installation personnelle lorsque l’application de bureau doit gérer les services locaux.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        944,
        557
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "install-locally-flow"
  ]
}
---

## Lancer une instance locale depuis l’application desktop {#install-locally}

Utilisez un clone dédié à l’évaluation avec Node.js 24, `pnpm` 10.28.0, Git, la CLI Supabase et un daemon Docker actif. Prévoyez au moins 4 Go de RAM libre, deux cœurs CPU et 10 Go de SSD libre ; 8 Go, quatre cœurs et 20 Go sont recommandés. Installez d’abord l’application desktop signée depuis la page de téléchargement. Windows passe par Microsoft Store ; macOS et Linux disposent de leurs téléchargements. Positionnez le clone sur la version à évaluer avant d’installer ses dépendances.

```bash
git clone https://github.com/mangue-dev/minddy.git
cd minddy
git checkout v0.11.0
corepack enable
corepack prepare pnpm@10.28.0 --activate
pnpm install --frozen-lockfile
```


![Schéma: L’app desktop sélectionne le clone. Application locale : port 6463. Supabase minimal et données durables. Quitter arrête app et backend.](/documentation/fr/install-locally-flow.svg)


![Assistant public d’installation avec le profil sur cet ordinateur sélectionné.](/documentation/fr/install-locally-wizard.png)

## Confier les services locaux à l’application {#launch}

Ouvrez le menu natif minddy. Sous Windows et Linux, appuyez sur Alt pour afficher la barre de menus ; macOS utilise la barre globale. Ouvrez le dialogue de connexion à un serveur, choisissez son option d’instance locale et sélectionnez la racine du clone. L’application lance `self-host:local --no-open`, prépare Supabase minimal, applique les migrations et la configuration Storage, construit l’application si nécessaire et attend `/api/health` avant d’ouvrir l’inscription. Elle écoute uniquement sur la boucle locale, au port 6463, mémorise le dossier et gère le démarrage comme l’arrêt.

## Disponibilité du MCP et accès réseau {#mcp-network-access}

Le MCP est inclus dans minddy auto-hébergé et démarre avec l’application. Il fonctionne directement sur `/api/mcp`, à l’origine de l’instance configurée par `MINDDY_PUBLIC_APP_URL`. La découverte OAuth et l’enregistrement dynamique des clients sont inclus : aucun serveur MCP séparé, aucune application OAuth dédiée ni aucun proxy minddy Cloud n’est nécessaire. Connectez votre client MCP au point d’accès de votre instance, puis connectez-vous et accordez l’accès dans le navigateur.

La disponibilité du service ne garantit pas son accessibilité réseau. Le client MCP et le navigateur utilisé pour l’autorisation doivent tous deux pouvoir atteindre les URL MCP et OAuth annoncées. Si vous définissez explicitement `OAUTH_ISSUER`, cette origine doit aussi être accessible. Le client doit prendre en charge la connexion, le parcours OAuth et le chemin réseau choisi ; certains clients exigent HTTPS même sur un réseau privé.

Ce profil géré par l’application desktop écoute uniquement sur l’interface de boucle locale. Un client MCP compatible sur le même ordinateur peut utiliser `http://localhost:6463/api/mcp` ; `localhost` et `127.0.0.1` désignent l’ordinateur qui établit la connexion. Un autre ordinateur ou un agent hébergé dans le cloud ne peut pas accéder directement à ce profil. Pour un accès LAN/VPN, utilisez une installation serveur avec une origine configurée accessible, par exemple `http://192.168.1.50`, et autorisez son port d’application au niveau de l’adresse d’écoute, du pare-feu et du routage. Hors de ce réseau, le client doit disposer d’une origine HTTPS accessible comme `https://tickets.example.com`, ou d’un autre chemin réseau pris en charge. Une installation locale ne fournit pas automatiquement un accès depuis Internet.

[Consultez les explications sur l’accès réseau au MCP avant de connecter un client distant](/docs/minddy-mcp#network-access).

## Résoudre un échec de démarrage {#recover}

Fermer une fenêtre laisse l’application desktop active ; utilisez la commande Quitter de l’application pour l’arrêter avec les services locaux. Si le démarrage échoue, copiez le rapport de diagnostic depuis le menu natif d’aide. Vérifiez Docker, la CLI, l’espace libre et un éventuel autre processus sur le port 6463. `pnpm self-host:local` est une solution de diagnostic en terminal. Arrêtez-la avec Ctrl+C avant de rendre la main à l’application, qui refuse de prendre le contrôle d’un autre processus. Quitter l’application arrête normalement Supabase aussi ; `--keep-backend` modifie explicitement ce comportement. N’utilisez jamais `supabase db reset --local` pour récupérer des données : cette commande détruit les données d’évaluation. Vérifiez compte, projet, ticket et pièce jointe avant de vous fier à l’instance.
