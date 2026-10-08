---
{
  "id": "authentication-and-email",
  "locale": "fr",
  "title": "Configurer les emails de compte, MFA et la récupération",
  "summary": "Les emails Auth dépendent de Supabase/GoTrue.",
  "topic": "Exploiter une instance",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H06"
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
      "self-hosted"
    ],
    "profiles": [
      "full",
      "managed",
      "source",
      "local"
    ],
    "evidence": [
      "docs/self-hosting-auth.md",
      "supabase/email-templates/confirm-signup.html",
      "supabase/email-templates/reset-password.html",
      "lib/self-hosting-email-templates.ts"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "instance-administration",
    "self-hosted-diagnostics"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "authentication-and-email-flow",
      "kind": "diagram",
      "src": "/documentation/fr/authentication-and-email-flow.svg",
      "alt": "Schéma: Origine Auth et redirections configurées. SMTP opérateur et modèles versionnés. Geste de confirmation et connexion. Tests TOTP, récupération et ancien mot de passe.",
      "caption": "Lisez les étapes dans cet ordre. Origine Auth et redirections configurées. SMTP opérateur et modèles versionnés. Geste de confirmation et connexion. Tests TOTP, récupération et ancien mot de passe.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral"
    }
  ],
  "requiredFigures": [
    "authentication-and-email-flow"
  ]
}
---

## Configurer les emails de compte, MFA et la récupération {#authentication-and-email}

Les emails Auth dépendent de Supabase/GoTrue. Les notifications applicatives Resend ne configurent ni confirmation ni récupération du mot de passe. En full, conservez l’overlay Minddy dans chaque commande Compose. Réglez SITE_URL, API_EXTERNAL_URL, SUPABASE_PUBLIC_URL et ADDITIONAL_REDIRECT_URLS sur vos origines. Renseignez SMTP_ADMIN_EMAIL, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS et SMTP_SENDER_NAME avec votre fournisseur. Gardez la confirmation activée et redémarrez Auth dans le contexte Compose installé.


Avant d’utiliser compose ci-dessous, définissez la fonction du profil full installé depuis [le contexte Compose de référence](/fr/documentation/back-up-the-reference-instance#context).

```bash
compose up -d --wait auth
```


![Schéma: Origine Auth et redirections configurées. SMTP opérateur et modèles versionnés. Geste de confirmation et connexion. Tests TOTP, récupération et ancien mot de passe.](/documentation/fr/authentication-and-email-flow.svg)

## Configurer Supabase géré {#managed}

Dans les paramètres Authentication de votre projet, réglez Site URL et la redirection exacte `<app-origin>/auth/callback`. Configurez SMTP personnalisé et les deux modèles versionnés de confirmation et récupération. La confirmation utilise token_hash et type=signup. Exigez au moins huit caractères, minuscules, majuscules et chiffres, et activez inscription et vérification TOTP. Activez le contrôle des mots de passe compromis quand disponible et consignez les limites du fournisseur. L’overlay full ferme l’accès si ce contrôle échoue et nécessite api.pwnedpasswords.com en sortie. Relevez durée des sessions, rotation des refresh tokens, révocation et limites Auth : le bootstrap SQL ne règle pas ces paramètres de plateforme.

## Vérifier le résultat {#verify}

Utilisez une adresse jetable que vous contrôlez. Vérifiez la réception de l’email d’inscription, son ouverture sur cette instance et le geste de confirmation. Activez TOTP dans les paramètres de sécurité et conservez les codes de récupération hors du navigateur. Déconnectez-vous puis vérifiez une nouvelle connexion avec mot de passe et TOTP. Demandez une réinitialisation et vérifiez que l’ancien mot de passe échoue après modification. Pour ADMIN_EMAILS, vérifiez l’administration après MFA. Consignez versions, dates et résultats expurgés. L’état des conteneurs ne prouve pas la livraison ni la sécurité du compte. N’incluez aucun token email, mot de passe, session, secret TOTP ou code de récupération.
