---
{
  "id": "accounts",
  "locale": "fr",
  "title": "Comptes",
  "summary": "Créez et protégez votre compte, récupérez votre accès, modifiez vos préférences et comprenez la suppression du compte.",
  "topic": "Premiers pas",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "S02",
    "A02",
    "S03",
    "A01",
    "A09"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 23,
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
      "app/(auth)/signup/page.tsx",
      "components/auth/auth-entry.tsx",
      "components/auth/auth-chrome.tsx",
      "lib/auth-entry.ts",
      "app/api/auth/lookup/route.ts",
      "components/first-run/first-run-gate.tsx",
      "components/first-run/profile-setup-screen.tsx",
      "components/first-run/onboarding-screen.tsx",
      "lib/first-run.ts",
      "lib/password-policy.ts",
      "app/(auth)/login/page.tsx",
      "app/auth/confirm/page.tsx",
      "components/settings/account-security-section.tsx",
      "app/api/account/mfa/route.ts",
      "app/api/account/mfa/recovery-codes/route.ts",
      "app/api/account/mfa/recover/route.ts",
      "lib/server/mfa.ts",
      "app/(auth)/reset-password/page.tsx",
      "docs/self-hosting-auth.md",
      "content/knowledge/settings-and-data.md",
      "components/settings/account-profile-section.tsx",
      "components/settings/account-preferences-section.tsx",
      "app/api/me/avatar/route.ts",
      "lib/server/avatar-seeds.ts",
      "components/settings/account-analytics-section.tsx",
      "components/settings/account-data-section.tsx",
      "app/api/account/deletion-preview/route.ts",
      "app/api/account/route.ts",
      "lib/server/apple-sign-in.ts",
      "supabase/migrations/20270109200046_list_auth_sessions.sql",
      "supabase/migrations/20270109200047_revoke_auth_session.sql",
      "lib/theme-presets.ts",
      "app/theme-presets.css",
      "components/settings/account-settings-page.tsx",
      "components/settings/account-desktop-section.tsx",
      "components/settings/account-issues-section.tsx",
      "components/settings/account-hidden-projects-section.tsx",
      "lib/settings-sections.ts",
      "components/app-sidebar.tsx",
      "components/mobile-account.tsx",
      "lib/keyboard/shortcuts.ts",
      "desktop/src/local-installer.ts",
      "desktop/src/local-account.ts",
      "lib/week-start.ts",
      "components/settings/account-numo-section.tsx",
      "lib/use-onboarding.ts",
      "lib/onboarding.ts",
      "components/settings/account-mobile-section.tsx"
    ]
  },
  "review": {
    "revision": 23,
    "fact": "agent:claude-code (MIN-973: Self-host minddy in the iOS app and the Mobile app card of Preferences; checked against components/auth/auth-chrome.tsx and components/settings/account-mobile-section.tsx; no figure affected); agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 4 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:/root (MIN-765 desktop preview channel removal: source review of components/settings/account-desktop-section.tsx and desktop/src/menu.ts; the Desktop app card no longer lists a preview channel; unchanged evidence retained; no browser walkthrough, no new captures); agent:claude-code (MIN-762 UI label correction: quoted labels aligned on the corrected fr catalog; no behavior change, no new captures); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted); agent:claude-code (MIN-781 self-hosting from the desktop app: source review of components/desktop/server-choice.tsx, desktop/src/local-installer.ts and desktop/src/local-account.ts; the account-access section now states that a local instance installed by the desktop app has no signup; no installation run, no screenshot recaptured, existing figures carried forward unchanged); agent:claude-code (MIN-881 first day of the week: source review of lib/week-start.ts, components/settings/account-preferences-section.tsx, components/calendar.tsx, lib/routine-schedule.ts, lib/routine-week-order.ts, components/stats/activity-heatmap.tsx and lib/mention-date.ts; new preferences paragraph; localized mention example checked against the parser; no browser walkthrough, no screenshot recaptured, existing figures carried forward unchanged); agent:claude-code (MIN-885: email written e-mail as in the fr catalog; wording only, no figure recaptured); agent:claude-code (0.30.0 release review, MIN-794: its evidence changes in the v0.20.0..0.30.0 delta were documented by the pull requests that made them; the article was updated by pull requests in that delta; not re-audited line by line; 4 screenshot(s) recaptured on 2026-11-04 from a local candidate against the preview demo account and inspected; no browser walkthrough of the procedures); agent:claude-code (MIN-954 settings split: account settings paths moved from the former AI & Numo tab to the Numo, AI and MCP tabs, checked against components/settings/account-settings-page.tsx, components/settings/account-numo-section.tsx and messages/*.json; no browser walkthrough; existing figures kept, not recaptured); agent:claude-code (MIN-907 single sign-in and sign-up screen, first-run profile page and phone getting-started tour: checked against components/auth/auth-entry.tsx, components/auth/auth-chrome.tsx, lib/auth-entry.ts, app/api/auth/lookup/route.ts, components/first-run/first-run-gate.tsx, components/first-run/profile-setup-screen.tsx, components/first-run/onboarding-screen.tsx, lib/first-run.ts and messages/*.json; no browser walkthrough; existing figures do not show these screens and were kept); agent:claude-code (MIN-907 tour follow-up: skip confirmation, final screen with confetti, Home after the tour and the issue step completed on creation, checked against components/first-run/onboarding-screen.tsx, lib/use-onboarding.ts and messages/*.json; no browser walkthrough; existing figures do not show the tour and were kept); agent:claude-code (MIN-907 four-step tour: the cycles step left the getting-started steps (lib/onboarding.ts ONBOARDING_STEPS, components/sidebar-onboarding.tsx); the phone tour's Back and Skip row, Back from the first step returning to the profile page, and the skip confirmation checked against components/first-run/onboarding-screen.tsx and messages/*.json; no browser walkthrough; existing figures do not show the tour and were kept); agent:claude-code (MIN-964 tour on every platform: the full-screen getting-started steps now also run on a computer, their actions open dialogs, the issue step offers the CSV import to a project owner on a computer, and the sidebar checklist is gone; checked against components/first-run/first-run-gate.tsx, components/first-run/onboarding-screen.tsx, components/app-sidebar.tsx and messages/*.json; no browser walkthrough; existing figures do not show the tour and were kept)",
    "language": "agent:claude-code (fr MIN-973 iOS app sentence, with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance); agent:/root/min747 (fr translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root (fr MIN-765 removal edit; retained-meaning self-review; agent review, not human acceptance); agent:claude-code (fr MIN-762 label edit; self-reviewed; agent review, not human acceptance); agent:claude-code (fr manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance); agent:claude-code (fr MIN-781 changed passages on local instances from the desktop app, with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (fr MIN-881 first-day-of-week paragraph with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (fr MIN-954 settings paths with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (fr MIN-907 account-access section rewritten for the single sign-in and sign-up screen and the first-run screens, with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance); agent:claude-code (fr MIN-907 tour follow-up tour passage with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance); agent:claude-code (fr MIN-907 four-step tour passage with Back and Skip, with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance); agent:claude-code (fr MIN-964 changed passages on the tour on every platform, with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-13"
  },
  "related": [
    "choose-an-instance",
    "projects",
    "authentication-and-email",
    "applications",
    "automation-settings",
    "transfer-between-instances"
  ],
  "aliases": [
    "account-access",
    "account-security",
    "account-recovery",
    "profile-and-preferences",
    "settings-and-data",
    "privacy-and-account-deletion"
  ],
  "tags": [
    "Créer un compte et se connecter",
    "Protéger son compte avec un second facteur",
    "Récupérer l’accès à votre compte",
    "Modifier son profil et ses préférences",
    "Gérer la confidentialité et supprimer son compte"
  ],
  "figures": [
    {
      "id": "account-security-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/account-security-workflow.png",
      "alt": "Carte de double authentification avec le bouton Activer.",
      "caption": "Commencez ici, puis vérifiez l’authentificateur et conservez les codes de récupération à l’abri.",
      "revision": 23,
      "reviewed": true,
      "capturedAt": "2026-11-04",
      "viewport": [
        816,
        227
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "profile-and-preferences-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/profile-and-preferences-workflow.png",
      "alt": "En-tête du profil avec l’avatar et son badge de modification, le nom et l’adresse e-mail en lecture seule.",
      "caption": "Sélectionnez l’avatar pour en générer ou en importer un, ou le nom pour le changer ; l’adresse e-mail reste en lecture seule.",
      "revision": 23,
      "reviewed": true,
      "capturedAt": "2026-11-04",
      "viewport": [
        816,
        256
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "profile-and-preferences-preferences-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/profile-and-preferences-preferences-workflow.png",
      "alt": "Sélecteur de langue, commandes des thèmes clair, sombre et système, sélecteurs de palette des modes clair et sombre et interrupteur de transparence.",
      "caption": "La langue du compte et celle du site public se règlent séparément.",
      "revision": 23,
      "reviewed": true,
      "capturedAt": "2026-11-04",
      "viewport": [
        816,
        491
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "privacy-and-account-deletion-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/privacy-and-account-deletion-workflow.png",
      "alt": "Aperçu de suppression listant les projets possédés, les tickets et les membres privés d’accès.",
      "caption": "Lisez l’aperçu et exportez les données à conserver avant d’ouvrir la confirmation de suppression.",
      "revision": 23,
      "reviewed": true,
      "capturedAt": "2026-11-04",
      "viewport": [
        816,
        251
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "account-security-workflow",
    "profile-and-preferences-workflow",
    "profile-and-preferences-preferences-workflow",
    "privacy-and-account-deletion-workflow"
  ]
}
---

Votre compte appartient à l’instance sur laquelle vous vous êtes inscrit. Retrouvez ici la connexion, l’authentification à deux facteurs, la récupération d’accès et les préférences personnelles. Avant de supprimer le compte, vérifiez les données à exporter et les conséquences pour vos projets.

## Créer un compte et se connecter {#account-access}

Ouvrez l’écran de connexion de l’instance que vous voulez utiliser. **Connexion ou inscription** est un seul écran pour les deux, à `/login` comme à `/signup`. Le Cloud et une instance auto-hébergée ont des comptes distincts. Les services de connexion proposés et l’ouverture des inscriptions dépendent de la configuration d’authentification de l’instance. Une instance locale installée par l’application desktop n’a pas d’inscription : l’application crée votre compte et vous connecte. Consultez [Instances locales](/fr/documentation/install-locally#install-locally).

L’écran commence par votre adresse e-mail et **Continuer**. Sous **ou**, il liste les services de connexion que l’instance propose, dans cet ordre : Apple, Google et GitHub. Dans l’application desktop et l’[application iOS](/fr/documentation/applications#ios-app), **Auto-héberger minddy** les suit. Après **Continuer**, minddy vérifie ce que l’adresse détient et affiche l’une des étapes suivantes. **Modifier**, à côté de l’adresse, permet d’y revenir.

- **Saisissez votre mot de passe** : l’adresse a un compte avec mot de passe. Saisissez-le et choisissez **Se connecter**. **Mot de passe oublié ?** lance la [récupération du mot de passe](#account-recovery).
- **Choisissez un mot de passe** : l’adresse n’a pas encore de compte. Saisissez au moins huit caractères avec une minuscule (a–z), une majuscule (A–Z) et un chiffre ; les exigences sont vérifiées pendant la saisie. Choisissez **Créer mon compte**. Cette étape ne demande ni nom, ni image, ni confirmation du mot de passe.
- **Ce compte n’a pas de mot de passe** : le compte a été créé avec un service de connexion. Continuez avec le même service, ou choisissez **Définir un mot de passe**, qui ouvre la récupération du mot de passe pour cette adresse.
- **Les inscriptions sont fermées ici** : l’instance de préversion de minddy ne crée pas de compte. Son bouton mène à l’inscription sur minddy.app.

Si une confirmation est demandée, **Vérifiez votre boîte mail** s’affiche après la création du compte. Ouvrez le message envoyé par cette instance. Suivez son lien, puis activez le bouton de confirmation sur la page. Ouvrir le lien seul ne confirme pas le compte et ne consomme pas le jeton du message. Revenez ensuite dans l’application souhaitée et connectez-vous. Trop de vérifications d’adresse en peu de temps sont refusées pendant un moment : patientez avant de réessayer.

Après la première connexion, un nouveau compte s’ouvre sur **Comment vous appelle-t-on ?** avant l’application. Choisissez **Importer une image** ou **Nouvel avatar Lorelei** pour votre image, puis indiquez votre nom d’utilisateur ; le nom donné par un service de connexion est déjà saisi. Choisissez **Continuer**. Cette page apparaît une seule fois, sur toutes les plateformes ; les comptes créés avant son arrivée ne la voient jamais. Vous pourrez modifier l’un et l’autre dans votre [profil](#profile-and-preferences).

Un nouveau compte parcourt ensuite les premiers pas, sur téléphone comme sur ordinateur, une étape par page, avec des points de progression : **Créer ou rejoindre un projet**, **Ajouter un premier ticket**, **Découvrir Numo** et **Connecter un agent de code**. Le bouton de chaque étape ouvre par-dessus la page la même fenêtre que dans l’application : création de projet ou de ticket, Numo ou connexion de l’agent. Sur ordinateur, l’étape du ticket propose aussi **Importer des tickets** au propriétaire d’un projet. L’étape du ticket est validée dès que vous créez le ticket, même si Smart Fill est encore en train de le remplir. Sous les boutons de l’étape, **Retour** réaffiche l’étape précédente ; depuis la première étape, il revient à **Comment vous appelle-t-on ?**, dont le bouton **Continuer** vous ramène aux étapes. **Passer** passe à l’étape suivante. **Passer l'onboarding** demande d’abord une confirmation, car les étapes passées ne reviendront pas : confirmez avec **Passer l'onboarding**. Après la dernière étape, **Tout est prêt.** s’affiche avec une brève animation de confettis, puis **Continuer** mène à l’accueil. Passer le parcours mène aussi à l’accueil.

Le compte peut ensuite créer son projet ou accepter une invitation. Connaître l’URL d’un projet ne donne pas accès au projet.


### Déconnexion et e-mail absent {#session-and-mail}

Ouvrez le menu du compte, choisissez la déconnexion et confirmez. Dans l’application desktop, fermer une fenêtre ou un onglet laisse votre session active.

Une session reste connectée tant que vous utilisez minddy, jusqu’à un an, et se termine après 30 jours sans utilisation. Quand elle se termine, ou qu’elle est fermée depuis un autre appareil, minddy revient à l’écran de connexion avec un message indiquant que votre session a expiré. Reconnectez-vous pour reprendre là où vous étiez.

Le groupe **Sessions** de l’onglet **Sécurité** des paramètres du compte liste les navigateurs et applications desktop connectés à votre compte, signale l’appareil que vous utilisez et indique la dernière activité de chacun des autres. Pour fermer toutes les autres sessions, par exemple sur un ordinateur perdu ou partagé, choisissez **Tout déconnecter** sur la ligne **Déconnecter les autres appareils**, puis confirmez : chaque autre navigateur et chaque application desktop connectés à votre compte reviennent à l’écran de connexion. Pour fermer une seule session, choisissez **Déconnecter** sur sa ligne, puis confirmez ; seul cet appareil revient à l’écran de connexion. Dans les deux cas, l’appareil que vous utilisez reste connecté. Les applications autorisées dans **MCP** → **Applications connectées** gardent leur accès jusqu’à ce que vous le révoquiez à cet endroit.

Si le message n’arrive pas, vérifiez l’adresse, les indésirables et l’instance. En auto-hébergement, l’opérateur doit configurer l’envoi des messages Auth ; les notifications optionnelles de l’application sont un service distinct. Une confirmation expirée propose de revenir à la connexion pour demander un nouveau lien. Ne transmettez pas de lien de confirmation ou de récupération dans un diagnostic : il autorise l’accès au compte.


## Protéger son compte avec un second facteur {#account-security}

Ouvrez la section Sécurité des paramètres du compte et activez l’authentification à deux facteurs. Ce second facteur s’applique aussi aux connexions par Google, GitHub ou Apple ; l’authentification du fournisseur ne le remplace pas.

1. Scannez le code QR avec un authentificateur TOTP ou saisissez manuellement la clé de configuration affichée. N’incluez jamais le code QR ni cette clé dans une capture.
2. Saisissez le code actuel à six chiffres et confirmez. S’il a expiré, essayez le suivant ; après trop de tentatives, attendez avant de réessayer.
3. Conservez les codes de récupération dans un endroit protégé et accessible sans votre téléphone. Chaque code ne fonctionne qu’une fois et la liste n’est affichée qu’une fois. Confirmez sa sauvegarde avant de terminer.

L’activation actualise la session courante et tente de déconnecter les autres sessions. Si une nouvelle authentification est demandée après l’acceptation du code, reconnectez-vous et suivez les indications affichées.

![Carte de double authentification avec le bouton Activer.](/documentation/fr/account-security-workflow.png)

### Récupération et changements {#recovery}

Pendant la connexion, si vous n’avez pas votre téléphone, utilisez un code de récupération conservé. Son utilisation désactive l’authentification à deux facteurs et invalide tous les codes restants. Une fois connecté, configurez de nouveau votre authentificateur et conservez les nouveaux codes. Ce parcours ne garantit pas une restauration du compte par l’assistance humaine.

Remplacer les codes de récupération invalide la liste précédente. Leur remplacement et la désactivation volontaire exigent les contrôles d’authentification récente du serveur. Lisez la confirmation : désactiver cette fonction signifie que le facteur supplémentaire ne sera plus demandé, y compris lors d’une connexion par Google, GitHub ou Apple.


## Récupérer l’accès à votre compte {#account-recovery}

Sur la connexion de la bonne instance, choisissez la récupération du mot de passe et saisissez l’e-mail de votre compte. Ouvrez le message, suivez son lien et confirmez la réinitialisation. Saisissez le nouveau mot de passe sur l’écran prévu et envoyez le formulaire. Vérifiez ensuite la connexion à cette même instance.

Le lien peut expirer ou ne plus disposer d’une session active. L’écran de réinitialisation indique cette situation et permet de demander un nouveau lien. Utilisez un message récent plutôt qu’un ancien favori. N’envoyez ni lien, ni cookie, ni mot de passe au support.


### Second facteur et accès non résolu {#mfa-recovery}

Une réinitialisation du mot de passe ne supprime pas l’authentification à deux facteurs. Utilisez votre application d’authentification ou un code de récupération conservé lors de l’activation. Un code de récupération désactive la MFA du compte. Gardez ce code secret, puis réactivez la MFA dans les réglages de sécurité après avoir retrouvé l’accès.

Si aucun facteur ni code de récupération n’est disponible, contactez l’opérateur de l’instance par son canal d’assistance. Indiquez l’adresse de l’instance et l’échec observé, sans jeton ni contenu privé de projet. Si l’e-mail manque, demandez une vérification des redirections Auth et de l’envoi SMTP. Créer un autre compte ne lui donne pas les projets ou les connexions du compte initial.

## Modifier son profil et ses préférences {#profile-and-preferences}

Choisissez **Paramètres du compte** dans le menu du compte, le menu mobile ou la palette de commandes, ou appuyez sur Commande+virgule sur macOS (Ctrl+virgule sur Windows/Linux) : les paramètres du compte s’ouvrent sur l’onglet **Préférences**. Pour ouvrir directement l’onglet **Profil**, choisissez votre nom en haut du menu du compte ; vous pouvez aussi sélectionner **Profil** parmi les onglets des paramètres. Il affiche votre avatar, votre nom et votre adresse e-mail, suivis de vos [statistiques personnelles](/docs/personal-statistics). Sélectionnez votre avatar, puis choisissez **Nouvel avatar Lorelei** ou **Importer une image** ; le changement s’applique dès qu’il réussit. Sélectionnez votre nom pour le changer : sur ordinateur, il devient un champ, qu’Entrée ou un clic ailleurs enregistre et qu’Échap annule ; sur téléphone, il ouvre un panneau avec **Nom d'utilisateur** et **Enregistrer**. Le nom ne peut pas être vide. L’adresse e-mail est en lecture seule. Attendez le résultat et vérifiez l’avatar dans un commentaire ou une liste de membres ; il suit le compte entre projets et conversations. Si un fichier est refusé, suivez le message de validation plutôt que de le renvoyer à répétition.

L’image source ne doit pas dépasser 10 MiB. Le serveur vérifie les octets lisibles, applique l’orientation et recadre au centre en avatar WebP de 256 × 256.

![En-tête du profil avec l’avatar et son badge de modification, le nom et l’adresse e-mail en lecture seule.](/documentation/fr/profile-and-preferences-workflow.png)

### Choisir le comportement de l’interface {#preferences}

Dans les préférences, sélectionnez la langue et le thème puis vérifiez une autre page. La langue du compte concerne le produit connecté ; le sélecteur du site public règle sa navigation séparément. Le thème est enregistré sur le compte et partagé entre appareils.

Le thème choisit le mode clair, sombre ou système. **Palette du mode clair** et **Palette du mode sombre** règlent chacune les couleurs d'un mode. Les **couleurs d'accent** gardent les couleurs de minddy et ne recolorent que les boutons et l'anneau de focus : minddy (lavande), Noir en mode clair ou Blanc en mode sombre, Bleu, Vert, Orange et Rose ; les **palettes complètes** (Solarized, Catppuccin, Nord) recolorent toutes les surfaces ; **Contraste élevé** figure sous Accessibilité. La palette du mode affiché s'applique immédiatement ; l'autre est enregistrée et apparaît dès que son mode redevient actif, y compris quand Système suit un changement du système d'exploitation. Contraste élevé renforce le contraste du texte et des bordures, détoure les champs, menus, dialogues et onglets, marque la page courante et l'élément sélectionné, affiche toujours le focus clavier et garde les menus opaques. Désactivez **Transparence** pour rendre opaques, sans flou, les menus, les pop-overs et la palette de commandes. Palettes et transparence sont enregistrées sur le compte ; un autre appareil les applique au prochain chargement de page. Dans l’app de bureau sous macOS et Windows 11, **Transparence de l’app de bureau** laisse voir votre bureau, flouté, derrière la barre latérale, les onglets et les bords de la fenêtre, tandis que le contenu reste opaque. Ce réglage ne s’applique qu’à cet appareil et prend effet immédiatement. La fenêtre reste opaque avec une palette à contraste élevé, ou lorsque le réglage « Réduire la transparence » ou le contraste élevé de votre système est actif ; l’interrupteur est alors désactivé. Windows 10 et Linux gardent une fenêtre opaque et n’affichent pas l’interrupteur.

**Premier jour de la semaine** fixe le jour où commencent vos semaines. Le calendrier du sélecteur de date, les jours d’une routine et leur ordre dans Routines, les lignes de la grille d’activité de vos statistiques et une mention de date comme `@jeudi dans 2 semaines` le suivent. **Selon la langue** reprend l’usage de la langue de l’interface : dimanche en anglais et en portugais du Brésil, lundi dans les autres langues. Choisissez lundi, dimanche ou samedi pour le fixer vous-même. Le choix est enregistré dans le compte. Les [cycles personnels](/docs/personal-cycle) gardent leur propre jour de début.

Choisissez le raccourci d’envoi dans les réglages clavier. Il s’applique aux commentaires, à Numo et à Entrée dans le titre d’un formulaire de création ; une description garde Commande/Ctrl+Entrée, et Maj+Entrée dans un titre passe toujours à la description. Utilisez le bouton d’envoi si la plateforme intercepte le raccourci ; les touches modificatrices diffèrent selon l’OS. Les projets que vous avez masqués sont listés dans leur propre onglet **Projets masqués**, où vous pouvez les réafficher. **Préférences** contient aussi la carte **Application de bureau** : sur le web, elle mène au téléchargement de l’app de bureau ; dans l’app de bureau, elle affiche le serveur connecté et la version de l’application. Dans l’application iOS, la carte **Application mobile** la remplace, avec les interrupteurs **Vibrations** et **Fonctions d'IA** ; voir [l’application iOS](/fr/documentation/applications#ios-app-operation). Les préférences de tickets appartiennent aussi au compte et ne changent pas celles des autres membres : l’assignation automatique se trouve dans l’onglet **Tickets**, et le statut des tickets créés par Numo dans **Numo** → **Statut des tickets créés par Numo**.

![Sélecteur de langue, commandes des thèmes clair, sombre et système, sélecteurs de palette des modes clair et sombre et interrupteur de transparence.](/documentation/fr/profile-and-preferences-preferences-workflow.png)

## Gérer la confidentialité et supprimer son compte {#privacy-and-account-deletion}

Lorsque l’analytics est configuré, l’onglet **Confidentialité et données** des paramètres du compte affiche un contrôle de consentement et un lien vers la politique des cookies. Le désactiver change immédiatement le consentement aux mesures sur cet appareil et enregistre le choix dans le compte. Le choix local déjà présent sur un autre appareil peut continuer à le régir. Si aucun service analytics n’est configuré, la section est absente.

Le consentement est distinct des données nécessaires au fonctionnement du compte. Consultez la politique de confidentialité de l’instance et les fournisseurs externes que vous avez activés. En auto-hébergement, la configuration et les politiques de l’opérateur déterminent les destinations des services ; désactiver l’analytics ne retire pas les intégrations IA ou Git.

![Aperçu de suppression listant les projets possédés, les tickets et les membres privés d’accès.](/documentation/fr/privacy-and-account-deletion-workflow.png)

### Lire l’aperçu de suppression {#deletion}

Avant de supprimer le compte, exportez les données à conserver depuis l’onglet **Confidentialité et données**. Lisez l’aperçu des projets dont vous êtes propriétaire, des membres affectés, des tickets, des commentaires et de l’abonnement actif. Les conséquences sur les projets possédés touchent d’autres personnes ; réglez ces questions avant de confirmer.

Ouvrez la confirmation de suppression seulement lorsque vous êtes prêt. Saisissez **Supprimer mon compte** et, pour un compte avec mot de passe, ce mot de passe. Les comptes sans mot de passe exigent une connexion récente. Suivez les indications d’un refus d’authentification récente plutôt que de réessayer à l’aveugle. Une suppression réussie déconnecte le compte et revient au site public. Si le compte se connecte avec Apple, la suppression demande aussi à Apple de retirer l’accès de minddy à votre compte Apple. Ce n’est pas une corbeille récupérable. Gardez les exports privés et traitez les questions restantes d’abonnement ou de fournisseur dans les contrôles de facturation et de service correspondants.


## Configurer les routines {#routines}

Le travail automatique du projet se configure dans [Routines](/docs/scheduled-routines), où le propriétaire choisit un planning, un événement ou une arrivée dans une base. Les préréglages d’automatisation du compte et leurs interrupteurs de projet sont retirés. Lisez le [guide de transition](/docs/automation-settings) avant d’activer une ancienne proposition.
