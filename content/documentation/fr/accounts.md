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
  "revision": 6,
  "sourceRevision": 6,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5); 0.11.1 candidate (cd1843e12)",
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
      "content/documentation/reviews/mfa-enrollment-capture-candidates.json",
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
      "app/api/account/route.ts"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review)",
    "date": "2026-10-09"
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
      "id": "account-access-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/auth-signup.png",
      "alt": "Inscription par e-mail, avec les boutons des fournisseurs et la première étape du parcours en trois étapes.",
      "caption": "Commencez sur la bonne instance. Le parcours par e-mail se poursuit avec l’identité et le mot de passe ; aucune inscription n’a été envoyée sur cette capture.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        380,
        474
      ],
      "theme": "light"
    },
    {
      "id": "account-access-login",
      "kind": "screenshot",
      "src": "/documentation/fr/auth-login.png",
      "alt": "Formulaire de connexion avec le lien de récupération sous le champ du mot de passe.",
      "caption": "Utilisez la récupération sur l’instance du compte. Le formulaire est montré sans identifiants envoyés.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        380,
        540
      ],
      "theme": "light"
    },
    {
      "id": "account-security-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/account-security-workflow.png",
      "alt": "Carte de double authentification avec le bouton Activer.",
      "caption": "Commencez ici, puis vérifiez l’authentificateur et conservez les codes de récupération à l’abri.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "account-security-enrollment-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/account-security-enrollment-workflow.png",
      "alt": "Inscription de l’authentificateur avant vérification du code.",
      "caption": "Inscription de l’authentificateur avant vérification du code. Le véritable QR code et le secret manuel sont masqués ; ce facteur temporaire non vérifié a été annulé et supprimé.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1200
      ],
      "theme": "light"
    },
    {
      "id": "account-recovery-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/auth-recovery.png",
      "alt": "Formulaire de récupération du mot de passe avec une adresse de démonstration et le bouton d’envoi du lien.",
      "caption": "Saisissez ici l’e-mail de votre compte. L’adresse de démonstration n’a pas été envoyée ; cette image ne prouve ni la réception du message ni une récupération réussie.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        380,
        278
      ],
      "theme": "light"
    },
    {
      "id": "profile-and-preferences-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/profile-and-preferences-workflow.png",
      "alt": "Réglages du profil : avatar, nom d’utilisateur et adresse email en lecture seule.",
      "caption": "Enregistrez les changements du profil après validation ; l’adresse email reste en lecture seule.",
      "revision": 6,
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
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "privacy-and-account-deletion-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/privacy-and-account-deletion-workflow.png",
      "alt": "Aperçu de suppression listant les projets possédés, les tickets et les membres privés d’accès.",
      "caption": "Lisez l’aperçu et exportez les données à conserver avant d’ouvrir la confirmation de suppression.",
      "revision": 6,
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
    "account-access-steps",
    "account-security-workflow",
    "account-security-enrollment-workflow",
    "account-recovery-steps",
    "profile-and-preferences-workflow",
    "profile-and-preferences-preferences-workflow",
    "privacy-and-account-deletion-workflow"
  ]
}
---

Votre compte appartient à l’instance sur laquelle vous vous êtes inscrit. Retrouvez ici la connexion, l’authentification à deux facteurs, la récupération d’accès et les préférences personnelles. Avant de supprimer le compte, vérifiez les données à exporter et les conséquences pour vos projets.

## Créer un compte et se connecter {#account-access}

Ouvrez la connexion ou l’inscription de l’instance que vous voulez utiliser. Le Cloud et une instance auto-hébergée ont des comptes distincts. Les méthodes de connexion et l’ouverture des inscriptions dépendent de la configuration d’authentification de l’instance.

Pour vous inscrire par e-mail, saisissez votre adresse et passez à l’étape d’identité. Indiquez un nom complet non vide ; vous pouvez aussi choisir un avatar. Passez à l’étape du mot de passe, saisissez au moins huit caractères avec une minuscule (a–z), une majuscule (A–Z) et un chiffre, puis répétez le mot de passe dans le champ de confirmation. Validez cette dernière étape pour créer le compte. Quitter les étapes précédentes ne crée pas de compte. Si une confirmation est demandée, ouvrez le message envoyé par cette instance. Suivez son lien, puis activez le bouton de confirmation sur la page affichée. Ouvrir le lien ne suffit pas : minddy attend cette action volontaire avant de consommer le jeton du message.

Revenez dans l’application souhaitée et connectez-vous. Le compte peut créer son projet ou accepter une invitation. Connaître l’URL d’un projet ne donne pas accès au projet.


![Inscription par e-mail, avec les boutons des fournisseurs et la première étape du parcours en trois étapes.](/documentation/fr/auth-signup.png)

### Déconnexion et e-mail absent {#session-and-mail}

Ouvrez le menu du compte, choisissez la déconnexion et confirmez. Dans l’application desktop, fermer une fenêtre ou un onglet ne revient pas à se déconnecter. Utilisez le menu du compte pour terminer la session.

Si le message n’arrive pas, vérifiez l’adresse, les indésirables et l’instance. En auto-hébergement, l’opérateur doit configurer l’envoi des messages Auth ; les notifications optionnelles de l’application sont un service distinct. Une confirmation expirée propose de revenir à la connexion pour demander un nouveau lien. Ne transmettez pas de lien de confirmation ou de récupération dans un diagnostic : il autorise l’accès au compte.

![Formulaire de connexion avec le lien de récupération sous le champ du mot de passe.](/documentation/fr/auth-login.png)

## Protéger son compte avec un second facteur {#account-security}

Ouvrez la section Sécurité des réglages du compte et activez l’authentification à deux facteurs. Ce second facteur s’applique aussi aux connexions par Google ou GitHub ; l’authentification du fournisseur ne le remplace pas.

1. Scannez le code QR avec un authentificateur TOTP ou saisissez manuellement la clé de configuration affichée. N’incluez jamais le code QR ni cette clé dans une capture.
2. Saisissez le code actuel à six chiffres et confirmez. S’il a expiré, essayez le suivant ; après trop de tentatives, attendez avant de réessayer.
3. Conservez les codes de récupération dans un endroit protégé et accessible sans votre téléphone. Chaque code ne fonctionne qu’une fois et la liste n’est affichée qu’une fois. Confirmez sa sauvegarde avant de terminer.

L’activation actualise la session courante et tente de déconnecter les autres sessions. Si une nouvelle authentification est demandée après l’acceptation du code, reconnectez-vous et suivez les indications affichées.

![Carte de double authentification avec le bouton Activer.](/documentation/fr/account-security-workflow.png)

### Récupération et changements {#recovery}

Pendant la connexion, si vous n’avez pas votre téléphone, utilisez un code de récupération conservé. Son utilisation désactive l’authentification à deux facteurs et invalide tous les codes restants. Une fois connecté, configurez de nouveau votre authentificateur et conservez les nouveaux codes. Ce parcours ne garantit pas une restauration du compte par l’assistance humaine.

Remplacer les codes de récupération invalide la liste précédente. Leur remplacement et la désactivation volontaire exigent les contrôles d’authentification récente du serveur. Lisez la confirmation : désactiver cette fonction signifie que le facteur supplémentaire ne sera plus demandé, y compris lors d’une connexion par Google ou GitHub.

![Inscription de l’authentificateur avant vérification du code.](/documentation/fr/account-security-enrollment-workflow.png)

## Récupérer l’accès à votre compte {#account-recovery}

Sur la connexion de la bonne instance, choisissez la récupération du mot de passe et saisissez l’e-mail de votre compte. Ouvrez le message, suivez son lien et confirmez la réinitialisation. Saisissez le nouveau mot de passe sur l’écran prévu et envoyez le formulaire. Vérifiez ensuite la connexion à cette même instance.

Le lien peut expirer ou ne plus disposer d’une session active. L’écran de réinitialisation indique cette situation et permet de demander un nouveau lien. Utilisez un message récent plutôt qu’un ancien favori. N’envoyez ni lien, ni cookie, ni mot de passe au support.


![Formulaire de récupération du mot de passe avec une adresse de démonstration et le bouton d’envoi du lien.](/documentation/fr/auth-recovery.png)

### Second facteur et accès non résolu {#mfa-recovery}

Une réinitialisation du mot de passe ne supprime pas l’authentification à deux facteurs. Utilisez votre application d’authentification ou un code de récupération conservé lors de l’activation. Un code de récupération désactive la MFA du compte. Gardez ce code secret, puis réactivez la MFA dans les réglages de sécurité après avoir retrouvé l’accès.

Si aucun facteur ni code de récupération n’est disponible, contactez l’opérateur de l’instance par son canal d’assistance. Indiquez l’adresse de l’instance et l’échec observé, sans jeton ni contenu privé de projet. Si l’e-mail manque, demandez une vérification des redirections Auth et de l’envoi SMTP. Créer un autre compte ne lui donne pas les projets ou les connexions du compte initial.

## Modifier son profil et ses préférences {#profile-and-preferences}

Ouvrez les paramètres depuis le menu du compte. Dans le profil, saisissez un nom non vide et enregistrez. L’adresse email est en lecture seule. Générez un nouvel avatar ou importez une image avec les contrôles correspondants. Attendez le résultat et vérifiez l’avatar dans un commentaire ou une liste de membres ; il suit le compte entre projets et conversations. Si un fichier est refusé, suivez le message de validation plutôt que de le renvoyer à répétition.

L’image source ne doit pas dépasser 10 MiB. Le serveur vérifie les octets lisibles, applique l’orientation et recadre au centre en avatar WebP de 256 × 256.

![Réglages du profil : avatar, nom d’utilisateur et adresse email en lecture seule.](/documentation/fr/profile-and-preferences-workflow.png)

### Choisir le comportement de l’interface {#preferences}

Dans les préférences, sélectionnez la langue et le thème puis vérifiez une autre page. La langue du compte concerne le produit connecté ; le sélecteur du site public règle sa navigation séparément. Le thème est enregistré sur le compte et partagé entre appareils.

Choisissez le raccourci d’envoi dans les réglages clavier. Il s’applique aux commentaires et à Numo. Utilisez le bouton d’envoi si la plateforme intercepte le raccourci ; les touches modificatrices diffèrent selon l’OS. Les préférences de tickets, comme l’assignation automatique et le statut des tickets créés par Numo, appartiennent aussi au compte et ne changent pas celles des autres membres.

![Sélecteur de langue et commandes des thèmes clair, sombre et système.](/documentation/fr/profile-and-preferences-preferences-workflow.png)

## Gérer la confidentialité et supprimer son compte {#privacy-and-account-deletion}

Lorsque l’analytics est configuré, les réglages du compte affichent un contrôle de consentement et un lien vers la politique des cookies. Le désactiver change immédiatement le consentement aux mesures sur cet appareil et enregistre le choix dans le compte. Le choix local déjà présent sur un autre appareil peut continuer à le régir. Si aucun service analytics n’est configuré, la section est absente.

Le consentement est distinct des données nécessaires au fonctionnement du compte. Consultez la politique de confidentialité de l’instance et les fournisseurs externes que vous avez activés. En auto-hébergement, la configuration et les politiques de l’opérateur déterminent les destinations des services ; désactiver l’analytics ne retire pas les intégrations IA ou Git.

![Aperçu de suppression listant les projets possédés, les tickets et les membres privés d’accès.](/documentation/fr/privacy-and-account-deletion-workflow.png)

### Lire l’aperçu de suppression {#deletion}

Avant de supprimer le compte, exportez les données à conserver depuis la section Données. Lisez l’aperçu des projets dont vous êtes propriétaire, des membres affectés, des tickets, des commentaires et de l’abonnement actif. Les conséquences sur les projets possédés touchent d’autres personnes ; réglez ces questions avant de confirmer.

Ouvrez la confirmation de suppression seulement lorsque vous êtes prêt. Saisissez l’email du compte et, pour un compte avec mot de passe, ce mot de passe. Les comptes sans mot de passe exigent une connexion récente. Suivez les indications d’un refus d’authentification récente plutôt que de réessayer à l’aveugle. Une suppression réussie déconnecte le compte et revient au site public. Ce n’est pas une corbeille récupérable. Gardez les exports privés et traitez les questions restantes d’abonnement ou de fournisseur dans les contrôles de facturation et de service correspondants.
