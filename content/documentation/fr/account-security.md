---
{
  "id": "account-security",
  "locale": "fr",
  "title": "Protéger son compte avec un second facteur",
  "summary": "Vérifier un authentificateur et conserver les codes de récupération avant de terminer.",
  "topic": "Compte et applications",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A02"
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
      "components/settings/account-security-section.tsx",
      "app/api/account/mfa/route.ts",
      "app/api/account/mfa/recovery-codes/route.ts",
      "app/api/account/mfa/recover/route.ts",
      "lib/server/mfa.ts",
      "content/documentation/reviews/mfa-enrollment-capture-candidates.json"
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
      "id": "account-security-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/account-security-workflow.png",
      "alt": "Carte de double authentification avec le bouton Activer.",
      "caption": "Commencez ici, puis vérifiez l’authentificateur et conservez les codes de récupération à l’abri.",
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
      "id": "account-security-enrollment-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/account-security-enrollment-workflow.png",
      "alt": "Inscription de l’authentificateur avant vérification du code.",
      "caption": "Inscription de l’authentificateur avant vérification du code. Le véritable QR code et le secret manuel sont masqués ; ce facteur temporaire non vérifié a été annulé et supprimé.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1200
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "account-security-workflow",
    "account-security-enrollment-workflow"
  ]
}
---

## Activer et vérifier {#account-security}

Ouvrez la section Sécurité des réglages du compte et activez l’authentification à deux facteurs. Ce second facteur s’applique aussi aux connexions par Google ou GitHub ; l’authentification du fournisseur ne le remplace pas.

1. Scannez le code QR avec un authentificateur TOTP ou saisissez manuellement la clé de configuration affichée. N’incluez jamais le code QR ni cette clé dans une capture.
2. Saisissez le code actuel à six chiffres et confirmez. S’il a expiré, essayez le suivant ; après trop de tentatives, attendez avant de réessayer.
3. Conservez les codes de récupération dans un endroit protégé et accessible sans votre téléphone. Chaque code ne fonctionne qu’une fois et la liste n’est affichée qu’une fois. Confirmez sa sauvegarde avant de terminer.

L’activation actualise la session courante et tente de déconnecter les autres sessions. Si une nouvelle authentification est demandée après l’acceptation du code, reconnectez-vous et suivez les indications affichées.

![Carte de double authentification avec le bouton Activer.](/documentation/fr/account-security-workflow.png)


## Récupération et changements {#recovery}

Pendant la connexion, si vous n’avez pas votre téléphone, utilisez un code de récupération conservé. Son utilisation désactive l’authentification à deux facteurs et invalide tous les codes restants. Une fois connecté, configurez de nouveau votre authentificateur et conservez les nouveaux codes. Ce parcours ne garantit pas une restauration du compte par l’assistance humaine.

Remplacer les codes de récupération invalide la liste précédente. Leur remplacement et la désactivation volontaire exigent les contrôles d’authentification récente du serveur. Lisez la confirmation : désactiver cette fonction signifie que le facteur supplémentaire ne sera plus demandé, y compris lors d’une connexion par Google ou GitHub.

![Inscription de l’authentificateur avant vérification du code.](/documentation/fr/account-security-enrollment-workflow.png)
