---
{
  "id": "install-locally",
  "locale": "fr",
  "title": "Instances locales",
  "summary": "Utilisez un clone dédié à l’évaluation avec Node.js 24.22.1 ou une version 24.x ultérieure, pnpm 10.28.0, Git, la CLI Supabase et un daemon Docker actif.",
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
  "revision": 9,
  "sourceRevision": 9,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-23",
  "compatibility": {
    "version": "0.20.1 (release documentation gate)",
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
      "app/api/mcp/route.ts",
      "lib/site.ts",
      "lib/server/app-origin.ts",
      "lib/server/oauth/issuer.ts",
      "app/api/oauth/register/route.ts",
      "lib/server/oauth/metadata.ts"
    ]
  },
  "review": {
    "revision": 9,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 1 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted); agent:claude-code (0.20.1 release documentation gate: Node.js minimum aligned with README and docs/self-hosting.md after MIN-780; release delta v0.20.0..main audited against the manual; no screenshot in scope)",
    "language": "agent:/root/min747 (fr translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (fr manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance); agent:claude-code (fr Node.js minimum; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-23"
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
      "revision": 9,
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
      "revision": 9,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        944,
        745
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

Utilisez un clone dédié à l’évaluation avec Node.js 24.22.1 ou une version 24.x ultérieure, `pnpm` 10.28.0, Git, la CLI Supabase et un daemon Docker actif. Prévoyez au moins 4 Go de RAM libre, deux cœurs CPU et 10 Go de SSD libre ; 8 Go, quatre cœurs et 20 Go sont recommandés. Installez d’abord l’application desktop signée depuis la page de téléchargement. Windows passe par Microsoft Store ; macOS et Linux disposent de leurs téléchargements. Positionnez le clone sur la version à évaluer avant d’installer ses dépendances.

```bash
git clone https://github.com/mangue-dev/minddy.git
cd minddy
git checkout v0.20.0
corepack enable
corepack prepare pnpm@10.28.0 --activate
pnpm install --frozen-lockfile
```


![Schéma: L’app desktop sélectionne le clone. Application locale : port 6463. Supabase minimal et données durables. Quitter arrête app et backend.](/documentation/fr/install-locally-flow.svg)


![Assistant public d’installation avec le profil sur cet ordinateur sélectionné.](/documentation/fr/install-locally-wizard.png)

Les nouvelles installations locales chiffrent le contenu de l’espace de travail par défaut. Pour enregistrer un choix explicite, lancez `pnpm bootstrap:supabase -- --minimal --app-url http://localhost:6463 --encryption enabled` (ou `--encryption disabled`) dans le clone avant de l’ouvrir dans l’application ; les démarrages suivants conservent le choix enregistré. Consultez le [chiffrement de l’espace de travail](/fr/documentation/workspace-encryption#workspace-encryption).

## Confier les services locaux à l’application {#launch}

Ouvrez le menu natif minddy. Sous Windows et Linux, appuyez sur Alt pour afficher la barre de menus ; macOS utilise la barre globale. Ouvrez le dialogue de connexion à un serveur, choisissez son option d’instance locale et sélectionnez la racine du clone. L’application lance `self-host:local --no-open`, prépare Supabase minimal, applique les migrations et la configuration Storage, construit l’application si nécessaire et attend `/api/health` avant d’ouvrir l’inscription. Elle écoute uniquement sur la boucle locale, au port 6463, mémorise le dossier et gère le démarrage comme l’arrêt.

## Disponibilité du MCP et accès réseau {#mcp-network-access}

Le MCP est inclus dans minddy auto-hébergé et démarre avec l’application. Il fonctionne directement sur `/api/mcp`, à l’origine de l’instance configurée par `MINDDY_PUBLIC_APP_URL`. La découverte OAuth et l’enregistrement dynamique des clients sont inclus : aucun serveur MCP séparé, aucune application OAuth dédiée ni aucun proxy minddy Cloud n’est nécessaire. Connectez votre client MCP au point d’accès de votre instance, puis connectez-vous et accordez l’accès dans le navigateur.

La disponibilité du service ne garantit pas son accessibilité réseau. Le client MCP et le navigateur utilisé pour l’autorisation doivent tous deux pouvoir atteindre les URL MCP et OAuth annoncées. Si vous définissez explicitement `OAUTH_ISSUER`, cette origine doit aussi être accessible. Le client doit prendre en charge la connexion, le parcours OAuth et le chemin réseau choisi ; certains clients exigent HTTPS même sur un réseau privé.

Ce profil géré par l’application desktop écoute uniquement sur l’interface de boucle locale. Un client MCP compatible sur le même ordinateur peut utiliser `http://localhost:6463/api/mcp` ; `localhost` et `127.0.0.1` désignent l’ordinateur qui établit la connexion. Un autre ordinateur ou un agent hébergé dans le cloud ne peut pas accéder directement à ce profil. Pour un accès LAN/VPN, utilisez une installation serveur avec une origine configurée accessible, par exemple `http://192.168.1.50`, et autorisez son port d’application au niveau de l’adresse d’écoute, du pare-feu et du routage. Hors de ce réseau, le client doit disposer d’une origine HTTPS accessible comme `https://tickets.example.com`, ou d’un autre chemin réseau pris en charge. Une installation locale ne fournit pas automatiquement un accès depuis Internet.

[Consultez les explications sur l’accès réseau au MCP avant de connecter un client distant](/docs/minddy-mcp#network-access).

## Résoudre un échec de démarrage {#recover}

Fermer une fenêtre laisse l’application desktop active ; utilisez la commande Quitter de l’application pour l’arrêter avec les services locaux. Vérifiez Docker, la CLI, l’espace libre et un éventuel autre processus sur le port 6463. `pnpm self-host:local` est une solution de diagnostic en terminal. Arrêtez-la avec Ctrl+C avant de rendre la main à l’application, qui refuse de prendre le contrôle d’un autre processus. Quitter l’application arrête normalement Supabase aussi ; `--keep-backend` modifie explicitement ce comportement. N’utilisez jamais `supabase db reset --local` pour récupérer des données : cette commande détruit les données d’évaluation. Vérifiez compte, projet, ticket et pièce jointe avant de vous fier à l’instance.
