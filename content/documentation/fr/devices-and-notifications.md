---
{
  "id": "devices-and-notifications",
  "locale": "fr",
  "title": "Activer les notifications d’un appareil",
  "summary": "Enregistrer l’appareil, tester la réception et distinguer navigateur et notifications natives.",
  "topic": "Compte et applications",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A03"
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
      "components/settings/account-push-devices-section.tsx",
      "lib/desktop/notification-capabilities.ts",
      "public/sw.js",
      "content/documentation/reviews/push-registration-capture-candidates.json"
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
      "id": "devices-and-notifications-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/devices-and-notifications-workflow.png",
      "alt": "Réglages push indiquant un blocage du navigateur et aucun appareil inscrit.",
      "caption": "Ce navigateur bloque les notifications. Rétablissez l’autorisation du site avant d’inscrire cet appareil.",
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
      "id": "devices-and-notifications-registered-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/devices-and-notifications-registered.png",
      "alt": "Appareil navigateur enregistré et actif sur le compte, avec la date réelle du dernier envoi.",
      "caption": "Le compte possède un appareil navigateur enregistré et actif. La liste indique les dates d’inscription et du dernier envoi. La permission du navigateur et les réglages du système restent nécessaires pour afficher une bannière.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1240,
        950
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "devices-and-notifications-workflow",
    "devices-and-notifications-registered-workflow"
  ]
}
---

## Activer et tester {#devices-and-notifications}

Ouvrez les notifications dans les réglages du compte sur l’appareil à enregistrer. Activez-les et acceptez la demande d’autorisation du navigateur ou du système. Une autorisation refusée doit être modifiée dans les réglages du navigateur ou du système ; actionner plusieurs fois le contrôle de Minddy ne contourne pas ce refus. Sur iOS, installez et ouvrez d’abord l’application web lorsque l’interface le demande.

Vérifiez que l’appareil apparaît dans la liste et utilisez son contrôle de test. Consultez les informations sur la dernière livraison. Vous pouvez désactiver ou retirer des enregistrements individuels sans supprimer le compte. Les préférences de la boîte de réception déterminent quels événements vous notifient ; la boîte de réception intégrée reste disponible lorsque le push ne l’est pas.

![Réglages push indiquant un blocage du navigateur et aucun appareil inscrit.](/documentation/fr/devices-and-notifications-workflow.png)


## Conditions des plateformes {#platforms}

Le push web exige un navigateur pris en charge et un service push configuré dans l’instance. Les notifications natives et la livraison en arrière-plan diffèrent selon la plateforme. L’application macOS distribuée et signée prend en charge APNs ; le paquet Windows exige son composant WNS facultatif pour le transport en arrière-plan. Linux utilise la session en arrière-plan de l’application distribuée plutôt qu’APNs ou WNS.

Vérifiez l’autorisation de notification du système, l’état d’installation dans le navigateur et l’explication affichée si la fonction n’est pas configurée ou prise en charge. Un test réussi ne garantit pas la livraison hors ligne ou sous toutes les restrictions d’arrière-plan du système. Gardez l’application ou son service d’arrière-plan configuré disponible, selon les exigences de la plateforme.

![Appareil navigateur enregistré et actif sur le compte, avec la date réelle du dernier envoi.](/documentation/fr/devices-and-notifications-registered.png)
