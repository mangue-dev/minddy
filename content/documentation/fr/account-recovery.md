---
{
  "id": "account-recovery",
  "locale": "fr",
  "title": "Récupérer l’accès à votre compte",
  "summary": "Réinitialisez votre mot de passe et identifiez les cas qui nécessitent encore le second facteur ou l’opérateur.",
  "topic": "Premiers pas",
  "type": "troubleshooting",
  "audiences": [
    "member"
  ],
  "workflows": [
    "S03"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
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
      "app/(auth)/reset-password/page.tsx",
      "components/settings/account-security-section.tsx",
      "docs/self-hosting-auth.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent primary-source comparison)",
    "language": "agent:/root/automation_account_documentation (independent complete article review)",
    "date": "2026-10-08"
  },
  "related": [
    "account-access",
    "account-security",
    "authentication-and-email"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "account-recovery-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/auth-recovery.png",
      "alt": "Formulaire de récupération du mot de passe avec une adresse de démonstration et le bouton d’envoi du lien.",
      "caption": "Saisissez ici l’e-mail de votre compte. L’adresse de démonstration n’a pas été envoyée ; cette image ne prouve ni la réception du message ni une récupération réussie.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        380,
        278
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "account-recovery-steps"
  ]
}
---

## Demander une nouvelle réinitialisation {#account-recovery}

Sur la connexion de la bonne instance, choisissez la récupération du mot de passe et saisissez l’e-mail de votre compte. Ouvrez le message, suivez son lien et confirmez la réinitialisation. Saisissez le nouveau mot de passe sur l’écran prévu et envoyez le formulaire. Vérifiez ensuite la connexion à cette même instance.

Le lien peut expirer ou ne plus disposer d’une session active. L’écran de réinitialisation indique cette situation et permet de demander un nouveau lien. Utilisez un message récent plutôt qu’un ancien favori. N’envoyez ni lien, ni cookie, ni mot de passe au support.


![Formulaire de récupération du mot de passe avec une adresse de démonstration et le bouton d’envoi du lien.](/documentation/fr/auth-recovery.png)

## Second facteur et accès non résolu {#mfa-recovery}

Une réinitialisation du mot de passe ne supprime pas l’authentification à deux facteurs. Utilisez votre application d’authentification ou un code de récupération conservé lors de l’activation. Un code de récupération désactive la MFA du compte. Gardez ce code secret, puis réactivez la MFA dans les réglages de sécurité après avoir retrouvé l’accès.

Si aucun facteur ni code de récupération n’est disponible, contactez l’opérateur de l’instance par son canal d’assistance. Indiquez l’adresse de l’instance et l’échec observé, sans jeton ni contenu privé de projet. Si l’e-mail manque, demandez une vérification des redirections Auth et de l’envoi SMTP. Créer un autre compte ne lui donne pas les projets ou les connexions du compte initial.
