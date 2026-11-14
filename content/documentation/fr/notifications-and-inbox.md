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
  "revision": 14,
  "sourceRevision": 14,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-13",
  "compatibility": {
    "version": "0.30.0 (MIN-794 release review)",
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
      "lib/server/notifications.ts",
      "lib/server/numo-notes.ts",
      "lib/notification-prefs.ts",
      "components/mobile-navigation.tsx",
      "components/inbox-row.tsx",
      "lib/notification-line.ts",
      "mobile/README.md"
    ]
  },
  "review": {
    "revision": 14,
    "fact": "agent:claude-code (MIN-973: the iOS app among the push delivery channels; checked against components/settings/account-push-devices-section.tsx and mobile/README.md; no figure affected); agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 1 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted); agent:claude-code (0.30.0 release review MIN-794: source audit against v0.20.0..HEAD; corrected the Inbox entry points to include notification search in the command palette, and the preferences section to state that administrators of a self-hosted instance get an unmutable Instance variables notification; no browser walkthrough; figures not reviewed in this pass); agent:claude-code (MIN-914: Numo messages in Inbox, their link targets, recipient rule and Messages from Numo switch, source audit against the change; no browser walkthrough; existing figures checked against the change and kept, not recaptured); agent:claude-code (MIN-924: which routine runs notify the owner, source audit against the change; no browser walkthrough; existing figures checked against the change and kept, not recaptured); agent:claude-code (MIN-907 inbox button in the phone bottom bar with its dot: checked against components/mobile-navigation.tsx and components/app-shell-chrome.tsx; no browser walkthrough; existing figure kept); agent:claude-code (MIN-975: inbox redesign — view picker and More actions menu, actor/sentence/context rows with mention pills, no date groups, invitation buttons with confirmation, swipe actions on phones; source audit against the change; no browser walkthrough; work-inbox.png recaptured on 2026-11-13 from the local candidate (light, six locales, response-only demo notifications, no writes) and inspected)",
    "language": "agent:claude-code (fr MIN-973 iOS app sentence, with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance); agent:/root/min747 (fr translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (fr manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance); agent:claude-code (fr corrected passages with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (fr MIN-914 passage translated from en with catalog UI labels and the locale register; self-reviewed; agent review, not human acceptance); agent:claude-code (fr MIN-924 passage translated from en with catalog UI labels and the locale register; self-reviewed; agent review, not human acceptance); agent:claude-code (fr MIN-907 phone inbox entry point, with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance); agent:claude-code (fr MIN-975 passages, figure alt and caption with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-13"
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
      "alt": "Inbox sur la vue Toutes avec des mentions, assignations et commentaires de démonstration : chaque ligne nomme qui a agi, le ticket en pastille et son titre.",
      "caption": "Chaque ligne indique qui a agi, ce qui s’est passé sur le ticket et son titre. Les lignes lues sont atténuées ; Toutes liste les notifications lues et non lues.",
      "revision": 14,
      "reviewed": true,
      "capturedAt": "2026-11-13",
      "viewport": [
        528,
        648
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "notifications-and-inbox-steps"
  ]
}
---

## Consulter la boîte de réception {#notifications-and-inbox}

Ouvrez la boîte de réception avec son icône dans la barre supérieure, depuis son bouton dans la barre en bas de l’écran sur téléphone, ou en appuyant sur G puis I hors d’un champ de texte. Une pastille rouge sur l’icône additionne les notifications non lues et les invitations en attente, et sur téléphone un point marque son bouton ; une PWA installée affiche le même nombre sur son icône d’application. La boîte de réception s’ouvre dans un volet, ou dans un panneau sur téléphone, et liste les notifications de la plus récente à la plus ancienne, chacune avec son heure. Dès que vous tapez dans la palette de commandes, elle trouve aussi les notifications : en choisir une ouvre la boîte de réception sur la vue qui la liste, Non lues ou Toutes, et la met en évidence sans la marquer comme lue.

Elle s’ouvre sur la vue Non lues. Les onglets en haut (un sélecteur sur téléphone) passent à Toutes, qui affiche aussi les notifications lues, ou à Mentions, qui ne garde que les mentions dans les commentaires et les pages. Chaque ligne nomme qui a agi (un membre, Numo, Smart Assign, un agent MCP, le tableau des retours ou la forge), dit ce qui s’est passé sur le ticket, la page, la pull request ou le projet affiché en pastille, et ajoute du contexte quand il y en a, comme l’extrait du commentaire ou le titre du ticket. Sélectionnez une ligne pour ouvrir son ticket, sa page ou sa pull request. Ouvrir une notification la marque comme lue. Sur téléphone, balayez une ligne vers la droite pour la marquer comme lue ou non lue, ou vers la gauche pour la supprimer. Sur ordinateur, pointer une ligne affiche Marquer comme lue ou Marquer comme non lue, et Tout marquer comme lu, dans le menu Plus d’actions à côté du sélecteur, efface tous les repères non lus. Repasser en non lu rétablit ce repère d’activité ; cela n’annule pas le changement du ticket ou de la page. Une notification pointe vers du travail accessible ; elle ne remplace pas son contenu actuel.

Numo peut aussi vous laisser un message : un titre court qui nomme l’élément concerné, avec une ou deux phrases de contexte si besoin, sur un point qui demande votre attention, écrits par l’une de vos routines ou dans une conversation où vous lui avez demandé de vous prévenir plus tard. Il porte l’icône de Numo, et le sélectionner ouvre le ticket, l’objectif, la page, la pull request ou la routine dont il parle, ou le projet s’il n’en nomme aucun. Numo n’écrit ces messages qu’à vous, jamais aux autres membres, et n’envoie pas deux fois le même message sur le même élément dans la même journée.

Une routine vous prévient d’elle-même lorsqu’une occurrence échoue, épuise son budget ou ne peut pas démarrer. Une occurrence qui se termine normalement ne vous parvient que sous forme de message de Numo. Voir [Routines](/docs/scheduled-routines#runs).

Supprimer, affiché en pointant une ligne sur ordinateur, retire cette notification après confirmation, et Supprimer les lues, dans le menu Plus d’actions, retire toutes les notifications lues après confirmation. Ces deux suppressions sont définitives ; les notifications non lues restent, et le ticket, la page ou la pull request visés ne sont pas touchés.

Les invitations de projet en attente apparaissent en tête des vues Non lues et Toutes, avec les boutons Refuser et Rejoindre. Chacun demande une confirmation : vérifiez le projet et la personne qui vous invite avant de répondre. Les anciens liens Inbox ouvrent l’accès actuel plutôt qu’une page séparée.

![Inbox sur la vue Toutes avec des mentions, assignations et commentaires de démonstration : chaque ligne nomme qui a agi, le ticket en pastille et son titre.](/documentation/fr/work-inbox.png)

## Choisir les canaux {#notification-preferences}

Choisissez Paramètres de l'inbox dans le menu Plus d’actions de la boîte de réception, ou ouvrez Paramètres du compte puis l’onglet Notifications. Sous Notifications de l'inbox, un interrupteur par catégorie (Assignations, Mentions, Commentaires, Numo, Routines, Pull requests, Retours, Pages et Messages de Numo) décide de ce qui arrive dans votre boîte de réception. Désactiver une catégorie arrête les futures notifications de ce type, y compris leurs alertes push ; cela ne retire pas les notifications déjà reçues. Sur une instance self-hosted, les administrateurs reçoivent aussi une notification Variables de l’instance lorsqu’un autre administrateur modifie une variable de l’instance ; aucun interrupteur ne la désactive. Voir [modifier les variables de l’instance](/docs/instance-administration#instance-variables).

La section Notifications push du même onglet liste les appareils qui reçoivent des alertes. La livraison navigateur, PWA, application iOS ou desktop nécessite aussi l’enregistrement de l’appareil et la permission du système. Désactiver ou retirer un appareil n’arrête les alertes que sur cet appareil ; votre boîte de réception et ses catégories ne changent pas.

Si une notification mène à un contenu inaccessible, vérifiez adhésion et éventuelle suppression. Pour un push manquant, contrôlez permission et enregistrement avec la [section des notifications d’appareil](/fr/documentation/applications#devices-and-notifications) ; la boîte de réception reste utile pour examiner l’activité. Ne transmettez ni cookies de session ni contenu privé de notification dans des captures de diagnostic.
