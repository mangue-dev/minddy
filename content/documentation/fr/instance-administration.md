---
{
  "id": "instance-administration",
  "locale": "fr",
  "title": "Administration d’instance",
  "summary": "L’administration de l’instance est distincte de la propriété d’un projet.",
  "topic": "Exploiter une instance",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H16"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 2,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
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
      "app/(app)/admin/page.tsx",
      "app/(app)/admin/layout.tsx",
      "components/admin/admin-dashboard.tsx",
      "lib/admin-tabs.ts",
      "lib/server/admin.ts",
      "docs/self-hosting-auth.md"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review)",
    "date": "2026-10-09"
  },
  "related": [
    "authentication-and-email",
    "instance-configuration"
  ],
  "aliases": [],
  "tags": [
    "Utiliser la console d’administration de l’instance"
  ],
  "figures": [
    {
      "id": "instance-administration-flow",
      "kind": "screenshot",
      "src": "/documentation/fr/instance-administration-overview.png",
      "alt": "Vue d’ensemble administrateur avec indicateurs agrégés des comptes, de l’accueil et du contenu.",
      "caption": "Vue d’ensemble affiche les indicateurs agrégés de l’instance. Finances est absent sur ce profil de démonstration, car aucune clé OpenRouter gérée n’est configurée.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1488,
        1148
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "instance-administration-users",
      "kind": "screenshot",
      "src": "/documentation/fr/instance-administration-users.png",
      "alt": "Panneau d’assistance aux comptes avec recherche par adresse exacte, sans annuaire du contenu personnel.",
      "caption": "Utilisateurs ouvre un compte précis pour l’assistance ou la facturation ; l’écran initial ne liste ni activité privée ni contenu personnel.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1488,
        1148
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "instance-administration-models",
      "kind": "screenshot",
      "src": "/documentation/fr/instance-administration-models.png",
      "alt": "Réglages des modèles IA et du raisonnement de l’instance.",
      "caption": "Modèles règle les valeurs par défaut et les usages dédiés. La capture montre la configuration existante ; aucun réglage de modèle ou de fournisseur n’a été modifié.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1488,
        1148
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "instance-administration-flow"
  ]
}
---

## Utiliser la console d’administration de l’instance {#instance-administration}

L’administration de l’instance est distincte de la propriété d’un projet. Définissez ADMIN_EMAILS dans l’environnement serveur avec les adresses confirmées autorisées. app_metadata.role=admin signé côté serveur constitue une autre attribution acceptée. La session exige aussi aal2, MFA vérifié et contrôles actuels du compte et de la session. L’accès est refusé si ces contrôles échouent. Connectez-vous, effectuez TOTP et ouvrez /admin. Ne modifiez pas les rôles de base pour contourner l’inscription MFA. Console et APIs privées restent noindex.


![Vue d’ensemble administrateur avec indicateurs agrégés des comptes, de l’accueil et du contenu.](/documentation/fr/instance-administration-overview.png)

![Panneau d’assistance aux comptes avec recherche par adresse exacte, sans annuaire du contenu personnel.](/documentation/fr/instance-administration-users.png)

![Réglages des modèles IA et du raisonnement de l’instance.](/documentation/fr/instance-administration-models.png)

## Utiliser les capacités présentes {#panels}

La console regroupe Vue d'ensemble, Utilisateurs, Modèles et, selon configuration, Finances. Finances est masqué sans capacité OpenRouter gérée liée ; l’attribution de forfait dépend d’une facturation configurée ou d’un override existant. Une instance self-hosted sans fournisseur commercial n’acquiert pas la facturation Cloud en ouvrant la console. Examinez configuration des modèles, valeurs par défaut et contrôles utilisateurs/quotas sur la version déployée avant modification. Ces changements concernent l’instance entière ; validez avec des comptes de démonstration.

## Conserver les responsabilités opérateur {#responsibilities}

Vous gérez toujours habilitations minimales, récupération MFA, secrets serveur, sauvegardes, rétention, incidents et coûts fournisseurs. La console ne remplace pas restauration base plus Storage ou test SMTP. Si l’accès est refusé, vérifiez adresse confirmée, liste autorisée, MFA et session active avant toute modification. Une session révoquée ou bannie ne garde pas son privilège parce que son JWT n’a pas expiré. N’incluez aucune donnée privée d’un autre utilisateur, facteur de sécurité ou détail financier dans les captures.
