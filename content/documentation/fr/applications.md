---
{
  "id": "applications",
  "locale": "fr",
  "title": "Applications web, mobile et desktop",
  "summary": "Utiliser minddy dans un navigateur, installer l’application iOS, l’application web ou l’application desktop, et configurer les notifications de l’appareil.",
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
    "A03",
    "A13"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 21,
  "sourceRevision": 21,
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
      "components/mobile-navigation.tsx",
      "components/auth/auth-entry.tsx",
      "components/issue-side-panel.tsx",
      "components/assistant-panel.tsx",
      "public/sw.js",
      "components/marketing/mobile-pwa-install-guide.tsx",
      "components/marketing/mobile-install-guide-copy.ts",
      "content/knowledge/desktop-and-speed.md",
      "app/(marketing)/download/page.tsx",
      "components/settings/account-desktop-section.tsx",
      "docs/linux-desktop.md",
      "components/settings/account-push-devices-section.tsx",
      "lib/desktop/notification-capabilities.ts",
      "lib/query-snapshot-budget.ts",
      "lib/query-persistence.ts",
      "lib/desktop/renderer-recovery.ts",
      "desktop/src/main.ts",
      "lib/query-retention.ts",
      "lib/pull-request-tab-labels.ts",
      "lib/desktop/window-stall-recovery.ts",
      "lib/desktop/local-recovery-load.ts",
      "scripts/desktop-renderer-hang.integration.mjs",
      "lib/use-desktop-notifications.ts",
      "lib/use-desktop-notifications.test.ts",
      "lib/query-provider.tsx",
      "lib/navigation-working-set.ts",
      "lib/query-storage-writes.test.ts",
      "lib/local-snapshot-security.test.ts",
      "components/settings/account-settings-page.tsx",
      "components/desktop/server-choice.tsx",
      "components/desktop/server-choice-entry.tsx",
      "lib/desktop/server-choice.ts",
      "desktop/src/menu.ts",
      "components/auth/auth-chrome.tsx",
      "lib/desktop/window-material.ts",
      "components/ui/mobile-sheet.tsx",
      "lib/sheet-swipe-dismiss.ts",
      "mobile/README.md",
      "components/mobile/shell.tsx",
      "components/mobile/ai-consent-gate.tsx",
      "lib/mobile/ai-consent.ts",
      "lib/server/ai-consent.ts",
      "components/settings/account-mobile-section.tsx",
      "lib/mobile/haptics.ts",
      "lib/apple-app-site-association.ts",
      "lib/mobile/public-links.ts",
      "lib/native-app.ts"
    ]
  },
  "review": {
    "revision": 21,
    "fact": "agent:claude-code (MIN-973 iOS app: new ios-app section with sign-in, server choice, offline screen, universal links, push, vibrations, purchases hidden and AI consent, and the iOS app in the PWA and notification passages; checked against mobile/README.md, components/mobile/shell.tsx, components/auth/auth-chrome.tsx, components/mobile/ai-consent-gate.tsx, lib/mobile/ai-consent.ts, lib/server/ai-consent.ts, components/settings/account-mobile-section.tsx, lib/apple-app-site-association.ts and the catalogs; not walked through on a device or on the App Store listing; 3 figures captured on 2026-11-13 from the local candidate in a phone-sized page with the shell bridge stubbed, inspected in all six locales; earlier figures kept with their capture dates); agent:claude-code (MIN-896 bottom sheets closed by a downward swipe, after the list scrolls back to its top; checked against components/ui/mobile-sheet.tsx and lib/sheet-swipe-dismiss.ts and their tests; not checked on a physical phone; rest of the article unchanged since the previous review; no figure recaptured, existing figures do not show the gesture); agent:claude-code (0.30.0 release review, MIN-794: its evidence changes in the v0.20.0..0.30.0 delta were documented by the pull requests that made them; the article was updated by pull requests in that delta; not re-audited line by line; 4 screenshot(s) recaptured on 2026-11-04 from a local candidate against the preview demo account and inspected, 1 kept with their earlier capture; no browser walkthrough of the procedures); agent:claude-code (MIN-907 phone menu opened from the bottom bar as a sheet, and the desktop app's first launch on the single sign-in and sign-up screen: checked against components/mobile-navigation.tsx, components/auth/auth-entry.tsx, components/auth/auth-chrome.tsx and desktop/src/main.ts; no browser walkthrough; existing figures do not show the bottom bar or the sign-in screen and were kept); agent:claude-code (MIN-907 store submission prep: the browser-install passage no longer states that minddy has no App Store app, ahead of the iOS app; checked against messages/*.json DownloadMobile.noteBody; no figure affected)",
    "language": "agent:claude-code (fr MIN-973 iOS app section and passages, with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance); agent:claude-code (fr changed passage on closing bottom sheets, in the locale's register and glossary; self-reviewed; agent review, not human acceptance); agent:claude-code (fr MIN-907 phone menu and desktop first-launch passages, with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance); agent:claude-code (fr MIN-907 browser-install sentence, in the locale's register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-13"
  },
  "related": [
    "issues"
  ],
  "aliases": [
    "web-and-mobile",
    "install-the-pwa",
    "desktop-app",
    "desktop-and-speed",
    "devices-and-notifications",
    "ios-app"
  ],
  "tags": [
    "Travailler sur le web et sur mobile",
    "Installer l’application iOS",
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
      "revision": 21,
      "reviewed": true,
      "capturedAt": "2026-11-04",
      "viewport": [
        438,
        1032
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "ios-app-sign-in",
      "kind": "screenshot",
      "src": "/documentation/fr/ios-app-sign-in.png",
      "alt": "L’écran Connexion ou inscription de l’application iOS, avec le champ e-mail, les boutons Apple, Google et GitHub et Auto-héberger minddy.",
      "caption": "Dans l’application iOS, Auto-héberger minddy suit les services de connexion. Les fenêtres de connexion d’Apple et du système ne figurent pas sur cette capture.",
      "revision": 21,
      "reviewed": true,
      "capturedAt": "2026-11-13",
      "viewport": [
        386,
        502
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "ios-app-ai-consent",
      "kind": "screenshot",
      "src": "/documentation/fr/ios-app-ai-consent.png",
      "alt": "La fenêtre Utiliser les fonctions d'IA ? de l’application iOS, avec Pas maintenant et Autoriser.",
      "caption": "La question posée une fois sur chaque appareil avant toute fonction d’IA. Pas maintenant laisse les fonctions d’IA désactivées dans l’application.",
      "revision": 21,
      "reviewed": true,
      "capturedAt": "2026-11-13",
      "viewport": [
        442,
        538
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "ios-app-mobile-preferences",
      "kind": "screenshot",
      "src": "/documentation/fr/ios-app-mobile-preferences.png",
      "alt": "La rubrique Application mobile des préférences de l’application iOS, avec les interrupteurs Vibrations et Fonctions d'IA.",
      "caption": "Cette rubrique n’apparaît que dans l’application iOS. Fonctions d'IA change la réponse donnée à la question du premier lancement.",
      "revision": 21,
      "reviewed": true,
      "capturedAt": "2026-11-13",
      "viewport": [
        418,
        305
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "install-the-pwa-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/install-the-pwa-workflow.png",
      "alt": "Guide Safari illustré de minddy : Partager, Sur l’écran d’accueil puis confirmer.",
      "caption": "Le guide public illustre les trois étapes Safari et le maintien de l’option Ouvrir comme app web. Il s’agit d’illustrations pédagogiques affichées par minddy, pas de captures d’une installation iOS effectuée.",
      "revision": 21,
      "reviewed": true,
      "capturedAt": "2026-11-04",
      "viewport": [
        1488,
        762
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "devices-and-notifications-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/devices-and-notifications-workflow.png",
      "alt": "Réglages push indiquant un blocage du navigateur et aucun appareil inscrit.",
      "caption": "Ce navigateur bloque les notifications. Rétablissez l’autorisation du site avant d’inscrire cet appareil.",
      "revision": 21,
      "reviewed": true,
      "capturedAt": "2026-11-04",
      "viewport": [
        816,
        196
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "devices-and-notifications-registered-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/devices-and-notifications-registered.png",
      "alt": "Appareil navigateur enregistré et actif sur le compte, avec la date réelle du dernier envoi.",
      "caption": "Le compte possède un appareil navigateur enregistré et actif. La liste indique les dates d’inscription et du dernier envoi. La permission du navigateur et les réglages du système restent nécessaires pour afficher une bannière.",
      "revision": 21,
      "reviewed": true,
      "capturedAt": "2026-11-04",
      "viewport": [
        816,
        208
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "desktop-renderer-recovery",
      "kind": "screenshot",
      "src": "/documentation/fr/desktop-renderer-recovery.png",
      "alt": "Page locale de récupération après un crash forcé du moteur de rendu, avec les commandes Reload window et Check server settings.",
      "caption": "Page de récupération dans l’application de développement macOS, avec un profil isolé et un serveur de démonstration. Le shell natif utilise des libellés anglais dans toutes les langues.",
      "revision": 21,
      "reviewed": true,
      "capturedAt": "2026-10-28",
      "viewport": [
        1280,
        860
      ],
      "theme": "light",
      "padding": 0,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "web-and-mobile-workflow",
    "ios-app-sign-in",
    "ios-app-ai-consent",
    "ios-app-mobile-preferences",
    "install-the-pwa-workflow",
    "devices-and-notifications-workflow",
    "devices-and-notifications-registered-workflow",
    "desktop-renderer-recovery"
  ]
}
---

Accédez à la même instance depuis un navigateur, l’application iOS, une application web installée ou l’application desktop. Suivez les étapes d’installation adaptées à votre appareil, puis vérifiez la connexion réseau, les mises à jour et les autorisations de notification de cette plateforme.

## Travailler sur le web et sur mobile {#web-and-mobile}

Ouvrez l’adresse de votre instance et connectez-vous à celle-ci. Sur un écran étroit, ouvrez le menu, à gauche de la barre en bas de l’écran, pour choisir un projet, puis ouvrez un ticket depuis la liste ou le tableau. Consultez ses détails dans le panneau adapté à l’écran, modifiez le champ voulu ou ajoutez un commentaire, puis attendez le résultat de l’enregistrement avant de fermer. Fermez le panneau de détails pour revenir à la liste ; sa présentation mobile diffère de celle d’un écran large.

Sur un téléphone, les menus, les sélecteurs et les boîtes de dialogue s’ouvrent dans une feuille inférieure. Fermez-la avec son bouton de fermeture ou en la faisant glisser vers le bas ; si sa liste a défilé, le geste la ramène d’abord en haut.

Ouvrez Numo avec son bouton flottant ou une action contextuelle du ticket. Vérifiez le contexte du ticket dans le champ de saisie. Si un panneau masque le contenu dont vous avez besoin, fermez-le avant de poursuivre la navigation. Sur un écran tactile, utilisez les boutons et menus explicites : les actions au survol et les raccourcis d’un ordinateur ne sont pas toujours disponibles.

### Clavier et connexion {#access}

Au clavier, vous pouvez placer le focus sur les contrôles et utiliser la palette de commandes pour naviguer ou effectuer les actions courantes. Le bouton d’envoi reste une alternative au raccourci clavier. Suivez le raccourci affiché par l’application pour votre plateforme.

Le navigateur et l’application web installée ont besoin d’une connexion réseau pour accéder aux données des projets et enregistrer les modifications. Le service worker gère les notifications push sans fournir de cache de données hors ligne. Après une coupure, vérifiez si la modification a été enregistrée avant de la répéter. Installer la PWA ne crée pas de compte distinct et ne modifie pas les permissions de l’instance.

![Panneau mobile d’un ticket avec titre, description, propriétés et zone de commentaire.](/documentation/fr/web-and-mobile-workflow.png)

## Installer l’application iOS {#ios-app}

Sur iPhone et iPad, installez minddy depuis l’App Store. L’application demande iOS 15 ou une version ultérieure. Elle affiche l’interface du serveur auquel elle est connectée, minddy Cloud ou votre propre instance : les nouvelles fonctions de minddy y arrivent sans mise à jour de l’application.

Au premier lancement, quelques écrans présentent minddy ; **Commencer** mène à **Connexion ou inscription**. Saisissez votre adresse e-mail et choisissez **Continuer**, ou utilisez **Continuer avec Apple**, **Continuer avec Google** ou **Continuer avec GitHub**. Apple ouvre sa propre fenêtre de connexion ; Google et GitHub ouvrent la fenêtre de connexion du système par-dessus l’application, qui reprend la main une fois la connexion terminée. La suite se déroule comme sur le web ; voir [Créer un compte et se connecter](/fr/documentation/accounts#account-access).

Pour utiliser une instance auto-hébergée, touchez **Auto-héberger minddy** sous les options de connexion. Sur **Connectez-vous à votre serveur**, saisissez l’adresse de l’instance dans **Adresse du serveur** et touchez **Se connecter**. Les serveurs distants exigent HTTPS ; une adresse saisie sans protocole utilise HTTPS. **Retour** ramène à l’écran de connexion et, lorsque l’application est sur un serveur auto-hébergé, **Utiliser minddy Cloud** revient à Cloud. Les comptes appartiennent à leur instance : connectez-vous avec le compte du serveur choisi. **Auto-héberger minddy** n’apparaît que sur l’écran de connexion : déconnectez-vous d’abord pour changer de serveur.

Si le serveur ne répond pas, l’application affiche **Impossible de se connecter au serveur**, ou **Vous êtes hors ligne** lorsque l’appareil n’a pas de réseau. **Réessayer** recharge la page, et l’application réessaie aussi d’elle-même au retour du réseau. **Changer de serveur** ouvre **Connectez-vous à votre serveur**.

![L’écran Connexion ou inscription de l’application iOS, avec le champ e-mail, les boutons Apple, Google et GitHub et Auto-héberger minddy.](/documentation/fr/ios-app-sign-in.png)

### Liens, notifications, vibrations et facturation {#ios-app-operation}

Un lien vers `www.minddy.app` touché dans Mail, Messages ou Notes ouvre l’application sur cette page, qu’elle soit lancée ou non : un ticket, un projet, une page, ou un lien d’e-mail qui confirme votre compte, réinitialise votre mot de passe ou accepte une invitation. Les liens vers la facturation, le site public, ce manuel et les liens de partage publics s’ouvrent toujours dans le navigateur. Les liens vers une instance auto-hébergée s’ouvrent dans le navigateur, et tant que l’application est connectée à un serveur auto-hébergé, un lien minddy Cloud s’ouvre dans Safari. Dans l’application, les liens vers le site public, comme les tarifs, le manuel ou les pages légales, s’ouvrent dans une fenêtre Safari par-dessus l’application.

Pour recevoir les notifications push, ouvrez **Paramètres du compte** → **Notifications** dans l’application et activez **Prévenir cet appareil**. iOS demande l’autorisation la première fois ; les notifications arrivent ensuite même lorsque l’application est fermée. En toucher une ouvre le ticket, la page ou l’élément dont elle parle. Si iOS bloque les notifications, **Ouvrir Réglages** ouvre les réglages de notification de minddy dans l’app Réglages. Voir [Activer les notifications d’un appareil](#devices-and-notifications).

L’application vibre légèrement quand vous choisissez une option, basculez un interrupteur ou copiez quelque chose, et plus nettement quand vous créez un ticket ou un objectif, terminez un ticket ou envoyez un commentaire. Pour couper ces vibrations, ouvrez **Paramètres du compte** → **Préférences** → **Application mobile** et désactivez **Vibrations**. Le réglage appartient à votre compte et vous suit sur vos autres téléphones.

L’application ne vend rien. Elle n’affiche ni la page de facturation, ni les offres, ni les boutons de passage à une offre supérieure, et une fonction absente de votre offre le signale sans proposer de changer d’offre. Gérez votre abonnement dans un navigateur, sur le site de minddy ; l’application reconnaît votre offre dès que vous vous connectez.

### Autoriser ou refuser les fonctions d’IA {#ios-app-ai}

Numo, Smart Fill, la dictée et la recherche envoient le contenu qu’ils traitent (texte des tickets, commentaires, pages, enregistrements) au fournisseur du modèle d’IA utilisé par l’instance. Avant la première de ces requêtes, l’application demande **Utiliser les fonctions d'IA ?** une fois sur chaque appareil, après la connexion et les étapes de prise en main. La politique de confidentialité, accessible depuis la fenêtre, nomme les fournisseurs. Choisissez **Autoriser** pour utiliser les fonctions d’IA, ou **Pas maintenant** pour les laisser désactivées dans cette application. Fermer la fenêtre sans choisir repose la question au lancement suivant. La déconnexion efface la réponse : le prochain compte connecté sur l’appareil se voit reposer la question.

Si vous refusez, l’application ne lance aucun travail d’IA : envoyer un message à Numo, dicter ou solliciter une autre fonction d’IA rouvre la fenêtre pour que vous puissiez l’autoriser depuis cet endroit. Un nouveau ticket est créé sans Smart Fill, la recherche de tickets ne trouve les tickets que par leurs mots, sans la [recherche par le sens](/fr/documentation/navigation#search-by-meaning), et une mention de Numo dans un commentaire reste sans réponse. Le reste de minddy fonctionne normalement. Le web et l’application desktop ne posent jamais cette question, et refuser dans l’application ne limite pas ce que vous y faites. Votre dernière réponse s’applique en revanche au travail d’IA que minddy mène en arrière-plan sur votre compte : après **Pas maintenant**, Smart Assign et Smart Fill dans les projets dont vous êtes propriétaire, vos routines planifiées et les rappels de Numo n’utilisent plus l’IA.

Pour changer de réponse, ouvrez **Paramètres du compte** → **Préférences** → **Application mobile** et activez ou désactivez **Fonctions d'IA**.

![La fenêtre Utiliser les fonctions d'IA ? de l’application iOS, avec Pas maintenant et Autoriser.](/documentation/fr/ios-app-ai-consent.png)

![La rubrique Application mobile des préférences de l’application iOS, avec les interrupteurs Vibrations et Fonctions d'IA.](/documentation/fr/ios-app-mobile-preferences.png)

## Installer l’application web sur téléphone ou tablette {#install-the-pwa}

Sur iPhone et iPad, l’[application iOS](#ios-app) est le choix habituel. L’application web installée reste disponible sur Android et pour qui préfère le navigateur.

Ouvrez l’instance minddy voulue dans Safari sur iPhone ou iPad, ou dans Chrome ou un autre navigateur Android compatible. Si le lien s’est ouvert à l’intérieur d’une autre application, ouvrez-le d’abord dans le navigateur complet. Pour une instance self-hosted, utilisez l’adresse de votre propre serveur.

Sur iOS, ouvrez Partager, choisissez Sur l’écran d’accueil, gardez Ouvrir comme app web activé, puis touchez Ajouter. Selon la présentation de Safari, ouvrez Plus avant Partager. Si l’action manque, consultez Modifier les actions.

Sur Android, utilisez la proposition d’installation ou choisissez Installer l’application ou Ajouter à l’écran d’accueil dans le menu du navigateur, puis confirmez Installer. Les libellés dépendent du navigateur. Ouvrez la nouvelle icône et connectez-vous avec le compte de cette instance. Le navigateur installe ainsi minddy comme une app web.

### Mises à jour, accès hors ligne et notifications {#operation}

L’installation ne crée pas de copie hors ligne du projet. Le service worker de minddy gère uniquement les notifications push et ne met pas les requêtes de l’application en cache. Gardez une connexion réseau et rechargez la page pour obtenir le contenu web actuel. Les notifications nécessitent aussi un navigateur compatible, son autorisation et une configuration push côté serveur. Sur iOS, utilisez l’application installée lorsque le parcours le demande. Si l’option d’installation manque, ouvrez un navigateur complet compatible et vérifiez si l’instance est déjà installée.

![Guide Safari illustré de minddy : Partager, Sur l’écran d’accueil puis confirmer.](/documentation/fr/install-the-pwa-workflow.png)

## Installer et gérer l’application desktop {#desktop-app}

Ouvrez la page publique de téléchargement. Sur macOS, choisissez le paquet Apple silicon ou Intel. Sur Windows, installez l’application depuis Microsoft Store. Sur Linux, choisissez une AppImage ou un paquet `deb`/`rpm` signé correspondant à x64 ou ARM64. Suivez le guide de la plateforme et les instructions de vérification du paquet. Windows ne propose pas d’installeur `exe`. L’application macOS nécessite macOS 13 (Ventura) ou une version ultérieure ; sur une version plus ancienne, une application déjà installée conserve sa version actuelle et ne reçoit plus de mises à jour.

Au premier lancement, l’application ouvre l’écran **Connexion ou inscription** de minddy Cloud, où vous vous connectez ou créez votre compte. Pour utiliser plutôt votre propre instance, cliquez sur **Auto-héberger minddy**, en bas de cet écran. Ce bouton ouvre **Auto-héberger minddy**, qui propose trois choix : **Installer sur cet ordinateur** prépare une [instance locale](/fr/documentation/install-locally#install-locally), **Installer sur un serveur** ouvre dans votre navigateur le guide public d’installation d’un serveur, et **Utiliser une installation existante** ouvre un écran qui regroupe les installations dont vous disposez déjà. Sur cet écran, **Sur cet ordinateur** ouvre un dossier minddy déjà présent sur cet ordinateur, que l’application démarre ; en dessous, **Adresse du serveur** avec **Se connecter** rejoint un serveur que vous gérez. Les serveurs distants exigent HTTPS ; `localhost` peut utiliser HTTP.

Pour changer de serveur plus tard, choisissez **Connect to a Server…** dans le menu natif minddy (ce menu natif est en anglais ; sous Windows et Linux, appuyez sur Alt pour afficher la barre de menus), **Changer…** à côté de **Serveur connecté** dans **Paramètres du compte** → **Préférences** → **Application de bureau**, ou **Auto-héberger minddy** en bas de l’écran **Connexion ou inscription**. Chacun amène la fenêtre de l’application sur **Auto-héberger minddy** ; lorsqu’un serveur auto-hébergé est connecté, **Utiliser minddy Cloud**, dans **Utiliser une installation existante**, ramène à Cloud. Le chemin en haut de la page ramène à chaque étape, et le logo minddy ramène à l’application. Cet écran est intégré à l’app de bureau et s’ouvre sans connexion Internet. Vérifiez la destination avant de vous connecter : chaque compte appartient à son instance. OAuth utilise le navigateur système puis revient à l’application desktop.

Sous macOS et Windows 11, la barre latérale, les onglets et les bords de la fenêtre laissent voir votre bureau, flouté, derrière le contenu opaque. Une fenêtre en plein écran reste opaque, et la transparence revient quand elle quitte le plein écran. Pour garder la fenêtre opaque sur cet appareil, désactivez **Transparence de l’app de bureau** dans **Paramètres du compte** → **Préférences** → [Apparence](/docs/accounts#preferences).

### Onglets, fermeture et mises à jour {#desktop-app-operation}

Utilisez les commandes des onglets et la palette de commandes pour naviguer entre vos travaux. Suivez les raccourcis affichés pour votre plateforme : macOS utilise Command là où Windows et Linux utilisent généralement Control. Fermer la fenêtre la masque et laisse l’application active. Utilisez Quitter pour terminer l’application ; macOS propose Cmd+Q. Les notifications en arrière-plan dépendent du paquet et des capacités de la plateforme.

macOS et les AppImage portables proposent les mises à jour dans l’application. Windows se met à jour depuis Microsoft Store. Pour `deb`/`rpm`, installez le nouveau paquet vérifié. Dans l’app de bureau, **Paramètres du compte** → **Préférences** → **Application de bureau** affiche le serveur connecté et la version de l’application, avec une vérification des mises à jour lorsque le paquet la prend en charge. Sur le web, la même carte mène à la page de téléchargement. Après une mise à jour, vérifiez la version desktop affichée et confirmez que l’instance voulue s’ouvre toujours.

### Récupérer une fenêtre arrêtée {#desktop-renderer-recovery}

Si une fenêtre desktop plante, une page locale de récupération propose **Reload window**. Utilisez ce bouton pour rouvrir le dernier écran sur le serveur actuellement sélectionné. Les modifications non enregistrées peuvent être perdues. L’application attend votre action au lieu de recharger en boucle la page qui échoue. Si la page de récupération échoue aussi, le message natif vous demande de quitter puis de rouvrir minddy. Ces commandes natives de récupération utilisent actuellement des libellés anglais.

Si une page charge encore après 30 secondes, ou si une fenêtre reste bloquée pendant cinq secondes après détection par l’application desktop, une boîte de dialogue native propose **Wait** et **Recover window**. **Wait** est le choix par défaut et conserve votre travail ainsi que la requête en cours. La boîte se ferme si le chargement se termine ou si la fenêtre répond à nouveau. La récupération peut perdre les modifications non enregistrées : choisissez **Recover window** pour ouvrir la page locale de récupération, puis **Reload window** pour revenir au dernier écran.

Le cache de requêtes enregistré, qui est facultatif, peut contenir jusqu’à 2 Mio de données. Si le cache complet est trop volumineux, minddy conserve des résultats de requêtes complets qui peuvent être enregistrés, en privilégiant au besoin les vues en cours et les onglets de la barre. Si cette sélection dépasse encore la limite, l’ancien instantané local est supprimé. Les données exclues du cache enregistré restent en mémoire pendant la session et sont relues au besoin après un redémarrage. Les brouillons enregistrés séparément ne sont pas affectés. Ce cache ne constitue pas une sauvegarde de votre travail.

Pour réduire la mémoire utilisée lors de longues sessions, les détails de PR, les diffs de commits et les contenus de pages inactifs sont libérés après une minute, puis relus au besoin. Les requêtes actives sont conservées. Les libellés d’onglets ne gardent que des informations légères sur les PR : laisser un onglet ouvert ne conserve donc pas ses patches.

![Page locale de récupération après un crash forcé du moteur de rendu, avec les commandes Reload window et Check server settings.](/documentation/fr/desktop-renderer-recovery.png)

## Activer les notifications d’un appareil {#devices-and-notifications}

Ouvrez les notifications dans les réglages du compte sur l’appareil à enregistrer. Activez-les et acceptez la demande d’autorisation du navigateur ou du système. Une autorisation refusée doit être modifiée dans les réglages du navigateur ou du système ; actionner plusieurs fois le contrôle de minddy ne contourne pas ce refus. L’[application iOS](#ios-app-operation) s’enregistre directement. Dans Safari sur iPhone ou iPad, installez et ouvrez d’abord l’application web lorsque l’interface le demande.

Vérifiez que l’appareil apparaît dans la liste et utilisez son contrôle de test. Consultez les informations sur la dernière livraison. Vous pouvez désactiver ou retirer des enregistrements individuels sans supprimer le compte. Les catégories de **Paramètres du compte** → **Notifications** déterminent quels événements vous notifient ; la boîte de réception intégrée reste disponible lorsque le push ne l’est pas.

![Réglages push indiquant un blocage du navigateur et aucun appareil inscrit.](/documentation/fr/devices-and-notifications-workflow.png)

### Conditions des plateformes {#platforms}

Le push web exige un navigateur pris en charge et un service push configuré dans l’instance. Les notifications natives et la livraison en arrière-plan diffèrent selon la plateforme. L’application iOS reçoit les notifications par APNs, même lorsqu’elle est fermée. L’application macOS distribuée et signée prend en charge APNs ; le paquet Windows exige son composant WNS facultatif pour le transport en arrière-plan. Linux utilise la session en arrière-plan de l’application distribuée plutôt qu’APNs ou WNS.

Si le serveur sélectionné ne dispose pas de configuration APNs ou WNS, l’application desktop utilise des notifications natives locales tant qu’elle reste ouverte ou masquée. Ce relais ne livre plus de notifications après avoir quitté l’application.

Vérifiez l’autorisation de notification du système, l’état d’installation dans le navigateur et l’explication affichée si la fonction n’est pas configurée ou prise en charge. Un test réussi ne garantit pas la livraison hors ligne ou sous toutes les restrictions d’arrière-plan du système. Gardez l’application ou son service d’arrière-plan configuré disponible, selon les exigences de la plateforme.

![Appareil navigateur enregistré et actif sur le compte, avec la date réelle du dernier envoi.](/documentation/fr/devices-and-notifications-registered.png)
