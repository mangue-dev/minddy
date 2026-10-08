---
{
  "id": "applications",
  "locale": "fr",
  "title": "Applications web, mobile et desktop",
  "summary": "Utilisez minddy dans un navigateur, installez l’application mobile ou desktop et configurez les notifications de vos appareils.",
  "topic": "Compte et applications",
  "type": "guide",
  "audiences": [
    "member",
    "operator"
  ],
  "workflows": [
    "A10",
    "A11",
    "A12",
    "A03"
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
      "components/mobile-sidebar-reveal.tsx",
      "components/issue-side-panel.tsx",
      "components/assistant-panel.tsx",
      "public/sw.js",
      "content/documentation/reviews/mobile-account-capture-candidates.json",
      "components/marketing/mobile-pwa-install-guide.tsx",
      "components/marketing/mobile-install-guide-copy.ts",
      "content/documentation/reviews/pwa-guide-capture-candidates.json",
      "content/documentation/reviews/pwa-installation-probe.json",
      "content/knowledge/desktop-and-speed.md",
      "app/(marketing)/download/page.tsx",
      "components/settings/account-desktop-section.tsx",
      "docs/linux-desktop.md",
      "content/documentation/reviews/desktop-capture-candidates.json",
      "components/settings/account-push-devices-section.tsx",
      "lib/desktop/notification-capabilities.ts",
      "content/documentation/reviews/push-registration-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review)",
    "date": "2026-10-09"
  },
  "related": [
    "issues"
  ],
  "aliases": [
    "web-and-mobile",
    "install-the-pwa",
    "desktop-app",
    "desktop-and-speed",
    "devices-and-notifications"
  ],
  "tags": [
    "Travailler sur le web et sur mobile",
    "Installer l’application web sur téléphone ou tablette",
    "Installer et gérer l’application desktop",
    "Activer les notifications d’un appareil"
  ],
  "figures": [
    {
      "id": "web-and-mobile-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/web-and-mobile-workflow.png",
      "alt": "Panneau mobile d’un ticket avec titre, description, propriétés et zone de commentaire.",
      "caption": "Sur un écran étroit, les détails du ticket occupent un panneau adaptatif. Utilisez le bouton de fermeture pour revenir au projet ; Numo reste accessible par son bouton flottant.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        390,
        844
      ],
      "theme": "dark"
    },
    {
      "id": "install-the-pwa-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/install-the-pwa-workflow.png",
      "alt": "Guide Safari illustré de minddy : Partager, Sur l’écran d’accueil puis confirmer.",
      "caption": "Le guide public illustre les trois étapes Safari et le maintien de l’option Ouvrir comme app web. Il s’agit d’illustrations pédagogiques affichées par minddy, pas de captures d’une installation iOS effectuée.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1240,
        940
      ],
      "theme": "light"
    },
    {
      "id": "desktop-app-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/desktop-app-workflow.png",
      "alt": "Réglages Bureau dans la véritable application Electron de développement sur macOS, version 0.11.1, connectée au serveur local avec un profil isolé.",
      "caption": "Réglages Bureau dans la véritable application Electron de développement sur macOS, version 0.11.1, connectée au serveur local avec un profil isolé. Cette capture ne valide ni les releases signées ni les autres systèmes.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1280,
        860
      ],
      "theme": "light"
    },
    {
      "id": "devices-and-notifications-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/devices-and-notifications-workflow.png",
      "alt": "Réglages push indiquant un blocage du navigateur et aucun appareil inscrit.",
      "caption": "Ce navigateur bloque les notifications. Rétablissez l’autorisation du site avant d’inscrire cet appareil.",
      "revision": 4,
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
      "revision": 4,
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
    "web-and-mobile-workflow",
    "install-the-pwa-workflow",
    "desktop-app-workflow",
    "devices-and-notifications-workflow",
    "devices-and-notifications-registered-workflow"
  ]
}
---

Accédez à la même instance depuis un navigateur, une application web installée ou l’application desktop. Suivez les étapes d’installation adaptées à votre appareil, puis vérifiez la connexion réseau, les mises à jour et les autorisations de notification de cette plateforme.

## Travailler sur le web et sur mobile {#web-and-mobile}

Ouvrez l’adresse de votre instance et connectez-vous à celle-ci. Sur un écran étroit, affichez la barre latérale pour choisir un projet, puis ouvrez un ticket depuis la liste ou le tableau. Consultez ses détails dans le panneau adapté à l’écran, modifiez le champ voulu ou ajoutez un commentaire, puis attendez le résultat de l’enregistrement avant de fermer. Fermez le panneau de détails pour revenir à la liste ; sa présentation mobile diffère de celle d’un écran large.

Ouvrez Numo avec son bouton flottant ou une action contextuelle du ticket. Vérifiez le contexte du ticket dans le champ de saisie. Si un panneau masque le contenu dont vous avez besoin, fermez-le avant de poursuivre la navigation. Sur un écran tactile, utilisez les boutons et menus explicites : les actions au survol et les raccourcis d’un ordinateur ne sont pas toujours disponibles.

### Clavier et connexion {#access}

Au clavier, vous pouvez placer le focus sur les contrôles et utiliser la palette de commandes pour naviguer ou effectuer les actions courantes. Le bouton d’envoi reste une alternative au raccourci clavier. Suivez le raccourci affiché par l’application pour votre plateforme.

Le navigateur et l’application web installée ont besoin d’une connexion réseau pour accéder aux données des projets et enregistrer les modifications. Le service worker gère les notifications push sans fournir de cache de données hors ligne. Après une coupure, vérifiez si la modification a été enregistrée avant de la répéter. Installer la PWA ne crée pas de compte distinct et ne modifie pas les permissions de l’instance.

![Panneau mobile d’un ticket avec titre, description, propriétés et zone de commentaire.](/documentation/fr/web-and-mobile-workflow.png)

## Installer l’application web sur téléphone ou tablette {#install-the-pwa}

Ouvrez l’instance minddy voulue dans Safari sur iPhone ou iPad, ou dans Chrome ou un autre navigateur Android compatible. Si le lien s’est ouvert à l’intérieur d’une autre application, ouvrez-le d’abord dans le navigateur complet. Pour une instance self-hosted, utilisez l’adresse de votre propre serveur.

Sur iOS, ouvrez Partager, choisissez Sur l’écran d’accueil, gardez Ouvrir comme app web activé, puis touchez Ajouter. Selon la présentation de Safari, ouvrez Plus avant Partager. Si l’action manque, consultez Modifier les actions.

Sur Android, utilisez la proposition d’installation ou choisissez Installer l’application ou Ajouter à l’écran d’accueil dans le menu du navigateur, puis confirmez Installer. Les libellés dépendent du navigateur. Ouvrez la nouvelle icône et connectez-vous avec le compte de cette instance. Il s’agit d’une PWA installée par le navigateur ; minddy n’a pas d’application native dans l’App Store iOS ou Google Play.

### Mises à jour, accès hors ligne et notifications {#operation}

L’installation ne crée pas de copie hors ligne du projet. Le service worker de minddy gère uniquement les notifications push et ne met pas les requêtes de l’application en cache. Gardez une connexion réseau et rechargez la page pour obtenir le contenu web actuel. Les notifications nécessitent aussi un navigateur compatible, son autorisation et une configuration push côté serveur. Sur iOS, utilisez l’application installée lorsque le parcours le demande. Si l’option d’installation manque, ouvrez un navigateur complet compatible et vérifiez si l’instance est déjà installée.

![Guide Safari illustré de minddy : Partager, Sur l’écran d’accueil puis confirmer.](/documentation/fr/install-the-pwa-workflow.png)

## Installer et gérer l’application desktop {#desktop-app}

Ouvrez la page publique de téléchargement. Sur macOS, choisissez le paquet Apple silicon ou Intel. Sur Windows, installez l’application depuis Microsoft Store. Sur Linux, choisissez une AppImage ou un paquet deb/rpm signé correspondant à x64 ou ARM64. Suivez le guide de la plateforme et les instructions de vérification du paquet. Windows ne propose pas d’installeur exe.

Dans le sélecteur de serveur, choisissez minddy Cloud, l’origine d’un serveur self-hosted ou le runtime local disponible. Vérifiez la destination avant de vous connecter : chaque compte appartient à son instance. OAuth utilise le navigateur système puis revient à l’application desktop. La présence d’un runtime local ne signifie pas que le worker de code Numo travaille dans votre dossier local.

### Onglets, fermeture et mises à jour {#desktop-app-operation}

Utilisez les commandes des onglets et la palette de commandes pour naviguer entre vos travaux. Suivez les raccourcis affichés pour votre plateforme : macOS utilise Command là où Windows et Linux utilisent généralement Control. Fermer la fenêtre la masque et laisse l’application active. Utilisez Quitter pour terminer l’application ; macOS propose Cmd+Q. Les notifications en arrière-plan dépendent du paquet et des capacités de la plateforme.

macOS et les AppImage portables proposent les mises à jour dans l’application. Windows se met à jour depuis Microsoft Store. Pour deb/rpm, installez le nouveau paquet vérifié. Les réglages desktop du compte affichent le serveur connecté et les commandes de mise à jour ou d’assistance disponibles. Après une mise à jour, vérifiez la version desktop affichée et confirmez que l’instance voulue s’ouvre toujours.

![Réglages Bureau dans la véritable application Electron de développement sur macOS, version 0.11.1, connectée au serveur local avec un profil isolé.](/documentation/fr/desktop-app-workflow.png)

## Activer les notifications d’un appareil {#devices-and-notifications}

Ouvrez les notifications dans les réglages du compte sur l’appareil à enregistrer. Activez-les et acceptez la demande d’autorisation du navigateur ou du système. Une autorisation refusée doit être modifiée dans les réglages du navigateur ou du système ; actionner plusieurs fois le contrôle de minddy ne contourne pas ce refus. Sur iOS, installez et ouvrez d’abord l’application web lorsque l’interface le demande.

Vérifiez que l’appareil apparaît dans la liste et utilisez son contrôle de test. Consultez les informations sur la dernière livraison. Vous pouvez désactiver ou retirer des enregistrements individuels sans supprimer le compte. Les préférences de la boîte de réception déterminent quels événements vous notifient ; la boîte de réception intégrée reste disponible lorsque le push ne l’est pas.

![Réglages push indiquant un blocage du navigateur et aucun appareil inscrit.](/documentation/fr/devices-and-notifications-workflow.png)

### Conditions des plateformes {#platforms}

Le push web exige un navigateur pris en charge et un service push configuré dans l’instance. Les notifications natives et la livraison en arrière-plan diffèrent selon la plateforme. L’application macOS distribuée et signée prend en charge APNs ; le paquet Windows exige son composant WNS facultatif pour le transport en arrière-plan. Linux utilise la session en arrière-plan de l’application distribuée plutôt qu’APNs ou WNS.

Vérifiez l’autorisation de notification du système, l’état d’installation dans le navigateur et l’explication affichée si la fonction n’est pas configurée ou prise en charge. Un test réussi ne garantit pas la livraison hors ligne ou sous toutes les restrictions d’arrière-plan du système. Gardez l’application ou son service d’arrière-plan configuré disponible, selon les exigences de la plateforme.

![Appareil navigateur enregistré et actif sur le compte, avec la date réelle du dernier envoi.](/documentation/fr/devices-and-notifications-registered.png)
