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
  "revision": 3,
  "sourceRevision": 3,
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
      "content/documentation/reviews/editorial-clarity-it-pt-BR-2026-10-09.md"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review); agent:/root/editorial_en_fr (collection-caption clarity)",
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
      "revision": 3,
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
      "revision": 3,
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

Utilisez un clone dédié à l’évaluation avec Node.js 24, pnpm 10.28.0, Git, la CLI Supabase et un daemon Docker actif. Prévoyez au moins 4 Go de RAM libre, deux cœurs CPU et 10 Go de SSD libre ; 8 Go, quatre cœurs et 20 Go sont recommandés. Installez d’abord l’application desktop signée depuis la page de téléchargement. Windows passe par Microsoft Store ; macOS et Linux disposent de leurs téléchargements. Positionnez le clone sur la version à évaluer avant d’installer ses dépendances.

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

Ouvrez le menu natif minddy. Sous Windows et Linux, appuyez sur Alt pour afficher la barre de menus ; macOS utilise la barre globale. Ouvrez le dialogue de connexion à un serveur, choisissez son option d’instance locale et sélectionnez la racine du clone. L’application lance self-host:local --no-open, prépare Supabase minimal, applique les migrations et la configuration Storage, construit l’application si nécessaire et attend /api/health avant d’ouvrir l’inscription. Elle écoute uniquement sur la boucle locale, au port 6463, mémorise le dossier et gère le démarrage comme l’arrêt.

## Résoudre un échec de démarrage {#recover}

Fermer une fenêtre laisse l’application desktop active ; utilisez la commande Quitter de l’application pour l’arrêter avec les services locaux. Si le démarrage échoue, copiez le rapport de diagnostic depuis le menu natif d’aide. Vérifiez Docker, la CLI, l’espace libre et un éventuel autre processus sur le port 6463. pnpm self-host:local est une solution de diagnostic en terminal. Arrêtez-la avec Ctrl+C avant de rendre la main à l’application, qui refuse de prendre le contrôle d’un autre processus. Quitter l’application arrête normalement Supabase aussi ; --keep-backend modifie explicitement ce comportement. N’utilisez jamais supabase db reset --local pour récupérer des données : cette commande détruit les données d’évaluation. Vérifiez compte, projet, ticket et pièce jointe avant de vous fier à l’instance.
