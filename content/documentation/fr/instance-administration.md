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
  "revision": 5,
  "sourceRevision": 5,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-16",
  "compatibility": {
    "version": "0.11.1 candidate with the global decision model (MIN-694)",
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
      "docs/self-hosting-auth.md",
      "lib/ai-model-config.ts",
      "app/api/admin/app-config/route.ts",
      "lib/server/decisions/model-validation.ts",
      "docs/plans/min-694-decision-model-selection.md"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun); agent:/root (MIN-694 decision model selector, save validation and fallback source and test review; live decision probes recorded in docs/plans/min-694-decision-model-selection.md; existing figures unchanged)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review); agent:/root/editorial_en_fr (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (inline-code syntax and unchanged-text review); agent:/root (MIN-694 six-locale decision model section meaning review; agent review, not human acceptance)",
    "date": "2026-10-16"
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
      "revision": 5,
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
      "revision": 5,
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

L’administration de l’instance est distincte de la propriété d’un projet. Définissez `ADMIN_EMAILS` dans l’environnement serveur avec les adresses confirmées des comptes autorisés. Le rôle `app_metadata.role=admin` signé côté serveur est aussi accepté. Une session administrateur exige `aal2`, une MFA inscrite et vérifiée, ainsi que les contrôles courants du compte et de la session. L’accès est refusé si ces contrôles échouent. Connectez-vous, validez le code TOTP et ouvrez `/admin`. Ne modifiez pas les rôles de la base pour contourner l’inscription MFA. La console et ses API privées restent `noindex`.


![Vue d’ensemble administrateur avec indicateurs agrégés des comptes, de l’accueil et du contenu.](/documentation/fr/instance-administration-overview.png)

![Réglages des modèles IA et du raisonnement de l’instance.](/documentation/fr/instance-administration-models.png)

## Utiliser les capacités présentes {#panels}

La console regroupe Vue d'ensemble, Utilisateurs, Modèles et, selon la configuration, Finances. Finances reste masqué sans capacité OpenRouter gérée liée. L’attribution d’un forfait dépend d’une facturation configurée ou d’une dérogation existante. Ouvrir la console ne donne pas accès à la facturation Cloud sur une instance auto-hébergée sans fournisseur commercial. Examinez les modèles, leurs valeurs par défaut et les commandes de gestion des utilisateurs et quotas sur la version déployée avant de les modifier. Ces changements concernent l’instance entière ; vérifiez-les avec des comptes de démonstration.

## Choisir le modèle de décision IA {#decision-model}

Dans **Modèles**, section **Automatisations**, **Modèle de décision** fixe le modèle unique qui répond à toutes les décisions IA de l’instance : Smart Fill, Smart Assign et la relecture des retours. Il n’existe aucun choix par projet, par utilisateur ou par fonctionnalité. Le sélecteur ne propose que les modèles OpenRouter qui publient la capacité de décision ; les modèles de conversation, d’embedding et de transcription n’y apparaissent jamais. L’enregistrement teste le candidat par une décision représentative. Un modèle qui n’est pas un modèle de décision, refuse la requête, renvoie une réponse invalide ou dépasse 5 secondes est refusé, et le modèle actuel reste utilisé. Quand le catalogue ne peut pas être chargé, tout changement est refusé. Une instance auto-hébergée sans IA gérée n’a pas de catalogue plateforme et conserve le modèle par défaut, Jev.

Les nouvelles décisions utilisent le modèle enregistré en une minute environ sur chaque processus serveur. Quand le modèle échoue ou répond sous le seuil de confiance, la décision retombe sur le modèle LLM propre à la fonctionnalité, comme avant. **Décisions IA** reste l’interrupteur d’incident qui envoie toutes les décisions à ce modèle LLM. Le seuil a été calibré sur Jev et les autres modèles de décision répartissent leur confiance autrement : après un changement, vérifiez l’accord par modèle dans la vue de base de données `ai_decision_evaluations_weekly`. Les lignes d’usage enregistrent le modèle qui a répondu.

## Conserver les responsabilités opérateur {#responsibilities}

Vous restez responsable des droits minimaux des administrateurs, de la récupération MFA, des secrets serveur, des sauvegardes, de la rétention, des incidents et des coûts des fournisseurs. La console ne remplace ni une restauration de la base et de Storage ni un test SMTP. Si l’accès est refusé, vérifiez l’adresse confirmée, la liste autorisée, la MFA vérifiée et la session active avant toute modification. Une session révoquée ou bannie ne conserve pas ses privilèges parce que son JWT n’a pas encore expiré. N’incluez aucune donnée privée d’un autre utilisateur, aucun facteur de sécurité ni détail financier dans les captures.
