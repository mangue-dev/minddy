---
{
  "id": "transfer-between-instances",
  "locale": "fr",
  "title": "Transfert des données du compte",
  "summary": "Exporter un JSON privé, importer par ajout et vérifier conflits et exclusions.",
  "topic": "Compte et applications",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A07"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 4,
  "sourceRevision": 4,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
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
      "content/knowledge/settings-and-data.md",
      "components/settings/account-data-section.tsx",
      "lib/server/account-import.ts",
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "content/documentation/reviews/account-transfer-execution.json"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review)",
    "date": "2026-10-09"
  },
  "related": [],
  "aliases": [],
  "tags": [
    "Transférer ses données entre instances"
  ],
  "figures": [
    {
      "id": "transfer-between-instances-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/transfer-between-instances-workflow.png",
      "alt": "Réglages du transfert avec le bouton d’importation de fichier.",
      "caption": "Choisissez le JSON intact exporté depuis le compte source ; vérifiez le résultat avant de fermer.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        816,
        148
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "transfer-between-instances-export-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/transfer-between-instances-export-workflow.png",
      "alt": "Commande d’export du compte.",
      "caption": "Commande d’export du compte. L’export exclut les clés et les jetons ; la capture montre le bouton avant téléchargement.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        816,
        148
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "transfer-between-instances-workflow",
    "transfer-between-instances-export-workflow"
  ]
}
---

## Exporter et importer {#transfer-between-instances}

Connectez-vous à l’instance source et ouvrez la section Données des réglages du compte. Téléchargez l’export JSON et conservez-le en privé : il contient des données du compte et des projets. Créez votre compte sur l’instance de destination ou connectez-vous à celui qui existe, vérifiez son adresse et choisissez son contrôle d’import. Sélectionnez le fichier exporté sans le modifier et attendez le résultat avant de fermer la page.

L’import ajoute des données au lieu de remplacer la destination. Les identifiants sont conservés lorsqu’ils peuvent être réutilisés sans risque ; les conflits reçoivent de nouveaux identifiants. Le résultat indique les identifiants remappés et les adhésions ignorées. Les références d’adhésion à des projets existants ne sont restaurées que si le projet cible existe déjà et que la référence est autorisée. Après le rechargement de la page, vérifiez les projets, tickets, pages et données personnelles.

![Réglages du transfert avec le bouton d’importation de fichier.](/documentation/fr/transfer-between-instances-workflow.png)

## Reconnecter les services {#exclusions}

Les mots de passe, clés API, tokens OAuth, identifiants de dépôt et abonnements de facturation ne sont pas transférés. Configurez et autorisez de nouveau les services nécessaires sur la destination ; un projet exporté ne prouve pas que l’accès au fournisseur fonctionne. Vérifiez les ressources fichiers et leur disponibilité, plutôt que de considérer le JSON comme une sauvegarde opérationnelle de la base et des octets Storage.

Gardez l’instance d’origine jusqu’à la vérification du travail transféré. Si l’import échoue, conservez le message d’erreur et contrôlez l’état de la destination avant de répéter. Supprimez ou protégez les fichiers de transfert lorsqu’ils ne servent plus ; ne les joignez jamais à un signalement d’erreur public.

![Commande d’export du compte.](/documentation/fr/transfer-between-instances-export-workflow.png)

Le résultat reste affiché jusqu’à ce que vous choisissiez Recharger le compte ou fermiez la boîte de dialogue. Ces deux actions rechargent le compte après consultation des compteurs.
