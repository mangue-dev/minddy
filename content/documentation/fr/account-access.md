---
{
  "id": "account-access",
  "locale": "fr",
  "title": "Créer un compte et se connecter",
  "summary": "Utilisez la bonne instance, confirmez votre e-mail et terminez volontairement votre session.",
  "topic": "Premiers pas",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "S02"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 1,
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
      "app/(auth)/signup/page.tsx",
      "components/auth/signup-wizard.tsx",
      "lib/signup-wizard.ts",
      "lib/password-policy.ts",
      "app/(auth)/login/page.tsx",
      "app/auth/confirm/page.tsx"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "choose-an-instance",
    "account-recovery",
    "project-members"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "account-access-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/auth-signup.png",
      "alt": "Inscription par e-mail, avec les boutons des fournisseurs et la première étape du parcours en trois étapes.",
      "caption": "Commencez sur la bonne instance. Le parcours par e-mail se poursuit avec l’identité et le mot de passe ; aucune inscription n’a été envoyée sur cette capture.",
      "revision": 2,
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
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        380,
        540
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "account-access-steps"
  ]
}
---

## Inscription et confirmation {#account-access}

Ouvrez la connexion ou l’inscription de l’instance que vous voulez utiliser. Le Cloud et une instance auto-hébergée ont des comptes distincts. Les méthodes de connexion et l’ouverture des inscriptions dépendent de la configuration d’authentification de l’instance.

Pour vous inscrire par e-mail, saisissez votre adresse et passez à l’étape d’identité. Indiquez un nom complet non vide ; vous pouvez aussi choisir un avatar. Passez à l’étape du mot de passe, saisissez au moins huit caractères avec une minuscule (a–z), une majuscule (A–Z) et un chiffre, puis répétez le mot de passe dans le champ de confirmation. Validez cette dernière étape pour créer le compte. Quitter les étapes précédentes ne crée pas de compte. Si une confirmation est demandée, ouvrez le message envoyé par cette instance. Suivez son lien, puis activez le bouton de confirmation sur la page affichée. Ouvrir le lien ne suffit pas : Minddy attend cette action volontaire avant de consommer le jeton du message.

Revenez dans l’application souhaitée et connectez-vous. Le compte peut créer son projet ou accepter une invitation. Connaître l’URL d’un projet ne donne pas accès au projet.


![Inscription par e-mail, avec les boutons des fournisseurs et la première étape du parcours en trois étapes.](/documentation/fr/auth-signup.png)

## Déconnexion et e-mail absent {#session-and-mail}

Ouvrez le menu du compte, choisissez la déconnexion et confirmez. Dans l’application desktop, fermer une fenêtre ou un onglet ne revient pas à se déconnecter. Utilisez le menu du compte pour terminer la session.

Si le message n’arrive pas, vérifiez l’adresse, les indésirables et l’instance. En auto-hébergement, l’opérateur doit configurer l’envoi des messages Auth ; les notifications optionnelles de l’application sont un service distinct. Une confirmation expirée propose de revenir à la connexion pour demander un nouveau lien. Ne transmettez pas de lien de confirmation ou de récupération dans un diagnostic : il autorise l’accès au compte.

![Formulaire de connexion avec le lien de récupération sous le champ du mot de passe.](/documentation/fr/auth-login.png)
