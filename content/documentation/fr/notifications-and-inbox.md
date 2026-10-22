---
{
  "id": "notifications-and-inbox",
  "locale": "fr",
  "title": "Boîte de réception et notifications",
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
  "revision": 8,
  "sourceRevision": 8,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-22",
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
      "content/knowledge/productivity.md",
      "components/inbox-popover.tsx",
      "components/inbox-content.tsx",
      "components/settings/account-notifications-section.tsx",
      "components/notification-badge.tsx",
      "components/settings/account-settings-page.tsx",
      "lib/server/notifications.ts"
    ]
  },
  "review": {
    "revision": 8,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 1 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (fr translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (fr manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
  },
  "related": [
    "projects",
    "applications",
    "accounts"
  ],
  "aliases": [],
  "tags": [
    "Suivre les notifications et invitations"
  ],
  "figures": [
    {
      "id": "notifications-and-inbox-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/work-inbox.png",
      "alt": "Boîte de réception avec des mentions, attributions et commentaires de démonstration, lus et non lus.",
      "caption": "Ces exemples d’activité affichent l’auteur, le ticket et l’état de lecture. L’onglet Toutes regroupe les notifications lues et non lues.",
      "revision": 8,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        528,
        648
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "notifications-and-inbox-steps"
  ]
}
---

## Consulter la boîte de réception {#notifications-and-inbox}

Ouvrez la boîte de réception avec son icône dans la barre supérieure, depuis sa ligne dans la barre latérale sur téléphone, ou en appuyant sur G puis I hors d’un champ de texte. Une pastille rouge sur l’icône additionne les notifications non lues et les invitations en attente ; une PWA installée affiche le même nombre sur son icône d’application. La boîte de réception s’ouvre dans un volet, ou dans un panneau sur téléphone, et regroupe les notifications sous Aujourd'hui, Hier et Plus ancien.

Elle s’ouvre sur le filtre Non lues. Toutes affiche aussi les notifications lues, et Mentions ne garde que les mentions dans les commentaires et les pages. Sélectionnez un élément pour ouvrir le ticket, la page ou la pull request correspondant. Ouvrir une notification la marque comme lue. Sa ligne propose aussi Marquer comme lue ou Marquer comme non lue, et Tout marquer comme lu, dans l’en-tête de la boîte de réception, efface tous les repères non lus. Repasser en non lu rétablit ce repère d’activité ; cela n’annule pas le changement du ticket ou de la page. Une notification pointe vers du travail accessible ; elle ne remplace pas son contenu actuel.

Supprimer, sur une ligne, retire cette notification après confirmation, et Supprimer les lues, dans l’en-tête, retire toutes les notifications lues après confirmation. Ces deux suppressions sont définitives ; les notifications non lues restent, et le ticket, la page ou la pull request visés ne sont pas touchés.

Les invitations de projet en attente apparaissent sous Invitations dans les filtres Non lues et Toutes. Acceptez ou refusez après avoir vérifié le projet et la personne qui vous invite. Les anciens liens Inbox ouvrent l’accès actuel plutôt qu’une page séparée.

![Boîte de réception avec des mentions, attributions et commentaires de démonstration, lus et non lus.](/documentation/fr/work-inbox.png)

## Choisir les canaux {#notification-preferences}

Choisissez Paramètres de l'inbox dans l’en-tête de la boîte de réception, ou ouvrez Paramètres du compte puis l’onglet Notifications. Sous Notifications de l'inbox, un interrupteur par catégorie (Assignations, Mentions, Commentaires, Numo, Routines, Pull requests, Retours et Pages) décide de ce qui arrive dans votre boîte de réception. Désactiver une catégorie arrête les futures notifications de ce type, y compris leurs alertes push ; cela ne retire pas les notifications déjà reçues.

La section Notifications push du même onglet liste les appareils qui reçoivent des alertes. La livraison navigateur, PWA ou desktop nécessite aussi l’enregistrement de l’appareil et la permission du système. Désactiver ou retirer un appareil n’arrête les alertes que sur cet appareil ; votre boîte de réception et ses catégories ne changent pas.

Si une notification mène à un contenu inaccessible, vérifiez adhésion et éventuelle suppression. Pour un push manquant, contrôlez permission et enregistrement avec la [section des notifications d’appareil](/fr/documentation/applications#devices-and-notifications) ; la boîte de réception reste utile pour examiner l’activité. Ne transmettez ni cookies de session ni contenu privé de notification dans des captures de diagnostic.
