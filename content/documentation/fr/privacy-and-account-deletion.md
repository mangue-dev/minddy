---
{
  "id": "privacy-and-account-deletion",
  "locale": "fr",
  "title": "Gérer les statistiques et supprimer son compte",
  "summary": "Examiner destinations et conséquences avant une demande irréversible.",
  "topic": "Compte et applications",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A09"
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
      "components/settings/account-analytics-section.tsx",
      "components/settings/account-data-section.tsx",
      "app/api/account/deletion-preview/route.ts",
      "app/api/account/route.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "privacy-and-account-deletion-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/privacy-and-account-deletion-workflow.png",
      "alt": "Aperçu de suppression listant les projets possédés, les tickets et les membres privés d’accès.",
      "caption": "Lisez l’aperçu et exportez les données à conserver avant d’ouvrir la confirmation de suppression.",
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
    "privacy-and-account-deletion-workflow"
  ]
}
---

## Consentement aux statistiques {#privacy-and-account-deletion}

Lorsque l’analytics est configuré, les réglages du compte affichent un contrôle de consentement et un lien vers la politique des cookies. Le désactiver change immédiatement le consentement aux mesures sur cet appareil et enregistre le choix dans le compte. Le choix local déjà présent sur un autre appareil peut continuer à le régir. Si aucun service analytics n’est configuré, la section est absente.

Le consentement est distinct des données nécessaires au fonctionnement du compte. Consultez la politique de confidentialité de l’instance et les fournisseurs externes que vous avez activés. En auto-hébergement, la configuration et les politiques de l’opérateur déterminent les destinations des services ; désactiver l’analytics ne retire pas les intégrations IA ou Git.

![Aperçu de suppression listant les projets possédés, les tickets et les membres privés d’accès.](/documentation/fr/privacy-and-account-deletion-workflow.png)


## Lire l’aperçu de suppression {#deletion}

Avant de supprimer le compte, exportez les données à conserver depuis la section Données. Lisez l’aperçu des projets dont vous êtes propriétaire, des membres affectés, des tickets, des commentaires et de l’abonnement actif. Les conséquences sur les projets possédés touchent d’autres personnes ; réglez ces questions avant de confirmer.

Ouvrez la confirmation de suppression seulement lorsque vous êtes prêt. Saisissez l’email du compte et, pour un compte avec mot de passe, ce mot de passe. Les comptes sans mot de passe exigent une connexion récente. Suivez les indications d’un refus d’authentification récente plutôt que de réessayer à l’aveugle. Une suppression réussie déconnecte le compte et revient au site public. Ce n’est pas une corbeille récupérable. Gardez les exports privés et traitez les questions restantes d’abonnement ou de fournisseur dans les contrôles de facturation et de service correspondants.
