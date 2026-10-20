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
  "revision": 7,
  "sourceRevision": 7,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-20",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "components/settings/account-settings-page.tsx"
    ]
  },
  "review": {
    "revision": 7,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 2 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history)",
    "language": "agent:/root/min747 (fr translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-20"
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
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        816,
        148
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "transfer-between-instances-export-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/transfer-between-instances-export-workflow.png",
      "alt": "Commande d’export du compte.",
      "caption": "Commande d’export du compte. L’export exclut les clés et les jetons ; la capture montre le bouton avant téléchargement.",
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        816,
        148
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "transfer-between-instances-workflow",
    "transfer-between-instances-export-workflow"
  ]
}
---

## Exporter et importer {#transfer-between-instances}

Connectez-vous à l’instance source et ouvrez l’onglet **Confidentialité et données** des paramètres du compte. Choisissez **Télécharger mes données** et conservez le fichier JSON en privé : il contient des données du compte et des projets, y compris les octets des fichiers. Créez votre compte sur l’instance de destination ou connectez-vous à celui qui existe, vérifiez son adresse, ouvrez le même onglet et choisissez **Importer un fichier de transfert**. Sélectionnez le fichier exporté sans le modifier et attendez le résultat avant de fermer la page.

L’import ajoute des données au lieu de remplacer la destination. Les identifiants sont conservés lorsqu’ils peuvent être réutilisés sans risque ; les conflits reçoivent de nouveaux identifiants. Le résultat indique les identifiants remappés et les adhésions ignorées. Les références d’adhésion à des projets existants ne sont restaurées que si le projet cible existe déjà et que la référence est autorisée. Après le rechargement de la page, vérifiez les projets, tickets, pages et données personnelles.

![Réglages du transfert avec le bouton d’importation de fichier.](/documentation/fr/transfer-between-instances-workflow.png)

## Reconnecter les services {#exclusions}

Les mots de passe, clés API, tokens OAuth, identifiants de dépôt et abonnements de facturation ne sont pas transférés. Configurez et autorisez de nouveau les services nécessaires sur la destination ; un projet exporté ne prouve pas que l’accès au fournisseur fonctionne. Vérifiez les ressources fichiers et leur disponibilité, plutôt que de considérer le JSON comme une sauvegarde opérationnelle de la base et des octets Storage. Un export créé par v0.11.0 ou une version antérieure peut contenir des vues enregistrées de la palette de commandes et des conversations de l’agent de code ; cette release n’a plus ces fonctionnalités et les ignore à l’import.

Gardez l’instance d’origine jusqu’à la vérification du travail transféré. Si l’import échoue, conservez le message d’erreur et contrôlez l’état de la destination avant de répéter. Supprimez ou protégez les fichiers de transfert lorsqu’ils ne servent plus ; ne les joignez jamais à un signalement d’erreur public.

![Commande d’export du compte.](/documentation/fr/transfer-between-instances-export-workflow.png)

Le résultat reste affiché jusqu’à ce que vous choisissiez Recharger le compte ou fermiez la boîte de dialogue. Ces deux actions rechargent le compte après consultation des compteurs.
