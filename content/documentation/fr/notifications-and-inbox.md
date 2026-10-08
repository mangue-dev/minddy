---
{
  "id": "notifications-and-inbox",
  "locale": "fr",
  "title": "Suivre les notifications et invitations",
  "summary": "Examinez activité non lue et mentions, puis ajustez vos préférences de notification.",
  "topic": "Planifier et retrouver le travail",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W16"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 2,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
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
      "content/knowledge/productivity.md",
      "components/inbox-popover.tsx",
      "components/inbox-content.tsx",
      "components/settings/account-notifications-section.tsx"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "project-members",
    "devices-and-notifications",
    "profile-and-preferences"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "notifications-and-inbox-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/work-inbox.png",
      "alt": "Onglets de la boîte de réception et liste non lue vide.",
      "caption": "L’onglet Non lues vide indique l’absence d’éléments non lus dans cette vue ; Toutes permet d’examiner les autres notifications conservées.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1080
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "notifications-and-inbox-steps"
  ]
}
---

## Consulter la boîte de réception {#notifications-and-inbox}

Ouvrez la boîte de réception depuis la navigation. Ce volet regroupe les notifications par date et propose des filtres non lues, toutes et mentions. Sélectionnez un élément pour inspecter le ticket ou la page et vérifier sa lecture. Ouvrir une notification la marque comme lue. Sa ligne propose aussi les commandes de lecture ou de retour à l’état non lu, et le volet permet de tout marquer comme lu. Repasser en non lu rétablit ce repère d’activité ; cela n’annule pas le changement du ticket ou de la page. Une notification pointe vers du travail accessible ; elle ne remplace pas son contenu actuel.

Les invitations de projet en attente y figurent aussi. Acceptez ou refusez après avoir vérifié projet et compte. Les anciens liens Inbox ouvrent l’accès actuel plutôt qu’une page séparée.

![Onglets de la boîte de réception et liste non lue vide.](/documentation/fr/work-inbox.png)

## Choisir les canaux {#notification-preferences}

Les préférences de notification du compte déterminent les activités reçues. La livraison navigateur, PWA ou desktop nécessite aussi l’enregistrement de l’appareil et la permission du système. Désactiver un canal d’appareil diffère d’un changement des filtres d’activité internes.

Si une notification mène à un contenu inaccessible, vérifiez adhésion et éventuelle suppression. Pour un push manquant, contrôlez permission et enregistrement avec le guide des appareils ; la boîte de réception reste utile pour examiner l’activité. Ne transmettez ni cookies de session ni contenu privé de notification dans des captures de diagnostic.
