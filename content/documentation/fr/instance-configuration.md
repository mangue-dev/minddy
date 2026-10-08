---
{
  "id": "instance-configuration",
  "locale": "fr",
  "title": "Configurer les origines, secrets et capacités de l’instance",
  "summary": "Définissez MINDDY_PUBLIC_APP_URL comme une origine absolue unique, sans chemin ni barre finale.",
  "topic": "Exploiter une instance",
  "type": "reference",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H05"
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
      ".env.example",
      "docs/self-hosting.md",
      "lib/capabilities.ts"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "optional-providers",
    "workspace-encryption",
    "authentication-and-email"
  ],
  "aliases": [],
  "tags": [],
  "figures": [],
  "requiredFigures": []
}
---

## Configurer les origines, secrets et capacités de l’instance {#instance-configuration}

Définissez MINDDY_PUBLIC_APP_URL comme une origine absolue unique, sans chemin ni barre finale. Un service public utilise HTTPS ; localhost et une IPv4 privée de confiance peuvent utiliser HTTP. MINDDY_PUBLIC_SUPABASE_URL et MINDDY_PUBLIC_SUPABASE_ANON_KEY doivent désigner la même pile Supabase. Ces valeurs arrivent au navigateur. SUPABASE_SERVICE_ROLE_KEY reste exclusivement côté serveur et est obligatoire en production. Ne la mettez jamais dans une variable publique ni un bundle client. L’URL de base de données sert aux outils et ne remplace pas la configuration API.

## Conserver les secrets {#secrets}

L’installateur crée les valeurs manquantes de GIT_STATE_SECRET, GIT_TOKEN_ENCRYPTION_SECRET, AI_KEY_ENCRYPTION_SECRET, FEEDBACK_SSO_ENCRYPTION_SECRET, MINDDY_DATA_ROOT_KEY, CRON_SECRET et AGENT_RUNNER_SECRET. La racine de chiffrement contient exactement 64 caractères hexadécimaux. Gardez-la hors de PostgreSQL avec une copie de récupération protégée. Conservez l’environnement en mode 0600 et hors de Git. Ne l’exécutez pas comme script shell et ne l’affichez pas. Relancer l’installation ne renouvelle pas les secrets. Leur perte peut rendre les données existantes illisibles ; une rotation volontaire exige la procédure de récupération correspondante.

## Appliquer et contrôler une modification {#capabilities}

MINDDY_PUBLIC_SITE_NAME et MINDDY_PUBLIC_CONTACT_EMAIL identifient votre instance. ADMIN_EMAILS est une liste d’administrateurs séparés par des virgules ; l’accès privilégié exige aussi MFA. OAUTH_ISSUER reste normalement vide, sauf si vous publiez volontairement OAuth à une autre origine stable. Désactivez IA et facturation gérées en self-hosted. Activez les services optionnels avec leur configuration complète. Redémarrez ou recréez l’application après un changement de valeurs publiques au runtime ; l’image OCI ne nécessite pas de reconstruction. Le doctor distingue capacité incomplète et panne du cœur. Testez ensuite les liens de compte et callbacks sur l’origine prévue.
