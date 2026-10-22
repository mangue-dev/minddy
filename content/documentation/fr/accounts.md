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
  "revision": 16,
  "sourceRevision": 15,
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
      "app/(auth)/signup/page.tsx",
      "components/auth/signup-wizard.tsx",
      "lib/signup-wizard.ts",
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
      "lib/keyboard/shortcuts.ts"
    ]
  },
  "review": {
    "revision": 16,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 4 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:/root (MIN-765 desktop preview channel removal: source review of components/settings/account-desktop-section.tsx and desktop/src/menu.ts; the Desktop app card no longer lists a preview channel; unchanged evidence retained; no browser walkthrough, no new captures); agent:claude-code (MIN-762 UI label correction: quoted labels aligned on the corrected fr catalog; no behavior change, no new captures)",
    "language": "agent:/root/min747 (fr translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root (fr MIN-765 removal edit; retained-meaning self-review; agent review, not human acceptance); agent:claude-code (fr MIN-762 label edit; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
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
      "revision": 16,
      "reviewed": true,
      "capturedAt": "2026-10-20",
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
      "alt": "En-tête du profil avec l’avatar et son badge de modification, le nom et l’adresse email en lecture seule.",
      "caption": "Sélectionnez l’avatar pour en générer ou en importer un, ou le nom pour le changer ; l’adresse email reste en lecture seule.",
      "revision": 16,
      "reviewed": true,
      "capturedAt": "2026-10-20",
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
      "revision": 16,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        816,
        421
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
      "revision": 16,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        816,
        231
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

Ouvrez la connexion ou l’inscription de l’instance que vous voulez utiliser. Le Cloud et une instance auto-hébergée ont des comptes distincts. Les méthodes de connexion et l’ouverture des inscriptions dépendent de la configuration d’authentification de l’instance.

Pour vous inscrire par e-mail :

1. Saisissez votre adresse et passez à l’étape d’identité.
2. Indiquez un nom complet non vide et choisissez un avatar si vous le souhaitez.
3. Passez à l’étape du mot de passe. Saisissez au moins huit caractères avec une minuscule (a–z), une majuscule (A–Z) et un chiffre, puis répétez le mot de passe dans le champ de confirmation.
4. Validez cette dernière étape pour créer le compte. Quitter les étapes précédentes ne crée pas de compte.
5. Si une confirmation est demandée, ouvrez le message envoyé par cette instance. Suivez son lien, puis activez le bouton de confirmation sur la page. Ouvrir le lien seul ne confirme pas le compte et ne consomme pas le jeton du message.

Revenez dans l’application souhaitée et connectez-vous. Le compte peut créer son projet ou accepter une invitation. Connaître l’URL d’un projet ne donne pas accès au projet.


### Déconnexion et e-mail absent {#session-and-mail}

Ouvrez le menu du compte, choisissez la déconnexion et confirmez. Dans l’application desktop, fermer une fenêtre ou un onglet laisse votre session active.

Une session reste connectée tant que vous utilisez minddy, jusqu’à un an, et se termine après 30 jours sans utilisation. Quand elle se termine, ou qu’elle est fermée depuis un autre appareil, minddy revient à l’écran de connexion avec un message indiquant que votre session a expiré. Reconnectez-vous pour reprendre là où vous étiez.

Le groupe **Sessions** de l’onglet **Sécurité** des paramètres du compte liste les navigateurs et applications desktop connectés à votre compte, signale l’appareil que vous utilisez et indique la dernière activité de chacun des autres. Pour fermer toutes les autres sessions, par exemple sur un ordinateur perdu ou partagé, choisissez **Tout déconnecter** sur la ligne **Déconnecter les autres appareils**, puis confirmez : chaque autre navigateur et chaque application desktop connectés à votre compte reviennent à l’écran de connexion. Pour fermer une seule session, choisissez **Déconnecter** sur sa ligne, puis confirmez ; seul cet appareil revient à l’écran de connexion. Dans les deux cas, l’appareil que vous utilisez reste connecté. Les applications autorisées dans **MCP minddy** → **Applications connectées** gardent leur accès jusqu’à ce que vous le révoquiez à cet endroit.

Si le message n’arrive pas, vérifiez l’adresse, les indésirables et l’instance. En auto-hébergement, l’opérateur doit configurer l’envoi des messages Auth ; les notifications optionnelles de l’application sont un service distinct. Une confirmation expirée propose de revenir à la connexion pour demander un nouveau lien. Ne transmettez pas de lien de confirmation ou de récupération dans un diagnostic : il autorise l’accès au compte.


## Protéger son compte avec un second facteur {#account-security}

Ouvrez la section Sécurité des paramètres du compte et activez l’authentification à deux facteurs. Ce second facteur s’applique aussi aux connexions par Google ou GitHub ; l’authentification du fournisseur ne le remplace pas.

1. Scannez le code QR avec un authentificateur TOTP ou saisissez manuellement la clé de configuration affichée. N’incluez jamais le code QR ni cette clé dans une capture.
2. Saisissez le code actuel à six chiffres et confirmez. S’il a expiré, essayez le suivant ; après trop de tentatives, attendez avant de réessayer.
3. Conservez les codes de récupération dans un endroit protégé et accessible sans votre téléphone. Chaque code ne fonctionne qu’une fois et la liste n’est affichée qu’une fois. Confirmez sa sauvegarde avant de terminer.

L’activation actualise la session courante et tente de déconnecter les autres sessions. Si une nouvelle authentification est demandée après l’acceptation du code, reconnectez-vous et suivez les indications affichées.

![Carte de double authentification avec le bouton Activer.](/documentation/fr/account-security-workflow.png)

### Récupération et changements {#recovery}

Pendant la connexion, si vous n’avez pas votre téléphone, utilisez un code de récupération conservé. Son utilisation désactive l’authentification à deux facteurs et invalide tous les codes restants. Une fois connecté, configurez de nouveau votre authentificateur et conservez les nouveaux codes. Ce parcours ne garantit pas une restauration du compte par l’assistance humaine.

Remplacer les codes de récupération invalide la liste précédente. Leur remplacement et la désactivation volontaire exigent les contrôles d’authentification récente du serveur. Lisez la confirmation : désactiver cette fonction signifie que le facteur supplémentaire ne sera plus demandé, y compris lors d’une connexion par Google ou GitHub.


## Récupérer l’accès à votre compte {#account-recovery}

Sur la connexion de la bonne instance, choisissez la récupération du mot de passe et saisissez l’e-mail de votre compte. Ouvrez le message, suivez son lien et confirmez la réinitialisation. Saisissez le nouveau mot de passe sur l’écran prévu et envoyez le formulaire. Vérifiez ensuite la connexion à cette même instance.

Le lien peut expirer ou ne plus disposer d’une session active. L’écran de réinitialisation indique cette situation et permet de demander un nouveau lien. Utilisez un message récent plutôt qu’un ancien favori. N’envoyez ni lien, ni cookie, ni mot de passe au support.


### Second facteur et accès non résolu {#mfa-recovery}

Une réinitialisation du mot de passe ne supprime pas l’authentification à deux facteurs. Utilisez votre application d’authentification ou un code de récupération conservé lors de l’activation. Un code de récupération désactive la MFA du compte. Gardez ce code secret, puis réactivez la MFA dans les réglages de sécurité après avoir retrouvé l’accès.

Si aucun facteur ni code de récupération n’est disponible, contactez l’opérateur de l’instance par son canal d’assistance. Indiquez l’adresse de l’instance et l’échec observé, sans jeton ni contenu privé de projet. Si l’e-mail manque, demandez une vérification des redirections Auth et de l’envoi SMTP. Créer un autre compte ne lui donne pas les projets ou les connexions du compte initial.

## Modifier son profil et ses préférences {#profile-and-preferences}

Choisissez **Paramètres du compte** dans le menu du compte, le menu mobile ou la palette de commandes, ou appuyez sur Commande+virgule sur macOS (Ctrl+virgule sur Windows/Linux) : les paramètres du compte s’ouvrent sur l’onglet **Préférences**. Pour ouvrir directement l’onglet **Profil**, choisissez votre nom en haut du menu du compte ; vous pouvez aussi sélectionner **Profil** parmi les onglets des paramètres. Il affiche votre avatar, votre nom et votre adresse email, suivis de vos [statistiques personnelles](/docs/personal-statistics). Sélectionnez votre avatar, puis choisissez **Nouvel avatar Lorelei** ou **Importer une image** ; le changement s’applique dès qu’il réussit. Sélectionnez votre nom pour le changer : sur ordinateur, il devient un champ, qu’Entrée ou un clic ailleurs enregistre et qu’Échap annule ; sur téléphone, il ouvre un panneau avec **Nom d'utilisateur** et **Enregistrer**. Le nom ne peut pas être vide. L’adresse email est en lecture seule. Attendez le résultat et vérifiez l’avatar dans un commentaire ou une liste de membres ; il suit le compte entre projets et conversations. Si un fichier est refusé, suivez le message de validation plutôt que de le renvoyer à répétition.

L’image source ne doit pas dépasser 10 MiB. Le serveur vérifie les octets lisibles, applique l’orientation et recadre au centre en avatar WebP de 256 × 256.

![En-tête du profil avec l’avatar et son badge de modification, le nom et l’adresse email en lecture seule.](/documentation/fr/profile-and-preferences-workflow.png)

### Choisir le comportement de l’interface {#preferences}

Dans les préférences, sélectionnez la langue et le thème puis vérifiez une autre page. La langue du compte concerne le produit connecté ; le sélecteur du site public règle sa navigation séparément. Le thème est enregistré sur le compte et partagé entre appareils.

Le thème choisit le mode clair, sombre ou système. **Palette du mode clair** et **Palette du mode sombre** règlent chacune les couleurs d'un mode. Les **couleurs d'accent** (minddy, Bleu, Violet, Vert, Orange, Rose) gardent les couleurs de minddy et ne recolorent que les boutons et l'anneau de focus ; les **palettes complètes** (Solarized, Catppuccin, Nord) recolorent toutes les surfaces ; **Contraste élevé** figure sous Accessibilité. La palette du mode affiché s'applique immédiatement ; l'autre est enregistrée et apparaît dès que son mode redevient actif, y compris quand Système suit un changement du système d'exploitation. Contraste élevé renforce le contraste du texte et des bordures, détoure les champs, menus, dialogues et onglets, marque la page courante et l'élément sélectionné, affiche toujours le focus clavier et garde les menus opaques. Désactivez **Transparence** pour rendre opaques, sans flou, les menus, les pop-overs et la palette de commandes. Palettes et transparence sont enregistrées sur le compte ; un autre appareil les applique au prochain chargement de page.

Choisissez le raccourci d’envoi dans les réglages clavier. Il s’applique aux commentaires, à Numo et à Entrée dans le titre d’un formulaire de création ; une description garde Commande/Ctrl+Entrée, et Maj+Entrée dans un titre passe toujours à la description. Utilisez le bouton d’envoi si la plateforme intercepte le raccourci ; les touches modificatrices diffèrent selon l’OS. Les projets que vous avez masqués sont listés dans leur propre onglet **Projets masqués**, où vous pouvez les réafficher. **Préférences** contient aussi la carte **Application de bureau** : sur le web, elle mène au téléchargement de l’app de bureau ; dans l’app de bureau, elle affiche le serveur connecté et la version de l’application. Les préférences de tickets appartiennent aussi au compte et ne changent pas celles des autres membres : l’assignation automatique se trouve dans l’onglet **Tickets**, et le statut des tickets créés par Numo dans **IA et Numo** → **Tickets créés par Numo**.

![Sélecteur de langue, commandes des thèmes clair, sombre et système, sélecteurs de palette des modes clair et sombre et interrupteur de transparence.](/documentation/fr/profile-and-preferences-preferences-workflow.png)

## Gérer la confidentialité et supprimer son compte {#privacy-and-account-deletion}

Lorsque l’analytics est configuré, l’onglet **Confidentialité et données** des paramètres du compte affiche un contrôle de consentement et un lien vers la politique des cookies. Le désactiver change immédiatement le consentement aux mesures sur cet appareil et enregistre le choix dans le compte. Le choix local déjà présent sur un autre appareil peut continuer à le régir. Si aucun service analytics n’est configuré, la section est absente.

Le consentement est distinct des données nécessaires au fonctionnement du compte. Consultez la politique de confidentialité de l’instance et les fournisseurs externes que vous avez activés. En auto-hébergement, la configuration et les politiques de l’opérateur déterminent les destinations des services ; désactiver l’analytics ne retire pas les intégrations IA ou Git.

![Aperçu de suppression listant les projets possédés, les tickets et les membres privés d’accès.](/documentation/fr/privacy-and-account-deletion-workflow.png)

### Lire l’aperçu de suppression {#deletion}

Avant de supprimer le compte, exportez les données à conserver depuis l’onglet **Confidentialité et données**. Lisez l’aperçu des projets dont vous êtes propriétaire, des membres affectés, des tickets, des commentaires et de l’abonnement actif. Les conséquences sur les projets possédés touchent d’autres personnes ; réglez ces questions avant de confirmer.

Ouvrez la confirmation de suppression seulement lorsque vous êtes prêt. Saisissez l’email du compte et, pour un compte avec mot de passe, ce mot de passe. Les comptes sans mot de passe exigent une connexion récente. Suivez les indications d’un refus d’authentification récente plutôt que de réessayer à l’aveugle. Une suppression réussie déconnecte le compte et revient au site public. Ce n’est pas une corbeille récupérable. Gardez les exports privés et traitez les questions restantes d’abonnement ou de fournisseur dans les contrôles de facturation et de service correspondants.


## Configurer les routines {#routines}

Le travail automatique du projet se configure dans [Routines](/docs/scheduled-routines), où le propriétaire choisit un planning, un événement ou une arrivée dans une base. Les préréglages d’automatisation du compte et leurs interrupteurs de projet sont retirés. Lisez le [guide de transition](/docs/automation-settings) avant d’activer une ancienne proposition.
