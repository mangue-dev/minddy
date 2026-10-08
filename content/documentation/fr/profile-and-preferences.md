---
{
  "id": "profile-and-preferences",
  "locale": "fr",
  "title": "Modifier son profil et ses préférences",
  "summary": "Régler nom, avatar, langue, thème et raccourci d’envoi du compte.",
  "topic": "Compte et applications",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A01"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
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
      "content/knowledge/settings-and-data.md",
      "components/settings/account-profile-section.tsx",
      "components/settings/account-preferences-section.tsx",
      "app/api/me/avatar/route.ts",
      "lib/server/avatar-seeds.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "account-security",
    "devices-and-notifications",
    "automation-settings",
    "transfer-between-instances",
    "privacy-and-account-deletion"
  ],
  "aliases": [
    "settings-and-data"
  ],
  "tags": [],
  "figures": [
    {
      "id": "profile-and-preferences-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/profile-and-preferences-workflow.png",
      "alt": "Réglages du profil : avatar, nom d’utilisateur et adresse email en lecture seule.",
      "caption": "Enregistrez les changements du profil après validation ; l’adresse email reste en lecture seule.",
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
      "id": "profile-and-preferences-preferences-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/profile-and-preferences-preferences-workflow.png",
      "alt": "Sélecteur de langue et commandes des thèmes clair, sombre et système.",
      "caption": "La langue du compte et celle du site public se règlent séparément.",
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
    "profile-and-preferences-workflow",
    "profile-and-preferences-preferences-workflow"
  ]
}
---

## Mettre à jour son identité {#profile-and-preferences}
Ouvrez les paramètres depuis le menu du compte. Dans le profil, saisissez un nom non vide et enregistrez. L’adresse email est en lecture seule. Générez un nouvel avatar ou importez une image avec les contrôles correspondants. Attendez le résultat et vérifiez l’avatar dans un commentaire ou une liste de membres ; il suit le compte entre projets et conversations. Si un fichier est refusé, suivez le message de validation plutôt que de le renvoyer à répétition.

L’image source ne doit pas dépasser 10 MiB. Le serveur vérifie les octets lisibles, applique l’orientation et recadre au centre en avatar WebP de 256 × 256.

![Réglages du profil : avatar, nom d’utilisateur et adresse email en lecture seule.](/documentation/fr/profile-and-preferences-workflow.png)


## Choisir le comportement de l’interface {#preferences}
Dans les préférences, sélectionnez la langue et le thème puis vérifiez une autre page. La langue du compte concerne le produit connecté ; le sélecteur du site public règle sa navigation séparément. Le thème est enregistré sur le compte et partagé entre appareils.

Choisissez le raccourci d’envoi dans les réglages clavier. Il s’applique aux commentaires et à Numo. Utilisez le bouton d’envoi si la plateforme intercepte le raccourci ; les touches modificatrices diffèrent selon l’OS. Les préférences de tickets, comme l’assignation automatique et le statut des tickets créés par Numo, appartiennent aussi au compte et ne changent pas celles des autres membres.

![Sélecteur de langue et commandes des thèmes clair, sombre et système.](/documentation/fr/profile-and-preferences-preferences-workflow.png)
